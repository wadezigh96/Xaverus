"use client";

import type {ReactNode} from "react";
import {shortAddress} from "../../lib/wallet-ui";

/**
 * The connected-state block both wallet buttons share: the wallet label
 * and shortened address, whether it is on X Layer, and a switch button
 * when it is not. Extra actions (like Privy's logout button) ride along
 * as children, after the switch button; a notice, when there is one,
 * renders last.
 */

type ConnectedWalletStatusProps = {
  /** Which wallet this is, e.g. "OKX Wallet" or "Privy wallet". */
  label: string;
  address: string;
  onXLayer: boolean;
  switching: boolean;
  /** The button text while a switch is pending, e.g. "Waiting for OKX Wallet…". */
  switchingLabel: string;
  onSwitchToXLayer: () => void;
  /** A message to show under the buttons, e.g. after a refused switch. */
  notice?: string;
  children?: ReactNode;
};

export default function ConnectedWalletStatus({
  label,
  address,
  onXLayer,
  switching,
  switchingLabel,
  onSwitchToXLayer,
  notice,
  children,
}: ConnectedWalletStatusProps) {
  return (
    <div style={{marginTop: 12}}>
      <p style={{color: "#a7ffcf"}}>
        {label} connected: <b>{shortAddress(address)}</b>
        {onXLayer ? " · X Layer ✓" : " · not on X Layer"}
      </p>
      {!onXLayer && (
        <button className="secondary" onClick={onSwitchToXLayer} disabled={switching}>
          {switching ? switchingLabel : "Switch to X Layer"}
        </button>
      )}
      {children}
      {notice && <p style={{color: "#ff9a9a"}}>{notice}</p>}
    </div>
  );
}
