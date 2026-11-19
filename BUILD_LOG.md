# Xaverus — OKX Dev Day Build Log

## Project

- Project: Xaverus — Safe Agent Passport
- Primary target: Build a Company
- Repository: https://github.com/wadezigh96/Xaverus
- Production: https://xaverus.vercel.app
- OKX AI ASP: Xaverus (#13805)
- Network: X Layer mainnet (chain 196)

## New functionality implemented during the build period

### 1. OKX x402 seller integration

Added a guarded seller-side x402 endpoint using OKX's x402 packages.

Evidence:
- `/api/x402/service`
- server-only OKX credentials
- X Layer mainnet-only production configuration (`eip155:196`)
- HTTP 402 payment challenge
- buyer-side E2E probe

Relevant commits:
- feat: add official OKX x402 Next.js SDK
- feat: add guarded OKX x402 seller service
- fix: use documented x402 Next.js seller API
- fix: align OKX x402 package versions
- feat: make x402 network configurable via Vercel env
- test: add x402 end-to-end buyer probe
- chore: add x402 e2e test command

### 2. OKX AI A2MCP service

Registered Xaverus as an ASP on X Layer mainnet.

- Agent ID: 13805
- Service: Xaverus Safety Check
- Type: A2MCP
- Service ID: 010e5352-7c1a-4d10-a655-93eb2e77611d
- Endpoint: https://xaverus.vercel.app/api/agent/safety-check
- Fee: 0 USDT
- Listing status at the time of this log: under review

### 3. Server-side Safety Passport

The production safety endpoint evaluates payment intent without executing a payment.

Verified scenarios:

| Scenario | Input | Result |
|---|---|---|
| Allow | amount=1, perTx=5 | allowed |
| Per-tx block | amount=6, perTx=5 | blocked |
| Kill switch | enabled=false | blocked |

The responses confirmed server-side policy evaluation and executionPerformed=false.

## Security design

The browser does not receive private keys, seed phrases, or server-side OKX credentials.

The intended execution boundary is:
User → Safety Passport → Agent → wallet/security layer → X Layer.

The safety layer is defense-in-depth and does not claim perfect security.

## Demo evidence to capture

1. Open the live Xaverus product.
2. Show the Safety Passport policy.
3. Submit a valid intent and show ALLOW.
4. Exceed the per-transaction limit and show BLOCK.
5. Trigger the kill switch and show BLOCK.
6. Show the OKX AI A2MCP service identity.
7. Show the x402 payment challenge/protected-resource flow as a separate service demonstration. Production x402 settlement may be described as verified only where the corresponding mainnet transaction evidence is included.
8. Explain that the safety service is decision-only and does not directly sign transactions.

## Marketplace MVP

The production UI now includes a curated agent marketplace, agent detail flow, My Agents, Safety Passport, and Activity views. Launch Pass is represented in the UI without exposing a launch price; its payment backend remains intentionally disabled until the x402 launch-pass contract is revalidated against the installed OKX SDK version.

## Submission status

- Public GitHub repository: complete
- Live service: complete
- Marketplace UI: complete
- Production deployment: READY
- OKX AI ASP registration: complete
- A2MCP service registration: complete
- Listing review: pending
- Safety test evidence: complete
- x402 E2E evidence: complete
- Demo video: pending
- Final submission form: pending

---

# Build X Series — OKX X Layer TapeOut Accelerate

New development during the event, 19 November 2026, on branch
`build-x/human-proof-mint`. Submission deadline: 8 December 2026,
06:59 WIB. Prize pool: 100,000 USDT. Only work done during the event is
judged.

## New functionality implemented during the event

### 1. Human-proof minting

A Safety Passport can now only be minted through Xaverus with a Human
Proof: an X Binding (X.com account verified through X OAuth 2.0 with
PKCE, tied to the wallet by signature) plus an OKX UID Claim (the user's
OKX exchange UID, declared by the user and bound to the wallet by
signature). The Mint Gate refuses any mint without a valid Human Proof.
One X account binds to at most one wallet; one wallet holds at most one
Human Proof.

The OKX UID is always a user-signed claim, never a verification by OKX
(ADR-0001). No passwords are ever requested or stored — no X password,
no OKX password, no OKX API key.

- Mint page: `/mint` (four steps: connect wallet + X, claim OKX UID,
  sign binding, mint)
- Routes: `/api/mint/x/authorize`, `/api/mint/x/callback`,
  `/api/mint/message`, `/api/mint/claim`, `/api/mint/proof`,
  `/api/mint/binding`, `/api/mint/passport`, `/api/mint/anchor`
- Guide: `docs/HUMAN_PROOF_MINTING.md`
- X Developer Portal guide (Indonesian): `docs/X_DEVELOPER_PORTAL_GUIDE.md`

Relevant commits:
- feat: human-proof core library (ticket 01)
- feat: proof hash + shared proof store singleton (ticket 01 follow-up)
- fix: allow .ts extensions in imports so lib stays testable under node
- feat: X OAuth binding (ticket 02)
- feat: OKX UID claim and mint-gate API (ticket 03)
- feat: mint UI page (ticket 07)
- feat: binding-status route; mint page reads X user id from server (ticket 07 follow-up)

### 2. Proof registry and minting factory contracts

Two new contracts give the official mint path an on-chain check
(ADR-0003). `contracts/XaverusPassport.sol` is **not modified**.

- `XaverusHumanProofRegistry`: one proof hash per wallet, recorded by
  the authorized server writer only.
- `XaverusPassportFactory`: `mint()` reverts without a recorded Human
  Proof; otherwise deploys a fresh Safety Passport owned by the minter.
- The honest guarantee is "every passport minted through Xaverus carries
  a Human Proof", not "no passport can exist without a proof".

Relevant commit:
- feat: proof registry and minting factory contracts (ticket 04)

### 3. TapeOut policy circuit and `eval()` reader

One small NAND policy circuit enforces the mint rule openly:
`allow = xVerified AND uidClaimed AND NOT revoked` — 5 gates, Verilog in
`circuits/policy-circuit.v`, netlist in
`circuits/policy-circuit.netlist.json`, proven by exhaustive local
simulation of all 8 input combinations. The backend evaluates it
read-only through `eval()` as part of the mint decision
(`lib/tapeout-circuit.ts`, `lib/mint-tapeout.ts`): configured → deny is
a `403`, an `eval()` failure is a `503` (never a denial); unconfigured →
the check is skipped openly.

The `eval()` transport was verified live against real X Layer mainnet
circuits (1.2.245 and XBOT 3.2.268 return different outputs for
different inputs). The circuit does not verify identity — it computes
boolean logic from bits handed to it off-chain (ADR-0002).

Relevant commits:
- feat: TapeOut policy circuit and eval reader (ticket 05)
- feat: wire TapeOut into the mint flow (integration)

### 4. TapeOut proof anchoring

Each Human Proof is anchored as a JSON file of hashes at
`proofs/<wallet>.json` in the policy circuit's container through
SiteRegistry on X Layer, so anyone can read the proof bytes back and
verify them against the on-chain SHA-256. The anchor file holds hashes
only (the numeric X user id is the one deliberate plain-text exception).
`scripts/anchor-proof.mjs` anchors a proof; dry-run by default,
`--send` spends real OKB. Proven on an anvil fork of mainnet against
the real deployed SiteRegistry (read of a real on-chain file + live
write by an impersonated container owner; one 431-byte anchor in
format v2 cost 428,141 gas, ~0.00001 OKB at 0.02 gwei).

Relevant commit:
- feat: TapeOut proof anchoring (ticket 06)

### 5. TapeOut research and decisions

Research from official and public sources (`docs/TAPEOUT_RESEARCH.md`),
ADRs 0001–0003, the final spec, and tickets 01–08.

Relevant commits:
- docs: glossary and ADR for human-proof minting
- docs: draft spec for human-proof minting
- docs: TapeOut research, ADRs, final spec, tickets 01-08

### 6. Test wiring

One test command runs all TypeScript tests: `npm test`
(`node --test lib/*.test.ts`). The mint API routes are tested over real
HTTP against the production build: `npm run build`, then
`npm run test:routes` (`scripts/mint-routes-e2e.mjs` boots its own
server on a test port with temp state; no live X, OKX, or chain calls).
CI runs `npm test`, then the build, then `npm run test:routes`
(previously CI only ran `npm install` + `npm run build`, which would
have let a broken test suite through). Foundry tests stay local-only:

```bash
export PATH="$HOME/.foundry/bin:$PATH"
forge test
```

### 7. Code-review fix round (19 Nov 2026)

After tickets 01–08, a two-axis code review (Standards + Spec) produced
12 findings; 9 were fixed, 2 were deliberately kept with reasons
recorded in `docs/BUILD-X-SUBMISSION.md`, and 1 (the mint page's size)
was accepted as-is.

- **Shared proof-store core (Standards 1):** the binding and proof rules
  now live once in `createProofStore` (`lib/human-proof.ts`); the memory
  store and the file-backed store differ only in persistence (none vs.
  JSON file, saved through a hook that runs before the record commits,
  so a failed write vetoes the record).
- **Shared mint responses (Standards 2):** `lib/mint-response.ts` holds
  the public proof shape and the UID-claim note; the claim, proof,
  passport, and message routes import them instead of each defining
  their own.
- **One hex helper (Standards 3):** `isHex64` is exported from
  `lib/human-proof.ts` and used at every 64-hex check.
- **One X fetch helper (Standards 4):** `fetchXJson` in `lib/x-oauth.ts`
  serves both the token exchange and the user lookup; error messages
  unchanged.
- **Typed errors, not message matching (Standards 5):** store refusals
  carry a `ProofStoreError` code the claim route maps to HTTP statuses;
  a missing anchor file throws `AnchorFileNotFoundError`, which the
  anchor route tests with `instanceof`.
- **Automated mint-route tests (Spec 1):** `scripts/mint-routes-e2e.mjs`
  (29 checks over HTTP, wired into CI) replaces the manual smoke test.
- **Persistent eval log (Spec 2):** every policy-circuit evaluation is
  recorded in `lib/tapeout-eval-log.ts` (in-memory plus JSON-lines file
  when `XAVERUS_TAPEOUT_EVAL_LOG_PATH` is set); a failed log write never
  fails the mint.
- **Anchor format v2 (Spec 5):** the raw wallet signature is out of the
  public anchor file — hashes only, as ticket 06 required. No v1 file
  was ever anchored on-chain, so nothing needs migrating.
- **`POST /api/mint/message` (Spec 6):** the raw UID travels in a POST
  body like the claim route, never in a URL query string; the GET
  handler is gone and the mint page posts instead.

### 8. Wallet connect for minting (Privy + native OKX Wallet)

The mint page no longer asks the user to type a wallet address by hand
as the only path. Two wallet-connect modules feed the same mint flow
through one shared wallet seam (`lib/wallet-adapter.ts`: address, chain
id, sign a message, send a transaction, switch to X Layer), built on one
shared X Layer chain definition (`lib/x-layer-chain.ts`: id 196, name
"X Layer mainnet", OKB, RPC `https://rpc.xlayer.tech` with
`https://xlayerrpc.okx.com` as backup, explorer
`https://www.okx.com/web3/explorer/xlayer`). The OKB 18-decimal value
comes from viem's official chain definition, not from OKX docs, which
do not state the decimals explicitly.

- **Privy login** (`components/providers.tsx`, `lib/privy-config.ts`,
  `lib/privy-wallet.ts`, `app/mint/privy-wallet-connect.tsx`): log in
  with email, which creates an embedded wallet automatically, or with an
  external wallet (OKX Wallet first, then MetaMask, then detected
  wallets) through the Privy modal. X Layer is the default and only
  supported chain; the embedded-wallet RPC is overridden to the official
  X Layer RPC. Privy is strictly optional: with no App ID configured, no
  provider is mounted and the app behaves exactly as before. The App ID
  comes only from `NEXT_PUBLIC_PRIVY_APP_ID`; the Privy App Secret is
  never needed. Setup guide: `docs/PRIVY_SETUP_GUIDE.md`.
- **Native OKX Wallet** (`lib/okx-wallet.ts`,
  `app/mint/okx-wallet-connect.tsx`): one button talks to the OKX
  extension directly through `window.okxwallet` (never
  `window.ethereum`), connects, and moves the wallet to X Layer (adding
  the chain first on error 4902, then verifying the chain afterwards).
  A refused request (error 4001) is a polite message plus a retry
  button; account and chain changes update the UI reactively. Without
  the extension, the page links to the official download page
  (`https://web3.okx.com`); no `okx://` deep link is used. Honest limit:
  `personal_sign` through the extension awaits live verification.
  User guide: `docs/OKX_WALLET_GUIDE.md`.
- Typing an address by hand stays available as a fallback, and the most
  recently connected wallet signs and sends.

### 9. Code-review fix round, wallet connect (19 Nov 2026)

After tickets 01–05, a two-axis code review (Standards + Spec) produced
13 findings; 12 were fixed, 1 (unifying the three chain-id parsers) was
deliberately left alone: the parsers have different contracts on
purpose (strict CAIP-2 only, normalised-hex comparison, raw hex to
number where a bad value already flows into the not-on-X-Layer error),
and forcing one parser would change edge-case behaviour.

- **OKB decimals attribution (Spec 1):** the OKB 18-decimal value comes
  from viem's official chain definition, not from OKX docs — now stated
  in `docs/HUMAN_PROOF_MINTING.md` and in section 8 above, as the spec
  required, not only in the code comment.
- **Mint page with an App ID, checked automatically (Spec 2):**
  `scripts/mint-routes-e2e.mjs` now runs a second phase: a build into a
  separate output directory (`.next-appid`, via a `NEXT_DIST_DIR`
  setting in `next.config.ts`) with a valid-format placeholder App ID
  baked in, then serves it and checks `/mint` returns 200, renders the
  mint steps, and really has the App ID in its bundle. The second build
  is removed afterwards, and `next-env.d.ts` / `tsconfig.json` (which
  the App ID build rewrites) are restored, so the run leaves the tree
  exactly as it found it. 35 route checks now (was 31).
- **Last-connected wallet rule recorded (Spec 3):** the rule was
  already in the code and in this log; it is now also in the spec
  (`.scratch/wallet-connect/SPEC.md`) and in
  `docs/HUMAN_PROOF_MINTING.md`, so spec and code agree.
- **Dependency order restored (Spec 4):** `package.json` is back to
  its pre-wallet-connect order, with the two Privy dependencies kept at
  the end; `npm ci` still works and the lockfile is unchanged.
- **OTP lifetime claim removed (Spec 5):** the Privy guide no longer
  says the email code "lasts 10 minutes" — it says the code expires
  soon and to enter it promptly, with no invented number.
- **Smoke check status aligned (Spec 6):**
  `docs/HUMAN_PROOF_MINTING.md` now says the dev-server smoke check
  with the real App ID is done (ticket 03); only the visual rendering
  in a browser and a real login stay open.
- **Disconnect clears the wallet field (Spec 7, bug):** when a wallet
  disconnects, the mint page now clears the address field — but only
  when the field still shows that wallet's address, so a manually typed
  address is never erased. The rule lives in `walletFieldAfterDisconnect`
  (`lib/wallet-ui.ts`), covered by tests; the saved address in
  localStorage is cleared with it, so a reload does not restore a
  disconnected wallet.
- **Shared wallet UI helpers (Standards 8–10):** `lib/wallet-ui.ts`
  holds the one copies of `errorMessage`, `shortAddress`, the polite
  refusal messages (`userRejectionMessage`, plus `walletErrorMessage`,
  the one place that decides refusal vs. real failure), and the shared
  `WalletConnectProps`. `ConnectedWallet` (address plus adapter, as
  one object) lives in `lib/wallet-adapter.ts` beside
  `notOnXLayerMessage`, the one wrong-chain message. Both connect
  buttons share the connected-state block
  (`app/mint/connected-wallet-status.tsx`) and the switch behaviour
  (`app/mint/use-switch-to-x-layer.ts`); the mint page has one connect
  handler and one account-change handler for both wallet sources.
- **Primary RPC accessor (Standards 11):** `xLayerPrimaryRpcUrl()` in
  `lib/x-layer-chain.ts` replaces the `rpcUrls.default.http[0]` chain
  in the Privy config.
- **Clear global name (Standards 13):** the one-letter `w` for the
  global object is `globalObject` in `getOkxWalletProvider` (and in
  the mint page's `getEthereum`, same pattern).

Relevant commits:
- fix(wallet-connect): code-review fix round (13 findings)

**App ID build gotcha (found in this fix round):** a `next build` with
a different `NEXT_DIST_DIR` rewrites `next-env.d.ts` and
`tsconfig.json` to point at that output directory. The route script
snapshots both files before the App ID build and restores them
afterwards. (A plain `next build` also rewrites `next-env.d.ts` to
point at `.next` — pre-existing behaviour of this Next version, not
something this build introduced; the file is reverted after builds.)

Relevant commits:
- feat: shared wallet adapter + X Layer chain definition (wallet ticket 01)
- feat: Privy provider + config with graceful degradation (wallet ticket 02)
- feat: native OKX Wallet module (wallet ticket 04)
- feat: mint page wired to Privy (wallet ticket 03)

**Privy install gotcha (found in wallet ticket 02):** plain
`npm install @privy-io/react-auth` fails with ERESOLVE — Privy's
optional peer `permissionless` wants `ox ^0.8` while viem pins
`ox 0.14.63`. `--legacy-peer-deps` produces a BROKEN resolution
(ox 0.6.9) and must not be used. The working install used `--force`,
which keeps viem's exact pins nested under `node_modules/viem`, and
`npm ci` from the resulting lockfile works normally. The lockfile keeps
exactly one viem copy (2.57.17).

**Route e2e server leak (found in wallet ticket 02, fixed in wallet
ticket 05):** `scripts/mint-routes-e2e.mjs` killed only the `npx`
parent on SIGTERM and left the `next-server` child alive on port 3123,
polluting later runs. The script now spawns the server detached (its
own process group) and kills the whole group on shutdown, with a
SIGKILL fallback and signal handlers for interrupted runs. Verified:
two consecutive `npm run test:routes` runs, 31/31 checks each, no
listener and no `next-server` process left on port 3123 afterwards.

## Verified evidence (19 Nov 2026)

Run locally on branch `build-x/human-proof-mint`:

| Check | Result |
|---|---|
| TypeScript tests (`node --test lib/*.test.ts`) | 116 passed, 0 failed (incl. the 6 pre-existing safety tests) |
| Foundry tests (`forge test`) | 12 passed, 0 failed (registry + factory) |
| Type check (`npx tsc --noEmit`) | Clean |
| Production build (`npm run build`) | Passes |
| Mint route tests (`npm run test:routes`) | 29/29 checks passed over HTTP against the production build |
| `eval()` live probe (`scripts/tapeout-eval-probe.mjs`) | Succeeds against X Layer mainnet circuits 1.2.245 and XBOT 3.2.268 |
| Anchor fork test (`scripts/tapeout-anchor-fork-test.mjs`) | Passes on an anvil fork against the real SiteRegistry |
| End-to-end HTTP smoke test | Replaced by the automated route tests above (same coverage, now in CI); mint without proof → `403`; `eval()` failure → `503` |

## Verified evidence, wallet connect (19 Nov 2026, ticket 05)

Full regression rerun on branch `wallet-connect/05-docs-submission-regression`
after the wallet modules (tickets 01–04) and the route-script leak fix:

| Check | Result |
|---|---|
| TypeScript tests (`node --test lib/*.test.ts`) | **169 passed, 0 failed** (incl. the 6 pre-existing safety tests) |
| Foundry tests (`forge test`) | **12 passed, 0 failed** (registry + factory) |
| Type check (`npx tsc --noEmit`) | Clean |
| Production build (`npm run build`) | Passes |
| Mint route tests (`npm run test:routes`) | **31/31 checks passed** over HTTP against the production build, twice in a row; no process left on port 3123 after either run |
| `contracts/XaverusPassport.sol` vs `main` | **Unchanged** (`git diff main -- contracts/XaverusPassport.sol` empty) |
| Secret scan of tracked files | No secret and no real App ID / Client ID value in any tracked file |
| Dev-server smoke check with the real Privy App ID | Done (ticket 03): the dev server started clean with the real App ID (no Privy errors or warnings in the log), `/mint` returned 200, the Privy SDK chunk loaded, and the "Log in with email or wallet" label was present in the client bundle; the "Connect OKX Wallet" button was in the same bundle. Visual rendering in a browser and a real login still need a human. |

Not verified live (honest open items, see "Still pending"): a real Privy
login (email OTP or wallet approval), a `personal_sign` through the OKX
extension, and full X OAuth end-to-end on the live site.

## Verified evidence, wallet-connect fix round (19 Nov 2026)

Full regression rerun on branch `wallet-connect/fix-review` after the
code-review fix round (section 9):

| Check | Result |
|---|---|
| TypeScript tests (`node --test lib/*.test.ts`) | **186 passed, 0 failed** (169 before the round + 17 new: shared wallet UI helpers, wrong-chain message, primary RPC accessor, disconnect field rule) |
| Foundry tests (`forge test`) | **12 passed, 0 failed** (registry + factory) |
| Type check (`npx tsc --noEmit`) | Clean |
| Production build (`npm run build`) | Passes |
| Mint route tests (`npm run test:routes`) | **35/35 checks passed** over HTTP against the production build (31 before the round + 4 new: `/mint` 200 with a placeholder App ID configured, mint steps render with it, App ID baked into the served bundle, no App ID baked in without one) |
| `contracts/XaverusPassport.sol` vs `main` | **Unchanged** (`git diff main -- contracts/XaverusPassport.sol` empty) |
| Degradation without an App ID | Unchanged: no Privy provider mounted, no Privy login UI, manual address plus OKX Wallet as before (route checks) |
| Port 3123 after the route run | No listener and no `next-server` process left; `.next-appid` removed, `next-env.d.ts` / `tsconfig.json` restored |

## Regression check (19 Nov 2026, ticket 08)

The build is strictly additive: every existing feature keeps working
untouched. Verified against the production build on
`build-x/human-proof-mint`:

- `contracts/XaverusPassport.sol` is unchanged vs `main`
  (`git diff main -- contracts/XaverusPassport.sol` is empty).
- All 6 pre-existing safety tests still pass (part of the 104 above).
- Production server smoke test (old routes):

| Route | Result |
|---|---|
| `/` | 200 |
| `/safety` | 200 |
| `/agents` | 200 |
| `/activity` | 200 (with `XAVERUS_PASSPORT_DEPLOYMENT_BLOCK` set to a recent block; see note) |
| `/api/health` | 200 |
| `/api/x402/service` | 503 without credentials — expected, unchanged pre-existing behaviour, not a regression |
| `/mint` (new) | 200 |
| `POST /api/mint/passport` without proof (new) | 403, as designed |

Note on `/activity`: the page walks backward from the latest block in
100-block chunks starting at `XAVERUS_PASSPORT_DEPLOYMENT_BLOCK`, or at
block 0 when that variable is unset. With it unset, the walk covers
~76M blocks and does not finish in a reasonable time in this
environment. That is pre-existing behaviour of the unchanged page, not a
regression: with the variable set to a recent block (as in production),
the page answers 200 in ~3s.

## Regression check, rerun after the code-review fixes (19 Nov 2026)

Same production-build smoke test, repeated after the fix round, plus the
safety-check decision paths exercised live against the on-chain policy:

| Route | Result |
|---|---|
| `/` | 200 |
| `/safety` | 200 |
| `/agents` | 200 |
| `/activity` | 200 (with `XAVERUS_PASSPORT_DEPLOYMENT_BLOCK` set to a recent block; see note above) |
| `/mint` (new) | 200 |
| `/api/health` | 200 |
| `/api/x402/service` | 503 without credentials — expected, unchanged pre-existing behaviour |
| `/api/agent/manifest` | 200 |
| `POST /api/agent/safety-check`, 1 USDC vs 5 cap | 200, `allowed: true` ("On-chain policy checks passed.") |
| `POST /api/agent/safety-check`, 6 USDC vs 5 cap | 200, `allowed: false` ("Transaction exceeds the on-chain per-transaction limit.") |

- `contracts/XaverusPassport.sol` is still unchanged vs `main`
  (`git diff main -- contracts/XaverusPassport.sol` is empty).
- All 6 pre-existing safety tests still pass (part of the 116 above).
- The live safety-check response also confirms the USDC checksum fix
  kept from the review: the on-chain asset reads back as
  `0xB6CEceAB302E2E4948951eE7843FC24E92933061`, the corrected address.

## Regression check, wallet connect (19 Nov 2026, ticket 05)

Same production-build smoke test, repeated after the wallet modules and
the route-script leak fix, plus the safety-check decision paths
exercised live against the on-chain policy (request header
`X-Xaverus-Request-ID` and a valid recipient address are required by
the route):

| Route | Result |
|---|---|
| `/` | 200 |
| `/safety` | 200 |
| `/agents` | 200 |
| `/activity` | 200 (with `XAVERUS_PASSPORT_DEPLOYMENT_BLOCK` set to a recent block; see note above) |
| `/mint` (new) | 200; no Privy login UI without an App ID configured (route check + spot check) |
| `/api/health` | 200 |
| `/api/x402/service` | 503 without credentials — expected, unchanged pre-existing behaviour |
| `/api/agent/manifest` | 200 |
| `POST /api/agent/safety-check`, 1 USDC vs 5 cap | 200, `allowed: true` ("On-chain policy checks passed.") |
| `POST /api/agent/safety-check`, 6 USDC vs 5 cap | 200, `allowed: false` ("Transaction exceeds the on-chain per-transaction limit.") |
| `POST /api/mint/passport` without proof (new) | 403, as designed |

- `contracts/XaverusPassport.sol` is still unchanged vs `main`
  (`git diff main -- contracts/XaverusPassport.sol` is empty).
- All 6 pre-existing safety tests still pass (part of the 169 above).
- The live safety-check response again confirms the USDC checksum fix:
  the on-chain asset reads back as
  `0xB6CEceAB302E2E4948951eE7843FC24E92933061`.
- The OKX Wallet button renders only after the page mounts in the
  browser (it reads `window.okxwallet` post-mount to avoid a hydration
  mismatch), so it is not visible in server-rendered HTML — that is
  intended, not a regression. The button's behaviour is covered by the
  OKX unit tests behind a mocked provider.

## Still pending (human steps)

- Demo video (≤ 3 minutes): not recorded yet.
- Submission form: not filled in yet (draft in
  `docs/BUILD-X-SUBMISSION.md`).
- X Developer Portal application: the "Xaverus Mint" app exists and its
  OAuth 2.0 Client ID is confirmed (via a user correction on 19 Nov
  2026 — the base64-shaped value, not the standard-looking one sent
  first) and configured locally. The Client Secret stays with the user
  and goes directly into Vercel; full X OAuth end-to-end verification
  happens on the live site after deploy. The first, standard-looking
  candidate is NOT the Client ID and must not be used — it is only a
  backup to try if live OAuth is ever rejected. (Guide in
  `docs/X_DEVELOPER_PORTAL_GUIDE.md`.)
- Live Privy login: not done — completing a real login (email OTP or a
  wallet approval) needs a human in a browser. The dev-server smoke
  check with the real App ID IS done (dev server clean, `/mint` 200,
  SDK chunk loaded, connect button in the bundle — see the
  wallet-connect evidence table above); only the visual render and
  the real login remain open. (Guide in
  `docs/PRIVY_SETUP_GUIDE.md`.)
- Live OKX Wallet signature: not done — `personal_sign` through the
  OKX extension awaits live verification. (Guide in
  `docs/OKX_WALLET_GUIDE.md`.)
- Deploy the wallet-connect work to Vercel (merge to the integration
  branch, then deploy): not done. Needs the user's approval.
- Tape out the policy circuit on X Layer mainnet: not done — no Circuit
  ID, processor address, or container yet. Needs real OKB.
- Deploy the registry and factory contracts to mainnet: not done. Needs
  the user's key and approval.
- First mainnet proof anchor: not done.
- No push, deploy, or mainnet transaction was made during this build.
