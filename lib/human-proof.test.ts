import test from "node:test";
import assert from "node:assert/strict";
import {getAddress} from "viem";
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  buildBindingMessage,
  createMemoryProofStore,
  createProofStore,
  hashHandle,
  hashUid,
  isHex64,
  isProofValid,
  proofHash,
  ProofStoreError,
  verifyBindingSignature,
} from "./human-proof.ts";

const WALLET = "0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03";
const OTHER_WALLET = "0x0000000000000000000000000000000000000001";
const X_USER_ID = "123456789";
const UID_HASH = hashUid("987654321");
const EXPIRY = Math.floor(Date.now() / 1000) + 900;

function message(over: Record<string, unknown> = {}) {
  return buildBindingMessage({
    wallet: WALLET,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    expiresAt: EXPIRY,
    ...over,
  });
}

test("binding message names the wallet, X user id, UID hash, and expiry", () => {
  const m = message();
  assert.ok(m.includes(getAddress(WALLET)));
  assert.ok(m.includes(X_USER_ID));
  assert.ok(m.includes(UID_HASH));
  assert.ok(m.includes(String(EXPIRY)));
  assert.ok(m.includes("Xaverus"));
});

test("binding message differs when any input differs", () => {
  const base = message();
  assert.notEqual(message({wallet: OTHER_WALLET}), base);
  assert.notEqual(message({xUserId: "999"}), base);
  assert.notEqual(message({okxUidHash: hashUid("other")}), base);
  assert.notEqual(message({expiresAt: EXPIRY + 1}), base);
});

test("UID hashing is deterministic, distinct per UID, and 64 hex chars", () => {
  assert.equal(hashUid("987654321"), hashUid("987654321"));
  assert.notEqual(hashUid("987654321"), hashUid("123456789"));
  assert.match(hashUid("987654321"), /^[0-9a-f]{64}$/);
  assert.match(hashHandle("SomeHandle"), /^[0-9a-f]{64}$/);
  assert.equal(hashHandle("SomeHandle"), hashHandle("somehandle"));
});

test("signature from the minting wallet verifies", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  assert.equal(await verifyBindingSignature({message: m, signature, wallet: account.address}), true);
});

test("signature from another wallet is rejected", async () => {
  const minter = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  const m = message({wallet: minter.address});
  const signature = await stranger.signMessage({message: m});
  assert.equal(await verifyBindingSignature({message: m, signature, wallet: minter.address}), false);
});

test("tampered message is rejected", async () => {
  const account = privateKeyToAccount(generatePrivateKey());
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  assert.equal(
    await verifyBindingSignature({message: m + "!", signature, wallet: account.address}),
    false
  );
});

test("claim without an X Binding is refused", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: EXPIRY,
    }),
    /no X Binding/i
  );
});

test("valid claim issues a proof that holds hashes, never the raw UID", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  const proof = await store.issueProof({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    signature,
    expiresAt: EXPIRY,
  });
  assert.equal(proof.wallet, account.address);
  assert.equal(proof.xUserId, X_USER_ID);
  assert.equal(proof.okxUidHash, UID_HASH);
  assert.equal(proof.signature, signature);
  assert.equal(proof.expiresAt, EXPIRY);
  assert.ok(!JSON.stringify(proof).includes("987654321"));
  assert.equal(isProofValid(proof), true);
  assert.equal(store.hasProof(account.address), true);
  assert.equal(store.getProof(account.address)?.xUserId, X_USER_ID);
  assert.equal(store.getProofByX(X_USER_ID)?.wallet, account.address);
});

test("proof hash is the keccak of the signed message, deterministic per proof", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  const proof = await store.issueProof({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    signature,
    expiresAt: EXPIRY,
  });
  assert.match(proofHash(proof), /^0x[0-9a-f]{64}$/);
  assert.equal(proofHash(proof), proofHash(proof));
  assert.notEqual(proofHash(proof), proofHash({...proof, xUserId: "999"}));
});

test("expired binding message is refused", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const past = Math.floor(Date.now() / 1000) - 60;
  const m = message({wallet: account.address, expiresAt: past});
  const signature = await account.signMessage({message: m});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: past,
    }),
    /expired/i
  );
});

test("claim with a bad signature is refused", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const m = message({wallet: account.address});
  const signature = await stranger.signMessage({message: m});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: EXPIRY,
    }),
    /signature/i
  );
});

test("getBinding returns the recorded binding, undefined otherwise", () => {
  const store = createMemoryProofStore();
  assert.equal(store.getBinding(WALLET), undefined);
  store.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.equal(store.getBinding(WALLET)?.xUserId, X_USER_ID);
  assert.equal(store.getBinding(WALLET)?.xHandleHash, hashHandle("alice"));
  assert.equal(store.getBinding(OTHER_WALLET), undefined);
});

test("one X account binds to at most one wallet", () => {
  const store = createMemoryProofStore();
  store.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.throws(
    () => store.recordBinding({wallet: OTHER_WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")}),
    /already bound/i
  );
});

test("one wallet holds at most one X Binding", () => {
  const store = createMemoryProofStore();
  store.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.throws(
    () => store.recordBinding({wallet: WALLET, xUserId: "999", xHandleHash: hashHandle("bob")}),
    /already bound/i
  );
});

test("re-recording the same wallet and X account is a no-op success", () => {
  const store = createMemoryProofStore();
  const first = store.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  // Pressing Connect X again after a confusing redirect must not fail:
  // the same pair re-records to the same binding, with the original time.
  const second = store.recordBinding({wallet: WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.deepEqual(second, first);
  assert.equal(store.getBinding(WALLET)?.boundAt, first.boundAt);
});

test("one wallet holds at most one proof", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  const args = {
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    signature,
    expiresAt: EXPIRY,
  };
  await store.issueProof(args);
  await assert.rejects(store.issueProof(args), /already has a Human Proof/i);
});

test("isHex64 accepts exactly 64 lowercase hex chars", () => {
  assert.equal(isHex64("a".repeat(64)), true);
  assert.equal(isHex64("0123456789abcdef".repeat(4)), true);
  assert.equal(isHex64("A".repeat(64)), false);
  assert.equal(isHex64("a".repeat(63)), false);
  assert.equal(isHex64(`0x${"a".repeat(64)}`), false);
  assert.equal(isHex64(""), false);
  assert.equal(isHex64(undefined), false);
  assert.equal(isHex64(42), false);
});

function codeIs(code: string) {
  return (error: unknown) => error instanceof ProofStoreError && error.code === code;
}

test("store refusals carry machine-readable codes, not just messages", async () => {
  const store = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  const stranger = privateKeyToAccount(generatePrivateKey());

  // No binding at all.
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: EXPIRY,
    }),
    codeIs("NO_BINDING")
  );

  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});

  // Duplicate bindings, both directions.
  assert.throws(
    () => store.recordBinding({wallet: account.address, xUserId: "999", xHandleHash: hashHandle("bob")}),
    codeIs("WALLET_ALREADY_BOUND")
  );
  assert.throws(
    () => store.recordBinding({wallet: OTHER_WALLET, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")}),
    codeIs("X_ALREADY_BOUND")
  );

  // Expired message.
  const past = Math.floor(Date.now() / 1000) - 60;
  const pastMessage = message({wallet: account.address, expiresAt: past});
  const pastSignature = await account.signMessage({message: pastMessage});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature: pastSignature,
      expiresAt: past,
    }),
    codeIs("EXPIRED")
  );

  // Signature from another wallet.
  const badSignature = await stranger.signMessage({message: m});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature: badSignature,
      expiresAt: EXPIRY,
    }),
    codeIs("BAD_SIGNATURE")
  );

  // Second proof for the same wallet.
  await store.issueProof({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    signature,
    expiresAt: EXPIRY,
  });
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: EXPIRY,
    }),
    codeIs("ALREADY_HAS_PROOF")
  );
});

test("createProofStore seeds from initial bindings and proofs", async () => {
  const first = createMemoryProofStore();
  const account = privateKeyToAccount(generatePrivateKey());
  const binding = first.recordBinding({
    wallet: account.address,
    xUserId: X_USER_ID,
    xHandleHash: hashHandle("alice"),
  });
  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  const proof = await first.issueProof({
    wallet: account.address,
    xUserId: X_USER_ID,
    okxUidHash: UID_HASH,
    signature,
    expiresAt: EXPIRY,
  });

  const second = createProofStore({initialBindings: [binding], initialProofs: [proof]});
  assert.deepEqual(second.getBinding(account.address), binding);
  assert.deepEqual(second.getProof(account.address), proof);
  assert.equal(second.getProofByX(X_USER_ID)?.wallet, account.address);
  assert.equal(second.hasProof(account.address), true);
  await assert.rejects(
    second.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: EXPIRY,
    }),
    codeIs("ALREADY_HAS_PROOF")
  );
});

test("a persistence hook runs before commit and can veto it", async () => {
  const seen: string[] = [];
  const store = createProofStore({
    persistence: {
      beforeBindingRecorded(binding) {
        seen.push(`binding:${binding.wallet}`);
      },
      beforeProofIssued() {
        throw new Error("disk full (simulated)");
      },
    },
  });
  const account = privateKeyToAccount(generatePrivateKey());
  store.recordBinding({wallet: account.address, xUserId: X_USER_ID, xHandleHash: hashHandle("alice")});
  assert.deepEqual(seen, [`binding:${account.address}`]);

  const m = message({wallet: account.address});
  const signature = await account.signMessage({message: m});
  await assert.rejects(
    store.issueProof({
      wallet: account.address,
      xUserId: X_USER_ID,
      okxUidHash: UID_HASH,
      signature,
      expiresAt: EXPIRY,
    }),
    /disk full/
  );
  // The vetoed proof was never committed.
  assert.equal(store.hasProof(account.address), false);
  assert.equal(store.getProof(account.address), undefined);
});
