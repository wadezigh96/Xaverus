# 04: Native OKX Wallet module

**What to build:** a dedicated OKX Wallet path on the mint page: a "Connect
OKX Wallet" button that talks to the OKX extension directly, connects, moves
it to X Layer (adding the chain first if the wallet doesn't have it), and
then signs the UID claim and sends the mint transaction through OKX Wallet.
When no extension is present, the user gets a link to the official OKX Wallet
download page. After this ticket, the wallet X Layer users actually have gets
a first-class path that never depends on Privy or on the generic injected
provider.

**Blocked by:** 01 (needs the shared X Layer chain definition and adapter).

**Status:** ready-for-agent

- [ ] Detection uses `window.okxwallet` resolved fresh on every connect (never cached at module level); the module never touches `window.ethereum`
- [ ] Connect requests accounts and then ensures X Layer: switch chain, and on error 4902 add X Layer from the shared chain definition and retry the switch; the chain is verified afterwards
- [ ] The UID claim signature and the mint transaction go through the OKX provider, via the shared wallet adapter from ticket 01
- [ ] A refused request (error 4001) shows a polite message plus a retry button and is never logged as a system error; every wallet button is disabled while its request is pending
- [ ] Account and chain changes update the UI reactively (no page reload); listeners are removed on unmount
- [ ] When no OKX extension is detected, the UI links to the official download page (`https://web3.okx.com`); no `okx://` deep link is used anywhere
- [ ] Code and docs record the honest limit: `personal_sign` through the OKX extension was not verified in OKX's official extension documentation, so live verification stays an open item
- [ ] Unit tests cover connect, switch, add-chain-and-retry, sign, send, both error classes, and the no-extension state, behind a mocked provider shaped like the real one
- [ ] All pre-existing tests (TypeScript, Foundry, route checks) plus the new adapter/config tests still pass, and the production build passes
