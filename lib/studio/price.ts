/**
 * Okvirna cijena (rough estimate) of a configured kitchen.
 *
 * Uses the same plan as the 3D view, so every visible cabinet, filler,
 * mechanism, worktop and backsplash piece is counted, each zone in its own
 * front material. All rates live in catalog.ts and are NOT confirmed by the
 * owner yet (see PRICES_CONFIRMED). Appliances are not included — see the
 * note at the top of catalog.ts.
 */

import {
  PRICES_CONFIRMED,
  backsplashDef,
  catalog,
  defaultHandleColor,
  finishDef,
  frontDef,
  glassFrameDef,
  glassTypeDef,
  handleColorDef,
  handleDef,
  hoodKindDef,
  islandHoodStyleDef,
  moduleDef,
  topDef,
  worktopThicknessDef,
  FINISH_DEFAULTS,
  type HandleDef,
} from "./catalog";
import { extraDrawers, golaBetween, drawerRatios, GOLA_MID } from "./fronts";
import {
  DIM,
  TOP_DEPTH_DEFAULT,
  backsplashOfCfg,
  ledZoneOn,
  tallSplitOf,
  frontFor,
  glassOf,
  hasTopBox,
  hoodKindOf,
  openingOf,
  planHeights,
  planKitchen,
  shelvesOf,
  topDepthOf,
  worktopThickness,
  type KitchenPlan,
  type PlanSlot,
  type SlotZone,
} from "./plan";
import type { FrontZone, HandleStyle, KitchenConfig } from "./types";

export { PRICES_CONFIRMED };

/** share of the per-metre front price that each zone uses */
const ZONE_FACTOR = { base: 0.6, upper: 0.4, tall: 1.6, island: 0.8, filler: 0.25 } as const;

const round100 = (n: number) => Math.max(0, Math.round(n / 100) * 100);

/**
 * Taller cabinets cost more (KitchenConfig.heights): each zone's per-metre price scales with its carcass height
 * against the standard heights of the same kitchen; 1 for standard heights. Base and island carcasses keep their
 * 76 cm (the plinth takes the worktop height). `top` = the "do stropa" top row, relative to a standard wall unit.
 * TODO(vlasnik): potvrditi — nadgradni ormarići i lajsna do stropa računaju se kao dio cijene elemenata (cabinets),
 * uz okov klapne TOP_BOX_HARDWARE po ormariću.
 * Exported for lib/admin/quote-from-config.ts, which splits the cabinet total over its lines the same way.
 */
export function heightScale(plan: KitchenPlan): Record<SlotZone, number> & { top: number } {
  const h = plan.heights;
  const std = planHeights({ ...plan.cfg, heights: { mode: "standard", worktop: h.worktop } }).heights;
  const r = (a: number, b: number) => (b > 0 ? a / b : 1);
  const stdUpper = std.upperTop - std.upperBottom;
  return {
    base: 1,
    island: 1,
    upper: r(h.upperTop - h.upperBottom, stdUpper),
    tall: r(h.tallTop - h.plinth, std.tallTop - std.plinth),
    top: h.topRow ? r(h.topRow.to - h.topRow.from, stdUpper) : 0,
  };
}

/** lift-up stay of one top box (nadgradni ormarić), EUR — TODO(vlasnik) */
export const TOP_BOX_HARDWARE = 60;

export interface PriceBreakdown {
  cabinets: number;
  /** the worktop (its thickness: catalog.worktopThickness priceFactor), the island slab, a bar top, side panels of worktop */
  worktop: number;
  /** between worktop and wall units: worktop material (KitchenConfig.backsplash "ploca" / "pola"), glass or tiles */
  backsplash: number;
  /** per metre of fronts, each element in its own opening style (KitchenConfig.handles / CabinetSpec.opt.open) */
  handles: number;
  /** catalogue add-ons of every element (+ the boards of floating shelves) */
  mechanisms: number;
  /** handle colour, sink and tap finish, plinth */
  finishes: number;
  led: number;
  install: number;
  /** island / peninsula extras (islandCost: fixed + bar build + hood mounting); its slab and bar top are in `worktop`, its outer row and end panels in `cabinets` */
  island: number;
  /** glass-door elements: glass kind and frame surcharges (KitchenConfig.glass / CabinetSpec.opt.glass) */
  glass: number;
  /** visible wall hoods and downdraft hobs: fitting, chimney cover, duct (hoodsCost; the appliances themselves are not included) */
  hoods: number;
  /** hanging rails with hooks (KitchenConfig.rails) */
  rails: number;
  /**
   * the "photo" round's options beyond the cabinets (optionsCost): tall units in one piece up to the ceiling, the Gola
   * channel between drawers, extra drawers of a drawer split. 0 for every older link
   */
  options: number;
  total: number;
}

/** one priced option of the "photo" round (optionsCost) — lib/admin/quote-from-config.ts itemises them */
export interface OptionCost {
  id: "tallOnePiece" | "golaMid" | "drawerExtra";
  /** Croatian line for the quote / summary */
  label: string;
  details: string;
  qty: number;
  unit: "kom" | "m";
  /** EUR per unit — TODO(vlasnik): catalog.extras */
  each: number;
}

/**
 * What the "photo" round's options cost beyond the cabinets (catalog.extras, TODO(vlasnik)): a tall unit / side-by-side
 * bridge in one piece up to the ceiling (instead of a top box with a lift-up flap), the Gola channel between the drawers of
 * a handleless drawer unit (per metre), the drawers a drawer split has beyond the type's own. [] for every older link.
 */
export function optionsCost(plan: KitchenPlan): OptionCost[] {
  const c = plan.cfg;
  const x = catalog.extras;
  const out: OptionCost[] = [];
  let one = 0;
  let golaM = 0;
  let drawers = 0;
  for (const s of plan.slots) {
    const def = moduleDef(s.zone, s.type);
    if (!def || def.spacer) continue;
    if (s.zone === "tall" && plan.heights.tallSplit !== null && tallSplitOf(c, plan.heights, s.opt) === null && !def.endUnit) one++;
    if (s.zone !== "upper" && s.zone !== "tall") {
      const r = drawerRatios(c, s.type, s.opt);
      if (r && r.length > 1 && golaBetween(c, openingOf(c, s.opt, s.zone))) golaM += ((r.length - 1) * s.width) / 100;
      drawers += extraDrawers(c, s.type, s.opt);
    }
  }
  if (one) out.push({ id: "tallOnePiece", label: "Visoki elementi u jednom komadu do stropa", details: "fronte do stropa bez nadgradnog ormarića: dulje fronte, dodatne šarke", qty: one, unit: "kom", each: x.tallOnePiece });
  if (golaM > 0.005) {
    out.push({
      id: "golaMid",
      label: "Profil Gola između ladica",
      details: `vodoravni kanal između ladica bez ručki (${GOLA_MID} cm)`,
      qty: Math.round(golaM * 100) / 100,
      unit: "m",
      each: x.golaMidPerMeter,
    });
  }
  if (drawers) out.push({ id: "drawerExtra", label: "Dodatne ladice", details: "podjela ladica s više ladica od osnovnog elementa: vodilice i ladica", qty: drawers, unit: "kom", each: x.drawerExtra });
  return out;
}

/** the share of the LED strip's price the lit zones take (KitchenConfig.ledZones; 1 with every zone on — every older link) */
export function ledShare(cfg: KitchenConfig): number {
  if (!cfg.ledZones) return 1;
  const k = catalog.extras.ledZoneShare;
  return (ledZoneOn(cfg, "under") ? k.under : 0) + (ledZoneOn(cfg, "plinth") ? k.plinth : 0) + (ledZoneOn(cfg, "inner") ? k.inner : 0);
}

/** the handle style an element is priced with (null: it has no fronts — open shelves, empty space, side panels) */
export function slotHandle(cfg: KitchenConfig, s: PlanSlot): HandleDef | null {
  const def = moduleDef(s.zone, s.type);
  if (!def || def.spacer || def.filler) return null;
  return handleDef(openingOf(cfg, s.opt, s.zone)) ?? catalog.handles[0];
}

/** glass-door element: EUR surcharge of its glass kind and frame (per running metre of the element), 0 otherwise */
export function glassCost(cfg: KitchenConfig, s: PlanSlot): number {
  const def = moduleDef(s.zone, s.type);
  if (!def?.glass) return 0;
  const g = glassOf(cfg, s.opt);
  return ((glassTypeDef(g.type)?.priceAdd ?? 0) + (glassFrameDef(g.frame)?.priceAdd ?? 0)) * (s.width / 100);
}

/** floating shelves: EUR of their boards (catalog.extras.shelfBoardPerMeter per metre of each board), 0 otherwise */
export function boardsCost(s: PlanSlot): number {
  const def = moduleDef(s.zone, s.type);
  if (!def?.rows) return 0;
  return shelvesOf(s.opt).rows * (s.width / 100) * catalog.extras.shelfBoardPerMeter;
}

/** a "do stropa" top box's price factor for its depth (catalog.extras.topDepthShare): 1 at 35 cm */
export function topDepthFactor(depth: number): number {
  const k = catalog.extras.topDepthShare;
  return 1 - k + (k * depth) / TOP_DEPTH_DEFAULT;
}

/** EUR of the worktop's thickness factor (catalog.worktopThickness priceFactor; 1 for 4 cm) */
export function worktopFactor(cfg: KitchenConfig): number {
  return worktopThicknessDef(worktopThickness(cfg))?.priceFactor ?? 1;
}

/**
 * Hoods beyond the cabinets (catalog.hoods.kinds priceAdd): every visible wall hood of the plan (RunPlan.hoods) and every
 * downdraft hob (KitchenConfig.hood / opt.hood "ploca") — fitting, chimney cover, duct; the hood / hob is an appliance.
 */
export function hoodsCost(plan: KitchenPlan): { kind: "dimnjak" | "kosa" | "ploca"; count: number; each: number }[] {
  const c = plan.cfg;
  const out: { kind: "dimnjak" | "kosa" | "ploca"; count: number; each: number }[] = [];
  const add = (kind: "dimnjak" | "kosa" | "ploca") => {
    const hit = out.find((x) => x.kind === kind);
    if (hit) hit.count++;
    else out.push({ kind, count: 1, each: hoodKindDef(kind)?.priceAdd ?? 0 });
  };
  for (const r of plan.runs) for (const h of r.hoods ?? []) add(h.kind);
  for (const s of plan.slots) {
    if ((s.zone === "base" || s.zone === "island") && moduleDef("base", s.type)?.feature === "hob" && hoodKindOf(c, s.opt) === "ploca") add("ploca");
  }
  return out;
}

/** metres of hanging rail (KitchenConfig.rails) the plan places */
export function railMetres(plan: KitchenPlan): number {
  return plan.runs.reduce((n, r) => n + (r.rail ? (r.rail.to - r.rail.from) / 100 : 0), 0);
}

/** EUR per m² of the backsplash the config asks for (worktop material: its price per m² × share × thickness factor) */
export function backsplashRate(cfg: KitchenConfig): number {
  const b = backsplashOfCfg(cfg);
  if (b.kind === "staklo" || b.kind === "plocice") return backsplashDef(b.finish ?? undefined)?.pricePerM2 ?? 0;
  if (b.kind === "bez") return 0;
  const top = topDef(cfg.top) ?? catalog.tops[0];
  return (top.pricePerMeter / (DIM.worktopDepth / 100)) * catalog.extras.backsplashShare * worktopFactor(cfg);
}

/**
 * What the island / peninsula costs beyond its cabinets (KitchenConfig.islandSpec, plan.ts IslandPlan) — price.ts adds it
 * to the categories named below, lib/admin/quote-from-config.ts itemises it. All rates: catalog.extras (TODO(vlasnik)).
 * For the island of every older link exactly what price.ts always counted: the slab (1,5 m of worktop per metre) and two
 * waterfall sides (0,8 m each per metre of height), plus catalog.extras.islandFixed.
 */
export interface IslandCost {
  /** metres of worktop (KitchenConfig.top) the slab and its waterfall sides count as → `worktop` */
  slabM: number;
  /** of which the waterfall sides */
  waterfallM: number;
  /** bar / table top in its own top material → `worktop` (EUR) */
  barTop: number;
  /** catalog.tops id of that top (null without a bar) */
  barTopId: string | null;
  /** raised bar: upstand, brackets and fitting; table: fitting → `island` (EUR) */
  barBuild: number;
  /** the outer row of push-to-open cabinets (deeper body) → `cabinets` (EUR) */
  backRow: number;
  /** front-coloured end panels instead of waterfall sides → `cabinets` (EUR) */
  endPanels: number;
  /** catalog.extras.islandFixed → `island` */
  fixed: number;
  /** mounting the ceiling hood above the island hob → `island` (EUR) */
  hood: number;
}

/** the slab depth every older island had (worktop + 35 cm overhang): the island slab's 1,5 m per metre is for this depth */
const STD_SLAB_DEPTH = DIM.worktopDepth + DIM.islandOverhang;

/** the island / peninsula extras of a plan (null without one) */
export function islandCost(plan: KitchenPlan): IslandCost | null {
  const I = plan.island;
  if (!I) return null;
  const c = plan.cfg;
  const x = catalog.extras;
  const m = (cm: number) => cm / 100;
  const islandFront = frontDef(frontFor(c, "island")) ?? catalog.fronts[0];
  // a deeper / shallower slab costs in proportion (the older islands' 98,5 cm deep slab is 1,5 m per metre)
  const slabM = I.slab.reduce((sum, r) => sum + m(r.to - r.from) * ((r.z1 - r.z0) / STD_SLAB_DEPTH) * 1.5, 0);
  const wf = I.waterfalls[0];
  const waterfallM = wf ? I.waterfalls.length * m(plan.heights.worktop) * 0.8 * ((wf.z1 - wf.z0) / STD_SLAB_DEPTH) : 0;
  let barTop = 0;
  let barBuild = 0;
  const b = I.bar;
  if (b) {
    const t = topDef(b.top) ?? catalog.tops[0];
    const len = m(b.to - b.from);
    const depthK = b.depth / DIM.worktopDepth;
    if (b.kind === "raised") {
      barTop = t.pricePerMeter * len * depthK;
      barBuild = islandFront.pricePerMeter * ZONE_FACTOR.island * x.barUpstandShare * len + b.brackets.length * x.barBracket + x.barFixed;
    } else {
      // the top and its two legs (each like a waterfall side of the table's height)
      barTop = t.pricePerMeter * (len + b.legs.length * m(b.height) * 0.8) * depthK;
      barBuild = x.tableFixed;
    }
  }
  const backRow = I.backRow
    ? islandFront.pricePerMeter * ZONE_FACTOR.island * m(I.backRow.to - I.backRow.from) * x.islandBackRowShare * (I.backRow.depth / 60) +
      I.backRow.doors.length * x.islandBackRowLatch
    : 0;
  return {
    slabM: slabM + waterfallM,
    waterfallM,
    barTop,
    barTopId: b ? b.top : null,
    barBuild,
    backRow,
    endPanels: I.endPanels.length * x.islandEndPanel,
    fixed: x.islandFixed,
    hood: I.hood ? (I.hood.style === "kaseta" ? (islandHoodStyleDef("kaseta")?.install ?? x.islandHoodInstall) : x.islandHoodInstall) : 0,
  };
}

/** m² of backsplash the engine draws for this plan (every piece starts on the worktop surface) */
export function backsplashArea(plan: KitchenPlan): number {
  let cm2 = 0;
  const surface = plan.heights?.worktop ?? DIM.worktopTop;
  for (const r of plan.runs) for (const p of r.backsplash) cm2 += (p.to - p.from) * (p.top - surface);
  return cm2 / 10000;
}

const zoneOf = (z: SlotZone): FrontZone => z;

/** Itemised estimate (EUR, unrounded) — handy for debugging and for the owner. */
export function breakdown(cfg: KitchenConfig): PriceBreakdown {
  const plan = planKitchen(cfg);
  const c = plan.cfg;
  const front = (z: FrontZone) => frontDef(frontFor(c, z)) ?? catalog.fronts[0];
  const top = topDef(c.top) ?? catalog.tops[0];
  const m = (cm: number) => cm / 100;
  const wf = worktopFactor(c);

  /** metres of cabinets per zone (empty space excluded), and of fronts (open units count less) */
  const run = { base: 0, upper: 0, tall: 0, island: 0 };
  let cabinets = 0;
  let mechanisms = 0;
  let sinks = 0;
  let handles = 0;
  let glass = 0;
  /** metres of fronts per opening style (each element in its own: CabinetSpec.opt.open) */
  const byStyle = new Map<HandleStyle, number>();
  /** side panels in the worktop material (catalog worktopMaterial): their stone, like a waterfall side */
  let panelStone = 0;
  const hs = heightScale(plan);
  for (const s of plan.slots) {
    const def = moduleDef(s.zone, s.type);
    if (def?.spacer) continue;
    const w = m(s.width);
    const share = def?.frontShare ?? 1;
    run[s.zone] += w;
    cabinets += front(zoneOf(s.zone)).pricePerMeter * ZONE_FACTOR[s.zone] * w * share * hs[s.zone];
    // "do stropa": the top box above a wall unit / a split tall unit (kept in cabinets, so lib/admin's lines still add up);
    // a deeper / shallower top box (HeightSpec.topDepth, opt.depth) costs in proportion (topDepthFactor)
    if (s.zone === "upper" && hs.top > 0 && hasTopBox(s.type)) {
      const k = s.corner ? 1 : topDepthFactor(topDepthOf(c, s.opt));
      cabinets += front("upper").pricePerMeter * ZONE_FACTOR.upper * w * hs.top * k + TOP_BOX_HARDWARE;
    }
    // (a tall unit in one piece up to the ceiling has no top box: optionsCost prices its taller fronts instead)
    if (s.zone === "tall" && tallSplitOf(c, plan.heights, s.opt) !== null) cabinets += TOP_BOX_HARDWARE;
    const h = slotHandle(c, s);
    if (h) {
      handles += h.pricePerMeter * w * share;
      byStyle.set(h.id, (byStyle.get(h.id) ?? 0) + w * share);
    }
    mechanisms += (def?.priceAdd ?? 0) + boardsCost(s);
    glass += glassCost(c, s);
    if (def?.worktopMaterial) panelStone += top.pricePerMeter * catalog.extras.worktopPanelM * wf;
    if (def?.feature === "sink") sinks++;
  }
  for (const p of plan.pieces) {
    const z: FrontZone = p.run === "isl" ? "island" : p.zone;
    cabinets += front(z).pricePerMeter * ZONE_FACTOR.filler * m(p.width);
  }
  // "do stropa": the cornice strip up to the ceiling, priced like a filler
  for (const c of plan.heights.cornices) cabinets += front(c.zone).pricePerMeter * ZONE_FACTOR.filler * m(c.to - c.from);

  // the worktop's pieces (a tall unit standing in a run interrupts it: RunPlan.worktops)
  let worktopM = plan.runs.reduce((sum, r) => sum + r.worktops.reduce((n, w) => n + m(w.to - w.from), 0), 0);
  let islandTotal = 0;
  let barTop = 0;
  let backRowM = 0;
  const ic = islandCost(plan);
  if (ic) {
    // slab (deeper than a wall worktop, ~1.5x) + waterfall sides (~0.9 m each); bar / table top; outer row, end panels
    worktopM += ic.slabM;
    barTop = ic.barTop;
    cabinets += ic.backRow + ic.endPanels;
    islandTotal = ic.fixed + ic.barBuild + ic.hood;
    if (plan.island?.backRow) backRowM = m(plan.island.backRow.to - plan.island.backRow.from);
  }
  // the worktop's thickness (KitchenConfig.worktop) scales its price; a bar / table top keeps its own
  const worktop = top.pricePerMeter * worktopM * wf + barTop + panelStone;
  // worktop material: the top's price per m² (a running metre of worktop is DIM.worktopDepth deep) times the backsplash
  // share; glass / tiles: their own price per m² (KitchenConfig.backsplash)
  const backsplash = backsplashRate(c) * backsplashArea(plan);

  // finishes: the handle colour on the fronts of every coloured style (a gola profile, a bar, a knob, an edge grip)
  const hc = handleColorDef(c.finish?.handleColor ?? defaultHandleColor(c.handles));
  let colouredM = 0;
  for (const [id, metres] of byStyle) if (handleDef(id)?.coloured) colouredM += metres;
  let finishes = hc ? hc.priceAdd * colouredM : 0;
  finishes += sinks * ((finishDef("sinks", c.finish?.sink ?? FINISH_DEFAULTS.sink)?.priceAdd ?? 0) + (finishDef("taps", c.finish?.tap ?? FINISH_DEFAULTS.tap)?.priceAdd ?? 0));
  finishes += (finishDef("plinths", c.finish?.plinth ?? FINISH_DEFAULTS.plinth)?.priceAdd ?? 0) * (run.base + run.tall + run.island);

  // (LED zones switched off one by one take their share of the strip off: ledShare — 1 for every older link)
  const lit = ledShare(c);
  const led = c.led && lit > 0 ? catalog.extras.ledPerMeter * Math.max(run.upper, 0.6) * lit + catalog.extras.ledFixed : 0;
  const install = catalog.extras.installPerMeter * (run.base + run.tall + run.island + run.upper * 0.5 + backRowM * 0.5);
  const hoods = hoodsCost(plan).reduce((n, h) => n + h.count * h.each, 0);
  const rails = railMetres(plan) * catalog.extras.railPerMeter;
  const options = optionsCost(plan).reduce((n, o) => n + o.qty * o.each, 0);
  const total = cabinets + worktop + backsplash + handles + mechanisms + finishes + led + install + islandTotal + glass + hoods + rails + options;
  return { cabinets, worktop, backsplash, handles, mechanisms, finishes, led, install, island: islandTotal, glass, hoods, rails, options, total };
}

/** Rough price range in EUR, rounded to 100 € (about ±8 %). */
export function estimate(cfg: KitchenConfig): { low: number; high: number } {
  const { total } = breakdown(cfg);
  const s = catalog.extras.spread;
  return { low: round100(total * (1 - s)), high: round100(total * (1 + s)) };
}

/** "11.200 – 13.200 €" (Croatian number format) */
export function formatPrice(p: { low: number; high: number }): string {
  const f = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 });
  return `${f.format(p.low)} – ${f.format(p.high)} €`;
}
