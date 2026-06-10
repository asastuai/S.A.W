"use client";

import { useEffect, useState } from "react";

/**
 * StatusHeader — the global Operator Console status bar.
 *
 * Sticky to the top of the viewport, it occupies flow space (so page content
 * never slides underneath it) and reads like the chrome of a classified TUI:
 *
 *   SAW://{channel} · DEVNET · ● LIVE · 14:22:07
 *
 * The timecode ticks once a second, client-side. This is CHROME, not
 * navigation — it carries no links and is exposed to assistive tech as a
 * status region.
 */
function formatTime(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function StatusHeader({
  channel = "handler_console",
}: {
  channel?: string;
}): JSX.Element {
  // Start empty so server and first client render agree (no hydration drift);
  // the real timecode populates on mount and ticks each second.
  const [time, setTime] = useState<string>("");

  useEffect(() => {
    const tick = () => setTime(formatTime(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header
      role="status"
      aria-live="off"
      className="sticky top-0 z-50 flex h-7 items-center gap-2 overflow-hidden border-b border-ash bg-obsidian/90 px-3 font-mono text-[11px] uppercase tracking-widest text-bone backdrop-blur"
    >
      <span className="shrink-0 text-gold">SAW</span>
      <span aria-hidden="true" className="shrink-0 text-bone/40">
        ://
      </span>
      <span className="truncate text-bone/80">{channel}</span>

      <span aria-hidden="true" className="text-ash">
        ·
      </span>
      <span className="shrink-0 text-bone/60">DEVNET</span>

      <span aria-hidden="true" className="text-ash">
        ·
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <span aria-hidden="true" className="text-phosphor">
          ●
        </span>
        <span className="text-phosphor">LIVE</span>
      </span>

      <span aria-hidden="true" className="ml-auto text-ash">
        ·
      </span>
      <span
        className="shrink-0 tabular-nums text-bone/80"
        suppressHydrationWarning
        aria-label={time ? `system time ${time}` : undefined}
      >
        {time || "--:--:--"}
      </span>
    </header>
  );
}
