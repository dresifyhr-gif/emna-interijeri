/**
 * Elevations: the front view of one wall of the kitchen, as seen standing in the room facing it, and of the island /
 * peninsula (its working side and its seating side). Every element with its door / drawer division, handle marks and
 * opening symbols (face.ts), the worktop, backsplash, window, hoods, shelves, plinth, the "do stropa" top row and
 * cornice, the neighbouring run where two runs meet in a corner, and dimension chains: every element's width, the
 * kitchen on the wall, the window, and the heights (plinth, worktop, wall units, ceiling).
 *
 * Run-local x (cm, left → right facing the wall), y = height above the floor. Pure: no DOM, no three.js.
 */

import { DIM, backsplashOfCfg, wallsFor, type IslandPlan, type KitchenPlan, type PlanPiece, type PlanSlot } from "../plan";
import type { WallId } from "../types";
import { WALL_T, cornerAcross, elementLabels, faceCtx, isSpacer, runOf, runTitle, slotTypeName } from "./common";
import { UPPER_FACE, carcassTop, gripGap, lipOf, slotFace, upperRowTop } from "./face";
import {
  boundsOf,
  box,
  chain,
  circle,
  fmtCm,
  line,
  mapBox,
  mapPrim,
  poly,
  rect,
  rotMove,
  type Box,
  type Dim,
  type Drawing,
  type Fill,
  type Prim,
  type Pt,
  type Style,
  type Tag,
} from "./model";

/** the plinth is set back this far behind the fronts (engine D.plinthRecess) */
const PLINTH_RECESS = 6;

const move = (dx: number) => rotMove(0, dx, 0);

/** what fills the backsplash of a kitchen (KitchenConfig.backsplash) */
function backsplashFill(plan: KitchenPlan): Fill {
  const k = backsplashOfCfg(plan.cfg).kind;
  return k === "staklo" ? "glass" : k === "plocice" ? "tile" : "worktop";
}

/** the front view of one slot, at its place in the run (x shift), with its tag; returns the stretch it takes */
function placeSlot(plan: KitchenPlan, s: PlanSlot, labels: Map<string, string>, prims: Prim[], tags: Tag[], dx = 0): Box {
  const f = slotFace(s, faceCtx(plan, s));
  const m = move(s.x + dx);
  for (const p of f.prims) prims.push(mapPrim(p, m));
  const b = mapBox(f.box, m);
  const label = labels.get(s.id);
  if (label && !f.spacer) tags.push({ ref: s.id, label, name: slotTypeName(s), zone: s.zone, type: s.type, width: s.width, box: b });
  // what the element takes along the run (a corner unit all of its slot, an end unit its end panel too)
  return { x0: Math.min(b.x0, s.x + dx), y0: b.y0, x1: Math.max(b.x1, s.x + dx + s.width), y1: b.y1 };
}

/** fillers and end panels of a run (engine kitchen.ts fillPiece heights) */
function placePiece(plan: KitchenPlan, p: PlanPiece, prims: Prim[]): Box {
  const h = plan.heights;
  const handles = plan.cfg.handles;
  const top = carcassTop(h);
  const st = (extra: Partial<Style> = {}): Style => ({ layer: "fronta", weight: "medium", ref: `${p.kind}:${p.run}:${p.zone}:${p.x}`, ...extra });
  const x0 = p.x;
  const x1 = p.x + p.width;
  if (p.zone === "upper") {
    const up = h.cornice ? h.cornice.to : upperRowTop(h);
    const b = box(x0, h.upperBottom - lipOf(handles), x1, up);
    prims.push(rect(b, st()));
    return b;
  }
  if (p.zone === "tall") {
    const b = box(x0, 0, x1, h.cornice ? h.cornice.to : h.tallTop);
    prims.push(rect(b, st()));
    return b;
  }
  if (p.kind === "panel") {
    const b = box(x0, 0, x1, top);
    prims.push(rect(b, st()));
    return b;
  }
  // a filler strip: front, plinth under it, the Gola channel above it
  const yt = top - gripGap(handles);
  prims.push(rect(box(x0, 0, x1, h.plinth), { layer: "cokl", weight: "light" }));
  prims.push(rect(box(x0, h.plinth, x1, yt), st({ weight: "light" })));
  if (handles === "bez") prims.push(rect(box(x0, yt, x1, top), { layer: "rucka", weight: "fine", fill: "dark" }));
  return box(x0, 0, x1, top);
}

/**
 * A run seen end-on where it meets this wall in a corner (the neighbouring wall's cabinets, or wall A's at B / C):
 * base cabinets with the set-back plinth, the worktop, the wall units (with their lip) and the "do stropa" top row.
 * `xw` = the wall line, `dir` = towards the room.
 */
function runReturn(plan: KitchenPlan, xw: number, dir: 1 | -1, parts: { base: boolean; upper: boolean }, prims: Prim[]): void {
  const h = plan.heights;
  const top = carcassTop(h);
  const X = (u: number) => xw + dir * u;
  const s: Style = { layer: "presjek", weight: "medium", fill: "section" };
  const P = (pts: [number, number][]) => prims.push(poly(pts.map(([u, y]): Pt => [X(u), y]), true, s));
  if (parts.base) {
    const f = DIM.baseFace;
    P([
      [0, 0],
      [f - PLINTH_RECESS, 0],
      [f - PLINTH_RECESS, h.plinth],
      [f, h.plinth],
      [f, top],
      [0, top],
    ]);
    P([
      [0, top],
      [DIM.worktopDepth, top],
      [DIM.worktopDepth, h.worktop],
      [0, h.worktop],
    ]);
  }
  if (parts.upper) {
    const lip = lipOf(plan.cfg.handles);
    const ub = h.upperBottom;
    const ut = h.upperTop;
    P(
      lip > 0
        ? [
            [0, ub],
            [UPPER_FACE - 1.9, ub],
            [UPPER_FACE - 1.9, ub - lip],
            [UPPER_FACE, ub - lip],
            [UPPER_FACE, ut],
            [0, ut],
          ]
        : [
            [0, ub],
            [UPPER_FACE, ub],
            [UPPER_FACE, ut],
            [0, ut],
          ],
    );
    if (h.topRow) {
      const face = UPPER_FACE + (h.topDepth - DIM.upperDepth);
      P([
        [0, h.topRow.from],
        [face, h.topRow.from],
        [face, h.topRow.to],
        [0, h.topRow.to],
      ]);
    }
    if (h.cornice && h.cornice.to - h.cornice.from > 0.2) {
      P([
        [0, h.cornice.from],
        [UPPER_FACE, h.cornice.from],
        [UPPER_FACE, h.cornice.to],
        [0, h.cornice.to],
      ]);
    }
  }
}

/**
 * The island / peninsula seen end-on (its free end towards the viewer): `zx` maps its run-local z (0 = back of the
 * cabinets, + = their fronts, − = the outer side) to the drawing's x
 */
function islandReturn(plan: KitchenPlan, I: IslandPlan, zx: (z: number) => number, prims: Prim[]): void {
  const h = plan.heights;
  const top = carcassTop(h);
  const s: Style = { layer: "presjek", weight: "medium", fill: "section" };
  const R = (z0: number, y0: number, z1: number, y1: number) => prims.push(rect(box(zx(z0), y0, zx(z1), y1), s));
  const f = DIM.baseFace;
  const zs = I.slab.flatMap((r) => [r.z0, r.z1]);
  const sz0 = Math.min(...zs);
  const sz1 = Math.max(...zs);
  if (I.waterfalls.length) R(sz0, 0, sz1, h.worktop);
  else {
    prims.push(
      poly(
        (
          [
            [I.outer, 0],
            [f - PLINTH_RECESS, 0],
            [f - PLINTH_RECESS, h.plinth],
            [f, h.plinth],
            [f, top],
            [I.outer, top],
          ] as [number, number][]
        ).map(([z, y]): Pt => [zx(z), y]),
        true,
        s,
      ),
    );
    R(sz0, top, sz1, h.worktop);
  }
  const bar = I.bar;
  if (bar?.kind === "raised" && bar.upstand) {
    R(bar.upstand.z0, bar.upstand.y0, bar.upstand.z1, bar.upstand.y1);
    R(bar.z0, bar.height - DIM.barT, bar.z1, bar.height);
  } else if (bar?.kind === "table") {
    R(bar.z0, bar.height - DIM.worktopT, bar.z1, bar.height);
    R(bar.z0, 0, bar.z1, bar.height - DIM.worktopT);
  }
}

/** a stool or a chair seen from the side, `seat` cm high */
function seatFront(x: number, seat: number, kind: "stool" | "chair", prims: Prim[]): void {
  const s: Style = { layer: "sjedenje", weight: "light" };
  if (kind === "chair") {
    prims.push(rect(box(x - 21, seat - 2, x + 21, seat + 2), s));
    prims.push(rect(box(x - 20, seat + 2, x + 20, seat + 40), { ...s, weight: "fine" }));
    prims.push(line([x - 19, 0], [x - 19, seat - 2], s), line([x + 19, 0], [x + 19, seat - 2], s));
    return;
  }
  prims.push(rect(box(x - 18, seat - 2, x + 18, seat + 2), s));
  prims.push(line([x - 16, 0], [x - 10, seat - 2], s), line([x + 16, 0], [x + 10, seat - 2], s));
  const fr = Math.min(30, seat * 0.4);
  prims.push(line([x - 14.5, fr], [x + 14.5, fr], { ...s, weight: "fine" }));
}

/** dimension chain stops of a set of x ranges, inside [from, to] */
function stopsIn(ranges: readonly { x0: number; x1: number }[], from: number, to: number): number[] {
  const out = [from, to];
  for (const r of ranges) for (const v of [r.x0, r.x1]) if (v > from + 0.05 && v < to - 0.05) out.push(v);
  return out;
}

// ---------------------------------------------------------------- walls

/**
 * The elevation of one wall (null when the layout has no such wall). Its drawing id is "zid-a" / "zid-b" / "zid-c".
 */
export function wallElevation(plan: KitchenPlan, wall: WallId): Drawing | null {
  const r = runOf(plan, wall);
  if (!r) return null;
  const h = plan.heights;
  const L = r.length;
  const C = plan.ceiling;
  const top = carcassTop(h);
  const walls = wallsFor(plan.cfg.layout);
  const labels = elementLabels(plan);
  const prims: Prim[] = [];
  const tags: Tag[] = [];
  const dims: Dim[] = [];
  const T = WALL_T;

  // ---- the wall, the floor, the ceiling, the neighbouring walls cut at the corners
  const leftWall = wall === "a" ? walls.includes("b") : wall === "c";
  const rightWall = wall === "a" ? walls.includes("c") : wall === "b";
  prims.push(rect(box(0, 0, L, C), { layer: "zid", weight: "fine" }));
  if (leftWall) prims.push(rect(box(-T, 0, 0, C), { layer: "zid", weight: "heavy", fill: "wall" }));
  if (rightWall) prims.push(rect(box(L, 0, L + T, C), { layer: "zid", weight: "heavy", fill: "wall" }));
  prims.push(line([leftWall ? -T : -10, 0], [rightWall ? L + T : L + 10, 0], { layer: "zid", weight: "heavy" }));

  // ---- window
  const win = plan.window && plan.window.wall === wall ? plan.window : null;
  if (win) {
    const o = box(win.offset, win.sill, win.offset + win.width, win.top);
    prims.push(rect(o, { layer: "prozor", weight: "medium" }));
    const f = 5.5;
    prims.push(rect(box(o.x0 + f, o.y0 + f, o.x1 - f, o.y1 - f), { layer: "prozor", weight: "light", fill: "glass" }));
    if (win.width > 130) {
      const xm = (o.x0 + o.x1) / 2;
      prims.push(rect(box(xm - 2.2, o.y0 + f, xm + 2.2, o.y1 - f), { layer: "prozor", weight: "light" }));
    }
    if (win.ledge) prims.push(rect(box(o.x0 - 3, win.sill - DIM.sillLedgeDrop, o.x1 + 3, win.sill), { layer: "prozor", weight: "light" }));
  }

  // ---- backsplash, worktop, rail
  const bf = backsplashFill(plan);
  for (const b of r.backsplash) if (b.to - b.from > 0.2 && b.top - h.worktop > 0.2) prims.push(rect(box(b.from, h.worktop, b.to, b.top), { layer: "obloga", weight: "fine", fill: bf }));
  for (const w of r.worktops) prims.push(rect(box(w.from, top, w.to, h.worktop), { layer: "radna-ploca", weight: "medium", fill: "worktop" }));
  if (r.rail) {
    const s: Style = { layer: "obloga", weight: "medium" };
    prims.push(rect(box(r.rail.from, r.rail.y - 0.7, r.rail.to, r.rail.y + 0.7), s));
    for (const x of [r.rail.from + 4.7, r.rail.to - 4.7]) prims.push(circle([x, r.rail.y], 1.2, { ...s, weight: "light" }));
  }

  // ---- fillers, panels, cornices, elements
  const floorRanges: Box[] = [];
  const upperRanges: Box[] = [];
  for (const p of plan.pieces.filter((x) => x.run === wall)) {
    const b = placePiece(plan, p, prims);
    (p.zone === "upper" ? upperRanges : floorRanges).push(b);
  }
  if (h.cornice) {
    for (const c of h.cornices.filter((x) => x.run === wall && x.to - x.from > 0.2)) {
      prims.push(rect(box(c.from, h.cornice.from, c.to, h.cornice.to), { layer: "fronta", weight: "light" }));
    }
  }
  for (const s of plan.slots.filter((x) => x.run === wall)) {
    const b = placeSlot(plan, s, labels, prims, tags);
    (s.zone === "upper" ? upperRanges : floorRanges).push(b);
  }

  // ---- visible wall hoods above the hobs
  for (const hd of r.hoods) {
    const s: Style = { layer: "napa", weight: "medium", fill: hd.kind === "kosa" ? "glass" : "appliance" };
    prims.push(rect(box(hd.from, hd.bottom, hd.to, hd.top), s));
    const c = (hd.from + hd.to) / 2;
    if (hd.ceiling - hd.top > 0.5) prims.push(rect(box(c - hd.chimney.width / 2, hd.top, c + hd.chimney.width / 2, hd.ceiling), { ...s, weight: "light", fill: "appliance" }));
    upperRanges.push(box(hd.from, hd.bottom, hd.to, hd.top));
  }

  // ---- where another run meets this wall in a corner: that run end-on (and a shaped corner unit's other leaf)
  const I = plan.island;
  const penEnd = I && I.kind === "poluotok" ? I.side : null;
  const corners: { side: "left" | "right"; base: ReturnType<typeof cornerAcross>; upper: ReturnType<typeof cornerAcross> }[] = [];
  if (wall === "a") {
    corners.push({ side: "left", base: cornerAcross(plan, "base-l"), upper: cornerAcross(plan, "upper-l") });
    corners.push({ side: "right", base: cornerAcross(plan, "base-r"), upper: cornerAcross(plan, "upper-r") });
  } else if (wall === "b") corners.push({ side: "right", base: cornerAcross(plan, "base-l"), upper: cornerAcross(plan, "upper-l") });
  else corners.push({ side: "left", base: cornerAcross(plan, "base-r"), upper: cornerAcross(plan, "upper-r") });
  for (const c of corners) {
    const xw = c.side === "left" ? 0 : L;
    const dir = c.side === "left" ? 1 : -1;
    if (wall === "a" && I && penEnd === c.side) {
      // the peninsula stands behind wall A's corner unit, seen end-on
      islandReturn(plan, I, (z) => (c.side === "right" ? I.frame.x - z : I.frame.x + z), prims);
      continue;
    }
    if (wall !== "a") {
      // wall A's corner unit reaches along this wall: an L-shaped / diagonal one shows its second leaf here
      for (const k of [c.base, c.upper]) {
        if (!k?.shaped) continue;
        const v: PlanSlot = { ...k.slot, x: c.side === "left" ? 0 : L - k.across, width: k.across, corner: c.side === "left" ? "left" : "right" };
        const b = placeSlot(plan, v, new Map(), prims, tags);
        (k.slot.zone === "upper" ? upperRanges : floorRanges).push(b);
      }
    }
    runReturn(plan, xw, dir, { base: Boolean(c.base), upper: Boolean(c.upper) }, prims);
    // on wall A the corner unit itself spans the corner (its width is what the chain says); on B / C the corner
    // stretch wall A's unit takes is a segment of its own
    if (wall === "a") continue;
    if (c.base) floorRanges.push(c.side === "left" ? box(0, 0, Math.min(L, c.base.across), top) : box(Math.max(0, L - c.base.across), 0, L, top));
    if (c.upper) upperRanges.push(c.side === "left" ? box(0, h.upperBottom, Math.min(L, c.upper.across), h.upperTop) : box(Math.max(0, L - c.upper.across), h.upperBottom, L, h.upperTop));
  }

  const geo = boundsOf(prims);

  // ---- dimensions: below the floor the floor row (every element), the kitchen on the wall, the wall
  const id = `zid-${wall}`;
  let tier = 0;
  const below = (t: number) => ({ ref: Math.min(0, geo.y0), dir: -1 as const, tier: t });
  const atFloor = (v: number): Pt => [v, 0];
  if (r.cabinets) {
    const c = r.cabinets;
    dims.push(...chain("x", stopsIn(floorRanges, c.from, c.to), atFloor, below(tier++), `${id}:elementi`));
    if (c.from > 0.5 || c.to < L - 0.5) dims.push(...chain("x", [0, c.from, c.to, L], atFloor, below(tier++), `${id}:kuhinja`));
  }
  dims.push({ axis: "x", a: [0, 0], b: [L, 0], place: below(tier++), chain: `${id}:zid`, label: runTitle(plan, wall) });

  // ---- above the wall units: every wall unit (and the gaps between them), the window
  tier = 0;
  const above = (t: number) => ({ ref: Math.max(C, geo.y1), dir: 1 as const, tier: t });
  const rowTop = upperRowTop(h);
  const ups = upperRanges.filter((b) => b.x1 - b.x0 > 0.2);
  if (ups.length) {
    const from = Math.max(0, Math.min(...ups.map((b) => b.x0)));
    const to = Math.min(L, Math.max(...ups.map((b) => b.x1)));
    if (to - from > 0.5) dims.push(...chain("x", stopsIn(ups, from, to), (v) => [v, rowTop], above(tier++), `${id}:gornji`));
  }
  if (win) dims.push(...chain("x", [0, win.offset, win.offset + win.width, L], (v) => [v, win.top], above(tier++), `${id}:prozor`));

  // ---- heights on the right: plinth, base, worktop, gap, wall units, top row, up to the ceiling; then the ceiling
  // wall units of its own, or wall A's corner wall unit reaching along it
  const hasUpper = plan.slots.some((s) => s.run === wall && s.zone === "upper" && !isSpacer(s)) || corners.some((c) => c.upper !== null);
  const hasTall = plan.slots.some((s) => s.run === wall && s.zone === "tall");
  const right = (t: number) => ({ ref: Math.max(L, geo.x1), dir: 1 as const, tier: t });
  const hs = [0, h.plinth, top, h.worktop, C];
  if (hasUpper) hs.push(h.upperBottom, h.upperTop, ...(h.topRow ? [h.topRow.to] : []));
  if (hasTall) hs.push(h.tallTop, ...(h.tallSplit !== null ? [h.tallSplit] : []));
  if (h.cornice && (hasUpper || hasTall)) hs.push(h.cornice.from);
  dims.push(...chain("y", hs, (v) => [L, v], right(0), `${id}:visine`));
  dims.push({ axis: "y", a: [L, 0], b: [L, C], place: right(1), chain: `${id}:strop` });

  // ---- the window's sill and height on the left
  if (win) dims.push(...chain("y", [0, win.sill, win.top, C], (v) => [0, v], { ref: Math.min(0, geo.x0), dir: -1, tier: 0 }, `${id}:prozor-visina`));

  // ---- a visible hood: its height above the worktop
  for (const hd of r.hoods) {
    dims.push({ axis: "y", a: [hd.to, h.worktop], b: [hd.to, hd.bottom], place: { ref: hd.to, dir: 1, tier: 0 }, chain: `${id}:napa` });
  }

  return {
    id,
    kind: "elevation",
    title: runTitle(plan, wall),
    subtitle: `pogled iz prostorije · zid ${fmtCm(L)} cm · strop ${fmtCm(C)} cm`,
    bounds: geo,
    prims,
    dims,
    tags,
  };
}

// ---------------------------------------------------------------- island / peninsula

/**
 * The island / peninsula seen from its working side (`front`: the cabinet fronts, run-local x left → right) or from
 * its seating side (`back`: mirrored, the back panel or the outer row, the bar / table and the seats). Null without an
 * island. Ids: "otok" / "otok-straga", "poluotok" / "poluotok-straga".
 */
export function islandElevation(plan: KitchenPlan, view: "front" | "back" = "front"): Drawing | null {
  const I = plan.island;
  if (!I) return null;
  const h = plan.heights;
  const L = I.length;
  const C = plan.ceiling;
  const top = carcassTop(h);
  const back = view === "back";
  const X = (x: number) => (back ? L - x : x);
  const xr = (a: number, b: number): [number, number] => (back ? [L - b, L - a] : [a, b]);
  const labels = elementLabels(plan);
  const prims: Prim[] = [];
  const tags: Tag[] = [];
  const dims: Dim[] = [];
  const T = WALL_T;
  const pen = I.kind === "poluotok";
  /** the end of the drawing where wall A is (a peninsula): run-local x 0 for a right peninsula, L for a left one */
  const wallAt: number | null = pen ? (I.side === "left" ? L : 0) : null;
  const wallX = wallAt === null ? null : X(wallAt);
  const tall = I.hood !== null || pen;

  // ---- floor, ceiling, wall A cut (a peninsula)
  prims.push(line([wallX === 0 ? -T : -15, 0], [wallX === L ? L + T : L + 15, 0], { layer: "zid", weight: "heavy" }));
  if (tall) prims.push(line([wallX === 0 ? -T : -15, C], [wallX === L ? L + T : L + 15, C], { layer: "zid", weight: "fine" }));
  if (wallX !== null) prims.push(rect(wallX === 0 ? box(-T, 0, 0, C) : box(L, 0, L + T, C), { layer: "zid", weight: "heavy", fill: "wall" }));

  const ranges: Box[] = [];
  const st = (layer: Style["layer"], extra: Partial<Style> = {}): Style => ({ layer, weight: "medium", ...extra });

  // ---- worktop, waterfalls, end panels
  const sx0 = Math.min(...I.slab.map((s) => s.from));
  const sx1 = Math.max(...I.slab.map((s) => s.to));
  {
    const [a, b] = xr(sx0, sx1);
    prims.push(rect(box(a, top, b, h.worktop), st("radna-ploca", { fill: "worktop" })));
  }
  for (const w of I.waterfalls) {
    const [a, b] = xr(w.from, w.to);
    prims.push(rect(box(a, 0, b, h.worktop), st("radna-ploca", { fill: "worktop" })));
    ranges.push(box(a, 0, b, h.worktop));
  }
  for (const e of I.endPanels) {
    const [a, b] = xr(e.from, e.to);
    prims.push(rect(box(a, 0, b, top), st("fronta")));
    ranges.push(box(a, 0, b, top));
  }

  if (!back) {
    // ---- the working side: the cabinets and their fillers
    for (const p of plan.pieces.filter((x) => x.run === "isl")) ranges.push(placePiece(plan, p, prims));
    for (const s of plan.slots.filter((x) => x.run === "isl")) ranges.push(placeSlot(plan, s, labels, prims, tags));
    // a raised bar shows above the worktop behind the cabinets; a lowered table is hidden behind them
    const bar = I.bar;
    if (bar?.kind === "raised" && bar.upstand) {
      prims.push(rect(box(bar.from, bar.upstand.y0, bar.to, bar.upstand.y1), st("fronta", { weight: "light" })));
      prims.push(rect(box(bar.from, bar.height - DIM.barT, bar.to, bar.height), st("radna-ploca", { fill: "worktop" })));
    } else if (bar?.kind === "table") {
      prims.push(rect(box(bar.from, bar.height - DIM.worktopT, bar.to, bar.height), st("radna-ploca", { line: "hidden", weight: "fine" })));
    }
  } else {
    // ---- the seating side: the back panel, or the outer row of push-to-open doors
    if (I.backPanel) {
      const [a, b] = xr(I.backPanel.from, I.backPanel.to);
      prims.push(rect(box(a, 0, b, top), st("fronta")));
      ranges.push(box(a, 0, b, top));
    }
    if (I.backRow) {
      let x = I.backRow.from;
      for (const dw of I.backRow.doors) {
        const [a, b] = xr(x, x + dw);
        prims.push(rect(box(a, 0, b, h.plinth), { layer: "cokl", weight: "light" }));
        prims.push(rect(box(a, h.plinth, b, top), st("fronta", { weight: "light" })));
        ranges.push(box(a, 0, b, top));
        x += dw;
      }
    }
    const bar = I.bar;
    if (bar?.kind === "raised" && bar.upstand) {
      const [a, b] = xr(bar.from, bar.to);
      prims.push(rect(box(a, bar.upstand.y0, b, bar.upstand.y1), st("fronta", { weight: "light" })));
      prims.push(rect(box(a, bar.height - DIM.barT, b, bar.height), st("radna-ploca", { fill: "worktop" })));
      for (const bx of bar.brackets) {
        const x = X(bx);
        prims.push(poly([[x - 1, bar.height - DIM.barT], [x + 1, bar.height - DIM.barT], [x + 1, bar.height - DIM.barT - 12]], false, { layer: "radna-ploca", weight: "fine" }));
      }
    } else if (bar?.kind === "table") {
      const [a, b] = xr(bar.from, bar.to);
      prims.push(rect(box(a, bar.height - DIM.worktopT, b, bar.height), st("radna-ploca", { fill: "worktop" })));
      for (const lg of bar.legs) {
        const [la, lb] = xr(lg.from, lg.to);
        prims.push(rect(box(la, 0, lb, bar.height - DIM.worktopT), st("radna-ploca", { weight: "light", fill: "worktop" })));
      }
    }
  }

  // ---- seats: in front of the outer side (seen from the back), beside a seating end (both views)
  for (const s of I.seats) {
    const atEnd = s.x < 0 || s.x > L;
    if (!back && !atEnd) continue;
    seatFront(X(s.x), s.seat, s.kind, prims);
  }

  // ---- the ceiling hood
  const hd = I.hood;
  if (hd) {
    const [a, b] = xr(hd.x - hd.width / 2, hd.x + hd.width / 2);
    prims.push(rect(box(a, hd.bottom, b, hd.top), { layer: "napa", weight: "medium", fill: "appliance" }));
    if (hd.style === "dimnjak" && hd.ceiling - hd.top > 0.5) {
      const c = X(hd.x);
      prims.push(rect(box(c - hd.chimney.width / 2, hd.top, c + hd.chimney.width / 2, hd.ceiling), { layer: "napa", weight: "light", fill: "appliance" }));
    }
  }

  // ---- a peninsula: wall A's run beside it, end-on
  if (wallX !== null) {
    const A = runOf(plan, "a");
    // wall A's wall units reach over the corner the peninsula stands at
    const upper = Boolean(A?.uppers.some((u) => (I.side === "left" ? u.from : A.length - u.to) < 40));
    // seen from the seating side, wall A's cabinets are behind the peninsula: only its wall units show above it
    runReturn(plan, wallX, wallX === 0 ? 1 : -1, { base: !back, upper }, prims);
  }

  const geo = boundsOf(prims);
  const id = `${pen ? "poluotok" : "otok"}${back ? "-straga" : ""}`;
  const below = (t: number) => ({ ref: Math.min(0, geo.y0), dir: -1 as const, tier: t });
  const atFloor = (v: number): Pt => [v, 0];
  const row = chain("x", stopsIn(ranges, 0, L), atFloor, below(0), `${id}:elementi`);
  dims.push(...row);
  dims.push({ axis: "x", a: [0, 0], b: [L, 0], place: below(row.length > 1 ? 1 : 0), chain: `${id}:duljina`, label: runTitle(plan, "isl") });

  const right = (t: number) => ({ ref: Math.max(L, geo.x1), dir: 1 as const, tier: t });
  const hs = [0, h.plinth, top, h.worktop];
  if (I.bar && (back || I.bar.kind === "raised")) hs.push(I.bar.height);
  if (hd) hs.push(hd.bottom, hd.top);
  if (tall) hs.push(C);
  dims.push(...chain("y", hs, (v) => [L, v], right(0), `${id}:visine`));
  if (tall) dims.push({ axis: "y", a: [L, 0], b: [L, C], place: right(1), chain: `${id}:strop` });

  return {
    id,
    kind: "elevation",
    title: `${runTitle(plan, "isl")} — ${back ? "strana za sjedenje" : "radna strana"}`,
    subtitle: `duljina ${fmtCm(L)} cm · dubina ${fmtCm(I.depth)} cm${I.bar ? (I.bar.kind === "raised" ? ` · šank ${fmtCm(I.bar.height)} cm` : " · spušteni stol") : ""}`,
    bounds: geo,
    prims,
    dims,
    tags,
  };
}

/** every elevation of a plan: its walls (A, B, C as the layout has them), then the island / peninsula (both sides) */
export function elevations(plan: KitchenPlan): Drawing[] {
  const out: Drawing[] = [];
  for (const w of wallsFor(plan.cfg.layout)) {
    const d = wallElevation(plan, w);
    if (d) out.push(d);
  }
  for (const v of ["front", "back"] as const) {
    const d = islandElevation(plan, v);
    if (d) out.push(d);
  }
  return out;
}
