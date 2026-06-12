"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { clamp, relPointer } from "./fx-math";
import { useFxEnabled } from "./use-fx-enabled";

const MAX_PX = 5;     // spec: máximo 5px
const LERP = 0.12;    // spec: factor 0.12

/** Spring sutil hacia el cursor — SOLO para el CTA primario (spec).
 *  Mismo patrón rAF-lerp que Tilt. */
export function Magnetic({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useFxEnabled();
  const target = useRef({ x: 0, y: 0 });
  const current = useRef({ x: 0, y: 0 });
  const raf = useRef(0);

  const tick = () => {
    const el = ref.current;
    if (!el) return;
    const c = current.current;
    const t = target.current;
    c.x += (t.x - c.x) * LERP;
    c.y += (t.y - c.y) * LERP;
    el.style.transform = `translate3d(${c.x.toFixed(2)}px, ${c.y.toFixed(2)}px, 0)`;
    const settled = Math.abs(c.x - t.x) < 0.05 && Math.abs(c.y - t.y) < 0.05;
    // parar SIEMPRE al asentarse (mismo fix que tilt.tsx — sin rAF idle a 60fps);
    // onMove/onLeave rearrancan con start(). transform se limpia solo en reposo real.
    raf.current = settled ? 0 : requestAnimationFrame(tick);
    if (settled && t.x === 0 && t.y === 0) el.style.transform = "";
  };
  const start = () => { if (!raf.current) raf.current = requestAnimationFrame(tick); };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const { nx, ny } = relPointer(el.getBoundingClientRect(), e.clientX, e.clientY);
    target.current = { x: clamp(nx, -1, 1) * MAX_PX, y: clamp(ny, -1, 1) * MAX_PX };
    start();
  };
  const onLeave = () => { target.current = { x: 0, y: 0 }; start(); };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div
      ref={ref}
      onMouseMove={enabled ? onMove : undefined}
      onMouseLeave={enabled ? onLeave : undefined}
      className={`inline-flex will-change-transform ${className}`}
    >
      {children}
    </div>
  );
}
