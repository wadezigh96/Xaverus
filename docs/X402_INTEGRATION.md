# Xaverus x402 integration

Xaverus uses an OKX x402 seller service on **X Layer mainnet**. The paid service endpoint is `/api/x402/service`.

## Production flow

The production seller uses CAIP-2 network `eip155:196`. The protected resource returns HTTP 402 when payment is required and verifies the x402 settlement before returning the resource.

Xaverus keeps the safety layer separate from payment settlement:

Agent -> Xaverus policy check -> approval/spend cap -> x402 payment -> protected service

## Server-only configuration

Set these in Vercel Environment Variables, never in browser code, GitHub, screenshots, or chat:

- `OKX_API_KEY`
- `OKX_API_SECRET`
- `OKX_API_PASSPHRASE`
- `XAVERUS_PAY_TO_ADDRESS`
- `XAVERUS_X402_PRICE` (default `$0.01`)
- `XAVERUS_X402_ENABLED=true`

The production seller is configured for **X Layer mainnet (eip155:196)**. A real **$0.01 USD₮0** payment has been verified on-chain; see `docs/X402_MAINNET_PAYMENT_EVIDENCE.md` for the transaction receipt evidence.

## Mainnet boundary

The production x402 route is intentionally locked to **X Layer mainnet (`eip155:196`)**. Testnet is not part of the production submission path.

## Safety boundary

This endpoint is a seller-side payment gate for the Xaverus service. It does not expose private keys and does not turn the browser into a signer. Live autonomous payment execution remains a separate integration and must not be claimed as enabled unless its production configuration and end-to-end execution are independently verified.
