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
  catalog,
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
  type BaseRunId,
  type CabinetSpec,
  type CornerId,
  type FinishSpec,
  type FrontZone,
  type HandleStyle,
  type KitchenConfig,
  type Layout,
  type RoomSpec,
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
  /** a window sill at least this far above the worktop gets an inside sill ledge */
  sillLedgeMin: 5,
  /** how far that ledge reaches below the sill (the backsplash under the window stops there) */
  sillLedgeDrop: 2.3,
} as const;

/** explicit lists: at most this many cabinets per run, this many tall units */
export const MAX_LIST = 30;
export const MAX_TALL = 3;
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

/** longest island the planner can centre on wall A (cm) */
export function islandMax(layout: Layout, wallA: number): number {
  const hi = limitsFor(layout).island[1];
  return layout === "otok" ? Math.min(hi, wallA + 2 * DIM.islandOverhangMax) : hi;
}

/**
 * Sane slider ranges per layout (cm). Values outside are clamped by sanitizeConfig, which also narrows the
 * window (width <= wall - DIM.windowWallClearance, sill <= windowTop - DIM.windowMinHeight) and the island
 * (islandMax) to what the planner can build.
 */
export function limitsFor(layout: Layout): Limits {
  const aMin = layout === "U" ? 240 : layout === "ravna" ? 150 : 180;
  return {
    a: [aMin, 800],
    b: [120, 600],
    c: [120, 600],
    ceiling: [210, 350],
    island: [120, 360],
    windowWidth: [40, 300],
    sill: [0, 200],
  };
}

export function wallsFor(layout: Layout): WallId[] {
  return layout === "L" ? ["a", "b"] : layout === "U" ? ["a", "b", "c"] : ["a"];
}

// ---------------------------------------------------------------- editable lists

/**
 * One editable cabinet list: the base run of a wall ("a" | "b" | "c"), the island ("isl"),
 * the wall units of a wall ("a:u" | "b:u" | "c:u") or the tall column ("tall").
 */
export type ListId = BaseRunId | "a:u" | "b:u" | "c:u" | "tall";
export const LIST_IDS: readonly ListId[] = ["a", "b", "c", "isl", "a:u", "b:u", "c:u", "tall"];
export type ListZone = "base" | "upper" | "tall" | "island";

export function listZone(id: ListId): ListZone {
  return id === "tall" ? "tall" : id === "isl" ? "island" : id.endsWith(":u") ? "upper" : "base";
}
/** the wall a list stands on (the island list: "isl"; the tall column: null — it moves with the layout) */
export function listRun(id: ListId): RunId | null {
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

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok"];
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

function cleanRoom(v: unknown): RoomSpec | undefined {
  if (!isObj(v)) return undefined;
  const out: RoomSpec = {};
  if (typeof v.wall === "string" && roomWallDef(v.wall) && v.wall !== FINISH_DEFAULTS.wall) out.wall = v.wall;
  if (typeof v.floor === "string" && roomFloorDef(v.floor) && v.floor !== FINISH_DEFAULTS.floor) out.floor = v.floor;
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
    cfg.layout === "otok" ? cfg.island : 0,
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
  /** top edge above the floor (cm); every piece starts on the worktop surface (DIM.worktopTop) */
  top: number;
}

export interface RunPlan {
  wall: WallId;
  /** wall length (cm) */
  length: number;
  /** worktop along this run; depth is DIM.worktopDepth from the wall */
  worktop: Range | null;
  /** backsplash in the worktop material, drawn by the engine and priced by price.ts */
  backsplash: BacksplashPiece[];
  /** contiguous wall-unit stretches (for the LED strip) */
  uppers: Range[];
  /** base cabinet stretch without the tall column (plinth LED) */
  counter: Range | null;
  tall: Range | null;
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

export interface IslandPlan {
  /** total length incl. waterfall sides */
  length: number;
  /** world x of the island centre, measured along wall A from its left end (cm) */
  centerX: number;
  /** distance from wall A to the back (seating side) of the island cabinets (cm) */
  backZ: number;
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
  upperBottom: number;
  upperTop: number;
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

/** "Zid A", "Otok", "Visoki stup" */
function runLabel(id: ListId): string {
  if (id === "tall") return "Visoki stup";
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

// ---------------------------------------------------------------- planKitchen

type CornerItem = { kind: "corner"; width: number; side: "left" | "right" };

interface RunBuild {
  wall: WallId;
  length: number;
  baseItems: { x: number; item: Item | CornerItem }[];
  upperItems: { x: number; item: Item | CornerItem }[];
  tall: Range | null;
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
  /** window opening on that wall incl. DIM.windowMargin, or null */
  winRange: (wall: WallId) => Range | null;
  /** width of the tall column incl. both cover panels (cm) */
  tallZone: number;
}

const overlaps = (r: Range, w: Range | null) => Boolean(w && r.from < w.to && r.to > w.from);

function planCtx(cfg: KitchenConfig): PlanCtx {
  const layout = cfg.layout;
  const walls = wallsFor(layout);
  const L = { a: cfg.walls.a, b: cfg.walls.b, c: cfg.walls.c };
  const upperTop = Math.min(DIM.upperTopMax, cfg.ceiling - 3);
  const upperBottom = Math.min(DIM.upperBottom, upperTop - 50);

  let win: WindowPlan | null = null;
  if (cfg.window && walls.includes(cfg.window.wall)) {
    const len = L[cfg.window.wall];
    // sanitizeConfig already keeps the window inside these ranges; repeated here so the plan never depends on it
    const width = Math.min(cfg.window.width, len - DIM.windowWallClearance);
    if (width >= 40) {
      const offset = clamp(cfg.window.offset, 0, len - width);
      const top = windowTop(cfg.ceiling);
      const sill = clamp(cfg.window.sill, 0, top - DIM.windowMinHeight);
      win = { wall: cfg.window.wall, offset, width, sill, top, ledge: sill >= DIM.worktopTop + DIM.sillLedgeMin };
    }
  }
  const winRange = (wall: WallId): Range | null =>
    win && win.wall === wall ? { from: win.offset - DIM.windowMargin, to: win.offset + win.width + DIM.windowMargin } : null;
  const tallZone = cfg.tallRun && cfg.tallRun.length ? cfg.tallRun.reduce((s, t) => s + t.width, 0) + 2 * DIM.panel : DIM.tallZone;
  return { cfg, layout, walls, L, upperTop, upperBottom, win, winRange, tallZone };
}

/** possible places for the tall column, best first (open end of the run, clear of the window) */
function tallCandidates(ctx: PlanCtx): TallAt[] {
  const out: TallAt[] = [];
  const tryAt = (wall: WallId, side: "left" | "right", minBefore: number) => {
    const len = ctx.L[wall];
    const r: Range = side === "right" ? { from: len - ctx.tallZone, to: len } : { from: 0, to: ctx.tallZone };
    if (len - ctx.tallZone < minBefore) return;
    if (overlaps(r, ctx.winRange(wall))) return;
    out.push({ wall, side });
  };
  if (ctx.layout === "U") tryAt("c", "right", DIM.baseDepth + 30);
  else if (ctx.layout === "L") tryAt("a", "right", DIM.cornerBase + 30);
  else {
    tryAt("a", "right", 64);
    tryAt("a", "left", 64);
  }
  return out;
}

/** how many of the two essentials (sink, hob) the wall runs have (the island does not count, as in v1) */
const essentials = (p: KitchenPlan) => {
  const has = (f: "sink" | "hob") => p.slots.some((s) => s.zone === "base" && moduleDef("base", s.type)?.feature === f);
  return (has("sink") ? 1 : 0) + (has("hob") ? 1 : 0);
};
/** cabinets of edited lists the plan had to leave out */
const cutCount = (p: KitchenPlan) =>
  p.lists.reduce((n, l) => n + l.dropped.filter((e) => !moduleDef(l.zone === "island" ? "base" : l.zone, e.type)?.spacer).length, 0);

/** The single source of truth for cabinet positions. */
export function planKitchen(input: KitchenConfig): KitchenPlan {
  return planCore(sanitizeConfig(input));
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
  // an edited kitchen without a sink or a hob: say so (the planner no longer adds them on its own)
  if (explicitWallBase(cfg, plan.walls)) {
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
  const warnings: string[] = [];
  const lists: PlanList[] = [];

  // ---- run skeletons (base spans, upper spans, corners)
  interface Skeleton {
    wall: WallId;
    length: number;
    cornerBaseLeft: boolean;
    cornerBaseRight: boolean;
    cornerUpperLeft: boolean;
    cornerUpperRight: boolean;
    baseSpan: Span;
    upperSpan: Span;
    worktop: Range;
    openLeft: boolean;
    openRight: boolean;
  }
  const sk: Skeleton[] = [];
  const tallRange = (wall: WallId): Range | null => {
    if (!tall || tall.wall !== wall) return null;
    const len = L[wall];
    return tall.side === "right" ? { from: len - ctx.tallZone, to: len } : { from: 0, to: ctx.tallZone };
  };

  if (layout === "ravna" || layout === "otok") {
    const A = L.a;
    const t = tallRange("a");
    const from = t && tall?.side === "left" ? t.to : 0;
    const to = t && tall?.side === "right" ? t.from : A;
    sk.push({
      wall: "a",
      length: A,
      cornerBaseLeft: false,
      cornerBaseRight: false,
      cornerUpperLeft: false,
      cornerUpperRight: false,
      baseSpan: { from, to, left: t && tall?.side === "left" ? "tall" : "open", right: t && tall?.side === "right" ? "tall" : "open" },
      upperSpan: { from, to, left: t && tall?.side === "left" ? "tall" : "open", right: t && tall?.side === "right" ? "tall" : "open" },
      worktop: { from, to },
      openLeft: true,
      openRight: true,
    });
  } else {
    const A = L.a;
    const U = layout === "U";
    const tA = tallRange("a");
    const aTo = tA ? tA.from : A;
    // A's blind corner wall units stand flush against the neighbouring wall over its last (B) / first (C)
    // DIM.upperDepth cm: a window there would be covered by the side of the cabinet. Then the corner unit is
    // left out and A's wall units keep that corner square free, like the uppers beside any window.
    const winAtB = overlaps({ from: L.b - DIM.upperDepth, to: L.b }, winRange("b"));
    const winAtC = U && overlaps({ from: 0, to: DIM.upperDepth }, winRange("c"));
    const cornerUpperLeft = !winAtB && !overlaps({ from: 0, to: DIM.cornerUpper }, winRange("a"));
    const cornerUpperRight = U && !winAtC && !overlaps({ from: A - DIM.cornerUpper, to: A }, winRange("a"));
    sk.push({
      wall: "a",
      length: A,
      cornerBaseLeft: true,
      cornerBaseRight: U,
      cornerUpperLeft,
      cornerUpperRight,
      baseSpan: { from: DIM.cornerBase, to: U ? A - DIM.cornerBase : aTo, left: "corner", right: U ? "corner" : tA ? "tall" : "open" },
      upperSpan: {
        from: cornerUpperLeft ? DIM.cornerUpper : winAtB ? DIM.upperDepth : 0,
        to: U ? (cornerUpperRight ? A - DIM.cornerUpper : winAtC ? A - DIM.upperDepth : A) : aTo,
        left: cornerUpperLeft ? "corner" : winAtB ? "window" : "wall",
        right: U ? (cornerUpperRight ? "corner" : winAtC ? "window" : "wall") : tA ? "tall" : "open",
      },
      worktop: { from: 0, to: U ? A : aTo },
      openLeft: false,
      openRight: !U,
    });
    const B = L.b;
    sk.push({
      wall: "b",
      length: B,
      cornerBaseLeft: false,
      cornerBaseRight: false,
      cornerUpperLeft: false,
      cornerUpperRight: false,
      baseSpan: { from: 0, to: B - DIM.baseDepth, left: "open", right: "corner" },
      upperSpan: { from: 0, to: B - DIM.upperDepth, left: "open", right: "corner" },
      worktop: { from: 0, to: B - DIM.worktopDepth },
      openLeft: true,
      openRight: false,
    });
    if (U) {
      const C = L.c;
      const tC = tallRange("c");
      const cTo = tC ? tC.from : C;
      sk.push({
        wall: "c",
        length: C,
        cornerBaseLeft: false,
        cornerBaseRight: false,
        cornerUpperLeft: false,
        cornerUpperRight: false,
        baseSpan: { from: DIM.baseDepth, to: cTo, left: "corner", right: tC ? "tall" : "open" },
        upperSpan: { from: DIM.upperDepth, to: cTo, left: "corner", right: tC ? "tall" : "open" },
        worktop: { from: DIM.worktopDepth, to: cTo },
        openLeft: false,
        openRight: true,
      });
    }
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
    if (layout === "L") {
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
    let chosen: { fills: BaseFillResult[]; score: number } | null = null;
    for (let i = 0; i < pairs.length; i++) {
      const [sw, hw] = pairs[i];
      const f = sk.map((s) => {
        const wanted: Feature[] = [];
        if (s.wall === sw) wanted.push("sudoper", "perilica");
        if (s.wall === hw) wanted.push("ploca");
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
      baseItems.push({ x: 0, item: { kind: "corner", width: DIM.cornerBase, side: "left" } });
    }
    x = s.baseSpan.from;
    for (const it of res.items) {
      baseItems.push({ x, item: it });
      x += it.width;
    }
    if (s.cornerBaseRight) baseItems.push({ x: s.length - DIM.cornerBase, item: { kind: "corner", width: DIM.cornerBase, side: "right" } });

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
    if (s.cornerUpperLeft) upperItems.push({ x: 0, item: { kind: "corner", width: DIM.cornerUpper, side: "left" } });
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
      for (const sg of flow.segs) segs.push({ from: sg.span.from, items: wrapExplicit(sg.span, sg.items) });
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
    if (s.cornerUpperRight) upperItems.push({ x: s.length - DIM.cornerUpper, item: { kind: "corner", width: DIM.cornerUpper, side: "right" } });

    const t = tallRange(s.wall);
    const worktop = s.worktop.to - s.worktop.from > 1 ? s.worktop : null;
    builds.push({
      wall: s.wall,
      length: s.length,
      baseItems,
      upperItems,
      tall: t,
      worktop,
      backsplash: worktop ? backsplashOf(s.wall, s.length, worktop, upperBottom, win) : [],
      counter: { from: s.cornerBaseLeft ? 0 : s.baseSpan.from, to: s.cornerBaseRight ? s.length : s.baseSpan.to },
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
    if (b.tall) {
      const t0 = b.tall.from;
      const right = tall?.side === "right";
      const units: CabinetSpec[] =
        cfg.tallRun && cfg.tallRun.length
          ? cfg.tallRun
          : right
            ? [
                { type: "pecnica", width: DIM.tallWidth },
                { type: "hladnjak", width: DIM.tallWidth },
              ]
            : [
                { type: "hladnjak", width: DIM.tallWidth },
                { type: "pecnica", width: DIM.tallWidth },
              ];
      pieces.push({ kind: "panel", zone: "tall", run: b.wall, x: t0, width: DIM.panel });
      let tx = t0 + DIM.panel;
      units.forEach((u, i) => {
        const sl = mkSlot(`tall-${i}`, "tall", b.wall, tx, u.width, u.type, false);
        sl.list = { id: "tall", index: i };
        if (cfg.tallRun) sl.defaultType = sl.type;
        slots.push(sl);
        tx += u.width;
      });
      pieces.push({ kind: "panel", zone: "tall", run: b.wall, x: tx, width: DIM.panel });
      lists.push({
        id: "tall",
        zone: "tall",
        run: b.wall,
        explicit: Boolean(cfg.tallRun),
        entries: [],
        dropped: [],
        capacity: tx - t0 - DIM.panel,
        used: 0,
      });
    }
  }

  // ---- accent: one open oak niche at the open end of the uppers (the planner's own wall units only)
  {
    const accentRun: WallId = layout === "L" || layout === "U" ? "b" : "a";
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

  // ---- island
  let island: IslandPlan | null = null;
  if (layout === "otok") {
    const len = cfg.island;
    const inner = len - 2 * DIM.islandWaterfall;
    let x = DIM.islandWaterfall;
    const isl = cfg.runs?.isl;
    if (isl) {
      // an edited island: its list, the remainder split into a filler at each end (wide remainder: free at the end)
      const { kept, cut } = trimToFit(listItems(isl, "island"), inner, "island");
      if (cut.length)
        warnings.push(
          ...cutWarning(
            "isl",
            cut.map((c) => isl[c.src ?? -1]).filter(Boolean),
            "island",
          ),
        );
      const used = kept.reduce((s, it) => s + it.width, 0);
      const rest = inner - used;
      const free = rest >= FREE_MIN;
      if (!free && rest >= 0.5) {
        pieces.push({ kind: "filler", zone: "base", run: "isl", x, width: rest / 2 });
        x += rest / 2;
      }
      kept.forEach((it, i) => {
        const sl = mkSlot(`isl-${i}`, "island", "isl", x, it.width, it.type, false);
        sl.list = { id: "isl", index: it.src ?? i };
        sl.defaultType = sl.type;
        slots.push(sl);
        if (it.feature === "sudoper" && !sinkId) sinkId = sl.id;
        if (it.feature === "ploca" && !hobId) hobId = sl.id;
        x += it.width;
      });
      if (!free && rest >= 0.5) pieces.push({ kind: "filler", zone: "base", run: "isl", x, width: rest / 2 });
      lists.push({
        id: "isl",
        zone: "island",
        run: "isl",
        explicit: true,
        entries: [],
        dropped: cut.map((c) => isl[c.src ?? -1]).filter(Boolean),
        capacity: inner,
        used,
      });
    } else {
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
        pieces.push({ kind: "filler", zone: "base", run: "isl", x, width: rest / 2 });
        x += rest / 2;
      }
      order.forEach((w, i) => {
        const type = w >= 80 ? "ladice" : i % 2 === 0 ? "ladice" : "vrata";
        const sl = mkSlot(`isl-${i}`, "island", "isl", x, w, type, false);
        sl.list = { id: "isl", index: i };
        slots.push(sl);
        x += w;
      });
      if (rest >= 0.5) pieces.push({ kind: "filler", zone: "base", run: "isl", x, width: rest / 2 });
      lists.push({ id: "isl", zone: "island", run: "isl", explicit: false, entries: [], dropped: [], capacity: inner, used });
    }
    // always centred on wall A (sanitizeConfig keeps it at most islandMax: wall A + 2 x DIM.islandOverhangMax);
    // a longer one from an old link would still overhang both ends equally
    island = { length: len, centerX: L.a / 2, backZ: DIM.baseDepth + DIM.aisle + DIM.baseDepth };
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
    return {
      wall: b.wall,
      length: b.length,
      worktop: b.worktop,
      backsplash: b.backsplash,
      uppers: merged,
      counter: b.counter && b.counter.to - b.counter.from > 1 ? b.counter : null,
      tall: b.tall,
      openLeft: b.openLeft,
      openRight: b.openRight,
    };
  });

  // a wide free stretch under an edited worktop is worth a note (a cabinet would fit there)
  for (const b of builds) {
    if (!cfg.runs?.[b.wall]) continue;
    let gx = 0;
    for (const { item } of b.baseItems) if (item.kind === "gap") gx += item.width;
    if (gx >= FREE_MIN) warnings.push(`${runLabel(b.wall)}: ${Math.round(gx)} cm ispod radne ploče ostaje bez elementa.`);
  }

  return {
    cfg,
    walls,
    ceiling: cfg.ceiling,
    upperBottom,
    upperTop,
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
function backsplashOf(wall: WallId, length: number, worktop: Range, upperBottom: number, win: WindowPlan | null): BacksplashPiece[] {
  const from = wall === "c" ? DIM.backsplashT : worktop.from;
  const to = wall === "b" ? length - DIM.backsplashT : worktop.to;
  const out: BacksplashPiece[] = [];
  if (win && win.wall === wall && win.sill < upperBottom) {
    const wo = win.offset;
    const we = win.offset + win.width;
    if (wo > from) out.push({ from, to: Math.min(wo, to), top: upperBottom });
    if (we < to) out.push({ from: Math.max(we, from), to, top: upperBottom });
    const sillTop = win.sill - (win.ledge ? DIM.sillLedgeDrop : 0);
    if (sillTop > DIM.worktopTop + 2) out.push({ from: Math.max(wo, from), to: Math.min(we, to), top: Math.min(sillTop, upperBottom) });
  } else {
    out.push({ from, to, top: upperBottom });
  }
  return out.filter((p) => p.to - p.from > 0.5 && p.top > DIM.worktopTop + 0.5);
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
