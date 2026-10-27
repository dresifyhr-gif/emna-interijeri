/**
 * The kitchen PDF, page by page — A4 landscape, Croatian, in the site's look (ink cover, white pages, Inter Tight
 * titles, Inter text, accent hairlines):
 *
 *   naslovnica        wordmark, "Vaša kuhinja", hero render (or the floor plan as line art), date, shape and size,
 *                     key facts, QR code + link that reopen the kitchen in the studio
 *   3D prikazi        2–4 renders from the engine (StudioEngineApi.snapshotViews); left out without WebGL
 *   tlocrt            lib/studio/drawings floorPlan, to scale, with dimensions
 *   nacrti            one page per wall elevation and per side of the island / peninsula, to scale, with a legend
 *   popis elemenata   per wall / run: label, element, position, size, mechanism, opening, glass / notes
 *   materijali        swatches of fronts / worktop / backsplash, then hardware, hood, sink, LED, heights, room
 *   cijena i kontakt  the rough price with its disclaimer (when shown), next steps, the company's contact (only what is
 *                     known) and the link again
 *
 * Pure jsPDF (no DOM): pictures come in as JPEG / PNG data URLs, drawings as toSVG strings painted by svg-paint.ts.
 */

import { jsPDF } from "jspdf";
import { kitchenDrawings, toSVG, type Drawing } from "../studio/drawings";
import { STANDARD_SCALES, fitScale, type SvgOptions } from "../studio/drawings/svg";
import { planKitchen, sanitizeConfig } from "../studio/plan";
import type { KitchenConfig } from "../studio/types";
import { companyFromSite, companyLegal, companyLines, type PdfCompany } from "./company";
import { kitchenPdfContent, type ElementGroup, type ElementRow, type KitchenPdfContent } from "./content";
import { drawQr, qrMatrix } from "./qr";
import { paintSvg } from "./svg-paint";
import { drawSwatch } from "./swatch";
import { C, CONTENT_W, F, PAGE, ellipsize, hairline, opacity, para, registerFonts, setFont, text, textW, wrap, type TextStyle } from "./theme";

export interface PdfImage {
  /** "data:image/jpeg;base64,…" (or PNG) */
  dataUrl: string;
  /** pixels — for the aspect ratio */
  width: number;
  height: number;
  /** caption ("Perspektiva desno") */
  label?: string;
  /**
   * crop a little more around the centre when it fills its box (1 = none, up to 1.5) — for a picture framed loosely, e.g.
   * the whole room; the export's own pictures are framed on the kitchen (browser.ts COVER_REGION / VIEW_REGION) and
   * need none
   */
  zoom?: number;
}

export interface KitchenPdfInput {
  cfg: KitchenConfig;
  /** the link that reopens this kitchen in the studio (QR code and link on the cover and the last page) */
  configUrl: string;
  /** the document's date; absent = now */
  date?: Date;
  /** the cover picture (any aspect: cropped to fill); absent = the floor plan as line art */
  hero?: PdfImage | null;
  /** 3D views for their own page; none = the page is left out */
  views?: PdfImage[];
  /** the company's facts; absent = lib/site.ts only */
  company?: PdfCompany | null;
  /** show the rough price (content.ts pricePolicy) */
  showPrice: boolean;
  /** "Ivan Horvat" — on the cover */
  preparedFor?: string | null;
  /** "Upit U-2026-0012" — on the cover and in the footer */
  reference?: string | null;
  /** "U-2026-0012" — in the file name (index.ts kitchenPdfFileName) */
  fileTag?: string | null;
  /** called between pages, 0..1 */
  onProgress?: (done: number) => void;
}

export interface KitchenPdfDoc {
  pdf: jsPDF;
  pages: number;
  /** the content model the pages were built from */
  content: KitchenPdfContent;
  /** the drawings painted (tlocrt, then the elevations) with their scale */
  drawings: { id: string; scale: number }[];
}

/* ------------------------------------------------------------------ small helpers */

const M = PAGE.mx;
const RIGHT = PAGE.w - PAGE.mx;
/** the content area of a page under its title block */
const BODY_TOP = 47;
const BODY_BOTTOM = 190;

const EYEBROW: TextStyle = { font: "medium", size: 6.3, tracking: 0.24, caps: true, color: C.accent };

/** "26. listopada 2026." */
export function longDate(d: Date): string {
  return new Intl.DateTimeFormat("hr-HR", { day: "numeric", month: "long", year: "numeric", timeZone: "Europe/Zagreb" }).format(d);
}

/** "2026-10-26" in Zagreb */
export function isoDay(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

const imgFormat = (url: string): "JPEG" | "PNG" | "WEBP" => (/^data:image\/png/i.test(url) ? "PNG" : /^data:image\/webp/i.test(url) ? "WEBP" : "JPEG");

/** an image filling a box (cropped to it, PdfImage.zoom more), optionally with rounded corners */
function imageCover(pdf: jsPDF, img: PdfImage, x: number, y: number, w: number, h: number, r: number, alias: string): void {
  const zoom = Number.isFinite(img.zoom) ? Math.min(1.5, Math.max(1, img.zoom as number)) : 1;
  pdf.saveGraphicsState();
  if (r > 0) pdf.roundedRect(x, y, w, h, r, r, null);
  else pdf.rect(x, y, w, h, null);
  pdf.clip();
  pdf.discardPath();
  const iw0 = img.width > 0 ? img.width : w;
  const ih0 = img.height > 0 ? img.height : h;
  const s = Math.max(w / iw0, h / ih0) * zoom;
  const iw = iw0 * s;
  const ih = ih0 * s;
  pdf.addImage(img.dataUrl, imgFormat(img.dataUrl), x + (w - iw) / 2, y + (h - ih) / 2, iw, ih, alias, "NONE");
  pdf.restoreGraphicsState();
}

/**
 * A vertical fade of `colour` from transparent (y0) to opaque (y1). Drawn as stacked rectangles that all reach the
 * opaque end, each a little opacity more: no two bands overlap or leave a gap, so no seam shows over a bright picture
 * (side-by-side bands show a thin line wherever they meet)
 */
function fade(pdf: jsPDF, x: number, y0: number, w: number, y1: number, colour: string, from = 0, to = 1): void {
  const n = Math.max(8, Math.round(Math.abs(y1 - y0) / 0.6));
  const step = (y1 - y0) / n;
  pdf.setFillColor(colour);
  // the opacity laid down so far; each rectangle adds what takes it to the curve at its start
  let shown = 0;
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    // ease: slow start, full at the end
    const want = Math.min(1, Math.max(0, from + (to - from) * (t * t * (3 - 2 * t))));
    if (want <= shown) continue;
    const a = shown >= 1 ? 0 : 1 - (1 - want) / (1 - shown);
    if (a < 0.004) continue;
    opacity(pdf, Math.min(1, a));
    shown = want;
    const ys = y0 + i * step;
    pdf.rect(x, Math.min(ys, y1), w, Math.abs(y1 - ys), "F");
  }
  opacity(pdf, 1);
}

/** the URL without its protocol, shortened in the middle for print */
function shortUrl(url: string, max = 64): string {
  const s = url.replace(/^https?:\/\//i, "");
  return s.length > max ? `${s.slice(0, max - 14)}…${s.slice(-12)}` : s;
}

function eyebrow(pdf: jsPDF, s: string, x: number, y: number, color: string = C.accent, align: "left" | "right" | "center" = "left", size = 6.3): number {
  return text(pdf, s, x, y, { ...EYEBROW, color, align, size });
}

/* ------------------------------------------------------------------ the document */

interface Ctx {
  pdf: jsPDF;
  input: KitchenPdfInput;
  content: KitchenPdfContent;
  company: PdfCompany;
  date: Date;
  section: number;
  qr: ReturnType<typeof qrMatrix> | null;
}

/** a new white content page with its running header */
function contentPage(ctx: Ctx): void {
  const { pdf } = ctx;
  pdf.addPage("a4", "landscape");
  pdf.setFillColor(C.paper);
  pdf.rect(0, 0, PAGE.w, PAGE.h, "F");
  text(pdf, ctx.company.brand.split(" ")[0]?.toUpperCase() || "EMNA", M, PAGE.headY, { font: "display", size: 9, tracking: 0.42, color: C.text });
  eyebrow(pdf, `Vaša kuhinja · ${longDate(ctx.date)}`, RIGHT, PAGE.headY, C.faint, "right", 5.8);
  hairline(pdf, M, PAGE.headRule, RIGHT, C.line, 0.2);
}

/** the title block of a content page: section number + name, the title, a line under it */
function titleBlock(ctx: Ctx, section: string, title: string, sub?: string, newSection = true): void {
  const { pdf } = ctx;
  if (newSection) ctx.section++;
  eyebrow(pdf, `${String(ctx.section).padStart(2, "0")} · ${section}`, M, 28);
  text(pdf, title, M, 37.5, { font: "displayBold", size: 19, caps: true, tracking: -0.01, color: C.text });
  if (sub) text(pdf, sub, M, 43, { font: "sans", size: 7.6, color: C.mut });
}

/** footers on every page but the cover: what this is, the company's site, the page number */
function footers(ctx: Ctx): void {
  const { pdf } = ctx;
  const n = pdf.getNumberOfPages();
  for (let i = 2; i <= n; i++) {
    pdf.setPage(i);
    hairline(pdf, M, PAGE.footRule, RIGHT, C.hair, 0.2);
    const left = [ctx.company.brand, ctx.input.reference || null, "3D studio"].filter(Boolean).join(" · ");
    text(pdf, left, M, PAGE.footY, { font: "sans", size: 6.2, color: C.faint });
    if (ctx.company.web) text(pdf, ctx.company.web, PAGE.w / 2, PAGE.footY, { font: "sans", size: 6.2, color: C.faint, align: "center" });
    text(pdf, `${i} / ${n}`, RIGHT, PAGE.footY, { font: "medium", size: 6.2, color: C.mut, align: "right", tracking: 0.08 });
  }
}

/* ------------------------------------------------------------------ cover */

function cover(ctx: Ctx, planDrawing: Drawing): void {
  const { pdf, content, input } = ctx;
  pdf.setFillColor(C.ink);
  pdf.rect(0, 0, PAGE.w, PAGE.h, "F");
  const heroH = 136;
  if (input.hero) {
    imageCover(pdf, input.hero, 0, 0, PAGE.w, heroH, 0, "hero");
    // the picture melts into the page; a soft veil behind the wordmark
    fade(pdf, 0, heroH - 44, PAGE.w, heroH + 0.5, C.ink, 0, 1);
    fade(pdf, 0, 34, PAGE.w, 0, C.ink, 0, 0.55);
  } else {
    // no 3D (no WebGL): the floor plan as line art
    const area = { x: M + 30, y: 30, w: PAGE.w - 2 * (M + 30), h: heroH - 40 };
    const opts: SvgOptions = {
      fit: { width: area.w, height: area.h },
      labels: "none",
      dims: false,
      title: false,
      margin: 0,
      font: F.sans,
      colors: { ink: "#7d776c", accent: C.accentLight, paper: C.ink, wall: "#2b2a27", section: "#1a1a1b", worktop: "#1b1a18", glass: "#1a1f21", appliance: "#1c1c1c", tile: "#1b1a18", dark: "#5f5a52", muted: "#7d776c" },
    };
    const r = toSVG(planDrawing, opts);
    paintSvg(pdf, r.svg, { x: area.x + (area.w - r.width) / 2, y: area.y + (area.h - r.height) / 2, paper: C.ink });
  }

  // wordmark and the studio line
  const brand = ctx.company.brand;
  const [mark, ...restWords] = brand.split(" ");
  text(pdf, (mark || "EMNA").toUpperCase(), M, 18, { font: "display", size: 14, tracking: 0.42, color: C.fg });
  if (restWords.length) text(pdf, restWords.join(" "), M + 0.3, 23, { font: "medium", size: 5.2, tracking: 0.5, caps: true, color: C.fgMut });
  eyebrow(pdf, "3D studio", RIGHT, 18, C.accentLight, "right");
  text(pdf, longDate(ctx.date), RIGHT, 23, { font: "sans", size: 7, color: C.fgMut, align: "right" });

  // the title
  const top = 148;
  eyebrow(pdf, ellipsize(pdf, input.reference ? `Prijedlog kuhinje · ${input.reference}` : "Prijedlog kuhinje", 200, { ...EYEBROW }), M, top, C.accentLight);
  text(pdf, "Vaša kuhinja", M - 0.6, top + 16, { font: "displayBold", size: 40, caps: true, tracking: -0.02, color: C.fg });
  text(pdf, content.layoutName, M, top + 24.5, { font: "sans", size: 9.5, color: C.fg });
  const shapeW = textW(pdf, content.layoutName, { font: "sans", size: 9.5 });
  // up to the QR code (34 mm at the right margin)
  const dimsLine = ellipsize(pdf, `  ·  ${content.dimensions}`, RIGHT - 34 - 8 - (M + shapeW), { font: "sans", size: 9.5 });
  text(pdf, dimsLine, M + shapeW, top + 24.5, { font: "sans", size: 9.5, color: C.fgMut });
  if (input.preparedFor) {
    const who = ellipsize(pdf, `Pripremljeno za: ${input.preparedFor.replace(/\s+/g, " ").trim()}`, 200, { font: "sans", size: 7.5 });
    text(pdf, who, M, top + 30, { font: "sans", size: 7.5, color: C.fgMut });
  }

  // key facts
  const fy = 186;
  const factsRight = 232;
  hairline(pdf, M, fy - 4.5, factsRight, "#2c2b29", 0.25);
  const facts = content.facts.slice(0, 4);
  const colW = (factsRight - M) / facts.length;
  facts.forEach((f, i) => {
    const x = M + i * colW;
    eyebrow(pdf, f.label, x, fy, C.fgMut, "left", 5.6);
    const v = ellipsize(pdf, f.value, colW - 4, { font: "sans", size: 8.6 });
    text(pdf, v, x, fy + 5.2, { font: f.label === "Okvirna cijena" ? "displayBold" : "sans", size: f.label === "Okvirna cijena" ? 9.4 : 8.6, color: C.fg });
  });

  // QR: reopen the kitchen in the studio
  if (ctx.qr) {
    const size = 34;
    const qx = RIGHT - size;
    const qy = 149;
    pdf.setFillColor(C.paper);
    pdf.roundedRect(qx, qy, size, size, 1.6, 1.6, "F");
    drawQr(pdf, ctx.qr, qx + 1.5, qy + 1.5, size - 3, { dark: C.ink, quiet: 1 });
    pdf.link(qx, qy, size, size, { url: input.configUrl });
    text(pdf, "Otvorite u 3D studiju", qx + size / 2, qy + size + 5, { font: "medium", size: 6.8, color: C.fg, align: "center" });
    const u = shortUrl(input.configUrl, 34);
    text(pdf, u, qx + size / 2, qy + size + 9, { font: "sans", size: 5.4, color: C.fgMut, align: "center" });
  }
}

/* ------------------------------------------------------------------ 3D views */

function viewsPage(ctx: Ctx, views: PdfImage[]): void {
  const { pdf } = ctx;
  contentPage(ctx);
  titleBlock(ctx, "3D prikazi", "Pogledi na kuhinju", "Prikazi iz 3D studija. Boje i materijali na zaslonu i ispisu mogu odstupati od stvarnih uzoraka.");
  const top = BODY_TOP + 1;
  const bottom = BODY_BOTTOM + 2;
  const gap = 6;
  const cap = 7;
  const list = views.slice(0, 4);
  type Cell = { x: number; y: number; w: number; h: number };
  let cells: Cell[];
  if (list.length >= 4) {
    const w = (CONTENT_W - gap) / 2;
    const h = (bottom - top - 2 * cap - gap) / 2;
    cells = [0, 1, 2, 3].map((i) => ({ x: M + (i % 2) * (w + gap), y: top + Math.floor(i / 2) * (h + cap + gap), w, h }));
  } else if (list.length === 3) {
    const bw = CONTENT_W * 0.62;
    const sw = CONTENT_W - bw - gap;
    const sh = (bottom - top - 2 * cap - gap) / 2;
    cells = [
      { x: M, y: top, w: bw, h: bottom - top - cap },
      { x: M + bw + gap, y: top, w: sw, h: sh },
      { x: M + bw + gap, y: top + sh + cap + gap, w: sw, h: sh },
    ];
  } else {
    const n = list.length;
    const w = (CONTENT_W - gap * (n - 1)) / n;
    const h = Math.min(bottom - top - cap, w / 1.6);
    cells = list.map((_, i) => ({ x: M + i * (w + gap), y: top, w, h }));
  }
  list.forEach((img, i) => {
    const c = cells[i];
    pdf.setFillColor(C.ink);
    pdf.roundedRect(c.x, c.y, c.w, c.h, 1.8, 1.8, "F");
    imageCover(pdf, img, c.x, c.y, c.w, c.h, 1.8, `view-${i}`);
    eyebrow(pdf, String(i + 1).padStart(2, "0"), c.x, c.y + c.h + 4.6, C.accent);
    text(pdf, img.label ?? "", c.x + 7, c.y + c.h + 4.6, { font: "sans", size: 7.2, color: C.mut });
  });
}

/* ------------------------------------------------------------------ drawings */

const DRAW_OPTS: SvgOptions = { labels: "label", title: false, margin: 1.5, font: F.sans, colors: { paper: "none" } };
/** the scales a drawing page may take: the standard ones plus 1:30 / 1:40 (common for furniture), largest first */
export const PDF_SCALES = [...new Set([...STANDARD_SCALES, 30, 40])].sort((a, b) => a - b);

/** a scale bar: 0 · 50 · 100 cm (or more at small scales), right-aligned at x */
function scaleBar(pdf: jsPDF, scale: number, xRight: number, y: number): void {
  const mmPerCm = 10 / scale;
  const unit = scale <= 20 ? 20 : scale <= 50 ? 50 : 100;
  const steps = 4;
  const w = unit * steps * mmPerCm;
  const x0 = xRight - w;
  pdf.setLineWidth(0.15);
  pdf.setDrawColor(C.text);
  for (let i = 0; i < steps; i++) {
    pdf.setFillColor(i % 2 ? C.paper : C.text);
    pdf.rect(x0 + i * unit * mmPerCm, y, unit * mmPerCm, 1.1, "FD");
  }
  const label: TextStyle = { font: "sans", size: 5.4, color: C.mut };
  text(pdf, "0", x0, y + 4, { ...label, align: "center" });
  text(pdf, String(unit * 2), x0 + 2 * unit * mmPerCm, y + 4, { ...label, align: "center" });
  text(pdf, `${unit * steps} cm`, xRight, y + 4, { ...label, align: "center" });
}

/** element legend of a drawing (its tags), in columns; returns the height it takes */
function legendHeight(n: number, cols: number): number {
  return n ? Math.ceil(n / cols) * 3.6 + 6 : 0;
}

function drawLegend(pdf: jsPDF, d: Drawing, x: number, y: number, w: number, cols: number): void {
  const tags = [...d.tags].sort((a, b) => a.label.localeCompare(b.label, "hr", { numeric: true }));
  if (!tags.length) return;
  hairline(pdf, x, y, x + w, C.hair, 0.2);
  const colW = w / cols;
  const rows = Math.ceil(tags.length / cols);
  tags.forEach((t, i) => {
    const cx = x + Math.floor(i / rows) * colW;
    const cy = y + 5 + (i % rows) * 3.6;
    text(pdf, t.label, cx, cy, { font: "sansBold", size: 6.4, color: C.accent });
    const name = ellipsize(pdf, `${t.name} · ${Math.round(t.width)}`, colW - 11, { font: "sans", size: 6.4 });
    text(pdf, name, cx + 7.5, cy, { font: "sans", size: 6.4, color: C.text });
  });
}

/** the legend beside the drawing: one column of label · name · width, as wide as this */
const SIDE_LEGEND_W = 62;
const SIDE_LEGEND_GAP = 8;
const SIDE_ROW = 4.3;
/** the legend's head (eyebrow and its rule) above the first row */
const SIDE_HEAD = 7.5;

/** how many legend rows fit beside a drawing */
const sideLegendRows = () => Math.floor((BODY_BOTTOM - BODY_TOP - SIDE_HEAD) / SIDE_ROW);

function drawSideLegend(pdf: jsPDF, d: Drawing, x: number, y: number, w: number): void {
  const tags = [...d.tags].sort((a, b) => a.label.localeCompare(b.label, "hr", { numeric: true }));
  eyebrow(pdf, "Elementi", x, y + 2.4, C.accent, "left", 5.6);
  text(pdf, "širina", x + w, y + 2.4, { ...EYEBROW, size: 5.2, color: C.faint, align: "right" });
  hairline(pdf, x, y + 4.4, x + w, C.line, 0.25);
  tags.forEach((t, i) => {
    const cy = y + SIDE_HEAD + 2.6 + i * SIDE_ROW;
    text(pdf, t.label, x, cy, { font: "sansBold", size: 6.6, color: C.accent });
    const wTxt = String(Math.round(t.width));
    const ww = textW(pdf, wTxt, { font: "sans", size: 6.6 });
    text(pdf, ellipsize(pdf, t.name, w - 8 - ww - 3, { font: "sans", size: 6.6 }), x + 8, cy, { font: "sans", size: 6.6, color: C.text });
    text(pdf, wTxt, x + w, cy, { font: "sans", size: 6.6, color: C.mut, align: "right" });
    hairline(pdf, x, cy + 1.7, x + w, C.hair, 0.15);
  });
}

/**
 * A drawing to scale in the page body, with its element legend under it (four columns) or beside it (one column) —
 * whichever lets the drawing take the larger scale (a wall elevation is about as tall as it is wide: beside it, it
 * gains a step, 1:30 → 1:25); returns its scale
 */
function drawingPage(ctx: Ctx, d: Drawing, section: string, title: string, newSection: boolean, legend: boolean): number {
  const { pdf } = ctx;
  contentPage(ctx);
  titleBlock(ctx, section, title, [d.subtitle, "kote u cm"].filter(Boolean).join(" · "), newSection);
  const cols = 4;
  const n = legend ? d.tags.length : 0;
  const opts: SvgOptions = { ...DRAW_OPTS, scales: PDF_SCALES };
  const bodyH = BODY_BOTTOM - BODY_TOP;
  const lh = n ? legendHeight(n, cols) : 0;
  const under = { x: M, y: BODY_TOP, w: CONTENT_W, h: bodyH - lh - (lh ? 2 : 0) };
  const beside = { x: M, y: BODY_TOP, w: CONTENT_W - SIDE_LEGEND_W - SIDE_LEGEND_GAP, h: bodyH };
  const scaleUnder = fitScale(d, { width: under.w, height: under.h }, opts);
  const scaleBeside = n && n <= sideLegendRows() ? fitScale(d, { width: beside.w, height: beside.h }, opts) : Infinity;
  const side = scaleBeside < scaleUnder;
  const area = side ? beside : under;
  const scale = side ? scaleBeside : scaleUnder;
  const r = toSVG(d, { ...DRAW_OPTS, scale, idPrefix: `${d.id}-pdf` });
  paintSvg(pdf, r.svg, { x: area.x + Math.max(0, (area.w - r.width) / 2), y: area.y + Math.max(0, (area.h - r.height) / 2), paper: C.paper });
  // scale on the title row
  text(pdf, `M 1:${scale}`, RIGHT, 30, { font: "displayBold", size: 10, color: C.text, align: "right" });
  scaleBar(pdf, scale, RIGHT, 34.5);
  if (side) drawSideLegend(pdf, d, RIGHT - SIDE_LEGEND_W, BODY_TOP + 1, SIDE_LEGEND_W);
  else if (lh) drawLegend(pdf, d, M, BODY_BOTTOM - lh + 1, CONTENT_W, cols);
  return scale;
}

/* ------------------------------------------------------------------ element list */

interface Col {
  key: keyof ElementRow;
  title: string;
  w: number;
  style: TextStyle;
}

const ROW: TextStyle = { font: "sans", size: 7, color: C.text };
/** the columns (277 mm): the description gets the room, so most rows stay on one line */
const COLS: Col[] = [
  { key: "label", title: "Oznaka", w: 14, style: { font: "sansBold", size: 7.2, color: C.accent } },
  { key: "name", title: "Element", w: 45, style: { font: "sansBold", size: 7, color: C.text } },
  { key: "position", title: "Položaj", w: 18, style: { ...ROW, color: C.mut } },
  { key: "size", title: "Š × V × D", w: 25, style: ROW },
  { key: "description", title: "Mehanizam i opis", w: 109, style: { ...ROW, color: C.mut } },
  { key: "opening", title: "Otvaranje", w: 22, style: ROW },
  { key: "notes", title: "Staklo i napomene", w: 44, style: { ...ROW, color: C.mut } },
];

/** vertical rhythm of the table (mm): line lead, padding above / below a row's text, the space above a group's head */
interface TableMetrics {
  lead: number;
  padT: number;
  padB: number;
  headGap: number;
}
const TABLE: TableMetrics = { lead: 2.95, padT: 3.4, padB: 1.5, headGap: 5.6 };
/** a little tighter — used when that keeps the whole list on one page (no page with two lone rows) */
const TABLE_TIGHT: TableMetrics = { lead: 2.85, padT: 3.05, padB: 1.15, headGap: 4.9 };

function tableHeader(pdf: jsPDF, y: number): number {
  let x = M;
  for (const c of COLS) {
    eyebrow(pdf, c.title, x, y, C.faint, "left", 5.5);
    x += c.w;
  }
  hairline(pdf, M, y + 2.2, RIGHT, C.line, 0.25);
  return y + 2.2;
}

/**
 * The element list over as many pages as it takes (the head repeats, a group's head stays with its first row).
 * `dry` only measures: no page is added and nothing is drawn. Returns the number of pages.
 */
function elementTable(ctx: Ctx, m: TableMetrics, dry: boolean): number {
  const { pdf, content } = ctx;
  let pages = 0;
  let y = 0;
  const newPage = () => {
    const first = pages === 0;
    pages++;
    if (dry) {
      y = BODY_TOP + 1 + 2.2;
      return;
    }
    contentPage(ctx);
    titleBlock(
      ctx,
      "Popis elemenata",
      first ? "Popis elemenata" : "Popis elemenata (nastavak)",
      first ? `${content.layoutName} · oznake kao na nacrtima · položaj u cm od lijevog kraja zida (gledano prema zidu) · mjere korpusa u cm` : undefined,
      first,
    );
    y = tableHeader(pdf, BODY_TOP + 1);
  };
  newPage();

  const rowLines = (r: ElementRow) => COLS.map((c) => wrap(pdf, String(r[c.key] ?? "") || "", c.w - 2.5, c.style));
  const rowHeight = (lines: string[][]) => m.padT + (Math.max(...lines.map((l) => l.length)) - 1) * m.lead + m.padB;
  const groupHead = (g: ElementGroup, cont: boolean) => {
    y += m.headGap;
    if (!dry) {
      text(pdf, cont ? `${g.title} (nastavak)` : g.title, M, y, { font: "display", size: 9.2, color: C.text, caps: true, tracking: 0.04 });
      const right = `fronte: ${g.front} · ${g.rows.length === 1 ? "1 element" : `${g.rows.length} el.`}`;
      text(pdf, right, RIGHT, y, { font: "sans", size: 6.6, color: C.mut, align: "right" });
    }
    y += 1.6;
    if (!dry) hairline(pdf, M, y, RIGHT, C.text, 0.3);
  };

  for (const g of content.groups) {
    // keep the group's head with at least its first row
    const firstH = g.rows.length ? rowHeight(rowLines(g.rows[0])) : 0;
    if (y + m.headGap + 1.6 + firstH > BODY_BOTTOM + 3) newPage();
    groupHead(g, false);
    g.rows.forEach((r, i) => {
      const lines = rowLines(r);
      const h = rowHeight(lines);
      if (y + h > BODY_BOTTOM + 3) {
        newPage();
        groupHead(g, true);
      }
      if (!dry) {
        let x = M;
        COLS.forEach((c, ci) => {
          setFont(pdf, c.style);
          lines[ci].forEach((l, li) => pdf.text(l, x, y + m.padT + li * m.lead));
          x += c.w;
        });
      }
      y += h;
      if (i < g.rows.length - 1 && !dry) hairline(pdf, M, y, RIGHT, C.hair, 0.15);
    });
    if (g.notes.length) {
      y += 1.4;
      for (const n of g.notes) {
        const lines = wrap(pdf, n, CONTENT_W - 13, { font: "sans", size: 6.8 });
        if (y + lines.length * 3 + 2 > BODY_BOTTOM + 2) newPage();
        if (!dry) {
          text(pdf, "—", M + 3, y + 3, { font: "sans", size: 6.8, color: C.accent });
          setFont(pdf, { font: "sans", size: 6.8, color: C.mut });
          lines.forEach((l, li) => pdf.text(l, M + 13, y + 3 + li * 3));
        }
        y += lines.length * 3 + 0.4;
      }
    }
  }

  if (content.warnings.length) {
    const lines = content.warnings.flatMap((w) => wrap(pdf, w, CONTENT_W - 13, { font: "sans", size: 6.8 }));
    if (y + 12 + lines.length * 3 > BODY_BOTTOM + 2) newPage();
    y += 8;
    if (!dry) eyebrow(pdf, "Napomene planera", M, y, C.accent);
    y += 1.5;
    for (const w of content.warnings) {
      const ls = wrap(pdf, w, CONTENT_W - 13, { font: "sans", size: 6.8 });
      if (!dry) {
        setFont(pdf, { font: "sans", size: 6.8, color: C.mut });
        ls.forEach((l, li) => pdf.text(l, M + 13, y + 3 + li * 3));
        text(pdf, "!", M + 3.5, y + 3, { font: "sansBold", size: 6.8, color: C.accent });
      }
      y += ls.length * 3 + 0.6;
    }
  }
  return pages;
}

function elementPages(ctx: Ctx): void {
  const tight = elementTable(ctx, TABLE, true) > 1 && elementTable(ctx, TABLE_TIGHT, true) === 1;
  elementTable(ctx, tight ? TABLE_TIGHT : TABLE, false);
}

/* ------------------------------------------------------------------ materials */

function materialsPage(ctx: Ctx): void {
  const { pdf, content } = ctx;
  contentPage(ctx);
  titleBlock(ctx, "Materijali i oprema", "Materijali i oprema", "Uzorci su prikazani približno — konačne boje i dekore biramo zajedno na stvarnim uzorcima.");
  const cards = content.materials.cards;
  const gap = 6;
  const n = Math.max(1, cards.length);
  const cw = Math.min(86, (CONTENT_W - gap * (n - 1)) / n);
  const sh = Math.min(44, cw * 0.56);
  let y = BODY_TOP + 1;
  cards.forEach((c, i) => {
    const x = M + i * (cw + gap);
    if (c.swatch) drawSwatch(pdf, c.swatch, x, y, cw, sh, 1.8);
    else {
      pdf.setFillColor(C.warm);
      pdf.roundedRect(x, y, cw, sh, 1.8, 1.8, "F");
    }
    eyebrow(pdf, ellipsize(pdf, c.label, cw - 1, { ...EYEBROW, size: 5.6 }), x, y + sh + 5, C.accent, "left", 5.6);
    const nameLines = wrap(pdf, c.name, cw - 1, { font: "display", size: 10.5 }).slice(0, 2);
    setFont(pdf, { font: "display", size: 10.5, color: C.text });
    nameLines.forEach((l, li) => pdf.text(l, x, y + sh + 10.5 + li * 4.4));
    if (c.note) para(pdf, c.note, x, y + sh + 11 + nameLines.length * 4.4, cw - 1, { font: "sans", size: 6.8, color: C.mut, lead: 3, maxLines: 2 });
  });
  y += sh + 26;

  // the rest in two columns of label / value lines
  const lines = content.materials.lines;
  const colGap = 12;
  const colW = (CONTENT_W - colGap) / 2;
  const labelW = 33;
  const half = Math.ceil(lines.length / 2);
  const cols = [lines.slice(0, half), lines.slice(half)];
  cols.forEach((list, ci) => {
    let yy = y;
    const x = M + ci * (colW + colGap);
    hairline(pdf, x, yy - 4, x + colW, C.line, 0.25);
    for (const l of list) {
      const vx = x + labelW + (l.swatch ? 6 : 0);
      const vl = wrap(pdf, l.value, x + colW - vx, { font: "sans", size: 7.6 });
      if (yy + vl.length * 3.4 > BODY_BOTTOM + 4) break;
      eyebrow(pdf, l.label, x, yy, C.mut, "left", 5.4);
      if (l.swatch) drawSwatch(pdf, l.swatch, x + labelW, yy - 3, 4, 4, 0.8, "#cfc7b9");
      setFont(pdf, { font: "sans", size: 7.6, color: C.text });
      vl.forEach((t, ti) => pdf.text(t, vx, yy + ti * 3.4));
      yy += vl.length * 3.4 + 2.6;
      hairline(pdf, x, yy - 1.6, x + colW, C.hair, 0.15);
      yy += 1.6;
    }
  });
}

/* ------------------------------------------------------------------ price, next steps, contact */

function closingPage(ctx: Ctx): void {
  const { pdf, content, input } = ctx;
  contentPage(ctx);
  const price = content.price;
  titleBlock(ctx, price ? "Cijena i kontakt" : "Kontakt", price ? "Okvirna cijena i sljedeći koraci" : "Sljedeći koraci");

  const panelW = 78;
  const panelX = RIGHT - panelW;
  const leftW = panelX - M - 12;
  const y = BODY_TOP + 2;

  // ---- the price
  if (price) {
    const colW = leftW * 0.52;
    eyebrow(pdf, "Okvirna cijena", M, y + 1, C.accent);
    text(pdf, price.text, M - 0.4, y + 13.5, { font: "displayBold", size: 26, color: C.text, tracking: -0.01 });
    text(pdf, "okvirno · bez kućanskih aparata · točna ponuda nakon izmjere", M, y + 20, { font: "medium", size: 7, color: C.accent });
    let yy = para(
      pdf,
      "Izračun 3D studija prema elementima, materijalima i opremi u ovom dokumentu (s PDV-om). Točnu cijenu dajemo u ponudi nakon izmjere, kad znamo sve detalje prostora.",
      M,
      y + 27,
      colW,
      { font: "sans", size: 7.4, color: C.mut, lead: 3.3 },
    );
    yy += 3;
    eyebrow(pdf, "Uključeno", M, yy, C.text, "left", 5.6);
    yy += 4.2;
    for (const s of price.included) {
      text(pdf, "+", M, yy, { font: "sansBold", size: 7, color: C.accent });
      yy = para(pdf, s, M + 4, yy, colW - 4, { font: "sans", size: 7.2, color: C.text, lead: 3.1 }) + 0.6;
    }
    yy += 2;
    eyebrow(pdf, "Nije uključeno", M, yy, C.text, "left", 5.6);
    yy += 4.2;
    for (const s of price.excluded) {
      text(pdf, "–", M, yy, { font: "sansBold", size: 7, color: C.mut });
      yy = para(pdf, s, M + 4, yy, colW - 4, { font: "sans", size: 7.2, color: C.mut, lead: 3.1 }) + 0.6;
    }
  }

  // ---- next steps (beside the price, or alone)
  const sx = price ? M + leftW * 0.58 : M;
  const sw = price ? leftW * 0.42 : leftW * 0.62;
  let sy = y + 1;
  eyebrow(pdf, "Sljedeći koraci", sx, sy, C.accent);
  sy += 7;
  content.steps.forEach((s, i) => {
    text(pdf, String(i + 1).padStart(2, "0"), sx, sy + 1, { font: "displayBold", size: 15, color: C.line });
    text(pdf, s.title, sx + 12, sy, { font: "sansBold", size: 8.2, color: C.text });
    sy = para(pdf, s.text, sx + 12, sy + 4.4, sw - 12, { font: "sans", size: 7.2, color: C.mut, lead: 3.2 }) + 5;
  });
  sy += 2;
  hairline(pdf, sx, sy, sx + sw, C.hair, 0.2);
  sy += 5;
  eyebrow(pdf, "O ovom dokumentu", sx, sy, C.faint, "left", 5.6);
  para(
    pdf,
    "Dokument je izrađen u 3D studiju prema mjerama i odabirima koje ste unijeli. Prikazi i nacrti služe za dogovor: točne mjere utvrđujemo izmjerom u vašem prostoru, a boje na zaslonu i ispisu mogu odstupati od uzoraka.",
    sx,
    sy + 4.4,
    sw,
    { font: "sans", size: 6.8, color: C.mut, lead: 3 },
  );

  // ---- the contact panel
  const py = 24;
  const ph = BODY_BOTTOM + 2 - py;
  pdf.setFillColor(C.ink);
  pdf.roundedRect(panelX, py, panelW, ph, 2.4, 2.4, "F");
  const px = panelX + 8;
  const pw = panelW - 16;
  let cy = py + 13;
  const [mark, ...rest] = ctx.company.brand.split(" ");
  text(pdf, (mark || "EMNA").toUpperCase(), px, cy, { font: "display", size: 13, tracking: 0.42, color: C.fg });
  if (rest.length) text(pdf, rest.join(" "), px + 0.2, cy + 4.6, { font: "medium", size: 5, tracking: 0.5, caps: true, color: C.fgMut });
  cy += 14;
  eyebrow(pdf, "Kontakt", px, cy, C.accentLight);
  cy += 6;
  const lines = companyLines(ctx.company);
  for (const l of lines) {
    eyebrow(pdf, l.label, px, cy, C.fgMut, "left", 5.2);
    const vl = wrap(pdf, l.value, pw, { font: "sans", size: 8.2 });
    setFont(pdf, { font: "sans", size: 8.2, color: C.fg });
    vl.forEach((t, ti) => pdf.text(t, px, cy + 4.2 + ti * 3.7));
    if (l.label === "E-mail") pdf.link(px, cy + 1, pw, 4.5, { url: `mailto:${l.value}` });
    if (l.label === "Telefon") pdf.link(px, cy + 1, pw, 4.5, { url: `tel:${l.value.replace(/[^\d+]/g, "")}` });
    cy += 4.2 + vl.length * 3.7 + 2.6;
  }
  if (!lines.length) {
    cy = para(pdf, "Javite nam se preko obrasca za upit na našoj stranici ili iz 3D studija — odgovaramo s pitanjima i prijedlogom izmjere.", px, cy, pw, {
      font: "sans",
      size: 7.6,
      color: C.fg,
      lead: 3.4,
    });
    cy += 3;
  }
  const legal = companyLegal(ctx.company);
  if (legal.length) {
    cy += 1;
    for (const l of legal) cy = para(pdf, l, px, cy, pw, { font: "sans", size: 6.2, color: C.fgMut, lead: 2.8 }) + 0.4;
  }

  // QR at the bottom of the panel
  if (ctx.qr) {
    const size = 30;
    const qy = py + ph - size - 17;
    if (qy > cy + 2) {
      pdf.setFillColor(C.paper);
      pdf.roundedRect(px, qy, size, size, 1.4, 1.4, "F");
      drawQr(pdf, ctx.qr, px + 1.2, qy + 1.2, size - 2.4, { dark: C.ink, quiet: 1 });
      pdf.link(px, qy, size, size, { url: input.configUrl });
      text(pdf, "Vaša kuhinja u 3D studiju", px + size + 4, qy + 4, { font: "medium", size: 6.8, color: C.fg });
      para(pdf, "Skenirajte kod ili otvorite poveznicu: kuhinja se otvara točno ovakva, pa je možete dalje mijenjati.", px + size + 4, qy + 8.4, pw - size - 4, {
        font: "sans",
        size: 6,
        color: C.fgMut,
        lead: 2.7,
      });
    }
    const u = wrap(pdf, shortUrl(input.configUrl, 120), pw, { font: "sans", size: 5.4 }).slice(0, 2);
    setFont(pdf, { font: "sans", size: 5.4, color: C.accentLight });
    u.forEach((t, i) => pdf.text(t, px, py + ph - 9 + i * 2.6));
    pdf.link(px, py + ph - 11.5, pw, 6, { url: input.configUrl });
  }
}

/* ------------------------------------------------------------------ build */

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

/** the whole document (async: it gives the main thread back between pages) */
export async function renderKitchenPdf(input: KitchenPdfInput): Promise<KitchenPdfDoc> {
  const cfg = sanitizeConfig(input.cfg);
  const plan = planKitchen(cfg);
  const content = kitchenPdfContent(cfg, { showPrice: input.showPrice }, plan);
  const date = input.date ?? new Date();
  const company = input.company ?? companyFromSite();
  const pdf = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape", compress: true, putOnlyUsedFonts: true });
  registerFonts(pdf);
  pdf.setProperties({
    title: `Vaša kuhinja — ${company.brand}`,
    subject: `${content.layoutName} · ${content.dimensions}`,
    author: company.brand,
    creator: `${company.brand} · 3D studio`,
    keywords: "kuhinja, 3D studio, nacrt, tlocrt",
  });
  try {
    pdf.setLanguage("hr");
  } catch {
    /* an unknown language code is not worth failing for */
  }
  let qr: ReturnType<typeof qrMatrix> | null = null;
  try {
    qr = input.configUrl ? qrMatrix(input.configUrl) : null;
  } catch {
    qr = null;
  }
  const ctx: Ctx = { pdf, input, content, company, date, section: 0, qr };
  const drawings = kitchenDrawings(plan);
  const views = (input.views ?? []).filter((v) => v.dataUrl.startsWith("data:image/"));
  const steps = 4 + drawings.elevations.length + (views.length ? 1 : 0);
  let done = 0;
  const progress = async () => {
    done++;
    input.onProgress?.(Math.min(1, done / steps));
    await tick();
  };
  const drawn: { id: string; scale: number }[] = [];

  cover(ctx, drawings.plan);
  await progress();
  if (views.length) {
    viewsPage(ctx, views);
    await progress();
  }
  drawn.push({ id: drawings.plan.id, scale: drawingPage(ctx, drawings.plan, "Tlocrt", "Tlocrt", true, false) });
  await progress();
  drawings.elevations.forEach((d, i) => {
    drawn.push({ id: d.id, scale: drawingPage(ctx, d, "Nacrti", d.title, i === 0, true) });
  });
  for (let i = 0; i < drawings.elevations.length; i++) await progress();
  elementPages(ctx);
  await progress();
  materialsPage(ctx);
  closingPage(ctx);
  footers(ctx);
  await progress();
  // the cover is the first page
  pdf.setPage(1);
  return { pdf, pages: pdf.getNumberOfPages(), content, drawings: drawn };
}
