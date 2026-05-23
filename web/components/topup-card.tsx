"use client";

import { useEffect, useState } from "react";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { usePrivy } from "@privy-io/react-auth";
import { getTreasuryAddress, isTreasuryConfigured } from "@/lib/treasury";

type TopupStatus =
  | "idle"
  | "loading"
  | "signing"
  | "confirming"
  | "crediting"
  | "done"
  | "error";

type Balance = {
  balance_calls: number;
  total_paid_lamports: number;
  rate: { lamports: number; calls: number };
};

/**
 * Lets a handler buy SAW LLM credits by sending SOL to the treasury.
 * Only renders when the handler has no BYOK API key set and Privy is
 * authenticated. When they have credits, shows the balance and a
 * "top up more" button.
 */
export function TopupCard({
  hasApiKey,
  onCreditAdded,
}: {
  hasApiKey: boolean;
  onCreditAdded?: (newBalance: number) => void;
}) {
  const wallet = useWallet();
  const { connection } = useConnection();
  const { authenticated, getAccessToken } = usePrivy();
  const [status, setStatus] = useState<TopupStatus>("idle");
  const [message, setMessage] = useState("");
  const [balance, setBalance] = useState<Balance | null>(null);

  useEffect(() => {
    if (!authenticated) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await getAccessToken();
        if (!token) return;
        const res = await fetch("/api/topup", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setBalance(data);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authenticated, getAccessToken, status]);

  if (!authenticated) return null;
  if (!isTreasuryConfigured()) return null;
  // Hide entirely if user has a BYOK key AND no SAW credits — they
  // don't need this. Show if they have credits (for transparency) or
  // no key at all (to invite topup).
  if (hasApiKey && (!balance || balance.balance_calls === 0)) return null;

  const ratePerTopup =
    balance?.rate?.lamports ?? 10_000_000; // 0.01 SOL default
  const callsPerTopup = balance?.rate?.calls ?? 500;
  const ratePerSolDisplay = `${ratePerTopup / LAMPORTS_PER_SOL} SOL = ${callsPerTopup} calls`;

  async function buyCredits() {
    if (!wallet.publicKey || !wallet.signTransaction) {
      setStatus("error");
      setMessage("Connect Phantom first.");
      return;
    }
    try {
      setStatus("signing");
      setMessage("");

      const treasury = getTreasuryAddress();
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: wallet.publicKey,
          toPubkey: treasury,
          lamports: ratePerTopup,
        })
      );
      tx.feePayer = wallet.publicKey;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      const signed = await wallet.signTransaction(tx);
      setStatus("confirming");
      const sig = await connection.sendRawTransaction(signed.serialize());
      await connection.confirmTransaction(sig, "confirmed");

      setStatus("crediting");
      const token = await getAccessToken();
      if (!token) throw new Error("not authenticated");
      const res = await fetch("/api/topup", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ txSignature: sig }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "topup failed");

      setStatus("done");
      setMessage(`+${data.callsCredited} calls. Total: ${data.balance_calls}.`);
      onCreditAdded?.(data.balance_calls);
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message ?? String(e));
    }
  }

  const cur = balance?.balance_calls ?? 0;
  const hasBalance = cur > 0;
  const busy =
    status === "signing" ||
    status === "confirming" ||
    status === "crediting" ||
    status === "loading";
  const buttonLabel =
    status === "signing"
      ? "✍ Sign in Phantom…"
      : status === "confirming"
      ? "⏳ Confirming on-chain…"
      : status === "crediting"
      ? "📜 Crediting…"
      : hasBalance
      ? `Top up +${callsPerTopup} calls (${ratePerSolDisplay.split("=")[0].trim()})`
      : `Top up · ${ratePerSolDisplay}`;

  return (
    <div className="border border-gold/40 bg-gold/5 px-4 py-3 text-sm flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
      <div className="flex items-center gap-3">
        <span className="text-gold text-lg">⛽</span>
        <div>
          <div className="text-bone/80">
            {hasBalance ? (
              <>
                SAW credits: <strong className="text-gold">{cur} calls</strong>
              </>
            ) : hasApiKey ? (
              <>Out of SAW credits. Top up to keep using server-paid LLM.</>
            ) : (
              <>No API key? SAW puts an LLM for you — pay 0.01 SOL.</>
            )}
          </div>
          {message && status === "done" && (
            <div className="text-[11px] text-bone/50 mt-0.5">{message}</div>
          )}
          {message && status === "error" && (
            <div className="text-[11px] text-rust mt-0.5">{message}</div>
          )}
        </div>
      </div>
      <button
        onClick={buyCredits}
        disabled={busy || !wallet.connected}
        className="text-xs uppercase tracking-widest border border-gold text-gold px-4 py-2 hover:bg-gold hover:text-ink transition disabled:opacity-40 whitespace-nowrap"
      >
        {buttonLabel}
      </button>
    </div>
  );
}
