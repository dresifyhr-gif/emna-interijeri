"use client";

/**
 * A material library: family pills (a tablist) over a grid of large swatches (a radio group).
 * Used for the fronts ("Boje") and the worktops. The tab follows the current choice when it changes from
 * outside (e.g. switching the two-tone zone), and stays where the customer put it otherwise.
 */
import { useState } from "react";
import type { MaterialDef } from "@/lib/studio/catalog";
import { FamilyTabs, RadioGrid } from "./controls";

export function MaterialLibrary({
  kind,
  items,
  families,
  value,
  onChange,
  label,
  idPrefix,
  className = "",
}: {
  kind: "front" | "top";
  items: MaterialDef[];
  families: { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  /** accessible name of the swatch group, e.g. "Boja fronte" */
  label: string;
  idPrefix: string;
  className?: string;
}) {
  const familyOf = (id: string) => items.find((m) => m.id === id)?.family ?? families[0]?.id ?? "";
  const [tab, setTab] = useState(() => familyOf(value));
  const [seen, setSeen] = useState(value);
  if (seen !== value) {
    // derived during render: a choice made elsewhere brings its family into view
    setSeen(value);
    if (familyOf(value) !== tab) setTab(familyOf(value));
  }
  const shown = items.filter((m) => m.family === tab);
  const panelId = `${idPrefix}-panel`;
  const activeName = families.find((f) => f.id === tab)?.name ?? "";

  return (
    <div className={className}>
      <FamilyTabs
        label={kind === "front" ? "Vrste fronti" : "Vrste radnih ploča"}
        families={families}
        value={tab}
        onChange={setTab}
        marked={familyOf(value)}
        panelId={panelId}
        idPrefix={`${idPrefix}-tab`}
      />
      <div id={panelId} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${tab}`} className="mt-4">
        <RadioGrid
          label={`${label}: ${activeName}`}
          items={shown}
          value={value}
          onChange={onChange}
          className={kind === "front" ? "grid grid-cols-3 gap-x-2.5 gap-y-4" : "grid grid-cols-2 gap-2.5"}
          itemClassName={(on) =>
            kind === "front"
              ? "group flex flex-col items-stretch rounded-2xl p-1 text-left"
              : `group relative overflow-hidden rounded-2xl border p-2 text-left transition-[border-color,background-color] duration-500 ease-premium ${
                  on ? "border-accent/70 bg-accent/[0.06]" : "border-white/10 bg-white/[0.02] hover:border-white/25"
                }`
          }
        >
          {(m, on) =>
            kind === "front" ? (
              <>
                <span className="relative block">
                  <span
                    aria-hidden="true"
                    className={`absolute -inset-[4px] rounded-[16px] border transition-all duration-500 ease-premium ${
                      on ? "scale-100 border-accent opacity-100" : "scale-95 border-accent/0 opacity-0"
                    }`}
                  />
                  <span
                    aria-hidden="true"
                    className="relative block h-[68px] overflow-hidden rounded-[12px] shadow-[0_14px_28px_-14px_rgba(0,0,0,.9)] ring-1 ring-inset ring-white/15 transition-transform duration-500 ease-premium group-hover:-translate-y-0.5"
                    style={{ background: m.swatch }}
                  >
                    <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.18),transparent_45%,rgba(0,0,0,.18))]" />
                    {/* a hint of a handle groove, so the chip reads as a front */}
                    <span className="absolute inset-x-0 top-[22%] h-px bg-black/20" />
                  </span>
                </span>
                <span
                  className={`mt-2.5 line-clamp-2 text-[11.5px] leading-tight transition-colors duration-300 ${
                    on ? "text-fg" : "text-mut group-hover:text-fg/80"
                  }`}
                >
                  {m.name}
                </span>
              </>
            ) : (
              <>
                <span
                  aria-hidden="true"
                  className="relative block h-[64px] overflow-hidden rounded-[11px] ring-1 ring-inset ring-white/10"
                  style={{ background: m.swatch }}
                >
                  {/* edge of the slab: light along the top, thickness at the bottom */}
                  <span className="absolute inset-0 bg-[linear-gradient(170deg,rgba(255,255,255,.22),transparent_38%,transparent_70%,rgba(0,0,0,.28))]" />
                  <span className="absolute inset-x-0 bottom-0 h-[6px] bg-black/25" />
                </span>
                <span className="flex items-center justify-between gap-2 px-1.5 pb-1 pt-3">
                  <span className={`text-[12.5px] leading-tight ${on ? "text-fg" : "text-fg/75"}`}>{m.name}</span>
                  <span
                    aria-hidden="true"
                    className={`h-1.5 w-1.5 shrink-0 rounded-full transition-all duration-500 ease-premium ${on ? "bg-accent" : "bg-white/15"}`}
                  />
                </span>
              </>
            )
          }
        </RadioGrid>
      </div>
    </div>
  );
}
