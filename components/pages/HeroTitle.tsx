import type { CSSProperties } from "react";

export type TitleLine = { text: string; accent?: boolean };

/**
 * Big display headline whose lines rise out of a mask, one after another.
 * Pure CSS (`.hero-rise` in globals.css), so the headline moves on the first paint, before and
 * without JavaScript; reduced motion shows it still.
 */
export function HeroTitle({
  lines,
  className = "",
  accentClass = "text-accent",
  delay = 0.1,
}: {
  lines: TitleLine[];
  className?: string;
  accentClass?: string;
  delay?: number;
}) {
  return (
    <h1 className={`display ${className}`}>
      {lines.map((l, i) => (
        <span key={i} className="block overflow-hidden pb-[0.06em]">
          <span
            className={`hero-rise block ${l.accent ? accentClass : ""}`}
            style={{ animationDelay: `${delay + i * 0.09}s` } as CSSProperties}
          >
            {l.text}
          </span>
        </span>
      ))}
    </h1>
  );
}
