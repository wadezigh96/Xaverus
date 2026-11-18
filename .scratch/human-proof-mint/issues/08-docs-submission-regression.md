# 08: Docs, submission draft, and regression check

**What to build:** everything a judge and the user need to understand and
finish the submission, plus proof that nothing old broke: the minting guide,
the TapeOut integration doc, the submission draft with honest TODOs, the
build-log and README updates, the environment example, the X Developer Portal
guide, the test wiring, and a recorded regression run over the old behaviour.

**Blocked by:** 02, 03, 04, 05, 06, 07.

**Status:** ready-for-agent

- [ ] The human-proof minting guide and the TapeOut integration doc describe exactly what was built; no invented evidence, metrics, or verifications
- [ ] The submission draft lists the new development honestly, with TODOs for the demo video, the submission form, the mainnet tape-out, and the registry/factory deployment
- [ ] The build log and README are updated; the environment example documents the X OAuth variables; the X Developer Portal guide is step-by-step
- [ ] One test command runs all TypeScript tests; CI runs the tests; all old tests, the production build, and the contract compilation pass
- [ ] A regression checklist is executed and recorded: every existing route and page behaves as before
