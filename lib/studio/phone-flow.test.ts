/**
 * The phone's simple flow, its pure logic (components/studio/phone/flow.ts and appliances.ts): which screen comes
 * when (start → four wizard screens → 3D, what a visit remembers, a ?k= link straight to 3D), the "Mjere" screen's
 * edits (lib/studio/edit.ts, refusals and notes in Croatian) and "Uređaji" — every choice read back from the kitchen,
 * idempotent, and refused with a reason where it cannot be done.
 *
 *   npx tsx --test lib/studio/phone-flow.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  readAppliances,
  setColumnEnd,
  setDishwasher,
  setFridgeKind,
  setHoodKind,
  setIslandUse,
  setOvenPlace,
  setSinkSide,
} from "../../components/studio/phone/appliances";
import {
  WIZARD_LAST,
  WIZARD_STEPS,
  ceilingRow,
  clampStep,
  firstStage,
  heightsMode,
  islandRow,
  measureRows,
  nextStage,
  parseStage,
  prevStage,
  setCeilingHeight,
  setHeightsMode,
  setIslandLength,
  setKitchenFull,
  setKitchenLength,
  setRoomLength,
  setWindowOn,
  stageKey,
  windowOn,
  type PhoneStage,
} from "../../components/studio/phone/flow";
import { moduleDef } from "./catalog";
import { kitchenExtent } from "./edit";
import { planKitchen, sanitizeConfig, wallsFor } from "./plan";
import { encodeConfig } from "./share";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout } from "./types";

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const cfgOf = (patch: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...patch });
const same = (a: KitchenConfig, b: KitchenConfig) => encodeConfig(a) === encodeConfig(b);
/** the base cabinets of a wall run, left → right (type + width) */
const runOf = (cfg: KitchenConfig, wall: "a" | "b" | "c") =>
  planKitchen(cfg)
    .slots.filter((s) => s.zone === "base" && s.run === wall && s.list)
    .sort((x, y) => x.x - y.x)
    .map((s) => `${s.type}${s.width}`);

describe("phone flow — screens", () => {
  it("four wizard screens: Oblik, Mjere, Stil, Uređaji", () => {
    assert.deepEqual(
      WIZARD_STEPS.map((s) => s.id),
      ["oblik", "mjere", "stil", "uredaji"],
    );
    assert.equal(WIZARD_LAST, 3);
    for (const s of WIZARD_STEPS) assert.ok(s.title && s.lead);
  });

  it("the remembered stage round-trips; anything else is nothing remembered", () => {
    const all: PhoneStage[] = [{ kind: "start" }, { kind: "3d" }, ...[0, 1, 2, 3].map((step) => ({ kind: "wizard" as const, step }))];
    for (const s of all) assert.deepEqual(parseStage(stageKey(s)), s);
    for (const bad of [null, undefined, "", "wizard", "wizard:x", "wizard:12", "3D", "desktop"]) assert.equal(parseStage(bad), null, String(bad));
    assert.deepEqual(parseStage("wizard:9"), { kind: "wizard", step: 3 }, "an old step number is clamped");
    assert.equal(stageKey({ kind: "wizard", step: 7 }), "wizard:3");
    assert.equal(clampStep(-2), 0);
    assert.equal(clampStep(Number.NaN), 0);
  });

  it("the first screen: what this visit remembers, else 3D for a kitchen link, else the start", () => {
    assert.deepEqual(firstStage(null, false), { kind: "start" });
    assert.deepEqual(firstStage(null, true), { kind: "3d" });
    assert.deepEqual(firstStage({ kind: "wizard", step: 2 }, true), { kind: "wizard", step: 2 }, "a reload mid-wizard (its link in the URL) stays in the wizard");
    assert.deepEqual(firstStage({ kind: "3d" }, false), { kind: "3d" });
  });

  it("Dalje / Natrag: through the screens, the start before the first, the 3D view after the last", () => {
    assert.deepEqual(prevStage(0), { kind: "start" });
    assert.deepEqual(nextStage(0), { kind: "wizard", step: 1 });
    assert.deepEqual(prevStage(2), { kind: "wizard", step: 1 });
    assert.deepEqual(nextStage(WIZARD_LAST - 1), { kind: "wizard", step: WIZARD_LAST });
    assert.deepEqual(nextStage(WIZARD_LAST), { kind: "3d" });
  });
});

describe("phone flow — Mjere", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: a row per kitchen wall, values inside their ranges; the island when there is one`, () => {
      const c = cfgOf({ layout });
      const rows = measureRows(c);
      assert.deepEqual(
        rows.map((r) => r.wall),
        wallsFor(layout),
      );
      for (const r of rows) {
        assert.ok(r.room.min <= r.room.value && r.room.value <= r.room.max, `${layout} ${r.wall} room`);
        assert.ok(r.kitchen.min <= r.kitchen.value && r.kitchen.value <= r.kitchen.max, `${layout} ${r.wall} kitchen`);
        assert.equal(r.full, true);
        assert.equal(r.hint === null, rows.length === 1);
      }
      const isl = islandRow(c);
      assert.equal(Boolean(isl), layout === "otok" || layout === "poluotok" || layout === "G");
      if (isl) assert.ok(isl.min <= isl.value && isl.value <= isl.max);
      const ceil = ceilingRow(c);
      assert.ok(ceil.min <= ceil.value && ceil.value <= ceil.max);
    });
  }

  it("a room wall too long is clamped — with the planner's note in Croatian", () => {
    const c = cfgOf({ layout: "ravna" });
    const max = measureRows(c)[0].room.max;
    const r = setRoomLength(c, "a", max + 300);
    assert.ok(r.ok);
    assert.equal(r.cfg.walls.a, max);
    assert.match(r.warning ?? "", /Zid A može biti dugačak od \d+ do \d+ cm/);
  });

  it("a kitchen that takes the whole wall follows it; switched off it is one cabinet shorter and has its own length", () => {
    let c = cfgOf({ layout: "L" });
    c = setRoomLength(c, "a", 420).cfg;
    assert.equal(measureRows(c)[0].kitchen.value, 420);
    const off = setKitchenFull(c, "a", false);
    assert.ok(off.ok, off.warning ?? "");
    const row = measureRows(off.cfg)[0];
    assert.equal(row.full, false);
    assert.equal(row.kitchen.value, 360);
    const len = setKitchenLength(off.cfg, "a", 300);
    assert.ok(len.ok);
    assert.equal(kitchenExtent(len.cfg, "a")?.length.value, 300);
    const on = setKitchenFull(len.cfg, "a", true);
    assert.equal(measureRows(on.cfg)[0].full, true);
    assert.equal(measureRows(on.cfg)[0].kitchen.value, 420);
  });

  it("a wall at its shortest cannot hold a shorter kitchen: refused with the reason", () => {
    const c = cfgOf({ layout: "ravna" });
    const min = measureRows(c)[0].room.min;
    const short = setRoomLength(c, "a", min).cfg;
    assert.equal(measureRows(short)[0].canShorten, false);
    const r = setKitchenFull(short, "a", false);
    assert.equal(r.ok, false);
    assert.match(r.warning ?? "", /prekratak/);
  });

  it("ceiling, heights, island and the window", () => {
    const c = cfgOf({ layout: "otok" });
    const ceil = setCeilingHeight(c, 9999);
    assert.ok(ceil.ok);
    assert.equal(ceil.cfg.ceiling, ceilingRow(c).max);
    assert.match(ceil.warning ?? "", /Visina stropa može biti/);
    assert.equal(heightsMode(c), "standard");
    const up = setHeightsMode(c, "do-stropa");
    assert.equal(heightsMode(up.cfg), "do-stropa");
    assert.equal(heightsMode(setHeightsMode(up.cfg, "standard").cfg), "standard");
    const isl = setIslandLength(c, 300);
    assert.equal(isl.cfg.island, 300);
    assert.equal(windowOn(c), false);
    const w = setWindowOn(c, true);
    assert.ok(w.ok);
    assert.equal(windowOn(w.cfg), true);
    assert.equal(w.cfg.window?.wall, "a");
    assert.equal(windowOn(setWindowOn(w.cfg, false).cfg), false);
  });
});

describe("phone flow — Uređaji", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: what the default kitchen has, and choosing it again changes nothing`, () => {
      const c = cfgOf({ layout });
      const a = readAppliances(c);
      assert.equal(a.fridge, "ugradbeni");
      assert.equal(a.oven, "stup");
      assert.equal(a.hood, "ugradbena");
      assert.equal(a.island === null, !(layout === "otok" || layout === "poluotok" || layout === "G"));
      assert.ok(same(setFridgeKind(c, "ugradbeni").cfg, c));
      assert.ok(same(setOvenPlace(c, "stup").cfg, c));
      assert.ok(same(setHoodKind(c, "ugradbena").cfg, c));
      if (a.dishwasher !== null) assert.ok(same(setDishwasher(c, a.dishwasher).cfg, c));
      if (a.sink) assert.ok(same(setSinkSide(c, a.sink).cfg, c));
      if (a.column) assert.ok(same(setColumnEnd(c, a.column.end).cfg, c));
      if (a.island) assert.ok(same(setIslandUse(c, a.island).cfg, c));
    });

    it(`${layout}: the oven under the hob and back into the column`, () => {
      const c = cfgOf({ layout });
      const down = setOvenPlace(c, "ploca");
      assert.ok(down.ok, down.warning ?? "");
      assert.equal(readAppliances(down.cfg).oven, "ploca");
      const p = planKitchen(down.cfg);
      assert.ok(p.slots.some((s) => s.type === "ploca-pecnica"));
      assert.ok(!p.slots.some((s) => s.zone === "tall" && s.type.startsWith("pecnica")), "the column's oven went");
      assert.equal(readAppliances(down.cfg).fridge, "ugradbeni", "the fridge stays");
      const up = setOvenPlace(down.cfg, "stup");
      assert.ok(up.ok, up.warning ?? "");
      assert.equal(readAppliances(up.cfg).oven, "stup");
      assert.ok(!planKitchen(up.cfg).slots.some((s) => s.type === "ploca-pecnica"));
    });
  }

  it("a side-by-side fridge where the column has room; refused with what makes room where it has not", () => {
    const l = setFridgeKind(cfgOf({ layout: "L" }), "sbs");
    assert.ok(l.ok, l.warning ?? "");
    assert.equal(readAppliances(l.cfg).fridge, "sbs");
    assert.equal(readAppliances(setFridgeKind(l.cfg, "ugradbeni").cfg).fridge, "ugradbeni");
    const u = cfgOf({ layout: "U" });
    const no = setFridgeKind(u, "sbs");
    assert.equal(no.ok, false);
    assert.ok(same(no.cfg, u), "a refusal changes nothing");
    assert.match(no.warning ?? "", /pećnicu ispod ploče/);
    const yes = setFridgeKind(setOvenPlace(u, "ploca").cfg, "sbs");
    assert.ok(yes.ok, yes.warning ?? "");
    assert.equal(readAppliances(yes.cfg).fridge, "sbs");
  });

  it("the tall column moves to the other end", () => {
    const c = cfgOf({ layout: "ravna" });
    const a = readAppliances(c);
    assert.ok(a.column);
    assert.deepEqual(
      a.column.places.map((p) => p.label),
      ["Lijevo", "Desno"],
    );
    const other = a.column.places.find((p) => !(p.end === a.column?.end));
    assert.ok(other);
    const r = setColumnEnd(c, other.end);
    assert.ok(r.ok, r.warning ?? "");
    assert.equal(readAppliances(r.cfg).column?.end, other.end);
    const l = readAppliances(cfgOf({ layout: "L" })).column;
    assert.deepEqual(
      l?.places.map((p) => p.label),
      ["Zid A (stražnji)", "Zid B (lijevi)"],
    );
  });

  it("the sink left / right of the hob: the run mirrored, every cabinet kept", () => {
    for (const layout of ["ravna", "otok", "poluotok", "G"] as Layout[]) {
      const c = cfgOf({ layout });
      const a = readAppliances(c);
      assert.equal(a.sink, "lijevo", layout);
      const r = setSinkSide(c, "desno");
      assert.ok(r.ok, `${layout}: ${r.warning}`);
      assert.equal(readAppliances(r.cfg).sink, "desno");
      assert.deepEqual([...runOf(r.cfg, "a")].sort(), [...runOf(c, "a")].sort(), `${layout}: the same cabinets`);
      assert.deepEqual(runOf(r.cfg, "a"), [...runOf(c, "a")].reverse(), `${layout}: mirrored`);
      const back = setSinkSide(r.cfg, "lijevo");
      assert.ok(back.ok);
      assert.deepEqual(runOf(back.cfg, "a"), runOf(c, "a"));
    }
  });

  it("sink and hob on different walls: no side to choose (and a choice is refused)", () => {
    const c = cfgOf({ layout: "L" });
    const a = readAppliances(c);
    assert.equal(a.sink, null);
    assert.deepEqual(a.sinkOptions, []);
    assert.equal(setSinkSide(c, "desno").ok, false);
  });

  it("with a window the sink goes under it; moved away, it comes back under it with the other choices kept", () => {
    const c = setWindowOn(cfgOf({ layout: "ravna", walls: { a: 460, b: 220, c: 220 } }), true).cfg;
    const a = readAppliances(c);
    assert.equal(a.underWindow, true);
    assert.deepEqual(a.sinkOptions, ["lijevo", "desno"]);
    assert.ok(a.sink);
    assert.ok(same(setSinkSide(c, "prozor").cfg, c), "already under it");
    let k = setDishwasher(c, false).cfg;
    k = setOvenPlace(k, "ploca").cfg;
    const other = readAppliances(k).sink === "lijevo" ? "desno" : "lijevo";
    const away = setSinkSide(k, other);
    assert.ok(away.ok, away.warning ?? "");
    assert.equal(readAppliances(away.cfg).sink, other);
    if (readAppliances(away.cfg).underWindow) return; // (the mirrored run can leave it under a middle window)
    const under = setSinkSide(away.cfg, "prozor");
    assert.ok(under.ok, under.warning ?? "");
    const b = readAppliances(under.cfg);
    assert.equal(b.underWindow, true);
    assert.equal(b.dishwasher, false, "no dishwasher, as chosen");
    assert.equal(b.oven, "ploca", "the oven under the hob, as chosen");
  });

  it("no window on the sink's wall: nothing to put it under", () => {
    const c = cfgOf({ layout: "ravna" });
    assert.equal(readAppliances(c).underWindow, null);
    const r = setSinkSide(c, "prozor");
    assert.equal(r.ok, false);
    assert.match(r.warning ?? "", /prozora/);
  });

  it("the dishwasher: drawers in its place, and back beside the sink", () => {
    const c = cfgOf({ layout: "ravna" });
    const off = setDishwasher(c, false);
    assert.ok(off.ok);
    assert.equal(readAppliances(off.cfg).dishwasher, false);
    assert.deepEqual(
      runOf(off.cfg, "a").map((x) => x.replace(/\d+$/, "")),
      runOf(c, "a").map((x) => (x.startsWith("perilica") ? "ladice" : x.replace(/\d+$/, ""))),
    );
    const on = setDishwasher(off.cfg, true);
    assert.ok(on.ok, on.warning ?? "");
    assert.equal(readAppliances(on.cfg).dishwasher, true);
    const sink = planKitchen(on.cfg).slots.find((s) => moduleDef("base", s.type)?.feature === "sink");
    const dw = planKitchen(on.cfg).slots.find((s) => moduleDef("base", s.type)?.feature === "dishwasher");
    assert.ok(sink && dw);
    assert.ok(Math.abs(sink.x - dw.x) <= Math.max(sink.width, dw.width) + 0.5, "beside the sink");
  });

  it("no plain cabinet beside the sink: the dishwasher is refused with the reason", () => {
    const c = cfgOf({ layout: "poluotok" });
    assert.equal(readAppliances(c).dishwasher, false);
    const r = setDishwasher(c, true);
    assert.equal(r.ok, false);
    assert.match(r.warning ?? "", /perilic/);
  });

  it("hood kinds", () => {
    const c = cfgOf({ layout: "ravna" });
    for (const k of ["dimnjak", "kosa", "ploca", "ugradbena"] as const) {
      const r = setHoodKind(c, k);
      assert.ok(r.ok);
      assert.equal(readAppliances(r.cfg).hood, k);
    }
  });

  it("the island: a sink on it; what would leave the kitchen without a hob is refused", () => {
    const c = cfgOf({ layout: "otok", island: 300 });
    const sink = setIslandUse(c, "sink");
    assert.ok(sink.ok, sink.warning ?? "");
    assert.equal(readAppliances(sink.cfg).island, "sink");
    assert.ok(planKitchen(sink.cfg).slots.some((s) => s.zone === "island" && moduleDef("base", s.type)?.feature === "sink"));
    // the wall run edited (mirrored), a 240 cm island too short for the hob: the hob would be gone
    const short = setSinkSide(cfgOf({ layout: "otok" }), "desno").cfg;
    const r = setIslandUse(short, "both");
    assert.equal(r.ok, false);
    assert.match(r.warning ?? "", /prekratak/);
    assert.ok(same(r.cfg, short));
    assert.equal(setIslandUse(cfgOf({ layout: "ravna" }), "hob").ok, false);
  });
});
