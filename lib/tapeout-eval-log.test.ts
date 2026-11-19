import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {createEvalLog, getTapeOutEvalLog, resetTapeOutEvalLog, type EvalRecord} from "./tapeout-eval-log.ts";

const RECORD: EvalRecord = {
  proofHash: `0x${"a".repeat(64)}`,
  circuitId: "1",
  processor: "0xA93E807fAB41431827EBBa57443Fb687a95E2AA3",
  xVerified: true,
  uidClaimed: true,
  revoked: false,
  allowed: true,
  evaluatedAt: 1794892800,
};

function tempDir(t: {after: (fn: () => void) => void}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaverus-eval-log-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return dir;
}

test("an in-memory log records and lists evals", () => {
  const log = createEvalLog();
  assert.deepEqual(log.list(), []);
  log.record(RECORD);
  log.record({...RECORD, allowed: false});
  const listed = log.list();
  assert.equal(listed.length, 2);
  assert.equal(listed[0].allowed, true);
  assert.equal(listed[1].allowed, false);
});

test("list returns a copy: mutating it does not touch the log", () => {
  const log = createEvalLog();
  log.record(RECORD);
  log.list().push({...RECORD, allowed: false});
  assert.equal(log.list().length, 1);
});

test("a file-backed log appends one JSON line per eval", (t) => {
  const dir = tempDir(t);
  const path = join(dir, "nested", "evals.jsonl");
  const log = createEvalLog(path);
  log.record(RECORD);
  log.record({...RECORD, allowed: false, evaluatedAt: 1794892801});

  const lines = readFileSync(path, "utf8").trim().split("\n");
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), RECORD);
  assert.equal(JSON.parse(lines[1]).allowed, false);
  assert.equal(log.list().length, 2);
});

test("a record whose file cannot be written throws and is not kept in memory", (t) => {
  const dir = tempDir(t);
  const blocker = join(dir, "blocker");
  writeFileSync(blocker, "a file, not a directory", "utf8");
  const log = createEvalLog(join(blocker, "evals.jsonl"));
  assert.throws(() => log.record(RECORD));
  assert.deepEqual(log.list(), []);
});

test("the singleton is file-backed when XAVERUS_TAPEOUT_EVAL_LOG_PATH is set", (t) => {
  const dir = tempDir(t);
  const path = join(dir, "evals.jsonl");
  const previous = process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH;
  process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH = path;
  t.after(() => {
    if (previous === undefined) delete process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH;
    else process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH = previous;
  });
  resetTapeOutEvalLog();
  t.after(() => resetTapeOutEvalLog());
  const log = getTapeOutEvalLog();
  log.record(RECORD);
  assert.ok(existsSync(path), "the singleton should have written the file");
  assert.deepEqual(JSON.parse(readFileSync(path, "utf8").trim()), RECORD);
});
