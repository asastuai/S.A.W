"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/schedule";
import { CreatorNote } from "@/components/creator-note";
import { Caret } from "@/components/terminal/caret";

export function Chat({
  messages,
  onSend,
  busy,
  placeholder = "Tell the agent what to do…",
}: {
  messages: ChatMessage[];
  onSend: (text: string) => void;
  busy: boolean;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [messages.length, busy]);

  function submit() {
    const trimmed = draft.trim();
    if (!trimmed || busy) return;
    onSend(trimmed);
    setDraft("");
  }

  return (
    <div className="relative flex flex-col h-full border border-ash bg-ink font-mono">
      {/* Corner bracket marks — pure terminal chrome. */}
      <span aria-hidden="true" className="pointer-events-none absolute -left-px -top-px text-[10px] leading-none text-gold/40">
        ┌
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute -right-px -top-px text-[10px] leading-none text-gold/40">
        ┐
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -left-px text-[10px] leading-none text-gold/40">
        └
      </span>
      <span aria-hidden="true" className="pointer-events-none absolute -bottom-px -right-px text-[10px] leading-none text-gold/40">
        ┘
      </span>

      <style jsx global>{`
        @keyframes chat-land {
          0% {
            opacity: 0;
            transform: translateY(6px);
          }
          100% {
            opacity: 1;
            transform: translateY(0);
          }
        }
        @keyframes chat-status-pulse {
          0%,
          100% {
            opacity: 0.5;
            box-shadow: 0 0 0 0 rgba(90, 209, 154, 0.5);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 0 3px rgba(90, 209, 154, 0);
          }
        }
        @keyframes chat-dot {
          0%,
          80%,
          100% {
            opacity: 0.25;
          }
          40% {
            opacity: 1;
          }
        }
        .chat-land {
          animation: chat-land 220ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .chat-status {
          animation: chat-status-pulse 2.2s ease-in-out infinite;
        }
        .chat-dot {
          display: inline-block;
          animation: chat-dot 1.1s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .chat-land,
          .chat-status,
          .chat-dot {
            animation: none;
          }
        }
      `}</style>

      {/* Channel header — a live session readout, not a card title. */}
      <div className="border-b border-ash px-4 py-2 flex items-center justify-between gap-3">
        <div className="text-[11px] uppercase tracking-widest text-gold flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="chat-status h-1.5 w-1.5 rounded-full bg-phosphor" aria-hidden />
            <span className="text-gold/50 select-none">┤</span>
            session://briefing
            <span className="text-gold/50 select-none">├</span>
          </span>
          <CreatorNote
            text="Imagine this as a phone-notification reel. The mobile version will live closer to a Telegram thread than a desktop card — every agent reply landing as a push you can swipe."
            position="bottom-right"
          />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-bone/40 flex items-center gap-2">
          <span className="text-phosphor/80">online</span>
          <span className="text-ash">·</span>
          <span>{messages.length} log</span>
        </div>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-2 min-h-[260px] max-h-[60vh] sm:max-h-[520px]"
      >
        {messages.length === 0 && !busy ? (
          <div className="text-bone/40 text-xs py-12 text-center">
            <span className="text-gold/60">&gt;</span> awaiting command. tell the agent what you need today.
            <Caret className="ml-1" />
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
        {busy && (
          <div className="chat-land flex items-center gap-2 text-bone/50 text-xs">
            <span className="text-phosphor/70 select-none">agent</span>
            <span className="text-ash select-none">»</span>
            <span className="inline-flex items-center gap-0.5">
              <span className="chat-dot" style={{ animationDelay: "0ms" }}>
                .
              </span>
              <span className="chat-dot" style={{ animationDelay: "180ms" }}>
                .
              </span>
              <span className="chat-dot" style={{ animationDelay: "360ms" }}>
                .
              </span>
            </span>
            <span className="text-bone/40 italic">working</span>
          </div>
        )}
      </div>

      {/* Input row — a live prompt with a blinking caret. */}
      <div className="border-t border-ash p-3 flex items-stretch gap-2">
        <div className="flex flex-1 items-start gap-2 bg-smoke border border-ash px-3 py-2 focus-within:border-gold transition-colors">
          <span aria-hidden className="text-gold font-semibold select-none leading-relaxed pt-px">
            &gt;
          </span>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder={placeholder}
            disabled={busy}
            className="flex-1 bg-transparent text-bone text-sm leading-relaxed focus:outline-none resize-none placeholder:text-bone/30 disabled:opacity-50"
          />
          {!busy && draft.length === 0 && <Caret className="mt-px" />}
        </div>
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="bg-gold text-ink px-4 uppercase tracking-widest text-xs font-semibold hover:bg-goldlit disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function Bubble({ m }: { m: ChatMessage }) {
  if (m.role === "system") {
    return (
      <div className="chat-land text-bone/40 text-[11px] tracking-wide flex items-start gap-2">
        <span aria-hidden className="text-rust/70 select-none">
          ##
        </span>
        <span className="uppercase tracking-widest">{m.content}</span>
      </div>
    );
  }
  const isUser = m.role === "user";
  return (
    <div className="chat-land flex items-start gap-2 text-sm leading-relaxed">
      <span
        aria-hidden
        className={`select-none shrink-0 pt-px text-[11px] uppercase tracking-widest ${
          isUser ? "text-gold" : "text-phosphor"
        }`}
      >
        {isUser ? "you »" : "agent «"}
      </span>
      <div
        className={`min-w-0 flex-1 ${
          isUser ? "text-bone" : "text-bone/90"
        }`}
      >
        {m.content.split("\n").map((line, i) => (
          <div key={i} className="break-words">
            {line || " "}
          </div>
        ))}
      </div>
    </div>
  );
}
