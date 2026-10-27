"use client";

import Image from "next/image";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useReducedMotion, type PanInfo } from "framer-motion";
import { styleLabel, type Photo } from "@/lib/gallery";
import { shapeLabel } from "./labels";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const pad = (n: number) => String(n).padStart(2, "0");

/**
 * Full-screen photo viewer. Keyboard: ← → to browse, Esc to close, Tab stays inside.
 * Touch: swipe left/right. Focus returns to the opener via `onClose` (handled by the gallery).
 */
export function Lightbox({
  items,
  index,
  onIndex,
  onClose,
}: {
  items: Photo[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [dir, setDir] = useState(1);
  const count = items.length;
  const photo = items[index];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setDir(delta);
      onIndex((index + delta + count) % count);
    },
    [count, index, onIndex],
  );

  // focus + scroll lock while open
  useEffect(() => {
    closeRef.current?.focus();
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        go(1);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        go(-1);
      } else if (e.key === "Tab" && dialogRef.current) {
        // only buttons that are actually rendered: the prev/next pair exists twice (sm:flex / sm:hidden)
        // and the hidden pair must not become the trap's first/last stop at any width
        const nodes = Array.from(dialogRef.current.querySelectorAll<HTMLElement>("button:not([disabled])")).filter(
          (n) => n.getClientRects().length > 0,
        );
        if (!nodes.length) return;
        const first = nodes[0];
        const last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        } else if (!dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, onClose]);

  const onDragEnd = (_: unknown, info: PanInfo) => {
    if (info.offset.x < -70 || info.velocity.x < -500) go(1);
    else if (info.offset.x > 70 || info.velocity.x > 500) go(-1);
  };

  const prev = items[(index - 1 + count) % count];
  const next = items[(index + 1) % count];
  const slide = reduce ? 0 : 56;

  return createPortal(
    <motion.div
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-tone="dark"
      className="fixed inset-0 z-[80] flex flex-col bg-night-deep/[.97] font-sans text-fg backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: reduce ? 0 : 0.45, ease: EASE }}
    >
      {/* top bar */}
      <div className="shell flex h-[72px] shrink-0 items-center justify-between gap-6">
        <p className="kicker tabular-nums text-fg/60" aria-hidden>
          {pad(index + 1)} <span className="text-fg/30">/ {pad(count)}</span>
        </p>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="Zatvori pregled fotografija"
          className="relative -mr-2 flex h-11 w-11 items-center justify-center rounded-full transition-colors hover:bg-white/10"
        >
          <span className="absolute h-px w-5 rotate-45 bg-fg" />
          <span className="absolute h-px w-5 -rotate-45 bg-fg" />
        </button>
      </div>

      {/* stage: click on the empty area closes */}
      <div
        className="relative min-h-0 flex-1"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose();
        }}
      >
        <motion.div
          className="absolute inset-x-0 inset-y-2 touch-pan-y sm:inset-x-20 lg:inset-x-28"
          drag={count > 1 ? "x" : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.18}
          onDragEnd={onDragEnd}
        >
          <AnimatePresence initial={false} custom={dir}>
            <motion.div
              key={photo.src}
              custom={dir}
              className="absolute inset-0"
              variants={{
                enter: (d: number) => ({ opacity: 0, x: d * slide }),
                center: { opacity: 1, x: 0 },
                exit: (d: number) => ({ opacity: 0, x: -d * slide }),
              }}
              initial="enter"
              animate="center"
              exit="exit"
              transition={{ duration: reduce ? 0 : 0.6, ease: EASE }}
            >
              <Image
                src={photo.src}
                alt={photo.title}
                fill
                sizes="100vw"
                quality={90}
                draggable={false}
                className="select-none object-contain"
              />
            </motion.div>
          </AnimatePresence>
        </motion.div>

        {count > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Prethodna fotografija"
              className="absolute left-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink/40 transition-colors hover:border-accent hover:text-accent sm:flex lg:left-8"
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M13 7H1m0 0 5.5-5.5M1 7l5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Sljedeća fotografija"
              className="absolute right-3 top-1/2 hidden h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full border border-white/15 bg-ink/40 transition-colors hover:border-accent hover:text-accent sm:flex lg:right-8"
            >
              <svg width="16" height="16" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 7h12m0 0L7.5 1.5M13 7l-5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
          </>
        )}
      </div>

      {/* caption */}
      <div className="shell flex shrink-0 flex-col gap-3 py-5 sm:flex-row sm:items-end sm:justify-between sm:py-7">
        <div>
          <h2 id={titleId} className="heading text-xl tracking-head-sm sm:text-2xl">
            {photo.title}
          </h2>
          <p className="kicker mt-2 text-accent">
            {styleLabel[photo.style]}
            {photo.shape && <span className="text-fg/50"> · {shapeLabel[photo.shape]}</span>}
          </p>
        </div>
        {count > 1 && (
          <div className="flex items-center gap-2 sm:hidden">
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Prethodna fotografija"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M13 7H1m0 0 5.5-5.5M1 7l5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Sljedeća fotografija"
              className="flex h-11 w-11 items-center justify-center rounded-full border border-white/15"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden>
                <path d="M1 7h12m0 0L7.5 1.5M13 7l-5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
              </svg>
            </button>
            <span className="ml-2 text-xs text-fg/45">Povucite za sljedeću</span>
          </div>
        )}
      </div>

      <p className="sr-only" aria-live="polite">
        Fotografija {index + 1} od {count}: {photo.title}
      </p>

      {/* warm the neighbours so browsing feels instant */}
      {count > 1 && (
        <div aria-hidden className="pointer-events-none absolute h-px w-px overflow-hidden opacity-0">
          {[prev, next].map((p) => (
            <Image key={p.src} src={p.src} alt="" width={p.w} height={p.h} sizes="100vw" quality={90} loading="eager" />
          ))}
        </div>
      )}
    </motion.div>,
    document.body,
  );
}
