import {defineChain} from "viem";

/**
 * The one shared X Layer mainnet definition. Every wallet path (Privy, OKX
 * Wallet native, browser-injected) and every add-chain request uses these
 * values, so the chain exists in exactly one place.
 *
 * Values verified 19 Nov 2026 from OKX's official docs
 * (https://web3.okx.com/onchainos/dev-docs/xlayer/developer/build-on-xlayer/network-information)
 * and the official xlayer-docs repo. The explorer is the OKX one from the
 * docs, not the OKLink one in viem's built-in definition.
 */

export const X_LAYER_CHAIN_ID = 196;
export const X_LAYER_CHAIN_ID_HEX = "0xc4";

export const X_LAYER_CHAIN = defineChain({
  id: X_LAYER_CHAIN_ID,
  name: "X Layer mainnet",
  nativeCurrency: {
    name: "OKB",
    symbol: "OKB",
    // 18 decimals comes from viem's official xLayer chain definition, not
    // from OKX docs: OKX docs do not state the decimals explicitly.
    decimals: 18,
  },
  rpcUrls: {
    default: {
      http: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"],
    },
  },
  blockExplorers: {
    default: {
      name: "OKX Explorer",
      url: "https://www.okx.com/web3/explorer/xlayer",
    },
  },
});

/** The primary RPC endpoint: the official X Layer RPC, not the backup. */
export function xLayerPrimaryRpcUrl(): string {
  return X_LAYER_CHAIN.rpcUrls.default.http[0];
}

/**
 * Normalise a hex chain id for comparison: lowercase, no leading zeros.
 * Wallets report chain ids in different casings (0xC4 vs 0xc4) and sometimes
 * with extra leading zeros, so raw string equality is wrong. Returns "" for
 * anything that is not a hex chain id.
 */
export function normalizeChainIdHex(value: unknown): string {
  if (typeof value !== "string") return "";
  const match = /^0[xX]([0-9a-fA-F]+)$/.exec(value.trim());
  if (!match) return "";
  const stripped = match[1].replace(/^0+(?=[0-9a-fA-F])/, "").toLowerCase();
  return "0x" + stripped;
}

/** True when the reported chain id is X Layer, whatever its hex casing. */
export function isXLayerChainId(value: unknown): boolean {
  return normalizeChainIdHex(value) === X_LAYER_CHAIN_ID_HEX;
}

/** Parameters for wallet_addEthereumChain, built from the shared definition. */
export function xLayerAddChainParams() {
  return {
    chainId: X_LAYER_CHAIN_ID_HEX,
    chainName: X_LAYER_CHAIN.name,
    nativeCurrency: {...X_LAYER_CHAIN.nativeCurrency},
    rpcUrls: [...X_LAYER_CHAIN.rpcUrls.default.http],
    blockExplorerUrls: [X_LAYER_CHAIN.blockExplorers.default.url],
  };
}
