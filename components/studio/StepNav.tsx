"use client";

/**
 * Six-step progress as a real tablist (arrow keys / Home / End move between steps).
 * Desktop: hairline segments with numbers. Mobile: a swipeable strip of pills that keeps the active one in view.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, type KeyboardEvent } from "react";
import { CheckIcon } from "./icons";
import { EASE, STEPS } from "./meta";
import s from "./studio.module.css";

export const STEP_PANEL_ID = "studio-step-panel";
export const stepTabId = (i: number) => `studio-tab-${STEPS[i].id}`;

function useTabKeys(step: number, onStep: (i: number) => void) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKeyDown = (e: KeyboardEvent, i: number) => {
    const n = STEPS.length;
    let next: number | null = null;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (i + 1) % n;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (i - 1 + n) % n;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    onStep(next);
    refs.current[next]?.focus();
  };
  const setRef = (i: number) => (el: HTMLButtonElement | null) => {
    refs.current[i] = el;
  };
  return { onKeyDown, setRef, refs, step };
}

export function StepNav({ step, onStep, variant }: { step: number; onStep: (i: number) => void; variant: "desktop" | "mobile" }) {
  const reduce = useReducedMotion();
  const { onKeyDown, setRef, refs } = useTabKeys(step, onStep);
  const stripRef = useRef<HTMLDivElement>(null);

  // mobile: keep the active pill in view
  useEffect(() => {
    if (variant !== "mobile") return;
    const strip = stripRef.current;
    const el = refs.current[step];
    if (!strip || !el) return;
    const target = el.offsetLeft - (strip.clientWidth - el.offsetWidth) / 2;
    strip.scrollTo({ left: Math.max(0, target), behavior: reduce ? "auto" : "smooth" });
  }, [step, variant, reduce, refs]);

  if (variant === "desktop") {
    return (
      <div role="tablist" aria-label="Koraci" className="grid grid-cols-6 gap-1.5">
        {STEPS.map((st, i) => {
          const on = i === step;
          const done = i < step;
          return (
            <button
              key={st.id}
              ref={setRef(i)}
              id={stepTabId(i)}
              type="button"
              role="tab"
              aria-selected={on}
              aria-controls={STEP_PANEL_ID}
              aria-label={`Korak ${i + 1}: ${st.title}`}
              tabIndex={on ? 0 : -1}
              onClick={() => onStep(i)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className="group rounded-md pb-1 pt-2 text-left"
            >
              <span className="relative block h-[2px] overflow-hidden rounded-full bg-white/[0.1]">
                <motion.span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 w-full origin-left rounded-full ${on ? "bg-accent" : "bg-fg/45"}`}
                  initial={false}
                  animate={{ scaleX: on || done ? 1 : 0 }}
                  transition={{ duration: reduce ? 0 : 0.7, ease: EASE }}
                />
              </span>
              <span className="mt-2.5 block text-[10px] font-medium tabular-nums tracking-[0.18em] text-mut transition-colors duration-300 group-hover:text-fg/80">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span
                className={`mt-0.5 block truncate text-[11.5px] leading-tight transition-colors duration-300 ${
                  on ? "text-fg" : done ? "text-fg/70" : "text-mut group-hover:text-fg/80"
                }`}
              >
                {st.short}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Koraci"
      className={`${s.noScrollbar} -mx-4 flex snap-x snap-mandatory gap-1.5 overflow-x-auto scroll-smooth px-4`}
    >
      {STEPS.map((st, i) => {
        const on = i === step;
        const done = i < step;
        return (
          <button
            key={st.id}
            ref={setRef(i)}
            id={stepTabId(i)}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={STEP_PANEL_ID}
            aria-label={`Korak ${i + 1}: ${st.title}`}
            tabIndex={on ? 0 : -1}
            onClick={() => onStep(i)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={`relative flex h-9 shrink-0 snap-center items-center gap-2 rounded-full border px-3.5 text-[12px] font-medium transition-colors duration-300 ease-premium ${
              on ? "border-fg bg-fg text-ink" : done ? "border-white/15 text-fg/80" : "border-white/10 text-fg/55"
            }`}
          >
            <span className={`tabular-nums text-[10px] tracking-[0.12em] ${on ? "text-ink/60" : "text-mut"}`}>
              {done ? <CheckIcon className="h-3 w-3 text-accent" /> : String(i + 1).padStart(2, "0")}
            </span>
            {st.short}
          </button>
        );
      })}
    </div>
  );
}
