# Xaverus — OKX Dev Day Build Log

## Project

- Project: Xaverus — Safe Agent Passport
- Primary target: Build a Company
- Repository: https://github.com/wadezigh96/Xaverus
- Production: https://xaverus.vercel.app
- OKX AI ASP: Xaverus (#13805)
- Network: X Layer mainnet (chain 196)

## New functionality implemented during the build period

### 1. OKX x402 seller integration

Added a guarded seller-side x402 endpoint using OKX's x402 packages.

Evidence:
- `/api/x402/service`
- server-only OKX credentials
- configurable X Layer network
- HTTP 402 payment challenge
- buyer-side E2E probe

Relevant commits:
- feat: add official OKX x402 Next.js SDK
- feat: add guarded OKX x402 seller service
- fix: use documented x402 Next.js seller API
- fix: align OKX x402 package versions
- feat: make x402 network configurable via Vercel env
- test: add x402 end-to-end buyer probe
- chore: add x402 e2e test command

### 2. OKX AI A2MCP service

Registered Xaverus as an ASP on X Layer mainnet.

- Agent ID: 13805
- Service: Xaverus Safety Check
- Type: A2MCP
- Service ID: 010e5352-7c1a-4d10-a655-93eb2e77611d
- Endpoint: https://xaverus.vercel.app/api/agent/safety-check
- Fee: 0 USDT
- Listing status at the time of this log: under review

### 3. Server-side Safety Passport

The production safety endpoint evaluates payment intent without executing a payment.

Verified scenarios:

| Scenario | Input | Result |
|---|---|---|
| Allow | amount=1, perTx=5 | allowed |
| Per-tx block | amount=6, perTx=5 | blocked |
| Kill switch | enabled=false | blocked |

The responses confirmed server-side policy evaluation and executionPerformed=false.

## Security design

The browser does not receive private keys, seed phrases, or server-side OKX credentials.

The intended execution boundary is:
User → Safety Passport → Agent → wallet/security layer → X Layer.

The safety layer is defense-in-depth and does not claim perfect security.

## Demo evidence to capture

1. Open the live Xaverus product.
2. Show the Safety Passport policy.
3. Submit a valid intent and show ALLOW.
4. Exceed the per-transaction limit and show BLOCK.
5. Trigger the kill switch and show BLOCK.
6. Show the OKX AI A2MCP service identity.
7. Show the x402 payment flow as a separate service/payment demonstration.
8. Explain that the safety service is decision-only and does not directly sign transactions.

## Submission status

- Public GitHub repository: complete
- Live service: complete
- OKX AI ASP registration: complete
- A2MCP service registration: complete
- Listing review: pending
- Safety test evidence: complete
- x402 E2E evidence: complete
- Demo video: pending
- Final submission form: pending
