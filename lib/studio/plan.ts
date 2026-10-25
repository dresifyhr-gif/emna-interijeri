/**
 * Kitchen planner — turns a KitchenConfig into concrete cabinets, the way a
 * carpenter would: standard carcass widths (30/40/45/50/60/80/90 cm), a filler
 * panel for whatever is left, real blind-corner units, a tall column, a sink
 * with the dishwasher next to it, a hob kept away from the sink and a hood
 * above the hob. Sink and hob come first: they move to another wall when the
 * preferred one is too short, and the tall column is left out rather than
 * pushing either of them out of the kitchen.
 *
 * Runs the customer has edited (KitchenConfig.runs / upperRuns / tallRun, see lib/studio/edit.ts) are placed
 * exactly as listed instead: the planner only closes the remainder (filler, or free space when it is wide)
 * and, when a wall change makes a list too long, leaves elements out from the end — empty space first, then
 * ordinary cabinets, the sink / hob / dishwasher last — with a Croatian warning. Wall units still skip over
 * the window, and a hood in an edited list stays above the hob.
 *
 * The island ("otok") and the peninsula ("poluotok": at the left / right end of wall A; "G": an L kitchen with a
 * peninsula at the right end of wall A) are one run, "isl" (planIsland, IslandPlan): its body, worktop pieces, ends,
 * seats, bar / lowered table and the ceiling hood come from KitchenConfig.islandSpec; a hob / sink put on it
 * (islandSpec.functions) is left off the wall runs. A peninsula stands behind a blind corner unit of wall A, like
 * wall C of a U kitchen without the wall.
 *
 * The room and the kitchen are separate things (the owner: "zidovi prostora je jedno, a dužina kuhinje je drugo"):
 * KitchenConfig.walls are the room's walls, KitchenConfig.extents says where the kitchen stands on each of them
 * (kitchenRange; absent = the whole wall, every older link). A corner unit stands only where two kitchen runs meet in
 * a room corner; a run that does not reach the corner keeps DIM.cornerClear from it (sanitizeConfig). The worktop, the
 * backsplash, the plinth and the planner's own wall units end with the base cabinets: what an edited run leaves free
 * at an open end is bare floor (RunPlan.free), never worktop over nothing. Tall columns stand at any free run end: the
 * tall column (KitchenConfig.tall / tallRun, pinned by tallAt) and more of them (tallRuns, lists "tall:<end>"). Corner
 * units come blind (110 × 60 / 80 × 35) or L-shaped / diagonal (90 × 90 / 60 × 60, catalog CORNER_FOOT); the runs beside
 * them move with the footprint. planGaps lists every empty place the studio shows a "+" for.
 *
 * Pure TypeScript (no three.js, no DOM): the 3D engine, the price estimate and
 * the summary all use the same plan, so what the customer sees is what is
 * priced and what is sent to the owner.
 *
 * Units: centimetres. Every run has its own local x axis that goes from the
 * left end of its wall to the right end, as seen when standing in the room and
 * facing that wall.
 */

import {
  FINISH_DEFAULTS,
  SBS,
  catalog,
  cornerFoot,
  cornerTypes,
  finishDef,
  frontDef,
  handleColorDef,
  handleDef,
  isModuleTypeId,
  moduleDef,
  roomFloorDef,
  roomWallDef,
  topDef,
  widthAllowed,
  type ModuleTypeDef,
} from "./catalog";
import {
  DEFAULT_CONFIG,
  type BarSpec,
  type BaseRunId,
  type CabinetSpec,
  type CornerId,
  type FinishSpec,
  type FrontZone,
  type HandleStyle,
  type HeightSpec,
  type IslandSpec,
  type KitchenConfig,
  type KitchenExtent,
  type Layout,
  type RoomSpec,
  type RunEnd,
  type SeatSide,
  type WallId,
  type WindowSpec,
} from "./types";

// ---------------------------------------------------------------- constants

export const STD_WIDTHS = [30, 40, 45, 50, 60, 80, 90] as const;

/** fixed dimensions in cm */
export const DIM = {
  /** end / cover panel thickness (1.9 cm board, rounded) */
  panel: 2,
  /** base cabinet incl. front */
  baseDepth: 60,
  /** wall cabinet incl. front */
  upperDepth: 35,
  worktopDepth: 63.5,
  /** blind corner base unit: 60 blind + 5 filler + 45 door */
  cornerBase: 110,
  cornerBaseBlind: 60,
  cornerBaseFiller: 5,
  /** blind corner wall unit: 35 blind + 5 filler + 40 door */
  cornerUpper: 80,
  cornerUpperBlind: 35,
  cornerUpperFiller: 5,
  tallWidth: 60,
  /** the default tall column: two 60 cm units + a cover panel on each side (an edited column: its units + 2 panels) */
  tallZone: 124,
  /** walkway between the wall run and the island */
  aisle: 115,
  islandWaterfall: 4,
  islandOverhang: 35,
  plinth: 10,
  worktopTop: 90,
  upperBottom: 147,
  upperTopMax: 219,
  windowTopMax: 220,
  /** a window's top stays at least this far below the ceiling */
  windowCeilingGap: 25,
  /** a window is at most its wall's length minus this */
  windowWallClearance: 10,
  /** smallest window height (sill to top) */
  windowMinHeight: 40,
  /** space kept free on each side of a window for wall units */
  windowMargin: 3,
  /** the island is centred on wall A and may overhang each end of it by at most this */
  islandOverhangMax: 20,
  /** stone backsplash board between worktop and wall units */
  backsplashT: 1.2,
  /** worktop thickness (worktop surface = plinth + base carcass + this) */
  worktopT: 4,
  /** standard distance from the worktop surface up to the bottom of the wall units */
  upperGap: 57,
  /** the least that distance may shrink to when tall wall units must fit under a low ceiling */
  upperGapMin: 45,
  /** standard (and custom) heights: the cabinets stay at least this far below the ceiling (fitting room) */
  ceilingGap: 3,
  /** "do stropa": the front-coloured cornice strip between the cabinets' top line and the ceiling */
  cornice: 2,
  /** "do stropa": one row of wall units up to this height, a second row of top cabinets above it */
  upperRowMax: 105,
  /** "do stropa": wall units of the main row under a second row: from the standard 72 cm up to this */
  upperMainMax: 120,
  /** "do stropa": the second row of top cabinets (nadgradni ormarići) */
  topRowMin: 30,
  topRowMax: 60,
  /** tall units taller than this (carcass) are split into the unit and a top box */
  tallOnePiece: 245,
  /** custom heights: lowest top of the tall column */
  tallTopMin: 180,
  /** a window sill at least this far above the worktop gets an inside sill ledge */
  sillLedgeMin: 5,
  /** how far that ledge reaches below the sill (the backsplash under the window stops there) */
  sillLedgeDrop: 2.3,

  // ---- island / peninsula (KitchenConfig.islandSpec; the geometry the planner derives: IslandPlan)
  /** the island's back panel in the front colour (outer side of a 60 cm body) */
  islandBackT: 1.9,
  /** the worktop reaches this far past the outer face where nobody sits (no overhang, or a bar takes the seats) */
  islandFlush: 1,
  /** visible face of the base fronts, from the back of the carcass (57,8 carcass + 0,15 bumpers + 1,9 front) */
  baseFace: 59.85,
  /** room per stool / chair along the edge people sit at (min. 55–60 cm per person) */
  seatPitch: 60,
  /** a peninsula keeps its stools this far from wall A */
  seatWallGap: 35,
  /** stools stand this far out from the edge they sit at (the seat reaches under it), chairs a little further */
  stoolOut: 10,
  chairOut: 14,
  /** counter stool at the main worktop: seat centre above the floor (a 65 cm counter stool suits 85–95 cm worktops) */
  counterSeat: 66,
  /** bar stool: seat centre this far below the bar top (110 → 80 cm) */
  barSeatDrop: 30,
  /** chair at the lowered table: seat centre above the floor */
  chairSeat: 46,
  /** raised bar: thickness of its top, of the front-coloured upstand under it, and how far the top reaches over the upstand towards the cook */
  barT: 4,
  upstandT: 4,
  barLip: 1,
  /** raised bar: at least this far above the worktop surface (the upstand would be a sliver otherwise) */
  barMinRise: 15,
  /** raised bar: one steel bracket under the top at least every this many cm (and at least two) */
  barBracketEvery: 90,
  /** bar / table: shortest top (cm) */
  barMinLength: 60,
  /** lowered table: its two legs in the table's material, thickness */
  tableLegT: 4,
  /** ceiling hood above the island (otočna napa): canopy depth and height, chimney cover */
  hoodDepth: 60,
  hoodBody: 10,
  hoodChimneyW: 32,
  hoodChimneyD: 26,
  /** the hood's canopy stays at least this far below the ceiling (the chimney cover needs it) */
  hoodCeilingMin: 5,
  /** run-local z of the hob's centre in a base cabinet (engine/modules.ts places the hob glass there) */
  hobCenterZ: 33,

  // ---- room vs kitchen (KitchenConfig.extents)
  /**
   * a kitchen run that does not meet its neighbour in a corner stays at least this far from that corner: the
   * neighbour's cabinet in the corner (60 cm deep) must still open — a door, a full-extension drawer, the dishwasher's
   * door need ~60 cm in front of it (with only the neighbour's worktop, 63,5 cm, kept clear, the run would stand right in
   * front of that cabinet: a blind corner without a corner unit). Closer than half of it, the run goes into the corner.
   */
  cornerClear: 120,
} as const;

/**
 * Island / peninsula options (KitchenConfig.islandSpec), cm — what Croatian carpenters build (TODO(vlasnik): potvrditi):
 *
 *   body depth     60 = base cabinets + back panel · 90 / 100 / 120 = plus a row of push-to-open cabinets 30 / 40 / 60 cm
 *                  deep opening to the outer side (back to back with the 60 cm cabinets)
 *   overhang       0 / 25 / 30 / 35 cm worktop past the outer face (or past an end) for the knees; 0 = nobody sits there
 *   raised bar     top 105 / 110 / 115 cm above the floor, 30 / 35 / 40 cm deep, 4 cm thick, on a 4 cm front-coloured
 *                  upstand standing on the back edge of the worktop, steel brackets every ≤ 90 cm; bar stools (seat ~80)
 *   lowered table  75 cm, 60 / 70 / 80 cm deep, against the island's back, on two 4 cm legs in its material; chairs (seat 46)
 *   island hood    canopy 90 (hob ≤ 90) / 120 cm wide, 60 deep, 10 high; chimney cover 32 × 26 cm up to the ceiling;
 *                  underside 60–85 cm above the worktop (65 for induction is the usual advice, 75 for gas)
 *   peninsula      150–320 cm from wall A to its free end; its cabinets start behind wall A's blind corner unit (60 cm)
 */
export const ISLAND_DEPTHS = [60, 90, 100, 120] as const;
export const OVERHANGS = [0, 25, 30, 35] as const;
export const BAR_HEIGHTS = [105, 110, 115] as const;
export const BAR_DEPTHS = [30, 35, 40] as const;
export const TABLE_HEIGHT = 75;
export const TABLE_DEPTHS = [60, 70, 80] as const;
export const MAX_STOOLS = 8;
/** hood underside above the worktop surface: range and default (cm) */
export const HOOD_ABOVE = { min: 60, max: 85, default: 65 } as const;
/** what an absent IslandSpec field means */
export const ISLAND_DEFAULTS = {
  functions: "none",
  side: "right",
  depth: 60,
  seatSide: "back",
  overhang: 35,
  stools: 2,
  waterfall: true,
  hoodAbove: HOOD_ABOVE.default,
  barHeight: 110,
  barDepth: 35,
  tableDepth: 70,
} as const;

/** explicit lists: at most this many cabinets per run, this many tall units (any mix of widths, as long as they fit) */
export const MAX_LIST = 30;
export const MAX_TALL = 6;

/** worktop heights the studio offers (cm, surface above the floor) */
export const WORKTOP_HEIGHTS = [85, 90, 95] as const;
/** wall-unit heights for custom heights (cm) */
export const UPPER_HEIGHTS = [60, 72, 80, 90, 105, 120] as const;
/** the standard heights, as every older link has them */
export const STANDARD_HEIGHTS: Readonly<Required<Pick<HeightSpec, "mode" | "worktop">>> = { mode: "standard", worktop: 90 };

/** plinth and base carcass (cm) for a worktop height: 85 = 5 + 76 + 4, 90 = 10 + 76 + 4, 95 = 15 + 76 + 4 */
export function baseHeights(worktop: number): { plinth: number; carcass: number } {
  // the 76 cm carcass (and every front on it) stays; the adjustable legs / plinth take the difference
  // TODO(vlasnik): 85 cm s postoljem od 5 cm — ili korpus 72 cm + postolje 9 cm (treba podršku u engine/modules.ts)
  const carcass = DIM.worktopTop - DIM.plinth - DIM.worktopT;
  return { plinth: Math.max(5, Math.round(worktop) - carcass - DIM.worktopT), carcass };
}
/** an explicit run's remainder at least this wide stays free space (no filler) */
const FREE_MIN = 30;

export interface Limits {
  a: [number, number];
  b: [number, number];
  c: [number, number];
  ceiling: [number, number];
  island: [number, number];
  windowWidth: [number, number];
  sill: [number, number];
}

/** top of a window opening above the floor for this ceiling (cm) */
export function windowTop(ceiling: number): number {
  return Math.min(ceiling - DIM.windowCeilingGap, DIM.windowTopMax);
}

/** longest island the planner can centre on wall A (cm); a peninsula: its range's maximum */
export function islandMax(layout: Layout, wallA: number): number {
  const hi = limitsFor(layout).island[1];
  return layout === "otok" ? Math.min(hi, wallA + 2 * DIM.islandOverhangMax) : hi;
}

/** the layout has an island run ("isl"): the island ("otok") or a peninsula ("poluotok", "G") */
export function hasIsland(layout: Layout): boolean {
  return layout === "otok" || layout === "poluotok" || layout === "G";
}

/** the layout's island run is a peninsula attached to wall A */
export function isPeninsula(layout: Layout): boolean {
  return layout === "poluotok" || layout === "G";
}

/** the end of wall A a peninsula stands out from ("G": always right, wall B is on the left); null without a peninsula */
export function peninsulaSide(cfg: Pick<KitchenConfig, "layout" | "islandSpec">): "left" | "right" | null {
  if (cfg.layout === "G") return "right";
  if (cfg.layout === "poluotok") return cfg.islandSpec?.side === "left" ? "left" : "right";
  return null;
}

/**
 * Sane slider ranges per layout (cm). Values outside are clamped by sanitizeConfig, which also narrows the
 * window (width <= wall - DIM.windowWallClearance, sill <= windowTop - DIM.windowMinHeight) and the island
 * (islandMax) to what the planner can build. `island` is the peninsula's length for "poluotok" / "G".
 */
export function limitsFor(layout: Layout): Limits {
  const aMin = layout === "U" || layout === "G" ? 240 : layout === "ravna" ? 150 : 180;
  return {
    a: [aMin, 800],
    b: [120, 600],
    c: [120, 600],
    ceiling: [210, 350],
    island: isPeninsula(layout) ? [150, 320] : [120, 360],
    windowWidth: [40, 300],
    sill: [0, 200],
  };
}

export function wallsFor(layout: Layout): WallId[] {
  return layout === "L" || layout === "G" ? ["a", "b"] : layout === "U" ? ["a", "b", "c"] : ["a"];
}

// ---------------------------------------------------------------- room vs kitchen (KitchenConfig.extents)

/** every end of a wall run, as seen facing the wall */
export const RUN_ENDS: readonly RunEnd[] = ["a-left", "a-right", "b-left", "b-right", "c-left", "c-right"];
export const runEnd = (wall: WallId, side: "left" | "right"): RunEnd => `${wall}-${side}`;
export function parseRunEnd(e: RunEnd): { wall: WallId; side: "left" | "right" } {
  const [w, s] = e.split("-");
  return { wall: w as WallId, side: s === "left" ? "left" : "right" };
}

/** the end of a wall an extent's offset is measured from when it does not say: the wall's corner end */
export function defaultAnchor(wall: WallId): "left" | "right" {
  return wall === "b" ? "right" : "left";
}

/** the shortest kitchen run on a wall of this layout (cm): the layout's shortest wall (limitsFor) */
export function minRun(layout: Layout, wall: WallId): number {
  return limitsFor(layout)[wall][0];
}

/** an extent on a wall `len` cm long → the kitchen's stretch on it (wall-local cm), without the corner rules */
export function resolveExtent(e: KitchenExtent | undefined, wall: WallId, len: number, min: number): Range {
  if (!e) return { from: 0, to: len };
  const lo = Math.min(min, len);
  const off = clamp(Math.round(num(e.offset, 0)), 0, len - lo);
  const l = clamp(Math.round(num(e.length, len - off)), lo, len - off);
  return (e.anchor ?? defaultAnchor(wall)) === "left" ? { from: off, to: off + l } : { from: len - off - l, to: len - off };
}

/**
 * Where the kitchen stands on a wall of the room (wall-local cm, as seen facing the wall): KitchenConfig.extents
 * resolved against the room's wall — the whole wall without an extent (every older link). Expects a sanitized config
 * (sanitizeConfig applies the corner rules: two runs meet in a corner or keep DIM.cornerClear from it).
 */
export function kitchenRange(cfg: Pick<KitchenConfig, "layout" | "walls" | "extents">, wall: WallId): Range {
  return resolveExtent(cfg.extents?.[wall], wall, cfg.walls[wall], minRun(cfg.layout, wall));
}

/** the room corners where wall A's run may meet a neighbour's run: A's end, the neighbour and the neighbour's end */
function cornerPairs(layout: Layout): { a: "left" | "right"; wall: WallId; side: "left" | "right" }[] {
  if (layout === "L" || layout === "G") return [{ a: "left", wall: "b", side: "right" }];
  if (layout === "U") return [
    { a: "left", wall: "b", side: "right" },
    { a: "right", wall: "c", side: "left" },
  ];
  return [];
}

/** a range with one end moved to `d` cm from that end of a `len` cm wall, keeping at least `min` cm */
function moveEnd(r: Range, side: "left" | "right", d: number, len: number, min: number): Range {
  if (side === "left") {
    const from = d;
    return { from, to: Math.min(len, Math.max(r.to, from + min)) };
  }
  const to = len - d;
  return { from: Math.max(0, Math.min(r.from, to - min)), to };
}

// ---------------------------------------------------------------- editable lists

/** a tall column of KitchenConfig.tallRuns: "tall:b-left" */
export type TallListId = `tall:${RunEnd}`;
/**
 * One editable cabinet list: the base run of a wall ("a" | "b" | "c"), the island ("isl"),
 * the wall units of a wall ("a:u" | "b:u" | "c:u"), the tall column ("tall") or another tall column at a run end
 * (KitchenConfig.tallRuns: "tall:b-left").
 */
export type ListId = BaseRunId | "a:u" | "b:u" | "c:u" | "tall" | TallListId;
export const LIST_IDS: readonly ListId[] = ["a", "b", "c", "isl", "a:u", "b:u", "c:u", "tall", ...RUN_ENDS.map((e): TallListId => `tall:${e}`)];
export type ListZone = "base" | "upper" | "tall" | "island";

/** the main tall column or one of KitchenConfig.tallRuns */
export const isTallList = (id: ListId): boolean => id === "tall" || id.startsWith("tall:");
/** the run end of a KitchenConfig.tallRuns list ("tall:b-left" → "b-left"); null for every other list */
export function tallListEnd(id: ListId): RunEnd | null {
  return id.startsWith("tall:") ? (id.slice(5) as RunEnd) : null;
}

export function listZone(id: ListId): ListZone {
  return isTallList(id) ? "tall" : id === "isl" ? "island" : id.endsWith(":u") ? "upper" : "base";
}
/** the wall a list stands on (the island list: "isl"; the tall column: null — it moves with the layout; a tallRuns column: its wall) */
export function listRun(id: ListId): RunId | null {
  const e = tallListEnd(id);
  if (e) return parseRunEnd(e).wall;
  return id === "tall" ? null : id === "isl" ? "isl" : (id[0] as WallId);
}
export function listIdOf(zone: ListZone, run: RunId): ListId {
  if (zone === "tall") return "tall";
  if (zone === "island" || run === "isl") return "isl";
  return zone === "upper" ? (`${run}:u` as ListId) : (run as WallId);
}
/** the explicit list in a config, or undefined when the planner fills that list itself */
export function listOf(cfg: KitchenConfig, id: ListId): CabinetSpec[] | undefined {
  if (id === "tall") return cfg.tallRun;
  const end = tallListEnd(id);
  if (end) return cfg.tallRuns?.[end];
  if (id.endsWith(":u")) return cfg.upperRuns?.[id[0] as WallId];
  return cfg.runs?.[id as BaseRunId];
}
/** a copy of `cfg` with one list set (undefined = back to the planner); not sanitized */
export function withList(cfg: KitchenConfig, id: ListId, list: CabinetSpec[] | undefined): KitchenConfig {
  const copy = list ? list.map((e) => ({ type: e.type, width: e.width })) : undefined;
  if (id === "tall") {
    const next = { ...cfg };
    if (copy) next.tallRun = copy;
    else delete next.tallRun;
    return next;
  }
  const end = tallListEnd(id);
  if (end) {
    const tr = { ...(cfg.tallRuns ?? {}) };
    if (copy && copy.length) tr[end] = copy;
    else delete tr[end];
    const next: KitchenConfig = { ...cfg, tallRuns: tr };
    if (!Object.keys(tr).length) delete next.tallRuns;
    return next;
  }
  if (id.endsWith(":u")) {
    const w = id[0] as WallId;
    const up = { ...(cfg.upperRuns ?? {}) };
    if (copy) up[w] = copy;
    else delete up[w];
    const next: KitchenConfig = { ...cfg, upperRuns: up };
    if (!Object.keys(up).length) delete next.upperRuns;
    return next;
  }
  const r = { ...(cfg.runs ?? {}) };
  if (copy) r[id as BaseRunId] = copy;
  else delete r[id as BaseRunId];
  const next: KitchenConfig = { ...cfg, runs: r };
  if (!Object.keys(r).length) delete next.runs;
  return next;
}

/** the customer has edited a wall's base run (then the planner no longer adds a sink / hob anywhere on its own) */
function explicitWallBase(cfg: KitchenConfig, walls: WallId[]): boolean {
  return walls.some((w) => cfg.runs?.[w] !== undefined);
}

// ---------------------------------------------------------------- sanitize

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const HANDLES: HandleStyle[] = ["bez", "letvica", "gumb", "utor", "push"];
const WALLS: WallId[] = ["a", "b", "c"];
const BASE_RUNS: BaseRunId[] = ["a", "b", "c", "isl"];
const CORNER_IDS: CornerId[] = ["base-l", "base-r", "upper-l", "upper-r"];
const FRONT_ZONES: FrontZone[] = ["base", "upper", "tall", "island"];
export const MODULE_ID_RE = /^(?:[abc]-(?:base|upper)-\d{1,2}|tall-\d|isl-\d{1,2})$/;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function nearest(list: readonly number[], v: number): number {
  let best = list[0];
  for (const x of list) if (Math.abs(x - v) < Math.abs(best - v) || (Math.abs(x - v) === Math.abs(best - v) && x < best)) best = x;
  return best;
}

/**
 * A valid entry for a list zone, or null. Unknown types are dropped; a width the type does not come in
 * goes to the type's `sibling` when that one has it (a v1 80 cm base "vrata" becomes "vrata2"), otherwise
 * to the type's nearest width.
 */
export function cleanEntry(zone: ListZone, type: unknown, width: unknown): CabinetSpec | null {
  if (typeof type !== "string") return null;
  let def = moduleDef(zone === "island" ? "base" : zone, type);
  if (!def || def.corner) return null;
  if (zone === "island" && !def.island) return null;
  let w = Math.round(num(width, NaN));
  if (!Number.isFinite(w)) return null;
  if (!widthAllowed(def, w)) {
    const sib = def.sibling ? moduleDef(def.zone, def.sibling) : undefined;
    if (sib && widthAllowed(sib, w) && (zone !== "island" || sib.island)) def = sib;
    else if (def.spacer) w = Math.round(clamp(w, def.minWidth, def.maxWidth));
    else w = nearest(def.widths, w);
  }
  return { type: def.id, width: w };
}

function cleanList(v: unknown, zone: ListZone): CabinetSpec[] | undefined {
  if (!Array.isArray(v)) return undefined;
  const out: CabinetSpec[] = [];
  for (const e of v.slice(0, zone === "tall" ? MAX_TALL : MAX_LIST)) {
    if (!isObj(e)) continue;
    const c = cleanEntry(zone, e.type, e.width);
    if (c) out.push(c);
  }
  return out;
}

function cleanFinish(v: unknown): FinishSpec | undefined {
  if (!isObj(v)) return undefined;
  const out: FinishSpec = {};
  if (typeof v.handleColor === "string" && handleColorDef(v.handleColor)) out.handleColor = v.handleColor;
  const pick = (k: "sink" | "tap" | "appliances" | "plinth" | "led", kind: "sinks" | "taps" | "appliances" | "plinths" | "leds") => {
    const x = v[k];
    // the catalogue default is the same as leaving it out: drop it, so links stay short and comparisons simple
    if (typeof x === "string" && finishDef(kind, x) && x !== FINISH_DEFAULTS[k]) out[k] = x;
  };
  pick("sink", "sinks");
  pick("tap", "taps");
  pick("appliances", "appliances");
  pick("plinth", "plinths");
  pick("led", "leds");
  return Object.keys(out).length ? out : undefined;
}

/**
 * A valid HeightSpec, or undefined for the standard heights. Values snap to the offered options (worktop, wall-unit
 * height) and to a sane range (tall column); fitting them under this config's ceiling is the planner's job
 * (plan.heights, with a note), so a lower ceiling never loses what the customer asked for.
 */
function cleanHeights(v: unknown): HeightSpec | undefined {
  if (!isObj(v)) return undefined;
  const mode = v.mode === "do-stropa" || v.mode === "custom" ? v.mode : "standard";
  const out: HeightSpec = { mode };
  const wt = num(v.worktop, NaN);
  if (Number.isFinite(wt)) {
    const w = nearest(WORKTOP_HEIGHTS, wt);
    if (w !== STANDARD_HEIGHTS.worktop) out.worktop = w;
  }
  if (mode === "custom") {
    const up = num(v.upper, NaN);
    out.upper = Number.isFinite(up) ? nearest(UPPER_HEIGHTS, up) : 72;
    const tt = num(v.tallTop, NaN);
    if (Number.isFinite(tt)) out.tallTop = Math.round(clamp(tt, DIM.tallTopMin, 350));
  }
  if (mode === "standard" && out.worktop === undefined) return undefined;
  return out;
}

/**
 * A valid BarSpec, or undefined (no bar); values snap to the offered options, the defaults are dropped. A `top` is kept
 * even when it is the kitchen's worktop: set = the bar keeps that material, absent = it follows the worktop.
 */
function cleanBar(v: unknown): BarSpec | undefined {
  if (!isObj(v) || (v.kind !== "raised" && v.kind !== "table")) return undefined;
  const raised = v.kind === "raised";
  const out: BarSpec = { kind: v.kind };
  const h = num(v.height, NaN);
  if (raised && Number.isFinite(h)) {
    const x = nearest(BAR_HEIGHTS, h);
    if (x !== ISLAND_DEFAULTS.barHeight) out.height = x;
  }
  const d = num(v.depth, NaN);
  if (Number.isFinite(d)) {
    const x = nearest(raised ? BAR_DEPTHS : TABLE_DEPTHS, d);
    if (x !== (raised ? ISLAND_DEFAULTS.barDepth : ISLAND_DEFAULTS.tableDepth)) out.depth = x;
  }
  const len = num(v.length, NaN);
  if (Number.isFinite(len)) out.length = Math.round(clamp(len, DIM.barMinLength, 400));
  if (typeof v.top === "string" && topDef(v.top)) out.top = v.top;
  return out;
}

/**
 * A valid IslandSpec, or undefined for the island of every older link. Values snap to the offered options
 * (ISLAND_DEPTHS, OVERHANGS, …); fields equal to their default (ISLAND_DEFAULTS) are dropped, and so is `hood: true`
 * (absent already means a hood above every hob on the island).
 */
function cleanIslandSpec(v: unknown): IslandSpec | undefined {
  if (!isObj(v)) return undefined;
  const out: IslandSpec = {};
  if (v.functions === "hob" || v.functions === "sink" || v.functions === "both") out.functions = v.functions;
  if (v.side === "left") out.side = "left";
  const depth = num(v.depth, NaN);
  if (Number.isFinite(depth)) {
    const x = nearest(ISLAND_DEPTHS, depth);
    if (x !== ISLAND_DEFAULTS.depth) out.depth = x;
  }
  if (v.seatSide === "left" || v.seatSide === "right") out.seatSide = v.seatSide;
  const ov = num(v.overhang, NaN);
  if (Number.isFinite(ov)) {
    const x = nearest(OVERHANGS, ov);
    if (x !== ISLAND_DEFAULTS.overhang) out.overhang = x;
  }
  const st = num(v.stools, NaN);
  if (Number.isFinite(st)) {
    const x = Math.round(clamp(st, 0, MAX_STOOLS));
    if (x !== ISLAND_DEFAULTS.stools) out.stools = x;
  }
  if (v.waterfall === false) out.waterfall = false;
  // absent = a hood above every hob on the island; only "none" (false) needs saying
  if (v.hood === false) out.hood = false;
  const ha = num(v.hoodAbove, NaN);
  if (Number.isFinite(ha)) {
    const x = Math.round(clamp(ha, HOOD_ABOVE.min, HOOD_ABOVE.max));
    if (x !== ISLAND_DEFAULTS.hoodAbove) out.hoodAbove = x;
  }
  const bar = cleanBar(v.bar);
  if (bar) out.bar = bar;
  return Object.keys(out).length ? out : undefined;
}

function cleanRoom(v: unknown): RoomSpec | undefined {
  if (!isObj(v)) return undefined;
  const out: RoomSpec = {};
  if (typeof v.wall === "string" && roomWallDef(v.wall) && v.wall !== FINISH_DEFAULTS.wall) out.wall = v.wall;
  if (typeof v.floor === "string" && roomFloorDef(v.floor) && v.floor !== FINISH_DEFAULTS.floor) out.floor = v.floor;
  if (isObj(v.walls)) {
    // one wall in another finish than every wall; the same finish as every wall is the same as leaving it out
    const all = out.wall ?? FINISH_DEFAULTS.wall;
    const ws: Partial<Record<WallId, string>> = {};
    for (const w of WALLS) {
      const x = v.walls[w];
      if (typeof x === "string" && roomWallDef(x) && x !== all) ws[w] = x;
    }
    if (Object.keys(ws).length) out.walls = ws;
  }
  return Object.keys(out).length ? out : undefined;
}

/**
 * Valid KitchenConfig.extents for this layout and these walls, or undefined (the kitchen takes every wall). Each extent
 * is kept inside its wall and at least minRun long; at a room corner of the layout the two runs either meet (both
 * reach the corner) or one of them keeps DIM.cornerClear away from it (a run closer than half of that goes into the
 * corner). What equals the default is dropped: the anchor at the wall's corner end, offset 0, a length up to the far end.
 */
function cleanExtents(v: unknown, layout: Layout, walls: Record<WallId, number>): Partial<Record<WallId, KitchenExtent>> | undefined {
  if (!isObj(v)) return undefined;
  const anchors: Partial<Record<WallId, "left" | "right">> = {};
  const r = {} as Record<WallId, Range>;
  for (const w of WALLS) {
    const e = v[w];
    const spec: KitchenExtent = {};
    if (isObj(e)) {
      if (e.anchor === "left" || e.anchor === "right") spec.anchor = anchors[w] = e.anchor;
      const off = num(e.offset, NaN);
      if (Number.isFinite(off)) spec.offset = off;
      const len = num(e.length, NaN);
      if (Number.isFinite(len)) spec.length = len;
    }
    r[w] = resolveExtent(isObj(e) ? spec : undefined, w, walls[w], minRun(layout, w));
  }
  const clear = DIM.cornerClear;
  for (const p of cornerPairs(layout)) {
    const dA = p.a === "left" ? r.a.from : walls.a - r.a.to;
    const dN = p.side === "right" ? walls[p.wall] - r[p.wall].to : r[p.wall].from;
    if ((dA === 0 && dN === 0) || dA >= clear || dN >= clear) continue;
    // too close to share the corner without meeting in it: snap into the corner, or step back to DIM.cornerClear
    const fix = (d: number, len: number, min: number) => (d === 0 || d < clear / 2 || len - clear < min ? 0 : clear);
    // wall A of a U has a corner at each end: stepping back at this one may not move the other end (that would undo
    // the other corner's rule), so A only steps back when it keeps its length between this corner and its other end
    const otherA = p.a === "left" ? walls.a - r.a.to : r.a.from;
    r.a = moveEnd(r.a, p.a, fix(dA, walls.a - otherA, minRun(layout, "a")), walls.a, Math.min(minRun(layout, "a"), walls.a));
    const mN = minRun(layout, p.wall);
    r[p.wall] = moveEnd(r[p.wall], p.side, fix(dN, walls[p.wall], mN), walls[p.wall], Math.min(mN, walls[p.wall]));
  }
  const out: Partial<Record<WallId, KitchenExtent>> = {};
  for (const w of WALLS) {
    const L = walls[w];
    const k = r[w];
    if (k.from <= 0 && k.to >= L) continue;
    const anchor = anchors[w] ?? defaultAnchor(w);
    const offset = anchor === "left" ? k.from : L - k.to;
    const length = k.to - k.from;
    const x: KitchenExtent = {};
    if (anchor !== defaultAnchor(w)) x.anchor = anchor;
    if (offset > 0) x.offset = offset;
    if (offset + length < L) x.length = length;
    out[w] = x;
  }
  return Object.keys(out).length ? out : undefined;
}

/** everything sanitizeConfig does except converting legacy overrides */
function sanitizeShallow(input: unknown): KitchenConfig {
  const src = isObj(input) ? input : {};
  const d = DEFAULT_CONFIG;
  const layout = LAYOUTS.includes(src.layout as Layout) ? (src.layout as Layout) : d.layout;
  const lim = limitsFor(layout);
  const w = isObj(src.walls) ? src.walls : {};
  const walls = {
    a: Math.round(clamp(num(w.a, d.walls.a), lim.a[0], lim.a[1])),
    b: Math.round(clamp(num(w.b, d.walls.b), lim.b[0], lim.b[1])),
    c: Math.round(clamp(num(w.c, d.walls.c), lim.c[0], lim.c[1])),
  };
  const ceiling = Math.round(clamp(num(src.ceiling, d.ceiling), lim.ceiling[0], lim.ceiling[1]));

  let window: WindowSpec | null = null;
  if (isObj(src.window) && WALLS.includes(src.window.wall as WallId)) {
    const wall = src.window.wall as WallId;
    const len = walls[wall];
    // the same ranges planKitchen honours, so the config, the 3D view and the summary show the same numbers
    const width = Math.round(
      clamp(num(src.window.width, 100), lim.windowWidth[0], Math.min(lim.windowWidth[1], len - DIM.windowWallClearance)),
    );
    const offset = Math.round(clamp(num(src.window.offset, (len - width) / 2), 0, len - width));
    const sillMax = Math.min(lim.sill[1], ceiling - 70, windowTop(ceiling) - DIM.windowMinHeight);
    const sill = Math.round(clamp(num(src.window.sill, 95), lim.sill[0], sillMax));
    window = { wall, offset, width, sill };
  }

  const overrides: Record<string, string> = {};
  if (isObj(src.overrides)) {
    let n = 0;
    for (const [k, v] of Object.entries(src.overrides)) {
      if (n >= 80) break;
      if (MODULE_ID_RE.test(k) && typeof v === "string" && isModuleTypeId(v)) {
        overrides[k] = v;
        n++;
      }
    }
  }

  const front = typeof src.front === "string" && frontDef(src.front) ? src.front : d.front;
  const cfg: KitchenConfig = {
    v: 1,
    layout,
    walls,
    ceiling,
    window,
    front,
    top: typeof src.top === "string" && topDef(src.top) ? src.top : d.top,
    handles: HANDLES.includes(src.handles as HandleStyle) && handleDef(src.handles as string) ? (src.handles as HandleStyle) : d.handles,
    tall: typeof src.tall === "boolean" ? src.tall : d.tall,
    island: Math.round(clamp(num(src.island, d.island), lim.island[0], islandMax(layout, walls.a))),
    led: typeof src.led === "boolean" ? src.led : d.led,
    overrides,
  };

  // ---- v2 (optional)
  if (isObj(src.runs)) {
    const runs: Partial<Record<BaseRunId, CabinetSpec[]>> = {};
    for (const r of BASE_RUNS) {
      const l = cleanList(src.runs[r], r === "isl" ? "island" : "base");
      if (l) runs[r] = l;
    }
    if (Object.keys(runs).length) cfg.runs = runs;
  }
  if (isObj(src.upperRuns)) {
    const up: Partial<Record<WallId, CabinetSpec[]>> = {};
    for (const r of WALLS) {
      const l = cleanList(src.upperRuns[r], "upper");
      if (l) up[r] = l;
    }
    if (Object.keys(up).length) cfg.upperRuns = up;
  }
  {
    const t = cleanList(src.tallRun, "tall");
    if (t && t.length) cfg.tallRun = t;
  }
  if (typeof src.tallAt === "string" && (RUN_ENDS as readonly string[]).includes(src.tallAt)) cfg.tallAt = src.tallAt as RunEnd;
  if (isObj(src.tallRuns)) {
    const tr: Partial<Record<RunEnd, CabinetSpec[]>> = {};
    for (const e of RUN_ENDS) {
      // the end the tall column is pinned to is its own
      if (cfg.tall && e === cfg.tallAt) continue;
      const l = cleanList(src.tallRuns[e], "tall");
      if (l && l.length) tr[e] = l;
    }
    if (Object.keys(tr).length) cfg.tallRuns = tr;
  }
  const extents = cleanExtents(src.extents, layout, walls);
  if (extents) cfg.extents = extents;
  if (isObj(src.corners)) {
    const co: Partial<Record<CornerId, string>> = {};
    for (const k of CORNER_IDS) {
      const v = src.corners[k];
      const zone = k.startsWith("base") ? "base" : "upper";
      if (typeof v === "string" && cornerTypes(zone).some((t) => t.id === v) && v !== defaultCornerType(zone)) co[k] = v;
    }
    if (Object.keys(co).length) cfg.corners = co;
  }
  if (isObj(src.zoneFronts)) {
    const zf: Partial<Record<FrontZone, string>> = {};
    for (const z of FRONT_ZONES) {
      const v = src.zoneFronts[z];
      if (typeof v === "string" && frontDef(v) && v !== front) zf[z] = v;
    }
    if (Object.keys(zf).length) cfg.zoneFronts = zf;
  }
  const finish = cleanFinish(src.finish);
  if (finish) cfg.finish = finish;
  const room = cleanRoom(src.room);
  if (room) cfg.room = room;
  const heights = cleanHeights(src.heights);
  if (heights) cfg.heights = heights;
  const islandSpec = cleanIslandSpec(src.islandSpec);
  if (islandSpec) cfg.islandSpec = islandSpec;
  return cfg;
}

/**
 * Make any input (UI state, decoded link, old saved config) a valid KitchenConfig:
 * unknown ids fall back to the defaults, lengths are rounded to whole cm and
 * clamped to `limitsFor(layout)` (window and island also to what the planner
 * can build, see limitsFor), list entries get valid types and widths, optional
 * fields equal to their default are dropped. Legacy positional `overrides`
 * (v1 links) are converted into the explicit lists, so the result always has
 * `overrides: {}`.
 */
export function sanitizeConfig(input: unknown): KitchenConfig {
  const cfg = sanitizeShallow(input);
  return Object.keys(cfg.overrides).length ? migrateOverrides(cfg) : cfg;
}

/** the front material of a zone (two-tone kitchens) */
export function frontFor(cfg: KitchenConfig, zone: FrontZone): string {
  return cfg.zoneFronts?.[zone] ?? cfg.front;
}

/** Everything that changes the room or the run skeleton. Equal keys => only materials / cabinet lists differ. */
export function geometryKey(cfg: KitchenConfig): string {
  const walls = wallsFor(cfg.layout);
  const win = cfg.window && walls.includes(cfg.window.wall) ? cfg.window : null;
  return JSON.stringify([
    cfg.layout,
    walls.map((w) => cfg.walls[w]),
    cfg.ceiling,
    win ? [win.wall, win.offset, win.width, win.sill] : 0,
    // the tall column's width moves the base runs and the worktop
    cfg.tall ? (cfg.tallRun ? cfg.tallRun.map((t) => t.width) : 1) : 0,
    hasIsland(cfg.layout) ? cfg.island : 0,
    // cabinet heights: every module, the worktop and the walls' framing change
    cfg.heights ? [cfg.heights.mode, cfg.heights.worktop ?? 0, cfg.heights.upper ?? 0, cfg.heights.tallTop ?? 0] : 0,
    // the island / peninsula options move its body, worktop, seats, bar and hood, and (hob / sink on it) the wall runs;
    // the hood also follows the island hob when an element edit moves it (the engine syncs that in relayout)
    ...(cfg.islandSpec && hasIsland(cfg.layout) ? [cfg.islandSpec] : []),
    // where the kitchen stands on its walls and where tall columns stand (absent for every older link: same key)
    ...(cfg.extents ? [["e", walls.map((w) => kitchenRange(cfg, w)).map((r) => [r.from, r.to])]] : []),
    ...(cfg.tallAt ? [["tp", cfg.tallAt]] : []),
    ...(cfg.tallRuns ? [["tr", RUN_ENDS.map((e) => cfg.tallRuns?.[e]?.map((t) => t.width) ?? 0)]] : []),
  ]);
}

// ---------------------------------------------------------------- plan types

export type SlotZone = "base" | "upper" | "tall" | "island";
export type RunId = WallId | "isl";

export interface PlanSlot {
  /** stable id: "a-base-0", "b-upper-2", "tall-1", "isl-0" (position in its run, blind corners included) */
  id: string;
  zone: SlotZone;
  run: RunId;
  /** left edge along the run (cm, run-local) */
  x: number;
  width: number;
  /** what the planner would put here on its own (= type for slots of an edited list) */
  defaultType: string;
  /** effective type */
  type: string;
  /** module type ids valid for this slot at its current width */
  options: string[];
  /** blind corner unit; the value is the side that is blind (towards the corner) */
  corner?: "left" | "right";
  /** blind corner units: their key in KitchenConfig.corners */
  cornerId?: CornerId;
  /**
   * every other slot: its place in an editable list (lib/studio/edit.ts works with this) — `index` is the position
   * in PlanList.entries (what stands there), which skips entries of an edited list that no longer fit
   */
  list?: { id: ListId; index: number };
  /** the hood above the hob: it follows the hob, it cannot be moved on its own */
  anchored?: boolean;
}

export interface PlanPiece {
  /** filler = front-coloured strip between cabinets; panel = vertical cover / end panel */
  kind: "filler" | "panel";
  zone: "base" | "upper" | "tall";
  run: RunId;
  x: number;
  width: number;
}

export interface Range {
  from: number;
  to: number;
}

/** one piece of the stone backsplash (run-local x range, cm) */
export interface BacksplashPiece extends Range {
  /** top edge above the floor (cm); every piece starts on the worktop surface (plan.heights.worktop) */
  top: number;
}

/**
 * The cabinet heights of a plan (cm above the floor) — what KitchenConfig.heights asks for, fitted under the ceiling.
 * The engine, the price and the summary read these, never the config.
 */
export interface HeightPlan {
  mode: HeightSpec["mode"];
  /** worktop surface */
  worktop: number;
  plinth: number;
  /** base carcass (plinth + carcass + DIM.worktopT = worktop) */
  carcass: number;
  /** wall units (their main row) */
  upperBottom: number;
  upperTop: number;
  /** "do stropa" on a tall ceiling: a second row of top cabinets on every wall unit, carcass from → to; else null */
  topRow: Range | null;
  /** top of the tall column */
  tallTop: number;
  /** tall units are split here into the unit and a top box (on the wall units' line when there is one); null = one piece */
  tallSplit: number | null;
  /** "do stropa": the cornice strip from the cabinets' top line up to the ceiling; else null */
  cornice: Range | null;
  /** cornice strips along the cabinets that reach the line (run-local x, cm) — "upper" over wall units, "tall" over the column */
  cornices: { run: WallId; zone: "upper" | "tall"; from: number; to: number }[];
  /** the highest cabinet edge */
  top: number;
}

export interface RunPlan {
  wall: WallId;
  /** the room's wall length (cm) */
  length: number;
  /** where the kitchen stands on this wall (wall-local cm; = 0 … length unless KitchenConfig.extents says otherwise) */
  kitchen: Range;
  /**
   * bare floor inside the kitchen run: what an edited run leaves free at an open end (no cabinets, no worktop, no
   * backsplash over it — the studio shows a "+" there, plan.ts planGaps). The bare wall outside `kitchen` is not listed.
   */
  free: (Range & { side: "left" | "right" })[];
  /**
   * where the cabinets stand on this wall (wall-local cm): `kitchen` without the bare floor at its open ends (`free`) —
   * what the kitchen label on the floor measures. null when the run holds no cabinet at all.
   */
  cabinets: Range | null;
  /**
   * bare wall in the wall-unit row inside the kitchen (stretches of at least GAP_MIN cm the wall units leave free —
   * beside the window, between edited wall units, at the open end of an edited list; not the window itself), with the
   * widest wall unit that fits there (`room`: the stretch, less the end panels a stretch without wall units needs)
   */
  upperFree: (Range & { room: number })[];
  /**
   * what closes each end of the kitchen run: a corner unit ("corner": wall A's own or, on B / C, A's), a room wall the
   * run reaches without a corner ("wall") or nothing ("open", an end panel)
   */
  ends: { left: "corner" | "wall" | "open"; right: "corner" | "wall" | "open" };
  /** worktop along this run; depth is DIM.worktopDepth from the wall. It ends with the base cabinets (never over bare floor) */
  worktop: Range | null;
  /** backsplash in the worktop material, drawn by the engine and priced by price.ts */
  backsplash: BacksplashPiece[];
  /** contiguous wall-unit stretches (for the LED strip) */
  uppers: Range[];
  /** base cabinet stretch without the tall column (plinth LED) */
  counter: Range | null;
  /** the tall column on this run (the main one if it stands here, else the first of KitchenConfig.tallRuns), or null */
  tall: Range | null;
  /** every tall column on this run (incl. its two cover panels), left → right */
  talls: Range[];
  /** open (non-wall) ends of the wall, used to extend the wall plane visually */
  openLeft: boolean;
  openRight: boolean;
}

export interface WindowPlan extends WindowSpec {
  /** top of the opening above the floor (cm) */
  top: number;
  /** the sill is high enough above the worktop for an inside sill ledge */
  ledge: boolean;
}

/** a box footprint in the island's run frame (cm): x along the run, z from the back of its cabinets (+ = their fronts, − = the outer side) */
export interface IslandRect {
  from: number;
  to: number;
  z0: number;
  z1: number;
}

/** one stool (counter / bar) or chair (lowered table), run-local cm */
export interface SeatPlan {
  kind: "stool" | "chair";
  x: number;
  z: number;
  /** seat centre above the floor (cm) */
  seat: number;
}

/** the raised bar (šank) or the lowered table along the outer long side (KitchenConfig.islandSpec.bar), run-local cm */
export interface BarPlan {
  kind: "raised" | "table";
  from: number;
  to: number;
  /** top surface above the floor; the top is DIM.barT (raised) / DIM.worktopT (table) thick */
  height: number;
  depth: number;
  /** the top's outer edge (where people sit) and inner edge (run-local z) */
  z0: number;
  z1: number;
  /** catalog.tops id of the top */
  top: string;
  /** raised: the front-coloured upstand on the worktop's back edge, from the worktop surface up to the top's underside */
  upstand: { z0: number; z1: number; y0: number; y1: number } | null;
  /** raised: steel bracket centres (run-local x) under the overhang */
  brackets: number[];
  /** table: its two legs (x ranges), floor to the top's underside, as deep as the top */
  legs: Range[];
}

/** otočna napa: a ceiling-hung hood centred above the (first) hob of the island / peninsula, run-local cm */
export interface IslandHoodPlan {
  /** canopy centre (x along the run, z from the back of the cabinets) */
  x: number;
  z: number;
  width: number;
  depth: number;
  /** canopy underside / top above the floor */
  bottom: number;
  top: number;
  /** the chimney cover runs from the canopy top up to the ceiling */
  ceiling: number;
  chimney: { width: number; depth: number };
  /** the hood's underside above the worktop surface (what islandSpec.hoodAbove asked for, after fitting) */
  above: number;
  /** the hood's underside below the ceiling (cm): how far it hangs down — edit.ts setIslandHood takes either */
  fromCeiling: number;
}

/**
 * The island ("otok") or the peninsula ("poluotok", "G") as built — every piece the engine draws, price.ts prices and the
 * summary names. Run frame: x along the island from its left end as seen from its cabinet fronts (the island: from the
 * wall-A side), z from the back of the cabinets (0) towards their fronts (+60); negative z is the outer side (seats).
 */
export interface IslandPlan {
  kind: "otok" | "poluotok";
  /** peninsula: the end of wall A it stands out from; null for the island */
  side: "left" | "right" | null;
  /** island: total length incl. the end sides; peninsula: from wall A to its free end (cm) */
  length: number;
  /** island: world x of its centre, measured along wall A from its left end (cm); peninsula: world x of its back face */
  centerX: number;
  /** island: distance from wall A to the back (seating side) of its cabinets; peninsula: world z of its free end (cm) */
  backZ: number;
  /** the run frame in world cm (wall A's left end at x = 0, its face at z = 0): origin of run-local (0, 0) and its turn about y (radians) */
  frame: { x: number; z: number; rot: number };
  /** what the planner put on it from islandSpec.functions (the wall runs then have none of it) */
  functions: { sink: boolean; hob: boolean };
  /** body depth, fronts to the outer face (cm, ISLAND_DEPTHS) */
  depth: number;
  /** run-local stretch of the cabinets and their fillers (the "isl" list's capacity) */
  body: Range;
  /** z of the body's outer face: −DIM.islandBackT (back panel) or −(depth − 60) (the outer row's fronts) */
  outer: number;
  /** the main worktop (KitchenConfig.top), top surface at heights.worktop, DIM.worktopT thick */
  slab: IslandRect[];
  /** the worktop running down to the floor at a free end (waterfall) */
  waterfalls: IslandRect[];
  /** front-coloured end panels (no waterfall, or the cabinets' end at a seating end), floor to the worktop's underside */
  endPanels: IslandRect[];
  /** depth 60: the front-coloured back panel (z −DIM.islandBackT … 0), floor to the worktop's underside */
  backPanel: Range | null;
  /** deeper body: push-to-open cabinets opening to the outer side, z `outer` … 0; `doors` = their widths left → right */
  backRow: { from: number; to: number; depth: number; doors: number[] } | null;
  /** where the seats are (null = nobody sits: no overhang and no bar) */
  seatSide: SeatSide | null;
  /** the worktop's overhang on the seat side (cm; 0 while a bar takes the seats) */
  overhang: number;
  seats: SeatPlan[];
  /** the most seats that fit where they are */
  seatsMax: number;
  bar: BarPlan | null;
  hood: IslandHoodPlan | null;
}

/** an editable list as the planner placed it */
export interface PlanList {
  id: ListId;
  zone: ListZone;
  /** the run it stands on (the tall column: the wall it is on) */
  run: RunId;
  /** the customer has edited it (KitchenConfig.runs / upperRuns / tallRun); false = filled by the planner */
  explicit: boolean;
  /** what stands there, in list order — what an edit starts from */
  entries: CabinetSpec[];
  /** entries of the explicit list that no longer fit and were left out */
  dropped: CabinetSpec[];
  /** cm the list can hold where it stands (base / island: its span; wall units: all segments; tall: its own width) */
  capacity: number;
  /** cm the placed entries take */
  used: number;
  /**
   * wall units only: the free stretches between corners / window / hood, left → right (cm the cabinets in each
   * may take), and the list index of the hood that splits them (null = no anchored hood)
   */
  segments?: { left: number[]; right: number[]; hoodAt: number | null };
}

export interface KitchenPlan {
  cfg: KitchenConfig;
  walls: WallId[];
  ceiling: number;
  /** = heights.upperBottom / heights.upperTop (the wall units' main row) */
  upperBottom: number;
  upperTop: number;
  /** every cabinet height (KitchenConfig.heights fitted under the ceiling) */
  heights: HeightPlan;
  window: WindowPlan | null;
  runs: RunPlan[];
  island: IslandPlan | null;
  slots: PlanSlot[];
  pieces: PlanPiece[];
  /** every editable list of this layout (wall base runs, island, wall units, tall column) */
  lists: PlanList[];
  /** slot ids of the (first) sink / hob; null when the kitchen has none */
  sinkId: string | null;
  hobId: string | null;
  /** human-readable Croatian notes when something did not fit */
  warnings: string[];
}

// ---------------------------------------------------------------- options

/** module type ids valid for a slot */
export function slotOptions(zone: SlotZone, width: number, corner: boolean): string[] {
  const z = zone === "island" ? "base" : zone;
  return catalog.modules
    .filter((m) => {
      if (m.zone !== z) return false;
      if (zone === "island" && !m.island) return false;
      if (corner) return Boolean(m.corner || m.cornerOk);
      if (m.corner) return false;
      return widthAllowed(m, width);
    })
    .map((m) => m.id);
}

export function defaultCornerType(zone: "base" | "upper"): string {
  return zone === "base" ? "kutni" : "vrata";
}

// ---------------------------------------------------------------- filling

type EdgeKind = "wall" | "corner" | "tall" | "open" | "window" | "hood";
type Feature = "sudoper" | "perilica" | "ploca";

interface Span {
  from: number;
  to: number;
  left: EdgeKind;
  right: EdgeKind;
}

type Item =
  | { kind: "module"; width: number; type: string; feature?: Feature; src?: number; anchored?: boolean }
  | { kind: "filler"; width: number }
  | { kind: "panel"; width: number }
  | { kind: "gap"; width: number };
type ModItem = Extract<Item, { kind: "module" }>;

const FEATURE_OF: Record<NonNullable<ModuleTypeDef["feature"]>, Feature> = { sink: "sudoper", hob: "ploca", dishwasher: "perilica" };

const BASE_COST: Record<number, number> = { 30: 2.6, 40: 1.6, 45: 1.4, 50: 1.2, 60: 0, 80: 0.5, 90: 0.9 };
const UPPER_COST: Record<number, number> = { 30: 2.5, 40: 1.5, 45: 1.3, 50: 1.2, 60: 0, 80: 0.4, 90: 0.8 };

function fillerCost(f: number): number {
  if (f < 0.5) return 0;
  return 0.6 + 0.3 * f + (f > 6 ? (f - 6) * 1.2 : 0);
}

const dpCache = new Map<string, { widths: number[]; cost: number }>();

/** Cheapest set of standard widths that fits in `len` cm (the rest becomes a filler). */
function dpFill(len: number, costs: Record<number, number>, tag: string): { widths: number[]; cost: number } {
  const R = Math.max(0, Math.floor(len + 1e-6));
  const key = `${tag}:${R}`;
  const hit = dpCache.get(key);
  if (hit) return { widths: [...hit.widths], cost: hit.cost };
  const best = new Array<number>(R + 1).fill(Infinity);
  const pick = new Array<number>(R + 1).fill(0);
  best[0] = 0;
  for (let s = 1; s <= R; s++) {
    for (const w of STD_WIDTHS) {
      if (w > s || best[s - w] === Infinity) continue;
      const c = best[s - w] + costs[w] + 0.3;
      if (c < best[s] - 1e-9) {
        best[s] = c;
        pick[s] = w;
      }
    }
  }
  let bestS = 0;
  let bestC = fillerCost(len);
  for (let s = 1; s <= R; s++) {
    if (best[s] === Infinity) continue;
    const c = best[s] + fillerCost(len - s);
    if (c < bestC - 1e-9) {
      bestC = c;
      bestS = s;
    }
  }
  const widths: number[] = [];
  for (let s = bestS; s > 0; s -= pick[s]) widths.push(pick[s]);
  widths.sort((x, y) => y - x);
  const res = { widths, cost: bestC };
  if (dpCache.size > 2000) dpCache.clear();
  dpCache.set(key, { widths: [...widths], cost: bestC });
  return res;
}

const EDGE_PRIORITY: Record<EdgeKind, number> = { wall: 5, corner: 4, tall: 3, window: 2, open: 1, hood: 0 };
const hasPanel = (k: EdgeKind) => k === "open" || k === "window";
const hardEdge = (k: EdgeKind) => k === "wall" || k === "corner" || k === "tall";

/**
 * Wrap a module sequence with end panels and the remainder (filler or gap),
 * so the items exactly cover the span.
 */
function wrapSpan(span: Span, modules: Item[]): Item[] {
  const len = span.to - span.from;
  if (modules.length === 0) {
    if (len < 0.5) return [];
    return hardEdge(span.left) && hardEdge(span.right) ? [{ kind: "filler", width: len }] : [{ kind: "gap", width: len }];
  }
  const panelL = hasPanel(span.left);
  const panelR = hasPanel(span.right);
  const used = modules.reduce((s, m) => s + m.width, 0) + (panelL ? DIM.panel : 0) + (panelR ? DIM.panel : 0);
  const rest = Math.max(0, len - used);
  const side: "left" | "right" = EDGE_PRIORITY[span.left] > EDGE_PRIORITY[span.right] ? "left" : "right";
  const kind = side === "left" ? span.left : span.right;
  const restItem: Item | null = rest < 0.5 ? null : kind === "window" ? { kind: "gap", width: rest } : { kind: "filler", width: rest };
  const out: Item[] = [];
  // order: [outer panel?] [rest at left] ... modules ... [rest at right] [outer panel?]
  // for a window edge the gap sits between the window and the panel.
  if (side === "left" && restItem && kind === "window") out.push(restItem);
  if (panelL) out.push({ kind: "panel", width: DIM.panel });
  if (side === "left" && restItem && kind !== "window") out.push(restItem);
  out.push(...modules);
  if (side === "right" && restItem && kind !== "window") out.push(restItem);
  if (panelR) out.push({ kind: "panel", width: DIM.panel });
  if (side === "right" && restItem && kind === "window") out.push(restItem);
  return out;
}

/**
 * wrapSpan for an edited list: a remainder narrower than FREE_MIN is closed like the planner does (filler at
 * the wall / corner side), a wider one stays free space at the other end (the open end, the window, the hood;
 * the right end when both ends are alike), behind an end panel that closes the last cabinet.
 */
function wrapExplicit(span: Span, modules: Item[]): Item[] {
  const len = span.to - span.from;
  if (modules.length === 0) return len < FREE_MIN ? wrapSpan(span, []) : [{ kind: "gap", width: len }];
  const used = modules.reduce((s, m) => s + m.width, 0) + (hasPanel(span.left) ? DIM.panel : 0) + (hasPanel(span.right) ? DIM.panel : 0);
  if (len - used < FREE_MIN) return wrapSpan(span, modules);
  const gapSide: "left" | "right" = EDGE_PRIORITY[span.left] < EDGE_PRIORITY[span.right] ? "left" : "right";
  const out: Item[] = [];
  const panelL = hasPanel(span.left) || gapSide === "left";
  const panelR = hasPanel(span.right) || gapSide === "right";
  const rest = len - modules.reduce((s, m) => s + m.width, 0) - (panelL ? DIM.panel : 0) - (panelR ? DIM.panel : 0);
  if (gapSide === "left") out.push({ kind: "gap", width: rest });
  if (panelL) out.push({ kind: "panel", width: DIM.panel });
  out.push(...modules);
  if (panelR) out.push({ kind: "panel", width: DIM.panel });
  if (gapSide === "right") out.push({ kind: "gap", width: rest });
  return out;
}

/**
 * Wall units of an edited list: an end panel closes the last real cabinet, not the empty space ("Bez gornjeg elementa")
 * beyond it — [panel][prazno][vrata] becomes [prazno][panel][vrata] — and a stretch of empty space alone has no end
 * panels at all (they would stand on the bare wall). Only where the panels stand changes, never a cabinet.
 */
function hugPanels(items: Item[]): Item[] {
  const spacer = (it: Item) => it.kind === "module" && isSpacer("upper", it.type);
  const real = (it: Item) => it.kind === "module" && !spacer(it);
  if (!items.some(spacer)) return items;
  if (!items.some(real)) return items.map((it): Item => (it.kind === "panel" ? { kind: "gap", width: it.width } : it));
  const out = [...items];
  const fi = out.findIndex(real);
  let li = -1;
  out.forEach((it, i) => {
    if (real(it)) li = i;
  });
  const rp = out.findIndex((it, i) => i > li && it.kind === "panel");
  if (rp > li + 1 && out.slice(li + 1, rp).every(spacer)) out.splice(li + 1, 0, ...out.splice(rp, 1));
  let lp = -1;
  out.forEach((it, i) => {
    if (i < fi && it.kind === "panel") lp = i;
  });
  if (lp >= 0 && lp < fi - 1 && out.slice(lp + 1, fi).every(spacer)) out.splice(fi - 1, 0, ...out.splice(lp, 1));
  return out;
}

function innerLength(span: Span): number {
  return span.to - span.from - (hasPanel(span.left) ? DIM.panel : 0) - (hasPanel(span.right) ? DIM.panel : 0);
}

const FEATURE_WIDTHS: Record<Feature, [number, number][]> = {
  sudoper: [
    [80, 0],
    [60, 0.25],
    [90, 0.6],
    [45, 2.2],
  ],
  perilica: [
    [60, 0],
    [45, 1.8],
  ],
  ploca: [
    [80, 0],
    [90, 0.35],
    [60, 0.3],
  ],
};

function combos(features: Feature[]): { widths: number[]; cost: number }[] {
  let acc: { widths: number[]; cost: number }[] = [{ widths: [], cost: 0 }];
  for (const f of features) {
    const next: { widths: number[]; cost: number }[] = [];
    for (const a of acc) for (const [w, c] of FEATURE_WIDTHS[f]) next.push({ widths: [...a.widths, w], cost: a.cost + c });
    acc = next;
  }
  return acc;
}

interface BaseFillResult {
  items: Item[];
  dropped: Feature[];
  /** edited list: entries left out (list indices) */
  cut?: number[];
}

/** Fill a base span with the requested features (in order of importance) and standard modules. */
function fillBase(span: Span, wanted: Feature[], windowRange: Range | null): BaseFillResult {
  const R = innerLength(span);
  const attempts: Feature[][] = [];
  const has = (f: Feature) => wanted.includes(f);
  attempts.push(wanted);
  if (has("perilica")) attempts.push(wanted.filter((f) => f !== "perilica"));
  if (has("ploca") && has("sudoper")) attempts.push(["sudoper"]);
  if (has("ploca")) attempts.push(["ploca"]);
  attempts.push([]);

  for (const feats of attempts) {
    const needSpacer = feats.includes("sudoper") && feats.includes("ploca");
    let best: { modules: Item[]; total: number } | null = null;
    for (const c of combos(feats)) {
      const sum = c.widths.reduce((s, w) => s + w, 0);
      if (sum > R) continue;
      const dp = dpFill(R - sum, BASE_COST, "b");
      if (needSpacer && dp.widths.length === 0) continue;
      const fw = new Map<Feature, number>();
      feats.forEach((f, i) => fw.set(f, c.widths[i]));
      const arr = arrangeBase(span, R, fw, dp.widths, windowRange);
      // width economy and placement quality in one number (1 cost unit ~ 25 cm of misplacement)
      const total = (c.cost + dp.cost) * 25 + arr.score;
      if (!best || total < best.total - 1e-9) best = { modules: arr.seq, total };
    }
    if (!best) continue;
    return { items: wrapSpan(span, best.modules), dropped: wanted.filter((f) => !feats.includes(f)) };
  }
  return { items: wrapSpan(span, []), dropped: wanted };
}

function arrangeBase(
  span: Span,
  R: number,
  fw: Map<Feature, number>,
  fills: number[],
  win: Range | null,
): { seq: Item[]; score: number } {
  const S = fw.get("sudoper");
  const D = fw.get("perilica");
  const H = fw.get("ploca");
  const panelL = hasPanel(span.left) ? DIM.panel : 0;
  // modules start right after the left panel; the remainder sits at the priority side,
  // which shifts module positions by at most a few cm — ignored for scoring.
  const x0 = span.from + panelL;
  const n = fills.length;
  const hard = (k: EdgeKind) => k === "wall" || k === "open" || k === "tall" || k === "window";

  type Seq = Item[];
  const fill = (w: number): Item => ({ kind: "module", width: w, type: "" });
  const sinkGroups: Item[][] = [];
  if (S !== undefined) {
    const s: Item = { kind: "module", width: S, type: "sudoper", feature: "sudoper" };
    if (D !== undefined) {
      const d: Item = { kind: "module", width: D, type: "perilica", feature: "perilica" };
      sinkGroups.push([s, d], [d, s]);
    } else sinkGroups.push([s]);
  }
  const hob: Item | null = H !== undefined ? { kind: "module", width: H, type: "ploca", feature: "ploca" } : null;

  const asc = [...fills].sort((a, b) => a - b);
  const desc = [...fills].sort((a, b) => b - a);
  const candidates: Seq[] = [];

  if (sinkGroups.length && hob) {
    for (const g of sinkGroups) {
      for (let i = 0; i <= n; i++) {
        for (let j = 1; j <= n - i; j++) {
          // sink group, at least one module, hob — and the mirrored order
          const pool = desc.slice();
          const g0 = pool.splice(0, i).sort((a, b) => a - b);
          const g1 = pool.splice(0, j).sort((a, b) => a - b);
          const g2 = pool.sort((a, b) => b - a);
          candidates.push([...g0.map(fill), ...g, ...g1.map(fill), hob, ...g2.map(fill)]);
          candidates.push([...g2.slice().reverse().map(fill), hob, ...g1.slice().reverse().map(fill), ...g, ...g0.slice().reverse().map(fill)]);
        }
      }
    }
  } else if (sinkGroups.length) {
    for (const g of sinkGroups) {
      for (let i = 0; i <= n; i++) {
        candidates.push([...asc.slice(0, i).map(fill), ...g, ...asc.slice(i).sort((a, b) => b - a).map(fill)]);
      }
    }
  } else if (hob) {
    for (let i = 0; i <= n; i++) {
      const l = asc.slice(0, i);
      const r = asc.slice(i).sort((a, b) => b - a);
      candidates.push([...l.map(fill), hob, ...r.map(fill)]);
    }
  } else {
    candidates.push(desc.map(fill));
  }

  let best: Seq = candidates[0] ?? [];
  let bestScore = Infinity;
  for (const seq of candidates) {
    let x = x0;
    let sinkC = -1;
    let hobC = -1;
    let hobIdx = -1;
    seq.forEach((it, k) => {
      if (it.kind === "module" && it.feature === "sudoper") sinkC = x + it.width / 2;
      if (it.kind === "module" && it.feature === "ploca") {
        hobC = x + it.width / 2;
        hobIdx = k;
      }
      x += it.width;
    });
    let score = 0;
    if (win) {
      const wc = (win.from + win.to) / 2;
      if (sinkC >= 0) score += Math.abs(sinkC - wc);
      if (hobC >= 0 && H !== undefined && hobC + H / 2 > win.from && hobC - H / 2 < win.to) score += 500;
      if (sinkC < 0 && hobC >= 0) score += Math.abs(hobC - (x0 + R / 2)) * 0.3;
    } else if (sinkC >= 0 && hobC >= 0) {
      score += Math.abs(sinkC - (x0 + R * 0.33)) + 0.8 * Math.abs(hobC - (x0 + R * 0.72));
      // mirrored layouts are equally good; tiny bias keeps results stable
      score += sinkC > hobC ? 0.5 : 0;
    } else if (sinkC >= 0) {
      score += Math.abs(sinkC - (x0 + R * 0.45));
    } else if (hobC >= 0) {
      score += 0.5 * Math.abs(hobC - (x0 + R / 2));
    }
    if (hobIdx === 0 && hard(span.left)) score += 300;
    if (hobIdx === seq.length - 1 && hobIdx >= 0 && hard(span.right)) score += 300;
    if (score < bestScore - 1e-9) {
      bestScore = score;
      best = seq;
    }
  }

  // types for the plain modules: drawers next to the hob, wide ones as drawers,
  // narrow ones as doors, the rest alternating.
  let toggle = true;
  best.forEach((it, k) => {
    if (it.kind !== "module" || it.feature) return;
    const prev = best[k - 1];
    const next = best[k + 1];
    const nextToHob =
      (prev && prev.kind === "module" && prev.feature === "ploca") || (next && next.kind === "module" && next.feature === "ploca");
    if (nextToHob || it.width >= 80) it.type = "ladice";
    else if (it.width <= 30) it.type = "vrata";
    else it.type = toggle ? "ladice" : "vrata";
    toggle = !toggle;
  });
  return { seq: best.map((it) => ({ ...it })), score: bestScore };
}

function fillUpper(span: Span): Item[] {
  const R = innerLength(span);
  if (R < 30) return wrapSpan(span, []);
  const dp = dpFill(R, UPPER_COST, "u");
  const mods: Item[] = dp.widths.map((w) => ({ kind: "module", width: w, type: "vrata" }));
  // symmetric-ish order: wider units in the middle of the stretch
  const ordered: Item[] = [];
  mods
    .sort((a, b) => a.width - b.width)
    .forEach((m, i) => {
      if (i % 2 === 0) ordered.push(m);
      else ordered.unshift(m);
    });
  // wide wall units get a lift-up flap, but never two flaps next to each other
  ordered.forEach((m, i) => {
    const prev = ordered[i - 1];
    if (m.kind === "module" && m.width >= 80 && !(prev && prev.kind === "module" && prev.type === "klapna")) m.type = "klapna";
  });
  return wrapSpan(span, ordered);
}

function subtractRanges(span: Span, blocks: { range: Range; kind: EdgeKind }[]): Span[] {
  let spans: Span[] = [span];
  for (const b of blocks) {
    const next: Span[] = [];
    for (const s of spans) {
      if (b.range.to <= s.from || b.range.from >= s.to) {
        next.push(s);
        continue;
      }
      if (b.range.from > s.from) next.push({ from: s.from, to: b.range.from, left: s.left, right: b.kind });
      if (b.range.to < s.to) next.push({ from: b.range.to, to: s.to, left: b.kind, right: s.right });
    }
    spans = next;
  }
  return spans.filter((s) => s.to - s.from > 0.5);
}

// ---------------------------------------------------------------- edited lists

/** list entries as planner items (types and widths are already valid: sanitizeConfig) */
function listItems(list: CabinetSpec[], zone: ListZone): ModItem[] {
  return list.map((e, i) => {
    const def = moduleDef(zone === "island" ? "base" : zone, e.type);
    const f = def?.feature ? FEATURE_OF[def.feature] : undefined;
    return { kind: "module", width: e.width, type: e.type, src: i, ...(f ? { feature: f } : {}) };
  });
}

const isSpacer = (zone: ListZone, type: string) => Boolean(moduleDef(zone === "island" ? "base" : zone, type)?.spacer);

/**
 * Leave entries out until the rest fits in `capacity` cm, from the end: empty space first, then ordinary
 * cabinets, sink / hob / dishwasher last.
 */
function trimToFit(items: ModItem[], capacity: number, zone: ListZone): { kept: ModItem[]; cut: ModItem[] } {
  const kept = [...items];
  const cut: ModItem[] = [];
  let sum = kept.reduce((s, it) => s + it.width, 0);
  const rank = (it: ModItem) => (isSpacer(zone, it.type) ? 0 : it.feature ? 2 : 1);
  while (sum > capacity + 0.01 && kept.length) {
    let k = -1;
    for (const r of [0, 1, 2]) {
      for (let i = kept.length - 1; i >= 0; i--) {
        if (rank(kept[i]) === r) {
          k = i;
          break;
        }
      }
      if (k >= 0) break;
    }
    sum -= kept[k].width;
    cut.push(kept.splice(k, 1)[0]);
  }
  return { kept, cut };
}

/** an edited base run: exactly its list, trimmed when the span got shorter */
function fillExplicitBase(span: Span, list: CabinetSpec[]): BaseFillResult {
  const { kept, cut } = trimToFit(listItems(list, "base"), innerLength(span), "base");
  return { items: wrapExplicit(span, kept), dropped: [], cut: cut.map((c) => c.src ?? -1) };
}

/**
 * An edited wall-unit list flows left → right through the free stretches between corners, the window and the
 * hood: each cabinet goes into the first stretch from the current one that still has room. With an anchored
 * hood, the entries before it fill the stretches left of the hood, the ones after it the stretches right of it.
 */
function flowUpper(
  subsL: Span[],
  subsR: Span[],
  items: ModItem[],
  hoodAt: number | null,
): { segs: { span: Span; items: ModItem[] }[]; cut: ModItem[] } {
  const cut: ModItem[] = [];
  const place = (subs: Span[], list: ModItem[]) => {
    const segs = subs.map((span) => ({ span, items: [] as ModItem[], used: 0, cap: innerLength(span) }));
    let cur = 0;
    for (const it of list) {
      let k = -1;
      for (let i = cur; i < segs.length; i++) {
        if (segs[i].used + it.width <= segs[i].cap + 0.01) {
          k = i;
          break;
        }
      }
      if (k < 0) {
        cut.push(it);
        continue;
      }
      cur = k;
      segs[k].items.push(it);
      segs[k].used += it.width;
    }
    return segs;
  };
  const left = hoodAt === null ? items : items.filter((it) => (it.src ?? 0) < hoodAt);
  const right = hoodAt === null ? [] : items.filter((it) => (it.src ?? 0) > hoodAt);
  return { segs: [...place(subsL, left), ...place(subsR, right)], cut };
}

const SIDE_WORD = { left: "lijevi", right: "desni" } as const;

/** "Zid A", "Otok", "Visoki stup", "Visoki stup uz zid B (lijevi kraj)" */
function runLabel(id: ListId): string {
  if (id === "tall") return "Visoki stup";
  const end = tallListEnd(id);
  if (end) {
    const { wall, side } = parseRunEnd(end);
    return `Visoki stup uz zid ${wall.toUpperCase()} (${SIDE_WORD[side]} kraj)`;
  }
  if (id === "isl") return "Otok";
  return `Zid ${id[0].toUpperCase()}${id.endsWith(":u") ? " (gornji elementi)" : ""}`;
}

function cutWarning(id: ListId, cut: CabinetSpec[], zone: ListZone): string[] {
  const real = cut.filter((c) => !isSpacer(zone, c.type));
  if (!real.length) return [];
  const z = zone === "island" ? "base" : zone;
  const name = (c: CabinetSpec) => `${moduleDef(z, c.type)?.name ?? c.type} (${c.width} cm)`;
  const out: string[] = [];
  const ess = real.filter((c) => moduleDef(z, c.type)?.feature === "sink" || moduleDef(z, c.type)?.feature === "hob");
  if (ess.length) {
    out.push(
      `${runLabel(id)}: ${ess.map(name).join(" i ")} više ne stane uz ove mjere — izostavljen${ess.length > 1 ? "i su" : " je"}. Uklonite ili suzite neki drugi element pa ga dodajte ponovno.`,
    );
  }
  const rest = real.filter((c) => !ess.includes(c));
  if (rest.length === 1) out.push(`${runLabel(id)}: ${name(rest[0])} više ne stane uz ove mjere — izostavljen je.`);
  else if (rest.length > 1) out.push(`${runLabel(id)}: ${rest.length} elementa više ne stanu uz ove mjere (${rest.map(name).join(", ")}) — izostavljeni su.`);
  return out;
}

// ---------------------------------------------------------------- island / peninsula

/** "1 stolica", "2 stolice", "5 stolica" */
export function stoolsWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "stolice" : "stolica";
}

/** one cabinet of the island run as the planner places it (run-local x) */
interface IslandCabinet {
  x: number;
  width: number;
  type: string;
  /** position in the stored list (edited island) or in the planner's own fill */
  index: number;
  feature?: Feature;
}

/** the island / peninsula as planned once per config — it does not depend on where the tall column stands */
interface IslandCtx {
  /** everything but the hood (that follows the island's hob slot) */
  plan: Omit<IslandPlan, "hood">;
  cabinets: IslandCabinet[];
  fillers: Range[];
  list: PlanList;
  warnings: string[];
}

/**
 * Plan the island / peninsula of a config: its run frame, body, worktop pieces, ends, back panel or outer row, seats,
 * bar / table, and its cabinets — the edited list as listed (trimmed to fit), else the planner's own fill: plain
 * drawers and doors (exactly the island of every older link), or with islandSpec.functions the sink (+ dishwasher)
 * and / or the hob placed like on a wall run, the rest split into a filler at each end.
 */
function planIsland(cfg: KitchenConfig, heights: HeightPlan, K: Record<WallId, Range>, cornerType: (id: CornerId) => string): IslandCtx | null {
  if (!hasIsland(cfg.layout)) return null;
  const spec = cfg.islandSpec ?? {};
  const warnings: string[] = [];
  const len = cfg.island;
  const A = cfg.walls.a;
  /** wall A's kitchen run: the island is centred on it, a peninsula stands at its end */
  const KA = K.a;
  const pen = isPeninsula(cfg.layout);
  const side = peninsulaSide(cfg);
  const name = pen ? "Poluotok" : "Otok";
  const worktop = heights.worktop;

  // ---- body: 60 cm cabinets + back panel, or + a row of push-to-open cabinets on the outer side
  let depth: number = spec.depth ?? ISLAND_DEFAULTS.depth;
  if (spec.bar?.kind === "table" && depth > 60) {
    // the outer row's doors would open against the table
    warnings.push(`${name}: uz spušteni stol nema stražnjih ormarića — tijelo je duboko 60 cm.`);
    depth = 60;
  }
  const backD = depth - 60;
  const outer = backD > 0 ? -backD : -DIM.islandBackT;
  const waterfall = spec.waterfall !== false;
  const ov = spec.overhang ?? ISLAND_DEFAULTS.overhang;
  /** a peninsula's end against wall A (run-local) */
  const wallEnd: "left" | "right" | null = side === "right" ? "left" : side === "left" ? "right" : null;
  let seatSide: SeatSide = spec.seatSide ?? "back";
  if (seatSide === wallEnd) seatSide = "back";
  const bar0 = spec.bar;
  /** counter seats at the main worktop (a bar takes the seats instead) */
  const counter = !bar0 && ov > 0;
  const seatEnd: "left" | "right" | null = counter && seatSide !== "back" ? seatSide : null;

  // ---- ends: how far in the cabinets start, and what closes the end
  type End = { inset: number; kind: "wall" | "seat" | "waterfall" | "panel" };
  const endOf = (e: "left" | "right"): End => {
    // behind wall A's corner unit: 60 cm for a blind corner, 90 for an L-shaped / diagonal one (catalog CORNER_FOOT)
    if (e === wallEnd) return { inset: cornerFoot("base", cornerType(side === "left" ? "base-l" : "base-r")).across, kind: "wall" };
    // knees need the room under the overhang: no waterfall leg there, an end panel on the cabinets
    if (e === seatEnd) return { inset: ov + DIM.panel, kind: "seat" };
    return waterfall ? { inset: DIM.islandWaterfall, kind: "waterfall" } : { inset: DIM.panel, kind: "panel" };
  };
  const eL = endOf("left");
  const eR = endOf("right");
  const body: Range = { from: eL.inset, to: len - eR.inset };

  // ---- main worktop: overhang on the seat side, else flush with the outer face (+ DIM.islandFlush). A lowered table
  // stands against the outer face: the worktop and its waterfall ends are flush with it there (no lip over the table,
  // and the table's top and legs butt against the waterfall instead of running through it)
  const flush = bar0?.kind === "table" ? 0 : DIM.islandFlush;
  const z0 = counter && seatSide === "back" ? Math.min(-backD - ov, outer - flush) : outer - flush;
  const z1 = DIM.worktopDepth;
  const slab: IslandRect[] = [];
  // a peninsula: wall A's worktop covers the corner, the peninsula's top meets it (and runs on behind it on the outer side)
  if (wallEnd === "left") slab.push({ from: 0, to: len, z0, z1: 0 }, { from: DIM.worktopDepth, to: len, z0: 0, z1 });
  else if (wallEnd === "right") slab.push({ from: 0, to: len, z0, z1: 0 }, { from: 0, to: len - DIM.worktopDepth, z0: 0, z1 });
  else slab.push({ from: 0, to: len, z0, z1 });
  const waterfalls: IslandRect[] = [];
  const endPanels: IslandRect[] = [];
  for (const [e, end] of [
    ["left", eL],
    ["right", eR],
  ] as const) {
    const at = (w: number): Range => (e === "left" ? { from: 0, to: w } : { from: len - w, to: len });
    if (end.kind === "waterfall") waterfalls.push({ ...at(DIM.islandWaterfall), z0, z1 });
    else if (end.kind === "panel") endPanels.push({ ...at(DIM.panel), z0: outer, z1: DIM.baseFace });
    else if (end.kind === "seat") {
      const x = e === "left" ? ov : len - ov - DIM.panel;
      endPanels.push({ from: x, to: x + DIM.panel, z0: outer, z1: DIM.baseFace });
    }
  }
  // back panel / outer row: along the cabinets (a peninsula: from wall A, it also closes the side of A's corner unit)
  const bFrom = wallEnd === "left" ? 0 : body.from;
  const bTo = wallEnd === "right" ? len : body.to;
  const backPanel: Range | null = backD > 0 ? null : { from: bFrom, to: bTo };
  let backRow: IslandPlan["backRow"] = null;
  if (backD > 0 && bTo - bFrom > 1) {
    const span = bTo - bFrom;
    const n = Math.max(1, Math.ceil(span / 60 - 1e-6));
    backRow = { from: bFrom, to: bTo, depth: backD, doors: Array.from({ length: n }, () => span / n) };
  }

  // ---- bar (raised) or lowered table along the outer long side; the island: centred, a peninsula: from its free end
  let bar: BarPlan | null = null;
  if (bar0) {
    const bl = clamp(bar0.length ?? len, Math.min(DIM.barMinLength, len), len);
    const from = wallEnd === "left" ? len - bl : wallEnd === "right" ? 0 : (len - bl) / 2;
    const to = from + bl;
    const top = bar0.top ?? cfg.top;
    if (bar0.kind === "raised") {
      const want = bar0.height ?? ISLAND_DEFAULTS.barHeight;
      let h: number = want;
      if (h < worktop + DIM.barMinRise) {
        h = BAR_HEIGHTS.find((x) => x >= worktop + DIM.barMinRise) ?? worktop + DIM.barMinRise;
        warnings.push(`Šank od ${want} cm bio bi samo ${want - worktop} cm iznad radne ploče — postavljen je na ${h} cm.`);
      }
      const d = bar0.depth ?? ISLAND_DEFAULTS.barDepth;
      // the upstand stands on the worktop's (flush) back edge; the top reaches DIM.barLip over it towards the cook
      const uz1 = z0 + DIM.upstandT;
      const zi = uz1 + DIM.barLip;
      const intervals = Math.max(1, Math.ceil((bl - 20) / DIM.barBracketEvery - 1e-6));
      const brackets = Array.from({ length: intervals + 1 }, (_, i) => from + 10 + ((bl - 20) * i) / intervals);
      bar = { kind: "raised", from, to, height: h, depth: d, z0: zi - d, z1: zi, top, upstand: { z0, z1: uz1, y0: worktop, y1: h - DIM.barT }, brackets, legs: [] };
    } else {
      const d = bar0.depth ?? ISLAND_DEFAULTS.tableDepth;
      bar = {
        kind: "table",
        from,
        to,
        height: TABLE_HEIGHT,
        depth: d,
        z0: outer - d,
        z1: outer,
        top,
        upstand: null,
        brackets: [],
        legs: [
          { from, to: from + DIM.tableLegT },
          { from: to - DIM.tableLegT, to },
        ],
      };
    }
  }

  // ---- seats: along the bar / table, the back overhang, or across a seating end
  const wanted = spec.stools ?? ISLAND_DEFAULTS.stools;
  let range: Range | null = null;
  let along: "x" | "z" = "x";
  let at = 0;
  let seatH: number = DIM.counterSeat;
  let kind: SeatPlan["kind"] = "stool";
  if (bar) {
    range = { from: bar.from, to: bar.to };
    at = bar.z0 - (bar.kind === "raised" ? DIM.stoolOut : DIM.chairOut);
    seatH = bar.kind === "raised" ? bar.height - DIM.barSeatDrop : DIM.chairSeat;
    kind = bar.kind === "raised" ? "stool" : "chair";
  } else if (counter && seatSide === "back") {
    range = { from: 0, to: len };
    at = z0 - DIM.stoolOut;
  } else if (seatEnd) {
    along = "z";
    range = { from: z0, to: z1 };
    at = seatEnd === "left" ? -DIM.stoolOut : len + DIM.stoolOut;
  }
  if (range && along === "x" && wallEnd === "left") range = { from: Math.max(range.from, DIM.seatWallGap), to: range.to };
  if (range && along === "x" && wallEnd === "right") range = { from: range.from, to: Math.min(range.to, len - DIM.seatWallGap) };
  const span = range ? Math.max(0, range.to - range.from) : 0;
  const seatsMax = range ? Math.min(MAX_STOOLS, Math.floor(span / DIM.seatPitch + 1e-6)) : 0;
  const n = Math.min(wanted, seatsMax);
  if (spec.stools !== undefined && spec.stools > 0) {
    if (!range) warnings.push(`${name}: bez prepusta za koljena (0 cm) nema mjesta za sjedenje.`);
    else if (spec.stools > seatsMax) warnings.push(`${name}: uz ove mjere stane najviše ${seatsMax} ${stoolsWord(seatsMax)}.`);
  }
  // two seats keep the spacing of every older island (28 % / 72 %), more are spread evenly
  const fr = n === 1 ? [0.5] : n === 2 ? [0.28, 0.72] : Array.from({ length: n }, (_, i) => (i + 0.5) / n);
  const seats: SeatPlan[] = range
    ? fr.map((f) => {
        const p = range.from + f * span;
        return along === "x" ? { kind, x: p, z: at, seat: seatH } : { kind, x: at, z: p, seat: seatH };
      })
    : [];

  // ---- where it stands (world cm, wall A's left end at x = 0)
  let frame: IslandPlan["frame"];
  let centerX: number;
  let backZ: number;
  if (!pen) {
    // centred on wall A's kitchen run (= wall A without KitchenConfig.extents), overhanging the wall's ends by at most
    // DIM.islandOverhangMax (sanitizeConfig keeps it at most islandMax: wall A + 2 x DIM.islandOverhangMax); a longer
    // one from an old link is centred on the wall, overhanging both ends equally
    const lo = len / 2 - DIM.islandOverhangMax;
    const hi = A - len / 2 + DIM.islandOverhangMax;
    centerX = lo > hi ? A / 2 : clamp((KA.from + KA.to) / 2, lo, hi);
    backZ = DIM.baseDepth + DIM.aisle + DIM.baseDepth;
    frame = { x: centerX + len / 2, z: backZ, rot: Math.PI };
  } else if (side === "right") {
    // like wall C of a U kitchen without the wall: its back on the line of the right end of wall A's kitchen run,
    // fronts towards the kitchen
    centerX = KA.to;
    backZ = len;
    frame = { x: KA.to, z: 0, rot: -Math.PI / 2 };
  } else {
    centerX = KA.from;
    backZ = len;
    frame = { x: KA.from, z: len, rot: Math.PI / 2 };
  }

  // ---- cabinets
  const fx = spec.functions ?? ISLAND_DEFAULTS.functions;
  const want: Feature[] = [];
  if (fx === "sink" || fx === "both") want.push("sudoper", "perilica");
  if (fx === "hob" || fx === "both") want.push("ploca");
  const inner = body.to - body.from;
  const cabinets: IslandCabinet[] = [];
  const fillers: Range[] = [];
  let x = body.from;
  const isl = cfg.runs?.isl;
  let list: PlanList;
  let landed = { sink: false, hob: false };
  if (isl) {
    // an edited island: its list, the remainder split into a filler at each end (wide remainder: free at the end)
    const { kept, cut } = trimToFit(listItems(isl, "island"), inner, "island");
    const dropped = cut.map((c) => isl[c.src ?? -1]).filter(Boolean);
    if (cut.length) warnings.push(...cutWarning("isl", dropped, "island"));
    const used = kept.reduce((s, it) => s + it.width, 0);
    const rest = inner - used;
    const free = rest >= FREE_MIN;
    if (!free && rest >= 0.5) {
      fillers.push({ from: x, to: x + rest / 2 });
      x += rest / 2;
    }
    kept.forEach((it, i) => {
      cabinets.push({ x, width: it.width, type: it.type, index: it.src ?? i, ...(it.feature ? { feature: it.feature } : {}) });
      x += it.width;
    });
    if (!free && rest >= 0.5) fillers.push({ from: x, to: x + rest / 2 });
    landed = { sink: want.includes("sudoper") && kept.some((k) => k.feature === "sudoper"), hob: want.includes("ploca") && kept.some((k) => k.feature === "ploca") };
    list = { id: "isl", zone: "island", run: "isl", explicit: true, entries: [], dropped, capacity: inner, used };
  } else if (!want.length) {
    const dp = dpFill(inner, BASE_COST, "b");
    dp.widths.sort((p, q) => q - p);
    // put the widest in the middle for a calm, symmetric front
    const order: number[] = [];
    dp.widths
      .slice()
      .sort((p, q) => p - q)
      .forEach((w, i) => (i % 2 === 0 ? order.push(w) : order.unshift(w)));
    const used = order.reduce((s, w) => s + w, 0);
    const rest = inner - used;
    if (rest >= 0.5) {
      fillers.push({ from: x, to: x + rest / 2 });
      x += rest / 2;
    }
    order.forEach((w, i) => {
      cabinets.push({ x, width: w, type: w >= 80 ? "ladice" : i % 2 === 0 ? "ladice" : "vrata", index: i });
      x += w;
    });
    if (rest >= 0.5) fillers.push({ from: x, to: x + rest / 2 });
    list = { id: "isl", zone: "island", run: "isl", explicit: false, entries: [], dropped: [], capacity: inner, used };
  } else {
    // hob / sink on the island: placed as on a wall run, the rest split over both ends. A free end counts as a hard
    // edge (the hob keeps a cabinet between itself and it: pan handles must not stick out over the end), a peninsula's
    // end at wall A as a corner (the worktop goes on round it). A hob that could only stand at a free end stays off.
    const span: Span = { from: body.from, to: body.to, left: wallEnd === "left" ? "corner" : "wall", right: wallEnd === "right" ? "corner" : "wall" };
    let res = fillBase(span, want, null);
    const atFreeEnd = (items: Item[]) => {
      const m = items.filter((it): it is ModItem => it.kind === "module");
      const h = m.findIndex((it) => it.feature === "ploca");
      return h >= 0 && ((h === 0 && span.left === "wall") || (h === m.length - 1 && span.right === "wall"));
    };
    if (atFreeEnd(res.items)) {
      const without = fillBase(span, want.filter((f) => f !== "ploca"), null);
      res = { ...without, dropped: [...without.dropped, "ploca"] };
    }
    const mods = res.items.filter((it): it is ModItem => it.kind === "module");
    const used = mods.reduce((s, it) => s + it.width, 0);
    const rest = inner - used;
    if (rest >= 0.5) {
      fillers.push({ from: x, to: x + rest / 2 });
      x += rest / 2;
    }
    mods.forEach((it, i) => {
      cabinets.push({ x, width: it.width, type: it.type, index: i, ...(it.feature ? { feature: it.feature } : {}) });
      x += it.width;
    });
    if (rest >= 0.5) fillers.push({ from: x, to: x + rest / 2 });
    landed = { sink: mods.some((m) => m.feature === "sudoper"), hob: mods.some((m) => m.feature === "ploca") };
    const where = explicitWallBase(cfg, wallsFor(cfg.layout)) ? "" : " — ostaje uz zid";
    if (res.dropped.includes("sudoper")) warnings.push(`${name} od ${len} cm prekratak je za sudoper${where}.`);
    else if (res.dropped.includes("perilica")) warnings.push(`${name}: uz sudoper nema mjesta za perilicu posuđa.`);
    if (res.dropped.includes("ploca")) warnings.push(`${name} od ${len} cm prekratak je za ploču za kuhanje${where}.`);
    list = { id: "isl", zone: "island", run: "isl", explicit: false, entries: [], dropped: [], capacity: inner, used };
  }

  return {
    plan: {
      kind: pen ? "poluotok" : "otok",
      side,
      length: len,
      centerX,
      backZ,
      frame,
      functions: landed,
      depth,
      body,
      outer,
      slab,
      waterfalls,
      endPanels,
      backPanel,
      backRow,
      seatSide: seats.length || range ? (bar ? "back" : seatSide) : null,
      overhang: counter ? ov : 0,
      seats,
      seatsMax,
      bar,
    },
    cabinets,
    fillers,
    list,
    warnings,
  };
}

/**
 * The ceiling hood above the first hob of the island run, or null: every hob on the island / peninsula gets one — the
 * planner's (islandSpec.functions) and one the customer put there by hand — unless islandSpec.hood is false (a hob with a
 * built-in downdraft extractor). Its height: islandSpec.hoodAbove, kept under the ceiling.
 */
function islandHood(cfg: KitchenConfig, heights: HeightPlan, slots: PlanSlot[]): IslandHoodPlan | null {
  const spec = cfg.islandSpec;
  if (spec?.hood === false) return null;
  const hob = slots.find((s) => s.zone === "island" && moduleDef("base", s.type)?.feature === "hob");
  if (!hob) return null;
  const want = spec?.hoodAbove ?? ISLAND_DEFAULTS.hoodAbove;
  let bottom = heights.worktop + want;
  const maxTop = cfg.ceiling - DIM.hoodCeilingMin;
  if (bottom + DIM.hoodBody > maxTop) bottom = maxTop - DIM.hoodBody;
  return {
    x: hob.x + hob.width / 2,
    z: DIM.hobCenterZ,
    width: hob.width > 90 ? 120 : 90,
    depth: DIM.hoodDepth,
    bottom,
    top: bottom + DIM.hoodBody,
    ceiling: cfg.ceiling,
    chimney: { width: DIM.hoodChimneyW, depth: DIM.hoodChimneyD },
    above: bottom - heights.worktop,
    fromCeiling: cfg.ceiling - bottom,
  };
}

// ---------------------------------------------------------------- planKitchen

type CornerItem = { kind: "corner"; width: number; side: "left" | "right" };

interface RunBuild {
  wall: WallId;
  length: number;
  kitchen: Range;
  free: (Range & { side: "left" | "right" })[];
  ends: RunPlan["ends"];
  baseItems: { x: number; item: Item | CornerItem }[];
  upperItems: { x: number; item: Item | CornerItem }[];
  /** the tall columns on this run */
  talls: { place: TallPlace; range: Range }[];
  worktop: Range | null;
  backsplash: BacksplashPiece[];
  counter: Range | null;
  openLeft: boolean;
  openRight: boolean;
}

/** where the tall column stands: the open end of a run */
type TallAt = { wall: WallId; side: "left" | "right" };

const TALL_WARNING = "Visoki stup ne stane uz ove mjere — izostavljen je.";

/** what every plan of one config shares: walls, ceiling-derived heights and the window */
interface PlanCtx {
  cfg: KitchenConfig;
  layout: Layout;
  walls: WallId[];
  L: Record<WallId, number>;
  upperTop: number;
  upperBottom: number;
  win: WindowPlan | null;
  heights: HeightPlan;
  /** notes from fitting the heights under the ceiling */
  heightNotes: string[];
  /** window opening on that wall incl. DIM.windowMargin, or null */
  winRange: (wall: WallId) => Range | null;
  /** width of the tall column incl. both cover panels (cm) */
  tallZone: number;
  /** the island / peninsula (planned once: it does not depend on the tall column), or null */
  island: IslandCtx | null;
  /** where the kitchen stands on each wall (kitchenRange) */
  K: Record<WallId, Range>;
  /** what closes each run end (see EndKind) */
  ends: Record<RunEnd, EndKind>;
  /** the corner units of wall A: base / upper type per corner (cfg.corners or the default) */
  cornerType: (id: CornerId) => string;
  /** KitchenConfig.tallRuns columns that stand where they are asked to (the others: `lostTall`) */
  extras: TallPlace[];
  lostTall: { list: TallListId; wall: WallId; units: CabinetSpec[] }[];
}

/**
 * What closes an end of a wall's kitchen run: wall A's own corner unit ("cornerUnit": the A–B / A–C corner where both
 * runs reach it, or the peninsula), the neighbour's corner unit ("cornerEdge": B's / C's end at A's corner unit), a
 * room wall the run reaches without a corner ("wall": no end panel) or nothing ("open": an end panel).
 */
type EndKind = "cornerUnit" | "cornerEdge" | "wall" | "open";

/** a tall column as the planner places it */
interface TallPlace {
  list: "tall" | TallListId;
  wall: WallId;
  side: "left" | "right";
  /** its units (the main column without KitchenConfig.tallRun: decided by its side) */
  units: CabinetSpec[] | null;
  /** width incl. both cover panels (cm) */
  zone: number;
}

const overlaps = (r: Range, w: Range | null) => Boolean(w && r.from < w.to && r.to > w.from);

function planCtx(cfg: KitchenConfig): PlanCtx {
  const layout = cfg.layout;
  const walls = wallsFor(layout);
  const L = { a: cfg.walls.a, b: cfg.walls.b, c: cfg.walls.c };
  const { heights, notes: heightNotes } = planHeights(cfg);
  const { upperTop, upperBottom } = heights;

  let win: WindowPlan | null = null;
  if (cfg.window && walls.includes(cfg.window.wall)) {
    const len = L[cfg.window.wall];
    // sanitizeConfig already keeps the window inside these ranges; repeated here so the plan never depends on it
    const width = Math.min(cfg.window.width, len - DIM.windowWallClearance);
    if (width >= 40) {
      const offset = clamp(cfg.window.offset, 0, len - width);
      const top = windowTop(cfg.ceiling);
      const sill = clamp(cfg.window.sill, 0, top - DIM.windowMinHeight);
      win = { wall: cfg.window.wall, offset, width, sill, top, ledge: sill >= heights.worktop + DIM.sillLedgeMin };
    }
  }
  const winRange = (wall: WallId): Range | null =>
    win && win.wall === wall ? { from: win.offset - DIM.windowMargin, to: win.offset + win.width + DIM.windowMargin } : null;
  const tallZone = cfg.tallRun && cfg.tallRun.length ? cfg.tallRun.reduce((s, t) => s + t.width, 0) + 2 * DIM.panel : DIM.tallZone;

  // ---- where the kitchen stands on the room's walls, and what closes each run end
  const K = { a: kitchenRange(cfg, "a"), b: kitchenRange(cfg, "b"), c: kitchenRange(cfg, "c") };
  const touches = (w: WallId, side: "left" | "right") => (side === "left" ? K[w].from <= 0 : K[w].to >= L[w]);
  const LUG = layout === "L" || layout === "U" || layout === "G";
  // a corner only where both runs reach it (sanitizeConfig keeps them apart otherwise)
  const ab = LUG && touches("a", "left") && touches("b", "right");
  const ac = layout === "U" && touches("a", "right") && touches("c", "left");
  const pen = peninsulaSide(cfg);
  const ends = {} as Record<RunEnd, EndKind>;
  ends["a-left"] = LUG ? (ab ? "cornerUnit" : touches("a", "left") ? "wall" : "open") : pen === "left" ? "cornerUnit" : "open";
  ends["a-right"] =
    layout === "U" ? (ac ? "cornerUnit" : touches("a", "right") ? "wall" : "open") : layout === "G" || pen === "right" ? "cornerUnit" : "open";
  ends["b-left"] = "open";
  ends["b-right"] = ab ? "cornerEdge" : touches("b", "right") ? "wall" : "open";
  ends["c-left"] = ac ? "cornerEdge" : touches("c", "left") ? "wall" : "open";
  ends["c-right"] = "open";
  const cornerType = (id: CornerId) => cfg.corners?.[id] ?? defaultCornerType(id.startsWith("base") ? "base" : "upper");

  // ---- KitchenConfig.tallRuns: each column at its end, when the end is free and the run keeps room for cabinets
  const extras: TallPlace[] = [];
  const lostTall: PlanCtx["lostTall"] = [];
  const partial = { layout, walls, L, K, ends, cornerType, winRange, extras } as const;
  for (const e of RUN_ENDS) {
    const units = cfg.tallRuns?.[e];
    if (!units?.length) continue;
    const { wall, side } = parseRunEnd(e);
    if (!walls.includes(wall)) continue;
    const zone = units.reduce((n, u) => n + u.width, 0) + 2 * DIM.panel;
    const list: TallListId = `tall:${e}`;
    if (tallFits(partial, wall, side, zone, columnDepth(units))) extras.push({ list, wall, side, units, zone });
    else lostTall.push({ list, wall, units });
  }
  const island = planIsland(cfg, heights, K, cornerType);
  return { cfg, layout, walls, L, upperTop, upperBottom, win, heights, heightNotes, winRange, tallZone, island, K, ends, cornerType, extras, lostTall };
}

/**
 * How far from its wall a tall column at a room corner needs the corner free (cm), beyond the room its doors need to open
 * (DIM.cornerClear keeps a 60 cm door's swing clear): its fronts (DIM.baseDepth), or for a side-by-side fridge the
 * appliance with one of its doors swung open (catalog SBS: the doors hinge on both outer sides, one towards the corner)
 */
export function columnDepth(units: readonly CabinetSpec[] | null | undefined): number {
  const sbs = units?.some((u) => u.type === "hladnjak-sbs" || u.type === "hladnjak-sbs-vrata");
  return sbs ? SBS.applianceDepth + SBS.appliance / 2 + SBS.handleDepth : DIM.baseDepth;
}

/** the distance (cm) of the neighbouring wall's kitchen run from the room corner at this run end; null = no neighbour there */
function neighbourGap(ctx: Pick<PlanCtx, "layout" | "L" | "K">, wall: WallId, side: "left" | "right"): number | null {
  for (const p of cornerPairs(ctx.layout)) {
    if (wall === "a" && side === p.a) return p.side === "right" ? ctx.L[p.wall] - ctx.K[p.wall].to : ctx.K[p.wall].from;
    if (wall === p.wall && side === p.side) return p.a === "left" ? ctx.K.a.from : ctx.L.a - ctx.K.a.to;
  }
  return null;
}

/**
 * Whether a tall column `zone` cm wide (both panels included) and `depth` cm deep (columnDepth) can stand at this run
 * end: a free end (no corner), the run keeps at least what the other end needs (its corner unit + 30 cm, or 64 cm)
 * beside it and the columns already there, it stays clear of the window, and at a room corner the neighbouring run (which
 * then keeps DIM.cornerClear from the corner) starts beyond what the column needs (columnDepth: a side-by-side fridge's
 * door towards the corner swings much further into the room than a 60 cm column's) — a safety net: with today's
 * DIM.cornerClear every column fits there.
 */
function tallFits(
  ctx: Pick<PlanCtx, "layout" | "walls" | "L" | "K" | "ends" | "cornerType" | "winRange" | "extras">,
  wall: WallId,
  side: "left" | "right",
  zone: number,
  depth: number = DIM.baseDepth,
): boolean {
  if (!ctx.walls.includes(wall)) return false;
  const end = ctx.ends[runEnd(wall, side)];
  if (end === "cornerUnit" || end === "cornerEdge") return false;
  if (end === "wall") {
    const gap = neighbourGap(ctx, wall, side);
    if (gap !== null && gap < depth + 0.5) return false;
  }
  if (ctx.extras.some((x) => x.wall === wall && x.side === side)) return false;
  const k = ctx.K[wall];
  const others = ctx.extras.filter((x) => x.wall === wall).reduce((n, x) => n + x.zone, 0);
  if (k.to - k.from - zone - others < tallMinBefore(ctx, wall, side)) return false;
  const r: Range = side === "right" ? { from: k.to - zone, to: k.to } : { from: k.from, to: k.from + zone };
  return !overlaps(r, ctx.winRange(wall));
}

/**
 * cm a run must keep beside a tall column at one of its ends: the other end's corner unit (or the neighbour's, at B /
 * C) + 30 cm for a cabinet, else 64 cm — the numbers every older kitchen used (DIM.cornerBase + 30 on wall A,
 * DIM.baseDepth + 30 on B / C, 64 on a straight wall)
 */
function tallMinBefore(ctx: Pick<PlanCtx, "ends" | "cornerType">, wall: WallId, side: "left" | "right"): number {
  const other = side === "left" ? "right" : "left";
  const end = ctx.ends[runEnd(wall, other)];
  const id: CornerId = wall === "a" ? (other === "left" ? "base-l" : "base-r") : wall === "b" ? "base-l" : "base-r";
  if (end === "cornerUnit") return cornerFoot("base", ctx.cornerType(id)).along + 30;
  if (end === "cornerEdge") return cornerFoot("base", ctx.cornerType(id)).across + 30;
  return 64;
}

const nearestBelow = (list: readonly number[], max: number): number | undefined => [...list].filter((x) => x <= max + 1e-6).sort((a, b) => b - a)[0];

/**
 * Cabinet heights for a config (cm). Standard: wall units 72 cm with the top at most 219 cm (+ worktop offset) and
 * 3 cm below the ceiling, tall column on the same line — exactly the older kitchens. "do-stropa": everything up to
 * the ceiling minus DIM.cornice; a second row of top cabinets once the wall units would exceed DIM.upperRowMax.
 * Custom: the requested wall-unit height and tall-column top, lowered (with a note) when the ceiling is too low.
 */
export function planHeights(cfg: KitchenConfig): { heights: HeightPlan; notes: string[] } {
  const spec = cfg.heights;
  const mode = spec?.mode ?? "standard";
  const worktop = spec?.worktop ?? STANDARD_HEIGHTS.worktop;
  const { plinth, carcass } = baseHeights(worktop);
  const C = cfg.ceiling;
  const notes: string[] = [];
  const maxTop = C - DIM.ceilingGap;
  let ub = worktop + DIM.upperGap;
  let ut: number;
  let topRow: Range | null = null;
  let tallTop: number;
  let tallSplit: number | null = null;
  let cornice: Range | null = null;

  if (mode === "do-stropa") {
    const line = C - DIM.cornice;
    // a very low ceiling: wall units at least 50 cm, the gap to the worktop gives way first
    if (line - ub < 50) ub = Math.max(worktop + DIM.upperGapMin, line - 50);
    const avail = line - ub;
    if (avail <= DIM.upperRowMax) ut = line;
    else {
      // main row 72–105 cm with a 30–45 cm top row; on very high ceilings up to 120 + 60 (the cornice takes the rest)
      let main = clamp(avail - 45, 72, DIM.upperRowMax);
      let top = avail - main;
      if (top > DIM.topRowMax) {
        main = Math.min(DIM.upperMainMax, avail - DIM.topRowMax);
        top = Math.min(DIM.topRowMax, avail - main);
      }
      if (top < DIM.topRowMin) {
        main = avail - DIM.topRowMin;
        top = DIM.topRowMin;
      }
      ut = ub + main;
      topRow = { from: ut, to: ut + top };
    }
    tallTop = topRow ? topRow.to : ut;
    tallSplit = topRow ? topRow.from : tallTop - plinth > DIM.tallOnePiece ? tallTop - 45 : null;
    cornice = { from: tallTop, to: C };
  } else if (mode === "custom") {
    const want = spec?.upper ?? 72;
    let h = want;
    if (ub + h > maxTop) {
      ub = Math.max(worktop + DIM.upperGapMin, maxTop - h);
      if (ub + h > maxTop) {
        h = nearestBelow(UPPER_HEIGHTS, maxTop - worktop - DIM.upperGapMin) ?? Math.max(30, maxTop - worktop - DIM.upperGapMin);
        ub = Math.min(worktop + DIM.upperGap, maxTop - h);
        notes.push(`Gornji elementi od ${want} cm ne stanu ispod stropa od ${C} cm — prikazani su s ${h} cm.`);
      }
    }
    ut = ub + h;
    const wantTall = spec?.tallTop ?? ut;
    tallTop = Math.max(DIM.tallTopMin, Math.min(wantTall, maxTop));
    if (spec?.tallTop !== undefined && wantTall > maxTop) {
      notes.push(`Visoki stup do ${wantTall} cm ne stane ispod stropa od ${C} cm — snižen je na ${Math.round(tallTop)} cm.`);
    }
    if (tallTop - plinth > DIM.tallOnePiece) {
      // the split sits on the wall units' top line when that leaves a sensible top box, else 45 cm below the top
      tallSplit = ut > tallTop - 70 && ut < tallTop - DIM.topRowMin ? ut : tallTop - 45;
    }
  } else {
    ut = Math.min(DIM.upperTopMax + (worktop - STANDARD_HEIGHTS.worktop), maxTop);
    ub = Math.min(ub, ut - 50);
    tallTop = ut;
  }
  const heights: HeightPlan = {
    mode,
    worktop,
    plinth,
    carcass,
    upperBottom: ub,
    upperTop: ut,
    topRow,
    tallTop,
    tallSplit,
    cornice,
    cornices: [],
    top: Math.max(topRow ? topRow.to : ut, tallTop),
  };
  return { heights, notes };
}

/** a wall unit that carries a top box in the second row ("do stropa"): every cabinet, not empty space or an open shelf */
export function hasTopBox(type: string): boolean {
  const def = moduleDef("upper", type);
  return Boolean(def && !def.spacer && type !== "polica");
}

/**
 * possible places for the tall column, best first (a free end of a run, clear of the window and of the other tall
 * columns); KitchenConfig.tallAt pins it to one end (the column stands there or nowhere), unless the layout cannot use
 * that end — then the planner chooses as for every older kitchen. When another column (KitchenConfig.tallRuns) stands
 * where the planner would put it, it tries the layout's other free ends (no older kitchen has such a column).
 */
function tallCandidates(ctx: PlanCtx): TallAt[] {
  const out: TallAt[] = [];
  let taken = false;
  const tryAt = (wall: WallId, side: "left" | "right") => {
    if (ctx.extras.some((x) => x.wall === wall && x.side === side)) taken = true;
    if (tallFits(ctx, wall, side, ctx.tallZone, columnDepth(ctx.cfg.tallRun))) out.push({ wall, side });
  };
  const others = () => {
    if (!taken) return;
    for (const w of ctx.walls) for (const side of ["right", "left"] as const) if (!out.some((t) => t.wall === w && t.side === side)) tryAt(w, side);
  };
  const pin = ctx.cfg.tallAt ? parseRunEnd(ctx.cfg.tallAt) : null;
  const pinEnd = pin && ctx.walls.includes(pin.wall) ? ctx.ends[runEnd(pin.wall, pin.side)] : null;
  if (pin && (pinEnd === "open" || pinEnd === "wall")) {
    tryAt(pin.wall, pin.side);
    return out;
  }
  if (ctx.layout === "U") tryAt("c", "right");
  else if (ctx.layout === "L") tryAt("a", "right");
  // G: both ends of wall A are corners, the column stands at the open end of wall B
  else if (ctx.layout === "G") tryAt("b", "left");
  // a peninsula: at the other end of wall A
  else if (ctx.layout === "poluotok") tryAt("a", peninsulaSide(ctx.cfg) === "left" ? "right" : "left");
  else {
    tryAt("a", "right");
    tryAt("a", "left");
  }
  others();
  return out;
}

/**
 * how many of the two essentials (sink, hob) the kitchen has where the planner wants them: on the wall runs, plus
 * what islandSpec.functions put on the island (an island sink / hob of an older link's edited list does not count, as in v1)
 */
const essentials = (p: KitchenPlan) => {
  const has = (f: "sink" | "hob") =>
    p.slots.some((s) => s.zone === "base" && moduleDef("base", s.type)?.feature === f) || Boolean(p.island?.functions[f]);
  return (has("sink") ? 1 : 0) + (has("hob") ? 1 : 0);
};
/** cabinets of edited lists the plan had to leave out */
const cutCount = (p: KitchenPlan) =>
  p.lists.reduce((n, l) => n + l.dropped.filter((e) => !moduleDef(l.zone === "island" ? "base" : l.zone, e.type)?.spacer).length, 0);

/** The single source of truth for cabinet positions. */
export function planKitchen(input: KitchenConfig): KitchenPlan {
  return planCore(sanitizeConfig(input));
}

/**
 * The widest the tall column may get (cm, its units without the two cover panels) where it stands now: the planner
 * keeps it and leaves out no more cabinets of edited runs than it does today. 0 when the kitchen has no column.
 * Binary search over the column width (~10 plans, ~1.5 ms); lib/studio/edit.ts uses it for "fits" and its notes.
 */
export function tallCapacity(input: KitchenConfig, id: ListId = "tall"): number {
  const cfg = sanitizeConfig(input);
  if (id === "tall" && !cfg.tall) return 0;
  if (!isTallList(id)) return 0;
  const now = planCore(cfg);
  const used = now.slots.filter((s) => s.list?.id === id).reduce((n, s) => n + s.width, 0);
  if (!used) return 0;
  const cut0 = cutCount(now);
  const others = (p: KitchenPlan) => p.slots.filter((s) => s.zone === "tall" && s.list?.id !== id).length;
  const others0 = others(now);
  // a stand-in column of one unit `w` wide (only its width matters to where it fits); the other columns must stay
  const ok = (w: number) => {
    const stand: CabinetSpec[] = [{ type: "ormar", width: w }];
    const p = planCore(id === "tall" ? { ...cfg, tallRun: stand } : withList(cfg, id, stand));
    return p.slots.some((s) => s.list?.id === id) && cutCount(p) <= cut0 && others(p) >= others0;
  };
  let lo = used;
  let hi = Math.max(...wallsFor(cfg.layout).map((w) => cfg.walls[w]));
  if (ok(hi)) return hi;
  while (hi - lo > 1) {
    const mid = Math.floor((lo + hi) / 2);
    if (ok(mid)) lo = mid;
    else hi = mid;
  }
  return lo;
}

/** plan of an already sanitized config; `legacy` applies cfg.overrides (sanitizeConfig's migration only) */
function planCore(cfg: KitchenConfig, legacy = false): KitchenPlan {
  const ctx = planCtx(cfg);

  let plan: KitchenPlan | null = null;
  if (cfg.tall) {
    // The column is an extra: it stays only where it leaves room for everything the kitchen would get
    // without it (sink and hob, and every cabinet of an edited run). Otherwise it is left out with the usual note.
    let without: KitchenPlan | null = null;
    for (const at of tallCandidates(ctx)) {
      const p = layoutKitchen(ctx, at);
      if (essentials(p) === 2 && cutCount(p) === 0) {
        plan = p;
        break;
      }
      without ??= layoutKitchen(ctx, null);
      if (essentials(p) >= essentials(without) && cutCount(p) <= cutCount(without)) {
        plan = p;
        break;
      }
    }
    if (!plan) {
      plan = without ?? layoutKitchen(ctx, null);
      plan.warnings.unshift(TALL_WARNING);
    }
  } else {
    plan = layoutKitchen(ctx, null);
  }

  if (legacy) applyOverrides(plan);
  // an edited kitchen without a sink or a hob: say so (the planner no longer adds them on its own) — also when the
  // edited island was given the hob / sink (islandSpec.functions) and the walls therefore have none
  const islandDeclared = hasIsland(cfg.layout) && Boolean(cfg.runs?.isl) && (cfg.islandSpec?.functions ?? "none") !== "none";
  if (explicitWallBase(cfg, plan.walls) || islandDeclared) {
    const p = plan;
    const isF = (type: string, f: "sink" | "hob") => moduleDef("base", type)?.feature === f;
    const has = (f: "sink" | "hob") => p.slots.some((s) => (s.zone === "base" || s.zone === "island") && isF(s.type, f));
    // a sink / hob that no longer fits already has its own note
    const cut = (f: "sink" | "hob") => p.lists.some((l) => l.dropped.some((e) => isF(e.type, f)));
    if (!has("sink") && !cut("sink")) p.warnings.push("U kuhinji nema sudopera — dodajte ga klikom na donji element.");
    if (!has("hob") && !cut("hob")) p.warnings.push("U kuhinji nema ploče za kuhanje — dodajte je klikom na donji element.");
  }
  return plan;
}

/** v1 element edits (positional overrides) on the planner's own slots — only while converting an old link */
function applyOverrides(plan: KitchenPlan): void {
  const ov = plan.cfg.overrides;
  for (const s of plan.slots) {
    const o = ov[s.id];
    if (!o) continue;
    if (s.options.includes(o)) s.type = o;
    else {
      // a v1 type at a width it no longer comes in (base "vrata" at 80 / 90 cm is "vrata2" now)
      const def = moduleDef(s.zone, o);
      const sib = def?.sibling;
      if (sib && s.options.includes(sib)) s.type = sib;
    }
  }
  plan.sinkId = plan.slots.find((s) => (s.zone === "base" || s.zone === "island") && s.type === "sudoper")?.id ?? null;
  plan.hobId = plan.slots.find((s) => (s.zone === "base" || s.zone === "island") && moduleDef("base", s.type)?.feature === "hob")?.id ?? null;
  for (const l of plan.lists) {
    l.entries = plan.slots
      .filter((s) => s.list?.id === l.id)
      .sort((p, q) => (p.list?.index ?? 0) - (q.list?.index ?? 0))
      .map((s) => ({ type: s.type, width: s.width }));
  }
}

/**
 * Turn the planner's own fill of these lists into explicit lists (what the customer sees becomes what is
 * stored), so they can be edited. The first time a wall's base run becomes explicit, every other wall base run
 * with a sink, hob or dishwasher is fixed too — from then on the planner adds no essentials on its own, and
 * nothing the customer sees moves. Lists that are already explicit are replaced by what the plan shows of
 * them (entries that no longer fit are dropped for good).
 */
export function materializeLists(cfg: KitchenConfig, plan: KitchenPlan, ids: ListId[]): KitchenConfig {
  let next = cfg;
  const all = new Set(ids);
  const baseWalls = (id: ListId) => listZone(id) === "base";
  if ([...all].some(baseWalls) && !explicitWallBase(cfg, plan.walls)) {
    for (const l of plan.lists) {
      if (l.zone !== "base") continue;
      const hasFeature = l.entries.some((e) => moduleDef("base", e.type)?.feature);
      if (hasFeature) all.add(l.id);
    }
  }
  for (const id of all) {
    const l = plan.lists.find((x) => x.id === id);
    if (!l) continue;
    next = withList(next, id, l.entries);
  }
  return next;
}

/** v1 overrides → explicit lists + corner types; the result has `overrides: {}` */
function migrateOverrides(cfg: KitchenConfig): KitchenConfig {
  const plan = planCore(cfg, true);
  let next: KitchenConfig = { ...cfg, overrides: {} };
  const touched = new Set<ListId>();
  const corners: Partial<Record<CornerId, string>> = { ...(cfg.corners ?? {}) };
  for (const s of plan.slots) {
    if (!cfg.overrides[s.id] || s.type === s.defaultType) continue;
    if (s.cornerId) corners[s.cornerId] = s.type;
    else if (s.list) touched.add(s.list.id);
  }
  // v1 kept a run's wall units (and its hood) where they were when the hob slot below was changed: freeze them too
  for (const id of [...touched]) if (listZone(id) === "base") touched.add(`${id}:u` as ListId);
  if (touched.size) next = materializeLists(next, plan, [...touched]);
  if (Object.keys(corners).length) next = { ...next, corners };
  return sanitizeShallow(next);
}

/** cabinets for one tall-column choice (null = no column) */
function layoutKitchen(ctx: PlanCtx, tall: TallAt | null): KitchenPlan {
  const { cfg, layout, walls, L, upperTop, upperBottom, win, winRange } = ctx;
  const warnings: string[] = [...ctx.heightNotes];
  const lists: PlanList[] = [];

  // ---- run skeletons (base spans, upper spans, corners) — each run within its kitchen stretch on the wall (ctx.K)
  interface Skeleton {
    wall: WallId;
    length: number;
    kitchen: Range;
    /** widths of wall A's corner units at its ends (0 = none) */
    cornerBaseLeft: number;
    cornerBaseRight: number;
    cornerUpperLeft: number;
    cornerUpperRight: number;
    baseSpan: Span;
    upperSpan: Span;
    worktop: Range;
    /** the backsplash's stretch (B / C reach into the corner up to A's backsplash) */
    splash: Range;
    openLeft: boolean;
    openRight: boolean;
    talls: { place: TallPlace; range: Range }[];
  }
  const sk: Skeleton[] = [];
  /** the tall columns on a wall: the main one (if it stands there) and KitchenConfig.tallRuns */
  const tallsOn = (wall: WallId): { place: TallPlace; range: Range }[] => {
    const k = ctx.K[wall];
    const places: TallPlace[] = [...ctx.extras.filter((x) => x.wall === wall)];
    if (tall && tall.wall === wall) places.push({ list: "tall", wall, side: tall.side, units: cfg.tallRun?.length ? cfg.tallRun : null, zone: ctx.tallZone });
    return places
      .map((place) => ({ place, range: place.side === "right" ? { from: k.to - place.zone, to: k.to } : { from: k.from, to: k.from + place.zone } }))
      .sort((p, q) => p.range.from - q.range.from);
  };
  const footB = (id: CornerId) => cornerFoot("base", ctx.cornerType(id));
  const footU = (id: CornerId) => cornerFoot("upper", ctx.cornerType(id));
  const LUG = layout === "L" || layout === "U" || layout === "G";
  // wall A's corner wall units (the A–B / A–C corners only — nothing hangs over a peninsula). A blind corner wall unit
  // stands flush against the neighbouring wall over its last (B) / first (C) cm: a window there would be covered by
  // the side of the cabinet. A window on A within the corner unit's reach leaves no room for it either. Then the corner
  // unit is left out and A's wall units keep that corner square free, like the uppers beside any window — the
  // neighbour's wall units stop DIM.upperDepth before the corner, and a cabinet of A in the square would have its door
  // behind the neighbour's first cabinet.
  const kA = ctx.K.a;
  const winAtB = LUG && ctx.ends["a-left"] === "cornerUnit" && overlaps({ from: L.b - footU("upper-l").across, to: L.b }, winRange("b"));
  const winAtC = layout === "U" && ctx.ends["a-right"] === "cornerUnit" && overlaps({ from: 0, to: footU("upper-r").across }, winRange("c"));
  const cuL =
    LUG && ctx.ends["a-left"] === "cornerUnit" && !winAtB && !overlaps({ from: kA.from, to: kA.from + footU("upper-l").along }, winRange("a"))
      ? footU("upper-l").along
      : 0;
  const cuR =
    layout === "U" && ctx.ends["a-right"] === "cornerUnit" && !winAtC && !overlaps({ from: kA.to - footU("upper-r").along, to: kA.to }, winRange("a"))
      ? footU("upper-r").along
      : 0;

  for (const w of walls) {
    const len = L[w];
    const k = ctx.K[w];
    const eL = ctx.ends[runEnd(w, "left")];
    const eR = ctx.ends[runEnd(w, "right")];
    const talls = tallsOn(w);
    const tl = talls.find((t) => t.place.side === "left")?.range ?? null;
    const tr = talls.find((t) => t.place.side === "right")?.range ?? null;
    const plain = (e: EndKind): EdgeKind => (e === "wall" ? "wall" : "open");
    const cbL = w === "a" && eL === "cornerUnit" ? footB("base-l").along : 0;
    const cbR = w === "a" && eR === "cornerUnit" ? footB("base-r").along : 0;

    // base cabinets: between the corner units / the neighbour's corner unit / tall columns at the ends
    const base: Span = { from: k.from, to: k.to, left: plain(eL), right: plain(eR) };
    if (cbL) [base.from, base.left] = [k.from + cbL, "corner"];
    else if (eL === "cornerEdge") [base.from, base.left] = [k.from + footB("base-r").across, "corner"];
    else if (tl) [base.from, base.left] = [tl.to, "tall"];
    if (cbR) [base.to, base.right] = [k.to - cbR, "corner"];
    else if (eR === "cornerEdge") [base.to, base.right] = [k.to - footB("base-l").across, "corner"];
    else if (tr) [base.to, base.right] = [tr.from, "tall"];

    // wall units
    const upper: Span = { from: k.from, to: k.to, left: plain(eL), right: plain(eR) };
    if (w === "a" && eL === "cornerUnit" && LUG) {
      upper.from = cuL ? k.from + cuL : k.from + DIM.upperDepth;
      upper.left = cuL ? "corner" : "window";
    } else if (eL === "cornerEdge") [upper.from, upper.left] = [k.from + (cuR ? footU("upper-r").across : DIM.upperDepth), "corner"];
    else if (tl) [upper.from, upper.left] = [tl.to, "tall"];
    // (a peninsula's corner: no wall there — the wall units run on to the end of the run)
    if (w === "a" && eR === "cornerUnit" && layout === "U") {
      upper.to = cuR ? k.to - cuR : k.to - DIM.upperDepth;
      upper.right = cuR ? "corner" : "window";
    } else if (eR === "cornerEdge") [upper.to, upper.right] = [k.to - (cuL ? footU("upper-l").across : DIM.upperDepth), "corner"];
    else if (tr) [upper.to, upper.right] = [tr.from, "tall"];

    // worktop over the base run and the corner units; B / C stop at A's worktop, which covers the corner
    const worktop: Range = { from: tl ? tl.to : eL === "cornerEdge" ? k.from + DIM.worktopDepth : k.from, to: tr ? tr.from : eR === "cornerEdge" ? k.to - DIM.worktopDepth : k.to };
    const splash: Range = { from: eL === "cornerEdge" ? k.from + DIM.backsplashT : worktop.from, to: eR === "cornerEdge" ? k.to - DIM.backsplashT : worktop.to };

    // open (non-wall) ends of the room's wall: a property of the room, not of where the kitchen stands on it
    const openLeft = !LUG || w === "b";
    const openRight = !LUG || w === "c" || (w === "a" && layout !== "U");
    sk.push({
      wall: w,
      length: len,
      kitchen: { ...k },
      cornerBaseLeft: cbL,
      cornerBaseRight: cbR,
      cornerUpperLeft: w === "a" ? cuL : 0,
      cornerUpperRight: w === "a" ? cuR : 0,
      baseSpan: base,
      upperSpan: upper,
      worktop,
      splash,
      openLeft,
      openRight,
      talls,
    });
  }

  // ---- base runs
  let fills: BaseFillResult[];
  if (explicitWallBase(cfg, walls)) {
    // the customer has edited a base run: edited runs are placed as listed, the rest get plain cabinets only
    fills = sk.map((s) => {
      const list = cfg.runs?.[s.wall];
      return list ? fillExplicitBase(s.baseSpan, list) : fillBase(s.baseSpan, [], winRange(s.wall));
    });
  } else {
    // ---- features: sink (+ dishwasher) and hob
    // Preferred walls first (sink on A or under a window elsewhere, hob on another wall with room), then every
    // other combination; the first one that fits both sink and hob wins. Only if none does is one dropped.
    const freeOf = (w: WallId) => {
      const s = sk.find((k) => k.wall === w);
      return s ? innerLength(s.baseSpan) : 0;
    };
    const runWalls = sk.map((s) => s.wall);
    let sinkPref: WallId = "a";
    if (win && win.wall !== "a" && freeOf(win.wall) >= 120) sinkPref = win.wall;
    let hobPref: WallId = sinkPref;
    if (layout === "L" || layout === "G") {
      const other: WallId = sinkPref === "a" ? "b" : "a";
      if (freeOf(other) >= 90) hobPref = other;
    } else if (layout === "U") {
      const others = runWalls.filter((w) => w !== sinkPref).sort((x, y) => freeOf(y) - freeOf(x));
      if (others.length && freeOf(others[0]) >= 90) hobPref = others[0];
    }
    const byFree = (ws: WallId[]) => [...ws].sort((x, y) => freeOf(y) - freeOf(x));
    const pairs: [WallId, WallId][] = [[sinkPref, hobPref]];
    for (const sw of [sinkPref, ...byFree(runWalls.filter((w) => w !== sinkPref))]) {
      for (const hw of [...byFree(runWalls.filter((w) => w !== sw)), sw]) {
        if (!pairs.some(([p, q]) => p === sw && q === hw)) pairs.push([sw, hw]);
      }
    }
    // what islandSpec.functions put on the island / peninsula is not wanted on the walls
    const wantSink = !ctx.island?.plan.functions.sink;
    const wantHob = !ctx.island?.plan.functions.hob;
    let chosen: { fills: BaseFillResult[]; score: number } | null = null;
    for (let i = 0; i < pairs.length; i++) {
      const [sw, hw] = pairs[i];
      const f = sk.map((s) => {
        const wanted: Feature[] = [];
        if (s.wall === sw && wantSink) wanted.push("sudoper", "perilica");
        if (s.wall === hw && wantHob) wanted.push("ploca");
        return fillBase(s.baseSpan, wanted, winRange(s.wall));
      });
      const dropped = f.flatMap((x) => x.dropped);
      const lost = (dropped.includes("sudoper") ? 1 : 0) + (dropped.includes("ploca") ? 1 : 0);
      // a lost sink or hob outweighs everything, then the preference order, then a lost dishwasher
      const score = lost * 1000 + i * 10 + (dropped.includes("perilica") ? 1 : 0);
      if (!chosen || score < chosen.score) chosen = { fills: f, score };
      if (lost === 0) break;
    }
    fills = chosen ? chosen.fills : sk.map((s) => fillBase(s.baseSpan, [], winRange(s.wall)));
    const droppedAll = fills.flatMap((f) => f.dropped);
    if (droppedAll.includes("sudoper")) warnings.push("Sudoper ne stane uz ove mjere — dodajte ga klikom na element.");
    if (droppedAll.includes("ploca")) warnings.push("Ploča za kuhanje ne stane uz ove mjere — dodajte je klikom na element.");
  }

  // ---- fill runs
  const builds: RunBuild[] = [];
  const upperInfo = new Map<WallId, NonNullable<PlanList["segments"]>>();
  const upperCut = new Map<WallId, CabinetSpec[]>();
  const baseCut = new Map<WallId, CabinetSpec[]>();
  sk.forEach((s, si) => {
    const res = fills[si];
    const baseList = cfg.runs?.[s.wall];
    if (baseList && res.cut?.length) {
      const cut = res.cut.map((i) => baseList[i]).filter(Boolean);
      warnings.push(...cutWarning(s.wall, cut, "base"));
      baseCut.set(s.wall, cut);
    }

    const baseItems: RunBuild["baseItems"] = [];
    let x = 0;
    if (s.cornerBaseLeft) {
      baseItems.push({ x: s.kitchen.from, item: { kind: "corner", width: s.cornerBaseLeft, side: "left" } });
    }
    x = s.baseSpan.from;
    for (const it of res.items) {
      baseItems.push({ x, item: it });
      x += it.width;
    }
    if (s.cornerBaseRight) baseItems.push({ x: s.kitchen.to - s.cornerBaseRight, item: { kind: "corner", width: s.cornerBaseRight, side: "right" } });

    // bare floor an edited base run leaves at an open end (no cabinets, worktop or backsplash there; see below)
    const its = res.items;
    const firstGap = its.length && its[0].kind === "gap" && s.baseSpan.left === "open" ? its[0].width : 0;
    const lastGap = its.length && its[its.length - 1].kind === "gap" && s.baseSpan.right === "open" && !(its.length === 1 && firstGap) ? its[its.length - 1].width : 0;
    // the planner's own wall units stop with the base cabinets there too (an edited wall-unit list keeps its stretch)
    if (!cfg.upperRuns?.[s.wall]) {
      if (firstGap && s.upperSpan.left === "open") s.upperSpan = { ...s.upperSpan, from: Math.max(s.upperSpan.from, s.baseSpan.from + firstGap) };
      if (lastGap && s.upperSpan.right === "open") s.upperSpan = { ...s.upperSpan, to: Math.min(s.upperSpan.to, s.baseSpan.to - lastGap) };
      if (s.upperSpan.to < s.upperSpan.from) s.upperSpan = { ...s.upperSpan, to: s.upperSpan.from };
    }

    // uppers: blocks = window, hood (above the hob)
    const blocks: { range: Range; kind: EdgeKind }[] = [];
    const wr = winRange(s.wall);
    if (wr) blocks.push({ range: wr, kind: "window" });
    // the hobs of this run (the planner's own wall units put the hood above the first one)
    const hobs: Range[] = [];
    {
      let hx = s.baseSpan.from;
      for (const it of res.items) {
        if (it.kind === "module" && it.feature === "ploca") hobs.push({ from: hx, to: hx + it.width });
        hx += it.width;
      }
    }
    const hob: Range | null = hobs[0] ?? null;
    const upperList = cfg.upperRuns?.[s.wall];
    const hoodFits = (r: Range) => r.from >= s.upperSpan.from - 0.01 && r.to <= s.upperSpan.to + 0.01 && !overlaps(r, wr);
    const upperItems: RunBuild["upperItems"] = [];
    if (s.cornerUpperLeft) upperItems.push({ x: s.kitchen.from, item: { kind: "corner", width: s.cornerUpperLeft, side: "left" } });
    const segs: { from: number; items: Item[] }[] = [];
    /** the stretches left / right of the hood (or all of them), as an edited list would flow through them */
    const split = (hood: Range | null): { subsL: Span[]; subsR: Span[] } =>
      hood
        ? {
            subsL: subtractRanges({ from: s.upperSpan.from, to: hood.from, left: s.upperSpan.left, right: "hood" }, blocks),
            subsR: subtractRanges({ from: hood.to, to: s.upperSpan.to, left: "hood", right: s.upperSpan.right }, blocks),
          }
        : { subsL: subtractRanges(s.upperSpan, blocks), subsR: [] };
    let hoodRange: Range | null = null;
    let hoodAt: number | null = null;
    if (!upperList) {
      // the planner's own wall units: a hood exactly above the hob, the stretches around it filled
      if (hob && hoodFits(hob)) hoodRange = hob;
      const subs = subtractRanges(s.upperSpan, hoodRange ? [...blocks, { range: hoodRange, kind: "hood" }] : blocks);
      segs.push(...subs.map((sp) => ({ from: sp.from, items: fillUpper(sp) })));
      if (hoodRange) {
        segs.push({ from: hoodRange.from, items: [{ kind: "module", width: hoodRange.to - hoodRange.from, type: "napa", anchored: true }] });
        // its index in the list an edit would start from (wall units left of it come first)
        const h = hoodRange;
        hoodAt = segs.filter((sg) => sg.from < h.from).reduce((n, sg) => n + sg.items.filter((it) => it.kind === "module").length, 0);
      }
    } else {
      // an edited list: a hood in it stays centred above the hob, everything else flows around it. With more
      // than one hood, the one that leaves the rest in place best is anchored (fewest left out, then the
      // closest fit of the cabinets before it into the stretches left of the hob).
      const items = listItems(upperList, "upper");
      const hoods = items.map((it, i) => (moduleDef("upper", it.type)?.hood ? i : -1)).filter((i) => i >= 0);
      let flow = flowUpper(split(null).subsL, [], items, null);
      // not anchoring at all competes too: a hood is anchored unless that leaves more cabinets out
      let best = hoods.length ? flow.cut.length * 1e4 + 5e3 : -Infinity;
      for (const hb of hobs) {
        for (const hi of hoods) {
          const w = items[hi].width;
          const c = (hb.from + hb.to) / 2;
          const r = { from: c - w / 2, to: c + w / 2 };
          if (!hoodFits(r)) continue;
          const sp = split(r);
          const f = flowUpper(sp.subsL, sp.subsR, items.filter((_, i) => i !== hi), hi);
          const capL = sp.subsL.reduce((sum, x) => sum + innerLength(x), 0);
          const usedL = items.slice(0, hi).reduce((sum, it) => sum + it.width, 0);
          const score = f.cut.length * 1e4 + Math.abs(capL - usedL);
          if (score < best - 1e-9) {
            best = score;
            hoodAt = hi;
            hoodRange = r;
            flow = f;
          }
        }
      }
      for (const sg of flow.segs) segs.push({ from: sg.span.from, items: hugPanels(wrapExplicit(sg.span, sg.items)) });
      if (hoodRange && hoodAt !== null) segs.push({ from: hoodRange.from, items: [{ ...items[hoodAt], anchored: true }] });
      if (flow.cut.length) {
        const cut = flow.cut.map((c) => upperList[c.src ?? -1]).filter(Boolean);
        warnings.push(...cutWarning(`${s.wall}:u` as ListId, cut, "upper"));
        upperCut.set(s.wall, cut);
      }
      if (hoods.length && hoodAt === null) warnings.push(`${runLabel(s.wall)}: element za napu nije iznad ploče za kuhanje.`);
    }
    {
      const { subsL, subsR } = split(hoodRange);
      upperInfo.set(s.wall, { left: subsL.map(innerLength), right: subsR.map(innerLength), hoodAt });
    }
    segs.sort((p, q) => p.from - q.from);
    for (const sg of segs) {
      let ux = sg.from;
      for (const it of sg.items) {
        upperItems.push({ x: ux, item: it });
        ux += it.width;
      }
    }
    if (s.cornerUpperRight) upperItems.push({ x: s.kitchen.to - s.cornerUpperRight, item: { kind: "corner", width: s.cornerUpperRight, side: "right" } });

    // the worktop, its backsplash and the plinth end with the cabinets: what an edited run leaves free at an open end
    // is bare floor (RunPlan.free) behind the run's end panel — never worktop over nothing. Empty space in the list
    // ("Slobodno mjesto": a freestanding appliance, a desk) and a free stretch between hard ends keep their worktop.
    const wt: Range = { ...s.worktop };
    const sp: Range = { ...s.splash };
    const ctr: Range = { from: s.cornerBaseLeft ? s.kitchen.from : s.baseSpan.from, to: s.cornerBaseRight ? s.kitchen.to : s.baseSpan.to };
    const free: (Range & { side: "left" | "right" })[] = [];
    if (firstGap) {
      const e = s.baseSpan.from + firstGap;
      free.push({ from: s.baseSpan.from, to: e, side: "left" });
      wt.from = Math.max(wt.from, e);
      sp.from = Math.max(sp.from, e);
      ctr.from = Math.max(ctr.from, e);
    }
    if (lastGap) {
      const e = s.baseSpan.to - lastGap;
      free.push({ from: e, to: s.baseSpan.to, side: "right" });
      wt.to = Math.min(wt.to, e);
      sp.to = Math.min(sp.to, e);
      ctr.to = Math.min(ctr.to, e);
    }
    const worktop = wt.to - wt.from > 1 ? wt : null;
    const endOf = (e: EndKind): "corner" | "wall" | "open" => (e === "cornerUnit" || e === "cornerEdge" ? "corner" : e);
    builds.push({
      wall: s.wall,
      length: s.length,
      kitchen: s.kitchen,
      free,
      ends: { left: endOf(ctx.ends[runEnd(s.wall, "left")]), right: endOf(ctx.ends[runEnd(s.wall, "right")]) },
      baseItems,
      upperItems,
      talls: s.talls,
      worktop,
      backsplash: worktop ? backsplashOf(s.wall, sp, upperBottom, win, ctx.heights.worktop) : [],
      counter: ctr.to - ctr.from > 1 ? ctr : null,
      openLeft: s.openLeft,
      openRight: s.openRight,
    });
    lists.push({
      id: s.wall,
      zone: "base",
      run: s.wall,
      explicit: Boolean(baseList),
      entries: [],
      dropped: baseCut.get(s.wall) ?? [],
      capacity: innerLength(s.baseSpan),
      used: 0,
    });
    const ui = upperInfo.get(s.wall);
    lists.push({
      id: `${s.wall}:u` as ListId,
      zone: "upper",
      run: s.wall,
      explicit: Boolean(upperList),
      entries: [],
      dropped: upperCut.get(s.wall) ?? [],
      capacity: ui ? [...ui.left, ...ui.right].reduce((a, b) => a + Math.max(0, b), 0) : 0,
      used: 0,
      segments: ui,
    });
  });

  // ---- slots & pieces
  const slots: PlanSlot[] = [];
  const pieces: PlanPiece[] = [];
  let sinkId: string | null = null;
  let hobId: string | null = null;
  const corner = (id: CornerId, zone: "base" | "upper") => cfg.corners?.[id] ?? defaultCornerType(zone);

  for (const b of builds) {
    let bi = 0;
    const baseExplicit = Boolean(cfg.runs?.[b.wall]);
    let autoIdx = 0;
    for (const { x, item } of b.baseItems) {
      if (item.kind === "corner") {
        const id = `${b.wall}-base-${bi++}`;
        const cid: CornerId = item.side === "left" ? "base-l" : "base-r";
        const sl = mkSlot(id, "base", b.wall, x, item.width, "kutni", true, item.side);
        setCorner(sl, cid, corner(cid, "base"));
        slots.push(sl);
      } else if (item.kind === "module") {
        const id = `${b.wall}-base-${bi++}`;
        const sl = mkSlot(id, "base", b.wall, x, item.width, item.type, false);
        sl.list = { id: b.wall, index: baseExplicit ? (item.src ?? autoIdx) : autoIdx };
        autoIdx++;
        if (baseExplicit) sl.defaultType = sl.type;
        slots.push(sl);
        if (item.feature === "sudoper" && !sinkId) sinkId = id;
        if (item.feature === "ploca" && !hobId) hobId = id;
      } else if (item.kind === "filler" || item.kind === "panel") {
        pieces.push({ kind: item.kind, zone: "base", run: b.wall, x, width: item.width });
      }
    }
    let ui = 0;
    const upperExplicit = Boolean(cfg.upperRuns?.[b.wall]);
    let upIdx = 0;
    for (const { x, item } of b.upperItems) {
      if (item.kind === "corner") {
        const cid: CornerId = item.side === "left" ? "upper-l" : "upper-r";
        const sl = mkSlot(`${b.wall}-upper-${ui++}`, "upper", b.wall, x, item.width, "vrata", true, item.side);
        setCorner(sl, cid, corner(cid, "upper"));
        slots.push(sl);
      } else if (item.kind === "module") {
        const sl = mkSlot(`${b.wall}-upper-${ui++}`, "upper", b.wall, x, item.width, item.type, false);
        sl.list = { id: `${b.wall}:u` as ListId, index: upperExplicit ? (item.src ?? upIdx) : upIdx };
        upIdx++;
        if (item.anchored) sl.anchored = true;
        if (upperExplicit) sl.defaultType = sl.type;
        slots.push(sl);
      } else if (item.kind === "filler" || item.kind === "panel") {
        pieces.push({ kind: item.kind, zone: "upper", run: b.wall, x, width: item.width });
      }
    }
    for (const { place, range } of b.talls) {
      const t0 = range.from;
      const right = place.side === "right";
      // the main column without an edited list: oven + fridge, the fridge at the open end
      const units: CabinetSpec[] =
        place.units ??
        (right
          ? [
              { type: "pecnica", width: DIM.tallWidth },
              { type: "hladnjak", width: DIM.tallWidth },
            ]
          : [
              { type: "hladnjak", width: DIM.tallWidth },
              { type: "pecnica", width: DIM.tallWidth },
            ]);
      // slot ids: "tall-0" … for the main column (every older link), "tall-bl-0" … for a tallRuns column at "b-left"
      const prefix = place.list === "tall" ? "tall-" : `tall-${place.wall}${place.side[0]}-`;
      pieces.push({ kind: "panel", zone: "tall", run: b.wall, x: t0, width: DIM.panel });
      let tx = t0 + DIM.panel;
      units.forEach((u, i) => {
        const sl = mkSlot(`${prefix}${i}`, "tall", b.wall, tx, u.width, u.type, false);
        sl.list = { id: place.list, index: i };
        if (place.list !== "tall" || cfg.tallRun) sl.defaultType = sl.type;
        slots.push(sl);
        tx += u.width;
      });
      pieces.push({ kind: "panel", zone: "tall", run: b.wall, x: tx, width: DIM.panel });
      lists.push({
        id: place.list,
        zone: "tall",
        run: b.wall,
        explicit: place.list !== "tall" || Boolean(cfg.tallRun),
        entries: [],
        dropped: [],
        capacity: tx - t0 - DIM.panel,
        used: 0,
      });
    }
  }
  // tallRuns columns that do not fit where they are asked to stand: left out, with a note (their list keeps them)
  for (const l of ctx.lostTall) {
    warnings.push(`${runLabel(l.list)} ne stane uz ove mjere — izostavljen je.`);
    lists.push({ id: l.list, zone: "tall", run: l.wall, explicit: true, entries: [], dropped: [...l.units], capacity: 0, used: 0 });
  }

  // ---- accent: one open oak niche at the open end of the uppers (the planner's own wall units only)
  {
    const accentRun: WallId = layout === "L" || layout === "U" || layout === "G" ? "b" : "a";
    if (!cfg.upperRuns?.[accentRun]) {
      const ups = slots.filter((s) => s.zone === "upper" && s.run === accentRun && !s.corner && s.defaultType !== "napa");
      const first = ups[0];
      const enough = slots.filter((s) => s.zone === "upper").length >= 3;
      if (first && first.width <= 60 && enough) {
        first.defaultType = "nisa";
        first.type = "nisa";
      }
    }
  }

  // ---- island / peninsula (planned once per config in planCtx: planIsland)
  let island: IslandPlan | null = null;
  if (ctx.island) {
    const I = ctx.island;
    warnings.push(...I.warnings);
    for (const f of I.fillers.slice(0, 1)) pieces.push({ kind: "filler", zone: "base", run: "isl", x: f.from, width: f.to - f.from });
    I.cabinets.forEach((c, i) => {
      const sl = mkSlot(`isl-${i}`, "island", "isl", c.x, c.width, c.type, false);
      sl.list = { id: "isl", index: c.index };
      if (I.list.explicit) sl.defaultType = sl.type;
      slots.push(sl);
      if (c.feature === "sudoper" && !sinkId) sinkId = sl.id;
      if (c.feature === "ploca" && !hobId) hobId = sl.id;
    });
    for (const f of I.fillers.slice(1)) pieces.push({ kind: "filler", zone: "base", run: "isl", x: f.from, width: f.to - f.from });
    lists.push({ ...I.list, entries: [], dropped: [...I.list.dropped] });
    island = { ...I.plan, hood: islandHood(cfg, ctx.heights, slots) };
  }

  // ---- list entries (what stands there, in list order)
  for (const l of lists) {
    const own = slots.filter((s) => s.list?.id === l.id).sort((p, q) => (p.list?.index ?? 0) - (q.list?.index ?? 0));
    // a slot's index is its place in `entries`, not in the stored list: entries an edited list had to leave out
    // (`dropped`) have no slot, and edit.ts edits the materialized list (= entries) by this index
    own.forEach((s, i) => {
      if (s.list) s.list.index = i;
    });
    if (l.segments && l.segments.hoodAt !== null) {
      const h = own.findIndex((s) => s.anchored);
      l.segments.hoodAt = h >= 0 ? h : null;
    }
    l.entries = own.map((s) => ({ type: s.type, width: s.width }));
    l.used = own.reduce((sum, s) => sum + s.width, 0);
  }

  const runs: RunPlan[] = builds.map((b) => {
    const ups = slots
      .filter((s) => s.zone === "upper" && s.run === b.wall && !moduleDef("upper", s.type)?.spacer)
      .map((s) => ({ from: s.x, to: s.x + s.width }))
      .concat(pieces.filter((p) => p.zone === "upper" && p.run === b.wall && p.kind === "filler").map((p) => ({ from: p.x, to: p.x + p.width })))
      .sort((p, q) => p.from - q.from);
    const merged: Range[] = [];
    for (const r of ups) {
      const last = merged[merged.length - 1];
      if (last && r.from - last.to < 1.5) last.to = Math.max(last.to, r.to);
      else merged.push({ ...r });
    }
    const main = b.talls.find((t) => t.place.list === "tall") ?? b.talls[0];
    // bare wall the wall units leave free (not the window, not narrower than the narrowest wall unit)
    const wr = winRange(b.wall);
    const its = b.upperItems;
    const upperFree = its
      .map(({ x, item }, i) => {
        if (item.kind !== "gap" || item.width < GAP_MIN - 0.01) return null;
        const to = x + item.width;
        if (wr && x >= wr.from - 0.5 && to <= wr.to + 0.5) return null;
        // beside an end panel (the rest of a stretch with wall units in it) a new unit takes the gap's whole width and
        // the panel moves along; a stretch with no wall unit in it needs its own end panels
        const prev = its[i - 1];
        const next = its[i + 1];
        const panel =
          (prev && prev.item.kind === "panel" && Math.abs(prev.x + prev.item.width - x) < 0.5) || (next && next.item.kind === "panel" && Math.abs(next.x - to) < 0.5);
        return { from: x, to, room: item.width - (panel ? 0 : 2 * DIM.panel) };
      })
      .filter((r): r is Range & { room: number } => Boolean(r) && (r as { room: number }).room >= GAP_MIN - 0.01);
    const freeL = b.free.find((f) => f.side === "left");
    const freeR = b.free.find((f) => f.side === "right");
    const cab: Range = { from: freeL ? freeL.to : b.kitchen.from, to: freeR ? freeR.from : b.kitchen.to };
    return {
      wall: b.wall,
      length: b.length,
      kitchen: b.kitchen,
      free: b.free,
      cabinets: cab.to - cab.from >= 1 ? cab : null,
      upperFree,
      ends: b.ends,
      worktop: b.worktop,
      backsplash: b.backsplash,
      uppers: merged,
      counter: b.counter && b.counter.to - b.counter.from > 1 ? b.counter : null,
      tall: main ? main.range : null,
      talls: b.talls.map((t) => t.range),
      openLeft: b.openLeft,
      openRight: b.openRight,
    };
  });

  // a wide free stretch in an edited run is worth a note (a cabinet would fit there): bare floor at an open end,
  // or room under the worktop between cabinets that stand against something
  for (const b of builds) {
    if (!cfg.runs?.[b.wall]) continue;
    const floor = b.free.reduce((n, r) => n + r.to - r.from, 0);
    let gx = 0;
    for (const { item } of b.baseItems) if (item.kind === "gap") gx += item.width;
    if (floor >= FREE_MIN) warnings.push(`${runLabel(b.wall)}: ${Math.round(floor)} cm uz zid ostaje slobodno, bez elemenata i radne ploče.`);
    if (gx - floor >= FREE_MIN) warnings.push(`${runLabel(b.wall)}: ${Math.round(gx - floor)} cm ispod radne ploče ostaje bez elementa.`);
  }

  // ---- "do stropa": cornice strips along everything that reaches the line (wall units with their top row, the column)
  const heights: HeightPlan = { ...ctx.heights, cornices: [] };
  if (heights.cornice) {
    for (const b of builds) {
      const ups = slots
        .filter((s) => s.zone === "upper" && s.run === b.wall && hasTopBox(s.type))
        .map((s) => ({ from: s.x, to: s.x + s.width }))
        .concat(pieces.filter((p) => p.zone === "upper" && p.run === b.wall && p.kind === "filler").map((p) => ({ from: p.x, to: p.x + p.width })))
        .sort((p, q) => p.from - q.from);
      const merged: Range[] = [];
      for (const r of ups) {
        const last = merged[merged.length - 1];
        if (last && r.from - last.to < 1.5) last.to = Math.max(last.to, r.to);
        else merged.push({ ...r });
      }
      for (const r of merged) heights.cornices.push({ run: b.wall, zone: "upper", from: r.from, to: r.to });
      for (const t of b.talls) heights.cornices.push({ run: b.wall, zone: "tall", from: t.range.from, to: t.range.to });
    }
  }

  return {
    cfg,
    walls,
    ceiling: cfg.ceiling,
    upperBottom,
    upperTop,
    heights,
    window: win,
    runs,
    island,
    slots,
    pieces,
    lists,
    sinkId,
    hobId,
    warnings,
  };
}

function setCorner(sl: PlanSlot, cid: CornerId, type: string): void {
  sl.cornerId = cid;
  sl.defaultType = sl.type;
  if (sl.options.includes(type)) sl.type = type;
}

/**
 * Stone backsplash between the worktop and the wall units, in the worktop material, around a window
 * (under a window that sits above the worktop it only reaches the sill). B and C reach into the corner,
 * up to the face of wall A's backsplash. The engine draws exactly these pieces and price.ts prices them.
 */
function backsplashOf(wall: WallId, range: Range, upperBottom: number, win: WindowPlan | null, surface: number): BacksplashPiece[] {
  const { from, to } = range;
  const out: BacksplashPiece[] = [];
  if (win && win.wall === wall && win.sill < upperBottom) {
    const wo = win.offset;
    const we = win.offset + win.width;
    if (wo > from) out.push({ from, to: Math.min(wo, to), top: upperBottom });
    if (we < to) out.push({ from: Math.max(we, from), to, top: upperBottom });
    const sillTop = win.sill - (win.ledge ? DIM.sillLedgeDrop : 0);
    if (sillTop > surface + 2) out.push({ from: Math.max(wo, from), to: Math.min(we, to), top: Math.min(sillTop, upperBottom) });
  } else {
    out.push({ from, to, top: upperBottom });
  }
  return out.filter((p) => p.to - p.from > 0.5 && p.top > surface + 0.5);
}

function mkSlot(
  id: string,
  zone: SlotZone,
  run: RunId,
  x: number,
  width: number,
  type: string,
  corner: boolean,
  side?: "left" | "right",
): PlanSlot {
  const options = slotOptions(zone, width, corner);
  const t = options.includes(type) ? type : (options[0] ?? type);
  return { id, zone, run, x, width, defaultType: t, type: t, options, ...(corner && side ? { corner: side } : {}) };
}

// ---------------------------------------------------------------- gaps: where the studio shows a "+"

/**
 * An empty place in the kitchen where something can be added (the studio's "+" buttons; lib/studio/edit.ts
 * gapOptions / insertAtGap act on it by `id`). Run-local cm (the island: its run frame).
 *
 *   free    an empty-space element of a list ("Slobodno mjesto" / "Bez gornjeg elementa"): something can take its place
 *   end     a free end of a wall's kitchen run (not a corner): bare floor the run leaves free there (`floor`) and / or
 *           bare wall beyond the kitchen it can grow into (`outside`, "produži kuhinju") — base cabinets go to that end
 *           of the base run, a tall unit to the tall column standing there (`tallList`) or into a new one
 *   upper   bare wall in the wall-unit row: between wall units, beside the window (RunPlan.upperFree; no `side`), or — with
 *           `side` — at a free end of the row (no tall column there): the bare wall from the last wall unit to the end
 *           of the kitchen (over bare floor, at the open end of an edited list: `floor`) and beyond it (`outside`, up to
 *           the window / the room's end / DIM.cornerClear before a corner the neighbour reaches). A wall unit added at
 *           an end goes to that end of the wall-unit list; the kitchen grows into the bare wall when it has to (its
 *           base cabinets stay as they are: bare floor under the new wall unit)
 *   island  an end of the island / peninsula: room left in it and / or what it can still grow (not the end at wall A)
 *   seam    a full row (a wall's base or wall-unit list with no other "+": the owner, "nema na zidu plus da dodam novi
 *           element"): one joint between two elements standing side by side (one per row — the one with most room) — a
 *           new element goes in between and one of the two (`between`) gets narrower to make room for it, as "+ lijevo /
 *           + desno" on a full row do. `split` is the width the picker starts with (half of the wider one, at most what
 *           fits)
 *
 * `at` is on the wall (z = 1 cm) for every wall gap: wall units at mid wall-unit height, the end of a base run at mid
 * base-cabinet height right beside the cabinets (where a 60 cm cabinet would go); empty space under the worktop and
 * the island ends in the middle of the cabinet's depth; a seam on the fronts, at mid height of its row.
 */
export interface PlanGap {
  id: string;
  kind: "free" | "end" | "upper" | "island" | "seam";
  run: RunId;
  zone: "base" | "upper" | "island";
  /** what a "+" here adds, for the UI: "Gornji element", "Donji element", "Donji ili visoki element", "Element otoka" … */
  label: string;
  side?: "left" | "right";
  /** the empty stretch the "+" stands for (end gaps: the bare floor and the usable bare wall beyond the kitchen) */
  from: number;
  to: number;
  /** the widest element that can go here (cm), counting the room the run can grow into */
  maxWidth: number;
  /** where the "+" goes: x along the run, y above the floor, z from the wall (cm) */
  at: { x: number; y: number; z: number };
  /** the list an insert edits and where in it (an index into PlanList.entries) */
  list: ListId;
  index: number;
  /** free: the empty-space element standing there */
  slotId?: string;
  /** end / island / upper with `side`: cm free inside the run at that end, and cm the run can grow by */
  floor?: number;
  outside?: number;
  /** end: the tall column standing at this end (a tall unit added here joins it at its outer side) */
  tallList?: ListId;
  /** upper: a hob stands below this stretch without a hood above it (a hood element may go here) */
  hob?: boolean;
  /** seam: the two elements (slot ids, left then right) the new one goes between — one of them gets narrower */
  between?: [string, string];
  /** seam: the width the picker preselects (cm) */
  split?: number;
}

/** the UI's short name of what a gap adds */
export const GAP_LABEL = {
  upper: "Gornji element",
  base: "Donji element",
  baseOrTall: "Donji ili visoki element",
  tall: "Visoki element",
  island: "Element otoka",
  peninsula: "Element poluotoka",
} as const;

/** the narrowest element that can go anywhere (an izvlačni stalak za boce) */
export const GAP_MIN = 15;

const gapCache = new WeakMap<KitchenPlan, PlanGap[]>();

/** whether something can be put into a gap — lib/studio/edit.ts registers it (it plans the insert, as gapOptions does) */
let gapCheck: ((plan: KitchenPlan, gap: PlanGap) => boolean) | null = null;
/** lib/studio/edit.ts: planGaps then lists only gaps that offer at least one element */
export function registerGapCheck(fn: (plan: KitchenPlan, gap: PlanGap) => boolean): void {
  gapCheck = fn;
}

/**
 * Every place in this plan where a "+" can add something (PlanGap), memoised per plan. The room the run can grow into
 * stops DIM.cornerClear before a corner the neighbouring run reaches, and at the room's end of the wall. With
 * lib/studio/edit.ts loaded (the studio, the tests) only places where at least one element fits are listed — each is
 * checked by planning its narrowest insert (~0.2 ms a gap, once per plan); the geometry alone is a few µs.
 */
export function planGaps(plan: KitchenPlan): PlanGap[] {
  const hit = gapCache.get(plan);
  if (hit) return hit;
  const out: PlanGap[] = [];
  const H = plan.heights;
  const baseY = (H.plinth + H.worktop - DIM.worktopT) / 2;
  const upY = (H.upperBottom + H.upperTop) / 2;
  /** wall gaps stand on the wall's face (run-local z, cm) */
  const ON_WALL = 1;
  /**
   * bare wall between wall units (and an empty wall-unit space): the "+" sits in the opening between their fronts — on
   * the wall it would look as if it were on the neighbouring cabinet whenever the view is not straight at the wall
   */
  const IN_ROW = DIM.upperDepth - 2;
  const listOfId = (id: ListId) => plan.lists.find((l) => l.id === id);
  const room = (l: PlanList | undefined) => (l ? Math.max(0, l.capacity - l.used) : 0);
  const islandLabel = plan.island?.kind === "poluotok" ? GAP_LABEL.peninsula : GAP_LABEL.island;
  // a hob whose centre lies under a stretch of wall with no hood above it: a hood element may go there
  const hobFree = (run: RunId, from: number, to: number) =>
    run !== "isl" &&
    plan.slots.some((h) => {
      if (h.run !== run || h.zone !== "base" || moduleDef("base", h.type)?.feature !== "hob") return false;
      const c = h.x + h.width / 2;
      if (c < from - 0.5 || c > to + 0.5) return false;
      return !plan.slots.some((u) => u.run === run && u.zone === "upper" && moduleDef("upper", u.type)?.hood && u.x <= c && u.x + u.width >= c);
    });

  // ---- empty-space elements
  for (const s of plan.slots) {
    if (!s.list || s.corner || s.zone === "tall") continue;
    const def = moduleDef(s.zone === "island" ? "base" : s.zone, s.type);
    if (!def?.spacer || s.width < GAP_MIN - 0.01) continue;
    const zone = s.zone === "island" ? "island" : s.zone;
    out.push({
      id: `free:${s.id}`,
      kind: "free",
      run: s.run,
      zone,
      label: zone === "upper" ? GAP_LABEL.upper : zone === "island" ? islandLabel : GAP_LABEL.base,
      from: s.x,
      to: s.x + s.width,
      maxWidth: Math.floor(s.width + (zone === "upper" ? 0 : room(listOfId(s.list.id))) + 1e-6),
      at: { x: s.x + s.width / 2, y: zone === "upper" ? upY : baseY, z: zone === "upper" ? IN_ROW : DIM.baseDepth / 2 },
      list: s.list.id,
      index: s.list.index,
      slotId: s.id,
      ...(zone === "upper" && hobFree(s.run, s.x, s.x + s.width) ? { hob: true } : {}),
    });
  }

  // ---- free ends of the wall runs
  const neighbour: Partial<Record<RunEnd, RunEnd>> =
    plan.cfg.layout === "U"
      ? { "a-left": "b-right", "b-right": "a-left", "a-right": "c-left", "c-left": "a-right" }
      : plan.cfg.layout === "L" || plan.cfg.layout === "G"
        ? { "a-left": "b-right", "b-right": "a-left" }
        : {};
  const runOf = (w: WallId) => plan.runs.find((r) => r.wall === w);
  /** bare wall beyond the kitchen at an end that it may grow into (cm) */
  const outsideOf = (r: RunPlan, side: "left" | "right") => {
    const k = r.kitchen;
    let outside = side === "left" ? k.from : r.length - k.to;
    // the neighbouring run reaches (or nearly reaches) this corner: stay clear of its cabinets
    const nb = neighbour[runEnd(r.wall, side)];
    if (nb && outside > 0) {
      const { wall: nw, side: ns } = parseRunEnd(nb);
      const n = runOf(nw);
      const d = n ? (ns === "left" ? n.kitchen.from : n.length - n.kitchen.to) : Infinity;
      if (d < DIM.cornerClear) outside = Math.max(0, outside - DIM.cornerClear);
    }
    return outside;
  };
  const W = plan.window;
  for (const r of plan.runs) {
    const baseList = listOfId(r.wall);
    const k = r.kitchen;
    for (const side of ["left", "right"] as const) {
      if (r.ends[side] === "corner") continue;
      const floorR = r.free.find((f) => f.side === side) ?? null;
      const floor = floorR ? floorR.to - floorR.from : 0;
      const outside = outsideOf(r, side);
      const maxWidth = Math.floor(floor + outside + 1e-6);
      if (maxWidth < GAP_MIN) continue;
      const tallRange = r.talls.find((t) => (side === "left" ? Math.abs(t.from - k.from) < 0.5 : Math.abs(t.to - k.to) < 0.5));
      const tall = tallRange ? plan.slots.find((sl) => sl.zone === "tall" && sl.run === r.wall && sl.x >= tallRange.from - 0.5 && sl.x < tallRange.to) : undefined;
      const from = side === "left" ? k.from - outside : floorR ? floorR.from : k.to;
      const to = side === "left" ? (floorR ? floorR.to : k.from) : k.to + outside;
      // right beside the cabinets, where a 60 cm cabinet would stand
      const ax = side === "left" ? to - Math.min(60, to - from) / 2 : from + Math.min(60, to - from) / 2;
      const tallOk = Boolean(tallRange && tall?.list) || maxWidth >= 30 + 2 * DIM.panel;
      out.push({
        id: `end:${r.wall}-${side}`,
        kind: "end",
        run: r.wall,
        zone: "base",
        label: tallOk ? GAP_LABEL.baseOrTall : GAP_LABEL.base,
        side,
        from,
        to,
        maxWidth,
        at: { x: ax, y: baseY, z: ON_WALL },
        list: r.wall,
        index: side === "left" ? 0 : (baseList?.entries.length ?? 0),
        floor,
        outside,
        ...(tallRange && tall?.list ? { tallList: tall.list.id } : {}),
      });
    }

    // ---- the wall-unit row: its free ends (over bare floor, beyond the kitchen), then bare wall inside it
    const upId = `${r.wall}:u` as ListId;
    const upList = listOfId(upId);
    const row: Range[] = [
      ...plan.slots.filter((s) => s.run === r.wall && s.zone === "upper").map((s) => ({ from: s.x, to: s.x + s.width })),
      ...plan.pieces.filter((p) => p.run === r.wall && p.zone === "upper").map((p) => ({ from: p.x, to: p.x + p.width })),
    ];
    const wr: Range | null = W && W.wall === r.wall ? { from: W.offset - DIM.windowMargin, to: W.offset + W.width + DIM.windowMargin } : null;
    /** bare wall the end gaps took (not listed again as bare wall inside the row) */
    const taken: Range[] = [];
    for (const side of ["left", "right"] as const) {
      if (r.ends[side] === "corner") continue;
      if (r.talls.some((t) => (side === "left" ? Math.abs(t.from - k.from) < 0.5 : Math.abs(t.to - k.to) < 0.5))) continue;
      if ((upList?.entries.length ?? 0) >= MAX_LIST) continue;
      // the row's outer edge: its last wall unit / panel. A row without wall units (a new unit goes to the end of the
      // list, which flows from the left) takes one only at its left end, over the bare floor beside the cabinets.
      let edge: number;
      if (row.length) edge = side === "left" ? Math.min(...row.map((x) => x.from)) : Math.max(...row.map((x) => x.to));
      else if (side === "left" && !upList?.explicit && r.cabinets) edge = r.cabinets.from;
      else continue;
      const outside = outsideOf(r, side);
      const dir = side === "left" ? -1 : 1;
      const kEnd = side === "left" ? k.from : k.to;
      let S = edge;
      let E = kEnd + dir * outside;
      let afterWindow = false;
      if (wr) {
        const lo = Math.min(S, E);
        const hi = Math.max(S, E);
        if (wr.to > lo && wr.from < hi) {
          // the window right at the row's edge: the free stretch starts beyond it; further out it ends the stretch —
          // inside the kitchen that is bare wall between wall units and the window (listed below), not the row's end
          const near = side === "left" ? wr.to >= S - 0.5 : wr.from <= S + 0.5;
          if (near) {
            S = side === "left" ? wr.from : wr.to;
            afterWindow = true;
          } else if (side === "left" ? wr.to > kEnd + 0.5 : wr.from < kEnd - 0.5) continue;
          else E = side === "left" ? Math.max(E, wr.to) : Math.min(E, wr.from);
        }
      }
      const width = dir * (E - S);
      // a new stretch beyond the window gets an end panel on each side; at the row's edge the end panel there moves
      // out with the new unit (no panel there — a hood at the end of the row — and the new unit needs one)
      const panelAtEdge = plan.pieces.some(
        (p) => p.run === r.wall && p.zone === "upper" && p.kind === "panel" && Math.abs((side === "left" ? p.x : p.x + p.width) - edge) < 0.5,
      );
      const maxW = Math.floor(width - (afterWindow ? 2 * DIM.panel : panelAtEdge ? 0 : DIM.panel) + 1e-6);
      if (maxW < GAP_MIN) continue;
      const inner = Math.max(0, dir * (kEnd - S));
      const from = Math.min(S, E);
      const to = Math.max(S, E);
      taken.push({ from, to });
      out.push({
        id: `upend:${r.wall}-${side}`,
        kind: "upper",
        run: r.wall,
        zone: "upper",
        label: GAP_LABEL.upper,
        side,
        from,
        to,
        maxWidth: maxW,
        at: { x: S + (dir * Math.min(60, width)) / 2, y: upY, z: ON_WALL },
        list: upId,
        index: side === "left" ? 0 : (upList?.entries.length ?? 0),
        floor: Math.min(inner, width),
        outside: Math.max(0, width - inner),
      });
    }
    for (const u of r.upperFree) {
      if (taken.some((t) => u.from >= t.from - 0.5 && u.to <= t.to + 0.5)) continue;
      const before = plan.slots.filter((sl) => sl.list?.id === upId && sl.x < u.from).length;
      out.push({
        id: `up:${r.wall}:${Math.round(u.from)}`,
        kind: "upper",
        run: r.wall,
        zone: "upper",
        label: GAP_LABEL.upper,
        from: u.from,
        to: u.to,
        maxWidth: Math.floor(u.room + 1e-6),
        at: { x: (u.from + u.to) / 2, y: upY, z: IN_ROW },
        list: upId,
        index: Math.min(before, upList?.entries.length ?? before),
        ...(hobFree(r.wall, u.from, u.to) ? { hob: true } : {}),
      });
    }
  }

  // ---- the island / peninsula ends
  const I = plan.island;
  if (I) {
    const isl = plan.slots.filter((sl) => sl.zone === "island").sort((p, q) => p.x - q.x);
    const lim = limitsFor(plan.cfg.layout).island;
    const grow = Math.max(0, (plan.cfg.layout === "otok" ? islandMax(plan.cfg.layout, plan.cfg.walls.a) : lim[1]) - I.length);
    const wallEnd = I.side === "right" ? "left" : I.side === "left" ? "right" : null;
    const entries = listOfId("isl")?.entries.length ?? isl.length;
    for (const side of ["left", "right"] as const) {
      if (side === wallEnd) continue;
      const first = isl[0];
      const last = isl[isl.length - 1];
      const inner = !isl.length ? I.body.to - I.body.from : side === "left" ? first.x - I.body.from : I.body.to - (last.x + last.width);
      const floor = Math.max(0, inner);
      const maxWidth = Math.floor(floor + grow + 1e-6);
      if (maxWidth < GAP_MIN) continue;
      const ax = floor >= GAP_MIN ? (side === "left" ? I.body.from + floor / 2 : I.body.to - floor / 2) : side === "left" ? -12 : I.length + 12;
      out.push({
        id: `isl:${side}`,
        kind: "island",
        run: "isl",
        zone: "island",
        label: islandLabel,
        side,
        from: side === "left" ? I.body.from : I.body.to - floor,
        to: side === "left" ? I.body.from + floor : I.body.to,
        maxWidth,
        at: { x: ax, y: baseY, z: DIM.baseDepth / 2 },
        list: "isl",
        index: side === "left" ? 0 : entries,
        floor,
        outside: grow,
      });
    }
  }
  // only places where something can actually go (lib/studio/edit.ts registers the check; without it: every place)
  const check = gapCheck;
  const res = check ? out.filter((g) => check(plan, g)) : out;

  // ---- full rows (no "+" of their own): one joint between two of their elements — one of the two gets narrower. One
  // per row, not one per joint (14 "+" on a U kitchen read as clutter): the joint with the most room (beside the widest
  // element that can give way), nearest the middle of the row on a tie. The first that passes the check (edit.ts
  // insertSeam follows the same rule; of 3,541 fuzzed joints the check turned none away)
  for (const r of plan.runs) {
    for (const id of [r.wall, `${r.wall}:u`] as ListId[]) {
      if (res.some((g) => g.list === id)) continue;
      const l = listOfId(id);
      if (!l || (l.zone !== "base" && l.zone !== "upper") || l.entries.length >= MAX_LIST) continue;
      const zone = l.zone;
      const seams: PlanGap[] = [];
      const row = plan.slots.filter((s) => s.list?.id === id).sort((p, q) => p.list!.index - q.list!.index);
      /** cm this element can give up (down to its narrowest width, never below SEAM_MIN) */
      const give = (s: PlanSlot) => {
        const d = s.corner || s.anchored ? null : seamDef(zone, s.type);
        const lo = d ? d.widths.filter((w) => w < s.width - 0.5 && w >= SEAM_MIN) : [];
        return lo.length ? s.width - Math.min(...lo) : 0;
      };
      // wall units: only what one of the two gives up (the row's free cm may lie beyond the window); base runs: + that
      const free = zone === "base" ? room(l) : 0;
      for (let i = 1; i < row.length; i++) {
        const a = row[i - 1];
        const b = row[i];
        if (b.list!.index !== a.list!.index + 1 || Math.abs(a.x + a.width - b.x) > 0.5) continue;
        const ga = give(a);
        const gb = give(b);
        const maxWidth = Math.floor(free + Math.max(ga, gb) + 1e-6);
        if (maxWidth < SEAM_MIN) continue;
        const wider = (ga > 0 ? a.width : 0) >= (gb > 0 ? b.width : 0) ? a : b;
        seams.push({
          id: `seam:${id}:${b.list!.index}`,
          kind: "seam",
          run: r.wall,
          zone,
          label: zone === "upper" ? GAP_LABEL.upper : GAP_LABEL.base,
          from: a.x,
          to: b.x + b.width,
          maxWidth,
          at: { x: b.x, y: zone === "upper" ? upY : baseY, z: (zone === "upper" ? DIM.upperDepth : DIM.baseDepth) + 0.5 },
          list: id,
          index: b.list!.index,
          between: [a.id, b.id],
          split: Math.min(maxWidth, Math.floor(wider.width / 2)),
        });
      }
      if (!seams.length) continue;
      const mid = (row[0].x + row[row.length - 1].x + row[row.length - 1].width) / 2;
      seams.sort((p, q) => q.maxWidth - p.maxWidth || Math.abs(p.at.x - mid) - Math.abs(q.at.x - mid));
      const best = check ? seams.find((g) => check(plan, g)) : seams[0];
      if (best) res.push(best);
    }
  }
  gapCache.set(plan, res);
  return res;
}

/**
 * a seam (full row) offers a "+" only when a real cabinet fits (cm) — not just a 15 cm niche — and the element that
 * makes room for it stays at least this wide (edit.ts insertSeam)
 */
export const SEAM_MIN = 30;

/** an element beside a seam that may get narrower for a new one: not a corner unit, a hood above the hob or empty space */
export function seamDef(zone: "base" | "upper", type: string): ModuleTypeDef | null {
  const d = moduleDef(zone, type);
  return d && !d.spacer && !d.corner && !d.hood ? d : null;
}
