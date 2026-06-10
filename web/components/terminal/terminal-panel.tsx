import type { ReactNode } from "react";

/**
 * TerminalPanel — a TUI-style box: `border border-ash bg-ink` with bracket
 * marks (┌ ┐ └ ┘) tucked into each corner in dimmed gold. When `label` is
 * provided it is inlaid into the top-left of the border frame as `┤ LABEL ├`
 * in small uppercase gold mono. Reusable everywhere a framed terminal region
 * is needed (protocol cards, dossiers, dashboard sections).
 */
export function TerminalPanel({
  label,
  children,
  className = "",
}: {
  label?: string;
  children: ReactNode;
  className?: string;
}): JSX.Element {
  return (
    <div className={`relative border border-ash bg-ink ${className}`}>
      {/* Corner bracket marks — pure chrome. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -left-px -top-px font-mono text-[10px] leading-none text-gold/40"
      >
        ┌
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -right-px -top-px font-mono text-[10px] leading-none text-gold/40"
      >
        ┐
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-px -left-px font-mono text-[10px] leading-none text-gold/40"
      >
        └
      </span>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-px -right-px font-mono text-[10px] leading-none text-gold/40"
      >
        ┘
      </span>

      {/* Inlaid label riding the top border. */}
      {label && (
        <span className="pointer-events-none absolute -top-[7px] left-3 bg-ink px-1 font-mono text-[10px] uppercase tracking-widest text-gold">
          <span aria-hidden="true" className="text-gold/40">
            ┤
          </span>{" "}
          {label}{" "}
          <span aria-hidden="true" className="text-gold/40">
            ├
          </span>
        </span>
      )}

      {children}
    </div>
  );
}
