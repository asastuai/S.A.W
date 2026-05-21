import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { listAgentsForHandler } from "@/lib/db/agents";
import { listFeesForHandler, recordFee } from "@/lib/db/fees";
import { previewSwapFeeLamports } from "@/lib/fees";
import type { FeeKind } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_KINDS: FeeKind[] = ["swap", "performance", "aum"];

/**
 * POST /api/agents/:id/fees
 * body: { kind, amountLamports?, swapInputLamports?, asset?, relatedTx? }
 * Records a fee event in fee_ledger.
 *
 * For convenience, if kind=swap and swapInputLamports is provided,
 * the route computes the fee using previewSwapFeeLamports (55 bps).
 *
 * GET /api/agents/:id/fees → recent fees for the handler.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json({ error: "handler not found" }, { status: 404 });
    }
    const owned = await listAgentsForHandler(handler.id);
    if (!owned.some((a) => a.id === params.id)) {
      return NextResponse.json({ error: "agent not found" }, { status: 404 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      kind?: FeeKind;
      amountLamports?: number;
      swapInputLamports?: number;
      asset?: string;
      relatedTx?: string;
    };
    if (!body.kind || !ALLOWED_KINDS.includes(body.kind)) {
      return NextResponse.json({ error: "invalid kind" }, { status: 400 });
    }

    let amountLamports = body.amountLamports;
    if (
      body.kind === "swap" &&
      amountLamports === undefined &&
      typeof body.swapInputLamports === "number"
    ) {
      amountLamports = Number(previewSwapFeeLamports(BigInt(body.swapInputLamports)));
    }
    if (typeof amountLamports !== "number" || amountLamports < 0) {
      return NextResponse.json({ error: "amountLamports required" }, { status: 400 });
    }

    const entry = await recordFee({
      handlerId: handler.id,
      agentId: params.id,
      kind: body.kind,
      amountLamports,
      asset: body.asset,
      relatedTx: body.relatedTx ?? null,
    });

    return NextResponse.json({ entry });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) return NextResponse.json({ fees: [] });
    const owned = await listAgentsForHandler(handler.id);
    if (!owned.some((a) => a.id === params.id)) {
      return NextResponse.json({ fees: [] });
    }
    const fees = await listFeesForHandler(handler.id, 100);
    return NextResponse.json({ fees });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
