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
export function woodTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
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
    const n = Math.round(620 * (S / 1024));
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
export function marbleTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
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
    vein(9, 7, 0.08, mid, 14);
    vein(22, 1.8, 0.36, dark, 2);
    vein(46, 0.8, 0.24, mid, 1);
    g.shadowBlur = 0;
    g.globalAlpha = 1;
  });
}

/** black stone with fine grain and sparkle */
export function stoneTexture(id: string, tones: [string, string, string], opts: TexOpts): THREE.CanvasTexture {
  const rnd = mulberry32(hashSeed(id));
  const S = opts.size;
  return canvasTex(S, S, opts, (g, w, h) => {
    const [base, mid, light] = tones;
    g.fillStyle = base;
    g.fillRect(0, 0, w, h);
    const n = Math.round(16000 * (S / 1024) * (S / 1024));
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
