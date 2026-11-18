import {existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync} from "node:fs";
import {dirname} from "node:path";
import {getAddress} from "viem";
import {
  createProofStore,
  isHex64,
  isProofValid,
  type HumanProof,
  type ProofStore,
  type XBinding,
} from "./human-proof.ts";

/**
 * File-backed ProofStore: the shared rules from createProofStore, persisted
 * as JSON so bindings and proofs survive a server restart. Selected by the
 * shared store when XAVERUS_PROOF_STORE_PATH is set; otherwise the server
 * uses the memory store. This file owns only loading and saving; the
 * binding and proof rules live in human-proof.ts, so the two backends can
 * never drift apart.
 *
 * Writes are atomic (temp file + rename) and the parent directory is created
 * on first write. Each write happens through a persistence hook that runs
 * before the record is committed, so a failed write vetoes the record
 * instead of leaving memory and disk out of sync. Only hashes are ever
 * written: the raw OKX UID never reaches this file, because issueProof only
 * ever receives the UID hash.
 *
 * One process owns one file: two instances over the same path do not see
 * each other's writes. The server avoids that through the singleton in
 * human-proof-store.ts.
 */

type StoredState = {
  version: 1;
  bindings: XBinding[];
  proofs: HumanProof[];
};

function validBinding(value: unknown): value is XBinding {
  if (typeof value !== "object" || value === null) return false;
  const b = value as Record<string, unknown>;
  try {
    getAddress(String(b.wallet));
  } catch {
    return false;
  }
  return (
    typeof b.xUserId === "string" &&
    b.xUserId.trim().length > 0 &&
    isHex64(b.xHandleHash) &&
    Number.isFinite(b.boundAt) &&
    (b.boundAt as number) > 0
  );
}

function validStoredProof(value: unknown): value is HumanProof {
  if (!isProofValid(value as HumanProof)) return false;
  const p = value as HumanProof;
  return p.issuedAt < p.expiresAt;
}

function load(filePath: string): StoredState {
  let raw: string;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch (error) {
    throw new Error(`Human proof store file cannot be read: ${filePath}.`);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Human proof store file is corrupt (not valid JSON): ${filePath}.`);
  }
  if (typeof parsed !== "object" || parsed === null) {
    throw new Error(`Human proof store file is corrupt (not an object): ${filePath}.`);
  }
  const state = parsed as Record<string, unknown>;
  if (state.version !== 1 || !Array.isArray(state.bindings) || !Array.isArray(state.proofs)) {
    throw new Error(`Human proof store file is corrupt (bad shape): ${filePath}.`);
  }
  if (!state.bindings.every(validBinding)) {
    throw new Error(`Human proof store file is corrupt (bad binding): ${filePath}.`);
  }
  if (!state.proofs.every(validStoredProof)) {
    throw new Error(`Human proof store file is corrupt (bad proof): ${filePath}.`);
  }
  return {version: 1, bindings: state.bindings, proofs: state.proofs};
}

function save(filePath: string, state: StoredState): void {
  mkdirSync(dirname(filePath), {recursive: true});
  const tmp = `${filePath}.tmp-${process.pid}`;
  try {
    writeFileSync(tmp, JSON.stringify(state, null, 2), "utf8");
    renameSync(tmp, filePath);
  } catch (error) {
    try {
      rmSync(tmp, {force: true});
    } catch {
      // Best effort cleanup; the original error is what matters.
    }
    throw error;
  }
}

export function createFileProofStore(filePath: string): ProofStore {
  if (!filePath.trim()) throw new Error("Proof store path must not be empty.");
  let state: StoredState = {version: 1, bindings: [], proofs: []};
  if (existsSync(filePath)) state = load(filePath);

  return createProofStore({
    initialBindings: state.bindings,
    initialProofs: state.proofs,
    persistence: {
      beforeBindingRecorded(binding) {
        const next: StoredState = {version: 1, bindings: [...state.bindings, binding], proofs: state.proofs};
        save(filePath, next);
        state = next;
      },
      beforeProofIssued(proof) {
        const next: StoredState = {version: 1, bindings: state.bindings, proofs: [...state.proofs, proof]};
        save(filePath, next);
        state = next;
      },
    },
  });
}
