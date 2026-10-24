/**
 * Static copy and small helpers for the studio UI.
 * Materials, prices and module types come from lib/studio/catalog.ts — this file only holds UI wording.
 */
import type { HandleStyle, Layout, WallId } from "@/lib/studio/types";

/** the site-wide premium ease, as a framer-motion bezier */
export const EASE = [0.2, 0.8, 0.2, 1] as const;

export type StepId = "oblik" | "zidovi" | "fronte" | "ploca" | "dodaci" | "posalji";

export interface StepDef {
  id: StepId;
  /** short label for the step tabs */
  short: string;
  /** big title */
  title: string;
  lead: string;
  /** lead shown instead when the 3D view (and so the picture) is not available */
  leadNoImage?: string;
}

export const STEPS: StepDef[] = [
  { id: "oblik", short: "Oblik", title: "Oblik", lead: "Odaberite raspored koji odgovara vašem prostoru." },
  {
    id: "zidovi",
    short: "Zidovi",
    title: "Zidovi",
    lead: "Upišite duljinu svakog zida u centimetrima. Točne mjere uzimamo na izmjeri.",
  },
  { id: "fronte", short: "Fronte", title: "Fronte", lead: "Materijal vrata i ladica te način na koji se otvaraju." },
  { id: "ploca", short: "Ploča", title: "Radna ploča", lead: "Površina za pripremu, kuhanje i serviranje." },
  { id: "dodaci", short: "Dodaci", title: "Dodaci", lead: "Elementi za aparate u visini očiju, rasvjeta i otok." },
  {
    id: "posalji",
    short: "Pošalji",
    title: "Pošalji upit",
    lead: "Uz upit nam stižu mjere, oblik, materijali, slika i link koji otvara upravo ovu kuhinju.",
    leadNoImage: "Uz upit nam stižu mjere, oblik, materijali i link koji otvara upravo ovu kuhinju.",
  },
];

export const LAST_STEP = STEPS.length - 1;

export const LAYOUTS: { id: Layout; name: string; desc: string }[] = [
  { id: "ravna", name: "Ravna", desc: "Uz jedan zid" },
  { id: "L", name: "Kutna L", desc: "Dva zida pod kutom" },
  { id: "U", name: "U oblik", desc: "Tri zida" },
  { id: "otok", name: "S otokom", desc: "Zid i samostojeći otok" },
];

export const WALL_HINT: Record<WallId, string> = { a: "stražnji", b: "lijevi", c: "desni" };

export const HANDLE_OPTIONS: { id: HandleStyle; name: string; note: string }[] = [
  {
    id: "bez",
    name: "Bez ručki",
    note: "Profil Gola: fronte se otvaraju hvatom za udubljeni rub, linije ostaju čiste.",
  },
  { id: "letvica", name: "Letvica", note: "Tanka metalna letvica na svakoj fronti." },
  { id: "gumb", name: "Gumb", note: "Mali okrugli gumb, klasičan i nenametljiv." },
];

/** shown (and announced) when a shape or measurement change puts clicked-element edits back to their defaults */
export const EDITS_RESET_NOTE =
  "Elementi su ponovno raspoređeni, pa su oni koje ste sami mijenjali vraćeni na zadanu izvedbu. Kliknite element u 3D prikazu ako ga želite ponovno promijeniti.";

export const TIMELINES = ["Što prije", "1–3 mjeseca", "3–6 mjeseci", "Samo istražujem"] as const;
export type Timeline = (typeof TIMELINES)[number];


/** "Zid A · gornji" — a short, friendly name for a plan slot id */
export function slotLabel(id: string): string {
  const m = /^([abc])-(base|upper)-\d+$/.exec(id);
  if (m) return `Zid ${m[1].toUpperCase()} · ${m[2] === "base" ? "donji" : "gornji"}`;
  if (/^tall-/.test(id)) return "Visoki stup";
  if (/^isl-/.test(id)) return "Otok";
  return "Element";
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const nf = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 });
/** 11200 → "11.200" */
export const eur = (n: number) => nf.format(n);

/** CSS cubic-bezier as a JS easing function (used by the price counter). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const err = sx(t) - x;
      const d = dx(t);
      if (Math.abs(err) < 1e-5 || Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    return sy(clamp(t, 0, 1));
  };
}

export const easePremium = cubicBezier(0.2, 0.8, 0.2, 1);
