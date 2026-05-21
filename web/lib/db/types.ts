/**
 * Hand-authored TypeScript types matching db/migrations/0001_init.sql.
 *
 * Once the Supabase project exists, replace with auto-generated types via:
 *   supabase gen types typescript --project-id <ref> > web/lib/db/generated.ts
 * then re-export from here.
 */

export type Provider = "groq" | "openai" | "anthropic" | "gemini" | "grok" | "deepseek";
export type Persona = "greedie" | "conservador" | "estable";
export type TriggerKind = "time" | "dip" | "below" | "above";
export type ActionType = "pay" | "swap";
export type ScheduledStatus =
  | "queued"
  | "executing"
  | "awaiting-approval"
  | "done"
  | "failed"
  | "skipped"
  | "denied";
export type OpportunityStatus = "pending" | "accepted" | "skipped" | "expired";
export type ChatRole = "user" | "agent" | "system";
export type LlmEndpoint = "chat" | "scan" | "wake";
export type WakeOutcome =
  | "scanned-no-action"
  | "proposed-opportunity"
  | "executed-trigger"
  | "failed"
  | "skipped-inactive-hours";
export type FeeKind = "swap" | "performance" | "aum";

export interface Handler {
  id: string;
  privy_user_id: string;
  primary_wallet: string;
  email: string | null;
  created_at: string;
  last_seen_at: string;
}

export interface ByokKey {
  id: string;
  handler_id: string;
  provider: Provider;
  ciphertext: string;
  iv: string;
  key_label: string | null;
  created_at: string;
  last_used_at: string | null;
}

export interface Agent {
  id: string;
  handler_id: string;
  persona: Persona;
  agent_pubkey: string;
  wallet_pda: string;
  policy_pda: string;
  queue_pda: string;
  active: boolean;
  cron_cadence_minutes: number;
  active_hours_start: number | null;
  active_hours_end: number | null;
  byok_key_id: string | null;
  created_at: string;
  last_wake_at: string | null;
  next_wake_at: string | null;
}

export interface ScheduledItem {
  id: string;
  agent_id: string;
  action_type: ActionType;
  vendor: string | null;
  amount: number;
  asset: string | null;
  to_asset: string | null;
  reason: string | null;
  scheduled_for: string;
  trigger_kind: TriggerKind;
  trigger_basis_price: number | null;
  trigger_drop_pct: number | null;
  trigger_target_price: number | null;
  trigger_deadline: string | null;
  status: ScheduledStatus;
  tx_signature: string | null;
  error_message: string | null;
  created_at: string;
  executed_at: string | null;
}

export interface Opportunity {
  id: string;
  agent_id: string;
  title: string;
  message: string;
  suggested_vendor: string | null;
  suggested_amount: number | null;
  suggested_asset: string | null;
  suggested_reason: string | null;
  trigger_kind: TriggerKind | null;
  trigger_basis_price: number | null;
  trigger_drop_pct: number | null;
  trigger_target_price: number | null;
  confidence: "low" | "medium" | "high";
  status: OpportunityStatus;
  expires_at: string;
  created_at: string;
  resolved_at: string | null;
}

export interface ChatMessage {
  id: string;
  agent_id: string;
  role: ChatRole;
  content: string;
  created_at: string;
}

export interface LlmUsage {
  id: string;
  handler_id: string;
  agent_id: string | null;
  provider: Provider;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  endpoint: LlmEndpoint;
  duration_ms: number | null;
  created_at: string;
}

export interface AgentWake {
  id: string;
  agent_id: string;
  woke_at: string;
  finished_at: string | null;
  outcome: WakeOutcome | null;
  llm_calls: number;
  items_executed: number;
  opportunities_proposed: number;
  error_message: string | null;
}

export interface FeeLedgerEntry {
  id: string;
  handler_id: string;
  agent_id: string | null;
  fee_kind: FeeKind;
  amount_lamports: number;
  asset: string;
  related_tx: string | null;
  period_start: string | null;
  period_end: string | null;
  created_at: string;
}
