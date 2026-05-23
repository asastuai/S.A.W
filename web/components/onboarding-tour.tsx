"use client";

import { useEffect, useState } from "react";

// v1.3 bumped the key so users who saw the v1.2 (3-persona) tour see
// the new copy once. Old key removed on read.
const STORAGE_KEY = "saw-demo-v1:tour-seen-v13";
const LEGACY_KEYS = ["saw-demo-v1:tour-seen"];

type Step = {
  stamp: string;
  title: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    stamp: "step 01 · meet your operative",
    title: "One agent. Full spectrum.",
    body: (
      <>
        SAW gave you a single <strong>Operative</strong> when you connected:
        an LLM-driven agent that <em>trades</em>, <em>finds yield</em>, and
        helps you <em>build saving habits</em> — all in one conversation. Pick
        a codename for it in ⚙ settings whenever you want.
      </>
    ),
  },
  {
    stamp: "step 02 · brief it in plain language",
    title: "Tell it what to do.",
    body: (
      <>
        Type intent like &ldquo;poneme 100 USDC en el mejor APR de Solana&rdquo;
        or &ldquo;buy SOL if it drops 3% in the next hour&rdquo; or &ldquo;quiero
        ahorrar 20 USDC todos los lunes.&rdquo; The Operative reads the tape /
        queries live yields / asks before proposing, and queues items on the
        right.
      </>
    ),
  },
  {
    stamp: "step 03 · sign only what matters",
    title: "Policy enforced on-chain.",
    body: (
      <>
        Each queued item shows <strong>▶ execute now</strong>. Items inside
        your policy auto-execute. Items over the approval threshold pause for
        your single Phantom signature. Daily cap, per-tx cap, and threshold
        all live on-chain — the agent operates inside the lines.
      </>
    ),
  },
  {
    stamp: "step 04 · chat from anywhere",
    title: "Connect Telegram in one click.",
    body: (
      <>
        Press <strong>📱 connect telegram</strong> in the header. The bot links
        to your handler instantly — no codes, no pasting. From then on, message
        the Operative from your phone and the same agent answers with the same
        memory. On-chain signing still happens in this browser.
      </>
    ),
  },
];

export function OnboardingTour({ enabled }: { enabled: boolean }) {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    if (typeof window === "undefined") return;
    if (window.localStorage.getItem(STORAGE_KEY)) return;
    // Remove the v1.2 key so it doesn't linger in storage if the user
    // dismissed the old tour; they're seeing v1.3 copy now anyway.
    for (const legacy of LEGACY_KEYS) {
      try {
        window.localStorage.removeItem(legacy);
      } catch {
        /* ignore */
      }
    }
    setOpen(true);
  }, [enabled]);

  function dismiss() {
    if (typeof window !== "undefined") {
      window.localStorage.setItem(STORAGE_KEY, String(Date.now()));
    }
    setOpen(false);
  }

  if (!open) return null;
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm px-4"
      onClick={dismiss}
    >
      <div
        className="border border-gold/50 bg-ink max-w-lg w-full p-6 sm:p-8 shadow-[0_0_40px_rgba(212,175,55,0.15)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <span className="text-[10px] uppercase tracking-widest text-gold">
            {current.stamp}
          </span>
          <button
            onClick={dismiss}
            className="text-[10px] uppercase tracking-widest text-bone/40 hover:text-rust"
            aria-label="Skip tour"
          >
            skip
          </button>
        </div>

        <h3 className="font-display text-2xl sm:text-3xl mb-4 text-bone">
          {current.title}
        </h3>

        <p className="text-sm text-bone/80 leading-relaxed mb-6">
          {current.body}
        </p>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            {STEPS.map((_, i) => (
              <span
                key={i}
                className={`h-1 w-6 transition ${
                  i === step
                    ? "bg-gold"
                    : i < step
                    ? "bg-gold/40"
                    : "bg-ash"
                }`}
                aria-hidden
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {step > 0 && (
              <button
                onClick={() => setStep((s) => Math.max(0, s - 1))}
                className="text-xs uppercase tracking-widest text-bone/60 hover:text-gold px-3 py-1.5 border border-ash"
              >
                ← back
              </button>
            )}
            <button
              onClick={() => (isLast ? dismiss() : setStep((s) => s + 1))}
              className="text-xs uppercase tracking-widest border border-gold text-gold hover:bg-gold hover:text-ink transition px-4 py-1.5"
            >
              {isLast ? "got it →" : "next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
