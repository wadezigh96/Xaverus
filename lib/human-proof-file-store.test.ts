import test from "node:test";
import assert from "node:assert/strict";
import {existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {generatePrivateKey, privateKeyToAccount, type PrivateKeyAccount} from "viem/accounts";
import {buildBindingMessage, hashHandle, hashUid} from "./human-proof.ts";
import {createFileProofStore} from "./human-proof-file-store.ts";

const X_USER_ID = "123456789";
const RAW_UID = "987654321";
const UID_HASH = hashUid(RAW_UID);

function tempStorePath(t: {after: (fn: () => void) => void}): string {
  const dir = mkdtempSync(join(tmpdir(), "xaverus-proof-store-"));
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  return join(dir, "proofs.json");
}

function expiry(): number {
  return Math.floor(Date.now() / 1000) + 900;
}

async function signClaim(account: PrivateKeyAccount, expiresAt: number) {
  const message = buildBindingMessage({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    expiresAt,
  });
  const signature = await account.signMessage({message});
  return {wallet: account.address, xUserId: X_USER_ID, okxUidHash: UID_HASH, signature, expiresAt};
}

test("file store starts empty when the file does not exist", (t) => {
  const store = createFileProofStore(tempStorePath(t));
  const account = privateKeyToAccount(generatePrivateKey());
  assert.equal(store.hasProof(account.address), false);
  assert.equal(store.getProof(account.address), undefined);
  assert.equal(store.getProofByX(X_USER_ID), undefined);
});

test("file store round-trip: binding and proof readable in the same instance", async (t) => {
  const path = tempStorePath(t);
  const store = createFileProofStore(path);
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const proof = await store.issueProof(await signClaim(account, expiry()));
  assert.equal(store.hasProof(account.address), true);
  assert.equal(store.getProof(account.address)?.okxUidHash, UID_HASH);
  assert.equal(store.getProofByX(X_USER_ID)?.wallet, account.address);
  assert.equal(proof.wallet, account.address);
  assert.ok(existsSync(path));
  assert.deepEqual(
    readdirSync(join(path, "..")).filter((name) => name.includes(".tmp-")),
    []
  );
});

test("proofs persist across instances of the file store", async (t) => {
  const path = tempStorePath(t);
  const first = createFileProofStore(path);
  const account = privateKeyToAccount(generatePrivateKey());
  first.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const issued = await first.issueProof(await signClaim(account, expiry()));

  const second = createFileProofStore(path);
  assert.equal(second.hasProof(account.address), true);
  assert.deepEqual(second.getProof(account.address), issued);
  await assert.rejects(second.issueProof(await signClaim(account, expiry())), /already has a Human Proof/i);
});

test("bindings persist across instances of the file store", async (t) => {
  const path = tempStorePath(t);
  const first = createFileProofStore(path);
  const account = privateKeyToAccount(generatePrivateKey());
  first.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});

  const second = createFileProofStore(path);
  const proof = await second.issueProof(await signClaim(account, expiry()));
  assert.equal(proof.wallet, account.address);
  assert.equal(proof.xHandleHash, hashHandle("alice"));
});

test("the raw OKX UID is never written to the store file", async (t) => {
  const path = tempStorePath(t);
  const store = createFileProofStore(path);
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  await store.issueProof(await signClaim(account, expiry()));

  const contents = readFileSync(path, "utf8");
  assert.ok(!contents.includes(RAW_UID));
  assert.ok(contents.includes(UID_HASH));
  assert.ok(contents.includes(account.address));
});

test("claim without an X Binding is refused by the file store", async (t) => {
  const store = createFileProofStore(tempStorePath(t));
  const account = privateKeyToAccount(generatePrivateKey());
  await assert.rejects(store.issueProof(await signClaim(account, expiry())), /no X Binding/i);
});

test("claim with a bad signature is refused by the file store", async (t) => {
  const store = createFileProofStore(tempStorePath(t));
  const account = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const message = buildBindingMessage({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    expiresAt: expiry(),
  });
  const signature = await stranger.signMessage({message});
  await assert.rejects(
    store.issueProof({wallet: account.address, xUserId: X_USER_ID, okxUidHash: UID_HASH, signature, expiresAt: expiry()}),
    /signature/i
  );
});

test("expired claim is refused by the file store", async (t) => {
  const store = createFileProofStore(tempStorePath(t));
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const past = Math.floor(Date.now() / 1000) - 60;
  await assert.rejects(store.issueProof(await signClaim(account, past)), /expired/i);
});

test("duplicate claim is refused by the file store", async (t) => {
  const store = createFileProofStore(tempStorePath(t));
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const claim = await signClaim(account, expiry());
  await store.issueProof(claim);
  await assert.rejects(store.issueProof(claim), /already has a Human Proof/i);
});

test("a corrupt store file fails loudly on load", (t) => {
  const path = tempStorePath(t);
  writeFileSync(path, "{not json", "utf8");
  assert.throws(() => createFileProofStore(path), /corrupt/i);
});

test("a store file with a structurally invalid proof fails loudly on load", (t) => {
  const path = tempStorePath(t);
  writeFileSync(
    path,
    JSON.stringify({version: 1, bindings: [], proofs: [{wallet: "0x1234"}]}),
    "utf8"
  );
  assert.throws(() => createFileProofStore(path), /corrupt/i);
});

test("the shared store is file-backed when XAVERUS_PROOF_STORE_PATH is set", async (t) => {
  const path = tempStorePath(t);
  const previous = process.env.XAVERUS_PROOF_STORE_PATH;
  process.env.XAVERUS_PROOF_STORE_PATH = path;
  t.after(() => {
    if (previous === undefined) delete process.env.XAVERUS_PROOF_STORE_PATH;
    else process.env.XAVERUS_PROOF_STORE_PATH = previous;
  });
  const {getHumanProofStore, resetHumanProofStore} = await import("./human-proof-store.ts");
  resetHumanProofStore();
  t.after(() => resetHumanProofStore());
  const store = getHumanProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.ok(existsSync(path), "the shared store should have written the file");
  const contents = readFileSync(path, "utf8");
  assert.ok(contents.includes(account.address));
});

test("getBinding returns the recorded binding and survives reload", (t) => {
  const path = tempStorePath(t);
  const store = createFileProofStore(path);
  const account = privateKeyToAccount(generatePrivateKey());
  assert.equal(store.getBinding(account.address), undefined);
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.equal(store.getBinding(account.address)?.xUserId, X_USER_ID);
  const reloaded = createFileProofStore(path);
  assert.equal(reloaded.getBinding(account.address)?.xUserId, X_USER_ID);
  assert.equal(reloaded.getBinding(account.address)?.xHandleHash, hashHandle("alice"));
});
