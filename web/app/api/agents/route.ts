import { NextRequest, NextResponse } from "next/server";
import { AuthError, requireAuth } from "@/lib/auth";
import { getHandlerByPrivy } from "@/lib/db/handlers";
import { createAgent, listAgentsForHandler, setAgentActive } from "@/lib/db/agents";
import type { Persona } from "@/lib/db/types";

export const runtime = "nodejs";

const ALLOWED_PERSONAS: Persona[] = ["greedie", "conservador", "estable"];
const ACTIVE_PERSONAS: Persona[] = ["greedie", "conservador"]; // v1.2

/**
 * GET /api/agents — list agents for the authenticated handler.
 */
export async function GET(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) return NextResponse.json({ agents: [] });
    const agents = await listAgentsForHandler(handler.id);
    return NextResponse.json({ agents });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}

/**
 * POST /api/agents
 * body: { persona, agentPubkey, walletPda, policyPda, queuePda, byokKeyId?, cronCadenceMinutes? }
 * Creates an agent row after the client has provisioned the on-chain accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const claims = requireAuth(req);
    const handler = await getHandlerByPrivy(claims.privy_user_id);
    if (!handler) {
      return NextResponse.json(
        { error: "handler not found — visit /api/handler/me first" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const {
      persona,
      agentPubkey,
      walletPda,
      policyPda,
      queuePda,
      byokKeyId,
      cronCadenceMinutes,
    } = body ?? {};

    if (!ALLOWED_PERSONAS.includes(persona)) {
      return NextResponse.json({ error: "invalid persona" }, { status: 400 });
    }
    if (!ACTIVE_PERSONAS.includes(persona)) {
      return NextResponse.json(
        { error: `persona ${persona} is coming soon, not active in v1` },
        { status: 403 }
      );
    }
    for (const field of ["agentPubkey", "walletPda", "policyPda", "queuePda"]) {
      if (typeof body[field] !== "string" || !body[field]) {
        return NextResponse.json({ error: `missing ${field}` }, { status: 400 });
      }
    }
    if (
      cronCadenceMinutes !== undefined &&
      (typeof cronCadenceMinutes !== "number" ||
        cronCadenceMinutes < 15 ||
        cronCadenceMinutes > 1440)
    ) {
      return NextResponse.json(
        { error: "cronCadenceMinutes must be 15..1440" },
        { status: 400 }
      );
    }

    const agent = await createAgent({
      handlerId: handler.id,
      persona,
      agentPubkey,
      walletPda,
      policyPda,
      queuePda,
      byokKeyId: byokKeyId ?? null,
      cronCadenceMinutes,
    });

    // v1.2: default agents to silent (no autonomous wakes) so users
    // protect their free-tier LLM budget. Handler opts in via settings.
    try {
      await setAgentActive(agent.id, false);
    } catch {
      /* non-fatal */
    }
    (agent as any).active = false;

    return NextResponse.json({ agent });
  } catch (e: any) {
    if (e instanceof AuthError) {
      return NextResponse.json({ error: e.message }, { status: 401 });
    }
    return NextResponse.json({ error: e.message ?? String(e) }, { status: 500 });
  }
}
