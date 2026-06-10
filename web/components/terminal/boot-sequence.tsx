"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";

/**
 * BootSequence — types a list of boot lines in sequence, then reveals its
 * children with a soft boot-in.
 *
 * On mount each line in `lines` appears one after another (~140ms stagger),
 * prefixed with `> `. Any trailing status token in a line — `ok`, `online`,
 * `ready`, `done` — is lifted into phosphor so the readout looks like a real
 * system check. Once every line has landed, `children` fade up via
 * `animate-boot-in`.
 *
 * Accessibility: when the user prefers reduced motion, all lines and the
 * children render at once with no typing. The sequence never blocks
 * interaction — children mount immediately in the reduced-motion path, and in
 * the animated path they are revealed (not gated) right after the lines.
 */
const STAGGER_MS = 140;
const STATUS_TOKENS = ["ok", "online", "ready", "done"];

function StatusLine({ text }: { text: string }): JSX.Element {
  // Split a trailing status token (e.g. "...connected ok") so it can glow.
  const trimmed = text.trimEnd();
  const lastSpace = trimmed.lastIndexOf(" ");
  const tail = lastSpace >= 0 ? trimmed.slice(lastSpace + 1) : trimmed;
  const head = lastSpace >= 0 ? trimmed.slice(0, lastSpace + 1) : "";
  const isStatus = STATUS_TOKENS.includes(tail.toLowerCase());

  return (
    <div className="font-mono text-xs text-bone/80">
      <span aria-hidden="true" className="mr-1 text-gold/60">
        &gt;
      </span>
      {isStatus ? (
        <>
          <span>{head}</span>
          <span className="text-phosphor">{tail}</span>
        </>
      ) : (
        <span>{trimmed}</span>
      )}
    </div>
  );
}

export function BootSequence({
  lines,
  children,
  className = "",
}: {
  lines: string[];
  children: ReactNode;
  className?: string;
}): JSX.Element {
  // How many lines are currently visible. Start with all of them so the very
  // first paint (and the reduced-motion path) shows the full sequence; the
  // effect rewinds to a typed reveal only when motion is allowed.
  const [visibleCount, setVisibleCount] = useState<number>(lines.length);
  const [revealChildren, setRevealChildren] = useState<boolean>(true);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setVisibleCount(lines.length);
      setRevealChildren(true);
      return;
    }

    // Animated path: rewind, then type each line on a stagger.
    setVisibleCount(0);
    setRevealChildren(false);

    lines.forEach((_, i) => {
      timers.current.push(
        setTimeout(() => setVisibleCount(i + 1), STAGGER_MS * (i + 1))
      );
    });
    timers.current.push(
      setTimeout(
        () => setRevealChildren(true),
        STAGGER_MS * (lines.length + 1)
      )
    );

    const pending = timers.current;
    return () => {
      pending.forEach(clearTimeout);
      timers.current = [];
    };
  }, [lines]);

  return (
    <div className={className}>
      {lines.length > 0 && (
        <div className="space-y-1" aria-hidden={!revealChildren}>
          {lines.slice(0, visibleCount).map((line, i) => (
            <StatusLine key={i} text={line} />
          ))}
        </div>
      )}
      {revealChildren && (
        <div className="motion-safe:animate-boot-in">{children}</div>
      )}
    </div>
  );
}
