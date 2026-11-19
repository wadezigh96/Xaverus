import {createHash, randomBytes} from "node:crypto";
import {getAddress, type Address} from "viem";
import {hashHandle, type ProofStore, type XBinding} from "./human-proof.ts";
import {getHumanProofStore} from "./human-proof-store.ts";

/**
 * X OAuth 2.0 with PKCE (S256), server-side only. Used to establish the
 * X Binding half of a Human Proof: the user approves Xaverus on X, the
 * server exchanges the code and reads the X user id and handle, and the
 * binding is recorded against the wallet that started the flow.
 *
 * Endpoints (X API v2): authorize https://twitter.com/i/oauth2/authorize,
 * token https://api.x.com/2/oauth2/token, user https://api.x.com/2/users/me.
 * Scope is "tweet.read users.read": all Xaverus needs is the id and
 * username, but X refuses GET /2/users/me with a bare 403 when the token
 * carries users.read alone (confirmed live 19 Nov 2026: token exchange
 * succeeded, users/me returned 403). Both scopes are read-only; the app
 * never posts. Tokens issued before a scope change keep their old scopes,
 * so changing this requires every user to authorize again.
 *
 * Secrets: the client secret and the access token never leave the server.
 * The access token is used once to fetch users/me and then discarded; it
 * is never stored or logged.
 */

export const X_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";
export const X_TOKEN_URL = "https://api.x.com/2/oauth2/token";
export const X_USER_URL = "https://api.x.com/2/users/me";
export const X_OAUTH_SCOPE = "tweet.read users.read";
/** An OAuth flow must complete within 10 minutes of starting. */
export const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

export type XOAuthConfig = {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
};

/** Thrown when the X OAuth env vars are missing or incomplete. */
export class XOAuthConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "XOAuthConfigError";
  }
}

/** Read the X OAuth credentials from env. Throws a clear error naming what is missing. */
export function getXOAuthConfig(env: NodeJS.ProcessEnv = process.env): XOAuthConfig {
  const missing: string[] = [];
  if (!env.X_CLIENT_ID) missing.push("X_CLIENT_ID");
  if (!env.X_CLIENT_SECRET) missing.push("X_CLIENT_SECRET");
  if (!env.X_REDIRECT_URI) missing.push("X_REDIRECT_URI");
  if (missing.length > 0) {
    throw new XOAuthConfigError(
      `X OAuth is not configured: missing ${missing.join(", ")}. ` +
        "Create an app in the X Developer Portal and set these in the environment."
    );
  }
  return {
    clientId: env.X_CLIENT_ID as string,
    clientSecret: env.X_CLIENT_SECRET as string,
    redirectUri: env.X_REDIRECT_URI as string,
  };
}

/** S256 PKCE challenge: base64url(SHA-256(verifier)). */
export function computeCodeChallenge(codeVerifier: string): string {
  return createHash("sha256").update(codeVerifier, "utf8").digest("base64url");
}

/** A fresh PKCE pair: a 43-char URL-safe verifier and its S256 challenge. */
export function createPkcePair(): {verifier: string; challenge: string} {
  const verifier = randomBytes(32).toString("base64url");
  return {verifier, challenge: computeCodeChallenge(verifier)};
}

/** The X authorization URL the user is redirected to. Never includes the client secret. */
export function buildAuthorizeUrl(args: {
  config: XOAuthConfig;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(X_AUTHORIZE_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", args.config.clientId);
  url.searchParams.set("redirect_uri", args.config.redirectUri);
  url.searchParams.set("scope", X_OAUTH_SCOPE);
  url.searchParams.set("state", args.state);
  url.searchParams.set("code_challenge", args.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  return url.toString();
}

export type OAuthStateEntry = {
  wallet: Address;
  codeVerifier: string;
  createdAt: number;
};

export type OAuthStateStore = {
  save(state: string, entry: OAuthStateEntry): void;
  /** Single-use: returns the entry and deletes it, or undefined when unknown or expired. */
  consume(state: string): OAuthStateEntry | undefined;
};

/**
 * In-memory state store for in-flight OAuth flows. `now` is injectable so
 * tests can move time forward; production uses Date.now.
 */
export function createOAuthStateStore(now: () => number = Date.now): OAuthStateStore {
  const entries = new Map<string, OAuthStateEntry>();
  return {
    save(state, entry) {
      entries.set(state, entry);
    },
    consume(state) {
      const entry = entries.get(state);
      entries.delete(state);
      if (!entry) return undefined;
      if (now() - entry.createdAt > OAUTH_STATE_TTL_MS) return undefined;
      return entry;
    },
  };
}

/** The one module-level state store shared by the authorize and callback routes. */
const oauthStateStore = createOAuthStateStore();

export function getOAuthStateStore(): OAuthStateStore {
  return oauthStateStore;
}

/**
 * Start an X OAuth flow for a wallet: validate the address, create a state
 * value and a PKCE pair, remember them for the callback, and return the
 * X authorization URL to redirect the user to.
 */
export function beginXOAuth(args: {
  wallet: string;
  config: XOAuthConfig;
  store?: OAuthStateStore;
  now?: () => number;
}): {authorizeUrl: string; state: string} {
  const wallet = getAddress(args.wallet);
  const state = randomBytes(32).toString("base64url");
  const {verifier, challenge} = createPkcePair();
  const store = args.store ?? oauthStateStore;
  store.save(state, {wallet, codeVerifier: verifier, createdAt: (args.now ?? Date.now)()});
  return {
    authorizeUrl: buildAuthorizeUrl({config: args.config, state, codeChallenge: challenge}),
    state,
  };
}

/**
 * Minimal fetch shape: enough for the token exchange and the user lookup,
 * and easy to stub in tests. The global fetch satisfies it.
 */
export type FetchLike = (
  url: string,
  init?: RequestInit
) => Promise<{ok: boolean; status: number; json(): Promise<unknown>}>;

/**
 * Shared fetch-and-check for X API calls: a network failure and a
 * non-2xx response both become a clear error naming the step that failed.
 * `label` is the step name used in the message ("token exchange" or
 * "user lookup"). Returns the parsed JSON body of a successful response.
 */
async function fetchXJson(args: {
  url: string;
  init?: RequestInit;
  fetchImpl: FetchLike;
  label: "token exchange" | "user lookup";
}): Promise<unknown> {
  let response;
  try {
    response = await args.fetchImpl(args.url, args.init);
  } catch {
    throw new Error(`X ${args.label} failed: could not reach X.`);
  }
  if (!response.ok) {
    // Include X's own error body (truncated): the status alone cannot
    // tell a missing scope from a not-enrolled app, and the body can.
    // X error bodies are Problem Details JSON with no secrets in them.
    let detail = "";
    try {
      const body = await response.json();
      const text = typeof body === "string" ? body : JSON.stringify(body);
      if (text) detail = `: ${text.slice(0, 200)}`;
    } catch {
      // A non-JSON error body carries nothing usable; keep the status.
    }
    throw new Error(`X ${args.label} failed (HTTP ${response.status})${detail}.`);
  }
  return response.json();
}

/**
 * Exchange an authorization code for an access token, server-side, with
 * Basic auth (client id + secret). The caller must discard the token after
 * using it; it is never stored or logged.
 */
export async function exchangeCode(args: {
  code: string;
  codeVerifier: string;
  config: XOAuthConfig;
  fetchImpl?: FetchLike;
}): Promise<string> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: args.code,
    redirect_uri: args.config.redirectUri,
    code_verifier: args.codeVerifier,
  });
  const data = (await fetchXJson({
    url: X_TOKEN_URL,
    init: {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${args.config.clientId}:${args.config.clientSecret}`
        ).toString("base64")}`,
      },
      body: body.toString(),
    },
    fetchImpl,
    label: "token exchange",
  })) as {access_token?: unknown};
  if (typeof data.access_token !== "string" || !data.access_token) {
    throw new Error("X token exchange failed: no access token in the response.");
  }
  return data.access_token;
}

export type XUser = {id: string; username: string};

/** Read the authorized user's id and handle from users/me. */
export async function fetchXUser(args: {
  accessToken: string;
  fetchImpl?: FetchLike;
}): Promise<XUser> {
  const fetchImpl = args.fetchImpl ?? fetch;
  const data = (await fetchXJson({
    url: X_USER_URL,
    init: {
      headers: {Authorization: `Bearer ${args.accessToken}`},
    },
    fetchImpl,
    label: "user lookup",
  })) as {data?: {id?: unknown; username?: unknown}};
  if (typeof data.data?.id !== "string" || typeof data.data?.username !== "string") {
    throw new Error("X user lookup failed: unexpected response shape.");
  }
  return {id: data.data.id, username: data.data.username};
}

/**
 * Complete an X OAuth flow: validate the single-use state, exchange the
 * code, read the X user, and record the X Binding in the shared proof
 * store. The wallet comes from the state saved at authorize time, never
 * from a client-supplied callback parameter. The access token is used once
 * for users/me and then discarded.
 */
export async function completeXOAuth(args: {
  code: string;
  state: string;
  config: XOAuthConfig;
  store?: OAuthStateStore;
  proofStore?: ProofStore;
  fetchImpl?: FetchLike;
}): Promise<XBinding> {
  const store = args.store ?? oauthStateStore;
  const entry = store.consume(args.state);
  if (!entry) {
    throw new Error("OAuth state is unknown or expired. Start the X connection again.");
  }
  const accessToken = await exchangeCode({
    code: args.code,
    codeVerifier: entry.codeVerifier,
    config: args.config,
    fetchImpl: args.fetchImpl,
  });
  const user = await fetchXUser({accessToken, fetchImpl: args.fetchImpl});
  const proofStore = args.proofStore ?? getHumanProofStore();
  return proofStore.recordBinding({
    wallet: entry.wallet,
    xUserId: user.id,
    xHandleHash: hashHandle(user.username),
  });
}
