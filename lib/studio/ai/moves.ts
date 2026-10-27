/**
 * Moves the brief composer and the edit operations share, built only from lib/studio/edit.ts: step an element along its
 * row, bring it near a point (under the window), add an element somewhere on a wall, move an element to another wall
 * (a sink takes its dishwasher along), move a tall column to another end. Every helper returns an EditResult; a refused
 * one returns the input (sanitized) with a Croatian `warning`, never throws.
 */
import { allowedWidths, changeWidth, gapsOf, insertAfter, insertAtGap, insertBefore, moveLeft, moveRight, moveTall, remove, setElementOptions, tallPlaces, type EditResult } from "../edit";
import { copyEntry, isFillerEntry, isTallList, listOf, materializeLists, planKitchen, sanitizeConfig, wallsFor, withList, type PlanSlot, type TallListId } from "../plan";
import { moduleDef } from "../catalog";
import type { CabinetSpec, ElementOpts, KitchenConfig, Layout, RunEnd, WallId } from "../types";

export type Side = "lijevo" | "desno";
export type AddZone = "base" | "upper" | "tall" | "island";

export const fail = (cfg: KitchenConfig, warning: string): EditResult => ({ cfg, ok: false, warning, slotId: null });

export function slotOf(cfg: KitchenConfig, id: string): PlanSlot | undefined {
  return planKitchen(cfg).slots.find((s) => s.id === id);
}

/** a slot's place for finding it again after other edits renumbered the row */
export interface SlotRef {
  id: string;
  zone: PlanSlot["zone"];
  run: PlanSlot["run"];
  type: string;
  x: number;
}

export const refOf = (s: PlanSlot): SlotRef => ({ id: s.id, zone: s.zone, run: s.run, type: s.type, x: s.x });

/** the slot `ref` points at in this config: same id and type, else the same type in the same row nearest to where it was */
export function findAgain(cfg: KitchenConfig, ref: SlotRef): PlanSlot | null {
  const slots = planKitchen(cfg).slots;
  const same = slots.find((s) => s.id === ref.id && s.type === ref.type);
  if (same) return same;
  const cands = slots.filter((s) => s.run === ref.run && s.zone === ref.zone && s.type === ref.type);
  if (!cands.length) return null;
  return cands.sort((p, q) => Math.abs(p.x - ref.x) - Math.abs(q.x - ref.x))[0];
}

/** step an element `steps` places towards one end of its row (9 = as far as it goes); ok when it moved at least once */
export function step(cfg: KitchenConfig, slotId: string, dir: Side, steps = 1): EditResult {
  let cur: EditResult = { cfg: sanitizeConfig(cfg), ok: false, warning: null, slotId };
  let moved = 0;
  for (let i = 0; i < Math.max(1, Math.min(12, Math.round(steps) || 1)); i++) {
    const r = dir === "lijevo" ? moveLeft(cur.cfg, cur.slotId ?? slotId) : moveRight(cur.cfg, cur.slotId ?? slotId);
    if (!r.ok) {
      if (!moved) return { ...r, cfg: cur.cfg, slotId };
      break;
    }
    cur = r;
    moved++;
  }
  return { ...cur, ok: moved > 0, warning: moved ? cur.warning : "Element se ne može pomaknuti u tom smjeru." };
}

/** step an element along its row until its centre is as close as it gets to `x` (run-local cm) */
export function moveNear(cfg: KitchenConfig, slotId: string, x: number): EditResult {
  let cur: EditResult = { cfg: sanitizeConfig(cfg), ok: true, warning: null, slotId };
  for (let i = 0; i < 12; i++) {
    const s = cur.slotId ? slotOf(cur.cfg, cur.slotId) : undefined;
    if (!s) break;
    const d = s.x + s.width / 2 - x;
    if (Math.abs(d) < s.width / 2) break;
    const r = d > 0 ? moveLeft(cur.cfg, s.id) : moveRight(cur.cfg, s.id);
    if (!r.ok || !r.slotId) break;
    const n = slotOf(r.cfg, r.slotId);
    if (!n || Math.abs(n.x + n.width / 2 - x) >= Math.abs(d)) break;
    cur = r;
  }
  return cur;
}

const GAP_ORDER: Record<string, number> = { free: 0, end: 1, upper: 1, island: 1, seam: 2 };

/** cm of sinks, hobs and dishwashers in the kitchen, by kind — an insert that makes room must not take them */
function featureWidths(cfg: KitchenConfig): Record<string, number> {
  const out: Record<string, number> = {};
  for (const s of planKitchen(cfg).slots) {
    if (s.zone !== "base" && s.zone !== "island") continue;
    const f = moduleDef("base", s.type)?.feature;
    if (f) out[f] = (out[f] ?? 0) + s.width;
  }
  return out;
}
const featuresShrunk = (a: Record<string, number>, b: Record<string, number>) => Object.keys(a).some((k) => (b[k] ?? 0) < a[k] - 0.5);

/**
 * Add an element: next to `nextTo` (before it with side "lijevo", else after), or into the best "+" place of that zone
 * (on `wall` when given; empty space first, then a free end — `side` picks which — then a joint of a full row, the row
 * making room). Validated like every studio edit; refused with the last helper's reason.
 */
export function addElement(
  cfg0: KitchenConfig,
  req: { type: string; zone: AddZone; wall?: WallId | "isl" | null; side?: Side | null; nextTo?: string | null; width?: number | null },
): EditResult {
  const cfg = sanitizeConfig(cfg0);
  const width = req.width && req.width > 0 ? Math.round(req.width) : undefined;
  const lookup = req.zone === "island" ? "base" : req.zone;
  if (!moduleDef(lookup, req.type)) return fail(cfg, `Element „${req.type}“ ne postoji u katalogu za tu zonu.`);
  if (req.nextTo) {
    const s = slotOf(cfg, req.nextTo);
    if (s) {
      const zone = req.zone === "tall" ? "tall" : undefined;
      const r = req.side === "lijevo" ? insertBefore(cfg, s.id, req.type, width, zone) : insertAfter(cfg, s.id, req.type, width, zone);
      if (r.ok) return r;
      // the other side, then anywhere on its wall
      const r2 = req.side === "lijevo" ? insertAfter(cfg, s.id, req.type, width, zone) : insertBefore(cfg, s.id, req.type, width, zone);
      if (r2.ok) return r2;
      if (!req.wall && s.run !== "isl") req = { ...req, wall: s.run };
    }
  }
  const sideWord = req.side === "lijevo" ? "left" : req.side === "desno" ? "right" : null;
  const gaps = gapsOf(cfg)
    .filter((g) => {
      if (req.zone === "upper") return g.zone === "upper";
      if (req.zone === "island") return g.run === "isl";
      if (g.zone !== "base" || g.run === "isl") return false;
      return req.zone === "tall" ? g.kind === "end" || g.kind === "free" || g.kind === "seam" : true;
    })
    .filter((g) => !req.wall || g.run === req.wall)
    .sort((p, q) => {
      const o = (GAP_ORDER[p.kind] ?? 3) - (GAP_ORDER[q.kind] ?? 3);
      if (o) return o;
      if (sideWord) {
        const ps = p.side === sideWord ? 0 : 1;
        const qs = q.side === sideWord ? 0 : 1;
        if (ps !== qs) return ps - qs;
        return sideWord === "left" ? p.from - q.from : q.from - p.from;
      }
      return q.maxWidth - p.maxWidth;
    });
  let last: EditResult | null = null;
  const before = featureWidths(cfg);
  for (const g of gaps.slice(0, 10)) {
    const zone = req.zone === "tall" ? "tall" : req.zone === "upper" ? "upper" : req.zone === "island" ? "island" : "base";
    const r = insertAtGap(cfg, g.id, req.type, width, zone);
    if (r.ok && !featuresShrunk(before, featureWidths(r.cfg))) return r;
    last = r.ok ? fail(cfg, "Za to bi sudoper, ploča ili perilica morali biti uži.") : r;
  }
  const where = req.wall === "isl" ? "na otoku" : req.wall ? `na zidu ${req.wall.toUpperCase()}` : "u kuhinji";
  return fail(cfg, last?.warning ? `Nema mjesta ${where}: ${last.warning}` : `Nema mjesta ${where} za taj element.`);
}

/**
 * Change an element's width; when its row has no room, a plain neighbour (drawers, doors — never a sink, hob,
 * dishwasher, corner or tall unit) first gets as much narrower as it must. Refused with the studio's reason otherwise.
 */
export function resize(cfg0: KitchenConfig, slotId: string, width: number): EditResult {
  const cfg = sanitizeConfig(cfg0);
  const direct = changeWidth(cfg, slotId, width);
  if (direct.ok) return direct;
  const s = slotOf(cfg, slotId);
  if (!s || width <= s.width) return direct;
  const need = width - s.width;
  const ref = refOf(s);
  const plain = (p: PlanSlot) => !p.cornerId && !p.anchored && !moduleDef(p.zone === "upper" ? "upper" : "base", p.type)?.feature && p.zone === s.zone;
  const neighbours = planKitchen(cfg)
    .slots.filter((p) => p.run === s.run && p.id !== s.id && plain(p) && (Math.abs(p.x + p.width - s.x) < 1.5 || Math.abs(s.x + s.width - p.x) < 1.5))
    .sort((p, q) => q.width - p.width);
  for (const n of neighbours) {
    const option = allowedWidths(cfg, n.id)
      .filter((o) => o.fits && o.width <= n.width - need + 0.5 && o.width >= 30)
      .sort((p, q) => q.width - p.width)[0];
    if (!option) continue;
    const narrower = changeWidth(cfg, n.id, option.width);
    if (!narrower.ok) continue;
    const again = findAgain(narrower.cfg, ref);
    if (!again) continue;
    const r = changeWidth(narrower.cfg, again.id, width);
    if (r.ok) return { ...r, warning: [r.warning, `Element do njega je uži (${option.width} cm umjesto ${n.width} cm).`].filter(Boolean).join(" ") };
  }
  return direct;
}

/** the free run ends (not a corner) of this kitchen */
export function freeEnds(cfg: KitchenConfig): RunEnd[] {
  const out: RunEnd[] = [];
  for (const r of planKitchen(cfg).runs) for (const side of ["left", "right"] as const) if (r.ends[side] !== "corner") out.push(`${r.wall}-${side}`);
  return out;
}

/**
 * "lijevo" / "desno" (as seen standing in the room, facing wall A) and / or a wall → a free run end for a tall column:
 * left = the open end of wall B (L / U / G) or the left end of A; right = the open end of wall C (U) or the right end
 * of A. null when the layout has no free end there.
 */
export function endFor(cfg: KitchenConfig, side: Side | null | undefined, wall: WallId | null | undefined): RunEnd | null {
  const free = freeEnds(cfg);
  const walls = wallsFor(cfg.layout);
  const bySide: RunEnd[] = side === "lijevo" ? ["b-left", "a-left", "c-left"] : side === "desno" ? ["c-right", "a-right", "b-right"] : [];
  if (wall && walls.includes(wall)) {
    // that end of that wall; when it is a corner, the side wins over the wall ("lijevo" on wall A of an L = wall B's open end)
    const exact: RunEnd[] = side === "lijevo" ? [`${wall}-left`] : side === "desno" ? [`${wall}-right`] : wall === "b" ? ["b-left", "b-right"] : [`${wall}-right`, `${wall}-left`];
    const order: RunEnd[] = [...exact, ...bySide, `${wall}-left`, `${wall}-right`];
    return order.find((e) => free.includes(e)) ?? null;
  }
  return bySide.find((e) => free.includes(e)) ?? null;
}

/** where a tall column stands now (null: not placed) */
export function columnEnd(cfg: KitchenConfig, list: "tall" | TallListId): RunEnd | null {
  return tallPlaces(cfg, list).find((p) => p.current)?.end ?? null;
}

const OWN_DIR: Record<"left" | "right", Side> = { left: "lijevo", right: "desno" };

/**
 * Move an element to another wall (or the island): a tall column of the kitchen moves to a free end of that wall
 * (moveTall); a base cabinet / wall unit / tall unit in a run is taken out and added there (a sink brings the dishwasher
 * beside it along), with its own options. All or nothing: refused, the kitchen stays as it was.
 */
export function moveToWall(cfg0: KitchenConfig, slotId: string, target: WallId | "isl", side?: Side | null): EditResult {
  const cfg = sanitizeConfig(cfg0);
  const plan = planKitchen(cfg);
  const s = plan.slots.find((x) => x.id === slotId);
  if (!s) return fail(cfg, "Taj element više ne postoji.");
  if (s.cornerId) return fail(cfg, "Kutni element ostaje u kutu.");
  if (target !== "isl" && !wallsFor(cfg.layout).includes(target)) return fail(cfg, `Ova kuhinja nema kuhinju na zidu ${target.toUpperCase()}.`);
  if (target === "isl" && !plan.island) return fail(cfg, "Ova kuhinja nema otok ni poluotok.");
  const list = s.list?.id;
  if (s.zone === "tall" && list && isTallList(list)) {
    if (target === "isl") return fail(cfg, "Visoki element ne može stajati na otoku.");
    const end = endFor(cfg, side, target);
    if (!end) return fail(cfg, `Na zidu ${target.toUpperCase()} nema slobodnog kraja za visoki stup.`);
    return moveTall(cfg, list as "tall" | TallListId, end);
  }
  if (s.run === target && !side) return { cfg, ok: true, warning: null, slotId };
  if (s.zone === "base" && s.run !== "isl" && target !== "isl" && s.run !== target) {
    const swapped = swapToWall(cfg, s, target);
    if (swapped) return swapped;
  }
  const zone: AddZone = s.zone === "upper" ? "upper" : s.zone === "tall" ? "tall" : target === "isl" ? "island" : "base";
  if (zone === "upper" && target === "isl") return fail(cfg, "Gornji element ne može na otok.");
  // the dishwasher right beside a sink goes with it
  const partner =
    s.type === "sudoper"
      ? plan.slots.find((p) => p.run === s.run && p.zone === s.zone && p.type === "perilica" && (Math.abs(p.x + p.width - s.x) < 1 || Math.abs(s.x + s.width - p.x) < 1))
      : undefined;
  const partnerRef = partner ? refOf(partner) : null;
  const partnerLeft = partner ? partner.x < s.x : false;
  let r = remove(cfg, s.id);
  if (!r.ok) return fail(cfg, r.warning ?? "Element se ne može premjestiti.");
  if (partnerRef) {
    const p = findAgain(r.cfg, partnerRef);
    if (p) {
      const r2 = remove(r.cfg, p.id);
      if (r2.ok) r = r2;
    }
  }
  // its own width first, then narrower ones of its type (a sink of 80 may become 60 on a shorter wall) — not below 45
  const def = moduleDef(zone === "island" ? "base" : zone, s.type);
  const widths = [s.width, ...(def?.widths ?? []).filter((x) => x < s.width && x >= 45).sort((p, q) => q - p)];
  let added: EditResult = fail(cfg, "Na tom zidu nema mjesta.");
  for (const width of widths) {
    added = addElement(r.cfg, { type: s.type, zone, wall: target, side, width });
    if (added.ok && added.slotId) {
      if (width !== s.width) added = { ...added, warning: [added.warning, `Element je sada širok ${width} cm (bio je ${s.width} cm).`].filter(Boolean).join(" ") };
      break;
    }
  }
  if (!added.ok || !added.slotId) return fail(cfg, added.warning ?? "Na tom zidu nema mjesta.");
  let cur = added;
  if (s.opt && Object.keys(s.opt).length) {
    const o = setElementOptions(cur.cfg, cur.slotId as string, s.opt as Partial<ElementOpts>);
    if (o.ok) cur = { ...o, slotId: o.slotId ?? cur.slotId };
  }
  if (partner) {
    // beside the sink (its width, else 45 cm), else elsewhere on that wall, else back where it was — never lost
    const placed = slotOf(cur.cfg, cur.slotId as string);
    const pz: AddZone = zone === "island" ? "island" : "base";
    const tries: Parameters<typeof addElement>[1][] = [
      ...[...new Set([partner.width, 45])].map((width) => ({ type: "perilica", zone: pz, nextTo: cur.slotId, side: (partnerLeft ? "lijevo" : "desno") as Side, width })),
      { type: "perilica", zone: pz, wall: target, width: 45 },
      { type: "perilica", zone: "base", wall: s.run, width: partner.width },
    ];
    let d: EditResult | null = null;
    let i = 0;
    for (; i < tries.length; i++) {
      d = addElement(cur.cfg, tries[i]);
      if (d.ok) break;
    }
    if (d?.ok) {
      const note = i === tries.length - 1 ? "Perilica posuđa nije stala uz sudoper — ostala je na starom zidu." : i === tries.length - 2 ? "Perilica posuđa nije stala tik uz sudoper." : null;
      cur = { ...d, slotId: (placed && findAgain(d.cfg, refOf(placed))?.id) ?? null, warning: [cur.warning, d.warning, note].filter(Boolean).join(" ") || null };
    } else return fail(cfg, "Sudoper i perilica posuđa ne stanu na taj zid.");
  }
  // what the element left behind on its old wall: plain cabinets instead of a hole
  if (s.run !== "isl" && s.run !== target && s.zone !== "upper") {
    const placed = cur.slotId ? slotOf(cur.cfg, cur.slotId) : undefined;
    const filled = fillEmpty(cur.cfg, s.run);
    cur = { ...cur, cfg: filled, slotId: placed ? (findAgain(filled, refOf(placed))?.id ?? cur.slotId) : cur.slotId };
  }
  return cur;
}

const PLAIN_GROUPS = new Set(["ladice", "vrata", "spremanje", "otvoreno"]);
/** a plain base cabinet of a wall's list: drawers / doors / storage — no sink, hob, dishwasher, tall unit or filler */
const isPlain = (e: CabinetSpec) => {
  const d = moduleDef("base", e.type);
  return Boolean(d && !e.tall && !d.feature && !d.spacer && !d.filler && !d.corner && PLAIN_GROUPS.has(d.group));
};

/** plain cabinets for `cm` of a run, widest first (drawers; doors below 45 cm); what is left under 30 cm the planner closes */
function plainFill(cm: number): CabinetSpec[] {
  const out: CabinetSpec[] = [];
  let left = Math.round(cm);
  while (left >= 30) {
    const w = [90, 80, 60, 50, 45, 40, 30].find((x) => x <= left) as number;
    out.push({ type: w >= 45 ? "ladice" : "vrata", width: w });
    left -= w;
  }
  return out;
}

/**
 * A sink (with the dishwasher beside it) or a hob to another wall by swapping places with plain cabinets there: on the
 * target wall the closest-sized stretch of drawers / doors (the one farthest from its hob) makes way, on the old wall
 * plain cabinets take the freed place — every width stays a real one, nothing is squeezed. null when the target wall
 * has no such stretch (the caller then tries an ordinary insert).
 */
function swapToWall(cfg: KitchenConfig, s: PlanSlot, target: WallId): EditResult | null {
  const plan = planKitchen(cfg);
  const c0 = materializeLists(cfg, plan, [s.run as WallId, target]);
  const p0 = planKitchen(c0);
  const me = findAgain(c0, refOf(s));
  if (!me?.list || me.list.id !== s.run) return null;
  const src = (listOf(c0, s.run as WallId) ?? []).map(copyEntry);
  const tgt = (listOf(c0, target) ?? []).map(copyEntry);
  // the dishwasher right beside a sink moves with it
  let from = me.list.index;
  let to = me.list.index;
  if (s.type === "sudoper") {
    if (src[from - 1]?.type === "perilica") from--;
    else if (src[to + 1]?.type === "perilica") to++;
  }
  const original = src.slice(from, to + 1);
  // the target's stretch of plain cabinets (and filler strips) closest to the room needed, farthest from its hob on a
  // tie; the moved sink / dishwasher may get narrower (sink down to 60, dishwasher 45) when no stretch is wide enough
  const hobAt = tgt.findIndex((e) => moduleDef("base", e.type)?.feature === "hob");
  const give = (e: CabinetSpec) => isPlain(e) || isFillerEntry(e);
  const variants: CabinetSpec[][] = [original];
  const sinkK = original.findIndex((e) => e.type === "sudoper");
  const dwK = original.findIndex((e) => e.type === "perilica");
  if (dwK >= 0 && original[dwK].width > 45) variants.push(original.map((e, k) => (k === dwK ? { ...e, width: 45 } : e)));
  if (sinkK >= 0 && original[sinkK].width > 60) {
    for (const v of [...variants]) variants.push(v.map((e, k) => (k === sinkK ? { ...e, width: 60 } : e)));
  }
  let pick: { moved: CabinetSpec[]; i: number; j: number; sum: number } | null = null;
  for (const moved of variants) {
    const need = moved.reduce((n, e) => n + e.width, 0);
    let best: { i: number; j: number; sum: number; far: number } | null = null;
    for (let i = 0; i < tgt.length; i++) {
      let sum = 0;
      for (let j = i; j < tgt.length && give(tgt[j]); j++) {
        sum += tgt[j].width;
        if (sum + 0.5 < need) continue;
        const far = hobAt < 0 ? 0 : Math.min(Math.abs(i - hobAt), Math.abs(j - hobAt));
        if (!best || sum < best.sum - 0.5 || (Math.abs(sum - best.sum) < 0.5 && far > best.far)) best = { i, j, sum, far };
        break;
      }
    }
    if (best) {
      pick = { moved, i: best.i, j: best.j, sum: best.sum };
      break;
    }
  }
  if (!pick) return null;
  const moved = pick.moved;
  const need = moved.reduce((n, e) => n + e.width, 0);
  const best = pick;
  const nextTgt = [...tgt.slice(0, best.i), ...moved, ...plainFill(best.sum - need), ...tgt.slice(best.j + 1)];
  const freed = original.reduce((n, e) => n + e.width, 0);
  const nextSrc = [...src.slice(0, from), ...plainFill(freed), ...src.slice(to + 1)];
  const next = sanitizeConfig(withList(withList(c0, s.run as WallId, nextSrc), target, nextTgt));
  const p1 = planKitchen(next);
  if (p1.lists.some((l) => l.dropped.length)) return null;
  const mine = moved.find((e) => e.type === s.type) as CabinetSpec;
  const landed = p1.slots.find((x) => x.run === target && x.zone === "base" && x.type === s.type && x.width === mine.width);
  if (!landed) return null;
  if ((p0.sinkId && !p1.sinkId) || (p0.hobId && !p1.hobId)) return null;
  const notes = moved.map((e, k) => (e.width !== original[k].width ? `${e.type === "sudoper" ? "Sudoper" : "Perilica posuđa"} je sada ${e.width} cm (bio je ${original[k].width} cm).` : "")).filter(Boolean);
  if (moved.length > 1) notes.unshift("Perilica posuđa ide zajedno sa sudoperom.");
  return { cfg: next, ok: true, warning: notes.join(" ") || null, slotId: landed.id };
}

/**
 * Fill bare floor a move left inside a wall's run with plain cabinets (drawers; doors below 45 cm), widest first — so a
 * sink taken off a wall does not leave a hole under the worktop. Only room inside the run, never growing it.
 */
export function fillEmpty(cfg0: KitchenConfig, wall: WallId): KitchenConfig {
  let cfg = sanitizeConfig(cfg0);
  const widthOf = (c: KitchenConfig) =>
    planKitchen(c)
      .slots.filter((x) => x.run === wall && x.zone === "base" && !moduleDef("base", x.type)?.spacer)
      .map((x) => [x.id, x.width] as const);
  for (let i = 0; i < 4; i++) {
    const plan = planKitchen(cfg);
    const list = plan.lists.find((l) => l.id === wall);
    const free = list ? list.capacity - list.used : 0;
    const width = [90, 80, 60, 50, 45, 40, 30].find((x) => x <= free + 0.5);
    if (!width) break;
    const before = widthOf(cfg);
    const total = before.reduce((n, [, w]) => n + w, 0);
    let done = false;
    for (const g of gapsOf(cfg).filter((x) => x.run === wall && x.zone === "base" && x.kind !== "end")) {
      const r = insertAtGap(cfg, g.id, width >= 45 ? "ladice" : "vrata", width, "base");
      // only into the free room: nothing else got narrower, the run did not grow
      if (r.ok && Math.abs(widthOf(r.cfg).reduce((n, [, w]) => n + w, 0) - (total + width)) < 0.5) {
        cfg = r.cfg;
        done = true;
        break;
      }
    }
    if (!done) break;
  }
  return cfg;
}

/** the side word of a run end (for notes) */
export const sideOfEnd = (e: RunEnd): Side => OWN_DIR[e.endsWith("left") ? "left" : "right"];

/** Croatian names of the layouts */
export const LAYOUT_NAME: Record<Layout, string> = {
  ravna: "ravna kuhinja (zid A)",
  L: "kuhinja u obliku slova L (zidovi A i B)",
  U: "kuhinja u obliku slova U (zidovi A, B i C)",
  otok: "kuhinja s otokom",
  poluotok: "kuhinja s poluotokom",
  G: "kuhinja u obliku slova G (L s poluotokom)",
};
