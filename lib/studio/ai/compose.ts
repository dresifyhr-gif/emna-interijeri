/**
 * Brief → KitchenConfig, deterministically, only through the studio's own public helpers (sanitizeConfig, the planner
 * and lib/studio/edit.ts), so whatever comes out plans cleanly and edits like a kitchen the customer built by hand.
 *
 * The model only says what the customer said (schema.ts KitchenBrief: "0" / "" = not said); this file decides the rest:
 * defaults for what is missing — each one a Croatian `assumptions` line ("Pretpostavio sam visinu stropa 260 cm.") —
 * and `notes` for what could not be done as asked (a side-by-side that does not fit, an unknown colour …).
 *
 * Order matters and follows how the planner thinks: room (layout, walls, ceiling, window) → where the kitchen stands on
 * each wall → heights → island → tall columns (fridge / oven / larders, tried in the order asked, then simpler
 * fallbacks) → the planner's sink / hob / dishwasher, then moved / resized as asked → wall units → hood, fridge and oven
 * variants → materials and the room's look.
 */
import { frontDef, moduleDef, topDef } from "../catalog";
import {
  changeType,
  changeWidth,
  setBacksplash,
  setBar,
  setElementOptions,
  setFridge,
  setHeights,
  setHood,
  setIsland,
  setKitchenExtent,
  setBareWall,
  setOvenColumn,
  setRoomCeiling,
  setRoomFinish,
  setWallShelves,
  setWorktop,
  roomWalls,
  type EditResult,
} from "../edit";
import { defaultAnchor, hasIsland, isPeninsula, limitsFor, materializeLists, planKitchen, sanitizeConfig, wallsFor, withList, type KitchenPlan } from "../plan";
import { DEFAULT_CONFIG, type CabinetSpec, type FrontZone, type HandleStyle, type IslandSpec, type KitchenConfig, type Layout, type RunEnd, type WallId } from "../types";
import { LAYOUT_NAME, columnEnd, endFor, moveNear, moveToWall, resize, slotOf, step, type Side } from "./moves";
import type { IslandBrief, KitchenBrief, StyleBrief } from "./schema";
import {
  resolveAppliances,
  resolveBacksplash,
  resolveFloor,
  resolveFront,
  resolveFridgeFinish,
  resolveHandleColor,
  resolveLed,
  resolvePlinth,
  resolveRoomWall,
  resolveSinkFinish,
  resolveTap,
  resolveTop,
} from "./vocab";

export interface ComposeResult {
  cfg: KitchenConfig;
  /** what was assumed because the customer did not say it (Croatian sentences) */
  assumptions: string[];
  /** what could not be done as asked, and what the planner had to adjust (Croatian sentences) */
  notes: string[];
}

const WALLS: WallId[] = ["a", "b", "c"];
const W = (w: WallId) => w.toUpperCase();
const pos = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : 0);
const said = (s: unknown): s is string => typeof s === "string" && s.trim() !== "";
const yes = (v: string) => v === "da";
const no = (v: string) => v === "ne";

/** a working config plus everything said about it so far */
class Work {
  cfg: KitchenConfig;
  readonly assumptions: string[] = [];
  readonly notes: string[] = [];
  constructor(cfg: KitchenConfig) {
    this.cfg = sanitizeConfig(cfg);
  }
  assume(s: string) {
    if (!this.assumptions.includes(s)) this.assumptions.push(s);
  }
  note(s: string | null | undefined) {
    if (s && !this.notes.includes(s)) this.notes.push(s);
  }
  /** take an edit's result; a refused one leaves the kitchen as it was and notes why (with `what` in front) */
  take(r: EditResult, what?: string): boolean {
    if (r.ok) {
      this.cfg = r.cfg;
      return true;
    }
    this.note(what ? `${what}: ${lowerFirst(r.warning ?? "nije moguće.")}` : r.warning);
    return false;
  }
  plan(): KitchenPlan {
    return planKitchen(this.cfg);
  }
}

const lowerFirst = (s: string) => (s ? s[0].toLowerCase() + s.slice(1) : s);

// ---------------------------------------------------------------- layout

function islandSaid(b: IslandBrief | null): boolean {
  if (!b) return false;
  return pos(b.length) > 0 || pos(b.depth) > 0 || b.sink !== "" || b.hob !== "" || pos(b.seats) > 0 || b.seat_side !== "" || b.bar !== "" || b.waterfall !== "" || b.side !== "" || b.hood !== "";
}

function layoutOf(brief: KitchenBrief, w: Work): Layout {
  const island = islandSaid(brief.island) || brief.sink?.wall === "otok" || brief.hob?.wall === "otok";
  // "ravni zid i otok s pločom": a model names the wall ("ravna") and describes the island — the island wins
  if (brief.layout === "ravna" && island) return "otok";
  if (brief.layout === "L" && island) {
    w.note("Uz kuhinju u obliku slova L otok ide kao poluotok — složio sam oblik G (L s poluotokom).");
    return "G";
  }
  if (brief.layout) return brief.layout;
  const kitchenOn = (x: WallId) => pos(brief.walls[x].room) > 0 && brief.walls[x].kitchen !== -1;
  let layout: Layout = "ravna";
  if (kitchenOn("b") && kitchenOn("c")) layout = "U";
  else if (kitchenOn("b")) layout = island ? "G" : "L";
  else if (island) layout = "otok";
  w.assume(`Oblik kuhinje: ${LAYOUT_NAME[layout]}.`);
  return layout;
}

// ---------------------------------------------------------------- materials

function material(w: Work, words: string, resolve: (s: string) => string | null, what: string, fallbackName: string): string | null {
  if (!said(words)) return null;
  const id = resolve(words);
  if (!id) w.note(`${what} „${words.trim()}“ nemam u katalogu — ostavio sam ${fallbackName}.`);
  return id;
}

const handlesOf = (v: StyleBrief["handles"]): HandleStyle | null => (v === "gola" ? "bez" : v === "" ? null : (v as HandleStyle));

function applyStyle(w: Work, st: StyleBrief): void {
  const c: KitchenConfig = { ...w.cfg };
  const frontName = (id: string) => frontDef(id)?.name.toLowerCase() ?? id;
  const front = material(w, st.front, resolveFront, "Boju fronti", frontName(c.front));
  if (front) c.front = front;
  const zoneFronts: Partial<Record<FrontZone, string>> = { ...(c.zoneFronts ?? {}) };
  const zones: [FrontZone, string, string][] = [
    ["upper", st.upper_front, "Boju gornjih fronti"],
    ["tall", st.tall_front, "Boju visokih elemenata"],
    ["island", st.island_front, "Boju otoka"],
  ];
  for (const [zone, words, what] of zones) {
    const id = material(w, words, resolveFront, what, frontName(c.front));
    if (id) {
      if (id === c.front) delete zoneFronts[zone];
      else zoneFronts[zone] = id;
    }
  }
  c.zoneFronts = Object.keys(zoneFronts).length ? zoneFronts : undefined;
  const top = material(w, st.worktop, resolveTop, "Radnu ploču", topDef(c.top)?.name.toLowerCase() ?? c.top);
  if (top) c.top = top;
  const handles = handlesOf(st.handles);
  if (handles) c.handles = handles;
  if (st.led === "da") c.led = true;
  if (st.led === "ne") c.led = false;
  const finish = { ...(c.finish ?? {}) };
  const fin: [keyof typeof finish, string, (s: string) => string | null, string][] = [
    ["handleColor", st.handle_color, resolveHandleColor, "Boju ručki"],
    ["led", st.led_color, resolveLed, "Boju LED svjetla"],
    ["sink", st.sink_finish, resolveSinkFinish, "Izvedbu sudopera"],
    ["tap", st.tap_finish, resolveTap, "Boju slavine"],
    ["appliances", st.appliance_finish, resolveAppliances, "Izvedbu aparata"],
    ["plinth", st.plinth, resolvePlinth, "Postolje"],
  ];
  for (const [key, words, resolve, what] of fin) {
    const id = material(w, words, resolve, what, "zadanu izvedbu");
    if (id) (finish as Record<string, string>)[key] = id;
  }
  c.finish = Object.keys(finish).length ? finish : undefined;
  w.cfg = sanitizeConfig(c);
  if (said(st.backsplash)) {
    const b = resolveBacksplash(st.backsplash);
    if (b) w.take(setBacksplash(w.cfg, b), "Zid iza radne ploče");
    else w.note(`Obradu zida iza radne ploče „${st.backsplash.trim()}“ nemam u katalogu — ostala je radna ploča do gornjih elemenata.`);
  }
  if (pos(st.worktop_thickness)) w.take(setWorktop(w.cfg, { thickness: st.worktop_thickness }), "Debljina radne ploče");
}

// ---------------------------------------------------------------- tall columns

interface Column {
  end: RunEnd;
  units: CabinetSpec[];
}

function snapWidth(type: string, wanted: number, fallback: number): number {
  const def = moduleDef("tall", type);
  if (!def) return fallback;
  const target = wanted > 0 ? wanted : fallback;
  return [...def.widths].sort((p, q) => Math.abs(p - target) - Math.abs(q - target) || q - p)[0] ?? fallback;
}

const EXTRA_DEFAULT_WIDTH: Record<string, number> = { smocnica: 30, metle: 40, vinoteka: 30 };

/** left → right on its end: the fridge at the open (outer) end, then the larders, the oven towards the kitchen */
function orderUnits(end: RunEnd, outerFirst: CabinetSpec[]): CabinetSpec[] {
  return end.endsWith("left") ? outerFirst : [...outerFirst].reverse();
}

/** the columns as asked → the config with them, or null when one of them is not placed / a sink or hob is pushed out */
function withColumns(base: KitchenConfig, cols: Column[]): KitchenConfig | null {
  const c: KitchenConfig = { ...base };
  delete c.tallRun;
  delete c.tallAt;
  delete c.tallRuns;
  if (!cols.length) return sanitizeConfig({ ...c, tall: false });
  const [main, ...rest] = cols;
  const next = sanitizeConfig({
    ...c,
    tall: true,
    tallRun: main.units,
    tallAt: main.end,
    tallRuns: rest.length ? Object.fromEntries(rest.map((x) => [x.end, x.units])) : undefined,
  });
  const plan = planKitchen(next);
  const placed = (list: string) => plan.slots.filter((s) => s.zone === "tall" && s.list?.id === list).length;
  if (placed("tall") !== main.units.length || columnEnd(next, "tall") !== main.end) return null;
  for (const x of rest) if (placed(`tall:${x.end}`) !== x.units.length) return null;
  const before = planKitchen(base);
  if ((before.sinkId && !plan.sinkId) || (before.hobId && !plan.hobId)) return null;
  return next;
}

function composeTall(w: Work, brief: KitchenBrief): { ovenUnderHob: boolean } {
  const fr = brief.fridge;
  const ov = brief.oven;
  const extras = brief.tall_units ?? [];
  const fridgeKind = fr?.kind ?? "";
  const ovenPlace = ov?.place || (brief.hob && yes(brief.hob.oven_below) ? "ispod-ploce" : "");
  const microwave = ov ? yes(ov.microwave) : false;
  const nothingSaid = !fr && !ov && !extras.length && ovenPlace === "";
  if (nothingSaid) return { ovenUnderHob: false };

  // where the planner puts the column on its own
  const homeCfg = sanitizeConfig({ ...w.cfg, tall: true, tallRun: undefined, tallAt: undefined, tallRuns: undefined });
  const home = columnEnd(homeCfg, "tall") ?? endFor(homeCfg, "desno", null) ?? endFor(homeCfg, "lijevo", null);

  const fridgeUnit: CabinetSpec | null =
    fridgeKind === "bez" ? null : fridgeKind === "side-by-side" ? { type: "hladnjak-sbs", width: 96 } : { type: "hladnjak", width: 60 };
  const ovenUnit: CabinetSpec | null = ovenPlace === "ispod-ploce" ? null : { type: microwave ? "pecnica-mikro" : "pecnica", width: 60 };
  const extraUnits: CabinetSpec[] = extras.map((x) => ({ type: x.type, width: snapWidth(x.type, pos(x.width), EXTRA_DEFAULT_WIDTH[x.type] ?? 60) }));

  const fridgeEnd = fr && (fr.side || fr.wall) ? endFor(w.cfg, (fr.side || null) as Side | null, (fr.wall || null) as WallId | null) : home;
  if (fr && (fr.side || fr.wall) && !fridgeEnd) {
    w.note(`Na ${fr.side === "lijevo" ? "lijevoj" : fr.side === "desno" ? "desnoj" : "toj"} strani ova kuhinja nema slobodan kraj za hladnjak — stavio sam ga na drugi kraj.`);
  }
  const fEnd = fridgeEnd ?? home;
  const ovenEnd = ov?.side ? endFor(w.cfg, ov.side as Side, null) : null;

  /** the columns for one attempt */
  const plan = (o: { fridge: CabinetSpec | null; oven: CabinetSpec | null; extras: CabinetSpec[]; fEnd: RunEnd | null; ovenOwn: RunEnd | null }): Column[] | null => {
    const cols: Column[] = [];
    const mainEnd = o.fEnd ?? home;
    if (!mainEnd) return o.fridge || o.oven || o.extras.length ? null : [];
    const outer: CabinetSpec[] = [];
    if (o.fridge) outer.push(o.fridge);
    outer.push(...o.extras);
    let ownOven: RunEnd | null = null;
    if (o.oven) {
      if (o.ovenOwn && o.ovenOwn !== mainEnd) ownOven = o.ovenOwn;
      else outer.push(o.oven);
    }
    if (outer.length) cols.push({ end: mainEnd, units: orderUnits(mainEnd, outer) });
    if (o.oven && ownOven) cols.push({ end: ownOven, units: [o.oven] });
    // the oven alone where the fridge has left the planner's corner (a side-by-side on the left, the oven column stays right)
    return cols;
  };

  // the oven goes to the planner's own end when the fridge moved away from it and nobody said where the oven goes
  const ovenOwnDefault = ovenUnit && !ovenEnd && fridgeUnit && fEnd !== home && ov?.place !== "stup" ? home : ovenEnd;
  const attempts: { o: Parameters<typeof plan>[0]; note?: string; underHob?: boolean }[] = [
    { o: { fridge: fridgeUnit, oven: ovenUnit, extras: extraUnits, fEnd, ovenOwn: ovenOwnDefault } },
    ...(ovenOwnDefault !== ovenEnd ? [{ o: { fridge: fridgeUnit, oven: ovenUnit, extras: extraUnits, fEnd, ovenOwn: ovenEnd } }] : []),
    ...(ovenUnit && ovenPlace !== "stup"
      ? [{ o: { fridge: fridgeUnit, oven: null, extras: extraUnits, fEnd, ovenOwn: null }, underHob: true, note: "Pećnica u visokom elementu nije stala — stavio sam je ispod ploče za kuhanje." }]
      : []),
    ...(extraUnits.length
      ? [{ o: { fridge: fridgeUnit, oven: ovenUnit, extras: [], fEnd, ovenOwn: ovenOwnDefault }, note: "Dodatni visoki elementi (smočnica, ormar …) nisu stali uz hladnjak — dodajte ih kasnije gdje ima mjesta." }]
      : []),
    ...(fridgeKind === "side-by-side"
      ? [{ o: { fridge: { type: "hladnjak", width: 60 }, oven: ovenUnit, extras: extraUnits, fEnd, ovenOwn: ovenOwnDefault }, note: "Dvokrilni hladnjak (side-by-side) ne stane uz ove mjere — stavio sam ugradbeni hladnjak od 60 cm." }]
      : []),
    ...(fEnd !== home && home
      ? [{ o: { fridge: fridgeUnit, oven: ovenUnit, extras: extraUnits, fEnd: home, ovenOwn: null }, note: "Hladnjak nije stao na traženu stranu — stavio sam ga na drugi kraj kuhinje." }]
      : []),
  ];
  for (const a of attempts) {
    const cols = plan(a.o);
    if (!cols) continue;
    const next = withColumns(w.cfg, cols);
    if (!next) continue;
    w.cfg = next;
    w.note(a.note);
    return { ovenUnderHob: Boolean(a.underHob) || ovenPlace === "ispod-ploce" };
  }
  w.note("Visoki elementi (hladnjak, pećnica) ne stanu uz ove mjere kako ste opisali — ostavio sam raspored koji kuhinja ima sama od sebe.");
  return { ovenUnderHob: ovenPlace === "ispod-ploce" };
}

// ---------------------------------------------------------------- sink, hob, dishwasher

function findType(w: Work, pred: (type: string, zone: string) => boolean): string | null {
  return w.plan().slots.find((s) => pred(s.type, s.zone))?.id ?? null;
}

function composeWorkSurfaces(w: Work, brief: KitchenBrief, ovenUnderHob: boolean): void {
  const sink = brief.sink;
  const hob = brief.hob;
  const walls = wallsFor(w.cfg.layout);

  // the hob: on the wall asked, as wide as asked, with the oven under it
  let hobId = w.plan().hobId;
  if (hob && hobId) {
    const want = hob.wall === "otok" ? null : (hob.wall || null) as WallId | null;
    const at = slotOf(w.cfg, hobId);
    if (want && at && at.run !== want) {
      if (!walls.includes(want)) w.note(`Ploču za kuhanje ne mogu staviti na zid ${W(want)} — tamo nema kuhinje.`);
      else if (w.take(moveToWall(w.cfg, hobId, want), `Ploču za kuhanje na zid ${W(want)}`)) hobId = w.plan().hobId;
    }
  }
  if (ovenUnderHob && hobId) {
    const s = slotOf(w.cfg, hobId);
    if (s && s.type !== "ploca-pecnica") {
      const r = changeType(w.cfg, hobId, "ploca-pecnica");
      if (w.take(r, "Pećnicu ispod ploče")) hobId = r.slotId ?? w.plan().hobId;
    }
  }
  if (hob && pos(hob.width) && hobId) {
    const s = slotOf(w.cfg, hobId);
    const want = Math.round(hob.width);
    if (s && Math.abs(s.width - want) > 0.5) {
      const r = resize(w.cfg, hobId, want);
      if (r.ok) {
        w.cfg = r.cfg;
        hobId = r.slotId ?? hobId;
      } else if (want < s.width && w.take(setElementOptions(w.cfg, hobId, { hob: want }))) {
        // a narrower hob in its cabinet (a 60 cm hob in a 90 cm cabinet)
      } else w.note(`Ploča od ${want} cm ovdje ne stane — ostala je ${s.width} cm.`);
    }
  }

  // the sink: on the wall asked / under the window, at the side asked
  let sinkId = w.plan().sinkId;
  if (sink && sinkId) {
    const at = slotOf(w.cfg, sinkId);
    const want = sink.wall === "otok" ? null : (sink.wall || null) as WallId | null;
    const win = w.cfg.window;
    const target = want ?? (yes(sink.under_window) && win ? win.wall : null);
    if (target && at && at.run !== target) {
      if (!walls.includes(target)) w.note(`Sudoper ne mogu staviti na zid ${W(target)} — tamo nema kuhinje.`);
      else if (w.take(moveToWall(w.cfg, sinkId, target), `Sudoper na zid ${W(target)}`)) sinkId = w.plan().sinkId;
    }
    const now = sinkId ? slotOf(w.cfg, sinkId) : undefined;
    if (now && yes(sink.under_window) && win && win.wall === now.run) {
      const r = moveNear(w.cfg, now.id, win.offset + win.width / 2);
      if (r.ok) w.cfg = r.cfg;
    } else if (now && (sink.side === "lijevo" || sink.side === "desno")) {
      const r = step(w.cfg, now.id, sink.side, 9);
      if (r.ok) w.cfg = r.cfg;
    }
    if (pos(sink.width) && sinkId) {
      const s = slotOf(w.cfg, w.plan().sinkId ?? sinkId);
      if (s && Math.abs(s.width - sink.width) > 0.5) w.take(resize(w.cfg, s.id, Math.round(sink.width)), `Sudoper širine ${Math.round(sink.width)} cm`);
    }
    // the dishwasher
    const dw = findType(w, (t, z) => t === "perilica" && z !== "upper");
    if (no(sink.dishwasher) && dw) w.take(changeType(w.cfg, dw, "ladice"), "Bez perilice posuđa");
    else if ((sink.dishwasher === "45" || sink.dishwasher === "60") && dw) {
      const s = slotOf(w.cfg, dw);
      const want = Number(sink.dishwasher);
      if (s && s.width !== want) w.take(changeWidth(w.cfg, dw, want), `Perilica posuđa od ${want} cm`);
    } else if ((yes(sink.dishwasher) || sink.dishwasher === "45" || sink.dishwasher === "60") && !dw) {
      w.note("Perilica posuđa nije stala uz sudoper — dodajte je klikom na „+“ gdje ima mjesta.");
    }
  }
}

// ---------------------------------------------------------------- wall units

/**
 * What hangs above the worktop: "ormarici" = the planner's wall units again (only where they were changed), "police" =
 * floating shelves over the whole wall, "bez" = nothing (a visible hood, an open corner shelf). One wall or every wall.
 */
export function composeWallUnits(w: Work, kind: KitchenBrief["wall_units"], onlyWall?: WallId | null): void {
  if (kind === "") return;
  const walls = wallsFor(w.cfg.layout).filter((x) => !onlyWall || x === onlyWall);
  if (!walls.length) {
    w.note(`Na zidu ${W(onlyWall as WallId)} nema kuhinje.`);
    return;
  }
  if (kind === "ormarici") {
    let c = w.cfg;
    for (const x of walls) if (c.upperRuns?.[x]) c = withList(c, `${x}:u`, undefined);
    if (walls.includes("a") && c.corners) {
      const corners = { ...c.corners };
      for (const k of ["upper-l", "upper-r"] as const) if (corners[k] === "kutna-polica") delete corners[k];
      c = { ...c, corners };
    }
    w.cfg = sanitizeConfig(c);
    return;
  }
  if (kind === "police") {
    for (const x of walls) w.take(setWallShelves(w.cfg, x, { rows: 2 }), `Police na zidu ${W(x)}`);
    return;
  }
  // nothing above the worktop: a visible hood instead of the one hidden in a wall unit, empty wall-unit rows, open corner shelf
  if ((w.cfg.hood?.kind ?? "ugradbena") === "ugradbena") {
    w.take(setHood(w.cfg, { kind: "dimnjak" }));
    w.assume("Bez gornjih elemenata napa je zidna, s dimnjakom.");
  }
  let c = materializeLists(w.cfg, w.plan(), walls.map((x) => `${x}:u` as const));
  for (const x of walls) c = withList(c, `${x}:u`, []);
  // the corner wall unit of wall A stays where it is — as an open corner shelf
  if (walls.includes("a") && (c.layout === "L" || c.layout === "U" || c.layout === "G")) {
    c = { ...c, corners: { ...(c.corners ?? {}), "upper-l": "kutna-polica", ...(c.layout === "U" ? { "upper-r": "kutna-polica" } : {}) } };
  }
  w.cfg = sanitizeConfig(c);
}

// ---------------------------------------------------------------- island

function islandPatch(b: IslandBrief, layout: Layout): Partial<IslandSpec> {
  const p: Partial<IslandSpec> = {};
  const sink = yes(b.sink);
  const hob = yes(b.hob);
  if (b.sink !== "" || b.hob !== "") p.functions = sink && hob ? "both" : sink ? "sink" : hob ? "hob" : "none";
  if (pos(b.depth)) p.depth = b.depth;
  if (b.seat_side) p.seatSide = b.seat_side;
  if (pos(b.seats)) p.stools = Math.round(b.seats);
  if (b.waterfall !== "") p.waterfall = yes(b.waterfall);
  if (b.hood !== "") p.hood = yes(b.hood) ? undefined : false;
  if (b.side && layout === "poluotok") p.side = b.side === "lijevo" ? "left" : "right";
  return p;
}

export function applyIsland(w: Work, b: IslandBrief): void {
  if (!hasIsland(w.cfg.layout)) {
    w.note("Ova kuhinja nema otok ni poluotok — promijenite oblik kuhinje da ga dodate.");
    return;
  }
  if (pos(b.length)) {
    const [lo, hi] = limitsFor(w.cfg.layout).island;
    const len = Math.round(b.length);
    w.cfg = sanitizeConfig({ ...w.cfg, island: len });
    if (len < lo || len > hi || Math.abs(w.cfg.island - len) > 0.5) w.note(`${isPeninsula(w.cfg.layout) ? "Poluotok" : "Otok"} može biti dug od ${lo} do ${hi} cm — postavljeno je ${w.cfg.island} cm.`);
  }
  const p = islandPatch(b, w.cfg.layout);
  if (Object.keys(p).length) {
    const r = setIsland(w.cfg, p);
    w.take(r, isPeninsula(w.cfg.layout) ? "Poluotok" : "Otok");
    if (r.ok) w.note(r.warning);
  }
  if (b.bar === "povisen" || b.bar === "stol") w.take(setBar(w.cfg, { kind: b.bar === "povisen" ? "raised" : "table" }), "Šank");
  else if (b.bar === "nema" && w.cfg.islandSpec?.bar) w.take(setBar(w.cfg, null));
}

// ---------------------------------------------------------------- the whole brief

/** values a model fills in when nothing was said ("kut" = the default start, standard heights, ordinary wall units) */
const NEUTRAL: Record<string, string> = { start: "kut", mode: "standard", wall_units: "ormarici" };

/**
 * Nothing at all was said in this brief (every field its "not said" or default value): a model that fills the form for a
 * question, a thank-you or an off-topic message. With a kitchen on screen it must never replace it with the defaults.
 */
export function briefSaysNothing(brief: KitchenBrief): boolean {
  const said = (v: unknown, key: string): boolean => {
    if (v === null || v === undefined) return false;
    if (typeof v === "number") return Number.isFinite(v) && v !== 0;
    if (typeof v === "string") return v.trim() !== "" && NEUTRAL[key] !== v;
    if (Array.isArray(v)) return v.length > 0;
    if (typeof v === "object") return Object.entries(v as Record<string, unknown>).some(([k, x]) => said(x, k));
    return Boolean(v);
  };
  return !said(brief, "");
}

export function composeKitchen(brief: KitchenBrief): ComposeResult {
  const w = new Work(DEFAULT_CONFIG);
  const layout = layoutOf(brief, w);
  const lim = limitsFor(layout);
  const used = wallsFor(layout);

  // ---- room walls
  const walls = { ...DEFAULT_CONFIG.walls };
  for (const x of WALLS) {
    const b = brief.walls[x];
    const room = pos(b.room) || (pos(b.kitchen) && b.kitchen > 0 ? b.kitchen : 0);
    if (room) walls[x] = Math.round(room);
    else if (used.includes(x)) w.assume(`Pretpostavio sam da je zid ${W(x)} dug ${walls[x]} cm.`);
    const [lo, hi] = lim[x];
    if (room && (room < lo || room > hi) && used.includes(x)) w.note(`Zid ${W(x)} može biti od ${lo} do ${hi} cm — postavljeno je ${Math.min(hi, Math.max(lo, Math.round(room)))} cm.`);
  }
  const ceiling = pos(brief.ceiling) ? Math.round(brief.ceiling) : DEFAULT_CONFIG.ceiling;
  if (!pos(brief.ceiling)) w.assume(`Pretpostavio sam visinu stropa ${ceiling} cm.`);
  else if (ceiling < lim.ceiling[0] || ceiling > lim.ceiling[1]) w.note(`Strop može biti od ${lim.ceiling[0]} do ${lim.ceiling[1]} cm.`);

  // ---- window (a sink "under the window" needs one)
  let window: KitchenConfig["window"] = null;
  const bw = brief.window;
  const sinkUnderWindow = brief.sink ? yes(brief.sink.under_window) : false;
  if (bw || sinkUnderWindow) {
    const sinkWall = brief.sink?.wall && brief.sink.wall !== "otok" ? brief.sink.wall : null;
    const ww: WallId = (bw?.wall || sinkWall || "a") as WallId;
    const len = walls[ww];
    const width = pos(bw?.width) ? Math.round(bw!.width) : 100;
    let offset = (len - width) / 2;
    if (bw && pos(bw.from_left)) offset = bw.from_left;
    else if (bw?.position === "lijevo") offset = Math.min(60, len - width);
    else if (bw?.position === "desno") offset = Math.max(0, len - width - 60);
    window = { wall: ww, offset: Math.round(offset), width, sill: pos(bw?.sill) ? Math.round(bw!.sill) : 95 };
    // one sentence for whatever of the window was not said
    const where = !bw || (!pos(bw.from_left) && !bw.position) ? `na sredinu zida ${W(ww)}` : !bw.wall ? `na zid ${W(ww)}` : "";
    const wide = !bw || !pos(bw.width) ? `širok ${width} cm` : "";
    if (where) w.assume(`Prozor sam stavio ${[where, wide].filter(Boolean).join(", ")} — pomaknite ga ako je drugdje.`);
    else if (wide) w.assume(`Pretpostavio sam prozor ${wide}.`);
  }

  w.cfg = sanitizeConfig({ ...DEFAULT_CONFIG, layout, walls, ceiling, window });

  // ---- room walls without a kitchen (an L in a closed room: wall C), and where the kitchen stands on each wall
  for (const x of WALLS) {
    const b = brief.walls[x];
    if (!used.includes(x)) {
      if (pos(b.room) && roomWalls(w.cfg).find((r) => r.wall === x)?.canBare) w.take(setBareWall(w.cfg, x, true, Math.round(b.room)));
      continue;
    }
    if (pos(b.kitchen) && pos(b.room) && b.kitchen < b.room - 0.5) {
      const anchor = b.start === "kraj" ? (defaultAnchor(x) === "left" ? "right" : "left") : defaultAnchor(x);
      const r = setKitchenExtent(w.cfg, x, { length: Math.round(b.kitchen), offset: 0, anchor });
      if (w.take(r, `Kuhinja na zidu ${W(x)}`)) for (const n of r.notes) w.note(n);
    }
  }
  if (window && !used.includes(window.wall) && !(w.cfg.room?.bare ?? []).includes(window.wall)) {
    if (roomWalls(w.cfg).find((r) => r.wall === window.wall)?.canBare) w.take(setBareWall(w.cfg, window.wall, true));
    else w.note(`Prozor na zidu ${W(window.wall)} uz ovaj oblik kuhinje se ne vidi.`);
  }

  // ---- heights
  const h = brief.heights;
  if (h && (h.mode || h.one_piece || pos(h.worktop))) {
    const patch: Parameters<typeof setHeights>[1] = {};
    if (h.mode) patch.mode = h.mode;
    if (yes(h.one_piece)) patch.onePiece = true;
    if (pos(h.worktop)) patch.worktop = Math.round(h.worktop);
    w.take(setHeights(w.cfg, patch), "Visine");
  }

  // ---- island / peninsula (before the walls get their sink and hob: what stands on the island is not wanted on them)
  if (hasIsland(layout)) {
    const ib: IslandBrief = brief.island ?? { length: 0, depth: 0, sink: "", hob: "", seats: 0, seat_side: "", bar: "", waterfall: "", side: "", hood: "" };
    const merged: IslandBrief = {
      ...ib,
      sink: ib.sink || (brief.sink?.wall === "otok" ? "da" : ""),
      hob: ib.hob || (brief.hob?.wall === "otok" ? "da" : ""),
    };
    applyIsland(w, merged);
    if (!pos(ib.length)) w.assume(`${isPeninsula(layout) ? "Poluotok" : "Otok"} je dug ${w.cfg.island} cm.`);
  } else if (islandSaid(brief.island)) {
    w.note(`Uz ${LAYOUT_NAME[layout]} nema otoka — za otok odaberite oblik „otok“ ili „G“.`);
  }

  // ---- materials (before the columns: nothing there depends on them, and the notes read in the customer's order)
  applyStyle(w, brief.style);

  // ---- tall columns, then the planner's sink / hob / dishwasher as asked
  const { ovenUnderHob } = composeTall(w, brief);
  composeWorkSurfaces(w, brief, ovenUnderHob);

  // ---- wall units
  composeWallUnits(w, brief.wall_units);

  // ---- hood
  const hood = brief.hood;
  if (hood && (hood.kind || hood.finish || hood.island)) {
    const patch: Parameters<typeof setHood>[1] = {};
    if (hood.kind) patch.kind = hood.kind;
    if (hood.finish) patch.finish = hood.finish;
    if (hood.island) patch.island = hood.island;
    w.take(setHood(w.cfg, patch), "Napa");
  }

  // ---- the side-by-side's finish and handles, the oven column's variant
  const fr = brief.fridge;
  if (fr && (said(fr.finish) || fr.handles)) {
    const hasSbs = w.plan().slots.some((s) => s.type === "hladnjak-sbs" || s.type === "hladnjak-sbs-vrata");
    if (hasSbs) {
      const finish = said(fr.finish) ? resolveFridgeFinish(fr.finish) : null;
      if (said(fr.finish) && !finish) w.note(`Izvedbu hladnjaka „${fr.finish.trim()}“ nemam — ostao je inox.`);
      w.take(setFridge(w.cfg, { ...(finish ? { finish } : {}), ...(fr.handles ? { handle: fr.handles } : {}) }), "Hladnjak");
    }
  }
  const ov = brief.oven;
  if (ov && (ov.height || ov.below)) {
    const col = w.plan().slots.find((s) => s.zone === "tall" && (s.type === "pecnica" || s.type === "pecnica-mikro"));
    if (col) {
      w.take(
        setOvenColumn(w.cfg, col.id, {
          ...(ov.below ? { below: ov.below } : {}),
          ...(ov.height ? { at: ov.height === "standard" ? "standard" : ov.height } : {}),
        }),
        "Pećnica",
      );
    }
  }

  // ---- the room's look
  const room = brief.room;
  if (room) {
    if (said(room.wall_finish)) {
      const id = resolveRoomWall(room.wall_finish);
      if (id) w.take(setRoomFinish(w.cfg, { wall: "all", finish: id }));
      else w.note(`Boju zida „${room.wall_finish.trim()}“ nemam — ostao je tamni studio.`);
    }
    if (said(room.floor)) {
      const id = resolveFloor(room.floor);
      if (id) w.take(setRoomFinish(w.cfg, { floor: id }));
      else w.note(`Pod „${room.floor.trim()}“ nemam — ostao je zadani.`);
    }
    if (yes(room.ceiling_lamp)) w.take(setRoomCeiling(w.cfg, { ceiling: true, lamp: true }));
  }

  // ---- what the planner says about the result
  for (const x of w.plan().warnings) w.note(x);
  return { cfg: w.cfg, assumptions: w.assumptions, notes: w.notes };
}

export { Work, applyStyle, composeTall, composeWorkSurfaces };
