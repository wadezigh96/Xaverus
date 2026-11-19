# TapeOut Integration

How Xaverus uses TapeOut on X Layer, for the OKX X Layer Build X Series
("X Layer TapeOut Accelerate"). Two real uses, per ADR-0002:

- **(A) Proof anchoring** — each Human Proof is anchored as a JSON file of
  hashes in the policy circuit's container through SiteRegistry, so anyone
  can read and verify the proof bytes against their on-chain SHA-256.
- **(B) Policy circuit** — one small NAND circuit enforcing the mint rule
  is evaluated read-only through `eval()` as part of the mint decision.

Background research: `docs/TAPEOUT_RESEARCH.md`. The circuit in depth:
`docs/TAPEOUT_POLICY_CIRCUIT.md`. Anchoring in depth (including the
mainnet steps): `docs/TAPEOUT_ANCHORING.md`.

**Status (19 Nov 2026):** the code is written, tested locally, and the
`eval()` transport is verified live against other circuits on X Layer
mainnet. **Our own circuit is not taped out yet, and no proof has been
anchored on mainnet.** There is no Circuit ID, processor address, or
container for Xaverus yet. Tape-out and the first mainnet anchor are human
steps that need real OKB — see [What is NOT done yet](#what-is-not-done-yet)
below.

## The policy circuit

One small NAND circuit answers a single question from three flag bits:

```text
allow = xVerified AND uidClaimed AND NOT revoked
```

- `xVerified` — the minting wallet completed X OAuth and signed the
  binding.
- `uidClaimed` — the minting wallet signed its OKX UID claim.
- `revoked` — the Human Proof has been revoked. Always 0 in v1; revoking
  a Human Proof after minting is out of scope.

### What the circuit does, and what it does not do

**It does:** enforce the mint rule openly. The rule is public Verilog,
anyone can read it, simulate it, and run the taped-out circuit themselves
through `eval()`.

**It does NOT verify identity.** A NAND circuit has no network access and
no oracle; it cannot call the X or OKX APIs, check an OAuth token, or
confirm an OKX UID. Identity verification happens off-chain in the
Xaverus backend, before the flag bits are handed to the circuit. The
circuit only computes boolean logic from bits it is given, and it never
sees raw personal data — only hashes and boolean flags. Nothing in the
submission may claim otherwise (ADR-0002).

The OKX UID is likewise never verified by OKX anywhere in this flow: it
is the user's own signed claim (ADR-0001). The circuit sees only a flag
bit saying "a claim was signed", never the UID itself.

### Files and the netlist

| File | What it is |
| --- | --- |
| `circuits/policy-circuit.v` | The circuit in Verilog (source of truth) |
| `circuits/policy-circuit.netlist.json` | The NAND-only netlist derived from it |
| `lib/tapeout-circuit.ts` | Simulator, bit packing, `eval()` reader, proof mapping |
| `lib/tapeout-circuit.test.ts` | Tests, including the exhaustive equivalence check |
| `scripts/tapeout-eval-probe.mjs` | Read-only probe of live mainnet circuits |

Verilog (`circuits/policy-circuit.v`):

```verilog
module policy_circuit (
    input  wire x_verified,
    input  wire uid_claimed,
    input  wire revoked,
    output wire allow
);
    assign allow = x_verified & uid_claimed & ~revoked;
endmodule
```

The netlist was derived with Yosys 0.33 (`abc -g NAND` plus a mapping
step that turns each `$_NOT_` cell into a NAND with both inputs tied).
Result: **5 gates, strictly NAND-only**. The netlist is verified by
exhaustive local simulation: all 2^3 = 8 input combinations are checked
against the spec formula, and the only allowing combination is
`x=1, u=1, r=0` (test `exhaustive simulation matches allow = x AND u AND
NOT r`).

Bit packing for `eval()`: one input byte, bit 0 = `xVerified`, bit 1 =
`uidClaimed`, bit 2 = `revoked`, bits 3–7 always 0. A fully verified,
unrevoked mint packs to `0x03`; no proof at all packs to `0x00`. The
output's bit 0 is the allow bit; empty output is an error, never a
denial.

## The `eval()` reader and the mint decision

`evalPolicyCircuit()` in `lib/tapeout-circuit.ts` calls
`eval(uint256, bytes)(bytes)` read-only through a viem public client
(X Layer chain, default RPC `https://rpc.xlayer.tech`, 30 s timeout).
It validates the processor address, checks code exists at the processor,
and decodes the allow bit from the returned bytes. Every failure mode
throws a clear error — a failure is never reported as `false`, because a
denial would look like a policy decision when it is really an outage.
The reader never signs anything and never sends a transaction.

The mint decision uses it through `checkPolicyCircuit()` in
`lib/mint-tapeout.ts`, wired into `POST /api/mint/passport`:

| Configuration | Behaviour |
| --- | --- |
| Circuit configured (`XAVERUS_TAPEOUT_PROCESSOR` + `XAVERUS_TAPEOUT_CIRCUIT_ID`) | The proof is mapped to circuit inputs (`proofToCircuitInput`), `eval()` runs read-only, and the result is recorded in the mint response (`tapeout: {configured: true, circuitId, processor, allowed, evaluatedAt}`). A circuit denial is a `403` ("The TapeOut policy circuit denied this mint."). An `eval()` failure is a `503`, never a denial. |
| Circuit not configured (neither variable set) | The check is skipped openly — the mint response carries `tapeout: {configured: false}`. This is the current state: our circuit is not taped out yet. |
| Half-configured (only one variable set) | Server misconfiguration: the mint route answers `500` naming the problem. |

Calling `eval()` from inside a contract is **not** done: no canonical ABI
for contract-to-contract `eval()` is confirmed (no official example
exists), so the backend calls it read-only and records the result, per
ADR-0002.

### Live verification of the transport (19 Nov 2026)

`scripts/tapeout-eval-probe.mjs` (read-only, no wallet, no transaction)
ran against X Layer mainnet. Processor addresses were resolved on-chain
from the TapeOut factory (`0x1f09DAeFA827f02CBb40967cc91b259763760761`)
via `cpuAt(i)`:

| Circuit | `eval()` call | Result |
| --- | --- | --- |
| 1.2.245 (processor #245) | `eval(1, 0xff7f)` | `0x02` |
| 1.2.245 | `eval(1, 0x00)` | `0x00` |
| 3.2.268 XBOT (processor #268) | `eval(3, 0xff7f)` | `0x01` |
| 3.2.268 XBOT | `eval(3, 0x00)` | `0x00` |
| 3.2.245 | `eval(3, 0xff7f)` | `0x00000000` |
| 279.732 BNB (control) | `eval(279, 0xff7f)` | `0x02` |

Circuits 1.2.245 and 3.2.268 return different outputs for different
inputs — real circuit behaviour, not a constant stub — and the BNB
control reproduces the documented 21 NAND example. Conclusion: the
`eval()` transport works on live X Layer mainnet circuits. These are
other people's circuits, so no bit is decoded as an allow/deny decision;
the probe proves the transport, and the policy decoding is proven
separately against a local stub RPC. Full results in
`docs/TAPEOUT_POLICY_CIRCUIT.md`.

## Proof anchoring

For every Human Proof, one JSON file of hashes is written into the policy
circuit's container through the TapeOut `SiteRegistry` contract on
X Layer:

```text
proofs/<wallet-lowercase>.json
```

SiteRegistry records each file's size, content type, and SHA-256
on-chain. Anyone can read the file back and check the bytes against that
hash — with the reader in `lib/tapeout-anchor.ts`, with `cast`, with the
TapeKit kernel, or through `GET /api/mint/anchor?wallet=0x...`. If the
server ever rewrote history, the on-chain hash would expose it.

The anchor file holds hashes only, with one deliberate exception: the
numeric X user id is plain text (a public identifier, needed to audit
that one X account maps to at most one wallet). The X handle and the OKX
UID are SHA-256 hashes; the unit tests assert the raw values appear
nowhere in the anchored bytes. Anchoring is transparency, not proof of
humanness.

### The anchor script

`scripts/anchor-proof.mjs` anchors a proof from the file-backed proof
store. **Dry-run by default**: it prints the anchor file and the
SiteRegistry calls without sending anything.

```bash
# Dry-run (default): prints the file and the calls, sends nothing.
XAVERUS_PROOF_STORE_PATH=/path/to/proofs.json node scripts/anchor-proof.mjs \
  --wallet 0x... --container 0x... [--circuit-id 1.2.0]

# Actually send (spends OKB on X Layer mainnet):
XAVERUS_PROOF_STORE_PATH=/path/to/proofs.json \
XAVERUS_ANCHOR_PRIVATE_KEY=0x... node scripts/anchor-proof.mjs \
  --wallet 0x... --container 0x... --circuit-id 1.2.0 --send
```

`--send` requires `XAVERUS_ANCHOR_PRIVATE_KEY`, the container editor's
key (the circuit NFT holder, or an operator authorized with
`setOperator`). **Never commit the key, never paste it in chat.**
`XAVERUS_PROOF_STORE_PATH` must be set: the server must use the
file-backed proof store for anchoring.

### What is proven (fork test, 19 Nov 2026)

`scripts/tapeout-anchor-fork-test.mjs` runs an anvil fork of X Layer
mainnet against the real deployed SiteRegistry (`node
scripts/tapeout-anchor-fork-test.mjs`). It passed on 19 Nov 2026:

- Read a real on-chain file (`.well-known/taperelay.json` from circuit
  1.2.0's container): 584 bytes, SHA-256 verified byte for byte.
- Anchored a throwaway Human Proof with `putFile` by impersonating the
  container owner (fork only), read it back and verified bytes and hash;
  re-anchored the same path and verified `putFile` replace semantics;
  wrote a 24,001-byte file with `putFile` + `appendChunk` and verified
  the 2-chunk read-back.
- Measured gas: one 578-byte anchor file cost 460,042 gas (~0.00001 OKB
  at the 0.02 gwei gas price then). Nothing in the fork test touches
  mainnet.

## What is NOT done yet

All of the following are human steps that need real OKB on X Layer
mainnet and the user's approval. Nothing here has been started.

### 1. Tape out our own policy circuit

The netlist (`circuits/policy-circuit.netlist.json`, 5 gates) is ready to
tape out. Steps: pick a processor on X Layer (e.g. via tapeout.net),
buy transistors equal to the gate count, tape out the netlist in one
transaction. This produces the **Circuit ID** and the processor contract
address the submission form requires, plus the circuit's container.
Cost guidance from the research (Sept–Oct 2026 figures, re-check at the
time): tape-out of a 3,829-gate circuit cost ~0.0023 OKB net; a 5-gate
circuit should be far cheaper. There is no TapeOut testnet — this runs on
mainnet.

After tape-out, set:

```bash
XAVERUS_TAPEOUT_PROCESSOR=<processor contract>
XAVERUS_TAPEOUT_CIRCUIT_ID=<numeric circuit id on that processor>
```

Then verify the circuit live with the probe pattern:

```bash
cast call <processor-contract> "eval(uint256,bytes)(bytes)" <circuit-id> 0x03 \
  --rpc-url https://rpc.xlayer.tech
# expect the allow bit set (0x01) for a fully verified, unrevoked mint
```

### 2. Open the container and anchor the first proof

The container must be **opened** before files can be written. Check with
(from `docs/TAPEOUT_ANCHORING.md` §5):

```bash
cast call 0x536adD8F30f03b69f6fbF29d425A816A0dC50106 \
  "isOpened(address,uint256)(bool)" <processor-contract> <token-id> \
  --rpc-url https://rpc.xlayer.tech
```

If it returns `false`, open it first (HashPort console, or the container
opener contract). Opening cost ~0.08 OKB (Sept 2026 figure; re-check at
the time). Find the container address with:

```bash
cast call 0x536adD8F30f03b69f6fbF29d425A816A0dC50106 \
  "accountOf(address,uint256)(address)" <processor-contract> <ID> \
  --rpc-url https://rpc.xlayer.tech
```

Then set `XAVERUS_TAPEOUT_CONTAINER=<container>` and anchor the first
real proof with `scripts/anchor-proof.mjs --send` (see above), after a
dry-run. Optionally authorize the server wallet as an operator first so
the mint server can anchor without holding the NFT holder key:

```bash
cast send 0xd6EFb7adCc9c83dC4924Ad56f6a8E4e969b9ADB6 \
  "setOperator(address,address,uint256)" <container> <server-wallet> <ttl-seconds> \
  --rpc-url https://rpc.xlayer.tech --private-key <holder-key>
```

Verify the anchor with `GET /api/mint/anchor?wallet=0x...` or with
`fileInfo` via `cast` (full commands in `docs/TAPEOUT_ANCHORING.md` §5).
Record the transaction hash: it is submission evidence.

Budget: keep at least **0.5 OKB** in the holder wallet; one anchor costs
~0.00001 OKB, so this covers hundreds of anchors plus headroom. The
circuit must not be listed on any market while anchoring (listing freeze
blocks writes).

### 3. Deploy the registry and factory contracts

The registry (`XaverusHumanProofRegistry`) and factory
(`XaverusPassportFactory`) are built and tested locally only. Deploying
them to X Layer mainnet needs the user's key and approval, plus a writer
wallet for the registry. After deployment, set
`XAVERUS_PASSPORT_FACTORY=<factory address>` so `/api/mint/passport`
returns real mint calldata instead of `transaction: null`.

### Trust notes

From the research (`docs/TAPEOUT_RESEARCH.md` §1): SiteRegistry is an
upgradeable proxy whose admin (per an independent read-only check on BNB
Chain, 14 Nov 2026) is a single-key wallet, not a multisig, and TapeKit
has no independent audit. Anchoring proves the bytes match the on-chain
hash; it does not prove the registry can never change. The submission
must not overclaim.

## Environment variables

| Variable | Purpose |
| --- | --- |
| `XAVERUS_TAPEOUT_PROCESSOR` | Processor contract address for the policy circuit |
| `XAVERUS_TAPEOUT_CIRCUIT_ID` | Numeric circuit id on that processor |
| `XAVERUS_TAPEOUT_CONTAINER` | Container address holding the anchor files |
| `XAVERUS_TAPEOUT_RPC_URL` | RPC for TapeOut reads (default `https://rpc.xlayer.tech`) |
| `XAVERUS_ANCHOR_PRIVATE_KEY` | **Secret.** Container editor key for `scripts/anchor-proof.mjs --send` only |

## Tests

```bash
node --test lib/tapeout-circuit.test.ts   # 19 tests: simulator, bit packing, eval reader, proof mapping
node --test lib/tapeout-anchor.test.ts    # 21 tests: file building, chunking, calldata, reader
node --test lib/mint-tapeout.test.ts      # 8 tests: config parsing, mint-decision wiring
node scripts/tapeout-anchor-fork-test.mjs # anvil fork test against the real SiteRegistry
node scripts/tapeout-eval-probe.mjs       # read-only live probe (needs internet, no wallet)
```
