/**
 * The owner's "sve što možeš zamisliti" options as the studio shows them — plain data, kept apart from React so it is
 * tested (lib/studio/studio-options.test.ts):
 *
 *   opening     "Otvaranje fronti" as a customer thinks of it — Ručke / Na dodir / Gola / Luft za prste (OPEN_KINDS), the
 *               handle type under "Ručke"; one element's own way (elementOpenOptions: the kitchen's first, never Gola —
 *               a profile runs along the whole row)
 *   names       short tile names of hoods and backsplash kinds (the catalogue's are for the summary)
 *   narrowing   what an insert makes narrower or replaces (narrowedBetween, insertPreview, seamPreview, seamLine) — the
 *               "+" of a full row and "+ lijevo / + desno" say it before the pick ("susjedni elementi suzit će se: …")
 *   end units   endChoice: whether the selected element stands at a free end of its run and which završeci can go there
 *               (or, on an end unit itself, what it can become)
 *   photo round the zones' own ways of opening (zoneOpenOptions — Gola allowed), the 3D camera presets of the view switch
 *               (CAMERA_PRESETS), an oven column's choices (OVEN_AT, OVEN_BELOW), the sink bowl's places, a hob's widths
 *               (hobChoices)
 *
 * Everything that changes the kitchen goes through lib/studio/edit.ts.
 */
import { endTypes, handleDef, moduleDef, moduleTypes, type ModuleZone } from "@/lib/studio/catalog";
import { insertAfter, insertAtGap, insertBefore, type EditResult, type SlotEditInfo, type TypeChoice } from "@/lib/studio/edit";
import { hobWidthOf } from "@/lib/studio/fronts";
import { planKitchen, type KitchenPlan, type ListId, type PlanGap, type PlanSlot } from "@/lib/studio/plan";
import type { BacksplashKind, HandleStyle, HoodKind, IslandHoodStyle, KitchenConfig, OvenAt, ViewPreset } from "@/lib/studio/types";
import { CHIP_WIDTHS, bestWidth } from "./addModel";
import { rowOf, rowSlots } from "./meta";

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

/* ------------------------------------------------------------------ opening of the fronts */

/** how the fronts open, as a customer thinks of it */
export type OpenKind = "rucke" | "push" | "bez" | "luft";

export const OPEN_KINDS: { id: OpenKind; name: string; note: string; glyph: HandleStyle }[] = [
  { id: "rucke", name: "Ručke", note: "Ručka na svakoj fronti — letvica, gumb ili utorna ručka u rubu.", glyph: "letvica" },
  { id: "push", name: "Na dodir", note: "Bez ručki: lagani pritisak i fronta se sama otvori. Fuge između fronti su 4 mm.", glyph: "push" },
  { id: "bez", name: "Gola", note: "Udubljeni profil ispod radne ploče i iznad ladica — hvat za rub fronte, čiste linije.", glyph: "bez" },
  {
    id: "luft",
    name: "Luft za prste",
    note: "Bez ručki i profila: gornje fronte vise 2,5 cm ispod ormarića, donje počinju 3 cm ispod ploče — hvat prstima.",
    glyph: "luft",
  },
];
/** the handle types under "Ručke" */
export const HANDLE_TYPES: HandleStyle[] = ["letvica", "gumb", "utor"];
export const openKindOf = (h: HandleStyle): OpenKind => (h === "push" || h === "bez" || h === "luft" ? h : "rucke");
export const openKindName = (k: OpenKind) => OPEN_KINDS.find((o) => o.id === k)?.name ?? k;
/** the handle style a kind gives: "Ručke" keeps the handle type the kitchen has (else the bar handle) */
export const styleForKind = (k: OpenKind, current: HandleStyle): HandleStyle => (k === "rucke" ? (HANDLE_TYPES.includes(current) ? current : "letvica") : k);

export interface ElementOpenOption {
  kind: OpenKind;
  /** the style to store (null = the kitchen's: the element's own one is dropped) */
  style: HandleStyle | null;
  name: string;
  /** the kitchen's way */
  kitchen: boolean;
}

/**
 * One element's own way of opening (CabinetSpec.opt.open): the kitchen's way first ("kao kuhinja": no own style), then
 * handles, push and the finger gap — Gola only when it is the kitchen's (a profile runs along the whole row) or the
 * element already has it.
 */
export function elementOpenOptions(kitchen: HandleStyle, own: HandleStyle | null = null): ElementOpenOption[] {
  const k = openKindOf(kitchen);
  const kinds: OpenKind[] = [k, ...(["rucke", "push", "luft"] as OpenKind[]).filter((x) => x !== k)];
  if (own && !kinds.includes(openKindOf(own))) kinds.push(openKindOf(own));
  return kinds.map((kind) => ({
    kind,
    style: kind === k ? null : kind === openKindOf(own ?? kitchen) && own ? own : styleForKind(kind, kitchen),
    name: openKindName(kind),
    kitchen: kind === k,
  }));
}

/** "Metalna letvica" → the short chip name under "Ručke" */
export const handleTypeName = (h: HandleStyle) => ({ letvica: "Letvica", gumb: "Gumb", utor: "Utorna ručka" })[h as "letvica"] ?? handleDef(h)?.name ?? h;

/**
 * One zone's way of opening (KitchenConfig.zoneHandles — "Boje" → "Otvaranje po dijelovima"): the kitchen's way first
 * ("kao kuhinja": the zone's own one is dropped), then the others — Gola too (a zone is a whole row, the profile runs
 * along it). `own` = the zone's own style now (null: as the kitchen).
 */
export function zoneOpenOptions(kitchen: HandleStyle, own: HandleStyle | null = null): ElementOpenOption[] {
  const k = openKindOf(kitchen);
  const kinds: OpenKind[] = [k, ...OPEN_KINDS.map((o) => o.id).filter((x) => x !== k)];
  return kinds.map((kind) => ({
    kind,
    style: kind === k ? null : own && openKindOf(own) === kind ? own : styleForKind(kind, kitchen),
    name: openKindName(kind),
    kitchen: kind === k,
  }));
}

/* ------------------------------------------------------------------ the 3D camera (ViewSwitch) */

export interface CameraPresetDef {
  id: ViewPreset;
  /** the switch's label (desktop) */
  name: string;
  /** a phone's label */
  short: string;
  /** what it is, read out and in the tooltip */
  aria: string;
  /** the room's ceiling can show (the camera stands under it) — the switch offers "Strop" here */
  ceiling: boolean;
}

export const CAMERA_PRESETS: readonly CameraPresetDef[] = [
  { id: "studio", name: "3D studio", short: "Studio", aria: "3D studio: okrećite kuhinju sa svih strana", ceiling: false },
  { id: "prostorija", name: "Iz prostorije", short: "Prostorija", aria: "Pogled iz prostorije: s ulaza, u visini očiju", ceiling: true },
  { id: "frontalno", name: "Frontalno", short: "Sprijeda", aria: "Frontalno: ravno prema zidu A", ceiling: true },
  { id: "odozgo", name: "Odozgo", short: "Odozgo", aria: "Odozgo: kuhinja iz ptičje perspektive", ceiling: false },
];
export const cameraPresetDef = (p: ViewPreset): CameraPresetDef => CAMERA_PRESETS.find((c) => c.id === p) ?? CAMERA_PRESETS[0];

/* ------------------------------------------------------------------ element options of the "photo" round */

/** an oven column: what is under the oven, where the oven sits (edit.ts setOvenColumn) */
export const OVEN_BELOW: readonly { id: "ladice" | "vrata"; name: string }[] = [
  { id: "ladice", name: "Dvije ladice" },
  { id: "vrata", name: "Vrata" },
];
export const OVEN_AT: readonly { id: OvenAt | "standard"; name: string; sub: string }[] = [
  { id: "nisko", name: "Nisko", sub: "iznad postolja" },
  { id: "standard", name: "Standardno", sub: "iznad ladica" },
  { id: "oci", name: "U visini očiju", sub: "na liniji ploče" },
];

/** a sink's bowl in its cabinet */
export const BOWL_PLACES: readonly { id: "left" | "center" | "right"; name: string }[] = [
  { id: "left", name: "Lijevo" },
  { id: "center", name: "Sredina" },
  { id: "right", name: "Desno" },
];

/**
 * A hob's own width (ElementOpts.hob): the glass sizes that fit its cabinet, the one it takes by itself first marked
 * "standardno" (picking it drops the element's own width). Only worth showing when there is more than one.
 */
export function hobChoices(info: { value: number; own: boolean; options: number[] }, cabinet: number): { value: number; auto: number; options: number[] } {
  const auto = hobWidthOf(cabinet);
  const options = [...new Set([...info.options, auto])].filter((w) => w <= cabinet - 2).sort((a, b) => a - b);
  return { value: info.value, auto, options };
}

/** 3 → "3 ladice" */
export const drawersWord = (n: number) => (n === 1 ? "1 ladica" : n >= 2 && n <= 4 ? `${n} ladice` : `${n} ladica`);

/* ------------------------------------------------------------------ short tile names */

export const HOOD_SHORT: Record<HoodKind, string> = {
  ugradbena: "Ugradbena",
  dimnjak: "S dimnjakom",
  kosa: "Kosa staklena",
  ploca: "U ploči",
};
export const ISLAND_HOOD_SHORT: Record<IslandHoodStyle, string> = { dimnjak: "Visi sa stropa", kaseta: "U stropu" };
export const SPLASH_SHORT: Record<BacksplashKind, string> = {
  ploca: "Kao ploča",
  pola: "Do pola",
  staklo: "Staklo",
  plocice: "Pločice",
  bez: "Bez obloge",
};
export const SPLASH_ORDER: BacksplashKind[] = ["ploca", "pola", "staklo", "plocice", "bez"];

/* ------------------------------------------------------------------ what an insert makes narrower */

export interface Narrowed {
  slotId: string;
  name: string;
  from: number;
  to: number;
}

const defOf = (s: Pick<PlanSlot, "zone" | "type">) => moduleDef(s.zone === "island" ? "base" : s.zone, s.type);
/** a cabinet, appliance or tall unit — not empty space or a filler strip */
const real = (s: PlanSlot) => {
  const d = defOf(s);
  return Boolean(d && !d.spacer && !d.filler);
};
const nameOf = (s: PlanSlot) => {
  const d = defOf(s);
  return d ? (s.corner && !d.corner ? `kutni element (${lower(d.name)})` : lower(d.name)) : s.type;
};

/**
 * The elements of `before` that are narrower in `after` (both left → right; `skip`: slots of `after` that are new — the
 * inserted element). The rows are aligned by type (the order never changes, elements only go or get narrower), the
 * pairing that keeps the widths closest wins — so of two equal cabinets the one that really got narrower is named.
 */
export function narrowedBetween(before: PlanSlot[], after: PlanSlot[], skip: Set<string> = new Set()): Narrowed[] {
  const B = before.filter(real);
  const A = after.filter((s) => real(s) && !skip.has(s.id));
  const n = B.length;
  const m = A.length;
  const same = (b: PlanSlot, a: PlanSlot) => b.type === a.type && (b.zone === "tall") === (a.zone === "tall");
  // score[i][j]: best alignment of B[i..] with A[j..] (a match is worth 1000 less the change of width)
  const score: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      let best = Math.max(score[i + 1][j], score[i][j + 1]);
      if (same(B[i], A[j])) best = Math.max(best, 1000 - Math.abs(B[i].width - A[j].width) + score[i + 1][j + 1]);
      score[i][j] = best;
    }
  }
  const out: Narrowed[] = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (same(B[i], A[j]) && score[i][j] === 1000 - Math.abs(B[i].width - A[j].width) + score[i + 1][j + 1]) {
      if (A[j].width < B[i].width - 0.5) out.push({ slotId: A[j].id, name: nameOf(A[j]), from: Math.round(B[i].width), to: Math.round(A[j].width) });
      i++;
      j++;
    } else if (score[i][j] === score[i + 1][j]) i++;
    else j++;
  }
  return out;
}

/** the elements of a list, left → right */
export const listRow = (plan: KitchenPlan, id: ListId) => plan.slots.filter((s) => s.list?.id === id).sort((a, b) => a.x - b.x);

/** what the insert `r` (into list `id` of `plan`) made narrower there */
export function insertPreview(plan: KitchenPlan, r: EditResult, id: ListId): Narrowed[] {
  if (!r.ok) return [];
  const after = planKitchen(r.cfg);
  return narrowedBetween(listRow(plan, id), listRow(after, id), new Set(r.slotId ? [r.slotId] : []));
}

/** a plain type of the row that comes in `w` (the narrowing an insert causes depends on its width only) */
export function probeTypeFor(zone: "base" | "upper" | "island", w: number): string | null {
  const pool = moduleTypes(zone === "island" ? "island" : zone).filter((d) => !d.spacer && !d.hood && !d.endUnit && d.widths.includes(w));
  return (pool.find((d) => !d.feature) ?? pool[0])?.id ?? null;
}

export interface SeamPreview {
  /** what gets narrower for a new element `width` cm wide (empty: it fits into free room) */
  narrowed: Narrowed[];
  /** a replace seam (nothing can make room): what the new element takes the place of */
  replaced: { name: string; width: number } | null;
  /** the width it was worked out for */
  width: number;
}

/**
 * A full row's "+" (PlanGap kind "seam"): what happens for a new element `width` cm wide — the elements that get narrower
 * (planned exactly as the insert does it), or the one it replaces. null when no plain element of that width goes in.
 */
export function seamPreview(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, width: number): SeamPreview | null {
  if (gap.kind !== "seam") return null;
  if (gap.replace) {
    const r = plan.slots.find((s) => s.id === gap.replace);
    return r ? { narrowed: [], replaced: { name: nameOf(r), width: Math.round(r.width) }, width } : null;
  }
  const t = probeTypeFor(gap.zone, width);
  if (!t) return null;
  const r = insertAtGap(cfg, gap.id, t, width);
  if (!r.ok) return null;
  return { narrowed: insertPreview(plan, r, gap.list), replaced: null, width };
}

/**
 * seamPreview at the width the "+" picker of this joint would start with (addModel bestWidth over the usual widths that
 * fit; the next nearest when no plain element comes in it) — what the marker's tooltip says before it is opened
 */
export function seamPreviewAtStart(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap): SeamPreview | null {
  if (gap.kind !== "seam") return null;
  if (gap.replace) return seamPreview(cfg, plan, gap, gap.split ?? 60);
  const cands = CHIP_WIDTHS.filter((w) => w <= gap.maxWidth + 0.5);
  const first = bestWidth(cands, gap.split ?? null) ?? 60;
  for (const w of [...cands].sort((a, b) => Math.abs(a - first) - Math.abs(b - first) || a - b).slice(0, 3)) {
    const p = seamPreview(cfg, plan, gap, w);
    if (p) return p;
  }
  return null;
}

/** "ladičar 60 → 45 cm, vrata 60 → 45 cm" */
export const narrowedText = (n: Narrowed[]) => n.map((x) => `${x.name} ${x.from} → ${x.to} cm`).join(", ");

/**
 * What a full row's "+" does, in one line (the picker's subtitle, the marker's tooltip):
 *   "susjedni element suzit će se: ladičar 60 → 30 cm" / "susjedni elementi suzit će se: ladičar 60 → 45 cm, vrata 60 → 45 cm"
 *   "novi element zamijenit će: ladičar, 60 cm" / "stane bez sužavanja"
 * Without a preview (none worked out yet): the general line.
 */
export function seamLine(p: SeamPreview | null, replace = false): string {
  if (p?.replaced || (!p && replace)) return p?.replaced ? `novi element zamijenit će: ${p.replaced.name}, ${p.replaced.width} cm` : "novi element zamijenit će susjedni";
  if (!p) return "susjedni element suzit će se";
  if (!p.narrowed.length) return "stane bez sužavanja";
  return `${p.narrowed.length > 1 ? "susjedni elementi suzit će se" : "susjedni element suzit će se"}: ${narrowedText(p.narrowed)}`;
}

/* ------------------------------------------------------------------ end units (završeci) */

export interface EndChoice {
  /** the end of the run (run-local, as the edit functions see it: "left" = insertBefore) */
  side: "left" | "right";
  /** add = a new end unit beyond the element; change = the element is an end unit itself (another one in its place) */
  mode: "add" | "change";
  /** the end units of the row, with the width each gets there (null: no room) */
  items: TypeChoice[];
}

/** the end-unit types of the element's row zone (an island has none) */
const endPool = (zone: SlotEditInfo["zone"]): ModuleZone | null => (zone === "base" || zone === "upper" || zone === "tall" ? zone : null);

/**
 * The selected element stands at a free end of its run (nothing but bare floor / wall beyond its end panel): the
 * završeci that can go beyond it there (they take the place of the run's end panel). An end unit standing at its end:
 * the other end units it can become (changeType). null elsewhere (between elements, at a corner, on the island, empty
 * space). Planned: an end unit is offered only where the planner really puts it at the end (PlanSlot.end).
 */
export function endChoice(cfg: KitchenConfig, plan: KitchenPlan, info: SlotEditInfo): EndChoice | null {
  const slot = info.slot;
  const def = info.def ?? defOf(slot);
  const zone = endPool(info.zone);
  if (!zone || slot.run === "isl" || slot.corner || !slot.list || !def || def.spacer || def.filler) return null;
  // a tall unit standing in a base run is not at the run's end in the planner's sense
  if (slot.zone === "tall" && slot.list.id === slot.run) return null;
  const isEnd = (id: string) => endTypes(zone).some((d) => d.id === id);
  if (slot.end) return { side: slot.end.side, mode: "change", items: info.types.filter((t) => isEnd(t.id)) };
  if (def.endUnit) return null;
  const row = rowSlots(plan.slots, slot.run, rowOf(slot).zone);
  const i = row.findIndex((x) => x.id === slot.id);
  if (i < 0) return null;
  for (const side of ["left", "right"] as const) {
    if (side === "left" ? i !== 0 : i !== row.length - 1) continue;
    const items = (side === "left" ? info.insertBefore : info.insertAfter).filter((t) => isEnd(t.id));
    const probe = items.find((t) => t.width !== null);
    if (!probe || probe.width === null) continue;
    const r = (side === "left" ? insertBefore : insertAfter)(cfg, slot.id, probe.id, probe.width);
    const added = r.ok && r.slotId ? planKitchen(r.cfg).slots.find((s) => s.id === r.slotId) : undefined;
    if (added?.end) return { side, mode: "add", items };
  }
  return null;
}
