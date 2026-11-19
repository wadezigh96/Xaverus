# Human-Proof Minting

How a Safety Passport is minted with a Human Proof: an X Binding verified
through X OAuth plus an OKX UID Claim signed by the minting wallet. Built
for the OKX X Layer Build X Series ("X Layer TapeOut Accelerate"), November
2026. Vocabulary follows `GLOSSARY.md`; the decisions behind this design
are in `docs/adr/0001-okx-uid-signed-claim.md` (the UID is a signed claim)
and `docs/adr/0003-mint-gate-beside-passport.md` (the gate lives beside the
passport contract, not inside it).

**Status (19 Nov 2026):** the full flow is implemented and tested locally,
including wallet connect (Privy login and a native OKX Wallet button —
see below). No mainnet deployment has happened: the registry and factory
contracts are not deployed, the policy circuit is not taped out yet, and
no proof has been anchored on mainnet. The X app "Xaverus Mint" exists
and its OAuth 2.0 Client ID is confirmed and configured locally; the
Client Secret stays with the user and goes directly into Vercel, and
full X OAuth verification happens on the live site after deploy. See
[docs/BUILD-X-SUBMISSION.md](BUILD-X-SUBMISSION.md) for the honest TODO
list.

## What a Human Proof is

A Human Proof is exactly two parts, both bound to the same wallet:

1. **X Binding** — a verified link between the wallet and an X.com account.
   The account owner completes X OAuth 2.0 with PKCE (server-side only);
   the server exchanges the code, reads the X user id and handle, and
   records the binding against the wallet that started the flow.
2. **OKX UID Claim** — the user's OKX exchange UID, declared by the user
   and bound to the wallet by the wallet's signature over a binding
   message. **This is a claim made by the user, not a verification
   performed by OKX** (ADR-0001). OKX offers no public endpoint that
   confirms a UID belongs to a given person or wallet, and Xaverus never
   asks for an OKX password or API key.

Either part missing means no proof, and the Mint Gate refuses the mint.
One X account binds to at most one wallet, and one wallet holds at most
one Human Proof, so a single human cannot mint an army of passports.

A Human Proof is not KYC and not a government identity check. It is
evidence that a real person's X account and a declared exchange UID stand
behind a wallet — cheap for a real person, expensive to fake at scale.

### What is stored, and what is never stored

| Data | Storage |
| --- | --- |
| X user id | Stored (numeric public identifier, needed to audit the binding) |
| X handle | SHA-256 of the lowercased handle only, never the handle itself |
| OKX UID | SHA-256 only, never the UID itself, never logged |
| Wallet signature | Stored with the proof (needed to rebuild the proof hash) |
| X access token | Used once for `users/me`, then discarded; never stored or logged |
| X password / OKX password / OKX API key | **Never requested, never stored, never seen** |

The on-chain commitment to a proof is `proofHash()`: `keccak256` of the
exact binding message the wallet signed. It commits to the wallet, the X
user id, the UID hash, and the expiry, without revealing the raw UID. This
is the `bytes32` the proof registry stores.

## The four steps (page `/mint`)

The mint page (`app/mint/page.tsx`) walks the user through four steps:

1. **Connect your wallet and X.** Connect a wallet — log in with Privy
   (email or an external wallet), connect OKX Wallet natively, or type a
   wallet address by hand — then press "Connect X". The browser is
   redirected to X to approve Xaverus; X returns to
   `/api/mint/x/callback`, and the server records the X Binding.
   The X user id then appears on the page automatically (read from
   `/api/mint/binding` — the user never types their numeric id by hand).
2. **Claim your OKX UID.** Paste the UID from the OKX account. The page
   states plainly that this is a user-signed claim, not a verification by
   OKX, and warns never to enter an OKX password or API key.
3. **Sign with your wallet.** The wallet signs a binding message naming
   the wallet address, the X user id, the OKX UID hash, and an expiry
   (15 minutes from issue). The signature proves the wallet owner made
   the claim; it does not move funds. The server recovers the signer and
   rejects anything that does not match the minting wallet. On success the
   Human Proof is issued and its hashes are shown.
4. **Mint your Safety Passport.** The server checks the Human Proof (and,
   when configured, evaluates the TapeOut policy circuit — see
   [docs/TAPEOUT_INTEGRATION.md](TAPEOUT_INTEGRATION.md)) and returns the
   mint transaction. The user reviews it, then the wallet signs and
   broadcasts it. Minting deploys a new Safety Passport contract owned by
   the wallet; it is not a token mint.

Without a Human Proof, step 4 is refused: the page says so, and the mint
route answers `403`.

### Connecting with Privy

Step 1 offers a Privy login button (`app/mint/privy-wallet-connect.tsx`,
`lib/privy-config.ts`, `lib/privy-wallet.ts`, `components/providers.tsx`)
whenever a Privy App ID is configured: log in with email, which creates
an embedded wallet automatically, or with an external wallet (OKX Wallet
first, then MetaMask, then detected wallets) through the Privy modal.
The connected wallet's address fills the wallet field, and the UID claim
signature (step 3) and the mint transaction (step 4) go through that
wallet via the shared wallet adapter (`lib/wallet-adapter.ts`), only
after the SDK reports ready. X Layer is the default and only supported
chain; the page offers a switch button when the wallet is elsewhere. The
shared chain definition (`lib/x-layer-chain.ts`) carries the verified
values (id 196, OKB, official RPCs and explorer); its OKB 18-decimal
value comes from viem's official chain definition, not from OKX docs,
which do not state the decimals explicitly. When both Privy and OKX
Wallet are connected, the most recently connected one signs and sends,
and the page falls back to the other one if it disconnects.

Privy is strictly optional: with no App ID configured, no Privy provider
is mounted, no Privy login UI renders, and the page behaves exactly as
before (manual address plus OKX Wallet). The App ID is a public key and
comes only from `NEXT_PUBLIC_PRIVY_APP_ID`; the Privy App Secret is never
needed and must never be asked for or used. Setup guide (Indonesian):
[docs/PRIVY_SETUP_GUIDE.md](PRIVY_SETUP_GUIDE.md).

Honest limit: a real Privy login (email OTP or a wallet approval) has
not been completed yet — it needs a human in a browser and stays an open
item, along with the visual rendering in a browser. The dev-server smoke
check with the real App ID is done (ticket 03): the dev server started
clean with the real App ID (no Privy errors or warnings in the log),
`/mint` returned 200, the Privy SDK chunk loaded, and the "Log in with
email or wallet" label was present in the client bundle. Nothing here
claims a live login was verified.

### Connecting with OKX Wallet

Step 1 also offers a native OKX Wallet path (`app/mint/okx-wallet-connect.tsx`,
`lib/okx-wallet.ts`): one button talks to the OKX extension directly
through `window.okxwallet`, connects, and moves the wallet to X Layer
(adding the chain first when the wallet does not have it). The connected
address fills the wallet field, and the UID claim signature (step 3) and
the mint transaction (step 4) go through the OKX extension via the shared
wallet adapter. Typing an address by hand stays available as a fallback.
When no extension is present, the page links to the official download page
(`https://web3.okx.com`); no `okx://` deep link is used.

Honest limit: signing uses `personal_sign`, the standard EIP-1193 method.
OKX documents `personal_sign` by name for its App Wallet SDK, but its
official extension documentation does not name it, so a live signature
through the OKX extension has not been verified yet and stays an open
item. Nothing here claims otherwise. User guide (Indonesian):
[docs/OKX_WALLET_GUIDE.md](OKX_WALLET_GUIDE.md).

## API reference

All mint routes live under `app/api/mint/`. Every response that concerns
the UID carries the note: *"The OKX UID is a user-signed claim, not a
verification by OKX."* All routes are `force-dynamic`.

### `GET /api/mint/x/authorize`

Start an X OAuth flow for a wallet.

- Query: `?wallet=0x...`
- Success: `302` redirect to X's authorization page
  (`https://twitter.com/i/oauth2/authorize`, scope `users.read`, PKCE S256).
  The server remembers a single-use state value tied to the wallet; the
  flow must complete within 10 minutes.
- Errors: `400` missing or invalid wallet; `500` X OAuth not configured
  on the server.

### `GET /api/mint/x/callback`

X OAuth callback. X redirects here with `?code=...&state=...` (or
`?error=...` when the user denies).

- The server validates the single-use state, exchanges the code
  server-side (Basic auth, client id + secret — the secret never leaves
  the server), reads the X user id and handle from `users/me`, and
  records the X Binding against the wallet that started the flow. The
  access token is discarded immediately after the user lookup.
- Always redirects back to the mint page with a generic outcome flag:
  `/mint?x=connected` or `/mint?x=error`. Failure details are logged
  server-side only and never leak to the browser.

### `POST /api/mint/message`

Build the binding message the wallet signs.

- Body: `{wallet, xUserId, okxUid}`. POST, not GET: the raw UID must never
  travel in a URL query string, where it would land in browser history,
  server access logs, and analytics.
- Success (`200`): `{ok: true, message, expiresAt, claim}`. The server
  hashes the UID and picks the expiry (15 minutes); the browser never
  builds the message itself, and the raw UID is never returned.
- Errors: `400` invalid JSON, invalid wallet, missing X user id, or
  missing UID.

The message shape (`buildBindingMessage` in `lib/human-proof.ts`):

```text
Xaverus Human Proof

I bind this wallet to my X account and claim the OKX UID below.
This signature proves I control the wallet. It does not move funds.
Wallet: 0x...
X user ID: ...
OKX UID hash: <64 hex chars>
Chain: X Layer (196)
Expires: <unix seconds>
```

### `POST /api/mint/claim`

Submit the signed binding and receive a Human Proof.

- Body: `{wallet, xUserId, okxUid, signature, expiresAt}`. The signature
  must be a 65-byte wallet signature (`0x` + 130 hex chars) over the
  message from `/api/mint/message`.
- Success (`200`): `{ok: true, proof, claim}` where `proof` is the public
  shape — wallet, X user id, X handle hash, OKX UID hash, `issuedAt`,
  and `proofHash`. The raw UID and the signature are never returned.
- Errors: `400` invalid input or expired message; `401` signature does
  not match the minting wallet; `409` the wallet already has a Human
  Proof, or there is no X Binding for this wallet and X account (connect
  X first).

### `GET /api/mint/proof`

Read the public Human Proof for a wallet, if one exists.

- Query: `?wallet=0x...`
- Success (`200`): `{ok: true, present: true, proof, claim}` or
  `{ok: true, present: false, claim}`. The proof shape is the same public
  shape as `/api/mint/claim` (hashes only).
- Errors: `400` invalid wallet.

### `GET /api/mint/binding`

Read the X Binding for a wallet, if one was recorded through OAuth. Lets
the mint page show the bound X user id without asking the user to type it.

- Query: `?wallet=0x...`
- Success (`200`): `{ok: true, bound: true, binding: {wallet, xUserId,
  xHandleHash, boundAt}}` or `{ok: true, bound: false}`.
- Errors: `400` invalid wallet.

### `POST /api/mint/passport`

The Mint Gate. Checks the Human Proof, evaluates the TapeOut policy
circuit when one is configured, and returns the mint transaction for the
wallet to sign.

- Body: `{wallet}`.
- Success (`200`, proof valid): `{ok: true, allowed: true, transaction,
  executionPerformed: false, chain: {name: "X Layer", chainId: 196},
  proof, tapeout, claim}`. `transaction` is `{to, data, value: "0x0",
  chainId: 196}` — a call to the factory's `mint()`, which the wallet
  signs and broadcasts. The server never signs or sends anything.
- Success (`200`, factory not deployed yet): same shape, but
  `transaction: null` and a note saying to deploy the factory and set
  `XAVERUS_PASSPORT_FACTORY`. The gate still ran; only the on-chain
  target is missing.
- Errors:
  - `403` — no valid Human Proof for the wallet, or the TapeOut policy
    circuit denied the mint (when configured).
  - `503` — the policy circuit could not be evaluated (an outage, never
    reported as a denial).
  - `500` — server misconfiguration (half-configured TapeOut env, or an
    invalid factory address).

### `GET /api/mint/anchor`

Verify a wallet's anchored Human Proof: read the proof file back from the
TapeOut container and check its bytes against the on-chain SHA-256.

- Query: `?wallet=0x...`
- Success (`200`): `{ok: true, anchored: true, path, container, sha256,
  size, chunkCount, updatedAt}` when a verified anchor file exists, or
  `{ok: true, anchored: false, ...}` with an honest note when no
  container is configured yet or the wallet has no anchor file. A missing
  file is an honest answer, not a server error.
- Errors: `400` invalid wallet; `503` the anchor could not be read.

## Contracts: registry and factory

Two new contracts give the official mint path an on-chain check
(ADR-0003). `contracts/XaverusPassport.sol` is **not modified** — the
gate lives beside the passport, not inside it. Neither contract is
deployed yet.

### `XaverusHumanProofRegistry.sol`

On-chain record of Human Proofs: one proof hash per wallet. The proof
hash is an opaque `bytes32` commitment; the contract never recomputes or
verifies it. Only the authorized server writer records proofs, after
verifying the X Binding and the OKX UID Claim off-chain.

| Function | Who | Purpose |
| --- | --- | --- |
| `recordProof(wallet, proofHash)` | writer | Record one proof hash; reverts on duplicates, zero wallet, or zero hash |
| `hasProof(wallet)` | anyone | Whether the wallet has a recorded proof |
| `proofHashOf(wallet)` | anyone | The recorded hash (`bytes32(0)` if none) |

Constructor: `writer_` — the server wallet allowed to record proofs.
The writer key is a human step that needs the user's approval; this build
proves the contract with local Foundry tests only.

### `XaverusPassportFactory.sol`

Mints a Safety Passport only for a wallet with a recorded Human Proof.

| Item | Detail |
| --- | --- |
| `mint()` | Reverts `NoHumanProof()` without a recorded proof; otherwise deploys a fresh `XaverusPassport`, transfers ownership to the minter atomically in the same call, and emits `PassportMinted(minter, passport)` |
| Constructor | `registry_`, `asset_`, `perTxLimit_`, `dailyLimit_` (default policy: native USDC, 5 USDC per transaction, 25 USDC per day) |

The honest guarantee is: **every passport minted through Xaverus carries
a Human Proof** — not "no passport can exist without a proof". The
passport contract is open source, so anyone can still deploy it directly;
the gate governs the Xaverus mint path, and the registry is the public
record of which wallets proved themselves.

## Environment variables

See `.env.example` for the full list with comments. The minting variables:

| Variable | Required for | Notes |
| --- | --- | --- |
| `X_CLIENT_ID` | X OAuth | Public identifier of the X app; not a secret |
| `X_CLIENT_SECRET` | X OAuth | **Secret.** Never commit it, never paste it in chat |
| `X_REDIRECT_URI` | X OAuth | Must match the callback URL registered in the X app exactly. Production: `https://xaverus.vercel.app/api/mint/x/callback`; local: `http://localhost:3000/api/mint/x/callback` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | Privy login | Public App ID from dashboard.privy.io (see [docs/PRIVY_SETUP_GUIDE.md](PRIVY_SETUP_GUIDE.md)). Optional: when unset, no Privy provider is mounted and the mint page works as before. The Privy App Secret is never needed |
| `XAVERUS_PROOF_STORE_PATH` | Proof persistence | JSON file path; when set, bindings and proofs survive a server restart; when unset, the store is in-memory only. Required for anchoring (`scripts/anchor-proof.mjs`) |
| `XAVERUS_PASSPORT_FACTORY` | Minting | Deployed factory address; without it `/api/mint/passport` answers `allowed: true` with `transaction: null` |
| `XAVERUS_TAPEOUT_PROCESSOR` | Policy circuit | Processor contract address (see `docs/TAPEOUT_INTEGRATION.md`) |
| `XAVERUS_TAPEOUT_CIRCUIT_ID` | Policy circuit | Numeric circuit id on that processor |
| `XAVERUS_TAPEOUT_CONTAINER` | Anchoring | Container address holding the anchor files |
| `XAVERUS_TAPEOUT_RPC_URL` | TapeOut reads | Defaults to `https://rpc.xlayer.tech` |
| `XAVERUS_ANCHOR_PRIVATE_KEY` | Anchoring (`--send`) | **Secret.** The container editor's key; only used by `scripts/anchor-proof.mjs --send`. Never commit it, never paste it in chat |

## Honesty rules (ADR-0001)

These rules bind every surface — UI, API, docs, and submission:

1. The OKX UID is always called **a user-signed claim**, never a
   verification by OKX. Every mint API response carries the claim note.
2. **Never ask for or store passwords.** No X password, no OKX password,
   no OKX API key, anywhere in the flow. The UID number itself is the
   only thing the user types, and only its hash is kept.
3. A Human Proof is never called KYC or government identity verification.
4. The TapeOut policy circuit enforces the mint rule openly; it does not
   prove the minter is human (ADR-0002).

## Tests

```bash
node --test lib/*.test.ts        # 186 tests (19 Nov 2026), incl. the 6 pre-existing safety tests
forge test                        # 12 tests for the registry and factory
npm run test:routes               # 35 mint route checks over HTTP against the production build
```

X's API is never called by tests: the OAuth exchange is tested behind a
stubbed HTTP seam with recorded-shaped responses, never live credentials.
Signature tests use freshly generated throwaway keys, never a real key.

## Files

| File | What it is |
| --- | --- |
| `lib/human-proof.ts` | Core library: message building, signature recovery, proof validation, binding rules |
| `lib/human-proof-store.ts` | The one shared proof store singleton (file-backed when `XAVERUS_PROOF_STORE_PATH` is set, else in-memory) |
| `lib/human-proof-file-store.ts` | JSON file-backed proof store (atomic writes) |
| `lib/x-oauth.ts` | X OAuth 2.0 with PKCE (S256), server-side only |
| `lib/mint-transaction.ts` | Factory `mint()` calldata builder |
| `lib/mint-tapeout.ts` | TapeOut half of the mint decision |
| `lib/wallet-adapter.ts` | Shared wallet seam: address, chain id, sign, send, switch to X Layer |
| `lib/wallet-ui.ts` | Shared wallet UI helpers: error and refusal messages, address shortening, the disconnect field rule |
| `lib/x-layer-chain.ts` | The one X Layer chain definition (id 196, OKB, official RPCs and explorer) |
| `lib/privy-config.ts` | Privy config builder (pure function of env; undefined setup without an App ID) |
| `lib/privy-wallet.ts` | Privy wallet (embedded or external) behind the wallet seam |
| `lib/okx-wallet.ts` | Native OKX Wallet module (`window.okxwallet`, never `window.ethereum`) |
| `components/providers.tsx` | Client-side providers; mounts the Privy provider only when an App ID is configured |
| `app/api/mint/**` | The eight mint routes (see above) |
| `app/mint/page.tsx` | The four-step mint page |
| `app/mint/privy-wallet-connect.tsx` | Privy login button for the mint page |
| `app/mint/okx-wallet-connect.tsx` | Native OKX Wallet button for the mint page |
| `app/mint/connected-wallet-status.tsx` | Shared connected-state block for both wallet buttons |
| `app/mint/use-switch-to-x-layer.ts` | Shared "Switch to X Layer" behaviour for both wallet buttons |
| `docs/PRIVY_SETUP_GUIDE.md` | Privy setup guide (Indonesian) |
| `docs/OKX_WALLET_GUIDE.md` | OKX Wallet guide (Indonesian) |
| `contracts/XaverusHumanProofRegistry.sol` | Proof registry contract |
| `contracts/XaverusPassportFactory.sol` | Minting factory contract |
| `scripts/human-proof-demo.mjs` | Local end-to-end demo of the proof flow (no network) |
