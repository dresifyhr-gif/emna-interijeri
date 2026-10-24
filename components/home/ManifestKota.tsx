"use client";

import { cubicBezier, motion, useScroll, useTransform } from "framer-motion";
import { useRef } from "react";
import { useMotionAllowed } from "@/components/ui/motion";

const ease = cubicBezier(0.2, 0.8, 0.2, 1);

/**
 * A dimension line ("kota") that stretches across the page as it scrolls into view, counting the
 * centimetres as it grows. Purely illustrative: the number is a typical wall length, not a company fact.
 */
export function ManifestKota({ cm = 380, label = "vaš zid", className = "" }: { cm?: number; label?: string; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  // server HTML and hydration: the full line; it grows with the scroll only after mount, never with reduced motion
  const animate = useMotionAllowed();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start 95%", "start 38%"] });
  const p = useTransform(scrollYProgress, [0, 1], [animate ? 0.05 : 1, 1], { ease });
  const end = useTransform(p, (v) => `${v * 100}%`);
  // keep the measurement fully on screen while the line is still short
  const mid = useTransform(p, (v) => `max(${(v * 50).toFixed(2)}%, 4.5rem)`);
  const count = useTransform(p, (v) => Math.round(v * cm).toString());

  return (
    <div ref={ref} className={`relative h-16 text-accent-deep ${className}`} role="img" aria-label={`Kotna linija: ${cm} cm, ${label}`}>
      {/* extension lines */}
      <span aria-hidden className="absolute left-0 top-3 h-10 w-px bg-current opacity-60" />
      <motion.span aria-hidden style={{ left: end }} className="absolute top-3 h-10 w-px -translate-x-px bg-current opacity-60" />

      {/* the dimension line itself */}
      <motion.span aria-hidden style={{ scaleX: p }} className="absolute left-0 right-0 top-8 h-px origin-left bg-current" />

      {/* 45° architectural ticks */}
      <span aria-hidden className="absolute left-0 top-8 h-px w-4 -translate-x-1/2 -rotate-45 bg-current" />
      <motion.span aria-hidden style={{ left: end }} className="absolute top-8 h-px w-4 -translate-x-1/2 -rotate-45 bg-current" />

      {/* measurement */}
      <motion.span aria-hidden style={{ left: mid }} className="absolute top-0 flex -translate-x-1/2 items-baseline gap-2 whitespace-nowrap">
        <motion.span className="font-display text-[15px] font-medium tabular-nums tracking-tight text-ink">{count}</motion.span>
        <span className="eyebrow !tracking-[0.2em]">cm · {label}</span>
      </motion.span>
    </div>
  );
}
