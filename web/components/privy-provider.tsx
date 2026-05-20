"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { toSolanaWalletConnectors } from "@privy-io/react-auth/solana";
import { useEffect, useState } from "react";

/**
 * Privy wraps the app and provides:
 *   - Embedded wallets for non-Web3 users (login with email / Google / X)
 *   - External wallet connection for Phantom + Solflare + Backpack (existing users)
 *   - Recovery, key export, multi-device
 *
 * The Solana wallet adapter ecosystem continues to work alongside via
 * `toSolanaWalletConnectors()`, which exposes Privy-linked external wallets
 * to the same `useWallet` / `useConnection` hooks the demo already uses.
 */
export function PrivyAuthProvider({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;
  if (!appId) {
    // Privy not configured yet — render children unwrapped so legacy Phantom
    // path still works in development.
    return <>{children}</>;
  }
  if (!mounted) return null;

  return (
    <PrivyProvider
      appId={appId}
      config={{
        appearance: {
          theme: "dark",
          accentColor: "#c8a64b",
          logo: undefined,
          walletChainType: "solana-only",
        },
        loginMethods: ["wallet", "email", "google", "twitter"],
        embeddedWallets: {
          solana: { createOnLogin: "users-without-wallets" },
        },
        externalWallets: {
          solana: { connectors: toSolanaWalletConnectors() },
        },
      }}
    >
      {children}
    </PrivyProvider>
  );
}
