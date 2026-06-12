"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { Readout } from "@/components/terminal/readout";
import { Caret } from "@/components/terminal/caret";

// ── Types (mirrors API contract from Task 8) ──────────────────────────────────

export type PerpPosition = {
  market: string;
  side: "long" | "short";
  baseSize: number;
  entryPrice: number;
  markPrice: number;
  unrealizedPnlUsdc: number;
  liqPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type ScheduledItemView = {
  id: string;
  perp_market: string;
  perp_side: "long" | "short";
  perp_leverage: number | null;
  perp_margin_usdc: number | null;
  status: string;
  // Trigger fields — mirrors the API contract from Task 8 (positions/route.ts).
  // NOTE: there is NO trigger_asset / trigger_price column. The asset is derived
  // from perp_market; the threshold price is trigger_target_price.
  trigger_kind?: string;
  trigger_target_price?: number | null;
  trigger_basis_price?: number | null;
  trigger_drop_pct?: number | null;
};

type PositionsResponse = {
  positions: PerpPosition[];
  pending: ScheduledItemView[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtPrice(n: number): string {
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
}

function fmtPnl(n: number): string {
  const sign = n >= 0 ? "+" : "";
  return `${sign}$${n.toFixed(2)}`;
}

/** Derive the display asset symbol from a perp market string ("SOL-PERP" → "SOL"). */
function assetFromMarket(market: string | undefined): string {
  if (!market) return "asset";
  return market.replace(/-PERP$/i, "");
}

/**
 * Describe a trigger from raw DB fields (ScheduledItemView).
 * Mirrors describeTrigger from lib/schedule.ts but works on the API view shape.
 * The asset is derived from perp_market; the threshold is trigger_target_price
 * (below/above) or trigger_basis_price + trigger_drop_pct (dip).
 */
function describePendingTrigger(item: ScheduledItemView): string {
  const kind = item.trigger_kind;
  const asset = assetFromMarket(item.perp_market);
  if (!kind || kind === "time") return "on next wake";
  if (kind === "below" && item.trigger_target_price != null)
    return `${asset} ≤ $${item.trigger_target_price.toFixed(2)}`;
  if (kind === "above" && item.trigger_target_price != null)
    return `${asset} ≥ $${item.trigger_target_price.toFixed(2)}`;
  if (kind === "dip" && item.trigger_basis_price != null && item.trigger_drop_pct != null) {
    const target = item.trigger_basis_price * (1 - item.trigger_drop_pct / 100);
    return `${asset} drops to $${target.toFixed(2)} (-${item.trigger_drop_pct}% from $${item.trigger_basis_price.toFixed(2)})`;
  }
  return "—";
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PositionRow({ pos }: { pos: PerpPosition }) {
  const pnlPositive = pos.unrealizedPnlUsdc >= 0;
  const pnlTone = pnlPositive ? "phosphor" : "rust";
  const sideTone = pos.side === "long" ? "phosphor" : "rust";

  // Derive rough leverage label if we can (entryPrice * baseSize / margin ≈ leverage)
  // We don't have margin in PerpPosition — omit label per spec.
  const marketLabel = `${pos.side.toUpperCase()} ${pos.market}`;

  return (
    <div
      className={`border-l-2 pl-3 py-2.5 ${
        pos.side === "long" ? "border-phosphor/60" : "border-rust/60"
      }`}
      data-testid="position-row"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {/* Market + side badge */}
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span
              className={`font-mono text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${
                pos.side === "long"
                  ? "border-phosphor/50 text-phosphor bg-phosphor/10"
                  : "border-rust/50 text-rust bg-rust/10"
              }`}
            >
              {pos.side === "long" ? "▲ long" : "▼ short"}
            </span>
            <span className="font-display text-base text-bone">{pos.market}</span>
            <span className="font-mono text-xs text-bone/50">
              ×{pos.baseSize.toLocaleString(undefined, { maximumFractionDigits: 4 })} base
            </span>
          </div>

          {/* Readout strip */}
          <Readout
            items={[
              { label: "entry", value: fmtPrice(pos.entryPrice) },
              { label: "mark", value: fmtPrice(pos.markPrice) },
              {
                label: "uPnL",
                value: fmtPnl(pos.unrealizedPnlUsdc),
                tone: pnlTone,
              },
            ]}
          />

          {/* SL / TP / Liq */}
          <Readout
            className="mt-1"
            items={[
              { label: "SL", value: pos.stopLoss != null ? fmtPrice(pos.stopLoss) : "—", tone: "rust" },
              { label: "TP", value: pos.takeProfit != null ? fmtPrice(pos.takeProfit) : "—", tone: "phosphor" },
              {
                label: "liq est.",
                value: pos.liqPrice != null ? fmtPrice(pos.liqPrice) : "—",
                tone: pos.liqPrice != null ? "rust" : "bone",
              },
            ]}
          />
        </div>

        {/* uPnL large badge */}
        <div
          className={`shrink-0 font-display text-xl tabular-nums ${
            pnlPositive ? "text-phosphor" : "text-rust"
          }`}
          data-testid="upnl-value"
          aria-label={`Unrealized PnL: ${fmtPnl(pos.unrealizedPnlUsdc)} USDC`}
        >
          {fmtPnl(pos.unrealizedPnlUsdc)}
          <span className="font-mono text-[10px] ml-1 opacity-60">USDC</span>
        </div>
      </div>
    </div>
  );
}

function PendingRow({
  item,
  agentId,
  onApproved,
}: {
  item: ScheduledItemView;
  agentId: string;
  onApproved: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAwaiting = item.status === "awaiting-approval";
  const triggerLabel = describePendingTrigger(item);

  async function handleApprove() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/agents/${agentId}/schedule?itemId=${item.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status: "queued", approve: true }),
        }
      );
      if (!res.ok) {
        const text = await res.text().catch(() => String(res.status));
        throw new Error(text || `HTTP ${res.status}`);
      }
      onApproved();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "approve failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      className={`border-l-2 pl-3 py-2.5 ${
        isAwaiting ? "border-rust" : "border-bone/30"
      }`}
      data-testid="pending-row"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex-1 min-w-0">
          {/* Market + side */}
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span
              className={`font-mono text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${
                item.perp_side === "long"
                  ? "border-phosphor/50 text-phosphor"
                  : "border-rust/50 text-rust"
              }`}
            >
              {item.perp_side === "long" ? "▲ long" : "▼ short"}
            </span>
            <span className="font-display text-base text-bone">{item.perp_market}</span>
            {item.perp_leverage != null && (
              <span className="font-mono text-xs text-bone/50">×{item.perp_leverage}</span>
            )}
            {isAwaiting && (
              <span
                className="font-mono text-[10px] uppercase tracking-widest border border-rust text-rust px-1.5 py-0.5"
                data-testid="awaiting-badge"
              >
                ⚠ awaiting-approval
              </span>
            )}
          </div>

          {/* Trigger label */}
          <div className="font-mono text-gold/70 text-xs mt-0.5">▸ watch: {triggerLabel}</div>

          {/* Margin */}
          {item.perp_margin_usdc != null && (
            <div className="font-mono text-bone/50 text-xs mt-0.5">
              <span className="text-bone/30"># </span>margin:{" "}
              {item.perp_margin_usdc.toLocaleString(undefined, { maximumFractionDigits: 2 })} USDC
            </div>
          )}

          {error && (
            <div className="font-mono text-rust text-xs mt-1">
              <span className="text-rust/60 select-none">! </span>{error}
            </div>
          )}
        </div>

        {/* Approve button */}
        {isAwaiting && (
          <button
            onClick={handleApprove}
            disabled={loading}
            data-testid="approve-button"
            className="shrink-0 font-mono text-[10px] uppercase tracking-widest border border-gold/60 text-gold hover:bg-gold hover:text-ink px-3 py-1.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "…" : "▶ approve"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function PositionsPanel({ agentId }: { agentId: string }) {
  const [data, setData] = useState<PositionsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchPositions = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/positions`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as PositionsResponse;
      setData(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "fetch error");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void fetchPositions();
    intervalRef.current = setInterval(() => void fetchPositions(), 15_000);
    return () => {
      if (intervalRef.current != null) clearInterval(intervalRef.current);
    };
  }, [fetchPositions]);

  const positions = data?.positions ?? [];
  const pending = data?.pending ?? [];
  const hasContent = positions.length > 0 || pending.length > 0;

  return (
    <TerminalPanel label="positions.open">
      {/* Header */}
      <div className="border-b border-ash px-4 py-3 flex items-center justify-between gap-3">
        <div className="font-mono text-xs text-gold flex items-center gap-2">
          <span className="select-none text-gold/60">$</span>
          saw perps <span className="text-bone/70">--positions</span>
          {loading && <Caret />}
        </div>
        <button
          onClick={() => void fetchPositions()}
          className="font-mono text-[10px] uppercase tracking-widest text-bone/50 hover:text-gold border border-bone/20 hover:border-gold/60 px-2 py-1 transition"
          title="Refresh positions"
          aria-label="Refresh positions"
        >
          ↺ refresh
        </button>
      </div>

      {/* Body */}
      <div className="p-4 space-y-2 max-h-[480px] overflow-y-auto">
        {error && (
          <div className="font-mono text-rust text-xs">
            <span className="text-rust/60">! </span>{error}
          </div>
        )}

        {!loading && !error && !hasContent && (
          <div className="py-6 font-mono text-xs">
            <div className="text-bone/40 mb-1">
              <span className="text-gold/60 mr-1">$</span>saw perps --positions
            </div>
            <div className="text-bone/60">
              <span className="text-bone/30 mr-1">&gt;</span>no open positions · 0 active
            </div>
          </div>
        )}

        {positions.map((pos, i) => (
          <PositionRow key={`${pos.market}-${pos.side}-${i}`} pos={pos} />
        ))}

        {pending.length > 0 && (
          <>
            <div className="font-mono text-xs text-bone/30 pt-3 pb-1 border-t border-ash mt-3">
              <span className="text-bone/40"># </span>conditional entries · {pending.length} pending
            </div>
            {pending.map((item) => (
              <PendingRow
                key={item.id}
                item={item}
                agentId={agentId}
                onApproved={() => void fetchPositions()}
              />
            ))}
          </>
        )}
      </div>
    </TerminalPanel>
  );
}
