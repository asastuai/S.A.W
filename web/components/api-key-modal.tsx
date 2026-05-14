"use client";

import { useState } from "react";
import { isValidShape } from "@/lib/api-key";

export function ApiKeyModal({
  initialKey,
  onSave,
  onClear,
  onClose,
}: {
  initialKey: string | null;
  onSave: (key: string) => void;
  onClear: () => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(initialKey ?? "");
  const [show, setShow] = useState(false);
  const valid = isValidShape(draft);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/80 backdrop-blur-sm animate-fade-in p-4">
      <div className="w-full max-w-xl bg-ink border border-gold p-6 sm:p-8 animate-slide-up">
        <div className="flex items-start justify-between mb-6">
          <div>
            <p className="stamp mb-2">Configure your agent</p>
            <h2 className="font-display text-2xl">Connect a brain to your operative</h2>
          </div>
          <button
            onClick={onClose}
            className="text-bone/40 hover:text-bone text-xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <p className="text-bone/70 text-sm mb-6 leading-relaxed">
          Your agent uses an LLM to read intent, scan the market, and propose moves.
          To keep this demo free for everyone, you bring your own API key — it stays
          in your browser, never on our servers.
        </p>

        <ol className="text-sm text-bone/80 space-y-3 mb-6">
          <li>
            <span className="text-gold mr-2">1.</span>
            Get a free Groq key at{" "}
            <a
              href="https://console.groq.com/keys"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              console.groq.com/keys
            </a>{" "}
            (1 minute, no card required).
          </li>
          <li>
            <span className="text-gold mr-2">2.</span>
            Paste it below. It saves to this browser only.
          </li>
        </ol>

        <div className="mb-2">
          <label className="text-xs uppercase tracking-widest text-bone/50 mb-2 block">
            Groq API key
          </label>
          <div className="flex gap-2">
            <input
              type={show ? "text" : "password"}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="gsk_..."
              className="flex-1 bg-smoke border border-ash text-bone px-3 py-2 text-sm font-mono focus:outline-none focus:border-gold"
            />
            <button
              type="button"
              onClick={() => setShow((s) => !s)}
              className="text-xs uppercase tracking-widest text-bone/50 hover:text-bone border border-ash px-3"
            >
              {show ? "Hide" : "Show"}
            </button>
          </div>
          {draft && !valid && (
            <p className="text-rust text-xs mt-2">
              Doesn't look like a Groq key — should start with <code>gsk_</code>.
            </p>
          )}
        </div>

        <p className="text-bone/40 text-xs mb-6 leading-relaxed">
          The key is stored in <code>localStorage</code> under your handler. It is sent
          server-side only when your agent needs to think, and never logged. Remove it
          any time with the button below.
        </p>

        <div className="grid grid-cols-2 gap-3">
          {initialKey ? (
            <button
              onClick={() => {
                onClear();
                onClose();
              }}
              className="border border-rust text-rust py-3 uppercase tracking-widest text-xs hover:bg-rust hover:text-bone transition"
            >
              Remove key
            </button>
          ) : (
            <button
              onClick={onClose}
              className="border border-bone/30 text-bone/60 py-3 uppercase tracking-widest text-xs hover:border-bone hover:text-bone transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={() => {
              if (!valid) return;
              onSave(draft.trim());
              onClose();
            }}
            disabled={!valid}
            className="bg-gold text-ink py-3 uppercase tracking-widest text-xs hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            {initialKey ? "Update key" : "Connect agent"}
          </button>
        </div>
      </div>
    </div>
  );
}
