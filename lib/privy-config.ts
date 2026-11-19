/**
 * Privy configuration for wallet connect, built as a pure function so it is
 * testable without a Privy account, a browser, or a real App ID.
 *
 * Privy is optional at runtime: when no App ID is configured, the providers
 * component renders children directly and no Privy code path runs. The App ID
 * is a public key (safe for client use); the Privy App Secret is never
 * needed and must never be asked for or used.
 */

import type {PrivyClientConfig} from "@privy-io/react-auth";
import {addRpcUrlOverrideToChain} from "@privy-io/chains";
import {X_LAYER_CHAIN, xLayerPrimaryRpcUrl} from "./x-layer-chain.ts";

/**
 * X Layer with the embedded-wallet RPC overridden to the official X Layer
 * RPC. Privy has no default RPC for a non-default chain like X Layer, so
 * without this override the embedded wallet would have nowhere to send
 * transactions. The override is additive: the shared definition's own RPC
 * list stays untouched.
 */
export const X_LAYER_CHAIN_FOR_PRIVY = addRpcUrlOverrideToChain(
  X_LAYER_CHAIN,
  xLayerPrimaryRpcUrl()
);

/** The environment a Privy setup is resolved from (process.env in the app). */
export type PrivyEnv = {
  NEXT_PUBLIC_PRIVY_APP_ID?: string;
};

/**
 * The configured Privy App ID, or undefined when it is unset, empty, or
 * blank. An absent App ID is normal, not an error: the app runs without
 * Privy exactly as it did before this feature existed.
 */
export function resolvePrivyAppId(env: PrivyEnv): string | undefined {
  const appId = env.NEXT_PUBLIC_PRIVY_APP_ID?.trim();
  return appId ? appId : undefined;
}

/** Everything the Privy provider needs: the App ID plus its configuration. */
export type PrivySetup = {
  appId: string;
  config: PrivyClientConfig;
};

/**
 * The Privy setup for this environment, or undefined when no App ID is
 * configured. The providers component mounts the provider only when this
 * returns a setup, so no Privy code path runs without an App ID.
 */
export function resolvePrivySetup(env: PrivyEnv): PrivySetup | undefined {
  const appId = resolvePrivyAppId(env);
  if (!appId) return undefined;
  return {appId, config: buildPrivyConfig()};
}

/** The Privy provider configuration: X Layer only, email + wallet login. */
export function buildPrivyConfig(): PrivyClientConfig {
  return {
    loginMethods: ["email", "wallet"],
    embeddedWallets: {ethereum: {createOnLogin: "users-without-wallets"}},
    appearance: {walletList: ["okx_wallet", "metamask", "detected_ethereum_wallets"]},
    defaultChain: X_LAYER_CHAIN_FOR_PRIVY,
    supportedChains: [X_LAYER_CHAIN_FOR_PRIVY],
  };
}
