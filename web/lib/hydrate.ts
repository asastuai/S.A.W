/**
 * Maps DB rows (snake_case, ISO date strings) to local React types
 * (camelCase, ms timestamps). Used by the demo to hydrate a Briefing
 * from /api/agents/:id/state.
 */

import type {
  ChatMessage as DbChat,
  ScheduledItem as DbItem,
  Opportunity as DbOpp,
} from "@/lib/db/types";
import type {
  ChatMessage,
  Opportunity,
  ScheduleItem,
  Trigger,
} from "@/lib/schedule";

export function hydrateChat(rows: DbChat[]): ChatMessage[] {
  return rows.map((r) => ({
    id: r.id,
    role: r.role,
    content: r.content,
    ts: new Date(r.created_at).getTime(),
  }));
}

export function hydrateSchedule(rows: DbItem[]): ScheduleItem[] {
  return rows.map((r) => ({
    id: r.id,
    scheduledFor: new Date(r.scheduled_for).getTime(),
    vendor: r.vendor ?? "",
    amount: r.amount,
    reason: r.reason ?? "",
    status: r.status,
    sig: r.tx_signature ?? undefined,
    errorMsg: r.error_message ?? undefined,
    trigger: rowToTrigger(r),
  }));
}

export function hydrateOpportunities(rows: DbOpp[]): Opportunity[] {
  return rows.map((r) => ({
    id: r.id,
    ts: new Date(r.created_at).getTime(),
    title: r.title,
    message: r.message,
    suggested: {
      vendor: r.suggested_vendor ?? "",
      amount: r.suggested_amount ?? 0,
      reason: r.suggested_reason ?? "",
      trigger: rowToTrigger(r),
      scheduledFor: undefined,
    },
    confidence: r.confidence,
    expiresAt: new Date(r.expires_at).getTime(),
    status: r.status,
  }));
}

function rowToTrigger(r: {
  trigger_kind: string | null;
  trigger_basis_price: number | null;
  trigger_drop_pct: number | null;
  trigger_target_price: number | null;
  trigger_deadline?: string | null;
}): Trigger | undefined {
  if (!r.trigger_kind) return undefined;
  const deadline = r.trigger_deadline
    ? new Date(r.trigger_deadline).getTime()
    : undefined;
  if (r.trigger_kind === "time") return { kind: "time" };
  if (r.trigger_kind === "dip" && r.trigger_basis_price != null && r.trigger_drop_pct != null) {
    return {
      kind: "dip",
      asset: "SOL", // assume SOL for v1 — schema doesn't store asset on trigger
      basisPrice: r.trigger_basis_price,
      dropPct: r.trigger_drop_pct,
      deadline,
    };
  }
  if ((r.trigger_kind === "below" || r.trigger_kind === "above") && r.trigger_target_price != null) {
    return {
      kind: r.trigger_kind,
      asset: "SOL",
      price: r.trigger_target_price,
      deadline,
    };
  }
  return undefined;
}
