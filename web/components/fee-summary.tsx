"use client";

import { useEffect, useState } from "react";

type FeeRow = {
  id: string;
  fee_kind: "swap" | "performance" | "aum";
  amount_lamports: number;
  created_at: string;
};

const KIND_LABEL: Record<string, string> = {
  swap: "Swap",
  performance: "Perf",
  aum: "AUM",
};

export function FeeSummary({
  agentId,
  getAccessToken,
  refreshKey,
}: {
  agentId: string;
  getAccessToken: () => Promise<string | null>;
  /** bump to trigger refetch */
  refreshKey?: any;
}) {
  const [fees, setFees] = useState<FeeRow[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch(`/api/agents/${agentId}/fees`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const { fees } = await res.json();
        if (!cancelled) setFees(fees ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentId, refreshKey]);

  if (fees.length === 0) return null;

  const totalLamports = fees.reduce((acc, f) => acc + f.amount_lamports, 0);
  const totalSol = totalLamports / 1_000_000_000;
  const byKind = fees.reduce<Record<string, number>>((acc, f) => {
    acc[f.fee_kind] = (acc[f.fee_kind] ?? 0) + f.amount_lamports;
    return acc;
  }, {});

  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 border border-bone/30 text-xs text-bone/70">
      <span className="uppercase tracking-widest text-bone/50">Fees</span>
      <span className="font-mono text-gold">{totalSol.toFixed(6)} SOL</span>
      <span className="text-bone/30">|</span>
      <span className="text-[10px] text-bone/40 normal-case">
        {Object.entries(byKind)
          .map(([k, v]) => `${KIND_LABEL[k]} ${(v / 1_000_000_000).toFixed(6)}`)
          .join(" · ")}
      </span>
    </div>
  );
}
