/** Physical dimensions in metres (the engine works in metres, the plan in cm). */

import { DIM, type KitchenPlan } from "../plan";
import type { HandleStyle } from "../types";

const cm = (v: number) => v / 100;

export const D = {
  plinth: cm(DIM.plinth),
  /** carcass height of base units (plinth + this + worktop = 90 cm) */
  baseH: 0.76,
  /** base carcass depth (front adds 2 cm -> 60 cm) */
  carcass: 0.578,
  /** wall-unit carcass depth (front adds 2 cm -> ~35 cm) */
  upperCarcass: 0.325,
  frontT: 0.019,
  /** distance between carcass edge and the back of a front (door bumpers) */
  frontOff: 0.0015,
  /** half of the gap between two fronts -> 3 mm reveal */
  gap: 0.0015,
  worktopT: 0.04,
  worktopDepth: cm(DIM.worktopDepth),
  board: 0.018,
  back: 0.008,
  golaH: 0.035,
  /** handleless wall units: fronts reach this far below the carcass as a finger grip */
  upperLip: 0.015,
  /** "luft za prste" (HandleStyle "luft"): wall-unit fronts reach this far below the carcass, base fronts stop this far under the worktop */
  luftLip: 0.025,
  luftH: 0.03,
  /** push-to-open fronts: half of their (wider, 4 mm) reveal — the latch needs the room */
  pushGap: 0.002,
  plinthRecess: 0.06,
  wallT: 0.12,
  backsplashT: cm(DIM.backsplashT),
  panel: cm(DIM.panel),
  /** how far the wall plane continues past an open end of the kitchen */
  wallExtend: 0.7,
} as const;

/** top of the base carcass = underside of the worktop */
export const TOP_Y = D.plinth + D.baseH;
/** worktop surface (90 cm) */
export const WORK_Y = TOP_Y + D.worktopT;
/** z of the visible face of a base front */
export const BASE_FACE = D.carcass + D.frontOff + D.frontT;
/** z of the visible face of a wall-unit front */
export const UPPER_FACE = D.upperCarcass + D.frontOff + D.frontT;

export { cm };

/** how far a wall unit's front reaches below its carcass for this opening style (Gola lip, finger gap, else none) */
export function lipOf(handles: HandleStyle): number {
  return handles === "bez" ? D.upperLip : handles === "luft" ? D.luftLip : 0;
}

/** how far a base front stops under the worktop for this opening style (the Gola channel, the finger gap, else 0) */
export function gripGapOf(handles: HandleStyle): number {
  return handles === "bez" ? D.golaH : handles === "luft" ? D.luftH : 0;
}

/**
 * A plan's cabinet heights in engine metres (plan.ts HeightPlan, KitchenConfig.heights). Base, island and tall
 * modules are always built for the standard 10 cm plinth (TOP_Y / WORK_Y above) and then stand `lift` higher
 * (worktop 85 / 95 cm: −5 / +5 cm; modules.ts createModule); wall units, the top row and the cornice are absolute.
 */
export interface EngineHeights {
  /** how much higher than standard the base / island / tall modules stand (m, may be negative) */
  lift: number;
  /** plinth height (m) */
  plinth: number;
  /** underside / surface of the worktop (m) */
  topY: number;
  workY: number;
  /** worktop thickness (m; KitchenConfig.worktop, 0.04 for every older link) */
  worktopT: number;
  /** the "do stropa" top row's default depth (m, HeightSpec.topDepth; an element may have its own: BuildCtx.topDepth) */
  topDepth: number;
  /** wall units, main row (m) */
  ub: number;
  ut: number;
  /** "do stropa": second row of top cabinets on the wall units (m); null = none */
  topRow: { y0: number; y1: number } | null;
  /** top of the tall column (m) */
  tallTop: number;
  /** tall units end here and a top box continues to tallTop (m); null = one piece up to tallTop */
  tallSplit: number | null;
  /** "do stropa": front-coloured cornice strip from the cabinets' line up to the ceiling (m); null = none */
  cornice: { y0: number; y1: number } | null;
  ceiling: number;
}

export function heightsOf(plan: KitchenPlan): EngineHeights {
  const h = plan.heights;
  const lift = cm(h.plinth - DIM.plinth);
  const T = cm(h.worktopT ?? DIM.worktopT);
  return {
    lift,
    plinth: cm(h.plinth),
    topY: TOP_Y + lift,
    // (WORK_Y + lift for the 4 cm worktop of every older link)
    workY: Math.abs(T - D.worktopT) < 1e-9 ? WORK_Y + lift : TOP_Y + lift + T,
    worktopT: T,
    topDepth: cm(h.topDepth ?? 35),
    ub: cm(h.upperBottom),
    ut: cm(h.upperTop),
    topRow: h.topRow ? { y0: cm(h.topRow.from), y1: cm(h.topRow.to) } : null,
    tallTop: cm(h.tallTop),
    tallSplit: h.tallSplit === null ? null : cm(h.tallSplit),
    cornice: h.cornice ? { y0: cm(h.cornice.from), y1: cm(h.cornice.to) } : null,
    ceiling: cm(plan.ceiling),
  };
}
