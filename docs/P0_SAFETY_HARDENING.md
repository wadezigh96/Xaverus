# P0 Safety Passport hardening

This branch makes the policy endpoint server-authoritative.

Changes:
- Request bodies cannot override spend limits, kill switch state, approval requirement, asset, or network.
- spentToday is read from server configuration, not supplied by the caller.
- Asset and network are checked against the server policy.
- Optional recipient allowlisting is enforced server-side.
- Every check requires a unique X-Xaverus-Request-ID.
- A process-local replay guard rejects duplicate intent hashes for 10 minutes.
- /api/agent/passport exposes active policy without secrets.
- The API remains decision-only and does not sign or move funds.

Production gate:
XAVERUS_SPENT_TODAY is temporary server configuration, not a durable ledger. Before autonomous execution, replace it with a persistent per-passport spend ledger and make approval state server-authoritative.
