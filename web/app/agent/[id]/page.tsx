import Link from "next/link";
import { notFound } from "next/navigation";
import { Connection, PublicKey } from "@solana/web3.js";
import { Reveal } from "@/components/reveal";

export const dynamic = "force-dynamic";
export const revalidate = 30;

const PERSONA_LABEL: Record<string, { name: string; role: string; glyph: string }> = {
  // operative is the unified v1.3 agent (the only one new setups create);
  // the three legacy persona ids are kept for back-compat with old rows.
  operative: { name: "Operative", role: "Unified Agent", glyph: "◉" },
  greedie: { name: "Greedie", role: "Degen Operative", glyph: "◆" },
  conservador: { name: "Conservador", role: "Yield Researcher", glyph: "▣" },
  estable: { name: "Estable", role: "Wealth Coach", glyph: "○" },
};

async function fetchAgentSnapshot(id: string) {
  try {
    const { supabaseAdmin } = await import("@/lib/supabase");
    const db = supabaseAdmin();

    const { data: agent } = await db
      .from("agents")
      .select(
        "id, persona, agent_pubkey, wallet_pda, created_at, last_wake_at, cron_cadence_minutes, active"
      )
      .eq("id", id)
      .maybeSingle();
    if (!agent) return null;

    const [wakes, items, opps, fees] = await Promise.all([
      db
        .from("agent_wakes")
        .select("id", { count: "exact", head: true })
        .eq("agent_id", id),
      db
        .from("scheduled_items")
        .select("id, status", { count: "exact" })
        .eq("agent_id", id),
      db
        .from("opportunities")
        .select("id, status", { count: "exact" })
        .eq("agent_id", id),
      db
        .from("fee_ledger")
        .select("amount_lamports")
        .eq("agent_id", id),
    ]);

    const totalFees = (fees.data ?? []).reduce(
      (acc, f: any) => acc + Number(f.amount_lamports ?? 0),
      0
    );
    const itemsDone = (items.data ?? []).filter((i: any) => i.status === "done").length;
    const oppsAccepted = (opps.data ?? []).filter((o: any) => o.status === "accepted").length;

    // Live SOL balance of the agent keypair
    let balanceSol = 0;
    try {
      const rpc =
        process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
      const conn = new Connection(rpc, "confirmed");
      const lamports = await conn.getBalance(new PublicKey(agent.agent_pubkey));
      balanceSol = lamports / 1_000_000_000;
    } catch {}

    return {
      agent,
      stats: {
        wakes: wakes.count ?? 0,
        itemsTotal: items.count ?? 0,
        itemsDone,
        opportunitiesProposed: opps.count ?? 0,
        oppsAccepted,
        totalFeesLamports: totalFees,
        agentBalanceSol: balanceSol,
      },
    };
  } catch {
    return null;
  }
}

export default async function AgentProfilePage({
  params,
}: {
  params: { id: string };
}) {
  const snap = await fetchAgentSnapshot(params.id);
  if (!snap) notFound();

  const { agent, stats } = snap;
  const meta = PERSONA_LABEL[agent.persona] ?? {
    name: agent.persona,
    role: "Agent",
    glyph: "·",
  };

  return (
    <main className="relative min-h-screen bg-obsidian px-4 sm:px-6 py-8 max-w-5xl mx-auto overflow-hidden">
      <header className="flex items-center justify-between mb-16 border-b border-ash/60 pb-4">
        <Link
          href="/"
          className="font-display text-2xl tracking-[0.35em] uppercase hover:text-gold transition-colors"
        >
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold transition-colors">Demo</Link>
          <Link href="/dashboard" className="hover:text-gold transition-colors">Dashboard</Link>
          <Link href="/treasury" className="hover:text-gold transition-colors">Treasury</Link>
        </nav>
      </header>

      {/* DOSSIER HEADER — case-file title card */}
      <section className="relative mb-16">
        {/* Oversized phantom glyph watermark, layered behind the title */}
        <span
          aria-hidden
          className="pointer-events-none select-none absolute -top-16 right-0 sm:-right-4 font-display text-[10rem] sm:text-[16rem] leading-none text-gold/5 drop-shadow-gold-lg animate-glow-pulse"
        >
          {meta.glyph}
        </span>

        <div className="relative">
          <div className="flex flex-wrap items-center gap-3 mb-6 animate-intro">
            <span className="stamp">Case File · Operative</span>
            <span className="stamp">Devnet</span>
            <span
              className={`stamp ${agent.active ? "" : "opacity-60"}`}
            >
              {agent.active ? "Status · Active" : "Status · Dormant"}
            </span>
          </div>

          <div
            className="flex items-start gap-4 sm:gap-6 mb-4 animate-intro"
            style={{ animationDelay: "120ms" }}
          >
            <span className="font-display text-6xl sm:text-8xl text-gold text-glow drop-shadow-gold-lg animate-glow-pulse leading-none">
              {meta.glyph}
            </span>
            <div className="min-w-0">
              <h1 className="font-display uppercase tracking-cinema text-5xl sm:text-7xl md:text-8xl leading-[0.9] text-bone">
                {meta.name}
              </h1>
              <p className="font-mono text-xs sm:text-sm uppercase tracking-[0.3em] text-gold/80 mt-3">
                {meta.role}
              </p>
            </div>
          </div>

          <p
            className="font-mono text-xs text-bone/40 tracking-wide mt-6 animate-intro"
            style={{ animationDelay: "240ms" }}
          >
            <span className="text-bone/30">RECRUITED </span>
            {new Date(agent.created_at).toLocaleDateString()}
            {agent.last_wake_at && (
              <>
                <span className="text-gold/30"> // </span>
                <span className="text-bone/30">LAST WOKE </span>
                {new Date(agent.last_wake_at).toLocaleString()}
              </>
            )}
            <span className="text-gold/30"> // </span>
            {agent.active ? (
              <span className="text-gold/70">AUTO-WAKE ON</span>
            ) : (
              <span className="text-bone/30">SILENT MODE</span>
            )}
          </p>
        </div>
      </section>

      {/* OPERATIVE RECORD — field stats */}
      <Reveal className="mb-16">
        <div className="flex items-center gap-4 mb-6">
          <p className="stamp">Operative Record</p>
          <span className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
        </div>
        <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-px bg-ash/40">
          <Card index="01" label="Wakes" value={String(stats.wakes)} />
          <Card index="02" label="Items executed" value={`${stats.itemsDone} / ${stats.itemsTotal}`} />
          <Card
            index="03"
            label="Opportunities"
            value={`${stats.oppsAccepted} / ${stats.opportunitiesProposed}`}
            hint="accepted / proposed"
          />
          <Card
            index="04"
            label="Fees paid"
            value={`${(stats.totalFeesLamports / 1_000_000_000).toFixed(6)} SOL`}
          />
          <Card
            index="05"
            label="Agent wallet balance"
            value={`${stats.agentBalanceSol.toFixed(6)} SOL`}
          />
          <Card
            index="06"
            label="Cadence"
            value={agent.active ? `${agent.cron_cadence_minutes} min` : "—"}
            hint={agent.active ? "auto-wake interval" : "silent mode"}
          />
        </section>
      </Reveal>

      {/* ON-CHAIN IDENTITIES — classified ledger */}
      <Reveal delay={120} className="mb-10">
        <section className="relative border border-ash/70 bg-gradient-to-b from-smoke/40 to-transparent p-6 sm:p-8 shadow-glow">
          <span
            aria-hidden
            className="absolute left-0 top-0 h-full w-px bg-gradient-to-b from-gold/60 via-gold/20 to-transparent"
          />
          <div className="flex items-center gap-4 mb-6">
            <p className="stamp">On-chain identities</p>
            <span className="h-px flex-1 bg-gradient-to-r from-ash to-transparent" />
          </div>
          <div className="space-y-3 text-xs">
            <Row label="Agent keypair" value={agent.agent_pubkey} />
            <Row label="Wallet PDA" value={agent.wallet_pda} />
          </div>
        </section>
      </Reveal>

      <footer className="font-mono text-xs uppercase tracking-[0.25em] text-bone/30 border-t border-ash/40 pt-4">
        Public, anonymized. Handler identity never shown.
      </footer>
    </main>
  );
}

function Card({
  index,
  label,
  value,
  hint,
}: {
  index?: string;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="group relative bg-ink/80 p-6 transition-colors hover:bg-smoke/50">
      {index && (
        <span className="absolute right-4 top-4 font-mono text-[0.65rem] tracking-[0.2em] text-gold/25 group-hover:text-gold/50 transition-colors">
          {index}
        </span>
      )}
      <div className="text-[0.65rem] uppercase tracking-[0.25em] text-bone/40 mb-3">
        {label}
      </div>
      <div className="font-display text-3xl sm:text-4xl text-gold text-glow tracking-cinema mb-1 transition-[filter] group-hover:drop-shadow-gold">
        {value}
      </div>
      {hint && (
        <div className="font-mono text-[0.7rem] uppercase tracking-wider text-bone/40">
          {hint}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-4 py-2 border-b border-ash/30 last:border-0">
      <span className="uppercase tracking-[0.25em] text-bone/40 shrink-0 text-[0.65rem]">
        {label}
      </span>
      <a
        href={`https://explorer.solana.com/address/${value}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-bone/70 hover:text-goldlit hover:text-glow truncate transition-colors"
      >
        {value}
      </a>
    </div>
  );
}
