import type { PublicKey } from "@solana/web3.js";

export type ScheduleStatus =
  | "queued"
  | "executing"
  | "done"
  | "failed"
  | "skipped"
  | "awaiting-approval"
  | "denied";

export type Trigger =
  | { kind: "time" }
  | {
      kind: "dip";
      asset: string;
      basisPrice: number;
      dropPct: number;
      deadline?: number;
    }
  | { kind: "below"; asset: string; price: number; deadline?: number }
  | { kind: "above"; asset: string; price: number; deadline?: number };

export type ScheduleItem = {
  id: string;
  scheduledFor: number;
  vendor: string;
  amount: number;
  reason: string;
  status: ScheduleStatus;
  sig?: string;
  requestId?: string;
  errorMsg?: string;
  trigger?: Trigger;
};

export function describeTrigger(item: ScheduleItem): string {
  const t = item.trigger;
  if (!t || t.kind === "time") {
    return new Date(item.scheduledFor).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
  if (t.kind === "dip") {
    const target = t.basisPrice * (1 - t.dropPct / 100);
    return `${t.asset} drops to $${target.toFixed(2)} (-${t.dropPct}% from $${t.basisPrice.toFixed(2)})`;
  }
  if (t.kind === "below") return `${t.asset} ≤ $${t.price.toFixed(2)}`;
  if (t.kind === "above") return `${t.asset} ≥ $${t.price.toFixed(2)}`;
  return "—";
}

export function isItemReady(
  item: ScheduleItem,
  now: number,
  prices: Record<string, number>
): boolean {
  if (item.status !== "queued") return false;
  const t = item.trigger ?? { kind: "time" as const };
  if (t.kind === "time") return item.scheduledFor <= now;
  if (t.deadline && now > t.deadline) return false;
  const price = prices[t.asset.toUpperCase()];
  if (price === undefined) return false;
  if (t.kind === "below") return price <= t.price;
  if (t.kind === "above") return price >= t.price;
  if (t.kind === "dip") return price <= t.basisPrice * (1 - t.dropPct / 100);
  return false;
}

export type ChatMessage = {
  id: string;
  role: "user" | "agent" | "system";
  content: string;
  ts: number;
};

export type OpportunityStatus = "pending" | "accepted" | "skipped" | "expired";

export type SuggestedItem = {
  vendor: string;
  amount: number;
  reason: string;
  trigger?: Trigger;
  scheduledFor?: number;
};

export type Opportunity = {
  id: string;
  ts: number;
  title: string;
  message: string;
  suggested: SuggestedItem;
  confidence: "low" | "medium" | "high";
  expiresAt: number;
  status: OpportunityStatus;
};

export type Briefing = {
  personaId: string;
  schedule: ScheduleItem[];
  conversation: ChatMessage[];
  opportunities: Opportunity[];
  ready: boolean;
};

const STORAGE_PREFIX = "saw-demo-v1";
const briefingKey = (handler: PublicKey) =>
  `${STORAGE_PREFIX}:briefing:${handler.toBase58()}`;

export function loadBriefing(handler: PublicKey): Briefing | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(briefingKey(handler));
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Briefing;
  } catch (_) {
    return null;
  }
}

export function saveBriefing(handler: PublicKey, briefing: Briefing) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(briefingKey(handler), JSON.stringify(briefing));
}

export function clearBriefing(handler: PublicKey) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(briefingKey(handler));
}

export function newItem(
  partial: Omit<ScheduleItem, "id" | "status">
): ScheduleItem {
  return {
    id: crypto.randomUUID(),
    status: "queued",
    ...partial,
  };
}

export function newMessage(
  role: ChatMessage["role"],
  content: string
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content,
    ts: Date.now(),
  };
}

export function nextDueItem(
  items: ScheduleItem[],
  now: number,
  prices: Record<string, number> = {}
): ScheduleItem | null {
  const due = items
    .filter((i) => isItemReady(i, now, prices))
    .sort((a, b) => a.scheduledFor - b.scheduledFor);
  return due[0] ?? null;
}

export function nextUpcoming(items: ScheduleItem[]): ScheduleItem | null {
  const upcoming = items
    .filter((i) => i.status === "queued")
    .sort((a, b) => a.scheduledFor - b.scheduledFor);
  return upcoming[0] ?? null;
}

export function pendingOpportunities(
  opps: Opportunity[],
  now: number
): Opportunity[] {
  return opps.filter((o) => o.status === "pending" && o.expiresAt > now);
}

export function summarize(items: ScheduleItem[]) {
  const queued = items.filter((i) => i.status === "queued").length;
  const executing = items.filter((i) => i.status === "executing").length;
  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "failed").length;
  const awaiting = items.filter((i) => i.status === "awaiting-approval").length;
  return { queued, executing, done, failed, awaiting, total: items.length };
}
