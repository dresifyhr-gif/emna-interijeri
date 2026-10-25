"use client";

import { hasIsland } from "@/lib/studio/plan";
import { Notes, RadioGrid } from "../controls";
import { LayoutIcon, UndoIcon } from "../icons";
import { LAYOUTS, LAYOUT_RESET_NOTE } from "../meta";
import { IslandSection } from "./IslandSection";
import type { StepProps } from "./types";

/** "Oblik": the six layouts, and for the island / peninsula its options (IslandSection) */
export function ShapeStep({ cfg, setLayout, compact, edit, goTo, advanced, onUndoLayout }: StepProps & { onUndoLayout: (() => void) | null }) {
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
      {hasIsland(cfg.layout) && <IslandSection cfg={cfg} edit={edit} goTo={goTo} advanced={advanced} />}
      <Notes
        items={
          onUndoLayout
            ? [
                {
                  text: LAYOUT_RESET_NOTE,
                  action: (
                    <button
                      type="button"
                      onClick={onUndoLayout}
                      className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-accent transition-colors hover:text-fg"
                    >
                      <UndoIcon className="h-4 w-4" />
                      Vrati prethodni oblik i elemente
                    </button>
                  ),
                },
              ]
            : []
        }
      />
    </div>
  );
}
