import {appendFileSync, mkdirSync} from "node:fs";
import {dirname} from "node:path";

/**
 * Persistent record of TapeOut policy-circuit evaluations. Every eval() the
 * mint flow runs is recorded here, so the mint decision leaves an audit
 * trail that survives the HTTP response: which proof (by hash), which
 * circuit, which inputs, and what the circuit answered.
 *
 * Hashes only: a record holds the proof hash, the circuit identity, the
 * three input bits, the allow bit, and the timestamp. No raw UID, handle,
 * or signature ever enters a record.
 *
 * Storage: in-memory always, plus one JSON line appended per eval when
 * XAVERUS_TAPEOUT_EVAL_LOG_PATH is set (the parent directory is created
 * on first write). A failed file write throws and the record is not kept
 * in memory either, so the two never diverge; the mint flow catches that
 * failure and lets the mint proceed, because a broken audit log must not
 * look like a denied mint.
 */

export type EvalRecord = {
  /** keccak256 of the signed binding message: identifies the proof without revealing it. */
  proofHash: string;
  circuitId: string;
  processor: string;
  xVerified: boolean;
  uidClaimed: boolean;
  revoked: boolean;
  allowed: boolean;
  evaluatedAt: number;
};

export type EvalLog = {
  record(record: EvalRecord): void;
  list(): EvalRecord[];
};

export function createEvalLog(filePath?: string): EvalLog {
  const path = filePath?.trim() || undefined;
  const records: EvalRecord[] = [];
  return {
    record(record) {
      if (path) {
        mkdirSync(dirname(path), {recursive: true});
        appendFileSync(path, `${JSON.stringify(record)}\n`, "utf8");
      }
      records.push(record);
    },
    list() {
      return [...records];
    },
  };
}

let log: EvalLog | undefined;

/** The one shared eval log for the server process. */
export function getTapeOutEvalLog(): EvalLog {
  if (!log) {
    log = createEvalLog(process.env.XAVERUS_TAPEOUT_EVAL_LOG_PATH?.trim() || undefined);
  }
  return log;
}

/** Test-only: drop the singleton so the next call starts empty. */
export function resetTapeOutEvalLog(): void {
  log = undefined;
}
