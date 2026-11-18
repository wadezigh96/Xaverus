import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  buildBindingMessage,
  createMemoryProofStore,
  hashHandle,
  hashUid,
  proofHash,
  type HumanProof,
} from "./human-proof.ts";
import {checkPolicyCircuit, getTapeOutConfig} from "./mint-tapeout.ts";
import {getTapeOutEvalLog, resetTapeOutEvalLog} from "./tapeout-eval-log.ts";

const PROCESSOR = "0xA93E807fAB41431827EBBa57443Fb687a95E2AA3";
const X_USER_ID = "123456789";
const UID_HASH = hashUid("987654321");

async function makeProof(): Promise<HumanProof> {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const message = buildBindingMessage({wallet: account.address, xUserId: X_USER_ID, okxUidHash: UID_HASH, expiresAt});
  const signature = await account.signMessage({message});
  return store.issueProof({wallet: account.address, xUserId: X_USER_ID, okxUidHash: UID_HASH, signature, expiresAt});
}

test("config is undefined when neither TapeOut variable is set", () => {
  assert.equal(getTapeOutConfig({}), undefined);
});

test("config throws when only one TapeOut variable is set", () => {
  assert.throws(() => getTapeOutConfig({XAVERUS_TAPEOUT_PROCESSOR: PROCESSOR}), /both/i);
  assert.throws(() => getTapeOutConfig({XAVERUS_TAPEOUT_CIRCUIT_ID: "1"}), /both/i);
});

test("config parses the circuit id and trims whitespace", () => {
  const config = getTapeOutConfig({
    XAVERUS_TAPEOUT_PROCESSOR: `  ${PROCESSOR} `,
    XAVERUS_TAPEOUT_CIRCUIT_ID: " 1 ",
  });
  assert.equal(config?.processor, PROCESSOR);
  assert.equal(config?.circuitId, 1n);
});

test("config throws on a non-numeric circuit id", () => {
  assert.throws(
    () => getTapeOutConfig({XAVERUS_TAPEOUT_PROCESSOR: PROCESSOR, XAVERUS_TAPEOUT_CIRCUIT_ID: "abc"}),
    /circuit id/i
  );
});

test("unconfigured check never calls eval", async () => {
  const proof = await makeProof();
  let called = false;
  const result = await checkPolicyCircuit(proof, undefined, async () => {
    called = true;
    return true;
  });
  assert.deepEqual(result, {configured: false});
  assert.equal(called, false);
});

test("configured check returns the eval result with circuit identity", async () => {
  const proof = await makeProof();
  const before = Math.floor(Date.now() / 1000);
  const result = await checkPolicyCircuit(
    proof,
    {processor: PROCESSOR, circuitId: 1n},
    async (args) => {
      assert.equal(args.processor, PROCESSOR);
      assert.equal(args.circuitId, 1n);
      assert.equal(args.xVerified, true);
      assert.equal(args.uidClaimed, true);
      assert.equal(args.revoked, false);
      return true;
    }
  );
  assert.equal(result.configured, true);
  if (result.configured) {
    assert.equal(result.allowed, true);
    assert.equal(result.circuitId, "1");
    assert.equal(result.processor, PROCESSOR);
    assert.ok(result.evaluatedAt >= before);
  }
});

test("configured check reports a denial", async () => {
  const proof = await makeProof();
  const result = await checkPolicyCircuit(proof, {processor: PROCESSOR, circuitId: 1n}, async () => false);
  assert.equal(result.configured, true);
  if (result.configured) assert.equal(result.allowed, false);
});

test("an eval failure propagates as an error, never as a denial", async () => {
  const proof = await makeProof();
  await assert.rejects(
    checkPolicyCircuit(proof, {processor: PROCESSOR, circuitId: 1n}, async () => {
      throw new Error("RPC unreachable");
    }),
    /RPC unreachable/
  );
});

/** Point the eval-log singleton at a temp file for one test, then restore it. */
function useTempEvalLog(t: {after: (fn: () => void) => void}, path: string): void {
  const previous = process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH;
  process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH = path;
  t.after(() => {
    if (previous === undefined) delete process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH;
    else process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH = previous;
  });
  resetTapeOutEvalLog();
  t.after(() => resetTapeOutEvalLog());
}

test("a configured eval is recorded persistently, hashes only", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "xaverus-eval-mint-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, "evals.jsonl");
  useTempEvalLog(t, path);

  const proof = await makeProof();
  const before = Math.floor(Date.now() / 1000);
  const result = await checkPolicyCircuit(proof, {processor: PROCESSOR, circuitId: 1n}, async () => true);
  assert.equal(result.configured, true);

  assert.ok(existsSync(path), "the eval should have been written to the log file");
  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(lines.length, 1);
  const record = JSON.parse(lines[0]);
  assert.equal(record.proofHash, proofHash(proof));
  assert.equal(record.circuitId, "1");
  assert.equal(record.processor, PROCESSOR);
  assert.equal(record.xVerified, true);
  assert.equal(record.uidClaimed, true);
  assert.equal(record.revoked, false);
  assert.equal(record.allowed, true);
  assert.ok(record.evaluatedAt >= before);
  // Nothing but hashes, flags, and ids: no raw UID, handle, or signature.
  const text = readFileSync(path, "utf8");
  assert.ok(!text.includes("987654321"));
  assert.ok(!text.includes("alice"));
  assert.ok(!text.includes(proof.signature));
});

test("an unconfigured check records nothing", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "xaverus-eval-mint-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const path = join(dir, "evals.jsonl");
  useTempEvalLog(t, path);

  const proof = await makeProof();
  await checkPolicyCircuit(proof, undefined, async () => true);
  assert.equal(existsSync(path), false);
  assert.deepEqual(getTapeOutEvalLog().list(), []);
});

test("a failed log write never fails the mint decision", async (t) => {
  const dir = mkdtempSync(join(tmpdir(), "xaverus-eval-mint-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "a file, not a directory", "utf8");
  useTempEvalLog(t, join(blocker, "evals.jsonl"));

  const proof = await makeProof();
  const result = await checkPolicyCircuit(proof, {processor: PROCESSOR, circuitId: 1n}, async () => true);
  assert.equal(result.configured, true);
  if (result.configured) assert.equal(result.allowed, true);
});
