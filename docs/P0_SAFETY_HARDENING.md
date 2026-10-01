# P0 Safety Passport hardening

The P0 safety state now lives on the **X Layer mainnet Safety Passport contract**.

Changes:
- Spend limits are read from on-chain policy.
- Daily spend is read from on-chain state.
- Kill switch is enforced by the contract.
- Asset and recipient rules are enforced by the contract.
- Authorization consumes daily budget atomically on-chain.
- Request IDs are hashed to bytes32 and cannot be authorized twice.
- The owner wallet is the approval authority.
- Xaverus never stores a private key and never broadcasts the approval transaction.
- Activity is read from the contract's AuthorizationRecorded events.
- Browser-supplied policy values are ignored.

## On-chain boundary

Network: **X Layer mainnet · chain 196**

RPC: `https://rpc.xlayer.tech`

Required:
- `XAVERUS_PASSPORT_CONTRACT`
- `XAVERUS_RPC_URL` (defaults to the public X Layer RPC)

Optional:
- `XAVERUS_PASSPORT_DEPLOYMENT_BLOCK` to bound activity-log reads.

The contract stores limits in the configured token's smallest units. The current Xaverus UI uses USDC-style 6-decimal amounts.

## Authorization flow

1. `POST /api/agent/safety-check` reads the current policy and spend from X Layer.
2. `POST /api/agent/authorize` re-checks the same on-chain state.
3. Xaverus returns transaction calldata for `XaverusPassport.authorize(...)`.
4. The user's external wallet signs and broadcasts that transaction.
5. The contract atomically records the authorization and consumes the daily budget.
6. Activity is reconstructed from the on-chain event.

No Redis spend ledger or server approval secret is required for this flow.

## Important boundary

The contract is a **policy/authorization ledger**, not the user's token wallet. It does not transfer USDC and does not hold private keys. The actual token execution remains at the external wallet boundary.

That means an on-chain authorization receipt is not itself proof that a token transfer happened. A later proof-of-action step should link the authorization request ID to the actual transaction hash.

## Deployment

Deploy `contracts/XaverusPassport.sol` from the wallet that should own the Safety Passport.

For the current default policy, the constructor values are:
- `asset_`: `0xB6CEceAB302E2E4948951eE7843FC24e92933061` (native USDC on X Layer mainnet)
- `perTxLimit_`: `5000000` (5 USDC)
- `dailyLimit_`: `25000000` (25 USDC)

Do not put a private key in the repository or Vercel environment for this contract. The owner wallet signs the authorization transaction externally.
