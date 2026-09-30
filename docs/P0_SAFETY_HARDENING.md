# P0 Safety Passport hardening

This branch makes the policy endpoint server-authoritative.

Changes:
- Request bodies cannot override spend limits, kill switch state, approval requirement, asset, or network.
- spentToday is read from the durable Upstash ledger, not supplied by the caller.
- Asset and network are checked against the server policy.
- Optional recipient allowlisting is enforced server-side.
- Every check requires a unique X-Xaverus-Request-ID.
- A process-local replay guard rejects duplicate intent hashes for 10 minutes.
- /api/agent/passport exposes active policy without secrets.
- The API remains decision-only and does not sign or move funds.

Production gate:
The current durable ledger is global to the Xaverus deployment. Before autonomous execution or multi-tenant use, scope spend and idempotency keys to a server-authenticated passport/agent identity; do not accept an arbitrary browser-supplied scope as identity.


## Durable authorization boundary

`POST /api/agent/authorize` is the server-side authorization boundary. It requires `XAVERUS_APPROVAL_SECRET`, reloads the server policy, reads today's durable spend from Upstash Redis, re-evaluates the intent, and atomically reserves the amount with a request-ID idempotency record.

The ledger uses micro-USDC integer units and a Redis server-side script so concurrent requests cannot both consume the same remaining daily budget. Authorization still does not sign or broadcast funds.

Required server-only variables:
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `XAVERUS_APPROVAL_SECRET`

If Redis or the approval secret is missing, authorization fails closed with HTTP 503. `XAVERUS_SPENT_TODAY` remains only for the decision-only preview compatibility path and is not used for authorization.
