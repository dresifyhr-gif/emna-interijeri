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
 *   walls / island:           setWallLength (the dimension labels in 3D), clamped like sanitizeConfig — the room's wall,
 *                             a kitchen along the whole wall follows it (as every older kitchen)
 *   room vs kitchen:          setRoomWall (the room's wall only, the kitchen keeps its length), setKitchenExtent (where
 *                             the kitchen stands on a wall: length / offset / anchor), kitchenExtent (what the controls offer)
 *   tall columns anywhere:    moveTall (another free run end), tallPlaces; new columns come from insertAtGap
 *   "+" places:               gapOptions / insertAtGap on plan.ts planGaps (ViewInfo.gaps): empty space, the free end of
 *                             a run (bare floor, the bare wall beyond the kitchen it grows into), bare wall above the
 *                             worktop, the ends of the island
 *   room surfaces:            setRoomFinish / roomFinishes (StudioEngineOptions.onSurfaceClick)
 *   ceiling:                  raiseCeilingFor ("Podigni strop na X cm"; heightChoices().tallTop.maxReason says the limit)
 *   island / peninsula:       setIsland (any KitchenConfig.islandSpec field) and its shorthands setIslandFunctions (hob /
 *                             sink on it — moved off the walls), setSeating, setBar, setIslandHood, setPeninsula;
 *                             islandChoices lists what the controls can offer
 *
 * Planning is ~0.15 ms. slotEditInfo / allowedWidths / insertOptions check every option by planning it, but skip
 * widths that cannot fit (wider than the free room next to the element) and probe each width only once for inserts.
 */

import { FINISH_DEFAULTS, catalog, cornerFoot, cornerTypes, moduleDef, moduleTypes, roomFloorDef, roomWallDef, widthAllowed, type ModuleGroup, type ModuleTypeDef } from "./catalog";
import {
  GAP_MIN,
  MAX_LIST,
  MAX_TALL,
  defaultAnchor,
  defaultCornerType,
  isTallList,
  islandMax,
  kitchenRange,
  limitsFor,
  listOf,
  listZone,
  materializeLists,
  minRun,
  parseRunEnd,
  planGaps,
  planKitchen,
  runEnd,
  sanitizeConfig,
  tallCapacity,
  tallListEnd,
  wallsFor,
  withList,
  type KitchenPlan,
  type ListId,
  type ListZone,
  type PlanGap,
  type PlanList,
  type PlanSlot,
  type Range,
  type TallListId,
} from "./plan";
import { DIM, UPPER_HEIGHTS, WORKTOP_HEIGHTS, planHeights, type HeightPlan } from "./plan";
import {
  BAR_DEPTHS,
  BAR_HEIGHTS,
  HOOD_ABOVE,
  ISLAND_DEFAULTS,
  ISLAND_DEPTHS,
  OVERHANGS,
  TABLE_DEPTHS,
  TABLE_HEIGHT,
  hasIsland,
  isPeninsula,
  peninsulaSide,
  stoolsWord,
  type BarPlan,
  type IslandHoodPlan,
  type IslandPlan,
} from "./plan";
import type {
  BarSpec,
  BaseRunId,
  CabinetSpec,
  DimTarget,
  HeightSpec,
  IslandFunctions,
  IslandSpec,
  KitchenConfig,
  KitchenExtent,
  RoomSpec,
  RunEnd,
  SeatSide,
  WallId,
} from "./types";

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
  return commitPlan(before.cfg, before.plan, before.slot.id, next, id, focus, refuse);
}

/** commit without a selected element (gaps, extents): `failSlot` is what a refusal hands back as slotId */
function commitPlan(cfg0: KitchenConfig, plan0: KitchenPlan, failSlot: string | null, next: KitchenConfig, id: ListId, focus: number | null, refuse: string): EditResult {
  const before = { cfg: cfg0, plan: plan0 };
  const cfg = sanitizeConfig(next);
  const plan = planKitchen(cfg);
  const l = planList(plan, id);
  // a tall column must not vanish because of an edit (removing its last unit is not done through here)
  const columns = (p: KitchenPlan) => new Set(p.slots.filter((s) => s.zone === "tall").map((s) => s.list?.id)).size;
  // an edited tall column must still stand somewhere (the planner leaves a column out that does not fit)
  const lostColumn = isTallList(id) && !plan.slots.some((s) => s.list?.id === id);
  if ((l && l.dropped.length) || lostColumn || columns(plan) < columns(before.plan) || cutCount(plan) > cutCount(before.plan)) {
    return fail(before.cfg, refuse, failSlot);
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

/** cm of a tall column's units where it stands (list "tall" or a tallRuns column) */
const tallUsed = (plan: KitchenPlan, id: ListId = "tall") => plan.slots.filter((s) => s.zone === "tall" && s.list?.id === id).reduce((n, s) => n + s.width, 0);

/** why a tall column cannot take `need` cm more (computes plan.ts tallCapacity: only on a refusal) */
function tallNoRoom(cfg: KitchenConfig, plan: KitchenPlan, need?: number, id: ListId = "tall"): string {
  const used = Math.round(tallUsed(plan, id));
  const cap = Math.floor(tallCapacity(cfg, id));
  const what = need ? `Za ${need} cm u visokom stupu nema mjesta` : "Za to u visokom stupu nema mjesta";
  return `${what} — stup je sada širok ${used} cm, a uz ovaj zid može biti najviše ${cap} cm. Suzite ili uklonite neki visoki element.`;
}

/** the refusal for a list that has no room for `need` cm */
function noRoomIn(ctx: Ctx, id: ListId, need?: number): string {
  return listZone(id) === "tall" ? tallNoRoom(ctx.cfg, ctx.plan, need, id) : noRoom(ctx.plan, id, need);
}

/**
 * The most cm an element at `index` of list `id` can take (a necessary condition — the plan decides): the list's free
 * room, plus empty-space entries right beside it, plus (`replace`) the element that stands there now. Inserts:
 * `index` is the insert position. Tall column: what plan.ts tallCapacity leaves (computed once per call site).
 */
function roomAt(ctx: Ctx, id: ListId, list: CabinetSpec[], index: number, replace: boolean, tallCap?: number): number {
  const zone = listZone(id);
  const cur = replace ? (list[index]?.width ?? 0) : 0;
  if (zone === "tall") return (tallCap ?? tallCapacity(ctx.cfg, id)) - tallUsed(ctx.plan, id) + cur + 0.5;
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
    if (type === slot.type) return { cfg: ctx.cfg, ok: true, warning: null, slotId: slot.id };
    const corners = { ...(ctx.cfg.corners ?? {}) };
    if (type === defaultCornerType(zone)) delete corners[slot.cornerId];
    else corners[slot.cornerId] = type;
    const cfg = sanitizeConfig({ ...ctx.cfg, corners });
    // another footprint (blind 110 × 60 ↔ L-shaped 90 × 90): the neighbouring runs move — nothing may be left out
    const f0 = cornerFoot(zone, slot.type);
    const f1 = cornerFoot(zone, type);
    if (f0.along === f1.along && f0.across === f1.across) return { cfg, ok: true, warning: null, slotId: slot.id };
    const plan = planKitchen(cfg);
    if (cutCount(plan) > cutCount(ctx.plan)) {
      const def = moduleDef(zone, type);
      return fail(ctx.cfg, `${def?.name ?? "Taj kutni element"} (${f1.along} × ${f1.across} cm) ovdje ne stane bez izostavljanja drugih elemenata — suzite ili uklonite susjedni element.`, slot.id);
    }
    const slotId = plan.slots.find((s) => s.cornerId === slot.cornerId)?.id ?? null;
    const before = new Set(ctx.plan.warnings);
    const notes = plan.warnings.filter((w) => !before.has(w));
    return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId };
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
  if (ls.zone === "tall") return fail(ctx.cfg, `${def.name} (${min} cm) ovdje ne stane. ${tallNoRoom(ctx.cfg, ctx.plan, undefined, ls.id)}`, slot.id);
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
    // the last unit of a column: the column goes (the main one switches `tall` off and forgets its place)
    if (ls.id === "tall") {
      const next = { ...withList(cfg, "tall", undefined), tall: false };
      delete next.tallAt;
      return { cfg: sanitizeConfig(next), ok: true, warning: null, slotId: null };
    }
    return { cfg: sanitizeConfig(withList(cfg, ls.id, undefined)), ok: true, warning: null, slotId: null };
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

/** a run as a reset target: a wall, the island, the tall column or a tallRuns column ("tall:b-left": reset = removed) */
export type RunRef = WallId | "isl" | "tall" | TallListId;

/**
 * Put a run back to what the planner would place there. `zone` limits it to the base or the wall units of a wall
 * (default: both). While other wall base runs stay edited, a reset wall base run gets the planner's default
 * contents for that wall as an explicit list (so its sink / hob come back).
 */
export function resetRun(input: KitchenConfig, run: RunRef, zone?: "base" | "upper"): EditResult {
  const cfg0 = sanitizeConfig(input);
  if (run === "tall") return { cfg: sanitizeConfig(withList(cfg0, "tall", undefined)), ok: true, warning: null, slotId: null };
  // a column the customer added has no planner default: resetting it takes it away
  if (tallListEnd(run)) return { cfg: sanitizeConfig(withList(cfg0, run, undefined)), ok: true, warning: null, slotId: null };
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

/**
 * Every element edit undone (all runs, corners and the tall column back to the planner, added tall columns gone, the
 * tall column back where the planner puts it). Materials, the room and where the kitchen stands on it (extents) stay.
 */
export function resetAll(input: KitchenConfig): KitchenConfig {
  const c = { ...sanitizeConfig(input) };
  delete c.runs;
  delete c.upperRuns;
  delete c.tallRun;
  delete c.tallRuns;
  delete c.tallAt;
  delete c.corners;
  return sanitizeConfig(c);
}

/** has the customer edited this list (or, without an id, anything)? */
export function isEdited(cfg: KitchenConfig, id?: ListId): boolean {
  if (id) return listOf(cfg, id) !== undefined;
  return Boolean(cfg.runs || cfg.upperRuns || cfg.tallRun || cfg.tallRuns || cfg.tallAt || cfg.corners || Object.keys(cfg.overrides ?? {}).length);
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
    // each type with the width it has along wall A (its footprint), null when it does not fit (the neighbours would lose cabinets)
    const types = cornerTypes(zone).map((d) => {
      if (d.id === slot.type) return choice(d, slot.width, true);
      const r = changeTypeIn(ctx, d.id);
      return choice(d, r.ok ? cornerFoot(zone, d.id).along : null, false);
    });
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
  const tallCap = ls.zone === "tall" ? tallCapacity(cfg, ls.id) : undefined;
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
    free: tallCap !== undefined ? Math.max(0, Math.round((tallCap - tallUsed(plan, ls.id)) * 10) / 10) : freeOf(plan, ls.id),
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
      if (ls.zone === "tall") cap ??= tallCapacity(ctx.cfg, ls.id);
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

const WALL_NAME = (wall: DimTarget, cfg?: KitchenConfig) => (wall === "isl" ? (cfg && isPeninsula(cfg.layout) ? "Poluotok" : "Otok") : `Zid ${wall.toUpperCase()}`);

/** the lengths a wall (or the island) may have in this config's layout (cm); null when the layout has no such wall */
export function wallLimits(input: KitchenConfig, wall: DimTarget): { min: number; max: number } | null {
  const cfg = sanitizeConfig(input);
  const lim = limitsFor(cfg.layout);
  if (wall === "isl") return hasIsland(cfg.layout) ? { min: lim.island[0], max: islandMax(cfg.layout, cfg.walls.a) } : null;
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
  return wallChange(input, wall, cm, false);
}

/** setWallLength / setRoomWall: `keepKitchen` pins the kitchen on that wall to its current length and place */
function wallChange(input: KitchenConfig, wall: DimTarget, cm: number, keepKitchen: boolean): WallEditResult {
  const cfg = sanitizeConfig(input);
  const lim = wallLimits(cfg, wall);
  const cur = wall === "isl" ? cfg.island : cfg.walls[wall];
  if (!lim) {
    const msg = wall === "isl" ? "Ova kuhinja nema otok ni poluotok." : `Ovaj oblik kuhinje nema zid ${wall.toUpperCase()}.`;
    return { cfg, ok: false, warning: msg, slotId: null, value: cur, min: 0, max: 0 };
  }
  const want = typeof cm === "number" ? cm : Number(cm);
  if (!Number.isFinite(want)) return { cfg, ok: false, warning: "Upišite duljinu u centimetrima.", slotId: null, value: cur, ...lim };
  const value = Math.round(Math.min(lim.max, Math.max(lim.min, want)));
  let raw: KitchenConfig = wall === "isl" ? { ...cfg, island: value } : { ...cfg, walls: { ...cfg.walls, [wall]: value } };
  if (keepKitchen && wall !== "isl") {
    // the kitchen keeps its length at its anchor end (shortened only by a wall shorter than it)
    const L = cfg.walls[wall];
    const k = kitchenRange(cfg, wall);
    const anchor = cfg.extents?.[wall]?.anchor ?? defaultAnchor(wall);
    const offset = anchor === "left" ? k.from : L - k.to;
    raw = { ...raw, extents: { ...(cfg.extents ?? {}), [wall]: { anchor, offset, length: k.to - k.from } } };
  }
  const next = sanitizeConfig(raw);
  const notes: string[] = [];
  if (value !== Math.round(want)) {
    notes.push(`${WALL_NAME(wall, cfg)} može biti ${wall === "isl" ? "dug" : "dugačak"} od ${lim.min} do ${lim.max} cm — postavljeno je ${value} cm.`);
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
  /**
   * top of the tall column for "custom" (cm): what this ceiling allows, and what the kitchen has now. `maxReason` says
   * why the maximum is what it is ("strop 260 cm − 3 cm"); `ceilingMax` is the most any ceiling allows (the highest
   * ceiling the studio takes − 3 cm) — a wish above `max` and up to it: raiseCeilingFor(cfg, wish) gives the room for it
   */
  tallTop: { min: number; max: number; value: number; maxReason: string; ceilingMax: number };
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
    tallTop: {
      min: DIM.tallTopMin,
      max: Math.max(DIM.tallTopMin, maxTop),
      value: Math.round(current.tallTop),
      maxReason: `strop ${cfg.ceiling} cm − ${DIM.ceilingGap} cm`,
      ceilingMax: limitsFor(cfg.layout).ceiling[1] - DIM.ceilingGap,
    },
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

// ---------------------------------------------------------------- island / peninsula — KitchenConfig.islandSpec

export interface IslandResult extends EditResult {
  /** the island / peninsula as it is now (= planKitchen(cfg).island) */
  island: IslandPlan | null;
  /** Croatian notes: values snapped to the offered options, what moved where, what the planner had to change */
  notes: string[];
}

export interface IslandChoices {
  kind: "otok" | "poluotok";
  /** a peninsula's end of wall A (null: the island) and the ends this layout allows ("G": right only) */
  side: "left" | "right" | null;
  sides: ("left" | "right")[];
  /** the island's / peninsula's length (cm): range in this layout and current value */
  length: { min: number; max: number; value: number };
  /** `fits` = everything it asks for lands on the island at its current length */
  functions: { value: IslandFunctions; current: boolean; fits: boolean }[];
  depth: { value: number; current: boolean }[];
  /** `available` = people can sit there (a peninsula: not at the end against wall A) */
  seatSides: { value: SeatSide; current: boolean; available: boolean }[];
  overhang: { value: number; current: boolean }[];
  /** stools placed now, the most that fit where they are */
  stools: { value: number; max: number };
  waterfall: boolean;
  /**
   * the ceiling hood: `available` = there is a hob on the island; `on` = it is drawn; `auto` = islandSpec.hood is not set
   * (on above every island hob; false = "bez nape", a downdraft hob); `above` = cm from the worktop to its underside, `fromCeiling` the
   * same height measured from the ceiling down (setIslandHood takes either)
   */
  hood: {
    available: boolean;
    on: boolean;
    auto: boolean;
    above: { min: number; max: number; value: number };
    fromCeiling: { min: number; max: number; value: number };
    plan: IslandHoodPlan | null;
  };
  bar: {
    current: BarSpec | null;
    plan: BarPlan | null;
    heights: number[];
    depths: { raised: number[]; table: number[] };
    tableHeight: number;
    /** cm the bar may be long (null value = the whole island) */
    length: { min: number; max: number; value: number | null };
  };
  island: IslandPlan;
}

const FEATURES_OF: Record<IslandFunctions, ("sink" | "hob")[]> = { none: [], hob: ["hob"], sink: ["sink"], both: ["sink", "hob"] };
const islandWord = (cfg: KitchenConfig) => (isPeninsula(cfg.layout) ? "Poluotok" : "Otok");
const islandOn = (cfg: KitchenConfig) => (isPeninsula(cfg.layout) ? "poluotok" : "otok");

/** a plain cabinet of the same width standing in for a sink / hob / dishwasher that moves to the island */
function plainFor(type: string, width: number): CabinetSpec {
  const f = moduleDef("base", type)?.feature;
  if (f === "sink") return { type: width <= 60 ? "vrata" : "vrata2", width };
  return { type: "ladice", width };
}

/**
 * The functions moved between the walls and the island, for wall runs the customer has edited (the planner moves them
 * on its own in the others): what went to the island becomes plain cabinets of the same width on the walls (a hood in
 * an edited wall-unit list becomes a door unit); what came back gets a plain wall cabinet of a width it comes in, on
 * wall A first (none there: a note).
 */
function moveFunctions(cfg: KitchenConfig, from: IslandFunctions, to: IslandFunctions, notes: string[]): KitchenConfig {
  const walls = wallsFor(cfg.layout);
  const was = FEATURES_OF[from];
  const now = FEATURES_OF[to];
  const toIsland = now.filter((f) => !was.includes(f));
  const back = was.filter((f) => !now.includes(f));
  const runs = { ...(cfg.runs ?? {}) };
  const ups = { ...(cfg.upperRuns ?? {}) };
  for (const w of walls) {
    // the hood of an edited wall-unit list no longer has a hob below it
    const ul = ups[w];
    if (toIsland.includes("hob") && ul && ul.some((e) => moduleDef("upper", e.type)?.hood)) {
      ups[w] = ul.map((e) => (moduleDef("upper", e.type)?.hood ? { type: "vrata", width: e.width } : { ...e }));
    }
    const list = runs[w];
    if (!list) continue;
    const goes = (t: string) => {
      const f = moduleDef("base", t)?.feature;
      return ((f === "sink" || f === "dishwasher") && toIsland.includes("sink")) || (f === "hob" && toIsland.includes("hob"));
    };
    if (list.some((e) => goes(e.type))) runs[w] = list.map((e) => (goes(e.type) ? plainFor(e.type, e.width) : { ...e }));
  }
  const edited = walls.filter((w) => runs[w]);
  const from_ = isPeninsula(cfg.layout) ? "s poluotoka" : "s otoka";
  /** the wall the hob went back to (its wall units may need the hood unit again) */
  let hobBack: WallId | null = null;
  for (const f of edited.length ? back : []) {
    const type = f === "sink" ? "sudoper" : "ploca";
    const def = moduleDef("base", type);
    if (!def) continue;
    const rank = (w: number) => {
      const i = [80, 60, 90, 100, 120, 50, 45].indexOf(w);
      return i < 0 ? 99 : i;
    };
    let done = false;
    for (const w of [...edited].sort((x, y) => (x === "a" ? -1 : y === "a" ? 1 : 0))) {
      const list = runs[w] ?? [];
      const plain = (e: CabinetSpec) => {
        const d = moduleDef("base", e.type);
        return Boolean(d && !d.feature && !d.spacer && widthAllowed(def, e.width));
      };
      // the hob not right beside the sink
      const nearSink = (i: number) => [list[i - 1], list[i + 1]].some((e) => e && moduleDef("base", e.type)?.feature === "sink");
      const cand = list.map((e, i) => ({ e, i })).filter(({ e, i }) => plain(e) && (f !== "hob" || !nearSink(i)));
      if (!cand.length) continue;
      cand.sort((p, q) => rank(p.e.width) - rank(q.e.width));
      const k = cand[0].i;
      runs[w] = list.map((e, i) => (i === k ? { type, width: e.width } : { ...e }));
      if (f === "hob") hobBack = w;
      done = true;
      break;
    }
    if (f === "sink") notes.push(done ? `Sudoper je vraćen ${from_} uz zid.` : `Sudoper više nije ${from_ === "s otoka" ? "na otoku" : "na poluotoku"}, a uz zidove nema elementa za njega — dodajte ga klikom na donji element.`);
    else notes.push(done ? `Ploča za kuhanje vraćena je ${from_} uz zid.` : `Ploča za kuhanje više nije ${from_ === "s otoka" ? "na otoku" : "na poluotoku"}, a uz zidove nema elementa za nju — dodajte je klikom na donji element.`);
  }
  const next: KitchenConfig = { ...cfg };
  if (Object.keys(runs).length) next.runs = runs;
  if (Object.keys(ups).length) next.upperRuns = ups;
  // the hob back on a wall whose wall units the customer has edited: the wall unit above it becomes the hood unit
  // again (the one whose centre is nearest the hob's, in a width the hood comes in), as the planner's own would have it
  const hw = hobBack as WallId | null;
  const ul = hw ? ups[hw] : undefined;
  const hoodDef = moduleDef("upper", "napa");
  if (hw && ul && hoodDef && !ul.some((e) => moduleDef("upper", e.type)?.hood)) {
    const plan = planKitchen(next);
    const hob = plan.slots.find((s) => s.zone === "base" && s.run === hw && moduleDef("base", s.type)?.feature === "hob");
    const list = plan.lists.find((l) => l.id === `${hw}:u`);
    const c = hob ? hob.x + hob.width / 2 : 0;
    const over = plan.slots
      .filter((s) => s.zone === "upper" && s.run === hw && s.list && !s.corner && !moduleDef("upper", s.type)?.spacer && widthAllowed(hoodDef, s.width))
      .map((s) => ({ s, d: Math.abs(s.x + s.width / 2 - c) }))
      .filter(({ s, d }) => d <= s.width / 2)
      .sort((p, q) => p.d - q.d)[0];
    if (hob && list && over?.s.list) {
      const idx = over.s.list.index;
      ups[hw] = list.entries.map((e, i) => (i === idx ? { type: hoodDef.id, width: e.width } : { ...e }));
      next.upperRuns = ups;
    } else if (hob) notes.push("Iznad ploče za kuhanje nema elementa za napu — dodajte ga klikom na gornji element.");
  }
  return next;
}

/**
 * Change the island / peninsula (KitchenConfig.islandSpec). `patch` merges into the current spec (an `undefined` value
 * removes that field = its default); null = everything back to the defaults (the island of every older link). Values
 * snap to the offered options (ISLAND_DEPTHS, OVERHANGS, BAR_HEIGHTS …) with a note; stools are capped to what fits.
 * A change of `functions` re-plans the walls: the planner moves the hob / sink itself in wall runs it fills, edited
 * wall runs get plain cabinets in their place (and back), an edited island list is laid out anew. A peninsula that
 * changes ends takes its blind-corner type along. Refused only for a layout without an island run.
 *
 *   setIsland(cfg, { functions: "hob" })                  // hob on the island, ceiling hood above it
 *   setIsland(cfg, { depth: 90, waterfall: false })        // + push-to-open cabinets behind, end panels
 *   setIsland(cfg, { seatSide: "right", overhang: 30 })    // seats at the right end
 */
export function setIsland(input: KitchenConfig, patch: Partial<IslandSpec> | null): IslandResult {
  const cfg0 = sanitizeConfig(input);
  if (!hasIsland(cfg0.layout)) {
    return { cfg: cfg0, ok: false, warning: "Ova kuhinja nema otok ni poluotok.", slotId: null, island: null, notes: [] };
  }
  const plan0 = planKitchen(cfg0);
  const cur: IslandSpec = cfg0.islandSpec ? { ...cfg0.islandSpec } : {};
  const notes: string[] = [];
  const word = islandWord(cfg0);
  const spec: IslandSpec = patch === null ? {} : { ...cur, ...patch };
  if (patch) {
    const snapNote = (v: number | undefined, list: readonly number[], what: string) => {
      if (v !== undefined && !list.includes(Math.round(v))) notes.push(`${what} ${list.join(", ")} cm.`);
    };
    snapNote(patch.depth, ISLAND_DEPTHS, `${word} može biti dubok`);
    snapNote(patch.overhang, OVERHANGS, "Prepust za sjedenje može biti");
    if (patch.hoodAbove !== undefined && (patch.hoodAbove < HOOD_ABOVE.min || patch.hoodAbove > HOOD_ABOVE.max)) {
      notes.push(`Napa iznad otoka može biti od ${HOOD_ABOVE.min} do ${HOOD_ABOVE.max} cm iznad radne ploče.`);
    }
    const pen = peninsulaSide(cfg0);
    const wallEnd = pen === "right" ? "left" : pen === "left" ? "right" : null;
    if (patch.seatSide && patch.seatSide === wallEnd) notes.push("Uz zid A se ne sjedi — mjesta za sjedenje ostaju straga.");
  }
  let next: KitchenConfig = { ...cfg0, islandSpec: spec };
  // a peninsula changing ends: the blind corner unit of wall A changes ends too, and keeps its type
  const side0 = peninsulaSide(cfg0);
  const side1 = peninsulaSide(next);
  if (cfg0.layout === "poluotok" && side0 !== side1 && cfg0.corners) {
    const co = { ...cfg0.corners };
    const l = co["base-l"];
    const r = co["base-r"];
    if (r !== undefined) co["base-l"] = r;
    else delete co["base-l"];
    if (l !== undefined) co["base-r"] = l;
    else delete co["base-r"];
    next = { ...next, corners: co };
    if (!Object.keys(co).length) delete next.corners;
  }
  // hob / sink moving between the walls and the island
  const f0 = cur.functions ?? "none";
  const f1 = spec.functions ?? "none";
  if (f0 !== f1) {
    next = moveFunctions(next, f0, f1, notes);
    if (next.runs?.isl) {
      next = withList(next, "isl", undefined);
      notes.push(`Elementi ${islandOn(cfg0) === "otok" ? "otoka" : "poluotoka"} složeni su iznova.`);
    }
  }
  if (patch && patch.bar && !cur.bar && plan0.island?.seats.length && plan0.island.seatSide !== null && !plan0.island.bar) {
    notes.push(`Uz šank se sjedi na barskim stolicama — radna ploča ${islandOn(cfg0) === "otok" ? "otoka" : "poluotoka"} više nema prepust za sjedenje.`);
  }
  let cfg = sanitizeConfig(next);
  let plan = planKitchen(cfg);
  // stools: at most what fits now
  if (patch?.stools !== undefined && plan.island && cfg.islandSpec && Math.round(patch.stools) > plan.island.seatsMax) {
    const max = plan.island.seatsMax;
    notes.push(`Uz ove mjere stane najviše ${max} ${stoolsWord(max)}.`);
    cfg = sanitizeConfig({ ...cfg, islandSpec: { ...cfg.islandSpec, stools: max } });
    plan = planKitchen(cfg);
  }
  const before = new Set(plan0.warnings);
  for (const w of plan.warnings) if (!before.has(w) && !notes.includes(w) && !/stane najviše/.test(w)) notes.push(w);
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, island: plan.island, notes };
}

/** What stands in the island / peninsula worktop: "none" | "hob" | "sink" | "both" (see setIsland: the walls follow). */
export function setIslandFunctions(cfg: KitchenConfig, functions: IslandFunctions): IslandResult {
  return setIsland(cfg, { functions });
}

/** Seating at the main worktop: the side ("back" / "left" / "right" end), the overhang (OVERHANGS) and the number of stools. */
export function setSeating(cfg: KitchenConfig, seating: { side?: SeatSide; overhang?: number; stools?: number }): IslandResult {
  const patch: Partial<IslandSpec> = {};
  if (seating.side !== undefined) patch.seatSide = seating.side;
  if (seating.overhang !== undefined) patch.overhang = seating.overhang;
  if (seating.stools !== undefined) patch.stools = seating.stools;
  return setIsland(cfg, patch);
}

/**
 * The bar (šank) or the lowered table along the outer side. `bar` merges into the current one (switching `kind` starts
 * from that kind's defaults: 110 / 35 cm raised, 75 / 70 cm table, keeping its top and length); `top: undefined` = back
 * to the kitchen's worktop; `length: undefined` (or as long as the island, or longer) = the whole island, following its
 * length; null removes it. Heights / depths snap to BAR_HEIGHTS / BAR_DEPTHS / TABLE_DEPTHS with a note.
 *
 *   setBar(cfg, { kind: "raised" })                        // 110 cm, 35 cm deep, the whole length
 *   setBar(cfg, { height: 115, length: 180, top: "hrast" })
 *   setBar(cfg, { kind: "table", depth: 80 })
 */
export function setBar(input: KitchenConfig, bar: Partial<BarSpec> | null): IslandResult {
  const cfg0 = sanitizeConfig(input);
  const cur = cfg0.islandSpec?.bar;
  if (bar === null) return setIsland(cfg0, { bar: undefined });
  const kind = bar.kind ?? cur?.kind ?? "raised";
  const base: BarSpec = cur && cur.kind === kind ? cur : { kind, ...(cur?.top ? { top: cur.top } : {}), ...(cur?.length !== undefined ? { length: cur.length } : {}) };
  const next: BarSpec = { ...base, ...bar, kind };
  // as long as the island or longer = its whole length (it then follows the island's length)
  if (next.length !== undefined && !(next.length < cfg0.island - 0.5)) delete next.length;
  const r = setIsland(cfg0, { bar: next });
  const extra: string[] = [];
  if (kind === "raised" && bar.height !== undefined && !(BAR_HEIGHTS as readonly number[]).includes(Math.round(bar.height))) {
    extra.push(`Šank može biti visok ${BAR_HEIGHTS.join(", ")} cm.`);
  }
  if (kind === "table" && bar.height !== undefined && Math.round(bar.height) !== TABLE_HEIGHT) extra.push(`Spušteni stol je na visini od ${TABLE_HEIGHT} cm.`);
  const depths = kind === "raised" ? BAR_DEPTHS : TABLE_DEPTHS;
  if (bar.depth !== undefined && !(depths as readonly number[]).includes(Math.round(bar.depth))) {
    extra.push(`${kind === "raised" ? "Šank" : "Stol"} može biti dubok ${depths.join(", ")} cm.`);
  }
  const b = r.island?.bar;
  if (bar.length !== undefined && b && Math.abs(b.to - b.from - bar.length) > 0.5) extra.push(`Dužina je postavljena na ${Math.round(b.to - b.from)} cm.`);
  if (!extra.length) return r;
  const notes = [...extra, ...r.notes];
  return { ...r, notes, warning: notes.join(" ") };
}

/**
 * The ceiling hood above the island hob: `on` (false = none — a hob with a built-in downdraft extractor; true / null =
 * the default: a hood above every hob on the island), and how high it hangs — `above` = cm from the worktop up to its underside (HOOD_ABOVE), or
 * `fromCeiling` = cm from the ceiling down to its underside (the same thing measured from above; stored as `hoodAbove`,
 * so a new ceiling keeps the distance to the worktop, the one that matters for cooking).
 */
export function setIslandHood(input: KitchenConfig, hood: { on?: boolean | null; above?: number; fromCeiling?: number }): IslandResult {
  const cfg = sanitizeConfig(input);
  const patch: Partial<IslandSpec> = {};
  if (hood.on !== undefined) patch.hood = hood.on === null ? undefined : hood.on;
  if (hood.above !== undefined) patch.hoodAbove = hood.above;
  let note: string | null = null;
  if (hood.above === undefined && hood.fromCeiling !== undefined && Number.isFinite(hood.fromCeiling)) {
    const w = planHeights(cfg).heights.worktop;
    const lo = cfg.ceiling - w - HOOD_ABOVE.max;
    const hi = cfg.ceiling - w - HOOD_ABOVE.min;
    const from = Math.round(Math.min(hi, Math.max(lo, hood.fromCeiling)));
    if (from !== Math.round(hood.fromCeiling)) note = `Uz strop od ${cfg.ceiling} cm napa može visjeti ${lo}–${hi} cm ispod stropa (${HOOD_ABOVE.min}–${HOOD_ABOVE.max} cm iznad radne ploče).`;
    patch.hoodAbove = cfg.ceiling - w - from;
  }
  const r = setIsland(cfg, patch);
  if (!note || !r.ok) return r;
  const notes = [note, ...r.notes];
  return { ...r, notes, warning: notes.join(" ") };
}

/**
 * The peninsula: which end of wall A it stands at ("poluotok" only — "G" is always at the right) and its length from
 * the wall (cm, clamped like setWallLength).
 */
export function setPeninsula(input: KitchenConfig, p: { side?: "left" | "right"; length?: number }): IslandResult {
  const cfg0 = sanitizeConfig(input);
  if (!isPeninsula(cfg0.layout)) return { cfg: cfg0, ok: false, warning: "Ova kuhinja nema poluotok.", slotId: null, island: null, notes: [] };
  const notes: string[] = [];
  let cfg = cfg0;
  if (p.side !== undefined) {
    if (cfg0.layout === "G" && p.side === "left") notes.push("U G kuhinji poluotok stoji uz desni kraj zida A (lijevo je zid B).");
    else {
      const r = setIsland(cfg, { side: p.side === "left" ? "left" : undefined });
      cfg = r.cfg;
      notes.push(...r.notes);
    }
  }
  if (p.length !== undefined) {
    const r = setWallLength(cfg, "isl", p.length);
    if (r.ok) cfg = r.cfg;
    if (r.warning) notes.push(r.warning);
  }
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, island: planKitchen(cfg).island, notes };
}

/** What the island / peninsula controls can offer for this kitchen, and what it has now; null without an island run. */
export function islandChoices(input: KitchenConfig): IslandChoices | null {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const I = plan.island;
  if (!I) return null;
  const spec = cfg.islandSpec ?? {};
  const lim = wallLimits(cfg, "isl") ?? { min: cfg.island, max: cfg.island };
  const fCur = spec.functions ?? "none";
  const functions = (["none", "hob", "sink", "both"] as IslandFunctions[]).map((value) => {
    const p = value === fCur ? plan : planKitchen({ ...withList(cfg, "isl", undefined), islandSpec: { ...spec, functions: value } });
    const want = FEATURES_OF[value];
    const fits = want.every((f) => p.island?.functions[f]);
    return { value, current: value === fCur, fits };
  });
  const wallEnd = I.side === "right" ? "left" : I.side === "left" ? "right" : null;
  const seatCur = spec.seatSide ?? "back";
  const hobOn = plan.slots.some((s) => s.zone === "island" && moduleDef("base", s.type)?.feature === "hob");
  const hoodAbove = I.hood ? Math.round(I.hood.above) : (spec.hoodAbove ?? ISLAND_DEFAULTS.hoodAbove);
  const bar = spec.bar ?? null;
  return {
    kind: I.kind,
    side: I.side,
    sides: cfg.layout === "poluotok" ? ["left", "right"] : cfg.layout === "G" ? ["right"] : [],
    length: { min: lim.min, max: lim.max, value: cfg.island },
    functions,
    depth: ISLAND_DEPTHS.map((value) => ({ value, current: value === (spec.depth ?? ISLAND_DEFAULTS.depth) })),
    seatSides: (["back", "left", "right"] as SeatSide[]).map((value) => ({ value, current: value === seatCur, available: value !== wallEnd })),
    overhang: OVERHANGS.map((value) => ({ value, current: value === (spec.overhang ?? ISLAND_DEFAULTS.overhang) })),
    stools: { value: I.seats.length, max: I.seatsMax },
    waterfall: spec.waterfall !== false,
    hood: {
      available: hobOn,
      on: Boolean(I.hood),
      auto: spec.hood === undefined,
      above: { min: HOOD_ABOVE.min, max: HOOD_ABOVE.max, value: hoodAbove },
      fromCeiling: { min: cfg.ceiling - plan.heights.worktop - HOOD_ABOVE.max, max: cfg.ceiling - plan.heights.worktop - HOOD_ABOVE.min, value: cfg.ceiling - plan.heights.worktop - hoodAbove },
      plan: I.hood,
    },
    bar: {
      current: bar,
      plan: I.bar,
      heights: [...BAR_HEIGHTS],
      depths: { raised: [...BAR_DEPTHS], table: [...TABLE_DEPTHS] },
      tableHeight: TABLE_HEIGHT,
      length: { min: Math.min(DIM.barMinLength, I.length), max: I.length, value: bar?.length ?? null },
    },
    island: I,
  };
}

// ---------------------------------------------------------------- ceiling: room for taller cabinets

export interface CeilingRaise extends EditResult {
  /** the ceiling the result has (cm) */
  ceiling: number;
  /** cm the cabinets may reach under it (ceiling − DIM.ceilingGap) */
  maxTop: number;
}

/**
 * The config with the ceiling raised just enough for cabinets up to `wantedTop` cm (custom heights keep DIM.ceilingGap
 * to the ceiling): ceiling = wantedTop + 3, at most limitsFor(layout).ceiling[1] (with a note). Never lowers it — a
 * ceiling already high enough comes back unchanged. For "Podigni strop na X cm" when heightChoices().tallTop.max is
 * below the wish (custom heights keep the wish, so the tall column grows to it once the ceiling allows):
 *
 *   const r = raiseCeilingFor(cfg, 300);                    // ceiling 303
 *   setHeights(r.cfg, { mode: "custom", tallTop: 300 });
 */
export function raiseCeilingFor(input: KitchenConfig, wantedTop: number): CeilingRaise {
  const cfg = sanitizeConfig(input);
  const hi = limitsFor(cfg.layout).ceiling[1];
  const top = typeof wantedTop === "number" ? wantedTop : Number(wantedTop);
  const keep = (warning: string | null, ok = true): CeilingRaise => ({ cfg, ok, warning, slotId: null, ceiling: cfg.ceiling, maxTop: cfg.ceiling - DIM.ceilingGap });
  if (!Number.isFinite(top)) return keep("Upišite visinu u centimetrima.", false);
  const want = Math.ceil(top) + DIM.ceilingGap;
  if (want <= cfg.ceiling) return keep(null);
  const r = setCeiling(cfg, Math.min(hi, want));
  const notes: string[] = [];
  if (want > hi) notes.push(`Strop može biti najviše ${hi} cm — elementi tada idu do ${hi - DIM.ceilingGap} cm.`);
  notes.push(`Strop je podignut na ${r.cfg.ceiling} cm.`);
  if (r.warning) notes.push(r.warning);
  return { cfg: r.cfg, ok: true, warning: notes.join(" "), slotId: null, ceiling: r.cfg.ceiling, maxTop: r.cfg.ceiling - DIM.ceilingGap };
}

// ---------------------------------------------------------------- room vs kitchen — KitchenConfig.walls / extents

export interface KitchenExtentInfo {
  wall: WallId;
  /** the room's wall: its length and the range it may have (cm) */
  room: { value: number; min: number; max: number };
  /** where the kitchen stands on it (wall-local cm, as seen facing the wall) */
  kitchen: Range;
  /** the kitchen run's length and the range it may have from where it starts (cm) */
  length: { value: number; min: number; max: number };
  /** cm of bare wall between the anchor end and the kitchen, and its range */
  offset: { value: number; min: number; max: number };
  /** the end of the wall the offset is measured from, and whether that is the wall's corner end (A: left, B: right, C: left) */
  anchor: "left" | "right";
  anchorIsCorner: boolean;
  /** the kitchen takes the whole wall (no extent stored: it follows the wall) */
  full: boolean;
  /** what closes each end of the kitchen run now: a corner unit, a room wall, or nothing (an end panel) */
  ends: { left: "corner" | "wall" | "open"; right: "corner" | "wall" | "open" };
}

/** where the kitchen stands on a wall, with the ranges the controls can offer; null for a wall the layout has not */
export function kitchenExtent(input: KitchenConfig, wall: WallId): KitchenExtentInfo | null {
  const cfg = sanitizeConfig(input);
  if (!wallsFor(cfg.layout).includes(wall)) return null;
  const plan = planKitchen(cfg);
  const run = plan.runs.find((r) => r.wall === wall);
  const L = cfg.walls[wall];
  const k = kitchenRange(cfg, wall);
  const anchor = cfg.extents?.[wall]?.anchor ?? defaultAnchor(wall);
  const offset = anchor === "left" ? k.from : L - k.to;
  const min = Math.min(minRun(cfg.layout, wall), L);
  const lim = limitsFor(cfg.layout)[wall];
  return {
    wall,
    room: { value: L, min: lim[0], max: lim[1] },
    kitchen: k,
    length: { value: k.to - k.from, min, max: L - offset },
    offset: { value: offset, min: 0, max: L - min },
    anchor,
    anchorIsCorner: anchor === defaultAnchor(wall),
    full: !cfg.extents?.[wall],
    ends: run?.ends ?? { left: "open", right: "open" },
  };
}

export interface ExtentResult extends EditResult {
  /** the kitchen on that wall now */
  info: KitchenExtentInfo | null;
  notes: string[];
}

const END_WORD = { left: "lijevog", right: "desnog" } as const;
const CORNER_OF: Record<WallId, { left: string | null; right: string | null }> = {
  a: { left: "B", right: "C" },
  b: { left: null, right: "A" },
  c: { left: "A", right: null },
};

/** the config with the kitchen on `wall` standing on `r` (wall-local cm), keeping the extent's anchor; not sanitized */
function withExtent(cfg: KitchenConfig, wall: WallId, r: Range): KitchenConfig {
  const L = cfg.walls[wall];
  const anchor = cfg.extents?.[wall]?.anchor ?? defaultAnchor(wall);
  const ext: KitchenExtent = { anchor, offset: Math.round(anchor === "left" ? r.from : L - r.to), length: Math.round(r.to - r.from) };
  return { ...cfg, extents: { ...(cfg.extents ?? {}), [wall]: ext } };
}

/** the config with the kitchen on `wall` reaching `cm` further at `side`, into the bare wall beyond it; not sanitized */
function extendRun(cfg: KitchenConfig, wall: WallId, side: "left" | "right", cm: number): KitchenConfig {
  if (!(cm >= 0.5)) return cfg;
  const L = cfg.walls[wall];
  const k = kitchenRange(cfg, wall);
  return withExtent(cfg, wall, side === "left" ? { from: Math.max(0, k.from - Math.ceil(cm)), to: k.to } : { from: k.from, to: Math.min(L, k.to + Math.ceil(cm)) });
}

/** Croatian notes on how the corner rules moved kitchen runs (`want`: what was asked for each wall) */
function cornerNotes(cfg: KitchenConfig, want: Partial<Record<WallId, Range>>): string[] {
  const notes: string[] = [];
  for (const w of wallsFor(cfg.layout)) {
    const r = want[w];
    if (!r) continue;
    const k = kitchenRange(cfg, w);
    const L = cfg.walls[w];
    for (const side of ["left", "right"] as const) {
      const other = CORNER_OF[w][side];
      if (!other || !wallsFor(cfg.layout).includes(other.toLowerCase() as WallId)) continue;
      const d0 = side === "left" ? r.from : L - r.to;
      const d1 = side === "left" ? k.from : L - k.to;
      if (Math.abs(d0 - d1) < 0.5) continue;
      if (d1 === 0) notes.push(`Kuhinja na zidu ${w.toUpperCase()} ide do kuta sa zidom ${other} (bliže od ${DIM.cornerClear} cm ne može stati uz elemente zida ${other}).`);
      else notes.push(`Kuhinja na zidu ${w.toUpperCase()} počinje ${d1} cm od kuta sa zidom ${other}, da ne udari u elemente zida ${other}.`);
    }
  }
  return notes;
}

/**
 * Where the kitchen stands on a wall of the room (KitchenConfig.extents): its `length`, the bare wall between the anchor
 * end and the kitchen (`offset`) and the end that is measured from (`anchor`; switching only the anchor keeps the
 * kitchen where it is). null = the kitchen takes the whole wall again (and follows it). Values are clamped (at least the
 * layout's shortest wall, inside the wall); at a room corner two runs either meet in it or one keeps DIM.cornerClear
 * (120 cm: room for the other run's corner cabinet to open) from it — `notes` says what moved. Edited runs keep their
 * cabinets; what no longer fits is left out with the planner's note, as for a shorter wall (setWallLength). Refused only
 * for a wall the layout has not, or a non-number.
 *
 *   setKitchenExtent(cfg, "b", { length: 300 })        // 300 of wall B's 450 cm, from the corner with A
 *   setKitchenExtent(cfg, "b", { offset: 40 })          // 40 cm from the corner: goes into it (closer than half of 120)
 *   setKitchenExtent(cfg, "b", { offset: 80 })          // 80 cm: becomes 120 (A's corner cabinet must still open)
 *   setKitchenExtent(cfg, "a", { anchor: "right", offset: 0, length: 240 })   // 240 cm at the right end of wall A
 */
export function setKitchenExtent(input: KitchenConfig, wall: WallId, patch: Partial<KitchenExtent> | null): ExtentResult {
  const cfg0 = sanitizeConfig(input);
  if (!wallsFor(cfg0.layout).includes(wall)) return { ...fail(cfg0, `Ovaj oblik kuhinje nema zid ${wall.toUpperCase()}.`), info: null, notes: [] };
  const plan0 = planKitchen(cfg0);
  const L = cfg0.walls[wall];
  const W = wall.toUpperCase();
  const notes: string[] = [];
  const extents = { ...(cfg0.extents ?? {}) };
  let want: Range = { from: 0, to: L };
  if (patch === null) delete extents[wall];
  else {
    const k0 = kitchenRange(cfg0, wall);
    const anchor = patch.anchor === "left" || patch.anchor === "right" ? patch.anchor : (cfg0.extents?.[wall]?.anchor ?? defaultAnchor(wall));
    const curOff = anchor === "left" ? k0.from : L - k0.to;
    const off = patch.offset !== undefined ? Number(patch.offset) : curOff;
    const len = patch.length !== undefined ? Number(patch.length) : k0.to - k0.from;
    if (!Number.isFinite(off) || !Number.isFinite(len)) return { ...fail(cfg0, "Upišite duljinu u centimetrima."), info: kitchenExtent(cfg0, wall), notes: [] };
    const min = Math.min(minRun(cfg0.layout, wall), L);
    const o = Math.round(Math.min(L - min, Math.max(0, off)));
    if (patch.offset !== undefined && o !== Math.round(off)) notes.push(`Kuhinja na zidu ${W} može početi najviše ${L - min} cm od ${END_WORD[anchor]} kraja zida — postavljeno je ${o} cm.`);
    // a new offset keeps the far end where it was unless a length is given (the kitchen moves its start, not its end)
    const far = anchor === "left" ? k0.to : L - k0.from;
    const len1 = patch.length !== undefined ? len : patch.offset !== undefined ? far - o : len;
    const l = Math.round(Math.min(L - o, Math.max(min, len1)));
    if (patch.length !== undefined && l !== Math.round(len)) notes.push(`Kuhinja na zidu ${W} može biti duga od ${min} do ${L - o} cm — postavljeno je ${l} cm.`);
    extents[wall] = { anchor, offset: o, length: l };
    want = anchor === "left" ? { from: o, to: o + l } : { from: L - o - l, to: L - o };
  }
  const cfg = sanitizeConfig({ ...cfg0, extents });
  const before: Partial<Record<WallId, Range>> = { [wall]: want };
  for (const w of wallsFor(cfg0.layout)) if (w !== wall) before[w] = kitchenRange(cfg0, w);
  notes.push(...cornerNotes(cfg, before));
  const seen = new Set(plan0.warnings);
  for (const w of planKitchen(cfg).warnings) if (!seen.has(w)) notes.push(w);
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, info: kitchenExtent(cfg, wall), notes };
}

/**
 * The room's wall only (KitchenConfig.walls): the kitchen on it keeps its length and its place at the anchor end — a
 * kitchen that took the whole wall gets that length as an explicit extent — and is shortened only when the wall gets
 * shorter than it. Clamped like setWallLength. For "room and kitchen together" (the old wall label: a kitchen that
 * takes the whole wall follows it) use setWallLength.
 */
export function setRoomWall(input: KitchenConfig, wall: WallId, cm: number): WallEditResult {
  const cfg = sanitizeConfig(input);
  const r = wallChange(cfg, wall, cm, true);
  if (!r.ok || !wallsFor(cfg.layout).includes(wall)) return r;
  const notes = r.warning ? [r.warning] : [];
  const k = kitchenRange(cfg, wall);
  const k1 = kitchenRange(r.cfg, wall);
  if (k1.to - k1.from < k.to - k.from - 0.5) notes.unshift(`Kuhinja na zidu ${wall.toUpperCase()} skraćena je na ${k1.to - k1.from} cm.`);
  return { ...r, warning: notes.length ? notes.join(" ") : null };
}

// ---------------------------------------------------------------- tall columns anywhere — tallAt / tallRuns

export interface TallPlaceChoice {
  end: RunEnd;
  /** the column stands there now */
  current: boolean;
  /** it fits there as it is (moveTall would work) */
  fits: boolean;
}

/** the run end a tall column stands at now (null: not placed) */
function tallEndOf(plan: KitchenPlan, list: ListId): RunEnd | null {
  const sl = plan.slots.find((s) => s.zone === "tall" && s.list?.id === list);
  if (!sl || sl.run === "isl") return null;
  const r = plan.runs.find((x) => x.wall === sl.run);
  if (!r) return null;
  const t = r.talls.find((x) => sl.x >= x.from - 0.5 && sl.x < x.to);
  if (!t) return null;
  return runEnd(r.wall, Math.abs(t.from - r.kitchen.from) < Math.abs(r.kitchen.to - t.to) ? "left" : "right");
}

/**
 * Move a tall column to another free end of a wall run: the tall column ("tall": KitchenConfig.tallAt) or a column of
 * KitchenConfig.tallRuns ("tall:b-left"). Refused when another column stands there, the end is a corner, or it does not
 * fit there without leaving cabinets out.
 */
export function moveTall(input: KitchenConfig, list: "tall" | TallListId, end: RunEnd): EditResult {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const cur = tallEndOf(plan, list);
  if (!cur) return fail(cfg, "Taj visoki stup ne postoji.");
  if (cur === end) return { cfg, ok: true, warning: null, slotId: plan.slots.find((s) => s.list?.id === list)?.id ?? null };
  const { wall } = parseRunEnd(end);
  if (!wallsFor(cfg.layout).includes(wall)) return fail(cfg, `Ovaj oblik kuhinje nema zid ${wall.toUpperCase()}.`);
  const run = plan.runs.find((r) => r.wall === wall);
  const side = parseRunEnd(end).side;
  if (run?.ends[side] === "corner") return fail(cfg, "U kutu ne može stajati visoki stup.");
  if (tallEndOf(plan, "tall") === end || plan.lists.some((l) => l.id === `tall:${end}` && l.entries.length)) return fail(cfg, "Na tom kraju već stoji visoki stup.");
  const refuse = "Visoki stup tamo ne stane bez izostavljanja drugih elemenata.";
  if (list === "tall") return commitPlan(cfg, plan, null, { ...cfg, tallAt: end }, "tall", 0, refuse);
  const units = listOf(cfg, list) ?? [];
  const id: TallListId = `tall:${end}`;
  return commitPlan(cfg, plan, null, withList(withList(cfg, list, undefined), id, units), id, 0, refuse);
}

/** every free run end of the layout a tall column could stand at, with whether this column fits there */
export function tallPlaces(input: KitchenConfig, list: "tall" | TallListId = "tall"): TallPlaceChoice[] {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const cur = tallEndOf(plan, list);
  const out: TallPlaceChoice[] = [];
  for (const r of plan.runs) {
    for (const side of ["left", "right"] as const) {
      if (r.ends[side] === "corner") continue;
      const end = runEnd(r.wall, side);
      out.push({ end, current: end === cur, fits: end === cur || (cur !== null && moveTall(cfg, list, end).ok) });
    }
  }
  return out;
}

// ---------------------------------------------------------------- "+" places — plan.ts planGaps

export interface GapOptions {
  gap: PlanGap;
  /** base / wall-unit / island types that can go here, each with every width that fits (`fitting`) and the width an insert without one gets (`width`, null = none fits) */
  types: TypeChoice[];
  /** end gaps: tall units — joining the tall column standing at this end, or a new column there */
  tall: TypeChoice[];
}

/** every "+" place of a config (= plan.ts planGaps(planKitchen(cfg))) */
export function gapsOf(input: KitchenConfig): PlanGap[] {
  return planGaps(planKitchen(sanitizeConfig(input)));
}

/** what can go into a gap (PlanGap.id, ViewInfo.gaps[].id), each width checked by planning it; null when the gap is gone */
export function gapOptions(input: KitchenConfig, gapId: string): GapOptions | null {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const gap = planGaps(plan).find((g) => g.id === gapId);
  if (!gap) return null;
  const zone: ListZone = gap.zone === "upper" ? "upper" : gap.zone === "island" ? "island" : "base";
  const probed = new Map<string, boolean>();
  // whether an element fits depends on its width only (a hood also on where the hob is): one probe per width
  const fits = (z: ListZone, d: ModuleTypeDef, w: number) => {
    if (z !== "tall" && w > gap.maxWidth + 0.5) return false;
    const key = d.hood ? `${z}:${d.id}:${w}` : `${z}:${w}`;
    let ok = probed.get(key);
    if (ok === undefined) {
      const type = d.hood ? d.id : probeType(z, w);
      ok = Boolean(type) && insertGapIn(cfg, plan, gap, type as string, w, z).ok;
      probed.set(key, ok);
    }
    return ok;
  };
  const list = (z: ListZone) =>
    poolOf(z)
      .filter((d) => !d.spacer && !d.corner)
      .map((d) => {
        const fitting = d.widths.filter((w) => fits(z, d, w));
        return choice(d, widthsNew(d).find((w) => fitting.includes(w)) ?? null, false, fitting);
      });
  return { gap, types: list(zone), tall: gap.kind === "end" ? list("tall") : [] };
}

/**
 * Put an element into a gap (gapOptions lists what fits). Without `width` the usual width that fits; `zone` only
 * matters at the end of a wall run, where "tall" puts a tall unit there (absent: base types go to the base run, types
 * that are only tall to a tall column). By kind:
 *
 *   free    the element takes the empty space's place (what it does not take stays empty)
 *   upper   a wall unit on the bare wall
 *   end     base: at that end of the base run — taking the bare floor there first, then growing the kitchen run into
 *           the bare wall beyond it (KitchenConfig.extents); tall: onto the outer side of the tall column standing at
 *           that end, or a new column there (the tall column if the kitchen has none, else a KitchenConfig.tallRuns one)
 *   island  at that end of the island / peninsula, which grows when it has to
 *
 * Validated by planning the result like every edit (nothing else may be left out); slotId = the new element.
 */
export function insertAtGap(input: KitchenConfig, gapId: string, type: string, width?: number, zone?: "base" | "upper" | "island" | "tall"): EditResult {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const gap = planGaps(plan).find((g) => g.id === gapId);
  if (!gap) return fail(cfg, "Tog slobodnog mjesta više nema.");
  const z: ListZone =
    gap.zone === "upper" ? "upper" : gap.zone === "island" ? "island" : zone === "tall" || (zone === undefined && !moduleDef("base", type) && moduleDef("tall", type)) ? "tall" : "base";
  if (z === "tall" && gap.kind !== "end") return fail(cfg, "Visoki element može stajati samo na kraju niza.");
  const def = defOf(z, type);
  if (!def || def.corner || def.spacer || (z === "island" && !def.island)) return fail(cfg, "Ta izvedba ne može stajati na ovom mjestu.");
  const tries = width !== undefined ? [Math.round(width)] : widthsNew(def);
  let last: EditResult | null = null;
  for (const w of tries) {
    if (!widthAllowed(def, w)) {
      last = fail(cfg, `${def.name} dolazi u širinama: ${def.widths.join(", ")} cm.`);
      continue;
    }
    last = insertGapIn(cfg, plan, gap, type, w, z);
    if (last.ok) return last;
  }
  return last ?? fail(cfg, "Ovdje nema mjesta za taj element.");
}

/** the list in `cfg` made explicit (the planner's fill becomes what is stored, as on a first edit) */
function editableIn(cfg: KitchenConfig, plan: KitchenPlan, id: ListId): { cfg: KitchenConfig; list: CabinetSpec[] } {
  const c = materializeLists(cfg, plan, [id]);
  return { cfg: c, list: (listOf(c, id) ?? []).map((e) => ({ ...e })) };
}

function insertGapIn(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, type: string, w: number, zone: ListZone): EditResult {
  const refuse = `Za ${w} cm ovdje nema mjesta${gap.maxWidth >= GAP_MIN ? ` — stane najviše ${gap.maxWidth} cm` : ""}.`;
  const el: CabinetSpec = { type, width: w };
  const put = (list: CabinetSpec[], at: number) => [...list.slice(0, at), el, ...list.slice(at)];
  if (gap.kind === "free") {
    const slot = plan.slots.find((s) => s.id === gap.slotId);
    if (!slot?.list) return fail(cfg, "Tog slobodnog mjesta više nema.");
    const id = slot.list.id;
    const { cfg: c1, list } = editableIn(cfg, plan, id);
    const i = slot.list.index;
    const cur = list[i];
    if (!cur) return fail(cfg, "Tog slobodnog mjesta više nema.");
    const next = list.map((e) => ({ ...e }));
    next[i] = el;
    if (cur.width - w >= 5) next.splice(i + 1, 0, { type: cur.type, width: cur.width - w });
    else if (w > cur.width) growInto(next, i, w - cur.width, listZone(id));
    const final = tidy(next, listZone(id), el);
    return commitPlan(cfg, plan, null, withList(c1, id, final), id, final.indexOf(el), refuse);
  }
  if (gap.kind === "upper") {
    const { cfg: c1, list } = editableIn(cfg, plan, gap.list);
    if (list.length >= MAX_LIST) return fail(cfg, fullNote("upper"));
    const placed = placeInto(list, Math.min(gap.index, list.length), el, "upper");
    return commitPlan(cfg, plan, null, withList(c1, gap.list, placed), gap.list, placed.indexOf(el), refuse);
  }
  if (gap.kind === "island") {
    const { cfg: c1, list } = editableIn(cfg, plan, "isl");
    if (list.length >= MAX_LIST) return fail(cfg, fullNote("island"));
    const need = w - (gap.floor ?? 0);
    if (need > (gap.outside ?? 0) + 0.5) return fail(cfg, refuse);
    const c2 = need > 0.5 ? { ...c1, island: cfg.island + Math.ceil(need) } : c1;
    const at = gap.side === "left" ? 0 : list.length;
    return commitPlan(cfg, plan, null, withList(c2, "isl", put(list, at)), "isl", at, refuse);
  }
  // the end of a wall's kitchen run
  const wall = gap.run as WallId;
  const side = gap.side ?? "right";
  const floor = gap.floor ?? 0;
  const outside = gap.outside ?? 0;
  /**
   * Commit `build(grow)` — the run grown by `grow` cm more than the element needs. A longer run can let a tall column
   * stand again that did not fit before (it stays in the config, KitchenConfig.tallRuns / tallRun): it then takes the
   * room the element was to get, so try once more with the run grown by that column too (while the wall allows it).
   */
  const withRevived = (id: ListId, at: number, room: number, build: (grow: number) => KitchenConfig): EditResult => {
    const first = commitPlan(cfg, plan, null, build(0), id, at, refuse);
    if (first.ok) return first;
    const revived = revivedTall(plan, planKitchen(sanitizeConfig(build(0))), wall, id);
    if (revived.cm < 0.5 || revived.cm > room + 0.5) return first;
    const again = commitPlan(cfg, plan, null, build(revived.cm), id, at, refuse);
    if (!again.ok) return first;
    const note = "Uz duži niz sada stane i visoki stup koji prije nije stao.";
    return { ...again, warning: again.warning ? `${again.warning} ${note}` : note };
  };
  if (zone === "tall") {
    if (gap.tallList) {
      // onto the outer side of the column standing here: the run grows by the unit's width (or the base run gives way)
      const tallList = gap.tallList;
      const { cfg: c1, list } = editableIn(cfg, plan, tallList);
      if (list.length >= MAX_TALL) return fail(cfg, fullNote("tall"));
      const at = side === "left" ? 0 : list.length;
      const grown = Math.min(w, outside);
      return withRevived(tallList, at, outside - grown, (more) => withList(extendRun(c1, wall, side, grown + more), tallList, put(list, at)));
    }
    // a new column at this end stands right beside the cabinets (never with bare floor between them): the kitchen run
    // then ends at the column's outer side — bare floor beyond it is bare wall outside the kitchen; without bare floor
    // the run grows into the wall beyond it
    const Z = w + 2 * DIM.panel;
    const k = kitchenRange(cfg, wall);
    const fr = plan.runs.find((r) => r.wall === wall)?.free.find((f) => f.side === side);
    const target: Range =
      side === "left"
        ? { from: fr ? fr.to + DIM.panel - Z : k.from - Z, to: k.to }
        : { from: k.from, to: fr ? fr.from - DIM.panel + Z : k.to + Z };
    const beyond = side === "left" ? k.from - outside - target.from : target.to - (k.to + outside);
    if (beyond > 0.5) return fail(cfg, refuse);
    const e = runEnd(wall, side);
    const at = (more: number): KitchenConfig =>
      withExtent(cfg, wall, {
        from: Math.max(0, side === "left" ? target.from - more : target.from),
        to: Math.min(cfg.walls[wall], side === "left" ? target.to : target.to + more),
      });
    if (!plan.slots.some((s) => s.list?.id === "tall")) {
      return withRevived("tall", 0, -beyond, (more) => ({ ...at(more), tall: true, tallRun: [el], tallAt: e }));
    }
    const id: TallListId = `tall:${e}`;
    return withRevived(id, 0, -beyond, (more) => withList(at(more), id, [el]));
  }
  const { cfg: c1, list } = editableIn(cfg, plan, wall);
  if (list.length >= MAX_LIST) return fail(cfg, fullNote("base"));
  const need = w - floor;
  if (need > outside + 0.5) return fail(cfg, refuse);
  const at = side === "left" ? 0 : list.length;
  return withRevived(wall, at, outside - Math.max(0, need), (more) => withList(extendRun(c1, wall, side, Math.max(0, need) + more), wall, put(list, at)));
}

/**
 * The tall columns on `wall` that `after` places and `before` did not (growing a run can let a column that did not fit
 * stand again), `except` the list being edited: their width incl. cover panels (cm).
 */
function revivedTall(before: KitchenPlan, after: KitchenPlan, wall: WallId, except: ListId): { cm: number } {
  const placed = (p: KitchenPlan) => new Set(p.slots.filter((s) => s.zone === "tall" && s.run === wall && s.list).map((s) => s.list!.id));
  const was = placed(before);
  let cm = 0;
  for (const id of placed(after)) {
    if (id === except || was.has(id)) continue;
    cm += after.slots.filter((s) => s.list?.id === id).reduce((n, s) => n + s.width, 0) + 2 * DIM.panel;
  }
  return { cm };
}

// ---------------------------------------------------------------- room surfaces — KitchenConfig.room

/** the finish every wall and the floor show now (catalog.room ids) */
export function roomFinishes(input: KitchenConfig): { walls: Record<WallId, string>; floor: string } {
  const cfg = sanitizeConfig(input);
  const all = cfg.room?.wall ?? FINISH_DEFAULTS.wall;
  return {
    walls: { a: cfg.room?.walls?.a ?? all, b: cfg.room?.walls?.b ?? all, c: cfg.room?.walls?.c ?? all },
    floor: cfg.room?.floor ?? FINISH_DEFAULTS.floor,
  };
}

/**
 * The room's look (StudioEngineOptions.onSurfaceClick: a click on a wall or the floor): `wall` + `finish` paints one wall
 * ("a" | "b" | "c") or every wall ("all", which also clears the single-wall ones); `floor` sets the floor. null = back
 * to the default (the dark studio). Not part of the kitchen or its price. Refused for an unknown finish id.
 */
export function setRoomFinish(input: KitchenConfig, patch: { wall?: WallId | "all"; finish?: string | null; floor?: string | null }): EditResult {
  const cfg = sanitizeConfig(input);
  const room: RoomSpec = { ...(cfg.room ?? {}), ...(cfg.room?.walls ? { walls: { ...cfg.room.walls } } : {}) };
  if (patch.finish !== undefined) {
    if (patch.finish !== null && !roomWallDef(patch.finish)) return fail(cfg, "Nepoznata obrada zida.");
    const w = patch.wall ?? "all";
    if (w === "all") {
      if (patch.finish === null) delete room.wall;
      else room.wall = patch.finish;
      delete room.walls;
    } else {
      const ws = { ...(room.walls ?? {}) };
      if (patch.finish === null) delete ws[w];
      else ws[w] = patch.finish;
      room.walls = ws;
    }
  }
  if (patch.floor !== undefined) {
    if (patch.floor !== null && !roomFloorDef(patch.floor)) return fail(cfg, "Nepoznat pod.");
    if (patch.floor === null) delete room.floor;
    else room.floor = patch.floor;
  }
  return { cfg: sanitizeConfig({ ...cfg, room }), ok: true, warning: null, slotId: null };
}
