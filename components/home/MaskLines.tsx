"use client";

import { useRef, type CSSProperties } from "react";
import { useScrollReveal } from "@/components/ui/motion";

export interface MaskLine {
  text: string;
  accent?: boolean;
}

/**
 * Section heading (`.heading`: Inter Tight, sentence case) whose lines slide up out of a mask when scrolled into view.
 * Server-rendered readable; the slide is added after mount only for headings still below the fold
 * (CSS `.mask-lines` in globals.css), never with reduced motion.
 */
export function MaskLines({
  lines,
  as = "h2",
  className = "",
  accentClass = "text-taupe",
  id,
}: {
  lines: MaskLine[];
  as?: "h1" | "h2" | "h3";
  className?: string;
  /** colour class for the emphasised line ("text-taupe" on light, "text-accent" on dark) — colour only, never italic */
  accentClass?: string;
  id?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);
  useScrollReveal(ref, "0px 0px -12% 0px");
  const Tag = as as "h2";
  return (
    <Tag ref={ref} id={id} className={`heading mask-lines ${className}`}>
      {lines.map((l, i) => (
        <span key={`${i}-${l.text}`} className="-my-[0.12em] block overflow-hidden py-[0.12em]">
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
