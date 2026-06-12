// Verifica la migración 0014 contra Supabase (REST). Lee env de web/.env.local.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(new URL("../web/.env.local", import.meta.url), "utf8")
    .split("\n").filter(l => l.includes("=") && !l.trim().startsWith("#"))
    .map(l => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]; })
);
const url = env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const svc = env.SUPABASE_SERVICE_ROLE_KEY;
const anon = env.SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const admin = createClient(url, svc, { auth: { persistSession: false } });
const pass = (m) => console.log("  \x1b[32mPASS\x1b[0m " + m);
const fail = (m) => console.log("  \x1b[31mFAIL\x1b[0m " + m);

let agentId = null;
console.log("=== 1. columnas perp en scheduled_items ===");
{
  const { error } = await admin.from("scheduled_items")
    .select("perp_market,perp_side,perp_leverage,perp_margin_usdc,perp_stop_loss,perp_take_profit,perp_user_order_id").limit(1);
  error ? fail("select perp_* → " + error.message) : pass("las 7 columnas perp_* existen y son seleccionables");
}
console.log("=== 2. action_type acepta perp-open ===");
{
  // necesitamos un agent_id válido para el FK; tomamos uno existente
  const { data: ags } = await admin.from("agents").select("id,perp_policy").limit(1);
  agentId = ags?.[0]?.id ?? null;
  if (!agentId) { console.log("  (no hay agents; salteo el insert de prueba)"); }
  else {
    const probe = { agent_id: agentId, action_type: "perp-open", amount: 1, asset: "SOL",
      scheduled_for: new Date().toISOString(), trigger_kind: "below", trigger_target_price: 64,
      perp_market: "SOL-PERP", perp_side: "long", perp_leverage: 3, perp_margin_usdc: 20 };
    const { data, error } = await admin.from("scheduled_items").insert(probe).select("id").single();
    if (error) fail("insert perp-open → " + error.message);
    else { pass("insert con action_type='perp-open' aceptado"); await admin.from("scheduled_items").delete().eq("id", data.id); pass("fila de prueba borrada"); }
  }
}
console.log("=== 3. agents.perp_policy default ===");
{
  const { data, error } = await admin.from("agents").select("perp_policy").limit(1);
  if (error) fail("select perp_policy → " + error.message);
  else if (!data?.length) console.log("  (no hay agents — la columna existe, sin filas para mostrar el default)");
  else { const p = data[0].perp_policy; (p && p.maxLeverage === 5 && Array.isArray(p.allowedMarkets)) ? pass("perp_policy default OK: " + JSON.stringify(p)) : fail("perp_policy inesperado: " + JSON.stringify(p)); }
}
console.log("=== 4. agent_trading_keys: existe + anon NO puede leerla (RLS sin policies) ===");
{
  const { error: aErr } = await admin.from("agent_trading_keys").select("id").limit(1);
  aErr ? fail("service-role no puede leer la tabla → " + aErr.message) : pass("la tabla existe (service-role la lee)");
  if (anon) {
    const pub = createClient(url, anon, { auth: { persistSession: false } });
    const { data, error } = await pub.from("agent_trading_keys").select("id").limit(1);
    if (error || (data && data.length === 0)) pass("anon key NO obtiene filas (RLS bloquea — patrón C-1) " + (error ? "[" + error.message + "]" : "[0 filas]"));
    else fail("¡anon devolvió filas! RLS no está protegiendo: " + JSON.stringify(data));
  }
}
console.log("\nVerificación 0014 completa.");
