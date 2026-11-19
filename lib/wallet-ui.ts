/**
 * Shared wallet UI helpers: the small text and field rules the mint page
 * and both wallet-connect buttons used to copy verbatim. One copy lives
 * here, so a wording fix lands everywhere at once.
 */

import {classifyWalletError, type ConnectedWallet} from "./wallet-adapter.ts";

/**
 * The props both wallet-connect buttons share: report a connected wallet
 * (address plus adapter, as one object), or an account change — null
 * when the wallet disconnected.
 */
export type WalletConnectProps = {
  onConnected: (wallet: ConnectedWallet) => void;
  onAccountChanged: (address: string | null) => void;
};

/** A readable message for any thrown value: an Error's own message, else a generic fallback. */
export function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Something went wrong.";
}

/** A wallet address shortened for display: its first 6 and last 4 characters. Short values pass through unchanged. */
export function shortAddress(address: string): string {
  return address.length > 12 ? address.slice(0, 6) + "…" + address.slice(-4) : address;
}

/** The wallet actions a user can refuse in a popup. */
export type RejectedWalletAction = "sign" | "send" | "connect" | "switch-chain";

/**
 * The polite message for a refused wallet popup: a refusal is the user's
 * choice, never a system error. `walletLabel` names the wallet that asked
 * ("OKX Wallet"); without it, the message names no wallet, which is how
 * the generic network-switch refusal reads.
 */
export function userRejectionMessage(action: RejectedWalletAction, walletLabel?: string): string {
  const where = walletLabel ? ` in ${walletLabel}` : "";
  switch (action) {
    case "sign":
      return `You declined the signature request${where}. Nothing was signed — try again when you're ready.`;
    case "send":
      return `You declined the transaction${where}. Nothing was sent — try again when you're ready.`;
    case "connect":
      return `You declined the connection request${where}. Nothing was connected — try again when you're ready.`;
    case "switch-chain":
      return `You declined the network switch${where}. Your wallet stays on its current network — try again when you're ready.`;
  }
}

/**
 * The message for a failed wallet operation: a refused popup gets the
 * polite rejection message, anything else gets its own error text. This
 * is the one place that decides between the two, so no catch block
 * classifies the error itself.
 */
export function walletErrorMessage(
  error: unknown,
  action: RejectedWalletAction,
  walletLabel?: string
): string {
  if (classifyWalletError(error) === "user-rejected") {
    return userRejectionMessage(action, walletLabel);
  }
  return errorMessage(error);
}

/**
 * The wallet field after a wallet disconnects: cleared when the field
 * still shows the disconnected wallet's address (any casing, ignoring
 * surrounding spaces), left alone otherwise — a manually typed address
 * is the user's own text and must never be erased by a disconnect.
 */
export function walletFieldAfterDisconnect(currentField: string, disconnectedAddress: string): string {
  if (!disconnectedAddress.trim()) return currentField;
  return currentField.trim().toLowerCase() === disconnectedAddress.trim().toLowerCase()
    ? ""
    : currentField;
}
