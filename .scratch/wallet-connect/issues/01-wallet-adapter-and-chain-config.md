# 01: Shared wallet adapter + X Layer chain definition

**What to build:** the shared foundation both wallet modules stand on: one
verified X Layer chain definition used by every wallet path, and one small
wallet adapter interface (address, chain id, sign a message, send a
transaction, switch chain) with a browser-injected-provider implementation
behind it. The mint page's current direct wallet calls move behind the
adapter, with behaviour unchanged. After this ticket, any wallet source can
plug into the mint flow through the same seam, and the chain values exist in
exactly one place.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] One X Layer chain definition exists with the verified values from `~/workspace/Xaverus-wallet-research/X_LAYER_CHAIN.md` (id 196, name "X Layer mainnet", OKB, both official RPC URLs, official explorer URL); the OKB 18-decimal value carries a comment saying it comes from viem's chain definition, not from OKX docs
- [ ] A wallet adapter interface exists covering: current address, current chain id, sign message, send transaction, switch chain to X Layer
- [ ] A browser-injected-provider adapter implements the interface using the injected provider, with the mint page's existing behaviour preserved (chain check against X Layer, account-must-match checks, user-friendly errors)
- [ ] Error classification exists for refused requests (4001) and missing chains (4902), so callers can tell "user said no" from "chain not added" from anything else
- [ ] Chain-id comparison normalises hex values (case and leading zeros) instead of raw string equality
- [ ] Unit tests cover the chain definition values, the adapter's sign/send/switch behaviour behind a mocked provider, and both error classes; all tests run under the repo's existing Node test setup
- [ ] All 116 pre-existing TypeScript tests, the 12 Foundry tests, the 29 route checks, and the production build still pass
