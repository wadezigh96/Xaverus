# X402 Mainnet Payment Evidence

## Verified production settlement

This document records a completed Xaverus x402 payment on **X Layer mainnet**.

- **Endpoint:** `https://xaverus.vercel.app/api/x402/service`
- **Network:** `eip155:196`
- **Scheme:** `exact`
- **Asset:** USD₮0
- **Asset contract:** `0x779ded0c9e1022225f8e0630b35a9b54be713736`
- **Amount:** `10000` atomic units = **$0.01**
- **Buyer / payer:** `0x30b408Bc118704dbcA4BF8778E79b64Ab8c3b051`
- **Pay-to:** `0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03`
- **x402 payment ID:** `18340201`
- **HTTP response after payment:** `200`
- **Payment response:** `success: true`
- **Initial payment status:** `pending`
- **Settlement transaction:** `0x7544c3e9076c2c203362c19683fca54fa15676da86e6b6d2881d872dff187d35`
- **Receipt status:** `0x1` (successful)
- **Block:** `0x44c2933` (decimal 71,840,051)

## On-chain receipt verification

The transaction receipt was queried directly from the X Layer mainnet RPC using `eth_getTransactionReceipt`.

The receipt returned:

- `status: 0x1`
- token contract: `0x779ded0c9e1022225f8e0630b35a9b54be713736`
- ERC-20 transfer amount: `0x2710` = 10,000 atomic units
- ERC-20 transfer from: `0x30b408Bc118704dbcA4BF8778E79b64Ab8c3b051`
- ERC-20 transfer to: `0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03`

This is the production settlement evidence for the x402 seller flow. No private key, secret, or buyer credential is stored in this repository.

## Reproduction boundary

The buyer was maintained in a separate local project:

`~/Xaverus-x402-buyer`

The buyer used the OKX x402 EVM client signer and was configured to accept only:

- X Layer mainnet `eip155:196`
- `exact` scheme
- the USD₮0 contract above
- exactly 10,000 atomic units
- the Xaverus pay-to address above

The buyer private key was kept only in the local `.env` file and was not committed.

## Evidence status

**Production x402 settlement: VERIFIED on-chain.**

This evidence does not claim that Xaverus's Agentic Wallet or autonomous execution integrations are enabled; those remain separate configuration boundaries.
