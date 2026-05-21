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
      <div className="border-b border-ash px-4 py-2 flex items-center justify-between">
        <div className="text-xs uppercase tracking-widest text-gold flex items-center gap-2">
          Briefing channel
          <CreatorNote
            text="Imagine this as a phone-notification reel. The mobile version will live closer to a Telegram thread than a desktop card — every agent reply landing as a push you can swipe."
            position="bottom-right"
          />
        </div>
        <div className="text-xs text-bone/40">{messages.length} messages</div>
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
          <div className="flex items-center gap-2 text-bone/50 text-sm italic">
            <span className="inline-flex gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-mascot-pop" style={{ animationDelay: "0ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-mascot-pop" style={{ animationDelay: "150ms" }} />
              <span className="h-1.5 w-1.5 rounded-full bg-gold animate-mascot-pop" style={{ animationDelay: "300ms" }} />
            </span>
            taking notes
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
      <div className="text-center text-bone/40 text-xs italic uppercase tracking-widest">
        {m.content}
      </div>
    );
  }
  const isUser = m.role === "user";
  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] px-3 py-2 text-sm leading-relaxed ${
          isUser
            ? "bg-gold/10 border border-gold/30 text-bone"
            : "bg-smoke border border-ash text-bone/90"
        }`}
      >
        {m.content.split("\n").map((line, i) => (
          <div key={i}>{line || "\u00A0"}</div>
        ))}
      </div>
    </div>
  );
}
