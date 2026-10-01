# Xaverus x402 integration

Xaverus is demo-safe by default. The paid service endpoint is /api/x402/service.

## Official OKX flow

OKX current Payment SDK supports seller-side x402 middleware on X Layer using CAIP-2 network eip155:196. The official Next.js SDK exposes withX402; the seller flow returns HTTP 402 when payment is required and verifies settlement before returning the resource.

Xaverus keeps the safety layer separate from payment settlement:

Agent -> Xaverus policy check -> approval/spend cap -> x402 payment -> protected service

## Server-only configuration

Set these in Vercel Environment Variables, never in browser code, GitHub, screenshots, or chat:

- OKX_API_KEY
- OKX_API_SECRET
- OKX_API_PASSPHRASE
- XAVERUS_PAY_TO_ADDRESS
- XAVERUS_X402_PRICE (default $0.01)
- XAVERUS_X402_ENABLED=true

The production seller is configured for **X Layer mainnet (eip155:196)**. The current evidence covers the HTTP 402/protected-resource layer and the included buyer probe. A completed payment/settlement claim should only be made when the corresponding transaction hash has been captured.

For safe validation without real funds, the same implementation supports X Layer testnet eip155:1952 when selected through the server-side network setting.

## Safety boundary

This endpoint is a seller-side payment gate for the Xaverus service. It does not expose private keys and does not turn the browser into a signer. Live autonomous payment execution remains a separate integration and must be tested end-to-end before claiming production execution.
