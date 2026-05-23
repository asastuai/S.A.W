import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import {
  getAgentByHandlerAndPersona,
  listAgentsForHandler,
  setAgentActive,
  updateAgentSchedule,
} from "@/lib/db/agents";
import { supabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

/**
 * PATCH /api/agents/:id
 * body: { active?, cronCadenceMinutes?, activeHoursStart?, activeHoursEnd? }
 * Updates schedule + activity flags for the agent. Owner-only.
 */
export async function PATCH(
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
      active?: boolean;
      cronCadenceMinutes?: number;
      activeHoursStart?: number | null;
      activeHoursEnd?: number | null;
      agentName?: string;
    };

    if (typeof body.active === "boolean") {
      await setAgentActive(params.id, body.active);
    }

    if (typeof body.agentName === "string") {
      const trimmed = body.agentName.trim().slice(0, 24);
      if (trimmed.length > 0) {
        await supabaseAdmin()
          .from("agents")
          .update({ agent_name: trimmed })
          .eq("id", params.id);
      }
    }

    if (
      body.cronCadenceMinutes !== undefined ||
      body.activeHoursStart !== undefined ||
      body.activeHoursEnd !== undefined
    ) {
      if (
        body.cronCadenceMinutes !== undefined &&
        (typeof body.cronCadenceMinutes !== "number" ||
          body.cronCadenceMinutes < 15 ||
          body.cronCadenceMinutes > 1440)
      ) {
        return NextResponse.json(
          { error: "cronCadenceMinutes must be 15..1440" },
          { status: 400 }
        );
      }
      for (const k of ["activeHoursStart", "activeHoursEnd"] as const) {
        const v = body[k];
        if (v !== undefined && v !== null && (typeof v !== "number" || v < 0 || v > 23)) {
          return NextResponse.json({ error: `${k} must be 0..23 or null` }, { status: 400 });
        }
      }
      await updateAgentSchedule(params.id, {
        cronCadenceMinutes: body.cronCadenceMinutes,
        activeHoursStart: body.activeHoursStart,
        activeHoursEnd: body.activeHoursEnd,
      });

      // Recompute next_wake_at based on new cadence (best-effort)
      if (body.cronCadenceMinutes !== undefined) {
        const next = new Date(Date.now() + body.cronCadenceMinutes * 60_000);
        await supabaseAdmin()
          .from("agents")
          .update({ next_wake_at: next.toISOString() })
          .eq("id", params.id);
      }
    }

    // Return the updated row
    const { data: updated } = await supabaseAdmin()
      .from("agents")
      .select("*")
      .eq("id", params.id)
      .single();
    return NextResponse.json({ agent: updated });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
