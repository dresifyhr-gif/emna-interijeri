/**
 * Tiny technical-drawing kit: orthographic axonometric projection of boxes (cm, same axes as the 3D
 * studio: x along wall A, y up, z from the wall into the room) to SVG path strings, plus dimension lines
 * ("kote") with architectural ticks. Pure functions — safe on the server and in Node.
 */

export type V3 = readonly [number, number, number];
export type P2 = [number, number];

export interface Cam {
  r: V3;
  u: V3;
  d: V3;
}

const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const n1 = (v: number) => Math.round(v * 10) / 10;

/** az: rotation round the vertical axis (0 = facing wall A), el: elevation — same convention as the engine */
export function camera(az: number, el: number): Cam {
  const sa = Math.sin(az);
  const ca = Math.cos(az);
  const se = Math.sin(el);
  const ce = Math.cos(el);
  return {
    d: [sa * ce, se, ca * ce],
    r: [ca, 0, -sa],
    u: [-sa * se, ce, -ca * se],
  };
}

export const proj = (c: Cam, p: V3): P2 => [dot(p, c.r), -dot(p, c.u)];
/** larger = closer to the viewer */
export const depthOf = (c: Cam, p: V3) => dot(p, c.d);

const pt = ([x, y]: P2) => `${n1(x)} ${n1(y)}`;

export function pathOf(c: Cam, pts: V3[], close = false): string {
  return pts.map((p, i) => `${i ? "L" : "M"}${pt(proj(c, p))}`).join("") + (close ? "Z" : "");
}

export const seg = (c: Cam, a: V3, b: V3) => pathOf(c, [a, b]);

/** circle in a horizontal plane (y = const), projected */
export function ringY(c: Cam, cx: number, y: number, cz: number, r: number, n = 36): string {
  const pts: V3[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * r, y, cz + Math.sin(a) * r]);
  }
  return pathOf(c, pts, true);
}

export interface Box {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
}

export const box = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): Box => ({ x0, x1, y0, y1, z0, z1 });

export const centerDepth = (c: Cam, b: Box) => depthOf(c, [(b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2]);

export type FaceKind = "front" | "top" | "side";

/** the three faces a camera on the +x / +y / +z side can see */
export function boxFaces(c: Cam, b: Box): { kind: FaceKind; d: string }[] {
  const { x0, x1, y0, y1, z0, z1 } = b;
  const out: { kind: FaceKind; d: string }[] = [];
  if (c.d[2] > 0) out.push({ kind: "front", d: pathOf(c, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], true) });
  if (c.d[1] > 0) out.push({ kind: "top", d: pathOf(c, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], true) });
  if (c.d[0] > 0) out.push({ kind: "side", d: pathOf(c, [[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], true) });
  return out;
}

export interface Label {
  x: number;
  y: number;
  /** degrees */
  rot: number;
  text: string;
}

/**
 * Dimension line between two 3D points: extension lines from `from*` points, the line itself with
 * 45° architectural ticks, and a label centred on it (rotated to the line, lifted by `lift` px).
 */
export function kota(
  c: Cam,
  a: V3,
  b: V3,
  text: string,
  opts: { extFrom?: [V3, V3]; tick?: number; lift?: number } = {},
): { line: string; ext: string[]; ticks: string; label: Label } {
  const pa = proj(c, a);
  const pb = proj(c, b);
  const ang = Math.atan2(pb[1] - pa[1], pb[0] - pa[0]);
  const t = opts.tick ?? 5;
  const tk = (p: P2) => {
    const a45 = ang - Math.PI / 4;
    const dx = Math.cos(a45) * t;
    const dy = Math.sin(a45) * t;
    return `M${pt([p[0] - dx, p[1] - dy])}L${pt([p[0] + dx, p[1] + dy])}`;
  };
  let deg = (ang * 180) / Math.PI;
  // keep text upright
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  const rad = (deg * Math.PI) / 180;
  const lift = opts.lift ?? 7;
  const mx = (pa[0] + pb[0]) / 2 + Math.sin(rad) * lift;
  const my = (pa[1] + pb[1]) / 2 - Math.cos(rad) * lift;
  return {
    line: `M${pt(pa)}L${pt(pb)}`,
    ext: opts.extFrom ? [seg(c, opts.extFrom[0], a), seg(c, opts.extFrom[1], b)] : [],
    ticks: tk(pa) + tk(pb),
    label: { x: n1(mx), y: n1(my), rot: n1(deg), text },
  };
}

/** 2D helpers for flat drawings (plans / elevations) */
export const rect2 = (x: number, y: number, w: number, h: number) => `M${n1(x)} ${n1(y)}h${n1(w)}v${n1(h)}h${n1(-w)}Z`;
export const line2 = (x0: number, y0: number, x1: number, y1: number) => `M${n1(x0)} ${n1(y0)}L${n1(x1)} ${n1(y1)}`;

/** flat dimension line (horizontal or vertical) with ticks; label sits above / left of it */
export function kota2(x0: number, y0: number, x1: number, y1: number, text: string, lift = 6, tick = 4): { d: string; label: Label } {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const a45 = ang - Math.PI / 4;
  const dx = Math.cos(a45) * tick;
  const dy = Math.sin(a45) * tick;
  const tk = (x: number, y: number) => line2(x - dx, y - dy, x + dx, y + dy);
  let deg = (ang * 180) / Math.PI;
  if (deg > 90) deg -= 180;
  if (deg < -90) deg += 180;
  const rad = (deg * Math.PI) / 180;
  return {
    d: line2(x0, y0, x1, y1) + tk(x0, y0) + tk(x1, y1),
    label: {
      x: n1((x0 + x1) / 2 + Math.sin(rad) * lift),
      y: n1((y0 + y1) / 2 - Math.cos(rad) * lift),
      rot: n1(deg),
      text,
    },
  };
}

/** bounding box of every coordinate pair found in a list of path strings */
export function boundsOf(paths: string[], pad = 0): { x: number; y: number; w: number; h: number } {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const d of paths) {
    const re = /[ML](-?[\d.]+) (-?[\d.]+)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(d))) {
      const x = +m[1];
      const y = +m[2];
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return { x: n1(x0 - pad), y: n1(y0 - pad), w: n1(x1 - x0 + 2 * pad), h: n1(y1 - y0 + 2 * pad) };
}
