"use client";

/**
 * The two shells around the step content:
 * - DesktopPanel: one glass column on the right that never covers the kitchen centre.
 * - MobileSheet: a bottom sheet (tap or drag the handle to fold it) with a swipeable step strip.
 * Both always show the rough price and Natrag / Dalje.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useRef, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import { Arrow } from "@/components/ui/Button";
import { CopyLinkButton } from "./CopyLink";
import { ChevronLeft, ChevronUp, CloseIcon } from "./icons";
import { EASE, STEPS } from "./meta";
import { PriceBlock } from "./Price";
import { StepNav } from "./StepNav";
import { SummaryList } from "./SummaryList";
import s from "./studio.module.css";

export const PANEL_W = 392;
export const PANEL_GAP = 20;

interface ShellProps {
  step: number;
  onStep: (i: number) => void;
  onBack: () => void;
  onNext: () => void;
  price: { low: number; high: number };
  summary: string[];
  getUrl: () => string;
  /** the animated step header + content */
  children: ReactNode;
  shown: boolean;
}

/* ------------------------------------------------------------------ nav buttons */

function NavButtons({ step, onBack, onNext, compact }: { step: number; onBack: () => void; onNext: () => void; compact: boolean }) {
  const prev = STEPS[step - 1];
  const next = STEPS[step + 1];
  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        onClick={onBack}
        disabled={step === 0}
        aria-label={prev ? `Natrag: ${prev.title}` : "Natrag"}
        className={`flex shrink-0 items-center justify-center rounded-full border border-white/15 text-fg/80 transition-all duration-300 ease-premium hover:border-accent hover:text-accent disabled:pointer-events-none disabled:opacity-25 ${
          compact ? "h-11 w-11" : "h-12 w-12"
        }`}
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      {next && (
        <button
          type="button"
          onClick={onNext}
          className={`group inline-flex min-w-0 flex-1 items-center justify-between gap-3 rounded-full bg-accent text-ink transition-all duration-300 ease-premium hover:bg-fg ${
            compact ? "h-11 pl-5 pr-4" : "h-12 pl-6 pr-5"
          }`}
        >
          <span className="flex min-w-0 items-baseline gap-2">
            <span className="text-[13px] font-semibold tracking-wide">Dalje</span>
            {!compact && <span className="truncate text-[11.5px] font-medium text-ink/55">{next.short}</span>}
          </span>
          <Arrow />
        </button>
      )}
      {!next && !compact && <p className="flex-1 text-[12px] leading-snug text-mut">Ispunite podatke iznad i pošaljite upit.</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ desktop */

export function DesktopPanel({
  step,
  onStep,
  onBack,
  onNext,
  price,
  summary,
  getUrl,
  children,
  shown,
  summaryOpen,
  onSummary,
  scrollRef,
}: ShellProps & {
  summaryOpen: boolean;
  onSummary: (open: boolean) => void;
  scrollRef: RefObject<HTMLDivElement | null>;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.aside
      aria-label="Postavke kuhinje"
      inert={!shown}
      initial={false}
      animate={shown ? { opacity: 1, x: 0 } : { opacity: 0, x: reduce ? 0 : 48 }}
      transition={{ duration: reduce ? 0 : 1.2, ease: EASE }}
      className={`glass absolute bottom-5 right-5 top-[84px] z-20 flex flex-col overflow-hidden rounded-[28px] shadow-[0_40px_120px_-40px_rgba(0,0,0,.85)] ${
        shown ? "" : "pointer-events-none"
      }`}
      style={{ width: PANEL_W }}
    >
      <span aria-hidden="true" className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-white/25 to-transparent" />
      <div className="px-7 pt-5">
        <StepNav step={step} onStep={onStep} variant="desktop" />
      </div>
      <div ref={scrollRef} className={`${s.thinScroll} relative min-h-0 flex-1 overflow-y-auto overscroll-contain px-7 pb-8 pt-7`}>
        {children}
      </div>

      <div className="relative border-t border-white/10 px-7 pb-6 pt-5">
        <AnimatePresence>
          {summaryOpen && (
            <motion.div
              key="summary"
              id="studio-summary"
              initial={{ opacity: 0, y: reduce ? 0 : 12 }}
              animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
              exit={{ opacity: 0, y: reduce ? 0 : 12, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
              className={`${s.thinScroll} absolute inset-x-0 bottom-full max-h-[min(62vh,560px)] overflow-y-auto border-t border-white/10 bg-ink-700/95 px-7 pb-5 pt-5 backdrop-blur-xl`}
            >
              <div className="flex items-center justify-between">
                <p className="eyebrow text-accent">Sažetak kuhinje</p>
                <button
                  type="button"
                  onClick={() => onSummary(false)}
                  aria-label="Zatvori sažetak"
                  className="-mr-2 flex h-8 w-8 items-center justify-center rounded-full text-fg/60 hover:text-fg"
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <SummaryList lines={summary} className="mt-3" />
              <CopyLinkButton getUrl={getUrl} variant="quiet" className="mt-4" />
            </motion.div>
          )}
        </AnimatePresence>

        <div className="flex items-start justify-between gap-4">
          <PriceBlock price={price} />
          <button
            type="button"
            onClick={() => onSummary(!summaryOpen)}
            aria-expanded={summaryOpen}
            aria-controls="studio-summary"
            className="-mr-1 mt-[-3px] inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11.5px] font-medium uppercase tracking-[0.18em] text-mut transition-colors duration-300 hover:text-fg"
          >
            Sažetak
            <ChevronUp className={`h-3.5 w-3.5 transition-transform duration-500 ease-premium ${summaryOpen ? "rotate-180" : ""}`} />
          </button>
        </div>
        <div className="mt-5">
          <NavButtons step={step} onBack={onBack} onNext={onNext} compact={false} />
        </div>
      </div>
    </motion.aside>
  );
}

/* ------------------------------------------------------------------ mobile */

export function MobileSheet({
  step,
  onStep,
  onBack,
  onNext,
  price,
  children,
  shown,
  open,
  onOpen,
  covered,
  scrollRef,
  sheetRef,
}: ShellProps & {
  open: boolean;
  onOpen: (open: boolean) => void;
  /** hidden while the element editor card is up */
  covered: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sheetRef: RefObject<HTMLElement | null>;
}) {
  const reduce = useReducedMotion();
  const drag = useRef<{ y: number; id: number } | null>(null);
  const tall = STEPS[step].id === "posalji";

  // tap / Enter / Space toggle (a plain click, so assistive tech works too); a vertical drag folds or unfolds
  const dragged = useRef(false);
  const onHandleDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    drag.current = { y: e.clientY, id: e.pointerId };
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onHandleUp = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 28) {
      dragged.current = true;
      onOpen(dy < 0);
    }
  };

  return (
    <motion.section
      ref={sheetRef}
      aria-label="Postavke kuhinje"
      inert={!shown || covered}
      initial={false}
      animate={shown && !covered ? { opacity: 1, y: 0 } : { opacity: 0, y: reduce ? 0 : covered ? 0 : 40 }}
      transition={{ duration: reduce ? 0 : covered ? 0.35 : 1, ease: EASE }}
      className={`glass absolute inset-x-0 bottom-0 z-20 rounded-t-[26px] border-b-0 shadow-[0_-30px_80px_-40px_rgba(0,0,0,.9)] ${
        shown && !covered ? "" : "pointer-events-none"
      }`}
    >
      <button
        type="button"
        onPointerDown={onHandleDown}
        onPointerUp={onHandleUp}
        onPointerCancel={() => {
          drag.current = null;
        }}
        onClick={() => {
          if (dragged.current) {
            dragged.current = false;
            return;
          }
          onOpen(!open);
        }}
        aria-expanded={open}
        aria-controls="studio-sheet-body"
        aria-label={open ? "Spusti ploču s postavkama" : "Podigni ploču s postavkama"}
        className="flex h-6 w-full touch-none items-center justify-center"
      >
        <span aria-hidden="true" className="h-1 w-10 rounded-full bg-white/25" />
      </button>

      <div className="px-4 pb-3">
        <StepNav step={step} onStep={onStep} variant="mobile" />
      </div>

      <div
        id="studio-sheet-body"
        ref={scrollRef}
        className={`${s.thinScroll} overflow-y-auto overscroll-contain border-t border-white/[0.07] px-4 transition-[height] duration-500 ease-premium`}
        style={{ height: open ? (tall ? "min(60svh, 560px)" : "min(36svh, 330px)") : 0 }}
        aria-hidden={!open}
        inert={!open}
      >
        <div className="pb-6 pt-5">{children}</div>
      </div>

      <div className="flex items-center gap-3 border-t border-white/10 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        <PriceBlock price={price} compact className="min-w-0 flex-1" />
        <div className={STEPS[step + 1] ? "w-[150px] shrink-0" : "shrink-0"}>
          <NavButtons step={step} onBack={onBack} onNext={onNext} compact />
        </div>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ mobile summary card */

export function MobileSummary({
  summary,
  price,
  getUrl,
  onClose,
}: {
  summary: string[];
  price: { low: number; high: number };
  getUrl: () => string;
  onClose: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      role="dialog"
      aria-label="Sažetak kuhinje"
      initial={{ y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
      animate={{ y: 0, opacity: 1, transition: { duration: reduce ? 0 : 0.55, ease: EASE } }}
      exit={{ y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1, transition: { duration: reduce ? 0 : 0.35, ease: EASE } }}
      className={`${s.thinScroll} glass absolute inset-x-0 bottom-0 z-40 max-h-[78svh] overflow-y-auto rounded-t-[26px] border-b-0 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5`}
    >
      <div className="flex items-center justify-between">
        <p className="eyebrow text-accent">Sažetak kuhinje</p>
        <button
          type="button"
          onClick={onClose}
          aria-label="Zatvori sažetak"
          className="-mr-2 flex h-10 w-10 items-center justify-center rounded-full text-fg/70 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </div>
      <PriceBlock price={price} compact className="mt-3" />
      <SummaryList lines={summary} className="mt-3" />
      <CopyLinkButton getUrl={getUrl} className="mt-5" />
    </motion.div>
  );
}

