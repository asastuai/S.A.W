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
      className={`relative border bg-gold/5 p-4 mb-6 transition-colors duration-500 ${
        hasFresh ? "border-gold reel-alive" : "border-gold/40"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span
            className={`text-gold font-display text-lg ${
              hasFresh ? "reel-glyph-alive" : ""
            }`}
          >
            {glyph}
          </span>
          <span className="text-xs uppercase tracking-widest text-gold flex items-center gap-2">
            <span className="relative flex items-center gap-2">
              {pending.length > 0 && (
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full rounded-full bg-gold animate-ping opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-gold" />
                </span>
              )}
              {personaName} spotted
            </span>
            <BellToggle />
            <CreatorNote
              text="This is live: turn on the bell and every fresh proposal arrives with a chime and a native OS notification — the buzz in your pocket. Closed-tab delivery is wired too: the cron sends a web push (service worker) when a trigger goes ready, so an installed PWA buzzes even with the tab shut."
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

      <style jsx>{`
        /* The whole surface briefly brightens when a fresh proposal lands —
           a real-time-alert pulse, gone in under a second. */
        .reel-alive {
          animation: reel-alert 900ms ease-out 1;
        }
        @keyframes reel-alert {
          0% {
            box-shadow: 0 0 0 0 rgba(201, 169, 110, 0);
          }
          25% {
            box-shadow: 0 0 22px 2px rgba(201, 169, 110, 0.35);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(201, 169, 110, 0);
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
            filter: drop-shadow(0 0 6px rgba(201, 169, 110, 0.8));
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
    ? "#b7410e" // rust
    : remaining < 0.4
    ? "#c98a3e" // gold leaning warm
    : "#c9a96e"; // gold

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
    <div
      className={`relative shrink-0 w-[340px] border bg-ink p-4 animate-pop-in overflow-hidden ${
        fresh ? "border-gold card-fresh" : "border-ash"
      }`}
    >
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
      <div className="flex items-center justify-between mb-1.5">
        <span
          className={`text-xs transition-colors ${
            expiringSoon ? "text-rust card-expiry-soon" : "text-bone/40"
          }`}
        >
          expires in {expiry}
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
          className="bg-gold text-ink py-2 text-xs uppercase tracking-widest hover:bg-bone transition"
        >
          Accept
        </button>
      </div>

      <style jsx>{`
        /* One-shot arrival buzz: a fresh card flashes to pull the eye,
           then settles. Plays once — it is not a looping decoration. */
        .card-fresh {
          animation: card-arrive 1100ms ease-out 1;
        }
        @keyframes card-arrive {
          0% {
            box-shadow: 0 0 0 0 rgba(201, 169, 110, 0.6);
            background-color: rgba(201, 169, 110, 0.1);
          }
          15% {
            box-shadow: 0 0 18px 1px rgba(201, 169, 110, 0.5);
          }
          100% {
            box-shadow: 0 0 0 0 rgba(201, 169, 110, 0);
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
