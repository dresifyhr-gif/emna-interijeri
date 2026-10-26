/**
 * The PDF's look: A4 landscape pages in millimetres, the site's palette (tailwind.config.ts: ink, paper, accent) and its
 * two typefaces (Inter for text, Space Grotesk for display — fonts/data.ts), plus the small text helpers every page uses.
 *
 * Pure jsPDF calls, no DOM: works in the browser and in Node (the tests render whole documents).
 */

import { GState, type jsPDF } from "jspdf";
import { GROTESK_500, GROTESK_700, INTER_400, INTER_500, INTER_600 } from "./fonts/data";

/** A4 landscape (mm) and the margins of every content page */
export const PAGE = {
  w: 297,
  h: 210,
  /** left / right margin */
  mx: 14,
  /** the running header's baseline and its hairline */
  headY: 13.5,
  headRule: 18.5,
  /** where a content page's title starts */
  titleY: 30,
  /** the running footer's hairline and baseline */
  footRule: 197,
  footY: 202,
} as const;

/** the content width between the margins */
export const CONTENT_W = PAGE.w - 2 * PAGE.mx;

/** site palette (tailwind.config.ts) — dark cover in ink, the rest on white paper */
export const C = {
  /** the cover and the contact panel */
  ink: "#0B0B0C",
  ink2: "#141416",
  /** text on paper */
  text: "#1D1C1A",
  /** muted text on paper (mut.paper) */
  mut: "#6D675D",
  /** quieter still: captions, units */
  faint: "#9A9388",
  /** hairlines on paper (paper.line) and between table rows */
  line: "#CFC7B9",
  hair: "#E8E3DA",
  /** a warm paper tint for panels */
  warm: "#F5F2EC",
  /** accent on paper (accent.deep): eyebrows, dimension lines */
  accent: "#8A7A5C",
  /** accent on dark (accent) */
  accentLight: "#C9B99A",
  /** text on dark (fg) */
  fg: "#F2EFE9",
  fgMut: "#A39D92",
  paper: "#FFFFFF",
} as const;

/** registered font families (jsPDF names) */
export const F = {
  /** Inter: "normal" = 400, "bold" = 600 */
  sans: "Inter",
  /** Inter 500 ("normal") — eyebrows, labels */
  medium: "InterMedium",
  /** Space Grotesk: "normal" = 500, "bold" = 700 */
  display: "SpaceGrotesk",
} as const;

const FONT_FILES: [file: string, data: string, family: string, style: "normal" | "bold"][] = [
  ["Inter-Regular.ttf", INTER_400, F.sans, "normal"],
  ["Inter-SemiBold.ttf", INTER_600, F.sans, "bold"],
  ["Inter-Medium.ttf", INTER_500, F.medium, "normal"],
  ["SpaceGrotesk-Medium.ttf", GROTESK_500, F.display, "normal"],
  ["SpaceGrotesk-Bold.ttf", GROTESK_700, F.display, "bold"],
];

/** the document's fonts (Unicode TrueType: č ć đ š ž …) — once per jsPDF instance */
export function registerFonts(pdf: jsPDF): void {
  for (const [file, data, family, style] of FONT_FILES) {
    pdf.addFileToVFS(file, data);
    pdf.addFont(file, family, style);
  }
  pdf.setFont(F.sans, "normal");
}

/** 1 pt in mm */
export const PT = 25.4 / 72;

export type FontKey = "sans" | "sansBold" | "medium" | "display" | "displayBold";

const FONT_OF: Record<FontKey, [string, string]> = {
  sans: [F.sans, "normal"],
  sansBold: [F.sans, "bold"],
  medium: [F.medium, "normal"],
  display: [F.display, "normal"],
  displayBold: [F.display, "bold"],
};

export interface TextStyle {
  font?: FontKey;
  /** pt */
  size?: number;
  color?: string;
  /** letter spacing in em (0.28 = the site's eyebrow tracking) */
  tracking?: number;
  /** uppercase the text */
  caps?: boolean;
}

export function setFont(pdf: jsPDF, st: TextStyle): void {
  const [family, style] = FONT_OF[st.font ?? "sans"];
  pdf.setFont(family, style);
  pdf.setFontSize(st.size ?? 9);
  pdf.setTextColor(st.color ?? C.text);
}

/** letter spacing (mm) of a style */
const charSpaceOf = (st: TextStyle): number => (st.tracking ? st.tracking * (st.size ?? 9) * PT : 0);

const prep = (s: string, st: TextStyle): string => (st.caps ? s.toLocaleUpperCase("hr") : s);

/** the width (mm) a string takes in a style, letter spacing included */
export function textW(pdf: jsPDF, s: string, st: TextStyle): number {
  setFont(pdf, st);
  const t = prep(s, st);
  return pdf.getTextWidth(t) + charSpaceOf(st) * Math.max(0, t.length - 1);
}

/**
 * One line of text at a baseline (mm). `align` right / center anchor at x; returns the width drawn. Letter-spaced text
 * is placed by its visible width (the trailing space after the last letter is not counted).
 */
export function text(pdf: jsPDF, s: string, x: number, y: number, st: TextStyle & { align?: "left" | "center" | "right" } = {}): number {
  if (!s) return 0;
  const t = prep(s, st);
  const w = textW(pdf, s, st);
  const x0 = st.align === "right" ? x - w : st.align === "center" ? x - w / 2 : x;
  const cs = charSpaceOf(st);
  pdf.text(t, x0, y, cs ? { charSpace: cs } : undefined);
  return w;
}

/** wrap text to a width (mm) in a style — splitTextToSize with the style's font */
export function wrap(pdf: jsPDF, s: string, width: number, st: TextStyle): string[] {
  setFont(pdf, st);
  const out: string[] = [];
  for (const para of prep(s, st).split("\n")) {
    const lines = pdf.splitTextToSize(para, width) as string[];
    out.push(...(lines.length ? lines : [""]));
  }
  return out;
}

/** cut a single line to a width with "…" */
export function ellipsize(pdf: jsPDF, s: string, width: number, st: TextStyle): string {
  if (textW(pdf, s, st) <= width) return s;
  let lo = 0;
  let hi = s.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (textW(pdf, `${s.slice(0, mid).trimEnd()}…`, st) <= width) lo = mid;
    else hi = mid - 1;
  }
  return `${s.slice(0, lo).trimEnd()}…`;
}

/** a paragraph: wrapped lines from a baseline, `lead` mm apart; returns the y after the last line */
export function para(pdf: jsPDF, s: string, x: number, y: number, width: number, st: TextStyle & { lead?: number; maxLines?: number } = {}): number {
  let lines = wrap(pdf, s, width, st);
  if (st.maxLines && lines.length > st.maxLines) {
    lines = lines.slice(0, st.maxLines);
    lines[lines.length - 1] = ellipsize(pdf, `${lines[lines.length - 1]}…`, width, st);
  }
  const lead = st.lead ?? (st.size ?? 9) * PT * 1.45;
  setFont(pdf, st);
  lines.forEach((l, i) => pdf.text(l, x, y + i * lead));
  return y + lines.length * lead;
}

export function hairline(pdf: jsPDF, x0: number, y: number, x1: number, color: string = C.line, width = 0.2): void {
  pdf.setDrawColor(color);
  pdf.setLineWidth(width);
  pdf.setLineDashPattern([], 0);
  pdf.line(x0, y, x1, y);
}

/** "#rrggbb" → [r, g, b] (0–255); anything else → black */
export function rgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) {
    const s = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(hex.trim());
    if (!s) return [0, 0, 0];
    return [parseInt(s[1] + s[1], 16), parseInt(s[2] + s[2], 16), parseInt(s[3] + s[3], 16)];
  }
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** a mix of two colours (t = 0 → a, 1 → b), as "#rrggbb" */
export function mix(a: string, b: string, t: number): string {
  const p = rgb(a);
  const q = rgb(b);
  const h = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
  return `#${h(p[0] + (q[0] - p[0]) * t)}${h(p[1] + (q[1] - p[1]) * t)}${h(p[2] + (q[2] - p[2]) * t)}`;
}

/** relative luminance 0..1 (for picking text on a swatch) */
export function luminance(hex: string): number {
  const [r, g, b] = rgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** an opacity for what follows (fill and stroke); 1 = opaque again */
export function opacity(pdf: jsPDF, a: number): void {
  pdf.setGState(new GState({ opacity: a, "stroke-opacity": a }));
}
