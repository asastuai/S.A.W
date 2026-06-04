"use client";

import { useEffect, useRef } from "react";
import type { Opportunity, ScheduleItem } from "@/lib/schedule";
import { describeTrigger, pendingOpportunities } from "@/lib/schedule";
import { DEMO_DECIMALS } from "@/lib/saw";
import { CreatorNote } from "@/components/creator-note";
import { BellToggle } from "@/components/notify-toggle";
import { alertEvent } from "@/lib/notify";

const fmt = (n: number) =>
  `${(n / 10 ** DEMO_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} USDC-dev`;

export function OpportunityReel({
  opportunities,
  now,
  scanning,
  glyph,
  personaName,
  onAccept,
  onSkip,
}: {
  opportunities: Opportunity[];
  now: number;
  scanning: boolean;
  glyph: string;
  personaName: string;
  onAccept: (opp: Opportunity) => void;
  onSkip: (opp: Opportunity) => void;
}) {
  const pending = pendingOpportunities(opportunities, now);

  // Fire a chime + native notification the moment a NEW opportunity lands.
  // The first render seeds the "seen" set silently so a session restore
  // doesn't ping for every pre-existing card — only genuinely fresh
  // proposals buzz.
  const seenRef = useRef<Set<string> | null>(null);
  useEffect(() => {
    const ids = pending.map((o) => o.id);
    if (seenRef.current === null) {
      seenRef.current = new Set(ids);
      return;
    }
    for (const o of pending) {
      if (!seenRef.current.has(o.id)) {
        seenRef.current.add(o.id);
        alertEvent(
          `${personaName} spotted a move`,
          `${o.title} — ${fmt(o.suggested.amount)} → ${o.suggested.vendor}`
        );
      }
    }
  }, [pending, personaName]);

  if (pending.length === 0 && !scanning) return null;

  return (
    <div className="border border-gold/40 bg-gold/5 p-4 mb-6">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-gold font-display text-lg">{glyph}</span>
          <span className="text-xs uppercase tracking-widest text-gold flex items-center gap-2">
            {personaName} spotted
            <BellToggle />
            <CreatorNote
              text="This is now live: turn on the bell and every fresh proposal arrives with a chime and a native OS notification — the buzz in your pocket. When server-side dispatch lands, the same alert moves behind a service-worker push so it reaches you with the tab closed."
              position="bottom-left"
            />
          </span>
          {scanning && (
            <span className="text-xs text-bone/40 italic ml-2">
              scanning…
            </span>
          )}
        </div>
        {pending.length > 0 && (
          <span className="text-xs text-bone/50">
            {pending.length} pending · expire automatically
          </span>
        )}
      </div>

      {pending.length === 0 ? (
        <div className="text-bone/40 text-sm italic py-2">
          Reading the tape. Nothing actionable yet.
        </div>
      ) : (
        <div className="flex gap-3 overflow-x-auto pb-1">
          {pending.map((o) => (
            <Card key={o.id} opp={o} now={now} onAccept={onAccept} onSkip={onSkip} />
          ))}
        </div>
      )}
    </div>
  );
}

function Card({
  opp,
  now,
  onAccept,
  onSkip,
}: {
  opp: Opportunity;
  now: number;
  onAccept: (opp: Opportunity) => void;
  onSkip: (opp: Opportunity) => void;
}) {
  const secsLeft = Math.max(0, Math.round((opp.expiresAt - now) / 1000));
  const expiry =
    secsLeft >= 60
      ? `${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s`
      : `${secsLeft}s`;
  const conf =
    opp.confidence === "high"
      ? "text-gold border-gold"
      : opp.confidence === "medium"
      ? "text-bone/80 border-bone/40"
      : "text-bone/50 border-bone/20";

  const fakeItem: ScheduleItem = {
    id: opp.id,
    scheduledFor: opp.suggested.scheduledFor ?? Date.now(),
    vendor: opp.suggested.vendor,
    amount: opp.suggested.amount,
    reason: opp.suggested.reason,
    status: "queued",
    trigger: opp.suggested.trigger,
  };

  return (
    <div className="shrink-0 w-[340px] border border-ash bg-ink p-4 animate-pop-in">
      <div className="flex items-start justify-between mb-2">
        <div className="font-display text-base text-bone leading-tight">
          {opp.title}
        </div>
        <div className={`shrink-0 ml-2 text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${conf}`}>
          {opp.confidence}
        </div>
      </div>
      <div className="text-bone/80 text-sm leading-relaxed mb-3">
        {opp.message}
      </div>
      <div className="border-l-2 border-gold/40 pl-3 mb-3 space-y-0.5">
        <div className="text-xs uppercase tracking-widest text-bone/40">
          If accepted
        </div>
        <div className="text-bone text-sm">
          {fmt(opp.suggested.amount)} → {opp.suggested.vendor}
        </div>
        {opp.suggested.trigger && opp.suggested.trigger.kind !== "time" && (
          <div className="text-gold/70 text-xs">▸ {describeTrigger(fakeItem)}</div>
        )}
      </div>
      <div className="flex items-center justify-between mb-3">
        <span className="text-bone/40 text-xs">expires in {expiry}</span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => onSkip(opp)}
          className="border border-bone/30 text-bone/60 py-2 text-xs uppercase tracking-widest hover:border-rust hover:text-rust transition"
        >
          Skip
        </button>
        <button
          onClick={() => onAccept(opp)}
          className="bg-gold text-ink py-2 text-xs uppercase tracking-widest hover:bg-bone transition"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
