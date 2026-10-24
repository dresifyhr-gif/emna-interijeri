"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { catalog, frontDef } from "@/lib/studio/catalog";
import { RadioGrid, Segmented, SectionLabel } from "../controls";
import { EASE, HANDLE_OPTIONS } from "../meta";
import type { StepProps } from "./types";

/** a material sample chip: the catalogue swatch with a soft bevel highlight */
export function Chip({ background, on, className = "" }: { background: string; on: boolean; className?: string }) {
  return (
    <span className={`relative block ${className}`}>
      <span
        aria-hidden="true"
        className={`absolute -inset-[5px] rounded-[17px] border transition-all duration-500 ease-premium ${
          on ? "scale-100 border-accent opacity-100" : "scale-95 border-accent/0 opacity-0"
        }`}
      />
      <span
        aria-hidden="true"
        className="relative block h-full w-full overflow-hidden rounded-[12px] shadow-[0_14px_28px_-14px_rgba(0,0,0,.9)] ring-1 ring-inset ring-white/15 transition-transform duration-500 ease-premium group-hover:-translate-y-0.5"
        style={{ background }}
      >
        <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.18),transparent_45%,rgba(0,0,0,.18))]" />
      </span>
    </span>
  );
}

export function FrontsStep({ cfg, update }: StepProps) {
  const reduce = useReducedMotion();
  const current = frontDef(cfg.front);
  const handle = HANDLE_OPTIONS.find((h) => h.id === cfg.handles) ?? HANDLE_OPTIONS[0];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <SectionLabel id="studio-fronts-label">Materijal fronte</SectionLabel>
      </div>
      <div className="mt-3 h-8 overflow-hidden" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={cfg.front}
            initial={{ y: reduce ? 0 : 18, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
            exit={{ y: reduce ? 0 : -18, opacity: 0, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
            className="font-display text-[24px] font-medium leading-8 tracking-tight"
          >
            {current?.name}
          </motion.p>
        </AnimatePresence>
      </div>

      <RadioGrid
        labelledBy="studio-fronts-label"
        items={catalog.fronts}
        value={cfg.front}
        onChange={(id) => update({ front: id })}
        className="mt-5 grid grid-cols-4 gap-x-2 gap-y-5"
        itemClassName={() => "group flex flex-col items-center rounded-2xl px-0.5 pb-1 pt-1.5"}
      >
        {(f, on) => (
          <>
            <Chip background={f.swatch} on={on} className="h-[58px] w-[58px]" />
            <span
              className={`mt-3 text-center text-[11.5px] leading-tight transition-colors duration-300 ${
                on ? "text-fg" : "text-mut group-hover:text-fg/80"
              }`}
            >
              {f.name}
            </span>
          </>
        )}
      </RadioGrid>

      <SectionLabel id="studio-handles-label" className="mt-9">
        Ručke
      </SectionLabel>
      <Segmented
        labelledBy="studio-handles-label"
        className="mt-4"
        options={HANDLE_OPTIONS.map((h) => ({ id: h.id, label: h.name }))}
        value={cfg.handles}
        onChange={(h) => update({ handles: h })}
      />
      <div className="mt-3 min-h-[40px]">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={handle.id}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.4 } }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
            className="text-[12.5px] leading-relaxed text-mut"
          >
            {handle.note}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
