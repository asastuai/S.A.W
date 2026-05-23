import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { createOpportunity, resolveOpportunity } from "@/lib/db/opportunities";
import type { OpportunityStatus, TriggerKind } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_STATUSES: OpportunityStatus[] = ["accepted", "skipped", "expired"];

async function ownAgentOr404(req: NextRequest, agentId: string) {
  const claims = requireAuth(req);
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

/**
 * POST /api/agents/:id/opportunities
 * body: { title, message, suggested: {vendor, amount, asset?, reason},
 *         trigger?: {kind, basisPrice?, dropPct?, targetPrice?},
 *         confidence: "low"|"medium"|"high", expiresAt: ISO string }
 * Inserts a proactive opportunity for the agent.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ownAgentOr404(req, params.id);

    const body = (await req.json().catch(() => ({}))) as any;
    if (!body.title || !body.message || !body.suggested || !body.confidence || !body.expiresAt) {
      return NextResponse.json(
        { error: "title, message, suggested, confidence, expiresAt required" },
        { status: 400 }
      );
    }

    const opp = await createOpportunity({
      agentId: params.id,
      title: String(body.title),
      message: String(body.message),
      suggested: {
        vendor: body.suggested.vendor,
        amount: body.suggested.amount,
        asset: body.suggested.asset,
        reason: body.suggested.reason,
      },
      trigger: body.trigger
        ? {
            kind: body.trigger.kind as TriggerKind,
            basisPrice: body.trigger.basisPrice,
            dropPct: body.trigger.dropPct,
            targetPrice: body.trigger.targetPrice ?? body.trigger.price,
          }
        : undefined,
      confidence: body.confidence,
      expiresAt: new Date(body.expiresAt),
    });

    return NextResponse.json({ opportunity: opp });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

/**
 * PATCH /api/agents/:id/opportunities?oppId=<uuid>
 * body: { status: "accepted"|"skipped"|"expired" }
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    await ownAgentOr404(req, params.id);

    const oppId = new URL(req.url).searchParams.get("oppId");
    if (!oppId) return NextResponse.json({ error: "oppId required" }, { status: 400 });

    const body = (await req.json().catch(() => ({}))) as { status?: OpportunityStatus };
    if (!body.status || !ALLOWED_STATUSES.includes(body.status)) {
      return NextResponse.json({ error: "invalid status" }, { status: 400 });
    }

    // SECURITY (same as schedule PATCH): bind oppId to params.id before
    // mutating, otherwise an authenticated handler could resolve another
    // handler's opportunity by knowing the uuid.
    const { supabaseAdmin } = await import("@/lib/supabase");
    const { data: oppRow } = await supabaseAdmin()
      .from("opportunities")
      .select("agent_id")
      .eq("id", oppId)
      .maybeSingle();
    if (!oppRow || oppRow.agent_id !== params.id) {
      return NextResponse.json({ error: "opportunity not found" }, { status: 404 });
    }

    await resolveOpportunity(oppId, body.status);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    if (e instanceof AuthError) return NextResponse.json({ error: e.message }, { status: 401 });
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
