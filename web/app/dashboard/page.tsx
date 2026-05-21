import Link from "next/link";

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
    const [handlers, activeAgents, wakes7d, itemsDone, opps, fees] = await Promise.all([
      db.from("handlers").select("id", { count: "exact", head: true }),
      db.from("agents").select("id", { count: "exact", head: true }).eq("active", true),
      db.from("agent_wakes").select("id", { count: "exact", head: true }).gte("woke_at", since7d),
      db.from("scheduled_items").select("id", { count: "exact", head: true }).eq("status", "done"),
      db.from("opportunities").select("id", { count: "exact", head: true }),
      db.from("fee_ledger").select("amount_lamports, created_at"),
    ]);
    const totalFeeLamports = (fees.data ?? []).reduce(
      (acc: number, r: any) => acc + Number(r.amount_lamports ?? 0),
      0
    );
    const fees24hLamports = (fees.data ?? [])
      .filter((r: any) => new Date(r.created_at) > new Date(since24h))
      .reduce((acc: number, r: any) => acc + Number(r.amount_lamports ?? 0), 0);
    return {
      handlers: handlers.count ?? 0,
      activeAgents: activeAgents.count ?? 0,
      wakes7d: wakes7d.count ?? 0,
      itemsExecuted: itemsDone.count ?? 0,
      opportunitiesSurfaced: opps.count ?? 0,
      totalFeesLamports: totalFeeLamports,
      fees24hLamports,
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
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-6xl mx-auto">
      <header className="flex items-center justify-between mb-12 border-b border-ash pb-4">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold">
            Demo
          </Link>
          <Link href="/dashboard" className="text-gold">
            Dashboard
          </Link>
          <a
            href="https://github.com/asastuai/S.A.W"
            target="_blank"
            rel="noreferrer"
            className="hover:text-gold"
          >
            GitHub
          </a>
        </nav>
      </header>

      <p className="stamp mb-4">Public ledger · Devnet</p>
      <h1 className="font-display text-4xl sm:text-5xl mb-3">SAW in numbers.</h1>
      <p className="text-bone/60 max-w-2xl mb-12">
        Live, anonymized aggregate of every agent on the network. Aggregated
        from{" "}
        <code className="text-gold">agent_wakes</code>,{" "}
        <code className="text-gold">scheduled_items</code>,{" "}
        <code className="text-gold">opportunities</code>, and{" "}
        <code className="text-gold">fee_ledger</code>. No handler is ever named.
      </p>

      {stats ? (
        <>
          <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
            <Card
              label="Handlers"
              value={String(stats.handlers ?? 0)}
              hint="unique sign-ins to date"
            />
            <Card
              label="Active agents"
              value={String(stats.activeAgents ?? 0)}
              hint="currently enabled"
            />
            <Card
              label="Wakes · 7d"
              value={String(stats.wakes7d ?? 0)}
              hint="cron + manual"
            />
            <Card
              label="Items executed"
              value={String(stats.itemsExecuted ?? 0)}
              hint="on-chain confirmed"
            />
          </section>

          <section className="grid sm:grid-cols-2 gap-4 mb-12">
            <Card
              label="Opportunities surfaced"
              value={String(stats.opportunitiesSurfaced ?? 0)}
              hint="proactive scans → cards"
            />
            <Card
              label="Total fees · all time"
              value={`${lamportsToSol(stats.totalFeesLamports ?? 0)} SOL`}
              hint={`${lamportsToSol(stats.fees24hLamports ?? 0)} SOL in last 24h`}
            />
          </section>
        </>
      ) : (
        <section className="border border-ash p-6 mb-12">
          <p className="text-bone/60 text-sm">
            Stats endpoint unavailable. Try refreshing in a few seconds.
          </p>
        </section>
      )}

      <section className="border border-ash p-6 mb-12">
        <p className="stamp mb-4">Methodology</p>
        <p className="text-bone/70 text-sm leading-relaxed mb-3">
          Numbers update at most once per minute (cache). Each agent runs on a
          cron-based wake cycle (default 1h, configurable) — see{" "}
          <a
            href="https://github.com/asastuai/S.A.W/blob/main/docs/architecture.md"
            target="_blank"
            rel="noreferrer"
            className="text-gold hover:underline"
          >
            architecture docs
          </a>
          .
        </p>
        <p className="text-bone/50 text-xs">
          Fees: 55 bps on agent-executed swaps (devnet mock leg) · 5% on net
          weekly PnL · 1% APY AUM on active days. See{" "}
          <a
            href="https://github.com/asastuai/S.A.W/blob/main/docs/fee-model.md"
            target="_blank"
            rel="noreferrer"
            className="text-gold hover:underline"
          >
            fee model
          </a>
          .
        </p>
      </section>

      <footer className="text-bone/40 text-xs">
        Devnet · v1 build in progress ·{" "}
        {stats?.updatedAt && (
          <>updated {new Date(stats.updatedAt).toLocaleTimeString()}</>
        )}
      </footer>
    </main>
  );
}

function Card({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="border border-ash p-5">
      <div className="text-xs uppercase tracking-widest text-bone/40 mb-2">
        {label}
      </div>
      <div className="font-display text-4xl text-gold mb-1">{value}</div>
      <div className="text-xs text-bone/50">{hint}</div>
    </div>
  );
}
