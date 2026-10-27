"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import type { Mood } from "@/lib/studio/types";
import { Wordmark } from "@/components/site/Wordmark";
import { Segmented } from "./controls";
import { useReducedMotionSafe } from "./hooks";
import { CloseIcon, ListIcon, MoonIcon, SunIcon } from "./icons";
import { EASE, STEPS } from "./meta";
import { PdfButton, type PdfExportApi } from "./PdfExport";
import { AiTopButton } from "./ai/AiChat";

export const TOPBAR_H = { desktop: 72, mobile: 56 } as const;

export function TopBar({
  desktop,
  step,
  mood,
  onMood,
  controls,
  onSummary,
  pdf,
  ai,
  onClose,
}: {
  desktop: boolean;
  step: number;
  mood: Mood;
  onMood: (m: Mood) => void;
  /** show mood / summary once the studio is ready */
  controls: boolean;
  onSummary: () => void;
  /** "Preuzmi PDF" (also without 3D — the PDF then has no 3D pages); null = not yet */
  pdf?: PdfExportApi | null;
  /** "Opišite kuhinju" (AI) — only when the helper is enabled for this visitor (not on a phone: its bar has it) */
  ai?: { onOpen: () => void; open: boolean; busy: boolean } | null;
  /**
   * the X ("Zatvori studio") was pressed: it still goes to the site at once (never asks) — the studio saves the kitchen
   * on this device right then, and the next visit offers it back ("Nastavite svoju kuhinju")
   */
  onClose?: () => void;
}) {
  // known only after mount (hooks.ts useReducedMotionSafe): the server and the hydrating render agree
  const reduce = useReducedMotionSafe();
  const st = STEPS[step];
  const fade = {
    initial: false as const,
    // y does not depend on reduced motion: the server renders this (initial false) without knowing it — a different y on
    // the client was a hydration mismatch; reduced motion makes it instant (duration 0) while it is still invisible
    animate: { opacity: controls ? 1 : 0, y: controls ? 0 : -6 },
    transition: { duration: reduce ? 0 : 0.9, ease: EASE },
  };

  return (
    <header
      className="pointer-events-none absolute inset-x-0 top-0 z-[55] flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8"
      style={{ height: desktop ? TOPBAR_H.desktop : TOPBAR_H.mobile }}
    >
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 -z-10 h-[150%] bg-gradient-to-b from-ink-900/85 via-ink-900/35 to-transparent"
      />

      <div className="pointer-events-auto">
        <Wordmark sub={desktop} />
      </div>

      {desktop && (
        // centred by this wrapper: framer-motion writes its own transform on the line itself (its y), which used to cancel
        // the centring translate — the line started at the middle and ran into the right-hand controls. Shown only where
        // those controls leave it room.
        <div aria-hidden="true" className="absolute left-1/2 top-1/2 hidden -translate-x-1/2 -translate-y-1/2 xl:block">
          <motion.p {...fade} className="flex items-center gap-3 whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.26em]">
            <span className="text-accent">3D studio</span>
            <span className="h-px w-6 bg-white/20" />
            <span className="tabular-nums text-mut">
              {String(step + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
            </span>
            <span className="text-fg">{st.title}</span>
          </motion.p>
        </div>
      )}

      <div className="pointer-events-auto flex items-center gap-2">
        {ai && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
          >
            <AiTopButton onOpen={ai.onOpen} open={ai.open} busy={ai.busy} desktop={desktop} />
          </motion.div>
        )}
        {pdf && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
          >
            <PdfButton pdf={pdf} variant={desktop ? "pill" : "icon"} />
          </motion.div>
        )}
        <motion.div {...fade} className={`flex items-center gap-2 ${controls ? "" : "pointer-events-none"}`} inert={!controls}>
          {desktop ? (
            <Segmented
              label="Prikaz"
              size="sm"
              className="w-[184px]"
              options={[
                {
                  id: "day" as Mood,
                  label: (
                    <>
                      <SunIcon className="h-3.5 w-3.5" />
                      Dan
                    </>
                  ),
                  aria: "Dnevni prikaz",
                },
                {
                  id: "night" as Mood,
                  label: (
                    <>
                      <MoonIcon className="h-3.5 w-3.5" />
                      Večer
                    </>
                  ),
                  aria: "Večernji prikaz",
                },
              ]}
              value={mood}
              onChange={onMood}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={onSummary}
                aria-label="Sažetak kuhinje"
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-ink-900/40 text-fg/80 backdrop-blur-md transition-colors hover:text-fg"
              >
                <ListIcon className="h-[18px] w-[18px]" />
              </button>
              <button
                type="button"
                onClick={() => onMood(mood === "day" ? "night" : "day")}
                aria-label={mood === "day" ? "Prebaci na večernji prikaz" : "Prebaci na dnevni prikaz"}
                aria-pressed={mood === "night"}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-ink-900/40 text-fg/80 backdrop-blur-md transition-colors hover:text-fg"
              >
                {mood === "day" ? <MoonIcon className="h-[18px] w-[18px]" /> : <SunIcon className="h-[18px] w-[18px]" />}
              </button>
            </>
          )}
        </motion.div>
        <Link
          href="/"
          onClick={onClose}
          aria-label="Zatvori studio i vrati se na stranicu"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-white/[0.12] bg-ink-900/40 text-fg/80 backdrop-blur-md transition-all duration-300 ease-premium hover:border-accent/60 hover:text-accent lg:h-11 lg:w-11"
        >
          <CloseIcon className="h-5 w-5" />
        </Link>
      </div>
    </header>
  );
}
