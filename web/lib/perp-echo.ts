// web/lib/perp-echo.ts — Task 6: structured echo builder for perp proposals.
// Pure formatting module — no IO. buildPerpEcho RECEIVES estLiqPrice from
// the caller (computed as entry*(1-1/lev) for long, entry*(1+1/lev) for short
// using the current market snapshot price). It does NOT compute liq itself.
import type { PerpIntent } from "./perp-policy";
import type { PolicyVerdict } from "./perp-policy";

export type PerpTrigger =
  | { kind: "time" }
  | { kind: "below"; asset?: string; price: number }
  | { kind: "above"; asset?: string; price: number }
  | { kind: "dip"; basisPrice: number; dropPct: number };

export type PerpEchoInput = {
  intent: PerpIntent;
  trigger: PerpTrigger;
  estLiqPrice: number | null;
  verdict: PolicyVerdict;
};

/**
 * buildPerpEcho — formats a 3-line structured echo for a perp proposal.
 *
 * Line 1: LONG|SHORT {market} ×{lev} · margin {n} USDC
 * Line 2: entrada: {trigger} · SL ${n} · TP ${n} · liq est. ~${n} | —
 * Line 3: policy: ✓ ok | policy: ⚠ {reason} → requiere tu aprobación
 */
export function buildPerpEcho(input: PerpEchoInput): string {
  const { intent, trigger, estLiqPrice, verdict } = input;

  // Line 1
  const line1 = `${intent.side.toUpperCase()} ${intent.market} ×${intent.leverage} · margin ${intent.marginUsdc} USDC`;

  // Line 2 — trigger part
  let entryPart: string;
  if (trigger.kind === "time") {
    entryPart = "entrada: inmediata";
  } else if (trigger.kind === "below") {
    const asset = trigger.asset ?? intent.market.replace("-PERP", "");
    entryPart = `entrada: ${asset} ≤ $${trigger.price.toFixed(2)}`;
  } else if (trigger.kind === "above") {
    const asset = trigger.asset ?? intent.market.replace("-PERP", "");
    entryPart = `entrada: ${asset} ≥ $${trigger.price.toFixed(2)}`;
  } else {
    // dip
    entryPart = `entrada: dip −${trigger.dropPct}%`;
  }

  // SL / TP parts
  const slPart = intent.stopLoss != null ? ` · SL $${intent.stopLoss.toFixed(2)}` : "";
  const tpPart = intent.takeProfit != null ? ` · TP $${intent.takeProfit.toFixed(2)}` : "";
  const liqPart = estLiqPrice != null
    ? ` · liq est. ~$${estLiqPrice.toFixed(2)}`
    : ` · liq est. —`;

  const line2 = `${entryPart}${slPart}${tpPart}${liqPart}`;

  // Line 3 — policy verdict
  let line3: string;
  if (verdict.verdict === "allowed") {
    line3 = "policy: ✓ ok";
  } else if (verdict.verdict === "requires-approval") {
    line3 = `policy: ⚠ ${verdict.reason} → requiere tu aprobación`;
  } else {
    // denied — shouldn't normally appear in echo (caller guards against this),
    // but format defensively so the LLM has something to show.
    line3 = `policy: ✗ denegado — ${verdict.reason}`;
  }

  return [line1, line2, line3].join("\n");
}
