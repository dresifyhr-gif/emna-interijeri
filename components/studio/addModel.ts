/**
 * What the add picker (AddPicker.tsx) shows, as plain data — kept apart from React so it is tested
 * (lib/studio/ui.test.ts): the widths offered as chips and the one preselected, the six common elements first (a tall
 * unit among them whenever one fits), at a free end of a run the end units (završeci) in a block of their own, the rest
 * grouped for "Više elemenata", and the width each tile gets.
 */
import { groupsFor, type TypeChoice } from "@/lib/studio/edit";
import type { PlanGap } from "@/lib/studio/plan";

/** a type the picker offers; `tall` = a tall unit standing in a wall's base run (insert with zone "tall") */
export interface AddItem {
  t: TypeChoice;
  tall: boolean;
}

/** the widths offered as chips (the exotic ones — a 15 cm bottle rack, the 96 cm side-by-side niche — stay on their tile) */
export const CHIP_WIDTHS = [30, 40, 45, 50, 60, 80, 90, 100, 120];
/** the most common elements first, per row (ids; "tall:" = a tall unit) — the rest under "Više elemenata" */
export const COMMON: Record<"base" | "baseTall" | "upper" | "island" | "tall", string[]> = {
  base: ["ladice", "vrata", "sudoper", "perilica", "ploca", "smece"],
  tall: ["hladnjak", "pecnica", "ormar", "smocnica", "pecnica-mikro", "metle"],
  baseTall: ["ladice", "vrata", "tall:hladnjak", "tall:ormar", "perilica", "tall:pecnica"],
  upper: ["napa", "vrata", "klapna", "vitrina", "polica", "nisa"],
  island: ["ladice", "vrata", "sudoper", "ploca", "perilica", "police"],
};
export const SHOWN = 6;

export const keyOf = (it: AddItem) => (it.tall ? `tall:${it.t.id}` : it.t.id);
/** every width of the type that fits here (inserts: TypeChoice.fitting) */
export const widthsOf = (t: TypeChoice) => (t.fitting?.length ? t.fitting : t.width !== null ? [t.width] : []);

/**
 * The width a "+" should start with: what fills the free place (an empty space, a stretch of bare wall, the bare floor
 * at a run's end) when it is a usual cabinet width, else 60 cm, else the width nearest to it.
 */
export function bestWidth(widths: number[], stretch: number | null): number | null {
  if (!widths.length) return null;
  if (stretch !== null && stretch >= 15 && stretch <= 120.5) {
    const fill = widths.filter((w) => w <= stretch + 0.5);
    if (fill.length) return fill[fill.length - 1];
  }
  if (widths.includes(60)) return 60;
  return widths.reduce((b, w) => (Math.abs(w - 60) < Math.abs(b - 60) ? w : b));
}

/** the width an item gets when `w` is chosen: `w` when its type comes in it, else the nearest below (else its smallest) */
export function widthFor(it: AddItem, w: number | null): number | null {
  const f = widthsOf(it.t);
  if (!f.length) return null;
  if (w === null) return it.t.width ?? f[0];
  if (f.includes(w)) return w;
  const below = f.filter((x) => x <= w);
  return below.length ? below[below.length - 1] : f[0];
}

/** the row a picker adds to (names its groups, says which elements are common) */
export type AddZone = "base" | "upper" | "island" | "tall";

export interface AddModel {
  /** the items with at least one width that fits */
  fit: AddItem[];
  /** the widths offered as chips (usual cabinet widths some item comes in) and the preselected one */
  chips: number[];
  best: number | null;
  /** the common elements (at most SHOWN), then the rest — also grouped (tall units last) for "Više elemenata" */
  top: AddItem[];
  rest: AddItem[];
  groups: { id: string; name: string; items: AddItem[] }[];
  /**
   * at a free end of a run (`ends`): the end units (završeci — catalog group "zavrsetak") that fit, shown in a block of their
   * own right after the common tiles (they are then not under "Više elemenata"); empty elsewhere
   */
  ends: AddItem[];
}

/** an end unit (catalog group "zavrsetak": rounded / angled open shelves, thick side panels) */
export const isEndItem = (it: AddItem) => !it.tall && it.t.group === "zavrsetak";

export function addModel(items: AddItem[], zone: AddZone, stretch: number | null, opts: { ends?: boolean } = {}): AddModel {
  const all = items.filter((it) => widthsOf(it.t).length > 0 && it.t.width !== null);
  const ends = opts.ends ? all.filter(isEndItem) : [];
  const fit = ends.length ? all.filter((it) => !isEndItem(it)) : all;
  const chips = CHIP_WIDTHS.filter((w) => fit.some((it) => widthsOf(it.t).includes(w)));
  const best = bestWidth(chips, stretch);
  // the common ones (in their order), then the others in catalogue order to fill up to SHOWN
  const order = COMMON[zone === "base" && fit.some((it) => it.tall) ? "baseTall" : zone];
  const byKey = new Map(fit.map((it) => [keyOf(it), it]));
  const top = order.map((k) => byKey.get(k)).filter((x): x is AddItem => Boolean(x));
  for (const it of fit) {
    if (top.length >= SHOWN) break;
    if (!top.includes(it)) top.push(it);
  }
  const shown = top.slice(0, SHOWN);
  // a tall unit fits here: one of them is always among the common tiles (the owner: "na plusić stisnuti i staviti stup"),
  // the most common first, in place of the last tile
  if (shown.length === SHOWN && !shown.some((it) => it.tall)) {
    const tall = fit.filter((it) => it.tall);
    const pick = COMMON.tall.map((id) => tall.find((it) => it.t.id === id)).find(Boolean) ?? tall[0];
    if (pick) shown[SHOWN - 1] = pick;
  }
  const rest = fit.filter((it) => !shown.includes(it));
  const names = new Map<string, string>(groupsFor(zone === "island" ? "base" : zone).map((g) => [g.id, g.name]));
  const groups: AddModel["groups"] = [];
  const push = (id: string, name: string, it: AddItem) => {
    const g = groups.find((x) => x.id === id);
    if (g) g.items.push(it);
    else groups.push({ id, name, items: [it] });
  };
  for (const it of rest.filter((x) => !x.tall)) push(it.t.group, names.get(it.t.group) ?? "Ostalo", it);
  for (const it of rest.filter((x) => x.tall)) push("tall", "Visoki elementi", it);
  return { fit: ends.length ? all : fit, chips, best, top: shown, rest, groups, ends };
}

/** the list a picker of a row offers: its own types, and in a wall's base row the tall units after them */
export const addItems = (types: TypeChoice[], tall: TypeChoice[] = []): AddItem[] => [
  ...types.map((t) => ({ t, tall: false })),
  ...tall.map((t) => ({ t, tall: true })),
];

/**
 * cm of a "+" place itself — an empty space, a stretch of bare wall, the bare floor at a run's end — for bestWidth;
 * between two elements of a full row: half of the wider one (PlanGap.split)
 */
export const gapStretch = (g: Pick<PlanGap, "kind" | "side" | "from" | "to" | "maxWidth" | "floor" | "split">): number | null =>
  g.kind === "seam"
    ? (g.split ?? null)
    : g.kind === "free" || (g.kind === "upper" && !g.side)
      ? Math.min(g.to - g.from, g.maxWidth)
      : (g.floor ?? 0) >= 15
        ? Math.min(g.floor ?? 0, g.maxWidth)
        : null;
