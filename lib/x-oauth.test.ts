import test from "node:test";
import assert from "node:assert/strict";
import {getAddress} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  beginXOAuth,
  buildAuthorizeUrl,
  completeXOAuth,
  computeCodeChallenge,
  createOAuthStateStore,
  createPkcePair,
  exchangeCode,
  fetchXUser,
  getXOAuthConfig,
  X_AUTHORIZE_URL,
  X_OAUTH_SCOPE,
  X_TOKEN_URL,
  X_USER_URL,
  type FetchLike,
} from "./x-oauth.ts";
import {
  buildBindingMessage,
  createMemoryProofStore,
  hashHandle,
  hashUid,
} from "./human-proof.ts";

const WALLET = "0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03";
const X_USER_ID = "123456789";
const X_USERNAME = "AliceHandle";

/** A stubbed X: records every call and answers with recorded-shaped responses. No test calls X live. */
function stubX(over: {tokenStatus?: number; tokenBody?: unknown; userStatus?: number; userBody?: unknown} = {}) {
  const calls: {url: string; init: RequestInit | undefined}[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({url, init});
    if (url === X_TOKEN_URL) {
      const status = over.tokenStatus ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () =>
          over.tokenBody ?? {
            access_token: "stub-access-token",
            token_type: "bearer",
            expires_in: 7200,
            scope: "users.read",
          },
      };
    }
    if (url === X_USER_URL) {
      const status = over.userStatus ?? 200;
      return {
        ok: status >= 200 && status < 300,
        status,
        json: async () =>
          over.userBody ?? {data: {id: X_USER_ID, username: X_USERNAME, name: "Alice"}},
      };
    }
    throw new Error(`stub X received an unexpected URL: ${url}`);
  };
  return {fetchImpl, calls};
}

const CONFIG = {
  clientId: "test-client-id",
  clientSecret: "test-client-secret",
  redirectUri: "https://xaverus.example/api/mint/x/callback",
};

test("PKCE challenge matches the RFC 7636 Appendix B vector", () => {
  // Known-good vector from RFC 7636: verifier -> S256 challenge.
  assert.equal(
    computeCodeChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
  );
});

test("generated PKCE pair is URL-safe and the challenge matches the verifier", () => {
  const {verifier, challenge} = createPkcePair();
  assert.match(verifier, /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(challenge, computeCodeChallenge(verifier));
  assert.notEqual(createPkcePair().verifier, verifier);
});

test("authorize URL points at X with PKCE S256, users.read scope, and the state", () => {
  const url = new URL(
    buildAuthorizeUrl({
      config: CONFIG,
      state: "state-123",
      codeChallenge: "challenge-abc",
    })
  );
  assert.equal(url.origin + url.pathname, X_AUTHORIZE_URL);
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), CONFIG.clientId);
  assert.equal(url.searchParams.get("redirect_uri"), CONFIG.redirectUri);
  assert.equal(url.searchParams.get("scope"), X_OAUTH_SCOPE);
  assert.equal(X_OAUTH_SCOPE, "users.read");
  assert.equal(url.searchParams.get("state"), "state-123");
  assert.equal(url.searchParams.get("code_challenge"), "challenge-abc");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.ok(!url.toString().includes(CONFIG.clientSecret));
});

test("missing X OAuth env vars produce a clear error naming what is missing", () => {
  assert.throws(
    () => getXOAuthConfig({}),
    /X_CLIENT_ID.*X_CLIENT_SECRET.*X_REDIRECT_URI/s
  );
  assert.throws(() => getXOAuthConfig({X_CLIENT_ID: "id"}), /X_CLIENT_SECRET/);
  assert.deepEqual(
    getXOAuthConfig({
      X_CLIENT_ID: "id",
      X_CLIENT_SECRET: "secret",
      X_REDIRECT_URI: "https://example.test/callback",
    }),
    {clientId: "id", clientSecret: "secret", redirectUri: "https://example.test/callback"}
  );
});

test("state is single-use: consuming it twice returns nothing the second time", () => {
  const store = createOAuthStateStore();
  store.save("state-1", {wallet: WALLET, codeVerifier: "verifier-1", createdAt: Date.now()});
  const first = store.consume("state-1");
  assert.equal(first?.wallet, WALLET);
  assert.equal(first?.codeVerifier, "verifier-1");
  assert.equal(store.consume("state-1"), undefined);
});

test("unknown state is rejected", () => {
  const store = createOAuthStateStore();
  assert.equal(store.consume("never-saved"), undefined);
});

test("state older than 10 minutes is expired and rejected", () => {
  let now = 1_000_000;
  const store = createOAuthStateStore(() => now);
  store.save("state-1", {wallet: WALLET, codeVerifier: "verifier-1", createdAt: now});
  now += 10 * 60 * 1000 + 1;
  assert.equal(store.consume("state-1"), undefined);
});

test("beginning the flow validates the wallet and returns a usable authorize URL", () => {
  const store = createOAuthStateStore();
  assert.throws(() => beginXOAuth({wallet: "not-an-address", config: CONFIG, store}), /address/i);
  const {authorizeUrl, state} = beginXOAuth({wallet: WALLET, config: CONFIG, store});
  const url = new URL(authorizeUrl);
  assert.equal(url.searchParams.get("state"), state);
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  const entry = store.consume(state);
  assert.equal(entry?.wallet, getAddress(WALLET));
  assert.match(entry?.codeVerifier ?? "", /^[A-Za-z0-9_-]{43,128}$/);
  assert.equal(computeCodeChallenge(entry?.codeVerifier ?? ""), url.searchParams.get("code_challenge"));
});

test("token exchange posts the code and verifier to X with Basic auth, and returns the token", async () => {
  const {fetchImpl, calls} = stubX();
  const token = await exchangeCode({
    code: "auth-code-1",
    codeVerifier: "verifier-1",
    config: CONFIG,
    fetchImpl,
  });
  assert.equal(token, "stub-access-token");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, X_TOKEN_URL);
  assert.equal(calls[0].init?.method, "POST");
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(
    headers.get("authorization"),
    `Basic ${Buffer.from("test-client-id:test-client-secret").toString("base64")}`
  );
  const body = new URLSearchParams(calls[0].init?.body as string);
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("code"), "auth-code-1");
  assert.equal(body.get("code_verifier"), "verifier-1");
  assert.equal(body.get("redirect_uri"), CONFIG.redirectUri);
  assert.equal(body.get("client_id"), null);
});

test("token exchange failure is a clear error, not a crash", async () => {
  const {fetchImpl} = stubX({tokenStatus: 400, tokenBody: {error: "invalid_grant"}});
  await assert.rejects(
    exchangeCode({code: "bad-code", codeVerifier: "v", config: CONFIG, fetchImpl}),
    /token exchange failed/i
  );
  const missing = stubX({tokenBody: {token_type: "bearer"}});
  await assert.rejects(
    exchangeCode({code: "c", codeVerifier: "v", config: CONFIG, fetchImpl: missing.fetchImpl}),
    /token exchange failed/i
  );
});

test("user fetch reads id and username with the access token as a Bearer token", async () => {
  const {fetchImpl, calls} = stubX();
  const user = await fetchXUser({accessToken: "stub-access-token", fetchImpl});
  assert.deepEqual(user, {id: X_USER_ID, username: X_USERNAME});
  assert.equal(calls[0].url, X_USER_URL);
  const headers = new Headers(calls[0].init?.headers);
  assert.equal(headers.get("authorization"), "Bearer stub-access-token");
});

test("user fetch failure is a clear error", async () => {
  const {fetchImpl} = stubX({userStatus: 401, userBody: {error: "unauthorized"}});
  await assert.rejects(fetchXUser({accessToken: "bad", fetchImpl}), /user lookup failed/i);
  const badShape = stubX({userBody: {data: {id: X_USER_ID}}});
  await assert.rejects(fetchXUser({accessToken: "t", fetchImpl: badShape.fetchImpl}), /user lookup failed/i);
});

test("completing the flow records an X Binding tied to the wallet that started it", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const store = createOAuthStateStore();
  const proofStore = createMemoryProofStore();
  const {state} = beginXOAuth({wallet: account.address, config: CONFIG, store});
  const {fetchImpl} = stubX();
  const binding = await completeXOAuth({
    code: "auth-code-1",
    state,
    config: CONFIG,
    store,
    proofStore,
    fetchImpl,
  });
  assert.equal(binding.wallet, account.address);
  assert.equal(binding.xUserId, X_USER_ID);
  assert.equal(binding.xHandleHash, hashHandle(X_USERNAME));
  // The binding is really in the proof store: the wallet can now issue a Human Proof.
  const expiry = Math.floor(Date.now() / 1000) + 900;
  const message = buildBindingMessage({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: hashUid("987654321"),
    expiresAt: expiry,
  });
  const signature = await account.signMessage({message});
  const proof = await proofStore.issueProof({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: hashUid("987654321"),
    signature,
    expiresAt: expiry,
  });
  assert.equal(proof.wallet, account.address);
  assert.equal(proof.xUserId, X_USER_ID);
});

test("state mismatch on return is rejected and creates no binding", async () => {
  const store = createOAuthStateStore();
  const proofStore = createMemoryProofStore();
  beginXOAuth({wallet: WALLET, config: CONFIG, store});
  const {fetchImpl} = stubX();
  await assert.rejects(
    completeXOAuth({code: "auth-code-1", state: "not-the-state", config: CONFIG, store, proofStore, fetchImpl}),
    /state/i
  );
  // No binding was created: the wallet can still be bound fresh.
  proofStore.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle(X_USERNAME)});
});

test("completing the same state twice is rejected the second time", async () => {
  const store = createOAuthStateStore();
  const proofStore = createMemoryProofStore();
  const {state} = beginXOAuth({wallet: WALLET, config: CONFIG, store});
  const {fetchImpl} = stubX();
  await completeXOAuth({code: "auth-code-1", state, config: CONFIG, store, proofStore, fetchImpl});
  await assert.rejects(
    completeXOAuth({code: "auth-code-1", state, config: CONFIG, store, proofStore, fetchImpl}),
    /state/i
  );
});

test("expired state is rejected", async () => {
  let now = 1_000_000;
  const store = createOAuthStateStore(() => now);
  const proofStore = createMemoryProofStore();
  const {state} = beginXOAuth({wallet: WALLET, config: CONFIG, store, now: () => now});
  now += 10 * 60 * 1000 + 1;
  const {fetchImpl} = stubX();
  await assert.rejects(
    completeXOAuth({code: "auth-code-1", state, config: CONFIG, store, proofStore, fetchImpl}),
    /state/i
  );
});

test("a failed token exchange creates no half binding", async () => {
  const store = createOAuthStateStore();
  const proofStore = createMemoryProofStore();
  const {state} = beginXOAuth({wallet: WALLET, config: CONFIG, store});
  const {fetchImpl} = stubX({tokenStatus: 400, tokenBody: {error: "invalid_grant"}});
  await assert.rejects(
    completeXOAuth({code: "bad-code", state, config: CONFIG, store, proofStore, fetchImpl}),
    /token exchange failed/i
  );
  proofStore.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle(X_USERNAME)});
});
