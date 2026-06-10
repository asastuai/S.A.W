import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import { getTreasuryAddressString } from "@/lib/treasury";
import { Reveal } from "@/components/reveal";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { Readout } from "@/components/terminal/readout";
import { CommandLine } from "@/components/terminal/command-line";
import { Caret } from "@/components/terminal/caret";

export const metadata = {
  title: "SAW — Treasury",
  description:
    "Live state of the SAW fee treasury. Public on-chain, fully auditable.",
};

export const dynamic = "force-dynamic";
export const revalidate = 30;

async function fetchTreasuryState() {
  try {
    const treasury = getTreasuryAddressString();
    const rpcUrl =
      process.env.NEXT_PUBLIC_SOLANA_RPC || "https://api.devnet.solana.com";
    const connection = new Connection(rpcUrl, "confirmed");
    const pubkey = new PublicKey(treasury);

    const [balance, sigsRaw] = await Promise.all([
      connection.getBalance(pubkey),
      connection.getSignaturesForAddress(pubkey, { limit: 15 }),
    ]);

    const sigs = await Promise.all(
      sigsRaw.map(async (s) => ({
        signature: s.signature,
        slot: s.slot,
        blockTime: s.blockTime,
        err: s.err,
      }))
    );

    // Also pull fee_ledger aggregate
    const { supabaseAdmin } = await import("@/lib/supabase");
    const db = supabaseAdmin();
    const { data: fees } = await db
      .from("fee_ledger")
      .select("fee_kind, amount_lamports, created_at, related_tx")
      .order("created_at", { ascending: false })
      .limit(10);

    return {
      address: treasury,
      balanceLamports: balance,
      balanceSol: balance / 1_000_000_000,
      recentSigs: sigs,
      recentFees: fees ?? [],
      cluster: rpcUrl.includes("mainnet") ? "mainnet" : "devnet",
      updatedAt: new Date().toISOString(),
    };
  } catch (e: any) {
    return { error: e.message ?? String(e) };
  }
}

export default async function TreasuryPage() {
  const state = await fetchTreasuryState();

  return (
    <main className="relative min-h-screen overflow-hidden bg-obsidian">
      {/* Layered depth: gold pool of light pooling from the vault, hairline grid */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_50%_-10%,rgba(201,169,110,0.12),transparent_70%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent"
      />

      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-14 border-b border-ash pb-4">
          <Link
            href="/"
            className="font-display text-2xl tracking-widest uppercase text-bone hover:text-gold transition-colors"
          >
            S A W
          </Link>
          <nav className="flex gap-6 font-mono text-xs uppercase tracking-widest text-bone/60">
            <Link href="/demo" className="hover:text-gold transition-colors">Demo</Link>
            <Link href="/dashboard" className="hover:text-gold transition-colors">Dashboard</Link>
            <Link href="/treasury" className="text-gold text-glow">Treasury</Link>
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

        {/* TITLE CARD — dossier framing for the vault readout */}
        <section className="relative mb-16">
          <div className="flex flex-wrap items-center gap-3 mb-6 animate-intro">
            <span className="stamp">Classified · Eyes only</span>
            <span className="stamp text-gold border-gold/60">
              Public on-chain · {"cluster" in state ? state.cluster : "devnet"}
            </span>
          </div>

          <div className="mb-6 animate-intro">
            <CommandLine>
              saw treasury balance{" "}
              <span className="text-gold/80">--cluster</span>{" "}
              {"cluster" in state ? state.cluster : "devnet"}
            </CommandLine>
          </div>

          <h1
            className="font-display uppercase tracking-cinema text-bone text-4xl sm:text-6xl md:text-7xl leading-[0.92] animate-intro"
            style={{ animationDelay: "120ms" }}
          >
            The
            <span className="block text-gold text-glow drop-shadow-gold-lg">
              treasury
              <Caret className="ml-2 align-baseline" />
            </span>
          </h1>

          <p
            className="text-bone/60 max-w-2xl mt-8 leading-relaxed text-base font-mono animate-intro"
            style={{ animationDelay: "240ms" }}
          >
            Every fee SAW collects lands at one Solana address. Visible to anyone,
            verifiable in any block explorer. Pre-mainnet this is a team-controlled
            wallet on devnet; before going live it becomes a Squads 3-of-5 multisig.
          </p>
        </section>

        {"error" in state ? (
          <Reveal>
            <TerminalPanel label="signal" className="border-rust/50">
              <div className="relative p-8">
                <div className="stamp text-rust border-rust/50 mb-4">
                  Signal lost
                </div>
                <p className="font-mono text-sm text-rust break-all">
                  Treasury fetch failed: {state.error}
                </p>
              </div>
            </TerminalPanel>
          </Reveal>
        ) : (
          <>
            {/* THE VAULT — primary balance readout, glowing dossier card */}
            <Reveal>
              <TerminalPanel
                label="vault.001"
                className="relative mb-14 border-gold/60 bg-gradient-to-b from-ink/60 to-obsidian/80 shadow-glow-lg overflow-hidden"
              >
                {/* corner stamp + scan accent */}
                <div className="absolute right-0 top-0 h-16 w-16 border-l border-b border-gold/30" />
                <div className="p-7 sm:p-10">
                  <Readout
                    className="mb-5"
                    items={[
                      { label: "addr", value: "file_001", tone: "gold" },
                      { label: "cluster", value: state.cluster },
                      { label: "state", value: "open", tone: "phosphor" },
                    ]}
                  />
                  <div className="font-mono text-xs sm:text-sm text-bone/90 break-all mb-8 tracking-wide">
                    {state.address}
                  </div>

                  <div className="grid sm:grid-cols-2 gap-8 items-end">
                    <div>
                      <div className="text-[0.65rem] uppercase tracking-[0.3em] text-bone/40 mb-2">
                        Current balance
                      </div>
                      <div className="font-display text-4xl sm:text-6xl text-gold text-glow drop-shadow-gold-lg leading-none animate-glow-pulse">
                        {state.balanceSol.toFixed(9)}
                        <span className="text-2xl sm:text-3xl text-goldlit ml-3 align-baseline">
                          SOL
                        </span>
                      </div>
                      <div className="font-mono text-[0.7rem] text-bone/40 mt-3">
                        {state.balanceLamports.toLocaleString()} lamports
                      </div>
                    </div>
                    <div className="sm:text-right">
                      <a
                        href={`https://explorer.solana.com/address/${state.address}?cluster=${state.cluster}`}
                        target="_blank"
                        rel="noreferrer"
                        className="border border-bone/30 px-5 py-3 text-xs uppercase tracking-widest text-bone/80 hover:text-gold hover:border-gold hover:shadow-glow transition-all inline-block"
                      >
                        Open in Solana Explorer ↗
                      </a>
                    </div>
                  </div>
                </div>
              </TerminalPanel>
            </Reveal>

            {/* ON-CHAIN ACTIVITY DOSSIER */}
            <Reveal delay={80}>
              <section className="mb-14">
                <div className="flex items-baseline gap-4 mb-5">
                  <span className="font-mono text-xs text-gold/60 tracking-widest">[01]</span>
                  <h2 className="font-display uppercase tracking-cinema text-xl sm:text-2xl text-bone">
                    Recent on-chain activity
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-gold/30 to-transparent" />
                  <span className="stamp shrink-0">tail -f chain</span>
                </div>
                <TerminalPanel label="signatures">
                <div className="divide-y divide-ash/30">
                  {state.recentSigs.length === 0 ? (
                    <div className="p-8 text-bone/40 italic text-sm text-center">
                      No transactions yet on this address.
                    </div>
                  ) : (
                    state.recentSigs.map((s) => (
                      <div
                        key={s.signature}
                        className="p-3 sm:p-4 flex items-center justify-between gap-3 text-xs hover:bg-gold/[0.04] transition-colors"
                      >
                        <a
                          href={`https://explorer.solana.com/tx/${s.signature}?cluster=${state.cluster}`}
                          target="_blank"
                          rel="noreferrer"
                          className="font-mono text-bone/70 hover:text-gold truncate max-w-[60%] transition-colors"
                        >
                          {s.signature}
                        </a>
                        <span className="font-mono text-bone/40 shrink-0">
                          {s.blockTime
                            ? new Date(s.blockTime * 1000).toLocaleString()
                            : "—"}
                        </span>
                        {s.err && (
                          <span className="stamp text-rust border-rust/50 shrink-0">
                            failed
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
                </TerminalPanel>
              </section>
            </Reveal>

            {/* FEE LEDGER DOSSIER */}
            <Reveal delay={160}>
              <section className="mb-14">
                <div className="flex items-baseline gap-4 mb-5">
                  <span className="font-mono text-xs text-gold/60 tracking-widest">[02]</span>
                  <h2 className="font-display uppercase tracking-cinema text-xl sm:text-2xl text-bone">
                    Recent fees
                  </h2>
                  <span className="h-px flex-1 bg-gradient-to-r from-gold/30 to-transparent" />
                  <span className="stamp shrink-0">tail -f db</span>
                </div>
                <TerminalPanel label="fee_ledger">
                <div className="divide-y divide-ash/30">
                  {state.recentFees.length === 0 ? (
                    <div className="p-8 text-bone/40 italic text-sm text-center">
                      Fee ledger is empty. First swap will land here.
                    </div>
                  ) : (
                    state.recentFees.map((f: any, i: number) => (
                      <div
                        key={i}
                        className="p-3 sm:p-4 flex items-center justify-between gap-3 text-xs hover:bg-gold/[0.04] transition-colors"
                      >
                        <span className="uppercase tracking-widest text-bone/60">
                          {f.fee_kind}
                        </span>
                        <span className="font-mono text-gold text-glow">
                          {(Number(f.amount_lamports) / 1_000_000_000).toFixed(9)} SOL
                        </span>
                        <span className="font-mono text-bone/40">
                          {new Date(f.created_at).toLocaleTimeString()}
                        </span>
                        {f.related_tx && (
                          <a
                            href={`https://explorer.solana.com/tx/${f.related_tx}?cluster=${state.cluster}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-gold/70 hover:text-gold transition-colors"
                          >
                            tx ↗
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
                </TerminalPanel>
              </section>
            </Reveal>
          </>
        )}

        <footer className="flex items-center gap-3 border-t border-ash pt-5 text-bone/40 text-xs font-mono uppercase tracking-widest">
          <span className="text-phosphor">●</span>
          Devnet · v1 build in progress ·{" "}
          {"updatedAt" in state && state.updatedAt && (
            <>updated {new Date(state.updatedAt).toLocaleTimeString()}</>
          )}
        </footer>
      </div>
    </main>
  );
}
