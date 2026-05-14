import Link from "next/link";

export default function LandingPage() {
  return (
    <main className="min-h-screen flex flex-col">
      <Header />
      <Hero />
      <HowItWorks />
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
        SAW is the first agent-native consumer wallet on Solana. Custody, policy,
        and oversight enforced on-chain. Your agent operates with limits.
        Your handler signs the override.
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
