# TapeOut Proof Anchoring

How each Human Proof is anchored on X Layer through TapeOut, so anyone can
audit a mint without trusting the Xaverus server. Part of the Build X Series
integration (ADR-0002, shape A). The policy circuit (shape B) is ticket 05
and is not covered here.

**Status (19 Nov 2026):** the anchoring code is proven on a local mainnet
fork against the real deployed SiteRegistry (read of a real on-chain file
plus a live write by an impersonated container owner). **No mainnet
anchoring has happened yet.** The real mainnet steps are §5 below; they
need a human with the holder wallet and real OKB.

## 1. What anchoring is

For every Human Proof, one JSON file of hashes is written into the policy
circuit's container through the TapeOut `SiteRegistry` contract on X Layer:

```
proofs/<wallet-lowercase>.json
```

Example path: `proofs/0x12c1eee7722f5cfa616417a8a910182a80bfde08.json`.

SiteRegistry records each file's size, content type, and SHA-256 on-chain.
Anyone can read the file back and check the bytes against that hash with
the reader in `lib/tapeout-anchor.ts`, with `cast`, or with the TapeKit
kernel. If the server ever rewrote history, the on-chain hash would expose
it: the file bytes either match the hash or they do not.

Anchoring is transparency, not proof of humanness. The anchored file shows
that a wallet presented an X Binding and a signed OKX UID Claim at mint
time; it does not prove the person behind the wallet is real. The OKX UID
remains a user-signed claim, never an OKX verification (ADR-0001).

## 2. The anchor file

```json
{
  "version": 2,
  "wallet": "0x12c1eee7722f5cfa616417a8a910182a80bfde08",
  "xUserId": "4242424242",
  "xHandleHash": "beb2408bdc63e2d550d683ef97fa15abd36f4948b43061bd6e8328ce9fd66541",
  "okxUidHash": "74616867d5258a4d75f6d32d360667e5fe9dd79713e3a95aee278b433d79b08e",
  "proofHash": "0x...",
  "issuedAt": 1794892800,
  "circuitId": "1.2.0",
  "container": "0xe2e5ffd861c8a0b50ce21a7bcbdd6bb5aac250ab"
}
```

Format version 2 removed the `signature` field: the signature stays
server-side with the proof, and the public file holds hashes only
(ticket 06). The file is public on-chain forever, so nothing raw goes in
it beyond the one deliberate exception below. No version 1 file was ever
anchored on-chain (no container is configured yet), so nothing needs
migrating.

| Field | Meaning |
| --- | --- |
| `version` | Anchor file format version (currently `2`). |
| `wallet` | Minting wallet, lowercase. Also the file name. |
| `xUserId` | Numeric X user id, in plain text (see the privacy note below). |
| `xHandleHash` | SHA-256 of the lowercased X handle. Never the handle itself. |
| `okxUidHash` | SHA-256 of the OKX UID. Never the UID itself. |
| `proofHash` | `keccak256` of the exact binding message the wallet signed (`proofHash()` in `lib/human-proof.ts`). Commits to wallet, X user id, UID hash, and expiry. |
| `issuedAt` | Unix seconds when the proof was issued. |
| `circuitId` | Optional. The policy circuit, e.g. `"1.2.0"` (processor 0, #1 on X Layer). |
| `container` | Optional. The container address the file is anchored in, lowercase. |

### Privacy note: why the X user id is plain text but the handle and UID are hashes

The file is public on-chain forever, so it holds hashes only, with one
deliberate exception: the numeric X user id.

- **X user id (plain text):** a numeric public identifier, not a secret.
  It is needed to audit the binding: a checker uses it to confirm that the
  proof's `proofHash` covers the same X account, and to
  confirm one X account maps to at most one wallet. Hashing it would make
  that audit impossible without knowing the id in advance.
- **X handle (hash only):** the handle is the human-readable identity. A
  hash still lets its owner prove "this proof is mine" (hash your handle,
  compare), without publishing the handle to every chain reader.
- **OKX UID (hash only):** the UID is exchange-account data. Same reasoning
  as the handle: provable by its owner, not published.
- **Wallet signature (not in the file):** the signature stays server-side
  with the proof. It is not needed to audit the binding: `proofHash`
  already commits to the exact message the wallet signed. The file is
  public on-chain forever, so ticket 06 keeps it hashes only.

The unit tests assert the raw handle, the raw UID, and the raw signature
appear nowhere in the anchored bytes.

## 3. How it is built and read

Code: `lib/tapeout-anchor.ts`. Tests: `lib/tapeout-anchor.test.ts`
(21 tests, `node --test lib/tapeout-anchor.test.ts`).

| Function | What it does |
| --- | --- |
| `buildAnchorFile(proof, {circuitId?, container?})` | Builds the JSON bytes, the `proofs/<wallet>.json` path, and the SHA-256. Rejects an invalid proof. |
| `chunkFile(bytes)` | Splits bytes into 24,000-byte chunks (the SiteRegistry limit). Refuses files over 350 chunks (8,400,000 bytes). |
| `buildPutFileCall({container, path, contentType, sha256, firstChunk})` | Encodes `putFile(...)` calldata to SiteRegistry. Writes the first chunk; replaces the whole file if it exists. |
| `buildAppendChunkCall({container, path, expectIndex, chunk})` | Encodes `appendChunk(...)` calldata. `expectIndex` must equal the current chunk count, which prevents duplicate appends. |
| `readAnchorFile({container, path, rpcUrl, transport?})` | Reads the file back and verifies it (see below). Read-only: no wallet, no gas. |

Constants: `SITE_REGISTRY_ADDRESS`
`0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6` (X Layer proxy),
`CHUNK_MAX_BYTES` 24,000, `MAX_CHUNKS` 350, `MAX_FILE_BYTES` 8,400,000,
`READ_RANGE_BYTES` 96 KB.

### Conformance sources

Function signatures, chunk limits, and the read/verify rules follow the
TapeOut `tape://` spec v0.2, Appendix B.5 (TapeKit `SPEC.md`), and the
TapeKit kernel (`kernel/src/kernel.js`, `kernel/src/config.js`):

- `fileInfo(address,string)` returns
  `(uint32 size, string contentType, bytes32 sha256Hash, uint40 updatedAt, uint256 chunkCount)`;
  `chunkCount == 0` means the file does not exist.
- Files up to 96 KB are read in one `read(address,string)` call; larger
  files use `readRange` in 96 KB segments.
- After reading, both must hold: length equals the declared size, and the
  SHA-256 of the bytes equals the on-chain hash. The reader throws on any
  mismatch, on a missing file, and on an all-zero (undeclared) hash: an
  anchor file without a verifiable hash is worthless as evidence.
- Selectors cross-checked two ways: TapeKit `kernel/src/selectors.js`
  (fileInfo `0x6c609107`, read `0xccaa7afb`, readRange `0x15a4cae2`) and
  `cast sig` for the writes (putFile `0xfab2ed82`, appendChunk
  `0xe2b51347`).

### SiteRegistry write rules (from the spec)

- Only the container's editor may write: the circuit NFT holder, or an
  operator authorized with `setOperator(container, op, ttl)`.
- `putFile` replaces the whole file if the path already exists, so
  re-anchoring a proof overwrites the old bytes; the on-chain hash updates
  with it.
- While a circuit is listed on the market, its owner cannot change the
  site (listing freeze). Unlist before anchoring if the circuit is listed.

## 4. What is proven (fork test, 19 Nov 2026)

`scripts/tapeout-anchor-fork-test.mjs` runs an anvil fork of X Layer
mainnet and proves the code against the real deployed SiteRegistry. Run it
with `node scripts/tapeout-anchor-fork-test.mjs`. It passed on 19 Nov 2026:

- **SiteRegistry identity:** the fork's SiteRegistry implementation slot
  reads `0xa85c4143d1d4a77f54b8e4ecc9e6d1418afea45f`, exactly the
  implementation the TapeKit kernel pins for X Layer.
- **Read path (real on-chain data):** read `.well-known/taperelay.json`
  from circuit 1.2.0's container
  (`0xE2E5FfD861C8a0b50Ce21A7bcbDD6Bb5aaC250aB`), a file that really exists
  on X Layer mainnet: 584 bytes, `application/json`, SHA-256
  `0x92207607e45e77182bece1622cf1a455574d93ed97cc480766861ed8873aa4a9`,
  verified byte for byte. Its JSON names account `1.2.0.tape`.
- **Write path (live, fork only):** impersonated the container owner
  (`0x571d447f4f24688eC35Ccf07f1D6993655F6aF15`), anchored a throwaway
  Human Proof with `putFile` (578 bytes, gas used 460,042), read it back
  and verified bytes and hash; re-anchored the same path with newer bytes
  and verified `putFile` replace semantics; wrote a 24,001-byte file with
  `putFile` + `appendChunk` (gas 5,513,249 + 164,719) and verified the
  2-chunk read-back.

Nothing in the fork test touches mainnet: the fork is discarded when anvil
stops, and the impersonation only ever existed inside the fork.

### Measured gas (fork, 19 Nov 2026; X Layer gas price then 0.02 gwei)

| Operation | Gas used | Cost at 0.02 gwei |
| --- | --- | --- |
| `putFile`, 578-byte anchor file | 460,042 | ~0.0000092 OKB |
| `putFile`, 24,000-byte first chunk | 5,513,249 | ~0.00011 OKB |
| `appendChunk`, 1-byte second chunk | 164,719 | ~0.0000033 OKB |

A proof anchor file is a few hundred bytes, so one anchor costs roughly
0.00001 OKB at current gas prices: about 460k gas, most of it the fixed
cost of deploying the chunk contract. Gas price moves; re-check with
`cast gas-price --rpc-url https://rpc.xlayer.tech` before budgeting.

## 5. Human steps for the real mainnet anchoring

Do this only when the policy circuit exists (ticket 05) and the user has
approved spending real OKB. Work from the repo root on a machine with
Foundry (`cast`) and Node 24 installed. Placeholders in `<angle brackets>`
must be filled in from ticket 05's outputs.

### Prerequisites

- [ ] The policy circuit is taped out on X Layer: you have its Circuit ID
      (e.g. `1.2.0`), its processor contract, and its container address.
- [ ] The container is **opened**. Check with:
      `cast call 0x536adD8F30f03b69f6fbF29d425A816A0dC50106 "isOpened(address,uint256)(bool)" <processor-contract> <token-id> --rpc-url https://rpc.xlayer.tech`
      If it returns `false`, open it first (HashPort console, or the
      container opener contract). Opening cost ~0.08 OKB (Sept 2026 figure;
      re-check at the time).
- [ ] The holder wallet (the one that owns the circuit NFT) holds OKB for
      gas. Budget: keep at least **0.5 OKB** in it; one anchor costs
      ~0.00001 OKB, so this covers hundreds of anchors plus headroom.
- [ ] The circuit is **not listed** on any market (listing freeze blocks
      writes).
- [ ] A Human Proof exists for the wallet being anchored (the mint flow
      produces it; the proof JSON has `wallet`, `xUserId`, `xHandleHash`,
      `okxUidHash`, `signature`, `issuedAt`, `expiresAt`).

### Step 1: Find the container address (if you only have the Circuit ID)

```bash
# Processor contract for processor number <N> (0 for the first processor):
cast call 0x1f09DAeFA827f02CBb40967cc91b259763760761 \
  "cpuAt(uint256)(address)" <N> --rpc-url https://rpc.xlayer.tech

# Container for circuit #<ID> on that processor:
cast call 0x536adD8F30f03b69f6fbF29d425A816A0dC50106 \
  "accountOf(address,uint256)(address)" <processor-contract> <ID> \
  --rpc-url https://rpc.xlayer.tech
```

Confirm the container is opened (see the prerequisites check) and that the
holder wallet owns the circuit:

```bash
cast call <processor-contract> "ownerOf(uint256)(address)" <ID> \
  --rpc-url https://rpc.xlayer.tech
```

### Step 2 (optional but recommended): authorize an operator

So the mint server can anchor proofs without holding the NFT holder key,
authorize the server wallet as an operator (TTL in seconds; 0 means no
expiry in the reference flow, but prefer a bounded TTL and renew it):

```bash
cast send 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 \
  "setOperator(address,address,uint256)" <container> <server-wallet> <ttl-seconds> \
  --rpc-url https://rpc.xlayer.tech --private-key <holder-key>
```

If you skip this, every anchor must be sent from the holder wallet itself.
Never paste the holder key into a shared chat; prefer a hardware wallet or
`cast send --ledger` / `--account` where available.

### Step 3: Build the anchor file and calldata

Save the proof JSON the mint flow produced as `/tmp/proof.json`, then run
this from the repo root (it uses the repo's own library, so the format and
the hash cannot be mistyped):

```bash
cat > /tmp/anchor-proof.mjs <<'EOF'
import {readFileSync, writeFileSync} from "node:fs";
import {buildAnchorFile, buildAppendChunkCall, buildPutFileCall, chunkFile} from "./lib/tapeout-anchor.ts";
const proof = JSON.parse(readFileSync("/tmp/proof.json", "utf8"));
const container = process.argv[2];
const circuitId = process.argv[3];
const anchor = buildAnchorFile(proof, {circuitId, container});
writeFileSync("/tmp/anchor.json", anchor.bytes);
const chunks = chunkFile(anchor.bytes);
const calls = [buildPutFileCall({container, path: anchor.path, contentType: anchor.contentType, sha256: anchor.sha256, firstChunk: chunks[0]})];
chunks.slice(1).forEach((chunk, i) => calls.push(buildAppendChunkCall({container, path: anchor.path, expectIndex: i + 1, chunk})));
console.log(JSON.stringify({path: anchor.path, bytes: anchor.bytes.length, sha256: anchor.sha256, calls}, null, 2));
EOF
node /tmp/anchor-proof.mjs <container> <circuit-id>
```

Check the output before sending anything: the `path` must be
`proofs/<wallet>.json`, and `/tmp/anchor.json` must contain hashes only
(open it and confirm no raw X handle or OKX UID is in it).

### Step 4: Send the write(s)

Send the calls **in order** (putFile first, then each appendChunk), from
the holder wallet or the authorized operator wallet. Proof anchors are a
few hundred bytes, so there is normally exactly one call:

```bash
cast send 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 <calldata-from-step-3> \
  --rpc-url https://rpc.xlayer.tech --private-key <sender-key>
```

`cast send` with raw calldata (no function signature) sends the data as-is.
Wait for the transaction to be mined, then send the next chunk's call, if
any. Record each transaction hash: it is the submission evidence for the
Build X Series form.

### Step 5: Verify the anchor on mainnet

```bash
# fileInfo must show the size and the SHA-256 from Step 3:
cast call 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 \
  "fileInfo(address,string)(uint32,string,bytes32,uint40,uint256)" \
  <container> "proofs/<wallet>.json" --rpc-url https://rpc.xlayer.tech

# Or verify end to end with the reader (hash-checked):
node --input-type=module -e "
import {readAnchorFile} from './lib/tapeout-anchor.ts';
const f = await readAnchorFile({container: '<container>', path: 'proofs/<wallet>.json>', rpcUrl: 'https://rpc.xlayer.tech'});
console.log('verified', f.size, 'bytes, sha256', f.sha256);
console.log(new TextDecoder().decode(f.bytes));
"
```

The reader throws if the bytes do not match the on-chain hash, so a clean
run is the verification. Cross-check with the TapeKit kernel if you want a
second opinion:
`kernel.resolve('<circuit-id>.tape')` then `site.get('proofs/<wallet>.json')`.

### Step 6: Record the evidence

For the Build X Series submission, keep:

- Circuit ID and processor contract address (ticket 05).
- Container address.
- Each anchor transaction hash (Step 4) and the `proofs/<wallet>.json`
  path + SHA-256 (Step 3 output).
- The fork-test log from §4 as the pre-mainnet evidence.

## 6. What is NOT verified yet

- **No mainnet anchor exists.** Everything above the fork test is a plan
  until Step 4 runs on mainnet with the real policy circuit's container.
- **The policy circuit does not exist yet** (ticket 05, in progress in
  parallel). Its Circuit ID, processor, and container are still TBD, so
  the `<placeholders>` in §5 cannot be filled in yet.
- **Costs are estimates.** Container opening (0.08 OKB) and tape-out costs
  come from Sept–Oct 2026 sources (see `docs/TAPEOUT_RESEARCH.md` §4);
  gas costs in §4 were measured on the fork at 0.02 gwei and move with the
  gas price.
- **Trust notes from the research:** SiteRegistry is an upgradeable proxy
  whose admin (per an independent read-only check on BNB Chain, 14 Nov
  2026) is a single-key wallet, not a multisig, and TapeKit has no
  independent audit. Anchoring proves the bytes match the on-chain hash;
  it does not prove the registry can never change. See
  `docs/TAPEOUT_RESEARCH.md` §1.
