// Módulo PURO (sin IO) — misma interfaz que tendrá evaluate_policy on-chain
// en Fase 2 (patrón espejo, igual que sdk/src/policy.ts con UTC-day).
// El struct PerpPolicyParams se diseña fixed-size: futuro layout PolicyAccount.

export type PerpPolicyParams = {
  maxLeverage: number;
  maxMarginPerTx: number;        // USDC, unidades humanas
  dailyMarginBudget: number;     // USDC por día UTC
  allowedMarkets: string[];
  maxOpenPositions: number;
  requireStopLoss: boolean;
  approvalThresholdMargin: number;
};

export const DEFAULT_PERP_POLICY: PerpPolicyParams = {
  maxLeverage: 5, maxMarginPerTx: 500, dailyMarginBudget: 1000,
  allowedMarkets: ["SOL-PERP"], maxOpenPositions: 3,
  requireStopLoss: true, approvalThresholdMargin: 200,
};

export type PerpIntent = {
  market: string;
  side: "long" | "short";
  leverage: number;
  marginUsdc: number;
  stopLoss: number | null;
  takeProfit: number | null;
};

export type PolicyContext = {
  dailyMarginUsedUsdc: number;   // sum(perp_margin_usdc) done hoy UTC — lo trae el caller
  openPositions: number;
};

export type PolicyVerdict =
  | { verdict: "allowed" }
  | { verdict: "denied"; reason: string }
  | { verdict: "requires-approval"; reason: string };

// Orden de evaluación calcado del diseño H-2 (spec §PerpPolicy):
// market → leverage → margin/tx → budget diario → posiciones → stop → threshold
export function evaluatePerpPolicy(
  intent: PerpIntent, policy: PerpPolicyParams, ctx: PolicyContext
): PolicyVerdict {
  if (!policy.allowedMarkets.includes(intent.market))
    return { verdict: "denied", reason: `market ${intent.market} not in allowedMarkets` };
  if (intent.leverage > policy.maxLeverage)
    return { verdict: "denied", reason: `leverage x${intent.leverage} exceeds max x${policy.maxLeverage}` };
  if (intent.marginUsdc > policy.maxMarginPerTx)
    return { verdict: "denied", reason: `margin ${intent.marginUsdc} exceeds per-tx cap ${policy.maxMarginPerTx}` };
  if (ctx.dailyMarginUsedUsdc + intent.marginUsdc > policy.dailyMarginBudget)
    return { verdict: "denied", reason: `daily margin budget exhausted (${ctx.dailyMarginUsedUsdc}/${policy.dailyMarginBudget} used)` };
  if (ctx.openPositions >= policy.maxOpenPositions)
    return { verdict: "denied", reason: `maxOpenPositions (${policy.maxOpenPositions}) reached` };
  if (policy.requireStopLoss && intent.stopLoss == null)
    return { verdict: "denied", reason: "policy requires a stop-loss on every entry" };
  if (intent.marginUsdc > policy.approvalThresholdMargin)
    return { verdict: "requires-approval", reason: `margin ${intent.marginUsdc} > approval threshold ${policy.approvalThresholdMargin}` };
  return { verdict: "allowed" };
}

// Helper para derivar el userOrderId (u8 1..255) del uuid del item —
// idempotencia en Drift (spec §errores: clientOrderId determinístico).
export function deriveUserOrderId(itemUuid: string): number {
  let h = 0;
  for (const c of itemUuid) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return (h % 255) + 1;
}
