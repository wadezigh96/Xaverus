# 03: Mint page wired to Privy

**What to build:** the mint page uses the connected Privy wallet end to end:
a login button opens Privy login; once logged in, the wallet address fills in
automatically, the UID claim is signed with the Privy wallet, and the mint
transaction is sent with the Privy wallet. When Privy is not configured or
the user is not logged in, the page behaves exactly as before (manual address
plus browser wallet). After this ticket, a person with only an email address
can reach the mint flow, and the dev server proves the provider loads and the
connect buttons render with the real App ID.

**Blocked by:** 02 (needs the mounted Privy provider).

**Status:** ready-for-agent

- [ ] The mint page offers a Privy login button (email + wallet via the Privy modal) whenever Privy is configured, and hides all Privy UI when it is not
- [ ] Once logged in, the minting wallet address comes from the connected Privy wallet (embedded or external), not from manual typing; the manual address field remains as the fallback when Privy is absent or logged out
- [ ] The UID claim signature and the mint transaction go through the Privy wallet, naming the wallet address explicitly, and only after the SDK reports ready
- [ ] The mint page talks to Privy only through the shared wallet adapter from ticket 01 — no direct SDK calls scattered through the page
- [ ] Signing and sending errors surface as readable messages with a retry path; a refused popup is a polite message, not a system error
- [ ] Dev-server smoke check with the real App ID (copy the ignored local env file into the worktree for the check; never commit it): the dev server starts without Privy errors, the mint page loads, and the connect buttons render — record the observed outcome honestly (what was seen, what was not: completing a real login still needs a human in a browser)
- [ ] All pre-existing tests (TypeScript, Foundry, route checks) plus the new adapter/config tests still pass, and the production build passes
