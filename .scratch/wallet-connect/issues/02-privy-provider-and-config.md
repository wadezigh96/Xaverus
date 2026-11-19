# 02: Privy provider + configuration (graceful degradation)

**What to build:** Privy is installed and wired into the app shell, but
strictly optional: with a Privy App ID configured, the Privy provider mounts
with X Layer as the only supported chain, email + wallet login, and embedded
wallets for users without wallets. Without an App ID, the app renders exactly
as before — no provider mounted, no error, no Privy code running. After this
ticket, the app is ready for a wallet login and proves it by building and
serving pages in both configurations.

**Blocked by:** 01 (needs the shared X Layer chain definition).

**Status:** ready-for-agent

- [ ] `@privy-io/react-auth` is installed at the latest version (recheck with `npm view` at install time; 3.52.0 at research time) and the lockfile has exactly one viem copy
- [ ] A client-side providers component mounts the Privy provider with: login methods email + wallet; X Layer as default chain and only supported chain; embedded wallets created on login for users without wallets; wallet list OKX Wallet first, then MetaMask, then detected wallets; embedded-wallet RPC overridden to the official X Layer RPC
- [ ] The provider configuration is built by a pure function of environment, typed with the SDK's config type, so a bad field fails at compile time
- [ ] When `NEXT_PUBLIC_PRIVY_APP_ID` is unset or empty, the providers component renders children directly with no provider mounted and no error thrown
- [ ] The env example documents `NEXT_PUBLIC_PRIVY_APP_ID` with a placeholder only — no real value anywhere in any tracked file
- [ ] Unit tests cover the config builder (both chains present, default chain inside supported chains, login methods, wallet list order, RPC override) and the no-App-ID degradation decision, with the SDK mocked — no test needs a real App ID
- [ ] The production build passes, and the mint page returns 200 over HTTP both with and without an App ID configured
- [ ] All pre-existing tests (TypeScript, Foundry, route checks) still pass
