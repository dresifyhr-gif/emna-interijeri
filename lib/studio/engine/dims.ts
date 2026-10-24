/** Physical dimensions in metres (the engine works in metres, the plan in cm). */

import { DIM } from "../plan";

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
