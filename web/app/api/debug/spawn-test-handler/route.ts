import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { addCreditsFromTopup, CALLS_PER_TOPUP, LAMPORTS_PER_TOPUP } from "@/lib/db/credits";
import { createAgent } from "@/lib/db/agents";

export const runtime = "nodejs";

/**
 * POST /api/debug/spawn-test-handler
 * header: x-debug-secret = DEBUG_SECRET env var
 *
 * Creates a test handler + operative agent + pre-credits SAW calls so
 * that subsequent /api/agent/chat calls (via internal-auth) can talk
 * to a working LLM. Used by the autonomous loop to validate the full
 * backend stack end-to-end without browser or wallet.
 *
 * Idempotent on (testTag): re-spawning the same tag returns the same
 * handler. Always tops up credits to 100.
 *
 * Response: { handler_id, agent_id, credits }
 */
export async function POST(req: NextRequest) {
  try {
    const expected = (process.env.DEBUG_SECRET ?? "").trim();
    if (!expected) {
      return NextResponse.json({ error: "DEBUG_SECRET not configured" }, { status: 503 });
    }
    const got = req.headers.get("x-debug-secret")?.trim();
    if (got !== expected) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const tag = String(body.testTag || "default").slice(0, 32);
    const fakePrivyId = `test-runner-${tag}`;
    const fakeWallet = `TestWallet${tag.padEnd(36, "1").slice(0, 36)}`;

    const db = supabaseAdmin();

    // 1) Upsert handler row
    const { data: existingHandler } = await db
      .from("handlers")
      .select("id")
      .eq("privy_user_id", fakePrivyId)
      .maybeSingle();

    let handlerId: string;
    if (existingHandler) {
      handlerId = existingHandler.id;
    } else {
      const { data: newHandler, error } = await db
        .from("handlers")
        .insert({
          privy_user_id: fakePrivyId,
          primary_wallet: fakeWallet,
          email: `test-${tag}@runner.local`,
        })
        .select("id")
        .single();
      if (error || !newHandler) {
        return NextResponse.json(
          { error: `handler create failed: ${error?.message}` },
          { status: 500 }
        );
      }
      handlerId = newHandler.id;
    }

    // 2) Upsert operative agent row
    const { data: existingAgent } = await db
      .from("agents")
      .select("id, agent_name")
      .eq("handler_id", handlerId)
      .eq("persona", "operative")
      .maybeSingle();

    let agentId: string;
    if (existingAgent) {
      agentId = existingAgent.id;
    } else {
      // Fake on-chain refs are fine for test mode — the chat endpoint
      // and tools don't actually verify these. Setup tx would, but
      // test mode skips the setup phase.
      const agent = await createAgent({
        handlerId,
        persona: "operative",
        agentPubkey: `TestAgent${tag.padEnd(35, "1").slice(0, 35)}`,
        walletPda: `TestWalletPda${tag.padEnd(32, "1").slice(0, 32)}`,
        policyPda: `TestPolicyPda${tag.padEnd(32, "1").slice(0, 32)}`,
        queuePda: `TestQueuePda${tag.padEnd(33, "1").slice(0, 33)}`,
        cronCadenceMinutes: 60,
      });
      agentId = agent.id;

      // Patch agent_name so chat surfaces "Test Operative"
      await db
        .from("agents")
        .update({ agent_name: `Test-${tag}` })
        .eq("id", agentId);
    }

    // 3) Top up credits — always ensure ≥100 for the test handler
    const { data: existingCredits } = await db
      .from("llm_credits")
      .select("balance_calls")
      .eq("handler_id", handlerId)
      .maybeSingle();
    const currentBalance = existingCredits?.balance_calls ?? 0;
    if (currentBalance < 50) {
      // Inject 100 calls via a fake topup tx signature (unique per call)
      const fakeSig = `test-topup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      await addCreditsFromTopup({
        handlerId,
        txSignature: fakeSig,
        lamports: LAMPORTS_PER_TOPUP,
        callsCredited: CALLS_PER_TOPUP,
      });
    }

    const { data: refreshed } = await db
      .from("llm_credits")
      .select("balance_calls")
      .eq("handler_id", handlerId)
      .maybeSingle();

    return NextResponse.json({
      handler_id: handlerId,
      agent_id: agentId,
      credits: refreshed?.balance_calls ?? 0,
      privy_user_id: fakePrivyId,
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e.message ?? String(e) },
      { status: 500 }
    );
  }
}
