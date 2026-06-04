"use client";

import { useState } from "react";
import { AGENT_WALLET_PROGRAM_ID } from "@asastuai/saw-sdk";
import type { ScheduleItem, ScheduleStatus } from "@/lib/schedule";
import { describeTrigger, summarize } from "@/lib/schedule";
import { DEMO_DECIMALS } from "@/lib/saw";
import { CreatorNote } from "@/components/creator-note";

const AGENT_WALLET_PROGRAM = AGENT_WALLET_PROGRAM_ID.toBase58();
const shortKey = (k: string) => `${k.slice(0, 4)}…${k.slice(-4)}`;

const fmtAmount = (n: number) =>
  `${(n / 10 ** DEMO_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} USDC-dev`;

function fmtTime(ts: number): string {
  const date = new Date(ts);
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function fmtCountdown(secs: number): string {
  if (secs <= 0) return "now";
  if (secs < 60) return `in ${secs}s`;
  const mins = Math.floor(secs / 60);
  const rem = secs % 60;
  if (mins < 60) return rem === 0 ? `in ${mins}m` : `in ${mins}m ${rem}s`;
  const hours = Math.floor(mins / 60);
  return `in ${hours}h ${mins % 60}m`;
}

export function ScheduleView({
  items,
  now,
  onRemove,
  onExecute,
  approvalThreshold,
  readOnly,
}: {
  items: ScheduleItem[];
  now: number;
  onRemove?: (id: string) => void;
  onExecute?: (id: string) => void;
  approvalThreshold: number;
  readOnly?: boolean;
}) {
  const stats = summarize(items);
  const upcoming = items
    .filter((i) => i.status === "queued" || i.status === "executing" || i.status === "awaiting-approval")
    .sort((a, b) => a.scheduledFor - b.scheduledFor);
  const past = items
    .filter((i) => ["done", "failed", "skipped", "denied"].includes(i.status))
    .sort((a, b) => b.scheduledFor - a.scheduledFor);

  return (
    <div className="border border-ash bg-ink">
      <div className="border-b border-ash px-4 py-3 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-widest text-gold flex items-center gap-2">
            Today's schedule
            <CreatorNote
              text="Hover (or tap ⊙) a queued item to preview the exact on-chain instruction that will fire — program, instruction, recipient, amount in base units, and whether it auto-executes or routes to your signature. The horizontal-timeline + drag-to-reorder view is the next layout pass."
              position="bottom-right"
            />
          </div>
          <div className="text-xs text-bone/50 mt-0.5">
            {stats.queued} queued · {stats.done} done
            {stats.awaiting > 0 ? ` · ${stats.awaiting} awaiting you` : ""}
            {stats.failed > 0 ? ` · ${stats.failed} failed` : ""}
          </div>
        </div>
      </div>

      <div className="p-4 space-y-2 max-h-[600px] overflow-y-auto">
        {upcoming.length === 0 && past.length === 0 && (
          <div className="text-center py-10 px-4">
            <div className="text-4xl text-bone/20 mb-3">∅</div>
            <div className="text-bone/60 text-sm mb-2">No items scheduled yet.</div>
            <div className="text-bone/40 text-xs leading-relaxed max-w-xs mx-auto">
              Try: <span className="text-gold">"buy 0.05 SOL if it dips 1%"</span>{" "}
              or <span className="text-gold">"swap 30 USDC for BONK now"</span> in
              the chat.
            </div>
          </div>
        )}

        {upcoming.map((item) => (
          <Row
            key={item.id}
            item={item}
            now={now}
            isUpcoming
            approvalThreshold={approvalThreshold}
            onRemove={onRemove}
            onExecute={onExecute}
            readOnly={readOnly}
          />
        ))}

        {past.length > 0 && (
          <>
            <div className="text-xs uppercase tracking-widest text-bone/30 pt-3 pb-1 border-t border-ash mt-3">
              Done · {past.length}
            </div>
            {past.slice(0, 12).map((item) => (
              <Row
                key={item.id}
                item={item}
                now={now}
                isUpcoming={false}
                approvalThreshold={approvalThreshold}
                onRemove={onRemove}
                readOnly={readOnly}
              />
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function Row({
  item,
  now,
  isUpcoming,
  approvalThreshold,
  onRemove,
  onExecute,
  readOnly,
}: {
  item: ScheduleItem;
  now: number;
  isUpcoming: boolean;
  approvalThreshold: number;
  onRemove?: (id: string) => void;
  onExecute?: (id: string) => void;
  readOnly?: boolean;
}) {
  const overThreshold = item.amount > approvalThreshold;
  const secsUntil = Math.max(0, Math.round((item.scheduledFor - now) / 1000));
  const conditional = item.trigger && item.trigger.kind !== "time";

  // Hover-to-preview the on-chain instruction. `pinned` keeps it open after
  // a tap (touch has no hover); `hovered` is the desktop affordance.
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(false);
  const previewable = isUpcoming && item.status === "queued";
  const showPreview = previewable && (hovered || pinned);

  // Detect yield picks (Conservador): vendor format "{project} · {symbol} · {apy}%"
  const aprMatch = item.vendor.match(/(\d+(?:\.\d+)?)\s*%/);
  const isYieldPick = !!aprMatch && /·/.test(item.vendor);
  const projectName = isYieldPick ? item.vendor.split("·")[0]?.trim() : null;

  const statusBadge = <StatusBadge s={item.status} />;
  const timeText = isUpcoming
    ? item.status === "queued"
      ? conditional
        ? "watching…"
        : fmtCountdown(secsUntil)
      : item.status === "executing"
      ? "executing…"
      : "awaiting you"
    : fmtTime(item.scheduledFor);

  return (
    <div
      onMouseEnter={() => previewable && setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={`border-l-2 pl-3 py-2 ${
        isYieldPick && item.status === "queued" ? "bg-gold/5" : ""
      } ${
        item.status === "done"
          ? "border-gold/40"
          : item.status === "executing"
          ? "border-gold animate-pulse"
          : item.status === "awaiting-approval"
          ? "border-rust"
          : item.status === "failed" || item.status === "denied"
          ? "border-rust/50"
          : item.status === "skipped"
          ? "border-bone/20"
          : isYieldPick
          ? "border-gold"
          : overThreshold
          ? "border-rust/60"
          : "border-bone/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            {item.jupiterSwap && (
              <span className="text-gold text-xs uppercase tracking-widest border border-gold/40 px-1.5 py-0.5 bg-gold/10">
                ⇄ jupiter
              </span>
            )}
            {!item.jupiterSwap && item.toAddress && (
              <span className="text-gold text-xs uppercase tracking-widest border border-gold/40 px-1.5 py-0.5">
                ↗ transfer
              </span>
            )}
            {!item.toAddress && !item.jupiterSwap && item.vendor.toUpperCase().startsWith("SWAP") && (
              <span className="text-gold text-xs uppercase tracking-widest border border-gold/40 px-1.5 py-0.5">
                ⇄ swap
              </span>
            )}
            {isYieldPick && (
              <span className="text-gold text-xs uppercase tracking-widest border border-gold/40 px-1.5 py-0.5 bg-gold/10">
                ✦ yield · {aprMatch![1]}%
              </span>
            )}
            <span className="font-display text-base text-bone">
              {fmtAmount(item.amount)}
            </span>
            <span className="text-bone/40 text-xs">→</span>
            <span className="text-bone/80 text-sm truncate">
              {isYieldPick && projectName ? projectName : item.vendor}
            </span>
            {overThreshold && item.status === "queued" && (
              <span className="text-rust text-[10px] uppercase tracking-widest">
                ⚠ over threshold
              </span>
            )}
          </div>
          <div className="text-bone/50 text-xs italic mt-0.5">"{item.reason}"</div>
          {item.toAddress && (
            <div className="text-bone/40 text-[10px] mt-0.5 font-mono">
              to{" "}
              <a
                href={`https://explorer.solana.com/address/${item.toAddress}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                className="text-gold/70 hover:text-gold underline-offset-2 hover:underline"
              >
                {item.toAddress.slice(0, 8)}…{item.toAddress.slice(-6)} ↗
              </a>
            </div>
          )}
          {conditional && isUpcoming && (
            <div className="text-gold/70 text-xs mt-1">▸ {describeTrigger(item)}</div>
          )}
          {item.errorMsg && (
            <div className="text-rust text-xs mt-1">{item.errorMsg}</div>
          )}
          {showPreview && (
            <TxPreview item={item} overThreshold={overThreshold} />
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className="text-bone/60 text-xs">{timeText}</span>
          {statusBadge}
          {item.sig && (
            <a
              href={`https://explorer.solana.com/tx/${item.sig}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
              className="text-gold/70 hover:text-gold text-xs underline-offset-2 hover:underline"
            >
              tx ↗
            </a>
          )}
          {previewable && (
            <button
              onClick={() => setPinned((p) => !p)}
              aria-pressed={pinned}
              title="Preview the on-chain tx that will fire"
              className={`text-[10px] uppercase tracking-widest px-2 py-1 border transition ${
                pinned || hovered
                  ? "text-gold border-gold/60 bg-gold/10"
                  : "text-bone/50 border-bone/30 hover:text-gold hover:border-gold/60"
              }`}
            >
              ⊙ preview tx
            </button>
          )}
          {!readOnly && isUpcoming && item.status === "queued" && onExecute && (
            <button
              onClick={() => onExecute(item.id)}
              className="text-gold border border-gold/60 hover:bg-gold hover:text-ink text-[10px] uppercase tracking-widest px-2 py-1 transition"
            >
              ▶ execute now
            </button>
          )}
          {!readOnly && isUpcoming && item.status === "queued" && onRemove && (
            <button
              onClick={() => onRemove(item.id)}
              className="text-rust/80 border border-rust/50 hover:bg-rust hover:text-ink text-[10px] uppercase tracking-widest px-2 py-1 transition"
            >
              ✕ cancel
            </button>
          )}
          {!readOnly && !isUpcoming && onRemove && (
            <button
              onClick={() => onRemove(item.id)}
              className="text-bone/40 border border-bone/20 hover:border-rust hover:text-rust text-[10px] uppercase tracking-widest px-2 py-1 transition"
            >
              ✕ clear
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * A simulated preview of the exact on-chain instruction this queued item
 * will fire. Read-only — nothing is signed until the item executes — but
 * it shows the real program, instruction, recipient, base-unit amount, and
 * the policy gate, so the handler can see what the agent is about to do.
 */
function TxPreview({
  item,
  overThreshold,
}: {
  item: ScheduleItem;
  overThreshold: boolean;
}) {
  const isJupiter = !!item.jupiterSwap;
  const isTransfer = !isJupiter && !!item.toAddress;

  const instruction = isJupiter
    ? "jupiter swap"
    : "pay_direct";
  const program = isJupiter
    ? "Jupiter v6 · handler-signed"
    : `agent_wallet ${shortKey(AGENT_WALLET_PROGRAM)}`;
  const recipient = isJupiter
    ? `route → ${item.jupiterSwap!.outputMint}`
    : isTransfer
    ? shortKey(item.toAddress!)
    : "SAW treasury";

  const human = `${(item.amount / 10 ** DEMO_DECIMALS).toLocaleString(undefined, {
    maximumFractionDigits: 2,
  })} USDC-dev`;

  const gate = overThreshold
    ? {
        warn: true,
        text: "over per-tx cap → routes to your signature (request_payment)",
      }
    : isTransfer
    ? {
        warn: false,
        text: "auto if recipient is allow-listed; unknown destination → your signature",
      }
    : { warn: false, text: "auto · within daily + per-tx caps" };

  return (
    <div className="mt-2 border border-gold/30 bg-ink/60 p-2 text-[10px] font-mono leading-relaxed animate-fade-in">
      <div className="text-gold/70 uppercase tracking-widest mb-1 not-italic">
        tx preview · simulated, signs on execute
      </div>
      <Kv k="program" v={program} />
      <Kv k="ix" v={instruction} />
      <Kv k="to" v={recipient} />
      <Kv k="amount" v={`${human}  (${item.amount.toLocaleString()} base units)`} />
      <div className="flex gap-2">
        <span className="text-bone/40 w-14 shrink-0">gate</span>
        <span className={gate.warn ? "text-rust" : "text-bone/70"}>
          {gate.warn ? "⚠ " : ""}
          {gate.text}
        </span>
      </div>
    </div>
  );
}

function Kv({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex gap-2">
      <span className="text-bone/40 w-14 shrink-0">{k}</span>
      <span className="text-bone/80 break-all">{v}</span>
    </div>
  );
}

function StatusBadge({ s }: { s: ScheduleStatus }) {
  const map: Record<ScheduleStatus, { text: string; cls: string }> = {
    queued: { text: "Queued", cls: "text-bone/60 border-bone/30" },
    executing: { text: "Executing", cls: "text-gold border-gold animate-pulse" },
    done: { text: "Done", cls: "text-gold/70 border-gold/40" },
    failed: { text: "Failed", cls: "text-rust border-rust/60" },
    skipped: { text: "Skipped", cls: "text-bone/40 border-bone/20" },
    "awaiting-approval": { text: "You", cls: "text-rust border-rust" },
    denied: { text: "Denied", cls: "text-rust/60 border-rust/40" },
  };
  const { text, cls } = map[s];
  return (
    <span className={`text-[10px] uppercase tracking-widest border px-1.5 py-0.5 ${cls}`}>
      {text}
    </span>
  );
}
