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
  veins?: "fine" | "bold" | "diagonal";
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
    if (detail.veins === "diagonal") {
      // Port Laurent / Nero zlatni: long, nearly parallel diagonal veins with a bright core and short forks (seamless:
      // every stroke is drawn once more one repeat over in each direction)
      const strokes: { pts: [number, number][]; lw: number; alpha: number; col: string; blur: number }[] = [];
      const walk = (x: number, y: number, ang: number, len: number, bend: number): [number, number][] => {
        const pts: [number, number][] = [[x, y]];
        for (let s = 0; s < len; s++) {
          ang += (rnd() - 0.5) * bend;
          x += Math.cos(ang) * 6 * k;
          y += Math.sin(ang) * 6 * k;
          pts.push([x, y]);
        }
        return pts;
      };
      const light = shade(dark, 0.42);
      const n = Math.max(3, Math.round(7 * d));
      for (let i = 0; i < n; i++) {
        // spread across the repeat, falling to the right at about 60°
        const x = ((i + 0.2 + rnd() * 0.6) / n) * w;
        const y = rnd() * h;
        const ang = 0.82 + rnd() * 0.2;
        const pts = walk(x, y, ang, Math.round((h * 1.25) / (6 * k)), 0.07);
        const core = 1.6 + rnd() * 2.2;
        strokes.push({ pts, lw: core * 5, alpha: 0.12, col: mid, blur: 18 });
        strokes.push({ pts, lw: core, alpha: 0.9, col: dark, blur: 2 });
        strokes.push({ pts, lw: core * 0.5, alpha: 0.95, col: light, blur: 0 });
        // forks: short, thinner, leaving the vein at a shallow angle
        for (let f = 0; f < 2 + Math.floor(rnd() * 3); f++) {
          const at = pts[Math.floor(rnd() * pts.length * 0.8)];
          const fork = walk(at[0], at[1], ang + (rnd() < 0.5 ? -1 : 1) * (0.2 + rnd() * 0.25), 12 + Math.floor(rnd() * 40), 0.12);
          strokes.push({ pts: fork, lw: 0.6 + rnd() * 1.1, alpha: 0.7, col: dark, blur: 1 });
        }
      }
      // hairline veining in between
      for (let i = 0; i < Math.round(10 * d); i++) {
        const pts = walk(rnd() * w, rnd() * h, 0.9 + rnd() * 0.5, 20 + Math.floor(rnd() * 60), 0.2);
        strokes.push({ pts, lw: 0.6, alpha: 0.35, col: mid, blur: 0 });
      }
      for (const st of strokes)
        for (const ox of [-w, 0, w])
          for (const oy of [-h, 0, h]) {
            g.beginPath();
            st.pts.forEach(([px, py], j) => (j ? g.lineTo(px + ox, py + oy) : g.moveTo(px + ox, py + oy)));
            g.strokeStyle = st.col;
            g.globalAlpha = st.alpha;
            g.lineWidth = st.lw * k;
            g.shadowColor = st.col;
            g.shadowBlur = st.blur * k;
            g.stroke();
          }
    } else if (detail.veins === "bold") {
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
export function plankTexture(id: string, tones: [string, string, string], opts: TexOpts, boards = 6): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const cols = Math.max(2, Math.round(boards));
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

/**
 * the glow a ceiling light throws on the ceiling around it: a soft radial falloff (white in the middle, black at the
 * edge of the disc; the ceiling's emissive map, clamped — engine/index.ts syncCeiling centres it on the lamp)
 */
export function haloTexture(opts: TexOpts): THREE.CanvasTexture {
  const t = canvasTex(256, 256, opts, (g, w, h) => {
    g.fillStyle = "#000";
    g.fillRect(0, 0, w, h);
    const grd = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    for (const [at, v] of [
      [0, 1],
      [0.12, 0.8],
      [0.3, 0.42],
      [0.55, 0.16],
      [0.8, 0.04],
      [1, 0],
    ] as const)
      grd.addColorStop(at, `rgb(${Math.round(255 * v)},${Math.round(255 * v)},${Math.round(255 * v)})`);
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  });
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
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

/**
 * Hexagonal tiles (flat-topped, `across` = the size across the flats) with grout, 2 × 2 periods per canvas: the texture
 * repeats every (3 × r) × (√3 × r) × 2 with r = across / √3 — hexRepeat gives the UV repeat for a size in metres.
 */
export function hexTexture(id: string, tones: [string, string, string], grout: string, opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, dark, light] = tones;
    // one period is 3 r wide and √3 r high; the canvas holds 2 × 2 periods
    const r = 1;
    const pw = 3 * r;
    const ph = Math.sqrt(3) * r;
    g.save();
    g.scale(w / (2 * pw), h / (2 * ph));
    g.fillStyle = grout;
    g.fillRect(0, 0, 2 * pw, 2 * ph);
    const hex = (cx: number, cy: number, rr: number) => {
      g.beginPath();
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k;
        const x = cx + rr * Math.cos(a);
        const y = cy + rr * Math.sin(a);
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
    };
    for (let col = -1; col <= 4; col++) {
      for (let row = -1; row <= 3; row++) {
        const cx = col * 1.5 * r;
        const cy = row * ph + (Math.abs(col) % 2 ? ph / 2 : 0);
        hex(cx, cy, r * 0.94);
        const t = rnd();
        g.fillStyle = t < 0.2 ? dark : t > 0.85 ? light : base;
        g.globalAlpha = 1;
        g.fill();
        // a soft glaze highlight on each tile
        const grd = g.createRadialGradient(cx - r * 0.3, cy - r * 0.3, 0, cx, cy, r);
        grd.addColorStop(0, light);
        grd.addColorStop(1, "rgba(0,0,0,0)");
        g.globalAlpha = 0.18;
        g.fillStyle = grd;
        g.fill();
        g.globalAlpha = 1;
      }
    }
    g.restore();
  });
}

/** the UV repeat (per metre) of hexTexture for tiles `across` cm across the flats */
export function hexRepeat(across: number): [number, number] {
  const r = across / 100 / Math.sqrt(3);
  return [1 / (6 * r), 1 / (2 * Math.sqrt(3) * r)];
}

/**
 * Normal map of fluted (rebrasto) glass: vertical half-round ribs across the texture's u (one rib per texture width).
 * Not colour data (no sRGB). Its mip levels are written by hand: the ribs flatten as they get smaller on screen — the
 * GPU's own box-filtered levels keep one whole rib in every level down to 2 texels, so a door seen from across the room
 * shimmered in a coarse moiré of half-sampled ribs; now it turns into smooth glass. No anisotropic filtering for the same
 * reason (it reaches for a sharper level at grazing angles).
 */
export function ribsNormalTexture(): THREE.DataTexture {
  const level = (w: number, h: number, amp: number) => {
    const data = new Uint8Array(w * h * 4);
    for (let x = 0; x < w; x++) {
      const u = (x + 0.5) / w;
      // the slope of a half-round rib across one period, scaled down on the smaller levels
      const nx = Math.max(-0.95, Math.min(0.95, Math.cos(Math.PI * u))) * amp;
      const nz = Math.sqrt(1 - nx * nx);
      for (let y = 0; y < h; y++) {
        const k = (y * w + x) * 4;
        data[k] = Math.round((nx * 0.5 + 0.5) * 255);
        data[k + 1] = 128;
        data[k + 2] = Math.round((nz * 0.5 + 0.5) * 255);
        data[k + 3] = 255;
      }
    }
    return { data, width: w, height: h };
  };
  // rib strength per level: 64 / 32 texels a rib keep it whole, 16 … 4 fade it, 2 and 1 are flat glass
  const amps = [1, 1, 0.75, 0.4, 0.12, 0, 0];
  const mips: { data: Uint8Array; width: number; height: number }[] = [];
  for (let w = 64, h = 4, i = 0; ; w = Math.max(1, w >> 1), h = Math.max(1, h >> 1), i++) {
    mips.push(level(w, h, amps[i] ?? 0));
    if (w === 1 && h === 1) break;
  }
  const t = new THREE.DataTexture(mips[0].data, 64, 4, THREE.RGBAFormat);
  t.mipmaps = mips as unknown as THREE.DataTexture["mipmaps"];
  t.generateMipmaps = false;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 1;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
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
