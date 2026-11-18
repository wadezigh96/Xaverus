# 01: Human-proof core library

**What to build:** the shared vocabulary of the Human Proof as code: the
binding message a wallet signs, the signature check, the OKX UID hashing,
the rules that make a proof valid, and the proof store other slices build on.
On its own this slice is verifiable through its tests and a small demo script:
a wallet can produce a proof, and any tampering is caught.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The binding message names the wallet address, the X user id, the OKX UID hash, and an expiry; two different inputs produce different messages
- [ ] A signature from the minting wallet verifies; a signature from any other wallet, a tampered message, or an expired message is rejected
- [ ] The UID is hashed before storage; the raw UID never appears in a stored proof
- [ ] One X account binds to at most one wallet and one wallet holds at most one proof; second attempts are refused
- [ ] A proof is valid only when both parts (X Binding and OKX UID Claim) are present for the same wallet
- [ ] All new tests pass under the Node test runner; all pre-existing tests still pass
