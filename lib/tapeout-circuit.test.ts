import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {createServer, type Server} from "node:http";
import {
  decodeCircuitOutput,
  evalPolicyCircuit,
  packCircuitInput,
  proofToCircuitInput,
  simulate,
  unpackCircuitInput,
  type PolicyNetlist,
} from "./tapeout-circuit.ts";
import {hashHandle, hashUid, type HumanProof} from "./human-proof.ts";

function loadNetlist(): PolicyNetlist {
  const url = new URL("../circuits/policy-circuit.netlist.json", import.meta.url);
  return JSON.parse(readFileSync(url, "utf8")) as PolicyNetlist;
}

const ALL_INPUTS = [
  {xVerified: false, uidClaimed: false, revoked: false},
  {xVerified: false, uidClaimed: false, revoked: true},
  {xVerified: false, uidClaimed: true, revoked: false},
  {xVerified: false, uidClaimed: true, revoked: true},
  {xVerified: true, uidClaimed: false, revoked: false},
  {xVerified: true, uidClaimed: false, revoked: true},
  {xVerified: true, uidClaimed: true, revoked: false},
  {xVerified: true, uidClaimed: true, revoked: true},
] as const;

test("policy netlist is NAND-only and has exactly 5 gates", () => {
  const netlist = loadNetlist();
  assert.equal(netlist.gates.length, 5);
  for (const gate of netlist.gates) {
    assert.equal(gate.type, "NAND");
    assert.equal(gate.inputs.length, 2);
  }
  assert.deepEqual(netlist.inputs, ["x", "u", "r"]);
  assert.deepEqual(netlist.outputs, ["allow"]);
});

test("exhaustive simulation matches allow = x AND u AND NOT r on all 8 inputs", () => {
  const netlist = loadNetlist();
  for (const input of ALL_INPUTS) {
    const expected = input.xVerified && input.uidClaimed && !input.revoked;
    assert.equal(
      simulate(netlist, input),
      expected,
      `x=${input.xVerified} u=${input.uidClaimed} r=${input.revoked}`
    );
  }
});

test("simulation allows only the fully verified, unrevoked case", () => {
  const netlist = loadNetlist();
  const allowed = ALL_INPUTS.filter((input) => simulate(netlist, input));
  assert.deepEqual(allowed, [{xVerified: true, uidClaimed: true, revoked: false}]);
});

test("simulation rejects a netlist that references an unknown wire", () => {
  const netlist = loadNetlist();
  const broken: PolicyNetlist = {
    ...netlist,
    gates: [{id: "g1", type: "NAND", inputs: ["x", "nope"], output: "allow"}],
  };
  assert.throws(() => simulate(broken, {xVerified: true, uidClaimed: true, revoked: false}), /unknown wire/i);
});

test("bit packing: byte 0 holds x on bit 0, u on bit 1, r on bit 2", () => {
  assert.equal(packCircuitInput({xVerified: false, uidClaimed: false, revoked: false}), "0x00");
  assert.equal(packCircuitInput({xVerified: true, uidClaimed: false, revoked: false}), "0x01");
  assert.equal(packCircuitInput({xVerified: false, uidClaimed: true, revoked: false}), "0x02");
  assert.equal(packCircuitInput({xVerified: false, uidClaimed: false, revoked: true}), "0x04");
  assert.equal(packCircuitInput({xVerified: true, uidClaimed: true, revoked: false}), "0x03");
  assert.equal(packCircuitInput({xVerified: true, uidClaimed: true, revoked: true}), "0x07");
});

test("bit packing round-trips on all 8 input combinations", () => {
  for (const input of ALL_INPUTS) {
    assert.deepEqual(unpackCircuitInput(packCircuitInput(input)), {...input});
  }
});

test("output decoding reads the allow bit from bit 0 of the first byte", () => {
  assert.equal(decodeCircuitOutput("0x01"), true);
  assert.equal(decodeCircuitOutput("0x00"), false);
  assert.equal(decodeCircuitOutput("0x03"), true);
  assert.equal(decodeCircuitOutput("0x02"), false);
  assert.equal(decodeCircuitOutput("0x0100000000000000"), true);
});

test("output decoding rejects empty output instead of guessing", () => {
  assert.throws(() => decodeCircuitOutput("0x"), /empty/i);
});

const PROCESSOR = "0xA93E807fAB41431827EBBa57443Fb687a95E2AA3";

/** ABI encoding of a `bytes` return value: offset 0x20, length, data padded to 32 bytes. */
function encodeBytesReturn(data: string): string {
  const bytes = data.startsWith("0x") ? data.slice(2) : data;
  const length = (bytes.length / 2).toString(16).padStart(64, "0");
  const padded = bytes.padEnd(64, "0");
  return `0x${"00".repeat(31)}20${length}${padded}`;
}

type StubMode = "allow" | "deny" | "no-code" | "revert" | "empty";
type Stub = {server: Server; url: string; mode: StubMode; lastCallData: string | undefined};

async function startStub(): Promise<Stub> {
  const stub: Stub = {server: null as unknown as Server, url: "", mode: "allow", lastCallData: undefined};
  stub.server = createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      const {method, params, id} = JSON.parse(body) as {method: string; params: unknown[]; id: number};
      const reply = (payload: unknown) => {
        res.writeHead(200, {"content-type": "application/json"});
        res.end(JSON.stringify({jsonrpc: "2.0", id, ...payload}));
      };
      if (method === "eth_chainId") return reply({result: "0xc4"});
      if (method === "eth_getCode") {
        return reply({result: stub.mode === "no-code" ? "0x" : "0x60006000"});
      }
      if (method === "eth_call") {
        const call = params[0] as {data: string};
        stub.lastCallData = call.data;
        if (stub.mode === "revert") {
          return reply({error: {code: 3, message: "execution reverted: circuit not found"}});
        }
        if (stub.mode === "empty") return reply({result: encodeBytesReturn("0x")});
        return reply({result: encodeBytesReturn(stub.mode === "allow" ? "0x01" : "0x00")});
      }
      return reply({error: {code: -32601, message: `method not found: ${method}`}});
    });
  });
  await new Promise<void>((resolve) => stub.server.listen(0, "127.0.0.1", resolve));
  const address = stub.server.address();
  if (typeof address !== "object" || !address) throw new Error("Stub server did not bind.");
  stub.url = `http://127.0.0.1:${address.port}`;
  return stub;
}

test("reader returns the allow bit from a live-looking eval() response", async (t) => {
  const stub = await startStub();
  t.after(() => stub.server.close());
  stub.mode = "allow";
  assert.equal(
    await evalPolicyCircuit({
      processor: PROCESSOR,
      circuitId: 1,
      xVerified: true,
      uidClaimed: true,
      revoked: false,
      rpcUrl: stub.url,
    }),
    true
  );
  stub.mode = "deny";
  assert.equal(
    await evalPolicyCircuit({
      processor: PROCESSOR,
      circuitId: 1,
      xVerified: true,
      uidClaimed: false,
      revoked: false,
      rpcUrl: stub.url,
    }),
    false
  );
});

test("reader sends the packed input byte in the eval() calldata", async (t) => {
  const stub = await startStub();
  t.after(() => stub.server.close());
  await evalPolicyCircuit({
    processor: PROCESSOR,
    circuitId: 1,
    xVerified: true,
    uidClaimed: true,
    revoked: false,
    rpcUrl: stub.url,
  });
  // Last 32-byte word of the calldata is the packed input byte (0x03), zero-padded.
  assert.ok(stub.lastCallData?.endsWith(`03${"00".repeat(31)}`), stub.lastCallData);
});

test("reader throws a clear error when the processor has no code", async (t) => {
  const stub = await startStub();
  t.after(() => stub.server.close());
  stub.mode = "no-code";
  await assert.rejects(
    evalPolicyCircuit({
      processor: PROCESSOR,
      circuitId: 1,
      xVerified: true,
      uidClaimed: true,
      revoked: false,
      rpcUrl: stub.url,
    }),
    /no contract code/i
  );
});

test("reader throws a clear error when eval() reverts, never silently false", async (t) => {
  const stub = await startStub();
  t.after(() => stub.server.close());
  stub.mode = "revert";
  await assert.rejects(
    evalPolicyCircuit({
      processor: PROCESSOR,
      circuitId: 999,
      xVerified: true,
      uidClaimed: true,
      revoked: false,
      rpcUrl: stub.url,
    }),
    /eval\(\) call.*failed/i
  );
});

test("reader throws a clear error on empty eval() output", async (t) => {
  const stub = await startStub();
  t.after(() => stub.server.close());
  stub.mode = "empty";
  await assert.rejects(
    evalPolicyCircuit({
      processor: PROCESSOR,
      circuitId: 1,
      xVerified: true,
      uidClaimed: true,
      revoked: false,
      rpcUrl: stub.url,
    }),
    /empty output/i
  );
});

test("reader throws a clear error on an invalid processor address", async () => {
  await assert.rejects(
    evalPolicyCircuit({
      processor: "not-an-address",
      circuitId: 1,
      xVerified: true,
      uidClaimed: true,
      revoked: false,
    }),
    /invalid processor address/i
  );
});

test("reader throws a clear error when the RPC is unreachable", async () => {
  await assert.rejects(
    evalPolicyCircuit({
      processor: PROCESSOR,
      circuitId: 1,
      xVerified: true,
      uidClaimed: true,
      revoked: false,
      rpcUrl: "http://127.0.0.1:1",
    }),
    /could not read code|failed/i
  );
});

const VALID_PROOF: HumanProof = {
  wallet: "0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03",
  xUserId: "123456789",
  xHandleHash: hashHandle("alice"),
  okxUidHash: hashUid("987654321"),
  signature: "0x1234",
  issuedAt: 1700000000,
  expiresAt: 1800000000,
};

test("a valid Human Proof maps to both flags set and not revoked", () => {
  assert.deepEqual(proofToCircuitInput(VALID_PROOF), {
    xVerified: true,
    uidClaimed: true,
    revoked: false,
  });
});

test("no proof maps to both flags unset", () => {
  assert.deepEqual(proofToCircuitInput(undefined), {
    xVerified: false,
    uidClaimed: false,
    revoked: false,
  });
});

test("a structurally invalid proof maps to both flags unset", () => {
  assert.deepEqual(proofToCircuitInput({...VALID_PROOF, okxUidHash: "not-a-hash"}), {
    xVerified: false,
    uidClaimed: false,
    revoked: false,
  });
});

test("revocation is passed through when the caller knows the proof is revoked", () => {
  assert.deepEqual(proofToCircuitInput(VALID_PROOF, true), {
    xVerified: true,
    uidClaimed: true,
    revoked: true,
  });
});
