import Link from "next/link";
import { Reveal } from "@/components/reveal";

export const metadata = {
  title: "SAW — Press Kit",
  description:
    "Everything you need to write about, link to, or evaluate SAW.",
};

export default function PressPage() {
  return (
    <main className="relative min-h-screen bg-obsidian">
      <div className="px-4 sm:px-6 py-8 max-w-5xl mx-auto">
        <header className="flex items-center justify-between mb-16 border-b border-ash/70 pb-4">
          <Link
            href="/"
            className="font-display text-2xl tracking-[0.35em] text-bone hover:text-gold transition-colors"
          >
            S A W
          </Link>
          <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
            <Link href="/demo" className="hover:text-gold transition-colors">Demo</Link>
            <Link href="/dashboard" className="hover:text-gold transition-colors">Dashboard</Link>
            <Link href="/treasury" className="hover:text-gold transition-colors">Treasury</Link>
            <Link href="/press" className="text-gold">Press</Link>
          </nav>
        </header>

        {/* DOSSIER COVER — title card */}
        <section className="relative mb-24">
          <div className="flex items-center gap-4 mb-6 animate-intro" style={{ animationDelay: "60ms" }}>
            <span className="stamp text-gold/90 border border-gold/30 px-3 py-1">
              Classified — Eyes only
            </span>
            <span className="hidden sm:inline font-mono text-[11px] uppercase tracking-[0.25em] text-bone/40">
              Dossier · SAW-PRESS-KIT
            </span>
          </div>

          <p
            className="stamp mb-5 text-bone/55 animate-intro"
            style={{ animationDelay: "120ms" }}
          >
            For evaluators, press, and design partners
          </p>

          <h1
            className="font-display uppercase text-5xl sm:text-7xl md:text-8xl leading-[0.92] tracking-cinema text-bone animate-intro"
            style={{ animationDelay: "180ms" }}
          >
            Press{" "}
            <span className="text-goldlit text-glow drop-shadow-gold-lg animate-glow-pulse">
              kit
            </span>
            .
          </h1>

          <p
            className="mt-7 text-bone/65 max-w-2xl text-lg leading-relaxed animate-intro"
            style={{ animationDelay: "260ms" }}
          >
            SAW is the missing wallet layer for AI agents on Solana. One sentence,
            one demo, one repo, public on devnet.
          </p>

          <div
            className="mt-8 h-px w-40 bg-gradient-to-r from-gold/70 to-transparent animate-intro"
            style={{ animationDelay: "340ms" }}
          />
        </section>

        <div className="space-y-16">
          <Reveal>
            <Section index="01" title="One-liner">
              <p className="text-bone/85 leading-relaxed text-lg max-w-3xl">
                Programmable on-chain custody for AI agents on Solana. The agent
                transacts under your limits.{" "}
                <span className="text-gold">You sign the override.</span>
              </p>
            </Section>
          </Reveal>

          <Reveal delay={60}>
            <Section index="02" title="Live URLs">
              <ul className="space-y-3 text-bone/85">
                <li className="group flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <span className="text-bone/45 text-xs uppercase tracking-widest sm:w-56 shrink-0">Demo</span>
                  <a href="/demo" className="font-mono text-sm text-gold hover:text-goldlit hover:text-glow transition-colors">
                    saw-gilt.vercel.app/demo
                  </a>
                </li>
                <li className="group flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <span className="text-bone/45 text-xs uppercase tracking-widest sm:w-56 shrink-0">Live dashboard (public stats)</span>
                  <a href="/dashboard" className="font-mono text-sm text-gold hover:text-goldlit hover:text-glow transition-colors">
                    saw-gilt.vercel.app/dashboard
                  </a>
                </li>
                <li className="group flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <span className="text-bone/45 text-xs uppercase tracking-widest sm:w-56 shrink-0">Treasury (every fee, on-chain)</span>
                  <a href="/treasury" className="font-mono text-sm text-gold hover:text-goldlit hover:text-glow transition-colors">
                    saw-gilt.vercel.app/treasury
                  </a>
                </li>
                <li className="group flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-4 border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <span className="text-bone/45 text-xs uppercase tracking-widest sm:w-56 shrink-0">Repo</span>
                  <a
                    href="https://github.com/asastuai/S.A.W"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-sm text-gold hover:text-goldlit hover:text-glow transition-colors"
                  >
                    github.com/asastuai/S.A.W
                  </a>
                </li>
              </ul>
            </Section>
          </Reveal>

          <Reveal delay={60}>
            <Section index="03" title="Docs">
              <ul className="space-y-4 text-bone/80 text-sm">
                <li className="border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <a
                    href="https://github.com/asastuai/S.A.W/blob/main/ROADMAP.md"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-gold hover:text-goldlit hover:text-glow transition-colors"
                  >
                    ROADMAP.md
                  </a>
                  <span className="text-bone/55"> — v1 plan + status (P0, P1, v1.1, v1.2, v1.3 shipped)</span>
                </li>
                <li className="border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <a
                    href="https://github.com/asastuai/S.A.W/blob/main/docs/architecture.md"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-gold hover:text-goldlit hover:text-glow transition-colors"
                  >
                    architecture.md
                  </a>
                  <span className="text-bone/55"> — system diagram, module map, data ownership, invariants</span>
                </li>
                <li className="border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <a
                    href="https://github.com/asastuai/S.A.W/blob/main/docs/fee-model.md"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-gold hover:text-goldlit hover:text-glow transition-colors"
                  >
                    fee-model.md
                  </a>
                  <span className="text-bone/55"> — 55 bps swap + 5% perf + 1% AUM, math + revenue projections</span>
                </li>
                <li className="border-l border-ash/60 pl-4 hover:border-gold/50 transition-colors">
                  <a
                    href="https://github.com/asastuai/S.A.W/blob/main/docs/security-model.md"
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-gold hover:text-goldlit hover:text-glow transition-colors"
                  >
                    security-model.md
                  </a>
                  <span className="text-bone/55"> — threat model, key management, audit roadmap</span>
                </li>
              </ul>
            </Section>
          </Reveal>

          <Reveal delay={60}>
            <Section index="04" title="Tech in production">
              <ul className="space-y-2.5 text-bone/80 text-sm">
                <li className="flex gap-3 border-b border-ash/30 pb-2.5">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span>Anchor 0.31.1 — three programs deployed on devnet (<span className="font-mono text-bone/65">agent_wallet, policy_registry, approval_queue</span>)</span>
                </li>
                <li className="flex gap-3 border-b border-ash/30 pb-2.5">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span>Token-2022 compatible via <span className="font-mono text-bone/65">token_interface</span></span>
                </li>
                <li className="flex gap-3 border-b border-ash/30 pb-2.5">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span>Next.js 14 App Router, TypeScript end to end, Tailwind</span>
                </li>
                <li className="flex gap-3 border-b border-ash/30 pb-2.5">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span>Supabase Postgres + RLS, Privy auth + wallet, PostHog, Sentry</span>
                </li>
                <li className="flex gap-3 border-b border-ash/30 pb-2.5">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span><span className="font-mono text-bone/65">cron-job.org</span> polling <span className="font-mono text-bone/65">/api/cron/wake-due-agents</span> every 5 min</span>
                </li>
                <li className="flex gap-3 border-b border-ash/30 pb-2.5">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span>8 LLM providers BYOK: Groq · Gemini · DeepSeek · Grok · OpenAI · Anthropic · Cerebras · Kimi</span>
                </li>
                <li className="flex gap-3">
                  <span className="text-gold/60 font-mono shrink-0 mt-0.5">›</span>
                  <span>Playwright smoke tests on every prod URL, GitHub Action hourly</span>
                </li>
              </ul>
            </Section>
          </Reveal>

          <Reveal delay={60}>
            <Section index="05" title="Status — devnet only (today)">
              <div className="relative border border-rust/30 bg-gradient-to-br from-rust/[0.06] to-transparent p-5 sm:p-6 text-bone/80 text-sm leading-relaxed">
                <span className="stamp absolute -top-2.5 left-5 bg-obsidian px-2 text-rust/80 border border-rust/40">
                  Devnet
                </span>
                <p className="mb-3">
                  SAW runs on Solana <strong className="text-bone">devnet</strong> only. SOL transfers are
                  real (visible in explorer), USDC swap leg is mocked because
                  Jupiter has no devnet liquidity.
                </p>
                <p className="mb-3">
                  Mainnet deploy is gated by audit. Audit comes when there&apos;s
                  funding to pay for it — see ROADMAP Phase 6.
                </p>
                <p className="text-gold/90">
                  No real user funds are at risk on the current deploy.
                </p>
              </div>
            </Section>
          </Reveal>

          <Reveal delay={60}>
            <Section index="06" title="Author">
              <div className="text-bone/80 text-sm border-l border-gold/40 pl-4">
                <p className="font-display text-2xl tracking-cinema text-bone">Juan Cruz Maisú</p>
                <p className="text-bone/50 text-xs mt-1.5 uppercase tracking-widest">
                  Buenos Aires · solo builder · DMs open on X
                </p>
              </div>
            </Section>
          </Reveal>
        </div>

        <footer className="text-bone/40 text-xs mt-20 pt-6 border-t border-ash/70 flex items-center justify-between font-mono uppercase tracking-widest">
          <span>Updated 2026-06-04 · v1.3</span>
          <span className="text-gold/40">End of dossier</span>
        </footer>
      </div>
    </main>
  );
}

function Section({
  index,
  title,
  children,
}: {
  index: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-4 mb-5">
        <span className="font-mono text-xs text-gold/50 tracking-widest pt-1">{index}</span>
        <h2 className="font-display uppercase text-2xl sm:text-3xl tracking-cinema text-bone leading-none">
          {title}
        </h2>
        <span className="hidden sm:block flex-1 h-px bg-gradient-to-r from-ash/60 to-transparent self-center" />
      </div>
      <div className="pl-0 sm:pl-9">{children}</div>
    </section>
  );
}
