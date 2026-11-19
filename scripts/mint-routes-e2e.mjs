#!/usr/bin/env node
/**
 * Automated tests for the mint API routes, over real HTTP against a
 * production build. The route handlers cannot be imported by node --test
 * (they import next/server), so this script boots `next start` on a test
 * port with temp state and exercises every mint route end to end.
 *
 * Needs a build first: `npm run build`, then `npm run test:routes`.
 * The server runs with X, TapeOut, and the factory deliberately
 * unconfigured, so the tests lock in the honest unconfigured behaviour;
 * nothing here calls X, OKX, or any chain, and nothing is deployed.
 *
 * Two phases: first the pre-existing build (no Privy App ID), then a
 * second build into a separate output directory with a placeholder
 * Privy App ID baked in, because NEXT_PUBLIC_ variables are inlined at
 * build time. The second build is removed afterwards, so the main
 * .next build is left exactly as it was.
 *
 * Exit code 0 when every check passes, 1 otherwise.
 */
import {spawn} from "node:child_process";
import {existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {dirname, join} from "node:path";
import {fileURLToPath} from "node:url";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {buildBindingMessage, hashHandle, hashUid} from "../lib/human-proof.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3123;
const BASE = `http://127.0.0.1:${PORT}`;
const X_USER_ID = "123456789";
const RAW_UID = "987654321";
const UID_HASH = hashUid(RAW_UID);
// A valid-format fake Privy App ID (25 characters) for the with-App-ID
// phase: it proves the page serves with an App ID configured, without
// ever using a real one.
const APP_ID_PLACEHOLDER = "test-app-id-placeholder-x";
// Separate build output for the with-App-ID phase (next.config.ts reads
// NEXT_DIST_DIR), so the main .next build is left untouched.
const APP_ID_DIST_DIR = ".next-appid";

const results = [];
function check(name, ok, detail = "") {
  results.push({name, ok});
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` — ${detail}`}`);
}

async function waitForServer(timeoutMs = 30000) {
  const started = Date.now();
  for (;;) {
    try {
      const res = await fetch(`${BASE}/api/health`);
      if (res.ok) return;
    } catch {
      // Not up yet.
    }
    if (Date.now() - started > timeoutMs) throw new Error("test server did not become ready in time");
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function json(res) {
  return res.json();
}

/**
 * Build the app with extra environment variables (a different output
 * directory, a baked-in Privy App ID). The build output is captured and
 * only shown, tail-first, when the build fails.
 */
function runBuild(extraEnv) {
  return new Promise((resolve, reject) => {
    const build = spawn("npx", ["next", "build"], {
      cwd: ROOT,
      env: {...process.env, ...extraEnv},
      stdio: "pipe",
    });
    let output = "";
    build.stdout.on("data", (chunk) => {
      output += chunk;
    });
    build.stderr.on("data", (chunk) => {
      output += chunk;
    });
    build.on("error", reject);
    build.on("close", (code) => {
      if (code === 0) resolve();
      else {
        reject(
          new Error(`next build failed with exit code ${code}:\n${output.split("\n").slice(-30).join("\n")}`)
        );
      }
    });
  });
}

/**
 * Whether any JavaScript bundle the page loads contains a string: the
 * proof that a NEXT_PUBLIC_ value was actually baked into the served
 * build, since the value lives in the client bundle, not in the HTML.
 * An unreadable chunk counts as not containing it.
 */
async function pageBundlesContain(html, needle) {
  const chunks = [
    ...new Set(
      [...html.matchAll(/\/_next\/static\/chunks\/[A-Za-z0-9._-]+\.js/g)].map((m) => m[0])
    ),
  ];
  for (const chunk of chunks) {
    try {
      const res = await fetch(`${BASE}${chunk}`);
      if (res.ok && (await res.text()).includes(needle)) return true;
    } catch {
      // An unreadable chunk cannot prove the needle is there.
    }
  }
  return false;
}

// The stop function for the server currently running, so an interrupted
// run still takes its server down. Only one server runs at a time.
let stopActiveServer = () => undefined;
process.on("SIGINT", () => {
  stopActiveServer();
  process.exit(1);
});
process.on("SIGTERM", () => {
  stopActiveServer();
  process.exit(1);
});

/**
 * Boot `next start` on the test port with temp state, and wait until it
 * answers. Detached: the server becomes its own process-group leader, so
 * stopping it kills the whole group — the npx parent plus the next-server
 * child it spawns. Killing only the npx parent used to leave next-server
 * alive on the test port, polluting later runs.
 *
 * Unconfigured on purpose: empty strings beat any .env.local values, so
 * these paths are tested honestly no matter the machine's env files.
 * `extraEnv` overrides the server environment, e.g. NEXT_DIST_DIR to
 * serve a different build output.
 */
async function startServer(storePath, extraEnv) {
  const server = spawn("npx", ["next", "start", "-p", String(PORT)], {
    cwd: ROOT,
    detached: true,
    env: {
      ...process.env,
      NODE_ENV: "production",
      XAVERUS_PROOF_STORE_PATH: storePath,
      X_CLIENT_ID: "",
      X_CLIENT_SECRET: "",
      X_REDIRECT_URI: "",
      XAVERUS_PASSPORT_FACTORY: "",
      XAVERUS_TAPEOUT_PROCESSOR: "",
      XAVERUS_TAPEOUT_CIRCUIT_ID: "",
      XAVERUS_TAPEOUT_CONTAINER: "",
      ...extraEnv,
    },
    stdio: "ignore",
  });
  let serverExit = null;
  server.on("exit", (code) => {
    serverExit = code;
  });

  // Kill the whole server process group; fall back to the parent only
  // when the group is already gone.
  function kill(signal) {
    try {
      process.kill(-server.pid, signal);
    } catch {
      server.kill(signal);
    }
  }
  stopActiveServer = () => kill("SIGKILL");

  try {
    await waitForServer();
  } catch (error) {
    // Never leave a server behind when readiness fails.
    kill("SIGKILL");
    throw error;
  }

  return {
    async stop() {
      stopActiveServer = () => undefined;
      kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (serverExit === null) kill("SIGKILL");
    },
  };
}

async function main() {
  if (!existsSync(join(ROOT, ".next", "BUILD_ID"))) {
    console.error("No production build found. Run `npm run build` first, then `npm run test:routes`.");
    process.exit(2);
  }

  const dir = mkdtempSync(join(tmpdir(), "xaverus-mint-e2e-"));
  const storePath = join(dir, "proofs.json");

  // Wallet A: a seeded X Binding (as if it completed OAuth), so the full
  // message -> sign -> claim -> proof -> mint path can run without X.
  const minter = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  const fresh = privateKeyToAccount(generatePrivateKey());
  writeFileSync(
    storePath,
    JSON.stringify({
      version: 1,
      bindings: [
        {
          wallet: minter.address,
          xUserId: X_USER_ID,
          xHandleHash: hashHandle("alice"),
          boundAt: Math.floor(Date.now() / 1000),
        },
      ],
      proofs: [],
    }),
    "utf8"
  );

  try {
    // --- Phase 1: the pre-existing build, with no Privy App ID ---------
    const plain = await startServer(storePath, {});
    try {
      // --- Mint page over HTTP, with no Privy App ID configured -----------
      let res = await fetch(`${BASE}/mint`);
      const mintHtml = await res.text();
      check("mint page: returns 200 without a Privy App ID", res.status === 200);
      check("mint page: no Privy login UI without a Privy App ID", !mintHtml.includes("Log in with email or wallet"));
      check(
        "mint page: no Privy App ID is baked into the bundle without one configured",
        !(await pageBundlesContain(mintHtml, APP_ID_PLACEHOLDER))
      );

      // --- Binding + proof status for the seeded wallet -------------------
      res = await fetch(`${BASE}/api/mint/binding?wallet=${minter.address}`);
      let body = await json(res);
      check("binding: seeded wallet is bound with its X user id", res.ok && body.bound === true && body.binding?.xUserId === X_USER_ID);

      res = await fetch(`${BASE}/api/mint/binding?wallet=${fresh.address}`);
      body = await json(res);
      check("binding: fresh wallet is unbound", res.ok && body.bound === false);

      res = await fetch(`${BASE}/api/mint/binding?wallet=not-an-address`);
      check("binding: invalid wallet is 400", res.status === 400);

      res = await fetch(`${BASE}/api/mint/proof?wallet=${minter.address}`);
      body = await json(res);
      check("proof: no proof yet for the seeded wallet", res.ok && body.present === false);

      res = await fetch(`${BASE}/api/mint/proof?wallet=not-an-address`);
      check("proof: invalid wallet is 400", res.status === 400);

      // --- Mint gate refuses without a proof -------------------------------
      res = await fetch(`${BASE}/api/mint/passport`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: fresh.address}),
      });
      check("passport: mint without a proof is 403", res.status === 403);

      res = await fetch(`${BASE}/api/mint/passport`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: "not-an-address"}),
      });
      check("passport: invalid wallet is 400", res.status === 400);

      // --- Message route: POST only, JSON body -----------------------------
      res = await fetch(`${BASE}/api/mint/message?wallet=${minter.address}&xUserId=${X_USER_ID}&okxUid=${RAW_UID}`);
      check("message: GET is gone (405), the UID never travels in a URL", res.status === 405);

      res = await fetch(`${BASE}/api/mint/message`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: "not json",
      });
      check("message: invalid JSON is 400", res.status === 400);

      res = await fetch(`${BASE}/api/mint/message`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address, xUserId: X_USER_ID}),
      });
      check("message: missing UID is 400", res.status === 400);

      res = await fetch(`${BASE}/api/mint/message`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address, xUserId: X_USER_ID, okxUid: RAW_UID}),
      });
      body = await json(res);
      const messageOk =
        res.ok && body.ok === true && typeof body.message === "string" && body.message.includes(UID_HASH);
      check("message: POST returns a binding message with the UID hash", messageOk);
      check("message: response carries the UID-claim note", body.claim === "The OKX UID is a user-signed claim, not a verification by OKX.");
      check("message: response never contains the raw UID", !JSON.stringify(body).includes(RAW_UID));
      const {message, expiresAt} = body;

      // --- Claim: bad signature, then the real one -------------------------
      const badSignature = await stranger.signMessage({message});
      res = await fetch(`${BASE}/api/mint/claim`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address, xUserId: X_USER_ID, okxUid: RAW_UID, signature: badSignature, expiresAt}),
      });
      check("claim: signature from another wallet is 401", res.status === 401);

      const signature = await minter.signMessage({message});
      res = await fetch(`${BASE}/api/mint/claim`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address, xUserId: X_USER_ID, okxUid: RAW_UID, signature, expiresAt}),
      });
      body = await json(res);
      check("claim: valid claim issues a proof", res.ok && body.ok === true && body.proof?.wallet === minter.address);
      check("claim: proof is hashes only (no raw UID, no signature)", !JSON.stringify(body).includes(RAW_UID) && !JSON.stringify(body).includes(signature));
      check("claim: response carries the UID-claim note", body.claim === "The OKX UID is a user-signed claim, not a verification by OKX.");

      res = await fetch(`${BASE}/api/mint/claim`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address, xUserId: X_USER_ID, okxUid: RAW_UID, signature, expiresAt}),
      });
      check("claim: second claim for the same wallet is 409", res.status === 409);

      // --- Claim without a binding, and with an expired message ------------
      res = await fetch(`${BASE}/api/mint/message`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: fresh.address, xUserId: X_USER_ID, okxUid: RAW_UID}),
      });
      const freshMessageBody = await json(res);
      const freshSignature = await fresh.signMessage({message: freshMessageBody.message});
      res = await fetch(`${BASE}/api/mint/claim`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: fresh.address, xUserId: X_USER_ID, okxUid: RAW_UID, signature: freshSignature, expiresAt: freshMessageBody.expiresAt}),
      });
      check("claim: no X Binding is 409", res.status === 409);

      const past = Math.floor(Date.now() / 1000) - 60;
      const expiredMessage = buildBindingMessage({wallet: minter.address, xUserId: X_USER_ID, okxUidHash: UID_HASH, expiresAt: past});
      const expiredSignature = await minter.signMessage({message: expiredMessage});
      res = await fetch(`${BASE}/api/mint/claim`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address, xUserId: X_USER_ID, okxUid: RAW_UID, signature: expiredSignature, expiresAt: past}),
      });
      check("claim: expired message is 400", res.status === 400);

      // --- Proof now present; mint gate allows ------------------------------
      res = await fetch(`${BASE}/api/mint/proof?wallet=${minter.address}`);
      body = await json(res);
      check("proof: issued proof is present with hashes only", res.ok && body.present === true && body.proof?.okxUidHash === UID_HASH && !JSON.stringify(body).includes(RAW_UID));

      res = await fetch(`${BASE}/api/mint/passport`, {
        method: "POST",
        headers: {"content-type": "application/json"},
        body: JSON.stringify({wallet: minter.address}),
      });
      body = await json(res);
      check("passport: mint with a proof is allowed", res.ok && body.allowed === true);
      check("passport: no factory means no transaction, said openly", body.transaction === null);
      check("passport: TapeOut unconfigured is reported, not hidden", body.tapeout?.configured === false);
      check("passport: response carries the UID-claim note", body.claim === "The OKX UID is a user-signed claim, not a verification by OKX.");

      // --- Anchor: honest unconfigured answer -------------------------------
      res = await fetch(`${BASE}/api/mint/anchor?wallet=${minter.address}`);
      body = await json(res);
      check("anchor: unconfigured container answers anchored:false", res.ok && body.anchored === false);

      res = await fetch(`${BASE}/api/mint/anchor?wallet=not-an-address`);
      check("anchor: invalid wallet is 400", res.status === 400);

      // --- X OAuth: honest unconfigured answers, no live X calls ------------
      res = await fetch(`${BASE}/api/mint/x/authorize?wallet=${minter.address}`);
      check("x/authorize: unconfigured X is 500", res.status === 500);

      res = await fetch(`${BASE}/api/mint/x/callback`, {redirect: "manual"});
      const location = res.headers.get("location") || "";
      check("x/callback: missing code/state redirects to /mint?x=error", res.status >= 300 && res.status < 400 && location.endsWith("/mint?x=error"), `status ${res.status}, location ${location}`);
    } finally {
      await plain.stop();
    }

    // --- Phase 2: a second build WITH a placeholder Privy App ID -------
    // NEXT_PUBLIC_ variables are inlined at build time, so this needs its
    // own build, into a separate output directory (next.config.ts reads
    // NEXT_DIST_DIR) so the main .next build is left exactly as it was.
    // The placeholder is a valid-format fake App ID; no real App ID is
    // ever used here. The second build is removed afterwards.
    // The App ID build rewrites next-env.d.ts and tsconfig.json to point
    // at its own output directory, so both files are snapshotted before
    // the build and restored afterwards: the run leaves the tree exactly
    // as it found it.
    const buildTouchedFiles = ["next-env.d.ts", "tsconfig.json"];
    const buildTouchedBefore = new Map();
    for (const file of buildTouchedFiles) {
      const path = join(ROOT, file);
      if (existsSync(path)) buildTouchedBefore.set(file, readFileSync(path, "utf8"));
    }
    try {
      await runBuild({
        NEXT_DIST_DIR: APP_ID_DIST_DIR,
        NEXT_PUBLIC_PRIVY_APP_ID: APP_ID_PLACEHOLDER,
      });
      const withAppId = await startServer(storePath, {NEXT_DIST_DIR: APP_ID_DIST_DIR});
      try {
        const appIdRes = await fetch(`${BASE}/mint`);
        const appIdHtml = await appIdRes.text();
        check("mint page: returns 200 with a Privy App ID configured", appIdRes.status === 200);
        check(
          "mint page: renders the mint steps with a Privy App ID configured",
          appIdHtml.includes("Connect your wallet and X")
        );
        check(
          "mint page: the configured App ID is baked into the served bundle",
          await pageBundlesContain(appIdHtml, APP_ID_PLACEHOLDER)
        );
      } finally {
        await withAppId.stop();
      }
    } finally {
      rmSync(join(ROOT, APP_ID_DIST_DIR), {recursive: true, force: true});
      for (const [file, contents] of buildTouchedBefore) {
        writeFileSync(join(ROOT, file), contents, "utf8");
      }
    }
  } finally {
    rmSync(dir, {recursive: true, force: true});
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} mint route checks passed.`);
  if (failed.length > 0) {
    console.log(`Failing checks: ${failed.map((r) => r.name).join("; ")}`);
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`mint-routes-e2e failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
