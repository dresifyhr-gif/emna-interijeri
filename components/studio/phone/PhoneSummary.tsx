"use client";

/**
 * The summary card of the phone's 3D view (the top bar's list button): the same card as the tablet's (Panel.tsx
 * MobileSummary — the price, the kitchen line by line, the link and the PDF) with "Na početak" under the price: back to
 * the step-by-step flow with this kitchen (StepsAgain).
 */
import { motion } from "framer-motion";
import { CopyLinkButton } from "../CopyLink";
import { useReducedMotionSafe } from "../hooks";
import { CloseIcon } from "../icons";
import { EASE } from "../meta";
import { PdfButton, type PdfExportApi } from "../PdfExport";
import { PriceBlock } from "../Price";
import s from "../studio.module.css";
import { SummaryList } from "../SummaryList";
import { StepsAgain } from "./StepsAgain";

export function PhoneSummary({
  summary,
  price,
  getUrl,
  pdf,
  onSteps,
  onClose,
}: {
  summary: string[];
  price: { low: number; high: number };
  getUrl: () => string;
  pdf?: PdfExportApi;
  /** "Na početak": the wizard's first screen, the kitchen kept */
  onSteps: () => void;
  onClose: () => void;
}) {
  const reduce = useReducedMotionSafe();
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
      {/* in sight without scrolling the long list */}
      <StepsAgain title="Na početak" note="Korak po korak: oblik, mjere, stil i uređaji — ova kuhinja ostaje." onClick={onSteps} className="mt-4" />
      <SummaryList lines={summary} className="mt-3" />
      <div className="mt-5 flex flex-col gap-3">
        <CopyLinkButton getUrl={getUrl} block className="[&>button]:w-full" />
        {pdf && <PdfButton pdf={pdf} label="Preuzmite PDF kuhinje" />}
      </div>
    </motion.div>
  );
}
