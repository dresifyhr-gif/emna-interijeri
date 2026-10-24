/**
 * The ranges the planner actually honours, so the fields, the 3D view and the summary always show the same numbers.
 *
 * sanitizeConfig (lib/studio/plan.ts) keeps every value inside `limitsFor(layout)`, but planKitchen then narrows a
 * few of them further: a window is at most wall − 10 cm wide and its sill sits at least 40 cm below the window top
 * (ceiling − 25, never above DIM.windowTopMax); an island stays centred on wall A only while it is at most
 * wall A + 40 cm long. The studio clamps the config to the same ranges instead of letting the planner change the
 * customer's numbers behind their back.
 */
import { DIM, limitsFor, wallsFor } from "@/lib/studio/plan";
import type { KitchenConfig, WallId } from "@/lib/studio/types";
import { clamp } from "./meta";

/** planKitchen: `width = min(width, len - 10)` */
const WINDOW_WALL_CLEARANCE = 10;
/** planKitchen: `sill <= top - 40` */
const WINDOW_MIN_HEIGHT = 40;
/** planKitchen: `top = min(ceiling - 25, DIM.windowTopMax)` */
const WINDOW_CEILING_GAP = 25;
/** sanitizeConfig: `sill <= ceiling - 70` */
const SILL_CEILING_GAP = 70;
/** planKitchen centres the island on wall A within ±20 cm of overhang on each side */
const ISLAND_OVERHANG = 40;

type Range = readonly [number, number];

const range = (lo: number, hi: number): Range => [lo, Math.max(lo, hi)];

export function windowLimits(cfg: KitchenConfig, wall: WallId): { width: Range; sill: Range } {
  const lim = limitsFor(cfg.layout);
  const len = cfg.walls[wall];
  const top = Math.min(cfg.ceiling - WINDOW_CEILING_GAP, DIM.windowTopMax);
  return {
    width: range(lim.windowWidth[0], Math.min(lim.windowWidth[1], len - WINDOW_WALL_CLEARANCE)),
    sill: range(lim.sill[0], Math.min(lim.sill[1], cfg.ceiling - SILL_CEILING_GAP, top - WINDOW_MIN_HEIGHT)),
  };
}

export function islandLimits(cfg: KitchenConfig): Range {
  const lim = limitsFor(cfg.layout);
  return range(lim.island[0], Math.min(lim.island[1], cfg.walls.a + ISLAND_OVERHANG));
}

/** Clamp a (sanitised) config to the planner's ranges. Returns the same object when nothing changes. */
export function fitToPlanner(cfg: KitchenConfig): KitchenConfig {
  let next = cfg;
  const win = cfg.window;
  if (win && wallsFor(cfg.layout).includes(win.wall)) {
    const lim = windowLimits(cfg, win.wall);
    const width = clamp(win.width, lim.width[0], lim.width[1]);
    const offset = clamp(win.offset, 0, Math.max(0, cfg.walls[win.wall] - width));
    const sill = clamp(win.sill, lim.sill[0], lim.sill[1]);
    if (width !== win.width || offset !== win.offset || sill !== win.sill) next = { ...next, window: { ...win, width, offset, sill } };
  }
  if (cfg.layout === "otok") {
    const [lo, hi] = islandLimits(cfg);
    const island = clamp(cfg.island, lo, hi);
    if (island !== cfg.island) next = { ...next, island };
  }
  return next;
}
