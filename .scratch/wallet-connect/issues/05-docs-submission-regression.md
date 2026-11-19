# 05: Docs, submission update + full regression

**What to build:** everything a human needs to use and judge the wallet work:
a step-by-step Privy setup guide, an OKX Wallet guide, updated project docs,
and a submission draft that tells the wallet story honestly — plus a full
regression pass proving nothing old broke. After this ticket, the work is
presentable: a user can set up Privy from the guide alone, and the submission
draft lists wallet connect as verified new development with its honest
remaining items.

**Blocked by:** 03, 04 (docs describe the finished modules).

**Status:** ready-for-agent

- [ ] A Privy setup guide in plain Indonesian covers, step by step: creating the app at dashboard.privy.io (free), enabling email + wallet login, adding `xaverus.vercel.app` to allowed domains, copying the App ID into local env and into Vercel env vars, and what to do when login fails; it states the App Secret is never needed and must never be shared, and it contains no real App ID value (placeholder only)
- [ ] An OKX Wallet guide covers installing the extension, connecting on the mint page, what happens on each step, and the honest limit that extension `personal_sign` still awaits live verification
- [ ] The README, build log, human-proof minting doc, and glossary are updated for the wallet modules (new glossary terms for the wallet concepts)
- [ ] The env example and docs name the production X redirect URI `https://xaverus.vercel.app/api/mint/x/callback` explicitly (no generic `<domain>` left where the production value is meant); the local redirect URI stays `http://localhost:3000/api/mint/x/callback`
- [ ] The submission draft describes wallet connect (Privy + native OKX Wallet) as part of the new development, lists what was verified locally with real numbers, and keeps the remaining human steps (live Privy login, live OKX signature, deploy) as explicit TODOs — nothing invented
- [ ] The submission draft records the X app status honestly: the "Xaverus Mint" X app exists and its OAuth 2.0 Client ID is confirmed (via a user correction on 19 Nov 2026 — the base64-shaped value, not the standard-looking one sent first) and configured locally (the value must never be written in any tracked file; the first, standard-looking candidate is NOT the Client ID and must not be used — it is only a backup to try if live OAuth is ever rejected), the Client Secret stays with the user and goes directly into Vercel, and full X OAuth end-to-end verification happens on the live site after deploy — it cannot be tested fully locally without the secret
- [ ] Full regression passes and is recorded with real numbers: TypeScript tests, Foundry tests, route checks, production build, plus the existing pages and routes behaving as before (spot-check the main pages and the safety-check behaviour)
- [ ] The build log records the Privy install gotcha found in ticket 02: plain `npm install` fails with ERESOLVE (Privy's optional peer `permissionless` wants `ox ^0.8` while viem pins `ox 0.14.63`); `--legacy-peer-deps` produces a BROKEN resolution (ox 0.6.9) and must not be used — the working install used `--force`, and `npm ci` from the resulting lockfile works normally
- [ ] The route e2e script's server leak is fixed: `scripts/mint-routes-e2e.mjs` currently kills only the `npx` parent on SIGTERM and leaves the `next-server` child alive on port 3123 (found in ticket 02 — it polluted later runs); fix it to kill the process group, and verify no process remains on port 3123 after `npm run test:routes` finishes
- [ ] No secret and no real App ID value appears in any tracked file (verify with a scan before finishing)
