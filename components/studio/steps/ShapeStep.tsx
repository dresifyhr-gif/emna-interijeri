"use client";

import { Notes, RadioGrid } from "../controls";
import { LayoutIcon } from "../icons";
import { EDITS_RESET_NOTE, LAYOUTS } from "../meta";
import type { StepProps } from "./types";

export function ShapeStep({ cfg, setLayout, compact, editsReset }: StepProps) {
  return (
    <div>
      <RadioGrid
        label="Oblik kuhinje"
        items={LAYOUTS}
        value={cfg.layout}
        onChange={setLayout}
        className="grid grid-cols-2 gap-2.5 sm:gap-3"
        itemLabel={(it) => `${it.name} — ${it.desc}`}
        itemClassName={(on) =>
          `group relative flex flex-col items-start rounded-2xl border text-left transition-[border-color,background-color] duration-500 ease-premium ${
            compact ? "p-3.5" : "p-4"
          } ${on ? "border-accent/70 bg-accent/[0.07]" : "border-white/10 bg-white/[0.02] hover:border-white/25 hover:bg-white/[0.04]"}`
        }
      >
        {(it, on) => (
          <>
            <LayoutIcon
              layout={it.id}
              className={`transition-colors duration-500 ease-premium ${compact ? "h-11 w-11" : "h-14 w-14"} ${
                on ? "text-accent" : "text-fg/70 group-hover:text-fg"
              }`}
            />
            <span className={`font-display font-medium leading-tight ${compact ? "mt-2.5 text-[15px]" : "mt-4 text-[17px]"}`}>{it.name}</span>
            <span className="mt-1 text-[12px] leading-snug text-mut">{it.desc}</span>
            <span
              aria-hidden="true"
              className={`absolute right-3.5 top-3.5 h-2 w-2 rounded-full transition-all duration-500 ease-premium ${
                on ? "scale-100 bg-accent" : "scale-50 bg-white/15"
              }`}
            />
          </>
        )}
      </RadioGrid>
      <p className="mt-6 text-[12.5px] leading-relaxed text-mut">
        Duljine zidova, prozor i pojedine elemente prilagođavate u sljedećim koracima. Svaki element u 3D prikazu možete i
        kliknuti.
      </p>
      <Notes items={editsReset ? [EDITS_RESET_NOTE] : []} />
    </div>
  );
}
