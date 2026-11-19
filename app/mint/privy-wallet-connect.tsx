"use client";

import {useEffect, useRef, useState} from "react";
import {usePrivy, useWallets} from "@privy-io/react-auth";
import {
  createPrivyWalletAdapter,
  parsePrivyChainId,
  selectMintingWallet,
} from "../../lib/privy-wallet";
import type {WalletAdapter} from "../../lib/wallet-adapter";
import type {WalletConnectProps} from "../../lib/wallet-ui";
import {X_LAYER_CHAIN_ID} from "../../lib/x-layer-chain";
import ConnectedWalletStatus from "./connected-wallet-status";
import {useSwitchToXLayer} from "./use-switch-to-x-layer";

/**
 * The Privy login button for the mint page: log in with email (which
 * creates an embedded wallet automatically) or with an external wallet
 * through the Privy modal, and hand the connected wallet to the mint flow
 * through the shared adapter. The page talks to Privy only through this
 * component and the adapter; no SDK call lives in the mint page itself.
 *
 * This component is only ever mounted when Privy is configured (the mint
 * page checks the App ID first), so the provider above it is always
 * mounted. Nothing here touches a wallet before the SDK reports ready:
 * the adapter is built only once both ready flags are true.
 *
 * The mint page keeps owning the wallet address: onConnected fills it in,
 * and a logout or disconnect clears it through onAccountChanged(null).
 */

export default function PrivyWalletConnect({onConnected, onAccountChanged}: WalletConnectProps) {
  const {ready: privyReady, authenticated, login, logout} = usePrivy();
  const {wallets, ready: walletsReady} = useWallets();
  const [connectedAddress, setConnectedAddress] = useState("");
  const [chainId, setChainId] = useState<number | undefined>(undefined);
  const adapterRef = useRef<WalletAdapter | null>(null);
  const reportedRef = useRef<{address: string; chainId: string} | null>(null);
  // The mint page passes fresh callbacks every render; the effect below
  // reads them through this ref so it only re-runs when the wallet changes.
  const callbacksRef = useRef({onConnected, onAccountChanged});
  callbacksRef.current = {onConnected, onAccountChanged};
  const {switching, notice, switchToXLayer} = useSwitchToXLayer(adapterRef, () =>
    setChainId(X_LAYER_CHAIN_ID)
  );

  const ready = privyReady && walletsReady;
  const selected = ready && authenticated ? selectMintingWallet(wallets) : undefined;
  const selectedAddress = selected?.address;
  const selectedChainId = selected?.chainId;

  // Follow the Privy wallet reactively: report a new wallet (or a chain
  // change, which needs a fresh adapter) and report a logout/disconnect.
  useEffect(() => {
    if (!selected) {
      if (reportedRef.current) {
        reportedRef.current = null;
        adapterRef.current = null;
        setConnectedAddress("");
        setChainId(undefined);
        callbacksRef.current.onAccountChanged(null);
      }
      return;
    }
    const key = {address: selected.address, chainId: selected.chainId};
    if (
      reportedRef.current?.address === key.address &&
      reportedRef.current?.chainId === key.chainId
    ) {
      return;
    }
    reportedRef.current = key;
    const adapter = createPrivyWalletAdapter(selected);
    adapterRef.current = adapter;
    setConnectedAddress(selected.address);
    setChainId(parsePrivyChainId(selected.chainId));
    callbacksRef.current.onConnected({address: selected.address, adapter});
    // The primitives cover an in-place wallet update (same object, new
    // chain); the object covers a replaced wallet.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, selectedAddress, selectedChainId]);

  // Still loading the SDK: render nothing until ready, so no wallet is
  // ever touched before the SDK says it is safe.
  if (!ready) return null;

  if (!authenticated) {
    return (
      <div style={{marginTop: 12}}>
        <button className="secondary" onClick={() => login()}>
          Log in with email or wallet
        </button>
        <p>
          No wallet installed? Log in with your email and a wallet is created for you
          automatically. You can also connect OKX Wallet or MetaMask from the same login.
        </p>
      </div>
    );
  }

  if (!selected) {
    return (
      <div style={{marginTop: 12}}>
        <p>
          You are logged in, but no wallet is connected yet. Log out and log in again, or type
          your wallet address above to continue without Privy.
        </p>
        <button className="secondary" onClick={() => void logout()}>
          Log out of Privy
        </button>
      </div>
    );
  }

  return (
    <ConnectedWalletStatus
      label="Privy wallet"
      address={connectedAddress}
      onXLayer={chainId === X_LAYER_CHAIN_ID}
      switching={switching}
      switchingLabel="Waiting for wallet…"
      onSwitchToXLayer={switchToXLayer}
      notice={notice}
    >
      <button className="secondary" onClick={() => void logout()} style={{marginLeft: 8}}>
        Log out of Privy
      </button>
    </ConnectedWalletStatus>
  );
}
