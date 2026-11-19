# 03: OKX UID claim and mint-gate API

**What to build:** the API side of minting. A wallet submits its OKX UID claim
with a signature and receives a Human Proof; the mint endpoint then returns
deploy calldata only for a wallet holding a valid proof, and refuses everyone
else. Demoable with a scripted wallet: claim, prove, mint allowed; skip the
proof, mint refused.

**Blocked by:** 01: Human-proof core library.

**Status:** ready-for-agent

- [ ] A claim with a valid signature and an existing X Binding issues a Human Proof
- [ ] A claim without an X Binding, with a bad signature, from the wrong wallet, or expired is refused with a clear reason
- [ ] The mint endpoint returns deploy calldata for a wallet with a valid proof and refuses without one
- [ ] Proof status is readable afterwards: wallet, X handle hash, UID hash, timestamp
- [ ] Every response labels the UID a user claim, never a verification
- [ ] Tests cover the allow and refuse paths; existing routes are unchanged
