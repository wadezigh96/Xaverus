# Build X Series — submission draft

**Event:** OKX X Layer Build X Series ("X Layer TapeOut Accelerate")
**Prize pool:** 100,000 USDT
**Submission deadline:** 8 December 2026, 06:59 WIB (7 December 2026,
23:59 UTC — provisional; the official page decides the final date)
**Project:** Xaverus — Safe Agent Passport for Autonomous Onchain Agents
**Repository:** https://github.com/wadezigh96/Xaverus
**Live product:** https://xaverus.vercel.app
**Network:** X Layer mainnet (chain 196)
**Branch with the new work:** `build-x/human-proof-mint`
(code last verified at commit `32b79bf`, 19 Nov 2026; wallet-connect
work verified on branch `wallet-connect/05-docs-submission-regression`
at commit `77d90a9`, see "Verified evidence")

> **This is a draft, not the submitted form.** It is written to be copied
> into the official submission form at
> https://web3.okx.com/xlayer/build-x-series once the TODOs at the end are
> done. Nothing in it invents evidence, metrics, or verifications: every
> claim below is either verified locally (see "Verified evidence") or
> explicitly marked as not yet done.

## Project description

Xaverus is a user-controlled safety layer for autonomous onchain agents:
deterministic spend policy (per-transaction cap, daily cap, approval
gate, kill switch) sits between an agent's payment intent and the wallet
that executes it on X Layer. The Safety Passport is a single-owner
on-chain policy ledger; the policy service is decision-only and never
signs or moves funds. Xaverus is already live on X Layer mainnet with an
OKX AI A2MCP service ("Xaverus Safety Check", Agent ID 13805, under
review) and a verified $0.01 x402 mainnet payment.

**The problem this new work solves:** a Safety Passport could be minted
by any wallet, including wallets a bot farms by the thousand — so a
passport said nothing about whether a real person stood behind it. Any
agent or service trusting a passport had no reason to trust that a human
was involved.

**The new development (this event): human-proof minting, anchored on
TapeOut.** Before a wallet can mint a Safety Passport, it must present a
Human Proof: an X Binding (its X.com account, verified through X OAuth
and tied to the wallet by signature) plus an OKX UID Claim (the user's
OKX exchange UID, declared by the user and bound to the wallet by
signature). The Mint Gate refuses any mint without a valid Human Proof.
The proof is anchored through TapeOut in two real ways: the proof hashes
are stored as a JSON file in a TapeOut circuit's container, and a small
NAND policy circuit is evaluated read-only through `eval()` as part of
the mint decision.

**Wallet connect is part of the same new development.** Minting used to
ask the user to type a wallet address by hand, with no guided way to
connect a wallet at all — a judge with no wallet installed could not
reach the mint flow. The mint page now offers Privy login (email, which
creates an embedded wallet automatically, or an external wallet: OKX
Wallet, MetaMask, and detected wallets) and a native OKX Wallet button
that talks to the OKX extension directly. Both feed one shared wallet
adapter that moves the wallet to X Layer automatically and fills the
address in, so the whole mint flow happens in one place. Typing an
address by hand stays as a fallback, and without a Privy App ID the app
runs exactly as before.

**Target users:** people who run autonomous agents on X Layer and want
their agent's safety passport to be provably human-backed, and services
that want to trust a passport only when a human stands behind it.
**Why users would pay and keep using it:** a human-backed passport is a
trust signal other agents and services can check; the mint flow itself is
free apart from gas, and the safety layer is already the product users
come for. (No revenue is claimed for the new feature; the event FAQ
allows projects that have not yet generated revenue.)

## What is NEW during the event

Only work done during the event is judged. Everything below was built
19 November 2026 on branch `build-x/human-proof-mint`, on top of the
existing Xaverus product. No existing feature was removed or changed in
behaviour (see the regression check in `BUILD_LOG.md`).

| Ticket | What was built | Commit |
| --- | --- | --- |
| Research + spec | TapeOut research from official and public sources, ADRs 0001–0003, final spec, tickets 01–08 | `df78363` (plus `566c14c`, `1b4b2ff`) |
| 01 — Human-proof core | Message building, signature recovery, proof validation, binding rules, proof hash, shared proof store (in-memory + JSON file-backed) | `7be0792`, `6ececaa`, `1d44cad` |
| 02 — X OAuth binding | X OAuth 2.0 with PKCE (S256), server-side only; authorize + callback routes; one X account binds to at most one wallet | `5fd7d46` |
| 03 — OKX UID claim + mint gate | Binding-message route, signed-claim route, proof-status route, and the mint-gate route returning factory calldata | `f5e6bd6` |
| 04 — Registry + factory contracts | `XaverusHumanProofRegistry` (one proof hash per wallet) and `XaverusPassportFactory` (mints only for wallets with a recorded proof). `XaverusPassport.sol` untouched | `e91db77` |
| 05 — Policy circuit + `eval()` reader | 5-gate NAND policy circuit (`allow = xVerified AND uidClaimed AND NOT revoked`), Verilog + netlist, exhaustive simulation proof, read-only `eval()` reader; transport verified live on mainnet circuits | `48d97ee` |
| 06 — Proof anchoring | Anchor-file builder (hashes only), SiteRegistry calldata (`putFile`/`appendChunk`), hash-verified reader, anchor script (dry-run by default), anvil fork test against the real SiteRegistry | `a2879a1` |
| 07 — Mint UI | Four-step mint page (`/mint`): connect wallet + X, claim OKX UID, sign binding, mint; plus the binding-status route so the X user id is read from the server | `e85b9cd`, `087b622` |
| Integration wiring | The TapeOut policy circuit is wired into the mint decision: configured → evaluated read-only (deny → `403`, failure → `503`); unconfigured → skipped openly | `a5ee52a` |
| 08 — Docs + regression | Minting guide, TapeOut integration doc, this submission draft, X Developer Portal guide, build-log and README updates, `npm test` + CI test step, recorded regression run | `a3b0b46` |
| Code-review fixes | Shared proof-store core, typed store/anchor errors, shared mint-response shapes, X fetch dedup, `POST /api/mint/message` (UID out of URLs), persistent eval log, anchor format v2 (signature removed, hashes only), automated mint-route tests (`scripts/mint-routes-e2e.mjs`, wired into CI) | `bc42661`, `80fc8fb`, `4e26e0a`, `731f42d`, `32b79bf` |
| Wallet spec + tickets | Wallet-connect spec (Privy + native OKX Wallet) and tickets 01–05 | `1f38500` |
| Wallet 01 — Shared adapter + chain | One X Layer chain definition (id 196, OKB, official RPCs and explorer) and one wallet adapter seam (address, chain id, sign, send, switch to X Layer) with a browser-injected-provider implementation and error classification (4001 refused, 4902 chain missing) | `dc9a4ff` |
| Wallet 02 — Privy provider + config | `@privy-io/react-auth` 3.52.0 installed; provider mounts only with an App ID (login email + wallet, X Layer as default and only supported chain, embedded wallets for users without wallets, wallet list OKX first, embedded RPC overridden to the official X Layer RPC); without an App ID the app runs exactly as before | `13ca8c7` |
| Wallet 04 — Native OKX Wallet | Dedicated button talking to the OKX extension through `window.okxwallet` (never `window.ethereum`): connect, switch to X Layer (add chain on 4902 and retry, verify afterwards), sign and send through the shared adapter; polite retry on refusal; reactive account/chain updates; download link when no extension, no `okx://` deep link | `b0199cb` |
| Wallet 03 — Mint page wired to Privy | Privy login button on the mint page; the connected Privy wallet fills the address, signs the UID claim, and sends the mint transaction through the shared adapter, only after the SDK reports ready; manual address stays as the fallback; all Privy UI hides without an App ID | `4532188` |
| Wallet 05 — Docs + regression | Privy setup guide and OKX Wallet guide (Indonesian), README / build-log / minting-doc / glossary updates, this submission update, fix for the route e2e script's server leak (it left `next-server` alive on port 3123), full regression rerun (see "Verified evidence") | `78c976d`, `77d90a9` |

### Two deliberate keeps (code review, 19 Nov 2026)

The review flagged two items as scope creep. Both were kept on purpose:

1. **`GET /api/mint/anchor` was not requested by any ticket — kept.**
   It is how the product verifies an anchoring: anyone can read a mint's
   proof file back from the TapeOut container and check its bytes against
   the on-chain SHA-256 without trusting the Xaverus server. Removing it
   would remove the public verification path for the anchoring feature,
   which is one of the two TapeOut uses this submission rests on.
2. **The USDC address casing fix in `contracts/README.md` was not
   requested by any ticket — kept.** It corrects the EIP-55 checksum
   casing of the Circle native USDC address (`...FC24e92933061` →
   `...FC24E92933061`), verified with `viem` `getAddress` and confirmed
   by the live safety-check response, which returns the same checksummed
   address from the on-chain passport. Removing it would restore an
   incorrect address in the deployment docs.

## How TapeOut is used

Two real uses, both in the product (details in
`docs/TAPEOUT_INTEGRATION.md`):

1. **Data onchain (proof anchoring).** Each Human Proof is anchored as a
   JSON file of hashes at `proofs/<wallet>.json` in the policy circuit's
   container through SiteRegistry on X Layer. SiteRegistry records the
   file's SHA-256 on-chain; anyone can read the file back and verify the
   bytes against that hash (`GET /api/mint/anchor?wallet=0x...`, `cast`,
   or the TapeKit kernel). Proven on an anvil fork of mainnet against the
   real deployed SiteRegistry (read of a real on-chain file + live write
   by an impersonated container owner). **No mainnet anchor exists yet**
   — the first one is a TODO below.
2. **Circuit (policy circuit).** A 5-gate NAND circuit enforces the mint
   rule openly: `allow = xVerified AND uidClaimed AND NOT revoked`. The
   backend evaluates it read-only through `eval()` as part of the mint
   decision and records the result with the mint. The circuit is proven
   by exhaustive local simulation (all 8 input combinations), and the
   `eval()` transport is verified live against real X Layer mainnet
   circuits (1.2.245 and XBOT 3.2.268 return different outputs for
   different inputs). **Our own circuit is not taped out yet** — there is
   no Circuit ID yet, and that is a TODO below.

**Honest limits, stated plainly:** the circuit does not verify identity
— it cannot call the X or OKX APIs and has no oracle; it computes boolean
logic from bits handed to it off-chain. The OKX UID is the user's own
signed claim, never a verification by OKX. No passwords are ever
requested or stored. The interface, computation, and other features run
outside the circuit, which the event FAQ explicitly allows.

**TapeOut artefacts for the form:**

| Artefact | Value |
| --- | --- |
| Processor contract | _TODO — after tape-out_ |
| Circuit ID | _TODO — after tape-out_ |
| Container address | _TODO — after tape-out + container opening_ |
| Anchor transaction hash | _TODO — after the first mainnet anchor_ |
| TapeOut features used | Proof anchoring via SiteRegistry (data onchain) + policy circuit via `eval()` |

## Verified evidence (19 Nov 2026)

All of the following was run locally on branch `build-x/human-proof-mint`
at commit `32b79bf` (19 Nov 2026), after the code-review fix round, and
rerun after the wallet-connect work on branch
`wallet-connect/05-docs-submission-regression` (ticket 05, same date).
The `eval()` probe and anchor fork test were first run during tickets
05–06 and rerun after the fixes (the fork test now anchors the v2
format: 431 bytes, 428,141 gas); they were not rerun in ticket 05
because the wallet work does not touch that code.

| Check | Result |
| --- | --- |
| TypeScript tests (`node --test lib/*.test.ts`) | **169 passed, 0 failed** (includes the 6 pre-existing safety tests; 116 before the wallet work) |
| Foundry tests (`forge test`) | **12 passed, 0 failed** (registry + factory) |
| Type check (`npx tsc --noEmit`) | Clean |
| Production build (`npm run build`) | Passes |
| Mint route tests (`npm run test:routes`) | **31/31 checks passed** over HTTP against the production build (29 before the wallet work): full message → sign → claim → proof → mint path, all error statuses, UID-claim note on every response, mint page 200 with no Privy login UI when no App ID is configured |
| Route e2e server leak fix | Two consecutive `test:routes` runs, 31/31 each, with no process left on port 3123 after either run (before the fix, `next-server` stayed alive on the port) |
| `eval()` live probe (`scripts/tapeout-eval-probe.mjs`) | Succeeds against X Layer mainnet circuits 1.2.245 and XBOT 3.2.268 |
| Anchor fork test (`scripts/tapeout-anchor-fork-test.mjs`) | Passes on an anvil fork against the real SiteRegistry |
| End-to-end HTTP smoke test | Replaced by the automated route tests above (same coverage, now in CI); mint without proof → `403`; `eval()` failure → `503` |
| `contracts/XaverusPassport.sol` vs `main` | **Unchanged** (`git diff main -- contracts/XaverusPassport.sol` empty) |
| Regression on old routes | `/`, `/safety`, `/agents`, `/activity`, `/api/health`, `/api/agent/manifest` all `200`; `/api/x402/service` `503` without credentials, as before; safety-check live: 1 USDC allowed, 6 USDC blocked (see `BUILD_LOG.md`) |
| Secret scan | No secret and no real App ID / Client ID value in any tracked file |
| Dev-server smoke check with the real Privy App ID | Done (ticket 03): the dev server started clean with the real App ID (no Privy errors or warnings), `/mint` returned 200, the Privy SDK chunk loaded, and the "Log in with email or wallet" label was in the client bundle. Visual rendering in a browser and a real login still need a human. |

**Not verified live (honest open items):** a real Privy login (email OTP
or a wallet approval); a `personal_sign` through the OKX extension; full
X OAuth end-to-end on the live site. All three are TODOs below — nothing
here claims they were done.

## TODO before submitting

- [ ] **Demo video (≤ 3 minutes, recommended):** show the problem, the
      four-step mint flow, a mint refused without a Human Proof and
      allowed with one, and how TapeOut is used (`eval()` / anchor
      verification). Not recorded yet.
- [ ] **X Developer Portal application — app exists, secret + live
      verification still open:** the "Xaverus Mint" X app exists and its
      OAuth 2.0 Client ID is confirmed (via a user correction on
      19 Nov 2026 — the base64-shaped value, not the standard-looking
      one sent first) and configured locally. The Client Secret stays
      with the user and goes directly into Vercel (`X_CLIENT_ID`,
      `X_CLIENT_SECRET`, `X_REDIRECT_URI` =
      `https://xaverus.vercel.app/api/mint/x/callback` in Vercel env
      vars). Full X OAuth end-to-end verification happens on the live
      site after deploy — it cannot be tested fully locally without the
      secret. The first, standard-looking candidate is NOT the Client
      ID and must not be used; it is only a backup to try if live OAuth
      is ever rejected. Step-by-step guide:
      `docs/X_DEVELOPER_PORTAL_GUIDE.md`. The app's OAuth settings
      (Web App type, callback + website + Terms of Service filled in)
      are already saved in the X portal.
- [ ] **Live Privy login:** complete a real login in a browser (email
      OTP or a wallet approval) and confirm the embedded wallet signs
      the UID claim and sends the mint transaction. The dev-server
      smoke check with the real App ID is already done (dev server
      clean, `/mint` 200, SDK chunk loaded, connect button in the
      bundle); only the visual render and the real login remain. Guide:
      `docs/PRIVY_SETUP_GUIDE.md`.
- [ ] **Live OKX Wallet signature:** complete a `personal_sign`
      through the OKX extension in a browser and confirm the claim
      succeeds. Guide: `docs/OKX_WALLET_GUIDE.md`.
- [ ] **Deploy the wallet-connect work** (merge to the integration
      branch, then deploy to Vercel with `NEXT_PUBLIC_PRIVY_APP_ID`
      set): not done. Needs the user's approval.
- [ ] **Tape out the policy circuit:** tape out
      `circuits/policy-circuit.netlist.json` (5 gates) on X Layer; record
      the processor contract address and Circuit ID; open the container.
      Needs real OKB (see `docs/TAPEOUT_INTEGRATION.md`).
- [ ] **Deploy the registry and factory contracts** to X Layer mainnet;
      set `XAVERUS_PASSPORT_FACTORY` so the mint route returns real
      calldata. Needs the user's key and approval.
- [ ] **First mainnet anchor:** anchor one real proof with
      `scripts/anchor-proof.mjs --send` (after a dry-run); record the
      transaction hash.
- [ ] **Verify the mint end to end on mainnet** once the above exist
      (X app + circuit + contracts), and record the evidence.
- [ ] **Fill in the submission form** at
      https://web3.okx.com/xlayer/build-x-series with this draft plus the
      artefacts above, before 8 December 2026, 06:59 WIB.
