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
