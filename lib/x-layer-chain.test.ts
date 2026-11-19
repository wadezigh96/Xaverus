import test from "node:test";
import assert from "node:assert/strict";
import {X_LAYER_CHAIN, X_LAYER_CHAIN_ID, X_LAYER_CHAIN_ID_HEX, isXLayerChainId, normalizeChainIdHex, xLayerAddChainParams, xLayerPrimaryRpcUrl} from "./x-layer-chain.ts";

test("X Layer chain id is 196, hex 0xc4", () => {
  assert.equal(X_LAYER_CHAIN_ID, 196);
  assert.equal(X_LAYER_CHAIN_ID_HEX, "0xc4");
  assert.equal(X_LAYER_CHAIN.id, 196);
});

test("X Layer chain definition carries the verified OKX values", () => {
  assert.equal(X_LAYER_CHAIN.name, "X Layer mainnet");
  assert.equal(X_LAYER_CHAIN.nativeCurrency.symbol, "OKB");
  assert.equal(X_LAYER_CHAIN.nativeCurrency.decimals, 18);
  assert.deepEqual(X_LAYER_CHAIN.rpcUrls.default.http, [
    "https://rpc.xlayer.tech",
    "https://xlayerrpc.okx.com",
  ]);
  assert.equal(
    X_LAYER_CHAIN.blockExplorers?.default.url,
    "https://www.okx.com/web3/explorer/xlayer"
  );
});

test("chain-id comparison normalises case and leading zeros", () => {
  assert.equal(normalizeChainIdHex("0xC4"), "0xc4");
  assert.equal(normalizeChainIdHex("0x00c4"), "0xc4");
  assert.equal(normalizeChainIdHex("0X00C4"), "0xc4");
  assert.equal(isXLayerChainId("0xC4"), true);
  assert.equal(isXLayerChainId("0x00c4"), true);
  assert.equal(isXLayerChainId("0x1"), false);
  assert.equal(isXLayerChainId("not hex"), false);
});

test("the primary RPC is the official X Layer RPC, not the backup", () => {
  assert.equal(xLayerPrimaryRpcUrl(), "https://rpc.xlayer.tech");
});

test("add-chain parameters come from the shared chain definition", () => {
  assert.deepEqual(xLayerAddChainParams(), {
    chainId: "0xc4",
    chainName: "X Layer mainnet",
    nativeCurrency: {name: "OKB", symbol: "OKB", decimals: 18},
    rpcUrls: ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"],
    blockExplorerUrls: ["https://www.okx.com/web3/explorer/xlayer"],
  });
});
