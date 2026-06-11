# SAW — Landing pro details + holograma consciente (spec)

**Date:** 2026-06-11
**Author:** Juan Cruz Maisú + Claude (Opus 4.8)
**Status:** Approved — pending implementation plan

## Intent

Subir la landing de "linda" a "pro" con micro-interacciones de hover, y hacer
que el operative hologram (el agente de vectores luminosos del demo)
**reaccione al mouse**: que te note cuando te acercás y reaccione al contacto
directo. Todo dentro de la regla dura del Operator Console: **la piel cambia,
el cableado NO**.

## Decisiones resueltas (forks cerrados con Juan, 2026-06-11)

| Fork | Decisión |
|---|---|
| Carácter del mascot hover | **Consciente + contacto**: la cabeza sigue el cursor cuando está cerca del panel (proximity), y al hover directo reacciona fuerte (glitch + glow + frenada). NO tracking global permanente. |
| Paquete de interacciones landing | **A + CTA magnético**: instrumento de precisión (spotlight, brackets, tilt, decode) + UN solo elemento físico: el CTA primario magnético. |

## Componentes FX nuevos — `web/components/fx/`

Todos presentation-only, wrappers que componen alrededor del JSX existente.

| Componente | Comportamiento | Aplicación |
|---|---|---|
| `spotlight.tsx` | El glow dorado sigue al cursor dentro de la card: `onMouseMove` setea CSS vars `--mx`/`--my` **via ref directo al DOM (cero setState)**; overlay con `radial-gradient` en esa posición. Prop `brackets`: corner brackets que se extienden y "lockean" al hover (transición CSS). | Las 3 grillas de cards de la landing (numbered cards, feature tiles, bottom cards — en esta última reemplaza el blob estático actual) |
| `tilt.tsx` | Inclinación 3D hacia el cursor: rAF-lerp de `rotateX/rotateY`, **máximo 4°**, con barrido especular dorado (gradient overlay atado a las mismas vars). Vuelve a 0 al salir. | Feature tiles |
| `magnetic.tsx` | Spring sutil hacia el cursor: rAF-lerp (factor 0.12) de `translate`, **máximo 5px**, retorno a 0 al salir. | SOLO el CTA `saw run --dossier` |
| `decode-text.tsx` | Al hover, el texto se "descifra": scramble con charset mono que se asienta de izquierda a derecha en ~350ms. RNG inyectable para tests. | Labels mono / kickers de sección de la landing |

### Kill-switches (doble, obligatorio en los 4 componentes)

- `prefers-reduced-motion: reduce` → sin transforms ni animaciones (CSS media
  query + check en el hook antes de colgar listeners).
- `pointer: coarse` → touch no tiene hover: los listeners **ni se cuelgan**.

## Holograma consciente + contacto — `web/components/operative-hologram.tsx`

Mismo patrón que el existente `poseRef`: se agrega un `pointerRef` interno
(`{ nx, ny, near, over }`, normalizado -1..1 respecto del centro del canvas).
Listener `mousemove` en `window` (passive) calcula contra los bounds del panel.

| Estado | Reacción (todo via lerp en el `useFrame` existente) |
|---|---|
| **Near** (cursor a <1.5× del radio del panel) | La cabeza/ojos siguen al cursor: lerp de rotación con clamp **±0.45 rad (y) / ±0.25 rad (x)**. El spin base se frena al **~35%** — el operative te nota y presta atención. |
| **Over** (hover directo sobre el mascot) | Glow target **+0.25**, scale lerp a **1.04**, y en el rising edge dispara el **glitch holográfico existente** como saludo (reuso del mecanismo de blink — cero animación nueva). |
| **Leave** | Los mismos lerps lo devuelven solo a su estado base. Sin estados que limpiar. |

- **API pública intacta**: cero cambios en las props de `Mascot` — la
  reactividad funciona automáticamente en los 5 montajes del demo.
- Reduced-motion: ya cubierto — `qualifies3D()` no monta el 3D.
- Fallback SVG (`MascotSvgBody`): glow bump simple por CSS `group-hover`,
  sin tracking JS.

## Guardrail Operator Console (regla dura — heredada del spec 2026-06-10)

1. No tocar lógica: nada de wallet adapters, fetch/API, hooks de datos,
   schemas, auth. Los FX son wrappers presentacionales.
2. No cambiar interfaces: props existentes de `Mascot`, `TerminalPanel` y
   demás componentes quedan idénticas.
3. No romper el build: TypeScript compila, imports/exports intactos.
4. Motion accesible: TODO detrás de `prefers-reduced-motion` (guard global
   ya existe en globals.css; los FX agregan el suyo propio).

## Performance (reglas de implementación)

- Math en refs + rAF; **nunca setState en un handler de mousemove**.
- Listeners `passive: true`.
- Solo `transform` y `opacity` (compositor-friendly); nada que dispare layout.
- `will-change: transform` solo en los elementos que efectivamente animan.

## Testing

- **vitest**: helpers puros — normalización pointer→ángulos con clamp
  (fixtures de bounds), scrambler de decode con RNG inyectado (determinístico).
- **Playwright smoke**: hover sobre una feature tile → layout no se rompe,
  overlay de spotlight presente en el DOM.
- **Manual**: forced reduced-motion (DevTools) → cero transforms; touch
  emulation → listeners ausentes.

## Fuera de scope (YAGNI explícito)

- Spotlight/tilt/decode en el demo (`/demo`) — v1 es landing only; el demo
  solo recibe la reactividad del holograma.
- Tracking global permanente del mascot.
- Magnetismo en cualquier elemento que no sea el CTA primario.
- Efectos de scroll (parallax, scroll-triggered) — esto es hover only.
- Cambios al SVG fallback más allá del glow bump CSS.
