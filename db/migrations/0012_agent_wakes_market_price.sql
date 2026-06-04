-- 0012_agent_wakes_market_price.sql
--
-- Vision-notes follow-up: the Wake history feed promised "market context at
-- wake". The cron already fetches the SOL snapshot on every tick but threw it
-- away after checking triggers. This adds a column so each wake records the
-- price the agent actually saw, making the audit trail honest and replayable.
--
-- Safe to run multiple times.

alter table public.agent_wakes
  add column if not exists market_price numeric;

comment on column public.agent_wakes.market_price is
  'SOL/USD spot the agent observed at wake time (from the shared market snapshot). Null if the snapshot fetch failed or the wake was skipped outside active hours.';
