/**
 * Caret — a blinking block cursor (▋) for the Operator Console.
 *
 * Inline, gold, decorative. Uses the `caret` keyframe (steps blink) from the
 * Tailwind config, which the global prefers-reduced-motion guard freezes to a
 * solid block for users who opt out of motion. Marked aria-hidden because it is
 * pure chrome and carries no semantic meaning.
 */
export function Caret({ className = "" }: { className?: string }): JSX.Element {
  return (
    <span
      aria-hidden="true"
      className={`inline-block w-[0.55em] translate-y-[0.05em] animate-caret select-none text-gold ${className}`}
    >
      ▋
    </span>
  );
}
