import test from "node:test";
import assert from "node:assert/strict";
import {createPrivyWalletAdapter, parsePrivyChainId, selectMintingWallet, type PrivyWalletLike} from "./privy-wallet.ts";
import type {Eip1193Provider} from "./wallet-adapter.ts";

const EMBEDDED = "0x1111111111111111111111111111111111111111";
const EXTERNAL = "0x2222222222222222222222222222222222222222";

/** A stub wallet shaped like the Privy surface the adapter needs. */
function stubWallet(overrides: Partial<PrivyWalletLike> = {}): PrivyWalletLike {
  return {
    address: EMBEDDED,
    chainId: "eip155:196",
    walletClientType: "privy",
    switchChain: async () => undefined,
    getEthereumProvider: async () => {
      throw new Error("no provider in this stub");
    },
    ...overrides,
  };
}

test("parses a Privy CAIP-2 chain id into a number", () => {
  assert.equal(parsePrivyChainId("eip155:196"), 196);
  assert.equal(parsePrivyChainId("eip155:1"), 1);
});

test("anything that is not a CAIP-2 chain id parses to undefined", () => {
  assert.equal(parsePrivyChainId("196"), undefined);
  assert.equal(parsePrivyChainId("eip155:"), undefined);
  assert.equal(parsePrivyChainId("eip155:xyz"), undefined);
  assert.equal(parsePrivyChainId(""), undefined);
  assert.equal(parsePrivyChainId(undefined), undefined);
  assert.equal(parsePrivyChainId("solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp"), undefined);
});

test("the embedded wallet is picked over an external wallet", () => {
  const external = stubWallet({address: EXTERNAL, walletClientType: "metamask"});
  const embedded = stubWallet({address: EMBEDDED, walletClientType: "privy"});
  assert.equal(selectMintingWallet([external, embedded]), embedded);
});

test("with no embedded wallet, the first connected wallet is picked", () => {
  const first = stubWallet({address: EXTERNAL, walletClientType: "okx_wallet"});
  const second = stubWallet({address: EMBEDDED, walletClientType: "metamask"});
  assert.equal(selectMintingWallet([first, second]), first);
});

test("with no wallets, no wallet is picked", () => {
  assert.equal(selectMintingWallet([]), undefined);
});

/** A stub EIP-1193 provider behind a stub Privy wallet, recording calls. */
function stubWalletWithProvider(overrides: Partial<PrivyWalletLike> = {}) {
  const calls: {method: string; params?: unknown[]}[] = [];
  const provider: Eip1193Provider = {
    request: async ({method, params}) => {
      calls.push({method, params});
      if (method === "eth_requestAccounts") return [EMBEDDED];
      if (method === "eth_chainId") return "0xc4";
      if (method === "personal_sign") return "0xsignature";
      if (method === "eth_sendTransaction") return "0xtxhash";
      throw new Error(`unexpected method ${method}`);
    },
  };
  const wallet = stubWallet({
    getEthereumProvider: async () => provider,
    ...overrides,
  });
  return {wallet, provider, calls};
}

test("adapter returns the Privy wallet address without asking the provider", async () => {
  const {wallet} = stubWalletWithProvider();
  const adapter = createPrivyWalletAdapter(wallet);
  assert.equal(await adapter.getAddress(), EMBEDDED);
});

test("adapter reads the chain id live from the wallet provider", async () => {
  // The wallet object still says chain 1, but the provider already says
  // X Layer: the live provider wins, so a switch is never missed.
  const {wallet} = stubWalletWithProvider({chainId: "eip155:1"});
  const adapter = createPrivyWalletAdapter(wallet);
  assert.equal(await adapter.getChainId(), 196);
});

test("adapter signs with personal_sign, naming the wallet address explicitly", async () => {
  const {wallet, calls} = stubWalletWithProvider();
  const adapter = createPrivyWalletAdapter(wallet);
  const signature = await adapter.signMessage("hello");
  assert.equal(signature, "0xsignature");
  assert.deepEqual(
    calls.find((c) => c.method === "personal_sign"),
    {method: "personal_sign", params: ["0x68656c6c6f", EMBEDDED]}
  );
});

test("adapter sends from the Privy wallet address on X Layer", async () => {
  const {wallet, calls} = stubWalletWithProvider();
  const adapter = createPrivyWalletAdapter(wallet);
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
          from: EMBEDDED,
          to: "0x0000000000000000000000000000000000000001",
          data: "0x1234",
          value: "0x0",
          chainId: "0xc4",
        },
      ],
    }
  );
});

test("adapter switches to X Layer through the Privy wallet and verifies", async () => {
  const switches: (number | `0x${string}`)[] = [];
  const {wallet} = stubWalletWithProvider({
    chainId: "eip155:1",
    switchChain: async (target) => {
      switches.push(target);
    },
  });
  const adapter = createPrivyWalletAdapter(wallet);
  await adapter.switchToXLayer();
  assert.deepEqual(switches, [196]);
});

test("adapter reports a failed switch when the provider is still off X Layer", async () => {
  const provider: Eip1193Provider = {
    request: async ({method}) => {
      if (method === "eth_chainId") return "0x1";
      throw new Error(`unexpected method ${method}`);
    },
  };
  const wallet = stubWallet({
    chainId: "eip155:1",
    getEthereumProvider: async () => provider,
  });
  const adapter = createPrivyWalletAdapter(wallet);
  await assert.rejects(adapter.switchToXLayer(), /not on X Layer/);
});

test("a refused signature keeps its rejection code for the caller", async () => {
  const provider: Eip1193Provider = {
    request: async ({method}) => {
      if (method === "eth_requestAccounts") return [EMBEDDED];
      if (method === "personal_sign") {
        const error = new Error("User rejected the request") as Error & {code: number};
        error.code = 4001;
        throw error;
      }
      throw new Error(`unexpected method ${method}`);
    },
  };
  const wallet = stubWallet({getEthereumProvider: async () => provider});
  const adapter = createPrivyWalletAdapter(wallet);
  await assert.rejects(adapter.signMessage("hello"), (error: unknown) => {
    assert.equal((error as {code: number}).code, 4001);
    return true;
  });
});
