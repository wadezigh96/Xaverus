# Xaverus — Safe Agent Passport

Xaverus is a user-controlled safety layer for autonomous onchain agents. The core idea is simple: **let agents act, while users keep policy control**.

## OKX Dev Day 2026

Primary target: **Build a Company**.

Xaverus now has a working OKX AI service registered as an **A2MCP ASP** on X Layer mainnet.

### Current OKX AI integration

- ASP: **Xaverus**
- Agent ID: **13805**
- Role: **ASP**
- Chain: **X Layer mainnet (chain 196)**
- A2MCP service: **Xaverus Safety Check**
- Service ID: **010e5352-7c1a-4d10-a655-93eb2e77611d**
- Service type: **A2MCP**
- Fee: **0 USDT**
- Endpoint: `https://xaverus.vercel.app/api/agent/safety-check`
- Listing state: **under review**
- A2A communication: online/ready

The service is intentionally decision-only: it evaluates payment intent against server-side policy and does not execute the payment itself.

## Safety Passport

- Per-transaction spend limit
- Daily spend cap
- Explicit approval gate
- Kill switch / emergency stop
- Server-side policy evaluation
- Transaction intent preview
- Proof-of-action-ready audit model
- Demo-safe execution boundary

## Live safety behavior

The production endpoint has been tested with three policy scenarios:

1. **Allow:** 1 USDC with a 5 USDC per-transaction limit → allowed.
2. **Block:** 6 USDC with a 5 USDC per-transaction limit → blocked.
3. **Kill switch:** safety policy disabled → blocked with the emergency-stop reason.

All three tests confirmed:
- policy evaluated server-side
- execution was not performed
- the returned intent identifies USDC on X Layer
- approval remains explicit in the intent

## x402 integration

Xaverus also includes an OKX x402 seller service at:

`https://xaverus.vercel.app/api/x402/service`

The seller is guarded by server-only configuration and uses the official OKX x402 packages. X Layer testnet validation was completed through an Agentic Wallet payment flow. See [docs/X402_INTEGRATION.md](docs/X402_INTEGRATION.md).

## Architecture

```text
User
  |
  v
Xaverus Safety Passport
  |  policy / spend cap / approval / kill switch
  v
Autonomous Agent
  |
  +----> Xaverus A2MCP Safety Check
  |
  v
OKX Agentic Wallet / execution boundary
  |
  v
X Layer
  |
  +----> services / agents / x402 resources
```

The browser is treated as an untrusted UI. Secrets and signing material are not placed in client code.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/OKX_INTEGRATION.md](docs/OKX_INTEGRATION.md).

## Security boundary

Xaverus is designed as defense-in-depth, not as a claim of perfect security.

Production execution should re-check policy immediately before signing and additionally enforce:
- per-transaction and daily limits
- recipient controls where applicable
- simulation/risk checks
- emergency stop/revocation
- idempotency and replay protection
- rate limiting
- auditable request and transaction records

Never commit private keys, seed phrases, API secrets, or signing credentials.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Existing-project build evidence

Xaverus was extended during the official build period with meaningful functionality including the OKX x402 seller integration, configurable X Layer network support, x402 buyer E2E probing, production diagnostics, and the OKX AI A2MCP service registration.

See [BUILD_LOG.md](BUILD_LOG.md) for the evidence record and [GitHub commit history](https://github.com/wadezigh96/Xaverus/commits/main/).

## Submission evidence

For the final OKX Dev Day submission, provide:
- public repository
- live product/service URL
- OKX AI service/listing information
- 2–4 minute demo video
- build-period commit evidence
- clear description of new functionality
- end-to-end workflow demonstration

## Important limitation

The A2MCP safety service is a policy decision layer. It does not itself sign or move user funds. Live execution remains inside the appropriate wallet/security boundary.
