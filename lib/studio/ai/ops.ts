/**
 * Edit operations (schema.ts EditOp) on an EXISTING kitchen — one the customer may have edited by hand — applied in
 * order with the studio's own helpers (lib/studio/edit.ts, moves.ts, the composer's pieces). A refused operation leaves
 * the kitchen as it was and becomes a Croatian note; an unexpected error in one operation is caught and noted too —
 * applyOps never throws.
 *
 * Slot ids are positions, so they change as the rows change: every element an operation names is looked up in the
 * kitchen as it was when the model saw it and then found again in the current one (same type, same row, nearest place).
 */
import { moduleDef } from "../catalog";
import {
  changeType,
  kitchenExtent,
  moveTall,
  remove,
  removeColumn,
  setBareWall,
  setCeiling,
  setElementOptions,
  setFridge,
  setHeights,
  setHood,
  setKitchenExtent,
  setOvenColumn,
  setRoomCeiling,
  setRoomFinish,
  setRoomWall,
  setWallKitchen,
  setWallLength,
  roomWalls,
  type EditResult,
} from "../edit";
import { defaultAnchor, isTallList, planKitchen, sanitizeConfig, wallsFor, type PlanSlot, type TallListId } from "../plan";
import type { ElementOpts, HandleStyle, KitchenConfig, Layout, WallId } from "../types";
import { Work, applyIsland, applyStyle, composeWallUnits } from "./compose";
import { LAYOUT_NAME, addElement, endFor, fail, findAgain, moveToWall, refOf, resize, slotOf, step, type SlotRef, type Side } from "./moves";
import type { EditOp } from "./schema";
import { resolveFloor, resolveFridgeFinish, resolveRoomWall } from "./vocab";

export interface OpsResult {
  cfg: KitchenConfig;
  /** Croatian notes: refused operations (why), and what the done ones caused */
  notes: string[];
  applied: number;
  refused: number;
}

const pos = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
const said = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";
const W = (w: string) => w.toUpperCase();

/** what an operation is, for a refusal note ("Pomak elementa: nije išlo — …") */
const OP_WORD: Record<EditOp["op"], string> = {
  stil: "Promjena materijala",
  prostor: "Izgled prostorije",
  zid: "Promjena zida",
  strop: "Visina stropa",
  prozor: "Prozor",
  oblik: "Promjena oblika kuhinje",
  visine: "Promjena visina",
  pomakni: "Pomak elementa",
  premjesti: "Premještanje elementa",
  zamijeni: "Zamjena elementa",
  sirina: "Promjena širine",
  ukloni: "Uklanjanje elementa",
  dodaj: "Dodavanje elementa",
  hladnjak: "Hladnjak",
  pecnica: "Pećnica",
  napa: "Napa",
  otok: "Otok",
  gornji: "Gornji elementi",
  opcije: "Opcije elementa",
};

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

class Run {
  cfg: KitchenConfig;
  readonly notes: string[] = [];
  applied = 0;
  refused = 0;
  /** every slot of the kitchen the model was shown, by id */
  private readonly seen = new Map<string, SlotRef>();
  constructor(cfg: KitchenConfig) {
    this.cfg = sanitizeConfig(cfg);
    for (const s of planKitchen(this.cfg).slots) this.seen.set(s.id, refOf(s));
  }
  note(s: string | null | undefined) {
    if (s && !this.notes.includes(s)) this.notes.push(s);
  }
  /** the element an operation names, in the kitchen as it is now */
  slot(id: string): PlanSlot | null {
    const ref = this.seen.get(id);
    if (ref) return findAgain(this.cfg, ref);
    return slotOf(this.cfg, id) ?? null;
  }
}

/** run a Work-based composer step (materials, island, wall units) as an operation */
function viaWork(cfg: KitchenConfig, fn: (w: Work) => void): EditResult & { notes: string[] } {
  const w = new Work(cfg);
  fn(w);
  return { cfg: w.cfg, ok: true, warning: null, slotId: null, notes: w.notes };
}

function windowOf(cfg: KitchenConfig, op: Extract<EditOp, { op: "prozor" }>): KitchenConfig["window"] {
  if (op.wall === "nema") return null;
  const wall = op.wall as WallId;
  const cur = cfg.window && cfg.window.wall === wall ? cfg.window : null;
  const len = cfg.walls[wall];
  const width = pos(op.width) ? Math.round(op.width) : (cur?.width ?? 100);
  let offset = cur ? cur.offset : (len - width) / 2;
  if (pos(op.from_left)) offset = op.from_left;
  else if (op.position === "lijevo") offset = Math.min(60, len - width);
  else if (op.position === "sredina") offset = (len - width) / 2;
  else if (op.position === "desno") offset = Math.max(0, len - width - 60);
  return { wall, offset: Math.round(offset), width, sill: pos(op.sill) ? Math.round(op.sill) : (cur?.sill ?? 95) };
}

/** a layout change: switching a wall's kitchen on / off where that is all it is (keeps the rest), else the new layout as it comes */
function changeLayout(cfg: KitchenConfig, layout: Layout): EditResult {
  const from = cfg.layout;
  if (from === layout) return { cfg, ok: true, warning: null, slotId: null };
  const pairs: [Layout, Layout, WallId, boolean][] = [
    ["ravna", "L", "b", true],
    ["L", "ravna", "b", false],
    ["L", "U", "c", true],
    ["U", "L", "c", false],
    ["poluotok", "G", "b", true],
    ["G", "poluotok", "b", false],
  ];
  const p = pairs.find(([a, b]) => a === from && b === layout);
  if (p) {
    const r = setWallKitchen(cfg, p[2], p[3]);
    if (r.ok) return r;
  }
  const next = sanitizeConfig({ ...cfg, layout, room: cfg.room ? { ...cfg.room, bare: (cfg.room.bare ?? []).filter((w) => !wallsFor(layout).includes(w)) } : cfg.room });
  return { cfg: next, ok: true, warning: `Kuhinja je sada ${LAYOUT_NAME[layout]}.`, slotId: null };
}

const fridgeTypes = (t: string) => t === "hladnjak" || t === "hladnjak-sbs" || t === "hladnjak-sbs-vrata";
const ovenTypes = (t: string) => t === "pecnica" || t === "pecnica-mikro";

function fridgeOp(run: Run, op: Extract<EditOp, { op: "hladnjak" }>): EditResult {
  let cfg = run.cfg;
  const notes: string[] = [];
  const plan = planKitchen(cfg);
  let fridge = plan.slots.find((s) => s.zone === "tall" && fridgeTypes(s.type)) ?? null;
  // kind
  if (op.kind === "bez") {
    if (!fridge) return { cfg, ok: true, warning: null, slotId: null };
    return remove(cfg, fridge.id);
  }
  const wantType = op.kind === "side-by-side" ? (fridge?.type === "hladnjak-sbs-vrata" ? "hladnjak-sbs-vrata" : "hladnjak-sbs") : op.kind === "ugradbeni" ? "hladnjak" : null;
  if (wantType && fridge && fridge.type !== wantType) {
    const r = changeType(cfg, fridge.id, wantType, "tall");
    if (!r.ok) return r;
    cfg = r.cfg;
    fridge = r.slotId ? (slotOf(cfg, r.slotId) ?? null) : null;
  } else if (wantType && !fridge) {
    const end = endFor(cfg, (op.side || null) as Side | null, (op.wall || null) as WallId | null);
    const r = addElement(cfg, { type: wantType, zone: "tall", wall: end ? (end.split("-")[0] as WallId) : null, side: end ? (end.endsWith("left") ? "lijevo" : "desno") : null });
    if (!r.ok) return r;
    cfg = r.cfg;
    fridge = r.slotId ? (slotOf(cfg, r.slotId) ?? null) : null;
  }
  // place
  if ((op.side || op.wall) && fridge) {
    const end = endFor(cfg, (op.side || null) as Side | null, (op.wall || null) as WallId | null);
    if (!end) return fail(run.cfg, "Na toj strani kuhinja nema slobodan kraj za hladnjak.");
    const list = fridge.list?.id;
    const column = list && isTallList(list) ? (list as "tall" | TallListId) : null;
    const alone = column !== null && planKitchen(cfg).slots.filter((s) => s.list?.id === column).length === 1;
    // a fridge alone in its column: the column moves; else (or when another column stands there) the fridge leaves its
    // column and joins / starts one at that end; the whole column (oven and all) only as the last resort
    const moved = alone && column ? moveTall(cfg, column, end) : null;
    if (moved?.ok) cfg = moved.cfg;
    else {
      const out = remove(cfg, fridge.id);
      const back = out.ok ? addElement(out.cfg, { type: fridge.type, zone: "tall", wall: end.split("-")[0] as WallId, side: end.endsWith("left") ? "lijevo" : "desno", width: fridge.width }) : out;
      if (back.ok) cfg = back.cfg;
      else if (column && !alone) {
        const r = moveTall(cfg, column, end);
        if (!r.ok) return fail(run.cfg, back.warning ?? r.warning ?? "Hladnjak tamo ne stane.");
        cfg = r.cfg;
        notes.push("Hladnjak je premješten zajedno s cijelim visokim stupom.");
      } else return fail(run.cfg, `Na tom kraju nema mjesta za hladnjak${back.warning ? ` (${lowerFirst(back.warning.replace(/\.$/, ""))})` : ""} — ostao je gdje je bio.`);
    }
  }
  // finish / handles (the side-by-side)
  if (said(op.finish) || op.handles) {
    const finish = said(op.finish) ? resolveFridgeFinish(op.finish) : null;
    if (said(op.finish) && !finish) notes.push(`Izvedbu hladnjaka „${op.finish.trim()}“ nemam u katalogu.`);
    const r = setFridge(cfg, { ...(finish ? { finish } : {}), ...(op.handles ? { handle: op.handles } : {}) });
    if (r.ok) cfg = r.cfg;
  }
  return { cfg, ok: true, warning: notes.join(" ") || null, slotId: null };
}

function ovenOp(run: Run, op: Extract<EditOp, { op: "pecnica" }>): EditResult {
  let cfg = run.cfg;
  const notes: string[] = [];
  const plan = planKitchen(cfg);
  let column = plan.slots.find((s) => s.zone === "tall" && ovenTypes(s.type)) ?? null;
  const hob = plan.hobId ? plan.slots.find((s) => s.id === plan.hobId) : undefined;
  if (op.place === "ispod-ploce") {
    if (!hob) return fail(cfg, "Kuhinja nema ploču za kuhanje.");
    if (hob.type !== "ploca-pecnica") {
      const r = changeType(cfg, hob.id, "ploca-pecnica");
      if (!r.ok) return r;
      cfg = r.cfg;
    }
    if (column) {
      const c = findAgain(cfg, refOf(column));
      if (c) {
        const r = remove(cfg, c.id);
        if (r.ok) cfg = r.cfg;
      }
      column = null;
    }
  } else if (op.place === "stup" && !column) {
    const fridge = plan.slots.find((s) => s.zone === "tall" && fridgeTypes(s.type));
    const type = op.microwave === "da" ? "pecnica-mikro" : "pecnica";
    const r = fridge ? addElement(cfg, { type, zone: "tall", nextTo: fridge.id, side: fridge.x < (plan.runs.find((x) => x.wall === fridge.run)?.kitchen.from ?? 0) + 100 ? "desno" : "lijevo", width: 60 }) : addElement(cfg, { type, zone: "tall", width: 60 });
    if (!r.ok) return r;
    cfg = r.cfg;
    column = r.slotId ? (slotOf(cfg, r.slotId) ?? null) : null;
    const h = hob ? findAgain(cfg, refOf(hob)) : null;
    if (h && h.type === "ploca-pecnica") {
      const r2 = changeType(cfg, h.id, "ploca");
      if (r2.ok) cfg = r2.cfg;
    }
  }
  if (op.height || op.below || op.microwave) {
    const c = column ? findAgain(cfg, refOf(column)) : null;
    if (!c) {
      if (op.height || op.below) notes.push("Pećnica nije u visokom elementu — visina i ono ispod nje mijenjaju se samo u visokom elementu.");
    } else {
      const r = setOvenColumn(cfg, c.id, {
        ...(op.below ? { below: op.below } : {}),
        ...(op.height ? { at: op.height === "standard" ? "standard" : op.height } : {}),
        ...(op.microwave ? { micro: op.microwave === "da" } : {}),
      });
      if (!r.ok) return r;
      cfg = r.cfg;
      if (r.warning) notes.push(r.warning);
    }
  }
  return { cfg, ok: true, warning: notes.join(" ") || null, slotId: null };
}

function wallOp(run: Run, op: Extract<EditOp, { op: "zid" }>): EditResult {
  let cfg = run.cfg;
  const wall = op.wall;
  const notes: string[] = [];
  const used = () => wallsFor(cfg.layout).includes(wall);
  if (op.kitchen === -1) {
    const r = setWallKitchen(cfg, wall, false);
    if (!r.ok) return r;
    cfg = r.cfg;
    if (r.warning) notes.push(r.warning);
  } else if (pos(op.kitchen) && !used()) {
    const r = setWallKitchen(cfg, wall, true);
    if (!r.ok) return r;
    cfg = r.cfg;
  }
  if (pos(op.room)) {
    if (used()) {
      const full = kitchenExtent(cfg, wall)?.full ?? true;
      const r = full && !pos(op.kitchen) ? setWallLength(cfg, wall, Math.round(op.room)) : setRoomWall(cfg, wall, Math.round(op.room));
      if (!r.ok) return r;
      cfg = r.cfg;
      if (r.warning) notes.push(r.warning);
    } else {
      const canBare = roomWalls(cfg).find((x) => x.wall === wall)?.canBare;
      if (!canBare) return fail(cfg, `Zid ${W(wall)} uz ovaj oblik kuhinje ne postoji.`);
      const r = setBareWall(cfg, wall, true, Math.round(op.room));
      if (!r.ok) return r;
      cfg = r.cfg;
    }
  }
  if (pos(op.kitchen) && used()) {
    const anchor = op.start === "kraj" ? (defaultAnchor(wall) === "left" ? "right" : "left") : op.start === "kut" ? defaultAnchor(wall) : undefined;
    const len = Math.round(op.kitchen);
    const r = len >= cfg.walls[wall] - 0.5 && !anchor ? setKitchenExtent(cfg, wall, null) : setKitchenExtent(cfg, wall, { length: len, ...(anchor ? { anchor, offset: 0 } : {}) });
    if (!r.ok) return r;
    cfg = r.cfg;
    notes.push(...r.notes);
  }
  return { cfg, ok: true, warning: notes.join(" ") || null, slotId: null };
}

const ZONE_OF: Record<Extract<EditOp, { op: "dodaj" }>["zone"], "base" | "upper" | "tall" | "island"> = { donji: "base", gornji: "upper", visoki: "tall", otok: "island" };

function one(run: Run, op: EditOp): EditResult {
  const cfg = run.cfg;
  const el = (id: string): PlanSlot | EditResult => run.slot(id) ?? fail(cfg, `Element ${id} ne postoji u ovoj kuhinji.`);
  const isFail = (x: PlanSlot | EditResult): x is EditResult => "ok" in x;
  switch (op.op) {
    case "stil": {
      const r = viaWork(cfg, (w) => applyStyle(w, op.style));
      return { ...r, warning: r.notes.join(" ") || null };
    }
    case "prostor": {
      let c = cfg;
      const notes: string[] = [];
      if (said(op.wall_finish)) {
        const id = resolveRoomWall(op.wall_finish);
        if (!id) notes.push(`Boju zida „${op.wall_finish.trim()}“ nemam u katalogu.`);
        else {
          const r = setRoomFinish(c, { wall: op.wall === "" || op.wall === "sve" ? "all" : op.wall, finish: id });
          if (r.ok) c = r.cfg;
        }
      }
      if (said(op.floor)) {
        const id = resolveFloor(op.floor);
        if (!id) notes.push(`Pod „${op.floor.trim()}“ nemam u katalogu.`);
        else {
          const r = setRoomFinish(c, { floor: id });
          if (r.ok) c = r.cfg;
        }
      }
      if (op.ceiling || op.lamp) {
        const r = setRoomCeiling(c, { ...(op.ceiling ? { ceiling: op.ceiling === "da" } : {}), ...(op.lamp ? { lamp: op.lamp === "da" } : {}), ...(op.lamp === "da" ? { ceiling: true } : {}) });
        if (r.ok) c = r.cfg;
      }
      return { cfg: c, ok: true, warning: notes.join(" ") || null, slotId: null };
    }
    case "zid":
      return wallOp(run, op);
    case "strop":
      return pos(op.cm) ? setCeiling(cfg, Math.round(op.cm)) : fail(cfg, "Upišite visinu stropa u centimetrima.");
    case "prozor": {
      const window = windowOf(cfg, op);
      let c = sanitizeConfig({ ...cfg, window });
      if (window && !wallsFor(c.layout).includes(window.wall) && !(c.room?.bare ?? []).includes(window.wall)) {
        const r = setBareWall(c, window.wall, true);
        if (!r.ok) return fail(cfg, `Prozor na zidu ${W(window.wall)} uz ovaj oblik kuhinje se ne vidi.`);
        c = r.cfg;
      }
      const before = new Set(planKitchen(cfg).warnings);
      const added = planKitchen(c).warnings.filter((x) => !before.has(x));
      return { cfg: c, ok: true, warning: added.join(" ") || null, slotId: null };
    }
    case "oblik":
      return changeLayout(cfg, op.layout);
    case "visine": {
      const patch: Parameters<typeof setHeights>[1] = {};
      if (op.mode) patch.mode = op.mode;
      if (op.one_piece) patch.onePiece = op.one_piece === "da";
      if (pos(op.worktop)) patch.worktop = Math.round(op.worktop);
      if (pos(op.gap)) patch.gap = Math.round(op.gap);
      if (!Object.keys(patch).length) return fail(cfg, "Nije rečeno koje visine promijeniti.");
      const r = setHeights(cfg, patch);
      // only what this change caused, not the always-there explanation of the heights
      const before = new Set(planKitchen(cfg).warnings);
      return { ...r, warning: planKitchen(r.cfg).warnings.filter((x) => !before.has(x)).join(" ") || null };
    }
    case "pomakni": {
      const s = el(op.element);
      if (isFail(s)) return s;
      return step(cfg, s.id, op.direction, pos(op.steps) || 1);
    }
    case "premjesti": {
      const s = el(op.element);
      if (isFail(s)) return s;
      return moveToWall(cfg, s.id, op.wall === "otok" ? "isl" : op.wall, (op.side || null) as Side | null);
    }
    case "zamijeni": {
      const s = el(op.element);
      if (isFail(s)) return s;
      const zone = s.zone === "island" ? "base" : s.zone;
      const tall = !moduleDef(zone, op.type) && moduleDef("tall", op.type) && s.zone !== "tall";
      if (!moduleDef(zone, op.type) && !tall) return fail(cfg, `Element „${op.type}“ ne postoji u katalogu za taj red.`);
      const r = changeType(cfg, s.id, op.type, tall ? "tall" : undefined);
      if (!r.ok || !pos(op.width) || !r.slotId) return r;
      const now = slotOf(r.cfg, r.slotId);
      if (!now || Math.abs(now.width - op.width) < 0.5) return r;
      const r2 = resize(r.cfg, r.slotId, Math.round(op.width));
      return r2.ok ? r2 : { ...r, warning: [r.warning, `Širina ${Math.round(op.width)} cm ovdje ne stane — ostala je ${now.width} cm.`].filter(Boolean).join(" ") };
    }
    case "sirina": {
      const s = el(op.element);
      if (isFail(s)) return s;
      return resize(cfg, s.id, Math.round(op.width));
    }
    case "ukloni": {
      const s = el(op.element);
      if (isFail(s)) return s;
      return op.whole_column === "da" && s.zone === "tall" ? removeColumn(cfg, s.id) : remove(cfg, s.id);
    }
    case "dodaj": {
      const nextTo = said(op.next_to) ? run.slot(op.next_to)?.id ?? null : null;
      return addElement(cfg, { type: op.type, zone: ZONE_OF[op.zone], wall: op.zone === "otok" ? "isl" : ((op.wall || null) as WallId | null), side: (op.side || null) as Side | null, nextTo, width: pos(op.width) || null });
    }
    case "hladnjak":
      return fridgeOp(run, op);
    case "pecnica":
      return ovenOp(run, op);
    case "napa": {
      const patch: Parameters<typeof setHood>[1] = {};
      if (op.kind) patch.kind = op.kind;
      if (op.finish) patch.finish = op.finish;
      if (op.island) patch.island = op.island;
      return Object.keys(patch).length ? setHood(cfg, patch) : fail(cfg, "Nije rečeno kakva napa.");
    }
    case "otok": {
      const r = viaWork(cfg, (w) => applyIsland(w, op.island));
      return { ...r, warning: r.notes.join(" ") || null };
    }
    case "gornji": {
      const r = viaWork(cfg, (w) => composeWallUnits(w, op.kind, (op.wall || null) as WallId | null));
      return { ...r, warning: r.notes.join(" ") || null };
    }
    case "opcije": {
      const s = el(op.element);
      if (isFail(s)) return s;
      const patch: Partial<ElementOpts> = {};
      if (op.open) patch.open = (op.open === "gola" ? "bez" : op.open) as HandleStyle;
      if (op.drawers) patch.drawers = op.drawers;
      if (op.bowl) patch.bowl = op.bowl === "lijevo" ? "left" : op.bowl === "desno" ? "right" : undefined;
      if (pos(op.hob_width)) patch.hob = Math.round(op.hob_width);
      if (!Object.keys(patch).length) return fail(cfg, "Nije rečeno što promijeniti na elementu.");
      return setElementOptions(cfg, s.id, patch);
    }
  }
}

/** apply the model's operations in order; every refusal is a note, nothing throws */
export function applyOps(input: KitchenConfig, ops: readonly EditOp[]): OpsResult {
  const run = new Run(input);
  for (const op of ops.slice(0, 20)) {
    let r: EditResult;
    try {
      r = one(run, op);
    } catch {
      r = fail(run.cfg, "došlo je do greške.");
    }
    if (r.ok) {
      run.cfg = sanitizeConfig(r.cfg);
      run.applied++;
      run.note(r.warning);
    } else {
      run.refused++;
      run.note(`${OP_WORD[op.op] ?? "Promjena"}: nije išlo — ${lowerFirst(r.warning ?? "nije uspjelo.")}`);
    }
  }
  return { cfg: run.cfg, notes: run.notes, applied: run.applied, refused: run.refused };
}
