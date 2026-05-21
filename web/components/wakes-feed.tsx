"use client";

import { useEffect, useState } from "react";
import { CreatorNote } from "@/components/creator-note";

type Wake = {
  id: string;
  woke_at: string;
  finished_at: string | null;
  outcome:
    | "scanned-no-action"
    | "proposed-opportunity"
    | "executed-trigger"
    | "failed"
    | "skipped-inactive-hours"
    | null;
  llm_calls: number;
  items_executed: number;
  opportunities_proposed: number;
  error_message: string | null;
};

const OUTCOME_LABEL: Record<string, string> = {
  "scanned-no-action": "Scanned · nothing",
  "proposed-opportunity": "Spotted opportunity",
  "executed-trigger": "Executed trigger",
  "failed": "Failed",
  "skipped-inactive-hours": "Skipped · outside hours",
};

const OUTCOME_COLOR: Record<string, string> = {
  "scanned-no-action": "text-bone/50",
  "proposed-opportunity": "text-gold",
  "executed-trigger": "text-gold",
  "failed": "text-rust",
  "skipped-inactive-hours": "text-bone/30",
};

export function WakesFeed({
  agentId,
  getAccessToken,
  refreshKey,
}: {
  agentId: string;
  getAccessToken: () => Promise<string | null>;
  /** Bump to force a refetch (e.g. after a new wake) */
  refreshKey?: number;
}) {
  const [wakes, setWakes] = useState<Wake[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/agents/${agentId}/wakes?limit=8`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { wakes } = await res.json();
        if (!cancelled) setWakes(wakes ?? []);
      } catch {
        /* ignore */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, refreshKey]);

  if (loading) {
    return (
      <div className="border border-ash p-4 text-xs text-bone/40 uppercase tracking-widest">
        loading wakes…
      </div>
    );
  }

  return (
    <div className="border border-ash bg-ink">
      <div className="border-b border-ash px-4 py-3 flex items-center gap-2">
        <div className="text-xs uppercase tracking-widest text-gold">
          Wake history
        </div>
        <CreatorNote
          text="Every time the cron wakes the agent, a row is recorded here. Future versions show full audit (signatures, fee collected, market context at wake)."
          position="bottom-right"
        />
        <div className="ml-auto text-[10px] text-bone/40">{wakes.length} recent</div>
      </div>

      <div className="divide-y divide-ash/30">
        {wakes.length === 0 ? (
          <div className="px-4 py-6 text-center text-bone/40 italic text-sm">
            No wakes yet. The cron fires every 5 min if your agent is active.
          </div>
        ) : (
          wakes.map((w) => {
            const time = new Date(w.woke_at);
            const outcome = w.outcome ?? "scanned-no-action";
            return (
              <div key={w.id} className="px-4 py-2.5 flex items-center gap-3 text-xs">
                <span className="text-bone/40 font-mono shrink-0 w-12">
                  {time.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className={`flex-1 ${OUTCOME_COLOR[outcome] ?? "text-bone/60"}`}>
                  {OUTCOME_LABEL[outcome] ?? outcome}
                </span>
                {w.items_executed > 0 && (
                  <span className="text-gold/80 shrink-0">
                    ⚡ {w.items_executed}
                  </span>
                )}
                {w.opportunities_proposed > 0 && (
                  <span className="text-gold/60 shrink-0">
                    ✱ {w.opportunities_proposed}
                  </span>
                )}
                {w.error_message && (
                  <span
                    className="text-rust shrink-0 max-w-[120px] truncate"
                    title={w.error_message}
                  >
                    !
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
