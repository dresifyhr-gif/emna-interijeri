/**
 * "Uređaji" in the phone's step-by-step flow — pure logic over lib/studio/edit.ts (no React; tested in
 * lib/studio/phone-flow.test.ts). Each choice reads what the kitchen has now and each setter makes the kitchen have it
 * (doing nothing when it already does), so the choices can be made in any order and the screen always shows the truth:
 *
 *   Hladnjak        ugradbeni (a 60 cm tall unit) / side-by-side (the niche for a 91 cm freestanding two-door fridge) —
 *                   changeType on the fridge of a tall column; and where the column stands (moveTall over tallPlaces)
 *   Pećnica         in the tall column ("pecnica") / under the hob ("ploca-pecnica": the hob unit with the oven below) —
 *                   remove / insert the column's oven unit and changeType the hob
 *   Napa            setHood (hidden in a wall unit, chimney, angled glass, downdraft in the hob)
 *   Na otoku        setIslandFunctions (nothing, the hob, the sink, both) — layouts with an island / peninsula
 *   Sudoper         left / right of the hob (the base run mirrored with moveLeft / moveRight, every cabinet keeps its
 *                   width), or under the window (the run back to the planner's, which puts the sink there)
 *   Perilica        a dishwasher beside the sink (changeType of a 45 / 60 cm neighbour) or none (it becomes drawers)
 *
 * Every setter returns an EditResult: refused with the planner's own Croatian reason, or ok with its notes.
 */
import { moduleDef } from "@/lib/studio/catalog";
import {
  changeType,
  hoodChoices,
  insertAfter,
  insertBefore,
  moveRight,
  moveTall,
  remove,
  resetRun,
  setHood,
  setIslandFunctions,
  tallPlaces,
  type EditResult,
} from "@/lib/studio/edit";
import { hasIsland, planKitchen, sanitizeConfig, type KitchenPlan, type PlanSlot } from "@/lib/studio/plan";
import type { HoodKind, IslandFunctions, KitchenConfig, RunEnd, WallId } from "@/lib/studio/types";
import { WALL_HINT } from "../meta";

export type FridgeKind = "ugradbeni" | "sbs";
export type OvenPlace = "stup" | "ploca";
export type SinkSide = "lijevo" | "desno" | "prozor";

const FRIDGES: Record<string, FridgeKind> = { hladnjak: "ugradbeni", "hladnjak-sbs": "sbs", "hladnjak-sbs-vrata": "sbs" };
const TALL_OVENS = new Set(["pecnica", "pecnica-mikro"]);
const BASE_OVENS = new Set(["ploca-pecnica", "pecnica-donja"]);

export const FRIDGE_OPTIONS: { id: FridgeKind; name: string; note: string }[] = [
  { id: "ugradbeni", name: "Ugradbeni", note: "Iza fronte, 60 cm" },
  { id: "sbs", name: "Side-by-side", note: "Samostojeći dvokrilni, 91 cm" },
];

export const OVEN_OPTIONS: { id: OvenPlace; name: string; note: string }[] = [
  { id: "stup", name: "U visokom stupu", note: "U visini očiju" },
  { id: "ploca", name: "Ispod ploče", note: "Ispod ploče za kuhanje" },
];

/** short names of the hood kinds (catalog.hoods.kinds), in their order */
export const HOOD_NAMES: Record<HoodKind, { name: string; note: string }> = {
  ugradbena: { name: "Skrivena", note: "U gornjem elementu" },
  dimnjak: { name: "Zidna", note: "S dimnjakom" },
  kosa: { name: "Kosa", note: "Staklena, na zidu" },
  ploca: { name: "U ploči", note: "Bez nape iznad" },
};

export const ISLAND_OPTIONS: { id: IslandFunctions; name: string }[] = [
  { id: "none", name: "Samo ormarići" },
  { id: "hob", name: "Ploča" },
  { id: "sink", name: "Sudoper" },
  { id: "both", name: "Ploča i sudoper" },
];

export const SINK_NAMES: Record<Exclude<SinkSide, "prozor">, string> = { lijevo: "Lijevo od ploče", desno: "Desno od ploče" };

export interface ColumnPlace {
  end: RunEnd;
  label: string;
  fits: boolean;
}

export interface Appliances {
  /** the kitchen's fridge (a tall unit); null: none */
  fridge: FridgeKind | null;
  /** where the fridge's tall column can stand (two or more places), with the one it stands at; null: nothing to choose */
  column: { list: "tall" | `tall:${RunEnd}`; end: RunEnd; places: ColumnPlace[] } | null;
  /** where the oven is; null: the kitchen has none */
  oven: OvenPlace | null;
  hood: HoodKind;
  /** what the island / peninsula holds; null: the layout has none */
  island: IslandFunctions | null;
  /** the sink's side of the hob; null: no sink, or sink and hob on different walls (nothing simple to choose) */
  sink: Exclude<SinkSide, "prozor"> | null;
  sinkOptions: Exclude<SinkSide, "prozor">[];
  /** the sink stands under the window of its wall; null: no window on that wall (or no sink) */
  underWindow: boolean | null;
  /** a dishwasher in the kitchen; null: no sink, so no question */
  dishwasher: boolean | null;
}

const ok = (cfg: KitchenConfig, warning: string | null = null): EditResult => ({ cfg, ok: true, warning, slotId: null });
const fail = (cfg: KitchenConfig, warning: string): EditResult => ({ cfg, ok: false, warning, slotId: null });

/** a chain of edits: stops at the first refusal (the input unchanged), else joins the notes */
function chain(cfg: KitchenConfig, steps: ((c: KitchenConfig) => EditResult | null)[]): EditResult {
  let cur = cfg;
  const notes: string[] = [];
  for (const step of steps) {
    const r = step(cur);
    if (!r) continue;
    if (!r.ok) return { ...r, cfg };
    if (r.warning && !notes.includes(r.warning)) notes.push(r.warning);
    cur = r.cfg;
  }
  return ok(cur, notes.length ? notes.join(" ") : null);
}

const feature = (s: PlanSlot) => (s.zone === "upper" ? undefined : moduleDef(s.zone === "island" ? "base" : s.zone, s.type)?.feature);
const fridgeSlot = (p: KitchenPlan) => p.slots.find((s) => s.zone === "tall" && FRIDGES[s.type]);
const tallOvenSlot = (p: KitchenPlan) => p.slots.find((s) => s.zone === "tall" && TALL_OVENS.has(s.type));
const baseOvenSlot = (p: KitchenPlan) => p.slots.find((s) => s.zone !== "tall" && s.zone !== "upper" && BASE_OVENS.has(s.type));
const slotById = (p: KitchenPlan, id: string | null) => (id ? (p.slots.find((s) => s.id === id) ?? null) : null);
const hobSlot = (p: KitchenPlan) => slotById(p, p.hobId) ?? p.slots.find((s) => feature(s) === "hob") ?? null;
const sinkSlot = (p: KitchenPlan) => slotById(p, p.sinkId) ?? p.slots.find((s) => feature(s) === "sink") ?? null;

/** the tall columns' places as the phone names them: "Lijevo" / "Desno" on one wall, else the wall ("Zid B (lijevi)") */
function placeLabels(places: { end: RunEnd; fits: boolean }[]): ColumnPlace[] {
  const walls = [...new Set(places.map((p) => p.end.split("-")[0] as WallId))];
  return places.map((p) => {
    const [w, side] = p.end.split("-") as [WallId, "left" | "right"];
    const both = places.filter((x) => x.end.startsWith(`${w}-`)).length > 1;
    const lr = side === "left" ? "Lijevo" : "Desno";
    const label = walls.length === 1 ? lr : both ? `Zid ${w.toUpperCase()}, ${lr.toLowerCase()}` : `Zid ${w.toUpperCase()} (${WALL_HINT[w]})`;
    return { end: p.end, label, fits: p.fits };
  });
}

/** the sink's side of the hob (both on the same wall run), and whether it stands under its wall's window */
function sinkSideOf(p: KitchenPlan): { side: Exclude<SinkSide, "prozor"> | null; options: Exclude<SinkSide, "prozor">[]; underWindow: boolean | null } {
  const sink = sinkSlot(p);
  if (!sink) return { side: null, options: [], underWindow: null };
  const c = sink.x + sink.width / 2;
  const win = p.window && p.window.wall === sink.run && sink.zone === "base" ? p.window : null;
  const underWindow = win ? c >= win.offset && c <= win.offset + win.width : null;
  const hob = hobSlot(p);
  if (!hob || sink.run !== hob.run || sink.run === "isl" || sink.zone !== "base" || hob.zone !== "base") return { side: null, options: [], underWindow };
  return { side: c < hob.x + hob.width / 2 ? "lijevo" : "desno", options: ["lijevo", "desno"], underWindow };
}

export function readAppliances(input: KitchenConfig): Appliances {
  const cfg = sanitizeConfig(input);
  const p = planKitchen(cfg);
  const fr = fridgeSlot(p);
  let column: Appliances["column"] = null;
  const list = fr?.list?.id;
  if (fr && list && (list === "tall" || list.startsWith("tall:"))) {
    const id = list as "tall" | `tall:${RunEnd}`;
    const places = tallPlaces(cfg, id);
    const cur = places.find((x) => x.current);
    if (cur && places.length > 1) column = { list: id, end: cur.end, places: placeLabels(places) };
  }
  const sink = sinkSideOf(p);
  return {
    fridge: fr ? FRIDGES[fr.type] : null,
    column,
    oven: baseOvenSlot(p) ? "ploca" : tallOvenSlot(p) ? "stup" : null,
    hood: hoodChoices(cfg).kind,
    island: hasIsland(cfg.layout) ? (cfg.islandSpec?.functions ?? "none") : null,
    sink: sink.side,
    sinkOptions: sink.options,
    underWindow: sink.underWindow,
    dishwasher: sinkSlot(p) ? p.slots.some((s) => feature(s) === "dishwasher") : null,
  };
}

/* ------------------------------------------------------------------ fridge */

/** the kitchen's default tall column (oven + fridge) when it has none */
function withColumn(cfg: KitchenConfig): EditResult | null {
  if (cfg.tall && planKitchen(cfg).slots.some((s) => s.zone === "tall")) return null;
  const next = sanitizeConfig({ ...cfg, tall: true });
  return planKitchen(next).slots.some((s) => s.zone === "tall") ? ok(next) : fail(cfg, "Za visoki stup s hladnjakom ovdje nema mjesta.");
}

export function setFridgeKind(input: KitchenConfig, kind: FridgeKind): EditResult {
  const cfg = sanitizeConfig(input);
  const type = kind === "ugradbeni" ? "hladnjak" : "hladnjak-sbs";
  return chain(cfg, [
    (c) => (fridgeSlot(planKitchen(c)) ? null : withColumn(c)),
    (c) => {
      const p = planKitchen(c);
      const fr = fridgeSlot(p);
      if (fr) {
        if (FRIDGES[fr.type] === kind) return null;
        const r = changeType(c, fr.id, type, "tall");
        // the wider fridge does not fit beside the oven: say what makes room
        if (!r.ok && kind === "sbs" && tallOvenSlot(p)) return fail(c, `${r.warning ?? "Dvokrilni hladnjak ovdje ne stane."} Ili odaberite pećnicu ispod ploče — tada ima mjesta.`);
        return r;
      }
      // a column without a fridge: the fridge goes at its end
      const last = [...p.slots].reverse().find((s) => s.zone === "tall" && s.list?.id === "tall");
      return last ? insertAfter(c, last.id, type, undefined, "tall") : fail(c, "Za hladnjak ovdje nema mjesta.");
    },
  ]);
}

export function setColumnEnd(input: KitchenConfig, end: RunEnd): EditResult {
  const cfg = sanitizeConfig(input);
  const col = readAppliances(cfg).column;
  if (!col) return fail(cfg, "Visoki stup ovdje nema drugo mjesto.");
  if (col.end === end) return ok(cfg);
  return moveTall(cfg, col.list, end);
}

/* ------------------------------------------------------------------ oven */

export function setOvenPlace(input: KitchenConfig, place: OvenPlace): EditResult {
  const cfg = sanitizeConfig(input);
  const now = readAppliances(cfg).oven;
  if (now === place) return ok(cfg);
  if (place === "ploca") {
    return chain(cfg, [
      (c) => {
        const hob = hobSlot(planKitchen(c));
        if (!hob) return fail(c, "Kuhinja nema ploču za kuhanje — dodajte je u 3D prikazu.");
        if (hob.type === "ploca-pecnica") return null;
        const r = changeType(c, hob.id, "ploca-pecnica");
        return r.ok ? r : fail(c, "Pećnica ispod ploče ide uz ploču širine 60 ili 90 cm.");
      },
      // the column's oven goes (the fridge stays)
      (c) => {
        const ov = tallOvenSlot(planKitchen(c));
        return ov ? remove(c, ov.id) : null;
      },
    ]);
  }
  return chain(cfg, [
    // the hob without the oven below, an oven under the worktop becomes drawers
    (c) => {
      const b = baseOvenSlot(planKitchen(c));
      if (!b) return null;
      return changeType(c, b.id, b.type === "ploca-pecnica" ? "ploca" : "ladice");
    },
    (c) => {
      const p = planKitchen(c);
      if (tallOvenSlot(p)) return null;
      const fr = fridgeSlot(p);
      if (!fr) return withColumn(c) ?? fail(c, "Za visoki stup s pećnicom ovdje nema mjesta.");
      // the oven on the inner side of the fridge (the fridge stays at the column's open end)
      const r = fr.list?.index === 0 ? insertAfter(c, fr.id, "pecnica", 60, "tall") : insertBefore(c, fr.id, "pecnica", 60, "tall");
      return r.ok ? r : fail(c, r.warning ?? "Za pećnicu u visokom stupu ovdje nema mjesta.");
    },
  ]);
}

/* ------------------------------------------------------------------ hood, island */

export function setHoodKind(input: KitchenConfig, kind: HoodKind): EditResult {
  const cfg = sanitizeConfig(input);
  return hoodChoices(cfg).kind === kind ? ok(cfg) : setHood(cfg, { kind });
}

export function setIslandUse(input: KitchenConfig, fns: IslandFunctions): EditResult {
  const cfg = sanitizeConfig(input);
  if (!hasIsland(cfg.layout)) return fail(cfg, "Ova kuhinja nema otok ni poluotok.");
  if ((cfg.islandSpec?.functions ?? "none") === fns) return ok(cfg);
  const r = setIslandFunctions(cfg, fns);
  if (!r.ok) return r;
  // an island too short for what was asked can leave the kitchen without a hob or a sink (an edited wall run gave its
  // own up): then nothing changes, and the planner's reason says why
  const before = planKitchen(cfg);
  const after = planKitchen(r.cfg);
  const lost = (hobSlot(before) && !hobSlot(after)) || (sinkSlot(before) && !sinkSlot(after));
  const why = r.warning?.split(/(?<=\.)\s/)[0] ?? "Za to nije dovoljno dugačak.";
  return lost ? fail(cfg, `${why} Produljite ga u koraku Mjere.`) : r;
}

/* ------------------------------------------------------------------ sink */

/**
 * The wall's base run mirrored (the sink and the hob change sides, every cabinet keeps its width): adjacent swaps
 * (edit.ts moveRight), the filler strips at the run's ends staying where they are. Refused for a run with tall units
 * standing in it (they bring the wall units above them along — not a one-tap change).
 */
function mirrorRun(input: KitchenConfig, wall: WallId): EditResult {
  const cfg = sanitizeConfig(input);
  const list = planKitchen(cfg).lists.find((l) => l.id === wall);
  if (!list) return fail(cfg, "Na tom zidu nema kuhinje.");
  const entries = list.entries;
  if (entries.some((e) => e.tall)) return fail(cfg, "Uz visoke elemente u nizu sudoper premjestite u 3D prikazu (strelicama na elementu).");
  let lo = 0;
  let hi = entries.length - 1;
  while (lo <= hi && entries[lo].type === "filer") lo++;
  while (hi >= lo && entries[hi].type === "filer") hi--;
  let cur = cfg;
  // the element at the front of the not-yet-reversed part walks to its back
  for (let done = 0; hi - done > lo; done++) {
    for (let j = lo; j < hi - done; j++) {
      const s = planKitchen(cur).slots.find((x) => x.list?.id === wall && x.list.index === j);
      if (!s) return fail(cfg, "Sudoper se ovdje ne može premjestiti.");
      const r = moveRight(cur, s.id);
      if (!r.ok) return fail(cfg, r.warning ?? "Sudoper se ovdje ne može premjestiti.");
      cur = r.cfg;
    }
  }
  return ok(cur);
}

/**
 * "lijevo" / "desno": the sink on that side of the hob (the run mirrored); "prozor": back under its wall's window (the
 * planner's own run, the dishwasher and oven choices kept)
 */
export function setSinkSide(input: KitchenConfig, side: SinkSide): EditResult {
  const cfg = sanitizeConfig(input);
  const now = readAppliances(cfg);
  if (side === "prozor" ? now.underWindow === true : now.sink === side) return ok(cfg);
  if (side === "prozor" ? now.underWindow === null : !now.sinkOptions.includes(side)) {
    return fail(cfg, side === "prozor" ? "Na zidu sa sudoperom nema prozora." : "Sudoper i ploča nisu na istom zidu.");
  }
  const sink = sinkSlot(planKitchen(cfg));
  if (!sink || sink.run === "isl") return fail(cfg, "Kuhinja nema sudoper na zidu.");
  const wall = sink.run as WallId;
  if (side === "prozor") {
    // the planner's own run puts the sink under the window; what was chosen here before comes back on top of it
    return chain(cfg, [
      (c) => resetRun(c, wall, "base"),
      (c) => (now.oven ? setOvenPlace(c, now.oven) : null),
      (c) => (now.dishwasher !== null ? setDishwasher(c, now.dishwasher) : null),
    ]);
  }
  // left ↔ right: the run mirrored, then checked
  const r = mirrorRun(cfg, wall);
  if (!r.ok) return r;
  const got = readAppliances(r.cfg).sink;
  return got === side ? r : fail(cfg, "Sudoper se ovdje ne može premjestiti na tu stranu — premjestite ga u 3D prikazu.");
}

/* ------------------------------------------------------------------ dishwasher */

export function setDishwasher(input: KitchenConfig, on: boolean): EditResult {
  const cfg = sanitizeConfig(input);
  const p = planKitchen(cfg);
  const dws = p.slots.filter((s) => feature(s) === "dishwasher");
  if (!on) {
    if (!dws.length) return ok(cfg);
    // each dishwasher becomes drawers of its width (the run keeps its look)
    return chain(
      cfg,
      dws.map((d) => (c: KitchenConfig) => {
        const s = planKitchen(c).slots.find((x) => x.zone === d.zone && x.run === d.run && Math.abs(x.x - d.x) < 0.5);
        return s ? changeType(c, s.id, "ladice") : null;
      }),
    );
  }
  if (dws.length) return ok(cfg);
  const sink = sinkSlot(p);
  if (!sink) return fail(cfg, "Kuhinja nema sudoper — perilica ide uz njega.");
  // a plain cabinet of 45 / 60 cm right beside the sink, else the nearest one in its run
  const plain = (s: PlanSlot) =>
    s.run === sink.run && s.zone === sink.zone && !s.cornerId && (s.width === 60 || s.width === 45) && !feature(s) && s.list && !moduleDef(s.zone === "island" ? "base" : s.zone, s.type)?.spacer;
  const near = p.slots
    .filter(plain)
    .sort((a, b) => Math.abs(a.x + a.width / 2 - (sink.x + sink.width / 2)) - Math.abs(b.x + b.width / 2 - (sink.x + sink.width / 2)));
  for (const s of near) {
    const r = changeType(cfg, s.id, "perilica");
    if (r.ok) return r;
  }
  return fail(cfg, "Uz sudoper nema ormarića od 45 ili 60 cm za perilicu — dodajte je u 3D prikazu.");
}
