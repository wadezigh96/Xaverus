/**
 * The Privy wallet behind the shared wallet seam: the mint page talks to
 * Privy only through a WalletAdapter built here, never to the SDK directly.
 *
 * The adapter is built from one connected Privy wallet (embedded or
 * external) and only after the SDK reports ready; the component that builds
 * it gates on ready, so no wallet is ever touched before then. Sign and
 * send go through the wallet's EIP-1193 provider, so every operation names
 * the wallet address explicitly, exactly like the browser adapter.
 */

import type {ConnectedWallet} from "@privy-io/react-auth";
import {
  createBrowserWalletAdapter,
  notOnXLayerMessage,
  type Eip1193Provider,
  type WalletAdapter,
  type WalletTransaction,
} from "./wallet-adapter.ts";
import {X_LAYER_CHAIN_ID} from "./x-layer-chain.ts";

/**
 * The smallest Privy wallet surface the adapter needs. A real
 * ConnectedWallet satisfies it; tests build small stubs against it.
 */
export type PrivyWalletLike = Pick<
  ConnectedWallet,
  "address" | "chainId" | "walletClientType" | "switchChain" | "getEthereumProvider"
>;

/**
 * Parse a Privy chain id ("eip155:196") into a chain number, or undefined
 * when it is not a CAIP-2 EVM chain id. Privy reports chain ids in CAIP-2
 * form, never as a bare number or a hex string.
 */
export function parsePrivyChainId(chainId: string | undefined): number | undefined {
  if (typeof chainId !== "string") return undefined;
  const match = /^eip155:([0-9]+)$/.exec(chainId.trim());
  if (!match) return undefined;
  return Number(match[1]);
}

/**
 * Pick the wallet the mint flow uses: the embedded Privy wallet when the
 * user has one (the email-login path), otherwise the first connected
 * wallet. The choice is deterministic and the UI shows the picked address,
 * so the user always sees which wallet will sign and send.
 */
export function selectMintingWallet(wallets: PrivyWalletLike[]): PrivyWalletLike | undefined {
  return wallets.find((w) => w.walletClientType === "privy") ?? wallets[0];
}

/**
 * One connected Privy wallet behind the shared wallet seam. Sign and send
 * go through the wallet's EIP-1193 provider via the browser adapter, so
 * every operation names the wallet address explicitly. The chain id is
 * always read live from the provider, never from the wallet object, which
 * can go stale after a chain switch.
 *
 * The provider is resolved lazily and cached; a switch drops the cache
 * because, per the SDK types, switching does not update an existing
 * provider instance. Build this adapter only after the SDK reports ready;
 * the component that builds it enforces that.
 */
export function createPrivyWalletAdapter(wallet: PrivyWalletLike): WalletAdapter {
  let browserAdapter: Promise<WalletAdapter> | undefined;
  function underlying(): Promise<WalletAdapter> {
    browserAdapter ??= wallet
      .getEthereumProvider()
      .then((provider) => createBrowserWalletAdapter(provider as Eip1193Provider));
    return browserAdapter;
  }

  return {
    async getAddress(): Promise<string> {
      return wallet.address;
    },

    async getChainId(): Promise<number> {
      return (await underlying()).getChainId();
    },

    async signMessage(message: string): Promise<string> {
      return (await underlying()).signMessage(message);
    },

    async sendTransaction(tx: WalletTransaction): Promise<string> {
      return (await underlying()).sendTransaction(tx);
    },

    async switchToXLayer(): Promise<void> {
      await wallet.switchChain(X_LAYER_CHAIN_ID);
      // A switch does not update an existing provider instance: drop the
      // cached one and verify the chain through a fresh provider.
      browserAdapter = undefined;
      const chainId = await (await underlying()).getChainId();
      if (chainId !== X_LAYER_CHAIN_ID) {
        throw new Error(notOnXLayerMessage());
      }
    },
  };
}
