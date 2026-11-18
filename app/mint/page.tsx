"use client";

import {useEffect, useState} from "react";
import Link from "next/link";

/**
 * Mint a human-proofed Safety Passport: connect X, claim an OKX UID, sign the
 * binding with the minting wallet, mint. The OKX UID is the user's own signed
 * claim, never a verification by OKX (ADR-0001), and every surface says so.
 *
 * The browser is an untrusted UI: the server builds the binding message, the
 * server decides the mint, and the user's own wallet signs and broadcasts.
 * No raw UID or signature is ever displayed.
 */

type PublicProof = {
  wallet: string;
  xUserId: string;
  xHandleHash: string;
  okxUidHash: string;
  issuedAt: number;
  proofHash: string;
};

type MintTransaction = {
  to: string;
  data: string;
  value: string;
  chainId: number;
};

type EthereumProvider = {
  request: (args: {method: string; params?: unknown[]}) => Promise<unknown>;
};

const WALLET_STORAGE_KEY = "xaverus_mint_wallet";
const X_LAYER_CHAIN_ID_HEX = "0xc4"; // 196
const UID_CLAIM_NOTE = "The OKX UID is your own signed claim, not a verification by OKX.";

function isWalletAddress(value: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(value.trim());
}

function getEthereum(): EthereumProvider | undefined {
  const w = globalThis as unknown as {ethereum?: EthereumProvider};
  return w.ethereum;
}

function toHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function shortHash(hash: string): string {
  return hash.length > 18 ? hash.slice(0, 10) + "…" + hash.slice(-6) : hash;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function Mint() {
  const [wallet, setWallet] = useState("");
  const [xUserId, setXUserId] = useState("");
  const [okxUid, setOkxUid] = useState("");
  const [xOutcome, setXOutcome] = useState<"connected" | "error" | null>(null);
  const [proof, setProof] = useState<PublicProof | null>(null);
  const [proofChecked, setProofChecked] = useState(false);
  const [bindingChecked, setBindingChecked] = useState(false);
  const [signing, setSigning] = useState(false);
  const [signMessage, setSignMessage] = useState("");
  const [signError, setSignError] = useState("");
  const [minting, setMinting] = useState(false);
  const [mintError, setMintError] = useState("");
  const [mintNote, setMintNote] = useState("");
  const [transaction, setTransaction] = useState<MintTransaction | null>(null);
  const [sending, setSending] = useState(false);
  const [txHash, setTxHash] = useState("");
  // Set after mount only: reading window.ethereum during render would differ
  // between the server render and the browser and break hydration.
  const [hasWallet, setHasWallet] = useState<boolean | null>(null);

  // Restore the wallet across the X OAuth round-trip, and read the outcome
  // the callback left in the URL (?x=connected or ?x=error).
  useEffect(() => {
    setHasWallet(Boolean(getEthereum()));
    const saved = localStorage.getItem(WALLET_STORAGE_KEY);
    if (saved) setWallet(saved);
    const x = new URLSearchParams(window.location.search).get("x");
    if (x === "connected" || x === "error") setXOutcome(x);
  }, []);

  useEffect(() => {
    if (wallet) localStorage.setItem(WALLET_STORAGE_KEY, wallet.trim());
  }, [wallet]);

  const walletValid = isWalletAddress(wallet);
  const xConnected = xOutcome === "connected";
  const proofReady = proof !== null;
  const step1Done = xConnected || proofReady;
  const step2Done = okxUid.trim().length > 0 || proofReady;
  const step3Done = proofReady;

  // Read the X Binding the server recorded during OAuth, so the user never
  // has to type their numeric X user ID by hand.
  async function refreshBinding() {
    if (!walletValid) return;
    setBindingChecked(false);
    try {
      const r = await fetch(`/api/mint/binding?wallet=${encodeURIComponent(wallet.trim())}`);
      const data = await r.json();
      if (data.ok && data.bound) {
        setXUserId(data.binding.xUserId as string);
      } else {
        setXUserId("");
      }
    } catch {
      setXUserId("");
    } finally {
      setBindingChecked(true);
    }
  }

  async function refreshProof() {
    if (!walletValid) return;
    await refreshBinding();
    setProofChecked(false);
    try {
      const r = await fetch(`/api/mint/proof?wallet=${encodeURIComponent(wallet.trim())}`);
      const data = await r.json();
      if (data.ok && data.present) {
        setProof(data.proof as PublicProof);
        setXUserId((prev) => prev || (data.proof as PublicProof).xUserId);
      } else {
        setProof(null);
      }
    } catch {
      setProof(null);
    } finally {
      setProofChecked(true);
    }
  }

  // After returning from X, check the real proof status for this wallet.
  useEffect(() => {
    if (xConnected && walletValid) void refreshProof();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [xConnected, walletValid]);

  function connectX() {
    if (!walletValid) return;
    window.location.href = `/api/mint/x/authorize?wallet=${encodeURIComponent(wallet.trim())}`;
  }

  async function signBinding() {
    setSignError("");
    setSignMessage("");
    if (!walletValid || !okxUid.trim()) {
      setSignError("Enter a valid wallet address and an OKX UID first.");
      return;
    }
    if (!xUserId.trim()) {
      setSignError("Connect X first so the server knows your X account.");
      return;
    }
    const ethereum = getEthereum();
    if (!ethereum) {
      setSignError(
        "No wallet found in this browser. Install OKX Wallet or MetaMask, then reload this page."
      );
      return;
    }
    setSigning(true);
    try {
      const messageRes = await fetch("/api/mint/message", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          wallet: wallet.trim(),
          xUserId: xUserId.trim(),
          okxUid: okxUid.trim(),
        }),
      });
      const messageData = await messageRes.json();
      if (!messageRes.ok || !messageData.ok) {
        throw new Error(messageData.error || "Could not build the binding message.");
      }

      const accounts = (await ethereum.request({method: "eth_requestAccounts"})) as string[];
      const connected = accounts[0] ?? "";
      if (!connected) throw new Error("No wallet account is connected.");
      if (connected.toLowerCase() !== wallet.trim().toLowerCase()) {
        throw new Error(
          `The connected wallet (${connected}) is not the wallet you entered (${wallet.trim()}). Switch accounts in your wallet and try again.`
        );
      }

      const signature = (await ethereum.request({
        method: "personal_sign",
        params: [toHex(messageData.message as string), connected],
      })) as string;

      const claimRes = await fetch("/api/mint/claim", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({
          wallet: wallet.trim(),
          xUserId: xUserId.trim(),
          okxUid: okxUid.trim(),
          signature,
          expiresAt: messageData.expiresAt,
        }),
      });
      const claimData = await claimRes.json();
      if (!claimRes.ok || !claimData.ok) {
        throw new Error(claimData.error || "The claim was refused.");
      }
      setProof(claimData.proof as PublicProof);
      setSignMessage("Human Proof issued. Your X Binding and OKX UID claim are now bound to this wallet.");
    } catch (error) {
      setSignError(errorMessage(error));
    } finally {
      setSigning(false);
    }
  }

  async function requestMint() {
    setMintError("");
    setMintNote("");
    setTransaction(null);
    if (!walletValid) {
      setMintError("Enter a valid wallet address first.");
      return;
    }
    setMinting(true);
    try {
      const r = await fetch("/api/mint/passport", {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: wallet.trim()}),
      });
      const data = await r.json();
      if (!r.ok || !data.ok) {
        throw new Error(data.error || "The mint was refused.");
      }
      if (data.transaction) {
        setTransaction(data.transaction as MintTransaction);
      } else {
        setMintNote(
          (data.note as string) ||
            "The minting factory is not deployed yet, so no transaction can be sent."
        );
      }
    } catch (error) {
      setMintError(errorMessage(error));
    } finally {
      setMinting(false);
    }
  }

  async function sendMint() {
    setMintError("");
    if (!transaction) return;
    const ethereum = getEthereum();
    if (!ethereum) {
      setMintError(
        "No wallet found in this browser. Install OKX Wallet or MetaMask, then reload this page."
      );
      return;
    }
    setSending(true);
    try {
      const chainId = (await ethereum.request({method: "eth_chainId"})) as string;
      if (chainId.toLowerCase() !== X_LAYER_CHAIN_ID_HEX) {
        throw new Error(
          "Your wallet is not on X Layer (chain 196). Switch networks in your wallet and try again."
        );
      }
      const accounts = (await ethereum.request({method: "eth_requestAccounts"})) as string[];
      const from = accounts[0] ?? "";
      if (!from) throw new Error("No wallet account is connected.");
      if (from.toLowerCase() !== wallet.trim().toLowerCase()) {
        throw new Error(
          `The connected wallet (${from}) is not the wallet you entered (${wallet.trim()}). Switch accounts in your wallet and try again.`
        );
      }
      const hash = (await ethereum.request({
        method: "eth_sendTransaction",
        params: [
          {
            from,
            to: transaction.to,
            data: transaction.data,
            value: transaction.value,
            chainId: X_LAYER_CHAIN_ID_HEX,
          },
        ],
      })) as string;
      setTxHash(hash);
    } catch (error) {
      setMintError(errorMessage(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <main className="market">
      <nav className="topnav">
        <Link href="/" className="brand">
          XAVERUS<span>MINT SAFETY PASSPORT</span>
        </Link>
        <div className="navlinks">
          <a href="/">Marketplace</a>
          <a href="/agents">My Agents</a>
          <a href="/safety">Safety</a>
          <a href="/activity">Activity</a>
          <a className="active" href="/mint">Mint</a>
        </div>
      </nav>

      <section className="marketHero">
        <div>
          <div className="eyebrow">HUMAN-PROOF MINTING · X LAYER</div>
          <h1>
            Mint a passport.<br />
            <em>Prove a person.</em>
          </h1>
          <p>
            A Safety Passport mints only with a Human Proof: your X account, verified through X
            OAuth, plus an OKX UID you claim and sign with your own wallet. {UID_CLAIM_NOTE} No
            password is ever asked for, and nothing here moves funds until you sign the mint
            transaction yourself.
          </p>
        </div>
        <div className="launchCard">
          <span>HUMAN PROOF STATUS</span>
          <strong>{proofReady ? "PROVEN" : proofChecked ? "MISSING" : "UNKNOWN"}</strong>
          <p>
            {proofReady
              ? "This wallet has a valid Human Proof and can mint."
              : "Complete steps 1–3 to earn a Human Proof for this wallet."}
          </p>
          <div className="featureList">
            <span>✓ X Binding via OAuth</span>
            <span>✓ OKX UID claim, wallet-signed</span>
            <span>✓ One X account, one wallet</span>
            <span>✓ Mint refused without proof</span>
          </div>
        </div>
      </section>

      <section className="agentGrid">
        <article className="agentCard">
          <div className="agentTop">
            <span className="agentIcon">1</span>
            <span className={step1Done ? "available" : ""}>
              {step1Done ? "● CONNECTED" : "○ WAITING"}
            </span>
          </div>
          <span className="category">STEP 1 · WALLET + X</span>
          <h3>Connect your wallet and X</h3>
          <p>Your wallet address, then X OAuth. X never sees your wallet keys, and we never see your X password.</p>
          <label>
            Wallet address
            <input
              className="search"
              style={{width: "100%"}}
              placeholder="0x..."
              value={wallet}
              onChange={(e) => setWallet(e.target.value)}
            />
          </label>
          {wallet && !walletValid && (
            <p style={{color: "#ff9a9a"}}>That does not look like a wallet address (0x followed by 40 hex characters).</p>
          )}
          <button className="primary" onClick={connectX} disabled={!walletValid} style={{marginTop: 12}}>
            Connect X
          </button>
          {xOutcome === "error" && (
            <p style={{color: "#ff9a9a"}}>
              X connection failed or was denied. Check that X is configured on this server and try again.
            </p>
          )}
          {xConnected && (
            <p style={{color: "#a7ffcf"}}>
              X connected. The binding is recorded server-side for this wallet.
            </p>
          )}
          <p style={{marginTop: 12}}>
            X user ID:{" "}
            {xUserId ? (
              <b>{xUserId}</b>
            ) : bindingChecked ? (
              "not connected yet — press Connect X above and your X user ID appears here automatically."
            ) : (
              "checking…"
            )}
          </p>
          <button className="secondary" onClick={refreshProof} disabled={!walletValid} style={{marginTop: "auto"}}>
            Check proof status
          </button>
        </article>

        <article className="agentCard">
          <div className="agentTop">
            <span className="agentIcon">2</span>
            <span className={step2Done ? "available" : ""}>
              {step2Done ? "● ENTERED" : "○ WAITING"}
            </span>
          </div>
          <span className="category">STEP 2 · OKX UID CLAIM</span>
          <h3>Claim your OKX UID</h3>
          <p>
            Paste the UID from your OKX account. {UID_CLAIM_NOTE} Only a hash of it is stored;
            the UID itself is never shown again.
          </p>
          <label>
            OKX UID
            <input
              className="search"
              style={{width: "100%"}}
              placeholder="Your OKX UID"
              value={okxUid}
              onChange={(e) => setOkxUid(e.target.value)}
            />
          </label>
          <p>
            Never enter an OKX password or API key here. This flow only ever asks for the UID
            number itself.
          </p>
        </article>

        <article className="agentCard">
          <div className="agentTop">
            <span className="agentIcon">3</span>
            <span className={step3Done ? "available" : ""}>
              {step3Done ? "● PROOF ISSUED" : "○ WAITING"}
            </span>
          </div>
          <span className="category">STEP 3 · SIGN BINDING</span>
          <h3>Sign with your wallet</h3>
          <p>
            Your wallet signs a message binding it to your X account and your UID claim. The
            signature proves you control the wallet. It does not move funds.
          </p>
          <button
            className="primary"
            onClick={signBinding}
            disabled={signing || !walletValid || !xUserId.trim() || !okxUid.trim() || proofReady}
            style={{marginTop: 12}}
          >
            {signing ? "Waiting for signature…" : proofReady ? "Proof already issued" : "Sign binding"}
          </button>
          {hasWallet === false && (
            <p>
              No wallet detected in this browser. Install OKX Wallet or MetaMask to sign, then
              reload this page.
            </p>
          )}
          {signMessage && <p style={{color: "#a7ffcf"}}>{signMessage}</p>}
          {signError && <p style={{color: "#ff9a9a"}}>{signError}</p>}
          {proof && (
            <div style={{marginTop: 12}}>
              <p>
                X user ID: <b>{proof.xUserId}</b>
              </p>
              <p>X handle hash: {shortHash(proof.xHandleHash)}</p>
              <p>OKX UID hash: {shortHash(proof.okxUidHash)}</p>
              <p>Issued: {new Date(proof.issuedAt * 1000).toLocaleString()}</p>
              <p>Proof hash: {shortHash(proof.proofHash)}</p>
            </div>
          )}
        </article>

        <article className="agentCard">
          <div className="agentTop">
            <span className="agentIcon">4</span>
            <span className={txHash ? "available" : ""}>
              {txHash ? "● MINTED" : transaction ? "● READY TO SIGN" : "○ WAITING"}
            </span>
          </div>
          <span className="category">STEP 4 · MINT SAFETY PASSPORT</span>
          <h3>Mint your Safety Passport</h3>
          <p>
            The server checks your Human Proof and returns the mint transaction. You review it,
            then your wallet signs and broadcasts it. Minting deploys a new Safety Passport
            contract owned by your wallet; it is not a token.
          </p>
          <button
            className="primary"
            onClick={requestMint}
            disabled={minting || !walletValid || !proofReady}
            style={{marginTop: 12}}
          >
            {minting ? "Checking proof…" : "Mint Safety Passport"}
          </button>
          {!proofReady && <p>Finish steps 1–3 first: the mint is refused without a Human Proof.</p>}
          {mintError && <p style={{color: "#ff9a9a"}}>{mintError}</p>}
          {mintNote && <p>{mintNote}</p>}
          {transaction && !txHash && (
            <div style={{marginTop: 12}}>
              <p>Review this transaction before signing:</p>
              <p>
                To: <b>{transaction.to}</b>
              </p>
              <p>
                Data: <b>{transaction.data}</b>
              </p>
              <p>
                Value: <b>{transaction.value}</b>
              </p>
              <p>
                Chain: <b>X Layer ({transaction.chainId})</b>
              </p>
              <button className="primary" onClick={sendMint} disabled={sending} style={{marginTop: 8}}>
                {sending ? "Waiting for wallet…" : "Sign & send with wallet"}
              </button>
            </div>
          )}
          {txHash && (
            <p style={{color: "#a7ffcf"}}>
              Transaction sent: <b>{txHash}</b>
            </p>
          )}
        </article>
      </section>

      <footer>
        <span>XAVERUS · HUMAN-PROOF MINTING</span>
        <span>{UID_CLAIM_NOTE}</span>
      </footer>
    </main>
  );
}
