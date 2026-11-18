import {createMemoryProofStore, type ProofStore} from "./human-proof.ts";
import {createFileProofStore} from "./human-proof-file-store.ts";

/**
 * The one shared proof store for the server process. The X OAuth callback
 * records bindings here and the claim/mint routes read them here, so both
 * sides must use this singleton rather than creating their own store.
 *
 * The store is file-backed (JSON, atomic writes) when XAVERUS_PROOF_STORE_PATH
 * is set, so bindings and proofs survive a restart; otherwise it is in-memory.
 * The choice is made once, when the singleton is first created.
 */

let store: ProofStore | undefined;

export function getHumanProofStore(): ProofStore {
  if (!store) {
    const path = process.env.XAVERUS_PROOF_STORE_PATH?.trim();
    store = path ? createFileProofStore(path) : createMemoryProofStore();
  }
  return store;
}

/** Test-only: drop the singleton so the next call starts empty. */
export function resetHumanProofStore(): void {
  store = undefined;
}
