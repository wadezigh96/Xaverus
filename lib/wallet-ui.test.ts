import test from "node:test";
import assert from "node:assert/strict";
import {
  errorMessage,
  shortAddress,
  userRejectionMessage,
  walletErrorMessage,
  walletFieldAfterDisconnect,
} from "./wallet-ui.ts";

const WALLET = "0xfceafec082f9e8b17cdb51f33c3d5c9759a25e03";
const OTHER_WALLET = "0x1111111111111111111111111111111111111111";

function codedError(code: number): Error & {code: number} {
  const error = new Error(`provider error ${code}`) as Error & {code: number};
  error.code = code;
  return error;
}

test("errorMessage returns an Error's own message", () => {
  assert.equal(errorMessage(new Error("boom")), "boom");
});

test("errorMessage falls back for anything that is not an Error", () => {
  assert.equal(errorMessage("plain string"), "Something went wrong.");
  assert.equal(errorMessage(undefined), "Something went wrong.");
  assert.equal(errorMessage({code: 4001}), "Something went wrong.");
});

test("shortAddress shortens a wallet address to its first 6 and last 4 characters", () => {
  assert.equal(shortAddress(WALLET), "0xfcea…5e03");
});

test("shortAddress leaves a short value alone", () => {
  assert.equal(shortAddress("0x1234567890"), "0x1234567890");
  assert.equal(shortAddress(""), "");
});

test("a refused signature gets a polite message, never a system error", () => {
  assert.equal(
    userRejectionMessage("sign", "your wallet"),
    "You declined the signature request in your wallet. Nothing was signed — try again when you're ready."
  );
});

test("a refused transaction gets a polite message, never a system error", () => {
  assert.equal(
    userRejectionMessage("send", "your wallet"),
    "You declined the transaction in your wallet. Nothing was sent — try again when you're ready."
  );
});

test("a refused connection names the wallet that asked", () => {
  assert.equal(
    userRejectionMessage("connect", "OKX Wallet"),
    "You declined the connection request in OKX Wallet. Nothing was connected — try again when you're ready."
  );
});

test("a refused network switch names the wallet when one asked", () => {
  assert.equal(
    userRejectionMessage("switch-chain", "OKX Wallet"),
    "You declined the network switch in OKX Wallet. Your wallet stays on its current network — try again when you're ready."
  );
});

test("a refused network switch without a named wallet still reads politely", () => {
  assert.equal(
    userRejectionMessage("switch-chain"),
    "You declined the network switch. Your wallet stays on its current network — try again when you're ready."
  );
});

test("walletErrorMessage answers a refusal politely", () => {
  assert.equal(
    walletErrorMessage(codedError(4001), "sign", "your wallet"),
    "You declined the signature request in your wallet. Nothing was signed — try again when you're ready."
  );
  assert.equal(
    walletErrorMessage(new Error("User rejected the request"), "connect", "OKX Wallet"),
    "You declined the connection request in OKX Wallet. Nothing was connected — try again when you're ready."
  );
});

test("walletErrorMessage passes a real failure's own message through", () => {
  assert.equal(walletErrorMessage(new Error("boom"), "sign", "your wallet"), "boom");
  assert.equal(walletErrorMessage(codedError(4902), "switch-chain"), "provider error 4902");
  assert.equal(walletErrorMessage(undefined, "send", "your wallet"), "Something went wrong.");
});

test("disconnect clears the field when it still shows the disconnected wallet", () => {
  assert.equal(walletFieldAfterDisconnect(WALLET, WALLET), "");
});

test("disconnect clears the field regardless of address casing or spaces", () => {
  assert.equal(walletFieldAfterDisconnect(WALLET.toUpperCase(), WALLET.toLowerCase()), "");
  assert.equal(walletFieldAfterDisconnect(`  ${WALLET}  `, WALLET), "");
});

test("disconnect leaves a manually typed address alone", () => {
  assert.equal(walletFieldAfterDisconnect(OTHER_WALLET, WALLET), OTHER_WALLET);
  assert.equal(walletFieldAfterDisconnect("0xabc", WALLET), "0xabc");
});

test("disconnect with no recorded wallet address changes nothing", () => {
  assert.equal(walletFieldAfterDisconnect(WALLET, ""), WALLET);
  assert.equal(walletFieldAfterDisconnect("", WALLET), "");
});
