"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useHandler } from "@/lib/use-handler";

export default function ConnectTelegramPage() {
  const { authenticated, ready, login, getAccessToken } = usePrivy();
  const handlerState = useHandler();
  const [code, setCode] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "pairing" | "ok" | "error">("idle");
  const [message, setMessage] = useState<string>("");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const c = new URL(window.location.href).searchParams.get("code");
    setCode(c);
  }, []);

  async function pair() {
    if (!code) return;
    setStatus("pairing");
    try {
      const token = await getAccessToken();
      if (!token) throw new Error("not authenticated");
      const res = await fetch("/api/telegram/pair", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "pairing failed");
      setStatus("ok");
      setMessage(
        data.username
          ? `Linked @${data.username} → your handler. Open Telegram and message the bot.`
          : `Linked. Open Telegram and message the bot.`
      );
    } catch (e: any) {
      setStatus("error");
      setMessage(e.message ?? String(e));
    }
  }

  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-2xl mx-auto">
      <header className="flex items-center justify-between mb-12 border-b border-ash pb-4">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold">Demo</Link>
        </nav>
      </header>

      <p className="stamp mb-4">Telegram bot</p>
      <h1 className="font-display text-4xl mb-3">Link your chat.</h1>
      <p className="text-bone/60 mb-8">
        Pair this Telegram conversation with your SAW handler so the bot
        can talk to your agent on your behalf.
      </p>

      {!code && (
        <div className="border border-rust p-6">
          <p className="text-rust text-sm">
            No pair code in URL. Start in Telegram: send <code className="text-gold">/start</code> to the bot.
          </p>
        </div>
      )}

      {code && !authenticated && (
        <div className="border border-gold p-6 text-center">
          <p className="text-bone/70 mb-4 text-sm">
            Sign in first to prove you own this handler.
          </p>
          <button
            onClick={() => login()}
            disabled={!ready}
            className="bg-gold text-ink px-6 py-3 uppercase tracking-widest text-xs hover:bg-bone disabled:opacity-30"
          >
            {ready ? "Sign in" : "Loading…"}
          </button>
        </div>
      )}

      {code && authenticated && handlerState.status === "ready" && status === "idle" && (
        <div className="border border-gold p-6 text-center">
          <p className="text-bone/70 mb-2 text-sm">
            Linking pair code <code className="text-gold">{code.slice(0, 6)}…</code>
          </p>
          <p className="text-bone/40 text-xs mb-6">
            handler: {handlerState.handler.primary_wallet.slice(0, 4)}…{handlerState.handler.primary_wallet.slice(-4)}
          </p>
          <button
            onClick={pair}
            className="bg-gold text-ink px-8 py-3 uppercase tracking-widest text-sm hover:bg-bone"
          >
            Confirm link
          </button>
        </div>
      )}

      {status === "pairing" && (
        <p className="text-bone/60">Pairing…</p>
      )}
      {status === "ok" && (
        <div className="border border-gold p-6 text-center">
          <p className="text-gold uppercase tracking-widest text-xs mb-2">✓ Linked</p>
          <p className="text-bone/80 text-sm">{message}</p>
        </div>
      )}
      {status === "error" && (
        <div className="border border-rust p-6 text-center">
          <p className="text-rust uppercase tracking-widest text-xs mb-2">Failed</p>
          <p className="text-bone/80 text-sm">{message}</p>
        </div>
      )}
    </main>
  );
}
