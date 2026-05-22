"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "saw-demo-v1:tour-seen";

type Step = {
  stamp: string;
  title: string;
  body: React.ReactNode;
};

const STEPS: Step[] = [
  {
    stamp: "step 01 · how this works",
    title: "Your Phantom. Their agent. Your policy.",
    body: (
      <>
        SAW gives each LLM persona an <em>agent wallet</em> derived from your
        Phantom. The agent can move funds inside a policy you set — per-tx cap,
        daily cap, threshold for approvals. You keep your keys; the agent
        executes inside the lines.
      </>
    ),
  },
  {
    stamp: "step 02 · brief the agent",
    title: "Chat with it like a person.",
    body: (
      <>
        Type your intent in plain language — &ldquo;put 50 USDC-dev to work in
        the safest pool you can find&rdquo; or &ldquo;buy SOL every Tuesday if
        it&rsquo;s below $130.&rdquo; The agent will propose a schedule. Each
        item shows up on the right, queued, awaiting trigger.
      </>
    ),
  },
  {
    stamp: "step 03 · approve, then execute",
    title: "Hit ▶ execute now to send it on-chain.",
    body: (
      <>
        Below each queued item is a <strong>▶ execute now</strong> button.
        Click it and Phantom will pop up for the single signature that moves
        the funds. Items inside policy auto-execute; items over threshold pause
        for your approval.
      </>
    ),
  },
  {
    stamp: "step 04 · chat from anywhere",
    title: "Connect Telegram for chat away from this tab.",
    body: (
      <>
        The <strong>📱 connect telegram</strong> button in the header pairs
        your handler to the bot in one click. From then on, message the bot
        and the same agent answers — with the same policy, the same memory.
        On-chain execution still happens in this browser session.
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
