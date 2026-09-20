# OKX Integration Plan

## Current working service
Xaverus exposes a free A2MCP-compatible safety service:
- GET /api/agent/manifest
- POST /api/agent/safety-check

The service accepts an agent payment intent and returns a deterministic policy decision. It intentionally does not move funds. OKX's A2MCP documentation supports free endpoints and x402 pay-per-call endpoints.

## Next production payment layer
Use the official OKX Payment SDK for a paid version rather than implementing x402 settlement manually. The Node.js stack documented by OKX uses @okxweb3/x402-express, @okxweb3/x402-core and @okxweb3/x402-evm, with server-side API credentials.

For an Agent-to-MCP service, OKX supports a pay-per-call x402 endpoint that returns HTTP 402 until payment is completed, then the request is replayed.

## Agentic Wallet
Live execution should use the official OKX Agentic Wallet / Onchain OS security boundary. Never put API keys, passphrases, private keys or seed phrases in browser code or GitHub.

## Registration checklist
1. Deploy Xaverus to a public HTTPS domain.
2. Verify the manifest and safety-check endpoints externally.
3. Install/log in to Onchain OS with an Agentic Wallet.
4. Register Xaverus as an A2MCP ASP using the official OKX.AI flow.
5. Submit the endpoint for review/listing.
6. Test an OKX AI agent calling the safety service.
7. Only then enable paid x402 execution with server-side OKX credentials.
