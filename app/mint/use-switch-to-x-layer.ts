import {useState, type RefObject} from "react";
import type {WalletAdapter} from "../../lib/wallet-adapter";
import {walletErrorMessage} from "../../lib/wallet-ui";

/**
 * The "Switch to X Layer" behaviour both wallet buttons share: run the
 * switch through the connected adapter, answer a refusal politely, and
 * track the pending state and any notice. `onSwitched` updates the
 * button's own chain state after a successful switch (each button tracks
 * the chain in its own form: a hex string for OKX, a number for Privy).
 * `walletLabel` names the wallet in a refusal message ("OKX Wallet");
 * without it, the message names no wallet.
 *
 * The notice state is shared with the button's other actions: the OKX
 * button reuses `setNotice` for its connect errors, so one notice shows
 * at a time.
 */
export function useSwitchToXLayer(
  adapterRef: RefObject<WalletAdapter | null>,
  onSwitched: () => void,
  walletLabel?: string
) {
  const [switching, setSwitching] = useState(false);
  const [notice, setNotice] = useState("");

  async function switchToXLayer() {
    const adapter = adapterRef.current;
    if (!adapter) return;
    setNotice("");
    setSwitching(true);
    try {
      await adapter.switchToXLayer();
      onSwitched();
    } catch (error) {
      setNotice(walletErrorMessage(error, "switch-chain", walletLabel));
    } finally {
      setSwitching(false);
    }
  }

  return {switching, notice, setNotice, switchToXLayer};
}
