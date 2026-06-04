import Link from "next/link";
import { notFound } from "next/navigation";
import { Connection, PublicKey } from "@solana/web3.js";

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
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-12 border-b border-ash pb-4">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold">Demo</Link>
          <Link href="/dashboard" className="hover:text-gold">Dashboard</Link>
          <Link href="/treasury" className="hover:text-gold">Treasury</Link>
        </nav>
      </header>

      <p className="stamp mb-4">Public agent profile · Devnet</p>
      <div className="flex items-baseline gap-3 mb-2">
        <span className="font-display text-5xl text-gold">{meta.glyph}</span>
        <h1 className="font-display text-4xl sm:text-5xl">{meta.name}</h1>
      </div>
      <p className="text-bone/60 max-w-2xl mb-2">{meta.role}</p>
      <p className="text-bone/40 text-xs mb-10">
        Born {new Date(agent.created_at).toLocaleDateString()}
        {agent.last_wake_at && (
          <> · last woke {new Date(agent.last_wake_at).toLocaleString()}</>
        )}
        {agent.active ? " · auto-wake on" : " · silent mode"}
      </p>

      <section className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-12">
        <Card label="Wakes" value={String(stats.wakes)} />
        <Card label="Items executed" value={`${stats.itemsDone} / ${stats.itemsTotal}`} />
        <Card
          label="Opportunities"
          value={`${stats.oppsAccepted} / ${stats.opportunitiesProposed}`}
          hint="accepted / proposed"
        />
        <Card
          label="Fees paid"
          value={`${(stats.totalFeesLamports / 1_000_000_000).toFixed(6)} SOL`}
        />
        <Card
          label="Agent wallet balance"
          value={`${stats.agentBalanceSol.toFixed(6)} SOL`}
        />
        <Card
          label="Cadence"
          value={agent.active ? `${agent.cron_cadence_minutes} min` : "—"}
          hint={agent.active ? "auto-wake interval" : "silent mode"}
        />
      </section>

      <section className="border border-ash p-6 mb-8">
        <p className="stamp mb-4">On-chain identities</p>
        <div className="space-y-2 text-xs">
          <Row label="Agent keypair" value={agent.agent_pubkey} />
          <Row label="Wallet PDA" value={agent.wallet_pda} />
        </div>
      </section>

      <footer className="text-bone/40 text-xs">
        Public, anonymized. Handler identity never shown.
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
  hint?: string;
}) {
  return (
    <div className="border border-ash p-5">
      <div className="text-xs uppercase tracking-widest text-bone/40 mb-2">
        {label}
      </div>
      <div className="font-display text-3xl text-gold mb-1">{value}</div>
      {hint && <div className="text-xs text-bone/50">{hint}</div>}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="uppercase tracking-widest text-bone/40 shrink-0">
        {label}
      </span>
      <a
        href={`https://explorer.solana.com/address/${value}?cluster=devnet`}
        target="_blank"
        rel="noreferrer"
        className="font-mono text-bone/80 hover:text-gold truncate"
      >
        {value}
      </a>
    </div>
  );
}
