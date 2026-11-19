import {createHash} from "node:crypto";
import {getAddress, keccak256, recoverMessageAddress, toBytes, type Address, type Hex} from "viem";

/**
 * Human Proof core: the shared vocabulary of human-proof minting as code.
 * See GLOSSARY.md, ADR-0001, and .scratch/human-proof-mint/SPEC.md.
 *
 * A Human Proof is exactly one X Binding plus one OKX UID Claim for the same
 * wallet. The UID is always handled as a hash; the raw UID never enters a
 * stored proof. The UID is the user's own signed claim, never a verification
 * by OKX (ADR-0001).
 */

export type XBinding = {
  wallet: Address;
  xUserId: string;
  xHandleHash: string;
  boundAt: number;
};

export type HumanProof = {
  wallet: Address;
  xUserId: string;
  xHandleHash: string;
  okxUidHash: string;
  signature: Hex;
  issuedAt: number;
  /** Expiry of the signed binding message, kept so the message (and its hash) can be rebuilt. */
  expiresAt: number;
};

export type ProofStore = {
  recordBinding(args: {wallet: string; xUserId: string; xHandleHash: string}): XBinding;
  getBinding(wallet: string): XBinding | undefined;
  issueProof(args: {
    wallet: string;
    xUserId: string;
    okxUidHash: string;
    signature: Hex;
    expiresAt: number;
    now?: number;
  }): Promise<HumanProof>;
  getProof(wallet: string): HumanProof | undefined;
  getProofByX(xUserId: string): HumanProof | undefined;
  hasProof(wallet: string): boolean;
};

function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

/** Exactly 64 lowercase hex chars: the shape of every hash this module handles. */
export function isHex64(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/.test(value);
}

/**
 * Machine-readable reason a store rule refused an operation. Callers that
 * map refusals to HTTP statuses must switch on `code`, never on the message
 * text. Plain Errors are still used for caller bugs (bad input shape).
 */
export type ProofStoreErrorCode =
  | "WALLET_ALREADY_BOUND"
  | "X_ALREADY_BOUND"
  | "NO_BINDING"
  | "EXPIRED"
  | "ALREADY_HAS_PROOF"
  | "BAD_SIGNATURE";

export class ProofStoreError extends Error {
  readonly code: ProofStoreErrorCode;
  constructor(code: ProofStoreErrorCode, message: string) {
    super(message);
    this.name = "ProofStoreError";
    this.code = code;
  }
}

/** Hash of an OKX UID. The raw UID must never be stored or logged. */
export function hashUid(uid: string): string {
  const trimmed = uid.trim();
  if (!trimmed) throw new Error("OKX UID must not be empty.");
  return sha256Hex(trimmed);
}

/** Hash of an X handle, lowercased first: X handles are case-insensitive. */
export function hashHandle(handle: string): string {
  const trimmed = handle.trim().toLowerCase();
  if (!trimmed) throw new Error("X handle must not be empty.");
  return sha256Hex(trimmed);
}

export function buildBindingMessage(args: {
  wallet: string;
  xUserId: string;
  okxUidHash: string;
  expiresAt: number;
}): string {
  const wallet = getAddress(args.wallet);
  if (!args.xUserId.trim()) throw new Error("X user id must not be empty.");
  if (!isHex64(args.okxUidHash)) throw new Error("OKX UID hash must be 64 hex chars.");
  if (!Number.isFinite(args.expiresAt) || args.expiresAt <= 0) {
    throw new Error("Expiry must be a positive unix timestamp.");
  }
  return [
    "Xaverus Human Proof",
    "",
    "I bind this wallet to my X account and claim the OKX UID below.",
    "This signature proves I control the wallet. It does not move funds.",
    `Wallet: ${wallet}`,
    `X user ID: ${args.xUserId.trim()}`,
    `OKX UID hash: ${args.okxUidHash}`,
    "Chain: X Layer (196)",
    `Expires: ${args.expiresAt}`,
  ].join("\n");
}

export async function verifyBindingSignature(args: {
  message: string;
  signature: Hex;
  wallet: string;
}): Promise<boolean> {
  try {
    const recovered = await recoverMessageAddress({message: args.message, signature: args.signature});
    return recovered.toLowerCase() === getAddress(args.wallet).toLowerCase();
  } catch {
    return false;
  }
}

/**
 * On-chain commitment to a proof: keccak256 of the exact binding message the
 * wallet signed. It commits to the wallet, the X user id, the UID hash, and
 * the expiry, without revealing the raw UID. This is the bytes32 the proof
 * registry stores.
 */
export function proofHash(proof: HumanProof): Hex {
  const message = buildBindingMessage({
    wallet: proof.wallet,
    xUserId: proof.xUserId,
    okxUidHash: proof.okxUidHash,
    expiresAt: proof.expiresAt,
  });
  return keccak256(toBytes(message));
}

/** Structural validity of a stored proof. Proofs do not expire in v1. */
export function isProofValid(proof: HumanProof): boolean {
  try {
    getAddress(proof.wallet);
  } catch {
    return false;
  }
  return (
    typeof proof.xUserId === "string" &&
    proof.xUserId.trim().length > 0 &&
    isHex64(proof.xHandleHash) &&
    isHex64(proof.okxUidHash) &&
    typeof proof.signature === "string" &&
    proof.signature.startsWith("0x") &&
    Number.isFinite(proof.issuedAt) &&
    proof.issuedAt > 0 &&
    Number.isFinite(proof.expiresAt) &&
    proof.expiresAt > 0
  );
}

function key(wallet: string): string {
  return getAddress(wallet).toLowerCase();
}

/**
 * Persistence hooks for a proof store. Each hook runs with the new record
 * BEFORE it is committed to the store's maps, so a hook that throws (a
 * failed disk write, for example) vetoes the record: the in-memory state
 * never diverges from what was persisted. The memory store passes no
 * hooks; the file store saves through them.
 */
export type ProofStorePersistence = {
  beforeBindingRecorded?: (binding: XBinding) => void;
  beforeProofIssued?: (proof: HumanProof) => void;
};

export type CreateProofStoreOptions = {
  /** Records the store starts with. The caller must have validated them. */
  initialBindings?: XBinding[];
  initialProofs?: HumanProof[];
  persistence?: ProofStorePersistence;
};

/**
 * The one implementation of the binding and proof rules, shared by the
 * memory store and the file-backed store. Both backends differ only in
 * persistence (none vs. the JSON file), never in the rules: one X account
 * binds to at most one wallet, one wallet holds at most one binding and
 * one proof, and a proof is issued only for a matching binding with a
 * fresh, wallet-matching signature.
 */
export function createProofStore(options: CreateProofStoreOptions = {}): ProofStore {
  const bindingsByWallet = new Map<string, XBinding>();
  const bindingsByX = new Map<string, XBinding>();
  const proofsByWallet = new Map<string, HumanProof>();
  for (const binding of options.initialBindings ?? []) {
    bindingsByWallet.set(key(binding.wallet), binding);
    bindingsByX.set(binding.xUserId, binding);
  }
  for (const proof of options.initialProofs ?? []) {
    proofsByWallet.set(key(proof.wallet), proof);
  }
  const persistence = options.persistence;

  return {
    getBinding(wallet) {
      return bindingsByWallet.get(key(wallet));
    },

    recordBinding(args) {
      const wallet = getAddress(args.wallet);
      if (!args.xUserId.trim()) throw new Error("X user id must not be empty.");
      if (!isHex64(args.xHandleHash)) {
        throw new Error("X handle hash must be 64 hex chars.");
      }
      const w = key(args.wallet);
      if (bindingsByWallet.has(w)) {
        throw new ProofStoreError("WALLET_ALREADY_BOUND", "This wallet is already bound to an X account.");
      }
      if (bindingsByX.has(args.xUserId)) {
        throw new ProofStoreError("X_ALREADY_BOUND", "This X account is already bound to a wallet.");
      }
      const binding: XBinding = {
        wallet,
        xUserId: args.xUserId,
        xHandleHash: args.xHandleHash,
        boundAt: Math.floor(Date.now() / 1000),
      };
      persistence?.beforeBindingRecorded?.(binding);
      bindingsByWallet.set(w, binding);
      bindingsByX.set(args.xUserId, binding);
      return binding;
    },

    async issueProof(args) {
      const wallet = getAddress(args.wallet);
      const w = key(args.wallet);
      const binding = bindingsByWallet.get(w);
      if (!binding || binding.xUserId !== args.xUserId) {
        throw new ProofStoreError(
          "NO_BINDING",
          "No X Binding for this wallet and X account. Connect X first."
        );
      }
      const now = args.now ?? Math.floor(Date.now() / 1000);
      if (args.expiresAt <= now) {
        throw new ProofStoreError("EXPIRED", "Binding message expired. Sign a fresh message.");
      }
      if (proofsByWallet.has(w)) {
        throw new ProofStoreError("ALREADY_HAS_PROOF", "This wallet already has a Human Proof.");
      }
      const message = buildBindingMessage({
        wallet,
        xUserId: args.xUserId,
        okxUidHash: args.okxUidHash,
        expiresAt: args.expiresAt,
      });
      const ok = await verifyBindingSignature({message, signature: args.signature, wallet});
      if (!ok) {
        throw new ProofStoreError("BAD_SIGNATURE", "Signature does not match the minting wallet.");
      }
      const proof: HumanProof = {
        wallet,
        xUserId: args.xUserId,
        xHandleHash: binding.xHandleHash,
        okxUidHash: args.okxUidHash,
        signature: args.signature,
        issuedAt: now,
        expiresAt: args.expiresAt,
      };
      persistence?.beforeProofIssued?.(proof);
      proofsByWallet.set(w, proof);
      return proof;
    },

    getProof(wallet) {
      return proofsByWallet.get(key(wallet));
    },

    getProofByX(xUserId) {
      for (const proof of proofsByWallet.values()) {
        if (proof.xUserId === xUserId) return proof;
      }
      return undefined;
    },

    hasProof(wallet) {
      return proofsByWallet.has(key(wallet));
    },
  };
}

/** An in-memory proof store: the shared rules with no persistence. */
export function createMemoryProofStore(): ProofStore {
  return createProofStore();
}
