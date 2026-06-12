/**
 * web/lib/db/agents.test.ts
 *
 * Fix 3: createAgent must always include perp_policy in the insert payload
 * (so agents spawned after migration 0014 get the proper DEFAULT_PERP_POLICY
 * rather than a potentially broken column default).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Supabase mock ─────────────────────────────────────────────────────────────

let _insertedPayload: Record<string, unknown> | null = null;

function buildSupabaseMock(resolveWith: { data?: unknown; error: unknown }) {
  const single = () => Promise.resolve(resolveWith);
  const builder: any = {
    from(_table: string) {
      return this;
    },
    insert(payload: Record<string, unknown>) {
      _insertedPayload = payload;
      return this;
    },
    select(_cols: string) {
      return this;
    },
    single,
    // Passthrough for other chain methods
    eq() { return this; },
    update() { return this; },
  };
  return builder;
}

vi.mock("@/lib/supabase", () => ({
  supabaseAdmin: vi.fn(),
}));

import { supabaseAdmin } from "@/lib/supabase";

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("createAgent — Fix 3: perp_policy always set in insert", () => {
  beforeEach(() => {
    _insertedPayload = null;
    vi.clearAllMocks();
  });

  it("insert payload includes perp_policy when none provided (uses DEFAULT_PERP_POLICY)", async () => {
    const mockAgent = {
      id: "new-agent-uuid-001",
      handler_id: "handler-uuid-001",
      persona: "greedie",
      agent_pubkey: "AgentPubkeyAbc",
      wallet_pda: "WalletPdaAbc",
      policy_pda: "PolicyPdaAbc",
      queue_pda: "QueuePdaAbc",
      perp_policy: null, // will be set by code
      cron_cadence_minutes: 60,
      active: true,
    };

    (supabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSupabaseMock({ data: mockAgent, error: null })
    );

    const { createAgent } = await import("@/lib/db/agents");

    await createAgent({
      handlerId: "handler-uuid-001",
      persona: "greedie",
      agentPubkey: "AgentPubkeyAbc",
      walletPda: "WalletPdaAbc",
      policyPda: "PolicyPdaAbc",
      queuePda: "QueuePdaAbc",
    });

    expect(_insertedPayload).not.toBeNull();
    // perp_policy must be present and not null/undefined
    expect(_insertedPayload!["perp_policy"]).toBeDefined();
    expect(_insertedPayload!["perp_policy"]).not.toBeNull();
    // It should be an object with at least the core policy fields
    expect(typeof _insertedPayload!["perp_policy"]).toBe("object");
    const policy = _insertedPayload!["perp_policy"] as Record<string, unknown>;
    expect(policy["maxLeverage"]).toBeDefined();
    expect(policy["dailyMarginBudget"]).toBeDefined();
    expect(policy["requireStopLoss"]).toBe(true);
  });

  it("insert payload uses explicit perp_policy when provided", async () => {
    const customPolicy = {
      maxLeverage: 10,
      maxMarginPerTx: 500,
      dailyMarginBudget: 2000,
      maxOpenPositions: 5,
      allowedMarkets: ["SOL-PERP"],
      requireStopLoss: false,
      approvalThresholdMargin: 1000,
    };

    const mockAgent = {
      id: "new-agent-uuid-002",
      handler_id: "handler-uuid-001",
      persona: "greedie",
      agent_pubkey: "AgentPubkeyDef",
      wallet_pda: "WalletPdaDef",
      policy_pda: "PolicyPdaDef",
      queue_pda: "QueuePdaDef",
      perp_policy: customPolicy,
      cron_cadence_minutes: 60,
      active: true,
    };

    (supabaseAdmin as ReturnType<typeof vi.fn>).mockReturnValue(
      buildSupabaseMock({ data: mockAgent, error: null })
    );

    const { createAgent } = await import("@/lib/db/agents");

    await createAgent({
      handlerId: "handler-uuid-001",
      persona: "greedie",
      agentPubkey: "AgentPubkeyDef",
      walletPda: "WalletPdaDef",
      policyPda: "PolicyPdaDef",
      queuePda: "QueuePdaDef",
      perpPolicy: customPolicy,
    });

    expect(_insertedPayload).not.toBeNull();
    expect(_insertedPayload!["perp_policy"]).toEqual(customPolicy);
  });
});
