"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * GuidedTour — first-visit walkthrough of the console.
 *
 * Dims the screen and spotlights one element at a time (matched via
 * [data-tour="<id>"]), with a short description and Next / Skip. Steps
 * whose target isn't currently in the DOM are skipped, so the same tour
 * works for guest mode and full sessions. Auto-shows once (localStorage),
 * re-launchable from the header.
 */

export type TourStep = {
  target: string; // data-tour id
  title: string;
  body: string;
};

const SEEN_KEY = "saw_tour_seen_v1";

export function hasSeenTour(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

export function GuidedTour({
  steps,
  onClose,
}: {
  steps: TourStep[];
  onClose: () => void;
}) {
  // Only steps whose anchor exists right now.
  const [live, setLive] = useState<TourStep[]>([]);
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    setLive(
      steps.filter((s) => document.querySelector(`[data-tour="${s.target}"]`))
    );
  }, [steps]);

  const close = useCallback(() => {
    try {
      localStorage.setItem(SEEN_KEY, "1");
    } catch {}
    onClose();
  }, [onClose]);

  // Track the current target's rect (scroll it into view first).
  useEffect(() => {
    const step = live[idx];
    if (!step) return;
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    let raf = 0;
    const track = () => {
      setRect(el.getBoundingClientRect());
      raf = requestAnimationFrame(track);
    };
    raf = requestAnimationFrame(track);
    return () => cancelAnimationFrame(raf);
  }, [live, idx]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Enter" || e.key === "ArrowRight")
        setIdx((i) => (i + 1 < live.length ? i + 1 : (close(), i)));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [live.length, close]);

  if (!live.length || !rect) return null;
  const step = live[idx];
  const last = idx === live.length - 1;
  const pad = 8;
  // Card below the spotlight unless it would fall off-screen.
  const cardBelow = rect.bottom + 190 < window.innerHeight;

  return (
    <div className="fixed inset-0 z-[120]" role="dialog" aria-label="Guided tour">
      {/* Spotlight: the giant shadow dims everything but the target. */}
      <div
        className="absolute border border-gold shadow-[0_0_0_9999px_rgba(7,7,8,0.82)] transition-all duration-300 pointer-events-none"
        style={{
          left: rect.left - pad,
          top: rect.top - pad,
          width: rect.width + pad * 2,
          height: rect.height + pad * 2,
        }}
      >
        <span aria-hidden className="absolute -left-px -top-px font-mono text-[10px] leading-none text-gold">┌</span>
        <span aria-hidden className="absolute -right-px -top-px font-mono text-[10px] leading-none text-gold">┐</span>
        <span aria-hidden className="absolute -left-px -bottom-px font-mono text-[10px] leading-none text-gold">└</span>
        <span aria-hidden className="absolute -right-px -bottom-px font-mono text-[10px] leading-none text-gold">┘</span>
      </div>

      {/* Click-catcher so the page underneath isn't interactive mid-tour. */}
      <div className="absolute inset-0" onClick={() => {}} />

      <div
        className="absolute max-w-sm w-[calc(100vw-2rem)] border border-gold/60 bg-ink p-4 shadow-glow"
        style={{
          left: Math.min(Math.max(rect.left, 16), window.innerWidth - 400),
          top: cardBelow ? rect.bottom + pad + 12 : undefined,
          bottom: cardBelow ? undefined : window.innerHeight - rect.top + pad + 12,
        }}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="stamp">{step.title}</span>
          <span className="font-mono text-[10px] text-bone/40 tracking-widest">
            {idx + 1}/{live.length}
          </span>
        </div>
        <p className="font-mono text-xs text-bone/80 leading-relaxed">{step.body}</p>
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={close}
            className="font-mono text-[11px] uppercase tracking-widest text-bone/40 hover:text-rust transition"
          >
            skip --tour
          </button>
          <button
            onClick={() => (last ? close() : setIdx(idx + 1))}
            className="font-mono text-[11px] uppercase tracking-widest border border-gold text-gold hover:bg-gold hover:text-obsidian transition px-4 py-2"
          >
            {last ? "start →" : "next →"}
          </button>
        </div>
      </div>
    </div>
  );
}
