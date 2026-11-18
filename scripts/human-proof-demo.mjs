/**
 * Human Proof demo (ticket 01): throwaway wallet only, nothing on-chain.
 *
 *  node scripts/human-proof-demo.mjs
 *
 * Walks the core flow: bind X -> sign the binding message -> issue a proof,
 * then shows a tampered signature being refused.
 */
import {generatePrivateKey, privateKeyToAccount} from "viem/accounts";
import {
  buildBindingMessage,
  createMemoryProofStore,
  hashHandle,
  hashUid,
} from "../lib/human-proof.ts";

const account = privateKeyToAccount(generatePrivateKey());
const store = createMemoryProofStore();
const xUserId = "123456789";
const okxUidHash = hashUid("987654321");
const expiresAt = Math.floor(Date.now() / 1000) + 900;

console.log("Demo wallet (throwaway):", account.address);
store.recordBinding({
  wallet: account.address,
  xUserId,
  xHandleHash: hashHandle("alice"),
});
console.log("X Binding recorded for X user", xUserId);

const message = buildBindingMessage({wallet: account.address, xUserId, okxUidHash, expiresAt});
const signature = await account.signMessage({message});
const proof = await store.issueProof({wallet: account.address, xUserId, okxUidHash, signature, expiresAt});
console.log("Human Proof issued:");
console.log(JSON.stringify(proof, null, 2));

const tampered = await account.signMessage({message: message + "!"});
try {
  const store2 = createMemoryProofStore();
  store2.recordBinding({wallet: account.address, xUserId, xHandleHash: hashHandle("alice")});
  await store2.issueProof({wallet: account.address, xUserId, okxUidHash, signature: tampered, expiresAt});
  console.log("ERROR: tampered signature was accepted!");
  process.exit(1);
} catch (error) {
  console.log("Tampered signature refused as expected:", error.message);
}
