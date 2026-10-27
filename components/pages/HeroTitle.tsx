import { Fragment, type CSSProperties } from "react";

export type TitleLine = { text: string; accent?: boolean };

/**
 * Page headline (`.heading`: Inter Tight, sentence case) whose lines rise out of a mask, one after another.
 * Emphasis is colour only (`accentClass`, taupe on light). Pure CSS (`.hero-rise` in globals.css), so the headline
 * moves on the first paint, before and without JavaScript; reduced motion shows it still.
 * The mask reaches a little above and below each line so diacritics (Č, Š, Ž) and descenders are never clipped.
 * A real space separates the lines, so the heading's text reads "Od poda do stropa." (crawlers, copy-paste, reader
 * mode); between block lines it takes no room.
 */
export function HeroTitle({
  lines,
  className = "",
  accentClass = "text-taupe",
  delay = 0.1,
}: {
  lines: TitleLine[];
  className?: string;
  accentClass?: string;
  delay?: number;
}) {
  return (
    <h1 className={`heading ${className}`}>
      {lines.map((l, i) => (
        <Fragment key={i}>
          {i > 0 && " "}
          <span className="-my-[0.12em] block overflow-hidden py-[0.12em]">
            <span
              className={`hero-rise block ${l.accent ? accentClass : ""}`}
              style={{ animationDelay: `${delay + i * 0.09}s` } as CSSProperties}
            >
              {l.text}
            </span>
          </span>
        </Fragment>
      ))}
    </h1>
  );
}
