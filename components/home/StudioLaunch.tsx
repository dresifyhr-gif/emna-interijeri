"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { LinkButton } from "@/components/ui/Button";

type Variant = "light" | "accent" | "outline" | "cream" | "ink";

/**
 * "Enter the studio" button: on click the screen darkens in a circle that grows out of the button,
 * then /studio opens. Modified clicks (new tab etc.) and reduced motion behave like a normal link.
 */
export function StudioLaunch({
  href = "/studio",
  variant = "light",
  className = "",
  children,
}: {
  href?: string;
  variant?: Variant;
  className?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [origin, setOrigin] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => {
    router.prefetch(href);
  }, [router, href]);

  // safety net: if navigation has not replaced this page after a while, lift the curtain again
  useEffect(() => {
    if (!origin) return;
    const t = window.setTimeout(() => setOrigin(null), 6000);
    return () => window.clearTimeout(t);
  }, [origin]);

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    if (reduce || e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (origin) return; // already on its way
    const r = e.currentTarget.getBoundingClientRect();
    setOrigin({ x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) });
  };

  return (
    <>
      <LinkButton href={href} variant={variant} arrow onClick={onClick} className={className}>
        {children}
      </LinkButton>
      {origin &&
        createPortal(
          <motion.div
            aria-hidden
            className="fixed inset-0 z-[80] flex items-center justify-center bg-night"
            initial={{ clipPath: `circle(0px at ${origin.x}px ${origin.y}px)` }}
            animate={{ clipPath: `circle(150vmax at ${origin.x}px ${origin.y}px)` }}
            transition={{ duration: 0.8, ease: [0.7, 0, 0.2, 1] }}
            onAnimationComplete={() => router.push(href)}
          >
            <motion.p
              className="kicker text-accent"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.45, duration: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
            >
              3D studio
            </motion.p>
          </motion.div>,
          document.body,
        )}
    </>
  );
}
