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
export function SignInGate({ onGuest }: { onGuest?: () => void }) {
  const { ready, login } = usePrivy();

  return (
    <div className="max-w-3xl mx-auto">
      <div className="border border-ash p-8 sm:p-12 text-center">
        <p className="stamp mb-6">Awaiting handler</p>
        <h2 className="font-display text-3xl sm:text-5xl mb-4 tracking-tight">
          Step into the dossier.
        </h2>
        <p className="text-bone/60 max-w-xl mx-auto mb-8 text-sm sm:text-base leading-relaxed">
          Connect with Phantom to operate on devnet — or step in without a
          wallet in demo mode to try it. Anyone can paste an LLM key and
          chat with their operative.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={() => login()}
            disabled={!ready}
            className="bg-gold text-ink px-8 py-3 uppercase tracking-widest text-sm hover:bg-bone disabled:opacity-40 disabled:cursor-not-allowed transition"
          >
            {ready ? "Sign in with wallet" : "Loading…"}
          </button>
          {onGuest && (
            <button
              onClick={onGuest}
              className="border border-gold/60 text-gold px-8 py-3 uppercase tracking-widest text-sm hover:bg-gold hover:text-ink transition"
            >
              Try without wallet
            </button>
          )}
        </div>

        <p className="text-bone/40 text-xs mt-8">
          Devnet only · test SOL · no real funds · disconnect any time
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-px bg-ash mt-6">
        <div className="bg-ink p-4">
          <div className="stamp mb-2">Step I</div>
          <div className="text-bone/80 text-sm">Connect Phantom · 1 signature</div>
        </div>
        <div className="bg-ink p-4">
          <div className="stamp mb-2">Step II</div>
          <div className="text-bone/80 text-sm">Brief your Operative & watch it act</div>
        </div>
        <div className="bg-ink p-4">
          <div className="stamp mb-2">Step III</div>
          <div className="text-bone/80 text-sm">Bring an LLM key or pay 0.01 SOL for credits</div>
        </div>
      </div>
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
