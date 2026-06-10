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

// Render a wall-clock timestamp for an intel line: HH:MM:SS, UTC-stable enough
// for a feed. Purely cosmetic — drives nothing.
const stamp = (ts: number) =>
  new Date(ts).toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

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

  // Purely-visual freshness tracking. Kept entirely separate from the
  // notification seenRef above so the chime/native-alert logic is never
  // touched: this only decides which cards get the one-shot "buzz" flash.
  // First render seeds silently (matching the alert seeding) so restored
  // sessions don't flash every pre-existing card.
  const flashSeenRef = useRef<Set<string> | null>(null);
  const freshIds = new Set<string>();
  {
    const ids = pending.map((o) => o.id);
    if (flashSeenRef.current === null) {
      flashSeenRef.current = new Set(ids);
    } else {
      for (const id of ids) {
        if (!flashSeenRef.current.has(id)) {
          flashSeenRef.current.add(id);
          freshIds.add(id);
        }
      }
    }
  }

  const hasFresh = freshIds.size > 0;

  if (pending.length === 0 && !scanning) return null;

  return (
    <div
      className={`relative border bg-gold/[0.04] mb-6 font-mono transition-colors duration-500 ${
        hasFresh ? "border-gold reel-alive" : "border-gold/40"
      }`}
    >
      {/* Corner bracket marks — terminal chrome. */}
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

      {/* Command bar — the feed renders as `tail -f` on the intel stream. */}
      <div className="flex items-center justify-between gap-3 border-b border-gold/20 px-4 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <span
            className={`text-gold text-base leading-none ${
              hasFresh ? "reel-glyph-alive" : ""
            }`}
          >
            {glyph}
          </span>
          <span className="text-xs text-bone/80 truncate">
            <span className="text-gold font-semibold select-none mr-2">$</span>
            tail -f{" "}
            <span className="text-gold">{personaName.toLowerCase().replace(/\s+/g, "_")}.intel</span>
          </span>
          <span className="flex items-center gap-2 shrink-0">
            {pending.length > 0 && (
              <span className="relative flex h-1.5 w-1.5">
                <span className="absolute inline-flex h-full w-full rounded-full bg-phosphor animate-ping opacity-70" />
                <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-phosphor" />
              </span>
            )}
            <BellToggle />
            <CreatorNote
              text="This is live: turn on the bell and every fresh proposal arrives with a chime and a native OS notification — the buzz in your pocket. Closed-tab delivery is wired too: the cron sends a web push (service worker) when a trigger goes ready, so an installed PWA buzzes even with the tab shut."
              position="bottom-left"
            />
          </span>
          {scanning && (
            <span className="text-xs text-phosphor/70 shrink-0">scanning…</span>
          )}
        </div>
        {pending.length > 0 && (
          <span className="text-[11px] uppercase tracking-widest text-bone/40 shrink-0">
            {pending.length} pending · auto-expire
          </span>
        )}
      </div>

      <div className="p-4">
        {pending.length === 0 ? (
          <div className="text-bone/40 text-xs py-2 flex items-center gap-2">
            <span className="text-gold/50 select-none">&gt;</span>
            reading the tape. nothing actionable yet.
          </div>
        ) : (
          <div className="flex gap-3 overflow-x-auto pb-1">
            {pending.map((o) => (
              <Card
                key={o.id}
                opp={o}
                now={now}
                fresh={freshIds.has(o.id)}
                onAccept={onAccept}
                onSkip={onSkip}
              />
            ))}
          </div>
        )}
      </div>

      <style jsx>{`
        /* The whole surface briefly brightens when a fresh proposal lands —
           a real-time-alert pulse, gone in under a second. */
        .reel-alive {
          animation: reel-alert 900ms ease-out 1;
        }
        @keyframes reel-alert {
          0% {
            box-shadow: 0 0 0 0 rgba(240, 180, 41, 0);
          }
          25% {
            box-shadow: 0 0 22px 2px rgba(240, 180, 41, 0.35);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(240, 180, 41, 0);
          }
        }
        .reel-glyph-alive {
          animation: reel-glyph 900ms ease-out 1;
          transform-origin: center;
        }
        @keyframes reel-glyph {
          0% {
            transform: scale(1);
          }
          30% {
            transform: scale(1.35);
            filter: drop-shadow(0 0 6px rgba(240, 180, 41, 0.8));
          }
          100% {
            transform: scale(1);
          }
        }
      `}</style>
    </div>
  );
}

function Card({
  opp,
  now,
  fresh,
  onAccept,
  onSkip,
}: {
  opp: Opportunity;
  now: number;
  fresh: boolean;
  onAccept: (opp: Opportunity) => void;
  onSkip: (opp: Opportunity) => void;
}) {
  const secsLeft = Math.max(0, Math.round((opp.expiresAt - now) / 1000));
  const expiry =
    secsLeft >= 60
      ? `${Math.floor(secsLeft / 60)}m ${secsLeft % 60}s`
      : `${secsLeft}s`;

  // Live countdown bar. Fraction of lifespan remaining, derived from the
  // opportunity's own creation ts + expiresAt. The parent ticks `now`, so
  // this thins in real time. As it runs low the bar shifts gold → rust and
  // starts to pulse — the card visibly communicates "this is expiring".
  const lifespan = Math.max(1, opp.expiresAt - opp.ts);
  const remaining = Math.max(0, Math.min(1, (opp.expiresAt - now) / lifespan));
  const expiringSoon = secsLeft <= 15;
  const barColor = expiringSoon
    ? "#d4512e" // rust
    : remaining < 0.4
    ? "#f0b429" // gold
    : "#5ad19a"; // phosphor

  const conf =
    opp.confidence === "high"
      ? "text-phosphor border-phosphor/50"
      : opp.confidence === "medium"
      ? "text-gold border-gold/40"
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
    <div
      className={`relative shrink-0 w-[340px] border bg-ink animate-pop-in overflow-hidden ${
        fresh ? "border-gold card-fresh" : "border-ash"
      }`}
    >
      {/* Intel line header — timestamp + signal id, like a log entry. */}
      <div className="flex items-center justify-between border-b border-ash px-3 py-1.5 text-[10px] uppercase tracking-widest">
        <span className="text-bone/40">
          <span className="text-gold/60 select-none mr-1.5">&gt;</span>
          {stamp(opp.ts)}
        </span>
        <span className={`border px-1.5 py-0.5 ${conf}`}>{opp.confidence}</span>
      </div>

      <div className="p-4">
        <div className="font-display text-base text-cream leading-tight mb-2">
          {opp.title}
        </div>
        <div className="text-bone/80 text-sm leading-relaxed mb-3">
          {opp.message}
        </div>
        <div className="border-l-2 border-gold/40 pl-3 mb-3 space-y-0.5">
          <div className="text-[10px] uppercase tracking-widest text-bone/40">
            <span className="text-gold/60 select-none mr-1">»</span>if accepted
          </div>
          <div className="text-bone text-sm">
            {fmt(opp.suggested.amount)} <span className="text-gold/60">→</span>{" "}
            {opp.suggested.vendor}
          </div>
          {opp.suggested.trigger && opp.suggested.trigger.kind !== "time" && (
            <div className="text-phosphor/80 text-xs">▸ {describeTrigger(fakeItem)}</div>
          )}
        </div>
        <div className="flex items-center justify-between mb-1.5 text-[11px] uppercase tracking-widest">
          <span
            className={`transition-colors ${
              expiringSoon ? "text-rust card-expiry-soon" : "text-bone/40"
            }`}
          >
            ttl {expiry}
          </span>
        </div>
        {/* Thinning countdown bar — the time pressure made visible. */}
        <div className="h-0.5 w-full bg-ash/60 mb-3 overflow-hidden">
          <div
            className={`h-full ${expiringSoon ? "card-bar-soon" : ""}`}
            style={{
              width: `${Math.round(remaining * 100)}%`,
              backgroundColor: barColor,
              transition: "width 1s linear, background-color 500ms ease",
            }}
          />
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
            className="bg-gold text-ink py-2 text-xs uppercase tracking-widest font-semibold hover:bg-goldlit transition"
          >
            Accept
          </button>
        </div>
      </div>

      <style jsx>{`
        /* One-shot arrival buzz: a fresh card flashes to pull the eye,
           then settles. Plays once — it is not a looping decoration. */
        .card-fresh {
          animation: card-arrive 1100ms ease-out 1;
        }
        @keyframes card-arrive {
          0% {
            box-shadow: 0 0 0 0 rgba(240, 180, 41, 0.6);
            background-color: rgba(240, 180, 41, 0.1);
          }
          15% {
            box-shadow: 0 0 18px 1px rgba(240, 180, 41, 0.5);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(240, 180, 41, 0);
            background-color: transparent;
          }
        }
        /* Expiry urgency: label and bar breathe once time is short. */
        .card-expiry-soon {
          animation: expiry-flash 1s ease-in-out infinite;
        }
        @keyframes expiry-flash {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.45;
          }
        }
        .card-bar-soon {
          animation: bar-flash 1s ease-in-out infinite;
        }
        @keyframes bar-flash {
          0%,
          100% {
            opacity: 1;
          }
          50% {
            opacity: 0.55;
          }
        }
      `}</style>
    </div>
  );
}
