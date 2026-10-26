/**
 * Material swatches as vectors — a front, a worktop, a backsplash or a finish drawn from the same render data the 3D
 * engine uses (catalog MaterialRender / BacksplashDef.render / FinishRender): flat lacquer with a gloss highlight, wood
 * grain, marble veins, stone specks, concrete clouds, brushed metal, glass, tiles. Deterministic (seeded by the colour),
 * so the same material looks the same in every PDF.
 */

import type { jsPDF } from "jspdf";
import { mix, opacity } from "./theme";

export interface SwatchSpec {
  kind: "solid" | "wood" | "marble" | "stone" | "concrete" | "brushed" | "glass" | "tiles";
  /** the base colour (sRGB hex) */
  color: string;
  /** [base, dark, light] */
  tones?: [string, string, string];
  /** lacquer / glass: a soft highlight */
  gloss?: boolean;
  /** marble: a few bold veins (Calacatta) */
  bold?: boolean;
  /** tiles */
  pattern?: "subway" | "hex" | "zellige";
  grout?: string;
}

/** a small deterministic PRNG (mulberry32) seeded by a string */
function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  let a = h >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** draw a swatch in a rounded rectangle (mm) with a hairline edge */
export function drawSwatch(pdf: jsPDF, s: SwatchSpec, x: number, y: number, w: number, h: number, r = 1.6, edge = "#d9d3c8"): void {
  const base = s.tones?.[0] ?? s.color;
  const dark = s.tones?.[1] ?? mix(base, "#000000", 0.25);
  const light = s.tones?.[2] ?? mix(base, "#ffffff", 0.3);
  const rand = rng(`${s.kind}${s.color}${dark}${light}`);
  pdf.saveGraphicsState();
  pdf.roundedRect(x, y, w, h, r, r, null);
  pdf.clip();
  pdf.discardPath();
  pdf.setFillColor(s.kind === "tiles" ? (s.grout ?? mix(base, "#000000", 0.2)) : base);
  pdf.rect(x - 1, y - 1, w + 2, h + 2, "F");
  pdf.setLineDashPattern([], 0);

  switch (s.kind) {
    case "wood": {
      // broad soft bands of the dark / light tones, then fine grain lines that wander a little, then a flame figure
      // (nested arches) — faint, as in a sawn veneer
      let bx = x - 2;
      while (bx < x + w + 2) {
        const bw = 2 + rand() * 7;
        opacity(pdf, 0.12 + rand() * 0.2);
        pdf.setFillColor(rand() < 0.5 ? dark : light);
        pdf.rect(bx, y - 1, bw, h + 2, "F");
        bx += bw + rand() * 4;
      }
      let gx = x - 1;
      while (gx < x + w + 1) {
        const t = rand();
        opacity(pdf, 0.3 + rand() * 0.45);
        pdf.setDrawColor(t < 0.7 ? mix(base, dark, 0.35 + rand() * 0.5) : mix(base, light, 0.4 + rand() * 0.5));
        pdf.setLineWidth(0.06 + rand() * (t < 0.15 ? 0.35 : 0.16));
        const sway = (rand() - 0.5) * 1.6;
        pdf.moveTo(gx, y - 1);
        pdf.curveTo(gx + sway, y + h * 0.33, gx - sway * 0.7, y + h * 0.66, gx + (rand() - 0.5) * 0.8, y + h + 1);
        pdf.stroke();
        gx += 0.25 + rand() * 1.1;
      }
      const flames = 1 + Math.floor(rand() * 2);
      for (let f = 0; f < flames; f++) {
        const cx = x + w * (0.2 + rand() * 0.6);
        const top = y + h * (0.1 + rand() * 0.45);
        pdf.setDrawColor(mix(base, dark, 0.65));
        for (let k = 0; k < 6; k++) {
          const half = 1.8 + k * (1.5 + rand() * 0.6);
          const tk = top + k * (1.3 + rand() * 0.5);
          const shoulder = tk + h * (0.14 + rand() * 0.08);
          opacity(pdf, 0.34 - k * 0.04);
          pdf.setLineWidth(0.1 + rand() * 0.1);
          pdf.moveTo(cx - half, y + h + 1);
          pdf.curveTo(cx - half, shoulder, cx - half * 0.55, tk, cx, tk);
          pdf.curveTo(cx + half * 0.55, tk, cx + half, shoulder, cx + half, y + h + 1);
          pdf.stroke();
        }
      }
      opacity(pdf, 1);
      break;
    }
    case "marble": {
      // depth first: a few large, very faint clouds of the vein tone, then the veins — jagged random walks drifting
      // diagonally across the slab, each drawn as a wide faint halo, a softer body and a crisp core, with thinner veins
      // branching off (Calacatta, `bold`: fewer and stronger)
      // (each cloud is a stack of shrinking ellipses: soft edges, denser in the middle)
      opacity(pdf, 0.012);
      pdf.setFillColor(mix(base, dark, 0.6));
      for (let i = 0; i < 5; i++) {
        const cx = x + rand() * w;
        const cy = y + rand() * h;
        const rx = w * (0.2 + rand() * 0.3);
        const ry = h * (0.15 + rand() * 0.25);
        for (const f of [1, 0.82, 0.64, 0.48, 0.32]) pdf.ellipse(cx, cy, rx * f, ry * f, "F");
      }
      opacity(pdf, 1);
      const walk = (x0: number, y0: number, dir: number, len: number): [number, number][] => {
        const pts: [number, number][] = [[x0, y0]];
        let a = dir;
        let px = x0;
        let py = y0;
        for (let d = 0; d < len; d += 0.9) {
          a += (rand() - 0.5) * 0.55 + (dir - a) * 0.12;
          // now and then a sharp kink, as real veins have
          if (rand() < 0.06) a += (rand() - 0.5) * 1.1;
          px += Math.cos(a) * 0.9;
          py += Math.sin(a) * 0.9;
          pts.push([px, py]);
        }
        return pts;
      };
      const stroke = (pts: [number, number][], width: number, colour: string, alpha: number) => {
        opacity(pdf, alpha);
        pdf.setDrawColor(colour);
        pdf.setLineWidth(width);
        pdf.setLineCap("round");
        pdf.setLineJoin("round");
        pdf.moveTo(pts[0][0], pts[0][1]);
        for (let k = 1; k < pts.length; k++) pdf.lineTo(pts[k][0], pts[k][1]);
        pdf.stroke();
      };
      const veinTone = (t: number) => mix(base, dark, t);
      const main = s.bold ? 2 : 3;
      for (let i = 0; i < main; i++) {
        // from the left edge (or the top), downhill to the right
        const fromTop = rand() < 0.4;
        const x0 = fromTop ? x + rand() * w * 0.6 : x - 1;
        const y0 = fromTop ? y - 1 : y + h * (rand() * 0.8 - 0.1);
        const dir = 0.18 + rand() * 0.45;
        const pts = walk(x0, y0, dir, Math.hypot(w, h) * 1.1);
        const k = s.bold ? 1.6 : 1;
        stroke(pts, 2.6 * k, veinTone(0.35), 0.06);
        stroke(pts, 0.8 * k, veinTone(0.5), 0.12);
        stroke(pts, (0.12 + rand() * 0.1) * k, veinTone(0.75), 0.6);
        // branches
        const nb = 1 + Math.floor(rand() * 3);
        for (let b = 0; b < nb; b++) {
          const at = pts[Math.floor(pts.length * (0.15 + rand() * 0.6))];
          const br = walk(at[0], at[1], dir + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 0.6), w * (0.15 + rand() * 0.35));
          stroke(br, 0.5 * k, veinTone(0.45), 0.09);
          stroke(br, 0.06 + rand() * 0.06, veinTone(0.7), 0.5);
        }
      }
      // hairline veins
      for (let i = 0; i < (s.bold ? 3 : 6); i++) {
        const pts = walk(x + rand() * w - w * 0.2, y + rand() * h, 0.1 + rand() * 0.6, w * (0.3 + rand() * 0.6));
        stroke(pts, 0.05 + rand() * 0.05, veinTone(0.6), 0.45);
      }
      opacity(pdf, 1);
      pdf.setLineCap("butt");
      pdf.setLineJoin("miter");
      break;
    }
    case "stone":
    case "concrete": {
      if (s.kind === "concrete") {
        // soft clouds: stacks of shrinking ellipses, so no hard edge shows
        opacity(pdf, 0.05);
        for (let i = 0; i < 9; i++) {
          pdf.setFillColor(rand() < 0.5 ? dark : light);
          const cx = x + rand() * w;
          const cy = y + rand() * h;
          const rx = Math.min(w, h) * (0.25 + rand() * 0.45);
          const ry = rx * (0.5 + rand() * 0.4);
          for (const f of [1, 0.8, 0.6, 0.42, 0.26]) pdf.ellipse(cx, cy, rx * f, ry * f, "F");
        }
        opacity(pdf, 1);
      }
      const n = Math.round((w * h) / (s.kind === "stone" ? 2.2 : 6));
      for (let i = 0; i < n; i++) {
        pdf.setFillColor(rand() < 0.5 ? mix(base, dark, 0.5 + rand() * 0.5) : mix(base, light, 0.5 + rand() * 0.5));
        pdf.circle(x + rand() * w, y + rand() * h, 0.06 + rand() * (s.kind === "stone" ? 0.22 : 0.12), "F");
      }
      break;
    }
    case "brushed": {
      for (let ly = y - 1; ly < y + h + 1; ly += 0.22 + rand() * 0.3) {
        pdf.setDrawColor(rand() < 0.5 ? mix(base, light, 0.2 + rand() * 0.5) : mix(base, dark, 0.15 + rand() * 0.4));
        pdf.setLineWidth(0.06 + rand() * 0.08);
        pdf.line(x - 1, ly, x + w + 1, ly);
      }
      gloss(pdf, x, y, w, h, light, 0.25);
      break;
    }
    case "tiles": {
      const tw = 6.5;
      const th = s.pattern === "subway" ? 3.25 : 6.5;
      const g = 0.35;
      if (s.pattern === "hex") {
        const R = 2.4;
        const hw = Math.sqrt(3) * R;
        for (let row = 0, cy = y - R; cy < y + h + R; row++, cy += 1.5 * R) {
          for (let cx = x - hw + (row % 2 ? hw / 2 : 0); cx < x + w + hw; cx += hw) {
            pdf.setFillColor(mix(base, rand() < 0.5 ? dark : light, rand() * 0.35));
            const rr = R - g * 0.6;
            pdf.moveTo(cx, cy - rr);
            for (let k = 1; k <= 6; k++) {
              const a = -Math.PI / 2 + (k * Math.PI) / 3;
              pdf.lineTo(cx + rr * Math.cos(a), cy + rr * Math.sin(a));
            }
            pdf.close();
            pdf.fill();
          }
        }
      } else {
        for (let row = 0, ty = y - 1; ty < y + h + 1; row++, ty += th) {
          const off = s.pattern === "subway" && row % 2 ? tw / 2 : 0;
          for (let tx = x - tw + off; tx < x + w + tw; tx += tw) {
            pdf.setFillColor(s.pattern === "zellige" ? mix(base, rand() < 0.5 ? dark : light, rand() * 0.6) : mix(base, light, rand() * 0.2));
            pdf.rect(tx + g / 2, ty + g / 2, tw - g, th - g, "F");
          }
        }
      }
      break;
    }
    case "glass":
      gloss(pdf, x, y, w, h, "#ffffff", 0.22);
      break;
    case "solid":
    default:
      if (s.gloss) gloss(pdf, x, y, w, h, "#ffffff", 0.18);
      break;
  }
  pdf.restoreGraphicsState();
  pdf.setDrawColor(edge);
  pdf.setLineWidth(0.2);
  pdf.setLineDashPattern([], 0);
  pdf.roundedRect(x, y, w, h, r, r, "S");
}

/** a soft diagonal highlight across the top-left (lacquer, glass, brushed metal) */
function gloss(pdf: jsPDF, x: number, y: number, w: number, h: number, colour: string, a: number): void {
  opacity(pdf, a);
  pdf.setFillColor(colour);
  pdf.moveTo(x - 1, y - 1);
  pdf.lineTo(x + w * 0.62, y - 1);
  pdf.lineTo(x + w * 0.18, y + h + 1);
  pdf.lineTo(x - 1, y + h + 1);
  pdf.close();
  pdf.fill();
  opacity(pdf, a * 0.6);
  pdf.moveTo(x + w * 0.7, y - 1);
  pdf.lineTo(x + w * 0.78, y - 1);
  pdf.lineTo(x + w * 0.34, y + h + 1);
  pdf.lineTo(x + w * 0.26, y + h + 1);
  pdf.close();
  pdf.fill();
  opacity(pdf, 1);
}
