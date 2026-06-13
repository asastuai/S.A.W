import Link from "next/link";
import { TerminalPanel } from "@/components/terminal/terminal-panel";
import { CommandLine } from "@/components/terminal/command-line";
import { Readout } from "@/components/terminal/readout";
import { Caret } from "@/components/terminal/caret";

export const metadata = {
  title: "SAW — 404 Route Not Found",
};

export default function NotFound() {
  return (
    <main className="relative min-h-screen bg-obsidian flex items-center justify-center px-4 sm:px-6 py-8">
      {/* Registration marks — title-card framing */}
      <div className="pointer-events-none absolute left-3 top-3 h-5 w-5 border-l border-t border-gold/30 sm:left-6 sm:top-6" />
      <div className="pointer-events-none absolute right-3 top-3 h-5 w-5 border-r border-t border-gold/30 sm:right-6 sm:top-6" />
      <div className="pointer-events-none absolute left-3 bottom-3 h-5 w-5 border-l border-b border-gold/30 sm:left-6 sm:bottom-6" />
      <div className="pointer-events-none absolute right-3 bottom-3 h-5 w-5 border-r border-b border-gold/30 sm:right-6 sm:bottom-6" />

      {/* Faint gold corona */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/40 to-transparent"
      />

      <div className="w-full max-w-2xl">
        {/* Title card */}
        <div className="mb-10">
          <div className="mb-5">
            <CommandLine>
              saw locate <span className="text-gold/80">--route</span>
              <Caret className="ml-2" />
            </CommandLine>
          </div>

          <h1 className="font-display text-8xl sm:text-[10rem] uppercase leading-none tracking-cinema text-bone/10 select-none">
            404
          </h1>
        </div>

        {/* Error terminal */}
        <TerminalPanel label="signal // lost" className="mb-8 border-rust/50">
          <div className="border-l-2 border-rust p-6 sm:p-7">
            <Readout
              className="mb-4"
              items={[
                { label: "code", value: "404", tone: "rust" },
                { label: "state", value: "handler_not_found", tone: "bone" },
              ]}
            />

            <div className="space-y-2 font-mono text-sm text-bone/70">
              <div>
                <CommandLine prompt="$">
                  saw locate <span className="text-gold/80">--route</span>
                </CommandLine>
              </div>
              <div className="pl-4 text-rust">
                error: handler not found (404)
              </div>
              <div className="pl-4 text-bone/40">
                — no route matched this path
              </div>
            </div>
          </div>
        </TerminalPanel>

        {/* Return CTA */}
        <Link
          href="/"
          className="group inline-flex items-center gap-2 border border-gold/70 bg-gold/[0.08] px-5 py-3 font-mono text-sm text-bone shadow-glow transition hover:bg-gold hover:text-ink hover:shadow-glow-lg"
        >
          <CommandLine prompt="$">
            return to console{" "}
            <span className="ml-2 text-bone/40 group-hover:text-ink/60">→</span>
          </CommandLine>
        </Link>
      </div>
    </main>
  );
}
