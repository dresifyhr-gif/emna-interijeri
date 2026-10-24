"use client";

import { catalog, topDef } from "@/lib/studio/catalog";
import { RadioGrid, SectionLabel } from "../controls";
import type { StepProps } from "./types";

export function TopStep({ cfg, update }: StepProps) {
  const current = topDef(cfg.top);
  return (
    <div>
      <SectionLabel id="studio-tops-label">Materijal ploče</SectionLabel>
      <RadioGrid
        labelledBy="studio-tops-label"
        items={catalog.tops}
        value={cfg.top}
        onChange={(id) => update({ top: id })}
        className="mt-5 grid grid-cols-2 gap-3"
        itemClassName={(on) =>
          `group relative overflow-hidden rounded-2xl border p-2 text-left transition-[border-color,background-color] duration-500 ease-premium ${
            on ? "border-accent/70 bg-accent/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
          }`
        }
      >
        {(t, on) => (
          <>
            <span
              aria-hidden="true"
              className="relative block h-[74px] overflow-hidden rounded-[11px] ring-1 ring-inset ring-white/10"
              style={{ background: t.swatch }}
            >
              {/* edge of the slab: light along the top, thickness at the bottom */}
              <span className="absolute inset-0 bg-[linear-gradient(170deg,rgba(255,255,255,.22),transparent_38%,transparent_70%,rgba(0,0,0,.28))]" />
              <span className="absolute inset-x-0 bottom-0 h-[6px] bg-black/25" />
            </span>
            <span className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-3">
              <span className={`text-[12.5px] leading-tight ${on ? "text-fg" : "text-fg/75"}`}>{t.name}</span>
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-500 ease-premium ${on ? "bg-accent" : "bg-white/15"}`}
              />
            </span>
          </>
        )}
      </RadioGrid>
      <p className="mt-6 text-[12.5px] leading-relaxed text-mut">
        Odabrano: <span className="text-fg">{current?.name}</span>. Ploča prati sve donje elemente
        {cfg.layout === "otok" ? ", a na otoku se s obje strane spušta do poda." : "."}
      </p>
    </div>
  );
}
