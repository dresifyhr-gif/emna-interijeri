/**
 * The 2D drawing model of a kitchen — what the PDF export draws today and a DXF / CNC exporter will read later.
 *
 * Pure data, no DOM, no three.js, no React: a Drawing is a list of primitives (lines, polylines, arcs, circles,
 * texts) on semantic layers, a list of dimensions and a list of element tags, all in CENTIMETRES in a y-up drawing
 * frame (like CAD model space):
 *
 *   floor plan   x = the room's x (wall A's left end = 0, along wall A), y = −z (wall A's face at y = 0, the room
 *                below it) — wall A at the top of the sheet, as one stands in the room facing it
 *   elevation    x = the run's own x (left → right as seen standing in the room facing that wall), y = height above
 *                the floor (floor at y = 0)
 *
 * Styles are semantic too (layer, line type, weight, fill): the SVG renderer (svg.ts) turns them into paper mm and
 * colours, a DXF exporter into layers / linetypes / lineweights (dxf.ts lists the entities). Text sizes and the
 * spacing of dimension chains are paper millimetres, so a drawing reads the same at 1:10 and at 1:50.
 */

import type { SlotZone } from "../plan";

export type Pt = readonly [number, number];

export interface Box {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Semantic layers (Croatian, as a carpenter's CAD layers would be named). A DXF exporter keeps them as layers; the
 * SVG renderer as <g data-layer>.
 */
export type Layer =
  /** room walls (poché) */
  | "zid"
  /** window opening, frame, glass, sill */
  | "prozor"
  /** carcass / element outline */
  | "korpus"
  /** fronts: doors, drawers, flaps, fixed panels, fillers, end panels */
  | "fronta"
  /** handles, knobs, edge-grip profiles, the Gola channel */
  | "rucka"
  /** opening-direction symbols (dashed: the apex points at the hinge) */
  | "otvaranje"
  /** worktop, waterfall sides, bar / table tops */
  | "radna-ploca"
  /** backsplash (worktop material, glass, tiles), rail */
  | "obloga"
  /** appliances: sink, hob, oven, microwave, fridge, dishwasher marks */
  | "uredaj"
  /** visible hoods and their chimney covers */
  | "napa"
  /** open shelves, boards, wine racks */
  | "police"
  /** plinth */
  | "cokl"
  /** stools / chairs */
  | "sjedenje"
  /** neighbouring runs cut at a corner (section) */
  | "presjek"
  /** what is above the cut in the floor plan (wall units, hoods) — dashed */
  | "iznad"
  /** empty space elements ("Slobodno mjesto", "Bez gornjeg elementa") */
  | "prazno"
  /** dimensions */
  | "kota"
  /** labels (element tags, notes) */
  | "tekst";

export type LineType = "solid" | "dashed" | "hidden" | "center" | "dotted";
/** line weights (the renderer maps them to mm): heavy = cut walls, medium = outlines, light = divisions, fine = details */
export type Weight = "heavy" | "medium" | "light" | "fine";
/**
 * fills of closed polylines (a DXF exporter: HATCH): wall = cut walls (poché), section = neighbouring runs cut at a
 * corner, worktop / glass / appliance / tile / dark = materials, paper = opaque background (covers what is behind it)
 */
export type Fill = "wall" | "section" | "worktop" | "glass" | "appliance" | "tile" | "dark" | "paper";

export interface Style {
  layer: Layer;
  /** absent = solid */
  line?: LineType;
  /** absent = light */
  weight?: Weight;
  /** closed polylines and circles only; absent = no fill */
  fill?: Fill;
  /** a fill without its outline (the outline is drawn separately, e.g. the union of the room's walls) */
  noStroke?: true;
  /** the plan slot (or piece) this primitive belongs to — for selection, CNC and tests */
  ref?: string;
}

export type Prim =
  | (Style & { t: "line"; a: Pt; b: Pt })
  | (Style & { t: "poly"; pts: Pt[]; closed: boolean })
  /** a0 → a1 counter-clockwise, degrees from +x (as DXF ARC) */
  | (Style & { t: "arc"; c: Pt; r: number; a0: number; a1: number })
  | (Style & { t: "circle"; c: Pt; r: number })
  /** `size`: text height in paper mm; `rot`: degrees counter-clockwise */
  | (Style & { t: "text"; at: Pt; text: string; size: number; align?: "left" | "center" | "right"; rot?: number });

/**
 * Where a dimension line sits, across its axis: `ref` (drawing cm) moved `dir` × (gap + tier × step) paper mm — so
 * chains keep their paper spacing at any scale. Outer chains use the edge of the drawing as `ref`, local chains an
 * edge of what they measure.
 */
export interface DimPlace {
  ref: number;
  dir: 1 | -1;
  /** 0 = closest to `ref` */
  tier: number;
}

/**
 * A linear dimension along x or y between two measured points (DXF: DIMENSION with defpoints a, b). The value is
 * |b[axis] − a[axis]| in cm; the extension lines run from each point to the dimension line.
 */
export interface Dim {
  axis: "x" | "y";
  a: Pt;
  b: Pt;
  place: DimPlace;
  /** what it says; absent = the value ("63,5") */
  text?: string;
  /** a name before the value ("Zid A 380") */
  label?: string;
  /** dimensions of one chain share this id (they are drawn side by side on one line) */
  chain?: string;
}

/** an element on a drawing: its slot, its short label ("A3", the same on every drawing) and where it is drawn */
export interface Tag {
  /** plan slot id */
  ref: string;
  /** "A3", "B1", "O2" (otok), "P1" (poluotok) — elementLabels() */
  label: string;
  /** catalogue name ("Tri ladice") */
  name: string;
  zone: SlotZone;
  /** catalogue type id */
  type: string;
  /** cm */
  width: number;
  /** where the label goes (drawing cm) */
  box: Box;
}

export type DrawingKind = "plan" | "elevation";

export interface Drawing {
  /** "tlocrt", "zid-a", "zid-b", "zid-c", "otok", "otok-straga" (the seating side), "poluotok", "poluotok-straga" */
  id: string;
  kind: DrawingKind;
  /** "Tlocrt", "Zid A", "Otok — radna strana" */
  title: string;
  /** one line under the title ("pogled iz prostorije", "380 × 260 cm") */
  subtitle?: string;
  /** the geometry's bounds (drawing cm), dimensions not included */
  bounds: Box;
  prims: Prim[];
  dims: Dim[];
  tags: Tag[];
}

// ---------------------------------------------------------------- helpers

export const EMPTY_BOX: Box = { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity };

export function box(x0: number, y0: number, x1: number, y1: number): Box {
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

export function grow(b: Box, p: Pt): Box {
  return { x0: Math.min(b.x0, p[0]), y0: Math.min(b.y0, p[1]), x1: Math.max(b.x1, p[0]), y1: Math.max(b.y1, p[1]) };
}

export function union(a: Box, b: Box): Box {
  return { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) };
}

export const isEmpty = (b: Box): boolean => !(b.x1 >= b.x0 && b.y1 >= b.y0);

/** the points of a primitive (arcs and circles: their bounding square; texts: their anchor) */
export function primPoints(p: Prim): Pt[] {
  switch (p.t) {
    case "line":
      return [p.a, p.b];
    case "poly":
      return p.pts;
    case "arc":
    case "circle":
      return [
        [p.c[0] - p.r, p.c[1] - p.r],
        [p.c[0] + p.r, p.c[1] + p.r],
      ];
    case "text":
      return [p.at];
  }
}

/** bounds of primitives (texts by their anchor only) */
export function boundsOf(prims: readonly Prim[]): Box {
  let b = EMPTY_BOX;
  for (const p of prims) for (const q of primPoints(p)) b = grow(b, q);
  return b;
}

export function rectPts(b: Box): Pt[] {
  return [
    [b.x0, b.y0],
    [b.x1, b.y0],
    [b.x1, b.y1],
    [b.x0, b.y1],
  ];
}

export function rect(b: Box, s: Style): Prim {
  return { t: "poly", pts: rectPts(b), closed: true, ...s };
}

export function line(a: Pt, b: Pt, s: Style): Prim {
  return { t: "line", a, b, ...s };
}

export function poly(pts: Pt[], closed: boolean, s: Style): Prim {
  return { t: "poly", pts, closed, ...s };
}

export function circle(c: Pt, r: number, s: Style): Prim {
  return { t: "circle", c, r, ...s };
}

export function text(at: Pt, value: string, size: number, s: Style, align: "left" | "center" | "right" = "center", rot = 0): Prim {
  return { t: "text", at, text: value, size, align, ...(rot ? { rot } : {}), ...s };
}

/** cm as Croatian people write them: whole numbers plain, else one decimal with a comma ("63,5") */
export function fmtCm(v: number): string {
  const r = Math.round(v * 10) / 10;
  const i = Math.round(r);
  if (Math.abs(r - i) < 1e-9) return String(i);
  return r.toFixed(1).replace(".", ",");
}

/** the measured value of a dimension (cm) */
export const dimValue = (d: Dim): number => Math.abs(d.b[d.axis === "x" ? 0 : 1] - d.a[d.axis === "x" ? 0 : 1]);

/**
 * A dimension chain through `stops` (sorted along the axis) — one Dim per consecutive pair; stops closer than `min`
 * cm are merged. `at(v)` gives the measured point for a stop (where its extension line starts).
 */
export function chain(axis: "x" | "y", stops: readonly number[], at: (v: number) => Pt, place: DimPlace, id: string, min = 0.05): Dim[] {
  const s = [...stops].filter((v) => Number.isFinite(v)).sort((p, q) => p - q);
  const kept: number[] = [];
  for (const v of s) if (!kept.length || v - kept[kept.length - 1] >= min) kept.push(v);
  // the last stop always ends the chain (a stop merged into it moves the end, not the sum)
  if (s.length && kept.length && s[s.length - 1] - kept[kept.length - 1] > 0) kept[kept.length - 1] = s[s.length - 1];
  const out: Dim[] = [];
  for (let i = 1; i < kept.length; i++) out.push({ axis, a: at(kept[i - 1]), b: at(kept[i]), place, chain: id });
  return out;
}

/** an affine 2D transform (drawing frame ← local frame): x' = a·x + c·y + e, y' = b·x + d·y + f */
export interface Xf {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
}

export const IDENTITY: Xf = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };

export function apply(m: Xf, p: Pt): Pt {
  return [m.a * p[0] + m.c * p[1] + m.e, m.b * p[0] + m.d * p[1] + m.f];
}

/** a rotation by `deg` counter-clockwise, then a move */
export function rotMove(deg: number, dx: number, dy: number): Xf {
  const r = (deg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return { a: c, b: s, c: -s, d: c, e: dx, f: dy };
}

/** the rotation of a transform (degrees counter-clockwise; 0 for a mirror-free identity) */
export const xfAngle = (m: Xf): number => (Math.atan2(m.b, m.a) * 180) / Math.PI;

/** a primitive moved by a transform (arcs keep their sweep; mirroring transforms are not used) */
export function mapPrim(p: Prim, m: Xf): Prim {
  switch (p.t) {
    case "line":
      return { ...p, a: apply(m, p.a), b: apply(m, p.b) };
    case "poly":
      return { ...p, pts: p.pts.map((q) => apply(m, q)) };
    case "arc": {
      const r = xfAngle(m);
      return { ...p, c: apply(m, p.c), a0: p.a0 + r, a1: p.a1 + r };
    }
    case "circle":
      return { ...p, c: apply(m, p.c) };
    case "text":
      return { ...p, at: apply(m, p.at) };
  }
}

export function mapBox(b: Box, m: Xf): Box {
  let out = EMPTY_BOX;
  for (const q of rectPts(b)) out = grow(out, apply(m, q));
  return out;
}

/** every number in a drawing is finite (tests, and a guard before exporting) */
export function drawingFinite(d: Drawing): boolean {
  const ok = (v: number) => Number.isFinite(v);
  const okPt = (p: Pt) => ok(p[0]) && ok(p[1]);
  const okBox = (b: Box) => ok(b.x0) && ok(b.y0) && ok(b.x1) && ok(b.y1);
  if (!okBox(d.bounds)) return false;
  for (const p of d.prims) {
    if (!primPoints(p).every(okPt)) return false;
    if ((p.t === "arc" || p.t === "circle") && !(ok(p.r) && p.r >= 0)) return false;
    if (p.t === "arc" && !(ok(p.a0) && ok(p.a1))) return false;
    if (p.t === "text" && !ok(p.size)) return false;
  }
  for (const dm of d.dims) if (!okPt(dm.a) || !okPt(dm.b) || !ok(dm.place.ref) || !ok(dm.place.tier)) return false;
  for (const t of d.tags) if (!okBox(t.box) || !ok(t.width)) return false;
  return true;
}
