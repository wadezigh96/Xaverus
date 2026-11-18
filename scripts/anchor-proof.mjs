/**
 * Anchor a Human Proof into a TapeOut container (operator script).
 *
 * Dry-run by default: prints the anchor file and the SiteRegistry calls
 * without sending anything.
 *
 *   XAVERUS_PROOF_STORE_PATH=/path/to/proofs.json node scripts/anchor-proof.mjs \
 *     --wallet 0x... --container 0x... [--circuit-id 1.2.0]
 *
 * To actually send (spends OKB on X Layer mainnet), add --send and set
 * XAVERUS_ANCHOR_PRIVATE_KEY to the container editor's key. Never commit
 * the key, never paste it in chat. See docs/TAPEOUT_ANCHORING.md.
 */
import {createWalletClient, http} from "viem";
import {privateKeyToAccount} from "viem/accounts";
import {xLayer} from "viem/chains";
import {createFileProofStore} from "../lib/human-proof-file-store.ts";
import {
  buildAnchorFile,
  buildAppendChunkCall,
  buildPutFileCall,
  chunkFile,
} from "../lib/tapeout-anchor.ts";

function arg(name) {
  const i = process.argv.indexOf(name);
  return i >= 0 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const wallet = arg("--wallet");
const container = arg("--container");
const circuitId = arg("--circuit-id");
const send = process.argv.includes("--send");
const storePath = process.env.XAVERUS_PROOF_STORE_PATH?.trim();
const rpcUrl = process.env.XAVERUS_TAPEOUT_RPC_URL?.trim() || "https://rpc.xlayer.tech";

if (!wallet || !container) {
  console.error("Usage: node scripts/anchor-proof.mjs --wallet 0x... --container 0x... [--circuit-id 1.2.0] [--send]");
  process.exit(1);
}
if (!storePath) {
  console.error("XAVERUS_PROOF_STORE_PATH is not set. The server must use the file-backed proof store for anchoring.");
  process.exit(1);
}

const store = createFileProofStore(storePath);
const proof = store.getProof(wallet);
if (!proof) {
  console.error(`No Human Proof for wallet ${wallet} in ${storePath}.`);
  process.exit(1);
}

const file = buildAnchorFile(proof, {circuitId, container});
const chunks = chunkFile(file.bytes);
console.log(`Anchor file: ${file.path}`);
console.log(`Size: ${file.bytes.length} bytes in ${chunks.length} chunk(s), sha256 ${file.sha256}`);

const calls = [];
if (chunks.length === 0) {
  console.error("Anchor file is empty; nothing to write.");
  process.exit(1);
}
calls.push(buildPutFileCall({container, path: file.path, contentType: file.contentType, sha256: file.sha256, firstChunk: chunks[0]}));
for (let i = 1; i < chunks.length; i++) {
  calls.push(buildAppendChunkCall({container, path: file.path, expectIndex: i, chunk: chunks[i]}));
}
for (const [i, call] of calls.entries()) {
  console.log(`Call ${i + 1}: to ${call.to} data ${call.data.slice(0, 66)}... (${call.data.length} chars)`);
}

if (!send) {
  console.log("\nDry-run: nothing sent. Add --send (with XAVERUS_ANCHOR_PRIVATE_KEY set) to broadcast.");
  process.exit(0);
}

const key = process.env.XAVERUS_ANCHOR_PRIVATE_KEY?.trim();
if (!key) {
  console.error("--send requires XAVERUS_ANCHOR_PRIVATE_KEY (container editor key). Refusing to send.");
  process.exit(1);
}
const account = privateKeyToAccount(key.startsWith("0x") ? key : `0x${key}`);
const client = createWalletClient({account, chain: xLayer, transport: http(rpcUrl)});
console.log(`Sending from ${account.address} ...`);
for (const [i, call] of calls.entries()) {
  const hash = await client.sendTransaction({to: call.to, data: call.data, value: call.value, chain: xLayer});
  console.log(`Call ${i + 1} sent: ${hash}`);
}
console.log("Anchored. Verify with: GET /api/mint/anchor?wallet=" + wallet);
