# Spec: Human-Proof Minting for the Safety Passport

Build X Series (X Layer TapeOut Accelerate) — new development on Xaverus.
Branch: `build-x/human-proof-mint`. Status: final — TapeOut shape decided per
ADR-0002, based on the research in `docs/TAPEOUT_RESEARCH.md`.

Vocabulary follows `GLOSSARY.md`. ADR-0001 governs the OKX UID Claim,
ADR-0002 the TapeOut shape, ADR-0003 the Mint Gate placement.

## Problem Statement

A Safety Passport can be minted by any wallet today, including wallets a bot
farms by the thousand. The passport therefore says nothing about whether a
real person stands behind it, and any agent or service that trusts a passport
has no reason to trust that a human is involved. For the Build X Series the
project also needs substantial new development completed during the event,
and that new development must use TapeOut.

## Solution

Human-proof minting: before a wallet can mint a Safety Passport, it must
present a Human Proof — an X Binding (its X.com account, verified through
X OAuth and tied to the wallet by signature) plus an OKX UID Claim (the
user's OKX exchange UID, declared by the user and bound to the wallet by
signature). The Mint Gate refuses any mint without a valid Human Proof.
The proof is anchored through TapeOut in two real ways (ADR-0002): the proof
hashes are stored as a JSON file in a TapeOut circuit's container, and a small
NAND policy circuit is evaluated read-only through `eval()` as part of the
mint decision. The circuit enforces the mint rule openly; it does not verify
identity, and nothing in the submission may claim otherwise.

No passwords are ever requested or stored. The OKX UID is never presented
as verified by OKX: it is the user's own signed claim, and every surface
says so.

## User Stories

1. As a person minting a Safety Passport, I want to connect my X.com account during minting, so that my passport is tied to a real human account.
2. As a person minting, I want to declare my OKX exchange UID and sign it with my wallet, so that my exchange identity is bound to my passport without sharing a password or API key.
3. As a person minting from a DEX wallet, I want to paste my OKX UID as part of the mint flow, so that I can mint without leaving my own wallet.
4. As a person minting, I want the mint to be refused when I have no Human Proof, so that bots cannot mint passports.
5. As a person who already minted, I want my Human Proof to be readable afterwards, so that anyone can see my passport is human-backed.
6. As a person minting, I want honest wording everywhere that the OKX UID is my own claim and not a verification by OKX, so that I am never misled about what was checked.
7. As a person minting, I want one X account to bind to at most one wallet, so that a single human cannot mint an army of passports.
8. As a developer setting up the feature, I want X OAuth credentials configured through environment variables only, so that no secret ever lands in the repository.
9. As a developer setting up the feature, I want a step-by-step guide for creating the X application in the X Developer Portal, so that the one human step is easy to follow.
10. As a developer, I want the whole flow testable locally without mainnet, so that the Mint Gate can be proven before anyone deploys it.
11. As a judge evaluating the submission, I want to see what TapeOut is used for and where, so that the integration can be checked rather than taken on trust.
12. As a judge evaluating the submission, I want a demo that shows a mint being refused without a Human Proof and allowed with one, so that the gate is visibly real.

## Implementation Decisions

- Minting means deploying a new Safety Passport instance whose owner is the minting wallet. The Mint Gate guards that deployment.
- The Human Proof has exactly two parts, both bound to the same wallet: the X Binding and the OKX UID Claim. Either part missing means no proof.
- X verification uses X OAuth 2.0 with PKCE, server-side only. The server exchanges the code, reads the X user id and handle, and never sees or stores the user's X password.
- The wallet binds itself to the X account and the UID by signing a binding message that names the wallet address, the X user id, the OKX UID, and an expiry. The server recovers the signer from the signature and rejects anything that does not match the minting wallet.
- One X account binds to at most one wallet, and one wallet holds at most one Human Proof. A second binding attempt for an already-bound X account or wallet is refused, unless it is the same wallet and X account, which re-records as a no-op success.
- The OKX UID is stored as a hash, never in plain text on-chain, and is always labelled a user claim (ADR-0001).
- The mint decision is server-authoritative, matching the existing safety service: the browser is an untrusted UI and the wallet remains the signing boundary. The mint service returns deploy calldata for the wallet to sign, the same shape as the existing authorize route.
- The Mint Gate lives beside the passport contract, not inside it (ADR-0003): the existing passport contract is untouched, and two new contracts — a proof registry and a minting factory — give the official mint path an on-chain check. The honest guarantee is "every passport minted through Xaverus carries a Human Proof".
- TapeOut shape (ADR-0002): (A) proof hashes anchored as a JSON file in the policy circuit's container through SiteRegistry, readable and SHA-256 verifiable by anyone; (B) one small NAND policy circuit (verified-X AND signed-UID-claim AND NOT revoked) evaluated read-only through `eval()` from the backend, with the result recorded at mint time. The circuit never sees raw personal data — only hashes and boolean flags.
- This build is strictly additive. Every existing feature keeps working untouched: the Safety Passport policy engine, the A2MCP safety-check service, the x402 seller, the marketplace UI, and the activity trail. New code is new files; the only edits to existing files are wiring (navigation, environment example, test scripts). If new code conflicts with an old feature, the new code adapts around the old feature and the conflict is reported — the old feature is never removed.
- No new mainnet deployment happens in this build. Contract changes are built and tested locally only; deployment is a later human step that needs the user's key and approval.
- No secrets in the repository. X OAuth credentials live in environment variables, documented in `.env.example`.

## Testing Decisions

- A good test here verifies behaviour through a public seam: a mint allowed or refused, a signature accepted or rejected, a proof issued or denied. Tests never reach into internals.
- Seams under test: (1) the human-proof library (message building, signature recovery, proof validation, binding rules); (2) the mint API routes (OAuth callback, claim submission, mint-gate decision); (3) the on-chain gate, if the design puts the gate in a contract (tested with Foundry against a local chain).
- Prior art: the existing safety tests run under the Node test runner against TypeScript directly. New TypeScript tests follow the same shape.
- X's API is never called by tests: the OAuth exchange is tested behind a stubbed HTTP seam with recorded-shaped responses, never live credentials.
- Signature tests use freshly generated throwaway keys, never a real key.
- The full suite (TypeScript tests plus contract tests) must pass locally before the work is called done.
- Regression: every pre-existing test, the production build, and the existing contract compilation must keep passing, and the behaviour of every existing route and page must be unchanged. Any regression blocks the build from being called done.

## Out of Scope

- Deploying new contracts to mainnet or any live network.
- Deploying the app to Vercel.
- Verifying the OKX UID against OKX systems (not possible from outside OKX).
- Passwords, KYC, government identity checks, or any handling of exchange credentials.
- Changes to the Launch Pass.
- Revoking or replacing a Human Proof after minting (a later iteration; the first version binds once).
- Calling `eval()` from inside a contract (no canonical ABI is confirmed yet; the backend calls it read-only instead).
- The DeWEB static mirror (optional later work, only if time remains).
- Modifying or removing any existing feature.
- Claiming the TapeOut integration is live on mainnet before it is deployed and verified there.

## Further Notes

- Docs to write in this build: a human-proof minting guide, a TapeOut integration doc, a Build X submission draft with honest TODOs for the demo video and the submission form, and updates to the build log and README.
- The X Developer Portal application is a human step: the guide must cover it end to end, because the agent cannot create it.
- Submission deadline: 8 December 2026, 06:59 WIB. Prize pool: 100,000 USDT.
