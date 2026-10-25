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
  catalog,
  defaultHandleColor,
  finishDef,
  frontDef,
  handleColorDef,
  handleDef,
  moduleDef,
  topDef,
  FINISH_DEFAULTS,
} from "./catalog";
import { DIM, frontFor, hasTopBox, planHeights, planKitchen, type KitchenPlan, type SlotZone } from "./plan";
import type { FrontZone, KitchenConfig } from "./types";

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
  worktop: number;
  /** stone backsplash between worktop and wall units (same material as the worktop) */
  backsplash: number;
  handles: number;
  mechanisms: number;
  /** handle colour, sink and tap finish, plinth */
  finishes: number;
  led: number;
  install: number;
  island: number;
  total: number;
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
  const handle = handleDef(c.handles) ?? catalog.handles[0];
  const m = (cm: number) => cm / 100;

  /** metres of cabinets per zone (empty space excluded), and of fronts (open units count less) */
  const run = { base: 0, upper: 0, tall: 0, island: 0 };
  let cabinets = 0;
  let fronted = 0;
  let mechanisms = 0;
  let sinks = 0;
  const hs = heightScale(plan);
  for (const s of plan.slots) {
    const def = moduleDef(s.zone, s.type);
    if (def?.spacer) continue;
    const w = m(s.width);
    const share = def?.frontShare ?? 1;
    run[s.zone] += w;
    cabinets += front(zoneOf(s.zone)).pricePerMeter * ZONE_FACTOR[s.zone] * w * share * hs[s.zone];
    // "do stropa": the top box above a wall unit / a split tall unit (kept in cabinets, so lib/admin's lines still add up)
    if (s.zone === "upper" && hs.top > 0 && hasTopBox(s.type)) cabinets += front("upper").pricePerMeter * ZONE_FACTOR.upper * w * hs.top + TOP_BOX_HARDWARE;
    if (s.zone === "tall" && plan.heights.tallSplit !== null) cabinets += TOP_BOX_HARDWARE;
    fronted += w * share;
    mechanisms += def?.priceAdd ?? 0;
    if (def?.feature === "sink") sinks++;
  }
  for (const p of plan.pieces) {
    const z: FrontZone = p.run === "isl" ? "island" : p.zone;
    cabinets += front(z).pricePerMeter * ZONE_FACTOR.filler * m(p.width);
  }
  // "do stropa": the cornice strip up to the ceiling, priced like a filler
  for (const c of plan.heights.cornices) cabinets += front(c.zone).pricePerMeter * ZONE_FACTOR.filler * m(c.to - c.from);

  let worktopM = plan.runs.reduce((sum, r) => sum + (r.worktop ? m(r.worktop.to - r.worktop.from) : 0), 0);
  let islandCost = 0;
  if (plan.island) {
    // slab (deeper than a wall worktop, ~1.5x) + two waterfall sides (~0.9 m each)
    worktopM += m(plan.island.length) * 1.5 + 2 * m(plan.heights.worktop) * 0.8;
    islandCost = catalog.extras.islandFixed;
  }
  const worktop = top.pricePerMeter * worktopM;
  // the top's price per m² (a running metre of worktop is DIM.worktopDepth deep) times the backsplash share
  const backsplash = (top.pricePerMeter / m(DIM.worktopDepth)) * catalog.extras.backsplashShare * backsplashArea(plan);
  const handles = handle.pricePerMeter * fronted;

  // finishes
  const hc = handleColorDef(c.finish?.handleColor ?? defaultHandleColor(c.handles));
  let finishes = handle.coloured && hc ? hc.priceAdd * fronted : 0;
  finishes += sinks * ((finishDef("sinks", c.finish?.sink ?? FINISH_DEFAULTS.sink)?.priceAdd ?? 0) + (finishDef("taps", c.finish?.tap ?? FINISH_DEFAULTS.tap)?.priceAdd ?? 0));
  finishes += (finishDef("plinths", c.finish?.plinth ?? FINISH_DEFAULTS.plinth)?.priceAdd ?? 0) * (run.base + run.tall + run.island);

  const led = c.led ? catalog.extras.ledPerMeter * Math.max(run.upper, 0.6) + catalog.extras.ledFixed : 0;
  const install = catalog.extras.installPerMeter * (run.base + run.tall + run.island + run.upper * 0.5);
  const total = cabinets + worktop + backsplash + handles + mechanisms + finishes + led + install + islandCost;
  return { cabinets, worktop, backsplash, handles, mechanisms, finishes, led, install, island: islandCost, total };
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
