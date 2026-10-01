# Xaverus Safety Passport — X Layer Mainnet

**Canonical contract:** `XaverusPassport.sol`  
**Network:** X Layer Mainnet · chain ID **196**  
**RPC:** `https://rpc.xlayer.tech`  
**Explorer:** https://www.okx.com/web3/explorer/xlayer

The Passport is a **policy / authorization ledger only**. It never holds or transfers user funds and never stores private keys. The owner wallet remains the signing boundary.

`XaverusSafetyPassport.sol` is a **legacy multi-passport sketch** and is **not** wired to the app. Do not deploy it for production.

---

## Builder Code (separate)

| Item | Value |
|------|--------|
| Builder Code contract | `0xd6c426f9c077358735622ae5a83468dc0510823b` |
| Owner / deployer wallet (supplied) | `0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03` |

The Builder Code address is the X Layer **attribution** boundary when execution is enabled. It is **not** the Safety Passport contract.

---

## Native USDC (asset)

Circle-issued native USDC on X Layer mainnet:

```
0xB6CEceAB302E2E4948951eE7843FC24e92933061
```

(6 decimals. Do not use bridged USDC.e / USDC_Bridged.)

---

## Deploy constructor (default policy)

| Arg | Value | Meaning |
|-----|--------|---------|
| `asset_` | `0xB6CEceAB302E2E4948951eE7843FC24e92933061` | Native USDC |
| `perTxLimit_` | `5000000` | 5 USDC |
| `dailyLimit_` | `25000000` | 25 USDC |

Constructor **requires** `block.chainid == 196`. Deploying on any other chain reverts with `WrongChain`.

### Deploy with Foundry `cast` (recommended)

```bash
# From a machine that has the owner private key — never commit it
export RPC_URL=https://rpc.xlayer.tech
export PRIVATE_KEY=0x...   # owner wallet only

# Compile (optional if you have forge)
forge build --contracts contracts/XaverusPassport.sol

# Deploy
cast create contracts/XaverusPassport.sol:XaverusPassport \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  0xB6CEceAB302E2E4948951eE7843FC24e92933061 \
  5000000 \
  25000000
```

Or use the helper script (prints calldata / uses env if set):

```bash
node scripts/deploy-passport.mjs
```

After deploy:

1. Set `XAVERUS_PASSPORT_CONTRACT=<deployed address>` in Vercel / server env.
2. Optionally set `XAVERUS_PASSPORT_DEPLOYMENT_BLOCK=<block>` to bound Activity log queries.
3. Confirm `owner()` matches `0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03` (or your chosen owner).
4. Confirm `asset()` is the native USDC address above.

**Never commit a private key or deployment secret.**

---

## On-chain surface

| Function | Who | Purpose |
|----------|-----|---------|
| `authorize(requestId, amount, token, recipient)` | owner | Atomic policy check + spend reservation + event |
| `setPolicy(perTx, daily, enabled)` | owner | Update limits / kill switch |
| `killSwitch()` | owner | Immediate disable |
| `setRecipient` / `setAllowlistEnabled` | owner | Optional recipient allowlist |
| `spentToday` / `remainingToday` / `isAuthorized` | anyone | Views |

Server path: `POST /api/agent/authorize` returns **calldata only**. The external wallet signs and broadcasts.
