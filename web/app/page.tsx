import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">
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
    <header className="border-b border-ash px-4 sm:px-6 py-4 flex items-center justify-between gap-3 flex-wrap">
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl tracking-widest">S A W</span>
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

function Hero() {
  return (
    <section className="px-6 py-24 max-w-5xl mx-auto">
      <p className="stamp mb-8">Classified // Operational</p>
      <h1 className="font-display text-5xl sm:text-6xl md:text-8xl leading-none tracking-tight mb-6">
        Be the handler<br />of your AI agent.
      </h1>
      <p className="text-bone/70 text-lg max-w-2xl mb-12 leading-relaxed">
        SAW is the first agent-native consumer wallet on Solana. Custody,
        policy, and oversight enforced on-chain. One operative that
        trades, finds yield, and helps you save — your codename, your
        rules. Bring your own LLM key, or pay <strong className="text-gold">0.01 SOL</strong> for 500 calls.
        Your agent operates with limits. You sign the override.
      </p>
      <div className="flex flex-wrap gap-4 items-center">
        <Link
          href="/demo"
          className="bg-gold text-ink px-6 py-3 uppercase tracking-widest text-sm hover:bg-bone transition"
        >
          Run the dossier →
        </Link>
        <a
          href="https://github.com/asastuai/S.A.W"
          target="_blank"
          rel="noreferrer"
          className="border border-bone/30 text-bone/80 px-6 py-3 uppercase tracking-widest text-sm hover:border-gold hover:text-gold transition"
        >
          Read the source
        </a>
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
    <section className="px-6 py-24 border-t border-ash">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-4xl mb-16 tracking-tight">
          The protocol.
        </h2>
        <div className="grid md:grid-cols-3 gap-12">
          {steps.map((s) => (
            <div key={s.n} className="border-l border-gold pl-6">
              <div className="text-gold font-display text-3xl mb-4">{s.n}</div>
              <h3 className="text-xl mb-3 tracking-wide">{s.title}</h3>
              <p className="text-bone/60 text-sm leading-relaxed">{s.body}</p>
            </div>
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
    <section className="px-6 py-24 border-t border-ash">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-4xl mb-4 tracking-tight">
          The operative.
        </h2>
        <p className="text-bone/60 text-sm mb-12 max-w-2xl leading-relaxed">
          One agent per handler. You name it. Three capabilities baked in
          — they share the same conversation, the same on-chain wallet,
          the same policy. Switch context mid-chat: ask about a swap and
          the agent reads the tape; ask about yield and it queries
          DefiLlama; ask about savings and it asks before suggesting.
        </p>

        <div className="border border-gold p-8 sm:p-10 mb-8 max-w-2xl">
          <div className="flex items-center justify-between mb-4">
            <span className="text-gold text-4xl">◉</span>
            <span className="stamp">Live · v1.3</span>
          </div>
          <h3 className="font-display text-3xl mb-2 tracking-wide text-bone">
            Operative
          </h3>
          <p className="text-bone/40 text-xs uppercase tracking-widest mb-4">
            customizable codename · pick yours in settings
          </p>
          <p className="text-bone/70 text-sm leading-relaxed">
            "Operative reporting. I trade, I research yield, I help you
            build habits. What's the mission?"
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-px bg-ash">
          {skills.map((s) => (
            <div key={s.title} className="bg-ink p-6">
              <span className="text-gold text-2xl block mb-3">{s.glyph}</span>
              <h4 className="font-display text-lg mb-2 tracking-wide">
                {s.title}
              </h4>
              <p className="text-bone/60 text-sm leading-relaxed">{s.body}</p>
            </div>
          ))}
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
    <section className="px-6 py-24 border-t border-ash">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-4xl mb-4 tracking-tight">
          The ship log.
        </h2>
        <p className="text-bone/60 text-sm mb-16 max-w-2xl leading-relaxed">
          Built solo, full-time, on devnet. Each line is a real ship.
        </p>
        <ol className="space-y-8 border-l border-gold/40 pl-6">
          {entries.map((e) => (
            <li key={e.v} className="relative">
              <span
                className="absolute -left-[31px] top-1 w-2 h-2 bg-gold rounded-full"
                aria-hidden
              />
              <div className="flex items-baseline gap-3 mb-2">
                <span className="text-gold font-display text-lg">{e.v}</span>
                <h3 className="text-base tracking-wide">{e.title}</h3>
              </div>
              <p className="text-bone/60 text-sm leading-relaxed">{e.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12 text-xs text-bone/40 uppercase tracking-widest">
          Next: confidential transfers (Token-2022), session-signer pilot,
          mainnet beta.
        </div>
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
      title: "MIT-licensed protocol.",
      body:
        "Use the SDK, fork the programs, build your own client. The handler model is a primitive, not a product moat.",
    },
    {
      tag: "BYOK",
      title: "Your key, your model, your spend.",
      body:
        "Eight LLM providers supported out of the box. Keys live in your browser; the server never stores them. No platform middleman taking margin on tokens.",
    },
    {
      tag: "Yield-aware",
      title: "Live APRs from DefiLlama.",
      body:
        "Conservador queries real Solana pools every 5 minutes. No training-data hallucinations. The agent picks from what actually exists today.",
    },
  ];
  return (
    <section className="px-6 py-24 border-t border-ash">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-display text-4xl mb-16 tracking-tight">
          The dossier.
        </h2>
        <div className="grid md:grid-cols-2 gap-px bg-ash">
          {features.map((f) => (
            <div key={f.tag} className="bg-ink p-8">
              <div className="stamp mb-4">{f.tag}</div>
              <h3 className="text-xl mb-3 tracking-wide">{f.title}</h3>
              <p className="text-bone/60 text-sm leading-relaxed">{f.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-ash px-6 py-12 mt-auto">
      <div className="max-w-5xl mx-auto flex flex-col md:flex-row justify-between gap-6 text-xs uppercase tracking-widest text-bone/40">
        <span>SAW // Secret Agent Wallet // Solana Devnet 2026</span>
        <span>Built by asastu.ai — handler signature required</span>
      </div>
    </footer>
  );
}
