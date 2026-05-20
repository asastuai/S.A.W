"use client";

export type MascotPose =
  | "idle"
  | "listening"
  | "thinking"
  | "writing"
  | "executing"
  | "speaking"
  | "sleeping";

export function Mascot({
  pose = "idle",
  size = 160,
  glyph,
}: {
  pose?: MascotPose;
  size?: number;
  glyph?: string;
}) {
  const tilt = pose === "listening" ? "rotate-[-6deg]" : "";
  const breathe =
    pose === "executing" ? "animate-mascot-pulse" : "animate-mascot-breathe";

  return (
    <div
      className="relative inline-block max-w-full"
      style={{ width: size, height: size }}
    >
      {/* THINKING bubble */}
      {pose === "thinking" && (
        <div className="absolute -top-2 left-1/2 -translate-x-1/2 z-10 animate-mascot-bounce">
          <div className="font-display text-3xl text-gold">?</div>
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

      {/* SLEEPING Zs */}
      {pose === "sleeping" && (
        <div className="absolute -top-3 right-0 z-10 flex flex-col items-end gap-0.5">
          <span className="text-gold/80 font-display text-xs animate-mascot-bounce" style={{ animationDelay: "0ms" }}>z</span>
          <span className="text-gold/60 font-display text-sm animate-mascot-bounce" style={{ animationDelay: "300ms" }}>z</span>
          <span className="text-gold/40 font-display text-base animate-mascot-bounce" style={{ animationDelay: "600ms" }}>Z</span>
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

      <svg
        viewBox="0 0 100 100"
        width="100%"
        height="100%"
        className={`origin-bottom ${breathe} ${tilt} transition-transform duration-500`}
      >
        {/* shadow */}
        <ellipse cx="50" cy="96" rx="22" ry="2.5" fill="#000" opacity="0.4" />

        {/* collar / coat */}
        <path
          d="M 28 82 Q 50 76 72 82 L 74 100 L 26 100 Z"
          fill="#1a1a1a"
          stroke="#c9a96e"
          strokeWidth="0.8"
        />
        {/* collar lapels (subtle V) */}
        <path
          d="M 42 80 L 50 88 L 58 80"
          fill="none"
          stroke="#c9a96e"
          strokeWidth="0.6"
          opacity="0.6"
        />

        {/* head */}
        <circle
          cx="50"
          cy="55"
          r="20"
          fill="#1a1a1a"
          stroke="#c9a96e"
          strokeWidth="0.8"
        />

        {/* hat brim */}
        <ellipse cx="50" cy="34" rx="30" ry="3" fill="#0a0a0a" stroke="#c9a96e" strokeWidth="0.8" />
        {/* hat crown */}
        <path
          d="M 35 34 L 36 14 Q 36 11 39 11 L 61 11 Q 64 11 64 14 L 65 34 Z"
          fill="#0a0a0a"
          stroke="#c9a96e"
          strokeWidth="0.8"
        />
        {/* hat band */}
        <rect x="35" y="29" width="30" height="3" fill="#c9a96e" opacity="0.5" />

        {/* eyes — group blinks */}
        <g className="origin-center animate-mascot-blink" style={{ transformOrigin: "50px 53px" }}>
          <circle cx="43" cy="53" r="2" fill="#c9a96e" />
          <circle cx="57" cy="53" r="2" fill="#c9a96e" />
          {/* eye glints */}
          <circle cx="43.7" cy="52.3" r="0.6" fill="#e8e4d8" />
          <circle cx="57.7" cy="52.3" r="0.6" fill="#e8e4d8" />
        </g>

        {/* mouth — changes by pose */}
        {pose === "speaking" ? (
          <ellipse cx="50" cy="64" rx="3" ry="2" fill="#0a0a0a" stroke="#c9a96e" strokeWidth="0.5" />
        ) : pose === "thinking" ? (
          <line x1="46" y1="64" x2="54" y2="64" stroke="#c9a96e" strokeWidth="0.8" />
        ) : (
          <path
            d="M 46 64 Q 50 65.5 54 64"
            fill="none"
            stroke="#c9a96e"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
        )}

        {/* persona glyph on lapel */}
        {glyph && (
          <text
            x="50"
            y="93"
            fill="#c9a96e"
            fontFamily="serif"
            fontSize="6"
            textAnchor="middle"
            opacity="0.7"
          >
            {glyph}
          </text>
        )}
      </svg>
    </div>
  );
}
