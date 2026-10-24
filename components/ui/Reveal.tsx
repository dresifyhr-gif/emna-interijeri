"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useScrollReveal } from "./motion";

/**
 * Fade-and-rise when scrolled into view. Use `delay` to stagger siblings.
 * Rendered visible on the server; only content that is still below the fold after hydration is
 * hidden and revealed on scroll (CSS in globals.css, `.reveal`). Reduced motion: no animation.
 */
export function Reveal({
  children,
  delay = 0,
  y = 28,
  className = "",
  as = "div",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
  as?: "div" | "li" | "section" | "span";
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollReveal(ref);
  // one element type for the ref; the tag only changes the semantics
  const Tag = as as "div";
  const style = { "--reveal-y": `${y}px`, "--reveal-delay": `${delay}s` } as CSSProperties;
  return (
    <Tag ref={ref} className={`reveal ${className}`} style={style}>
      {children}
    </Tag>
  );
}
