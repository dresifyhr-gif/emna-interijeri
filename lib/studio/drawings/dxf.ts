/**
 * A Drawing as a flat list of DXF-ready entities (LINE, LWPOLYLINE, ARC, CIRCLE, TEXT, DIMENSION) in model space
 * centimetres — what a DXF writer (and later a CNC post-processor) serialises without knowing anything about kitchens.
 * Layers keep the drawing's semantic names (DXF_LAYERS suggests a colour, linetype and lineweight for each); texts
 * and dimension spacing are converted from paper mm at the chosen plot scale.
 *
 * Pure data: no DOM, no file format here (a writer adds the DXF header / tables / group codes).
 */

import { dimLineAt, dimText } from "./svg";
import { dimValue, type Dim, type Drawing, type Fill, type Layer, type LineType, type Pt, type Weight } from "./model";

/** a suggestion for the DXF LAYER table: AutoCAD colour index, linetype, lineweight (mm) */
export const DXF_LAYERS: Record<Layer | "naslov", { color: number; linetype: LineType; lineweight: number }> = {
  zid: { color: 8, linetype: "solid", lineweight: 0.5 },
  prozor: { color: 4, linetype: "solid", lineweight: 0.18 },
  korpus: { color: 7, linetype: "solid", lineweight: 0.35 },
  fronta: { color: 7, linetype: "solid", lineweight: 0.18 },
  rucka: { color: 8, linetype: "solid", lineweight: 0.25 },
  otvaranje: { color: 8, linetype: "dashed", lineweight: 0.13 },
  "radna-ploca": { color: 30, linetype: "solid", lineweight: 0.35 },
  obloga: { color: 9, linetype: "solid", lineweight: 0.13 },
  uredaj: { color: 5, linetype: "solid", lineweight: 0.18 },
  napa: { color: 5, linetype: "solid", lineweight: 0.35 },
  police: { color: 7, linetype: "solid", lineweight: 0.18 },
  cokl: { color: 8, linetype: "solid", lineweight: 0.18 },
  sjedenje: { color: 8, linetype: "solid", lineweight: 0.18 },
  presjek: { color: 8, linetype: "solid", lineweight: 0.35 },
  iznad: { color: 8, linetype: "hidden", lineweight: 0.13 },
  prazno: { color: 9, linetype: "dashed", lineweight: 0.13 },
  kota: { color: 42, linetype: "solid", lineweight: 0.13 },
  tekst: { color: 7, linetype: "solid", lineweight: 0.13 },
  naslov: { color: 7, linetype: "solid", lineweight: 0.25 },
};

interface EntityBase {
  layer: Layer;
  /** absent = BYLAYER */
  linetype?: LineType;
  weight?: Weight;
  /** plan slot id */
  ref?: string;
}

export type DxfEntity =
  | (EntityBase & { type: "LINE"; a: Pt; b: Pt })
  /** closed with `fill`: also a HATCH with that material; `noStroke`: only the HATCH (its outline is drawn as lines) */
  | (EntityBase & { type: "LWPOLYLINE"; pts: Pt[]; closed: boolean; fill?: Fill; noStroke?: true })
  | (EntityBase & { type: "ARC"; c: Pt; r: number; a0: number; a1: number })
  | (EntityBase & { type: "CIRCLE"; c: Pt; r: number; fill?: Fill })
  /** height in model cm; rot in degrees */
  | (EntityBase & { type: "TEXT"; at: Pt; text: string; height: number; rot: number; align: "left" | "center" | "right" })
  /**
   * a linear (rotated) DIMENSION: defpoints `a` / `b` (DXF 13 / 14), a point on the dimension line `line` (DXF 10),
   * rotation 0 (along x) or 90 (along y), the measured value and the text to show
   */
  | (EntityBase & { type: "DIMENSION"; a: Pt; b: Pt; line: Pt; rot: 0 | 90; value: number; text: string });

export interface DxfOptions {
  /** the plot scale (20 = 1:20): turns paper mm of texts and dimension spacing into model cm; absent = 20 */
  scale?: number;
  /** DIMENSION entities as plain lines, ticks and texts (for writers without dimension support); absent = false */
  explodeDims?: boolean;
  /** element tags as TEXT entities; absent = true */
  tags?: boolean;
  /** dimension text height (paper mm); absent = 2.2 */
  textSize?: number;
}

function dimEntity(d: Dim, s: number): DxfEntity {
  const at = dimLineAt(d, s);
  const line: Pt = d.axis === "x" ? [d.a[0], at] : [at, d.a[1]];
  return { type: "DIMENSION", layer: "kota", a: d.a, b: d.b, line, rot: d.axis === "x" ? 0 : 90, value: dimValue(d), text: dimText(d) };
}

function explodeDim(d: Dim, s: number, th: number): DxfEntity[] {
  const at = dimLineAt(d, s);
  const out: DxfEntity[] = [];
  const horiz = d.axis === "x";
  const foot = (p: Pt): Pt => (horiz ? [p[0], at] : [at, p[1]]);
  const mm = (v: number) => v / s;
  for (const p of [d.a, d.b]) {
    const f = foot(p);
    const j = horiz ? 1 : 0;
    const sg = Math.sign(f[j] - p[j]) || 1;
    const start: Pt = horiz ? [p[0], p[1] + sg * mm(1)] : [p[0] + sg * mm(1), p[1]];
    const end: Pt = horiz ? [f[0], f[1] + sg * mm(1.5)] : [f[0] + sg * mm(1.5), f[1]];
    out.push({ type: "LINE", layer: "kota", a: start, b: end, weight: "fine" });
    out.push({ type: "LINE", layer: "kota", a: [f[0] - mm(1.1), f[1] - mm(1.1)], b: [f[0] + mm(1.1), f[1] + mm(1.1)], weight: "medium" });
  }
  const fa = foot(d.a);
  const fb = foot(d.b);
  out.push({ type: "LINE", layer: "kota", a: fa, b: fb, weight: "fine" });
  const mid: Pt = horiz ? [(fa[0] + fb[0]) / 2, at + mm(th * 0.45)] : [at - mm(th * 0.45), (fa[1] + fb[1]) / 2];
  out.push({ type: "TEXT", layer: "kota", at: mid, text: dimText(d), height: mm(th), rot: horiz ? 0 : 90, align: "center" });
  return out;
}

/** the entities of a drawing, in model space cm */
export function toDxfEntities(d: Drawing, opts: DxfOptions = {}): DxfEntity[] {
  const scale = opts.scale ?? 20;
  const s = 10 / scale;
  const th = opts.textSize ?? 2.2;
  const out: DxfEntity[] = [];
  for (const p of d.prims) {
    const base: EntityBase = { layer: p.layer, ...(p.line && p.line !== "solid" ? { linetype: p.line } : {}), ...(p.weight ? { weight: p.weight } : {}), ...(p.ref ? { ref: p.ref } : {}) };
    switch (p.t) {
      case "line":
        out.push({ ...base, type: "LINE", a: p.a, b: p.b });
        break;
      case "poly":
        out.push({ ...base, type: "LWPOLYLINE", pts: p.pts, closed: p.closed, ...(p.fill ? { fill: p.fill } : {}), ...(p.noStroke ? { noStroke: true as const } : {}) });
        break;
      case "arc":
        out.push({ ...base, type: "ARC", c: p.c, r: p.r, a0: p.a0, a1: p.a1 });
        break;
      case "circle":
        out.push({ ...base, type: "CIRCLE", c: p.c, r: p.r, ...(p.fill ? { fill: p.fill } : {}) });
        break;
      case "text":
        out.push({ ...base, type: "TEXT", at: p.at, text: p.text, height: p.size / s, rot: p.rot ?? 0, align: p.align ?? "center" });
        break;
    }
  }
  if (opts.tags !== false) {
    for (const t of d.tags) {
      out.push({ type: "TEXT", layer: "tekst", ref: t.ref, at: [(t.box.x0 + t.box.x1) / 2, (t.box.y0 + t.box.y1) / 2], text: t.label, height: 2.4 / s, rot: 0, align: "center" });
    }
  }
  for (const dm of d.dims) {
    if (opts.explodeDims) out.push(...explodeDim(dm, s, th));
    else out.push(dimEntity(dm, s));
  }
  return out;
}

