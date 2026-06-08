import Link from "next/link";
import { Reveal } from "@/components/reveal";

export const metadata = {
  title: "SAW — Dashboard",
  description:
    "Live stats from the SAW network: active agents, opportunities surfaced, executions completed.",
};

export const dynamic = "force-dynamic";
export const revalidate = 60;

async function fetchStats() {
  // Call Supabase directly (server-side render); avoids a self-fetch loop.
  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const db = supabaseAdmin();
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const [handlers, activeAgents, wakes7d, itemsDone, opps, fees, credits] =
      await Promise.all([
        db.from("handlers").select("id", { count: "exact", head: true }),
        db.from("agents").select("id", { count: "exact", head: true }).eq("active", true),
        db.from("agent_wakes").select("id", { count: "exact", head: true }).gte("woke_at", since7d),
        db.from("scheduled_items").select("id", { count: "exact", head: true }).eq("status", "done"),
        db.from("opportunities").select("id", { count: "exact", head: true }),
        db.from("fee_ledger").select("amount_lamports, created_at"),
        db.from("llm_credits").select("balance_calls, total_paid_lamports"),
      ]);
    const totalFeeLamports = (fees.data ?? []).reduce(
      (acc: number, r: any) => acc + Number(r.amount_lamports ?? 0),
      0
    );
    const fees24hLamports = (fees.data ?? [])
      .filter((r: any) => new Date(r.created_at) > new Date(since24h))
      .reduce((acc: number, r: any) => acc + Number(r.amount_lamports ?? 0), 0);
    const creditsRemaining = (credits.data ?? []).reduce(
      (acc: number, r: any) => acc + Number(r.balance_calls ?? 0),
      0
    );
    const creditsTopupLamports = (credits.data ?? []).reduce(
      (acc: number, r: any) => acc + Number(r.total_paid_lamports ?? 0),
      0
    );
    return {
      handlers: handlers.count ?? 0,
      activeAgents: activeAgents.count ?? 0,
      wakes7d: wakes7d.count ?? 0,
      itemsExecuted: itemsDone.count ?? 0,
      opportunitiesSurfaced: opps.count ?? 0,
      totalFeesLamports: totalFeeLamports,
      fees24hLamports,
      creditsRemaining,
      creditsTopupLamports,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export default async function DashboardPage() {
  const stats = await fetchStats();
  const lamportsToSol = (l: number) => (l / 1_000_000_000).toFixed(6);

  return (
    <main className="relative min-h-screen bg-obsidian px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-16 border-b border-ash/70 pb-4">
        <Link
          href="/"
          className="font-display text-2xl tracking-[0.4em] uppercase text-bone hover:text-gold transition-colors"
        >
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold transition-colors">
            Demo
          </Link>
          <Link href="/dashboard" className="text-gold drop-shadow-gold">
            Dashboard
          </Link>
          <Link href="/treasury" className="hover:text-gold transition-colors">
            Treasury
          </Link>
          <a
            href="https://github.com/asastuai/S.A.W"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gold transition-colors"
          >
            GitHub
          </a>
        </nav>
      </header>

      {/* HERO — title-card readout */}
      <section className="relative mb-20">
        <div className="flex items-center gap-3 mb-6 animate-intro">
          <span
            className="h-2 w-2 rounded-full bg-goldlit animate-glow-pulse shadow-glow"
            aria-hidden
          />
          <p className="stamp">Public ledger · Devnet · Live telemetry</p>
        </div>
        <h1
          className="font-display uppercase text-5xl sm:text-7xl md:text-8xl leading-[0.92] tracking-cinema text-bone animate-intro"
          style={{ animationDelay: "120ms" }}
        >
          SAW in
          <br />
          <span className="text-goldlit text-glow drop-shadow-gold-lg">
            numbers.
          </span>
        </h1>
        <p
          className="mt-8 max-w-2xl text-bone/55 leading-relaxed animate-intro"
          style={{ animationDelay: "240ms" }}
        >
          Live, anonymized aggregate of every agent on the network. Aggregated
          from{" "}
          <code className="font-mono text-gold">agent_wakes</code>,{" "}
          <code className="font-mono text-gold">scheduled_items</code>,{" "}
          <code className="font-mono text-gold">opportunities</code>, and{" "}
          <code className="font-mono text-gold">fee_ledger</code>. No handler is
          ever named.
        </p>
      </section>

      {stats ? (
        <>
          <Reveal className="mb-6">
            <div className="flex items-center gap-4">
              <span className="font-display uppercase text-lg tracking-[0.25em] text-bone/70">
                Network telemetry
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-ash/80 to-transparent" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone/30">
                01 — primary
              </span>
            </div>
          </Reveal>
          <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-px bg-ash/40 border border-ash/40 mb-16">
            <Reveal delay={0} className="h-full">
              <Card
                index="00"
                label="Handlers"
                value={String(stats.handlers ?? 0)}
                hint="unique sign-ins to date"
              />
            </Reveal>
            <Reveal delay={80} className="h-full">
              <Card
                index="01"
                label="Active operatives"
                value={String(stats.activeAgents ?? 0)}
                hint="auto-wake enabled"
                live
              />
            </Reveal>
            <Reveal delay={160} className="h-full">
              <Card
                index="02"
                label="Wakes · 7d"
                value={String(stats.wakes7d ?? 0)}
                hint="cron + manual"
              />
            </Reveal>
            <Reveal delay={240} className="h-full">
              <Card
                index="03"
                label="Items executed"
                value={String(stats.itemsExecuted ?? 0)}
                hint="browser-dispatched · SOL leg on-chain"
              />
            </Reveal>
          </section>

          <Reveal className="mb-6">
            <div className="flex items-center gap-4">
              <span className="font-display uppercase text-lg tracking-[0.25em] text-bone/70">
                Yield &amp; flow
              </span>
              <span className="h-px flex-1 bg-gradient-to-r from-ash/80 to-transparent" />
              <span className="font-mono text-[10px] uppercase tracking-widest text-bone/30">
                02 — economics
              </span>
            </div>
          </Reveal>
          <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-ash/40 border border-ash/40 mb-16">
            <Reveal delay={0} className="h-full">
              <Card
                index="04"
                label="Opportunities surfaced"
                value={String(stats.opportunitiesSurfaced ?? 0)}
                hint="proactive scans → cards"
              />
            </Reveal>
            <Reveal delay={80} className="h-full">
              <Card
                index="05"
                label="Total fees · all time"
                value={`${lamportsToSol(stats.totalFeesLamports ?? 0)} SOL`}
                hint={`${lamportsToSol(stats.fees24hLamports ?? 0)} SOL in last 24h`}
                emphasis
              />
            </Reveal>
            <Reveal delay={160} className="h-full">
              <Card
                index="06"
                label="SAW credits sold"
                value={`${lamportsToSol(stats.creditsTopupLamports ?? 0)} SOL`}
                hint={`${stats.creditsRemaining ?? 0} calls still unused`}
              />
            </Reveal>
          </section>
        </>
      ) : (
        <Reveal>
          <section className="relative border border-rust/40 bg-ink/40 p-6 mb-16">
            <p className="stamp mb-3 text-rust">Signal lost</p>
            <p className="text-bone/60 text-sm">
              Stats endpoint unavailable. Try refreshing in a few seconds.
            </p>
          </section>
        </Reveal>
      )}

      <Reveal>
        <section className="relative border border-ash/60 bg-ink/40 p-6 sm:p-8 mb-16 overflow-hidden">
          <span
            className="pointer-events-none absolute inset-y-0 left-0 w-px bg-gradient-to-b from-gold/60 via-gold/10 to-transparent"
            aria-hidden
          />
          <p className="stamp mb-5">Methodology</p>
          <p className="text-bone/70 text-sm leading-relaxed mb-4 max-w-3xl">
            Numbers update at most once per minute (cache). Each agent runs on a
            cron-based wake cycle (default 1h, configurable) — see{" "}
            <a
              href="https://github.com/asastuai/S.A.W/blob/main/docs/architecture.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:text-goldlit hover:underline transition-colors"
            >
              architecture docs
            </a>
            .
          </p>
          <p className="text-bone/45 text-xs leading-relaxed max-w-3xl">
            Fees: 55 bps on agent-executed swaps (devnet mock leg), collected
            today. The 5% net-weekly-PnL and 1% APY AUM lines are modeled and
            land when portfolio accounting ships. See{" "}
            <a
              href="https://github.com/asastuai/S.A.W/blob/main/docs/fee-model.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:text-goldlit hover:underline transition-colors"
            >
              fee model
            </a>
            .
          </p>
        </section>
      </Reveal>

      <footer className="flex items-center gap-3 border-t border-ash/40 pt-5 font-mono text-[11px] uppercase tracking-widest text-bone/40">
        <span className="text-gold/70">●</span>
        Devnet · v1 build in progress
        {stats?.updatedAt && (
          <>
            <span className="text-bone/20">·</span>
            <span>updated {new Date(stats.updatedAt).toLocaleTimeString()}</span>
          </>
        )}
      </footer>
    </main>
  );
}

function Card({
  index,
  label,
  value,
  hint,
  live = false,
  emphasis = false,
}: {
  index: string;
  label: string;
  value: string;
  hint: string;
  live?: boolean;
  emphasis?: boolean;
}) {
  return (
    <div className="group relative h-full bg-obsidian p-6 transition-colors hover:bg-ink/60">
      {/* corner index — classified telemetry tag */}
      <span className="absolute top-4 right-5 font-mono text-[10px] tracking-widest text-bone/25">
        {index}
      </span>
      <div className="flex items-center gap-2 mb-4">
        {live && (
          <span
            className="h-1.5 w-1.5 rounded-full bg-goldlit shadow-glow animate-glow-pulse"
            aria-hidden
          />
        )}
        <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-bone/45">
          {label}
        </div>
      </div>
      <div
        className={`font-display text-4xl sm:text-5xl tracking-cinema mb-2 ${
          emphasis
            ? "text-goldlit text-glow drop-shadow-gold-lg"
            : "text-gold drop-shadow-gold group-hover:text-goldlit"
        } transition-colors`}
      >
        {value}
      </div>
      <div className="text-xs text-bone/50">{hint}</div>
      {/* baseline hairline that lights on hover */}
      <span
        className="pointer-events-none absolute bottom-0 left-0 h-px w-0 bg-gold/60 transition-all duration-500 group-hover:w-full"
        aria-hidden
      />
    </div>
  );
}
