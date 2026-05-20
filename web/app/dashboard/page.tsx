import Link from "next/link";

export const metadata = {
  title: "SAW — Dashboard",
  description:
    "Live stats from the SAW network: active agents, opportunities surfaced, executions completed.",
};

export default function DashboardPage() {
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

      <p className="stamp mb-4">Public ledger</p>
      <h1 className="font-display text-4xl sm:text-5xl mb-3">SAW in numbers.</h1>
      <p className="text-bone/60 max-w-2xl mb-12">
        Live, anonymized aggregate of every agent on the network. Updated every
        five minutes. No handler is ever named.
      </p>

      <section className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-16">
        <Card label="Active agents" value="—" hint="across all handlers" />
        <Card label="Wakes this week" value="—" hint="cron + manual" />
        <Card label="Opportunities surfaced" value="—" hint="proactive scans → cards" />
        <Card label="Items executed" value="—" hint="on-chain confirmed" />
      </section>

      <section className="border border-ash p-6 mb-12">
        <p className="stamp mb-4">Coming online</p>
        <p className="text-bone/70 text-sm leading-relaxed mb-3">
          The dashboard goes live as part of Phase 4 of the SAW v1 roadmap.
          Stats are computed from the public <code>agent_wakes</code>,{" "}
          <code>scheduled_items</code>, and <code>opportunities</code> tables
          (handler identities are never exposed; only aggregates).
        </p>
        <p className="text-bone/50 text-xs">
          Roadmap:{" "}
          <a
            href="https://github.com/asastuai/S.A.W/blob/main/ROADMAP.md"
            target="_blank"
            rel="noreferrer"
            className="text-gold hover:underline"
          >
            ROADMAP.md
          </a>
        </p>
      </section>

      <footer className="text-bone/40 text-xs">
        Devnet · v1 build in progress · Cron-based agents · BYOK
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
