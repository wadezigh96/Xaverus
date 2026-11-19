# 05: TapeOut policy circuit and eval reader

**What to build:** one small NAND policy circuit plus the backend reader that
evaluates it. The circuit answers a single question — allow or deny — from
three flag bits (X verified, UID claim signed, revoked). The reader calls the
circuit read-only through `eval()` and returns the allow bit to the mint
decision. Demoable locally by exhaustive simulation of every input
combination, plus a read-only `eval()` call against a live mainnet circuit.

**Blocked by:** 01: Human-proof core library.

**Status:** ready-for-agent

- [ ] The circuit implements allow = X-verified AND UID-claim-signed AND NOT revoked; the netlist is NAND-only; exhaustive simulation covers all input combinations
- [ ] The reader calls `eval()` read-only against a processor and returns the allow bit; processor errors are handled without crashing
- [ ] The `eval()` path is verified read-only against a live X Layer mainnet circuit (document which one), or reported honestly as unverified with the reason
- [ ] Nothing claims the circuit verifies identity; the docs say what it actually does
- [ ] Yosys is attempted for synthesis; if unavailable, the hand-derived netlist is documented with its equivalence proof (exhaustive simulation)
- [ ] All tests pass; no mainnet transaction anywhere
