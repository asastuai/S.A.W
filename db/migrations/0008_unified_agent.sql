-- Unified agent model: 1 agent per handler, customizable codename.
-- Replaces the previous 3-persona model (greedie / conservador / estable).
--
-- We keep the old persona values valid (back-compat for any existing
-- rows) and add 'operative' as the new default. agent_name is the
-- user-facing codename, default 'Operative'.

alter table agents drop constraint if exists agents_persona_check;
alter table agents add constraint agents_persona_check
  check (persona in ('greedie', 'conservador', 'estable', 'operative'));

alter table agents
  add column if not exists agent_name text not null default 'Operative';

-- Optional: backfill agent_name for existing rows so they don't all
-- read "Operative" — preserve the persona's display name for legacy
-- multi-persona setups.
update agents
  set agent_name = case persona
    when 'greedie' then 'Greedie'
    when 'conservador' then 'Conservador'
    when 'estable' then 'Estable'
    else 'Operative'
  end
  where agent_name = 'Operative';
