# OKX UID is recorded as a user-signed claim, never as an OKX verification

An OKX exchange UID cannot be verified from outside OKX without access to OKX's own systems, and Xaverus must never ask for a user's OKX password or API keys. So the UID a user supplies at mint time is stored as a claim the user makes about themselves, bound to their wallet by the wallet's own signature over the UID. Every surface that shows it (UI, API, docs, submission) must call it a claim, never a verification.

## Considered Options

- **Verify via the OKX API with user-supplied API keys**: rejected. It asks users to hand over exchange credentials, which contradicts Xaverus's rule that secrets and signing material stay with the user.
- **Drop the UID entirely and rely on the X Binding alone**: rejected. The UID adds a second, independent anchor that is cheap for a real person and expensive to fake at scale, even as an unverified claim.
- **Verify the UID by asking OKX**: not available. OKX offers no public endpoint that confirms a UID belongs to a given person or wallet.

## Consequences

- The mint flow must present the UID field honestly ("UID you claim") and the submission must never say OKX verified anything.
- A signed claim is still Sybil-resistant in one direction: one wallet can only claim one UID, and the signature proves the wallet owner made the claim.
