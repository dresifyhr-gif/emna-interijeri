"use client";

import { useRef, type CSSProperties } from "react";
import { useScrollReveal } from "@/components/ui/motion";

/** Hairline that draws from left to right when it enters the viewport (CSS `.step-rule` in globals.css). */
export function StepRule({
  delay = 0,
  className = "",
  track = "bg-hairline",
  bar = "bg-bronze/70",
}: {
  delay?: number;
  className?: string;
  /** colour classes of the resting rule and of the line that draws over it */
  track?: string;
  bar?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollReveal(ref);
  return (
    <div
      ref={ref}
      aria-hidden
      className={`step-rule absolute inset-x-0 top-0 h-px ${track} ${className}`}
      style={{ "--reveal-delay": `${delay}s` } as CSSProperties}
    >
      <div className={`step-rule-bar h-px origin-left ${bar}`} />
    </div>
  );
}
