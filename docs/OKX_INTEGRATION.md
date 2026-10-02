# OKX Integration Plan

## Current working service
Xaverus exposes a free A2MCP-compatible safety service:
- GET /api/agent/manifest
- POST /api/agent/safety-check

The service accepts an agent payment intent and returns a deterministic policy decision. It intentionally does not move funds. OKX's A2MCP documentation supports free endpoints and x402 pay-per-call endpoints.

## Current production x402 layer
Xaverus has a production x402 seller configured for X Layer mainnet (`eip155:196`) at $0.01 per paid service request. Mainnet settlement has been independently verified on-chain.

The x402 payment layer is separate from transaction execution. A successful x402 payment does not cause Xaverus to sign or broadcast a user transaction.

The production x402 configuration is intentionally mainnet-only. No non-production network is part of the production submission path.

## Agentic Wallet / execution boundary
Xaverus production execution is currently disabled. Xaverus does not hold user private keys and does not sign or broadcast transactions.

If a future integration uses the official OKX Agentic Wallet / Onchain OS security boundary, signing must remain inside the selected wallet/security environment. Never put API keys, passphrases, private keys or seed phrases in browser code or GitHub.

## Registration checklist
1. Deploy Xaverus to a public HTTPS domain.
2. Verify the manifest and safety-check endpoints externally.
3. Install/log in to Onchain OS with an Agentic Wallet.
4. Register Xaverus as an A2MCP ASP using the official OKX.AI flow.
5. Submit the endpoint for review/listing.
6. Test an OKX AI agent calling the safety service.
7. Any future execution integration must be separately enabled and independently verified; the current production service remains decision-only with an external wallet execution boundary.
