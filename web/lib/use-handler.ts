"use client";

import { usePrivy } from "@privy-io/react-auth";
import { useEffect, useState } from "react";
import type { Handler } from "@/lib/db/types";

type HandlerState =
  | { status: "loading"; handler: null; error: null }
  | { status: "anonymous"; handler: null; error: null }
  | { status: "ready"; handler: Handler; error: null }
  | { status: "error"; handler: null; error: string };

/**
 * Reads the authenticated handler from /api/handler/me, creating one on
 * first sign-in by POSTing the wallet + email pulled from the Privy user.
 *
 * Tries GET first (fast path for returning users), falls back to POST to
 * create. The result is cached in component state for the lifetime of the
 * page — no global state library needed for v1.
 */
export function useHandler(): HandlerState {
  const { ready, authenticated, user, getAccessToken } = usePrivy();
  const [state, setState] = useState<HandlerState>({
    status: "loading",
    handler: null,
    error: null,
  });

  useEffect(() => {
    if (!ready) {
      setState({ status: "loading", handler: null, error: null });
      return;
    }
    if (!authenticated || !user) {
      setState({ status: "anonymous", handler: null, error: null });
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) throw new Error("no Privy access token");

        // Try GET first (returning user, fast)
        const getRes = await fetch("/api/handler/me", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (getRes.ok) {
          const { handler } = await getRes.json();
          if (!cancelled && handler) {
            setState({ status: "ready", handler, error: null });
            return;
          }
        }

        // New user — POST to create
        const wallet = pickSolanaWallet(user);
        if (!wallet) {
          throw new Error(
            "Sign in completed but no Solana wallet linked. Connect a wallet in Privy."
          );
        }
        const email = pickEmail(user);

        const postRes = await fetch("/api/handler/me", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ primaryWallet: wallet, email }),
        });
        if (!postRes.ok) {
          throw new Error(`POST /handler/me ${postRes.status}: ${await postRes.text()}`);
        }
        const { handler } = await postRes.json();
        if (!cancelled) {
          setState({ status: "ready", handler, error: null });
        }
      } catch (e: any) {
        if (!cancelled) {
          setState({
            status: "error",
            handler: null,
            error: e?.message ?? String(e),
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [ready, authenticated, user, getAccessToken]);

  return state;
}

function pickSolanaWallet(user: any): string | null {
  // External wallet linked (Phantom etc.)
  if (user.wallet && user.wallet.chainType === "solana") return user.wallet.address;
  // Linked accounts may contain a solana wallet
  if (Array.isArray(user.linkedAccounts)) {
    for (const a of user.linkedAccounts) {
      if (a.type === "wallet" && a.chainType === "solana") return a.address;
    }
  }
  return null;
}

function pickEmail(user: any): string | null {
  if (user.email?.address) return user.email.address;
  if (Array.isArray(user.linkedAccounts)) {
    for (const a of user.linkedAccounts) {
      if (a.type === "email" && a.address) return a.address;
    }
  }
  return null;
}
