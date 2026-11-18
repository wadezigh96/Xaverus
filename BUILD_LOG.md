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

## Still pending (human steps)

- Demo video (≤ 3 minutes): not recorded yet.
- Submission form: not filled in yet (draft in
  `docs/BUILD-X-SUBMISSION.md`).
- X Developer Portal application: not created yet (guide in
  `docs/X_DEVELOPER_PORTAL_GUIDE.md`); `X_CLIENT_ID`,
  `X_CLIENT_SECRET`, `X_REDIRECT_URI` unset.
- Tape out the policy circuit on X Layer mainnet: not done — no Circuit
  ID, processor address, or container yet. Needs real OKB.
- Deploy the registry and factory contracts to mainnet: not done. Needs
  the user's key and approval.
- First mainnet proof anchor: not done.
- No push, deploy, or mainnet transaction was made during this build.
