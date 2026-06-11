-- 0014_perps.sql — perps Phase 1 (spec 2026-06-11)
-- ── scheduled_items: nuevos action types + descriptor perp ──
alter table scheduled_items drop constraint if exists scheduled_items_action_type_check;
alter table scheduled_items add constraint scheduled_items_action_type_check
  check (action_type in ('pay', 'swap', 'perp-open', 'perp-close'));

alter table scheduled_items
  add column if not exists perp_market        text,     -- "SOL-PERP"
  add column if not exists perp_side          text check (perp_side in ('long','short')),
  add column if not exists perp_leverage      numeric,  -- 4 = x4
  add column if not exists perp_margin_usdc   numeric,  -- unidades humanas (300 = 300 USDC)
  add column if not exists perp_stop_loss     numeric,  -- precio, null si no
  add column if not exists perp_take_profit   numeric,
  add column if not exists perp_user_order_id smallint; -- u8 derivado del uuid (idempotencia Drift)

-- ── perp policy por agente (Fase 1 off-chain; Fase 2 migra on-chain) ──
alter table agents add column if not exists perp_policy jsonb not null default
  '{"maxLeverage":5,"maxMarginPerTx":500,"dailyMarginBudget":1000,"allowedMarkets":["SOL-PERP"],"maxOpenPositions":3,"requireStopLoss":true,"approvalThresholdMargin":200}';

-- ── trading key del agente (localnet/devnet float) — mismo patrón AES-GCM que byok_keys ──
create table if not exists agent_trading_keys (
  id          uuid primary key default gen_random_uuid(),
  agent_id    uuid not null unique references agents(id) on delete cascade,
  pubkey      text not null,
  ciphertext  text not null,  -- base64 AES-GCM del secretKey (64 bytes base58)
  iv          text not null,  -- base64 IV
  created_at  timestamptz not null default now()
);
alter table agent_trading_keys enable row level security;
-- Sin policies: solo service-role accede (igual que el fix C-1 de la auditoría v1.5 —
-- NUNCA grants a anon/authenticated sobre esta tabla).
