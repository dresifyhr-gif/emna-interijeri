/**
 * A Drawing as a clean architectural line drawing in SVG, to scale on paper: coordinates, line weights and text in
 * paper millimetres (width / height attributes in mm), so it prints at true scale (1:20 …) and embeds in a PDF page or
 * an HTML print page as it is. Dimensions in the accent colour with oblique ticks; element labels with a paper halo.
 *
 * Pure string building: no DOM, works on the server and in the browser.
 */

import { dimValue, fmtCm, type Box, type Dim, type Drawing, type Fill, type LineType, type Prim, type Pt, type Weight } from "./model";

export interface SvgColors {
  /** every line and text */
  ink: string;
  /** dimensions */
  accent: string;
  /** the sheet behind the drawing; "none" = transparent */
  paper: string;
  /** cut walls (poché) */
  wall: string;
  /** neighbouring runs seen end-on at a corner */
  section: string;
  worktop: string;
  glass: string;
  appliance: string;
  tile: string;
  /** handles, channels, displays */
  dark: string;
  /** subtitles */
  muted: string;
}

/** ink on white paper, dimensions in the site's accent on paper (tailwind accent.deep) */
export const DEFAULT_COLORS: SvgColors = {
  ink: "#1d1c1a",
  accent: "#8a7a5c",
  paper: "#ffffff",
  wall: "#4a4743",
  section: "#efece6",
  worktop: "#ece7de",
  glass: "#e3ecef",
  appliance: "#e2e1df",
  tile: "#f1eee8",
  dark: "#5a5753",
  muted: "#6d675d",
};

/** line weights in paper mm (ISO 128 pen sizes) */
export const DEFAULT_WEIGHTS: Record<Weight, number> = { heavy: 0.5, medium: 0.35, light: 0.18, fine: 0.13 };

/** the scales a fitted drawing may take, largest first (1:5 … 1:200) */
export const STANDARD_SCALES = [5, 10, 20, 25, 50, 75, 100, 200] as const;

export interface SvgOptions {
  /** 20 = 1:20 (2 cm of kitchen = 1 mm of paper); absent = the largest of `scales` that fits `fit`, else 1:20 */
  scale?: number;
  /** paper box (mm) the drawing (with dimensions and title) has to fit in */
  fit?: { width: number; height: number };
  scales?: readonly number[];
  /** element tags: their label ("A3"), the catalogue name, both, or none; absent = "label" */
  labels?: "none" | "label" | "name" | "both";
  /** absent = true */
  dims?: boolean;
  /** the title and scale under the drawing; absent = true */
  title?: boolean;
  weights?: Partial<Record<Weight, number>>;
  colors?: Partial<SvgColors>;
  font?: string;
  /** dimension text height (mm); absent = 2.2 */
  textSize?: number;
  /** around the drawing (mm); absent = 6 */
  margin?: number;
  /** prefix of the ids inside the SVG (patterns), unique when several SVGs share one HTML page; absent = the drawing id */
  idPrefix?: string;
}

export interface SvgResult {
  svg: string;
  /** paper size (mm) */
  width: number;
  height: number;
  /** the scale used (20 = 1:20) */
  scale: number;
}

/** dimension lines: the first this far from what they measure, each next chain this much further (paper mm) */
export const DIM_GAP = 7;
export const DIM_STEP = 6.5;
/** extension lines start this far from the measured point and run this far past the dimension line (mm) */
const EXT_GAP = 1;
const EXT_OVER = 1.5;
const TICK = 1.1;

const DASH: Record<Exclude<LineType, "solid">, string> = {
  dashed: "1.6 0.8",
  hidden: "1 0.7",
  center: "5 1 1 1",
  dotted: "0.2 0.6",
};

const n = (v: number): string => {
  const r = Math.round(v * 100) / 100;
  return Object.is(r, -0) ? "0" : String(r);
};

const esc = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** a rough text width (mm) for layout decisions: proportional sans-serif, digits and lowercase */
export const textWidth = (s: string, size: number): number => s.length * size * 0.56;

/** where a dimension line sits across its axis (drawing cm) at `s` paper mm per cm */
export function dimLineAt(d: Dim, s: number): number {
  return d.place.ref + (d.place.dir * (DIM_GAP + d.place.tier * DIM_STEP)) / s;
}

/** what a dimension says */
export const dimText = (d: Dim): string => {
  const v = d.text ?? fmtCm(dimValue(d));
  return d.label ? `${d.label} · ${v}` : v;
};

interface DimLayout {
  d: Dim;
  /** dim line across-coordinate (cm) */
  at: number;
  /** text: offset (mm) from the line, + = above (horizontal) / left (vertical) */
  textOff: number;
  /** text along-axis position (cm) */
  textAlong: number;
}

/** lay out the dimensions: line positions, and where texts go that do not fit between their ticks */
function layoutDims(dims: readonly Dim[], s: number, th: number): DimLayout[] {
  const out: DimLayout[] = [];
  const byChain = new Map<string, Dim[]>();
  dims.forEach((d, i) => {
    const k = d.chain ?? `#${i}`;
    const list = byChain.get(k) ?? [];
    list.push(d);
    byChain.set(k, list);
  });
  for (const list of byChain.values()) {
    const ax = (d: Dim) => (d.axis === "x" ? 0 : 1);
    const sorted = [...list].sort((p, q) => Math.min(p.a[ax(p)], p.b[ax(p)]) - Math.min(q.a[ax(q)], q.b[ax(q)]));
    let small = 0;
    for (const d of sorted) {
      const i = ax(d);
      const a = Math.min(d.a[i], d.b[i]);
      const b = Math.max(d.a[i], d.b[i]);
      const lenMm = (b - a) * s;
      const tw = textWidth(dimText(d), th);
      const base = th * 0.45;
      let textOff = base;
      if (tw + 1.2 > lenMm) {
        // too narrow for its text: alternately higher above the line and below it
        textOff = small % 2 === 0 ? base + th * 1.15 : -(th + base * 0.6);
        small++;
      } else small = 0;
      out.push({ d, at: dimLineAt(d, s), textOff, textAlong: (a + b) / 2 });
    }
  }
  return out;
}

/** the paper extent (cm) a dimension layout takes */
function dimExtent(l: DimLayout, s: number, th: number): Box {
  const d = l.d;
  const i = d.axis === "x" ? 0 : 1;
  const j = 1 - i;
  const a = Math.min(d.a[i], d.b[i]) - EXT_OVER / s;
  const b = Math.max(d.a[i], d.b[i]) + EXT_OVER / s;
  const lo = Math.min(d.a[j], d.b[j], l.at - (th * 2.6) / s);
  const hi = Math.max(d.a[j], d.b[j], l.at + (th * 2.6) / s);
  // a text that sticks out past the ends of a short dimension
  const tw = textWidth(dimText(d), th) / s / 2;
  const ta = Math.min(a, l.textAlong - tw);
  const tb = Math.max(b, l.textAlong + tw);
  return i === 0 ? { x0: ta, x1: tb, y0: lo, y1: hi } : { x0: lo, x1: hi, y0: ta, y1: tb };
}

function measure(d: Drawing, s: number, o: Required<Pick<SvgOptions, "dims" | "textSize">>): { box: Box; dims: DimLayout[] } {
  let b = { ...d.bounds };
  const dims = o.dims ? layoutDims(d.dims, s, o.textSize) : [];
  for (const l of dims) {
    const e = dimExtent(l, s, o.textSize);
    b = { x0: Math.min(b.x0, e.x0), y0: Math.min(b.y0, e.y0), x1: Math.max(b.x1, e.x1), y1: Math.max(b.y1, e.y1) };
  }
  return { box: b, dims };
}

const TITLE_H = 11;

/** the paper size (mm) of a drawing at a scale */
export function paperSize(d: Drawing, scale: number, opts: SvgOptions = {}): { width: number; height: number } {
  const s = 10 / scale;
  const m = opts.margin ?? 6;
  const { box } = measure(d, s, { dims: opts.dims ?? true, textSize: opts.textSize ?? 2.2 });
  return { width: (box.x1 - box.x0) * s + 2 * m, height: (box.y1 - box.y0) * s + 2 * m + (opts.title === false ? 0 : TITLE_H) };
}

/**
 * Where toSVG puts the drawing on its paper, for a host that draws on top of the SVG (the studio's 2D view: hit areas,
 * the selection, "+" markers): paper mm = ((x − box.x0) · s + margin, (box.y1 − y) · s + margin) for a drawing point
 * (x, y) in cm. `box` is the drawing with its dimensions (cm), `width` / `height` the paper (mm), as toSVG lays them out
 * with the same options.
 */
export function svgFrame(d: Drawing, opts: SvgOptions = {}): { scale: number; s: number; margin: number; box: Box; width: number; height: number } {
  const scale = opts.scale ?? (opts.fit ? fitScale(d, opts.fit, opts) : 20);
  const s = 10 / scale;
  const margin = opts.margin ?? 6;
  const { box } = measure(d, s, { dims: opts.dims ?? true, textSize: opts.textSize ?? 2.2 });
  return {
    scale,
    s,
    margin,
    box,
    width: (box.x1 - box.x0) * s + 2 * margin,
    height: (box.y1 - box.y0) * s + 2 * margin + (opts.title === false ? 0 : TITLE_H),
  };
}

/** the largest standard scale at which the drawing fits the paper box (the smallest of them when none does) */
export function fitScale(d: Drawing, fit: { width: number; height: number }, opts: SvgOptions = {}): number {
  const scales = [...(opts.scales ?? STANDARD_SCALES)].sort((a, b) => a - b);
  for (const sc of scales) {
    const p = paperSize(d, sc, opts);
    if (p.width <= fit.width + 1e-6 && p.height <= fit.height + 1e-6) return sc;
  }
  return scales[scales.length - 1] ?? 50;
}

export function toSVG(d: Drawing, opts: SvgOptions = {}): SvgResult {
  const scale = opts.scale ?? (opts.fit ? fitScale(d, opts.fit, opts) : 20);
  const s = 10 / scale;
  const C: SvgColors = { ...DEFAULT_COLORS, ...opts.colors };
  const W: Record<Weight, number> = { ...DEFAULT_WEIGHTS, ...opts.weights };
  const th = opts.textSize ?? 2.2;
  const margin = opts.margin ?? 6;
  const font = opts.font ?? "Helvetica, Arial, sans-serif";
  const pid = (opts.idPrefix ?? d.id).replace(/[^a-zA-Z0-9_-]/g, "-");
  const showTitle = opts.title !== false;
  const labels = opts.labels ?? "label";
  const { box: B, dims } = measure(d, s, { dims: opts.dims ?? true, textSize: th });
  const width = (B.x1 - B.x0) * s + 2 * margin;
  const drawH = (B.y1 - B.y0) * s + 2 * margin;
  const height = drawH + (showTitle ? TITLE_H : 0);
  const X = (x: number) => (x - B.x0) * s + margin;
  const Y = (y: number) => (B.y1 - y) * s + margin;
  const P = (p: Pt) => `${n(X(p[0]))},${n(Y(p[1]))}`;

  const fillOf = (f: Fill | undefined): string => {
    if (!f) return "none";
    if (f === "tile") return `url(#${pid}-tile)`;
    if (f === "paper") return C.paper === "none" ? "#ffffff" : C.paper;
    return C[f];
  };
  const strokeAttrs = (p: Prim): string => {
    if (p.noStroke) return `stroke="none"`;
    const w = W[p.weight ?? "light"];
    const dash = p.line && p.line !== "solid" ? ` stroke-dasharray="${DASH[p.line]}"` : "";
    const cap = p.line === "dotted" ? "round" : "butt";
    return `stroke="${C.ink}" stroke-width="${n(w)}" stroke-linecap="${cap}" stroke-linejoin="round"${dash}`;
  };

  const out: string[] = [];
  out.push(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${n(width)}mm" height="${n(height)}mm" viewBox="0 0 ${n(width)} ${n(height)}" font-family="${esc(font)}" data-drawing="${esc(d.id)}" data-scale="1:${scale}">`,
  );
  out.push(`<title>${esc(`${d.title} · M 1:${scale}`)}</title>`);
  out.push(
    `<defs><pattern id="${pid}-tile" patternUnits="userSpaceOnUse" width="${n(15 * s)}" height="${n(7.5 * s)}"><rect width="${n(15 * s)}" height="${n(7.5 * s)}" fill="${C.tile}"/><path d="M0 0H${n(15 * s)}M0 0V${n(7.5 * s)}" stroke="${C.ink}" stroke-opacity=".35" stroke-width="${n(W.fine * 0.7)}" fill="none"/></pattern></defs>`,
  );
  if (C.paper !== "none") out.push(`<rect width="${n(width)}" height="${n(height)}" fill="${C.paper}"/>`);

  // ---- primitives, in the model's order (backgrounds first), grouped by layer runs
  let layer: string | null = null;
  for (const p of d.prims) {
    if (p.layer !== layer) {
      if (layer !== null) out.push("</g>");
      out.push(`<g data-layer="${p.layer}">`);
      layer = p.layer;
    }
    const st = strokeAttrs(p);
    switch (p.t) {
      case "line":
        out.push(`<line x1="${n(X(p.a[0]))}" y1="${n(Y(p.a[1]))}" x2="${n(X(p.b[0]))}" y2="${n(Y(p.b[1]))}" ${st}/>`);
        break;
      case "poly": {
        const pts = p.pts.map(P).join(" ");
        if (p.closed) out.push(`<polygon points="${pts}" fill="${fillOf(p.fill)}" ${st}/>`);
        else out.push(`<polyline points="${pts}" fill="none" ${st}/>`);
        break;
      }
      case "circle":
        out.push(`<circle cx="${n(X(p.c[0]))}" cy="${n(Y(p.c[1]))}" r="${n(p.r * s)}" fill="${fillOf(p.fill)}" ${st}/>`);
        break;
      case "arc": {
        const a0 = (p.a0 * Math.PI) / 180;
        const a1 = (p.a1 * Math.PI) / 180;
        const sweep = ((p.a1 - p.a0) % 360 + 360) % 360;
        const x0 = X(p.c[0] + p.r * Math.cos(a0));
        const y0 = Y(p.c[1] + p.r * Math.sin(a0));
        const x1 = X(p.c[0] + p.r * Math.cos(a1));
        const y1 = Y(p.c[1] + p.r * Math.sin(a1));
        // counter-clockwise in the y-up drawing = clockwise on paper (sweep-flag 0)
        out.push(`<path d="M${n(x0)} ${n(y0)}A${n(p.r * s)} ${n(p.r * s)} 0 ${sweep > 180 ? 1 : 0} 0 ${n(x1)} ${n(y1)}" fill="none" ${st}/>`);
        break;
      }
      case "text": {
        const anchor = p.align === "left" ? "start" : p.align === "right" ? "end" : "middle";
        const x = X(p.at[0]);
        const y = Y(p.at[1]) + p.size * 0.35;
        const rot = p.rot ? ` transform="rotate(${n(-p.rot)} ${n(X(p.at[0]))} ${n(Y(p.at[1]))})"` : "";
        out.push(`<text x="${n(x)}" y="${n(y)}" font-size="${n(p.size)}" text-anchor="${anchor}" fill="${C.ink}"${rot}>${esc(p.text)}</text>`);
        break;
      }
    }
  }
  if (layer !== null) out.push("</g>");

  // ---- element tags
  if (labels !== "none" && d.tags.length) {
    out.push(`<g data-layer="tekst" fill="${C.ink}" text-anchor="middle">`);
    for (const t of d.tags) {
      const bw = (t.box.x1 - t.box.x0) * s;
      const bh = (t.box.y1 - t.box.y0) * s;
      const cx = X((t.box.x0 + t.box.x1) / 2);
      const cy = Y((t.box.y0 + t.box.y1) / 2);
      const halo = C.paper === "none" ? "#ffffff" : C.paper;
      const attrs = `stroke="${halo}" stroke-width="0.7" stroke-linejoin="round" paint-order="stroke"`;
      const size = Math.min(2.6, Math.max(1.6, Math.min(bw, bh) * 0.4));
      if (bw < 3 || bh < 2.5) continue;
      const lines: { text: string; size: number; bold: boolean }[] = [];
      if (labels === "label" || labels === "both") lines.push({ text: t.label, size, bold: true });
      if (labels === "name" || labels === "both") {
        const ns = Math.min(size * 0.8, 2);
        const max = Math.max(3, Math.floor(bw / (ns * 0.56)));
        const name = t.name.length > max ? `${t.name.slice(0, Math.max(1, max - 1))}…` : t.name;
        if (bw >= 8 && bh >= (lines.length ? 6 : 3)) lines.push({ text: name, size: ns, bold: false });
      }
      const total = lines.reduce((a, l) => a + l.size * 1.2, 0);
      let y = cy - total / 2;
      for (const l of lines) {
        y += l.size * 1.2;
        out.push(`<text x="${n(cx)}" y="${n(y - l.size * 0.25)}" font-size="${n(l.size)}"${l.bold ? ' font-weight="600"' : ""} ${attrs}>${esc(l.text)}</text>`);
      }
    }
    out.push("</g>");
  }

  // ---- dimensions
  if (dims.length) {
    out.push(`<g data-layer="kota" stroke="${C.accent}" fill="${C.accent}">`);
    for (const l of dims) out.push(dimSvg(l, th, X, Y, W));
    out.push("</g>");
  }

  // ---- title
  if (showTitle) {
    const ty = drawH + 3.6;
    out.push(`<g data-layer="naslov" fill="${C.ink}">`);
    out.push(`<text x="${n(margin)}" y="${n(ty)}" font-size="3.4" font-weight="600">${esc(d.title)} <tspan font-weight="400" fill="${C.muted}">· M 1:${scale}</tspan></text>`);
    if (d.subtitle) out.push(`<text x="${n(margin)}" y="${n(ty + 4.2)}" font-size="2.3" fill="${C.muted}">${esc(d.subtitle)}</text>`);
    out.push("</g>");
  }
  out.push("</svg>");
  return { svg: out.join(""), width, height, scale };
}

function dimSvg(l: DimLayout, th: number, X: (x: number) => number, Y: (y: number) => number, W: Record<Weight, number>): string {
  const d = l.d;
  const horiz = d.axis === "x";
  const parts: string[] = [];
  const thin = n(W.fine);
  // paper points of the two measured points' feet on the dimension line
  const foot = (p: Pt): [number, number] => (horiz ? [X(p[0]), Y(l.at)] : [X(l.at), Y(p[1])]);
  const fa = foot(d.a);
  const fb = foot(d.b);
  // extension lines (paper): from the measured point (less a gap) to past the line
  for (const p of [d.a, d.b]) {
    const px = X(p[0]);
    const py = Y(p[1]);
    const [fx, fy] = foot(p);
    const len = horiz ? fy - py : fx - px;
    const sg = Math.sign(len) || 1;
    if (Math.abs(len) > EXT_GAP + 0.2) {
      if (horiz) parts.push(`<line x1="${n(px)}" y1="${n(py + sg * EXT_GAP)}" x2="${n(fx)}" y2="${n(fy + sg * EXT_OVER)}" stroke-width="${thin}"/>`);
      else parts.push(`<line x1="${n(px + sg * EXT_GAP)}" y1="${n(py)}" x2="${n(fx + sg * EXT_OVER)}" y2="${n(fy)}" stroke-width="${thin}"/>`);
    }
  }
  // the dimension line, a little past both ticks
  if (horiz) {
    const a = Math.min(fa[0], fb[0]) - EXT_OVER;
    const b = Math.max(fa[0], fb[0]) + EXT_OVER;
    parts.push(`<line x1="${n(a)}" y1="${n(fa[1])}" x2="${n(b)}" y2="${n(fa[1])}" stroke-width="${thin}"/>`);
  } else {
    const a = Math.min(fa[1], fb[1]) - EXT_OVER;
    const b = Math.max(fa[1], fb[1]) + EXT_OVER;
    parts.push(`<line x1="${n(fa[0])}" y1="${n(a)}" x2="${n(fa[0])}" y2="${n(b)}" stroke-width="${thin}"/>`);
  }
  // oblique ticks
  for (const [fx, fy] of [fa, fb]) parts.push(`<line x1="${n(fx - TICK)}" y1="${n(fy + TICK)}" x2="${n(fx + TICK)}" y2="${n(fy - TICK)}" stroke-width="${n(W.medium)}"/>`);
  // the text: above a horizontal line, left of a vertical one (read from the right)
  const t = esc(dimText(d));
  if (horiz) {
    const x = X(l.textAlong);
    const y = Y(l.at) - l.textOff;
    parts.push(`<text x="${n(x)}" y="${n(y)}" font-size="${n(th)}" text-anchor="middle" stroke="none">${t}</text>`);
  } else {
    const x = X(l.at) - l.textOff;
    const y = Y(l.textAlong);
    parts.push(`<text x="${n(x)}" y="${n(y)}" font-size="${n(th)}" text-anchor="middle" stroke="none" transform="rotate(-90 ${n(x)} ${n(y)})">${t}</text>`);
  }
  return parts.join("");
}
