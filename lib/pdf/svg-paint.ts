/**
 * Paints an SVG written by lib/studio/drawings/svg.ts (toSVG) onto a jsPDF page as vectors, at true scale: the SVG's user
 * units are paper millimetres, so a 1:20 drawing stays 1:20 in the PDF. No DOM (works in Node and in a worker), no
 * svg2pdf: toSVG writes a small, regular subset of SVG and this paints exactly that —
 *
 *   <svg viewBox>, <g> (inherited stroke / fill / stroke-width / font-* / text-anchor / paint-order), <rect>, <line>,
 *   <polyline>, <polygon>, <circle>, <path> (M L H V A Z, absolute), <text> with <tspan> runs, transform="rotate(a cx cy)",
 *   stroke-dasharray / -linecap / -linejoin / -opacity, fill="url(#tile)" patterns (a fill plus the pattern's grid lines,
 *   clipped), paint-order="stroke" (the label halo: stroke first, then fill).
 *
 * Text uses the document's own fonts (any font-family → Inter; font-weight ≥ 600 → Inter SemiBold), and anchors with
 * jsPDF's real metrics, so centred dimension texts sit exactly on their lines. Unknown elements are skipped.
 */

import type { jsPDF } from "jspdf";
import { F, PT, mix } from "./theme";

interface Paint {
  stroke: string | null;
  strokeWidth: number;
  dash: number[] | null;
  cap: "butt" | "round" | "square";
  join: "miter" | "round" | "bevel";
  strokeOpacity: number;
  fill: string | null;
  fontSize: number;
  bold: boolean;
  anchor: "start" | "middle" | "end";
  halo: boolean;
}

const ROOT: Paint = {
  stroke: null,
  strokeWidth: 1,
  dash: null,
  cap: "butt",
  join: "miter",
  strokeOpacity: 1,
  fill: "#000000",
  fontSize: 4,
  bold: false,
  anchor: "start",
  halo: false,
};

interface Pattern {
  w: number;
  h: number;
  /** the pattern's background */
  fill: string;
  /** grid lines along its top and left edge */
  line: string | null;
  lineWidth: number;
}

interface Node {
  tag: string;
  attrs: Record<string, string>;
  children: Node[];
  /** text content in order with child elements (for <text>: plain runs and <tspan>s) */
  parts: (string | Node)[];
}

const unescape = (s: string): string =>
  s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (m, e: string) => {
    const k = e.toLowerCase();
    if (k === "amp") return "&";
    if (k === "lt") return "<";
    if (k === "gt") return ">";
    if (k === "quot") return '"';
    if (k === "apos") return "'";
    if (k.startsWith("#x")) return String.fromCodePoint(parseInt(k.slice(2), 16));
    if (k.startsWith("#")) return String.fromCodePoint(parseInt(k.slice(1), 10));
    return m;
  });

/** a tiny XML reader for well-formed, generated SVG (no comments, CDATA or DOCTYPE expected; they are skipped) */
export function parseSvg(svg: string): Node | null {
  const root: Node = { tag: "#root", attrs: {}, children: [], parts: [] };
  const stack: Node[] = [root];
  const re = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<![^>]*>|<\?[^>]*\?>|<(\/?)([a-zA-Z][\w:-]*)((?:\s+[\w:-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(svg))) {
    const top = stack[stack.length - 1];
    if (m[5] !== undefined) {
      top.parts.push(unescape(m[5]));
      continue;
    }
    if (!m[2]) continue;
    if (m[1]) {
      // closing tag: pop to the matching element
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === m[2]) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    const attrs: Record<string, string> = {};
    const ar = /([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[3]))) attrs[a[1]] = unescape(a[2] ?? a[3] ?? "");
    const node: Node = { tag: m[2], attrs, children: [], parts: [] };
    top.children.push(node);
    top.parts.push(node);
    if (!m[4]) stack.push(node);
  }
  return root.children.find((c) => c.tag === "svg") ?? null;
}

const num = (v: string | undefined, d = 0): number => {
  const n = v === undefined ? NaN : parseFloat(v);
  return Number.isFinite(n) ? n : d;
};

const nums = (v: string | undefined): number[] =>
  (v ?? "")
    .trim()
    .split(/[\s,]+/)
    .map(Number)
    .filter((n) => Number.isFinite(n));

function colour(v: string | undefined): string | null | undefined {
  if (v === undefined) return undefined;
  const s = v.trim().toLowerCase();
  if (!s || s === "none" || s === "transparent") return null;
  if (s.startsWith("url(")) return s;
  if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/.test(s)) return s;
  const named: Record<string, string> = { black: "#000000", white: "#ffffff" };
  return named[s] ?? null;
}

function inherit(p: Paint, a: Record<string, string>): Paint {
  const q = { ...p };
  const st = colour(a.stroke);
  if (st !== undefined) q.stroke = st;
  const fi = colour(a.fill);
  if (fi !== undefined) q.fill = fi;
  if (a["stroke-width"] !== undefined) q.strokeWidth = num(a["stroke-width"], q.strokeWidth);
  if (a["stroke-dasharray"] !== undefined) {
    const d = nums(a["stroke-dasharray"]);
    q.dash = d.length && d.some((x) => x > 0) ? d : null;
  }
  if (a["stroke-linecap"] === "round" || a["stroke-linecap"] === "square" || a["stroke-linecap"] === "butt") q.cap = a["stroke-linecap"];
  if (a["stroke-linejoin"] === "round" || a["stroke-linejoin"] === "bevel" || a["stroke-linejoin"] === "miter") q.join = a["stroke-linejoin"];
  if (a["stroke-opacity"] !== undefined) q.strokeOpacity = Math.min(1, Math.max(0, num(a["stroke-opacity"], 1)));
  if (a["font-size"] !== undefined) q.fontSize = num(a["font-size"], q.fontSize);
  if (a["font-weight"] !== undefined) q.bold = a["font-weight"] === "bold" || num(a["font-weight"], 400) >= 600;
  if (a["text-anchor"] === "start" || a["text-anchor"] === "middle" || a["text-anchor"] === "end") q.anchor = a["text-anchor"];
  if (a["paint-order"] !== undefined) q.halo = a["paint-order"].trim().startsWith("stroke");
  return q;
}

export interface SvgPaintOptions {
  /** where the SVG's top-left corner goes on the page (mm) */
  x: number;
  y: number;
  /** page mm per SVG unit; absent = 1 (toSVG's units are mm: true scale) */
  scale?: number;
  /** the colour under the drawing — for opacity on patterns and halos; absent = white */
  paper?: string;
}

export interface SvgPaintResult {
  /** the painted size (mm) */
  width: number;
  height: number;
  /** elements painted */
  count: number;
}

/** an SVG's size (user units, from its viewBox, else width / height) */
export function svgSize(svg: string): { width: number; height: number } | null {
  const root = parseSvg(svg);
  if (!root) return null;
  const vb = nums(root.attrs.viewBox);
  if (vb.length === 4) return { width: vb[2], height: vb[3] };
  const w = num(root.attrs.width, NaN);
  const h = num(root.attrs.height, NaN);
  return Number.isFinite(w) && Number.isFinite(h) ? { width: w, height: h } : null;
}

/** paint `svg` on the current page of `pdf` */
export function paintSvg(pdf: jsPDF, svg: string, opts: SvgPaintOptions): SvgPaintResult {
  const root = parseSvg(svg);
  if (!root) return { width: 0, height: 0, count: 0 };
  const k = opts.scale ?? 1;
  const paper = opts.paper ?? "#ffffff";
  const vb = nums(root.attrs.viewBox);
  const vx = vb.length === 4 ? vb[0] : 0;
  const vy = vb.length === 4 ? vb[1] : 0;
  const width = (vb.length === 4 ? vb[2] : num(root.attrs.width)) * k;
  const height = (vb.length === 4 ? vb[3] : num(root.attrs.height)) * k;
  const X = (x: number) => opts.x + (x - vx) * k;
  const Y = (y: number) => opts.y + (y - vy) * k;

  // patterns (<defs><pattern id>…): their background and the grid lines along their edges
  const patterns = new Map<string, Pattern>();
  const findPatterns = (n: Node) => {
    for (const c of n.children) {
      if (c.tag === "pattern" && c.attrs.id) {
        const r = c.children.find((x) => x.tag === "rect");
        const p = c.children.find((x) => x.tag === "path");
        const lineOpacity = num(p?.attrs["stroke-opacity"], 1);
        const bg = colour(r?.attrs.fill) ?? null;
        const st = colour(p?.attrs.stroke) ?? null;
        patterns.set(c.attrs.id, {
          w: num(c.attrs.width, 10),
          h: num(c.attrs.height, 10),
          fill: bg && !bg.startsWith("url(") ? bg : paper,
          line: st && !st.startsWith("url(") ? mix(bg && !bg.startsWith("url(") ? bg : paper, st, lineOpacity) : null,
          lineWidth: num(p?.attrs["stroke-width"], 0.1),
        });
      } else findPatterns(c);
    }
  };
  findPatterns(root);

  let count = 0;

  const applyStroke = (p: Paint): boolean => {
    if (!p.stroke || p.stroke.startsWith("url(") || p.strokeWidth <= 0) return false;
    pdf.setDrawColor(p.strokeOpacity < 1 ? mix(paper, p.stroke, p.strokeOpacity) : p.stroke);
    pdf.setLineWidth(p.strokeWidth * k);
    pdf.setLineDashPattern(p.dash ? p.dash.map((d) => d * k) : [], 0);
    pdf.setLineCap(p.cap);
    pdf.setLineJoin(p.join);
    return true;
  };

  /** a closed / open path from page points: fill (a colour or a pattern), then stroke */
  const shape = (pts: [number, number][], closed: boolean, p: Paint) => {
    if (pts.length < 2) return;
    const build = () => {
      pdf.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) pdf.lineTo(pts[i][0], pts[i][1]);
      if (closed) pdf.close();
    };
    paintPath(build, closed, p, pts);
  };

  const paintPath = (build: () => void, closed: boolean, p: Paint, bboxPts: [number, number][]) => {
    const fill = closed ? p.fill : null;
    const pat = fill?.startsWith("url(") ? patterns.get(fill.slice(5, -1).replace(/^#/, "").trim()) : undefined;
    if (fill && pat) {
      // a pattern: its background, then its grid lines clipped to the shape
      pdf.setFillColor(pat.fill);
      build();
      pdf.fill();
      if (pat.line) {
        const xs = bboxPts.map((q) => q[0]);
        const ys = bboxPts.map((q) => q[1]);
        const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
        pdf.saveGraphicsState();
        build();
        pdf.clip();
        pdf.discardPath();
        pdf.setDrawColor(pat.line);
        pdf.setLineWidth(pat.lineWidth * k);
        pdf.setLineDashPattern([], 0);
        const pw = pat.w * k;
        const ph = pat.h * k;
        // the pattern's tiles start at the SVG's origin (patternUnits userSpaceOnUse)
        const ox = X(0);
        const oy = Y(0);
        for (let x = ox + Math.floor((x0 - ox) / pw) * pw; x <= x1 + 1e-6; x += pw) pdf.line(x, y0, x, y1);
        for (let y = oy + Math.floor((y0 - oy) / ph) * ph; y <= y1 + 1e-6; y += ph) pdf.line(x0, y, x1, y);
        pdf.restoreGraphicsState();
      }
      if (applyStroke(p)) {
        build();
        pdf.stroke();
      }
      count++;
      return;
    }
    const doFill = Boolean(fill && !fill.startsWith("url("));
    const doStroke = applyStroke(p);
    if (!doFill && !doStroke) return;
    if (doFill) pdf.setFillColor(fill as string);
    build();
    if (doFill && doStroke) pdf.fillStroke();
    else if (doFill) pdf.fill();
    else pdf.stroke();
    count++;
  };

  const setTextFont = (p: Paint) => {
    pdf.setFont(F.sans, p.bold ? "bold" : "normal");
    pdf.setFontSize((p.fontSize * k) / PT);
  };

  /** rotate(a cx cy) of a transform attribute (degrees, the SVG's direction: + = clockwise on the page) */
  const rotationOf = (t: string | undefined): { a: number; cx: number; cy: number } | null => {
    if (!t) return null;
    const m = /rotate\(\s*([-\d.eE]+)(?:[\s,]+([-\d.eE]+)[\s,]+([-\d.eE]+))?\s*\)/.exec(t);
    if (!m) return null;
    return { a: Number(m[1]) || 0, cx: Number(m[2] ?? 0) || 0, cy: Number(m[3] ?? 0) || 0 };
  };

  const paintText = (n: Node, p: Paint) => {
    // runs: plain text in the <text> itself and its <tspan>s, each in its own paint
    const runs: { s: string; p: Paint }[] = [];
    const collect = (node: Node, paint: Paint) => {
      for (const part of node.parts) {
        if (typeof part === "string") {
          const s = part.replace(/\s+/g, " ");
          if (s) runs.push({ s, p: paint });
        } else if (part.tag === "tspan") collect(part, inherit(paint, part.attrs));
      }
    };
    collect(n, p);
    if (!runs.length) return;
    runs[0].s = runs[0].s.replace(/^\s+/, "");
    runs[runs.length - 1].s = runs[runs.length - 1].s.replace(/\s+$/, "");
    const widths = runs.map((r) => {
      setTextFont(r.p);
      return pdf.getTextWidth(r.s);
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let x = X(num(n.attrs.x));
    let y = Y(num(n.attrs.y));
    const rot = rotationOf(n.attrs.transform);
    // the baseline direction on the page (y down): SVG rotate(a) turns it clockwise by a
    let ux = 1;
    let uy = 0;
    let angle = 0;
    if (rot) {
      const r = (rot.a * Math.PI) / 180;
      const cx = X(rot.cx);
      const cy = Y(rot.cy);
      const dx = x - cx;
      const dy = y - cy;
      x = cx + dx * Math.cos(r) - dy * Math.sin(r);
      y = cy + dx * Math.sin(r) + dy * Math.cos(r);
      ux = Math.cos(r);
      uy = Math.sin(r);
      // jsPDF turns text counter-clockwise for a positive angle
      angle = -rot.a;
    }
    const shift = p.anchor === "middle" ? total / 2 : p.anchor === "end" ? total : 0;
    x -= ux * shift;
    y -= uy * shift;
    runs.forEach((r, i) => {
      setTextFont(r.p);
      const fill = r.p.fill && !r.p.fill.startsWith("url(") ? r.p.fill : null;
      const opt = angle ? { angle } : {};
      if (r.p.halo && r.p.stroke && !r.p.stroke.startsWith("url(") && r.p.strokeWidth > 0) {
        pdf.setDrawColor(r.p.stroke);
        pdf.setLineWidth(r.p.strokeWidth * k);
        pdf.setLineDashPattern([], 0);
        pdf.setLineJoin("round");
        pdf.text(r.s, x, y, { ...opt, renderingMode: "stroke" });
      }
      if (fill) {
        pdf.setTextColor(fill);
        pdf.text(r.s, x, y, { ...opt, renderingMode: "fill" });
      }
      x += ux * widths[i];
      y += uy * widths[i];
    });
    count++;
  };

  /** the endpoint arc of a path → cubic béziers (SVG implementation notes F.6) */
  const arcTo = (x1: number, y1: number, rx: number, ry: number, phi: number, large: boolean, sweep: boolean, x2: number, y2: number) => {
    if (rx === 0 || ry === 0) {
      pdf.lineTo(x2, y2);
      return;
    }
    const ph = (phi * Math.PI) / 180;
    const cos = Math.cos(ph);
    const sin = Math.sin(ph);
    const dx = (x1 - x2) / 2;
    const dy = (y1 - y2) / 2;
    const xp = cos * dx + sin * dy;
    const yp = -sin * dx + cos * dy;
    rx = Math.abs(rx);
    ry = Math.abs(ry);
    const lam = (xp * xp) / (rx * rx) + (yp * yp) / (ry * ry);
    if (lam > 1) {
      rx *= Math.sqrt(lam);
      ry *= Math.sqrt(lam);
    }
    const sgn = large === sweep ? -1 : 1;
    const num0 = rx * rx * ry * ry - rx * rx * yp * yp - ry * ry * xp * xp;
    const den = rx * rx * yp * yp + ry * ry * xp * xp;
    const co = sgn * Math.sqrt(Math.max(0, num0 / (den || 1)));
    const cxp = (co * rx * yp) / ry;
    const cyp = (-co * ry * xp) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
    const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux: number, uy: number, vx: number, vy: number) => {
      const a = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
      return a;
    };
    const t1 = ang(1, 0, (xp - cxp) / rx, (yp - cyp) / ry);
    let dt = ang((xp - cxp) / rx, (yp - cyp) / ry, (-xp - cxp) / rx, (-yp - cyp) / ry);
    if (!sweep && dt > 0) dt -= 2 * Math.PI;
    if (sweep && dt < 0) dt += 2 * Math.PI;
    const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2)));
    const d = dt / segs;
    const kk = (4 / 3) * Math.tan(d / 4);
    let t = t1;
    const pt = (a: number): [number, number] => [cx + rx * Math.cos(a) * cos - ry * Math.sin(a) * sin, cy + rx * Math.cos(a) * sin + ry * Math.sin(a) * cos];
    const der = (a: number): [number, number] => [-rx * Math.sin(a) * cos - ry * Math.cos(a) * sin, -rx * Math.sin(a) * sin + ry * Math.cos(a) * cos];
    for (let i = 0; i < segs; i++) {
      const p0 = pt(t);
      const p3 = pt(t + d);
      const d0 = der(t);
      const d3 = der(t + d);
      pdf.curveTo(p0[0] + kk * d0[0], p0[1] + kk * d0[1], p3[0] - kk * d3[0], p3[1] - kk * d3[1], p3[0], p3[1]);
      t += d;
    }
  };

  const paintPathD = (d: string, p: Paint) => {
    const toks = d.match(/[a-zA-Z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g) ?? [];
    let i = 0;
    let closedAny = false;
    const pts: [number, number][] = [];
    const ops: (() => void)[] = [];
    let cx = 0;
    let cy = 0;
    let sx = 0;
    let sy = 0;
    let cmd = "";
    const next = () => Number(toks[i++]);
    while (i < toks.length) {
      if (/[a-zA-Z]/.test(toks[i])) cmd = toks[i++];
      const rel = cmd === cmd.toLowerCase();
      const C = cmd.toUpperCase();
      if (C === "Z") {
        ops.push(() => pdf.close());
        closedAny = true;
        cx = sx;
        cy = sy;
        continue;
      }
      if (C === "M" || C === "L") {
        const x = next() + (rel ? cx : 0);
        const y = next() + (rel ? cy : 0);
        const [px, py] = [X(x), Y(y)];
        if (C === "M") {
          ops.push(() => pdf.moveTo(px, py));
          sx = x;
          sy = y;
          cmd = rel ? "l" : "L";
        } else ops.push(() => pdf.lineTo(px, py));
        pts.push([px, py]);
        cx = x;
        cy = y;
      } else if (C === "H" || C === "V") {
        const v = next();
        if (C === "H") cx = v + (rel ? cx : 0);
        else cy = v + (rel ? cy : 0);
        const [px, py] = [X(cx), Y(cy)];
        ops.push(() => pdf.lineTo(px, py));
        pts.push([px, py]);
      } else if (C === "A") {
        const rx = next();
        const ry = next();
        const phi = next();
        const large = next() !== 0;
        const sweep = next() !== 0;
        const x = next() + (rel ? cx : 0);
        const y = next() + (rel ? cy : 0);
        const [x1, y1] = [X(cx), Y(cy)];
        const [x2, y2] = [X(x), Y(y)];
        ops.push(() => arcTo(x1, y1, rx * k, ry * k, phi, large, sweep, x2, y2));
        pts.push([x2, y2]);
        cx = x;
        cy = y;
      } else {
        // C / S / Q / T are not written by toSVG: stop rather than misdraw
        break;
      }
    }
    if (!ops.length) return;
    paintPath(() => ops.forEach((o) => o()), closedAny, p, pts.length ? pts : [[X(0), Y(0)]]);
  };

  const walk = (n: Node, parent: Paint) => {
    if (n.tag === "defs" || n.tag === "title" || n.tag === "desc" || n.tag === "pattern" || n.tag === "clipPath") return;
    const p = inherit(parent, n.attrs);
    if (n.attrs.display === "none" || n.attrs.visibility === "hidden") return;
    switch (n.tag) {
      case "svg":
      case "g":
        for (const c of n.children) walk(c, p);
        return;
      case "rect": {
        const x = num(n.attrs.x);
        const y = num(n.attrs.y);
        const w = num(n.attrs.width);
        const h = num(n.attrs.height);
        if (w <= 0 || h <= 0) return;
        shape(
          [
            [X(x), Y(y)],
            [X(x + w), Y(y)],
            [X(x + w), Y(y + h)],
            [X(x), Y(y + h)],
          ],
          true,
          p,
        );
        return;
      }
      case "line":
        shape(
          [
            [X(num(n.attrs.x1)), Y(num(n.attrs.y1))],
            [X(num(n.attrs.x2)), Y(num(n.attrs.y2))],
          ],
          false,
          { ...p, fill: null },
        );
        return;
      case "polyline":
      case "polygon": {
        const v = nums(n.attrs.points);
        const pts: [number, number][] = [];
        for (let i = 0; i + 1 < v.length; i += 2) pts.push([X(v[i]), Y(v[i + 1])]);
        shape(pts, n.tag === "polygon", n.tag === "polygon" ? p : { ...p, fill: null });
        return;
      }
      case "circle": {
        const r = num(n.attrs.r) * k;
        if (r <= 0) return;
        const cx = X(num(n.attrs.cx));
        const cy = Y(num(n.attrs.cy));
        // four béziers (a circle as a path, so patterns and fills work like any shape)
        const c = 0.5522847498 * r;
        paintPath(
          () => {
            pdf.moveTo(cx + r, cy);
            pdf.curveTo(cx + r, cy + c, cx + c, cy + r, cx, cy + r);
            pdf.curveTo(cx - c, cy + r, cx - r, cy + c, cx - r, cy);
            pdf.curveTo(cx - r, cy - c, cx - c, cy - r, cx, cy - r);
            pdf.curveTo(cx + c, cy - r, cx + r, cy - c, cx + r, cy);
            pdf.close();
          },
          true,
          p,
          [
            [cx - r, cy - r],
            [cx + r, cy + r],
          ],
        );
        return;
      }
      case "path":
        if (n.attrs.d) paintPathD(n.attrs.d, p);
        return;
      case "text":
        paintText(n, p);
        return;
      default:
        return;
    }
  };

  pdf.saveGraphicsState();
  walk(root, inherit(ROOT, {}));
  pdf.restoreGraphicsState();
  // leave a clean state behind
  pdf.setLineDashPattern([], 0);
  return { width, height, count };
}
