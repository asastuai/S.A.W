"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Scroll-reveal wrapper: the child rises and resolves into focus the first
 * time it enters the viewport — the cinematic "the next scene resolves in"
 * beat. Reveals once, then stays.
 *
 * FAIL-OPEN by design: content must NEVER stay hidden. It reveals
 * immediately if it's already in/near the viewport on mount, on scroll if
 * it's below the fold, and unconditionally after a short safety timeout — so
 * a missed IntersectionObserver callback can never strand a section at
 * opacity-0. Honors prefers-reduced-motion (shows immediately, no motion).
 */
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: ReactNode;
  /** Stagger, in ms, for sequencing sibling reveals. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduce = window.matchMedia?.(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduce || typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }

    // Already in (or just above) the viewport on mount → reveal now. Covers
    // above-the-fold sections and any element the observer would otherwise
    // report late.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.95 && rect.bottom > 0) {
      setShown(true);
      return;
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true);
          io.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -6% 0px" }
    );
    io.observe(el);

    // Safety net: never leave content hidden, even if the observer never
    // fires (flaky scroll containers, prerender quirks, etc.).
    const t = setTimeout(() => setShown(true), 1800);

    return () => {
      io.disconnect();
      clearTimeout(t);
    };
  }, []);

  return (
    <div
      ref={ref}
      className={`${className} ${shown ? "animate-reveal" : "opacity-0"}`}
      style={shown && delay ? { animationDelay: `${delay}ms` } : undefined}
    >
      {children}
    </div>
  );
}
