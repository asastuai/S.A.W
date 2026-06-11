# Landing Pro Details + Aware Hologram — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Micro-interacciones de hover "pro" en la landing (spotlight scanner, brackets, tilt, decode, CTA magnético) y operative hologram que nota el cursor (near=tracking de cabeza, over=glow/scale/glitch).

**Architecture:** 4 wrappers FX presentacionales en `web/components/fx/` que componen alrededor del JSX existente sin tocar props ni lógica (guardrail Operator Console). Math puro en `fx-math.ts` (testeable), estado en refs + rAF (cero setState en mousemove). El hologram extiende su patrón `poseRef` existente con un `pointerRef`.

**Tech Stack:** React 18 / Next 14, Tailwind + globals.css, @react-three/fiber (hologram), vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-06-11-landing-pro-details-design.md`

---

## Reglas duras (del spec — NO negociables)

1. **Piel cambia, cableado NO**: ni una prop pública, fetch, hook de datos o schema se toca. Solo wrappers + className + CSS.
2. **Doble kill-switch en los 4 FX**: `prefers-reduced-motion: reduce` (CSS + hook) y `pointer: coarse` (listeners ni se cuelgan).
3. **Cero setState en handlers de mousemove** — refs + rAF + CSS vars via `style.setProperty`.
4. Solo `transform`/`opacity` (compositor-friendly), listeners `passive: true`.
5. API de `Mascot` intacta — la reactividad del hologram es interna.

## File Structure

```
CREATE:
  web/components/fx/fx-math.ts          — helpers puros (Task 1)
  web/components/fx/fx-math.test.ts
  web/components/fx/use-fx-enabled.ts   — hook kill-switch (Task 1)
  web/components/fx/spotlight.tsx       — glow que sigue cursor + brackets (Task 2)
  web/components/fx/tilt.tsx            — tilt 3D + specular (Task 3)
  web/components/fx/magnetic.tsx        — spring del CTA (Task 4)
  web/components/fx/decode-text.tsx     — scramble de labels (Task 5)
  web/tests/e2e/landing-fx.spec.ts      — e2e (Task 7)

MODIFY:
  web/app/globals.css                   — bloque .sawfx-* (Task 2)
  web/app/page.tssx → page.tsx          — aplicar wrappers (Tasks 2-5)
  web/components/operative-hologram.tsx — pointer awareness (Task 6)
```

Convenciones repo: WSL `~/projects/saw`; unit `cd web && pnpm vitest run`; e2e `pnpm test:e2e`; commits en main, single-line ok.

---

### Task 1: fx-math + useFxEnabled (la base testeable)

**Files:**
- Create: `web/components/fx/fx-math.ts`, `web/components/fx/fx-math.test.ts`, `web/components/fx/use-fx-enabled.ts`

- [ ] **Step 1: Tests que fallan**

```typescript
// web/components/fx/fx-math.test.ts
import { describe, it, expect } from "vitest";
import { clamp, relPointer, lookTarget, scrambleFrame } from "./fx-math";

describe("clamp", () => {
  it("clampa a los bordes", () => {
    expect(clamp(5, -1, 1)).toBe(1);
    expect(clamp(-5, -1, 1)).toBe(-1);
    expect(clamp(0.3, -1, 1)).toBe(0.3);
  });
});

describe("relPointer", () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 } as DOMRect;
  it("centro → nx=0, ny=0, mx/my en px locales", () => {
    expect(relPointer(rect, 200, 100)).toEqual({ mx: 100, my: 50, nx: 0, ny: 0 });
  });
  it("esquina inferior derecha → nx=1, ny=1", () => {
    const r = relPointer(rect, 300, 150);
    expect(r.nx).toBe(1);
    expect(r.ny).toBe(1);
  });
  it("fuera del rect → nx/ny > 1 (sin clamp — near zone los usa)", () => {
    expect(relPointer(rect, 400, 100).nx).toBe(2);
  });
});

describe("lookTarget", () => {
  it("clampa yaw a ±0.45 y pitch a ±0.25 (spec hologram)", () => {
    expect(lookTarget(2, 2)).toEqual({ yaw: 0.45, pitch: -0.25 });
    expect(lookTarget(-2, -2)).toEqual({ yaw: -0.45, pitch: 0.25 });
  });
  it("dentro del rango es lineal", () => {
    expect(lookTarget(0.5, 0)).toEqual({ yaw: 0.225, pitch: 0 });
  });
});

describe("scrambleFrame", () => {
  const rng = () => 0.42; // RNG inyectado determinístico
  it("progress 0 → todo scrambled (mismo length, distinto contenido)", () => {
    const out = scrambleFrame("DOSSIER", 0, rng);
    expect(out).toHaveLength(7);
    expect(out).not.toBe("DOSSIER");
  });
  it("progress 1 → texto original", () => {
    expect(scrambleFrame("DOSSIER", 1, rng)).toBe("DOSSIER");
  });
  it("settle de izquierda a derecha: progress 0.5 fija la primera mitad", () => {
    const out = scrambleFrame("DOSSIER", 0.5, rng);
    expect(out.slice(0, 3)).toBe("DOS");
    expect(out.slice(3)).not.toBe("SIER");
  });
  it("espacios nunca se scramblean", () => {
    expect(scrambleFrame("A B", 0, rng)[1]).toBe(" ");
  });
});
```

- [ ] **Step 2: Verificar que fallan** — Run: `cd ~/projects/saw/web && pnpm vitest run components/fx/fx-math.test.ts` → Expected: FAIL module not found.

- [ ] **Step 3: Implementar**

```typescript
// web/components/fx/fx-math.ts
// Math puro de los FX de hover — sin DOM, sin React. Testeable.

export function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/** Posición del puntero relativa a un rect: mx/my en px locales,
 *  nx/ny normalizados al RADIO (-1..1 dentro; >1 fuera — la near zone
 *  del hologram usa valores sin clamp). */
export function relPointer(
  rect: { left: number; top: number; width: number; height: number },
  clientX: number,
  clientY: number
): { mx: number; my: number; nx: number; ny: number } {
  const mx = clientX - rect.left;
  const my = clientY - rect.top;
  return {
    mx,
    my,
    nx: (mx - rect.width / 2) / (rect.width / 2),
    ny: (my - rect.height / 2) / (rect.height / 2),
  };
}

/** Target de mirada del hologram (spec: clamp ±0.45 rad yaw / ±0.25 rad pitch).
 *  ny positivo (cursor abajo) → pitch negativo (mirar abajo). */
export function lookTarget(nx: number, ny: number): { yaw: number; pitch: number } {
  return { yaw: clamp(nx, -1, 1) * 0.45, pitch: clamp(ny, -1, 1) * -0.25 };
}

const SCRAMBLE_CHARSET = "!<>-_\\/[]{}=+*^?#";

/** Un frame del efecto decode: los primeros floor(progress*len) chars están
 *  asentados, el resto scrambled. Espacios intactos. RNG inyectable. */
export function scrambleFrame(text: string, progress: number, rng: () => number): string {
  const settled = Math.floor(clamp(progress, 0, 1) * text.length);
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (i < settled || c === " ") out += c;
    else out += SCRAMBLE_CHARSET[Math.floor(rng() * SCRAMBLE_CHARSET.length)];
  }
  return out;
}
```

```typescript
// web/components/fx/use-fx-enabled.ts
"use client";
import { useEffect, useState } from "react";

/** Doble kill-switch del spec: FX solo con pointer fine Y sin reduced-motion.
 *  false en SSR y hasta el primer effect (los FX arrancan apagados). */
export function useFxEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia("(pointer: fine)");
    const motion = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setEnabled(fine.matches && !motion.matches);
    update();
    fine.addEventListener("change", update);
    motion.addEventListener("change", update);
    return () => {
      fine.removeEventListener("change", update);
      motion.removeEventListener("change", update);
    };
  }, []);
  return enabled;
}
```

- [ ] **Step 4: Tests pasan** — Run: `pnpm vitest run components/fx/fx-math.test.ts` → Expected: 9 passed.

- [ ] **Step 5: Commit** — `git add web/components/fx/ && git commit -m "feat(fx): pure hover-fx math + double kill-switch hook"`

---

### Task 2: Spotlight + brackets → numbered cards y bottom cards

**Files:**
- Create: `web/components/fx/spotlight.tsx`
- Modify: `web/app/globals.css` (bloque al final)
- Modify: `web/app/page.tsx` — numbered cards (~línea 234) y bottom cards (~línea 533, **borrar el blob estático** ~líneas 538-541)

- [ ] **Step 1: Componente**

```tsx
// web/components/fx/spotlight.tsx
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
```

- [ ] **Step 2: CSS en `web/app/globals.css`** (agregar al final del archivo)

```css
/* ── sawfx: hover micro-interactions (spec 2026-06-11) ─────────────── */
.sawfx-spot-glow {
  opacity: 0;
  transition: opacity 300ms ease;
  background: radial-gradient(
    180px circle at var(--mx, 50%) var(--my, 50%),
    rgba(240, 180, 41, 0.1),
    transparent 70%
  );
}
.sawfx-spot:hover .sawfx-spot-glow { opacity: 1; }

.sawfx-bracket {
  pointer-events: none;
  position: absolute;
  z-index: 20;
  width: 10px;
  height: 10px;
  opacity: 0;
  border: 0 solid rgba(240, 180, 41, 0.7);
  transition: width 250ms ease, height 250ms ease, opacity 250ms ease;
}
.sawfx-br-tl { top: -1px; left: -1px; border-top-width: 1px; border-left-width: 1px; }
.sawfx-br-tr { top: -1px; right: -1px; border-top-width: 1px; border-right-width: 1px; }
.sawfx-br-bl { bottom: -1px; left: -1px; border-bottom-width: 1px; border-left-width: 1px; }
.sawfx-br-br { bottom: -1px; right: -1px; border-bottom-width: 1px; border-right-width: 1px; }
.sawfx-spot:hover .sawfx-bracket { width: 22px; height: 22px; opacity: 1; }

.sawfx-spec {
  opacity: 0;
  transition: opacity 300ms ease;
  background: linear-gradient(
    115deg,
    transparent 30%,
    rgba(240, 180, 41, 0.06) 48%,
    rgba(255, 235, 190, 0.09) 50%,
    rgba(240, 180, 41, 0.06) 52%,
    transparent 70%
  );
}
.sawfx-tilt:hover .sawfx-spec { opacity: 1; }

@media (prefers-reduced-motion: reduce) {
  .sawfx-spot-glow, .sawfx-bracket, .sawfx-spec { transition: none; }
  .sawfx-bracket { opacity: 0 !important; }
}
```

- [ ] **Step 3: Aplicar en `page.tsx`** — import `{ Spotlight } from "@/components/fx/spotlight"`.

Numbered cards (steps.map, ~línea 234): envolver el `TerminalPanel` (el `Reveal` queda afuera):

```tsx
<Reveal key={s.n} delay={i * 120}>
  <Spotlight brackets className="h-full">
    <TerminalPanel label={`[${s.n}]`} className="group h-full p-7 pt-9 transition-colors hover:bg-smoke">
      {/* …contenido EXACTAMENTE igual… */}
    </TerminalPanel>
  </Spotlight>
</Reveal>
```

Bottom cards (features.map, ~línea 533): mismo wrap con `brackets`, y **BORRAR** el div del blob estático (`pointer-events-none absolute -right-12 -top-12 h-32 w-32 rounded-full bg-gold/0 blur-2xl …group-hover:bg-gold/[0.08]`) — el spotlight lo reemplaza (spec).

- [ ] **Step 4: Verificar** — Run: `pnpm vitest run && npx tsc --noEmit` → PASS/sin errores. Visual: `pnpm dev`, hover sobre una card → glow sigue al cursor, brackets se extienden.

- [ ] **Step 5: Commit** — `git add web/components/fx/spotlight.tsx web/app/globals.css web/app/page.tsx && git commit -m "feat(fx): cursor spotlight + locking brackets on landing cards"`

---

### Task 3: Tilt 3D → feature tiles

**Files:**
- Create: `web/components/fx/tilt.tsx`
- Modify: `web/app/page.tsx` — feature tiles (skills.map, ~línea 340)

- [ ] **Step 1: Componente**

```tsx
// web/components/fx/tilt.tsx
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
```

- [ ] **Step 2: Aplicar** — feature tiles (skills.map ~línea 340). El spec pide spotlight en LAS TRES grillas + tilt en las tiles → acá se anidan (Spotlight adentro, el glow viaja con la card inclinada):

```tsx
<Reveal key={s.title} delay={220 + i * 120}>
  <Tilt className="h-full">
    <Spotlight className="h-full">
      <TerminalPanel className="group h-full p-6 transition-colors hover:bg-smoke">
        {/* …contenido EXACTAMENTE igual… */}
      </TerminalPanel>
    </Spotlight>
  </Tilt>
</Reveal>
```

(El CSS `.sawfx-spec`/`.sawfx-tilt` ya quedó en globals.css en Task 2.)

- [ ] **Step 3: Verificar** — `npx tsc --noEmit` + visual: tile se inclina ≤4° hacia el cursor con barrido dorado, vuelve sola al salir.

- [ ] **Step 4: Commit** — `git add web/components/fx/tilt.tsx web/app/page.tsx && git commit -m "feat(fx): 3D tilt + specular sweep on feature tiles"`

---

### Task 4: Magnetic → CTA primario

**Files:**
- Create: `web/components/fx/magnetic.tsx`
- Modify: `web/app/page.tsx` — CTA `saw run --dossier` (~línea 137)

- [ ] **Step 1: Componente**

```tsx
// web/components/fx/magnetic.tsx
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
    raf.current = settled && t.x === 0 && t.y === 0 ? 0 : requestAnimationFrame(tick);
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
```

- [ ] **Step 2: Aplicar** — envolver SOLO el primer `<Link href="/demo" …>` (el CTA `saw run --dossier`, ~línea 137) en `<Magnetic>…</Magnetic>`. El link de `git clone` NO se toca (spec YAGNI).

- [ ] **Step 3: Verificar** — visual: el CTA se acerca ≤5px al cursor y vuelve con spring al salir. `npx tsc --noEmit` limpio.

- [ ] **Step 4: Commit** — `git add web/components/fx/magnetic.tsx web/app/page.tsx && git commit -m "feat(fx): magnetic primary CTA"`

---

### Task 5: DecodeText → kickers de sección

**Files:**
- Create: `web/components/fx/decode-text.tsx`
- Modify: `web/app/page.tsx` — kickers mono `tracking-[0.3em]` (líneas ~164, ~216, ~285 y los análogos de las secciones restantes — buscar con `grep -n "tracking-\[0.3em\]" web/app/page.tsx`)

- [ ] **Step 1: Componente**

```tsx
// web/components/fx/decode-text.tsx
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
    <span onMouseEnter={enabled ? onEnter : undefined} className={`relative inline-block ${className}`}>
      <span aria-hidden className="invisible">{text}</span>
      <span className="absolute inset-0">{display}</span>
    </span>
  );
}
```

Nota: acá sí hay setState — pero en un rAF acotado a 350ms sobre un span de texto, no en mousemove continuo. Cumple la regla (la regla prohíbe setState *por movimiento de mouse*).

- [ ] **Step 2: Aplicar** — en cada kicker encontrado, envolver el texto: `<p className="…"><DecodeText text="section.brief // how it works" /></p>` (usar el string literal real de cada kicker; si el kicker tiene children compuestos, extraer solo el texto plano a la prop).

- [ ] **Step 3: Verificar** — `pnpm vitest run` (scrambleFrame ya testeado en Task 1) + visual: hover sobre un kicker → decode sin saltos de layout.

- [ ] **Step 4: Commit** — `git add web/components/fx/decode-text.tsx web/app/page.tsx && git commit -m "feat(fx): decode-on-hover section kickers"`

---

### Task 6: Hologram consciente + contacto

**Files:**
- Modify: `web/components/operative-hologram.tsx`

- [ ] **Step 1: pointerRef + listener en el wrapper** — en `OperativeHologram` (~línea 125), junto al `poseRef` existente:

```tsx
const wrapRef = useRef<HTMLDivElement>(null);
const pointerRef = useRef({ nx: 0, ny: 0, near: false, over: false });

useEffect(() => {
  // pointer fine only — qualifies3D ya filtra touch chico, esto cubre tablets
  if (!window.matchMedia("(pointer: fine)").matches) return;
  const onMove = (e: MouseEvent) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const { nx, ny } = relPointer(rect, e.clientX, e.clientY);
    const dist = Math.hypot(nx, ny);
    const p = pointerRef.current;
    p.nx = nx;
    p.ny = ny;
    p.near = dist <= 1.5;             // spec: <1.5× del radio del panel
    p.over = Math.abs(nx) <= 1 && Math.abs(ny) <= 1;
  };
  window.addEventListener("mousemove", onMove, { passive: true });
  return () => window.removeEventListener("mousemove", onMove);
}, []);
```

(import `{ relPointer, lookTarget } from "./fx/fx-math"`). Poner `ref={wrapRef}` en el div wrapper existente del Canvas y pasar `pointerRef` a `<Rig poseRef={poseRef} pointerRef={pointerRef} />`.

- [ ] **Step 2: Reacción en el `useFrame` de `Rig`** — firma: `function Rig({ poseRef, pointerRef }: { poseRef: …; pointerRef: React.MutableRefObject<{ nx: number; ny: number; near: boolean; over: boolean }> })`. Refs nuevos al lado de `blink`:

```tsx
const spinFactor = useRef(1);     // 1 = spin libre, →0 cuando near (atención)
const glowBoost = useRef(0);      // +0.25 cuando over
const scaleRef = useRef(1);       // →1.04 cuando over
const prevOver = useRef(false);
```

Dentro del `useFrame`, DESPUÉS del bloque de spin existente, reemplazar la línea `g.rotation.y += delta * p.speed;` por:

```tsx
const ptr = pointerRef.current;
// near → la atención frena el spin y la cabeza sigue el cursor.
// (spec dice ~35%: implementado como decay→0 mientras trackea — un spin
// residual pelearía contra el look-at; la vida la pone el bob. Desvío
// consciente documentado.)
spinFactor.current = THREE.MathUtils.lerp(spinFactor.current, ptr.near ? 0 : 1, 0.05);
g.rotation.y += delta * p.speed * spinFactor.current;
if (ptr.near) {
  const look = lookTarget(ptr.nx, ptr.ny);
  // normalizar el yaw acumulado a [-π, π] para lerpear por el camino corto
  const yaw = Math.atan2(Math.sin(g.rotation.y), Math.cos(g.rotation.y));
  g.rotation.y = THREE.MathUtils.lerp(yaw, look.yaw, 0.08 * (1 - spinFactor.current));
  g.rotation.x = THREE.MathUtils.lerp(g.rotation.x, p.pitch + look.pitch, 0.08);
}
```

Y DESPUÉS del bloque de glow existente (`bodyMaterial.opacity = glowRef.current;`), agregar:

```tsx
// over → glow boost + scale + glitch de saludo en el rising edge
glowBoost.current = THREE.MathUtils.lerp(glowBoost.current, ptr.over ? 0.25 : 0, 0.08);
bodyMaterial.opacity = Math.min(1, glowRef.current + glowBoost.current);
scaleRef.current = THREE.MathUtils.lerp(scaleRef.current, ptr.over ? 1.04 : 1, 0.08);
g.scale.setScalar(scaleRef.current);
if (ptr.over && !prevOver.current && blink.current.until === 0) {
  blink.current.next = t; // dispara el glitch holográfico existente YA
}
prevOver.current = ptr.over;
```

- [ ] **Step 3: Fallback SVG glow bump** — en `mascot.tsx`, al `<MascotSvgBody …/>` del render (~línea 192), envolver con la clase de hover CSS: agregar al wrapper existente del cuerpo `transition-[filter] duration-300 hover:drop-shadow-gold` (token ya existe en tailwind.config). Sin JS.

- [ ] **Step 4: Verificar** — `npx tsc --noEmit` limpio. Visual en `/demo`: acercar el cursor al panel → la cabeza te sigue y el spin se calma; hover directo → glow sube, scale 1.04, glitch de saludo; salir → vuelve solo. Las poses (executing, sleeping…) siguen funcionando — la reactividad se SUMA, no reemplaza.

- [ ] **Step 5: Commit** — `git add web/components/operative-hologram.tsx web/components/mascot.tsx && git commit -m "feat(mascot): pointer-aware hologram — head tracking near, glow+glitch on contact"`

---

### Task 7: e2e + verificación final

**Files:**
- Create: `web/tests/e2e/landing-fx.spec.ts`

- [ ] **Step 1: e2e**

```typescript
// web/tests/e2e/landing-fx.spec.ts
import { test, expect } from "@playwright/test";

test("spotlight: hover sobre una card no rompe layout y activa el glow", async ({ page }) => {
  await page.goto("/");
  const card = page.locator(".sawfx-spot").first();
  await card.scrollIntoViewIfNeeded();
  const before = await card.boundingBox();
  await card.hover();
  const glow = card.locator(".sawfx-spot-glow");
  await expect(glow).toHaveCSS("opacity", "1");
  const after = await card.boundingBox();
  expect(after!.width).toBe(before!.width); // sin layout shift
});

test("reduced-motion: brackets quedan apagados", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const card = page.locator(".sawfx-spot").first();
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await expect(card.locator(".sawfx-bracket").first()).toHaveCSS("opacity", "0");
});

test("CTA magnético presente y clickeable", async ({ page }) => {
  await page.goto("/");
  const cta = page.getByRole("link", { name: /saw run/ });
  await cta.hover();
  await expect(cta).toBeVisible(); // el wrapper no rompe el link
});
```

- [ ] **Step 2: Suite completa (evidencia antes de declarar éxito)**

```bash
cd ~/projects/saw/web && pnpm vitest run && pnpm lint && pnpm build && pnpm test:e2e
```

Expected: todo verde. Manual final: DevTools → emular `prefers-reduced-motion` → cero transforms; emular touch → sin listeners.

- [ ] **Step 3: Commit** — `git add web/tests/e2e/landing-fx.spec.ts && git commit -m "test(fx): landing hover e2e + reduced-motion guard"`

---

## Fuera de scope (NO implementar — spec §YAGNI)

Spotlight/tilt/decode en `/demo`; tracking global del mascot; magnetismo fuera del CTA primario; efectos de scroll; cambios al SVG fallback más allá del glow CSS.

## Orden

Task 1 → 2 → 3 → 4 → 5 (independientes entre sí tras 1-2) → 6 (solo depende de 1) → 7 (final).
