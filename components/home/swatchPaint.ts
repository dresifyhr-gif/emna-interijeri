/**
 * Procedural material swatches for the homepage, painted on a 2D canvas from the catalogue's
 * `render` data (kind + tones). Based on lib/studio/engine/textures.ts (same tones, same seeded noise),
 * tuned for close-up viewing, and without three.js. Browser-only (uses canvas).
 *
 * Painting is heavy (thousands of strokes, marble veins with shadow blur — easily 100+ ms per swatch on a
 * laptop), so paintSwatches() in swatchTexture.ts runs it in a Web Worker (swatch.worker.ts).
 * No DOM at module level and no worker spawning here: the worker imports this file, and a worker that
 * imports the module which spawns it is an import cycle that hangs Turbopack's production build.
 */

import type { MaterialRender } from "@/lib/studio/catalog";

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace("#", ""), 16);
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  const r = f((n >> 16) & 255);
  const g = f((n >> 8) & 255);
  const b = f(n & 255);
  return `rgb(${r},${g},${b})`;
}

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

function wood(g: Ctx, w: number, h: number, tones: [string, string, string], rnd: () => number, k: number) {
  const [base, dark, light] = tones;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 9; i++) {
    const x = rnd() * w;
    const bw = (0.04 + rnd() * 0.12) * w;
    g.globalAlpha = 0.05 + rnd() * 0.07;
    g.fillStyle = rnd() < 0.5 ? dark : light;
    g.fillRect(x, 0, bw, h);
    g.fillRect(x - w, 0, bw, h);
  }
  const n = Math.round(620 * k);
  for (let i = 0; i < n; i++) {
    const x = rnd() * w;
    const amp = (2 + rnd() * 9) * k;
    const periods = Math.max(1, Math.round(0.4 + rnd() * 1.6));
    const ph = rnd() * 6;
    g.strokeStyle = rnd() < 0.62 ? dark : light;
    g.globalAlpha = 0.04 + rnd() * 0.13;
    g.lineWidth = (0.6 + rnd() * 2.4) * k;
    for (const ox of [0, -w, w]) {
      g.beginPath();
      for (let y = 0; y <= h; y += 8) {
        const xx = x + ox + Math.sin((y / h) * Math.PI * 2 * periods + ph) * amp;
        if (y === 0) g.moveTo(xx, y);
        else g.lineTo(xx, y);
      }
      g.stroke();
    }
  }
  g.globalAlpha = 1;
}

function marble(g: Ctx, w: number, h: number, tones: [string, string, string], rnd: () => number, k: number) {
  const [base, dark, mid] = tones;
  const grd = g.createLinearGradient(0, 0, w, h);
  grd.addColorStop(0, base);
  grd.addColorStop(1, shade(base, -0.05));
  g.fillStyle = grd;
  g.fillRect(0, 0, w, h);
  // close-up marble: a few long diagonal veins that flow in one direction, soft clouds round them
  const flow = -0.42;
  const vein = (count: number, lw: number, alpha: number, col: string, blur: number, steps: number, branch: boolean) => {
    for (let i = 0; i < count; i++) {
      let x = rnd() * w * 1.2 - w * 0.1;
      let y = rnd() * h * 1.4 - h * 0.2;
      let ang = flow + (rnd() - 0.5) * 0.5;
      const pts: [number, number][] = [[x, y]];
      for (let s = 0; s < steps; s++) {
        ang += (rnd() - 0.5) * 0.3 + (flow - ang) * 0.04;
        x += Math.cos(ang) * 10 * k;
        y += Math.sin(ang) * 10 * k;
        pts.push([x, y]);
      }
      g.strokeStyle = col;
      g.lineWidth = lw * k;
      g.shadowColor = col;
      g.shadowBlur = blur * k;
      // taper: stroke in short runs with an alpha envelope
      for (let s = 1; s < pts.length; s++) {
        const t = s / pts.length;
        g.globalAlpha = alpha * Math.sin(Math.PI * t) * (0.6 + rnd() * 0.4);
        g.beginPath();
        g.moveTo(pts[s - 1][0], pts[s - 1][1]);
        g.lineTo(pts[s][0], pts[s][1]);
        g.stroke();
      }
      if (branch && pts.length > 20) {
        const from = pts[Math.floor(pts.length * (0.25 + rnd() * 0.5))];
        let bx = from[0];
        let by = from[1];
        let ba = ang + (rnd() < 0.5 ? 0.7 : -0.7);
        g.lineWidth = lw * 0.45 * k;
        for (let s = 0; s < 40; s++) {
          ba += (rnd() - 0.5) * 0.35;
          const nx = bx + Math.cos(ba) * 8 * k;
          const ny = by + Math.sin(ba) * 8 * k;
          g.globalAlpha = alpha * 0.6 * (1 - s / 40);
          g.beginPath();
          g.moveTo(bx, by);
          g.lineTo(nx, ny);
          g.stroke();
          bx = nx;
          by = ny;
        }
      }
    }
  };
  vein(10, 46, 0.05, mid, 40, 160, false);
  vein(5, 2.6, 0.55, dark, 2, 200, true);
  vein(12, 1, 0.3, mid, 1, 120, true);
  g.shadowBlur = 0;
  g.globalAlpha = 1;
}

function stone(g: Ctx, w: number, h: number, tones: [string, string, string], rnd: () => number, k: number) {
  const [base, mid, light] = tones;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  const n = Math.round(30000 * k * k);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    g.fillStyle = r < 0.88 ? mid : light;
    g.globalAlpha = r < 0.88 ? 0.35 + rnd() * 0.5 : 0.25 + rnd() * 0.5;
    const s = (0.6 + rnd() * 1.8) * k;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
  g.globalAlpha = 1;
}

function concrete(g: Ctx, w: number, h: number, tones: [string, string, string], rnd: () => number, k: number) {
  const [base, dark, light] = tones;
  g.fillStyle = base;
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 140; i++) {
    const x = rnd() * w;
    const y = rnd() * h;
    const r = (40 + rnd() * 180) * k;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() < 0.5 ? dark : light);
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.globalAlpha = 0.1 + rnd() * 0.14;
    g.fillStyle = grd;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const n = Math.round(16000 * k * k);
  for (let i = 0; i < n; i++) {
    g.globalAlpha = 0.12 + rnd() * 0.28;
    g.fillStyle = rnd() < 0.7 ? dark : light;
    const s = (0.5 + rnd() * 1.4) * k;
    g.fillRect(rnd() * w, rnd() * h, s, s);
  }
  g.globalAlpha = 1;
}

export interface SwatchTexture {
  url: string;
  /** CSS background-size for a believable scale on screen */
  size: string;
}

/** true when the material is a flat colour and needs no texture */
export const isSolid = (r: MaterialRender) => r.kind === "solid" || !r.tones;

/** canvas size for a swatch of nominal size `size` (marble is painted 2:1) */
export function swatchCanvasSize(render: MaterialRender, size: number): { w: number; h: number } {
  return render.kind === "marble" ? { w: size * 2, h: size } : { w: size, h: size };
}

/** CSS background-size for a believable scale on screen */
export function swatchBackgroundSize(render: MaterialRender): string {
  // on-screen scale: one texture tile ≈ render.tile metres, at ~640 px per metre (desktop swatch height ≈ 0.6 m)
  const tile = render.tile ?? 1;
  const px = Math.round(Math.min(1800, Math.max(320, tile * (render.kind === "marble" ? 760 : 640))));
  return render.kind === "marble" ? `${px}px ${Math.round(px / 2)}px` : `${px}px ${px}px`;
}

/** paints the material into `g` (a canvas of swatchCanvasSize(render, size)); seeded by `key`, so it always looks the same */
export function paintSwatchInto(g: Ctx, key: string, render: MaterialRender, opts: { size: number; horizontal?: boolean }): void {
  if (isSolid(render)) return;
  const S = opts.size;
  const k = S / 1024;
  const { w, h } = swatchCanvasSize(render, S);
  const kind = render.kind;
  const tones = render.tones as [string, string, string];
  const rnd = mulberry32(hashSeed(key));
  if (kind === "wood" && opts.horizontal) {
    // paint vertical grain into a rotated context
    g.translate(w, 0);
    g.rotate(Math.PI / 2);
    wood(g, h, w, tones, rnd, k);
    g.setTransform(1, 0, 0, 1, 0, 0);
  } else if (kind === "wood") wood(g, w, h, tones, rnd, k);
  else if (kind === "marble") marble(g, w, h, tones, rnd, k);
  else if (kind === "stone") stone(g, w, h, tones, rnd, k);
  else concrete(g, w, h, tones, rnd, k);
}

/**
 * Main-thread painter: paints the material and returns an object URL (JPEG). `horizontal` turns wood grain sideways (worktops).
 * Resolves null for solid colours or when canvas is unavailable. Caller must URL.revokeObjectURL().
 */
export function paintSwatch(
  key: string,
  render: MaterialRender,
  opts: { size?: number; horizontal?: boolean } = {},
): Promise<SwatchTexture | null> {
  if (isSolid(render) || typeof document === "undefined") return Promise.resolve(null);
  const S = opts.size ?? 768;
  const { w, h } = swatchCanvasSize(render, S);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const g = canvas.getContext("2d");
  if (!g) return Promise.resolve(null);
  paintSwatchInto(g, key, render, { size: S, horizontal: opts.horizontal });
  const size = swatchBackgroundSize(render);
  return new Promise((resolve) => {
    canvas.toBlob(
      (blob) => {
        canvas.width = canvas.height = 0;
        resolve(blob ? { url: URL.createObjectURL(blob), size } : null);
      },
      "image/jpeg",
      0.88,
    );
  });
}

/* ------------------------------------------------------------------ off the main thread */

export interface SwatchJob {
  /** seed and result key, e.g. "front-hrast" */
  id: string;
  render: MaterialRender;
  size: number;
  horizontal: boolean;
}

/** worker → page */
export type SwatchReply = { id: string; blob: Blob } | { id: string; error: true };
