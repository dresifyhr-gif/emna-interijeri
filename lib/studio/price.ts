/**
 * Okvirna cijena (rough estimate) of a configured kitchen.
 *
 * Uses the same plan as the 3D view, so every visible cabinet, filler,
 * mechanism, worktop and backsplash piece is counted. All rates live in
 * catalog.ts and are NOT confirmed by the owner yet (see PRICES_CONFIRMED).
 * Appliances are not included — see the note at the top of catalog.ts.
 */

import { PRICES_CONFIRMED, catalog, frontDef, handleDef, moduleDef, topDef } from "./catalog";
import { DIM, planKitchen, type KitchenPlan } from "./plan";
import type { KitchenConfig } from "./types";

export { PRICES_CONFIRMED };

/** share of the per-metre front price that each zone uses */
const ZONE_FACTOR = { base: 0.6, upper: 0.4, tall: 1.6, island: 0.8, filler: 0.25 } as const;

const round100 = (n: number) => Math.max(0, Math.round(n / 100) * 100);

export interface PriceBreakdown {
  cabinets: number;
  worktop: number;
  /** stone backsplash between worktop and wall units (same material as the worktop) */
  backsplash: number;
  handles: number;
  mechanisms: number;
  led: number;
  install: number;
  island: number;
  total: number;
}

/** m² of backsplash the engine draws for this plan (every piece starts on the worktop surface) */
export function backsplashArea(plan: KitchenPlan): number {
  let cm2 = 0;
  for (const r of plan.runs) for (const p of r.backsplash) cm2 += (p.to - p.from) * (p.top - DIM.worktopTop);
  return cm2 / 10000;
}

/** Itemised estimate (EUR, unrounded) — handy for debugging and for the owner. */
export function breakdown(cfg: KitchenConfig): PriceBreakdown {
  const plan = planKitchen(cfg);
  const c = plan.cfg;
  const front = frontDef(c.front) ?? catalog.fronts[0];
  const top = topDef(c.top) ?? catalog.tops[0];
  const handle = handleDef(c.handles) ?? catalog.handles[0];
  const m = (cm: number) => cm / 100;

  let base = 0;
  let upper = 0;
  let tall = 0;
  let island = 0;
  let mechanisms = 0;
  for (const s of plan.slots) {
    const w = m(s.width);
    if (s.zone === "base") base += w;
    else if (s.zone === "upper") upper += w;
    else if (s.zone === "tall") tall += w;
    else island += w;
    mechanisms += moduleDef(s.zone, s.type)?.priceAdd ?? 0;
  }
  const fillers = plan.pieces.reduce((sum, p) => sum + m(p.width), 0);

  const cabinets =
    front.pricePerMeter *
    (ZONE_FACTOR.base * base +
      ZONE_FACTOR.upper * upper +
      ZONE_FACTOR.tall * tall +
      ZONE_FACTOR.island * island +
      ZONE_FACTOR.filler * fillers);

  let worktopM = plan.runs.reduce((sum, r) => sum + (r.worktop ? m(r.worktop.to - r.worktop.from) : 0), 0);
  let islandCost = 0;
  if (plan.island) {
    // slab (deeper than a wall worktop, ~1.5x) + two waterfall sides (~0.9 m each)
    worktopM += m(plan.island.length) * 1.5 + 2 * m(DIM.worktopTop) * 0.8;
    islandCost = catalog.extras.islandFixed;
  }
  const worktop = top.pricePerMeter * worktopM;
  // the top's price per m² (a running metre of worktop is DIM.worktopDepth deep) times the backsplash share
  const backsplash = (top.pricePerMeter / m(DIM.worktopDepth)) * catalog.extras.backsplashShare * backsplashArea(plan);
  const handles = handle.pricePerMeter * (base + upper + tall + island);
  const led = c.led ? catalog.extras.ledPerMeter * Math.max(upper, 0.6) + catalog.extras.ledFixed : 0;
  const install = catalog.extras.installPerMeter * (base + tall + island + upper * 0.5);
  const total = cabinets + worktop + backsplash + handles + mechanisms + led + install + islandCost;
  return { cabinets, worktop, backsplash, handles, mechanisms, led, install, island: islandCost, total };
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
