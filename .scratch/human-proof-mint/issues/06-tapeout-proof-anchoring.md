# 06: TapeOut proof anchoring

**What to build:** writing each Human Proof into a TapeOut circuit container
as a JSON file of hashes, and reading it back with SHA-256 verification, so
anyone can audit a mint without trusting the Xaverus server. Demoable on a
local mainnet fork: anchor a proof, read it back, verify the hash matches.

**Blocked by:** 01: Human-proof core library.

**Status:** ready-for-agent

- [ ] The anchor builder produces the proof JSON (hashes only, never a raw X handle or UID) and the file-write calls per the TapeOut spec
- [ ] The calls are verified on a local mainnet fork against the real SiteRegistry (impersonated container owner, fork only, never mainnet)
- [ ] The reader fetches the file back and verifies the bytes against the on-chain SHA-256
- [ ] Files larger than one chunk are split and reassembled correctly
- [ ] The docs record the exact human steps for the real mainnet anchoring (container, costs, commands)
