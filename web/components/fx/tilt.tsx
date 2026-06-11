"use client";
import { useEffect, useRef, type ReactNode } from "react";
import { clamp, relPointer } from "./fx-math";
import { useFxEnabled } from "./use-fx-enabled";

const MAX_DEG = 4;    // spec: máximo 4°
const LERP = 0.12;

/** Tilt 3D hacia el cursor con barrido especular. rAF-lerp en refs,
 *  arranca el loop solo en hover y lo corta al asentarse. */
export function Tilt({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const enabled = useFxEnabled();
  const target = useRef({ rx: 0, ry: 0 });
  const current = useRef({ rx: 0, ry: 0 });
  const raf = useRef(0);

  const tick = () => {
    const el = ref.current;
    if (!el) return;
    const c = current.current;
    const t = target.current;
    c.rx += (t.rx - c.rx) * LERP;
    c.ry += (t.ry - c.ry) * LERP;
    el.style.transform = `perspective(800px) rotateX(${c.rx.toFixed(2)}deg) rotateY(${c.ry.toFixed(2)}deg)`;
    const settled = Math.abs(c.rx - t.rx) < 0.01 && Math.abs(c.ry - t.ry) < 0.01;
    raf.current = settled && t.rx === 0 && t.ry === 0 ? 0 : requestAnimationFrame(tick);
    if (settled && t.rx === 0 && t.ry === 0) el.style.transform = "";
  };
  const start = () => { if (!raf.current) raf.current = requestAnimationFrame(tick); };

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const { mx, my, nx, ny } = relPointer(el.getBoundingClientRect(), e.clientX, e.clientY);
    target.current = { rx: clamp(ny, -1, 1) * -MAX_DEG, ry: clamp(nx, -1, 1) * MAX_DEG };
    el.style.setProperty("--mx", `${mx}px`);
    el.style.setProperty("--my", `${my}px`);
    start();
  };
  const onLeave = () => { target.current = { rx: 0, ry: 0 }; start(); };

  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return (
    <div
      ref={ref}
      onMouseMove={enabled ? onMove : undefined}
      onMouseLeave={enabled ? onLeave : undefined}
      className={`sawfx-tilt relative will-change-transform ${className}`}
    >
      {children}
      <div aria-hidden className="sawfx-spec pointer-events-none absolute inset-0 z-10" />
    </div>
  );
}
