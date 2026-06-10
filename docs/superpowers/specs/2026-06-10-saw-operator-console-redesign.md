# SAW — Operator Console redesign (spec)

**Date:** 2026-06-10
**Author:** Juan Cruz Maisú + Claude (Opus 4.8)
**Status:** Approved — build by multi-agent team

## Intent

Reinventar la piel de la landing + el demo de SAW desde cero a una estética
**Operator Console**: una terminal de operador clasificada premium. El usuario es
el *handler* logueado en el sistema; toda la experiencia se siente como una
TUI/CLI de alta gama. Reemplaza por completo la piel "cinematic-noir" anterior.

**Bien distinta visualmente. Backend/lógica intactos.** Esta es la regla dura.

## The hard guardrail (NON-NEGOTIABLE)

La piel cambia, el cableado NO. Cada agente DEBE respetar esto:

1. **No tocar lógica.** Nada de wallet adapters, firmas, `sawClient`, fetch/API
   calls, hooks de estado, cron, props de datos, schemas, o flujos de auth.
   Solo cambian: JSX de presentación, className/Tailwind, markup de layout,
   y se agregan componentes de chrome puramente visuales.
2. **No cambiar interfaces.** Las props de los componentes existentes y sus
   imports/exports se mantienen idénticos. Si un componente recibe `messages`,
   `onSend`, `busy` — siguen igual. Solo cambia cómo se renderiza.
3. **No romper el build.** TypeScript debe seguir compilando. No se borran
   imports usados ni se renombran símbolos exportados.
4. **Motion accesible.** Todo movimiento detrás de `prefers-reduced-motion`
   (ya hay guard global en globals.css). Boot sequences cortos y salteables.
   Simplificar el chrome pesado en mobile.

Si un cambio visual requiere tocar lógica, el agente lo ANOTA y lo deja como
está — no improvisa sobre el backend.

## Design system (Operator Console)

### Typography — mono protagonista
Reemplaza Oswald + Inter por completo. Vía `next/font/google` en `layout.tsx`:

- **Display** (`--font-display`, clase `font-display`): **Martian Mono** —
  ancha, técnica, militar. Para el hero ("BE THE HANDLER"), números de panel
  `[01]`, y títulos de sección cortos. Weights: 400, 600, 700, 800.
- **Mono / body** (`--font-sans` y `--font-mono`, clases `font-sans`/`font-mono`):
  **IBM Plex Mono** — cuerpo, UI, readouts, comandos, todo. Weights: 400, 500,
  600. Es la voz por defecto: el sitio entero es monospace.

En `tailwind.config.ts`, `fontFamily.mono` también apunta a `var(--font-sans)`
(IBM Plex Mono) para que las clases `font-mono` existentes hereden la nueva voz.

### Color tokens — mismos nombres, nuevos valores
Editar SOLO los valores en `tailwind.config.ts`. Mantener los nombres para que
todo componente que ya usa `text-gold`/`bg-ink`/etc. se re-skinee solo:

| token | antes | **ahora** | rol |
|---|---|---|---|
| `obsidian` | #060608 | **#070708** | base bg del sitio |
| `ink` | #0a0a0a | **#0c0d11** | base de paneles |
| `smoke` | #1a1a1a | **#14161b** | paneles elevados / inputs |
| `ash` | #2a2a2a | **#262a32** | bordes (border-ash) |
| `bone` | #e8e4d8 | **#d6d2c4** | texto (más frío, terminal) |
| `cream` | #f4f0e6 | **#f2eee2** | texto brillante |
| `rust` | #b7410e | **#d4512e** | warnings (más vivo) |
| `gold` | #c9a96e | **#f0b429** | brand / acción (ámbar eléctrico) |
| `goldlit` | #e7c98a | **#ffd567** | glow highlight |
| `phosphor` | — (NUEVO) | **#5ad19a** | system ok / online / readouts |

Actualizar `boxShadow.glow`/`glow-lg`, `dropShadow.gold`/`gold-lg` al nuevo oro
`rgba(240,180,41,...)`. Mantener `letterSpacing.cinema`.

### Animations — agregar al config + globals
Sumar a `tailwind.config.ts`:
- `caret`: `caret 1.05s steps(1) infinite` → keyframes `0%,50%{opacity:1} 50.01%,100%{opacity:0}` (cursor de bloque parpadeante).
- `type-line`: usado por BootSequence vía JS (no keyframe).
- `boot-in`: `boot-in 260ms ease-out both` → `0%{opacity:0;transform:translateY(4px)} 100%{opacity:1;transform:none}`.

Mantener las animaciones existentes (scan-line, reveal, intro, mascot-*, etc.).

### globals.css
- `body` background → `#070708` (obsidian), color → bone nuevo, font-family →
  `var(--font-sans)` (IBM Plex Mono).
- **Quitar** `.vignette::before` (la viñeta no es lenguaje de terminal). El
  `vignette` className sale del `<body>` en layout.tsx.
- **Mantener** `.grain` (textura CRT sutil) y `.scan-line`.
- Mantener el scrollbar noir fino (ya está — sirve igual).
- `::selection` → fondo gold nuevo (#f0b429), color obsidian.
- Mantener el guard global `prefers-reduced-motion`.
- Actualizar overrides de `.wallet-adapter-*` al nuevo oro/obsidian + mono.

## Terminal chrome components (NUEVOS) — interfaces EXACTAS

Crear en `web/components/terminal/`. Estas firmas son el contrato; los agentes
de páginas las consumen tal cual.

```tsx
// status-header.tsx  — client component
export function StatusHeader({ channel = "handler_console" }: { channel?: string }): JSX.Element
// Barra de status fija (top: 0, z alto, h ~28px) GLOBAL — va en layout.tsx
// envolviendo el contenido. Muestra:  SAW://{channel}  ·  DEVNET  ·  ● LIVE  ·
// timecode vivo HH:MM:SS (useEffect + setInterval, client). border-b border-ash,
// bg-obsidian/90 backdrop-blur, font-mono text-[11px] uppercase tracking-widest.
// El ● en phosphor. Es CHROME, no navegación.

// caret.tsx
export function Caret({ className = "" }: { className?: string }): JSX.Element
// Bloque ▋ parpadeante (animate-caret) en gold. Inline.

// readout.tsx
type ReadoutItem = { label: string; value: string; tone?: "gold" | "phosphor" | "rust" | "bone" };
export function Readout({ items, className = "" }: { items: ReadoutItem[]; className?: string }): JSX.Element
// Línea de telemetría:  label: value · label: value …  font-mono text-xs.
// label en bone/40, value en el tone (default bone). Separador "·" en ash.

// command-line.tsx
export function CommandLine({ children, prompt = "$" }: { children: React.ReactNode; prompt?: string }): JSX.Element
// Render de un comando:  <span gold>{prompt}</span> {children}  font-mono.
// children suele incluir flags resaltados; el agente compone el contenido.

// terminal-panel.tsx
export function TerminalPanel({ label, children, className = "" }: { label?: string; children: React.ReactNode; className?: string }): JSX.Element
// Box estilo TUI: border border-ash bg-ink, esquinas con marcas de bracket
// (┌ ┐ └ ┘ via pseudo o spans absolutos en gold/40). Si `label`, se muestra
// incrustado en el borde superior izquierdo:  ┤ LABEL ├  en font-mono
// text-[10px] uppercase tracking-widest text-gold. Reusable en toda la UI.

// boot-sequence.tsx  — client component
export function BootSequence({ lines, children, className = "" }: { lines: string[]; children: React.ReactNode; className?: string }): JSX.Element
// Al montar, "tipea" cada línea de `lines` en secuencia (stagger ~140ms,
// prefijo "> ", estado "ok"/"online" en phosphor si la línea lo incluye),
// luego revela `children` con animate-boot-in. Con prefers-reduced-motion:
// muestra todas las líneas + children de una. NO bloquea interacción.
```

## Page mapping (mismos elementos, otra piel)

Cada fila la toma UN agente (archivos disjuntos, sin colisión). Todos leen este
spec + usan los tokens/componentes de la foundation.

| Archivo(s) | Operator Console |
|---|---|
| `app/page.tsx` (landing) | Hero = boot + prompt (`BootSequence` con líneas de carga, "BE THE HANDLER_" con `Caret`, CTA como comando). The Protocol = 3 `TerminalPanel` `[01][02][03]`. The Operative = `whoami` / ficha `ps`. Ship Log = `git log` con hashes mono. Dossier = manifest `--help` en paneles. Footer = prompt final con `Caret`. |
| `app/demo/page.tsx` (shell) | La consola real: `StatusHeader` ya global; el layout del demo se vuelve un panel-grid de terminal. Header/nav reskineado. Sin tocar wallet/auth/estado. |
| `components/chat.tsx` + `components/opportunity-reel.tsx` | Chat = terminal interactiva (prompt `>`, mensajes como log lines, `Caret` en el input, typing como `…`). Reel = `tail -f intel` (feed de líneas con timestamp mono). Props idénticas. |
| `components/schedule-view.tsx` + `components/mascot.tsx` + `components/handler-controls.tsx` | Schedule = `scheduled jobs` / crontab view. Mascot = el operative (avatar de terminal). Controls = "OVERRIDE PANEL" con comandos peligrosos resaltados. Props/gates idénticos. |
| `app/dashboard/page.tsx` + `app/press/page.tsx` + `app/treasury/page.tsx` + `app/agent/[id]/page.tsx` + `app/connect/telegram/page.tsx` | Adaptar al chrome: secciones como `TerminalPanel`, headings mono, readouts. Toque medio — heredan tokens, suman paneles donde aporta. |

## Foundation (fase 1, un agente, bloquea al resto)

Edita: `app/layout.tsx` (fonts + StatusHeader global + body className sin
vignette), `tailwind.config.ts` (tokens + fonts + animations), `globals.css`
(body, quitar vignette, selection, wallet-adapter). Crea los 6 componentes de
`components/terminal/`. NO toca páginas. Devuelve la lista de archivos creados.

## Build phases

1. **Foundation** — 1 agente (arriba). Debe terminar antes que el resto.
2. **Pages** — 5 agentes en paralelo (filas del mapping), archivos disjuntos.
3. **Verify** — 1 agente: `tsc --noEmit` + `next build` en WSL; reporta errores.

Post-workflow: el orquestador arregla errores residuales, commitea, pushea
(Vercel auto-deploy) y muestra el resultado.

## Out of scope
- Backend, programas Anchor, SDK, API routes, DB, cron logic.
- Track 1 (Web Push) / Track 2 (Privy) — independientes, no se tocan acá.
- Copy/wording salvo lo mínimo para el framing de terminal (no reescribir mensajes de producto).
