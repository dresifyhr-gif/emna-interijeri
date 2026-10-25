/**
 * Static copy and small helpers for the studio UI.
 * Materials, prices and module types come from lib/studio/catalog.ts — this file only holds UI wording.
 */
import type { ListId, PlanSlot, RunId } from "@/lib/studio/plan";
import type { FrontZone, Layout, WallId } from "@/lib/studio/types";

/** the site-wide premium ease, as a framer-motion bezier */
export const EASE = [0.2, 0.8, 0.2, 1] as const;

export type StepId = "oblik" | "zidovi" | "elementi" | "boje" | "ploca" | "posalji";

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
    lead: "Upišite duljinu svakog zida i visinu stropa u centimetrima, pa odaberite visinu kuhinje. Točne mjere uzimamo na izmjeri.",
  },
  {
    id: "elementi",
    short: "Elementi",
    title: "Elementi",
    lead: "Svaki element možete zamijeniti, suziti, pomaknuti, dodati ili ukloniti. Odaberite ga na popisu ili kliknite u 3D prikazu.",
    leadNoImage: "Svaki element možete zamijeniti, suziti, pomaknuti, dodati ili ukloniti. Odaberite ga na popisu.",
  },
  { id: "boje", short: "Boje", title: "Boje fronti", lead: "Materijal vrata i ladica. Kuhinja može biti jednobojna ili dvobojna." },
  { id: "ploca", short: "Ploča", title: "Ploča i detalji", lead: "Radna ploča, ručke, sudoper i slavina, aparati, postolje, rasvjeta." },
  {
    id: "posalji",
    short: "Pošalji",
    title: "Pošalji upit",
    lead: "Uz upit nam stižu mjere, oblik, elementi, materijali, slika i link koji otvara upravo ovu kuhinju.",
    leadNoImage: "Uz upit nam stižu mjere, oblik, elementi, materijali i link koji otvara upravo ovu kuhinju.",
  },
];

export const LAST_STEP = STEPS.length - 1;
export const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);

export const LAYOUTS: { id: Layout; name: string; desc: string }[] = [
  { id: "ravna", name: "Ravna", desc: "Uz jedan zid" },
  { id: "L", name: "Kutna L", desc: "Dva zida pod kutom" },
  { id: "U", name: "U oblik", desc: "Tri zida" },
  { id: "otok", name: "S otokom", desc: "Zid i samostojeći otok" },
];

export const WALL_HINT: Record<WallId, string> = { a: "stražnji", b: "lijevi", c: "desni" };

/** shown when a new shape put the clicked-element edits back to their defaults */
export const LAYOUT_RESET_NOTE =
  "Novi oblik ima druge zidove i kutove, pa su elementi koje ste sami uredili vraćeni na zadani raspored.";

/** UI names of the catalogue's front families (tabs in the colour library) */
export const FRONT_FAMILY_TAB: Record<string, string> = {
  mat: "Mat lakovi",
  sjaj: "Sjajni lakovi",
  drvo: "Drvo",
  kamen: "Kamen i beton",
  metal: "Metalik",
};

export const FRONT_ZONE_NAME: Record<FrontZone, string> = {
  base: "Donji",
  upper: "Gornji",
  tall: "Visoki",
  island: "Otok",
};
export const FRONT_ZONE_LONG: Record<FrontZone, string> = {
  base: "donji elementi",
  upper: "gornji elementi",
  tall: "visoki stup",
  island: "otok",
};

export const TIMELINES = ["Što prije", "1–3 mjeseca", "3–6 mjeseci", "Samo istražujem"] as const;
export type Timeline = (typeof TIMELINES)[number];

/* ------------------------------------------------------------------ runs and rows */

/** "Zid A" / "Otok" */
export const runName = (run: RunId) => (run === "isl" ? "Otok" : `Zid ${run.toUpperCase()}`);

/** a row of cabinets as the UI shows it: one zone of one run (corners belong to wall A's base / upper rows) */
export type RowZone = "base" | "upper" | "tall" | "island";

export const ROW_NAME: Record<RowZone, string> = {
  upper: "Gornji elementi",
  base: "Donji elementi",
  tall: "Visoki stup",
  island: "Elementi otoka",
};
const ROW_SHORT: Record<RowZone, string> = { upper: "gornji", base: "donji", tall: "visoki stup", island: "" };

/**
 * The island's run-local x runs right → left as seen from the room (its fronts face wall A), so the UI mirrors it:
 * everywhere in the studio "left" is the left of the drawing, which matches the default 3D view.
 */
export const isFlipped = (run: RunId) => run === "isl";

/** the slots of one row, in on-screen order (left → right as drawn) */
export function rowSlots(slots: PlanSlot[], run: RunId, zone: RowZone): PlanSlot[] {
  const out = slots.filter((s) => s.run === run && s.zone === zone).sort((p, q) => p.x - q.x);
  return isFlipped(run) ? out.reverse() : out;
}

/** the row a slot belongs to */
export const rowOf = (s: PlanSlot): { run: RunId; zone: RowZone } => ({ run: s.run, zone: s.zone });

/** "Zid A · donji" / "Visoki stup" / "Otok" */
export function slotPlace(s: PlanSlot): string {
  if (s.zone === "tall") return "Visoki stup";
  if (s.zone === "island") return "Otok";
  return `${runName(s.run)} · ${ROW_SHORT[s.zone]}`;
}

/** wording that tells which way "left" is for a run */
export function sideHint(run: RunId): string {
  return run === "isl" ? "Lijevo i desno: gledano iz prostorije, prema zidu A." : `Lijevo i desno: gledano prema zidu ${run.toUpperCase()}.`;
}

/** the list a reset of this slot's run should clear (resetRun arguments) */
export function resetTarget(s: PlanSlot): { run: WallId | "isl" | "tall"; zone?: "base" | "upper" } {
  if (s.zone === "tall") return { run: "tall" };
  if (s.zone === "island") return { run: "isl" };
  return { run: s.run as WallId, zone: s.zone === "upper" ? "upper" : "base" };
}

export const listOfSlot = (s: PlanSlot): ListId | null => s.list?.id ?? null;

/**
 * Why nothing can be added next to an element (`free` = SlotEditInfo.free, cm). The tall column is limited by its
 * wall (plan.ts tallCapacity), not by a neighbour in the base run, so it says which wall to lengthen.
 */
export function noRoomText(s: PlanSlot, free: number): string {
  const left = free >= 1 ? ` — slobodno je još ${Math.floor(free)} cm` : "";
  if (s.zone === "tall") {
    const wall = String(s.run).toUpperCase();
    return `Visoki stup uz zid ${wall} je pun${left}. Produžite zid ${wall} ili suzite, zamijenite ili uklonite neki visoki element.`;
  }
  return `Za novi element nema mjesta${left}. Suzite ili uklonite susjedni element.`;
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
