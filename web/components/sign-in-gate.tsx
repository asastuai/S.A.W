"use client";

import { usePrivy } from "@privy-io/react-auth";

/**
 * Pre-flow login screen. Shown when Privy is configured but the user has
 * not authenticated yet. Replaces the old "Connect your Phantom" idle
 * screen.
 *
 * Once the user signs in (wallet / email / social), the demo page reads
 * the handler from /api/handler/me via useHandler() and proceeds.
 */
export function SignInGate() {
  const { ready, login } = usePrivy();

  return (
    <div className="border border-ash p-8 sm:p-12 text-center max-w-2xl mx-auto">
      <p className="stamp mb-6">Awaiting handler</p>
      <h2 className="font-display text-3xl sm:text-4xl mb-4">Sign in to start.</h2>
      <p className="text-bone/60 max-w-xl mx-auto mb-8 text-sm sm:text-base leading-relaxed">
        Bring your Solana wallet, or log in with email / Google / X. SAW
        creates a programmable agent wallet alongside yours — you remain the
        handler, always.
      </p>

      <button
        onClick={() => login()}
        disabled={!ready}
        className="bg-gold text-ink px-8 py-3 uppercase tracking-widest text-sm hover:bg-bone disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {ready ? "Sign in" : "Loading…"}
      </button>

      <p className="text-bone/40 text-xs mt-8">
        Devnet only. Test SOL, no real funds. You can disconnect any time.
      </p>
    </div>
  );
}

export function LoadingHandler() {
  return (
    <div className="border border-ash p-12 text-center">
      <p className="stamp mb-4">Provisioning handler</p>
      <p className="text-bone/60">Linking your account to the network…</p>
    </div>
  );
}

export function HandlerError({ message }: { message: string }) {
  return (
    <div className="border border-rust p-8 text-center max-w-md mx-auto">
      <p className="stamp text-rust mb-4">Sign-in failed</p>
      <p className="text-bone/70 text-sm mb-4">{message}</p>
      <button
        onClick={() => location.reload()}
        className="border border-bone/30 text-bone/80 px-4 py-2 text-xs uppercase tracking-widest hover:border-gold hover:text-gold"
      >
        Reload
      </button>
    </div>
  );
}
