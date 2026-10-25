/**
 * Procedural canvas textures (no image files, no network). Seeded so the same
 * material always looks the same — snapshots are reproducible.
 */

import * as THREE from "three";

export function mulberry32(seed: number): () => number {
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

export interface TexOpts {
  size: number;
  anisotropy: number;
}

/** per-material pattern knobs (catalog MaterialRender.density / veins); the defaults paint what v1 painted */
export interface Detail {
  density?: number;
  veins?: "fine" | "bold";
}

function canvasTex(w: number, h: number, opts: TexOpts, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  if (g) draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = opts.anisotropy;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

/** vertical grain (lines run along the texture's v axis) */
export function woodTexture(id: string, tones: [string, string, string], opts: TexOpts, detail: Detail = {}): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    // broad colour bands (planks / flitches)
    for (let i = 0; i < 9; i++) {
      const x = rnd() * w;
      const bw = (0.04 + rnd() * 0.12) * w;
      g.globalAlpha = 0.05 + rnd() * 0.07;
      g.fillStyle = rnd() < 0.5 ? dark : light;
      g.fillRect(x, 0, bw, h);
      g.fillRect(x - w, 0, bw, h);
    }
    // fine grain lines, wrapping horizontally so the texture tiles
    const n = Math.round(620 * (S / 1024) * (detail.density ?? 1));
    for (let i = 0; i < n; i++) {
      const x = rnd() * w;
      const amp = (2 + rnd() * 9) * (S / 1024);
      const fr = ((0.4 + rnd() * 1.6) * Math.PI * 2) / h;
      const ph = rnd() * 6;
      g.strokeStyle = rnd() < 0.62 ? dark : light;
      g.globalAlpha = 0.04 + rnd() * 0.13;
      g.lineWidth = (0.6 + rnd() * 2.4) * (S / 1024);
      for (const ox of [0, -w, w]) {
        g.beginPath();
        for (let y = 0; y <= h; y += 8) {
          // integer number of periods over h keeps the vertical seam invisible
          const xx = x + ox + Math.sin((y / h) * Math.PI * 2 * Math.max(1, Math.round((fr * h) / (Math.PI * 2))) + ph) * amp;
          if (y === 0) g.moveTo(xx, y);
          else g.lineTo(xx, y);
        }
        g.stroke();
      }
    }
    g.globalAlpha = 1;
  });
}

/** soft grey veins on warm white (2:1 canvas) */
export function marbleTexture(id: string, tones: [string, string, string], opts: TexOpts, detail: Detail = {}): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const W = opts.size * 2;
  const H = opts.size;
  const k = opts.size / 1024;
  return canvasTex(W, H, opts, (g, w, h) => {
    const [base, dark, mid] = tones;
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, base);
    grd.addColorStop(1, shade(base, -0.05));
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
    const vein = (count: number, lw: number, alpha: number, col: string, blur: number) => {
      for (let i = 0; i < count; i++) {
        let x = rnd() * w;
        let y = rnd() * h;
        let ang = (rnd() - 0.5) * 1.2;
        g.beginPath();
        g.moveTo(x, y);
        for (let s = 0; s < 220; s++) {
          ang += (rnd() - 0.5) * 0.5;
          x += Math.cos(ang) * 9 * k;
          y += Math.sin(ang) * 3.5 * k;
          g.lineTo(x, y);
        }
        g.strokeStyle = col;
        g.globalAlpha = alpha;
        g.lineWidth = lw * k;
        g.shadowColor = col;
        g.shadowBlur = blur * k;
        g.stroke();
      }
    };
    const d = detail.density ?? 1;
    if (detail.veins === "bold") {
      // Calacatta: a few wide, high-contrast veins with a soft halo, little fine veining
      vein(6, 16, 0.1, mid, 22);
      vein(5, 4.2, 0.55, dark, 3);
      vein(Math.round(14 * d), 1, 0.2, mid, 1);
    } else {
      vein(Math.round(9 * d), 7, 0.08, mid, 14);
      vein(Math.round(22 * d), 1.8, 0.36, dark, 2);
      vein(Math.round(46 * d), 0.8, 0.24, mid, 1);
    }
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  });
}

/** black stone with fine grain and sparkle */
export function stoneTexture(id: string, tones: [string, string, string], opts: TexOpts, detail: Detail = {}): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, mid, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = Math.round(16000 * (S / 1024) * (S / 1024) * (detail.density ?? 1));
    for (let i = 0; i < n; i++) {
      const r = rnd();
      g.fillStyle = r < 0.85 ? mid : light;
      g.globalAlpha = r < 0.85 ? 0.25 + rnd() * 0.5 : 0.15 + rnd() * 0.35;
      const s = (0.6 + rnd() * 1.8) * (S / 1024);
      g.fillRect(rnd() * w, rnd() * h, s, s);
    }
    g.globalAlpha = 1;
  });
}

/** micro-cement / concrete: soft clouds + pores */
export function concreteTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let i = 0; i < 140; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = (40 + rnd() * 180) * (S / 1024);
      const col = rnd() < 0.5 ? dark : light;
      for (const [ox, oy] of [
        [0, 0],
        [-w, 0],
        [w, 0],
        [0, -h],
        [0, h],
      ]) {
        const grd = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, r);
        grd.addColorStop(0, col);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 0.06 + rnd() * 0.08;
        g.fillStyle = grd;
        g.fillRect(x + ox - r, y + oy - r, 2 * r, 2 * r);
      }
    }
    const n = Math.round(9000 * (S / 1024) * (S / 1024));
    for (let i = 0; i < n; i++) {
      g.globalAlpha = 0.08 + rnd() * 0.2;
      g.fillStyle = rnd() < 0.7 ? dark : light;
      const s = (0.5 + rnd() * 1.4) * (S / 1024);
      g.fillRect(rnd() * w, rnd() * h, s, s);
    }
    g.globalAlpha = 1;
  });
}

/** brushed metal: fine horizontal streaks (they run along the u axis) */
export function brushedTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = Math.min(512, opts.size);
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = Math.round(1400 * (S / 512));
    for (let i = 0; i < n; i++) {
      const y = rnd() * h;
      const x = rnd() * w;
      const len = (0.15 + rnd() * 0.85) * w;
      g.globalAlpha = 0.04 + rnd() * 0.1;
      g.fillStyle = rnd() < 0.5 ? dark : light;
      const t = 0.5 + rnd() * 1.2;
      g.fillRect(x, y, len, t);
      g.fillRect(x - w, y, len, t);
    }
    g.globalAlpha = 1;
  });
}

/** floor boards: planks of `tones` with seams and per-board shade, grain along v */
export function plankTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const cols = 6;
    const bw = w / cols;
    for (let c = 0; c < cols; c++) {
      // two boards per column, staggered
      const off = rnd() * h;
      for (let k = 0; k < 2; k++) {
        const y0 = off + (k * h) / 2;
        g.globalAlpha = 0.08 + rnd() * 0.14;
        g.fillStyle = rnd() < 0.5 ? dark : light;
        for (const oy of [0, -h]) g.fillRect(c * bw, y0 + oy, bw, h / 2);
        g.globalAlpha = 0.5;
        g.fillStyle = dark;
        for (const oy of [0, -h, h]) g.fillRect(c * bw, y0 + oy - 1, bw, 2);
      }
      // grain
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = 0.05 + rnd() * 0.1;
        g.fillStyle = rnd() < 0.6 ? dark : light;
        g.fillRect(c * bw + rnd() * bw, 0, 0.6 + rnd() * 1.6, h);
      }
      g.globalAlpha = 0.55;
      g.fillStyle = dark;
      g.fillRect(c * bw, 0, 1.5, h);
    }
    g.globalAlpha = 1;
  });
}

/**
 * floor / wall tiles with grout lines: `grid` = columns × rows in one repeat (absent: 2 × 2 square tiles, what every
 * older floor showed); `offset` = every other row shifted by half a tile (running bond, metro tiles)
 */
export function tileTexture(
  id: string,
  tones: [string, string, string],
  grout: string,
  opts: TexOpts,
  grid: [number, number] = [2, 2],
  offset = false,
  glaze: { cloud: number; grout: number; bevel: boolean } = { cloud: 0.18, grout: 1 / 340, bevel: false },
): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    const [nx, ny] = grid;
    const tw = w / nx;
    const th = h / ny;
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx + (offset ? 1 : 0); i++) {
        const x0 = i * tw - (offset && j % 2 ? tw / 2 : 0);
        g.fillStyle = base;
        g.fillRect(x0, j * th, tw, th);
        // soft clouding per tile
        for (let k = 0; k < 18; k++) {
          const x = x0 + rnd() * tw;
          const y = j * th + rnd() * th;
          const r = Math.min(tw, th) * (0.1 + rnd() * 0.35);
          const grd = g.createRadialGradient(x, y, 0, x, y, r);
          grd.addColorStop(0, rnd() < 0.5 ? dark : light);
          grd.addColorStop(1, "rgba(0,0,0,0)");
          g.globalAlpha = glaze.cloud;
          g.fillStyle = grd;
          g.fillRect(x0, j * th, tw, th);
        }
        if (glaze.bevel) {
          // a glazed tile's rounded edge: lighter along the top, darker along the bottom
          const e = Math.max(2, th * 0.09);
          g.globalAlpha = 0.35;
          g.fillStyle = light;
          g.fillRect(x0, j * th, tw, e);
          g.fillStyle = dark;
          g.fillRect(x0, (j + 1) * th - e, tw, e);
        }
        g.globalAlpha = 1;
      }
    g.fillStyle = grout;
    const gw = Math.max(1.5, S * glaze.grout);
    for (let j = 0; j <= ny; j++) g.fillRect(0, j * th - gw / 2, w, gw);
    for (let j = 0; j < ny; j++)
      for (let i = 0; i <= nx + (offset ? 1 : 0); i++) {
        const x = i * tw - (offset && j % 2 ? tw / 2 : 0);
        g.fillRect(x - gw / 2, j * th, gw, th);
      }
  });
}

/** bricks in running bond (25 × 6,5 cm with 1 cm joints in a 1,04 m repeat: 4 bricks × 14 courses) */
export function brickTexture(id: string, tones: [string, string, string], mortar: string, opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = mortar;
    g.fillRect(0, 0, w, h);
    const cols = 4;
    const rows = 14;
    const bw = w / cols;
    const bh = h / rows;
    const joint = Math.max(1.5, bh * 0.13);
    for (let j = 0; j < rows; j++) {
      for (let i = -1; i <= cols; i++) {
        const x = i * bw + (j % 2 ? bw / 2 : 0);
        const shade = rnd();
        g.globalAlpha = 1;
        g.fillStyle = base;
        g.fillRect(x + joint / 2, j * bh + joint / 2, bw - joint, bh - joint);
        g.globalAlpha = 0.18 + shade * 0.32;
        g.fillStyle = shade < 0.5 ? dark : light;
        g.fillRect(x + joint / 2, j * bh + joint / 2, bw - joint, bh - joint);
        // a few pores and a darker lower edge per brick
        g.globalAlpha = 0.25;
        g.fillStyle = dark;
        g.fillRect(x + joint / 2, (j + 1) * bh - joint / 2 - bh * 0.12, bw - joint, bh * 0.12);
        for (let k = 0; k < 6; k++) {
          g.globalAlpha = 0.3;
          g.fillRect(x + joint / 2 + rnd() * (bw - joint), j * bh + joint / 2 + rnd() * (bh - joint), 1.2, 1.2);
        }
      }
    }
    g.globalAlpha = 1;
  });
}

/**
 * wood blocks laid in herringbone (riblja kost), blocks u × 6u. Turned by 45° the pattern repeats on a rectangular
 * lattice (u√2 across, 6u√2 = L√2 along), so one square repeat is L√2 wide and holds 6 × 1 lattice cells — the catalogue's
 * `tile` (0,764 m) makes the blocks 9 × 54 cm.
 */
export function herringboneTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, w);
    const n = 6;
    const L = 1;
    const u = L / n;
    const scale = w / (L * Math.SQRT2);
    const seam = 1 / scale;
    // every block is shaded by its place in the repeat (6 lattice cells × 2 blocks), so blocks cut by the texture's
    // edge match their other half
    let rnd = mulberry32(hashSeed(id));
    const plank = (x0: number, y0: number, x1: number, y1: number, along: "x" | "y") => {
      const shade = rnd();
      g.globalAlpha = 1;
      g.fillStyle = base;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      g.globalAlpha = 0.12 + shade * 0.24;
      g.fillStyle = shade < 0.5 ? dark : light;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
      for (let k = 0; k < 6; k++) {
        g.globalAlpha = 0.05 + rnd() * 0.08;
        g.fillStyle = rnd() < 0.6 ? dark : light;
        const t = rnd();
        if (along === "x") g.fillRect(x0, y0 + t * (y1 - y0), x1 - x0, seam * 0.8);
        else g.fillRect(x0 + t * (x1 - x0), y0, seam * 0.8, y1 - y0);
      }
      g.globalAlpha = 0.55;
      g.fillStyle = dark;
      g.fillRect(x0, y0, x1 - x0, seam);
      g.fillRect(x0, y0, seam, y1 - y0);
    };
    g.save();
    // texture px → pattern space: centre-free 45° turn; the lattice t1 = (u, u), t2 = (L, −L) becomes axis-aligned
    g.scale(scale, scale);
    g.rotate(Math.PI / 4);
    for (let i = -n * 3; i <= n * 3; i++) {
      for (let j = -3; j <= 3; j++) {
        const ox = i * u + j * L;
        const oy = i * u - j * L;
        const cell = ((i % n) + n) % n;
        rnd = mulberry32(hashSeed(`${id}:${cell}:h`));
        plank(ox, oy, ox + L, oy + u, "x");
        rnd = mulberry32(hashSeed(`${id}:${cell}:v`));
        plank(ox + L, oy - L + u, ox + L + u, oy + u, "y");
      }
    }
    g.restore();
    g.globalAlpha = 1;
  });
}

/** chevron parquet: blocks cut at 45° meeting on a line, alternating rows of light and dark bands */
export function chevronTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    const cols = 2;
    const cw = w / cols;
    const band = h / 12;
    const seam = Math.max(1, S / 700);
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    for (let c = 0; c < cols; c++) {
      // each half-column slopes 3 bands across: start well above the top so no row is missing
      for (let r = -6; r < 15; r++) {
        for (const half of [0, 1]) {
          const x0 = c * cw + half * (cw / 2);
          const yA = r * band + (half ? cw / 2 : 0);
          const shade = rnd();
          g.beginPath();
          // a parallelogram: the left half slopes down to the centre line, the right half up from it
          if (!half) {
            g.moveTo(x0, yA);
            g.lineTo(x0 + cw / 2, yA + cw / 2);
            g.lineTo(x0 + cw / 2, yA + cw / 2 + band);
            g.lineTo(x0, yA + band);
          } else {
            g.moveTo(x0, yA);
            g.lineTo(x0 + cw / 2, yA - cw / 2);
            g.lineTo(x0 + cw / 2, yA - cw / 2 + band);
            g.lineTo(x0, yA + band);
          }
          g.closePath();
          g.globalAlpha = 1;
          g.fillStyle = base;
          g.fill();
          g.globalAlpha = 0.12 + shade * 0.24;
          g.fillStyle = shade < 0.5 ? dark : light;
          g.fill();
          g.globalAlpha = 0.5;
          g.strokeStyle = dark;
          g.lineWidth = seam;
          g.stroke();
        }
      }
    }
    g.globalAlpha = 1;
  });
}

/** terrazzo: chips of marble in two tones scattered in a light cement base */
export function terrazzoTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = Math.round(2600 * (S / 1024) * (S / 1024));
    for (let i = 0; i < n; i++) {
      const x = rnd() * w;
      const y = rnd() * h;
      const r = (1.2 + rnd() * rnd() * 9) * (S / 1024);
      g.globalAlpha = 0.55 + rnd() * 0.4;
      g.fillStyle = rnd() < 0.45 ? dark : rnd() < 0.7 ? light : shade(base, -0.18);
      const k = 3 + Math.floor(rnd() * 3);
      const pts: [number, number][] = [];
      for (let j = 0; j < k; j++) {
        const a = (j / k) * Math.PI * 2 + rnd() * 0.8;
        const rr = r * (0.6 + rnd() * 0.5);
        pts.push([Math.cos(a) * rr, Math.sin(a) * rr]);
      }
      // chips across an edge are drawn on the other side too, so the repeat has no seam
      for (const ox of x < r ? [0, w] : x > w - r ? [0, -w] : [0])
        for (const oy of y < r ? [0, h] : y > h - r ? [0, -h] : [0]) {
          g.beginPath();
          pts.forEach(([px, py], j) => (j === 0 ? g.moveTo(x + ox + px, y + oy + py) : g.lineTo(x + ox + px, y + oy + py)));
          g.closePath();
          g.fill();
        }
    }
    g.globalAlpha = 1;
  });
}

/** induction hob glass with zone rings */
export function hobTexture(opts: TexOpts): THREE.CanvasTexture {
  return canvasTex(512, 512, opts, (g, w, h) => {
    g.fillStyle = "#0b0b0c";
    g.fillRect(0, 0, w, h);
    g.strokeStyle = "rgba(255,255,255,.2)";
    g.lineWidth = 2;
    for (const [x, y, r] of [
      [150, 150, 80],
      [362, 150, 64],
      [150, 362, 64],
      [362, 362, 80],
    ]) {
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.stroke();
    }
    g.fillStyle = "rgba(255,255,255,.32)";
    g.fillRect(226, 470, 60, 4);
  });
}

/** soft rectangle for fake contact shadows (used as alphaMap: white = shadow) */
export function contactShadowTexture(): THREE.DataTexture {
  const S = 128;
  const data = new Uint8Array(S * S * 4);
  const inner = 0.22; // fraction of the half-size that is fully dark
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = Math.max(0, Math.abs((x + 0.5) / S - 0.5) * 2 - (1 - inner * 2)) / (inner * 2);
      const dy = Math.max(0, Math.abs((y + 0.5) / S - 0.5) * 2 - (1 - inner * 2)) / (inner * 2);
      const d = Math.min(1, Math.hypot(dx, dy));
      const v = Math.round(255 * (1 - d * d * (3 - 2 * d)));
      const k = (y * S + x) * 4;
      data[k] = data[k + 1] = data[k + 2] = v;
      data[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(data, S, S, THREE.RGBAFormat);
  t.colorSpace = THREE.NoColorSpace;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true;
  return t;
}

export function shade(hex: string, amt: number): string {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  c.setHSL(hsl.h, hsl.s, Math.min(1, Math.max(0, hsl.l + amt)));
  return `#${c.getHexString()}`;
}
