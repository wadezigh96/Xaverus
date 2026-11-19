"use client";

import {PrivyProvider} from "@privy-io/react-auth";
import {resolvePrivySetup} from "../lib/privy-config";

/**
 * Client-side providers for the app shell. Privy is strictly optional: when
 * no App ID is configured, children render directly with no provider
 * mounted and no error, and the app behaves exactly as it did before wallet
 * connect existed. No Privy code path runs without an App ID.
 */
export default function Providers({children}: {children: React.ReactNode}) {
  const setup = resolvePrivySetup({
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  });
  if (!setup) return <>{children}</>;
  return (
    <PrivyProvider appId={setup.appId} config={setup.config}>
      {children}
    </PrivyProvider>
  );
}
