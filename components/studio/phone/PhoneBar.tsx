"use client";

/**
 * The phone's 3D view: everything but this bar is the kitchen. The rough price on one line (the AI entry beside it,
 * when the AI helper is enabled), and two big buttons at the thumb: "Uredite" opens the studio's own settings sheet
 * (MobileSheet — steps, element editor, "Jednostavno / Napredno"), "Pošaljite upit" opens it at the inquiry step. Solid (no
 * backdrop blur over the canvas); the studio measures it for the 3D view's insets, so the kitchen, the element toolbar
 * and the "+" stay above it. A phone held sideways (`landscape`) gets it as one low row: the screen is short, the kitchen
 * keeps its height.
 */
import { motion } from "framer-motion";
import type { RefObject } from "react";
import { Arrow } from "@/components/ui/Button";
import { useTicker } from "../hooks";
import { EASE, eur } from "../meta";
import { AiBarButton } from "./AiEntry";

function PencilIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 5.5l4 4M4.5 19.5l1-4.2L16.2 4.6a1.4 1.4 0 0 1 2 0l1.2 1.2a1.4 1.4 0 0 1 0 2L8.7 18.5Z" />
    </svg>
  );
}

export function PhoneBar({
  barRef,
  price,
  shown,
  reduce,
  onEdit,
  onSend,
  onAi,
  aiBusy = false,
  landscape = false,
}: {
  barRef: RefObject<HTMLElement | null>;
  price: { low: number; high: number };
  /** the studio's UI is in (after the 3D intro) */
  shown: boolean;
  reduce: boolean;
  onEdit: () => void;
  onSend: () => void;
  /** the AI entry (AiBarButton) — absent: not shown */
  onAi?: () => void;
  /** the AI is working on a kitchen */
  aiBusy?: boolean;
  /** the phone is held sideways: price and buttons in one row */
  landscape?: boolean;
}) {
  const lowRef = useTicker(price.low, reduce);
  const highRef = useTicker(price.high, reduce);
  const h = landscape ? "h-11 px-5" : "h-[52px]";

  const priceLine = (
    <p className="min-w-0 flex-1">
      <span className="sr-only">
        Okvirna cijena od {eur(price.low)} do {eur(price.high)} eura
      </span>
      <span aria-hidden="true" className="flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-mut">Okvirno</span>
        <span className="font-display text-[18px] font-medium tabular-nums tracking-tight text-fg">
          <span ref={lowRef} /> – <span ref={highRef} /> €
        </span>
      </span>
    </p>
  );
  const edit = (
    <button
      type="button"
      onClick={onEdit}
      className={`inline-flex ${h} shrink-0 items-center justify-center gap-2 rounded-full border border-white/[0.16] text-[14px] font-semibold tracking-wide text-fg transition-colors duration-300 active:border-accent active:text-accent`}
    >
      <PencilIcon className="h-[18px] w-[18px]" />
      Uredite
    </button>
  );
  const send = (
    <button
      type="button"
      onClick={onSend}
      className={`group inline-flex ${h} shrink-0 items-center justify-center gap-2.5 rounded-full bg-accent text-[14px] font-semibold tracking-wide text-ink transition-colors duration-300 active:bg-fg`}
    >
      Pošaljite upit
      <Arrow />
    </button>
  );

  return (
    <motion.section
      ref={barRef}
      aria-label="Kuhinja"
      inert={!shown}
      initial={false}
      animate={shown ? { opacity: 1, y: 0 } : { opacity: 0, y: 24 }}
      transition={{ duration: reduce ? 0 : 0.6, ease: EASE }}
      className={`absolute inset-x-0 bottom-0 z-20 border-t border-white/10 bg-ink-700/[0.97] px-4 shadow-[0_-24px_60px_-30px_rgba(0,0,0,.9)] ${
        landscape ? "rounded-t-[22px] pb-[calc(8px+env(safe-area-inset-bottom))] pt-2" : "rounded-t-[26px] pb-[calc(12px+env(safe-area-inset-bottom))] pt-3.5"
      } ${shown ? "" : "pointer-events-none"}`}
    >
      {landscape ? (
        <div className="flex items-center gap-2.5">
          {priceLine}
          {onAi && <AiBarButton onOpen={onAi} busy={aiBusy} />}
          {edit}
          {send}
        </div>
      ) : (
        <>
          <div className="flex min-h-10 items-center gap-3">
            {priceLine}
            {onAi && <AiBarButton onOpen={onAi} busy={aiBusy} />}
          </div>
          <div className="mt-2.5 grid grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] gap-2.5">
            {edit}
            {send}
          </div>
        </>
      )}
    </motion.section>
  );
}
