// Fork test for TapeOut proof anchoring (ticket 06).
//
// Spins up a local anvil fork of X Layer mainnet (https://rpc.xlayer.tech)
// and proves the anchoring code against the REAL deployed SiteRegistry:
//   (1) READ path: read a real DeWEB file that exists on X Layer mainnet
//       (circuit 1.2.0's `.well-known/taperelay.json`) and verify its SHA-256.
//   (2) WRITE path: impersonate the container's owner on the fork, anchor
//       a throwaway Human Proof with putFile, read it back, verify it,
//       then prove putFile replace semantics and a multi-chunk
//       putFile + appendChunk write.
//
// Everything runs on the local fork. Nothing here touches mainnet: the
// fork is discarded when anvil stops.
//
// Usage: node scripts/tapeout-anchor-fork-test.mjs
// Requires: anvil in ~/.foundry/bin, network access to rpc.xlayer.tech.

import {spawn} from "node:child_process";
import {createHash} from "node:crypto";
import {homedir} from "node:os";
import {join} from "node:path";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  buildBindingMessage,
  createMemoryProofStore,
  hashHandle,
  hashUid,
} from "../lib/human-proof.ts";
import {
  buildAnchorFile,
  buildAppendChunkCall,
  buildPutFileCall,
  chunkFile,
  readAnchorFile,
  CHUNK_MAX_BYTES,
  SITE_REGISTRY_ADDRESS,
} from "../lib/tapeout-anchor.ts";

const FORK_URL = "https://rpc.xlayer.tech";
const FORK_PORT = 18545;
const RPC_URL = `http://127.0.0.1:${FORK_PORT}`;
const ANVIL = join(homedir(), ".foundry", "bin", "anvil");

// Real mainnet facts, verified read-only on 19 Nov 2026 (see
// docs/TAPEOUT_ANCHORING.md): circuit 1.2.0 (processor 0, #1) has an
// opened container with one file, and this owner.
const CONTAINER = "0xE2E5FfD861C8a0b50Ce21A7bcbDD6Bb5aaC250aB";
const OWNER = "0x571d447f4f24688eC35Ccf07f1D6993655F6aF15";
const REAL_PATH = ".well-known/taperelay.json";
const REAL_SIZE = 584;
const REAL_SHA256 = "0x92207607e45e77182bece1622cf1a455574d93ed97cc480766861ed8873aa4a9";
const REAL_CONTENT_TYPE = "application/json";
const IMPL_SLOT = "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc";
const PINNED_IMPL = "0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f"; // TapeKit kernel config

function log(step, message) {
  console.log(`[${step}] ${message}`);
}

function fail(message) {
  throw new Error(message);
}

async function rpc(method, params = []) {
  const res = await fetch(RPC_URL, {
    method: "POST",
    headers: {"content-type": "application/json"},
    body: JSON.stringify({jsonrpc: "2.0", id: 1, method, params}),
  });
  const json = await res.json();
  if (json.error) fail(`RPC ${method} failed: ${JSON.stringify(json.error)}`);
  return json.result;
}

async function waitForAnvil(deadlineMs = 90_000) {
  const started = Date.now();
  for (;;) {
    try {
      const chainId = await rpc("eth_chainId");
      if (chainId === "0xc4") return;
      fail(`fork reports chain ${chainId}, expected 0xc4 (X Layer)`);
    } catch (error) {
      if (Date.now() - started > deadlineMs) throw error;
      await new Promise((r) => setTimeout(r, 500));
    }
  }
}

async function sendFromImpersonated(call) {
  const gas = await rpc("eth_estimateGas", [{from: OWNER, to: call.to, data: call.data}]);
  const gasWithMargin = `0x${((BigInt(gas) * 120n) / 100n).toString(16)}`;
  const hash = await rpc("eth_sendTransaction", [
    {from: OWNER, to: call.to, data: call.data, value: "0x0", gas: gasWithMargin},
  ]);
  for (let i = 0; i < 30; i++) {
    const receipt = await rpc("eth_getTransactionReceipt", [hash]);
    if (receipt) {
      if (receipt.status !== "0x1") fail(`transaction ${hash} reverted`);
      return {hash, gasUsed: BigInt(receipt.gasUsed)};
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`no receipt for transaction ${hash}`);
}

async function makeThrowawayProof(now, account = privateKeyToAccount(generatePrivateKey())) {
  const store = createMemoryProofStore();
  const xUserId = "4242424242";
  store.recordBinding({
    wallet: account.address,
    xUserId,
    xHandleHash: hashHandle("fork-test-ghost"),
  });
  const expiresAt = now + 3600;
  const message = buildBindingMessage({
    wallet: account.address,
    xUserId,
    okxUidHash: hashUid("4242424242"),
    expiresAt,
  });
  const signature = await account.signMessage({message});
  return store.issueProof({
    wallet: account.address,
    xUserId,
    okxUidHash: hashUid("4242424242"),
    signature,
    expiresAt,
    now,
  });
}

async function main() {
  const anvil = spawn(
    ANVIL,
    ["--fork-url", FORK_URL, "--port", String(FORK_PORT), "--chain-id", "196", "--silent"],
    {stdio: "ignore"}
  );
  let failed = false;
  try {
    log("fork", `starting anvil fork of ${FORK_URL} on port ${FORK_PORT} ...`);
    await waitForAnvil();
    log("fork", "anvil fork is up, chain 196");

    // 0. The fork's SiteRegistry must be the real one, at the implementation
    //    the TapeKit kernel pins (ERC-1967 slot, read directly).
    const implSlot = await rpc("eth_getStorageAt", [SITE_REGISTRY_ADDRESS, IMPL_SLOT, "latest"]);
    const impl = `0x${implSlot.slice(-40)}`.toLowerCase();
    if (impl !== PINNED_IMPL) {
      fail(`SiteRegistry implementation ${impl} does not match pinned ${PINNED_IMPL}`);
    }
    log("check", `SiteRegistry implementation matches TapeKit pin (${impl})`);

    // 1. READ path: a real DeWEB file that exists on X Layer mainnet.
    const real = await readAnchorFile({container: CONTAINER, path: REAL_PATH, rpcUrl: RPC_URL});
    if (real.size !== REAL_SIZE) fail(`real file size ${real.size}, expected ${REAL_SIZE}`);
    if (real.sha256.toLowerCase() !== REAL_SHA256) {
      fail(`real file sha ${real.sha256}, expected ${REAL_SHA256}`);
    }
    if (real.contentType !== REAL_CONTENT_TYPE) fail(`real file type ${real.contentType}`);
    if (real.chunkCount !== 1) fail(`real file chunkCount ${real.chunkCount}, expected 1`);
    const realJson = JSON.parse(new TextDecoder().decode(real.bytes));
    if (realJson.account !== "1.2.0.tape") fail(`real file account ${realJson.account}`);
    log(
      "read",
      `real mainnet file ${REAL_PATH}: ${real.size} bytes, sha256 verified, ` +
        `account=${realJson.account}`
    );

    // 2. WRITE path: impersonate the container owner on the fork.
    await rpc("anvil_impersonateAccount", [OWNER]);
    await rpc("anvil_setBalance", [OWNER, "0x8ac7230489e80000"]); // 10 OKB, fork only
    log("write", `impersonating container owner ${OWNER} (fork only)`);

    // 2a. Anchor a throwaway Human Proof with a single putFile.
    const now = Math.floor(Date.now() / 1000);
    const throwaway = privateKeyToAccount(generatePrivateKey());
    const proof = await makeThrowawayProof(now, throwaway);
    const anchor = buildAnchorFile(proof, {circuitId: "1.2.0", container: CONTAINER});
    const chunks = chunkFile(anchor.bytes);
    if (chunks.length !== 1) fail(`anchor file split into ${chunks.length} chunks, expected 1`);
    const put = buildPutFileCall({
      container: CONTAINER,
      path: anchor.path,
      contentType: anchor.contentType,
      sha256: anchor.sha256,
      firstChunk: chunks[0],
    });
    const putReceipt = await sendFromImpersonated(put);
    log("write", `putFile ${anchor.path} (${anchor.bytes.length} bytes) mined, tx ${putReceipt.hash}`);

    const back = await readAnchorFile({container: CONTAINER, path: anchor.path, rpcUrl: RPC_URL});
    if (Buffer.compare(Buffer.from(back.bytes), Buffer.from(anchor.bytes)) !== 0) {
      fail("read-back bytes differ from the anchored bytes");
    }
    if (back.sha256.toLowerCase() !== anchor.sha256.toLowerCase()) fail("read-back sha differs");
    const backJson = JSON.parse(new TextDecoder().decode(back.bytes));
    if (backJson.wallet !== proof.wallet.toLowerCase()) fail("read-back wallet differs");
    if (backJson.proofHash === undefined) fail("read-back proof is missing proofHash");
    log(
      "write",
      `read-back verified: ${back.size} bytes, sha256 ${back.sha256.slice(0, 18)}..., ` +
        `gas used ${putReceipt.gasUsed}`
    );

    // 2b. putFile replaces the whole file: anchor a newer proof for the
    //     same wallet (same path, different issuedAt) and read it back.
    const proof2 = await makeThrowawayProof(now + 60, throwaway);
    const anchor2 = buildAnchorFile(proof2, {circuitId: "1.2.0", container: CONTAINER});
    if (anchor2.path !== anchor.path) fail("second proof for the same wallet took a different path");
    const replace = buildPutFileCall({
      container: CONTAINER,
      path: anchor.path,
      contentType: anchor2.contentType,
      sha256: anchor2.sha256,
      firstChunk: chunkFile(anchor2.bytes)[0],
    });
    await sendFromImpersonated(replace);
    const replaced = await readAnchorFile({container: CONTAINER, path: anchor.path, rpcUrl: RPC_URL});
    if (Buffer.compare(Buffer.from(replaced.bytes), Buffer.from(anchor2.bytes)) !== 0) {
      fail("replace read-back bytes differ from the second anchor bytes");
    }
    log("write", `putFile replace verified: ${anchor.path} now holds the newer bytes`);

    // 2c. Multi-chunk write: a 24,001-byte file needs putFile + appendChunk.
    const bigBytes = Uint8Array.from({length: CHUNK_MAX_BYTES + 1}, (_, i) => (i * 11 + 1) % 256);
    const bigSha = `0x${createHash("sha256").update(bigBytes).digest("hex")}`;
    const bigChunks = chunkFile(bigBytes);
    if (bigChunks.length !== 2) fail(`24,001-byte file split into ${bigChunks.length} chunks`);
    const bigPath = "proofs/_fork-test-multichunk.bin";
    const bigPut = buildPutFileCall({
      container: CONTAINER,
      path: bigPath,
      contentType: "application/octet-stream",
      sha256: bigSha,
      firstChunk: bigChunks[0],
    });
    const bigPutReceipt = await sendFromImpersonated(bigPut);
    const append = buildAppendChunkCall({
      container: CONTAINER,
      path: bigPath,
      expectIndex: 1,
      chunk: bigChunks[1],
    });
    const appendReceipt = await sendFromImpersonated(append);
    const bigBack = await readAnchorFile({container: CONTAINER, path: bigPath, rpcUrl: RPC_URL});
    if (Buffer.compare(Buffer.from(bigBack.bytes), Buffer.from(bigBytes)) !== 0) {
      fail("multi-chunk read-back bytes differ");
    }
    if (bigBack.chunkCount !== 2) fail(`multi-chunk chunkCount ${bigBack.chunkCount}, expected 2`);
    log(
      "write",
      `multi-chunk write verified: ${bigBack.size} bytes in ${bigBack.chunkCount} chunks, ` +
        `putFile gas ${bigPutReceipt.gasUsed}, appendChunk gas ${appendReceipt.gasUsed}`
    );

    console.log("\nFork test PASSED: read path + write path verified against the real SiteRegistry.");
  } catch (error) {
    failed = true;
    console.error(`\nFork test FAILED: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    anvil.kill("SIGTERM");
  }
  process.exit(failed ? 1 : 0);
}

main();
