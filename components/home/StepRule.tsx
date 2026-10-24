"use client";

import { useRef, type CSSProperties } from "react";
import { useScrollReveal } from "@/components/ui/motion";

/** Hairline that draws from left to right when it enters the viewport (CSS `.step-rule` in globals.css). */
export function StepRule({ delay = 0, className = "" }: { delay?: number; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useScrollReveal(ref);
  return (
    <div
      ref={ref}
      aria-hidden
      className={`step-rule absolute inset-x-0 top-0 h-px bg-white/10 ${className}`}
      style={{ "--reveal-delay": `${delay}s` } as CSSProperties}
    >
      <div className="step-rule-bar h-px origin-left bg-accent/70" />
    </div>
  );
}
