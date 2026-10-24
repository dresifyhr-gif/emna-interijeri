"use client";

import { useRef, type CSSProperties } from "react";
import { useScrollReveal } from "@/components/ui/motion";

export interface MaskLine {
  text: string;
  accent?: boolean;
}

/**
 * Big display heading whose lines slide up out of a mask when scrolled into view.
 * Server-rendered readable; the slide is added after mount only for headings still below the fold
 * (CSS `.mask-lines` in globals.css), never with reduced motion.
 */
export function MaskLines({
  lines,
  as = "h2",
  className = "",
  accentClass = "text-accent",
  id,
}: {
  lines: MaskLine[];
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** colour class for accented lines ("text-accent" on dark, "text-accent-deep" on paper) */
  accentClass?: string;
  id?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useScrollReveal(ref, "0px 0px -12% 0px");
  const Tag = as as "h2";
  return (
    <Tag ref={ref} id={id} className={`display mask-lines ${className}`}>
      {lines.map((l, i) => (
        <span key={`${i}-${l.text}`} className="block overflow-hidden pb-[0.07em] -mb-[0.07em]">
          <span
            className={`mask-line block ${l.accent ? accentClass : ""}`}
            style={{ "--line-delay": `${i * 0.09}s` } as CSSProperties}
          >
            {l.text}
          </span>
        </span>
      ))}
    </Tag>
  );
}
