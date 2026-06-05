-- 0013_push_subscriptions.sql
--
-- Track 1 (Path to Real): closed-tab web push. Stores each browser's push
-- subscription per handler so the server (cron) can reach the user when the
-- tab is closed. Plus a per-item dedup flag so a "trigger ready" push fires
-- once, not on every 5-minute cron tick.
--
-- Safe to run multiple times.

create table if not exists public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  handler_id  uuid not null references public.handlers(id) on delete cascade,
  endpoint    text not null unique,
  p256dh      text not null,
  auth        text not null,
  user_agent  text,
  created_at  timestamptz not null default now()
);

create index if not exists push_subscriptions_handler_idx
  on public.push_subscriptions (handler_id);

-- Server-role only, like the rest of the schema (no client RLS path).
alter table public.push_subscriptions enable row level security;
revoke all on public.push_subscriptions from anon, authenticated;

-- Dedup: mark an item once we've pushed "trigger ready" so the cron doesn't
-- re-notify every tick while it waits for the browser to dispatch.
alter table public.scheduled_items
  add column if not exists push_notified boolean not null default false;

comment on table public.push_subscriptions is
  'Web Push subscriptions (VAPID) per handler/browser, for closed-tab agent alerts.';
comment on column public.scheduled_items.push_notified is
  'True once a "trigger ready" web push has been sent for this item (cron dedup).';
