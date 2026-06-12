import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import {
  createScheduledItem,
  updateScheduledItemStatus,
  removeScheduledItem,
  sumMarginExecutedTodayUTC,
  countOpenPerpPositions,
} from "@/lib/db/schedule";
import type { ActionType, TriggerKind, ScheduledStatus, Agent } from "@/lib/db/types";
import {
  evaluatePerpPolicy,
  deriveUserOrderId,
  DEFAULT_PERP_POLICY,
  type PerpIntent,
} from "@/lib/perp-policy";

export const runtime = "nodejs";

const ALLOWED_TRIGGERS: TriggerKind[] = ["time", "dip", "below", "above"];
const ALLOWED_ACTIONS: ActionType[] = ["pay", "swap", "perp-open", "perp-close"];
const ALLOWED_STATUSES: ScheduledStatus[] = [
  "queued",
  "executing",
  "awaiting-approval",
  "done",
  "failed",
  "skipped",
  "denied",
];

/**
 * POST /api/agents/:id/schedule
 * body: { actionType, vendor?, amount, asset?, toAsset?, reason?, scheduledFor (ms), trigger: {...} }
 * Insert a scheduled item.
 *
 * PATCH /api/agents/:id/schedule?itemId=<uuid>
 * body: { status, txSignature?, errorMessage? }
 * Update status of an existing item.
 */

/** Verify ownership and return the agent row (needed for perp_policy). */
async function getOwnedAgentOr404(req: NextRequest, agentId: string): Promise<Agent> {
  const claims = await requireAuth(req);
  const handler = await getHandlerByPrivy(claims.privy_user_id);
  if (!handler) throw new HttpError(404, "handler not found");
  const owned = await listAgentsForHandler(handler.id);
  const agent = owned.find((a) => a.id === agentId);
  if (!agent) throw new HttpError(404, "agent not found");
  return agent;
}

class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const agent = await getOwnedAgentOr404(req, params.id);

    const body = (await req.json().catch(() => ({}))) as any;
    if (!ALLOWED_ACTIONS.includes(body.actionType)) {
      return NextResponse.json({ error: "invalid actionType" }, { status: 400 });
    }

    const trigger = body.trigger ?? { kind: "time" };
    if (!ALLOWED_TRIGGERS.includes(trigger.kind)) {
      return NextResponse.json({ error: "invalid trigger kind" }, { status: 400 });
    }

    // ── perp-specific branch ────────────────────────────────────────────────
    if (body.actionType === "perp-open") {
      const perp = body.perp;
      if (!perp || typeof perp.market !== "string" || !perp.market) {
        return NextResponse.json({ error: "perp.market required for perp-open" }, { status: 400 });
      }
      if (perp.side !== "long" && perp.side !== "short") {
        return NextResponse.json({ error: "perp.side must be 'long' or 'short'" }, { status: 400 });
      }
      if (typeof perp.leverage !== "number" || !Number.isInteger(perp.leverage) || perp.leverage < 1 || perp.leverage > 20) {
        return NextResponse.json({ error: "perp.leverage must be an integer between 1 and 20" }, { status: 400 });
      }
      if (typeof perp.marginUsdc !== "number" || perp.marginUsdc <= 0) {
        return NextResponse.json({ error: "perp.marginUsdc must be a positive number" }, { status: 400 });
      }
      if (perp.stopLoss !== null && perp.stopLoss !== undefined && typeof perp.stopLoss !== "number") {
        return NextResponse.json({ error: "perp.stopLoss must be a number or null" }, { status: 400 });
      }
      if (perp.takeProfit !== null && perp.takeProfit !== undefined && typeof perp.takeProfit !== "number") {
        return NextResponse.json({ error: "perp.takeProfit must be a number or null" }, { status: 400 });
      }

      // Server-side policy evaluation
      const intent: PerpIntent = {
        market: perp.market,
        side: perp.side,
        leverage: perp.leverage,
        marginUsdc: perp.marginUsdc,
        stopLoss: perp.stopLoss ?? null,
        takeProfit: perp.takeProfit ?? null,
      };
      const policy = agent.perp_policy ?? DEFAULT_PERP_POLICY;
      const [dailyMarginUsedUsdc, openPositions] = await Promise.all([
        sumMarginExecutedTodayUTC(params.id),
        countOpenPerpPositions(params.id),
      ]);
      const verdict = evaluatePerpPolicy(intent, policy, { dailyMarginUsedUsdc, openPositions });

      if (verdict.verdict === "denied") {
        return NextResponse.json({ error: "policy denied", reason: verdict.reason }, { status: 422 });
      }

      // Determine the item id (use client-provided or generate one server-side)
      const itemId = typeof body.id === "string" ? body.id : crypto.randomUUID();
      // Derive userOrderId server-side from the persisted item id
      const userOrderId = deriveUserOrderId(itemId);

      // Legacy NOT-NULL conventions:
      //   amount = Math.round(marginUsdc * 1e6)   (micro-USDC, keeps existing NOT NULL)
      //   scheduledFor = body.scheduledFor ?? Date.now()  (price triggers dominate)
      //   vendor = null
      //   asset = "SOL"
      const scheduledForMs: number =
        typeof body.scheduledFor === "number" ? body.scheduledFor : Date.now();

      const item = await createScheduledItem({
        id: itemId,
        agentId: params.id,
        actionType: "perp-open",
        vendor: null,
        amount: Math.round(perp.marginUsdc * 1e6),
        asset: "SOL",
        toAsset: null,
        reason: typeof body.reason === "string" ? body.reason : null,
        scheduledFor: new Date(scheduledForMs),
        trigger: {
          kind: trigger.kind,
          basisPrice: trigger.basisPrice,
          dropPct: trigger.dropPct,
          targetPrice: trigger.price ?? trigger.targetPrice,
          deadline: trigger.deadline ? new Date(trigger.deadline) : undefined,
        },
        perp: {
          market: perp.market,
          side: perp.side,
          leverage: perp.leverage,
          marginUsdc: perp.marginUsdc,
          stopLoss: perp.stopLoss ?? null,
          takeProfit: perp.takeProfit ?? null,
          userOrderId,
        },
      });

      // If policy required approval, update status and inform the caller
      if (verdict.verdict === "requires-approval") {
        await updateScheduledItemStatus(item.id, "awaiting-approval");
        return NextResponse.json({
          item: { ...item, status: "awaiting-approval" },
          policyVerdict: verdict.verdict,
          reason: verdict.reason,
        });
      }

      return NextResponse.json({ item, policyVerdict: verdict.verdict });
    }

    if (body.actionType === "perp-close") {
      const perp = body.perp;
      if (!perp || typeof perp.market !== "string" || !perp.market) {
        return NextResponse.json({ error: "perp.market required for perp-close" }, { status: 400 });
      }

      const scheduledForMs: number =
        typeof body.scheduledFor === "number" ? body.scheduledFor : Date.now();

      const item = await createScheduledItem({
        id: typeof body.id === "string" ? body.id : undefined,
        agentId: params.id,
        actionType: "perp-close",
        vendor: null,
        amount: 0,
        asset: "SOL",
        toAsset: null,
        reason: typeof body.reason === "string" ? body.reason : null,
        scheduledFor: new Date(scheduledForMs),
        trigger: {
          kind: trigger.kind,
          basisPrice: trigger.basisPrice,
          dropPct: trigger.dropPct,
          targetPrice: trigger.price ?? trigger.targetPrice,
          deadline: trigger.deadline ? new Date(trigger.deadline) : undefined,
        },
        perp: {
          market: perp.market,
          side: null,
          leverage: null,
          marginUsdc: null,
          stopLoss: null,
          takeProfit: null,
          userOrderId: null,
        },
      });

      return NextResponse.json({ item });
    }

    // ── pay / swap branch (unchanged behavior — additive only) ──────────────
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return NextResponse.json({ error: "amount must be positive number" }, { status: 400 });
    }
    if (typeof body.scheduledFor !== "number") {
      return NextResponse.json({ error: "scheduledFor (ms) required" }, { status: 400 });
    }

    const item = await createScheduledItem({
      id: typeof body.id === "string" ? body.id : undefined,
      agentId: params.id,
      actionType: body.actionType,
      vendor: body.vendor,
      amount: body.amount,
      asset: body.asset,
      toAsset: body.toAsset,
      reason: body.reason,
      scheduledFor: new Date(body.scheduledFor),
      trigger: {
        kind: trigger.kind,
        basisPrice: trigger.basisPrice,
        dropPct: trigger.dropPct,
        targetPrice: trigger.price ?? trigger.targetPrice,
        deadline: trigger.deadline ? new Date(trigger.deadline) : undefined,
      },
    });

    return NextResponse.json({ item });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getOwnedAgentOr404(req, params.id);

    const itemId = new URL(req.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as any;
    if (!ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    // SECURITY: verify the item being updated actually belongs to the
    // agent the caller owns. Without this check, any authenticated
    // handler could PATCH another handler's items just by knowing the
    // uuid (IDOR). The agent ownership check above is necessary but
    // insufficient — we have to bind the item to that agent too.
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { data: itemRow } = await supabaseAdmin()
      .from("scheduled_items")
      .select("agent_id, action_type, status")
      .eq("id", itemId)
      .maybeSingle();
    if (!itemRow || itemRow.agent_id !== params.id) {
      return NextResponse.json({ error: "item not found" }, { status: 404 });
    }

    // Aprobación humana de items perp (I-1, review 2026-06-12):
    // awaiting-approval → queued SOLO con body.approve === true. El PATCH exige el
    // JWT Privy del handler (el agente/worker no lo tiene), así que este endpoint ES
    // el mecanismo de aprobación humana — el flag explícito garantiza que la
    // transición venga de un click de aprobación en la UI (Task 9), nunca de un
    // flujo automático del cliente que parchee status por su cuenta.
    if (
      (itemRow.action_type === "perp-open" || itemRow.action_type === "perp-close") &&
      itemRow.status === "awaiting-approval" &&
      body.status === "queued" &&
      body.approve !== true
    ) {
      return NextResponse.json(
        { error: "perp approval requires explicit approve flag" },
        { status: 403 }
      );
    }

    await updateScheduledItemStatus(itemId, body.status, {
      txSignature: body.txSignature,
      errorMessage: body.errorMessage,
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

/**
 * DELETE /api/agents/:id/schedule?itemId=<uuid>
 * Permanently remove a scheduled item the caller owns. This is what makes a
 * "kill"/"rm" in the UI persist — without it the row survives in the DB and
 * the next session's hydration (DB is source of truth) brings it back.
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await getOwnedAgentOr404(req, params.id);

    const itemId = new URL(req.url).searchParams.get("itemId");
    if (!itemId) return NextResponse.json({ error: "itemId required" }, { status: 400 });

    // Same IDOR guard as PATCH: bind the item to the agent the caller owns
    // before deleting, so knowing a uuid alone can't delete another handler's item.
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { data: itemRow } = await supabaseAdmin()
      .from("scheduled_items")
      .select("agent_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!itemRow || itemRow.agent_id !== params.id) {
      return NextResponse.json({ error: "item not found" }, { status: 404 });
    }

    await removeScheduledItem(itemId);

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
