# 02: X OAuth binding

**What to build:** connecting an X.com account during minting. The user starts
the flow, approves Xaverus on X, and comes back with their X account bound to
the wallet that started the flow — without Xaverus ever seeing their X
password. Demoable end to end once the X application exists; until then
verifiable through tests with a stubbed X.

**Blocked by:** 01: Human-proof core library.

**Status:** ready-for-agent

- [ ] Starting the flow redirects to X with a PKCE challenge and a state value; a state mismatch on return is rejected
- [ ] The callback exchanges the code server-side, reads the X user id and handle, and never exposes the client secret to the browser
- [ ] A completed OAuth creates a pending X Binding tied to the wallet that started the flow
- [ ] Missing or invalid credentials produce a clear error, never a crash or a half-created binding
- [ ] Tests stub the X HTTP calls; no test calls X live; no secret lands in the repository
