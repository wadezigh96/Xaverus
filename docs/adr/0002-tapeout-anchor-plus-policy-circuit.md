# TapeOut integration is proof anchoring plus a small policy circuit, evaluated off-chain

TapeOut is used two ways: (A) each Human Proof is anchored as a JSON file of hashes
in the policy circuit's container through SiteRegistry, so anyone can read and
verify the proof bytes against their on-chain SHA-256; (B) one small NAND policy
circuit (verified-X flag AND signed-UID-claim flag AND NOT revoked, a handful of
gates) is evaluated read-only through `eval()` from the backend, and the result
is recorded with the mint. Identity is never verified inside the circuit — a
circuit cannot call the X or OKX APIs, has no oracle, and only computes boolean
logic from bits handed to it off-chain. The circuit's honest value is that the
mint rule is public and runnable by anyone, not that it proves humanness.

`eval()` is called off-chain only. Calling it from inside a contract needs a
canonical ABI, and no official example of a contract-to-contract `eval()` call
exists yet. The DeWEB static mirror is optional work, only if time remains.
The TAP drafts "Policy Circuit Gate" and "Agent Passports" are design
inspiration only: both are unmerged, and the on-chain functions they need are
not confirmed deployed.

## Considered Options

- **Anchor only (A without B)**: satisfies the event's "onchain data" clause, but
  leaves no circuit to show and no Circuit ID for the submission.
- **Circuit only (B without A)**: gives a Circuit ID, but the proof itself would
  live only on the Xaverus server, so a judge could not verify any mint
  independently.
- **Verify identity inside the circuit**: rejected as not realistic — no network
  access, no oracle, and a few thousand gates per transaction cannot hold
  signature verification.
- **DeWEB mirror as the main integration**: rejected as the main path — DeWEB is
  static-only and cannot host the Next.js app; it adds cost for little
  submission value.

## Consequences

- Submission artefacts depend on this shape: one processor address, one Circuit
  ID, one container address, and SiteRegistry write evidence.
- Tape-out and container opening need real OKB on mainnet, so they are human
  steps for later; this build proves the circuit logic by exhaustive local
  simulation and the anchoring calls on a mainnet fork.
- Every claim about what the circuit does must say "enforces the policy rule
  openly", never "proves the minter is human".
