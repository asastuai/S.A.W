import Link from "next/link";
import { Reveal } from "@/components/reveal";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col bg-obsidian">
      <AlphaDisclaimer />
      <Header />
      <Hero />
      <HowItWorks />
      <Personas />
      <ShipLog />
      <FeatureGrid />
      <Footer />
    </main>
  );
}

function Header() {
  return (
    <header className="sticky top-0 z-20 border-b border-ash/70 bg-obsidian/80 backdrop-blur-md px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl tracking-[0.35em] text-bone drop-shadow-gold">
          S A W
        </span>
        <span className="stamp hidden sm:inline">Devnet // 2026</span>
      </div>
      <nav className="flex items-center gap-4 sm:gap-6 text-sm uppercase tracking-widest">
        <Link href="/demo" className="hover:text-gold transition">
          Demo
        </Link>
        <Link href="/dashboard" className="hover:text-gold transition hidden sm:inline">
          Dashboard
        </Link>
        <Link href="/treasury" className="hover:text-gold transition hidden md:inline">
          Treasury
        </Link>
        <Link href="/press" className="hover:text-gold transition hidden lg:inline">
          Press
        </Link>
        <a
          href="https://github.com/asastuai/S.A.W"
          target="_blank"
          rel="noreferrer"
          className="hover:text-gold transition"
        >
          GitHub
        </a>
      </nav>
    </header>
  );
}

function AlphaDisclaimer() {
  return (
    <div className="relative z-20 border-b border-rust/40 bg-rust/5 px-4 py-2 text-center text-[11px] uppercase tracking-widest text-rust/90">
      Alpha · devnet only · unaudited externally · use test value, not real funds
    </div>
  );
}

function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-ash/60 px-6 py-28 sm:py-36">
      {/* Layered noir backdrop: deepening obsidian gradient + faint gold horizon glow. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-gradient-to-b from-obsidian via-ink to-obsidian"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-1/3 left-1/2 h-[60vh] w-[80vw] -translate-x-1/2 rounded-full bg-gold/[0.07] blur-[120px]"
      />
      {/* Faint mono "classified" watermark, off-axis for depth. */}
      <div
        aria-hidden
        className="pointer-events-none absolute right-[-2%] top-10 hidden select-none font-mono text-[10px] uppercase tracking-[0.5em] text-bone/[0.06] lg:block"
      >
        agent_wallet · policy_registry · approval_queue
      </div>

      <div className="relative mx-auto max-w-6xl">
        <p
          className="stamp mb-10 animate-intro"
          style={{ animationDelay: "60ms" }}
        >
          Classified // Operational
        </p>

        <h1 className="font-display uppercase leading-[0.86] tracking-cinema">
          <span
            className="block animate-intro text-5xl text-bone sm:text-7xl md:text-8xl"
            style={{ animationDelay: "120ms" }}
          >
            Be the
          </span>
          <span
            className="block animate-intro animate-glow-pulse text-6xl text-goldlit text-glow drop-shadow-gold-lg sm:text-8xl md:text-[10rem]"
            style={{ animationDelay: "260ms" }}
          >
            handler
          </span>
          <span
            className="block animate-intro text-4xl text-bone/90 sm:text-6xl md:text-7xl"
            style={{ animationDelay: "400ms" }}
          >
            of your AI agent.
          </span>
        </h1>

        <div className="mt-12 grid gap-12 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <p
            className="max-w-2xl animate-intro text-lg leading-relaxed text-bone/70"
            style={{ animationDelay: "520ms" }}
          >
            SAW is the first agent-native consumer wallet on Solana. Custody,
            policy, and oversight enforced on-chain. One operative that
            trades, finds yield, and helps you save — your codename, your
            rules. Bring your own LLM key, or pay{" "}
            <strong className="text-gold text-glow">0.01 SOL</strong> for 500 calls.
            Your agent operates with limits. You sign the override.
          </p>

          <div
            className="flex flex-wrap items-center gap-4 animate-intro"
            style={{ animationDelay: "640ms" }}
          >
            <Link
              href="/demo"
              className="group relative bg-gold text-ink px-7 py-3.5 uppercase tracking-widest text-sm font-medium shadow-glow transition hover:bg-bone hover:shadow-glow-lg animate-glow-pulse"
            >
              Run the dossier →
            </Link>
            <a
              href="https://github.com/asastuai/S.A.W"
              target="_blank"
              rel="noreferrer"
              className="border border-bone/30 text-bone/80 px-7 py-3.5 uppercase tracking-widest text-sm transition hover:border-gold hover:text-gold hover:shadow-glow"
            >
              Read the source
            </a>
          </div>
        </div>

        <Reveal delay={120} className="mt-16">
          <div className="relative max-w-2xl border-l-2 border-rust/60 bg-rust/[0.06] p-5 pl-6 text-xs leading-relaxed text-bone/70">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-rust">
              Alpha disclosure
            </p>
            <p>
              SAW is live on Solana devnet only. The Anchor programs passed a
              14-bug internal security audit (3 CRITICAL + 6 HIGH + 4 MEDIUM
              closed, report in{" "}
              <code className="text-gold">docs/security-audit-v1.3.md</code>),
              but no external audit has been performed yet. Mainnet deploy
              and an external audit are gated on funding, which is being
              pursued (no grant secured yet). Until then: treat all on-chain
              action as test value, not real funds. If you choose to use SAW
              today, you take on the risk yourself.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function HowItWorks() {
  const steps = [
    {
      n: "I.",
      title: "Brief the operative.",
      body:
        "Set the agent's daily budget, per-transaction cap, recipient allowlist, and approval threshold. Policies live on-chain.",
    },
    {
      n: "II.",
      title: "Cut it loose.",
      body:
        "The agent transacts within the brief. Anything within limits clears autonomously. Anything above threshold queues for your signature.",
    },
    {
      n: "III.",
      title: "Hold the override.",
      body:
        "Approve or deny pending requests from the dossier. Rotate the operative. Revoke at will. Pull funds out at any moment.",
    },
  ];
  return (
    <section className="relative px-6 py-28 border-t border-ash/60 bg-ink">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-16 flex items-end justify-between gap-6">
            <h2 className="font-display text-5xl uppercase tracking-cinema text-bone sm:text-6xl md:text-7xl">
              The protocol.
            </h2>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-bone/30 sm:block">
              03 // sequence
            </span>
          </div>
        </Reveal>
        <div className="grid gap-px bg-ash/60 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <div className="group relative h-full bg-ink p-8 transition-colors hover:bg-obsidian">
                <div className="absolute left-0 top-0 h-full w-px bg-gold/40 transition-all group-hover:w-[3px] group-hover:bg-gold group-hover:shadow-glow" />
                <div className="mb-5 font-display text-5xl text-gold/30 transition-colors group-hover:text-gold/70 group-hover:text-glow">
                  {s.n}
                </div>
                <h3 className="mb-3 font-display text-2xl uppercase tracking-wide text-bone">
                  {s.title}
                </h3>
                <p className="text-sm leading-relaxed text-bone/60">{s.body}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Personas() {
  const skills = [
    {
      glyph: "▲",
      title: "Trader",
      body:
        "Watches the tape and proposes swaps with dip / threshold / TWAP triggers. Reads market before suggesting. Speaks in alpha.",
    },
    {
      glyph: "✦",
      title: "Yield researcher",
      body:
        "Queries Solana DeFi yield from DefiLlama live (Kamino, Jupiter Lend, Save, marginfi). Ranks by APR + TVL. Proposes 1-click stakes.",
    },
    {
      glyph: "◆",
      title: "Coach",
      body:
        "Helps you set recurring transfers, savings drips, rebalances. Asks before suggesting. Anti-impulse, pro-habit.",
    },
  ];
  return (
    <section className="relative px-6 py-28 border-t border-ash/60 bg-obsidian">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-4 font-display text-5xl uppercase tracking-cinema text-bone sm:text-6xl md:text-7xl">
            The operative.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mb-14 max-w-2xl text-sm leading-relaxed text-bone/60">
            One agent per handler. You name it. Three capabilities baked in
            — they share the same conversation, the same on-chain wallet,
            the same policy. Switch context mid-chat: ask about a swap and
            the agent reads the tape; ask about yield and it queries
            DefiLlama; ask about savings and it asks before suggesting.
          </p>
        </Reveal>

        <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
          <Reveal delay={120}>
            <div className="relative max-w-2xl overflow-hidden border border-gold/70 bg-ink/80 p-8 shadow-glow sm:p-10">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl"
              />
              <div className="relative mb-5 flex items-center justify-between">
                <span className="text-5xl text-gold text-glow animate-glow-pulse">
                  ◉
                </span>
                <span className="stamp">Live · v1.3</span>
              </div>
              <h3 className="relative mb-2 font-display text-4xl uppercase tracking-wide text-bone">
                Operative
              </h3>
              <p className="relative mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-bone/40">
                customizable codename · pick yours in settings
              </p>
              <p className="relative border-l border-gold/40 pl-4 text-sm italic leading-relaxed text-bone/75">
                "Operative reporting. I trade, I research yield, I help you
                build habits. What's the mission?"
              </p>
            </div>
          </Reveal>

          <div className="grid gap-px bg-ash/60 sm:grid-cols-3 lg:grid-cols-1">
            {skills.map((s, i) => (
              <Reveal key={s.title} delay={220 + i * 120}>
                <div className="group h-full bg-ink p-6 transition-colors hover:bg-obsidian">
                  <span className="mb-3 block text-3xl text-gold transition-transform group-hover:scale-110 group-hover:text-goldlit group-hover:drop-shadow-gold">
                    {s.glyph}
                  </span>
                  <h4 className="mb-2 font-display text-xl uppercase tracking-wide text-bone">
                    {s.title}
                  </h4>
                  <p className="text-sm leading-relaxed text-bone/60">{s.body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ShipLog() {
  const entries = [
    {
      v: "v1.3",
      title: "Unified Operative + pay-with-crypto",
      body:
        "Collapsed 3 personas into one agent that does it all (trade · yield · save). Customizable codename. Auto-bootstrap on wallet connect. Pay 0.01 SOL = 500 LLM calls — no API key needed for the curious.",
    },
    {
      v: "v1.2",
      title: "Telegram bridge + atomic setup",
      body:
        "1-click pairing from web to TG bot. Setup collapses 3 signatures into 1 atomic transaction.",
    },
    {
      v: "v1.1",
      title: "Live yields + 1-click execute",
      body:
        "Live yield data from DefiLlama. Action-first prompt. Quick presets. ▶ execute-now button per queued item.",
    },
    {
      v: "v1.0",
      title: "8-provider BYOK",
      body:
        "Bring your own key from any of: Groq, Google Gemini, DeepSeek, Grok, OpenAI, Anthropic, Cerebras, Kimi. Auto-detected by prefix.",
    },
    {
      v: "v0.9",
      title: "Greedie + opportunity reel",
      body:
        "Proactive proposals from the watcher loop. Market price feed cached server-side. Threshold-aware approval modal.",
    },
    {
      v: "v0.5",
      title: "Anchor programs on devnet",
      body:
        "agent_wallet, policy_registry, approval_queue. Token-2022 compatible. PDA-signed CPIs.",
    },
  ];
  return (
    <section className="relative px-6 py-28 border-t border-ash/60 bg-ink">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <h2 className="mb-4 font-display text-5xl uppercase tracking-cinema text-bone sm:text-6xl md:text-7xl">
            The ship log.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mb-16 max-w-2xl text-sm leading-relaxed text-bone/60">
            Built solo, full-time, on devnet. Each line is a real ship.
          </p>
        </Reveal>
        <ol className="relative space-y-10 border-l border-gold/40 pl-8">
          {entries.map((e, i) => (
            <Reveal key={e.v} delay={i * 90}>
              <li className="relative">
                <span
                  className="absolute -left-[37px] top-1.5 h-2.5 w-2.5 rounded-full bg-gold shadow-glow"
                  aria-hidden
                />
                <div className="mb-2 flex items-baseline gap-3">
                  <span className="font-display text-2xl uppercase tracking-wide text-gold text-glow">
                    {e.v}
                  </span>
                  <h3 className="font-display text-lg uppercase tracking-wide text-bone">
                    {e.title}
                  </h3>
                </div>
                <p className="max-w-2xl text-sm leading-relaxed text-bone/60">
                  {e.body}
                </p>
              </li>
            </Reveal>
          ))}
        </ol>
        <Reveal delay={120}>
          <div className="mt-14 border-t border-ash/60 pt-6 font-mono text-xs uppercase tracking-[0.25em] text-bone/40">
            Next: confidential transfers (Token-2022), session-signer pilot,
            mainnet beta.
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    {
      tag: "Anchor",
      title: "Three programs, fully on-chain.",
      body:
        "agent_wallet, policy_registry, approval_queue. Cross-program CPIs signed by PDA authority.",
    },
    {
      tag: "Token-2022",
      title: "Compatible with the modern stack.",
      body:
        "Token interface accepts SPL Token v1 and Token-2022. Confidential Transfers extension shipping next iteration.",
    },
    {
      tag: "Auditable",
      title: "Every move is a transaction.",
      body:
        "Spend log, agent rotations, approval decisions — all on Solana, all timestamped, all yours.",
    },
    {
      tag: "Open",
      title: "Apache-2.0 licensed protocol.",
      body:
        "Use the SDK, fork the programs, build your own client. The handler model is a primitive, not a product moat.",
    },
    {
      tag: "BYOK",
      title: "Your key, your model, your spend.",
      body:
        "Eight LLM providers supported out of the box. In the web app your key lives in your browser and the server never stores it; connect Telegram and it's encrypted at rest so the bot can act for you. No platform middleman taking margin on tokens.",
    },
    {
      tag: "Yield-aware",
      title: "Live APRs from DefiLlama.",
      body:
        "The operative queries real Solana pools live on every yield request. No training-data hallucinations. It picks from what actually exists today.",
    },
  ];
  return (
    <section className="relative px-6 py-28 border-t border-ash/60 bg-obsidian">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-16 flex items-end justify-between gap-6">
            <h2 className="font-display text-5xl uppercase tracking-cinema text-bone sm:text-6xl md:text-7xl">
              The dossier.
            </h2>
            <span className="hidden font-mono text-[10px] uppercase tracking-[0.3em] text-bone/30 sm:block">
              classified // 06
            </span>
          </div>
        </Reveal>
        <div className="grid gap-px bg-ash/60 md:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={f.tag} delay={(i % 2) * 100 + Math.floor(i / 2) * 80}>
              <div className="group relative h-full overflow-hidden bg-ink p-8 transition-colors hover:bg-obsidian">
                <div
                  aria-hidden
                  className="pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gold/0 blur-2xl transition-colors duration-500 group-hover:bg-gold/[0.08]"
                />
                <div className="stamp relative mb-4">{f.tag}</div>
                <h3 className="relative mb-3 font-display text-2xl uppercase tracking-wide text-bone">
                  {f.title}
                </h3>
                <p className="relative text-sm leading-relaxed text-bone/60">
                  {f.body}
                </p>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ash/60 bg-ink px-6 py-12 mt-auto">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-6 font-mono text-xs uppercase tracking-[0.25em] text-bone/40 md:flex-row">
        <span>SAW // Secret Agent Wallet // Solana Devnet 2026</span>
        <span>Built by asastu.ai — handler signature required</span>
      </div>
    </footer>
  );
}
