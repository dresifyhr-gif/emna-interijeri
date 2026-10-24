/**
 * Kitchen planner — turns a KitchenConfig into concrete cabinets, the way a
 * carpenter would: standard carcass widths (30/40/45/50/60/80/90 cm), a filler
 * panel for whatever is left, real blind-corner units, a tall column, a sink
 * with the dishwasher next to it, a hob kept away from the sink and a hood
 * above the hob. Sink and hob come first: they move to another wall when the
 * preferred one is too short, and the tall column is left out rather than
 * pushing either of them out of the kitchen.
 *
 * Pure TypeScript (no three.js, no DOM): the 3D engine, the price estimate and
 * the summary all use the same plan, so what the customer sees is what is
 * priced and what is sent to the owner.
 *
 * Units: centimetres. Every run has its own local x axis that goes from the
 * left end of its wall to the right end, as seen when standing in the room and
 * facing that wall.
 */

import { catalog, frontDef, handleDef, isModuleTypeId, topDef, type ModuleTypeDef } from "./catalog";
import {
  DEFAULT_CONFIG,
  type HandleStyle,
  type KitchenConfig,
  type Layout,
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
  /** two tall units + a cover panel on each side */
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

// ---------------------------------------------------------------- sanitize

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok"];
const HANDLES: HandleStyle[] = ["bez", "letvica", "gumb"];
const WALLS: WallId[] = ["a", "b", "c"];
export const MODULE_ID_RE = /^(?:[abc]-(?:base|upper)-\d{1,2}|tall-\d|isl-\d{1,2})$/;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
function num(v: unknown, fallback: number): number {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : fallback;
}
const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null;

/**
 * Make any input (UI state, decoded link, old saved config) a valid KitchenConfig:
 * unknown ids fall back to the defaults, lengths are rounded to whole cm and
 * clamped to `limitsFor(layout)` (window and island also to what the planner
 * can build, see limitsFor), invalid override entries are dropped.
 */
export function sanitizeConfig(input: unknown): KitchenConfig {
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

  return {
    v: 1,
    layout,
    walls,
    ceiling,
    window,
    front: typeof src.front === "string" && frontDef(src.front) ? src.front : d.front,
    top: typeof src.top === "string" && topDef(src.top) ? src.top : d.top,
    handles: HANDLES.includes(src.handles as HandleStyle) && handleDef(src.handles as string) ? (src.handles as HandleStyle) : d.handles,
    tall: typeof src.tall === "boolean" ? src.tall : d.tall,
    island: Math.round(clamp(num(src.island, d.island), lim.island[0], islandMax(layout, walls.a))),
    led: typeof src.led === "boolean" ? src.led : d.led,
    overrides,
  };
}

/** Everything that changes cabinet geometry. Equal keys => only materials / overrides differ. */
export function geometryKey(cfg: KitchenConfig): string {
  const walls = wallsFor(cfg.layout);
  const win = cfg.window && walls.includes(cfg.window.wall) ? cfg.window : null;
  return JSON.stringify([
    cfg.layout,
    walls.map((w) => cfg.walls[w]),
    cfg.ceiling,
    win ? [win.wall, win.offset, win.width, win.sill] : 0,
    cfg.tall,
    cfg.layout === "otok" ? cfg.island : 0,
  ]);
}

// ---------------------------------------------------------------- plan types

export type SlotZone = "base" | "upper" | "tall" | "island";
export type RunId = WallId | "isl";

export interface PlanSlot {
  /** stable id: "a-base-0", "b-upper-2", "tall-1", "isl-0" */
  id: string;
  zone: SlotZone;
  run: RunId;
  /** left edge along the run (cm, run-local) */
  x: number;
  width: number;
  defaultType: string;
  /** effective type after cfg.overrides */
  type: string;
  /** module type ids valid for this slot */
  options: string[];
  /** blind corner unit; the value is the side that is blind (towards the corner) */
  corner?: "left" | "right";
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
  /** where the planner put the sink / hob by default (slot ids); null when it could not fit one */
  sinkId: string | null;
  hobId: string | null;
  /** human-readable Croatian notes when something did not fit */
  warnings: string[];
}

// ---------------------------------------------------------------- options

function fits(m: ModuleTypeDef, width: number): boolean {
  if (width < m.minWidth - 0.01 || width > m.maxWidth + 0.01) return false;
  return !m.widths || m.widths.includes(Math.round(width));
}

/** module type ids valid for a slot */
export function slotOptions(zone: SlotZone, width: number, corner: boolean): string[] {
  const z = zone === "island" ? "base" : zone;
  return catalog.modules
    .filter((m) => {
      if (m.zone !== z) return false;
      if (zone === "island" && !m.island) return false;
      if (corner) return Boolean(m.corner || m.cornerOk);
      if (m.corner) return false;
      return fits(m, width);
    })
    .map((m) => m.id);
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
  | { kind: "module"; width: number; type: string; feature?: Feature }
  | { kind: "filler"; width: number }
  | { kind: "panel"; width: number }
  | { kind: "gap"; width: number };

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

/**
 * Wrap a module sequence with end panels and the remainder (filler or gap),
 * so the items exactly cover the span.
 */
function wrapSpan(span: Span, modules: Item[]): Item[] {
  const len = span.to - span.from;
  if (modules.length === 0) {
    const hard = (k: EdgeKind) => k === "wall" || k === "corner" || k === "tall";
    if (len < 0.5) return [];
    return hard(span.left) && hard(span.right) ? [{ kind: "filler", width: len }] : [{ kind: "gap", width: len }];
  }
  const panelL = span.left === "open" || span.left === "window";
  const panelR = span.right === "open" || span.right === "window";
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

function innerLength(span: Span): number {
  const panelL = span.left === "open" || span.left === "window";
  const panelR = span.right === "open" || span.right === "window";
  return span.to - span.from - (panelL ? DIM.panel : 0) - (panelR ? DIM.panel : 0);
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
  const panelL = span.left === "open" || span.left === "window" ? DIM.panel : 0;
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

// ---------------------------------------------------------------- planKitchen

interface RunBuild {
  wall: WallId;
  length: number;
  baseItems: { x: number; item: Item | { kind: "corner"; width: number; side: "left" | "right" } }[];
  upperItems: { x: number; item: Item | { kind: "corner"; width: number; side: "left" | "right" } }[];
  tall: Range | null;
  worktop: Range | null;
  backsplash: BacksplashPiece[];
  counter: Range | null;
  openLeft: boolean;
  openRight: boolean;
}

/** where the tall column stands: the open end of a run */
type TallAt = { wall: WallId; side: "left" | "right" };

const TALL_WARNING = "Visoki stup (hladnjak i pećnica) ne stane uz ove mjere — izostavljen je.";

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
  return { cfg, layout, walls, L, upperTop, upperBottom, win, winRange };
}

/** possible places for the tall column, best first (open end of the run, clear of the window) */
function tallCandidates(ctx: PlanCtx): TallAt[] {
  const out: TallAt[] = [];
  const tryAt = (wall: WallId, side: "left" | "right", minBefore: number) => {
    const len = ctx.L[wall];
    const r: Range = side === "right" ? { from: len - DIM.tallZone, to: len } : { from: 0, to: DIM.tallZone };
    if (len - DIM.tallZone < minBefore) return;
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

/** how many of the two essentials (sink, hob) a plan has */
const essentials = (p: KitchenPlan) => (p.sinkId ? 1 : 0) + (p.hobId ? 1 : 0);

/** The single source of truth for cabinet positions. */
export function planKitchen(input: KitchenConfig): KitchenPlan {
  const cfg = sanitizeConfig(input);
  const ctx = planCtx(cfg);

  let plan: KitchenPlan | null = null;
  if (cfg.tall) {
    // The column is an extra: it stays only where it leaves room for everything the kitchen would get
    // without it (sink and hob). Otherwise it is left out with the usual note.
    let without: KitchenPlan | null = null;
    for (const at of tallCandidates(ctx)) {
      const p = layoutKitchen(ctx, at);
      if (essentials(p) === 2) {
        plan = p;
        break;
      }
      without ??= layoutKitchen(ctx, null);
      if (essentials(p) >= essentials(without)) {
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

  applyOverrides(plan);
  return plan;
}

/** element-level edits from cfg.overrides, plus a note when they leave the kitchen without a sink or a hob */
function applyOverrides(plan: KitchenPlan): void {
  const ov = plan.cfg.overrides;
  for (const s of plan.slots) {
    const o = ov[s.id];
    if (o && s.options.includes(o)) s.type = o;
  }
  const has = (type: string) => plan.slots.some((s) => (s.zone === "base" || s.zone === "island") && s.type === type);
  if (plan.sinkId && !has("sudoper")) plan.warnings.push("U kuhinji trenutačno nema sudopera — dodajte ga klikom na element.");
  if (plan.hobId && !has("ploca")) plan.warnings.push("U kuhinji trenutačno nema ploče za kuhanje — dodajte je klikom na element.");
}

/** cabinets for one tall-column choice (null = no column); overrides are not applied yet */
function layoutKitchen(ctx: PlanCtx, tall: TallAt | null): KitchenPlan {
  const { cfg, layout, walls, L, upperTop, upperBottom, win, winRange } = ctx;
  const warnings: string[] = [];

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
    return tall.side === "right" ? { from: len - DIM.tallZone, to: len } : { from: 0, to: DIM.tallZone };
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
    const fills = sk.map((s) => {
      const wanted: Feature[] = [];
      if (s.wall === sw) wanted.push("sudoper", "perilica");
      if (s.wall === hw) wanted.push("ploca");
      return fillBase(s.baseSpan, wanted, winRange(s.wall));
    });
    const dropped = fills.flatMap((f) => f.dropped);
    const lost = (dropped.includes("sudoper") ? 1 : 0) + (dropped.includes("ploca") ? 1 : 0);
    // a lost sink or hob outweighs everything, then the preference order, then a lost dishwasher
    const score = lost * 1000 + i * 10 + (dropped.includes("perilica") ? 1 : 0);
    if (!chosen || score < chosen.score) chosen = { fills, score };
    if (lost === 0) break;
  }
  const fills = chosen ? chosen.fills : sk.map((s) => fillBase(s.baseSpan, [], winRange(s.wall)));
  const droppedAll = fills.flatMap((f) => f.dropped);
  if (droppedAll.includes("sudoper")) warnings.push("Sudoper ne stane uz ove mjere — dodajte ga klikom na element.");
  if (droppedAll.includes("ploca")) warnings.push("Ploča za kuhanje ne stane uz ove mjere — dodajte je klikom na element.");

  // ---- fill runs
  const builds: RunBuild[] = [];
  sk.forEach((s, si) => {
    const res = fills[si];

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
    let hoodRange: Range | null = null;
    {
      let hx = s.baseSpan.from;
      for (const it of res.items) {
        if (it.kind === "module" && it.feature === "ploca") {
          const r = { from: hx, to: hx + it.width };
          const inside = r.from >= s.upperSpan.from - 0.01 && r.to <= s.upperSpan.to + 0.01;
          if (inside && !overlaps(r, wr)) hoodRange = r;
        }
        hx += it.width;
      }
    }
    if (hoodRange) blocks.push({ range: hoodRange, kind: "hood" });
    const upperItems: RunBuild["upperItems"] = [];
    if (s.cornerUpperLeft) upperItems.push({ x: 0, item: { kind: "corner", width: DIM.cornerUpper, side: "left" } });
    const subs = subtractRanges(s.upperSpan, blocks);
    // walk sub-spans and blocks in order
    const segs: { from: number; items: Item[] }[] = subs.map((sp) => ({ from: sp.from, items: fillUpper(sp) }));
    if (hoodRange) segs.push({ from: hoodRange.from, items: [{ kind: "module", width: hoodRange.to - hoodRange.from, type: "napa" }] });
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
  });

  // ---- slots & pieces
  const slots: PlanSlot[] = [];
  const pieces: PlanPiece[] = [];
  let sinkId: string | null = null;
  let hobId: string | null = null;

  for (const b of builds) {
    let bi = 0;
    for (const { x, item } of b.baseItems) {
      if (item.kind === "corner") {
        const id = `${b.wall}-base-${bi++}`;
        slots.push(mkSlot(id, "base", b.wall, x, item.width, "kutni", true, item.side));
      } else if (item.kind === "module") {
        const id = `${b.wall}-base-${bi++}`;
        slots.push(mkSlot(id, "base", b.wall, x, item.width, item.type, false));
        if (item.feature === "sudoper") sinkId = id;
        if (item.feature === "ploca") hobId = id;
      } else if (item.kind === "filler" || item.kind === "panel") {
        pieces.push({ kind: item.kind, zone: "base", run: b.wall, x, width: item.width });
      }
    }
    let ui = 0;
    for (const { x, item } of b.upperItems) {
      if (item.kind === "corner") {
        slots.push(mkSlot(`${b.wall}-upper-${ui++}`, "upper", b.wall, x, item.width, "vrata", true, item.side));
      } else if (item.kind === "module") {
        slots.push(mkSlot(`${b.wall}-upper-${ui++}`, "upper", b.wall, x, item.width, item.type, false));
      } else if (item.kind === "filler" || item.kind === "panel") {
        pieces.push({ kind: item.kind, zone: "upper", run: b.wall, x, width: item.width });
      }
    }
    if (b.tall) {
      const t0 = b.tall.from;
      const right = tall?.side === "right";
      pieces.push({ kind: "panel", zone: "tall", run: b.wall, x: t0, width: DIM.panel });
      slots.push(mkSlot("tall-0", "tall", b.wall, t0 + DIM.panel, DIM.tallWidth, right ? "pecnica" : "hladnjak", false));
      slots.push(mkSlot("tall-1", "tall", b.wall, t0 + DIM.panel + DIM.tallWidth, DIM.tallWidth, right ? "hladnjak" : "pecnica", false));
      pieces.push({ kind: "panel", zone: "tall", run: b.wall, x: t0 + DIM.panel + 2 * DIM.tallWidth, width: DIM.panel });
    }
  }

  // ---- accent: one open oak niche at the open end of the uppers
  {
    const accentRun: WallId = layout === "L" || layout === "U" ? "b" : "a";
    const ups = slots.filter((s) => s.zone === "upper" && s.run === accentRun && !s.corner && s.defaultType !== "napa");
    const first = ups[0];
    const enough = slots.filter((s) => s.zone === "upper").length >= 3;
    if (first && first.width <= 60 && enough) {
      first.defaultType = "nisa";
      first.type = "nisa";
    }
  }

  // ---- island
  let island: IslandPlan | null = null;
  if (layout === "otok") {
    const len = cfg.island;
    const inner = len - 2 * DIM.islandWaterfall;
    const dp = dpFill(inner, BASE_COST, "b");
    let x = DIM.islandWaterfall;
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
      slots.push(mkSlot(`isl-${i}`, "island", "isl", x, w, type, false));
      x += w;
    });
    if (rest >= 0.5) pieces.push({ kind: "filler", zone: "base", run: "isl", x, width: rest / 2 });
    // always centred on wall A (sanitizeConfig keeps it at most islandMax: wall A + 2 x DIM.islandOverhangMax);
    // a longer one from an old link would still overhang both ends equally
    island = { length: len, centerX: L.a / 2, backZ: DIM.baseDepth + DIM.aisle + DIM.baseDepth };
  }

  const runs: RunPlan[] = builds.map((b) => {
    const ups = slots
      .filter((s) => s.zone === "upper" && s.run === b.wall)
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
    sinkId,
    hobId,
    warnings,
  };
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
