-- L-5 fix: dedupe Telegram update_id so retries don't double-process.
-- Telegram retries the webhook if our endpoint times out or returns 5xx.
-- Each retry pre-fix ran the full LLM call + appended 2 chat rows + spent
-- 1 credit. Track processed update_ids in a tiny table; skip on hit.

create table if not exists telegram_processed_updates (
  update_id   bigint primary key,
  chat_id     bigint not null,
  processed_at timestamptz not null default now()
);

create index if not exists telegram_processed_updates_chat_idx
  on telegram_processed_updates (chat_id, processed_at desc);

-- Helper: keep the table from growing forever. Could later be a cron
-- but for v1 we just prune anything older than 24h on each touch.
create or replace function prune_processed_updates() returns void
language sql security definer as $$
  delete from telegram_processed_updates where processed_at < now() - interval '24 hours';
$$;
