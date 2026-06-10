"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

export type MascotPose =
  | "idle"
  | "listening"
  | "thinking"
  | "writing"
  | "executing"
  | "speaking"
  | "sleeping";

// three.js hologram is lazy + client-only. While its chunk loads, the static
// SVG operative stands in, so there is never an empty frame.
const OperativeHologram = dynamic(
  () => import("./operative-hologram").then((m) => m.OperativeHologram),
  { ssr: false, loading: () => <MascotSvgBody pose="idle" /> }
);

/**
 * Decide whether to render the three.js hologram. Conservative on purpose:
 * the SVG mascot is the default and the hologram is an enhancement only for
 * capable, motion-OK, non-tiny surfaces. Runs client-side only.
 */
function qualifies3D(size: number): boolean {
  if (typeof window === "undefined") return false;
  if (size < 100) return false; // tiny avatars stay crisp as SVG
  try {
    const m = (q: string) => !!window.matchMedia?.(q).matches;
    if (m("(prefers-reduced-motion: reduce)")) return false;
    const conn = (navigator as unknown as { connection?: { saveData?: boolean } })
      .connection;
    if (conn?.saveData) return false;
    if (m("(pointer: coarse)") && window.innerWidth < 768) return false; // small touch screens
    const c = document.createElement("canvas");
    const gl = c.getContext("webgl2") || c.getContext("webgl");
    if (!gl) return false;
    return true;
  } catch {
    return false;
  }
}

export function Mascot({
  pose = "idle",
  size = 160,
  glyph,
}: {
  pose?: MascotPose;
  size?: number;
  glyph?: string;
}) {
  // Start as SVG (SSR + first paint), upgrade to the hologram after mount if
  // the device qualifies — avoids hydration mismatch and a WebGL cost on
  // surfaces that don't benefit.
  const [use3D, setUse3D] = useState(false);
  useEffect(() => {
    setUse3D(qualifies3D(size));
  }, [size]);

  // Per-pose float/drift on the wrapper, layered on top of the body's own
  // motion so each state reads as a distinct, living micro-motion. Applies to
  // both the SVG and the hologram.
  const floatClass =
    pose === "idle"
      ? "sawm-float-idle"
      : pose === "listening"
        ? "sawm-float-listen"
        : pose === "thinking"
          ? "sawm-float-think"
          : pose === "writing"
            ? "sawm-float-write"
            : pose === "executing"
              ? "sawm-float-exec"
              : pose === "speaking"
                ? "sawm-float-speak"
                : pose === "sleeping"
                  ? "sawm-float-sleep"
                  : "";

  // Active accent ring: energetic for executing, attentive for listening.
  const showExecRing = pose === "executing";
  const showListenRing = pose === "listening";

  return (
    <div
      className={`sawm-root relative inline-block max-w-full ${floatClass}`}
      style={{ width: size, height: size }}
    >
      {/* Operator avatar reticule — corner brackets framing the operative as a
          terminal video feed. Pure chrome; does not affect pose logic. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute left-0 top-0 z-20 font-mono text-[10px] leading-none text-gold/40"
      >
        ┌
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-0 top-0 z-20 font-mono text-[10px] leading-none text-gold/40"
      >
        ┐
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 left-0 z-20 font-mono text-[10px] leading-none text-gold/40"
      >
        └
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0 right-0 z-20 font-mono text-[10px] leading-none text-gold/40"
      >
        ┘
      </span>

      {/* Live-feed status tag — phosphor when active, dimmed when asleep. */}
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.25em] ${
          pose === "sleeping" ? "text-bone/30" : "text-phosphor"
        }`}
      >
        {pose === "sleeping" ? "◦ standby" : `● op·${pose}`}
      </span>

      {/* EXECUTING active accent — pulsing ring + an orbiting scan dot */}
      {showExecRing && (
        <>
          <span
            aria-hidden
            className="sawm-exec-ring pointer-events-none absolute inset-0 z-0 rounded-full"
          />
          <span
            aria-hidden
            className="sawm-exec-orbit pointer-events-none absolute inset-0 z-0"
          >
            <span className="sawm-exec-dot absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-gold" />
          </span>
        </>
      )}

      {/* LISTENING attention — soft expanding ring that nudges focus in */}
      {showListenRing && (
        <span
          aria-hidden
          className="sawm-listen-ring pointer-events-none absolute inset-0 z-0 rounded-full"
        />
      )}

      {/* THINKING bubble */}
      {pose === "thinking" && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 animate-mascot-bounce">
          <div className="sawm-think-q font-display text-3xl text-gold">?</div>
        </div>
      )}

      {/* WRITING ticks */}
      {pose === "writing" && (
        <div className="absolute top-1/2 -right-3 -translate-y-1/2 z-10 flex flex-col gap-1">
          <div className="h-px w-6 bg-gold animate-mascot-tick" style={{ animationDelay: "0ms" }} />
          <div className="h-px w-4 bg-gold animate-mascot-tick" style={{ animationDelay: "150ms" }} />
          <div className="h-px w-7 bg-gold animate-mascot-tick" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      {/* SLEEPING Zs — slow upward/outward drift */}
      {pose === "sleeping" && (
        <div className="absolute -top-3 right-0 z-10 flex flex-col items-end gap-0.5">
          <span className="sawm-zzz text-gold/80 font-display text-xs" style={{ animationDelay: "0ms" }}>z</span>
          <span className="sawm-zzz text-gold/60 font-display text-sm" style={{ animationDelay: "900ms" }}>z</span>
          <span className="sawm-zzz text-gold/40 font-display text-base" style={{ animationDelay: "1800ms" }}>Z</span>
        </div>
      )}

      {/* SPEAKING dots */}
      {pose === "speaking" && (
        <div className="absolute -top-2 right-2 z-10 flex gap-1">
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-mascot-pop" style={{ animationDelay: "0ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-mascot-pop" style={{ animationDelay: "150ms" }} />
          <span className="h-1.5 w-1.5 rounded-full bg-gold animate-mascot-pop" style={{ animationDelay: "300ms" }} />
        </div>
      )}

      {/* Body: three.js hologram when the device qualifies, SVG operative
          otherwise. Same identity either way. */}
      {use3D ? (
        <OperativeHologram pose={pose} size={size} />
      ) : (
        <MascotSvgBody pose={pose} glyph={glyph} />
      )}

      {/* Self-contained, pose-reactive motion. Scoped by styled-jsx — no
          global keyframes added. Layers on top of the existing tailwind
          animate-mascot-* utilities, never replacing them. */}
      <style jsx>{`
        .sawm-root {
          will-change: transform;
        }

        /* idle — gentle vertical float / breathing drift */
        .sawm-float-idle {
          animation: sawm-float-idle 5.5s ease-in-out infinite;
        }
        @keyframes sawm-float-idle {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-3px);
          }
        }

        /* listening — slight forward attention lean that settles */
        .sawm-float-listen {
          animation: sawm-float-listen 2.6s ease-in-out infinite;
        }
        @keyframes sawm-float-listen {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(-1.5px) rotate(-1.5deg);
          }
        }

        /* thinking — slow contemplative bob */
        .sawm-float-think {
          animation: sawm-float-think 3.4s ease-in-out infinite;
        }
        @keyframes sawm-float-think {
          0%,
          100% {
            transform: translateY(0);
          }
          45% {
            transform: translateY(-4px);
          }
        }

        /* writing — focused micro-lean into the work */
        .sawm-float-write {
          animation: sawm-float-write 1.6s ease-in-out infinite;
        }
        @keyframes sawm-float-write {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(0.5px) rotate(0.8deg);
          }
        }

        /* executing — tight energetic float, quicker cadence */
        .sawm-float-exec {
          animation: sawm-float-exec 0.9s ease-in-out infinite;
        }
        @keyframes sawm-float-exec {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-2px);
          }
        }

        /* speaking — small talk bob */
        .sawm-float-speak {
          animation: sawm-float-speak 1.1s ease-in-out infinite;
        }
        @keyframes sawm-float-speak {
          0%,
          100% {
            transform: translateY(0);
          }
          50% {
            transform: translateY(-1.5px);
          }
        }

        /* sleeping — heavy, very slow sway */
        .sawm-float-sleep {
          animation: sawm-float-sleep 7s ease-in-out infinite;
        }
        @keyframes sawm-float-sleep {
          0%,
          100% {
            transform: translateY(0) rotate(0deg);
          }
          50% {
            transform: translateY(2px) rotate(1.5deg);
          }
        }

        /* executing — pulsing accent ring */
        .sawm-exec-ring {
          border: 1px solid rgba(240, 180, 41, 0.5);
          animation: sawm-exec-ring 1.2s ease-out infinite;
        }
        @keyframes sawm-exec-ring {
          0% {
            transform: scale(0.86);
            opacity: 0;
          }
          35% {
            opacity: 0.6;
          }
          100% {
            transform: scale(1.04);
            opacity: 0;
          }
        }

        /* executing — orbiting scan dot circling the operative */
        .sawm-exec-orbit {
          animation: sawm-spin 2.4s linear infinite;
        }
        @keyframes sawm-spin {
          to {
            transform: rotate(360deg);
          }
        }
        .sawm-exec-dot {
          box-shadow: 0 0 5px rgba(240, 180, 41, 0.8);
        }

        /* listening — slow attentive ring that draws focus inward */
        .sawm-listen-ring {
          border: 1px solid rgba(240, 180, 41, 0.4);
          animation: sawm-listen-ring 2.6s ease-in-out infinite;
        }
        @keyframes sawm-listen-ring {
          0%,
          100% {
            transform: scale(1.02);
            opacity: 0;
          }
          50% {
            transform: scale(0.92);
            opacity: 0.5;
          }
        }

        /* thinking — soft glow pulse on the question mark */
        .sawm-think-q {
          animation: sawm-think-q 1.8s ease-in-out infinite;
        }
        @keyframes sawm-think-q {
          0%,
          100% {
            opacity: 0.6;
            text-shadow: 0 0 0 rgba(240, 180, 41, 0);
          }
          50% {
            opacity: 1;
            text-shadow: 0 0 8px rgba(240, 180, 41, 0.6);
          }
        }

        /* sleeping — Zzz drift up and out, then fade */
        .sawm-zzz {
          animation: sawm-zzz 2.7s ease-in-out infinite;
        }
        @keyframes sawm-zzz {
          0% {
            transform: translate(0, 0) scale(0.85);
            opacity: 0;
          }
          25% {
            opacity: 1;
          }
          100% {
            transform: translate(7px, -12px) scale(1.05);
            opacity: 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .sawm-float-idle,
          .sawm-float-listen,
          .sawm-float-think,
          .sawm-float-write,
          .sawm-float-exec,
          .sawm-float-speak,
          .sawm-float-sleep,
          .sawm-exec-ring,
          .sawm-exec-orbit,
          .sawm-listen-ring,
          .sawm-think-q,
          .sawm-zzz {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}

/**
 * The original SVG operative — secret-agent fedora + coat with pose-reactive
 * eyes/mouth. Serves as the universal fallback (reduced-motion, no WebGL,
 * small/touch screens) and as the hologram's loading placeholder.
 */
function MascotSvgBody({
  pose = "idle",
  glyph,
}: {
  pose?: MascotPose;
  glyph?: string;
}) {
  const tilt = pose === "listening" ? "rotate-[-6deg]" : "";
  const breathe =
    pose === "executing" ? "animate-mascot-pulse" : "animate-mascot-breathe";

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      className={`relative z-[1] origin-bottom ${breathe} ${tilt} ${
        pose === "sleeping" ? "opacity-50" : ""
      } ${pose === "executing" ? "drop-shadow-gold" : ""} transition-transform duration-500`}
    >
      {/* shadow */}
      <ellipse cx="50" cy="96" rx="22" ry="2.5" fill="#000" opacity="0.4" />

      {/* collar / coat */}
      <path
        d="M 28 82 Q 50 76 72 82 L 74 100 L 26 100 Z"
        fill="#14161b"
        stroke="#f0b429"
        strokeWidth="0.8"
      />
      {/* collar lapels (subtle V) */}
      <path
        d="M 42 80 L 50 88 L 58 80"
        fill="none"
        stroke="#f0b429"
        strokeWidth="0.6"
        opacity="0.6"
      />

      {/* head */}
      <circle
        cx="50"
        cy="55"
        r="20"
        fill="#14161b"
        stroke="#f0b429"
        strokeWidth="0.8"
      />

      {/* hat brim */}
      <ellipse cx="50" cy="34" rx="30" ry="3" fill="#0c0d11" stroke="#f0b429" strokeWidth="0.8" />
      {/* hat crown */}
      <path
        d="M 35 34 L 36 14 Q 36 11 39 11 L 61 11 Q 64 11 64 14 L 65 34 Z"
        fill="#0c0d11"
        stroke="#f0b429"
        strokeWidth="0.8"
      />
      {/* hat band */}
      <rect x="35" y="29" width="30" height="3" fill="#f0b429" opacity="0.5" />

      {/* eyes — group blinks */}
      <g className="origin-center animate-mascot-blink" style={{ transformOrigin: "50px 53px" }}>
        <circle cx="43" cy="53" r="2" fill="#f0b429" />
        <circle cx="57" cy="53" r="2" fill="#f0b429" />
        {/* eye glints */}
        <circle cx="43.7" cy="52.3" r="0.6" fill="#d6d2c4" />
        <circle cx="57.7" cy="52.3" r="0.6" fill="#d6d2c4" />
      </g>

      {/* mouth — changes by pose */}
      {pose === "speaking" ? (
        <ellipse cx="50" cy="64" rx="3" ry="2" fill="#0c0d11" stroke="#f0b429" strokeWidth="0.5" />
      ) : pose === "thinking" ? (
        <line x1="46" y1="64" x2="54" y2="64" stroke="#f0b429" strokeWidth="0.8" />
      ) : (
        <path
          d="M 46 64 Q 50 65.5 54 64"
          fill="none"
          stroke="#f0b429"
          strokeWidth="0.8"
          strokeLinecap="round"
        />
      )}

      {/* persona glyph on lapel */}
      {glyph && (
        <text
          x="50"
          y="93"
          fill="#f0b429"
          fontFamily="serif"
          fontSize="6"
          textAnchor="middle"
          opacity="0.7"
        >
          {glyph}
        </text>
      )}
    </svg>
  );
}
