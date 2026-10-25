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
 *   tall column:              1–3 units; its width moves the base run next to it
 *
 * Planning is ~0.1 ms, so slotEditInfo simply tries every option.
 */

import { catalog, cornerTypes, moduleDef, moduleTypes, widthAllowed, type ModuleGroup, type ModuleTypeDef } from "./catalog";
import {
  MAX_LIST,
  MAX_TALL,
  defaultCornerType,
  listOf,
  listZone,
  materializeLists,
  planKitchen,
  sanitizeConfig,
  withList,
  type KitchenPlan,
  type ListId,
  type ListZone,
  type PlanList,
  type PlanSlot,
} from "./plan";
import type { BaseRunId, CabinetSpec, KitchenConfig, WallId } from "./types";

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
}

export interface WidthChoice {
  width: number;
  fits: boolean;
  current: boolean;
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

// ---------------------------------------------------------------- edits

/** Switch an element to another type (the width follows the type: same width when it comes in it, else the closest that fits). */
export function changeType(input: KitchenConfig, slotId: string, type: string): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
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
  let last: EditResult | null = null;
  for (const w of widthsNear(def, cur.width, fromSpacer)) {
    const next = list.map((e) => ({ ...e }));
    const el: CabinetSpec = { type, width: w };
    next[ls.index] = el;
    if (fromSpacer && cur.width - w >= 5) {
      // a cabinet into empty space: what it does not take stays empty
      next.splice(ls.index + 1, 0, { type: cur.type, width: cur.width - w });
    } else if (w < cur.width) keepRoom(next, ls.index, cur.width - w, ls.zone);
    else if (w > cur.width) growInto(next, ls.index, w - cur.width, ls.zone);
    const final = tidy(next, ls.zone, el);
    last = commit(ctx, withList(cfg, ls.id, final), ls.id, final.indexOf(el), noRoom(ctx.plan, ls.id, w));
    if (last.ok) return last;
  }
  const min = def.spacer ? def.minWidth : Math.min(...def.widths);
  return fail(ctx.cfg, last ? `${def.name} (od ${min} cm) ovdje ne stane — slobodno je još ${Math.floor(freeOf(ctx.plan, ls.id))} cm.` : "Za tu izvedbu nema mjesta.", slot.id);
}

/** Change an element's width (one of its type's widths; base doors switch between one and two doors on their own). */
export function changeWidth(input: KitchenConfig, slotId: string, width: number): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot } = ctx;
  if (slot.cornerId) return fail(ctx.cfg, "Kutni element ima stalnu širinu.", slot.id);
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
  const next = list.map((e) => ({ ...e }));
  const el: CabinetSpec = { type: def.id, width: w };
  next[ls.index] = el;
  if (w < cur.width) keepRoom(next, ls.index, cur.width - w, ls.zone);
  else if (w > cur.width) growInto(next, ls.index, w - cur.width, ls.zone);
  const final = tidy(next, ls.zone, el);
  return commit(ctx, withList(cfg, ls.id, final), ls.id, final.indexOf(el), noRoom(ctx.plan, ls.id, w));
}

function insert(input: KitchenConfig, slotId: string, type: string, width: number | undefined, after: boolean): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot, plan } = ctx;
  let id: ListId;
  let at: number;
  if (slot.cornerId) {
    // after the left corner = start of wall A's run; before the right corner = its end
    const zone = slot.zone === "upper" ? "upper" : "base";
    id = zone === "upper" ? "a:u" : "a";
    // corner "left" = blind towards the A–B corner = the left end of wall A
    const atLeftEnd = slot.corner === "left";
    if (after === atLeftEnd) {
      at = after ? 0 : (planList(plan, id)?.entries.length ?? 0);
    } else return fail(ctx.cfg, after ? "Iza kutnog elementa nastavlja se susjedni zid." : "Ispred kutnog elementa nastavlja se susjedni zid.", slot.id);
  } else {
    const ls = listSlot(ctx);
    if (!ls) return fail(ctx.cfg, "Ovdje se ne može dodati element.", slot.id);
    id = ls.id;
    at = ls.index + (after ? 1 : 0);
  }
  const zone = listZone(id);
  const def = defOf(zone, type);
  if (!def || def.corner || (zone === "island" && !def.island)) return fail(ctx.cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
  const { cfg, list } = editable(ctx, id);
  if (list.length >= (zone === "tall" ? MAX_TALL : MAX_LIST)) {
    return fail(ctx.cfg, zone === "tall" ? "Visoki stup ima najviše tri elementa." : "U ovom nizu je već najviše elemenata.", slot.id);
  }
  const tries = width !== undefined ? [Math.round(width)] : widthsNew(def);
  // room an insert can use at most: the run's free space plus an empty-space entry right beside the spot
  const beside = [list[at], list[at - 1]].reduce((n, e) => n + (e && isSpacer(zone, e.type) ? e.width : 0), 0);
  const room = zone === "tall" ? Infinity : freeOf(plan, id) + beside + 0.5;
  let last: EditResult | null = null;
  for (const w of tries) {
    if (!widthAllowed(def, w)) {
      last = fail(ctx.cfg, `${def.name} dolazi u širinama: ${def.widths.join(", ")} cm.`, slot.id);
      continue;
    }
    if (w > room) {
      last = fail(ctx.cfg, `Za novi element (${w} cm) nema mjesta — slobodno je još ${Math.floor(freeOf(plan, id))} cm.`, slot.id);
      continue;
    }
    const el: CabinetSpec = { type, width: w };
    const placed = placeInto(list, at, el, zone);
    const refuse =
      zone === "tall" ? "Za još jedan visoki element nema mjesta na ovom zidu." : `Za novi element (${w} cm) nema mjesta — slobodno je još ${Math.floor(freeOf(plan, id))} cm.`;
    last = commit(ctx, withList(cfg, id, placed), id, placed.indexOf(el), refuse);
    if (last.ok) return last;
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

// ---------------------------------------------------------------- what the popover can offer

function choice(def: ModuleTypeDef, width: number | null, current: boolean): TypeChoice {
  return { id: def.id, name: def.name, description: def.description, group: def.group, widths: [...def.widths], width, current };
}

/**
 * Everything the element editor needs for one slot: the types it can become (with the width each would get),
 * the widths of its current type, what can be inserted next to it, and whether it can move or be removed.
 * Every option is checked by planning it (~0.1 ms each).
 */
export function slotEditInfo(input: KitchenConfig, slotId: string): SlotEditInfo | null {
  const ctx = context(input, slotId);
  if (!ctx) return null;
  const { cfg, plan, slot } = ctx;
  const notes: string[] = [];
  if (slot.cornerId) {
    const zone = slot.zone === "upper" ? "upper" : "base";
    const types = cornerTypes(zone).map((d) => choice(d, slot.width, d.id === slot.type));
    const insertAfterL = slot.corner === "left" ? insertOptions(cfg, slot.id, true) : [];
    const insertBeforeL = slot.corner === "right" ? insertOptions(cfg, slot.id, false) : [];
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
      widths: [{ width: slot.width, fits: true, current: true }],
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
  const pool = ls.zone === "island" ? moduleTypes("island") : moduleTypes(ls.zone === "base" ? "base" : ls.zone);
  const types = pool.map((d) => {
    if (d.id === slot.type) return choice(d, slot.width, true);
    const r = changeType(cfg, slot.id, d.id);
    const w = r.ok && r.slotId ? (planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)?.width ?? null) : null;
    return choice(d, r.ok ? w : null, false);
  });
  let widths: WidthChoice[];
  if (!def || def.spacer || slot.anchored) widths = [{ width: slot.width, fits: true, current: true }];
  else {
    const sib = def.sibling ? defOf(ls.zone, def.sibling) : undefined;
    const all = [...new Set([...def.widths, ...(sib && (ls.zone !== "island" || sib.island) ? sib.widths : [])])].sort((a, b) => a - b);
    widths = all.map((w) => ({ width: w, current: w === slot.width, fits: w === slot.width || changeWidth(cfg, slot.id, w).ok }));
  }
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
    free: freeOf(plan, ls.id),
    types,
    widths,
    insertAfter: insertOptions(cfg, slot.id, true),
    insertBefore: insertOptions(cfg, slot.id, false),
    canMoveLeft,
    canMoveRight,
    canRemove,
    notes,
  };
}

/** types that can be inserted next to a slot, with the width they would get (null = no room) */
function insertOptions(cfg: KitchenConfig, slotId: string, after: boolean): TypeChoice[] {
  const plan = planKitchen(cfg);
  const slot = plan.slots.find((s) => s.id === slotId);
  if (!slot) return [];
  const id: ListId | null = slot.cornerId ? (slot.zone === "upper" ? "a:u" : "a") : (slot.list?.id ?? null);
  if (!id) return [];
  const zone = listZone(id);
  const pool = zone === "island" ? moduleTypes("island") : moduleTypes(zone === "base" ? "base" : zone);
  return pool
    .filter((d) => !d.spacer)
    .map((d) => {
      const r = after ? insertAfter(cfg, slotId, d.id) : insertBefore(cfg, slotId, d.id);
      const w = r.ok && r.slotId ? (planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)?.width ?? null) : null;
      return choice(d, r.ok ? w : null, false);
    });
}

/** catalogue groups that have types in a zone, in order — for grouping TypeChoice lists in the UI */
export function groupsFor(zone: ListZone): { id: ModuleGroup; name: string }[] {
  const pool = zone === "island" ? moduleTypes("island") : moduleTypes(zone === "base" ? "base" : zone);
  const ids = new Set(pool.map((d) => d.group));
  if (zone !== "tall") for (const d of cornerTypes(zone === "upper" ? "upper" : "base")) ids.add(d.group);
  return catalog.moduleGroups.filter((g) => ids.has(g.id));
}

