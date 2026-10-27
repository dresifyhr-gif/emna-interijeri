"use client";

/**
 * "Boje": the front library (families as tabs, large swatches) and the two-tone switch. With two tones on, the
 * customer first picks the part of the kitchen (donji, gornji, visoki stup, otok), then its colour; each part keeps
 * its own colour from then on. Then how the fronts open (Ručke / Na dodir / Gola / Luft za prste, FrontOptions), folded
 * away the glass of vitrines, and the room's walls (all of them or one, the bare room walls too), floor and ceiling (with
 * its light) — only for the look in 3D (clicking a wall or the floor in 3D opens the same samples there).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { catalog, frontDef } from "@/lib/studio/catalog";
import { roomFinishes, setRoomCeiling, setRoomFinish } from "@/lib/studio/edit";
import { frontFor, isPeninsula, type KitchenPlan } from "@/lib/studio/plan";
import type { FrontZone, KitchenConfig, WallId } from "@/lib/studio/types";
import { Disclosure, RadioGrid, SectionLabel, Segmented, Switch } from "../controls";
import { PaletteIcon } from "../icons";
import { MaterialLibrary } from "../MaterialLibrary";
import { EASE, FRONT_FAMILY_TAB, FRONT_ZONE_LONG, FRONT_ZONE_NAME, WALL_HINT, frontZones, roomWallIds } from "../meta";
import { SwitchLine } from "../OptionPickers";
import { FLOORS, RoomSwatches, WALL_FINISHES, WALL_PAINTS } from "../SurfacePicker";
import { GlassSection, OpeningSection } from "./FrontOptions";
import type { StepProps } from "./types";

export interface FrontsUi {
  twoTone: boolean;
  setTwoTone: (on: boolean) => void;
  zone: FrontZone;
  setZone: (z: FrontZone) => void;
}

const FAMILIES = catalog.frontFamilies.map((f) => ({ id: f.id, name: FRONT_FAMILY_TAB[f.id] ?? f.name }));

/** the config with `id` on `zone`; in two-tone mode the other zones keep the colour they show now */
export function withZoneFront(cfg: KitchenConfig, plan: KitchenPlan, zone: FrontZone, id: string, twoTone: boolean): Partial<KitchenConfig> {
  if (!twoTone) return { front: id, zoneFronts: undefined };
  if (zone !== "base") return { zoneFronts: { ...(cfg.zoneFronts ?? {}), [zone]: id } };
  const zf: Partial<Record<FrontZone, string>> = {};
  for (const z of frontZones(plan)) if (z !== "base") zf[z] = frontFor(cfg, z);
  return { front: id, zoneFronts: zf };
}

export function FrontsStep({ cfg, plan, update, edit, engine, advanced, fronts }: StepProps & { fronts: FrontsUi }) {
  const reduce = useReducedMotion();
  const zones = frontZones(plan);
  const pen = isPeninsula(cfg.layout);
  const zoneName = (z: FrontZone) => (z === "island" && pen ? "Poluotok" : FRONT_ZONE_NAME[z]);
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
                Druga boja za gornje elemente, visoki stup{zones.includes("island") ? (pen ? " ili poluotok" : " ili otok") : ""}.
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
                  itemLabel={(z) => `${zoneName(z.id as FrontZone)}: ${frontDef(frontFor(cfg, z.id as FrontZone))?.name ?? ""}`}
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
                        <span className={`text-[11.5px] font-medium leading-none ${on ? "text-fg" : "text-fg/70"}`}>{zoneName(z.id as FrontZone)}</span>
                      </>
                    );
                  }}
                </RadioGrid>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      <SectionLabel id="studio-fronts-label">{twoTone ? `Boja: ${zone === "island" && pen ? "poluotok" : FRONT_ZONE_LONG[zone]}` : "Boja i materijal fronti"}</SectionLabel>
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

      <p className="mt-5 text-[12px] leading-relaxed text-mut">Boje na zaslonu su približne.</p>

      <OpeningSection cfg={cfg} plan={plan} update={update} edit={edit} advanced={advanced} />
      <GlassSection cfg={cfg} edit={edit} advanced={advanced} />

      <RoomSection cfg={cfg} edit={edit} engine={engine} />
    </div>
  );
}

/**
 * "Prostor": the room's walls (every wall, or one — the bare room walls too) and the floor, and the ceiling with its
 * light (seen from inside the room: the view switch's "Iz prostorije") — the look in 3D only, not the kitchen or its price
 */
function RoomSection({ cfg, edit, engine }: Pick<StepProps, "cfg" | "edit" | "engine">) {
  const walls = roomWallIds(cfg);
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<WallId | "all">("all");
  const which: WallId | "all" = scope !== "all" && walls.includes(scope) ? scope : "all";
  const f = roomFinishes(cfg);
  const value = which === "all" ? (cfg.room?.wall ?? f.walls.a) : f.walls[which];
  const mixed = walls.some((w) => f.walls[w] !== f.walls[walls[0]]);
  const name = (id: string) => catalog.room.walls.find((w) => w.id === id)?.name ?? "";
  const floorName = catalog.room.floors.find((x) => x.id === f.floor)?.name ?? "";
  const ceiling = Boolean(cfg.room?.ceiling);
  const lamp = Boolean(cfg.room?.lamp);
  const pick = (id: string) =>
    edit(setRoomFinish(cfg, { wall: which, finish: id }), {
      coalesce: `room-wall-${which}`,
      say: `${which === "all" ? "Svi zidovi" : `Zid ${which.toUpperCase()}`}: ${name(id)}.`,
    });

  return (
    <div className="mt-8">
      <Disclosure
        title="Zidovi, pod i strop"
        value={`Zidovi: ${mixed ? "različiti" : name(f.walls[walls[0]]).toLowerCase()} · pod: ${floorName.toLowerCase()}${ceiling ? " · strop" : ""}`}
        icon={<PaletteIcon className="h-5 w-5" />}
        open={open}
        onToggle={() => setOpen((o) => !o)}
      >
        <p className="text-[12px] leading-relaxed text-mut">
          Samo za dojam, ne utječe na cijenu.
          {engine ? " Zid ili pod možete kliknuti i u 3D prikazu." : ""}
        </p>

        <p className="mt-4 text-[13px] text-fg">
          Zidovi
          <span className="ml-2 text-mut">{which === "all" && mixed ? "različiti" : name(value)}</span>
        </p>
        {walls.length > 1 && (
          <Segmented
            className="mt-2.5"
            label="Koji zid"
            size="sm"
            options={[
              { id: "all" as const, label: "Svi zidovi" },
              ...walls.map((w) => ({ id: w, label: `Zid ${w.toUpperCase()}`, aria: `Zid ${w.toUpperCase()}, ${WALL_HINT[w]}` })),
            ]}
            value={which}
            onChange={setScope}
          />
        )}
        <p className="mb-2 mt-3.5 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">Boje</p>
        <RoomSwatches label={which === "all" ? "Boja svih zidova" : `Zid ${which.toUpperCase()}: boja`} items={WALL_PAINTS} value={which === "all" && mixed ? "" : value} onChange={pick} />
        <p className="mb-2 mt-4 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">Obloge</p>
        <RoomSwatches label={which === "all" ? "Obloga svih zidova" : `Zid ${which.toUpperCase()}: obloga`} items={WALL_FINISHES} value={which === "all" && mixed ? "" : value} onChange={pick} />

        <p className="mt-6 text-[13px] text-fg">
          Pod
          <span className="ml-2 text-mut">{floorName}</span>
        </p>
        <div className="mt-3">
          <RoomSwatches label="Pod" items={FLOORS} value={f.floor} onChange={(id) => edit(setRoomFinish(cfg, { floor: id }), { coalesce: "room-floor", say: `Pod: ${catalog.room.floors.find((x) => x.id === id)?.name ?? ""}.` })} square />
        </div>

        <p className="mt-6 text-[13px] text-fg">Strop</p>
        <p className="mt-1 text-[12px] leading-relaxed text-mut">
          Vidi se kad gledate iz prostorije{engine ? " (prikaz „Iz prostorije” ili „Frontalno” gore lijevo)" : ""}.
        </p>
        <div className="mt-3 space-y-3">
          <SwitchLine
            label="Strop prostorije"
            checked={ceiling}
            onChange={(on) => edit(setRoomCeiling(cfg, { ceiling: on }), { say: on ? "Strop je prikazan." : "Strop je skriven." })}
          />
          <SwitchLine
            label="Stropno svjetlo"
            description="Okrugla svjetiljka na sredini stropa."
            checked={lamp}
            onChange={(on) => edit(setRoomCeiling(cfg, { lamp: on, ...(on ? { ceiling: true } : {}) }), { say: on ? "Stropno svjetlo je uključeno." : "Bez stropnog svjetla." })}
          />
        </div>
      </Disclosure>
    </div>
  );
}
