import test from "node:test";
import assert from "node:assert/strict";
import {
  connectOkxWallet,
  createOkxWalletAdapter,
  getOkxWalletProvider,
  isOkxWalletAvailable,
  OKX_WALLET_DOWNLOAD_URL,
  subscribeOkxWalletEvents,
  type OkxWalletProvider,
} from "./okx-wallet.ts";
import {classifyWalletError} from "./wallet-adapter.ts";

const WALLET = "0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03";

function setOkxGlobal(provider: OkxWalletProvider | undefined) {
  const g = globalThis as unknown as {okxwallet?: OkxWalletProvider};
  if (provider === undefined) delete g.okxwallet;
  else g.okxwallet = provider;
}

/** A stub provider shaped like the real OKX extension provider. */
function stubOkxProvider(): OkxWalletProvider {
  return {
    chainId: "0xc4",
    request: async () => null,
    on: () => undefined,
    removeListener: () => undefined,
  };
}

/** A recording stub provider, shaped like the real OKX extension provider. */
function recordingOkxProvider(
  overrides: Record<string, (params?: unknown[]) => unknown> = {}
): {provider: OkxWalletProvider; calls: {method: string; params?: unknown[]}[]} {
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
  const provider: OkxWalletProvider = {
    chainId: "0xc4",
    request: async ({method, params}) => {
      calls.push({method, params});
      const handler = handlers[method];
      if (!handler) throw new Error(`unexpected method ${method}`);
      return handler(params);
    },
    on: () => undefined,
    removeListener: () => undefined,
  };
  return {provider, calls};
}

function codedError(code: number): Error & {code: number} {
  const error = new Error(`provider error ${code}`) as Error & {code: number};
  error.code = code;
  return error;
}

test("the OKX download link is the official wallet site, never a deep link", () => {
  assert.equal(OKX_WALLET_DOWNLOAD_URL, "https://web3.okx.com");
  assert.ok(!OKX_WALLET_DOWNLOAD_URL.startsWith("okx://"));
});

test("no OKX extension is detected when window.okxwallet is absent", () => {
  setOkxGlobal(undefined);
  assert.equal(isOkxWalletAvailable(), false);
  assert.equal(getOkxWalletProvider(), undefined);
});

test("the OKX extension is detected when window.okxwallet is present", () => {
  const provider = stubOkxProvider();
  setOkxGlobal(provider);
  try {
    assert.equal(isOkxWalletAvailable(), true);
    assert.equal(getOkxWalletProvider(), provider);
  } finally {
    setOkxGlobal(undefined);
  }
});

test("detection never touches window.ethereum", () => {
  Object.defineProperty(globalThis, "ethereum", {
    get() {
      throw new Error("window.ethereum must never be read by the OKX module");
    },
    configurable: true,
  });
  const provider = stubOkxProvider();
  setOkxGlobal(provider);
  try {
    assert.equal(isOkxWalletAvailable(), true);
    assert.equal(getOkxWalletProvider(), provider);
  } finally {
    setOkxGlobal(undefined);
    // @ts-expect-error removing the throwing test getter
    delete globalThis.ethereum;
  }
});

test("the provider is resolved fresh on every call, never cached", () => {
  const first = stubOkxProvider();
  const second = stubOkxProvider();
  setOkxGlobal(first);
  try {
    assert.equal(getOkxWalletProvider(), first);
    setOkxGlobal(second);
    assert.equal(getOkxWalletProvider(), second);
    setOkxGlobal(undefined);
    assert.equal(getOkxWalletProvider(), undefined);
  } finally {
    setOkxGlobal(undefined);
  }
});

test("connect requests accounts and moves the wallet to X Layer", async () => {
  const {provider, calls} = recordingOkxProvider();
  setOkxGlobal(provider);
  try {
    const {address, adapter} = await connectOkxWallet();
    assert.equal(address, WALLET);
    assert.equal(await adapter.getChainId(), 196);
    assert.deepEqual(
      calls.find((c) => c.method === "eth_requestAccounts"),
      {method: "eth_requestAccounts", params: undefined}
    );
    assert.deepEqual(
      calls.find((c) => c.method === "wallet_switchEthereumChain"),
      {method: "wallet_switchEthereumChain", params: [{chainId: "0xc4"}]}
    );
    assert.ok(calls.some((c) => c.method === "eth_chainId"));
  } finally {
    setOkxGlobal(undefined);
  }
});

test("connect fails clearly when no OKX extension is installed", async () => {
  setOkxGlobal(undefined);
  await assert.rejects(connectOkxWallet(), /OKX Wallet is not installed/);
});

test("connect adds X Layer when the wallet reports it missing, then retries", async () => {
  let switches = 0;
  const {provider, calls} = recordingOkxProvider({
    wallet_switchEthereumChain: () => {
      switches += 1;
      if (switches === 1) throw codedError(4902);
      return null;
    },
  });
  setOkxGlobal(provider);
  try {
    const {address} = await connectOkxWallet();
    assert.equal(address, WALLET);
    const add = calls.find((c) => c.method === "wallet_addEthereumChain");
    assert.ok(add);
    const params = add.params?.[0] as {chainId: string; chainName: string; rpcUrls: string[]};
    assert.equal(params.chainId, "0xc4");
    assert.equal(params.chainName, "X Layer mainnet");
    assert.deepEqual(params.rpcUrls, ["https://rpc.xlayer.tech", "https://xlayerrpc.okx.com"]);
    assert.equal(calls.filter((c) => c.method === "wallet_switchEthereumChain").length, 2);
  } finally {
    setOkxGlobal(undefined);
  }
});

test("a refused connect is a user rejection, not a system error", async () => {
  const {provider, calls} = recordingOkxProvider({
    eth_requestAccounts: () => {
      throw codedError(4001);
    },
  });
  setOkxGlobal(provider);
  try {
    await assert.rejects(connectOkxWallet(), (error: unknown) => {
      assert.equal(classifyWalletError(error), "user-rejected");
      return true;
    });
    assert.ok(!calls.some((c) => c.method === "wallet_switchEthereumChain"));
  } finally {
    setOkxGlobal(undefined);
  }
});

test("connect refuses when the chain is still wrong after the switch", async () => {
  const {provider} = recordingOkxProvider({eth_chainId: () => "0x1"});
  provider.chainId = "0x1";
  setOkxGlobal(provider);
  try {
    await assert.rejects(connectOkxWallet(), /not on X Layer/);
  } finally {
    setOkxGlobal(undefined);
  }
});

test("the OKX adapter signs with personal_sign, hex message first", async () => {
  const {provider, calls} = recordingOkxProvider();
  const adapter = createOkxWalletAdapter(provider);
  const signature = await adapter.signMessage("hello");
  assert.equal(signature, "0xsignature");
  assert.deepEqual(
    calls.find((c) => c.method === "personal_sign"),
    {method: "personal_sign", params: ["0x68656c6c6f", WALLET]}
  );
});

test("the OKX adapter sends a transaction from the connected account on X Layer", async () => {
  const {provider, calls} = recordingOkxProvider();
  const adapter = createOkxWalletAdapter(provider);
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

test("the chain read falls back to the provider property when eth_chainId is malformed", async () => {
  const {provider} = recordingOkxProvider({eth_chainId: () => "196"});
  const adapter = createOkxWalletAdapter(provider);
  assert.equal(await adapter.getChainId(), 196);
});

test("the chain read refuses to guess when the RPC value and the property disagree", async () => {
  const {provider} = recordingOkxProvider({eth_chainId: () => "0x1"});
  const adapter = createOkxWalletAdapter(provider);
  await assert.rejects(adapter.getChainId(), /two different chains/);
});

test("the chain read works from the RPC value alone when there is no property", async () => {
  const {provider} = recordingOkxProvider();
  delete provider.chainId;
  const adapter = createOkxWalletAdapter(provider);
  assert.equal(await adapter.getChainId(), 196);
});

test("account and chain changes reach the handlers, no reload needed", () => {
  const listeners = new Map<string, (...args: never[]) => void>();
  const provider: OkxWalletProvider = {
    chainId: "0xc4",
    request: async () => null,
    on: (event, listener) => {
      listeners.set(event, listener);
    },
    removeListener: (event) => {
      listeners.delete(event);
    },
  };
  const seenAccounts: string[][] = [];
  const seenChains: string[] = [];
  const unsubscribe = subscribeOkxWalletEvents(provider, {
    onAccountsChanged: (accounts) => seenAccounts.push(accounts),
    onChainChanged: (chainId) => seenChains.push(chainId),
  });
  listeners.get("accountsChanged")?.(["0x1111111111111111111111111111111111111111"] as never);
  listeners.get("chainChanged")?.("0x1" as never);
  assert.deepEqual(seenAccounts, [["0x1111111111111111111111111111111111111111"]]);
  assert.deepEqual(seenChains, ["0x1"]);
  unsubscribe();
  assert.equal(listeners.size, 0);
});

test("subscribing is a no-op when the provider has no event emitter", () => {
  const provider: OkxWalletProvider = {request: async () => null};
  const unsubscribe = subscribeOkxWalletEvents(provider, {
    onAccountsChanged: () => {
      throw new Error("must not be called");
    },
  });
  assert.doesNotThrow(() => unsubscribe());
});
