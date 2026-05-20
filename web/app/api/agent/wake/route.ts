import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/agent/wake
 * body: { agentId: string }
 * header: x-saw-admin-token (must match SAW_ADMIN_TOKEN env var)
 *
 * Manually triggers an agent wake. Used for:
 *   - Local development (skip the cron, force a wake right now)
 *   - Admin debugging on prod
 *
 * In production this proxies to Trigger.dev's HTTP API to enqueue
 * an agent-wake task with the given externalId. For Phase 0 it is a
 * no-op stub that responds 202 so the route compiles and can be
 * deployed before TRIGGER_SECRET_KEY is wired.
 */
export async function POST(req: NextRequest) {
  const adminToken = req.headers.get("x-saw-admin-token");
  if (!process.env.SAW_ADMIN_TOKEN || adminToken !== process.env.SAW_ADMIN_TOKEN) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let body: { agentId?: string } = {};
  try {
    body = await req.json();
  } catch {}
  const agentId = body.agentId?.trim();
  if (!agentId) {
    return NextResponse.json({ error: "missing agentId" }, { status: 400 });
  }

  // TODO Phase 1 — when Trigger.dev is wired, enqueue here:
  //   import { tasks } from "@trigger.dev/sdk/v3";
  //   await tasks.trigger("agent-wake", undefined, { externalId: agentId });
  return NextResponse.json(
    { accepted: true, agentId, note: "stub — Trigger.dev wiring lands in Phase 1" },
    { status: 202 }
  );
}
