-- Track which persona is active per Telegram chat, so /switch can
-- alternate between greedie/conservador/estable without changing the
-- web-side defaults.

alter table telegram_links
  add column if not exists active_persona text not null default 'greedie'
  check (active_persona in ('greedie', 'conservador', 'estable'));
