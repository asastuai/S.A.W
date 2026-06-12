"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { Readout } from "@/components/terminal/readout";
import { Caret } from "@/components/terminal/caret";

// ── Types (mirrors API contract from Task 8) ──────────────────────────────────

type VenueStatus = {
  enabled: boolean;
  pubkey: string | null;
  floatBalanceUsdc: number | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function truncatePubkey(pk: string): string {
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 6)}…${pk.slice(-4)}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export function VenueCard({ agentId }: { agentId: string }) {
  const [venue, setVenue] = useState<VenueStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [enabling, setEnabling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchVenue = useCallback(async () => {
    try {
      const res = await fetch(`/api/agents/${agentId}/venue`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as VenueStatus;
      setVenue(json);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "fetch error");
    } finally {
      setLoading(false);
    }
  }, [agentId]);

  useEffect(() => {
    void fetchVenue();
    return () => {
      if (copyTimerRef.current != null) clearTimeout(copyTimerRef.current);
    };
  }, [fetchVenue]);

  async function handleEnable() {
    setEnabling(true);
    setError(null);
    try {
      const res = await fetch(`/api/agents/${agentId}/venue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      if (!res.ok) {
        const text = await res.text().catch(() => String(res.status));
        throw new Error(text || `HTTP ${res.status}`);
      }
      const json = (await res.json()) as { pubkey: string };
      setVenue({ enabled: true, pubkey: json.pubkey, floatBalanceUsdc: null });
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "enable failed");
    } finally {
      setEnabling(false);
    }
  }

  function handleCopy() {
    if (!venue?.pubkey) return;
    void navigator.clipboard.writeText(venue.pubkey).then(() => {
      setCopied(true);
      if (copyTimerRef.current != null) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopied(false), 1800);
    });
  }

  return (
    <TerminalPanel label="venue.adrena">
      {/* Header */}
      <div className="border-b border-ash px-4 py-3">
        <div className="font-mono text-xs text-gold flex items-center gap-2">
          <span className="select-none text-gold/60">$</span>
          saw venue <span className="text-bone/70">--status</span>
          {loading && <Caret />}
        </div>
        <p className="font-mono text-[10px] text-bone/40 mt-1 leading-relaxed">
          no api keys — the agent&apos;s wallet signs · perps via Adrena devnet/localnet
        </p>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">
        {error && (
          <div className="font-mono text-rust text-xs">
            <span className="text-rust/60">! </span>{error}
          </div>
        )}

        {!loading && venue && !venue.enabled && (
          <div className="space-y-3">
            <div className="font-mono text-xs text-bone/50">
              <span className="text-bone/30 mr-1">&gt;</span>
              venue not enabled · generate trading keypair to activate perps
            </div>

            {/* Value prop */}
            <div className="border border-ash/50 bg-smoke/40 px-3 py-2.5 text-[10px] font-mono leading-relaxed">
              <div className="text-gold/60 uppercase tracking-widest mb-1">
                <span className="text-gold/40">┤</span> how it works <span className="text-gold/40">├</span>
              </div>
              <div className="text-bone/60 space-y-1">
                <div><span className="text-gold/50">·</span> a dedicated trading keypair is generated server-side</div>
                <div><span className="text-gold/50">·</span> the private key never leaves the server — the wallet IS the credential</div>
                <div><span className="text-gold/50">·</span> the agent signs every on-chain perp instruction autonomously</div>
              </div>
            </div>

            <button
              onClick={handleEnable}
              disabled={enabling}
              data-testid="enable-venue-button"
              className="w-full font-mono text-xs uppercase tracking-widest border border-gold/60 text-gold hover:bg-gold hover:text-ink px-4 py-2.5 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {enabling ? (
                <span className="flex items-center justify-center gap-2">
                  <Caret /> enabling…
                </span>
              ) : (
                "▶ enable perps venue"
              )}
            </button>
          </div>
        )}

        {!loading && venue?.enabled && venue.pubkey && (
          <div className="space-y-3">
            {/* Status badge */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-[10px] uppercase tracking-widest border border-phosphor/50 text-phosphor px-1.5 py-0.5 bg-phosphor/10">
                ● active
              </span>
              <span className="font-mono text-xs text-bone/50">perps venue enabled</span>
            </div>

            {/* Pubkey */}
            <div className="border border-ash/60 bg-smoke/30 p-3 space-y-2">
              <div className="text-[10px] font-mono uppercase tracking-widest text-bone/40 mb-1">
                trading wallet
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <span
                  className="font-mono text-xs text-bone/80 break-all"
                  data-testid="venue-pubkey"
                >
                  {venue.pubkey}
                </span>
                <button
                  onClick={handleCopy}
                  className="shrink-0 font-mono text-[10px] uppercase tracking-widest border border-bone/30 text-bone/50 hover:text-gold hover:border-gold/60 px-2 py-0.5 transition"
                  title="Copy pubkey"
                  aria-label="Copy trading wallet pubkey"
                  data-testid="copy-pubkey-button"
                >
                  {copied ? "✓ copied" : "⎘ copy"}
                </button>
              </div>
              <p className="font-mono text-[10px] text-bone/30">
                no API keys — this wallet signs every instruction
              </p>
            </div>

            {/* Balance + funding hint */}
            <Readout
              items={[
                {
                  label: "float balance",
                  value:
                    venue.floatBalanceUsdc != null
                      ? `${venue.floatBalanceUsdc.toLocaleString(undefined, {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} USDC`
                      : "—",
                  tone: venue.floatBalanceUsdc != null && venue.floatBalanceUsdc > 0 ? "phosphor" : "bone",
                },
              ]}
            />

            <div className="font-mono text-[10px] text-bone/30 leading-relaxed border-t border-ash/30 pt-2">
              <span className="text-gold/40">·</span>{" "}
              devnet: use the Adrena faucet to fund · localnet: float is auto-funded by the harness
            </div>
          </div>
        )}

        {loading && (
          <div className="font-mono text-xs text-bone/40 py-2">
            <span className="text-bone/30 mr-1">&gt;</span>fetching venue status…
          </div>
        )}
      </div>
    </TerminalPanel>
  );
}
