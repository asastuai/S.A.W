-- LLM credits: pre-paid balance of LLM calls a handler can use against
-- SAW's server-side LLM keys when they have no BYOK key of their own.
-- 1 row per handler. Topped up by on-chain SOL transfer to treasury.

create table if not exists llm_credits (
  id              uuid primary key default gen_random_uuid(),
  handler_id      uuid not null references handlers(id) on delete cascade,
  balance_calls   integer not null default 0,
  total_paid_lamports bigint not null default 0,
  last_topup_at   timestamptz,
  last_topup_tx   text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (handler_id)
);

create index if not exists llm_credits_handler_idx on llm_credits (handler_id);

-- Audit trail of every successful topup so the user can see what they paid
-- and so SAW can reconcile against Solana.
create table if not exists llm_credit_topups (
  id              uuid primary key default gen_random_uuid(),
  handler_id      uuid not null references handlers(id) on delete cascade,
  tx_signature    text not null unique,
  lamports        bigint not null,
  calls_credited  integer not null,
  created_at      timestamptz not null default now()
);

create index if not exists llm_credit_topups_handler_idx
  on llm_credit_topups (handler_id, created_at desc);

alter table llm_credits enable row level security;
alter table llm_credit_topups enable row level security;

drop policy if exists llm_credits_self on llm_credits;
create policy llm_credits_self on llm_credits
  for select using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));

drop policy if exists llm_credit_topups_self on llm_credit_topups;
create policy llm_credit_topups_self on llm_credit_topups
  for select using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));
