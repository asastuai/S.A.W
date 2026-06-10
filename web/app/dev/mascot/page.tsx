"use client";

import { Mascot, type MascotPose } from "@/components/mascot";

// TEMPORARY preview route to verify the three.js operative hologram across
// all poses without needing a wallet. Delete after visual QA.
const POSES: MascotPose[] = [
  "idle",
  "listening",
  "thinking",
  "writing",
  "executing",
  "speaking",
  "sleeping",
];

export default function MascotPreview() {
  return (
    <main className="min-h-screen bg-obsidian px-8 py-12">
      <h1 className="mb-2 font-display text-3xl uppercase tracking-cinema text-gold text-glow">
        operative · hologram preview
      </h1>
      <p className="mb-10 font-mono text-xs uppercase tracking-widest text-bone/50">
        three.js wireframe · seven poses · delete this route after QA
      </p>
      <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
        {POSES.map((p) => (
          <div
            key={p}
            className="flex flex-col items-center gap-4 border border-ash bg-ink p-8"
          >
            <Mascot pose={p} size={180} glyph="✦" />
            <span className="font-mono text-xs uppercase tracking-widest text-phosphor">
              ● {p}
            </span>
          </div>
        ))}
      </div>
    </main>
  );
}
