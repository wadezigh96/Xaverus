/**
 * The native OKX Wallet path: talks to the OKX browser extension directly
 * through window.okxwallet, never through window.ethereum, so it cannot
 * disturb Privy or any other wallet. The extension re-injects on navigation,
 * so the provider is resolved fresh on every call, never cached.
 *
 * Honest limit: signing here uses personal_sign, the standard EIP-1193
 * message-signing method. OKX documents personal_sign by name for its App
 * Wallet SDK, but its official extension documentation does not name it, so
 * live verification of personal_sign through the extension stays an open
 * item. Nothing here claims it was verified live.
 *
 * Mobile without an extension gets a link to the official download page.
 * No okx:// deep link is used anywhere: no official OKX source verifies
 * such a scheme for third-party DApps.
 */

import {
  createBrowserWalletAdapter,
  type ConnectedWallet,
  type Eip1193Provider,
  type WalletAdapter,
} from "./wallet-adapter.ts";
import {normalizeChainIdHex} from "./x-layer-chain.ts";

/** The official OKX Wallet download page, shown when no extension is found. */
export const OKX_WALLET_DOWNLOAD_URL = "https://web3.okx.com";

/**
 * The OKX extension provider: an EIP-1193 provider with the extension's own
 * chain id property and event emitter. The event methods are optional here
 * so a minimal stub still type-checks; the real provider always has them.
 */
export type OkxWalletProvider = Eip1193Provider & {
  chainId?: string;
  on?: (event: string, listener: (...args: never[]) => void) => void;
  removeListener?: (event: string, listener: (...args: never[]) => void) => void;
};

/** Resolve window.okxwallet fresh, or undefined when the extension is absent. */
export function getOkxWalletProvider(): OkxWalletProvider | undefined {
  const globalObject = globalThis as unknown as {okxwallet?: OkxWalletProvider};
  return globalObject.okxwallet;
}

/** True when the OKX extension is present in this browser. */
export function isOkxWalletAvailable(): boolean {
  return getOkxWalletProvider() !== undefined;
}

/**
 * The OKX extension behind the shared wallet seam: sign and send go through
 * the same adapter the mint flow already uses, so the mint page never talks
 * to the provider directly.
 *
 * The chain read cross-checks the provider's own chain id property against
 * eth_chainId: OKX's official examples carry an old note that eth_chainId
 * can return incorrectly formatted values, while the property is the value
 * the official example reads. The RPC value wins when both agree or when
 * there is no property; the property rescues a malformed RPC value; when
 * both are valid but disagree, the adapter refuses to guess which chain
 * the wallet is on and throws, because signing on the wrong chain is the
 * failure this check exists to prevent.
 */
export function createOkxWalletAdapter(provider: OkxWalletProvider): WalletAdapter {
  return createBrowserWalletAdapter(provider, {
    async readChainId(): Promise<number> {
      const fromRpc = normalizeChainIdHex(await provider.request({method: "eth_chainId"}));
      const fromProperty = normalizeChainIdHex(provider.chainId);
      if (fromRpc && fromProperty && fromRpc !== fromProperty) {
        throw new Error(
          "OKX Wallet reports two different chains. Switch networks in your wallet and try again."
        );
      }
      const hex = fromRpc || fromProperty;
      if (!hex) throw new Error("OKX Wallet did not report a usable chain id.");
      return Number.parseInt(hex, 16);
    },
  });
}

/**
 * Connect the OKX extension: request accounts, then move the wallet to
 * X Layer (adding the chain first when the wallet does not have it) and
 * verify the chain afterwards. Resolves the provider fresh, so a
 * re-injected extension is picked up. Throws a plain message when no
 * extension is installed; a refused request (error 4001) propagates so the
 * caller can answer it politely via classifyWalletError.
 */
export async function connectOkxWallet(): Promise<ConnectedWallet> {
  const provider = getOkxWalletProvider();
  if (!provider) {
    throw new Error(
      `OKX Wallet is not installed in this browser. Install it from ${OKX_WALLET_DOWNLOAD_URL}, then try again.`
    );
  }
  const adapter = createOkxWalletAdapter(provider);
  const address = await adapter.getAddress();
  await adapter.switchToXLayer();
  return {adapter, address};
}

/** Handlers for the wallet changes the UI follows reactively. */
export type OkxWalletEventHandlers = {
  onAccountsChanged?: (accounts: string[]) => void;
  onChainChanged?: (chainIdHex: string) => void;
};

/**
 * Follow account and chain changes without a page reload. Returns an
 * unsubscribe function that removes exactly the listeners added here;
 * call it on unmount. A provider without an event emitter is a no-op,
 * so the call is always safe.
 */
export function subscribeOkxWalletEvents(
  provider: OkxWalletProvider,
  handlers: OkxWalletEventHandlers
): () => void {
  const on = provider.on;
  const removeListener = provider.removeListener;
  if (!on || !removeListener) return () => undefined;
  const accountListener = ((accounts: string[]) => {
    handlers.onAccountsChanged?.(accounts);
  }) as (...args: never[]) => void;
  const chainListener = ((chainIdHex: string) => {
    handlers.onChainChanged?.(chainIdHex);
  }) as (...args: never[]) => void;
  on("accountsChanged", accountListener);
  on("chainChanged", chainListener);
  return () => {
    removeListener("accountsChanged", accountListener);
    removeListener("chainChanged", chainListener);
  };
}
