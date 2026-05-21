import Link from "next/link";
import { Connection, PublicKey } from "@solana/web3.js";
import { getTreasuryAddressString } from "@/lib/treasury";

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
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-5xl mx-auto">
      <header className="flex items-center justify-between mb-12 border-b border-ash pb-4">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold">Demo</Link>
          <Link href="/dashboard" className="hover:text-gold">Dashboard</Link>
          <Link href="/treasury" className="text-gold">Treasury</Link>
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

      <p className="stamp mb-4">Public on-chain · {("cluster" in state ? state.cluster : "devnet")}</p>
      <h1 className="font-display text-4xl sm:text-5xl mb-3">The treasury.</h1>
      <p className="text-bone/60 max-w-2xl mb-10 leading-relaxed">
        Every fee SAW collects lands at one Solana address. Visible to anyone,
        verifiable in any block explorer. Pre-mainnet this is a team-controlled
        wallet on devnet; before going live it becomes a Squads 3-of-5 multisig.
      </p>

      {"error" in state ? (
        <div className="border border-rust p-6">
          <p className="text-rust">Treasury fetch failed: {state.error}</p>
        </div>
      ) : (
        <>
          <section className="border border-gold p-6 mb-10">
            <div className="stamp mb-3">Treasury address</div>
            <div className="font-mono text-xs text-bone/90 break-all mb-4">
              {state.address}
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <div className="text-xs uppercase tracking-widest text-bone/40 mb-1">
                  Current balance
                </div>
                <div className="font-display text-3xl text-gold">
                  {state.balanceSol.toFixed(9)} SOL
                </div>
              </div>
              <div className="text-right">
                <a
                  href={`https://explorer.solana.com/address/${state.address}?cluster=${state.cluster}`}
                  target="_blank"
                  rel="noreferrer"
                  className="border border-bone/30 px-4 py-2 text-xs uppercase tracking-widest text-bone/80 hover:text-gold hover:border-gold inline-block"
                >
                  Open in Solana Explorer ↗
                </a>
              </div>
            </div>
          </section>

          <section className="mb-10">
            <h2 className="font-display text-2xl mb-4">Recent on-chain activity</h2>
            <div className="border border-ash divide-y divide-ash/30">
              {state.recentSigs.length === 0 ? (
                <div className="p-6 text-bone/40 italic text-sm text-center">
                  No transactions yet on this address.
                </div>
              ) : (
                state.recentSigs.map((s) => (
                  <div
                    key={s.signature}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <a
                      href={`https://explorer.solana.com/tx/${s.signature}?cluster=${state.cluster}`}
                      target="_blank"
                      rel="noreferrer"
                      className="font-mono text-bone/70 hover:text-gold truncate max-w-[60%]"
                    >
                      {s.signature}
                    </a>
                    <span className="text-bone/40 shrink-0">
                      {s.blockTime
                        ? new Date(s.blockTime * 1000).toLocaleString()
                        : "—"}
                    </span>
                    {s.err && <span className="text-rust">failed</span>}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="mb-10">
            <h2 className="font-display text-2xl mb-4">Recent fees (DB ledger)</h2>
            <div className="border border-ash divide-y divide-ash/30">
              {state.recentFees.length === 0 ? (
                <div className="p-6 text-bone/40 italic text-sm text-center">
                  Fee ledger is empty. First swap will land here.
                </div>
              ) : (
                state.recentFees.map((f: any, i: number) => (
                  <div
                    key={i}
                    className="p-3 flex items-center justify-between gap-3 text-xs"
                  >
                    <span className="text-bone/60">{f.fee_kind}</span>
                    <span className="font-mono text-gold">
                      {(Number(f.amount_lamports) / 1_000_000_000).toFixed(9)} SOL
                    </span>
                    <span className="text-bone/40">
                      {new Date(f.created_at).toLocaleTimeString()}
                    </span>
                    {f.related_tx && (
                      <a
                        href={`https://explorer.solana.com/tx/${f.related_tx}?cluster=${state.cluster}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-gold/70 hover:text-gold"
                      >
                        tx ↗
                      </a>
                    )}
                  </div>
                ))
              )}
            </div>
          </section>
        </>
      )}

      <footer className="text-bone/40 text-xs">
        Devnet · v1 build in progress ·{" "}
        {"updatedAt" in state && state.updatedAt && (
          <>updated {new Date(state.updatedAt).toLocaleTimeString()}</>
        )}
      </footer>
    </main>
  );
}
