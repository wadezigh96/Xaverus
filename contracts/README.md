# Xaverus Safety Passport — X Layer Mainnet

Target network: **X Layer Mainnet (chain ID 196)**.

The Xaverus Safety Passport contract remains a separate policy registry. The supplied Builder Code contract address is **not** used as the Passport contract.

## Builder Code

Builder Code contract:

`0xd6c426f9c077358735622ae5a83468dc0510823b`

Owner/deployer wallet supplied for Xaverus:

`0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03`

The Builder Code address is used as the X Layer attribution boundary for transactions when the execution integration is enabled. It does not become the Safety Passport contract.

## Passport deployment

The Xaverus Passport contract must be deployed separately before `XAVERUS_PASSPORT_CONTRACT` is populated.

**Never commit a private key or deployment secret.**
