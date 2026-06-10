"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePrivy } from "@privy-io/react-auth";
import { useHandler } from "@/lib/use-handler";
import { Reveal } from "@/components/reveal";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { Readout } from "@/components/terminal/readout";
import { CommandLine } from "@/components/terminal/command-line";
import { Caret } from "@/components/terminal/caret";

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
    <main className="relative min-h-screen bg-obsidian px-4 sm:px-6 py-8">
      {/* Top corner registration marks — title-card framing */}
      <div className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l border-t border-gold/30 sm:left-6 sm:top-6" />
      <div className="pointer-events-none absolute right-3 top-3 h-5 w-5 border-r border-t border-gold/30 sm:right-6 sm:top-6" />

      <div className="mx-auto max-w-3xl">
        <header className="mb-14 flex items-center justify-between border-b border-ash pb-4">
          <Link
            href="/"
            className="font-display text-2xl uppercase tracking-[0.45em] text-bone transition-colors hover:text-gold"
            style={{ animationDelay: "0ms" }}
          >
            S A W
          </Link>
          <nav className="flex gap-6 font-mono text-[0.7rem] uppercase tracking-[0.25em] text-bone/50">
            <Link href="/demo" className="transition-colors hover:text-goldlit">
              Demo
            </Link>
          </nav>
        </header>

        {/* ABOVE THE FOLD — secure-channel handshake title card */}
        <section className="relative mb-14">
          {/* Faint gold corona behind the title block */}
          <div
            className="pointer-events-none absolute -inset-x-8 -top-10 h-48 bg-[radial-gradient(60%_120%_at_15%_0%,rgba(201,169,110,0.10),transparent_70%)]"
            aria-hidden
          />

          <div className="relative">
            <p
              className="stamp mb-6 animate-intro inline-flex items-center gap-3 border border-gold/40 px-3 py-1.5 text-gold"
              style={{ animationDelay: "60ms" }}
            >
              <span className="inline-block h-1.5 w-1.5 animate-glow-pulse rounded-full bg-phosphor" />
              Telegram bot
            </p>

            <div
              className="animate-intro mb-5"
              style={{ animationDelay: "90ms" }}
            >
              <CommandLine>
                saw pair telegram{" "}
                <span className="text-gold/80">--channel</span> secure
              </CommandLine>
            </div>

            <h1
              className="animate-intro font-display text-4xl uppercase leading-[0.92] tracking-cinema text-bone sm:text-6xl md:text-7xl"
              style={{ animationDelay: "120ms" }}
            >
              Link your
              <br />
              <span className="text-goldlit text-glow drop-shadow-gold-lg">chat</span>
              <Caret className="ml-2 align-baseline" />
            </h1>

            <p
              className="animate-intro mt-7 max-w-xl text-base leading-relaxed font-mono text-bone/60"
              style={{ animationDelay: "220ms" }}
            >
              Pair this Telegram conversation with your SAW handler so the bot
              can talk to your agent on your behalf.
            </p>

            {/* Classified channel meta strip */}
            <Readout
              className="animate-intro mt-8 border-t border-ash pt-4"
              items={[
                { label: "channel", value: "secure", tone: "gold" },
                { label: "proto", value: "handshake" },
                { label: "link", value: "operative ↔ handler", tone: "phosphor" },
              ]}
            />
          </div>
        </section>

        {/* PAIRING FLOW — the handshake terminal */}
        <Reveal delay={80}>
          {!code && (
            <TerminalPanel label="no_channel" className="border-rust/50">
              <div className="relative overflow-hidden border-l-2 border-rust p-6 sm:p-7">
                <p className="mb-3 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-rust/80">
                  No channel
                </p>
                <p className="text-sm leading-relaxed font-mono text-bone/70">
                  No pair code in URL. Start in Telegram: send{" "}
                  <code className="rounded-sm bg-smoke px-1.5 py-0.5 font-mono text-gold">
                    /start
                  </code>{" "}
                  to the bot.
                </p>
              </div>
            </TerminalPanel>
          )}

          {code && !authenticated && (
            <TerminalPanel label="step_01 // identity" className="border-gold/40 shadow-glow">
              <div className="group relative overflow-hidden p-7 transition-shadow sm:p-9">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_60%_at_50%_0%,rgba(240,180,41,0.07),transparent_70%)]"
                  aria-hidden
                />
                <div className="relative">
                  <p className="mb-2 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-gold/70">
                    Step 01 // Identity
                  </p>
                  <p className="mb-7 max-w-md text-base leading-relaxed font-mono text-bone/75">
                    Sign in first to prove you own this handler.
                  </p>
                  <button
                    onClick={() => login()}
                    disabled={!ready}
                    className="group/btn relative inline-flex items-center gap-3 bg-gold px-7 py-3.5 font-mono text-xs uppercase tracking-[0.3em] text-ink shadow-glow transition-all hover:bg-goldlit hover:shadow-glow-lg disabled:opacity-30 disabled:shadow-none"
                  >
                    {ready ? "Sign in" : "Loading…"}
                    {ready && (
                      <span className="transition-transform group-hover/btn:translate-x-1">
                        →
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </TerminalPanel>
          )}

          {code && authenticated && handlerState.status === "ready" && status === "idle" && (
            <TerminalPanel label="step_02 // handshake" className="border-gold/50 shadow-glow">
              <div className="group relative overflow-hidden p-7 transition-shadow sm:p-9">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(80%_70%_at_50%_0%,rgba(240,180,41,0.09),transparent_70%)]"
                  aria-hidden
                />
                <div className="relative">
                  <p className="mb-5 font-mono text-[0.65rem] uppercase tracking-[0.3em] text-gold/70">
                    Step 02 // Confirm handshake
                  </p>

                  {/* On-chain / classified data rows — mono */}
                  <dl className="mb-8 space-y-3 border-y border-ash py-5">
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-bone/35">
                        Pair code
                      </dt>
                      <dd className="font-mono text-sm tracking-wider text-goldlit text-glow">
                        {code.slice(0, 6)}…
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-4">
                      <dt className="font-mono text-[0.6rem] uppercase tracking-[0.3em] text-bone/35">
                        Handler
                      </dt>
                      <dd className="font-mono text-sm tracking-wider text-bone/70">
                        {handlerState.handler.primary_wallet.slice(0, 4)}…
                        {handlerState.handler.primary_wallet.slice(-4)}
                      </dd>
                    </div>
                  </dl>

                  <button
                    onClick={pair}
                    className="group/btn relative inline-flex w-full items-center justify-center gap-3 bg-gold px-8 py-4 font-mono text-sm uppercase tracking-[0.3em] text-ink shadow-glow-lg animate-glow-pulse transition-all hover:bg-goldlit sm:w-auto"
                  >
                    Confirm link
                    <span className="transition-transform group-hover/btn:translate-x-1">
                      →
                    </span>
                  </button>
                </div>
              </div>
            </TerminalPanel>
          )}

          {status === "pairing" && (
            <div className="flex items-center gap-4 border-l-2 border-gold/50 bg-ink/40 p-6 font-mono">
              <span className="inline-flex gap-1.5">
                <span className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-phosphor" />
                <span
                  className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-phosphor"
                  style={{ animationDelay: "200ms" }}
                />
                <span
                  className="h-1.5 w-1.5 animate-glow-pulse rounded-full bg-phosphor"
                  style={{ animationDelay: "400ms" }}
                />
              </span>
              <p className="font-mono text-xs uppercase tracking-[0.3em] text-bone/60">
                &gt; pairing…
              </p>
            </div>
          )}

          {status === "ok" && (
            <TerminalPanel label="linked" className="border-gold/60 shadow-glow-lg">
              <div className="relative overflow-hidden p-7 sm:p-9">
                <div
                  className="pointer-events-none absolute inset-0 bg-[radial-gradient(90%_80%_at_50%_0%,rgba(240,180,41,0.12),transparent_70%)]"
                  aria-hidden
                />
                <div className="relative">
                  <p className="mb-3 flex items-center gap-2 font-mono text-xs uppercase tracking-[0.3em] text-phosphor text-glow">
                    <span>●</span> Linked · ok
                  </p>
                  <p className="text-base leading-relaxed font-mono text-bone/85">{message}</p>
                </div>
              </div>
            </TerminalPanel>
          )}

          {status === "error" && (
            <TerminalPanel label="failed" className="border-rust/50">
              <div className="relative overflow-hidden border-l-2 border-rust p-7 sm:p-9">
                <p className="mb-3 font-mono text-xs uppercase tracking-[0.3em] text-rust">
                  Failed
                </p>
                <p className="text-base leading-relaxed font-mono text-bone/85">{message}</p>
              </div>
            </TerminalPanel>
          )}
        </Reveal>
      </div>
    </main>
  );
}
