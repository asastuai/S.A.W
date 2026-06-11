"use client";
import { useRef, type ReactNode } from "react";
import { relPointer } from "./fx-math";
import { useFxEnabled } from "./use-fx-enabled";

/** Glow dorado que sigue al cursor dentro de la card, via CSS vars
 *  seteadas por ref directo (cero re-renders). Prop brackets: corner
 *  brackets HUD que se extienden y lockean al hover. Presentation-only. */
export function Spotlight({
  children,
  brackets = false,
  className = "",
}: {
  children: ReactNode;
  brackets?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useFxEnabled();

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const { mx, my } = relPointer(el.getBoundingClientRect(), e.clientX, e.clientY);
    el.style.setProperty("--mx", `${mx}px`);
    el.style.setProperty("--my", `${my}px`);
  };

  return (
    <div
      ref={ref}
      onMouseMove={enabled ? onMove : undefined}
      className={`sawfx-spot group/spot relative ${className}`}
    >
      {children}
      <div aria-hidden className="sawfx-spot-glow pointer-events-none absolute inset-0 z-10" />
      {brackets && (
        <>
          <span aria-hidden className="sawfx-bracket sawfx-br-tl" />
          <span aria-hidden className="sawfx-bracket sawfx-br-tr" />
          <span aria-hidden className="sawfx-bracket sawfx-br-bl" />
          <span aria-hidden className="sawfx-bracket sawfx-br-br" />
        </>
      )}
    </div>
  );
}
