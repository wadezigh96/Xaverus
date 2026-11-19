import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {bytesToHex, custom, decodeFunctionData, encodeAbiParameters, hexToBytes} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  buildBindingMessage,
  createMemoryProofStore,
  hashHandle,
  hashUid,
  proofHash,
  type HumanProof,
} from "./human-proof.ts";
import {
  AnchorFileNotFoundError,
  buildAnchorFile,
  buildAppendChunkCall,
  buildPutFileCall,
  chunkFile,
  readAnchorFile,
  CHUNK_MAX_BYTES,
  MAX_FILE_BYTES,
  READ_RANGE_BYTES,
  SITE_REGISTRY_ABI,
  SITE_REGISTRY_ADDRESS,
} from "./tapeout-anchor.ts";

const HANDLE = "alice";
const UID = "987654321";
const X_USER_ID = "123456789";

async function makeProof(): Promise<HumanProof> {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({
    wallet: account.address,
    xUserId: X_USER_ID,
    xHandleHash: hashHandle(HANDLE),
  });
  const expiresAt = Math.floor(Date.now() / 1000) + 900;
  const message = buildBindingMessage({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: hashUid(UID),
    expiresAt,
  });
  const signature = await account.signMessage({message});
  return store.issueProof({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: hashUid(UID),
    signature,
    expiresAt,
  });
}

test("anchor file holds hashes only, never the raw handle, UID, or signature", async () => {
  const proof = await makeProof();
  const file = buildAnchorFile(proof);

  assert.equal(file.path, `proofs/${proof.wallet.toLowerCase()}.json`);
  assert.equal(file.contentType, "application/json");

  const text = new TextDecoder().decode(file.bytes);
  const json = JSON.parse(text);
  assert.equal(json.version, 2);
  assert.equal(json.wallet, proof.wallet.toLowerCase());
  assert.equal(json.xUserId, X_USER_ID);
  assert.equal(json.xHandleHash, hashHandle(HANDLE));
  assert.equal(json.okxUidHash, hashUid(UID));
  assert.equal(json.proofHash, proofHash(proof));
  // No signature key: the raw signature stays server-side with the proof;
  // the public on-chain file holds hashes only (ticket 06).
  assert.ok(!("signature" in json));
  assert.equal(json.issuedAt, proof.issuedAt);

  // The raw handle and UID must appear nowhere in the anchored bytes.
  assert.ok(!text.includes(HANDLE));
  assert.ok(!text.includes(UID));
  // The raw signature must appear nowhere in the anchored bytes either.
  assert.ok(!text.includes(proof.signature));
  // The sha256 is the SHA-256 of the exact bytes, recomputed independently here.
  const expected = `0x${createHash("sha256").update(file.bytes).digest("hex")}`;
  assert.equal(file.sha256, expected);
});

test("anchor file carries optional circuit id and container", async () => {
  const proof = await makeProof();
  const file = buildAnchorFile(proof, {
    circuitId: "1.2.0",
    container: "0xE2E5FfD861C8a0b50Ce21A7bcbDD6Bb5aaC250aB",
  });
  const json = JSON.parse(new TextDecoder().decode(file.bytes));
  assert.equal(json.circuitId, "1.2.0");
  assert.equal(json.container, "0xe2e5ffd861c8a0b50ce21a7bcbdd6bb5aac250ab");
});

test("anchor file rejects an invalid proof", async () => {
  const proof = await makeProof();
  assert.throws(() => buildAnchorFile({...proof, okxUidHash: "not-a-hash"}), /invalid/i);
});

test("chunking: empty file has no chunks", () => {
  assert.deepEqual(chunkFile(new Uint8Array(0)), []);
});

test("chunking: 1 byte is a single chunk", () => {
  const chunks = chunkFile(new Uint8Array([7]));
  assert.equal(chunks.length, 1);
  assert.deepEqual(chunks[0], new Uint8Array([7]));
});

test("chunking: exactly 24,000 bytes is a single full chunk", () => {
  const bytes = Uint8Array.from({length: CHUNK_MAX_BYTES}, (_, i) => i % 256);
  const chunks = chunkFile(bytes);
  assert.equal(chunks.length, 1);
  assert.equal(chunks[0].length, CHUNK_MAX_BYTES);
  assert.deepEqual(chunks[0], bytes);
});

test("chunking: 24,001 bytes split into a full chunk plus one byte", () => {
  const bytes = Uint8Array.from({length: CHUNK_MAX_BYTES + 1}, (_, i) => i % 256);
  const chunks = chunkFile(bytes);
  assert.equal(chunks.length, 2);
  assert.equal(chunks[0].length, CHUNK_MAX_BYTES);
  assert.equal(chunks[1].length, 1);
  assert.equal(chunks[1][0], CHUNK_MAX_BYTES % 256);
});

test("chunking: multi-chunk files reassemble byte for byte", () => {
  const bytes = Uint8Array.from({length: 50_000}, (_, i) => (i * 7 + 3) % 256);
  const chunks = chunkFile(bytes);
  assert.deepEqual(
    chunks.map((c) => c.length),
    [24_000, 24_000, 2_000]
  );
  const joined = Buffer.concat(chunks.map((c) => Buffer.from(c)));
  assert.deepEqual(new Uint8Array(joined), bytes);
  // Boundary bytes land in the right chunk.
  assert.equal(chunks[0][23_999], bytes[23_999]);
  assert.equal(chunks[1][0], bytes[24_000]);
  assert.equal(chunks[2][1_999], bytes[49_999]);
});

test("chunking: a file over the 350-chunk limit is refused", () => {
  assert.throws(() => chunkFile(new Uint8Array(MAX_FILE_BYTES + 1)), /350 chunks|too large/i);
});

const CONTAINER = "0xE2E5FfD861C8a0b50Ce21A7bcbDD6Bb5aaC250aB";
const SHA256 = `0x${createHash("sha256").update("hello").digest("hex")}` as const;

test("putFile call targets SiteRegistry with the TapeOut selector and fields", () => {
  const firstChunk = new TextEncoder().encode("hello");
  const call = buildPutFileCall({
    container: CONTAINER,
    path: "proofs/0xabc.json",
    contentType: "application/json",
    sha256: SHA256,
    firstChunk,
  });
  assert.equal(call.to, SITE_REGISTRY_ADDRESS);
  assert.equal(call.value, 0n);
  // Selector 0xfab2ed82 is keccak256("putFile(address,string,string,bytes32,bytes)")[0:4],
  // computed independently with `cast sig` (not with viem).
  assert.ok(call.data.startsWith("0xfab2ed82"));
  const decoded = decodeFunctionData({abi: SITE_REGISTRY_ABI, data: call.data});
  assert.equal(decoded.functionName, "putFile");
  assert.deepEqual(decoded.args, [
    CONTAINER,
    "proofs/0xabc.json",
    "application/json",
    SHA256,
    bytesToHex(firstChunk),
  ]);
});

test("putFile call rejects a first chunk over 24,000 bytes", () => {
  assert.throws(
    () =>
      buildPutFileCall({
        container: CONTAINER,
        path: "proofs/0xabc.json",
        contentType: "application/json",
        sha256: SHA256,
        firstChunk: new Uint8Array(CHUNK_MAX_BYTES + 1),
      }),
    /24,000|chunk/i
  );
});

test("putFile call rejects a malformed sha256", () => {
  assert.throws(
    () =>
      buildPutFileCall({
        container: CONTAINER,
        path: "proofs/0xabc.json",
        contentType: "application/json",
        sha256: "0x1234",
        firstChunk: new Uint8Array([1]),
      }),
    /sha256|32 bytes/i
  );
});

test("appendChunk call carries the expected index and chunk bytes", () => {
  const chunk = Uint8Array.from({length: 100}, (_, i) => i);
  const call = buildAppendChunkCall({
    container: CONTAINER,
    path: "proofs/0xabc.json",
    expectIndex: 1,
    chunk,
  });
  assert.equal(call.to, SITE_REGISTRY_ADDRESS);
  assert.equal(call.value, 0n);
  // Selector 0xe2b51347 is keccak256("appendChunk(address,string,uint256,bytes)")[0:4],
  // computed independently with `cast sig`.
  assert.ok(call.data.startsWith("0xe2b51347"));
  const decoded = decodeFunctionData({abi: SITE_REGISTRY_ABI, data: call.data});
  assert.equal(decoded.functionName, "appendChunk");
  assert.deepEqual(decoded.args, [CONTAINER, "proofs/0xabc.json", 1n, bytesToHex(chunk)]);
});

test("appendChunk call rejects a chunk over 24,000 bytes", () => {
  assert.throws(
    () =>
      buildAppendChunkCall({
        container: CONTAINER,
        path: "proofs/0xabc.json",
        expectIndex: 0,
        chunk: new Uint8Array(CHUNK_MAX_BYTES + 1),
      }),
    /24,000|chunk/i
  );
});

// --- Reader tests: a stub SiteRegistry behind a viem custom transport. ---
//
// The stub dispatches on the function selectors published by TapeKit
// (kernel/src/selectors.js), not on anything from the module under test:
// if the reader encoded the wrong signature, the stub throws "unknown
// selector" instead of answering.

const SEL_FILE_INFO = "0x6c609107";
const SEL_READ = "0xccaa7afb";
const SEL_READ_RANGE = "0x15a4cae2";
const ZERO_HASH = `0x${"0".repeat(64)}` as const;

type StubFile = {
  bytes: Uint8Array;
  contentType: string;
  /** SHA-256 the stub reports in fileInfo; defaults to the hash of bytes. */
  declaredSha?: string;
  /** Size the stub reports in fileInfo; defaults to the bytes length. */
  declaredSize?: number;
  updatedAt?: number;
};

function sha256Hex(bytes: Uint8Array): `0x${string}` {
  return `0x${createHash("sha256").update(bytes).digest("hex")}` as `0x${string}`;
}

function stubSiteRegistry(files: Map<string, StubFile>) {
  const calls: string[] = [];
  const transport = custom({
    request: async ({method, params}: {method: string; params?: unknown}) => {
      if (method === "eth_chainId") return "0xc4";
      if (method !== "eth_call") throw new Error(`stub: unexpected method ${method}`);
      const data = (params as [{data: `0x${string}`}])[0].data;
      const selector = data.slice(0, 10);
      calls.push(selector);
      if (selector === SEL_FILE_INFO) {
        const {args} = decodeFunctionData({abi: SITE_REGISTRY_ABI, data});
        const path = args[1] as string;
        const file = files.get(path);
        if (!file) {
          return encodeAbiParameters(
            [
              {type: "uint32"},
              {type: "string"},
              {type: "bytes32"},
              {type: "uint40"},
              {type: "uint256"},
            ],
            [0, "", ZERO_HASH, 0, 0n]
          );
        }
        return encodeAbiParameters(
          [
            {type: "uint32"},
            {type: "string"},
            {type: "bytes32"},
            {type: "uint40"},
            {type: "uint256"},
          ],
          [
            file.declaredSize ?? file.bytes.length,
            file.contentType,
            (file.declaredSha ?? sha256Hex(file.bytes)) as `0x${string}`,
            file.updatedAt ?? 1_700_000_000,
            BigInt(Math.max(1, Math.ceil(file.bytes.length / CHUNK_MAX_BYTES))),
          ]
        );
      }
      if (selector === SEL_READ) {
        const {args} = decodeFunctionData({abi: SITE_REGISTRY_ABI, data});
        const file = files.get(args[1] as string);
        if (!file) throw new Error("stub: NoSuchFile");
        return encodeAbiParameters([{type: "bytes"}], [bytesToHex(file.bytes)]);
      }
      if (selector === SEL_READ_RANGE) {
        const {args} = decodeFunctionData({abi: SITE_REGISTRY_ABI, data});
        const file = files.get(args[1] as string);
        if (!file) throw new Error("stub: NoSuchFile");
        const offset = Number(args[2] as bigint);
        const len = Number(args[3] as bigint);
        return encodeAbiParameters(
          [{type: "bytes"}],
          [bytesToHex(file.bytes.slice(offset, offset + len))]
        );
      }
      throw new Error(`stub: unknown selector ${selector}`);
    },
  });
  return {transport, calls};
}

test("reader fetches a small file in one read and verifies its hash", async () => {
  const bytes = new TextEncoder().encode(JSON.stringify({version: 1, wallet: "0xabc"}));
  const {transport, calls} = stubSiteRegistry(
    new Map([["proofs/0xabc.json", {bytes, contentType: "application/json"}]])
  );
  const file = await readAnchorFile({container: CONTAINER, path: "proofs/0xabc.json", transport});
  assert.deepEqual(file.bytes, bytes);
  assert.equal(file.contentType, "application/json");
  assert.equal(file.sha256, sha256Hex(bytes));
  assert.equal(file.size, bytes.length);
  assert.equal(file.chunkCount, 1);
  assert.ok(calls.includes(SEL_READ), "small file must be read with read()");
  assert.ok(!calls.includes(SEL_READ_RANGE), "small file must not use readRange()");
});

test("reader reassembles a large file from 96 KB readRange segments", async () => {
  const bytes = Uint8Array.from({length: 200_000}, (_, i) => (i * 13 + 5) % 256);
  const {transport, calls} = stubSiteRegistry(
    new Map([["proofs/big.json", {bytes, contentType: "application/json"}]])
  );
  const file = await readAnchorFile({container: CONTAINER, path: "proofs/big.json", transport});
  assert.deepEqual(file.bytes, bytes);
  assert.equal(file.size, 200_000);
  assert.ok(calls.includes(SEL_READ_RANGE), "large file must be read with readRange()");
  assert.ok(!calls.includes(SEL_READ), "large file must not use read()");
  assert.equal(
    calls.filter((c) => c === SEL_READ_RANGE).length,
    3,
    "200,000 bytes need 3 segments of 96 KB"
  );
});

test("reader uses a single read at exactly the 96 KB boundary", async () => {
  const bytes = new Uint8Array(READ_RANGE_BYTES).fill(9);
  const {transport, calls} = stubSiteRegistry(
    new Map([["proofs/edge.json", {bytes, contentType: "application/json"}]])
  );
  const file = await readAnchorFile({container: CONTAINER, path: "proofs/edge.json", transport});
  assert.deepEqual(file.bytes, bytes);
  assert.ok(calls.includes(SEL_READ));
  assert.ok(!calls.includes(SEL_READ_RANGE));
});

test("reader rejects a file whose bytes do not match the on-chain hash", async () => {
  const trueBytes = new TextEncoder().encode("true content");
  const tampered = new TextEncoder().encode("tampered!!!");
  // fileInfo declares the hash of the true bytes, but read() returns
  // tampered bytes: the reader must refuse, not return bad data.
  const {transport} = stubSiteRegistry(
    new Map([
      [
        "proofs/0xabc.json",
        {bytes: tampered, contentType: "application/json", declaredSha: sha256Hex(trueBytes)},
      ],
    ])
  );
  await assert.rejects(
    readAnchorFile({container: CONTAINER, path: "proofs/0xabc.json", transport}),
    /hash|mismatch/i
  );
});

test("reader rejects a file whose length differs from the declared size", async () => {
  const bytes = new TextEncoder().encode("short");
  const {transport} = stubSiteRegistry(
    new Map([
      [
        "proofs/0xabc.json",
        // Declared hash matches the returned bytes, but fileInfo declares
        // 100 bytes while read() returns only 5: the length check must fire.
        {
          bytes,
          contentType: "application/json",
          declaredSha: sha256Hex(bytes),
          declaredSize: 100,
        },
      ],
    ])
  );
  await assert.rejects(
    readAnchorFile({container: CONTAINER, path: "proofs/0xabc.json", transport}),
    /length|size|mismatch/i
  );
});

test("reader throws for a missing file", async () => {
  const {transport} = stubSiteRegistry(new Map());
  await assert.rejects(
    readAnchorFile({container: CONTAINER, path: "proofs/0xmissing.json", transport}),
    (error: unknown) => {
      // Callers tell a missing file apart by the error class, not by
      // matching the message text.
      assert.ok(error instanceof AnchorFileNotFoundError);
      assert.match((error as Error).message, /not found|no anchor/i);
      return true;
    }
  );
});

test("reader refuses a file with no declared hash (all-zero sha256)", async () => {
  const bytes = new TextEncoder().encode("unverified");
  const {transport} = stubSiteRegistry(
    new Map([
      ["proofs/0xabc.json", {bytes, contentType: "application/json", declaredSha: ZERO_HASH}],
    ])
  );
  await assert.rejects(
    readAnchorFile({container: CONTAINER, path: "proofs/0xabc.json", transport}),
    /unverified|no sha|zero/i
  );
});
