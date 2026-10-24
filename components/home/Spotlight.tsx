"use client";

import { useRef } from "react";
import { useScrollReveal } from "@/components/ui/motion";
import s from "./home.module.css";

/**
 * A single warm light cone from the ceiling that switches on as the section scrolls in.
 * Rendered lit; the switch-on (`.spot[data-reveal]` in home.module.css) is added after mount only
 * when the section is still below the fold, never with reduced motion.
 */
export function Spotlight() {
  const ref = useRef<HTMLDivElement>(null);
  useScrollReveal(ref, "0px 0px -25% 0px");
  return (
    <div ref={ref} aria-hidden className={`pointer-events-none absolute inset-0 -z-10 overflow-hidden ${s.spot}`}>
      <div className="absolute left-1/2 top-0 h-full w-[min(1200px,170vw)] -translate-x-1/2">
        <div className={s.beam} />
        <div className={`${s.beam} ${s.beamCore}`} />
      </div>
      {/* the fixture */}
      <div className={`absolute left-1/2 top-0 h-6 w-[220px] -translate-x-1/2 -translate-y-1/2 ${s.fixture}`} />
      <div className="absolute left-1/2 top-0 h-px w-16 -translate-x-1/2 bg-[#fff3df]/70" />
      {/* light pool on the floor */}
      <div className={`absolute bottom-[-60px] left-1/2 h-[220px] w-[min(980px,150vw)] -translate-x-1/2 ${s.pool}`} />
    </div>
  );
}
