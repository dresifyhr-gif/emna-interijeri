"use client";

/**
 * "Boje": the front library (families as tabs, large swatches) and the two-tone switch. With two tones on, the
 * customer first picks the part of the kitchen (donji, gornji, visoki stup, otok), then its colour; each part keeps
 * its own colour from then on.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { catalog, frontDef } from "@/lib/studio/catalog";
import { frontFor, type KitchenPlan } from "@/lib/studio/plan";
import type { FrontZone, KitchenConfig } from "@/lib/studio/types";
import { RadioGrid, SectionLabel, Switch } from "../controls";
import { MaterialLibrary } from "../MaterialLibrary";
import { EASE, FRONT_FAMILY_TAB, FRONT_ZONE_LONG, FRONT_ZONE_NAME } from "../meta";
import type { StepProps } from "./types";

export interface FrontsUi {
  twoTone: boolean;
  setTwoTone: (on: boolean) => void;
  zone: FrontZone;
  setZone: (z: FrontZone) => void;
}

const FAMILIES = catalog.frontFamilies.map((f) => ({ id: f.id, name: FRONT_FAMILY_TAB[f.id] ?? f.name }));

/** the zones this kitchen has (only those can wear their own front) */
export function frontZones(plan: KitchenPlan): FrontZone[] {
  const has = (z: FrontZone) => plan.slots.some((s) => s.zone === z);
  return (["base", "upper", "tall", "island"] as FrontZone[]).filter((z) => z === "base" || has(z));
}

/** the config with `id` on `zone`; in two-tone mode the other zones keep the colour they show now */
export function withZoneFront(cfg: KitchenConfig, plan: KitchenPlan, zone: FrontZone, id: string, twoTone: boolean): Partial<KitchenConfig> {
  if (!twoTone) return { front: id, zoneFronts: undefined };
  if (zone !== "base") return { zoneFronts: { ...(cfg.zoneFronts ?? {}), [zone]: id } };
  const zf: Partial<Record<FrontZone, string>> = {};
  for (const z of frontZones(plan)) if (z !== "base") zf[z] = frontFor(cfg, z);
  return { front: id, zoneFronts: zf };
}

export function FrontsStep({ cfg, plan, update, fronts }: StepProps & { fronts: FrontsUi }) {
  const reduce = useReducedMotion();
  const zones = frontZones(plan);
  const twoTone = fronts.twoTone && zones.length > 1;
  const zone: FrontZone = twoTone && zones.includes(fronts.zone) ? fronts.zone : "base";
  const value = twoTone ? frontFor(cfg, zone) : cfg.front;
  const current = frontDef(value);
  const family = FAMILIES.find((f) => f.id === current?.family)?.name;

  return (
    <div>
      {/* two-tone */}
      {zones.length > 1 && (
        <div className="mb-7 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <label id="studio-twotone-l" htmlFor="studio-twotone" className="block cursor-pointer font-display text-[16px] font-medium leading-tight">
                Dvobojna kuhinja
              </label>
              <p id="studio-twotone-d" className="mt-1.5 text-[12.5px] leading-relaxed text-mut">
                Druga boja za gornje elemente, visoki stup{zones.includes("island") ? " ili otok" : ""}.
              </p>
            </div>
            <Switch
              id="studio-twotone"
              checked={twoTone}
              onChange={(on) => {
                fronts.setTwoTone(on);
                if (!on) {
                  fronts.setZone("base");
                  update({ zoneFronts: undefined });
                }
              }}
              labelledBy="studio-twotone-l"
              describedBy="studio-twotone-d"
            />
          </div>
          <AnimatePresence initial={false}>
            {twoTone && (
              <motion.div
                key="zones"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1, transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
                exit={{ height: 0, opacity: 0, transition: { duration: reduce ? 0 : 0.3, ease: EASE } }}
                className="overflow-hidden"
              >
                <p id="studio-zone-label" className="pt-5 text-[12.5px] text-fg/80">
                  Koji dio bojate?
                </p>
                <RadioGrid
                  labelledBy="studio-zone-label"
                  items={zones.map((z) => ({ id: z }))}
                  value={zone}
                  onChange={(z) => fronts.setZone(z as FrontZone)}
                  className={`mt-3 grid gap-2 ${zones.length > 3 ? "grid-cols-4" : zones.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}
                  itemLabel={(z) => `${FRONT_ZONE_NAME[z.id as FrontZone]}: ${frontDef(frontFor(cfg, z.id as FrontZone))?.name ?? ""}`}
                  itemClassName={(on) =>
                    `group flex flex-col items-center gap-2 rounded-xl border px-1.5 pb-2.5 pt-3 transition-[border-color,background-color] duration-300 ease-premium ${
                      on ? "border-accent/70 bg-accent/[0.08]" : "border-white/[0.08] hover:border-white/25"
                    }`
                  }
                >
                  {(z, on) => {
                    const f = frontDef(frontFor(cfg, z.id as FrontZone));
                    return (
                      <>
                        <span
                          aria-hidden="true"
                          className="relative h-9 w-9 overflow-hidden rounded-lg ring-1 ring-inset ring-white/15 transition-[background] duration-500"
                          style={{ background: f?.swatch }}
                        >
                          <span className="absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.18),transparent_50%,rgba(0,0,0,.18))]" />
                        </span>
                        <span className={`text-[11.5px] font-medium leading-none ${on ? "text-fg" : "text-fg/70"}`}>{FRONT_ZONE_NAME[z.id as FrontZone]}</span>
                      </>
                    );
                  }}
                </RadioGrid>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <SectionLabel id="studio-fronts-label">{twoTone ? `Boja: ${FRONT_ZONE_LONG[zone]}` : "Boja i materijal fronti"}</SectionLabel>
      <div className="mt-3 h-[52px] overflow-hidden" aria-hidden="true">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${zone}-${value}`}
            initial={{ y: reduce ? 0 : 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1, transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
            exit={{ y: reduce ? 0 : -16, opacity: 0, transition: { duration: reduce ? 0 : 0.22, ease: EASE } }}
          >
            <p className="font-display text-[24px] font-medium leading-8 tracking-tight">{current?.name}</p>
            <p className="text-[11.5px] leading-5 text-mut">{family}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <MaterialLibrary
        kind="front"
        className="mt-4"
        items={catalog.fronts}
        families={FAMILIES}
        value={value}
        onChange={(id) => update(withZoneFront(cfg, plan, zone, id, twoTone))}
        label="Boja fronte"
        idPrefix="studio-fronts"
      />

      <p className="mt-7 text-[12.5px] leading-relaxed text-mut">
        Boje na zaslonu su približne — ovise o zaslonu i svjetlu u prostoru.
      </p>
    </div>
  );
}
