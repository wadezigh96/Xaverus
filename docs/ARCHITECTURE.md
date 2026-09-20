# Xaverus Safe Agent Passport — Architecture

## Trust boundary

The browser is an untrusted UI. Policy enforcement and signing must happen server-side or inside the selected wallet/security environment. No OKX secret, API secret, private key, or signing material belongs in browser code.

## Flow

1. User creates a Safety Passport policy.
2. Agent proposes an action.
3. Xaverus validates asset, network, recipient and spend limits.
4. If approval is required, the user explicitly approves the intent.
5. Production execution delegates signing to an appropriate OKX wallet/security layer.
6. Payment is sent on X Layer through the supported OKX payment/agent flow.
7. The transaction identifier and policy decision are recorded as proof-of-action.
8. Kill switch/revocation prevents subsequent actions.

## Rare user-facing capability

The Passport is designed as a portable safety layer: the same policy model can be applied to an agent paying an API, another agent, or an onchain service. The UI exposes intent before execution rather than hiding payment decisions inside an autonomous loop.

## Production gates

- Server-side policy re-check immediately before signing.
- Per-transaction and rolling daily limits.
- Explicit approval for sensitive/high-value actions.
- Recipient allowlist/denylist where applicable.
- Simulation/risk checks before execution.
- Emergency stop and credential revocation.
- Idempotency keys to prevent duplicate payments.
- Audit records containing request ID, decision, tx hash and timestamps.
- Rate limiting and replay protection.
