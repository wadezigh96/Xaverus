import test from "node:test";
import assert from "node:assert/strict";
import {decodeFunctionData, getAddress, toFunctionSelector} from "viem";
import {
  buildMintCalldata,
  buildMintTransaction,
  MINT_FACTORY_ABI,
  X_LAYER_CHAIN_ID,
} from "./mint-transaction.ts";

const FACTORY = "0x1111111111111111111111111111111111111111";

test("mint calldata decodes back to mint() with no arguments", () => {
  const data = buildMintCalldata(FACTORY);
  const decoded = decodeFunctionData({abi: MINT_FACTORY_ABI, data});
  assert.equal(decoded.functionName, "mint");
  assert.ok(!decoded.args || decoded.args.length === 0);
});

test("mint calldata starts with the mint() selector", () => {
  const data = buildMintCalldata(FACTORY);
  assert.equal(data.slice(0, 10), "0x1249c58b");
  assert.equal(data.slice(0, 10), toFunctionSelector("mint()"));
  assert.equal(data.length, 10);
});

test("mint calldata rejects an invalid factory address", () => {
  assert.throws(() => buildMintCalldata("not-an-address"), /address/i);
  assert.throws(() => buildMintCalldata("0x1234"), /address/i);
});

test("mint transaction targets the factory on X Layer with zero value", () => {
  const tx = buildMintTransaction(FACTORY);
  assert.equal(tx.to, getAddress(FACTORY));
  assert.equal(tx.data, buildMintCalldata(FACTORY));
  assert.equal(tx.value, "0x0");
  assert.equal(tx.chainId, 196);
  assert.equal(X_LAYER_CHAIN_ID, 196);
});

test("mint transaction rejects an invalid factory address", () => {
  assert.throws(() => buildMintTransaction("not-an-address"), /address/i);
});
