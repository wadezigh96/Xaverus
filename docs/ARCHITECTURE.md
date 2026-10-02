# Xaverus Safe Agent Passport — Architecture

## Trust boundary

The browser is an untrusted UI. Policy enforcement and signing must happen server-side or inside the selected wallet/security environment. No OKX secret, API secret, private key, or signing material belongs in browser code.

## Flow

1. User creates a Safety Passport policy.
2. Agent proposes an action.
3. Xaverus validates asset, network, recipient and spend limits against the on-chain policy.
4. If approval is required, the user explicitly approves the intent.
5. Xaverus returns a policy decision and, for approved requests, can build an unsigned Passport authorization transaction.
6. The user-selected external wallet/security boundary may sign and broadcast the transaction; Xaverus does not sign or broadcast production transactions.
7. Passport authorization/activity records are read from X Layer; an authorization record is not by itself proof that the underlying token transfer occurred.
8. Kill switch/revocation prevents subsequent actions.

## Rare user-facing capability

The Passport is designed as a portable safety layer: the same policy model can be applied to an agent paying an API, another agent, or an onchain service. The UI exposes intent before execution rather than hiding payment decisions inside an autonomous loop.

## Production gates

- Server-side policy re-check immediately before returning authorization data.
- Per-transaction and rolling daily limits.
- Explicit approval for sensitive/high-value actions.
- Recipient allowlist/denylist where applicable.
- Simulation/risk checks belong to the external execution environment before signing.
- Emergency stop and credential revocation.
- Idempotency keys to prevent duplicate payments.
- Audit records containing request ID, decision, authorization/activity data and timestamps; actual execution tx hashes must be supplied by the external wallet boundary.
- Rate limiting and replay protection.
