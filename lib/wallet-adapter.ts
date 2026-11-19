/**
 * The shared wallet seam: the mint flow talks to a WalletAdapter, never to a
 * wallet SDK or an injected provider directly, so any wallet source (Privy,
 * OKX Wallet native, browser-injected) plugs into the same flow.
 */

import {X_LAYER_CHAIN_ID, X_LAYER_CHAIN_ID_HEX, xLayerAddChainParams} from "./x-layer-chain.ts";

/** The smallest EIP-1193 surface the adapter needs from any wallet. */
export type Eip1193Provider = {
  request: (args: {method: string; params?: unknown[]}) => Promise<unknown>;
};

/** A transaction the minting wallet signs and broadcasts. */
export type WalletTransaction = {
  to: string;
  data: string;
  value: string;
};

/** One wallet source behind one seam: address, chain, sign, send, switch. */
export type WalletAdapter = {
  /** The connected account address; asks the wallet when not connected yet. */
  getAddress(): Promise<string>;
  /** The wallet's current chain id as a number. */
  getChainId(): Promise<number>;
  /** Sign a human-readable message with the connected account. */
  signMessage(message: string): Promise<string>;
  /** Send a transaction from the connected account on X Layer. */
  sendTransaction(tx: WalletTransaction): Promise<string>;
  /** Move the wallet to X Layer, adding the chain first when it is missing. */
  switchToXLayer(): Promise<void>;
};

/**
 * A connected wallet behind the shared seam: its address plus the adapter
 * that signs and sends for it. The address and the adapter always travel
 * together, so a connect handoff is one object, never two loose values.
 */
export type ConnectedWallet = {
  address: string;
  adapter: WalletAdapter;
};

/**
 * What to tell the user when their wallet is on the wrong network: one
 * message for every site that checks the chain (both adapters and the
 * mint page), so the wording never drifts apart.
 */
export function notOnXLayerMessage(): string {
  return `Your wallet is not on X Layer (chain ${X_LAYER_CHAIN_ID}). Switch networks in your wallet and try again.`;
}

function toHex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  return "0x" + Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * The browser-injected wallet (window.ethereum): OKX Wallet, MetaMask, or
 * any other extension that injects a provider. Behaviour matches what the
 * mint page did before this adapter existed: account-must-match checks and
 * user-friendly errors stay with the caller.
 *
 * Options: `readChainId` replaces the default eth_chainId read, for wallets
 * whose chain reporting needs a cross-check (the OKX adapter uses it to
 * cross-check the provider's own chain id property). The post-switch
 * verification goes through the same read, so the override applies there too.
 */
export function createBrowserWalletAdapter(
  provider: Eip1193Provider,
  options?: {readChainId?: () => Promise<number>}
): WalletAdapter {
  async function getAddress(): Promise<string> {
    const accounts = (await provider.request({method: "eth_requestAccounts"})) as string[];
    const connected = accounts[0] ?? "";
    if (!connected) throw new Error("No wallet account is connected.");
    return connected;
  }

  async function getChainId(): Promise<number> {
    if (options?.readChainId) return options.readChainId();
    const chainId = (await provider.request({method: "eth_chainId"})) as string;
    return Number.parseInt(chainId, 16);
  }

  return {
    getAddress,
    getChainId,

    async signMessage(message: string): Promise<string> {
      const address = await getAddress();
      return (await provider.request({
        method: "personal_sign",
        params: [toHex(message), address],
      })) as string;
    },

    async sendTransaction(tx: WalletTransaction): Promise<string> {
      const from = await getAddress();
      return (await provider.request({
        method: "eth_sendTransaction",
        params: [{from, to: tx.to, data: tx.data, value: tx.value, chainId: X_LAYER_CHAIN_ID_HEX}],
      })) as string;
    },

    async switchToXLayer(): Promise<void> {
      try {
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{chainId: X_LAYER_CHAIN_ID_HEX}],
        });
      } catch (error) {
        if (classifyWalletError(error) !== "chain-missing") throw error;
        await provider.request({
          method: "wallet_addEthereumChain",
          params: [xLayerAddChainParams()],
        });
        await provider.request({
          method: "wallet_switchEthereumChain",
          params: [{chainId: X_LAYER_CHAIN_ID_HEX}],
        });
      }
      const chainId = await getChainId();
      if (chainId !== X_LAYER_CHAIN_ID) {
        throw new Error(notOnXLayerMessage());
      }
    },
  };
}

/** What a wallet failure means for the user, so callers can respond kindly. */
export type WalletErrorKind = "user-rejected" | "chain-missing" | "unknown";

/**
 * Classify a wallet error by its EIP-1193 code: 4001 means the user said no,
 * 4902 means the chain is not added to the wallet, anything else is unknown.
 * Accepts numeric and string codes; never throws. A refusal named in the
 * message with no code attached (some wallets and Privy report it that way)
 * counts as a user rejection too, so the caller can answer it politely.
 */
export function classifyWalletError(error: unknown): WalletErrorKind {
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? (error as {code: unknown}).code
      : undefined;
  const numeric = typeof code === "string" ? Number(code) : code;
  if (numeric === 4001) return "user-rejected";
  if (numeric === 4902) return "chain-missing";
  const message = error instanceof Error ? error.message : "";
  if (/user (rejected|denied)|rejected by the user/i.test(message)) return "user-rejected";
  return "unknown";
}
