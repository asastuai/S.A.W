import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { createScheduledItem, updateScheduledItemStatus, removeScheduledItem } from "@/lib/db/schedule";
import type { ActionType, TriggerKind, ScheduledStatus } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_TRIGGERS: TriggerKind[] = ["time", "dip", "below", "above"];
const ALLOWED_ACTIONS: ActionType[] = ["pay", "swap"];
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

async function getOwnedAgentOr404(req: NextRequest, agentId: string) {
  const claims = await requireAuth(req);
  const handler = await getHandlerByPrivy(claims.privy_user_id);
  if (!handler) throw new HttpError(404, "handler not found");
  const owned = await listAgentsForHandler(handler.id);
  if (!owned.some((a) => a.id === agentId)) {
    throw new HttpError(404, "agent not found");
  }
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
    await getOwnedAgentOr404(req, params.id);

    const body = (await req.json().catch(() => ({}))) as any;
    if (!ALLOWED_ACTIONS.includes(body.actionType)) {
      return NextResponse.json({ error: "invalid actionType" }, { status: 400 });
    }
    if (typeof body.amount !== "number" || body.amount <= 0) {
      return NextResponse.json({ error: "amount must be positive number" }, { status: 400 });
    }
    if (typeof body.scheduledFor !== "number") {
      return NextResponse.json({ error: "scheduledFor (ms) required" }, { status: 400 });
    }
    const trigger = body.trigger ?? { kind: "time" };
    if (!ALLOWED_TRIGGERS.includes(trigger.kind)) {
      return NextResponse.json({ error: "invalid trigger kind" }, { status: 400 });
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
      .select("agent_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!itemRow || itemRow.agent_id !== params.id) {
      return NextResponse.json({ error: "item not found" }, { status: 404 });
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
