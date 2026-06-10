/**
 * Readout — a single line of operator telemetry:
 *
 *   label: value · label: value · …
 *
 * Labels are dimmed bone, values take their `tone` color (default bone), and
 * a dotted `·` separator in ash divides each pair. Monospace, small. Reusable
 * across panels, headers, and footers wherever a compact status strip helps.
 */
type ReadoutTone = "gold" | "phosphor" | "rust" | "bone";

type ReadoutItem = {
  label: string;
  value: string;
  tone?: ReadoutTone;
};

const TONE_CLASS: Record<ReadoutTone, string> = {
  gold: "text-gold",
  phosphor: "text-phosphor",
  rust: "text-rust",
  bone: "text-bone",
};

export function Readout({
  items,
  className = "",
}: {
  items: ReadoutItem[];
  className?: string;
}): JSX.Element {
  return (
    <div
      className={`flex flex-wrap items-center gap-x-2 gap-y-1 font-mono text-xs ${className}`}
    >
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="inline-flex items-center gap-x-2">
          {i > 0 && (
            <span aria-hidden="true" className="text-ash">
              ·
            </span>
          )}
          <span className="inline-flex items-center gap-x-1">
            <span className="text-bone/40">{item.label}:</span>
            <span className={TONE_CLASS[item.tone ?? "bone"]}>{item.value}</span>
          </span>
        </span>
      ))}
    </div>
  );
}
