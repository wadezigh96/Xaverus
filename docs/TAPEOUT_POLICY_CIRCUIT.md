# TapeOut policy circuit

One small NAND circuit plus the backend reader that evaluates it read-only.
Part B of the TapeOut integration (ADR-0002); the proof anchoring in the
circuit's container is part A, covered by the anchoring work, not this file.

## What the circuit does, and what it does not do

The circuit answers a single question from three flag bits:

```
allow = xVerified AND uidClaimed AND NOT revoked
```

- `xVerified` — the minting wallet completed X OAuth and signed the binding.
- `uidClaimed` — the minting wallet signed its OKX UID claim.
- `revoked` — the Human Proof has been revoked. Always 0 in v1; revoking a
  Human Proof after minting is out of scope (SPEC.md).

**What it does:** it enforces the mint rule openly. The rule is public
Verilog, anyone can read it, simulate it, and run the taped-out circuit
themselves through `eval()`.

**What it does NOT do:** it does not verify identity. A NAND circuit has no
network access and no oracle; it cannot call the X or OKX APIs, check an
OAuth token, or confirm an OKX UID. Identity verification happens off-chain
in the Xaverus backend, before the flag bits are handed to the circuit. The
circuit only computes boolean logic from bits it is given. Nothing in the
submission may claim otherwise (ADR-0002, TAPEOUT_RESEARCH.md §6).

The OKX UID is likewise never verified by OKX anywhere in this flow: it is
the user's own signed claim (ADR-0001). The circuit sees only a flag bit
saying "a claim was signed", never the UID itself.

## Files

| File | What it is |
| --- | --- |
| `circuits/policy-circuit.v` | The circuit in Verilog (source of truth) |
| `circuits/policy-circuit.netlist.json` | The NAND-only netlist derived from it (see below) |
| `lib/tapeout-circuit.ts` | Simulator, bit packing, `eval()` reader, proof mapping |
| `lib/tapeout-circuit.test.ts` | Tests (node:test) |
| `scripts/tapeout-eval-probe.mjs` | Read-only probe of live mainnet circuits |
| `docs/TAPEOUT_POLICY_CIRCUIT.md` | This note |

## Verilog

`circuits/policy-circuit.v`, three inputs, one output:

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

## Deriving the netlist (Yosys)

Yosys was available: it installed cleanly with `apt-get update && apt-get
install -y yosys` (Yosys 0.33). No hand derivation was needed, so the
hand-derived fallback was not used.

Synthesis command:

```
yosys -p "read_verilog circuits/policy-circuit.v; hierarchy -top policy_circuit; \
  proc; opt; techmap; opt; abc -g NAND; \
  techmap -map not2nand.v; clean; write_json policy-circuit.nand.json; stat"
```

where `not2nand.v` maps each `$_NOT_` cell to a NAND with both inputs tied
(`NAND(a, a) = NOT a`):

```verilog
module $_NOT_(A, Y);
  input A;
  output Y;
  $_NAND_ _TECHMAP_REPLACE_ (.A(A), .B(A), .Y(Y));
endmodule
```

The extra mapping step is needed because `abc -g NAND` leaves inverters as
`$_NOT_` cells (first pass: 2 NAND + 3 NOT). After the mapping the result is
strictly NAND-only: **5 gates**, confirmed by `stat` (`$_NAND_: 5`).

## Netlist JSON format

`circuits/policy-circuit.netlist.json` is our own simple, explicit format,
transcribed from the Yosys output (wire numbers renamed for readability):

```json
{
  "name": "policy-circuit",
  "description": "...",
  "inputs": ["x", "u", "r"],
  "outputs": ["allow"],
  "inputMap": {
    "x": "xVerified: ...",
    "u": "uidClaimed: ...",
    "r": "revoked: ..."
  },
  "gates": [
    {"id": "g1", "type": "NAND", "inputs": ["r", "r"], "output": "n1"},
    {"id": "g2", "type": "NAND", "inputs": ["n1", "x"], "output": "n2"},
    {"id": "g3", "type": "NAND", "inputs": ["n2", "n2"], "output": "n3"},
    {"id": "g4", "type": "NAND", "inputs": ["u", "n3"], "output": "n4"},
    {"id": "g5", "type": "NAND", "inputs": ["n4", "n4"], "output": "allow"}
  ]
}
```

Rules of the format: every gate is `NAND` with exactly two input wires and
one output wire; gates are listed in topological order (a gate's inputs are
either circuit inputs or outputs of earlier gates); wire names are strings.
The simulator (`simulate` in `lib/tapeout-circuit.ts`) evaluates gates in
listed order and throws on an unknown wire or a non-NAND gate instead of
guessing.

Gate-by-gate, with `x`, `u`, `r` as the inputs:

| Gate | Computation | Meaning |
| --- | --- | --- |
| g1 | `n1 = NAND(r, r)` | `NOT revoked` |
| g2 | `n2 = NAND(n1, x)` | `NOT (NOT revoked AND x)` |
| g3 | `n3 = NAND(n2, n2)` | `x AND NOT revoked` |
| g4 | `n4 = NAND(u, n3)` | `NOT (u AND x AND NOT revoked)` |
| g5 | `allow = NAND(n4, n4)` | `x AND u AND NOT revoked` |

## Equivalence proof: exhaustive simulation

The netlist has 3 binary inputs, so all 2^3 = 8 combinations can be checked
directly. The test `exhaustive simulation matches allow = x AND u AND NOT r`
in `lib/tapeout-circuit.test.ts` simulates the netlist from the JSON file on
disk and compares each result against the spec formula from the ticket
(`allow = xVerified AND uidClaimed AND NOT revoked`), an independent source
of truth. All 8 agree; the only allowing combination is
`x=1, u=1, r=0`. Run it with:

```
node --test lib/tapeout-circuit.test.ts
```

## Bit packing (eval input and output)

The `eval()` call carries bits as bytes. Our packing, implemented by
`packCircuitInput` / `unpackCircuitInput` / `decodeCircuitOutput`:

- **Input, one byte:** bit 0 = `xVerified`, bit 1 = `uidClaimed`,
  bit 2 = `revoked`. Bits 3-7 are always 0. So a fully verified, unrevoked
  mint packs to `0x03`, and no proof at all packs to `0x00`.
- **Output:** bit 0 of the first output byte is the allow bit. Further
  output bytes are ignored (the policy circuit produces exactly one bit).
  Empty output is an error, never a denial.

## The reader: evalPolicyCircuit

`evalPolicyCircuit({processor, circuitId, xVerified, uidClaimed, revoked,
rpcUrl?})` in `lib/tapeout-circuit.ts`:

1. Validates the processor address.
2. Reads code at the processor with `eth_getCode`; no code is an error.
3. Calls `eval(uint256, bytes)(bytes)` read-only through a viem public
   client (X Layer chain, default RPC `https://rpc.xlayer.tech`, 30 s
   timeout) with the packed input byte.
4. Decodes the allow bit from the returned bytes.

Every failure mode throws a clear `Error`: invalid address, no code at the
processor, a reverted call, an unreachable RPC, empty output. A failure is
never reported as `false`, because a denial would look like a policy
decision when it is really an outage. The reader never signs anything and
never sends a transaction.

`proofToCircuitInput(proof, revoked = false)` maps a stored Human Proof to
circuit inputs: a structurally valid proof (both halves exist by
construction of the proof store) sets both flags; no proof, or a malformed
one, sets neither. `revoked` defaults to `false` in v1.

### The eval log: every evaluation is recorded persistently

`checkPolicyCircuit` in `lib/mint-tapeout.ts` records every evaluation it
runs in the eval log (`lib/tapeout-eval-log.ts`), so the mint decision
leaves an audit trail beyond the HTTP response. One record per eval:
proof hash, circuit id, processor, the three input bits, the allow bit,
and the timestamp. Hashes only — no raw UID, handle, or signature.

- In-memory always; plus one JSON line appended per eval when
  `XAVERUS_TAPEOUT_EVAL_LOG_PATH` is set (parent directory created on
  first write). Unset, evals are kept in memory only and lost on restart.
- Unconfigured mints record nothing: no circuit, no evaluation.
- A failed log write is logged loudly to the server console and the mint
  proceeds — a broken audit log must not look like a denied mint, just as
  an eval outage must not (it becomes a `503`, never a denial).

### Honesty bound on eval()

The off-chain read-only pattern `eval(uint256,bytes)(bytes)` is documented
by 21 NAND docs and verified live below. What is **not** confirmed is a
canonical ABI for calling `eval()` from inside another contract
(TAPEOUT_RESEARCH.md §8): no official contract-to-contract example exists,
so the backend calls `eval()` read-only and records the result, per ADR-0002.

## Live verification (19 November 2026)

`scripts/tapeout-eval-probe.mjs` — read-only, no wallet, no transaction —
was run against X Layer mainnet (`https://rpc.xlayer.tech`). Processor
addresses were resolved on-chain from the TapeOut factory
(`0x1f09DAeFA827f02CBb40967cc91b259763760761`) via `cpuAt(i)`:

| Processor | Address (from `cpuAt`) | Cross-check |
| --- | --- | --- |
| #245 | `0xA93E807fAB41431827EBBa57443Fb687a95E2AA3` | Matches the address published in 21 NAND docs exactly |
| #268 (XBOT) | `0xa5fc69Ca2D3d462CCa204D894D85ac8071c4F0f0` | Resolved on-chain; no published address to compare against |

`eval()` results (raw output bytes; these are other people's circuits, so no
bit is decoded as an allow/deny decision — the probe proves the transport):

| Circuit | `eval()` call | Result |
| --- | --- | --- |
| 3.2.245 (processor #245) | `eval(3, 0xff7f)` | `0x00000000` |
| 3.2.245 | `eval(3, 0x00)` | `0x00000000` |
| 3.2.245 | `eval(3, 0x0000000000000000)` | `0x00000000` |
| 1.2.245 (processor #245) | `eval(1, 0xff7f)` | `0x02` |
| 1.2.245 | `eval(1, 0x00)` | `0x00` |
| 3.2.268 XBOT (processor #268) | `eval(3, 0xff7f)` | `0x01` |
| 3.2.268 XBOT | `eval(3, 0x00)` | `0x00` |
| 279.732 BNB (control) | `eval(279, 0xff7f)` | `0x02` |

Notes on the results:

- Circuits 1.2.245 and 3.2.268 return **different outputs for different
  inputs** (`0x02` vs `0x00`, `0x01` vs `0x00`), which is real circuit
  behaviour, not a constant stub.
- Circuit 3.2.245 returned `0x00000000` for every input tried. Its function
  (presumably DOT32_T, the 3,829-gate circuit taped out to processor #245)
  and its expected input width are unknown to us, so a zero output for
  these inputs is not surprising and not a failure: the call succeeded and
  returned 4 bytes.
- The BNB control reproduces the documented 21 NAND example
  (`eval(279, 0xff7f)` on `0x6Fb4089e7Cbaa9660Fd11056274Cbd8117EE5B38`).

Conclusion: the `eval()` transport works on live X Layer mainnet circuits.
The probe exits 0 when at least one X Layer `eval()` returns bytes.

## What is NOT verified yet

- **Our own policy circuit is not taped out yet.** There is no Circuit ID,
  processor address, or container for it. Tape-out needs real OKB on
  mainnet and is a later human step; the netlist in this repo is ready to
  tape out (5 gates). Until then, `evalPolicyCircuit` has been verified
  against live *other* circuits (transport) and a local stub RPC (policy
  decoding), not against our own circuit on-chain.
- **The semantics of the probed circuits** (what DOT32_T or XBOT compute)
  were not determined and were not needed: the probe only demonstrates the
  transport.
- **Calling `eval()` from inside a contract** remains unconfirmed (see the
  honesty bound above); the backend reader is the supported path.
