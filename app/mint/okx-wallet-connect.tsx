"use client";

import {useEffect, useRef, useState} from "react";
import {
  connectOkxWallet,
  getOkxWalletProvider,
  isOkxWalletAvailable,
  OKX_WALLET_DOWNLOAD_URL,
  subscribeOkxWalletEvents,
} from "../../lib/okx-wallet";
import type {WalletAdapter} from "../../lib/wallet-adapter";
import {walletErrorMessage, type WalletConnectProps} from "../../lib/wallet-ui";
import {isXLayerChainId, X_LAYER_CHAIN_ID_HEX} from "../../lib/x-layer-chain";
import ConnectedWalletStatus from "./connected-wallet-status";
import {useSwitchToXLayer} from "./use-switch-to-x-layer";

/**
 * The native OKX Wallet button for the mint page: connect the OKX extension
 * with one click, move it to X Layer, and hand the connected wallet to the
 * mint flow through the shared adapter. When no extension is present, the
 * user gets the official download page instead. A refused request is a
 * polite message plus a retry, never a system error.
 *
 * The mint page keeps owning the wallet address: onConnected fills it in,
 * and account changes in the wallet update it reactively.
 */

export default function OkxWalletConnect({onConnected, onAccountChanged}: WalletConnectProps) {
  // Set after mount only: reading window.okxwallet during render would
  // differ between the server render and the browser and break hydration.
  const [detected, setDetected] = useState<boolean | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [connectedAddress, setConnectedAddress] = useState("");
  const [chainIdHex, setChainIdHex] = useState("");
  const adapterRef = useRef<WalletAdapter | null>(null);
  const unsubscribeRef = useRef<(() => void) | null>(null);
  const {switching, notice, setNotice, switchToXLayer} = useSwitchToXLayer(
    adapterRef,
    () => setChainIdHex(X_LAYER_CHAIN_ID_HEX),
    "OKX Wallet"
  );

  useEffect(() => {
    setDetected(isOkxWalletAvailable());
    return () => {
      unsubscribeRef.current?.();
    };
  }, []);

  function followWallet(provider: ReturnType<typeof getOkxWalletProvider>) {
    if (!provider) return;
    unsubscribeRef.current?.();
    unsubscribeRef.current = subscribeOkxWalletEvents(provider, {
      onAccountsChanged: (accounts) => {
        const next = accounts[0] ?? "";
        if (next) {
          setConnectedAddress(next);
          onAccountChanged(next);
        } else {
          adapterRef.current = null;
          setConnectedAddress("");
          setChainIdHex("");
          onAccountChanged(null);
        }
      },
      onChainChanged: (nextChainId) => {
        setChainIdHex(nextChainId);
      },
    });
  }

  async function connect() {
    setNotice("");
    setConnecting(true);
    try {
      const wallet = await connectOkxWallet();
      adapterRef.current = wallet.adapter;
      setConnectedAddress(wallet.address);
      // Connect verified the chain, so the wallet is on X Layer here.
      setChainIdHex(X_LAYER_CHAIN_ID_HEX);
      followWallet(getOkxWalletProvider());
      onConnected(wallet);
    } catch (error) {
      setNotice(walletErrorMessage(error, "connect", "OKX Wallet"));
    } finally {
      setConnecting(false);
    }
  }

  if (detected === null) return null;

  if (!detected) {
    return (
      <div style={{marginTop: 12}}>
        <p>
          No OKX Wallet extension detected. Install OKX Wallet to connect with one click, or
          type your wallet address above to continue without it.
        </p>
        <a className="secondary" href={OKX_WALLET_DOWNLOAD_URL} target="_blank" rel="noreferrer">
          Get OKX Wallet
        </a>
      </div>
    );
  }

  if (!connectedAddress) {
    return (
      <div style={{marginTop: 12}}>
        <button className="secondary" onClick={connect} disabled={connecting}>
          {connecting ? "Waiting for OKX Wallet…" : "Connect OKX Wallet"}
        </button>
        {notice && <p style={{color: "#ff9a9a"}}>{notice}</p>}
      </div>
    );
  }

  return (
    <ConnectedWalletStatus
      label="OKX Wallet"
      address={connectedAddress}
      onXLayer={isXLayerChainId(chainIdHex)}
      switching={switching}
      switchingLabel="Waiting for OKX Wallet…"
      onSwitchToXLayer={switchToXLayer}
      notice={notice}
    />
  );
}
