import test from "node:test";
import assert from "node:assert/strict";
import {
  classifyWalletError,
  createBrowserWalletAdapter,
  notOnXLayerMessage,
  type Eip1193Provider,
  type WalletAdapter,
} from "./wallet-adapter.ts";

const WALLET = "0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03";

/** A stub provider shaped like a real injected wallet, recording every call. */
function stubProvider(overrides: Record<string, (params?: unknown[]) => unknown> = {}) {
  const calls: {method: string; params?: unknown[]}[] = [];
  const handlers: Record<string, (params?: unknown[]) => unknown> = {
    eth_requestAccounts: () => [WALLET],
    eth_chainId: () => "0xc4",
    personal_sign: () => "0xsignature",
    eth_sendTransaction: () => "0xtxhash",
    wallet_switchEthereumChain: () => null,
    wallet_addEthereumChain: () => null,
    ...overrides,
  };
  const provider: Eip1193Provider = {
    request: async ({method, params}) => {
      calls.push({method, params});
      const handler = handlers[method];
      if (!handler) throw new Error(`unexpected method ${method}`);
      return handler(params);
    },
  };
  return {provider, calls};
}

function adapterWith(overrides: Record<string, (params?: unknown[]) => unknown> = {}): {
  adapter: WalletAdapter;
  calls: {method: string; params?: unknown[]}[];
} {
  const {provider, calls} = stubProvider(overrides);
  return {adapter: createBrowserWalletAdapter(provider), calls};
}

function codedError(code: number | string): Error & {code: number | string} {
  const error = new Error(`provider error ${code}`) as Error & {code: number | string};
  error.code = code;
  return error;
}

test("error 4001 is a user rejection", () => {
  assert.equal(classifyWalletError(codedError(4001)), "user-rejected");
  assert.equal(classifyWalletError(codedError("4001")), "user-rejected");
});

test("a rejection named in the message, without a code, is a user rejection", () => {
  // Some wallets (and Privy) report a refusal by message only, with no
  // EIP-1193 code attached; the polite answer is the same.
  assert.equal(classifyWalletError(new Error("User rejected the request")), "user-rejected");
  assert.equal(classifyWalletError(new Error("user denied transaction signature")), "user-rejected");
  assert.equal(classifyWalletError(new Error("Request rejected by the user")), "user-rejected");
});

test("error 4902 is a missing chain", () => {
  assert.equal(classifyWalletError(codedError(4902)), "chain-missing");
  assert.equal(classifyWalletError(codedError("4902")), "chain-missing");
});

test("anything else is an unknown wallet error", () => {
  assert.equal(classifyWalletError(codedError(-32603)), "unknown");
  assert.equal(classifyWalletError(new Error("boom")), "unknown");
  assert.equal(classifyWalletError(new Error("The claim was refused.")), "unknown");
  assert.equal(classifyWalletError(undefined), "unknown");
  assert.equal(classifyWalletError("plain string"), "unknown");
});

test("adapter returns the connected account address", async () => {
  const {adapter, calls} = adapterWith();
  assert.equal(await adapter.getAddress(), WALLET);
  assert.deepEqual(calls, [{method: "eth_requestAccounts", params: undefined}]);
});

test("adapter reports no account when the wallet has none", async () => {
  const {adapter} = adapterWith({eth_requestAccounts: () => []});
  await assert.rejects(adapter.getAddress(), /No wallet account is connected/);
});

test("adapter reads the chain id as a number, normalising hex", async () => {
  const {adapter} = adapterWith({eth_chainId: () => "0x00C4"});
  assert.equal(await adapter.getChainId(), 196);
});

test("adapter signs a message with personal_sign, hex message first", async () => {
  const {adapter, calls} = adapterWith();
  const signature = await adapter.signMessage("hello");
  assert.equal(signature, "0xsignature");
  assert.deepEqual(
    calls.find((c) => c.method === "personal_sign"),
    {method: "personal_sign", params: ["0x68656c6c6f", WALLET]}
  );
});

test("adapter sends a transaction from the connected account on X Layer", async () => {
  const {adapter, calls} = adapterWith();
  const hash = await adapter.sendTransaction({
    to: "0x0000000000000000000000000000000000000001",
    data: "0x1234",
    value: "0x0",
  });
  assert.equal(hash, "0xtxhash");
  assert.deepEqual(
    calls.find((c) => c.method === "eth_sendTransaction"),
    {
      method: "eth_sendTransaction",
      params: [
        {
          from: WALLET,
          to: "0x0000000000000000000000000000000000000001",
          data: "0x1234",
          value: "0x0",
          chainId: "0xc4",
        },
      ],
    }
  );
});

test("adapter switches to X Layer and verifies the chain afterwards", async () => {
  const {adapter, calls} = adapterWith();
  await adapter.switchToXLayer();
  assert.deepEqual(
    calls.find((c) => c.method === "wallet_switchEthereumChain"),
    {method: "wallet_switchEthereumChain", params: [{chainId: "0xc4"}]}
  );
  assert.ok(calls.some((c) => c.method === "eth_chainId"));
});

test("adapter adds X Layer when the wallet reports it missing, then retries", async () => {
  let switches = 0;
  const {adapter, calls} = adapterWith({
    wallet_switchEthereumChain: () => {
      switches += 1;
      if (switches === 1) throw codedError(4902);
      return null;
    },
  });
  await adapter.switchToXLayer();
  const add = calls.find((c) => c.method === "wallet_addEthereumChain");
  assert.ok(add);
  assert.equal((add.params?.[0] as {chainId: string}).chainId, "0xc4");
  assert.equal((add.params?.[0] as {chainName: string}).chainName, "X Layer mainnet");
  assert.equal(calls.filter((c) => c.method === "wallet_switchEthereumChain").length, 2);
});

test("adapter refuses to switch when the user says no, without adding the chain", async () => {
  const {adapter, calls} = adapterWith({
    wallet_switchEthereumChain: () => {
      throw codedError(4001);
    },
  });
  await assert.rejects(adapter.switchToXLayer(), (error: unknown) => {
    assert.equal(classifyWalletError(error), "user-rejected");
    return true;
  });
  assert.ok(!calls.some((c) => c.method === "wallet_addEthereumChain"));
});

test("the wrong-chain message names X Layer and its chain id", () => {
  assert.equal(
    notOnXLayerMessage(),
    "Your wallet is not on X Layer (chain 196). Switch networks in your wallet and try again."
  );
});

test("adapter reports a failed switch when the chain is still wrong afterwards", async () => {
  const {adapter} = adapterWith({eth_chainId: () => "0x1"});
  await assert.rejects(adapter.switchToXLayer(), /not on X Layer/);
});
