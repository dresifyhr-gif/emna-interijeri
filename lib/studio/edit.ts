/**
 * Element editing for the studio UI — pure functions over KitchenConfig (no React, no three.js).
 *
 * Every helper takes the current config and a plan slot id (ModuleInfo.id / PlanSlot.id), and returns an
 * EditResult: the new sanitized config, whether the edit was possible, a Croatian note for the customer and
 * the id the edited element has in the new plan (slot ids are positions, so they change when elements move).
 * A refused edit returns the (sanitized) input config unchanged with the reason in `warning`.
 *
 * The first edit of a run turns what the planner placed there into an explicit list (KitchenConfig.runs /
 * upperRuns / tallRun, see plan.ts materializeLists) and then changes that list; every edit is validated by
 * planning the result, so what the helpers allow is exactly what the 3D view, the price and the summary show.
 *
 *   base runs and the island: cabinets stand side by side — removing one closes the gap, a new or wider one
 *                             needs free space at the end of the run (or an adjacent "Slobodno mjesto")
 *   wall units:               they hang on their own — removing one leaves bare wall ("Bez gornjeg elementa"),
 *                             a new or wider one takes that space; the hood stays above the hob
 *   blind corners:            fixed width, only their type changes
 *   tall column:              1 to MAX_TALL units of any mix of widths (e.g. 30 larder + 96 side-by-side fridge niche
 *                             + 60 oven); its width moves the base run next to it, and it may grow as long as the
 *                             planner keeps it on its wall without leaving cabinets out (plan.ts tallCapacity)
 *   walls / island:           setWallLength (the dimension labels in 3D), clamped like sanitizeConfig
 *
 * Planning is ~0.15 ms. slotEditInfo / allowedWidths / insertOptions check every option by planning it, but skip
 * widths that cannot fit (wider than the free room next to the element) and probe each width only once for inserts.
 */

import { catalog, cornerTypes, moduleDef, moduleTypes, widthAllowed, type ModuleGroup, type ModuleTypeDef } from "./catalog";
import {
  MAX_LIST,
  MAX_TALL,
  defaultCornerType,
  islandMax,
  limitsFor,
  listOf,
  listZone,
  materializeLists,
  planKitchen,
  sanitizeConfig,
  tallCapacity,
  wallsFor,
  withList,
  type KitchenPlan,
  type ListId,
  type ListZone,
  type PlanList,
  type PlanSlot,
} from "./plan";
import { DIM, UPPER_HEIGHTS, WORKTOP_HEIGHTS, planHeights, type HeightPlan } from "./plan";
import type { BaseRunId, CabinetSpec, DimTarget, HeightSpec, KitchenConfig, WallId } from "./types";

export interface EditResult {
  /** the new config (sanitized); the unchanged input when `ok` is false */
  cfg: KitchenConfig;
  ok: boolean;
  /** Croatian note for the customer: why the edit was refused, or what it caused (e.g. "no sink now") */
  warning: string | null;
  /** id of the edited / inserted element in the new plan (follow the selection with it); null when removed */
  slotId: string | null;
}

export interface TypeChoice {
  id: string;
  name: string;
  description: string;
  group: ModuleGroup;
  /** widths this type comes in */
  widths: number[];
  /** width the slot would get when switched to this type; null = it does not fit here */
  width: number | null;
  current: boolean;
  /** inserts (insertOptions, SlotEditInfo.insertAfter / insertBefore): every width of this type that fits there, ascending */
  fitting?: number[];
}

export interface WidthChoice {
  width: number;
  fits: boolean;
  current: boolean;
  /** the type the element becomes at this width (base doors: one door up to 60, two doors above) */
  type?: string;
  /** why this width does not fit here (Croatian); null when it fits */
  reason?: string | null;
}

/** a width of the element's type with everything allowedWidths knows about it */
export type WidthOption = Required<WidthChoice>;

/** where an insert goes, run-local: "before" = towards the left end of the run (as seen facing its wall) */
export type InsertSide = "before" | "after";

export interface WallEditResult extends EditResult {
  /** the length set (cm), after clamping */
  value: number;
  /** the range this wall / the island may have in this layout (cm) */
  min: number;
  max: number;
}

export interface SlotEditInfo {
  slot: PlanSlot;
  zone: ListZone;
  /** null for blind-corner units */
  listId: ListId | null;
  /** position in the list (-1 for corners) */
  index: number;
  /** the customer has edited this run already */
  edited: boolean;
  def: ModuleTypeDef | undefined;
  /** cm free in this run (base / island: room left at the end; wall units: bare wall in all stretches) */
  free: number;
  /** every type this slot can become (corner slots: corner types), with the width it would get */
  types: TypeChoice[];
  /** widths of the current type (corners and the hood: just the current one) */
  widths: WidthChoice[];
  /** types that can be inserted right after / before this element, with the width they would get */
  insertAfter: TypeChoice[];
  insertBefore: TypeChoice[];
  canMoveLeft: boolean;
  canMoveRight: boolean;
  canRemove: boolean;
  /** why something is not possible (Croatian, for a tooltip or a note) */
  notes: string[];
}

// ---------------------------------------------------------------- internals

interface Ctx {
  cfg: KitchenConfig;
  plan: KitchenPlan;
  slot: PlanSlot;
}

const SPACER: Record<ListZone, string> = { base: "slobodno", island: "slobodno", upper: "prazno", tall: "" };
const PREFERRED = [60, 45, 50, 40, 80, 90, 30, 20, 15];

function context(input: KitchenConfig, slotId: string): Ctx | null {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const slot = plan.slots.find((s) => s.id === slotId);
  return slot ? { cfg, plan, slot } : null;
}

const fail = (cfg: KitchenConfig, warning: string, slotId: string | null = null): EditResult => ({ cfg, ok: false, warning, slotId });

const defOf = (zone: ListZone, type: string) => moduleDef(zone === "island" ? "base" : zone, type);
const isSpacer = (zone: ListZone, type: string) => Boolean(defOf(zone, type)?.spacer);

/** the config with this list made explicit (plus, on the first base edit, every other run holding an essential) */
function editable(ctx: Ctx, id: ListId): { cfg: KitchenConfig; list: CabinetSpec[] } {
  const cfg = materializeLists(ctx.cfg, ctx.plan, [id]);
  return { cfg, list: (listOf(cfg, id) ?? []).map((e) => ({ ...e })) };
}

function planList(plan: KitchenPlan, id: ListId): PlanList | undefined {
  return plan.lists.find((l) => l.id === id);
}

const essentialsOf = (plan: KitchenPlan) => {
  const has = (f: "sink" | "hob") => plan.slots.some((s) => (s.zone === "base" || s.zone === "island") && moduleDef("base", s.type)?.feature === f);
  return { sink: has("sink"), hob: has("hob") };
};

/** cabinets the plan leaves out of edited lists (not counting empty space) */
function cutCount(plan: KitchenPlan): number {
  return plan.lists.reduce((n, l) => n + l.dropped.filter((e) => !isSpacer(l.zone, e.type)).length, 0);
}

/**
 * Plan `next` and accept it only if nothing of the edited list is left out, the tall column did not vanish and no
 * other edited run lost a cabinet because of this edit. `focus` = list index of the element to follow.
 */
function commit(before: Ctx, next: KitchenConfig, id: ListId, focus: number | null, refuse: string): EditResult {
  const cfg = sanitizeConfig(next);
  const plan = planKitchen(cfg);
  const l = planList(plan, id);
  const tallBefore = before.plan.slots.some((s) => s.zone === "tall");
  const tallAfter = plan.slots.some((s) => s.zone === "tall");
  if ((l && l.dropped.length) || (tallBefore && !tallAfter && cfg.tall) || cutCount(plan) > cutCount(before.plan)) {
    return fail(before.cfg, refuse, before.slot.id);
  }
  const slotId = focus === null ? null : (plan.slots.find((s) => s.list?.id === id && s.list.index === focus)?.id ?? null);
  // what the edit took away
  const e0 = essentialsOf(before.plan);
  const e1 = essentialsOf(plan);
  const notes: string[] = [];
  if (e0.sink && !e1.sink) notes.push("Kuhinja sada nema sudopera.");
  if (e0.hob && !e1.hob) notes.push("Kuhinja sada nema ploče za kuhanje.");
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId };
}

/** free cm in a list as the plan placed it */
function freeOf(plan: KitchenPlan, id: ListId): number {
  const l = planList(plan, id);
  if (!l) return 0;
  if (l.zone === "tall") return 0;
  return Math.max(0, Math.round((l.capacity - l.used) * 10) / 10);
}

function noRoom(plan: KitchenPlan, id: ListId, need?: number): string {
  const free = Math.floor(freeOf(plan, id));
  const what = need ? `Za ${need} cm nema mjesta` : "Za to nema mjesta";
  return `${what} — slobodno je još ${free} cm. Suzite ili uklonite susjedni element.`;
}

/**
 * widths to try for `def` taking the place of something `w` cm wide: closest first (narrower on ties); into empty
 * space (`inside`) the widths that fit inside it come first, widest first, so the neighbours stay put
 */
function widthsNear(def: ModuleTypeDef, w: number, inside = false): number[] {
  if (def.spacer) return [Math.round(Math.min(def.maxWidth, Math.max(def.minWidth, w)))];
  const near = [...def.widths].sort((a, b) => Math.abs(a - w) - Math.abs(b - w) || a - b);
  if (!inside) return near;
  return [...def.widths.filter((x) => x <= w).sort((a, b) => b - a), ...near.filter((x) => x > w)];
}

/** widths to try for a new element: the usual 60 cm first */
function widthsNew(def: ModuleTypeDef): number[] {
  if (def.spacer) return [60];
  return [...def.widths].sort((a, b) => {
    const ia = PREFERRED.indexOf(a);
    const ib = PREFERRED.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
}

/**
 * Put `w` cm into `list` at `at` taking room from an adjacent empty-space entry first (the one after, then the one
 * before), so neighbouring cabinets stay where they are. Returns the list and the index of the new element.
 */
function placeInto(list: CabinetSpec[], at: number, entry: CabinetSpec, zone: ListZone): CabinetSpec[] {
  const out = list.map((e) => ({ ...e }));
  out.splice(at, 0, entry);
  const take = (k: number) => {
    const e = out[k];
    if (!e || !isSpacer(zone, e.type) || e.width < entry.width - 0.5) return false;
    e.width -= entry.width;
    return true;
  };
  if (!take(at + 1)) take(at - 1);
  return tidy(out, zone, entry);
}

/** a narrower element leaves its old room as empty space on the wall (wall units), so neighbours stay put */
function keepRoom(list: CabinetSpec[], index: number, freed: number, zone: ListZone): void {
  if (zone !== "upper" || freed < 5) return;
  const next = list[index + 1];
  if (next && isSpacer(zone, next.type)) next.width += freed;
  else list.splice(index + 1, 0, { type: SPACER[zone], width: freed });
}

/** neighbouring empty-space entries become one; tiny leftovers (< 5 cm) go. Keeps entry objects (callers track them). */
function tidy(list: CabinetSpec[], zone: ListZone, keep?: CabinetSpec): CabinetSpec[] {
  const out: CabinetSpec[] = [];
  for (const e of list) {
    if (e !== keep && isSpacer(zone, e.type) && e.width < 5) continue;
    const last = out[out.length - 1];
    if (last && last !== keep && e !== keep && isSpacer(zone, last.type) && isSpacer(zone, e.type)) last.width += e.width;
    else out.push(e);
  }
  return out;
}

/** a wider element takes the extra from empty space right after it, else right before it */
function growInto(list: CabinetSpec[], index: number, extra: number, zone: ListZone): void {
  const after = list[index + 1];
  const before = list[index - 1];
  if (after && isSpacer(zone, after.type) && after.width >= extra) after.width -= extra;
  else if (before && isSpacer(zone, before.type) && before.width >= extra) before.width -= extra;
}

/** a list entry of a slot that is not a corner */
function listSlot(ctx: Ctx): { id: ListId; index: number; zone: ListZone } | null {
  const l = ctx.slot.list;
  return l ? { id: l.id, index: l.index, zone: listZone(l.id) } : null;
}

// ---------------------------------------------------------------- room

/** cm of the tall column's units where it stands */
const tallUsed = (plan: KitchenPlan) => plan.slots.filter((s) => s.zone === "tall").reduce((n, s) => n + s.width, 0);

/** why the tall column cannot take `need` cm more (computes plan.ts tallCapacity: only on a refusal) */
function tallNoRoom(cfg: KitchenConfig, plan: KitchenPlan, need?: number): string {
  const used = Math.round(tallUsed(plan));
  const cap = Math.floor(tallCapacity(cfg));
  const what = need ? `Za ${need} cm u visokom stupu nema mjesta` : "Za to u visokom stupu nema mjesta";
  return `${what} — stup je sada širok ${used} cm, a uz ovaj zid može biti najviše ${cap} cm. Suzite ili uklonite neki visoki element.`;
}

/** the refusal for a list that has no room for `need` cm */
function noRoomIn(ctx: Ctx, id: ListId, need?: number): string {
  return listZone(id) === "tall" ? tallNoRoom(ctx.cfg, ctx.plan, need) : noRoom(ctx.plan, id, need);
}

/**
 * The most cm an element at `index` of list `id` can take (a necessary condition — the plan decides): the list's free
 * room, plus empty-space entries right beside it, plus (`replace`) the element that stands there now. Inserts:
 * `index` is the insert position. Tall column: what plan.ts tallCapacity leaves (computed once per call site).
 */
function roomAt(ctx: Ctx, id: ListId, list: CabinetSpec[], index: number, replace: boolean, tallCap?: number): number {
  const zone = listZone(id);
  const cur = replace ? (list[index]?.width ?? 0) : 0;
  if (zone === "tall") return (tallCap ?? tallCapacity(ctx.cfg)) - tallUsed(ctx.plan) + cur + 0.5;
  const near = replace ? [list[index - 1], list[index + 1]] : [list[index - 1], list[index]];
  const beside = near.reduce((n, e) => n + (e && isSpacer(zone, e.type) ? e.width : 0), 0);
  return freeOf(ctx.plan, id) + beside + cur + 0.5;
}

/** types that may stand in a list zone (spacers included, corner units not) */
const poolOf = (zone: ListZone) => (zone === "island" ? moduleTypes("island") : moduleTypes(zone === "base" ? "base" : zone));

/**
 * Whether a cabinet fits does not depend on its type, only on its width (the planner places edited lists as listed),
 * except for a hood (it anchors above the hob). So insert previews probe each width once, with a plain type of that
 * width standing in. lib/studio/studio.test.ts checks this against the real inserts.
 */
function probeType(zone: ListZone, w: number): string | null {
  const pool = poolOf(zone).filter((d) => !d.spacer && !d.hood && widthAllowed(d, w));
  return (pool.find((d) => !d.feature) ?? pool[0])?.id ?? null;
}

// ---------------------------------------------------------------- edits

/** Switch an element to another type (the width follows the type: same width when it comes in it, else the closest that fits). */
export function changeType(input: KitchenConfig, slotId: string, type: string): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  return changeTypeIn(ctx, type);
}

function changeTypeIn(ctx: Ctx, type: string, tallCap?: number): EditResult {
  const { slot } = ctx;
  if (slot.cornerId) {
    const zone = slot.zone === "upper" ? "upper" : "base";
    if (!cornerTypes(zone).some((t) => t.id === type)) return fail(ctx.cfg, "Ovaj element ne može stajati u kutu.", slot.id);
    const corners = { ...(ctx.cfg.corners ?? {}) };
    if (type === defaultCornerType(zone)) delete corners[slot.cornerId];
    else corners[slot.cornerId] = type;
    const cfg = sanitizeConfig({ ...ctx.cfg, corners });
    return { cfg, ok: true, warning: null, slotId: slot.id };
  }
  const ls = listSlot(ctx);
  if (!ls) return fail(ctx.cfg, "Ovaj element se ne može mijenjati.", slot.id);
  const def = defOf(ls.zone, type);
  if (!def || def.corner || (ls.zone === "island" && !def.island)) return fail(ctx.cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
  if (type === slot.type) return { cfg: ctx.cfg, ok: true, warning: null, slotId: slot.id };
  const { cfg, list } = editable(ctx, ls.id);
  const cur = list[ls.index];
  if (!cur) return fail(ctx.cfg, "Element više ne postoji.", slot.id);
  const fromSpacer = isSpacer(ls.zone, cur.type);
  // widths that cannot fit are not even planned (the tall column's room is only worked out when it is needed)
  const tries = widthsNear(def, cur.width, fromSpacer);
  const needRoom = tries.some((w) => w > cur.width);
  const room = needRoom ? roomAt(ctx, ls.id, list, ls.index, true, tallCap) : Infinity;
  let last: EditResult | null = null;
  for (const w of tries) {
    if (w > room) continue;
    const next = list.map((e) => ({ ...e }));
    const el: CabinetSpec = { type, width: w };
    next[ls.index] = el;
    if (fromSpacer && cur.width - w >= 5) {
      // a cabinet into empty space: what it does not take stays empty
      next.splice(ls.index + 1, 0, { type: cur.type, width: cur.width - w });
    } else if (w < cur.width) keepRoom(next, ls.index, cur.width - w, ls.zone);
    else if (w > cur.width) growInto(next, ls.index, w - cur.width, ls.zone);
    const final = tidy(next, ls.zone, el);
    last = commit(ctx, withList(cfg, ls.id, final), ls.id, final.indexOf(el), "");
    if (last.ok) return last;
  }
  const min = def.spacer ? def.minWidth : Math.min(...def.widths);
  if (ls.zone === "tall") return fail(ctx.cfg, `${def.name} (${min} cm) ovdje ne stane. ${tallNoRoom(ctx.cfg, ctx.plan)}`, slot.id);
  return fail(ctx.cfg, `${def.name} (od ${min} cm) ovdje ne stane — slobodno je još ${Math.floor(freeOf(ctx.plan, ls.id))} cm.`, slot.id);
}

/** Change an element's width (one of its type's widths; base doors switch between one and two doors on their own). */
export function changeWidth(input: KitchenConfig, slotId: string, width: number): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  return changeWidthIn(ctx, width);
}

function changeWidthIn(ctx: Ctx, width: number, tallCap?: number): EditResult {
  const { slot } = ctx;
  if (slot.cornerId) return fail(ctx.cfg, "Kutni element ima stalnu širinu.", slot.id);
  if (slot.anchored) return fail(ctx.cfg, "Širina nape prati ploču za kuhanje.", slot.id);
  const ls = listSlot(ctx);
  if (!ls) return fail(ctx.cfg, "Ovaj element se ne može mijenjati.", slot.id);
  const w = Math.round(width);
  let def = defOf(ls.zone, slot.type);
  if (!def) return fail(ctx.cfg, "Nepoznat element.", slot.id);
  if (!widthAllowed(def, w)) {
    const sib = def.sibling ? defOf(ls.zone, def.sibling) : undefined;
    if (sib && widthAllowed(sib, w) && (ls.zone !== "island" || sib.island)) def = sib;
    else return fail(ctx.cfg, `${def.name} dolazi u širinama: ${def.widths.join(", ")} cm.`, slot.id);
  }
  if (w === slot.width && def.id === slot.type) return { cfg: ctx.cfg, ok: true, warning: null, slotId: slot.id };
  const { cfg, list } = editable(ctx, ls.id);
  const cur = list[ls.index];
  if (!cur) return fail(ctx.cfg, "Element više ne postoji.", slot.id);
  if (w > cur.width && w > roomAt(ctx, ls.id, list, ls.index, true, tallCap)) return fail(ctx.cfg, noRoomIn(ctx, ls.id, w), slot.id);
  const next = list.map((e) => ({ ...e }));
  const el: CabinetSpec = { type: def.id, width: w };
  next[ls.index] = el;
  if (w < cur.width) keepRoom(next, ls.index, cur.width - w, ls.zone);
  else if (w > cur.width) growInto(next, ls.index, w - cur.width, ls.zone);
  const final = tidy(next, ls.zone, el);
  const r = commit(ctx, withList(cfg, ls.id, final), ls.id, final.indexOf(el), "");
  return r.ok ? r : fail(ctx.cfg, noRoomIn(ctx, ls.id, w), slot.id);
}

/** the list and position an insert next to this slot goes to, or why there is none */
function insertTarget(ctx: Ctx, after: boolean): { id: ListId; at: number } | string {
  const { slot, plan } = ctx;
  if (slot.cornerId) {
    // after the left corner = start of wall A's run; before the right corner = its end
    const id: ListId = slot.zone === "upper" ? "a:u" : "a";
    // corner "left" = blind towards the A–B corner = the left end of wall A
    const atLeftEnd = slot.corner === "left";
    if (after !== atLeftEnd) return after ? "Iza kutnog elementa nastavlja se susjedni zid." : "Ispred kutnog elementa nastavlja se susjedni zid.";
    return { id, at: after ? 0 : (planList(plan, id)?.entries.length ?? 0) };
  }
  const ls = listSlot(ctx);
  if (!ls) return "Ovdje se ne može dodati element.";
  return { id: ls.id, at: ls.index + (after ? 1 : 0) };
}

const listMax = (zone: ListZone) => (zone === "tall" ? MAX_TALL : MAX_LIST);
const fullNote = (zone: ListZone) =>
  zone === "tall" ? `Visoki stup ima najviše ${MAX_TALL} elemenata.` : "U ovom nizu je već najviše elemenata.";

/** put `el` at `at` in list `id` (prepared by `editable`) and validate it */
function insertAt(ctx: Ctx, cfg: KitchenConfig, list: CabinetSpec[], id: ListId, at: number, el: CabinetSpec): EditResult {
  const zone = listZone(id);
  const placed = placeInto(list, at, el, zone);
  return commit(ctx, withList(cfg, id, placed), id, placed.indexOf(el), "");
}

function insert(input: KitchenConfig, slotId: string, type: string, width: number | undefined, after: boolean): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot } = ctx;
  const t = insertTarget(ctx, after);
  if (typeof t === "string") return fail(ctx.cfg, t, slot.id);
  const { id, at } = t;
  const zone = listZone(id);
  const def = defOf(zone, type);
  if (!def || def.corner || (zone === "island" && !def.island)) return fail(ctx.cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
  const { cfg, list } = editable(ctx, id);
  if (list.length >= listMax(zone)) return fail(ctx.cfg, fullNote(zone), slot.id);
  const tries = width !== undefined ? [Math.round(width)] : widthsNew(def);
  // room an insert can use at most: the run's free space plus an empty-space entry right beside the spot
  const room = roomAt(ctx, id, list, at, false);
  let last: EditResult | null = null;
  for (const w of tries) {
    if (!widthAllowed(def, w)) {
      last = fail(ctx.cfg, `${def.name} dolazi u širinama: ${def.widths.join(", ")} cm.`, slot.id);
      continue;
    }
    if (w > room) {
      last = fail(ctx.cfg, zone === "tall" ? noRoomIn(ctx, id, w) : `Za novi element (${w} cm) nema mjesta — slobodno je još ${Math.floor(freeOf(ctx.plan, id))} cm.`, slot.id);
      continue;
    }
    last = insertAt(ctx, cfg, list, id, at, { type, width: w });
    if (last.ok) return last;
    last = fail(ctx.cfg, zone === "tall" ? noRoomIn(ctx, id, w) : `Za novi element (${w} cm) nema mjesta — slobodno je još ${Math.floor(freeOf(ctx.plan, id))} cm.`, slot.id);
  }
  return last ?? fail(ctx.cfg, "Za novi element nema mjesta.", slot.id);
}

/** Add a new element right after this one (width: the given one, else the usual width that fits). */
export function insertAfter(cfg: KitchenConfig, slotId: string, type: string, width?: number): EditResult {
  return insert(cfg, slotId, type, width, true);
}

/** Add a new element right before this one. */
export function insertBefore(cfg: KitchenConfig, slotId: string, type: string, width?: number): EditResult {
  return insert(cfg, slotId, type, width, false);
}

/**
 * Remove an element. Base runs and the island close the gap; a wall unit leaves bare wall behind (neighbours
 * stay where they are); removing the last tall unit switches the tall column off.
 */
export function remove(input: KitchenConfig, slotId: string): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot } = ctx;
  if (slot.cornerId) return fail(ctx.cfg, "Kutni element ne može se ukloniti — možete mu promijeniti izvedbu.", slot.id);
  const ls = listSlot(ctx);
  if (!ls) return fail(ctx.cfg, "Ovaj element se ne može ukloniti.", slot.id);
  const { cfg, list } = editable(ctx, ls.id);
  const cur = list[ls.index];
  if (!cur) return fail(ctx.cfg, "Element više ne postoji.", slot.id);
  if (ls.zone === "tall" && list.length === 1) {
    const next = sanitizeConfig({ ...withList(cfg, "tall", undefined), tall: false });
    return { cfg: next, ok: true, warning: null, slotId: null };
  }
  const next = list.map((e) => ({ ...e }));
  if (ls.zone === "upper" && !isSpacer(ls.zone, cur.type)) next[ls.index] = { type: SPACER.upper, width: cur.width };
  else next.splice(ls.index, 1);
  return commit(ctx, withList(cfg, ls.id, tidy(next, ls.zone)), ls.id, null, "Element se ne može ukloniti.");
}

function move(input: KitchenConfig, slotId: string, dir: -1 | 1): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot } = ctx;
  if (slot.cornerId) return fail(ctx.cfg, "Kutni element ostaje u kutu.", slot.id);
  if (slot.anchored) return fail(ctx.cfg, "Napa ostaje iznad ploče za kuhanje — pomaknite ploču.", slot.id);
  const ls = listSlot(ctx);
  if (!ls) return fail(ctx.cfg, "Ovaj element se ne može pomaknuti.", slot.id);
  const { cfg, list } = editable(ctx, ls.id);
  let j = ls.index + dir;
  // hop over the anchored hood (it does not move): swap with the element beyond it
  const hood = ctx.plan.slots.find((s) => s.list?.id === ls.id && s.anchored);
  if (hood && hood.list && j === hood.list.index) j += dir;
  if (j < 0 || j >= list.length) return fail(ctx.cfg, dir < 0 ? "Element je već na početku niza." : "Element je već na kraju niza.", slot.id);
  const next = list.map((e) => ({ ...e }));
  [next[ls.index], next[j]] = [next[j], next[ls.index]];
  return commit(ctx, withList(cfg, ls.id, next), ls.id, j, "Na tom mjestu element ne stane.");
}

/** Swap with the neighbour towards the left end of the run (run-local x: as seen facing that wall; island: from wall A). */
export function moveLeft(cfg: KitchenConfig, slotId: string): EditResult {
  return move(cfg, slotId, -1);
}

/** Swap with the neighbour towards the right end of the run. */
export function moveRight(cfg: KitchenConfig, slotId: string): EditResult {
  return move(cfg, slotId, 1);
}

/** a run as a reset target: a wall, the island or the tall column */
export type RunRef = WallId | "isl" | "tall";

/**
 * Put a run back to what the planner would place there. `zone` limits it to the base or the wall units of a wall
 * (default: both). While other wall base runs stay edited, a reset wall base run gets the planner's default
 * contents for that wall as an explicit list (so its sink / hob come back).
 */
export function resetRun(input: KitchenConfig, run: RunRef, zone?: "base" | "upper"): EditResult {
  const cfg0 = sanitizeConfig(input);
  if (run === "tall") return { cfg: sanitizeConfig(withList(cfg0, "tall", undefined)), ok: true, warning: null, slotId: null };
  if (run === "isl") return { cfg: sanitizeConfig(withList(cfg0, "isl", undefined)), ok: true, warning: null, slotId: null };
  let next = cfg0;
  if (zone !== "base") next = withList(next, `${run}:u` as ListId, undefined);
  if (zone !== "upper") {
    next = withList(next, run, undefined);
    const othersEdited = (["a", "b", "c"] as WallId[]).some((w) => w !== run && next.runs?.[w] !== undefined);
    if (othersEdited) {
      // the planner's own plan of this kitchen (no edited base runs), for this wall only
      const clean: KitchenConfig = { ...next };
      const runs: Partial<Record<BaseRunId, CabinetSpec[]>> = {};
      if (next.runs?.isl) runs.isl = next.runs.isl;
      clean.runs = Object.keys(runs).length ? runs : undefined;
      if (!clean.runs) delete clean.runs;
      const def = planKitchen(clean).lists.find((l) => l.id === run);
      if (def) next = withList(next, run, def.entries);
    }
  }
  return { cfg: sanitizeConfig(next), ok: true, warning: null, slotId: null };
}

/** Every element edit undone (all runs, corners and the tall column back to the planner). Materials stay. */
export function resetAll(input: KitchenConfig): KitchenConfig {
  const c = { ...sanitizeConfig(input) };
  delete c.runs;
  delete c.upperRuns;
  delete c.tallRun;
  delete c.corners;
  return sanitizeConfig(c);
}

/** has the customer edited this list (or, without an id, anything)? */
export function isEdited(cfg: KitchenConfig, id?: ListId): boolean {
  if (id) return listOf(cfg, id) !== undefined;
  return Boolean(cfg.runs || cfg.upperRuns || cfg.tallRun || cfg.corners || Object.keys(cfg.overrides ?? {}).length);
}

// ---------------------------------------------------------------- what the popover / in-kitchen toolbar can offer

function choice(def: ModuleTypeDef, width: number | null, current: boolean, fitting?: number[]): TypeChoice {
  const c: TypeChoice = { id: def.id, name: def.name, description: def.description, group: def.group, widths: [...def.widths], width, current };
  if (fitting) c.fitting = fitting;
  return c;
}

/**
 * Everything the element editor needs for one slot: the types it can become (with the width each would get),
 * the widths of its current type (each with whether it fits and why not), what can be inserted next to it (with
 * every width that fits), and whether it can move or be removed. Every option is checked by planning it.
 */
export function slotEditInfo(input: KitchenConfig, slotId: string): SlotEditInfo | null {
  const ctx = context(input, slotId);
  if (!ctx) return null;
  const { cfg, plan, slot } = ctx;
  const notes: string[] = [];
  if (slot.cornerId) {
    const zone = slot.zone === "upper" ? "upper" : "base";
    const types = cornerTypes(zone).map((d) => choice(d, slot.width, d.id === slot.type));
    const insertAfterL = slot.corner === "left" ? insertOptionsIn(ctx, true) : [];
    const insertBeforeL = slot.corner === "right" ? insertOptionsIn(ctx, false) : [];
    notes.push("Kutni element ima stalnu širinu i ostaje u kutu.");
    return {
      slot,
      zone: slot.zone === "upper" ? "upper" : "base",
      listId: null,
      index: -1,
      edited: Boolean(cfg.corners?.[slot.cornerId]),
      def: defOf(zone, slot.type),
      free: freeOf(plan, zone === "upper" ? "a:u" : "a"),
      types,
      widths: [{ width: slot.width, fits: true, current: true, type: slot.type, reason: null }],
      insertAfter: insertAfterL,
      insertBefore: insertBeforeL,
      canMoveLeft: false,
      canMoveRight: false,
      canRemove: false,
      notes,
    };
  }
  const ls = listSlot(ctx);
  if (!ls) return null;
  const def = defOf(ls.zone, slot.type);
  // the tall column's room is the same for every option of this slot: worked out once
  const tallCap = ls.zone === "tall" ? tallCapacity(cfg) : undefined;
  const types = poolOf(ls.zone).map((d) => {
    if (d.id === slot.type) return choice(d, slot.width, true);
    const r = changeTypeIn(ctx, d.id, tallCap);
    const w = r.ok && r.slotId ? (planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)?.width ?? null) : null;
    return choice(d, r.ok ? w : null, false);
  });
  const canMoveLeft = moveLeft(cfg, slot.id).ok;
  const canMoveRight = moveRight(cfg, slot.id).ok;
  const canRemove = remove(cfg, slot.id).ok;
  if (slot.anchored) notes.push("Napa ostaje iznad ploče za kuhanje: pomiče se zajedno s pločom.");
  return {
    slot,
    zone: ls.zone,
    listId: ls.id,
    index: ls.index,
    edited: listOf(cfg, ls.id) !== undefined,
    def,
    free: tallCap !== undefined ? Math.max(0, Math.round((tallCap - tallUsed(plan)) * 10) / 10) : freeOf(plan, ls.id),
    types,
    widths: widthsIn(ctx, tallCap),
    insertAfter: insertOptionsIn(ctx, true, tallCap),
    insertBefore: insertOptionsIn(ctx, false, tallCap),
    canMoveLeft,
    canMoveRight,
    canRemove,
    notes,
  };
}

/**
 * The widths an element can have where it stands: every width of its type (and of its sibling — base doors switch
 * between one and two doors), ascending, each with `fits` and, when it does not fit, the Croatian reason
 * (`changeWidth` gives the same result and note). Corners, the anchored hood and empty space: just the current width.
 */
export function allowedWidths(input: KitchenConfig, slotId: string): WidthOption[] {
  const ctx = context(input, slotId);
  return ctx ? widthsIn(ctx) : [];
}

function widthsIn(ctx: Ctx, tallCap?: number): WidthOption[] {
  const { slot } = ctx;
  const only: WidthOption[] = [{ width: slot.width, fits: true, current: true, type: slot.type, reason: null }];
  const ls = listSlot(ctx);
  if (slot.cornerId || !ls) return only;
  const def = defOf(ls.zone, slot.type);
  if (!def || def.spacer || slot.anchored) return only;
  const sib = def.sibling ? defOf(ls.zone, def.sibling) : undefined;
  const sibOk = Boolean(sib && (ls.zone !== "island" || sib.island));
  const all = new Map<number, string>();
  for (const w of def.widths) all.set(w, def.id);
  if (sib && sibOk) for (const w of sib.widths) if (!all.has(w)) all.set(w, sib.id);
  // the room next to the element: wider widths than that are refused without planning them (the tall column's
  // capacity is worked out once, and only when a wider width is asked about)
  let cap = tallCap;
  let room: number | null = null;
  const roomNow = () => {
    if (room === null) {
      if (ls.zone === "tall") cap ??= tallCapacity(ctx.cfg);
      room = roomAt(ctx, ls.id, planList(ctx.plan, ls.id)?.entries ?? [], ls.index, true, cap);
    }
    return room;
  };
  return [...all.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([w, type]) => {
      if (w === Math.round(slot.width) && type === slot.type) return { width: w, fits: true, current: true, type, reason: null };
      if (w > slot.width && w > roomNow()) return { width: w, fits: false, current: false, type, reason: noRoomIn(ctx, ls.id, w) };
      const r = changeWidthIn(ctx, w, cap);
      return { width: w, fits: r.ok, current: false, type, reason: r.ok ? null : (r.warning ?? noRoomIn(ctx, ls.id, w)) };
    });
}

/**
 * Types that can be inserted next to a slot ("before" = towards the left end of its run, as seen facing the wall; the
 * island from the wall-A side), each with `width` = what insertBefore / insertAfter without a width would give (null =
 * no room) and `fitting` = every width of it that fits there. Empty when nothing can go on that side (the neighbouring
 * wall continues behind a blind corner). `side` true / false = "after" / "before" (the old signature).
 */
export function insertOptions(input: KitchenConfig, slotId: string, side: InsertSide | boolean): TypeChoice[] {
  const ctx = context(input, slotId);
  return ctx ? insertOptionsIn(ctx, side === true || side === "after") : [];
}

function insertOptionsIn(ctx: Ctx, after: boolean, tallCap?: number): TypeChoice[] {
  const t = insertTarget(ctx, after);
  if (typeof t === "string") return [];
  const zone = listZone(t.id);
  const pool = poolOf(zone).filter((d) => !d.spacer && !d.corner);
  const { cfg, list } = editable(ctx, t.id);
  if (list.length >= listMax(zone)) return pool.map((d) => choice(d, null, false, []));
  const room = roomAt(ctx, t.id, list, t.at, false, tallCap);
  const probed = new Map<number, boolean>();
  const fitsWidth = (w: number) => {
    let ok = probed.get(w);
    if (ok === undefined) {
      const type = probeType(zone, w);
      ok = Boolean(type) && insertAt(ctx, cfg, list, t.id, t.at, { type: type as string, width: w }).ok;
      probed.set(w, ok);
    }
    return ok;
  };
  return pool.map((d) => {
    const fitting = d.widths.filter((w) => w <= room && (d.hood ? insertAt(ctx, cfg, list, t.id, t.at, { type: d.id, width: w }).ok : fitsWidth(w)));
    const width = widthsNew(d).find((w) => fitting.includes(w)) ?? null;
    return choice(d, width, false, fitting);
  });
}

// ---------------------------------------------------------------- walls and the island

const WALL_NAME = (wall: DimTarget) => (wall === "isl" ? "Otok" : `Zid ${wall.toUpperCase()}`);

/** the lengths a wall (or the island) may have in this config's layout (cm); null when the layout has no such wall */
export function wallLimits(input: KitchenConfig, wall: DimTarget): { min: number; max: number } | null {
  const cfg = sanitizeConfig(input);
  const lim = limitsFor(cfg.layout);
  if (wall === "isl") return cfg.layout === "otok" ? { min: lim.island[0], max: islandMax(cfg.layout, cfg.walls.a) } : null;
  if (!wallsFor(cfg.layout).includes(wall)) return null;
  return { min: lim[wall][0], max: lim[wall][1] };
}

/**
 * Set a wall's length (or the island's) — the in-kitchen dimension labels ("290 cm"). Clamped to the layout's range as
 * sanitizeConfig does (the island also to wall A + 2 × 20 cm; a shorter wall narrows its window, a shorter wall A may
 * shorten the island); `warning` says what was clamped and what the new length caused (the planner's own notes, e.g.
 * an edited element that no longer fits). Refused only for a wall the layout does not have or a value that is not a number.
 */
export function setWallLength(input: KitchenConfig, wall: DimTarget, cm: number): WallEditResult {
  const cfg = sanitizeConfig(input);
  const lim = wallLimits(cfg, wall);
  const cur = wall === "isl" ? cfg.island : cfg.walls[wall];
  if (!lim) {
    const msg = wall === "isl" ? "Ova kuhinja nema otok." : `Ovaj oblik kuhinje nema zid ${wall.toUpperCase()}.`;
    return { cfg, ok: false, warning: msg, slotId: null, value: cur, min: 0, max: 0 };
  }
  const want = typeof cm === "number" ? cm : Number(cm);
  if (!Number.isFinite(want)) return { cfg, ok: false, warning: "Upišite duljinu u centimetrima.", slotId: null, value: cur, ...lim };
  const value = Math.round(Math.min(lim.max, Math.max(lim.min, want)));
  const next = sanitizeConfig(wall === "isl" ? { ...cfg, island: value } : { ...cfg, walls: { ...cfg.walls, [wall]: value } });
  const notes: string[] = [];
  if (value !== Math.round(want)) {
    notes.push(`${WALL_NAME(wall)} može biti ${wall === "isl" ? "dug" : "dugačak"} od ${lim.min} do ${lim.max} cm — postavljeno je ${value} cm.`);
  }
  const w0 = cfg.window;
  const w1 = next.window;
  if (w0 && w1 && wall !== "isl" && w0.wall === wall && (w0.width !== w1.width || w0.offset !== w1.offset)) {
    notes.push(`Prozor je prilagođen novoj duljini zida: širok je ${w1.width} cm, ${w1.offset} cm od lijevog kraja.`);
  }
  if (wall === "a" && cfg.layout === "otok" && next.island !== cfg.island) notes.push(`Otok je skraćen na ${next.island} cm (smije prelaziti zid A najviše 20 cm sa svake strane).`);
  const before = new Set(planKitchen(cfg).warnings);
  for (const w of planKitchen(next).warnings) if (!before.has(w)) notes.push(w);
  return { cfg: next, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, value, ...lim };
}

/** catalogue groups that have types in a zone, in order — for grouping TypeChoice lists in the UI */
export function groupsFor(zone: ListZone): { id: ModuleGroup; name: string }[] {
  const pool = poolOf(zone);
  const ids = new Set(pool.map((d) => d.group));
  if (zone !== "tall") for (const d of cornerTypes(zone === "upper" ? "upper" : "base")) ids.add(d.group);
  return catalog.moduleGroups.filter((g) => ids.has(g.id));
}


// ---------------------------------------------------------------- heights ("do stropa", custom heights, worktop) — KitchenConfig.heights

export interface HeightsResult extends EditResult {
  /** what the kitchen now has, fitted under the ceiling (= planKitchen(cfg).heights) */
  heights: HeightPlan;
  /** Croatian notes: a value snapped to the offered options, heights lowered to fit the ceiling, elements left out */
  notes: string[];
}

export interface HeightChoices {
  mode: HeightSpec["mode"];
  /** worktop heights (cm) */
  worktop: { value: number; current: boolean }[];
  /**
   * wall-unit heights for "custom" (cm): `current` = the height drawn now (a custom one the ceiling lowered shows the
   * lowered one), `fits` = fits under this ceiling (worktop gap at least DIM.upperGapMin)
   */
  upper: { value: number; current: boolean; fits: boolean }[];
  /** top of the tall column for "custom" (cm): what this ceiling allows, and what the kitchen has now */
  tallTop: { min: number; max: number; value: number };
  /** what "do stropa" would give under this ceiling (for the toggle's hint: "gornji 105 cm + nadgradni 46 cm") */
  doStropa: HeightPlan;
  /** what the kitchen has now */
  current: HeightPlan;
}

const asNums = (l: readonly number[]) => l;

/**
 * Change the kitchen's heights. `patch` merges into the current KitchenConfig.heights; null = back to the standard
 * heights (worktop 90 cm). Switching to "custom" without values starts from what the kitchen shows now (the nearest
 * offered wall-unit height, the current tall-column top), so nothing jumps. Values snap to the offered options
 * (WORKTOP_HEIGHTS, UPPER_HEIGHTS); the planner fits them under the ceiling and says so in `notes`. Always ok.
 *
 *   setHeights(cfg, { mode: "do-stropa" })            // kitchen up to the ceiling
 *   setHeights(cfg, { mode: "custom", upper: 90 })     // 90 cm wall units
 *   setHeights(cfg, { worktop: 95 })                   // any mode: the worktop at 95 cm
 */
export function setHeights(input: KitchenConfig, patch: Partial<HeightSpec> | null): HeightsResult {
  const cfg0 = sanitizeConfig(input);
  const plan0 = planKitchen(cfg0);
  const cur: HeightSpec = cfg0.heights ? { ...cfg0.heights } : { mode: "standard" };
  const notes: string[] = [];
  let next: HeightSpec | undefined;
  if (patch !== null) {
    next = { ...cur, ...patch };
    if (next.mode === "custom" && cur.mode !== "custom") {
      const h = plan0.heights;
      const main = h.upperTop - h.upperBottom;
      if (patch.upper === undefined) next.upper = [...UPPER_HEIGHTS].sort((a, b) => Math.abs(a - main) - Math.abs(b - main) || a - b)[0];
      if (patch.tallTop === undefined) next.tallTop = Math.round(Math.min(h.tallTop, cfg0.ceiling - DIM.ceilingGap));
    }
    if (next.mode !== "custom") {
      delete next.upper;
      delete next.tallTop;
    }
    const wt = patch.worktop;
    if (wt !== undefined && !asNums(WORKTOP_HEIGHTS).includes(Math.round(wt))) notes.push(`Radna ploča može biti na visini od ${WORKTOP_HEIGHTS.join(", ")} cm.`);
    const up = patch.upper;
    if (up !== undefined && !asNums(UPPER_HEIGHTS).includes(Math.round(up))) notes.push(`Gornji elementi dolaze u visinama od ${UPPER_HEIGHTS.join(", ")} cm.`);
    const tt = patch.tallTop;
    if (tt !== undefined && tt < DIM.tallTopMin) notes.push(`Visoki stup ide najmanje do ${DIM.tallTopMin} cm.`);
  }
  const cfg = sanitizeConfig({ ...cfg0, heights: next });
  const plan = planKitchen(cfg);
  // why the heights are what they are (always), then what else this change caused
  const own = planHeights(cfg).notes;
  notes.push(...own);
  const before = new Set(plan0.warnings);
  for (const w of plan.warnings) if (!before.has(w) && !own.includes(w)) notes.push(w);
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, heights: plan.heights, notes };
}

/** What the heights controls can offer for this kitchen (ceiling, worktop), and what it has now. */
export function heightChoices(input: KitchenConfig): HeightChoices {
  const cfg = sanitizeConfig(input);
  const current = planKitchen(cfg).heights;
  const spec = cfg.heights;
  const maxTop = cfg.ceiling - DIM.ceilingGap;
  const main = current.upperTop - current.upperBottom;
  const doStropa = planHeights({ ...cfg, heights: { mode: "do-stropa", ...(spec?.worktop !== undefined ? { worktop: spec.worktop } : {}) } }).heights;
  return {
    mode: current.mode,
    worktop: WORKTOP_HEIGHTS.map((v) => ({ value: v, current: v === current.worktop })),
    upper: UPPER_HEIGHTS.map((v) => ({
      value: v,
      current: Math.abs(v - main) < 0.5,
      fits: current.worktop + DIM.upperGapMin + v <= maxTop,
    })),
    tallTop: { min: DIM.tallTopMin, max: Math.max(DIM.tallTopMin, maxTop), value: Math.round(current.tallTop) },
    doStropa,
    current,
  };
}

/**
 * Change the ceiling height (cm), clamped like sanitizeConfig (limitsFor(layout).ceiling), with Croatian notes: the
 * clamping, a window that had to move, and what the new ceiling does to the heights ("do stropa" follows it; custom
 * heights that no longer fit are lowered) or to the elements.
 */
export function setCeiling(input: KitchenConfig, cm: number): WallEditResult {
  const cfg = sanitizeConfig(input);
  const [min, max] = limitsFor(cfg.layout).ceiling;
  const want = typeof cm === "number" ? cm : Number(cm);
  if (!Number.isFinite(want)) return { cfg, ok: false, warning: "Upišite visinu stropa u centimetrima.", slotId: null, value: cfg.ceiling, min, max };
  const value = Math.round(Math.min(max, Math.max(min, want)));
  const next = sanitizeConfig({ ...cfg, ceiling: value });
  const notes: string[] = [];
  if (value !== Math.round(want)) notes.push(`Visina stropa može biti od ${min} do ${max} cm — postavljeno je ${value} cm.`);
  const w0 = cfg.window;
  const w1 = next.window;
  if (w0 && w1 && w0.sill !== w1.sill) notes.push(`Parapet prozora spušten je na ${w1.sill} cm.`);
  const before = new Set(planKitchen(cfg).warnings);
  for (const w of planKitchen(next).warnings) if (!before.has(w)) notes.push(w);
  return { cfg: next, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, value, min, max };
}
