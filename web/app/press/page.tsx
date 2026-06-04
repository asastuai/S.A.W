import Link from "next/link";

export const metadata = {
  title: "SAW — Press Kit",
  description:
    "Everything you need to write about, link to, or evaluate SAW.",
};

export default function PressPage() {
  return (
    <main className="min-h-screen px-4 sm:px-6 py-8 max-w-4xl mx-auto">
      <header className="flex items-center justify-between mb-12 border-b border-ash pb-4">
        <Link href="/" className="font-display text-2xl tracking-widest">
          S A W
        </Link>
        <nav className="flex gap-6 text-sm uppercase tracking-widest text-bone/60">
          <Link href="/demo" className="hover:text-gold">Demo</Link>
          <Link href="/dashboard" className="hover:text-gold">Dashboard</Link>
          <Link href="/treasury" className="hover:text-gold">Treasury</Link>
          <Link href="/press" className="text-gold">Press</Link>
        </nav>
      </header>

      <p className="stamp mb-4">For evaluators, press, and design partners</p>
      <h1 className="font-display text-4xl sm:text-5xl mb-3">Press kit.</h1>
      <p className="text-bone/60 max-w-2xl mb-12">
        SAW is the missing wallet layer for AI agents on Solana. One sentence,
        one demo, one repo, public on devnet.
      </p>

      <Section title="One-liner">
        <p className="text-bone/80 leading-relaxed">
          Programmable on-chain custody for AI agents on Solana. The agent
          transacts under your limits. You sign the override.
        </p>
      </Section>

      <Section title="Live URLs">
        <ul className="space-y-2 text-bone/80">
          <li>
            Demo:{" "}
            <a href="/demo" className="text-gold hover:underline">
              saw-gilt.vercel.app/demo
            </a>
          </li>
          <li>
            Live dashboard (public stats):{" "}
            <a href="/dashboard" className="text-gold hover:underline">
              saw-gilt.vercel.app/dashboard
            </a>
          </li>
          <li>
            Treasury (every fee, on-chain):{" "}
            <a href="/treasury" className="text-gold hover:underline">
              saw-gilt.vercel.app/treasury
            </a>
          </li>
          <li>
            Repo:{" "}
            <a
              href="https://github.com/asastuai/S.A.W"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              github.com/asastuai/S.A.W
            </a>
          </li>
        </ul>
      </Section>

      <Section title="Docs">
        <ul className="space-y-2 text-bone/80 text-sm">
          <li>
            <a
              href="https://github.com/asastuai/S.A.W/blob/main/ROADMAP.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              ROADMAP.md
            </a>{" "}
            — v1 plan + status (P0, P1, v1.1, v1.2, v1.3 shipped)
          </li>
          <li>
            <a
              href="https://github.com/asastuai/S.A.W/blob/main/docs/architecture.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              architecture.md
            </a>{" "}
            — system diagram, module map, data ownership, invariants
          </li>
          <li>
            <a
              href="https://github.com/asastuai/S.A.W/blob/main/docs/fee-model.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              fee-model.md
            </a>{" "}
            — 55 bps swap + 5% perf + 1% AUM, math + revenue projections
          </li>
          <li>
            <a
              href="https://github.com/asastuai/S.A.W/blob/main/docs/security-model.md"
              target="_blank"
              rel="noreferrer"
              className="text-gold hover:underline"
            >
              security-model.md
            </a>{" "}
            — threat model, key management, audit roadmap
          </li>
        </ul>
      </Section>

      <Section title="Tech in production">
        <ul className="space-y-1.5 text-bone/80 text-sm">
          <li>Anchor 0.31.1 — three programs deployed on devnet (agent_wallet, policy_registry, approval_queue)</li>
          <li>Token-2022 compatible via token_interface</li>
          <li>Next.js 14 App Router, TypeScript end to end, Tailwind</li>
          <li>Supabase Postgres + RLS, Privy auth + wallet, PostHog, Sentry</li>
          <li>cron-job.org polling /api/cron/wake-due-agents every 5 min</li>
          <li>8 LLM providers BYOK: Groq · Gemini · DeepSeek · Grok · OpenAI · Anthropic · Cerebras · Kimi</li>
          <li>Playwright smoke tests on every prod URL, GitHub Action hourly</li>
        </ul>
      </Section>

      <Section title="Status — devnet only (today)">
        <div className="text-bone/80 text-sm leading-relaxed">
          <p className="mb-2">
            SAW runs on Solana <strong>devnet</strong> only. SOL transfers are
            real (visible in explorer), USDC swap leg is mocked because
            Jupiter has no devnet liquidity.
          </p>
          <p className="mb-2">
            Mainnet deploy is gated by audit. Audit comes when there's
            funding to pay for it — see ROADMAP Phase 6.
          </p>
          <p>
            No real user funds are at risk on the current deploy.
          </p>
        </div>
      </Section>

      <Section title="Author">
        <div className="text-bone/80 text-sm">
          <p>Juan Cruz Maisú</p>
          <p className="text-bone/50 text-xs mt-1">
            Buenos Aires · solo builder · DMs open on X
          </p>
        </div>
      </Section>

      <footer className="text-bone/40 text-xs mt-12 pt-6 border-t border-ash">
        Updated 2026-06-04 · v1.3
      </footer>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="stamp mb-3">{title}</h2>
      {children}
    </section>
  );
}
