# SAW — Cinematic Noir redesign

> Design spec. Approved 2026-06-07. Scope: **whole product**. Direction:
> **bold reinvention**. Aesthetic: **cinematic noir** (spy-thriller title
> sequence). Built with the `frontend-design` plugin's principles.

## Why this direction

SAW already leans noir but timidly: the display font is system Georgia, and
`.grain` / `.scan-line` / `flicker` already live on `<body>` but are subtle.
The bones are there and dormant. Bold reinvention = wake them to the maximum
and add a real cinematic title-sequence layer, product-wide, while keeping the
gold/ink/bone palette and the handler/operative concept.

## The system

### 1. Typography — the title sequence
- Load a real **condensed display** via `next/font` (today: Georgia). Default
  pick: **Oswald** (condensed, variable weight — movie-title energy, flexible).
  Trivial to swap (one line) if Juan wants a heavier face (Anton) or an elegant
  serif (Cormorant).
- Add **Inter** as the body sans for crispness (today: system default).
- Keep **mono** for "classified" stamps + on-chain data (dossier feel).
- Hero scale: `clamp(3rem, 12vw, 11rem)`, tight tracking, dramatic weight.

### 2. Atmosphere — film + framing
- Amplify the existing `.grain` (richer, slow drift) + add a radial **vignette**
  for cinematic framing.
- Deepen `ink` (cooler near-black); add a **gold glow** (`shadow-glow` /
  drop-shadow) for key elements; "credit-fade" gradient bands.

### 3. Motion — the title that enters
- **Intro sequence**: hero elements blur+fade in, staggered, on landing load.
- **Scroll reveals**: a `<Reveal>` wrapper (IntersectionObserver) rises +
  fades sections in as they enter view. Respects `prefers-reduced-motion`.
- Gold glow-pulse on primary CTAs; refined hover states.

### 4. Shared components (the design system)
- `tailwind.config`: display→Oswald var, sans→Inter var; new type scale;
  `shadow-glow`; keyframes (`reveal`, `glow-pulse`, `grain-drift`, `intro`).
- `globals.css`: amplified grain + vignette, base type, intro/reveal utilities.
- `app/layout.tsx`: load the fonts (next/font) + the global cinematic frame.
- Components: `<Reveal>`, restyled `Stamp`, `CTAButton` (glow), `SectionTitle`
  (title-card), `DossierCard`.

## Rollout (coherent across all pages)
1. **Foundation** — fonts, tailwind tokens, globals, shared components. (built
   sequentially; shared + interdependent)
2. **Landing `/`** — the showpiece: title-sequence hero + dramatic sections.
3. **Per-page re-skin in parallel** (distinct files): dashboard, press,
   treasury, `agent/[id]`, `connect/telegram`.
4. **Demo `/demo`** — apply the system, **keep all animations and on-chain
   logic intact** (visual layer only).

## Constraints
- Verified increments: `tsc --noEmit` + `npm run build` green after each phase.
- The demo is on-chain-critical: touch only its visual layer.
- `prefers-reduced-motion` honored everywhere (matches existing components).
- Identity anchors preserved: gold/ink/bone, the operative mascot, the
  "Be the handler" line, the "Juan Cruz Maisú ♥" signature.

## Acceptance
Every page shares the cinematic-noir system; the landing reads like a
spy-thriller title sequence; build green; no regressions; reduced-motion safe.
