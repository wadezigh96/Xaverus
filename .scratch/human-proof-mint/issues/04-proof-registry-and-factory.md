# 04: Proof registry and minting factory contracts

**What to build:** the on-chain half of the Mint Gate. A registry records one
proof hash per wallet (written only by the authorized server writer), and a
factory deploys a new Safety Passport only for a wallet with a recorded proof.
Demoable on a local chain: record a proof, mint through the factory, see the
new passport owned by the minter; try without a proof, see the refusal.

**Blocked by:** 01: Human-proof core library.

**Status:** ready-for-agent

- [ ] The registry records one proof hash per wallet; only the authorized writer can record; proof recording emits an event
- [ ] The factory deploys a new Safety Passport for a wallet with a recorded proof and refuses without one; the deployed passport's owner is the minter
- [ ] The existing passport contract is untouched; the existing contract compilation still passes
- [ ] Foundry tests cover the allow and refuse paths; no mainnet interaction anywhere
