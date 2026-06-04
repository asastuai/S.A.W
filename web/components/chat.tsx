"use client";

import { useEffect, useRef, useState } from "react";
import type { ChatMessage } from "@/lib/schedule";
import { CreatorNote } from "@/components/creator-note";

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
    <div className="flex flex-col h-full border border-ash bg-ink">
      <style jsx global>{`
        @keyframes chat-land {
          0% {
            opacity: 0;
            transform: translateY(10px) scale(0.985);
          }
          100% {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
        @keyframes chat-status-pulse {
          0%,
          100% {
            opacity: 0.55;
            box-shadow: 0 0 0 0 rgba(201, 169, 110, 0.5);
          }
          50% {
            opacity: 1;
            box-shadow: 0 0 0 3px rgba(201, 169, 110, 0);
          }
        }
        @keyframes chat-dot {
          0%,
          60%,
          100% {
            transform: translateY(0);
            opacity: 0.45;
          }
          30% {
            transform: translateY(-3px);
            opacity: 1;
          }
        }
        .chat-land {
          animation: chat-land 320ms cubic-bezier(0.16, 1, 0.3, 1) both;
        }
        .chat-status {
          animation: chat-status-pulse 2.2s ease-in-out infinite;
        }
        .chat-dot {
          display: inline-block;
          height: 0.4rem;
          width: 0.4rem;
          border-radius: 9999px;
          background: #c9a96e;
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

      <div className="border-b border-ash px-4 py-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-gold flex items-center gap-2">
          <span className="flex items-center gap-1.5">
            <span className="chat-status h-1.5 w-1.5 rounded-full bg-gold" aria-hidden />
            Briefing channel
          </span>
          <CreatorNote
            text="Imagine this as a phone-notification reel. The mobile version will live closer to a Telegram thread than a desktop card — every agent reply landing as a push you can swipe."
            position="bottom-right"
          />
        </div>
        <div className="text-[10px] uppercase tracking-widest text-bone/40 flex items-center gap-2">
          <span className="text-gold/70">online</span>
          <span className="text-bone/30">·</span>
          <span>{messages.length} messages</span>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 min-h-[260px] max-h-[60vh] sm:max-h-[520px]">
        {messages.length === 0 && !busy ? (
          <div className="text-bone/40 italic text-sm text-center py-12">
            Start the conversation. Tell the agent what you need today.
          </div>
        ) : (
          messages.map((m) => <Bubble key={m.id} m={m} />)
        )}
        {busy && (
          <div className="chat-land flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-smoke border border-ash px-3 py-2 text-bone/50 text-sm italic">
              <span className="inline-flex items-end gap-1">
                <span className="chat-dot" style={{ animationDelay: "0ms" }} />
                <span className="chat-dot" style={{ animationDelay: "180ms" }} />
                <span className="chat-dot" style={{ animationDelay: "360ms" }} />
              </span>
              typing…
            </div>
          </div>
        )}
      </div>

      <div className="border-t border-ash p-3 flex gap-2">
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
          className="flex-1 bg-smoke border border-ash text-bone px-3 py-2 text-sm focus:outline-none focus:border-gold resize-none disabled:opacity-50"
        />
        <button
          onClick={submit}
          disabled={busy || !draft.trim()}
          className="bg-gold text-ink px-4 uppercase tracking-widest text-xs hover:bg-bone disabled:opacity-30 disabled:cursor-not-allowed"
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
      <div className="chat-land text-center text-bone/40 text-xs italic uppercase tracking-widest">
        {m.content}
      </div>
    );
  }
  const isUser = m.role === "user";
  return (
    <div className={`chat-land flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className="max-w-[80%] flex flex-col gap-1">
        <span
          className={`text-[9px] uppercase tracking-widest text-bone/30 ${
            isUser ? "text-right pr-1" : "text-left pl-1"
          }`}
        >
          {isUser ? "you" : "agent"}
        </span>
        <div
          className={`px-3 py-2 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "bg-gold/10 border border-gold/30 text-bone rounded-2xl rounded-br-sm"
              : "bg-smoke border border-ash text-bone/90 rounded-2xl rounded-bl-sm"
          }`}
        >
          {m.content.split("\n").map((line, i) => (
            <div key={i}>{line || "\u00A0"}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
