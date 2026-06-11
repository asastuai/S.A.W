import Link from "next/link";
import { Reveal } from "@/components/reveal";
import { Spotlight } from "@/components/fx/spotlight";
import { BootSequence } from "@/components/terminal/boot-sequence";
import { Caret } from "@/components/terminal/caret";
import { CommandLine } from "@/components/terminal/command-line";
import { Readout } from "@/components/terminal/readout";
import { TerminalPanel } from "@/components/terminal/terminal-panel";

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
    <header className="sticky top-7 z-20 border-b border-ash/70 bg-obsidian/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between gap-3 flex-wrap font-mono">
      <div className="flex items-center gap-3">
        <span className="font-display text-2xl tracking-[0.3em] text-bone drop-shadow-gold">
          S A W
        </span>
        <span className="hidden font-mono text-[10px] uppercase tracking-widest text-bone/40 sm:inline">
          <span className="text-gold/60">~/</span>handler_console
        </span>
      </div>
      <nav className="flex items-center gap-4 sm:gap-5 font-mono text-[11px] uppercase tracking-widest text-bone/70">
        <Link href="/demo" className="transition hover:text-gold">
          <span className="text-gold/50">./</span>demo
        </Link>
        <Link href="/dashboard" className="hidden transition hover:text-gold sm:inline">
          <span className="text-gold/50">./</span>dashboard
        </Link>
        <Link href="/treasury" className="hidden transition hover:text-gold md:inline">
          <span className="text-gold/50">./</span>treasury
        </Link>
        <Link href="/press" className="hidden transition hover:text-gold lg:inline">
          <span className="text-gold/50">./</span>press
        </Link>
        <a
          href="https://github.com/asastuai/S.A.W"
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-gold"
        >
          <span className="text-gold/50">./</span>github
        </a>
      </nav>
    </header>
  );
}

function AlphaDisclaimer() {
  return (
    <div className="relative z-20 border-b border-rust/40 bg-rust/5 px-4 py-2 text-center font-mono text-[11px] uppercase tracking-widest text-rust/90">
      <span aria-hidden className="mr-2 text-rust/60">!!</span>
      Alpha · devnet only · unaudited externally · use test value, not real funds
    </div>
  );
}

function Hero() {
  const bootLines = [
    "loading kernel saw://handler_console ... ok",
    "mounting policy_registry ... ok",
    "agent_wallet ... online",
    "approval_queue ... ready",
    "authenticating handler ... ok",
  ];
  return (
    <section className="relative overflow-hidden border-b border-ash/60 px-6 py-20 sm:py-28">
      {/* Layered console backdrop: deepening obsidian gradient + faint amber horizon glow. */}
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
        <TerminalPanel
          label="boot // handler_console"
          className="mx-auto max-w-5xl bg-ink/70 px-6 py-7 backdrop-blur-sm sm:px-9 sm:py-9"
        >
          <BootSequence lines={bootLines}>
            <div className="pt-7">
              <Readout
                className="mb-7"
                items={[
                  { label: "session", value: "handler", tone: "gold" },
                  { label: "net", value: "devnet", tone: "phosphor" },
                  { label: "clearance", value: "operational", tone: "bone" },
                ]}
              />

              <h1 className="font-display uppercase leading-[0.86] tracking-cinema">
                <span className="block text-4xl text-bone sm:text-6xl md:text-7xl">
                  Be the
                </span>
                <span className="block text-glow text-5xl text-goldlit drop-shadow-gold-lg sm:text-7xl md:text-[9rem]">
                  handler
                  <Caret className="ml-3 align-middle text-[0.5em]" />
                </span>
                <span className="block text-3xl text-bone/90 sm:text-5xl md:text-6xl">
                  of your AI agent.
                </span>
              </h1>

              <div className="mt-10 grid gap-10 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
                <p className="max-w-2xl font-mono text-sm leading-relaxed text-bone/70 sm:text-base">
                  SAW is the first agent-native consumer wallet on Solana. Custody,
                  policy, and oversight enforced on-chain. One operative that
                  trades, finds yield, and helps you save — your codename, your
                  rules. Bring your own LLM key, or pay{" "}
                  <strong className="text-gold text-glow">0.01 SOL</strong> for 500 calls.
                  Your agent operates with limits. You sign the override.
                </p>

                <div className="flex flex-col items-start gap-3 font-mono">
                  <Link
                    href="/demo"
                    className="group inline-flex items-center gap-2 border border-gold/70 bg-gold/[0.08] px-5 py-3 text-sm text-bone shadow-glow transition hover:bg-gold hover:text-ink hover:shadow-glow-lg"
                  >
                    <CommandLine prompt="$">
                      saw run <span className="text-gold group-hover:text-ink">--dossier</span>
                      <span className="ml-2 text-bone/40 group-hover:text-ink/60">→</span>
                    </CommandLine>
                  </Link>
                  <a
                    href="https://github.com/asastuai/S.A.W"
                    target="_blank"
                    rel="noreferrer"
                    className="group inline-flex items-center gap-2 px-5 py-2.5 text-xs text-bone/70 transition hover:text-gold"
                  >
                    <CommandLine prompt="$">
                      git clone <span className="text-bone/40 group-hover:text-gold/70">saw.git</span>
                    </CommandLine>
                  </a>
                </div>
              </div>
            </div>
          </BootSequence>
        </TerminalPanel>

        <Reveal delay={120} className="mt-12">
          <div className="relative mx-auto max-w-3xl border-l-2 border-rust/60 bg-rust/[0.06] p-5 pl-6 font-mono text-xs leading-relaxed text-bone/70">
            <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-rust">
              <span aria-hidden className="mr-1 text-rust/60">!!</span>
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
      n: "01",
      cmd: "saw brief",
      title: "Brief the operative.",
      body:
        "Set the agent's daily budget, per-transaction cap, recipient allowlist, and approval threshold. Policies live on-chain.",
    },
    {
      n: "02",
      cmd: "saw deploy",
      title: "Cut it loose.",
      body:
        "The agent transacts within the brief. Anything within limits clears autonomously. Anything above threshold queues for your signature.",
    },
    {
      n: "03",
      cmd: "saw override",
      title: "Hold the override.",
      body:
        "Approve or deny pending requests from the dossier. Rotate the operative. Revoke at will. Pull funds out at any moment.",
    },
  ];
  return (
    <section className="relative px-6 py-24 border-t border-ash/60 bg-ink">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-gold/70">
                <CommandLine prompt="$">man saw-protocol</CommandLine>
              </p>
              <h2 className="font-display text-4xl uppercase tracking-cinema text-bone sm:text-5xl md:text-6xl">
                The protocol.
              </h2>
            </div>
            <Readout
              items={[
                { label: "stages", value: "3", tone: "gold" },
                { label: "mode", value: "sequential", tone: "phosphor" },
              ]}
            />
          </div>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-3">
          {steps.map((s, i) => (
            <Reveal key={s.n} delay={i * 120}>
              <Spotlight brackets className="h-full">
                <TerminalPanel
                  label={`[${s.n}]`}
                  className="group h-full p-7 pt-9 transition-colors hover:bg-smoke"
                >
                  <div className="mb-5 font-display text-5xl text-gold/30 transition-colors group-hover:text-gold/70 group-hover:text-glow">
                    {s.n}
                  </div>
                  <p className="mb-4 font-mono text-[11px] text-phosphor/80">
                    <CommandLine prompt="$">{s.cmd}</CommandLine>
                  </p>
                  <h3 className="mb-3 font-display text-xl uppercase tracking-wide text-bone">
                    {s.title}
                  </h3>
                  <p className="font-mono text-sm leading-relaxed text-bone/60">{s.body}</p>
                </TerminalPanel>
              </Spotlight>
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
      cap: "cap.trade",
      glyph: "▲",
      title: "Trader",
      body:
        "Watches the tape and proposes swaps with dip / threshold / TWAP triggers. Reads market before suggesting. Speaks in alpha.",
    },
    {
      cap: "cap.yield",
      glyph: "✦",
      title: "Yield researcher",
      body:
        "Queries Solana DeFi yield from DefiLlama live (Kamino, Jupiter Lend, Save, marginfi). Ranks by APR + TVL. Proposes 1-click stakes.",
    },
    {
      cap: "cap.coach",
      glyph: "◆",
      title: "Coach",
      body:
        "Helps you set recurring transfers, savings drips, rebalances. Asks before suggesting. Anti-impulse, pro-habit.",
    },
  ];
  return (
    <section className="relative px-6 py-24 border-t border-ash/60 bg-obsidian">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-gold/70">
            <CommandLine prompt="$">whoami</CommandLine>
          </p>
          <h2 className="mb-4 font-display text-4xl uppercase tracking-cinema text-bone sm:text-5xl md:text-6xl">
            The operative.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mb-12 max-w-2xl font-mono text-sm leading-relaxed text-bone/60">
            One agent per handler. You name it. Three capabilities baked in
            — they share the same conversation, the same on-chain wallet,
            the same policy. Switch context mid-chat: ask about a swap and
            the agent reads the tape; ask about yield and it queries
            DefiLlama; ask about savings and it asks before suggesting.
          </p>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:items-start">
          <Reveal delay={120}>
            <TerminalPanel
              label="ps // operative"
              className="relative max-w-2xl overflow-hidden p-7 pt-9 shadow-glow sm:p-9 sm:pt-10"
            >
              <div
                aria-hidden
                className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-gold/10 blur-3xl"
              />
              <div className="relative mb-5 flex items-center justify-between">
                <span className="text-glow animate-glow-pulse text-4xl text-gold">
                  ◉
                </span>
                <Readout
                  items={[
                    { label: "pid", value: "0001", tone: "bone" },
                    { label: "state", value: "live", tone: "phosphor" },
                    { label: "ver", value: "1.3", tone: "gold" },
                  ]}
                />
              </div>
              <h3 className="relative mb-2 font-display text-3xl uppercase tracking-wide text-bone">
                Operative
              </h3>
              <p className="relative mb-5 font-mono text-[11px] uppercase tracking-[0.25em] text-bone/40">
                customizable codename · pick yours in settings
              </p>
              <p className="relative border-l border-gold/40 pl-4 font-mono text-sm leading-relaxed text-bone/75">
                <span aria-hidden className="mr-2 text-gold/60">&gt;</span>
                "Operative reporting. I trade, I research yield, I help you
                build habits. What's the mission?"
                <Caret className="ml-1" />
              </p>
            </TerminalPanel>
          </Reveal>

          <div className="grid gap-5 sm:grid-cols-3 lg:grid-cols-1">
            {skills.map((s, i) => (
              <Reveal key={s.title} delay={220 + i * 120}>
                <TerminalPanel className="group h-full p-6 transition-colors hover:bg-smoke">
                  <div className="mb-3 flex items-center justify-between">
                    <span className="text-2xl text-gold transition-transform group-hover:scale-110 group-hover:text-goldlit group-hover:drop-shadow-gold">
                      {s.glyph}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-phosphor/70">
                      {s.cap}
                    </span>
                  </div>
                  <h4 className="mb-2 font-display text-lg uppercase tracking-wide text-bone">
                    {s.title}
                  </h4>
                  <p className="font-mono text-sm leading-relaxed text-bone/60">{s.body}</p>
                </TerminalPanel>
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
      hash: "a1f3c0d",
      title: "Unified Operative + pay-with-crypto",
      body:
        "Collapsed 3 personas into one agent that does it all (trade · yield · save). Customizable codename. Auto-bootstrap on wallet connect. Pay 0.01 SOL = 500 LLM calls — no API key needed for the curious.",
    },
    {
      v: "v1.2",
      hash: "7e2b9a4",
      title: "Telegram bridge + atomic setup",
      body:
        "1-click pairing from web to TG bot. Setup collapses 3 signatures into 1 atomic transaction.",
    },
    {
      v: "v1.1",
      hash: "c4d81fe",
      title: "Live yields + 1-click execute",
      body:
        "Live yield data from DefiLlama. Action-first prompt. Quick presets. ▶ execute-now button per queued item.",
    },
    {
      v: "v1.0",
      hash: "9b0a2c7",
      title: "8-provider BYOK",
      body:
        "Bring your own key from any of: Groq, Google Gemini, DeepSeek, Grok, OpenAI, Anthropic, Cerebras, Kimi. Auto-detected by prefix.",
    },
    {
      v: "v0.9",
      hash: "5fa6e13",
      title: "Greedie + opportunity reel",
      body:
        "Proactive proposals from the watcher loop. Market price feed cached server-side. Threshold-aware approval modal.",
    },
    {
      v: "v0.5",
      hash: "0c3d7b8",
      title: "Anchor programs on devnet",
      body:
        "agent_wallet, policy_registry, approval_queue. Token-2022 compatible. PDA-signed CPIs.",
    },
  ];
  return (
    <section className="relative px-6 py-24 border-t border-ash/60 bg-ink">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-gold/70">
            <CommandLine prompt="$">git log --oneline --decorate</CommandLine>
          </p>
          <h2 className="mb-4 font-display text-4xl uppercase tracking-cinema text-bone sm:text-5xl md:text-6xl">
            The ship log.
          </h2>
        </Reveal>
        <Reveal delay={80}>
          <p className="mb-10 max-w-2xl font-mono text-sm leading-relaxed text-bone/60">
            Built solo, full-time, on devnet. Each line is a real ship.
          </p>
        </Reveal>
        <Reveal delay={100}>
          <TerminalPanel label="HEAD // main" className="p-6 pt-8 sm:p-8 sm:pt-9">
            <ol className="space-y-7">
              {entries.map((e, i) => (
                <li key={e.v} className="relative">
                  <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span
                      aria-hidden
                      className={`font-mono text-sm ${i === 0 ? "text-gold" : "text-gold/60"}`}
                    >
                      {e.hash}
                    </span>
                    <span className="font-display text-lg uppercase tracking-wide text-bone">
                      {e.title}
                    </span>
                    <span className="font-mono text-[10px] uppercase tracking-widest text-phosphor/70">
                      ({e.v}{i === 0 ? " → HEAD" : ""})
                    </span>
                  </div>
                  <p className="mt-2 max-w-2xl border-l border-ash pl-4 font-mono text-sm leading-relaxed text-bone/60">
                    {e.body}
                  </p>
                </li>
              ))}
            </ol>
          </TerminalPanel>
        </Reveal>
        <Reveal delay={120}>
          <p className="mt-8 font-mono text-xs uppercase tracking-[0.25em] text-bone/40">
            <CommandLine prompt="#">
              next: confidential transfers (Token-2022) · session-signer pilot · mainnet beta
            </CommandLine>
          </p>
        </Reveal>
      </div>
    </section>
  );
}

function FeatureGrid() {
  const features = [
    {
      tag: "Anchor",
      flag: "--programs",
      title: "Three programs, fully on-chain.",
      body:
        "agent_wallet, policy_registry, approval_queue. Cross-program CPIs signed by PDA authority.",
    },
    {
      tag: "Token-2022",
      flag: "--token-iface",
      title: "Compatible with the modern stack.",
      body:
        "Token interface accepts SPL Token v1 and Token-2022. Confidential Transfers extension shipping next iteration.",
    },
    {
      tag: "Auditable",
      flag: "--audit-log",
      title: "Every move is a transaction.",
      body:
        "Spend log, agent rotations, approval decisions — all on Solana, all timestamped, all yours.",
    },
    {
      tag: "Open",
      flag: "--license",
      title: "Apache-2.0 licensed protocol.",
      body:
        "Use the SDK, fork the programs, build your own client. The handler model is a primitive, not a product moat.",
    },
    {
      tag: "BYOK",
      flag: "--llm-key",
      title: "Your key, your model, your spend.",
      body:
        "Eight LLM providers supported out of the box. In the web app your key lives in your browser and the server never stores it; connect Telegram and it's encrypted at rest so the bot can act for you. No platform middleman taking margin on tokens.",
    },
    {
      tag: "Yield-aware",
      flag: "--live-apr",
      title: "Live APRs from DefiLlama.",
      body:
        "The operative queries real Solana pools live on every yield request. No training-data hallucinations. It picks from what actually exists today.",
    },
  ];
  return (
    <section className="relative px-6 py-24 border-t border-ash/60 bg-obsidian">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mb-12 flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="mb-3 font-mono text-[11px] uppercase tracking-[0.3em] text-gold/70">
                <CommandLine prompt="$">saw --help</CommandLine>
              </p>
              <h2 className="font-display text-4xl uppercase tracking-cinema text-bone sm:text-5xl md:text-6xl">
                The dossier.
              </h2>
            </div>
            <Readout
              items={[
                { label: "spec", value: "manifest", tone: "gold" },
                { label: "entries", value: "6", tone: "phosphor" },
              ]}
            />
          </div>
        </Reveal>
        <div className="grid gap-5 md:grid-cols-2">
          {features.map((f, i) => (
            <Reveal key={f.tag} delay={(i % 2) * 100 + Math.floor(i / 2) * 80}>
              <Spotlight brackets className="h-full">
                <TerminalPanel
                  label={f.tag}
                  className="group relative h-full overflow-hidden p-7 pt-9 transition-colors hover:bg-smoke"
                >
                  <p className="relative mb-3 font-mono text-[11px] text-phosphor/70">
                    <CommandLine prompt="$">
                      saw <span className="text-gold/80">{f.flag}</span>
                    </CommandLine>
                  </p>
                  <h3 className="relative mb-3 font-display text-xl uppercase tracking-wide text-bone">
                    {f.title}
                  </h3>
                  <p className="relative font-mono text-sm leading-relaxed text-bone/60">
                    {f.body}
                  </p>
                </TerminalPanel>
              </Spotlight>
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
      <div className="mx-auto max-w-6xl">
        <p className="mb-6 font-mono text-sm text-bone/70">
          <CommandLine prompt="$">
            saw status<span className="ml-2 text-bone/40">--handler</span>
          </CommandLine>
          <Caret className="ml-1" />
        </p>
        <Readout
          className="mb-6"
          items={[
            { label: "system", value: "SAW", tone: "gold" },
            { label: "build", value: "secret-agent-wallet", tone: "bone" },
            { label: "net", value: "solana-devnet-2026", tone: "phosphor" },
          ]}
        />
        <div className="flex flex-col justify-between gap-4 border-t border-ash/60 pt-6 font-mono text-xs uppercase tracking-[0.25em] text-bone/40 md:flex-row">
          <span>SAW // Secret Agent Wallet // Solana Devnet 2026</span>
          <span>Built by asastu.ai — handler signature required</span>
        </div>
      </div>
    </footer>
  );
}
