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
 *   inserts next to an element (insertBefore / insertAfter, previewed by insertOptions — insertWays): into the free
 *                             room; next to the last element before a free end of the run, as that end's "+" does it
 *                             (the run grows — "Kuhinja na zidu B duža je za 60 cm."); in a full run the element beside
 *                             it gets narrower to make room ("… sada je 50 cm umjesto 90 cm.") — never a corner unit,
 *                             the hood above the hob or a tall unit
 *   blind corners:            fixed width, only their type changes
 *   tall column:              1 to MAX_TALL units of any mix of widths (e.g. 30 larder + 96 side-by-side fridge niche
 *                             + 60 oven); its width moves the base run next to it, and it may grow as long as the
 *                             planner keeps it on its wall without leaving cabinets out (plan.ts tallCapacity). A unit
 *                             added to a column at a free end with bare wall beyond it grows the run into that wall
 *                             first (insertGrowColumn: the base cabinets keep their room)
 *   walls / island:           setWallLength (the dimension labels in 3D), clamped like sanitizeConfig — the room's wall,
 *                             a kitchen along the whole wall follows it (as every older kitchen)
 *   room vs kitchen:          setRoomWall (the room's wall only, the kitchen keeps its length), setKitchenExtent (where
 *                             the kitchen stands on a wall: length / offset / anchor), kitchenExtent (what the controls offer)
 *   tall columns anywhere:    moveTall (another free run end), tallPlaces; new columns come from insertAtGap
 *   tall units in a run:      changeType(cfg, slot, tallType) on a base cabinet or a wall unit of a wall run puts a tall
 *                             unit in its place (CabinetSpec.tall in the wall's base list): the base cabinet below and the
 *                             wall units above that overlap it go ("Gornji i donji element zamijenjeni visokim
 *                             elementom."), the room it needs comes from the run's free cm, empty space beside it, the
 *                             bare wall beyond a free end of the run (the run grows: "Kuhinja na zidu B duža je za 47 cm.")
 *                             and only then from a neighbour that gets narrower (one or both); a sink / hob / dishwasher
 *                             that goes is named; EditResult.uppersGone counts the wall units that went; insertBefore / insertAfter / insertOptions with
 *                             zone "tall" and the "+" between cabinets (insertAtGap, gapOptions.tall) put one between
 *                             cabinets; SlotEditInfo.tall / insertAfterTall / insertBeforeTall preview it. The "+" beyond a
 *                             column at a run's end puts a base cabinet there — beyond it (the column joins the run).
 *                             Never on the island, under the window or in a corner square
 *   "+" places:               gapOptions / insertAtGap on plan.ts planGaps (ViewInfo.gaps): empty space, the free end of
 *                             a run (bare floor, the bare wall beyond the kitchen it grows into — the note says how much
 *                             longer it got), bare wall in the wall-unit row (beside the window, between wall units, over
 *                             bare floor and beyond the kitchen at a free end of the row), the ends of the island, and on
 *                             every full row one "+" between its elements (insertSeam: the row makes room, several
 *                             elements narrower when one is not enough — or, where nothing can, it replaces an element:
 *                             PlanGap.replace). planGaps lists only places where something fits (gapHasOption, registered
 *                             with plan.ts registerGapCheck). An insert that leaves a sliver of bare floor at a free end
 *                             absorbs it there (keepSliver): the cabinets never slide by it
 *   tall columns as elements: removeColumn ("Ukloni stup") takes a whole column away; with the "+" that starts one the
 *                             studio needs no "Visoki stup" switch (KitchenConfig.tall is legacy as a switch)
 *   room surfaces:            setRoomFinish / roomFinishes (StudioEngineOptions.onSurfaceClick)
 *   ceiling:                  raiseCeilingFor ("Podigni strop na X cm"; heightChoices().tallTop.maxReason says the limit)
 *   island / peninsula:       setIsland (any KitchenConfig.islandSpec field) and its shorthands setIslandFunctions (hob /
 *                             sink on it — moved off the walls), setSeating, setBar, setIslandHood, setPeninsula;
 *                             islandChoices lists what the controls can offer
 *   hoods:                    setHood / hoodChoices (KitchenConfig.hood: hidden / chimney / angled glass / downdraft, the
 *                             finish, the island's canopy or ceiling cassette); a hob's own: setElementOptions { hood }
 *   element options:          setElementOptions / elementOptions (CabinetSpec.opt: opening style, glass, top-box depth, a
 *                             hob's hood, shelf rows / LED) — kept through changeType / changeWidth where they still apply
 *   glass, worktop, wall:     setGlass / glassChoices (KitchenConfig.glass), setWorktop / worktopChoices (thickness),
 *                             setBacksplash / backsplashChoices, setRail / railChoices, setWallShelves (floating shelves
 *                             over a whole wall); the top row's depth: setHeights { topDepth } / heightChoices().topDepth
 *
 * Planning is ~0.15 ms. slotEditInfo / allowedWidths / insertOptions check every option by planning it, but skip
 * widths that cannot fit (wider than the free room next to the element) and probe each width only once for inserts.
 */

import {
  FINISH_DEFAULTS,
  backsplashDef,
  catalog,
  cornerFoot,
  cornerTypes,
  moduleDef,
  moduleTypes,
  roomFloorDef,
  roomWallDef,
  widthAllowed,
  type ModuleGroup,
  type ModuleTypeDef,
} from "./catalog";
import {
  SHELF_ROWS,
  STANDARD_HEIGHTS,
  TOP_DEPTHS,
  backsplashOfCfg,
  cleanOpts,
  glassOf,
  hoodFinishOf,
  hoodKindOf,
  openingOf,
  shelvesOf,
  topDepthOf,
  worktopThickness,
} from "./plan";
import {
  FREE_MIN,
  GAP_LABEL,
  GAP_MIN,
  HOB_BESIDE_TALL,
  MAX_LIST,
  MAX_TALL,
  copyEntry,
  defaultAnchor,
  defaultCornerType,
  isFillerEntry,
  isTallList,
  islandMax,
  kitchenRange,
  limitsFor,
  listOf,
  listZone,
  materializeLists,
  minRun,
  outsideAt,
  parseRunEnd,
  planGaps,
  planKitchen,
  plannerFeaturesLost,
  registerGapCheck,
  runEnd,
  SEAM_MIN,
  sanitizeConfig,
  seamDef,
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
  BacksplashKind,
  BarSpec,
  BaseRunId,
  CabinetSpec,
  DimTarget,
  ElementOpts,
  GlassFrame,
  GlassSpec,
  GlassType,
  HandleStyle,
  HeightSpec,
  HoodFinish,
  HoodKind,
  HoodSpec,
  IslandFunctions,
  IslandHoodStyle,
  IslandSpec,
  KitchenConfig,
  KitchenExtent,
  RoomSpec,
  RunEnd,
  SeatSide,
  WallId,
} from "./types";

/** the worktop height of every older link (cm) */
const STANDARD_WORKTOP = STANDARD_HEIGHTS.worktop;

export interface EditResult {
  /** the new config (sanitized); the unchanged input when `ok` is false */
  cfg: KitchenConfig;
  ok: boolean;
  /** Croatian note for the customer: why the edit was refused, or what it caused (e.g. "no sink now") */
  warning: string | null;
  /** id of the edited / inserted element in the new plan (follow the selection with it); null when removed */
  slotId: string | null;
  /**
   * a tall unit put into a wall's base run (changeType to a tall type, a tall insert between cabinets): the wall units
   * (real ones, not empty space) that no longer hang there — the replaced wall unit included. What the notes count; the
   * studio asks before a swap that takes more than the chosen element. Absent for every other edit.
   */
  uppersGone?: number;
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
  /**
   * tall units this element can be replaced with (changeType with zone "tall": the base cabinet below and the wall units
   * above that overlap it go) — base cabinets and wall units of a wall run; empty elsewhere. `width` null = no room.
   */
  tall: TypeChoice[];
  /** tall units that can stand right after / before this base cabinet in its run (insertAfter / insertBefore, zone "tall") */
  insertAfterTall: TypeChoice[];
  insertBeforeTall: TypeChoice[];
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

/**
 * commit without a selected element (gaps, extents): `failSlot` is what a refusal hands back as slotId; `gone` = tall
 * columns (their lists) the edit takes away on purpose (a column that becomes part of the base run)
 */
function commitPlan(
  cfg0: KitchenConfig,
  plan0: KitchenPlan,
  failSlot: string | null,
  next: KitchenConfig,
  id: ListId,
  focus: number | null,
  refuse: string,
  gone: ListId[] = [],
): EditResult {
  const before = { cfg: cfg0, plan: plan0 };
  const cfg = sanitizeConfig(next);
  const plan = planKitchen(cfg);
  const l = planList(plan, id);
  // a hood element above a hob that has a visible wall hood / a downdraft extractor (KitchenConfig.hood, its opt.hood):
  // the planner leaves it out — say why instead of letting the element vanish
  if (listZone(id) === "upper") {
    const isHood = (t: string) => Boolean(moduleDef("upper", t)?.hood);
    const want = (listOf(cfg, id) ?? []).filter((e) => isHood(e.type)).length;
    const have = plan.slots.filter((s) => s.list?.id === id && isHood(s.type)).length;
    if (want > have) return fail(before.cfg, "Ploča ispod ima vidljivu napu ili napu u ploči — element za ugradbenu napu tu nije potreban.", failSlot);
  }
  // a tall column must not vanish because of an edit (removing its last unit is not done through here); the tall units
  // standing in base runs are entries of those lists (a left-out one counts in cutCount)
  const columns = (p: KitchenPlan) => new Set(p.slots.filter((s) => s.zone === "tall" && s.list && isTallList(s.list.id)).map((s) => s.list!.id));
  const c0 = columns(before.plan);
  const c1 = columns(plan);
  const lost = [...c0].filter((x) => !c1.has(x) && !gone.includes(x)).length;
  const came = [...c1].filter((x) => !c0.has(x)).length;
  // an edited tall column must still stand somewhere (the planner leaves a column out that does not fit)
  const lostColumn = isTallList(id) && !plan.slots.some((s) => s.list?.id === id);
  // nor may it push the planner's own sink / hob / dishwasher out of a run the planner fills (a wider column on its wall)
  if ((l && l.dropped.length) || lostColumn || lost > came || cutCount(plan) > cutCount(before.plan) || plannerFeaturesLost(before.plan, plan)) {
    return fail(before.cfg, refuse, failSlot);
  }
  const slotId = focus === null ? null : (plan.slots.find((s) => s.list?.id === id && s.list.index === placedIndex(listOf(cfg, id), l, focus))?.id ?? null);
  // what the edit took away
  const e0 = essentialsOf(before.plan);
  const e1 = essentialsOf(plan);
  const notes: string[] = [];
  if (e0.sink && !e1.sink) notes.push("Kuhinja sada nema sudopera.");
  if (e0.hob && !e1.hob) notes.push("Kuhinja sada nema ploče za kuhanje.");
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId };
}

/**
 * where entry `i` of a stored list stands in the plan's entries (PlanList.entries — slot list indices): the same unless a
 * filler strip before it gave way completely (a filler strip is soft: the planner shrinks it, down to nothing, before it
 * leaves anything out)
 */
function placedIndex(list: CabinetSpec[] | undefined, l: PlanList | undefined, i: number): number {
  if (!list || !l) return i;
  let j = 0;
  for (let k = 0; k < i && k < list.length; k++) {
    if (isFillerEntry(list[k]) && !isFillerEntry(l.entries[j])) continue;
    j++;
  }
  return j;
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

/**
 * An end unit (catalog endUnit: rounded / angled shelves, thick side panels …) wants the end of its row: when nothing but
 * empty space follows it in the list (or only empty space comes before it), that empty space moves to its inner side —
 * a 60 cm wall unit at the end of the row changed into 40 cm rounded shelves stays at the end of the row, the 20 cm it
 * gave up become bare wall between it and its neighbour (else they stood between it and the end, and the shelves were
 * drawn straight, mid-row). Keeps entry objects.
 */
function endUnitOut(list: CabinetSpec[], el: CabinetSpec, zone: ListZone): void {
  const i = list.indexOf(el);
  if (i < 0 || !SPACER[zone]) return;
  const spacers = (part: CabinetSpec[]) => part.length > 0 && part.every((e) => isSpacer(zone, e.type) && !e.tall);
  const after = list.slice(i + 1);
  const before = list.slice(0, i);
  if (spacers(after) && !spacers(before)) {
    const room = after.reduce((s, e) => s + e.width, 0);
    list.splice(i + 1);
    list.splice(i, 0, { type: SPACER[zone], width: room });
  } else if (spacers(before) && !spacers(after)) {
    const room = before.reduce((s, e) => s + e.width, 0);
    list.splice(0, i);
    list.splice(1, 0, { type: SPACER[zone], width: room });
  }
}

/** a wider element takes the extra from empty space right after it, else right before it */
function growInto(list: CabinetSpec[], index: number, extra: number, zone: ListZone): void {
  const after = list[index + 1];
  const before = list[index - 1];
  if (after && isSpacer(zone, after.type) && after.width >= extra) after.width -= extra;
  else if (before && isSpacer(zone, before.type) && before.width >= extra) before.width -= extra;
}

/**
 * a list entry of a slot that is not a corner: its list, its place in it, the list's zone and the entry's own zone
 * (`ez`: "tall" for a tall unit standing in a wall's base run — CabinetSpec.tall —, else the list's zone)
 */
function listSlot(ctx: Ctx): { id: ListId; index: number; zone: ListZone; ez: ListZone } | null {
  const l = ctx.slot.list;
  if (!l) return null;
  const zone = listZone(l.id);
  return { id: l.id, index: l.index, zone, ez: ctx.slot.zone === "tall" ? "tall" : zone };
}

/** a tall unit standing in a wall's base run (zone "tall", its list the wall's base list) */
const inRunTall = (s: PlanSlot) => s.zone === "tall" && Boolean(s.list) && listZone(s.list!.id) === "base";

/** an entry of a list zone (`ez` "tall" in a base list: a tall unit standing in the run, CabinetSpec.tall) */
const entryOf = (zone: ListZone, ez: ListZone, type: string, width: number): CabinetSpec =>
  zone === "base" && ez === "tall" ? { type, width, tall: true } : { type, width };

/**
 * cm a wall's base list takes along its run: its entries, and a cover panel on each side of every tall column in it —
 * as plan.ts withTallPanels places them: columns with only filler strips between them are one column, and a column at an
 * end of the list shares the cover panel of a column standing at that end of the run (`share`, endColumns). The planner
 * decides the rest (a column at an open end needs no extra end panel).
 */
function footOf(list: CabinetSpec[], share: { left: boolean; right: boolean } = { left: false, right: false }): number {
  const beyond = (i: number, d: -1 | 1) => {
    let j = i + d;
    while (j >= 0 && j < list.length && isFillerEntry(list[j])) j += d;
    return list[j];
  };
  let n = 0;
  list.forEach((e, i) => {
    n += e.width;
    if (!e.tall) return;
    const prev = beyond(i, -1);
    const next = beyond(i, 1);
    if (!prev?.tall) n += !prev && share.left ? 0 : DIM.panel;
    if (!next?.tall) n += !next && share.right ? 0 : DIM.panel;
  });
  return n;
}

/** the ends of `wall`'s base run where a tall column stands at the run's end (its cover panel is shared: footOf) */
function endColumns(plan: KitchenPlan, wall: WallId): { left: boolean; right: boolean } {
  const r = plan.runs.find((x) => x.wall === wall);
  if (!r) return { left: false, right: false };
  const ends = r.talls.filter((t) => !r.runTalls.some((x) => Math.abs(x.from - t.from) < 0.5 && Math.abs(x.to - t.to) < 0.5));
  return { left: ends.some((t) => Math.abs(t.from - r.kitchen.from) < 0.5), right: ends.some((t) => Math.abs(t.to - r.kitchen.to) < 0.5) };
}

/** footOf `list` on `wall` as `plan` places that run (with the end columns it stands against) */
const runFoot = (plan: KitchenPlan, wall: WallId, list: CabinetSpec[]) => footOf(list, endColumns(plan, wall));

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

/**
 * Switch an element to another type (the width follows the type: same width when it comes in it, else the closest that
 * fits). A tall type (`zone` "tall", or a type only the tall zone has) on a base cabinet or a wall unit of a wall run
 * puts a tall unit in its place: the base cabinet below and the wall units above that overlap it go, the neighbours
 * re-flow (one of them narrower when it has to), a sink / hob / dishwasher that goes is named in `warning`
 * ("Gornji i donji element zamijenjeni visokim elementom."). A tall unit standing in a base run can become another tall
 * type or, with a base type, a base cabinet again.
 */
export function changeType(input: KitchenConfig, slotId: string, type: string, zone?: "tall"): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  return changeTypeIn(ctx, type, undefined, zone);
}

function changeTypeIn(ctx: Ctx, type: string, tallCap?: number, want?: "tall"): EditResult {
  const { slot } = ctx;
  if (slot.cornerId) {
    const zone = slot.zone === "upper" ? "upper" : "base";
    if (want === "tall" || (!moduleDef(zone, type) && moduleDef("tall", type))) return fail(ctx.cfg, "U kutu ne može stajati visoki element.", slot.id);
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
  // a tall unit in place of a base cabinet / a wall unit of a wall run
  const tallWanted = want === "tall" || (!defOf(ls.ez, type) && !defOf(ls.zone, type) && Boolean(moduleDef("tall", type)));
  if (tallWanted && ls.ez !== "tall") return replaceWithTall(ctx, type);
  // a tall unit standing in a base run: another tall type, or (a base type) a base cabinet again
  const ez: ListZone = inRunTall(slot) && !tallWanted && moduleDef("base", type) ? "base" : ls.ez;
  const def = defOf(ez, type);
  if (!def || def.corner || def.filler || (ez === "island" && !def.island)) return fail(ctx.cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
  if (type === slot.type && ez === ls.ez) return { cfg: ctx.cfg, ok: true, warning: null, slotId: slot.id };
  const { cfg, list } = editable(ctx, ls.id);
  const cur = list[ls.index];
  if (!cur) return fail(ctx.cfg, "Element više ne postoji.", slot.id);
  const fromSpacer = isSpacer(ls.zone, cur.type) && !cur.tall;
  // widths that cannot fit are not even planned (the tall column's room is only worked out when it is needed)
  const tries = widthsNear(def, cur.width, fromSpacer);
  const needRoom = tries.some((w) => w > cur.width);
  const room = needRoom ? roomAt(ctx, ls.id, list, ls.index, true, tallCap) : Infinity;
  let last: EditResult | null = null;
  for (const w of tries) {
    if (w > room) continue;
    const next = list.map((e) => ({ ...e }));
    const el: CabinetSpec = entryOf(ls.zone, ez, type, w);
    // the element's own options that still apply to the new type stay (its opening style, its glass …)
    const opt = cleanOpts(cur.opt, ez, type);
    if (opt) el.opt = opt;
    next[ls.index] = el;
    if (fromSpacer && cur.width - w >= 5) {
      // a cabinet into empty space: what it does not take stays empty
      next.splice(ls.index + 1, 0, { type: cur.type, width: cur.width - w });
    } else if (w < cur.width) keepRoom(next, ls.index, cur.width - w, ls.zone);
    else if (w > cur.width) growInto(next, ls.index, w - cur.width, ls.zone);
    if (def.endUnit) endUnitOut(next, el, ls.zone);
    const final = tidy(next, ls.zone, el);
    // the hood above the hob turned into a wall unit: it stays where the hood hung (keepHoodPlace)
    const kept = slot.anchored && ls.zone === "upper" && !def.hood ? keepHoodPlace(cfg, ls.id, final, el, slot.x) : final;
    if (kept !== final) {
      const r = commit(ctx, withList(cfg, ls.id, kept), ls.id, kept.indexOf(el), "");
      if (r.ok) return r;
    }
    last = commit(ctx, withList(cfg, ls.id, final), ls.id, final.indexOf(el), "");
    if (last.ok) return last;
  }
  const min = def.spacer ? def.minWidth : Math.min(...def.widths);
  if (ls.zone === "tall") return fail(ctx.cfg, `${def.name} (${min} cm) ovdje ne stane. ${tallNoRoom(ctx.cfg, ctx.plan, undefined, ls.id)}`, slot.id);
  return fail(ctx.cfg, `${def.name} (od ${min} cm) ovdje ne stane — slobodno je još ${Math.floor(freeOf(ctx.plan, ls.id))} cm.`, slot.id);
}

// ---------------------------------------------------------------- tall units standing in a base run (CabinetSpec.tall)

/** cm two run-local stretches share */
const overlapOf = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
const spanOf = (s: PlanSlot) => ({ from: s.x, to: s.x + s.width });
/** "1 gornji element", "2 gornja elementa", "5 gornjih elemenata" */
function uppersWord(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return `${n} gornji element`;
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? `${n} gornja elementa` : `${n} gornjih elemenata`;
}
/** "Gornji element iznad visokog elementa je uklonjen." / "Iznad visokog elementa uklonjena su 2 gornja elementa." */
function uppersGone(n: number, where: string): string {
  if (n === 1) return `Gornji element ${where} je uklonjen.`;
  const few = n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14);
  return `${where.charAt(0).toUpperCase()}${where.slice(1)} ${few ? "uklonjena su" : "uklonjeno je"} ${uppersWord(n)}.`;
}

/**
 * How far each element of `wall`'s base list moved from plan0 to p1 (cm, by plan0 slot id): the same elements in the same
 * order, less `skip` (the one an edit replaces or moves) in plan0 and the new ones in p1 — a neighbour that got narrower,
 * the run that grew into the bare wall push the elements beside a new tall unit along. Empty space, filler strips and
 * corner units are not matched. Empty when the two do not line up.
 *
 * With `src` (the edit says where each entry of the new base list came from: `src[k]` = its index in plan0's entries of
 * that list, -1 for a new one) the elements are paired by that identity — robust when neighbours share type and width
 * (two 60 cm "ormar" beside a new 60 cm one). Without it (or when the lists no longer line up: an entry left out, the
 * planner filling the run anew) they are paired by type: of the ways the two line up, the one where the elements
 * change width the least and then move the least wins (a first-come pairing judged the wall units by the new element and
 * kept one over it — the column was then left out).
 */
function baseShift(plan0: KitchenPlan, p1: KitchenPlan, wall: WallId, skip?: string, src?: number[]): Map<string, number> {
  const bySrc = src ? shiftBySource(plan0, p1, wall, src, skip) : null;
  if (bySrc) return bySrc;
  const seq = (p: KitchenPlan, without?: string) =>
    p.slots
      .filter((s) => s.run === wall && s.list?.id === wall && !s.corner && s.id !== without && !defOf(s.zone === "tall" ? "tall" : "base", s.type)?.spacer && !defOf("base", s.type)?.filler)
      .sort((a, b) => a.x - b.x);
  const o = seq(plan0, skip);
  const n = seq(p1);
  const spare = n.length - o.length;
  if (spare < 0) return new Map();
  const same = (a: PlanSlot, b: PlanSlot) => a.type === b.type && (a.zone === "tall") === (b.zone === "tall");
  // best[i][j]: the least cost of pairing o[i..] with n[j..] in order (the n elements left unpaired are the new ones)
  const cost = (a: PlanSlot, b: PlanSlot) => 1000 * Math.abs(a.width - b.width) + Math.abs(a.x - b.x);
  const best: number[][] = Array.from({ length: o.length + 1 }, () => new Array<number>(n.length + 1).fill(Infinity));
  for (let j = 0; j <= n.length; j++) best[o.length][j] = 0;
  for (let i = o.length - 1; i >= 0; i--) {
    for (let j = n.length - (o.length - i); j >= 0; j--) {
      const pair = same(o[i], n[j]) ? cost(o[i], n[j]) + best[i + 1][j + 1] : Infinity;
      // n[j] is a new element (while there are more n than o left)
      const pass = n.length - j > o.length - i ? best[i][j + 1] : Infinity;
      best[i][j] = Math.min(pair, pass);
    }
  }
  if (!Number.isFinite(best[0][0])) return new Map();
  const map = new Map<string, number>();
  for (let i = 0, j = 0; i < o.length; j++) {
    if (same(o[i], n[j]) && cost(o[i], n[j]) + best[i + 1][j + 1] === best[i][j]) {
      map.set(o[i].id, n[j].x - o[i].x);
      i++;
    }
  }
  return map;
}

/**
 * baseShift by identity: `src[k]` = where entry k of p1's stored base list of `wall` stood in plan0's entries (-1: new).
 * null when that cannot be trusted (p1 has no explicit list there, left entries out, or `src` does not match its length)
 * — baseShift then pairs by type. Empty space is paired too (a wall unit above it moves with it); filler strips have no
 * slot.
 */
function shiftBySource(plan0: KitchenPlan, p1: KitchenPlan, wall: WallId, src: number[], skip?: string): Map<string, number> | null {
  const stored = listOf(p1.cfg, wall);
  const l1 = planList(p1, wall);
  if (!stored || !l1 || l1.dropped.length || stored.length !== src.length) return null;
  const at0 = new Map<number, PlanSlot>();
  for (const s of plan0.slots) if (s.run === wall && s.list?.id === wall && !s.corner) at0.set(s.list.index, s);
  const at1 = new Map<number, PlanSlot>();
  for (const s of p1.slots) if (s.run === wall && s.list?.id === wall && !s.corner) at1.set(s.list.index, s);
  const map = new Map<string, number>();
  src.forEach((i0, k) => {
    if (i0 < 0) return;
    const a = at0.get(i0);
    if (!a || a.id === skip || isFillerEntry(stored[k])) return;
    const b = at1.get(placedIndex(stored, l1, k));
    if (b) map.set(a.id, b.x - a.x);
  });
  return map;
}

/** the identity `src` (baseShift) when `next` holds `wall`'s base list exactly as plan0 placed it; else undefined */
function sameList(plan0: KitchenPlan, next: KitchenConfig, wall: WallId): number[] | undefined {
  const a = planList(plan0, wall)?.entries;
  const b = listOf(next, wall);
  if (!a || !b || a.length !== b.length) return undefined;
  const same = a.every((e, i) => e.type === b[i].type && Math.abs(e.width - b[i].width) < 0.05 && Boolean(e.tall) === Boolean(b[i].tall));
  return same ? a.map((_, i) => i) : undefined;
}

/** `src` for a base list edited by an insert at `at` (baseShift): every old entry keeps its index, shifted past the new one */
const srcInsert = (n: number, at: number): number[] => [...Array.from({ length: at }, (_, i) => i), -1, ...Array.from({ length: n - at }, (_, i) => at + i)];

/**
 * The wall units of `wall` that would hang where a tall unit stands in `next`: out of an edited wall-unit list (the
 * planner's own wall units make way by themselves). Wall units that only graze the column (less than a third of their
 * width, at most 20 cm) are kept when the row can shift them aside; whatever the row then no longer fits goes too.
 * `force` = wall-unit slots (of plan0) that go anyway (the one a tall unit replaces); `skip` = the base slot of plan0 the
 * tall unit replaces (or the tall unit that moves) — a wall unit is judged where it hangs after the edit, above the base
 * cabinet it hung above (baseShift), so one above a cabinet that only moved aside stays. `src`: where each entry of the
 * new base list came from (baseShift; absent = the base list is unchanged, or paired by type when it changed). `gone` =
 * wall units that no longer hang there (empty space not counted).
 */
function clearAbove(plan0: KitchenPlan, next: KitchenConfig, wall: WallId, force: string[] = [], skip?: string, src?: number[]): { cfg: KitchenConfig; gone: number } {
  const upId = `${wall}:u` as ListId;
  const p1 = planKitchen(sanitizeConfig(next));
  const cols = p1.runs.find((r) => r.wall === wall)?.talls ?? [];
  const olds = plan0.slots.filter((s) => s.run === wall && s.zone === "upper" && !s.corner);
  const moved = baseShift(plan0, p1, wall, skip, src ?? sameList(plan0, next, wall));
  const run0 = plan0.runs.find((r) => r.wall === wall);
  const under = plan0.slots.filter((s) => s.run === wall && s.list?.id === wall && !s.corner).sort((a, b) => a.x - b.x);
  /** where a wall unit of plan0 hangs after the edit: moved along with the base element below its centre */
  const shiftOf = (s: PlanSlot) => {
    if (!moved.size || !under.length) return 0;
    const c = s.x + s.width / 2;
    const b = under.find((u) => u.x - 0.5 <= c && c <= u.x + u.width + 0.5);
    if (b) return moved.get(b.id) ?? 0;
    // beyond the base elements: over bare floor it moves with the nearest one, over a corner unit it stays
    if (c < under[0].x) return run0?.ends.left === "corner" ? 0 : (moved.get(under[0].id) ?? 0);
    const last = under[under.length - 1];
    if (c > last.x + last.width) return run0?.ends.right === "corner" ? 0 : (moved.get(last.id) ?? 0);
    const prev = [...under].reverse().find((u) => u.x + u.width <= c);
    return prev ? (moved.get(prev.id) ?? 0) : 0;
  };
  const hit = (s: PlanSlot) => {
    const d = shiftOf(s);
    const sp = { from: s.x + d, to: s.x + s.width + d };
    return cols.reduce((n, c) => n + overlapOf(c, sp), 0);
  };
  const real = (s: PlanSlot) => !isSpacer("upper", s.type);
  /** only grazes the column: a third of its width at most, and at most 20 cm (the row shifts it aside) */
  const grazes = (s: PlanSlot, h: number) => real(s) && h < Math.min(20, s.width / 3);
  if (!listOf(next, upId)) return { cfg: next, gone: olds.filter((s) => real(s) && (force.includes(s.id) || (hit(s) > 0.5 && !grazes(s, hit(s))))).length };
  const l0 = planList(plan0, upId);
  if (!l0) return { cfg: next, gone: 0 };
  const list = l0.entries.map(copyEntry);
  const attempt = (grace: boolean): { cfg: KitchenConfig; gone: number; cut: boolean } => {
    const gone = new Set<number>();
    for (const s of olds) {
      if (s.list?.id !== upId) continue;
      const h = hit(s);
      if (force.includes(s.id) || (h > 0.5 && !(grace && real(s) && h < Math.min(20, s.width / 3)))) gone.add(s.list.index);
    }
    let kept = list.filter((_, i) => !gone.has(i));
    let n = [...gone].filter((i) => !isSpacer("upper", list[i].type)).length;
    let cfg = withList(next, upId, kept);
    // what the row's flow no longer fits beside the column goes too (placed entries, in order, against the list)
    for (let k = 0; k < 3; k++) {
      const l = planList(planKitchen(sanitizeConfig(cfg)), upId);
      if (!l?.dropped.length) return { cfg, gone: n, cut: false };
      if (grace) return { cfg, gone: n, cut: true };
      const placed = l.entries;
      const keep: CabinetSpec[] = [];
      let j = 0;
      for (const e of kept) {
        if (j < placed.length && placed[j].type === e.type && Math.abs(placed[j].width - e.width) < 0.5) {
          keep.push(e);
          j++;
        } else if (!isSpacer("upper", e.type)) n++;
      }
      if (keep.length === kept.length) break;
      kept = keep;
      cfg = withList(next, upId, kept);
    }
    return { cfg, gone: n, cut: false };
  };
  // nothing hangs where the column stands — unless the row no longer fits beside it (a wall unit over the bare floor at
  // the run's end that the column grew towards): then what no longer fits goes, as below (else the edit was refused)
  const overflows = (planList(p1, upId)?.dropped.length ?? 0) > l0.dropped.length;
  if (!overflows && !olds.some((s) => force.includes(s.id) || hit(s) > 0.5)) return { cfg: next, gone: 0 };
  const a = attempt(true);
  return a.cut ? attempt(false) : a;
}

interface TallCommit {
  refuse: string;
  /** wall units (plan0 slot ids) that go anyway (the one a tall unit replaces) */
  force?: string[];
  /** the base entry the tall unit took the place of (its notes), or null for an insert */
  replaced?: CabinetSpec | null;
  /** its slot in plan0 (the wall units above it are judged where they hang after the edit: clearAbove) */
  replacedSlot?: string;
  /** the wall unit the tall unit replaces (changeType on a wall unit) */
  fromUpper?: boolean;
  /** list indices (in `next`) that may get narrower to make room, asked first — the neighbours by default */
  shrink?: number[];
  /** the run's other cabinets may get narrower too (after the `shrink` ones; as a seam "+" makes room for a cabinet) */
  wide?: boolean;
  /** where each entry of `next` came from (its index in plan0's entries of the wall, -1 = new): clearAbove / baseShift */
  src?: number[];
}

/**
 * The kitchen run on `wall` grown by `need` cm into the bare wall beyond its free ends (outsideAt), so that no cabinet has
 * to get narrower for a tall unit — the ways to try, in order: at the end nearer the unit (fewer cabinets move along),
 * at the other end, then partly at each. `before` / `after` = cm of the run's list on either side of the unit. Empty
 * when the bare wall is not enough.
 */
function growForTall(plan0: KitchenPlan, c1: KitchenConfig, wall: WallId, need: number, before: number, after: number): KitchenConfig[] {
  const run = plan0.runs.find((r) => r.wall === wall);
  if (!run || need <= 0.5) return [];
  const sides: ("left" | "right")[] = before <= after ? ["left", "right"] : ["right", "left"];
  const room = sides.map((sd) => Math.floor(outsideAt(plan0, run, sd) + 1e-6));
  const g = Math.ceil(need - 1e-6);
  const out: KitchenConfig[] = [];
  for (const i of [0, 1]) if (room[i] >= g) out.push(extendRun(c1, wall, sides[i], g));
  if (!out.length && room[0] + room[1] >= g) out.push(extendRun(extendRun(c1, wall, sides[0], room[0]), wall, sides[1], g - room[0]));
  return out;
}

/**
 * Commit a wall's base list `next` with a tall unit at `at` (its other entries as in `list0`, the materialized list in
 * `c1`): the room it needs comes from the run's free cm, then from empty space beside it, then from the bare wall beyond
 * a free end of the kitchen run (the run grows: growForTall), then from cabinets that get narrower — as a seam "+" makes
 * room (narrowings): one alone first (the neighbours, `o.shrink`, then with `o.wide` the run's other cabinets nearest
 * first; plain cabinets before the sink / hob / dishwasher, each as little as it can), else several; the wall units that
 * hang where it now stands go (clearAbove). The notes say what it replaced, what got narrower and what that took away.
 */
function commitTall(cfg0: KitchenConfig, plan0: KitchenPlan, failSlot: string | null, c1: KitchenConfig, wall: WallId, list0: CabinetSpec[], next0: CabinetSpec[], at: number, o: TallCommit): EditResult {
  let next = next0.map((e) => ({ ...e }));
  const el = next[at];
  const notes: string[] = [];
  let need = runFoot(plan0, wall, next) - runFoot(plan0, wall, list0) - freeOf(plan0, wall);
  // it fits into the run's free cm: a sliver of bare floor it leaves at a free end is absorbed there (a filler strip, or
  // the kitchen run ends at a column), so the cabinets do not slide (keepSliver)
  if (need <= 0.5) {
    const ks = keepSliver(plan0, c1, wall, next, runFoot(plan0, wall, next) - runFoot(plan0, wall, list0));
    const src = o.src && ks.filer !== null ? [...o.src.slice(0, ks.filer), -1, ...o.src.slice(ks.filer)] : o.src;
    const r = finishTall(cfg0, plan0, failSlot, ks.cfg, wall, ks.list, el, { ...o, src }, notes);
    if (r.ok || (ks.cfg === c1 && ks.list === next)) return r;
    return finishTall(cfg0, plan0, failSlot, c1, wall, next, el, o, notes);
  }
  {
    // empty space beside it gives way first
    for (const j of [at + 1, at - 1]) {
      const e = next[j];
      if (need <= 0.5 || !e || e.tall || !isSpacer("base", e.type)) continue;
      const take = Math.min(e.width, need);
      e.width -= take;
      need -= take;
    }
    const keep = next.map((e) => e === el || Boolean(e.tall) || !isSpacer("base", e.type) || e.width >= 5);
    next = next.filter((_, k) => keep[k]);
    if (o.src) o = { ...o, src: o.src.filter((_, k) => keep[k]) };
  }
  if (need > 0.5) {
    // bare wall beyond the kitchen: the run grows into it and every cabinet keeps its width
    const i = next.indexOf(el);
    const len = (c: KitchenConfig) => {
      const k = kitchenRange(sanitizeConfig(c), wall);
      return k.to - k.from;
    };
    for (const grown of growForTall(plan0, c1, wall, need, footOf(next.slice(0, i)), footOf(next.slice(i + 1)))) {
      const d = Math.round(len(grown) - len(cfg0));
      const r = finishTall(cfg0, plan0, failSlot, grown, wall, next, el, o, d > 0 ? [`Kuhinja na zidu ${wall.toUpperCase()} duža je za ${d} cm.`] : []);
      if (r.ok) return r;
    }
  }
  if (need > 0.5) {
    const idx = next.indexOf(el);
    const near = (o.shrink ?? [idx - 1, idx + 1]).filter((j) => j !== idx);
    /** an entry that may get narrower (never a tall unit, a corner unit, empty space or a filler strip), down to `floor` */
    const cand = (j: number, floor: number): (SeamCand & { d: ModuleTypeDef }) | null => {
      const e = next[j];
      const d = e && !e.tall && !isFillerEntry(e) ? seamDef("base", e.type) : null;
      const widths = d ? d.widths.filter((x) => x < e.width - 0.5 && x >= floor).sort((p, q) => q - p) : [];
      return d && widths.length ? { i: j, e, d, widths, feature: Boolean(d.feature) } : null;
    };
    // who gives way, in this order: the neighbours (plain cabinets before the sink / hob / dishwasher, the wider first),
    // then (`wide`) the run's other cabinets, nearest first, none below SEAM_MIN — a plain cabinet anywhere in the run
    // before the hob beside the unit, each as little as it can (a narrowed 80 cm hob left a 19 cm strip for 2 cm)
    const first = near
      .map((j) => cand(j, 0))
      .filter((c): c is NonNullable<typeof c> => Boolean(c))
      .sort((p, q) => Number(p.feature) - Number(q.feature) || q.e.width - p.e.width);
    const rest = o.wide
      ? next
          .map((_, j) => j)
          .filter((j) => j !== idx && !near.includes(j))
          .sort((p, q) => Math.abs(p - idx) - Math.abs(q - idx))
          .map((j) => cand(j, SEAM_MIN))
          .filter((c): c is NonNullable<typeof c> => Boolean(c))
      : [];
    const cands = [...first, ...rest];
    const name = (c: (typeof cands)[number]) => `${c.d.name.charAt(0).toLowerCase()}${c.d.name.slice(1)}`;
    let last: EditResult = fail(cfg0, o.refuse, failSlot);
    // (each way is planned: a few at most, the best first — a place the unit cannot stand at fails them all alike)
    for (const ways of narrowings(cands, need).slice(0, 4)) {
      const told = cands.filter((c) => ways.has(c.i)).sort((p, q) => p.i - q.i);
      const made =
        told.length === 1
          ? `Za visoki element napravljeno je mjesto: ${name(told[0])} sada je ${ways.get(told[0].i)} cm umjesto ${told[0].e.width} cm.`
          : `Za visoki element napravljeno je mjesto, uži su: ${told.map((c) => `${name(c)} ${ways.get(c.i)} cm umjesto ${c.e.width} cm`).join(", ")}.`;
      const narrowed = next.map((e, j) => (ways.has(j) ? { ...e, width: ways.get(j)! } : e));
      last = finishTall(cfg0, plan0, failSlot, c1, wall, narrowed, el, o, [...notes, made]);
      if (last.ok) return last;
    }
    return last;
  }
  return finishTall(cfg0, plan0, failSlot, c1, wall, next, el, o, notes);
}

/**
 * commitTall's last step: the base list `next` (with the tall unit `el`) into `c1`, the wall units over it cleared, the
 * plan checked, and the notes — what it replaced first, then `notes` (how room was made), then what that took away
 */
function finishTall(cfg0: KitchenConfig, plan0: KitchenPlan, failSlot: string | null, c1: KitchenConfig, wall: WallId, next: CabinetSpec[], el: CabinetSpec, o: TallCommit, made: string[]): EditResult {
  const notes = [...made];
  const cl = clearAbove(plan0, withList(c1, wall, next), wall, o.force ?? [], o.replacedSlot, o.src?.length === next.length ? o.src : undefined);
  const r = commitPlan(cfg0, plan0, failSlot, cl.cfg, wall, next.indexOf(el), o.refuse);
  if (!r.ok) {
    // the one reason worth naming: the planner keeps tall units out from under the window
    const under = planKitchen(sanitizeConfig(cl.cfg)).warnings.some((w) => /ispod prozora/.test(w) && !plan0.warnings.includes(w));
    return under ? fail(cfg0, "Ispod prozora ne može stajati visoki element.", failSlot) : r;
  }
  // what it replaced, and what went with it
  const rep = o.replaced ?? null;
  const repDef = rep ? defOf("base", rep.type) : undefined;
  const base = Boolean(rep && repDef && !repDef.spacer);
  const lead: string[] = [];
  /** wall units that went besides the one replaced (changeType on a wall unit) */
  const more = o.fromUpper ? cl.gone - 1 : cl.gone;
  if (o.fromUpper) lead.push(base ? "Gornji i donji element zamijenjeni visokim elementom." : "Gornji element zamijenjen visokim elementom.");
  else if (base) {
    lead.push(
      cl.gone === 0
        ? "Donji element zamijenjen visokim elementom."
        : cl.gone === 1
          ? "Gornji i donji element zamijenjeni visokim elementom."
          : `Donji element i ${uppersWord(cl.gone)} zamijenjeni su visokim elementom.`,
    );
  }
  if (more > 0 && (o.fromUpper || !base)) lead.push(uppersGone(more, "iznad visokog elementa"));
  notes.unshift(...lead);
  const f = repDef?.feature;
  if (rep && f) {
    notes.push(f === "sink" ? `${repDef!.name} (${rep.width} cm) je uklonjen — dodajte ga na drugo mjesto.` : `${repDef!.name} (${rep.width} cm) je uklonjena — dodajte je na drugo mjesto.`);
  }
  const hobNote = `${`Zid ${wall.toUpperCase()}`}: ${HOB_BESIDE_TALL}`;
  if (!plan0.warnings.includes(hobNote) && planKitchen(r.cfg).warnings.includes(hobNote)) notes.push(HOB_BESIDE_TALL.charAt(0).toUpperCase() + HOB_BESIDE_TALL.slice(1));
  if (r.warning) notes.push(r.warning);
  return { ...r, warning: notes.length ? notes.join(" ") : null, uppersGone: cl.gone };
}

/**
 * A tall unit in the place of a base cabinet (or empty space) of a wall run: the widths nearest to the cabinet's own
 * without the column's cover panels first (`widths` overrides), the rest of empty space stays empty beside it.
 */
function tallForBase(cfg0: KitchenConfig, plan0: KitchenPlan, base: PlanSlot, def: ModuleTypeDef, o: { force?: string[]; fromUpper?: boolean; widths?: number[] }): EditResult {
  const wall = base.run as WallId;
  const refuse = `${def.name} ovdje ne stane — slobodno je još ${Math.floor(freeOf(plan0, wall))} cm, a nijedan element u nizu ne može biti dovoljno uži.`;
  if (!base.list || listZone(base.list.id) !== "base") return fail(cfg0, "Ovdje ne može stajati visoki element.", base.id);
  const { cfg: c1, list } = editableIn(cfg0, plan0, wall);
  const i = base.list.index;
  const cur = list[i];
  if (!cur) return fail(cfg0, "Element više ne postoji.", base.id);
  const spacer = !cur.tall && isSpacer("base", cur.type);
  const tries = o.widths ?? widthsNear(def, Math.max(def.minWidth, cur.width - 2 * DIM.panel), spacer);
  let last: EditResult = fail(cfg0, refuse, base.id);
  for (const w of tries) {
    if (!widthAllowed(def, w)) continue;
    const el: CabinetSpec = { type: def.id, width: w, tall: true };
    const next = list.map(copyEntry);
    next[i] = el;
    // (baseShift: every other entry is the one that stood there)
    const src = list.map((_, k) => (k === i ? -1 : k));
    // what the column does not take of the cabinet's place stays free beside it ("Slobodno mjesto", with its own "+"),
    // so the other cabinets stay where they are; a sliver no element fits in closes up instead
    const rest = cur.width - (runFoot(plan0, wall, next) - runFoot(plan0, wall, list) + cur.width);
    if (rest >= (spacer ? 5 : GAP_MIN)) {
      next.splice(i + 1, 0, { type: spacer ? cur.type : SPACER.base, width: rest });
      src.splice(i + 1, 0, -1);
    }
    last = commitTall(cfg0, plan0, base.id, c1, wall, list, next, i, { refuse, force: o.force, replaced: cur, replacedSlot: base.id, fromUpper: o.fromUpper, src, wide: true });
    if (last.ok) return last;
  }
  return last;
}

/** changeType to a tall type on a base cabinet / a wall unit of a wall run (see changeType) */
function replaceWithTall(ctx: Ctx, type: string): EditResult {
  const { slot, plan, cfg } = ctx;
  const def = moduleDef("tall", type);
  if (!def) return fail(cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
  if (slot.run === "isl") return fail(cfg, "Na otoku ne može stajati visoki element.", slot.id);
  const wall = slot.run as WallId;
  if (slot.zone === "base") return tallForBase(cfg, plan, slot, def, {});
  if (slot.zone !== "upper") return fail(cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
  // a wall unit: the base cabinet below it (the one it overlaps most) gives its place, the wall unit goes
  const under = plan.slots
    .filter((s) => s.run === wall && s.zone === "base" && overlapOf(spanOf(s), spanOf(slot)) > 0.5)
    .sort((p, q) => overlapOf(spanOf(q), spanOf(slot)) - overlapOf(spanOf(p), spanOf(slot)));
  // never the corner unit (the corner square stays free of tall units)
  const below = under.find((s) => !s.cornerId);
  if (!below && under.length) return fail(cfg, "Ispod ovog gornjeg elementa je kutni element — u kutu ne može stajati visoki element.", slot.id);
  if (below) {
    const r = tallForBase(cfg, plan, below, def, { force: [slot.id], fromUpper: true });
    return r.ok ? r : { ...r, slotId: slot.id };
  }
  // over bare floor at a free end of the run: a new column there, beside the cabinets (the wall unit goes)
  const run = plan.runs.find((r) => r.wall === wall);
  const fl = run?.free.find((f) => overlapOf(f, spanOf(slot)) > 0.5);
  const gap = fl ? planGaps(plan).find((g) => g.kind === "end" && g.run === wall && g.side === fl.side) : undefined;
  if (!gap) return fail(cfg, "Ispod ovog gornjeg elementa nema mjesta za visoki element.", slot.id);
  let last: EditResult = fail(cfg, `${def.name} ovdje ne stane.`, slot.id);
  for (const w of widthsNear(def, Math.max(def.minWidth, slot.width - 2 * DIM.panel))) {
    last = insertGapIn(cfg, plan, gap, def.id, w, "tall", { force: [slot.id] });
    if (last.ok) {
      const note = "Gornji element zamijenjen visokim elementom.";
      return { ...last, warning: last.warning ? `${note} ${last.warning}` : note };
    }
  }
  return { ...last, slotId: slot.id };
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
  let def = defOf(ls.ez, slot.type);
  if (!def) return fail(ctx.cfg, "Nepoznat element.", slot.id);
  if (!widthAllowed(def, w)) {
    const sib = def.sibling ? defOf(ls.ez, def.sibling) : undefined;
    if (sib && widthAllowed(sib, w) && (ls.zone !== "island" || sib.island)) def = sib;
    else return fail(ctx.cfg, `${def.name} dolazi u širinama: ${def.widths.join(", ")} cm.`, slot.id);
  }
  if (w === slot.width && def.id === slot.type) return { cfg: ctx.cfg, ok: true, warning: null, slotId: slot.id };
  const { cfg, list } = editable(ctx, ls.id);
  const cur = list[ls.index];
  if (!cur) return fail(ctx.cfg, "Element više ne postoji.", slot.id);
  if (w > cur.width && w > roomAt(ctx, ls.id, list, ls.index, true, tallCap)) return fail(ctx.cfg, noRoomIn(ctx, ls.id, w), slot.id);
  const next = list.map((e) => ({ ...e }));
  const el: CabinetSpec = entryOf(ls.zone, ls.ez, def.id, w);
  // a width change keeps the element's own options (its glass, opening style …)
  const opt = cleanOpts(cur.opt, ls.ez, def.id);
  if (opt) el.opt = opt;
  next[ls.index] = el;
  if (w < cur.width) keepRoom(next, ls.index, cur.width - w, ls.zone);
  else if (w > cur.width) growInto(next, ls.index, w - cur.width, ls.zone);
  if (def.endUnit) endUnitOut(next, el, ls.zone);
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

/**
 * A full run: the element an insert goes next to (the selected one) makes room by getting narrower — the widest of its
 * widths that leaves `need` cm more. Base, wall-unit and island lists only; never a corner unit, a hood that follows
 * the hob, empty space or the tall column. null = it cannot.
 */
function shrinkFor(ctx: Ctx, id: ListId, list: CabinetSpec[], need: number): { index: number; width: number; from: number; name: string } | null {
  const ls = listSlot(ctx);
  const zone = listZone(id);
  if (!ls || ls.id !== id || zone === "tall" || ctx.slot.corner || ctx.slot.anchored) return null;
  const e = list[ls.index];
  const def = e ? defOf(zone, e.type) : undefined;
  if (!e || !def || def.spacer || def.corner || def.hood) return null;
  const w = def.widths.filter((x) => x < e.width - 0.5 && e.width - x >= need - 0.5).sort((a, b) => b - a)[0];
  return w === undefined ? null : { index: ls.index, width: w, from: e.width, name: def.name };
}

/**
 * Next to the first / last element of a run whose free end has room beyond it (bare floor, bare wall the kitchen can
 * grow into, the island's own end): that end's "+" (planGaps) — so "+ lijevo / + desno" there grow the run like the
 * "+" does instead of squeezing the element. null elsewhere.
 */
function endGapFor(ctx: Ctx, id: ListId, at: number, length: number): PlanGap | null {
  if ((at !== 0 && at !== length) || listZone(id) === "tall") return null;
  const side = at === 0 ? "left" : "right";
  return planGaps(ctx.plan).find((g) => g.list === id && g.side === side && (g.kind === "end" || g.kind === "island" || g.kind === "upper")) ?? null;
}

/**
 * An insert of `el` at `at` of list `id` (prepared by `editable`), every way there is, in this order: into the free room
 * (`room`, roomAt); at a free end of the run, as its "+" does it (growing the run); with the element beside it narrower
 * (a full run). insertOptions previews exactly this.
 */
function insertWays(ctx: Ctx, cfg: KitchenConfig, list: CabinetSpec[], id: ListId, at: number, room: number, el: CabinetSpec): EditResult {
  if (el.tall) return insertTallWays(ctx, cfg, list, id, at, el);
  if (listZone(id) === "tall") {
    const g = insertGrowColumn(ctx, cfg, list, id, at, el);
    if (g?.ok) return g;
  }
  if (el.width <= room) return insertAt(ctx, cfg, list, id, at, el);
  const eg = endGapFor(ctx, id, at, list.length);
  if (eg) {
    const r = insertGapIn(ctx.cfg, ctx.plan, eg, el.type, el.width, listZone(id), { beside: true });
    if (r.ok) return grewNote(ctx.cfg, r, eg);
  }
  const sh = shrinkFor(ctx, id, list, el.width - room + 0.5);
  return sh ? insertShrunk(ctx, cfg, list, id, at, el, sh) : fail(ctx.cfg, "", ctx.slot.id);
}

/**
 * An insert into a tall column standing at a free end of a wall run with bare wall beyond it (its end "+", planGaps): the
 * run grows into that bare wall by the unit's width (as far as the wall goes), so the base cabinets keep their room —
 * the column only takes from the run what the wall does not give. The base list is made explicit (the cabinets stay as
 * they are) and wall units over the bare floor there make way. null when there is no bare wall beyond the column.
 */
function insertGrowColumn(ctx: Ctx, cfg: KitchenConfig, list: CabinetSpec[], id: ListId, at: number, el: CabinetSpec): EditResult | null {
  const gap = planGaps(ctx.plan).find((g) => g.kind === "end" && g.tallList === id);
  if (!gap || gap.run === "isl" || !((gap.outside ?? 0) > 0.5) || list.length >= MAX_TALL) return null;
  const wall = gap.run as WallId;
  const side = gap.side ?? "right";
  const grown = Math.min(el.width, Math.floor(gap.outside ?? 0));
  const c1 = editableIn(cfg, ctx.plan, wall).cfg;
  const placed = [...list.slice(0, at).map(copyEntry), el, ...list.slice(at).map(copyEntry)];
  const cl = clearAbove(ctx.plan, withList(extendRun(c1, wall, side, grown), id, placed), wall);
  const r = commitPlan(ctx.cfg, ctx.plan, ctx.slot.id, cl.cfg, id, at, "");
  if (!r.ok) return r;
  const out = grewNote(ctx.cfg, r, gap);
  if (cl.gone <= 0) return out;
  const note = uppersGone(cl.gone, "iznad visokog elementa");
  return { ...out, warning: out.warning ? `${out.warning} ${note}` : note };
}

/**
 * insertWays for a tall unit into a wall's base list (it stands in the run, CabinetSpec.tall): into the free room; at a
 * free end of the run as that end's "+" does it (beside the element: a column standing there takes it on its inner
 * side); else the row makes room exactly as the "+" between the two elements does (insertTallGap: the two beside it
 * first — the element it goes next to is one of them — then the run's other cabinets). The wall units above it go
 * (commitTall).
 */
function insertTallWays(ctx: Ctx, cfg: KitchenConfig, list: CabinetSpec[], id: ListId, at: number, el: CabinetSpec): EditResult {
  const next = [...list.slice(0, at).map(copyEntry), el, ...list.slice(at).map(copyEntry)];
  if (runFoot(ctx.plan, id as WallId, next) - runFoot(ctx.plan, id as WallId, list) > freeOf(ctx.plan, id) + 0.5) {
    const eg = endGapFor(ctx, id, at, list.length);
    if (eg && eg.kind === "end") {
      const r = insertGapIn(ctx.cfg, ctx.plan, eg, el.type, el.width, "tall", { beside: true });
      if (r.ok) return grewNote(ctx.cfg, r, eg);
    }
  }
  // the row makes room as the "+" between the two does it (insertTallGap): the two beside the new unit first — the selected
  // element is one of them — then the run's other cabinets
  return commitTall(ctx.cfg, ctx.plan, ctx.slot.id, cfg, id as WallId, list, next, at, { refuse: "", shrink: [at - 1, at + 1], wide: true, src: srcInsert(list.length, at) });
}

/** an insert at a run's free end that made the kitchen run (or the island) longer says so (once) */
function grewNote(cfg0: KitchenConfig, r: EditResult, gap: PlanGap): EditResult {
  if (!r.ok) return r;
  let note: string | null = null;
  if (gap.run === "isl") {
    const d = Math.round(r.cfg.island - cfg0.island);
    if (d > 0) note = `${isPeninsula(cfg0.layout) ? "Poluotok" : "Otok"} je duži za ${d} cm.`;
  } else {
    const len = (c: KitchenConfig) => {
      const k = kitchenRange(c, gap.run as WallId);
      return k.to - k.from;
    };
    const d = Math.round(len(r.cfg) - len(cfg0));
    if (d > 0) note = `Kuhinja na zidu ${gap.run.toUpperCase()} duža je za ${d} cm.`;
  }
  if (!note || r.warning?.includes(note)) return r;
  return { ...r, warning: r.warning ? `${note} ${r.warning}` : note };
}

/** insertAt with the element beside the spot made narrower first (shrinkFor), saying so */
function insertShrunk(ctx: Ctx, cfg: KitchenConfig, list: CabinetSpec[], id: ListId, at: number, el: CabinetSpec, sh: NonNullable<ReturnType<typeof shrinkFor>>): EditResult {
  const next = list.map((e, i) => (i === sh.index ? { ...e, width: sh.width } : { ...e }));
  const r = insertAt(ctx, cfg, next, id, at, el);
  if (!r.ok) return r;
  const note = `Za novi element napravljeno je mjesto: ${sh.name.charAt(0).toLowerCase()}${sh.name.slice(1)} sada je ${sh.width} cm umjesto ${sh.from} cm.`;
  return { ...r, warning: r.warning ? `${note} ${r.warning}` : note };
}

/**
 * the zone of an entry inserted into list `id` (`ez` "tall" in a wall's base list: a tall unit standing in the run —
 * asked for with `want`, or a type only the tall zone has), null when it cannot go there
 */
function insertZone(id: ListId, type: string, want?: "tall"): ListZone | null {
  const zone = listZone(id);
  if (zone === "base" && (want === "tall" || (!defOf("base", type) && moduleDef("tall", type)))) return "tall";
  if (want === "tall" && zone !== "tall") return null;
  return zone;
}

function insert(input: KitchenConfig, slotId: string, type: string, width: number | undefined, after: boolean, want?: "tall"): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot } = ctx;
  const t = insertTarget(ctx, after);
  if (typeof t === "string") return fail(ctx.cfg, t, slot.id);
  const { id, at } = t;
  const zone = listZone(id);
  const ez = insertZone(id, type, want);
  if (!ez) return fail(ctx.cfg, "Visoki element ovdje ne može stajati.", slot.id);
  const def = defOf(ez, type);
  if (!def || def.corner || def.filler || (zone === "island" && !def.island)) return fail(ctx.cfg, "Ta izvedba ne može stajati na ovom mjestu.", slot.id);
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
    last = insertWays(ctx, cfg, list, id, at, room, entryOf(zone, ez, type, w));
    if (last.ok) return last;
    last = fail(
      ctx.cfg,
      zone === "tall" ? noRoomIn(ctx, id, w) : last.warning || `Za novi element (${w} cm) nema mjesta — slobodno je još ${Math.floor(freeOf(ctx.plan, id))} cm.`,
      slot.id,
    );
  }
  return last ?? fail(ctx.cfg, "Za novi element nema mjesta.", slot.id);
}

/**
 * Add a new element right after this one (width: the given one, else the usual width that fits). `zone` "tall" (or a
 * type only the tall zone has) next to a base cabinet of a wall run: a tall unit standing in the run (the wall units
 * above it go).
 */
export function insertAfter(cfg: KitchenConfig, slotId: string, type: string, width?: number, zone?: "tall"): EditResult {
  return insert(cfg, slotId, type, width, true, zone);
}

/** Add a new element right before this one (`zone` as for insertAfter). */
export function insertBefore(cfg: KitchenConfig, slotId: string, type: string, width?: number, zone?: "tall"): EditResult {
  return insert(cfg, slotId, type, width, false, zone);
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
  if (slot.anchored && ls.zone === "upper") {
    // the hood above the hob: the wall units after it stay where they hang (keepHoodPlace)
    const gap = next[ls.index];
    const kept = tidy(keepHoodPlace(cfg, ls.id, next, gap, slot.x), ls.zone);
    const r = commit(ctx, withList(cfg, ls.id, kept), ls.id, null, "Element se ne može ukloniti.");
    if (r.ok) return r;
  }
  const c2 = withList(cfg, ls.id, tidy(next, ls.zone));
  // the last unit of a column standing in the run: the wall units beside it stay where they hang (when they can)
  if (cur.tall && slot.run !== "isl" && !list[ls.index - 1]?.tall && !list[ls.index + 1]?.tall) {
    const kept = commit(ctx, keepUppers(ctx.plan, c2, slot), ls.id, null, "Element se ne može ukloniti.");
    if (kept.ok) return kept;
  }
  return commit(ctx, c2, ls.id, null, "Element se ne može ukloniti.");
}

/**
 * The hood above the hob hangs where the hob is (PlanSlot.anchored); a wall unit in its place (changeType) or empty space
 * (remove) is not anchored — it flows with its stretch (after the unit before it, or against the window), and the wall
 * units beside it with it. Empty space on the side it would move away from keeps it, and them, where the hood hung —
 * when the plan then really has it there. `list` as edited (entry objects kept), `el` the entry in the hood's place, `x0`
 * where the hood hung; `list` itself when nothing would move (or a move under 5 cm: empty space is never narrower).
 */
function keepHoodPlace(cfg: KitchenConfig, id: ListId, list: CabinetSpec[], el: CabinetSpec, x0: number): CabinetSpec[] {
  const placed = (l: CabinetSpec[]) => {
    const p = planKitchen(sanitizeConfig(withList(cfg, id, l)));
    return (j: number) => p.slots.find((x) => x.list?.id === id && x.list.index === j);
  };
  const i = list.indexOf(el);
  const at = placed(list);
  const x = i < 0 ? undefined : at(i)?.x;
  if (x === undefined) return list;
  const pad = Math.floor(Math.abs(x0 - x) + 1e-6);
  if (pad < 5) return list;
  // moved left: empty space before it; moved right (a stretch that ends at the window): empty space after the last unit
  // of its stretch (those right after it moved along)
  let k = i;
  if (x > x0) {
    for (let a = at(k), b = at(k + 1); a && b && Math.abs(b.x - (a.x + a.width)) < 0.5; a = b, b = at(k + 1)) k++;
  }
  const out = [...list];
  const n = x < x0 ? i - 1 : k + 1;
  if (out[n] && isSpacer("upper", out[n].type)) out[n] = { ...out[n], width: out[n].width + pad };
  else out.splice(x < x0 ? i : k + 1, 0, { type: SPACER.upper, width: pad });
  const y = placed(out)(out.indexOf(el))?.x;
  return y !== undefined && Math.abs(y - x0) < Math.abs(x - x0) - 0.5 ? out : list;
}

/**
 * Remove a whole tall column — the one `slotId` (any of its units) belongs to: the main column (the kitchen then has none:
 * KitchenConfig.tall off, its units and place forgotten), a column at another run end (its KitchenConfig.tallRuns entry),
 * or a column standing in a wall's base run (its tall entries, and filler strips between them; the run closes up, an
 * edited wall-unit list keeps its wall units where they hang). The UI's "Ukloni stup" — with it (and the "+" at a run's
 * end that starts a new column) the studio needs no "Visoki stup" switch. Refused for anything that is not a tall unit.
 */
export function removeColumn(input: KitchenConfig, slotId: string): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const { slot } = ctx;
  if (slot.zone !== "tall" || !slot.list) return fail(ctx.cfg, "Ovo nije visoki element.", slot.id);
  const id = slot.list.id;
  if (id === "tall") {
    const next = { ...withList(ctx.cfg, "tall", undefined), tall: false };
    delete next.tallAt;
    return { cfg: sanitizeConfig(next), ok: true, warning: null, slotId: null };
  }
  if (tallListEnd(id)) return { cfg: sanitizeConfig(withList(ctx.cfg, id, undefined)), ok: true, warning: null, slotId: null };
  if (listZone(id) !== "base") return fail(ctx.cfg, "Ovaj element se ne može ukloniti.", slot.id);
  const { cfg, list } = editable(ctx, id);
  // its column: the tall entries around it (filler strips between two of them stand in it too: plan.ts withTallPanels)
  const inCol = (i: number, d: -1 | 1) => Boolean(list[i]?.tall || (isFillerEntry(list[i]) && list[i + d]?.tall));
  let a = slot.list.index;
  let b = slot.list.index;
  if (!list[a]?.tall) return fail(ctx.cfg, "Element više ne postoji.", slot.id);
  while (a > 0 && inCol(a - 1, -1)) a--;
  while (b < list.length - 1 && inCol(b + 1, 1)) b++;
  const next = tidy([...list.slice(0, a), ...list.slice(b + 1)].map(copyEntry), "base");
  const kept = commit(ctx, keepUppers(ctx.plan, withList(cfg, id, next), slot), id, null, "Visoki stup se ne može ukloniti.");
  // (wall units that cannot keep their places — the run's wall-unit row closes up — never stop the column going)
  return kept.ok ? kept : commit(ctx, withList(cfg, id, next), id, null, "Visoki stup se ne može ukloniti.");
}

/**
 * A tall column standing in the run went (its last unit `slot`): an edited wall-unit list keeps its wall units where they
 * hang — bare wall ("Bez gornjeg elementa") takes the wall the column leaves, so the row does not close up over it. The
 * bare wall ends where the stretch does (the window, the next column) when that comes first, and the result is planned:
 * when the wall units beyond would still move (or one would be left out), the list stays as it was (`next`).
 */
function keepUppers(plan0: KitchenPlan, next: KitchenConfig, slot: PlanSlot): KitchenConfig {
  const wall = slot.run as WallId;
  const upId = `${wall}:u` as ListId;
  const l0 = planList(plan0, upId);
  const run = plan0.runs.find((r) => r.wall === wall);
  const col = run?.runTalls.find((t) => slot.x >= t.from - 0.5 && slot.x < t.to);
  if (!listOf(next, upId) || !l0 || !run || !col) return next;
  const ups = plan0.slots.filter((s) => s.list?.id === upId);
  const right = ups.filter((s) => s.x >= col.to - 0.5);
  if (!right.length) return next;
  // where the row before the column ends: its last wall unit, an end panel or corner unit, the window, another column
  const ends = [
    ...plan0.slots.filter((s) => s.run === wall && s.zone === "upper").map((s) => s.x + s.width),
    ...plan0.pieces.filter((p) => p.run === wall && p.zone === "upper").map((p) => p.x + p.width),
    ...run.talls.map((t) => t.to),
    ...(plan0.window && plan0.window.wall === wall ? [plan0.window.offset + plan0.window.width + DIM.windowMargin] : []),
  ].filter((e) => e <= col.from + 0.5);
  if (!ends.length) return next;
  const from = Math.max(...ends);
  const first = Math.min(...right.map((s) => s.x));
  // where the stretch the column leaves ends before the wall units beyond: the window (its opening, an end panel before
  // it), the next column
  const win = plan0.window && plan0.window.wall === wall ? plan0.window.offset - DIM.windowMargin : Infinity;
  const stops = [first, ...(win >= from - 0.5 && win < first ? [win, win - DIM.panel] : []), ...run.talls.map((t) => t.from).filter((x) => x >= col.to - 0.5 && x < first)];
  const pads = [...new Set(stops.map((x) => Math.floor(x - from)))].filter((p) => p >= 5).sort((p, q) => q - p);
  for (const pad of pads) {
    const list = l0.entries.map(copyEntry);
    list.splice(ups.length - right.length, 0, { type: SPACER.upper, width: pad });
    const cfg = withList(next, upId, tidy(list, "upper"));
    const p = planKitchen(sanitizeConfig(cfg));
    // (bare wall beyond merges with the new stretch of it: tidy)
    const stay = right.filter((s) => !isSpacer("upper", s.type)).every((s) => p.slots.some((x) => x.zone === "upper" && x.run === wall && x.type === s.type && Math.abs(x.x - s.x) < 0.6 && Math.abs(x.width - s.width) < 0.6));
    if (stay && !(planList(p, upId)?.dropped.length ?? 0)) return cfg;
  }
  return next;
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
  // the filler strip at a wall / corner / column end stays there
  if (j < 0 || j >= list.length || isFillerEntry(list[j])) return fail(ctx.cfg, dir < 0 ? "Element je već na početku niza." : "Element je već na kraju niza.", slot.id);
  const next = list.map((e) => ({ ...e }));
  [next[ls.index], next[j]] = [next[j], next[ls.index]];
  const refuse = "Na tom mjestu element ne stane.";
  if (ls.zone !== "base" || !(next[j].tall || next[ls.index].tall) || slot.run === "isl") return commit(ctx, withList(cfg, ls.id, next), ls.id, j, refuse);
  // a tall unit moves along the run: the wall units that would hang where it now stands make way
  const src = list.map((_, k) => (k === ls.index ? j : k === j ? ls.index : k));
  const cl = clearAbove(ctx.plan, withList(cfg, ls.id, next), ls.id as WallId, [], slot.id, src);
  const r = commit(ctx, cl.cfg, ls.id, j, refuse);
  if (!r.ok || !cl.gone) return r;
  const note = uppersGone(cl.gone, "iznad novog mjesta visokog elementa");
  return { ...r, warning: r.warning ? `${note} ${r.warning}` : note };
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
 * tall column back where the planner puts it — also when it had been removed: the column is an element like any other,
 * there is no "Visoki stup" switch to keep it off). Materials, the room and where the kitchen stands on it (extents) stay.
 */
export function resetAll(input: KitchenConfig): KitchenConfig {
  const c = { ...sanitizeConfig(input), tall: true };
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
  // (a removed tall column is an element edit too: resetAll brings it back)
  return Boolean(cfg.runs || cfg.upperRuns || cfg.tallRun || cfg.tallRuns || cfg.tallAt || cfg.corners || !cfg.tall || Object.keys(cfg.overrides ?? {}).length);
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
    const base = zone === "base";
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
      tall: [],
      insertAfterTall: base && slot.corner === "left" ? insertOptionsIn(ctx, true, undefined, "tall") : [],
      insertBeforeTall: base && slot.corner === "right" ? insertOptionsIn(ctx, false, undefined, "tall") : [],
      canMoveLeft: false,
      canMoveRight: false,
      canRemove: false,
      notes,
    };
  }
  const ls = listSlot(ctx);
  if (!ls) return null;
  const def = defOf(ls.ez, slot.type);
  // the tall column's room is the same for every option of this slot: worked out once
  const tallCap = ls.zone === "tall" ? tallCapacity(cfg, ls.id) : undefined;
  const widthOf = (r: EditResult) => (r.ok && r.slotId ? (planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)?.width ?? null) : null);
  const types = poolOf(ls.ez).map((d) => {
    if (d.id === slot.type) return choice(d, slot.width, true);
    return choice(d, widthOf(changeTypeIn(ctx, d.id, tallCap)), false);
  });
  // a base cabinet / wall unit of a wall run: what tall unit can take its place, and stand beside it
  const wallRow = slot.run !== "isl" && ls.ez !== "tall" && (ls.zone === "base" || ls.zone === "upper");
  const tall = wallRow ? poolOf("tall").map((d) => choice(d, widthOf(changeTypeIn(ctx, d.id, undefined, "tall")), false)) : [];
  const besideTall = wallRow && ls.zone === "base";
  const canMoveLeft = moveLeft(cfg, slot.id).ok;
  const canMoveRight = moveRight(cfg, slot.id).ok;
  const canRemove = remove(cfg, slot.id).ok;
  if (slot.anchored) notes.push("Napa ostaje iznad ploče za kuhanje: pomiče se zajedno s pločom.");
  return {
    slot,
    zone: ls.ez,
    listId: ls.id,
    index: ls.index,
    edited: listOf(cfg, ls.id) !== undefined,
    def,
    free: tallCap !== undefined ? Math.max(0, Math.round((tallCap - tallUsed(plan, ls.id)) * 10) / 10) : freeOf(plan, ls.id),
    types,
    widths: widthsIn(ctx, tallCap),
    insertAfter: insertOptionsIn(ctx, true, tallCap),
    insertBefore: insertOptionsIn(ctx, false, tallCap),
    tall,
    insertAfterTall: besideTall ? insertOptionsIn(ctx, true, undefined, "tall") : [],
    insertBeforeTall: besideTall ? insertOptionsIn(ctx, false, undefined, "tall") : [],
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
  const def = defOf(ls.ez, slot.type);
  if (!def || def.spacer || slot.anchored) return only;
  const sib = def.sibling ? defOf(ls.ez, def.sibling) : undefined;
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
export function insertOptions(input: KitchenConfig, slotId: string, side: InsertSide | boolean, zone?: "tall"): TypeChoice[] {
  const ctx = context(input, slotId);
  return ctx ? insertOptionsIn(ctx, side === true || side === "after", undefined, zone) : [];
}

/**
 * insertOptions: `want` "tall" next to an element of a wall's base run = tall units standing in the run (insertAfter /
 * insertBefore with zone "tall"); next to a tall unit standing in the run, its own options are tall units (they join
 * its column).
 */
function insertOptionsIn(ctx: Ctx, after: boolean, tallCap?: number, want?: "tall"): TypeChoice[] {
  const t = insertTarget(ctx, after);
  if (typeof t === "string") return [];
  const zone = listZone(t.id);
  const ez: ListZone | null = want === "tall" ? (zone === "base" || zone === "tall" ? "tall" : null) : inRunTall(ctx.slot) ? "tall" : zone;
  if (!ez) return [];
  const pool = poolOf(ez).filter((d) => !d.spacer && !d.corner);
  const { cfg, list } = editable(ctx, t.id);
  if (list.length >= listMax(zone)) return pool.map((d) => choice(d, null, false, []));
  const inRun = zone === "base" && ez === "tall";
  const room = roomAt(ctx, t.id, list, t.at, false, tallCap);
  const probed = new Map<number, boolean>();
  /** the insert of `type` at width `w` works (exactly as insert() does it: insertWays) */
  const works = (type: string, w: number) => insertWays(ctx, cfg, list, t.id, t.at, room, entryOf(zone, ez, type, w)).ok;
  const fitsWidth = (w: number) => {
    let ok = probed.get(w);
    if (ok === undefined) {
      const type = probeType(ez, w);
      ok = Boolean(type) && works(type as string, w);
      probed.set(w, ok);
    }
    return ok;
  };
  // the most an insert can take: the room, or what the element beside it can give up
  const sel = listSlot(ctx);
  const selDef = sel && sel.id === t.id && !list[sel.index]?.tall ? defOf(zone, list[sel.index]?.type ?? "") : undefined;
  const give =
    zone !== "tall" && selDef && !selDef.spacer && !selDef.hood && !selDef.corner && !ctx.slot.corner && !ctx.slot.anchored
      ? (list[sel!.index]?.width ?? 0) - Math.min(...selDef.widths)
      : 0;
  // a free end beyond: what its "+" allows (insertGapIn decides; every width is probed); a tall unit standing in the run
  // may also grow the run into the bare wall beyond its free ends (commitTall)
  const run = inRun ? ctx.plan.runs.find((r) => r.wall === t.id) : undefined;
  const grow = run
    ? outsideAt(ctx.plan, run, "left") + outsideAt(ctx.plan, run, "right")
    : zone === "tall"
      ? (planGaps(ctx.plan).find((g) => g.kind === "end" && g.tallList === t.id)?.outside ?? 0)
      : 0;
  // a tall unit standing in the run: the row makes room as its "+" does (insertTallWays → commitTall `wide`): the two
  // beside it down to their narrowest width, the run's other cabinets down to SEAM_MIN — an upper bound, every width is probed
  const rowGive = inRun
    ? list.reduce((n, e, j) => {
        const d = e.tall || isFillerEntry(e) ? null : seamDef("base", e.type);
        const lo = d ? d.widths.filter((x) => x < e.width - 0.5 && x >= (j === t.at - 1 || j === t.at ? 0 : SEAM_MIN)) : [];
        return lo.length ? n + e.width - Math.min(...lo) : n;
      }, 0)
    : 0;
  const reach = endGapFor(ctx, t.id, t.at, list.length) ? Infinity : Math.max(room, room + (inRun ? Math.max(give, rowGive) : give)) + grow;
  // a tall unit standing in the run needs its cover panels too, unless it joins a column beside it
  const joins = Boolean(list[t.at - 1]?.tall || list[t.at]?.tall);
  const foot = (w: number) => (inRun && !joins ? w + 2 * DIM.panel : w);
  return pool.map((d) => {
    const fitting = d.widths.filter((w) => foot(w) <= reach + 0.5 && (d.hood ? works(d.id, w) : fitsWidth(w)));
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
  /**
   * depth of the "do stropa" second row of top cabinets (HeightSpec.topDepth; setHeights(cfg, { topDepth })), cm:
   * TOP_DEPTHS, `shown` = the kitchen has that row now (an element may have its own: setElementOptions { depth })
   */
  topDepth: { value: number; options: number[]; shown: boolean };
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
    const td = patch.topDepth;
    if (td !== undefined && !asNums(TOP_DEPTHS).includes(Math.round(td))) notes.push(`Nadgradni ormarići dolaze u dubinama od ${TOP_DEPTHS.join(", ")} cm.`);
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
    topDepth: { value: current.topDepth, options: [...TOP_DEPTHS], shown: Boolean(current.topRow) },
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
  // (a ceiling cassette — KitchenConfig.hood.island "kaseta" — hangs at no height: the setting waits for a canopy hood)
  const hoodAbove = I.hood && I.hood.style !== "kaseta" ? Math.round(I.hood.above) : (spec.hoodAbove ?? ISLAND_DEFAULTS.hoodAbove);
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
  /** where the kitchen stands on it (wall-local cm, as seen facing the wall) — the room the kitchen reserves */
  kitchen: Range;
  /**
   * where its cabinets stand (plan.ts RunPlan.cabinets: the kitchen without the bare floor at its open ends) — what the
   * kitchen label on the floor measures; null when the run holds no cabinet
   */
  cabinets: Range | null;
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
    cabinets: run?.cabinets ?? null,
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

/**
 * An insert into a wall's base list `next` that takes `delta` cm more of the run (no growth into the bare wall) and leaves
 * less than FREE_MIN of the bare floor at a free end: the planner would close that sliver with a filler at the run's
 * other end (a wall / a corner), and every cabinet would slide by it (16–23 cm in the review — a tall unit joining a column
 * that stands in the run beside the bare floor). Instead it is absorbed at that end, so the cabinets stay where they are:
 * as a filler strip ("filer" entry) beyond the last cabinet there (the wall units above keep their room), or — where a
 * tall column is the outermost element — by ending the kitchen run at the column (the sliver becomes bare wall beyond
 * the kitchen, as beside a new column at a run's end; a filler strip with worktop beside a column would look odd).
 * `filer`: the index the filler strip took in the returned list (callers shift their indices), else null.
 */
function keepSliver(plan0: KitchenPlan, cfg: KitchenConfig, wall: WallId, next: CabinetSpec[], delta: number): { cfg: KitchenConfig; list: CabinetSpec[]; filer: number | null } {
  const same = { cfg, list: next, filer: null };
  const run = plan0.runs.find((r) => r.wall === wall);
  if (!run || delta <= 0.5) return same;
  const k = kitchenRange(sanitizeConfig(cfg), wall);
  // the run grew: no sliver is left
  if (Math.abs(k.from - run.kitchen.from) > 0.5 || Math.abs(k.to - run.kitchen.to) > 0.5) return same;
  for (const f of run.free) {
    const rest = Math.floor(f.to - f.from - delta + 1e-6);
    if (rest < 1 || rest >= FREE_MIN) continue;
    const real = next.filter((e) => !isFillerEntry(e));
    const outer = f.side === "left" ? real[0] : real[real.length - 1];
    if (!outer) return same;
    if (outer.tall) {
      const r = f.side === "left" ? { from: k.from + rest, to: k.to } : { from: k.from, to: k.to - rest };
      // (a kitchen run keeps the layout's shortest length: then the planner closes the sliver as before)
      if (r.to - r.from < minRun(cfg.layout, wall)) return same;
      return { cfg: withExtent(cfg, wall, r), list: next, filer: null };
    }
    if (next.length >= MAX_LIST) return same;
    const at = f.side === "left" ? 0 : next.length;
    return { cfg, list: [...next.slice(0, at), { type: "filer", width: rest }, ...next.slice(at)], filer: at };
  }
  return same;
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
    if ((z !== "tall" || gap.kind !== "end") && w > gap.maxWidth + 0.5) return false;
    const key = d.hood ? `${z}:${d.id}:${w}` : `${z}:${w}`;
    let ok = probed.get(key);
    if (ok === undefined) {
      const type = d.hood ? d.id : probeType(z, w);
      ok = Boolean(type) && insertGapIn(cfg, plan, gap, type as string, w, z).ok;
      probed.set(key, ok);
    }
    return ok;
  };
  // a "+" that replaces an element (a full row: PlanGap.replace) does not offer that element again
  const same = gap.replace ? plan.slots.find((s) => s.id === gap.replace) : undefined;
  const list = (z: ListZone) =>
    poolOf(z)
      .filter((d) => !d.spacer && !d.corner)
      .map((d) => {
        const fitting = d.widths.filter((w) => fits(z, d, w) && !(same && z !== "tall" && same.type === d.id && Math.abs(same.width - w) < 0.5));
        return choice(d, widthsNew(d).find((w) => fitting.includes(w)) ?? null, false, fitting);
      });
  return { gap, types: list(zone), tall: tallGap(gap) ? list("tall") : [] };
}

/**
 * the "+" places a tall unit can go into: the free end of a wall run (a column there, or one standing in the run), and
 * between the cabinets of a wall's base run (a joint of a full row, empty space) — it then stands in the run
 */
const tallGap = (gap: PlanGap) => gap.kind === "end" || (gap.zone === "base" && gap.run !== "isl" && (gap.kind === "free" || gap.kind === "seam"));

/**
 * Put an element into a gap (gapOptions lists what fits). Without `width` the usual width that fits; `zone` "tall"
 * puts a tall unit there (absent: base types go to the base run, types that are only tall are tall units) — at the end
 * of a wall run and between the cabinets of a wall's base run (gapOptions.tall). By kind:
 *
 *   free    the element takes the empty space's place (what it does not take stays empty); a tall unit stands in the run
 *   upper   a wall unit on the bare wall
 *   seam    between two elements of a full row, one of them narrower; a tall unit stands in the run there
 *   end     base: at that end of the base run — taking the bare floor there first, then growing the kitchen run into
 *           the bare wall beyond it (KitchenConfig.extents); beyond a tall column standing at that end (where the "+" is)
 *           the column becomes part of the base run and the cabinet stands at its outer side; tall: onto the outer side
 *           of the tall column standing at that end, or a new column there (the tall column if the kitchen has none, else
 *           a KitchenConfig.tallRuns one) — wall units over the bare floor there make way, with a note
 *   island  at that end of the island / peninsula, which grows when it has to
 *
 * Wherever a tall unit goes, the wall units that would hang where it stands go (an edited wall-unit list; the planner's
 * own make way by themselves), and the note says so. Validated by planning the result like every edit (nothing else may
 * be left out); slotId = the new element.
 */
export function insertAtGap(input: KitchenConfig, gapId: string, type: string, width?: number, zone?: "base" | "upper" | "island" | "tall"): EditResult {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const gap = planGaps(plan).find((g) => g.id === gapId);
  if (!gap) return fail(cfg, "Tog slobodnog mjesta više nema.");
  const z: ListZone =
    gap.zone === "upper" ? "upper" : gap.zone === "island" ? "island" : zone === "tall" || (zone === undefined && !moduleDef("base", type) && moduleDef("tall", type)) ? "tall" : "base";
  if (z === "tall" && !tallGap(gap)) return fail(cfg, "Visoki element ovdje ne može stajati — dodajte ga na kraju niza ili između donjih elemenata.");
  const def = defOf(z, type);
  if (!def || def.corner || def.spacer || def.filler || (z === "island" && !def.island)) return fail(cfg, "Ta izvedba ne može stajati na ovom mjestu.");
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

/** where an element goes at a free end of a base list: inside the filler strips that stand at that end */
function endIndex(list: CabinetSpec[], side: "left" | "right"): number {
  if (side === "left") {
    let i = 0;
    while (i < list.length && isFillerEntry(list[i])) i++;
    return i;
  }
  let i = list.length;
  while (i > 0 && isFillerEntry(list[i - 1])) i--;
  return i;
}

/**
 * insertGapIn options. `beside`: the insert comes from "+ lijevo / + desno" next to the last element before this free end
 * (not from the "+" itself): at an end with a tall column it goes on the column's inner side, beside that element (a
 * base cabinet: the column moves out by its width). `force`: wall units (slot ids) a tall unit here replaces.
 */
interface GapInsert {
  beside?: boolean;
  force?: string[];
}

function insertGapIn(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, type: string, w: number, zone: ListZone, opt: GapInsert = {}): EditResult {
  const refuse = `Za ${w} cm ovdje nema mjesta${gap.maxWidth >= GAP_MIN ? ` — stane najviše ${gap.maxWidth} cm` : ""}.`;
  const el: CabinetSpec = { type, width: w };
  const put = (list: CabinetSpec[], at: number, e: CabinetSpec = el) => [...list.slice(0, at), e, ...list.slice(at)];
  // a hood goes only where it hangs above a hob (the planner centres it there)
  if (zone === "upper" && defOf("upper", type)?.hood && !gap.hob) return fail(cfg, "Element za napu ide iznad ploče za kuhanje.");
  // a tall unit into a wall's base run, between its cabinets: it stands in the run (CabinetSpec.tall)
  if (zone === "tall" && (gap.kind === "seam" || gap.kind === "free")) return insertTallGap(cfg, plan, gap, type, w, refuse);
  if (gap.kind === "seam") return insertSeam(cfg, plan, gap, el, refuse);
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
    // (tidy merges into its entries: on copies, so `next` stays as it was for the second try)
    const final = tidy(next.map((e) => (e === el ? e : { ...e })), listZone(id), el);
    const r = commitPlan(cfg, plan, null, withList(c1, id, final), id, final.indexOf(el), refuse);
    if (r.ok || final.length === next.length) return r;
    // wall units: two empty spaces that tidy merged may stand in different stretches (either side of the window) —
    // the merged one fits in neither; keep them apart
    const apart = next.filter((e) => e === el || !isSpacer(listZone(id), e.type) || e.width >= 5);
    return commitPlan(cfg, plan, null, withList(c1, id, apart), id, apart.indexOf(el), refuse);
  }
  if (gap.kind === "upper" && gap.side) return insertUpperEnd(cfg, plan, gap, el, refuse);
  if (gap.kind === "upper") {
    // into the bare wall itself: the wall units beside it stay where they are
    if (w > gap.maxWidth + 0.5) return fail(cfg, refuse);
    const { cfg: c1, list } = editableIn(cfg, plan, gap.list);
    if (list.length >= MAX_LIST) return fail(cfg, fullNote("upper"));
    // straight into the list (not out of empty space beside it, as an insert next to an element does: that would put it
    // on the empty space instead of this bare wall). The list flows left → right into the first stretch with room: bare
    // wall between the element before it and this gap that would take the new unit first stays bare — empty space of its
    // size goes there.
    const at = Math.min(gap.index, list.length);
    const p1 = c1 === cfg ? plan : planKitchen(c1);
    const prev = at > 0 ? p1.slots.find((s) => s.list?.id === gap.list && s.list.index === at - 1) : undefined;
    const x0 = prev ? prev.x + prev.width : -Infinity;
    const pads: CabinetSpec[] = (p1.runs.find((r) => r.wall === gap.run)?.upperFree ?? [])
      .filter((u) => u.from >= x0 - 0.5 && u.to <= gap.from + 0.5 && u.room >= w - 0.5)
      .map((u) => ({ type: SPACER.upper, width: Math.floor(u.room) }));
    if (list.length + pads.length >= MAX_LIST) return fail(cfg, fullNote("upper"));
    const placed = [...list.slice(0, at), ...pads, el, ...list.slice(at)];
    return onTheGap(cfg, commitPlan(cfg, plan, null, withList(c1, gap.list, placed), gap.list, placed.indexOf(el), refuse), gap, refuse);
  }
  if (gap.kind === "island") {
    const { cfg: c1, list } = editableIn(cfg, plan, "isl");
    if (list.length >= MAX_LIST) return fail(cfg, fullNote("island"));
    const need = w - (gap.floor ?? 0);
    if (need > (gap.outside ?? 0) + 0.5) return fail(cfg, refuse);
    const c2 = need > 0.5 ? { ...c1, island: cfg.island + Math.ceil(need) } : c1;
    const at = gap.side === "left" ? 0 : list.length;
    // ("Otok je duži za 30 cm." when it grew, as at a wall run's end)
    return grewNote(cfg, commitPlan(cfg, plan, null, withList(c2, "isl", put(list, at)), "isl", at, refuse), gap);
  }
  // the end of a wall's kitchen run
  const wall = gap.run as WallId;
  const side = gap.side ?? "right";
  const floor = gap.floor ?? 0;
  const outside = gap.outside ?? 0;
  /**
   * Commit `build(grow)` — the run grown by `grow` cm more than the element needs. A longer run can let a tall column
   * stand again that did not fit before (it stays in the config, KitchenConfig.tallRuns / tallRun): it then takes the
   * room the element was to get, so try once more with the run grown by that column too (while the wall allows it); when
   * the wall does not, that column stays left out (KitchenConfig.tall off / its tallRuns entry removed, with a note) so
   * the "+" still adds what was asked for.
   */
  const withRevived = (id: ListId, at: number, room: number, build: (grow: number) => KitchenConfig): EditResult => {
    const first = commitPlan(cfg, plan, null, build(0), id, at, refuse);
    if (first.ok) return first;
    const revived = revivedTall(plan, planKitchen(sanitizeConfig(build(0))), wall, id);
    if (revived.cm < 0.5) return first;
    const say = (r: EditResult, note: string): EditResult => ({ ...r, warning: r.warning ? `${r.warning} ${note}` : note });
    if (revived.cm <= room + 0.5) {
      const again = commitPlan(cfg, plan, null, build(revived.cm), id, at, refuse);
      if (again.ok) return say(again, "Uz duži niz sada stane i visoki stup koji prije nije stao.");
    }
    // no room for both: the column that did not fit stays left out (the customer adds it again when there is room) —
    // it must not take the room of the element asked for
    const kept = revived.ids.reduce<KitchenConfig>((c, l) => (l === "tall" ? { ...c, tall: false } : withList(c, l, undefined)), build(0));
    const last = commitPlan(cfg, plan, null, kept, id, at, refuse);
    if (!last.ok) return first;
    const names = revived.ids.map((l) => (l === "tall" ? "visoki stup" : `visoki stup uz zid ${wall.toUpperCase()}`));
    return say(
      last,
      revived.ids.includes("tall") && revived.ids.length === 1
        ? "Visoki stup koji nije stao ostaje izostavljen — kad za njega bude mjesta, vratite ga u koraku „Elementi” („Vrati zadani visoki stup”)."
        : `${names.length > 1 ? "Visoki stupovi koji nisu stali ostaju izostavljeni" : "Visoki stup koji nije stao ostaje izostavljen"} — dodajte ga ponovno s „+” na kraju niza kad za njega bude mjesta.`,
    );
  };
  /** the column standing at this end: its own list, or (in the run: CabinetSpec.tall) the wall's base list */
  const endCol = gap.tallList && isTallList(gap.tallList) ? gap.tallList : null;
  // a column standing in the run at this end of its list (right at the kitchen's end, or with bare floor before it)
  const entries = planList(plan, wall)?.entries ?? [];
  const edge = side === "left" ? entries.find((e) => !isFillerEntry(e)) : [...entries].reverse().find((e) => !isFillerEntry(e));
  const runCol = Boolean(gap.tallList && !isTallList(gap.tallList)) || (!endCol && Boolean(edge?.tall));
  /** wall units over the bare floor there that a tall unit now stands under go (clearAbove), and the note says so */
  let cleared = 0;
  const clear = (c: KitchenConfig, src?: number[]): KitchenConfig => {
    const cl = clearAbove(plan, c, wall, opt.force ?? [], undefined, src);
    cleared = cl.gone;
    return cl.cfg;
  };
  const clearedNote = (r: EditResult): EditResult => {
    if (!r.ok) return r;
    const n = cleared - (opt.force?.length ?? 0);
    if (n <= 0) return { ...r, uppersGone: cleared };
    const note = uppersGone(n, "iznad visokog elementa");
    return { ...r, warning: r.warning ? `${note} ${r.warning}` : note, uppersGone: cleared };
  };
  /** the kitchen grew: say so ("Kuhinja na zidu B duža je za 30 cm.") */
  const done = (r: EditResult): EditResult => grewNote(cfg, r, gap);
  if (zone === "tall" && runCol) {
    // the column stands in the run at this end: the unit joins it at its outer side (the run grows by its width; a
    // sliver of bare floor it leaves there ends the kitchen run instead of sliding the cabinets: keepSliver)
    const { cfg: c1, list } = editableIn(cfg, plan, wall);
    if (list.length >= MAX_LIST) return fail(cfg, fullNote("base"));
    const at = side === "left" ? 0 : list.length;
    const t: CabinetSpec = { type, width: w, tall: true };
    const grown = Math.max(0, Math.min(w - floor, outside));
    const ks = grown > 0.5 ? { cfg: c1, list: put(list, at, t), filer: null } : keepSliver(plan, c1, wall, put(list, at, t), runFoot(plan, wall, put(list, at, t)) - runFoot(plan, wall, list));
    const src = srcInsert(list.length, at);
    if (ks.filer !== null) src.splice(ks.filer, 0, -1);
    const i = ks.list.indexOf(t);
    return done(clearedNote(withRevived(wall, i, outside - grown, (more) => clear(withList(extendRun(ks.cfg, wall, side, grown + more), wall, ks.list), src))));
  }
  if (zone === "tall") {
    if (endCol) {
      // onto the outer side of the column standing here (beside the element of "+ lijevo / + desno": its inner side):
      // the run grows by the unit's width (or the base run gives way)
      const tallList = endCol;
      const { cfg: c1, list } = editableIn(cfg, plan, tallList);
      if (list.length >= MAX_TALL) return fail(cfg, fullNote("tall"));
      const outer = side === "left" ? 0 : list.length;
      const at = opt.beside ? list.length - outer : outer;
      const grown = Math.min(w, outside);
      return done(clearedNote(withRevived(tallList, at, outside - grown, (more) => clear(withList(extendRun(c1, wall, side, grown + more), tallList, put(list, at))))));
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
    // the base cabinets stay as they are (the list made explicit: the planner would fill the run anew beside a column)
    const cm = editableIn(cfg, plan, wall).cfg;
    const at = (more: number): KitchenConfig =>
      withExtent(cm, wall, {
        from: Math.max(0, side === "left" ? target.from - more : target.from),
        to: Math.min(cfg.walls[wall], side === "left" ? target.to : target.to + more),
      });
    if (!plan.slots.some((s) => s.list?.id === "tall")) {
      return done(clearedNote(withRevived("tall", 0, -beyond, (more) => clear({ ...at(more), tall: true, tallRun: [el], tallAt: e }))));
    }
    const id: TallListId = `tall:${e}`;
    return done(clearedNote(withRevived(id, 0, -beyond, (more) => clear(withList(at(more), id, [el])))));
  }
  const { cfg: c1, list } = editableIn(cfg, plan, wall);
  if (list.length >= MAX_LIST) return fail(cfg, fullNote("base"));
  const need = w - floor;
  if (need > outside + 0.5) return fail(cfg, refuse);
  if (endCol && !opt.beside) return insertBeyondColumn(cfg, plan, gap, endCol, c1, list, el, refuse);
  const at = endIndex(list, side);
  // beyond a column standing in the run at this end, the run needs its end panel again (the column's own closed it)
  const grows = [...new Set(runCol ? [Math.max(0, need), Math.max(0, need + DIM.panel)] : [Math.max(0, need)])];
  let r: EditResult = fail(cfg, refuse);
  for (const g of grows) {
    if (g > outside + 0.5) continue;
    // a sliver of bare floor it leaves at this end is absorbed there (the cabinets do not slide: keepSliver)
    const ks = g > 0.5 ? { cfg: c1, list: put(list, at), filer: null } : keepSliver(plan, c1, wall, put(list, at), runFoot(plan, wall, put(list, at)) - runFoot(plan, wall, list) + (runCol ? DIM.panel : 0));
    r = withRevived(wall, ks.list.indexOf(el), outside - g, (more) => withList(extendRun(ks.cfg, wall, side, g + more), wall, ks.list));
    if (r.ok) break;
  }
  // "+ lijevo / + desno" beside the last cabinet before the column at this end: the column moves out by its width
  if (r.ok && endCol) {
    const note = "Novi ormarić stoji uz ostale donje elemente, a visoki stup pomaknut je prema kraju zida.";
    return done({ ...r, warning: r.warning ? `${note} ${r.warning}` : note });
  }
  return done(r);
}

/**
 * The "+" beyond a tall column at the end of a wall's run, a base cabinet: it goes there — beyond the column. The column
 * becomes part of the base run (its units CabinetSpec.tall entries of the wall's base list, its own list goes: the tall
 * column switches `tall` off), the cabinet stands at its outer side and the run grows into the bare wall by the cabinet
 * and the run's end panel.
 */
function insertBeyondColumn(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, col: ListId, c1: KitchenConfig, list: CabinetSpec[], el: CabinetSpec, refuse: string): EditResult {
  const wall = gap.run as WallId;
  const side = gap.side ?? "right";
  const outside = gap.outside ?? 0;
  const units = (planList(plan, col)?.entries ?? []).map((u): CabinetSpec => ({ type: u.type, width: u.width, tall: true }));
  if (!units.length) return fail(cfg, refuse);
  if (list.length + units.length + 1 > MAX_LIST) return fail(cfg, fullNote("base"));
  const placed = side === "right" ? [...list.map(copyEntry), ...units, el] : [el, ...units, ...list.map(copyEntry)];
  const c2: KitchenConfig = col === "tall" ? { ...withList(c1, "tall", undefined), tall: false } : withList(c1, col, undefined);
  if (col === "tall") delete c2.tallAt;
  const at = side === "right" ? placed.length - 1 : 0;
  let last: EditResult = fail(cfg, refuse);
  for (const g of [el.width + DIM.panel, el.width]) {
    if (g > outside + 0.5) continue;
    last = commitPlan(cfg, plan, null, withList(extendRun(c2, wall, side, g), wall, placed), wall, at, refuse, [col]);
    if (last.ok) {
      const note = `Novi element stoji s vanjske strane visokog stupa — stup je sada dio niza na zidu ${wall.toUpperCase()}.`;
      return grewNote(cfg, { ...last, warning: last.warning ? `${note} ${last.warning}` : note }, gap);
    }
  }
  return last;
}

/**
 * A tall unit into a "+" between the cabinets of a wall's base run (a joint of a full row, or empty space): it stands in
 * the run (CabinetSpec.tall). Between two cabinets the row makes room when the run has no free cm, as for a cabinet
 * there (the two beside the joint first, then the run's others: commitTall); into empty space it takes the space's place
 * (what it does not take stays empty). The wall units above it go (commitTall).
 */
function insertTallGap(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, type: string, w: number, refuse: string): EditResult {
  const def = moduleDef("tall", type);
  if (!def || gap.run === "isl" || gap.zone !== "base") return fail(cfg, "Visoki element ovdje ne može stajati.");
  if (!widthAllowed(def, w)) return fail(cfg, `${def.name} dolazi u širinama: ${def.widths.join(", ")} cm.`);
  const wall = gap.run as WallId;
  if (gap.kind === "free") {
    const slot = plan.slots.find((s) => s.id === gap.slotId);
    if (!slot?.list) return fail(cfg, "Tog slobodnog mjesta više nema.");
    return tallForBase(cfg, plan, slot, def, { widths: [w] });
  }
  if (!gap.between) return fail(cfg, refuse);
  const { cfg: c1, list } = editableIn(cfg, plan, wall);
  if (!seamHolds(plan, gap, list)) return fail(cfg, "Tog mjesta više nema.");
  // a full row where nothing can make room: the tall unit takes that element's place (as "Zamijeni" does)
  if (gap.replace) {
    const slot = plan.slots.find((s) => s.id === gap.replace);
    return slot ? tallForBase(cfg, plan, slot, def, { widths: [w] }) : fail(cfg, "Tog mjesta više nema.");
  }
  if (list.length >= MAX_LIST) return fail(cfg, fullNote("base"));
  const at = gap.index;
  const next = [...list.slice(0, at).map(copyEntry), { type, width: w, tall: true as const }, ...list.slice(at).map(copyEntry)];
  return commitTall(cfg, plan, null, c1, wall, list, next, at, { refuse, shrink: [at - 1, at + 1], wide: true, src: srcInsert(list.length, at) });
}

/**
 * Something can be put into this gap (what gapOptions would offer: the narrowest width of each kind is tried first). plan.ts
 * planGaps lists only such gaps — this module registers it there (registerGapCheck below), so every "+" the studio
 * shows offers at least one element. A plan or two per gap, once per plan (planGaps is memoised).
 */
function gapHasOption(plan: KitchenPlan, gap: PlanGap): boolean {
  const cfg = plan.cfg;
  const zone: ListZone = gap.zone === "upper" ? "upper" : gap.zone === "island" ? "island" : "base";
  const fitsIn = (z: ListZone) => {
    const widths = [...new Set(poolOf(z).filter((d) => !d.spacer && !d.corner && !d.hood).flatMap((d) => d.widths))]
      .filter((w) => (z === "tall" && gap.kind === "end") || w <= gap.maxWidth + 0.5)
      .sort((a, b) => a - b);
    for (const w of widths) {
      const t = probeType(z, w);
      if (t && insertGapIn(cfg, plan, gap, t, w, z).ok) return true;
    }
    return false;
  };
  if (tallGap(gap)) {
    // what the place really offers names it (plan.ts guessed from the geometry alone) — a wall unit hung over the bare
    // floor at a run's end, for one, may leave no room for a tall unit; between cabinets a column may stand under the window
    const base = fitsIn(zone);
    const tall = (gap.kind === "end" || base) && fitsIn("tall");
    if (gap.kind === "end") gap.label = base && tall ? GAP_LABEL.baseOrTall : tall ? GAP_LABEL.tall : GAP_LABEL.base;
    else if (tall) gap.label = GAP_LABEL.baseOrTall;
    if (base || tall) return true;
  } else if (fitsIn(zone)) return true;
  if (gap.hob) {
    for (const d of poolOf("upper").filter((x) => x.hood)) {
      for (const w of d.widths) if (w <= gap.maxWidth + 0.5 && insertGapIn(cfg, plan, gap, d.id, w, "upper").ok) return true;
    }
  }
  return false;
}
registerGapCheck(gapHasOption);

/**
 * A new element into a full row (PlanGap kind "seam"). Between two elements (or beside the only one of a stretch): the
 * row makes room — its free cm first (`gap.room`), then one element that can give enough on its own (the two beside the
 * joint first, the wider first, plain cabinets before the sink / hob / dishwasher), else several (as few sinks / hobs /
 * dishwashers as possible, then as few elements, each as little as it can) — never a corner unit, the hood above the hob
 * or a tall unit, never below SEAM_MIN (`gap.narrow` lists who may give way). Where nothing can make room
 * (`gap.replace`), the new element takes that element's place. Says what got narrower / what it replaced.
 */
function insertSeam(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, el: CabinetSpec, refuse: string): EditResult {
  if (el.width > gap.maxWidth + 0.5 || !gap.between) return fail(cfg, refuse);
  const id = gap.list;
  const z = listZone(id);
  if (z !== "base" && z !== "upper" && z !== "island") return fail(cfg, refuse);
  const { cfg: c1, list } = editableIn(cfg, plan, id);
  // the list must still be the one the seam was found in
  if (!seamHolds(plan, gap, list)) return fail(cfg, "Tog mjesta više nema.");
  if (gap.replace) return replaceAtSeam(cfg, plan, gap, c1, list, el, refuse);
  if (list.length >= MAX_LIST) return fail(cfg, fullNote(z));
  const at = gap.index;
  // wall units: each stays in its stretch (keepStretches), the new one at the joint
  const tgt = upperTargets(plan, gap, list);
  const placed = (next: CabinetSpec[]) => {
    const out = [...next.slice(0, at), el, ...next.slice(at)];
    if (z !== "upper") return out;
    next.forEach((e, j) => tgt.map.set(e, tgt.x(j)));
    tgt.map.set(el, tgt.joint);
    return keepStretches(c1, id, out, out.map((e) => tgt.map.get(e) ?? null));
  };
  const need = el.width - (gap.room ?? (z !== "upper" ? freeOf(plan, id) : 0));
  // (and the new one must hang at the joint: else this "+" is not offered)
  const here = (r: EditResult) => (z === "upper" ? onTheGap(cfg, r, gap, refuse) : r);
  const commitIn = (arr: CabinetSpec[]) => commitPlan(cfg, plan, null, withList(c1, id, arr), id, arr.indexOf(el), refuse);
  if (need <= 0.5) return here(commitIn(placed(list.map(copyEntry))));
  // who may give way, in the order they are asked (a tall unit standing in the run does not: seamDef has no tall types)
  const dz = z === "island" ? "base" : z;
  const cands = (gap.narrow ?? gap.between)
    .map((sid) => plan.slots.find((s) => s.id === sid))
    .filter((s): s is PlanSlot => Boolean(s?.list && s.list.id === id && !list[s.list.index]?.tall))
    .map((s) => {
      const i = s.list!.index;
      const e = list[i];
      const d = seamDef(dz, e.type);
      const widths = d ? d.widths.filter((x) => x < e.width - 0.5 && x >= SEAM_MIN && (z !== "island" || d.island)).sort((p, q) => q - p) : [];
      return { i, e, d: d!, widths, feature: Boolean(d?.feature) };
    })
    .filter((c) => c.widths.length);
  for (const ways of narrowings(cands, need)) {
    const next = list.map((x, j) => (ways.has(j) ? { ...x, width: ways.get(j)! } : { ...x }));
    const r = here(commitIn(placed(next)));
    if (!r.ok) continue;
    const name = (c: (typeof cands)[number]) => `${c.d.name.charAt(0).toLowerCase()}${c.d.name.slice(1)}`;
    const told = cands.filter((c) => ways.has(c.i)).sort((p, q) => p.i - q.i);
    const note =
      told.length === 1
        ? `Za novi element napravljeno je mjesto: ${name(told[0])} sada je ${ways.get(told[0].i)} cm umjesto ${told[0].e.width} cm.`
        : `Za novi element napravljeno je mjesto, uži su: ${told.map((c) => `${name(c)} ${ways.get(c.i)} cm umjesto ${c.e.width} cm`).join(", ")}.`;
    return { ...r, warning: r.warning ? `${note} ${r.warning}` : note };
  }
  return fail(cfg, refuse);
}

/**
 * An edited wall-unit list flows (plan.ts flowUpper): each unit goes into the first stretch — between the window, the
 * hood, a column and the row's ends — from the current one that still has room. So a unit can slip into an earlier
 * stretch with room: the bare wall left of the window over bare floor when the planner's own wall units are made explicit,
 * a narrow stretch a 15 cm niche fits in. `x[i]`: where entry i hangs now (run-local cm; null = anywhere). Empty space
 * ("Bez gornjeg elementa") fills each stretch an entry must not slip into, so every unit stays in its stretch.
 */
function keepStretches(cfg: KitchenConfig, upId: ListId, list: CabinetSpec[], x: (number | null)[]): CabinetSpec[] {
  const seg = planList(planKitchen(sanitizeConfig(withList(cfg, upId, list))), upId)?.segments;
  if (!seg?.spans || x.length !== list.length) return list;
  const out: CabinetSpec[] = [];
  const flow = (caps: number[], spans: Range[], idx: number[]) => {
    const used = caps.map(() => 0);
    let cur = 0;
    for (const i of idx) {
      const e = list[i];
      const t = x[i] === null ? -1 : spans.findIndex((r) => (x[i] as number) >= r.from - 0.5 && (x[i] as number) < r.to + 0.5);
      for (let guard = 0; guard < caps.length + 1; guard++) {
        let k = -1;
        for (let j = cur; j < caps.length; j++) {
          if (used[j] + e.width <= caps[j] + 0.01) {
            k = j;
            break;
          }
        }
        if (k < 0 || t < 0 || k >= t) {
          if (k >= 0) [cur, used[k]] = [k, used[k] + e.width];
          break;
        }
        // it would slip into stretch k before its own: the rest of k stays bare wall
        const pad = Math.floor(caps[k] - used[k] + 1e-6);
        if (pad >= 5) out.push({ type: SPACER.upper, width: pad });
        used[k] = caps[k];
        cur = k;
      }
      out.push(e);
    }
  };
  const all = list.map((_, i) => i);
  const h = seg.hoodAt;
  if (h === null || h < 0 || h >= list.length) flow(seg.left, seg.spans.left, all);
  else {
    flow(seg.left, seg.spans.left, all.filter((i) => i < h));
    out.push(list[h]);
    flow(seg.right, seg.spans.right, all.filter((i) => i > h));
  }
  return out.length === list.length ? list : out;
}

/** an element that may give way for a seam insert: its list index, entry, type and the widths it may take (widest first) */
interface SeamCand {
  i: number;
  e: CabinetSpec;
  widths: number[];
  feature: boolean;
}

/**
 * The ways `cands` (in the order they are asked) can give up `need` cm, best first, as list index → new width: one alone
 * (plain cabinets first, in their order, each as little as it can), then several — the fewest sinks / hobs /
 * dishwashers, then the fewest elements (the ones that give most), each widened back as far as the total still allows
 * (the sink / hob / dishwasher first, then the farthest).
 */
function narrowings(cands: SeamCand[], need: number): Map<number, number>[] {
  const out: Map<number, number>[] = [];
  const most = (c: SeamCand) => c.e.width - c.widths[c.widths.length - 1];
  for (const feature of [false, true]) {
    for (const c of cands) {
      if (c.feature !== feature) continue;
      const w = c.widths.find((x) => c.e.width - x >= need - 0.5);
      if (w !== undefined) out.push(new Map([[c.i, w]]));
    }
  }
  const plain = cands.filter((c) => !c.feature).sort((p, q) => most(q) - most(p));
  const feats = cands.filter((c) => c.feature).sort((p, q) => most(q) - most(p));
  for (let nf = 0; nf <= feats.length; nf++) {
    const chosen = feats.slice(0, nf);
    let sum = chosen.reduce((n, c) => n + most(c), 0);
    for (const c of plain) {
      if (sum >= need - 0.5) break;
      chosen.push(c);
      sum += most(c);
    }
    if (sum < need - 0.5 || chosen.length < 2) continue;
    // each at its narrowest, then widened back as far as the total allows: the sink / hob / dishwasher first, then the farthest
    const ways = new Map(chosen.map((c) => [c.i, c.widths[c.widths.length - 1]]));
    const relax = [...chosen].sort((p, q) => Number(q.feature) - Number(p.feature) || cands.indexOf(q) - cands.indexOf(p));
    for (const c of relax) {
      const others = [...ways].reduce((n, [i, w]) => n + (i === c.i ? 0 : (cands.find((x) => x.i === i)!.e.width - w)), 0);
      const w = c.widths.find((x) => others + c.e.width - x >= need - 0.5);
      if (w !== undefined) ways.set(c.i, w);
    }
    for (const [i, w] of [...ways]) if (w >= (cands.find((x) => x.i === i)!.e.width - 0.5)) ways.delete(i);
    if (!out.some((m) => m.size === ways.size && [...m].every(([i, w]) => ways.get(i) === w))) out.push(ways);
  }
  return out;
}

/**
 * where the wall units of a seam's row hang now (keepStretches): entry j of the (made explicit) list at its slot's centre,
 * and the joint — a point inside the stretch the new element is to go into. `map` collects entry objects → x for the caller.
 */
function upperTargets(plan: KitchenPlan, gap: PlanGap, list: CabinetSpec[]): { x: (j: number) => number | null; joint: number | null; map: Map<CabinetSpec, number | null> } {
  const at = new Map(plan.slots.filter((s) => s.list?.id === gap.list).map((s) => [s.list!.index, s.x + s.width / 2]));
  const inRow = (sid: string | undefined) => plan.slots.find((s) => s.id === sid && s.list?.id === gap.list);
  const a = inRow(gap.between?.[0]);
  const b = inRow(gap.between?.[1]);
  const r = inRow(gap.replace);
  const joint = r ? r.x + r.width / 2 : a ? a.x + a.width - 1 : b ? b.x + 1 : null;
  return { x: (j) => (j < list.length ? (at.get(j) ?? null) : null), joint, map: new Map() };
}

/** the seam's elements still stand where planGaps found them in the (made explicit) list */
function seamHolds(plan: KitchenPlan, gap: PlanGap, list: CabinetSpec[]): boolean {
  const at = gap.index;
  const ok = (sid: string, i: number) => {
    const s = plan.slots.find((x) => x.id === sid);
    // (beside a stretch of one element: what stands outside the row, or nothing)
    if (!s || s.list?.id !== gap.list) return true;
    return s.list.index === i && list[i]?.type === s.type && Math.abs(list[i].width - s.width) < 0.05;
  };
  if (gap.replace) return ok(gap.replace, at);
  const [a, b] = gap.between ?? ["", ""];
  return ok(a, at - 1) && ok(b, at);
}

/**
 * A seam where nothing can make room (`gap.replace`): the new element takes that element's place — wall units: what it
 * does not take stays bare wall beside it ("Bez gornjeg elementa"), so the others stay put; base cabinets and the island
 * slide. Says what it replaced.
 */
function replaceAtSeam(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, c1: KitchenConfig, list: CabinetSpec[], el: CabinetSpec, refuse: string): EditResult {
  const id = gap.list;
  const z = listZone(id);
  const i = gap.index;
  const cur = list[i];
  if (!cur) return fail(cfg, "Tog mjesta više nema.");
  if (cur.type === el.type && Math.abs(cur.width - el.width) < 0.5) return fail(cfg, "Na tom mjestu već stoji taj element.");
  const next = list.map(copyEntry);
  next[i] = el;
  const tgt = upperTargets(plan, gap, list);
  next.forEach((e, j) => tgt.map.set(e, tgt.x(j)));
  const rest = cur.width - el.width;
  if (rest > 0.5 && z === "base") {
    // a wall's base row keeps its cabinets (and a column in it, the wall units over them) where they are: what the new
    // element leaves of the place stays beside it — empty space with its own "+", a sliver as a filler strip
    next.splice(i + 1, 0, rest >= GAP_MIN ? { type: SPACER.base, width: rest } : { type: "filer", width: rest });
  } else if (rest > 0.5) keepRoom(next, i, rest, z);
  else if (el.width > cur.width) growInto(next, i, el.width - cur.width, z);
  const tidied = tidy(next, z, el);
  // wall units: each stays in its stretch (keepStretches)
  const final = z === "upper" ? keepStretches(c1, id, tidied, tidied.map((e) => tgt.map.get(e) ?? null)) : tidied;
  const r0 = commitPlan(cfg, plan, null, withList(c1, id, final), id, final.indexOf(el), refuse);
  const r = z === "upper" ? onTheGap(cfg, r0, gap, refuse) : r0;
  if (!r.ok) return r;
  const d = defOf(z, cur.type);
  const notes = [`Novi element stoji umjesto susjednog (${d ? `${d.name.charAt(0).toLowerCase()}${d.name.slice(1)}` : cur.type}, ${cur.width} cm).`];
  // a sink / hob / dishwasher that went is named (as when a tall unit takes its place)
  if (d?.feature) notes.push(d.feature === "sink" ? `${d.name} (${cur.width} cm) je uklonjen — dodajte ga na drugo mjesto.` : `${d.name} (${cur.width} cm) je uklonjena — dodajte je na drugo mjesto.`);
  if (r.warning) notes.push(r.warning);
  return { ...r, warning: notes.join(" ") };
}

/** a wall unit put into a gap must hang on that bare wall (the list could flow it elsewhere): else the refusal */
function onTheGap(cfg0: KitchenConfig, r: EditResult, gap: PlanGap, refuse: string): EditResult {
  if (!r.ok) return r;
  const sl = r.slotId ? planKitchen(r.cfg).slots.find((s) => s.id === r.slotId) : undefined;
  if (!sl || sl.x + sl.width <= gap.from + 0.5 || sl.x >= gap.to - 0.5) return fail(cfg0, refuse);
  return r;
}

/**
 * A wall unit at a free end of the wall-unit row (PlanGap kind "upper" with a side): onto that end of the wall-unit list,
 * over the bare floor there, and — when it needs more room — with the kitchen run grown into the bare wall beyond it.
 * The base cabinets stay as they are (made explicit), so the floor under the new wall unit stays bare.
 */
function insertUpperEnd(cfg: KitchenConfig, plan: KitchenPlan, gap: PlanGap, el: CabinetSpec, refuse: string): EditResult {
  if (el.width > gap.maxWidth + 0.5) return fail(cfg, refuse);
  const wall = gap.run as WallId;
  const side = gap.side ?? "right";
  const upId = gap.list;
  if ((planList(plan, upId)?.entries.length ?? 0) >= MAX_LIST) return fail(cfg, fullNote("upper"));
  const k = kitchenRange(cfg, wall);
  const dir = side === "left" ? -1 : 1;
  const kEnd = side === "left" ? k.from : k.to;
  // the row's edge (where the new unit starts) and the far end of the bare wall
  const S = side === "left" ? gap.to : gap.from;
  const E = side === "left" ? gap.from : gap.to;
  const room = Math.max(0, dir * (E - kEnd));
  const g0 = Math.max(0, Math.ceil(dir * (S - kEnd) + el.width - 1e-6));
  let last: EditResult = fail(cfg, refuse);
  // the end panel(s) of a new stretch beyond the window may need a little more
  for (const g of [...new Set([g0, g0 + DIM.panel, g0 + 2 * DIM.panel])]) {
    if (g > room + 0.5) break;
    const c1 = materializeLists(cfg, plan, g > 0 ? [wall, upId] : [upId]);
    const list = (listOf(c1, upId) ?? []).map((e) => ({ ...e }));
    const at = side === "left" ? 0 : list.length;
    const next = withList(extendRun(c1, wall, side, g), upId, [...list.slice(0, at), el, ...list.slice(at)]);
    last = onTheGap(cfg, commitPlan(cfg, plan, null, next, upId, at, refuse), gap, refuse);
    if (last.ok) return last;
  }
  return last;
}

/**
 * The tall columns on `wall` that `after` places and `before` did not (growing a run can let a column that did not fit
 * stand again), `except` the list being edited: their lists and their width incl. cover panels (cm).
 */
function revivedTall(before: KitchenPlan, after: KitchenPlan, wall: WallId, except: ListId): { cm: number; ids: ListId[] } {
  const placed = (p: KitchenPlan) => new Set(p.slots.filter((s) => s.zone === "tall" && s.run === wall && s.list).map((s) => s.list!.id));
  const was = placed(before);
  let cm = 0;
  const ids: ListId[] = [];
  for (const id of placed(after)) {
    if (id === except || was.has(id)) continue;
    ids.push(id);
    cm += after.slots.filter((s) => s.list?.id === id).reduce((n, s) => n + s.width, 0) + 2 * DIM.panel;
  }
  return { cm, ids };
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

// ---------------------------------------------------------------- hoods, glass, element options, worktop, backsplash, rails

/**
 * Hoods (KitchenConfig.hood): what the hood controls can offer and what the kitchen has now. `hobs` are the hobs of the
 * kitchen with the hood each gets — its own (CabinetSpec.opt.hood, `own`) or the kitchen's — and a visible wall hood's
 * width (follows the hob: catalog hoodWidthFor). `finishShown` / `islandShown`: whether that control means anything now.
 */
export interface HoodChoices {
  kind: HoodKind;
  kinds: { id: HoodKind; name: string; note: string; current: boolean }[];
  finish: HoodFinish;
  finishes: { id: HoodFinish; name: string; swatch: string; current: boolean }[];
  island: IslandHoodStyle;
  islandStyles: { id: IslandHoodStyle; name: string; note: string; current: boolean }[];
  hobs: { slotId: string; run: RunRef; kind: HoodKind; own: boolean; width: number | null }[];
  finishShown: boolean;
  islandShown: boolean;
}

export function hoodChoices(input: KitchenConfig): HoodChoices {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const kind = cfg.hood?.kind ?? "ugradbena";
  const finish = hoodFinishOf(cfg);
  const island = cfg.hood?.island ?? "dimnjak";
  const hobs = plan.slots
    .filter((s) => (s.zone === "base" || s.zone === "island") && moduleDef("base", s.type)?.feature === "hob")
    .map((s) => {
      const k = hoodKindOf(cfg, s.opt);
      const wall = plan.runs.flatMap((r) => r.hoods).find((h) => h.hob === s.id);
      const width = wall ? wall.width : s.zone === "island" && plan.island?.hood ? plan.island.hood.width : null;
      return { slotId: s.id, run: s.run as RunRef, kind: k, own: Boolean(s.opt?.hood), width };
    });
  return {
    kind,
    kinds: catalog.hoods.kinds.map((h) => ({ id: h.id, name: h.name, note: h.note, current: h.id === kind })),
    finish,
    finishes: catalog.hoods.finishes.map((f) => ({ id: f.id, name: f.name, swatch: f.swatch, current: f.id === finish })),
    island,
    islandStyles: catalog.hoods.islandStyles.map((h) => ({ id: h.id, name: h.name, note: h.note, current: h.id === island })),
    hobs,
    finishShown: plan.runs.some((r) => r.hoods.length > 0) || Boolean(plan.island?.hood),
    islandShown: Boolean(plan.island?.hood) || (hasIsland(cfg.layout) && plan.slots.some((s) => s.zone === "island" && moduleDef("base", s.type)?.feature === "hob")),
  };
}

/** Croatian notes on what a change of hoods did to the wall units and the plan (new planner notes) */
function hoodNotes(before: KitchenPlan, after: KitchenPlan): string[] {
  const notes: string[] = [];
  const ups = (p: KitchenPlan, w: WallId) => p.slots.filter((s) => s.run === w && s.zone === "upper" && !moduleDef("upper", s.type)?.spacer).length;
  for (const r of after.runs) {
    const was = before.runs.find((x) => x.wall === r.wall);
    if (r.hoods.length > (was?.hoods.length ?? 0)) {
      const gone = ups(before, r.wall) - ups(after, r.wall);
      notes.push(
        gone > 0
          ? `Zid ${r.wall.toUpperCase()}: iznad ploče je sada vidljiva napa — ${gone === 1 ? "jedan gornji element je maknut" : `${gone} gornja elementa su maknuta`}.`
          : `Zid ${r.wall.toUpperCase()}: iznad ploče je sada vidljiva napa.`,
      );
    }
  }
  const old = new Set(before.warnings);
  for (const w of after.warnings) if (!old.has(w)) notes.push(w);
  return notes;
}

/**
 * Change the kitchen's hoods (KitchenConfig.hood): `patch` merges into it (a field set to undefined goes back to its
 * default); null = every older link (hidden in a wall unit, island canopy). A visible wall hood ("dimnjak" / "kosa")
 * takes the place of the wall units above each hob (the planner re-flows them; an edited wall-unit list keeps them in
 * the config, so going back to "ugradbena" brings them back), its width follows the hob; "ploca" = a downdraft hob, no
 * hood at all (the island's neither). Per hob: setElementOptions(cfg, hobSlot, { hood }). Always ok; `warning` says what
 * moved.
 *
 *   setHood(cfg, { kind: "dimnjak", finish: "crna" })   // black chimney hoods above the wall hobs
 *   setHood(cfg, { island: "kaseta" })                   // a ceiling cassette above the island hob
 */
export function setHood(input: KitchenConfig, patch: Partial<HoodSpec> | null): EditResult {
  const cfg0 = sanitizeConfig(input);
  const plan0 = planKitchen(cfg0);
  const hood: HoodSpec | undefined = patch === null ? undefined : { ...(cfg0.hood ?? {}), ...patch };
  if (hood) for (const k of Object.keys(hood) as (keyof HoodSpec)[]) if (hood[k] === undefined) delete hood[k];
  const cfg = sanitizeConfig({ ...cfg0, hood });
  const notes = hoodNotes(plan0, planKitchen(cfg));
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null };
}

/** Glass of glass-door elements: the kitchen's default (or one element's, with `slotId`) and what can be chosen. */
export interface GlassChoices {
  value: Required<GlassSpec>;
  /** with `slotId`: what the element sets itself (CabinetSpec.opt.glass), else the kitchen's (KitchenConfig.glass) */
  own: GlassSpec | null;
  types: { id: GlassType; name: string; note: string; swatch: string; current: boolean }[];
  frames: { id: GlassFrame; name: string; swatch: string; current: boolean }[];
  /** glass-door elements in the kitchen (the kitchen's glass applies to them) */
  elements: number;
}

export function glassChoices(input: KitchenConfig, slotId?: string): GlassChoices | null {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  let opt: ElementOpts | undefined;
  if (slotId) {
    const s = plan.slots.find((x) => x.id === slotId);
    if (!s || !moduleDef(s.zone, s.type)?.glass) return null;
    opt = s.opt;
  }
  const value = glassOf(cfg, opt);
  return {
    value,
    own: slotId ? (opt?.glass ?? null) : (cfg.glass ?? null),
    types: catalog.glass.types.map((g) => ({ id: g.id, name: g.name, note: g.note, swatch: g.swatch, current: g.id === value.type })),
    frames: catalog.glass.frames.map((f) => ({ id: f.id, name: f.name, swatch: f.swatch, current: f.id === value.frame })),
    elements: plan.slots.filter((s) => moduleDef(s.zone, s.type)?.glass).length,
  };
}

/**
 * The kitchen's default glass for glass-door elements (KitchenConfig.glass): `patch` merges (undefined = back to the
 * default of that field), null = clear glass in a front-coloured frame with LED and glass shelves (every older vitrine).
 * Elements with their own glass (opt.glass) keep it, field by field. Always ok.
 */
export function setGlass(input: KitchenConfig, patch: Partial<GlassSpec> | null): EditResult {
  const cfg0 = sanitizeConfig(input);
  const glass: GlassSpec | undefined = patch === null ? undefined : { ...(cfg0.glass ?? {}), ...patch };
  if (glass) for (const k of Object.keys(glass) as (keyof GlassSpec)[]) if (glass[k] === undefined) delete glass[k];
  return { cfg: sanitizeConfig({ ...cfg0, glass }), ok: true, warning: null, slotId: null };
}

/**
 * What one element can have of its own (ElementOpts) — each null when it does not apply to the element's type — with
 * the value it has now (`own`: set on the element, else the kitchen's). `editable` false for corner units: they are
 * not list entries and follow the kitchen's settings.
 */
export interface ElementOptionsInfo {
  slotId: string;
  editable: boolean;
  /** opening style (anything with fronts): KitchenConfig.handles or its own */
  open: { value: HandleStyle; own: boolean; options: { id: HandleStyle; name: string; note: string }[] } | null;
  /** glass-door elements */
  glass: GlassChoices | null;
  /** wall units with a top box: its depth in a "do stropa" second row (`shown`: the kitchen has that row now) */
  depth: { value: number; own: boolean; options: number[]; shown: boolean } | null;
  /** hobs: the hood above it, and a visible wall hood's width */
  hood: { value: HoodKind; own: boolean; options: { id: HoodKind; name: string; note: string }[]; width: number | null } | null;
  /** floating shelves: boards */
  rows: { value: number; options: number[] } | null;
  /** lit open units (floating shelves, open niches): LED */
  led: { value: boolean } | null;
}

export function elementOptions(input: KitchenConfig, slotId: string): ElementOptionsInfo | null {
  const ctx = context(input, slotId);
  if (!ctx) return null;
  const { cfg, plan, slot } = ctx;
  const def = moduleDef(slot.zone, slot.type);
  if (!def || def.spacer) return null;
  const o = slot.opt;
  const lit = def.lit || def.rows;
  return {
    slotId,
    editable: Boolean(slot.list) && !slot.corner,
    open:
      def.demo !== false
        ? { value: openingOf(cfg, o), own: Boolean(o?.open), options: catalog.handles.map((h) => ({ id: h.id, name: h.name, note: h.note })) }
        : null,
    glass: def.glass ? glassChoices(cfg, slotId) : null,
    depth:
      slot.zone === "upper" && !def.noTopBox
        ? { value: topDepthOf(cfg, o), own: o?.depth !== undefined, options: [...TOP_DEPTHS], shown: Boolean(plan.heights.topRow) }
        : null,
    hood:
      def.feature === "hob"
        ? {
            value: hoodKindOf(cfg, o),
            own: Boolean(o?.hood),
            options: catalog.hoods.kinds.map((h) => ({ id: h.id, name: h.name, note: h.note })),
            width: plan.runs.flatMap((r) => r.hoods).find((h) => h.hob === slotId)?.width ?? null,
          }
        : null,
    rows: def.rows ? { value: shelvesOf(o).rows, options: [...SHELF_ROWS] } : null,
    led: lit ? { value: o?.led !== false } : null,
  };
}

/**
 * Set one element's own options (CabinetSpec.opt): `patch` merges into what it has (a field set to undefined goes back
 * to the kitchen's; `glass` merges field by field, glass: undefined drops all of it), null = all back to the kitchen's.
 * Only what applies to the element's type is kept (plan.ts cleanOpts). The first edit of a run makes it an explicit
 * list, like every element edit. A hob's own hood re-flows the wall units above it (like setHood). Refused for corner
 * units (they follow the kitchen's settings) and empty space.
 *
 *   setElementOptions(cfg, "a-upper-3", { glass: { type: "satinirano", frame: "alu-crni" } })
 *   setElementOptions(cfg, "a-base-2", { open: "push" })
 *   setElementOptions(cfg, "a-base-4", { hood: "dimnjak" })     // this hob: a chimney hood
 *   setElementOptions(cfg, "b-upper-1", { rows: 3, led: false }) // floating shelves
 */
export function setElementOptions(input: KitchenConfig, slotId: string, patch: Partial<ElementOpts> | null): EditResult {
  const ctx = context(input, slotId);
  if (!ctx) return fail(sanitizeConfig(input), "Element više ne postoji.");
  const ls = listSlot(ctx);
  if (!ls || ctx.slot.corner) return fail(ctx.cfg, "Kutni element preuzima postavke cijele kuhinje.", slotId);
  const def = defOf(ls.ez, ctx.slot.type);
  if (!def || def.spacer) return fail(ctx.cfg, "Prazno mjesto nema postavki.", slotId);
  const { cfg, list } = editable(ctx, ls.id);
  const e = list[ls.index];
  if (!e) return fail(ctx.cfg, "Element više ne postoji.", slotId);
  let merged: Record<string, unknown> = {};
  if (patch !== null) {
    merged = { ...(e.opt ?? {}) };
    for (const [k, v] of Object.entries(patch)) {
      if (k === "glass" && v && typeof v === "object") {
        const g: Record<string, unknown> = { ...((e.opt?.glass as Record<string, unknown> | undefined) ?? {}) };
        for (const [gk, gv] of Object.entries(v)) {
          if (gv === undefined || gv === null) delete g[gk];
          else g[gk] = gv;
        }
        merged.glass = g;
      } else if (v === undefined || v === null) delete merged[k];
      else merged[k] = v;
    }
  }
  const opt = cleanOpts(merged, ls.ez, e.type);
  if (opt) e.opt = opt;
  else delete e.opt;
  const next = sanitizeConfig(withList(cfg, ls.id, list));
  const plan = planKitchen(next);
  const placed = placedIndex(listOf(next, ls.id), planList(plan, ls.id), ls.index);
  const sl = plan.slots.find((s) => s.list?.id === ls.id && s.list.index === placed);
  if (!sl) return fail(ctx.cfg, "Ta postavka ne može se primijeniti na ovaj element.", slotId);
  const notes = hoodNotes(ctx.plan, plan);
  return { cfg: next, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: sl.id };
}

/** worktop thicknesses (catalog.worktopThickness) and the one the kitchen has */
export function worktopChoices(input: KitchenConfig): { value: number; options: { value: number; name: string; note: string; current: boolean }[] } {
  const cfg = sanitizeConfig(input);
  const value = worktopThickness(cfg);
  return { value, options: catalog.worktopThickness.map((t) => ({ value: t.value, name: t.name, note: t.note, current: Math.abs(t.value - value) < 1e-6 })) };
}

/**
 * The worktop's thickness (cm, catalog.worktopThickness: 1.2 / 2 / 4 / 6; other values snap to the nearest). The plinth
 * takes the difference, so the worktop stays at its height (an 85 cm worktop 6 cm thick: 87 cm — the note says so).
 */
export function setWorktop(input: KitchenConfig, patch: { thickness?: number } | null): HeightsResult {
  const cfg0 = sanitizeConfig(input);
  const t = patch?.thickness;
  const cfg = sanitizeConfig({ ...cfg0, worktop: patch === null || t === undefined ? undefined : { thickness: t } });
  const plan = planKitchen(cfg);
  const notes: string[] = [];
  const want = cfg0.heights?.worktop ?? STANDARD_WORKTOP;
  if (Math.abs(plan.heights.worktop - want) > 0.05) notes.push(`Uz ploču od ${worktopThickness(cfg)} cm radna je ploča na ${plan.heights.worktop} cm (postolje je najmanje 5 cm).`);
  if (t !== undefined && !catalog.worktopThickness.some((x) => Math.abs(x.value - t) < 1e-6)) {
    notes.push(`Radna ploča dolazi u debljinama ${catalog.worktopThickness.map((x) => x.name).join(", ")}.`);
  }
  return { cfg, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null, heights: plan.heights, notes };
}

/** the backsplash kinds, their finishes (glass colours / tiles) and what the kitchen has */
export function backsplashChoices(input: KitchenConfig): {
  kind: BacksplashKind;
  finish: string | null;
  kinds: { id: BacksplashKind; name: string; current: boolean }[];
  finishes: { id: string; kind: "staklo" | "plocice"; name: string; swatch: string; current: boolean }[];
} {
  const cfg = sanitizeConfig(input);
  const b = backsplashOfCfg(cfg);
  const names: Record<BacksplashKind, string> = {
    ploca: "Kao radna ploča",
    pola: "Kao radna ploča, do pola visine",
    staklo: "Staklo u boji",
    plocice: "Pločice",
    bez: "Bez obloge",
  };
  return {
    kind: b.kind,
    finish: b.finish,
    kinds: (Object.keys(names) as BacksplashKind[]).map((id) => ({ id, name: names[id], current: id === b.kind })),
    finishes: catalog.backsplashes.map((d) => ({ id: d.id, kind: d.kind, name: d.name, swatch: d.swatch, current: d.id === b.finish })),
  };
}

/**
 * What covers the wall between the worktop and the wall units (KitchenConfig.backsplash): a kind (with a finish for glass /
 * tiles — a finish alone names its kind: { finish: "hex-crne" }), null = the worktop material up to the wall units
 * (every older link). Refused for an unknown finish or one of another kind.
 */
export function setBacksplash(input: KitchenConfig, spec: { kind?: BacksplashKind; finish?: string } | null): EditResult {
  const cfg0 = sanitizeConfig(input);
  if (spec === null) return { cfg: sanitizeConfig({ ...cfg0, backsplash: undefined }), ok: true, warning: null, slotId: null };
  const f = spec.finish !== undefined ? backsplashDef(spec.finish) : undefined;
  if (spec.finish !== undefined && !f) return fail(cfg0, "Nepoznata obloga.");
  const kind = spec.kind ?? f?.kind ?? backsplashOfCfg(cfg0).kind;
  if (f && f.kind !== kind) return fail(cfg0, "Ta obloga nije te vrste.");
  const keep = backsplashOfCfg(cfg0);
  const finish = f?.id ?? (keep.kind === kind ? (keep.finish ?? undefined) : undefined);
  const next = sanitizeConfig({ ...cfg0, backsplash: { kind, ...(finish && (kind === "staklo" || kind === "plocice") ? { finish } : {}) } });
  return { cfg: next, ok: true, warning: null, slotId: null };
}

/** per wall of the layout: whether it has a hanging rail with hooks, and whether one fits there (its length, cm) */
export function railChoices(input: KitchenConfig): { wall: WallId; on: boolean; fits: boolean; length: number }[] {
  const cfg = sanitizeConfig(input);
  const all = planKitchen({ ...cfg, rails: wallsFor(cfg.layout) });
  return all.runs.map((r) => ({
    wall: r.wall,
    on: Boolean(cfg.rails?.includes(r.wall)),
    fits: Boolean(r.rail),
    length: r.rail ? Math.round(r.rail.to - r.rail.from) : 0,
  }));
}

/** A hanging rail with hooks on a wall's backsplash (KitchenConfig.rails), on or off; refused where none fits. */
export function setRail(input: KitchenConfig, wall: WallId, on: boolean): EditResult {
  const cfg0 = sanitizeConfig(input);
  const rails = new Set(cfg0.rails ?? []);
  if (on) rails.add(wall);
  else rails.delete(wall);
  const next = sanitizeConfig({ ...cfg0, rails: [...rails] });
  if (on && !planKitchen(next).runs.find((r) => r.wall === wall)?.rail) return fail(cfg0, `Na zidu ${wall.toUpperCase()} nema mjesta za reling (treba barem ${DIM.railMin + 20} cm radne ploče bez prozora).`);
  return { cfg: next, ok: true, warning: null, slotId: null };
}

/**
 * Floating shelves instead of the wall units of a whole wall ("viseće police" over the whole stretch): every wall unit of
 * the wall's list (not empty space, the hood above the hob, the corner unit or a width the shelves do not come in)
 * becomes floating shelves ("police-visece") of the same width, with `rows` boards (1–3) and the LED on / off. null =
 * the floating shelves of that wall become wall units with doors again. Refused on a wall without wall units.
 */
export function setWallShelves(input: KitchenConfig, wall: WallId, opts: { rows?: number; led?: boolean } | null): EditResult {
  const cfg0 = sanitizeConfig(input);
  const plan0 = planKitchen(cfg0);
  const id = `${wall}:u` as ListId;
  const l = planList(plan0, id);
  if (!l || !l.entries.length) return fail(cfg0, `Na zidu ${wall.toUpperCase()} nema gornjih elemenata.`);
  const cfg = materializeLists(cfg0, plan0, [id]);
  const shelf = moduleDef("upper", "police-visece");
  const door = moduleDef("upper", "vrata");
  if (!shelf || !door) return fail(cfg0, "Viseće police nisu u katalogu.");
  let changed = 0;
  const list = (listOf(cfg, id) ?? []).map((e) => {
    const d = moduleDef("upper", e.type);
    if (!d || d.spacer || d.hood) return copyEntry(e);
    if (opts === null) {
      if (e.type !== shelf.id || !widthAllowed(door, e.width)) return copyEntry(e);
      changed++;
      const { rows: _r, led: _l, ...rest } = e.opt ?? {};
      void _r;
      void _l;
      return Object.keys(rest).length ? { type: door.id, width: e.width, opt: rest } : { type: door.id, width: e.width };
    }
    if (!widthAllowed(shelf, e.width)) return copyEntry(e);
    changed++;
    const opt = cleanOpts({ ...(e.type === shelf.id ? e.opt : {}), ...(opts.rows !== undefined ? { rows: opts.rows } : {}), ...(opts.led !== undefined ? { led: opts.led } : {}) }, "upper", shelf.id);
    return opt ? { type: shelf.id, width: e.width, opt } : { type: shelf.id, width: e.width };
  });
  if (!changed) return fail(cfg0, opts === null ? `Na zidu ${wall.toUpperCase()} nema visećih polica.` : `Na zidu ${wall.toUpperCase()} nema gornjih elemenata koje mogu zamijeniti police.`);
  const next = sanitizeConfig(withList(cfg, id, list));
  return { cfg: next, ok: true, warning: null, slotId: null };
}
