# Xaverus

The domain language of Xaverus, a safety layer that puts deterministic spend policy between an autonomous agent's intent and the wallet that executes it on X Layer.

## Language

**Safety Passport**:
A single-owner on-chain policy ledger (one deployed `XaverusPassport` contract instance) that records spend limits, daily spend, and the kill switch for one owner wallet. It never holds or moves funds.
_Avoid_: Passport (alone), Pass

**Mint**:
Creating a new Safety Passport by deploying a fresh contract instance whose owner is the minting wallet.
_Avoid_: Token mint, NFT mint — a mint here creates a policy contract, not a token

**Launch Pass**:
A separate paid-access concept for launching with Xaverus. It is not a Safety Passport and it is not part of human-proof minting.
_Avoid_: Passport

**Human Proof**:
Evidence that the wallet minting a Safety Passport is controlled by a real person rather than a bot. A Human Proof is exactly one X Binding plus one OKX UID Claim for the same wallet.
_Avoid_: KYC, identity verification — a Human Proof is not a government identity check

**X Binding**:
A verified link between a wallet address and an X.com account, established when the account owner completes X OAuth and the wallet signs a binding message.
_Avoid_: X login, Twitter auth

**OKX UID Claim**:
A user-declared OKX exchange UID bound to a wallet by that wallet's signature. A claim made by the user, not a verification performed by OKX.
_Avoid_: OKX verification, OKX KYC

**Mint Gate**:
The check that refuses a mint unless a valid Human Proof exists for the minting wallet.
_Avoid_: Allowlist, whitelist

**Wallet Adapter**:
The one shared seam the mint flow talks to for any wallet: current
address, current chain id, sign a message, send a transaction, switch to
X Layer. One implementation per wallet source (Privy wallet, OKX Wallet
native, browser-injected provider). The mint page never talks to a wallet
SDK or an injected provider directly.
_Avoid_: Wallet provider, wallet SDK — the adapter sits between the mint
flow and those

**Privy Login**:
Logging in through Privy on the mint page, with email or with an external
wallet. An email login creates an embedded wallet automatically; a wallet
login connects OKX Wallet, MetaMask, or another detected wallet. Privy is
optional: without a configured App ID, the app runs exactly as before.
_Avoid_: Privy auth, social login

**Embedded Wallet**:
A wallet Privy creates automatically for a user who logs in with email
and has no wallet of their own. The user never installs anything and
never sees a private key; the wallet signs and sends through the shared
wallet adapter like any other wallet.
_Avoid_: Custodial wallet, hosted wallet

**OKX Wallet (native)**:
The dedicated mint-page path that talks to the OKX browser extension
directly through `window.okxwallet`, never through `window.ethereum`:
one button connects, moves the wallet to X Layer, and signs and sends
through the extension. Distinct from connecting OKX Wallet through the
Privy login list.
_Avoid_: OKX Wallet (alone, when the Privy path is meant)
