# Xaverus — Safe Agent Passport

Xaverus is a user-controlled safety layer for autonomous onchain agents. The core idea is simple: **let agents act, while users keep policy control**.

## OKX Dev Day direction

Primary track target: **Build a Company**. The official Builder Kit allows solo builders and describes this track around agent services, data/API services, agent discovery/coordination/transaction tools, agent marketplaces and automated workflows. The minimum requires a working service through OKX AI, an end-to-end workflow, a service/listing/integration URL, and a demo of the working product.

This repository currently contains a **demo-safe UX and policy engine**. It does not pretend to have a live OKX credential or live wallet execution. Live OKX integration should be enabled only with official credentials and server-side signing/secret handling.

## Safety Passport

- Per-transaction spend limit
- Daily spend cap
- Explicit approval gate
- Kill switch
- Policy evaluation before execution
- Proof-of-action audit trail
- Demo-safe execution mode

## Planned OKX integration

1. OKX AI service/listing for the Xaverus agent.
2. OKX Agentic Wallet as an execution layer where appropriate.
3. X Layer for low-cost onchain execution.
4. OKX Payment SDK / Agent Payments flow for agent-to-service or agent-to-agent micro-payments.
5. Server-side secret management; never expose OKX secrets in browser code.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3000.

## Security notes

The demo intentionally simulates payment execution. Do not add real private keys, API secrets, or custodial credentials to the client. Production execution should validate policy server-side, use least privilege, enforce spend caps again before signing, log transaction IDs, and include an emergency stop/revocation path.

## Hackathon evidence

For an existing project, keep a clear record of new features, integrations, commits and the demo flow. The official Builder Kit states that a new listing/deployment alone is not enough; meaningful new functionality and evidence are required.
