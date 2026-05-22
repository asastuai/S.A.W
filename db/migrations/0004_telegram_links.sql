-- Telegram bot linking: associate a Telegram chat_id with a handler.
-- A handler can have multiple linked chats (eg. desktop tg + phone tg).

create table if not exists telegram_links (
  id            uuid primary key default gen_random_uuid(),
  handler_id    uuid not null references handlers(id) on delete cascade,
  chat_id       bigint not null,
  username      text,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (chat_id)
);

create index telegram_links_handler_idx on telegram_links (handler_id);

-- Pairing tokens: short-lived codes the bot generates when user starts
-- /start in TG. The user clicks a deep link in the web that proves
-- ownership of their handler, and the link is upgraded to a real
-- telegram_links row.
create table if not exists telegram_pair_codes (
  code          text primary key,
  chat_id       bigint not null,
  username      text,
  created_at    timestamptz not null default now(),
  expires_at    timestamptz not null default (now() + interval '15 minutes'),
  consumed_at   timestamptz
);

alter table telegram_links enable row level security;
alter table telegram_pair_codes enable row level security;

create policy telegram_links_self on telegram_links
  for all using (handler_id in (
    select id from handlers where privy_user_id = auth.jwt() ->> 'sub'
  ));
-- pair_codes are accessed via service role only; no self policy needed
