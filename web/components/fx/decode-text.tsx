"use client";
import { useEffect, useRef, useState } from "react";
import { scrambleFrame } from "./fx-math";
import { useFxEnabled } from "./use-fx-enabled";

const DURATION_MS = 350; // spec

/** Al hover, el texto se "descifra": scramble que se asienta de izquierda
 *  a derecha en ~350ms. El layout no salta: ancho fijado por el texto real
 *  invisible + overlay absoluto. rng inyectable para tests. */
export function DecodeText({
  text,
  className = "",
  rng = Math.random,
}: {
  text: string;
  className?: string;
  rng?: () => number;
}) {
  const [display, setDisplay] = useState(text);
  const enabled = useFxEnabled();
  const raf = useRef(0);
  const startAt = useRef(0);

  const tick = (now: number) => {
    const progress = (now - startAt.current) / DURATION_MS;
    if (progress >= 1) {
      setDisplay(text);
      raf.current = 0;
      return;
    }
    setDisplay(scrambleFrame(text, progress, rng));
    raf.current = requestAnimationFrame(tick);
  };

  const onEnter = () => {
    if (raf.current) return; // ya descifrando
    startAt.current = performance.now();
    raf.current = requestAnimationFrame(tick);
  };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <span
      aria-label={text}
      onMouseEnter={enabled ? onEnter : undefined}
      className={`relative inline-block ${className}`}
    >
      <span aria-hidden className="invisible">
        {text}
      </span>
      <span aria-hidden className="absolute inset-0">
        {display}
      </span>
    </span>
  );
}
