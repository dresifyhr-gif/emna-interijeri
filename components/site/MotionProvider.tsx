"use client";

import { MotionConfig } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Safety net for every framer-motion animation on the marketing pages: with prefers-reduced-motion,
 * framer skips transform animations itself. Components still pick their own calmer variants
 * (components/ui/motion.ts); this only covers anything that does not.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
