-- SAW initial schema
-- Run on a fresh Supabase project. Requires pgcrypto (default in Supabase).

-- ============================================================================
-- HANDLERS (humans who own agents)
-- ============================================================================

create table if not exists handlers (
  id                 uuid primary key default gen_random_uuid(),
  privy_user_id      text unique not null,            -- from Privy auth
  primary_wallet     text unique not null,            -- Solana pubkey base58
  email              text,
  created_at         timestamptz not null default now(),
  last_seen_at       timestamptz not null default now()
);

create index handlers_primary_wallet_idx on handlers (primary_wallet);

-- ============================================================================
-- BYOK encrypted API keys (Groq, OpenAI, etc.)
-- We never store the raw key. Server-side AES-GCM with a SUPABASE_VAULT key.
-- ============================================================================

create table if not exists byok_keys (
  id                 uuid primary key default gen_random_uuid(),
  handler_id         uuid not null references handlers(id) on delete cascade,
  provider           text not null check (provider in ('groq', 'openai', 'anthropic', 'gemini', 'grok')),
  ciphertext         text not null,                   -- base64 AES-GCM of the api key
  iv                 text not null,                   -- base64 IV
  key_label          text,                             -- "Greedie key", "Personal", etc.
  created_at         timestamptz not null default now(),
  last_used_at       timestamptz,
  unique (handler_id, provider, key_label)
);

create index byok_keys_handler_idx on byok_keys (handler_id);

-- ============================================================================
-- AGENTS (each handler can run multiple agents, one per persona)
-- ============================================================================

create table if not exists agents (
  id                 uuid primary key default gen_random_uuid(),
  handler_id         uuid not null references handlers(id) on delete cascade,
  persona            text not null check (persona in ('greedie', 'conservador', 'estable')),
  agent_pubkey       text not null,                   -- Solana pubkey base58 (the agent's signing keypair)
  wallet_pda         text not null,                   -- SAW agent_wallet PDA
  policy_pda         text not null,                   -- SAW policy_registry PDA
  queue_pda          text not null,                   -- SAW approval_queue PDA
  active             boolean not null default true,
  cron_cadence_minutes integer not null default 60 check (cron_cadence_minutes between 15 and 1440),
  active_hours_start integer check (active_hours_start between 0 and 23),  -- null = 24/7
  active_hours_end   integer check (active_hours_end between 0 and 23),
  byok_key_id        uuid references byok_keys(id) on delete set null,
  created_at         timestamptz not null default now(),
  last_wake_at       timestamptz,
  next_wake_at       timestamptz,
  unique (handler_id, persona)
);

create index agents_next_wake_idx on agents (next_wake_at) where active = true;

-- ============================================================================
-- SCHEDULED ITEMS (agent's queued actions)
-- ============================================================================

create table if not exists scheduled_items (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references agents(id) on delete cascade,
  action_type        text not null check (action_type in ('pay', 'swap')),
  vendor             text,                              -- for pay
  amount             bigint not null,                   -- base units (decimals = 6 for TEST, varies)
  asset              text,                              -- "SOL", "USDC", etc.
  to_asset           text,                              -- for swap: target asset
  reason             text,
  scheduled_for      timestamptz not null,
  trigger_kind       text not null check (trigger_kind in ('time', 'dip', 'below', 'above')),
  trigger_basis_price numeric,
  trigger_drop_pct   numeric,
  trigger_target_price numeric,
  trigger_deadline   timestamptz,
  status             text not null default 'queued' check (status in (
    'queued', 'executing', 'awaiting-approval', 'done', 'failed', 'skipped', 'denied'
  )),
  tx_signature       text,
  error_message      text,
  created_at         timestamptz not null default now(),
  executed_at        timestamptz
);

create index scheduled_items_agent_idx on scheduled_items (agent_id, status);
create index scheduled_items_pending_idx on scheduled_items (scheduled_for)
  where status in ('queued', 'awaiting-approval');

-- ============================================================================
-- OPPORTUNITIES (proactive scans by the agent)
-- ============================================================================

create table if not exists opportunities (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references agents(id) on delete cascade,
  title              text not null,
  message            text not null,
  suggested_vendor   text,
  suggested_amount   bigint,
  suggested_asset    text,
  suggested_reason   text,
  trigger_kind       text check (trigger_kind in ('time', 'dip', 'below', 'above')),
  trigger_basis_price numeric,
  trigger_drop_pct   numeric,
  trigger_target_price numeric,
  confidence         text not null check (confidence in ('low', 'medium', 'high')),
  status             text not null default 'pending' check (status in (
    'pending', 'accepted', 'skipped', 'expired'
  )),
  expires_at         timestamptz not null,
  created_at         timestamptz not null default now(),
  resolved_at        timestamptz
);

create index opportunities_agent_pending_idx on opportunities (agent_id)
  where status = 'pending';

-- ============================================================================
-- CHAT MESSAGES (briefing history)
-- ============================================================================

create table if not exists chat_messages (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references agents(id) on delete cascade,
  role               text not null check (role in ('user', 'agent', 'system')),
  content            text not null,
  created_at         timestamptz not null default now()
);

create index chat_messages_agent_idx on chat_messages (agent_id, created_at);

-- ============================================================================
-- LLM USAGE LEDGER (for rate limiting + future billing transparency)
-- ============================================================================

create table if not exists llm_usage (
  id                 uuid primary key default gen_random_uuid(),
  handler_id         uuid not null references handlers(id) on delete cascade,
  agent_id           uuid references agents(id) on delete set null,
  provider           text not null,
  model              text not null,
  prompt_tokens      integer not null default 0,
  completion_tokens  integer not null default 0,
  total_tokens       integer not null default 0,
  endpoint           text not null check (endpoint in ('chat', 'scan', 'wake')),
  duration_ms        integer,
  created_at         timestamptz not null default now()
);

create index llm_usage_handler_day_idx on llm_usage (handler_id, created_at desc);

-- ============================================================================
-- AGENT WAKES (one row per cron tick, audit trail)
-- ============================================================================

create table if not exists agent_wakes (
  id                 uuid primary key default gen_random_uuid(),
  agent_id           uuid not null references agents(id) on delete cascade,
  woke_at            timestamptz not null default now(),
  finished_at        timestamptz,
  outcome            text check (outcome in (
    'scanned-no-action', 'proposed-opportunity', 'executed-trigger', 'failed', 'skipped-inactive-hours'
  )),
  llm_calls          integer not null default 0,
  items_executed     integer not null default 0,
  opportunities_proposed integer not null default 0,
  error_message      text
);

create index agent_wakes_agent_idx on agent_wakes (agent_id, woke_at desc);

-- ============================================================================
-- FEE LEDGER (every fee collected, on-chain)
-- ============================================================================

create table if not exists fee_ledger (
  id                 uuid primary key default gen_random_uuid(),
  handler_id         uuid not null references handlers(id) on delete cascade,
  agent_id           uuid references agents(id) on delete set null,
  fee_kind           text not null check (fee_kind in ('swap', 'performance', 'aum')),
  amount_lamports    bigint not null,
  asset              text not null default 'SOL',
  related_tx         text,
  period_start       timestamptz,
  period_end         timestamptz,
  created_at         timestamptz not null default now()
);

create index fee_ledger_handler_idx on fee_ledger (handler_id, created_at desc);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Handlers can only see their own data. Service role bypasses everything.
-- ============================================================================

alter table handlers           enable row level security;
alter table byok_keys          enable row level security;
alter table agents             enable row level security;
alter table scheduled_items    enable row level security;
alter table opportunities      enable row level security;
alter table chat_messages      enable row level security;
alter table llm_usage          enable row level security;
alter table agent_wakes        enable row level security;
alter table fee_ledger         enable row level security;

-- Policies use auth.jwt() ->> 'sub' to match privy_user_id (Privy sets it via SUPABASE_JWT_SECRET).
-- Service role (used by Trigger.dev jobs) bypasses RLS.

create policy handlers_self on handlers
  for all using (privy_user_id = auth.jwt() ->> 'sub');

create policy byok_keys_self on byok_keys
  for all using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));

create policy agents_self on agents
  for all using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));

create policy scheduled_items_self on scheduled_items
  for all using (agent_id in (
    select id from agents where handler_id in (
      select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
    )
  ));

create policy opportunities_self on opportunities
  for all using (agent_id in (
    select id from agents where handler_id in (
      select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
    )
  ));

create policy chat_messages_self on chat_messages
  for all using (agent_id in (
    select id from agents where handler_id in (
      select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
    )
  ));

create policy llm_usage_self on llm_usage
  for select using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));

create policy agent_wakes_self on agent_wakes
  for select using (agent_id in (
    select id from agents where handler_id in (
      select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
    )
  ));

create policy fee_ledger_self on fee_ledger
  for select using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));
