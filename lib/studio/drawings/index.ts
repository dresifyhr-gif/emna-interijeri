/**
 * 2D drawings of a kitchen plan — the floor plan and the elevations a carpenter draws, built from the same KitchenPlan
 * the 3D engine, the price and the summary use (lib/studio/plan.ts planKitchen), so the drawings show exactly the
 * kitchen the customer configured.
 *
 *   const plan = planKitchen(cfg);
 *   const { plan: tlocrt, elevations } = kitchenDrawings(plan);
 *   const { svg, width, height, scale } = toSVG(tlocrt, { fit: { width: 277, height: 170 } });   // A4 landscape
 *   const entities = toDxfEntities(elevations[0], { scale: 20 });                                    // for a DXF writer
 *
 * Pure TypeScript, no DOM, no three.js, no React — import it on the server, in a worker, or lazily in the browser
 * (the PDF export loads it only when it exports). Units: centimetres; see model.ts for the frames.
 */

import type { KitchenPlan } from "../plan";
import type { WallId } from "../types";
import { elevations, islandElevation, wallElevation } from "./elevation";
import { floorPlan } from "./floorplan";
import type { Drawing } from "./model";

export { floorPlan, wallFrame } from "./floorplan";
export { elevations, islandElevation, wallElevation } from "./elevation";
export { elementLabels, runTitle, slotTypeName, WALL_T } from "./common";
export { slotFace, type Face, type FaceCtx } from "./face";
export { DEFAULT_COLORS, DEFAULT_WEIGHTS, DIM_GAP, DIM_STEP, STANDARD_SCALES, dimLineAt, dimText, fitScale, paperSize, toSVG, type SvgColors, type SvgOptions, type SvgResult } from "./svg";
export { DXF_LAYERS, toDxfEntities, type DxfEntity, type DxfOptions } from "./dxf";
export * from "./model";

/** which elevation: a wall, the island / peninsula from its working side ("isl") or from its seating side ("isl-straga") */
export type ElevationId = WallId | "isl" | "isl-straga";

/** the elevation of a wall or of the island / peninsula; null when the layout has none */
export function elevation(plan: KitchenPlan, which: ElevationId): Drawing | null {
  if (which === "isl") return islandElevation(plan, "front");
  if (which === "isl-straga") return islandElevation(plan, "back");
  return wallElevation(plan, which);
}

export interface KitchenDrawings {
  /** "tlocrt" */
  plan: Drawing;
  /** the walls A, B, C (as the layout has them), then the island / peninsula: working side, seating side */
  elevations: Drawing[];
}

/** every drawing of a kitchen */
export function kitchenDrawings(plan: KitchenPlan): KitchenDrawings {
  return { plan: floorPlan(plan), elevations: elevations(plan) };
}
