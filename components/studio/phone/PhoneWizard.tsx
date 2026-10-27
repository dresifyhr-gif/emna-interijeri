"use client";

/**
 * The phone's step-by-step flow: four screens (flow.ts WIZARD_STEPS), one thing each, in a panel over the lower part of
 * the screen. Above it the studio's own 3D view shows the kitchen live — the same engine as the full studio (its insets
 * leave it the top of the screen; it does not take touches here), or, without WebGL, the floor plan drawing.
 *
 * The panel is solid (no backdrop blur over a canvas that repaints) and keeps one height on every screen, so the 3D
 * view above never moves; only the screen's content slides. Big "Natrag" / "Dalje" at the thumb; progress dots; "3D"
 * at the top right skips to the full 3D view.
 */
import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, type RefObject } from "react";
import type { KitchenPlan } from "@/lib/studio/plan";
import type { KitchenConfig, Layout } from "@/lib/studio/types";
import { Arrow } from "@/components/ui/Button";
import { ChevronLeft, CubeIcon, Spinner } from "../icons";
import { EASE } from "../meta";
import s from "../studio.module.css";
import type { EngineStatus } from "../useStudioEngine";
import { WallSchematic } from "../WallSchematic";
import { WIZARD_LAST, WIZARD_STEPS } from "./flow";
import { AppliancesScreen, MeasuresScreen, ShapeScreen, StyleScreen, type FlowEdit } from "./WizardSteps";

/** px of the screen above the panel the 3D view's framing starts below (the top bar's logo and close button) */
export const WIZARD_TOP = 48;
/** the panel's height: the 3D view keeps the rest */
export const WIZARD_PANEL_H = "min(58svh, 520px)";

export function PhoneWizard({
  step,
  cfg,
  plan,
  engine,
  panelRef,
  reduce,
  dir,
  onLayout,
  onEdit,
  onBack,
  onNext,
  onSkip,
}: {
  step: number;
  cfg: KitchenConfig;
  plan: KitchenPlan;
  engine: EngineStatus;
  /** the panel (the studio measures it for the 3D view's insets) */
  panelRef: RefObject<HTMLElement | null>;
  reduce: boolean;
  /** 1 = forwards, -1 = back (which way the screens slide) */
  dir: number;
  onLayout: (l: Layout) => void;
  onEdit: FlowEdit;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const st = WIZARD_STEPS[step];
  const next = WIZARD_STEPS[step + 1];
  const scrollRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const first = useRef(true);

  // a new screen starts at its top; focus goes to its title (not on the first screen: the visitor tapped "Korak po korak")
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus({ preventScroll: true });
  }, [step]);

  return (
    <>
      {/* over the 3D view: what shows while it loads, or the floor plan without WebGL */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-[5]" style={{ bottom: "var(--studio-inset-bottom, 50svh)" }} aria-hidden="true">
        {engine === "loading" && (
          <p className="flex h-full items-center justify-center gap-2.5 pt-10 text-[12.5px] text-mut">
            <Spinner className="text-accent" />
            Učitavam 3D prikaz…
          </p>
        )}
        {engine === "failed" && (
          <div className="flex h-full items-center justify-center px-6 pb-3 pt-14">
            <WallSchematic plan={plan} focus={null} className="h-full max-h-full w-auto max-w-full" />
          </div>
        )}
      </div>

      <motion.section
        ref={panelRef}
        aria-label="Kuhinja korak po korak"
        initial={{ y: reduce ? 0 : 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1, transition: { duration: reduce ? 0 : 0.6, ease: EASE } }}
        exit={{ y: reduce ? 0 : 30, opacity: 0, transition: { duration: reduce ? 0 : 0.3, ease: EASE } }}
        className="absolute inset-x-0 bottom-0 z-20 flex flex-col rounded-t-[28px] border-t border-white/10 bg-ink-700 shadow-[0_-30px_80px_-40px_rgba(0,0,0,.9)]"
        style={{ height: WIZARD_PANEL_H }}
      >
        <div className="flex items-center gap-3 px-5 pt-4">
          <ol className="flex items-center gap-1.5" aria-label={`Korak ${step + 1} od ${WIZARD_STEPS.length}`}>
            {WIZARD_STEPS.map((w, i) => (
              <li
                key={w.id}
                aria-current={i === step ? "step" : undefined}
                className={`h-1.5 rounded-full transition-all duration-500 ease-premium ${i === step ? "w-6 bg-accent" : i < step ? "w-1.5 bg-fg/60" : "w-1.5 bg-white/15"}`}
              >
                <span className="sr-only">{w.title}</span>
              </li>
            ))}
          </ol>
          <span className="text-[11px] font-medium tabular-nums tracking-[0.16em] text-mut">
            {step + 1} / {WIZARD_STEPS.length}
          </span>
          <button
            type="button"
            onClick={onSkip}
            className="-mr-2 ml-auto inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[12.5px] font-medium text-fg/75 transition-colors active:text-accent"
          >
            <CubeIcon className="h-4 w-4" />
            Otvori 3D
          </button>
        </div>

        <div ref={scrollRef} className={`${s.thinScroll} relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain`}>
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={st.id}
              initial={{ opacity: 0, x: reduce ? 0 : dir * 24 }}
              animate={{ opacity: 1, x: 0, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
              exit={{ opacity: 0, x: reduce ? 0 : dir * -16, transition: { duration: reduce ? 0 : 0.18, ease: EASE } }}
              className="px-5 pb-6 pt-2"
            >
              <h2 ref={headingRef} tabIndex={-1} className="display text-[26px] outline-none">
                {st.title}
              </h2>
              <p className="mt-1.5 text-[13px] leading-snug text-fg/65">{st.lead}</p>
              <div className="mt-5">
                {st.id === "oblik" && <ShapeScreen cfg={cfg} onLayout={onLayout} />}
                {st.id === "mjere" && <MeasuresScreen cfg={cfg} onEdit={onEdit} />}
                {st.id === "stil" && <StyleScreen cfg={cfg} onEdit={onEdit} />}
                {st.id === "uredaji" && <AppliancesScreen cfg={cfg} onEdit={onEdit} />}
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        <div className="flex items-center gap-2.5 border-t border-white/[0.08] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
          <button
            type="button"
            onClick={onBack}
            aria-label={step === 0 ? "Natrag na početak" : `Natrag: ${WIZARD_STEPS[step - 1].title}`}
            className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full border border-white/15 text-fg/85 transition-colors duration-300 active:border-accent active:text-accent"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={onNext}
            className="group inline-flex h-[52px] min-w-0 flex-1 items-center justify-between gap-3 rounded-full bg-accent pl-6 pr-5 text-ink transition-colors duration-300 ease-premium active:bg-fg"
          >
            <span className="flex min-w-0 items-baseline gap-2">
              <span className="text-[14px] font-semibold tracking-wide">{step >= WIZARD_LAST ? "Prikaži kuhinju u 3D" : "Dalje"}</span>
              {next && <span className="truncate text-[12px] font-medium text-ink/55">{next.title}</span>}
            </span>
            <Arrow />
          </button>
        </div>
      </motion.section>
    </>
  );
}
