/**
 * Static copy and small helpers for the studio UI.
 * Materials, prices and module types come from lib/studio/catalog.ts — this file only holds UI wording.
 */
import { isPeninsula, stoolsWord, wallsFor, type KitchenPlan, type ListId, type PlanGap, type PlanSlot, type RunId } from "@/lib/studio/plan";
import type { FrontZone, KitchenConfig, Layout, WallId } from "@/lib/studio/types";

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
    lead: "Mjere prostorije, a zatim koliko je duga kuhinja. Točne mjere uzimamo na izmjeri.",
  },
  {
    id: "elementi",
    short: "Elementi",
    title: "Elementi",
    lead: "Kliknite element u 3D prikazu, na crtežu ili na popisu — pa ga zamijenite, suzite ili uklonite.",
    leadNoImage: "Odaberite element na tlocrtu, nacrtu ili na popisu — pa ga zamijenite, suzite ili uklonite.",
  },
  { id: "boje", short: "Boje", title: "Boje fronti", lead: "Vrata i ladice — boja, kako se otvaraju i staklo vitrina." },
  { id: "ploca", short: "Ploča", title: "Ploča i detalji", lead: "Radna ploča, zid iza nje, napa, sudoper i rasvjeta." },
  {
    id: "posalji",
    short: "Pošalji",
    title: "Pošaljite upit",
    lead: "Uz upit stižu mjere, elementi, materijali, slika i link na ovu kuhinju.",
    leadNoImage: "Uz upit stižu mjere, elementi, materijali i link na ovu kuhinju.",
  },
];

export const LAST_STEP = STEPS.length - 1;
export const stepIndex = (id: StepId) => STEPS.findIndex((s) => s.id === id);

export const LAYOUTS: { id: Layout; name: string; desc: string }[] = [
  { id: "ravna", name: "Ravna", desc: "Uz jedan zid" },
  { id: "L", name: "Kutna L", desc: "Dva zida pod kutom" },
  { id: "U", name: "U oblik", desc: "Tri zida" },
  { id: "otok", name: "S otokom", desc: "Zid i samostojeći otok" },
  { id: "poluotok", name: "S poluotokom", desc: "Zid i poluotok uz jedan kraj" },
  { id: "G", name: "G oblik", desc: "Kutna L zatvorena poluotokom" },
];

export const WALL_HINT: Record<WallId, string> = { a: "stražnji", b: "lijevi", c: "desni" };

/**
 * the room's walls in 3D, A → C: the layout's walls (with the kitchen on them) and the bare room walls
 * (KitchenConfig.room.bare — an L kitchen in a closed room) — what can be painted, clicked, measured
 */
export function roomWallIds(cfg: Pick<KitchenConfig, "layout" | "room">): WallId[] {
  const used = wallsFor(cfg.layout);
  const bare = cfg.room?.bare ?? [];
  return (["a", "b", "c"] as WallId[]).filter((w) => used.includes(w) || bare.includes(w));
}

/** "Otok" / "Poluotok" — the island run's name in this layout */
export const islandWord = (layout?: Layout) => (layout && isPeninsula(layout) ? "Poluotok" : "Otok");
/** "otoka" / "poluotoka" (genitive) */
export const islandOf = (layout?: Layout) => (layout && isPeninsula(layout) ? "poluotoka" : "otoka");

/**
 * The name of an end of a room's wall, as seen facing it: the corner with the neighbouring wall where the layout has one
 * ("kut sa zidom B"), else the plain end ("lijevi kraj zida"); `genitive` for "od …" ("od kuta sa zidom B"). A peninsula
 * stands at the end of wall A's kitchen run, not at an end of the wall, so it does not name one.
 */
export function wallEndName(layout: Layout, wall: WallId, side: "left" | "right", genitive = false): string {
  const walls = wallsFor(layout);
  const other: WallId | null = wall === "a" ? (side === "left" ? "b" : "c") : wall === "b" ? (side === "right" ? "a" : null) : side === "left" ? "a" : null;
  if (other && walls.includes(other)) return `${genitive ? "kuta" : "kut"} sa zidom ${other.toUpperCase()}`;
  if (side === "left") return genitive ? "lijevog kraja zida" : "lijevi kraj zida";
  return genitive ? "desnog kraja zida" : "desni kraj zida";
}

/** "1 barska", "2 barske", "5 barskih" (with stolica / stolice / stolica: plan.ts stoolsWord) */
function barAdj(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "barska";
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "barske" : "barskih";
}
/** "2 barske stolice" / "4 stolice" (chairs at a lowered table) / "bez stolica" */
export const seatsText = (n: number, chairs: boolean) => (n === 0 ? "bez stolica" : `${n} ${chairs ? "" : `${barAdj(n)} `}${stoolsWord(n)}`);

/** that end of the wall is a corner of the room (the layout has the neighbouring wall there) */
export const isRoomCorner = (layout: Layout, wall: WallId, side: "left" | "right") => wallEndName(layout, wall, side).startsWith("kut");

/** "Zid A · desni kraj" / "Zid B · gornji elementi" / "Otok · lijevi kraj" — where a "+" adds something */
export function gapPlace(g: Pick<PlanGap, "kind" | "run" | "side" | "zone">, layout?: Layout): string {
  const where = g.run === "isl" ? islandWord(layout) : `Zid ${g.run.toUpperCase()}`;
  if (g.kind === "upper") return `${where} · gornji elementi${g.side ? `, ${g.side === "left" ? "lijevi" : "desni"} kraj` : ""}`;
  if (g.kind === "free") return `${where} · ${g.zone === "upper" ? "prazan zid" : "slobodno mjesto"}`;
  if (g.kind === "seam") return `${where} · između ${g.zone === "upper" ? "gornjih" : "donjih"} elemenata`;
  return `${where} · ${g.side === "left" ? "lijevi" : "desni"} kraj`;
}

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
/** the zones this kitchen has (only those can wear their own front, or open their own way) */
export function frontZones(plan: KitchenPlan): FrontZone[] {
  const has = (z: FrontZone) => plan.slots.some((s) => s.zone === z);
  return (["base", "upper", "tall", "island"] as FrontZone[]).filter((z) => z === "base" || has(z));
}
export const FRONT_ZONE_LONG: Record<FrontZone, string> = {
  base: "donji elementi",
  upper: "gornji elementi",
  tall: "visoki stup",
  island: "otok",
};

/* ------------------------------------------------------------------ runs and rows */

/** "Zid A" / "Otok" ("Poluotok" when the layout is given and has one) */
export const runName = (run: RunId, layout?: Layout) => (run === "isl" ? islandWord(layout) : `Zid ${run.toUpperCase()}`);

/** a row of cabinets as the UI shows it: one zone of one run (corners belong to wall A's base / upper rows) */
export type RowZone = "base" | "upper" | "tall" | "island";

export const ROW_NAME: Record<RowZone, string> = {
  upper: "Gornji elementi",
  base: "Donji elementi",
  tall: "Visoki stup",
  island: "Elementi otoka",
};
/** ROW_NAME with the peninsula named as such */
export const rowName = (z: RowZone, layout?: Layout) => (z === "island" ? `Elementi ${islandOf(layout)}` : ROW_NAME[z]);
const ROW_SHORT: Record<RowZone, string> = { upper: "gornji", base: "donji", tall: "visoki stup", island: "" };

/**
 * The island's run-local x runs right → left as seen from the room (its fronts face wall A), so the UI mirrors it:
 * everywhere in the studio "left" is the left of the drawing, which matches the default 3D view.
 */
export const isFlipped = (run: RunId) => run === "isl";

/**
 * A tall unit standing in a wall's base run (CabinetSpec.tall: slot "a-tall-0", zone "tall", its list the wall's base list
 * "a") — not one of the tall columns at a run's end (list "tall" / "tall:b-left"). The UI shows it in the base row.
 */
export const isInRunTall = (s: Pick<PlanSlot, "zone" | "run" | "list">): boolean => s.zone === "tall" && s.run !== "isl" && s.list?.id === s.run;

/**
 * The slots of one row, in on-screen order (left → right as drawn). The base row of a wall includes the tall units
 * standing in it (in their place between the cabinets); the tall row is the columns at the run's ends only.
 */
export function rowSlots(slots: PlanSlot[], run: RunId, zone: RowZone): PlanSlot[] {
  const inRow = (s: PlanSlot) => s.run === run && (zone === "base" ? s.zone === "base" || isInRunTall(s) : s.zone === zone && !(zone === "tall" && isInRunTall(s)));
  const out = slots.filter(inRow).sort((p, q) => p.x - q.x);
  return isFlipped(run) ? out.reverse() : out;
}

/**
 * The tall units of the column `s` belongs to (lib/studio/edit.ts removeColumn takes them all): a column at a run's end
 * is its list ("tall", "tall:b-left"); a column standing in a wall's base run is the run's tall stretch (RunPlan.runTalls)
 * around it. Empty for anything that is not a tall unit.
 */
export function columnSlots(plan: KitchenPlan, s: PlanSlot): PlanSlot[] {
  if (s.zone !== "tall" || !s.list) return [];
  if (!isInRunTall(s)) return plan.slots.filter((x) => x.zone === "tall" && x.list?.id === s.list?.id);
  const t = plan.runs.find((r) => r.wall === s.run)?.runTalls.find((r) => s.x >= r.from - 0.5 && s.x < r.to - 0.5);
  if (!t) return [s];
  return plan.slots.filter((x) => isInRunTall(x) && x.run === s.run && x.x >= t.from - 0.5 && x.x + x.width <= t.to + 0.5);
}

/** "1 element", "2 elementa", "5 elemenata" */
export function elementsCount(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} element`;
  return `${n} ${m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? "elementa" : "elemenata"}`;
}

/** the row a slot belongs to (a tall unit standing in a base run: the base row) */
export const rowOf = (s: PlanSlot): { run: RunId; zone: RowZone } => ({ run: s.run, zone: isInRunTall(s) ? "base" : s.zone });

/** "Zid A · donji" / "Zid A · visoki" (a tall unit standing in the run) / "Visoki stup · zid B" / "Otok" */
export function slotPlace(s: PlanSlot, layout?: Layout): string {
  if (isInRunTall(s)) return `${runName(s.run)} · visoki`;
  if (s.zone === "tall") return s.run === "isl" ? "Visoki stup" : `Visoki stup · zid ${s.run.toUpperCase()}`;
  if (s.zone === "island") return islandWord(layout);
  return `${runName(s.run)} · ${ROW_SHORT[s.zone]}`;
}

/** wording that tells which way "left" is for a run */
export function sideHint(run: RunId, layout?: Layout): string {
  if (run !== "isl") return `Lijevo i desno: gledano prema zidu ${run.toUpperCase()}.`;
  return layout && isPeninsula(layout) ? "Lijevo i desno: gledano prema frontama poluotoka." : "Lijevo i desno: gledano iz prostorije, prema zidu A.";
}

/** the list a reset of this slot's run should clear (resetRun arguments): a tall column of its own resets alone */
export function resetTarget(s: PlanSlot): { run: WallId | "isl" | "tall" | Extract<ListId, `tall:${string}`>; zone?: "base" | "upper" } {
  // a tall unit standing in a base run is part of that wall's base list
  if (isInRunTall(s)) return { run: s.run as WallId, zone: "base" };
  if (s.zone === "tall") return { run: s.list && s.list.id.startsWith("tall:") ? (s.list.id as Extract<ListId, `tall:${string}`>) : "tall" };
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
  // a tall unit standing in a base run: `free` is the base run's (edit.ts SlotEditInfo)
  if (s.zone === "tall" && !isInRunTall(s)) {
    const wall = String(s.run).toUpperCase();
    return `Visoki stup uz zid ${wall} je pun${left}. Produžite kuhinju na zidu ${wall} ili suzite, zamijenite ili uklonite neki visoki element.`;
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

/**
 * "Hladnjak je sužen. Gornji element iznad …" → ["Hladnjak je sužen.", "Gornji element iznad …"] — the phone's one line
 * is the first sentence (a sentence ends at . ! ? before a capital letter or an opening quote; "cm." / "npr." do too,
 * which is harmless: the rest is one tap away)
 */
export function firstSentence(text: string): [string, string] {
  const m = /^(.+?[.!?])\s+(?=[A-ZČĆĐŠŽ„"(])/u.exec(text);
  return m ? [m[1], text.slice(m[0].length)] : [text, ""];
}
