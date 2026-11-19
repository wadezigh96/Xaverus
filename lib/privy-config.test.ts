import test from "node:test";
import assert from "node:assert/strict";
import {buildPrivyConfig, resolvePrivyAppId, resolvePrivySetup} from "./privy-config.ts";

test("Privy config uses X Layer as the default chain and the only supported chain", () => {
  const config = buildPrivyConfig();
  assert.equal(config.defaultChain?.id, 196);
  assert.equal(config.supportedChains?.length, 1);
  assert.equal(config.supportedChains?.[0].id, 196);
  assert.ok(config.supportedChains?.includes(config.defaultChain));
});

test("Privy config offers email and wallet login", () => {
  const config = buildPrivyConfig();
  assert.deepEqual(config.loginMethods, ["email", "wallet"]);
});

test("Privy config creates an embedded wallet on login for users without wallets", () => {
  const config = buildPrivyConfig();
  assert.equal(config.embeddedWallets?.ethereum?.createOnLogin, "users-without-wallets");
});

test("Privy wallet list puts OKX Wallet first, then MetaMask, then detected wallets", () => {
  const config = buildPrivyConfig();
  assert.deepEqual(config.appearance?.walletList, ["okx_wallet", "metamask", "detected_ethereum_wallets"]);
});

test("Privy config overrides the embedded-wallet RPC to the official X Layer RPC", () => {
  const config = buildPrivyConfig();
  for (const chain of [config.defaultChain, ...(config.supportedChains ?? [])]) {
    assert.deepEqual(chain?.rpcUrls.privyWalletOverride?.http, ["https://rpc.xlayer.tech"]);
    // The override is additive: the shared definition's RPCs stay untouched.
    assert.deepEqual(chain?.rpcUrls.default.http, [
      "https://rpc.xlayer.tech",
      "https://xlayerrpc.okx.com",
    ]);
  }
});

test("no App ID configured means no Privy: unset, empty, and blank all degrade", () => {
  assert.equal(resolvePrivyAppId({}), undefined);
  assert.equal(resolvePrivyAppId({NEXT_PUBLIC_PRIVY_APP_ID: ""}), undefined);
  assert.equal(resolvePrivyAppId({NEXT_PUBLIC_PRIVY_APP_ID: "   "}), undefined);
  assert.equal(resolvePrivySetup({}), undefined);
  assert.equal(resolvePrivySetup({NEXT_PUBLIC_PRIVY_APP_ID: ""}), undefined);
});

test("a configured App ID resolves to a Privy setup with the app id and config", () => {
  const setup = resolvePrivySetup({NEXT_PUBLIC_PRIVY_APP_ID: "test-app-id"});
  assert.equal(resolvePrivyAppId({NEXT_PUBLIC_PRIVY_APP_ID: "test-app-id"}), "test-app-id");
  assert.equal(setup?.appId, "test-app-id");
  assert.equal(setup?.config.defaultChain?.id, 196);
  assert.deepEqual(setup?.config.loginMethods, ["email", "wallet"]);
});
