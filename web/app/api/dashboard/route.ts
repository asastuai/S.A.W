import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/dashboard
 *
 * Public, anonymized aggregate stats for the SAW network. Used by the
 * /dashboard page. No handler identifiers exposed.
 */
export async function GET() {
  const db = supabaseAdmin();
  const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const [
    handlers,
    activeAgents,
    wakes7d,
    itemsDone,
    oppsProposed,
    feesAll,
  ] = await Promise.all([
    db.from("handlers").select("id", { count: "exact", head: true }),
    db.from("agents").select("id", { count: "exact", head: true }).eq("active", true),
    db
      .from("agent_wakes")
      .select("id", { count: "exact", head: true })
      .gte("woke_at", since7d),
    db
      .from("scheduled_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "done"),
    db
      .from("opportunities")
      .select("id", { count: "exact", head: true })
      .in("status", ["accepted", "skipped", "expired", "pending"]),
    db.from("fee_ledger").select("fee_kind, amount_lamports, created_at"),
  ]);

  const totalFeeLamports = (feesAll.data ?? []).reduce(
    (acc, r) => acc + Number(r.amount_lamports ?? 0),
    0
  );
  const fees24hLamports = (feesAll.data ?? [])
    .filter((r) => new Date(r.created_at) > new Date(since24h))
    .reduce((acc, r) => acc + Number(r.amount_lamports ?? 0), 0);

  return NextResponse.json({
    handlers: handlers.count ?? 0,
    activeAgents: activeAgents.count ?? 0,
    wakes7d: wakes7d.count ?? 0,
    itemsExecuted: itemsDone.count ?? 0,
    opportunitiesSurfaced: oppsProposed.count ?? 0,
    totalFeesLamports: totalFeeLamports,
    fees24hLamports,
    updatedAt: new Date().toISOString(),
  });
}
