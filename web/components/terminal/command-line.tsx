import type { ReactNode } from "react";

/**
 * CommandLine — renders a shell-style command:
 *
 *   $ command --flag value
 *
 * The prompt sigil ($ by default) is drawn in gold; the caller composes
 * `children` (the command text, with flags highlighted however they like).
 * Monospace, with the prompt non-selectable so copy/paste grabs the command
 * cleanly without the leading sigil.
 */
export function CommandLine({
  children,
  prompt = "$",
}: {
  children: ReactNode;
  prompt?: string;
}): JSX.Element {
  return (
    <span className="font-mono text-bone">
      <span aria-hidden="true" className="mr-2 select-none font-semibold text-gold">
        {prompt}
      </span>
      {children}
    </span>
  );
}
