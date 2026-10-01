# Xaverus Safety Passport — X Layer Mainnet

Target network: **X Layer Mainnet (chain ID 196)**.

`XaverusSafetyPassport.sol` is intentionally a policy registry, not a custody contract. It does not hold ERC-20/native assets and has no transfer/sweep function.

## Mainnet deployment gate

1. Compile and run contract tests.
2. Verify the deployment bytecode and constructor chain check on X Layer mainnet.
3. Deploy from the intended owner/deployer wallet.
4. Record the deployed address and transaction hash in the repository documentation.
5. Set `XAVERUS_PASSPORT_CONTRACT` in Vercel only after address verification.

**Never commit a private key or deployment secret.**
