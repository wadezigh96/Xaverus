# 07: Mint UI page

**What to build:** the page where a person mints a human-proofed Safety
Passport: connect X, enter the OKX UID, sign the binding with their own
wallet, mint. Each step shows its state, and the page is honest throughout
that the UID is the user's own claim. Demoable in the browser against the
local dev server.

**Blocked by:** 02: X OAuth binding, 03: OKX UID claim and mint-gate API.

**Status:** ready-for-agent

- [ ] The page shows the four steps and the current state of each; the wording about the UID claim is honest
- [ ] Signing uses the user's own injected wallet; with no wallet present the page shows clear instructions instead of crashing
- [ ] The mint step shows the deploy transaction details before signing; the wallet signs and broadcasts (a user action)
- [ ] The page is linked from the existing navigation; existing pages are unchanged
- [ ] The production build passes
