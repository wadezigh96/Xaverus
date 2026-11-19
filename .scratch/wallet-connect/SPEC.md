# Spec: Wallet Connect for Minting (Privy + OKX Wallet Native)

Build X Series (X Layer TapeOut Accelerate) — new development on Xaverus.
Branch: `build-x/human-proof-mint`. Status: final — research complete, both
modules decided.

Vocabulary follows `GLOSSARY.md`. Research notes (outside the repo, primary
sources only, checked 19 Nov 2026):
`~/workspace/Xaverus-wallet-research/X_LAYER_CHAIN.md`,
`~/workspace/Xaverus-wallet-research/PRIVY_SDK.md`,
`~/workspace/Xaverus-wallet-research/OKX_WALLET.md`.

## Problem Statement

Minting a Safety Passport today asks the user to type their wallet address
by hand, then sign and send with whatever wallet happens to be injected in
the browser. There is no guided way to connect a wallet, no help switching
to X Layer, and no path at all for a person (or a judge) who has no wallet
installed. For an OKX contest there is also no native OKX Wallet path — the
wallet most X Layer users actually have.

## Solution

Two wallet-connect modules feeding the same mint flow, side by side:

- **Privy**: login with email (which creates an embedded wallet
  automatically) or with an external wallet (OKX Wallet, MetaMask, and other
  detected wallets). The mint page takes the wallet address, the claim
  signature, and the mint transaction from the connected Privy wallet.
- **OKX Wallet native**: a dedicated "Connect OKX Wallet" button that talks
  to the OKX Wallet extension directly, connects, and moves it to X Layer.
  Signing and sending go through OKX Wallet. When no extension is present,
  the user gets a link to the official OKX Wallet download page.

Both modules feed one shared wallet seam, so the mint flow itself does not
care which wallet the user connected with. Typing an address by hand stays
available as a fallback when no wallet is connected, and the whole app keeps
working exactly as before when no Privy App ID is configured.

No passwords are ever requested or stored. The Privy App ID is a public key
(safe for client use); the Privy App Secret is never needed and must never
be asked for or used.

## User Stories

1. As a person minting, I want to log in with my email and get a wallet automatically, so that I can mint without installing anything.
2. As a person minting, I want to connect my OKX Wallet with one button, so that I can mint from the wallet I already use on X Layer.
3. As a person minting, I want to connect MetaMask or another wallet I already have, so that I am not forced onto one wallet.
4. As a person minting, I want my wallet moved to X Layer automatically when I connect, so that I never sign on the wrong network.
5. As a person minting, I want the wallet address filled in automatically once connected, so that I never mistype an address.
6. As a person minting, I want to sign the UID claim and the mint transaction with the connected wallet, so that the whole flow happens in one place.
7. As a person on a phone without a wallet extension, I want a clear link to get OKX Wallet, so that I know exactly what to install.
8. As a person who declines a wallet popup, I want a polite message and a retry button, so that a mistake doesn't trap me.
9. As a person whose wallet is on the wrong network, I want the app to offer the switch (and add X Layer if it is missing), so that I don't have to configure the network by hand.
10. As a developer setting up the feature, I want the Privy App ID configured through environment variables only, so that no credential ever lands in the repository.
11. As a developer, I want the app to keep working exactly as before when no Privy App ID is configured, so that a missing key never breaks the site.
12. As a developer setting up the feature, I want a step-by-step guide for creating the Privy app and allowing the live domain, so that the human steps are easy to follow.
13. As a developer, I want the whole flow testable locally without a real Privy account, so that wallet logic is proven before anyone deploys it.
14. As a judge evaluating the submission, I want to connect a wallet and reach the mint flow without installing anything, so that the demo is one click away.
15. As a judge, I want to see that OKX Wallet has a native path (not just a generic wallet list), so that the OKX integration is visibly real.
16. As a judge, I want the submission to say plainly what was verified live and what was not, so that nothing is taken on trust.

## Implementation Decisions

- One shared wallet seam: a small wallet adapter (address, chain id, sign a
  message, send a transaction, switch chain) with one implementation per
  wallet source (Privy wallet, OKX Wallet provider, browser-injected
  provider). The mint page talks only to the adapter, never to a wallet SDK
  directly. The existing direct `window.ethereum` calls in the mint page move
  behind the browser-injected adapter, with behaviour unchanged.
- When both wallets are connected at once, the most recently connected
  one signs and sends (`lastWalletSource` in `app/mint/page.tsx`),
  matching the address it filled into the wallet field; if it
  disconnects, the flow falls back to the other connected wallet, then
  to the browser-injected provider. The mint flow itself still does not
  care which wallet is connected — this rule only decides which adapter
  answers when more than one is available, so a two-wallet page has one
  clear signing wallet instead of an ambiguous one.
- One shared X Layer chain definition, built from the verified values in the
  research notes (chain id 196, name "X Layer mainnet", OKB, RPC
  `https://rpc.xlayer.tech` with `https://xlayerrpc.okx.com` as backup,
  explorer `https://www.okx.com/web3/explorer/xlayer`). Both modules and the
  add-chain parameters use this one definition. The OKB 18-decimal value
  comes from viem's official chain definition, not from OKX docs — the code
  comment and docs say so.
- Privy: install the latest `@privy-io/react-auth` (3.52.0 at research time;
  recheck at install time). The provider lives in a client-side providers
  component used by the root layout. Configuration: login methods email and
  wallet; X Layer as default chain and the only supported chain; embedded
  wallets created on login for users without wallets; wallet list OKX Wallet
  first, then MetaMask, then detected wallets. The embedded-wallet RPC is
  overridden explicitly to the official X Layer RPC.
- Privy is optional at runtime. When no App ID is configured, no Privy
  provider is mounted and the mint page behaves exactly as it does today
  (manual address plus browser wallet). The provider wrapper must never throw
  for a missing App ID, and no Privy code path may run without one.
- Privy wallet use waits for the SDK ready state before touching any wallet,
  and every wallet operation names the wallet address explicitly.
- OKX Wallet native: detection is the presence of `window.okxwallet`,
  resolved fresh on every connect (never cached at module level). The module
  never touches `window.ethereum`, so it cannot disturb Privy or other
  wallets. Connect requests accounts; then the module ensures X Layer by
  switching chain, adding X Layer from the shared chain definition when the
  wallet reports it missing (error 4902) and retrying the switch, then
  verifying the chain afterwards. Signing uses `personal_sign` with the
  hex message first and the address second; sending uses `eth_sendTransaction`.
  A refused request (error 4001) is a polite message plus a retry button,
  never a system error and never an automatic re-popup. Every wallet button
  is disabled while its request is pending. Account and chain changes update
  the UI reactively (no page reload); listeners are removed on unmount.
- Honest limits, recorded in code and docs: `personal_sign` through the OKX
  extension is standard EIP-1193 and very likely supported, but it was not
  verified in OKX's official extension documentation — live verification
  stays an open item. The `eth_chainId` formatting note in OKX's old examples
  means the chain check normalises the hex value and cross-checks the
  provider's own chain id property where available.
- Mobile without an extension: the OKX path shows a link to the official
  download page (`https://web3.okx.com`). No `okx://` deep link is used:
  no official source verifies such a scheme for third-party DApps.
- Environment: the Privy App ID comes only from `NEXT_PUBLIC_PRIVY_APP_ID`,
  documented with a placeholder in the env example. The real App ID lives in
  the local ignored env file only and is never written into any tracked file.
  The Privy App Secret is never needed.
- This build is strictly additive. Every existing feature keeps working
  untouched: the Safety Passport policy engine, the A2MCP safety-check
  service, the x402 seller, the marketplace UI, the activity trail, and the
  human-proof minting flow itself. New code is new files; the only edits to
  existing files are wiring. If new code conflicts with an old feature, the
  new code adapts around the old feature and the conflict is reported — the
  old feature is never removed.
- No mainnet transaction happens in this build. Live verification is limited
  to a dev-server smoke check with the real App ID (provider mounts, connect
  buttons render, no errors). Completing a real login (email OTP or a wallet
  approval) needs a human with a browser and stays a documented remaining
  step, never a claimed verification.

## Testing Decisions

- A good test here verifies behaviour through a public seam: a wallet
  connected or refused, a chain switched or added, a message signed, a
  transaction sent, a fallback used when no App ID exists. Tests never reach
  into internals.
- Seams under test: (1) the wallet adapter and chain definition (pure
  library code, including error classification for refused requests and
  missing chains); (2) the Privy configuration builder (a pure function of
  environment to config — no App ID needed); (3) the OKX provider wrapper
  behind a mocked provider (connect, switch, add-chain-and-retry, sign,
  send, error paths); (4) the mint routes and pages over HTTP (the mint page
  returns 200 with and without an App ID configured).
- Prior art: the existing tests run under the Node test runner against
  TypeScript directly. New TypeScript tests follow the same shape, with
  stubbed providers shaped like the real ones.
- Privy's SDK is never called live by tests: every Privy interaction is
  tested behind a mock. Tests never need the real App ID. The real App ID is
  used only in the manual dev-server smoke check.
- Signature tests use freshly generated throwaway keys, never a real key.
- The full suite (TypeScript tests plus contract tests plus route checks)
  must pass locally before the work is called done.
- Regression: every pre-existing test, the production build, and the existing
  contract compilation must keep passing, and the behaviour of every existing
  route and page must be unchanged. Any regression blocks the build from
  being called done.

## Out of Scope

- OKX Connect SDK (`@okxconnect/ui`), WalletConnect, and QR-based flows.
- Any `okx://` deep link.
- Merging to main or deploying to Vercel (needs the user's approval; a
  separate step after this build).
- Mainnet transactions, contract deployment, tape-out.
- Changes to the Launch Pass, the x402 seller, the A2MCP service, or the
  safety policy engine.
- Revoking or replacing a Human Proof after minting.
- Modifying or removing any existing feature.
- Claiming a live Privy login or a live OKX signature was verified before a
  human has actually done it in a browser.

## Further Notes

- Docs to write in this build: a Privy setup guide (creating the Privy app,
  enabling email + wallet login, allowing the live domain, App ID in local
  env and in Vercel env vars), an OKX Wallet guide, updates to the build log,
  README, human-proof minting doc, submission draft (wallet connect as part
  of the new development), and glossary entries for the new terms.
- The Privy dashboard steps (create the app, enable login methods, allow the
  live domain) are human steps: the guide must cover them end to end, because
  the agent cannot do them. The App ID itself already exists (given by the
  user, stored only in the local ignored env file for testing).
- Submission deadline: 8 December 2026, 06:59 WIB. Prize pool: 100,000 USDT.
