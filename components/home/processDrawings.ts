/**
 * Technical drawings for "Kako nastaje" (measure → 3D project → workshop → installation).
 * Pure data: SVG path strings in a 320 × 200 viewBox, built with the drawing kit.
 */

import {
  box,
  boundsOf,
  boxFaces,
  camera,
  centerDepth,
  kota,
  kota2,
  line2,
  pathOf,
  rect2,
  seg,
  type Box,
  type Cam,
  type FaceKind,
  type Label,
  type V3,
} from "./drawingKit";

export interface DrawPath {
  d: string;
  /** "solid" outlines get an opaque fill (hide what is behind them) */
  kind: "line" | "solid" | "faint" | "dash" | "dim" | "accent";
  face?: FaceKind;
}

export interface ProcessDrawingData {
  viewBox: string;
  paths: DrawPath[];
  labels: Label[];
}

const VB = { w: 320, h: 200 };

/* ---------------------------------------------------------------- helpers */

/** scale + translate absolute M/L paths (and labels) so they fit the viewBox with a margin */
function fit(paths: DrawPath[], labels: Label[], margin = 16): { paths: DrawPath[]; labels: Label[] } {
  const b = boundsOf(paths.map((p) => p.d));
  const k = Math.min((VB.w - 2 * margin) / b.w, (VB.h - 2 * margin) / b.h);
  const ox = (VB.w - b.w * k) / 2 - b.x * k;
  const oy = (VB.h - b.h * k) / 2 - b.y * k;
  const tx = (x: number) => Math.round((x * k + ox) * 10) / 10;
  const ty = (y: number) => Math.round((y * k + oy) * 10) / 10;
  return {
    paths: paths.map((p) => ({ ...p, d: p.d.replace(/([ML])(-?[\d.]+) (-?[\d.]+)/g, (_, c: string, x: string, y: string) => `${c}${tx(+x)} ${ty(+y)}`) })),
    labels: labels.map((l) => ({ ...l, x: tx(l.x), y: ty(l.y) })),
  };
}

function solids(c: Cam, list: Box[]): DrawPath[] {
  return [...list]
    .sort((a, b) => centerDepth(c, a) - centerDepth(c, b))
    .flatMap((b) => boxFaces(c, b).map((f) => ({ d: f.d, kind: "solid" as const, face: f.kind })));
}

/* ---------------------------------------------------------------- 01 · Izmjera: floor plan with dimensions */

function measure(): ProcessDrawingData {
  const P: DrawPath[] = [];
  const L: Label[] = [];
  const x0 = 64;
  const x1 = 278;
  const y0 = 50;
  const y1 = 168;
  const t = 7;
  // walls (double lines), window in wall A, door in the right wall
  P.push({ kind: "line", d: `M${x0 - t} ${y1 + t}V${y0 - t}H${170}M${226} ${y0 - t}H${x1 + t}V${108}M${x1 + t} ${154}V${y1 + t}H${x0 - t}` });
  P.push({ kind: "line", d: `M${x0} ${y1}V${y0}H${170}M${226} ${y0}H${x1}V${108}M${x1} ${154}V${y1}H${x0}` });
  P.push({ kind: "line", d: `M170 ${y0 - t}V${y0}M226 ${y0 - t}V${y0}M170 ${y0 - 4.6}H226M170 ${y0 - 2.4}H226` });
  P.push({ kind: "line", d: `M${x1} 108H${x1 + t}M${x1} 154H${x1 + t}M${x1} 108L${x1 - 46} 108` });
  P.push({ kind: "faint", d: `M${x1 - 46} 108A46 46 0 0 0 ${x1} 154` });

  // dimensions
  const a = kota2(x0, 24, x1, 24, "380");
  P.push({ kind: "faint", d: line2(x0, y0 - t - 3, x0, 20) + line2(x1, y0 - t - 3, x1, 20) });
  P.push({ kind: "dim", d: a.d });
  L.push(a.label);
  const b = kota2(34, y0, 34, y1, "220");
  P.push({ kind: "faint", d: line2(x0 - t - 3, y0, 30, y0) + line2(x0 - t - 3, y1, 30, y1) });
  P.push({ kind: "dim", d: b.d });
  L.push(b.label);

  // laser distance meter measuring to the wall
  P.push({ kind: "accent", d: rect2(196, 146, 12, 7) });
  P.push({ kind: "dash", d: line2(202, 146, 202, y0 + 1) });
  P.push({ kind: "accent", d: `M199.5 ${y0 + 3.5}L202 ${y0 + 1}L204.5 ${y0 + 3.5}` });
  L.push({ x: 214, y: 100, rot: -90, text: "205" });

  // corner markers (a measured corner)
  P.push({ kind: "faint", d: `M${x0 + 10} ${y0}V${y0 + 10}H${x0}` });
  return { viewBox: `0 0 ${VB.w} ${VB.h}`, paths: P, labels: L };
}

/* ---------------------------------------------------------------- 02 · 3D projekt: axonometric L kitchen + orbit */

function project(): ProcessDrawingData {
  const c = camera(0.68, 0.42);
  const P: DrawPath[] = [];
  const L: Label[] = [];
  const A = 300;
  const B = 220;
  // room corner
  P.push({ kind: "faint", d: seg(c, [0, 0, 0], [A + 30, 0, 0]) + seg(c, [0, 0, 0], [0, 0, B + 30]) + seg(c, [0, 0, 0], [0, 250, 0]) });
  P.push({ kind: "faint", d: seg(c, [0, 250, 0], [A + 30, 250, 0]) + seg(c, [0, 250, 0], [0, 250, B + 30]) });

  const parts: Box[] = [
    box(0, A, 10, 86, 0, 60), // base A
    box(0, 60, 10, 86, 60, B), // base B
    box(0, A, 86, 90, 0, 63), // worktop A
    box(0, 63, 86, 90, 63, B), // worktop B
    box(0, A - 60, 147, 219, 0, 35), // uppers A
    box(A - 60, A, 10, 219, 0, 60), // tall column
  ];
  P.push(...solids(c, parts));
  // module lines on base A
  for (let x = 60; x < A - 60; x += 60) P.push({ kind: "line", d: seg(c, [x, 10, 60], [x, 86, 60]) + seg(c, [x, 147, 35], [x, 219, 35]) });
  for (let z = 120; z < B; z += 50) P.push({ kind: "line", d: seg(c, [60, 10, z], [60, 86, z]) });

  // orbit arc in the floor plane round the kitchen, with arrow head
  const cx = 150;
  const cz = 120;
  const pts: V3[] = [];
  for (let i = 0; i <= 40; i++) {
    const a = (Math.PI * (0.15 + (i / 40) * 0.62));
    pts.push([cx + Math.cos(a) * 250, -8, cz + Math.sin(a) * 200]);
  }
  P.push({ kind: "accent", d: pathOf(c, pts) });
  const end = pts[pts.length - 1];
  const prev = pts[pts.length - 3];
  const dir: V3 = [end[0] - prev[0], 0, end[2] - prev[2]];
  const len = Math.hypot(dir[0], dir[2]);
  const ux = dir[0] / len;
  const uz = dir[2] / len;
  const head = (s: number): V3 => [end[0] - ux * 18 + -uz * s, -8, end[2] - uz * 18 + ux * s];
  P.push({ kind: "accent", d: pathOf(c, [head(9), end, head(-9)]) });

  const k = kota(c, [0, 250, 0], [A, 250, 0], "380", { tick: 6, lift: 9 });
  P.push({ kind: "dim", d: k.line + k.ticks });
  L.push(k.label);

  const out = fit(P, L, 14);
  return { viewBox: `0 0 ${VB.w} ${VB.h}`, ...out };
}

/* ---------------------------------------------------------------- 03 · Izrada: exploded cabinet carcass */

function workshop(): ProcessDrawingData {
  const c = camera(0.62, 0.36);
  const P: DrawPath[] = [];
  const L: Label[] = [];
  const W = 60;
  const H = 72;
  const D = 56;
  const t = 2.2;
  const e = 24;
  const ey = 18;
  const parts: Box[] = [
    box(t, W - t, t, H - t, -22, -21.2), // back
    box(-e, -e + t, 0, H, 0, D), // left side
    box(t, W - t, -ey, -ey + t, 0, D), // bottom
    box(t, W - t, H + ey - t, H + ey, 0, D), // top
    box(t, W - t, H * 0.5, H * 0.5 + t, 3, D - 3), // shelf (in place)
    box(W + e - t, W + e, 0, H, 0, D), // right side
  ];
  P.push(...solids(c, parts));
  // assembly directions
  const dash = (a: V3, b: V3) => P.push({ kind: "dash", d: seg(c, a, b) });
  dash([-e + t, H / 2, D / 2], [t, H / 2, D / 2]);
  dash([W - t, H / 2, D / 2], [W + e - t, H / 2, D / 2]);
  dash([W / 2, -ey + t, D / 2], [W / 2, t, D / 2]);
  dash([W / 2, H - t, D / 2], [W / 2, H + ey - t, D / 2]);
  dash([W / 2, H / 2, -21.2], [W / 2, H / 2, t]);
  // drilled shelf-pin holes on the inner face of the left side
  for (let y = 14; y <= H - 14; y += 8) {
    for (const z of [7, D - 7]) {
      const pts: V3[] = [];
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        pts.push([-e + t, y + Math.cos(a) * 1.1, z + Math.sin(a) * 1.1]);
      }
      P.push({ kind: "accent", d: pathOf(c, pts, true) });
    }
  }
  const kw = kota(c, [0, -ey - 12, D + 6], [W, -ey - 12, D + 6], "60", { tick: 3, lift: -8 });
  P.push({ kind: "dim", d: kw.line + kw.ticks });
  L.push(kw.label);
  const kh = kota(c, [W + e + 10, 0, D], [W + e + 10, H, D], "72", { tick: 3, lift: -8 });
  P.push({ kind: "dim", d: kh.line + kh.ticks });
  L.push(kh.label);

  const out = fit(P, L, 12);
  return { viewBox: `0 0 ${VB.w} ${VB.h}`, ...out };
}

/* ---------------------------------------------------------------- 04 · Montaža: elevation with laser level */

function install(): ProcessDrawingData {
  const P: DrawPath[] = [];
  const L: Label[] = [];
  const x0 = 44;
  const x1 = 266;
  const floor = 178;
  const plinth = 170;
  const wt = 108;
  // wall + floor
  P.push({ kind: "faint", d: line2(14, floor, 306, floor) });
  for (let x = 20; x < 306; x += 12) P.push({ kind: "faint", d: line2(x, floor, x - 7, floor + 7) });
  // base run, worktop, wall units
  P.push({ kind: "solid", face: "front", d: rect2(x0 + 4, plinth, x1 - x0 - 8, floor - plinth) });
  P.push({ kind: "solid", face: "front", d: rect2(x0, wt + 5, x1 - x0, plinth - wt - 5) });
  P.push({ kind: "solid", face: "top", d: rect2(x0 - 4, wt, x1 - x0 + 8, 5) });
  P.push({ kind: "solid", face: "front", d: rect2(x0, 26, x1 - x0 - 56, 46) });
  P.push({ kind: "solid", face: "front", d: rect2(x1 - 56, 26, 56, plinth - 26) });
  const mods = [x0 + 56, x0 + 111, x0 + 166];
  for (const x of mods) P.push({ kind: "line", d: line2(x, wt + 5, x, plinth) + line2(x, 26, x, 72) });
  P.push({ kind: "line", d: line2(x0 + 56, 140, x0 + 111, 140) + line2(x0 + 56, 126, x0 + 111, 126) });
  P.push({ kind: "line", d: line2(x1 - 56, 92, x1, 92) + line2(x1 - 51, 98, x1 - 5, 98) + line2(x1 - 51, 132, x1 - 5, 132) });
  P.push({ kind: "line", d: rect2(x1 - 51, 98, 46, 34) });
  // spirit level on the worktop
  P.push({ kind: "accent", d: rect2(92, wt - 5, 96, 5) + rect2(134, wt - 4, 12, 3) + line2(100, wt - 5, 100, wt) + line2(180, wt - 5, 180, wt) });
  P.push({ kind: "accent", d: `M138.8 ${wt - 2.5}a1.2 1.2 0 1 0 2.4 0a1.2 1.2 0 1 0 -2.4 0` });
  // laser line
  P.push({ kind: "accent", d: rect2(6, 84, 10, 10) });
  P.push({ kind: "dash", d: line2(16, 89, 306, 89) });
  // height of the worktop
  const k = kota2(290, floor, 290, wt, "90", 8);
  P.push({ kind: "faint", d: line2(x1 + 6, wt, 294, wt) });
  P.push({ kind: "dim", d: k.d });
  L.push(k.label);
  return { viewBox: `0 0 ${VB.w} ${VB.h}`, paths: P, labels: L };
}

export const PROCESS_DRAWINGS = {
  izmjera: measure(),
  projekt: project(),
  izrada: workshop(),
  montaza: install(),
};

export type ProcessDrawingId = keyof typeof PROCESS_DRAWINGS;
