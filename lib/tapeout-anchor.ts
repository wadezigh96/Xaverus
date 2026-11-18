import {createHash} from "node:crypto";
import {
  bytesToHex,
  createPublicClient,
  encodeFunctionData,
  getAddress,
  hexToBytes,
  http,
  parseAbi,
  type Address,
  type Hex,
  type Transport,
} from "viem";
import {xLayer} from "viem/chains";
import {isProofValid, proofHash, type HumanProof} from "./human-proof.ts";

/**
 * TapeOut proof anchoring: each Human Proof is stored as a JSON file of
 * hashes in a TapeOut circuit's container through SiteRegistry, so anyone
 * can read a mint's proof back and verify its bytes against the on-chain
 * SHA-256 without trusting the Xaverus server. See ADR-0002 and
 * docs/TAPEOUT_ANCHORING.md.
 *
 * Privacy rule: the anchored file holds hashes only. The raw X handle,
 * the raw OKX UID, and the wallet signature must never appear in it. The
 * numeric X user id is public
 * (it is needed to audit the binding), so it is stored in plain text; the
 * handle and the UID exist only as SHA-256 hashes, and the signature stays
 * server-side with the proof. See the design note in
 * docs/TAPEOUT_ANCHORING.md for why.
 *
 * Conformance: function signatures, chunk limits, and the read/verify rules
 * follow the TapeOut `tape://` spec v0.2 (TapeKit SPEC.md, Appendix B) and
 * the TapeKit kernel (`kernel/src/kernel.js`, `kernel/src/config.js`).
 * SiteRegistry on X Layer (chain 196) is the proxy at the address below;
 * its existence was verified with `cast code` on 19 Nov 2026.
 */

/** SiteRegistry proxy on X Layer (chain 196), from TapeKit kernel config. */
export const SITE_REGISTRY_ADDRESS: Address = "0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6";

/** Maximum bytes per chunk (SPEC Appendix B: CHUNK_MAX). */
export const CHUNK_MAX_BYTES = 24_000;

/** Maximum chunks per file (SPEC §5). */
export const MAX_CHUNKS = 350;

/** Maximum bytes per file: 350 chunks x 24,000 bytes. */
export const MAX_FILE_BYTES = MAX_CHUNKS * CHUNK_MAX_BYTES;

/** Segment size for readRange calls (TapeKit kernel LIMITS.rangeBytes). */
export const READ_RANGE_BYTES = 96 * 1024;

export const ANCHOR_CONTENT_TYPE = "application/json";

/** Current version of the anchor file format. Version 2 dropped the
 * `signature` field: the raw signature stays server-side with the proof,
 * and the public on-chain file holds hashes only (ticket 06). No version 1
 * file was ever anchored on-chain (no container is configured yet), so
 * nothing needs migrating. */
export const ANCHOR_FILE_VERSION = 2;

/**
 * SiteRegistry ABI, transcribed from the TapeOut `tape://` spec v0.2
 * (TapeKit SPEC.md, Appendix B.5). Only the functions this module uses.
 * Selectors cross-checked against TapeKit `kernel/src/selectors.js`
 * (fileInfo 0x6c609107, read 0xccaa7afb, readRange 0x15a4cae2) and against
 * `cast sig` for the writes (putFile 0xfab2ed82, appendChunk 0xe2b51347).
 */
export const SITE_REGISTRY_ABI = parseAbi([
  "function fileInfo(address container, string path) view returns (uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)",
  "function read(address container, string path) view returns (bytes)",
  "function readRange(address container, string path, uint256 offset, uint256 len) view returns (bytes)",
  "function putFile(address container, string path, string contentType, bytes32 sha256Hash, bytes data)",
  "function appendChunk(address container, string path, uint256 expectIndex, bytes data)",
]);

export type AnchorCall = {
  /** SiteRegistry address on X Layer. */
  to: Address;
  /** Encoded calldata for the SiteRegistry write. */
  data: Hex;
  /** Always 0: SiteRegistry writes take no value, only gas. */
  value: bigint;
};

export type AnchorFile = {
  /** On-chain path, e.g. `proofs/0xabc....json`. */
  path: string;
  contentType: string;
  /** Exact file bytes to anchor. */
  bytes: Uint8Array;
  /** SHA-256 of the bytes, as a 0x-prefixed 32-byte hex string. */
  sha256: Hex;
};

export type AnchorFileOptions = {
  /** Circuit the proof is anchored under, e.g. "1.2.0" (processor 0, #1). */
  circuitId?: string;
  /** Container address the file is anchored in. */
  container?: Address;
};

/**
 * Split file bytes into SiteRegistry chunks of at most CHUNK_MAX_BYTES.
 * An empty file has no chunks. Files larger than MAX_FILE_BYTES (350
 * chunks) are refused: SiteRegistry cannot store them.
 */
export function chunkFile(bytes: Uint8Array): Uint8Array[] {
  if (bytes.length > MAX_FILE_BYTES) {
    throw new Error(
      `File of ${bytes.length} bytes exceeds the SiteRegistry limit of ${MAX_CHUNKS} chunks (${MAX_FILE_BYTES} bytes).`
    );
  }
  const chunks: Uint8Array[] = [];
  for (let offset = 0; offset < bytes.length; offset += CHUNK_MAX_BYTES) {
    chunks.push(bytes.slice(offset, offset + CHUNK_MAX_BYTES));
  }
  return chunks;
}

/**
 * Build the anchor file for a Human Proof: a JSON document of hashes, plus
 * its on-chain path and SHA-256. The raw X handle and raw OKX UID never
 * enter the file; only their hashes do. The wallet signature never enters
 * it either: it stays server-side with the proof.
 */
export function buildAnchorFile(proof: HumanProof, options: AnchorFileOptions = {}): AnchorFile {
  if (!isProofValid(proof)) throw new Error("Cannot anchor an invalid Human Proof.");

  const wallet = getAddress(proof.wallet).toLowerCase();
  const document: Record<string, unknown> = {
    version: ANCHOR_FILE_VERSION,
    wallet,
    xUserId: proof.xUserId,
    xHandleHash: proof.xHandleHash,
    okxUidHash: proof.okxUidHash,
    proofHash: proofHash(proof),
    issuedAt: proof.issuedAt,
  };
  if (options.circuitId !== undefined) {
    if (!options.circuitId.trim()) throw new Error("Circuit id must not be empty.");
    document.circuitId = options.circuitId.trim();
  }
  if (options.container !== undefined) {
    document.container = getAddress(options.container).toLowerCase();
  }

  const bytes = new TextEncoder().encode(JSON.stringify(document));
  const sha256 = `0x${createHash("sha256").update(bytes).digest("hex")}` as Hex;
  return {
    path: `proofs/${wallet}.json`,
    contentType: ANCHOR_CONTENT_TYPE,
    bytes,
    sha256,
  };
}

function assertChunkSize(chunk: Uint8Array, label: string): void {
  if (chunk.length > CHUNK_MAX_BYTES) {
    throw new Error(`${label} of ${chunk.length} bytes exceeds the 24,000-byte chunk limit.`);
  }
}

function assertSha256(sha256: string): Hex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(sha256)) {
    throw new Error("sha256 must be a 32-byte 0x-prefixed hex string.");
  }
  return sha256.toLowerCase() as Hex;
}

/**
 * Build the putFile call that writes the first chunk of an anchor file
 * (and replaces the whole file if it already exists). The caller signs and
 * sends it; this function only encodes it. Only the container's editor
 * (the circuit NFT holder, or an operator) may call it on-chain.
 */
export function buildPutFileCall(args: {
  container: Address;
  path: string;
  contentType: string;
  sha256: Hex;
  firstChunk: Uint8Array;
}): AnchorCall {
  assertChunkSize(args.firstChunk, "First chunk");
  const sha256 = assertSha256(args.sha256);
  return {
    to: SITE_REGISTRY_ADDRESS,
    data: encodeFunctionData({
      abi: SITE_REGISTRY_ABI,
      functionName: "putFile",
      args: [
        getAddress(args.container),
        args.path,
        args.contentType,
        sha256,
        bytesToHex(args.firstChunk),
      ],
    }),
    value: 0n,
  };
}

/**
 * Build the appendChunk call that appends one chunk to an anchor file.
 * `expectIndex` must equal the file's current chunk count, which prevents
 * duplicate appends.
 */
export function buildAppendChunkCall(args: {
  container: Address;
  path: string;
  expectIndex: number | bigint;
  chunk: Uint8Array;
}): AnchorCall {
  assertChunkSize(args.chunk, "Chunk");
  if (BigInt(args.expectIndex) < 0n) throw new Error("expectIndex must not be negative.");
  return {
    to: SITE_REGISTRY_ADDRESS,
    data: encodeFunctionData({
      abi: SITE_REGISTRY_ABI,
      functionName: "appendChunk",
      args: [getAddress(args.container), args.path, BigInt(args.expectIndex), bytesToHex(args.chunk)],
    }),
    value: 0n,
  };
}

export type AnchorReadResult = {
  path: string;
  /** Verified file bytes: length and SHA-256 match the on-chain record. */
  bytes: Uint8Array;
  contentType: string;
  /** On-chain SHA-256, verified against the returned bytes. */
  sha256: Hex;
  size: number;
  chunkCount: number;
  updatedAt: number;
};

/**
 * Thrown by readAnchorFile when the container has no file at the requested
 * path (chunkCount === 0). Callers (the anchor route) test for this class
 * with `instanceof` instead of matching the message text.
 */
export class AnchorFileNotFoundError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AnchorFileNotFoundError";
  }
}

const ZERO_SHA256 = `0x${"0".repeat(64)}` as Hex;

function sha256Of(bytes: Uint8Array): Hex {
  return `0x${createHash("sha256").update(bytes).digest("hex")}` as Hex;
}

/**
 * Read an anchor file back from SiteRegistry and verify it, following the
 * TapeKit kernel's rules (SPEC §5): fileInfo first, one `read` call up to
 * 96 KB, `readRange` segments above that, then both checks must hold: the
 * length equals the declared size and the SHA-256 of the bytes equals the
 * on-chain hash. Anything else throws: a missing file, an oversized file,
 * a file with no declared hash (all-zero SHA-256), or a length/hash
 * mismatch. This is a read-only call: it needs no wallet and no gas.
 *
 * Pass `transport` to override the RPC transport (tests use a stub
 * transport); otherwise `rpcUrl` is required.
 */
export async function readAnchorFile(args: {
  container: Address;
  path: string;
  rpcUrl?: string;
  transport?: Transport;
}): Promise<AnchorReadResult> {
  if (!args.transport && !args.rpcUrl) {
    throw new Error("readAnchorFile needs an rpcUrl or a transport.");
  }
  const client = createPublicClient({
    chain: xLayer,
    transport: args.transport ?? http(args.rpcUrl),
  });
  const container = getAddress(args.container);
  const [size, contentType, sha256Hash, updatedAt, chunkCount] = await client.readContract({
    address: SITE_REGISTRY_ADDRESS,
    abi: SITE_REGISTRY_ABI,
    functionName: "fileInfo",
    args: [container, args.path],
  });
  if (chunkCount === 0n) {
    throw new AnchorFileNotFoundError(`No anchor file at ${args.path} in container ${container}.`);
  }
  if (size > MAX_FILE_BYTES) {
    throw new Error(`File at ${args.path} is ${size} bytes, over the ${MAX_FILE_BYTES}-byte limit.`);
  }
  if (sha256Hash === ZERO_SHA256) {
    throw new Error(`File at ${args.path} has no declared SHA-256 hash (unverified).`);
  }

  let bytes: Uint8Array;
  if (size <= READ_RANGE_BYTES) {
    const data = await client.readContract({
      address: SITE_REGISTRY_ADDRESS,
      abi: SITE_REGISTRY_ABI,
      functionName: "read",
      args: [container, args.path],
    });
    bytes = hexToBytes(data);
  } else {
    const parts: Uint8Array[] = [];
    for (let offset = 0; offset < size; offset += READ_RANGE_BYTES) {
      const len = Math.min(READ_RANGE_BYTES, size - offset);
      const data = await client.readContract({
        address: SITE_REGISTRY_ADDRESS,
        abi: SITE_REGISTRY_ABI,
        functionName: "readRange",
        args: [container, args.path, BigInt(offset), BigInt(len)],
      });
      parts.push(hexToBytes(data));
    }
    bytes = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
    let at = 0;
    for (const part of parts) {
      bytes.set(part, at);
      at += part.length;
    }
  }

  if (bytes.length !== size) {
    throw new Error(
      `Length mismatch for ${args.path}: declared ${size} bytes, read ${bytes.length}.`
    );
  }
  const actual = sha256Of(bytes);
  if (actual !== sha256Hash.toLowerCase()) {
    throw new Error(
      `SHA-256 mismatch for ${args.path}: declared ${sha256Hash}, computed ${actual}.`
    );
  }
  return {
    path: args.path,
    bytes,
    contentType,
    sha256: sha256Hash,
    size,
    chunkCount: Number(chunkCount),
    updatedAt: Number(updatedAt),
  };
}
