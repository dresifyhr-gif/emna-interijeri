/**
 * Tall units standing IN a wall's base run (CabinetSpec.tall — the owner: "ja hoću na plusić stisnuti i staviti stup, ili
 * zamijeniti gornji element za stup — onda da se maknu odmah i gornji i donji element"; "kako mogu ubaciti stup na drugi
 * zid isto, da ih imam više"): the data model and its share links, the planner (worktop, backsplash, plinth LED, wall
 * units and the top row stop at a column; never under the window, never in a corner square), replace-with-tall on base
 * cabinets and wall units, tall units at the "+" between cabinets and next to an element, the "+" beyond a column at a
 * run's end, the planner's corner filler kept when a list is made explicit, the island's "+" between its cabinets, the
 * studio camera framing long walls, a headless engine build — and a fuzz over random kitchens.
 *
 *   npx tsx --test lib/studio/tall.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { quoteFromConfig } from "../admin/quote-from-config";
import { catalog, moduleDef } from "./catalog";
import {
  changeType,
  gapOptions,
  insertAfter,
  insertAtGap,
  insertBefore,
  insertOptions,
  moveLeft,
  moveRight,
  remove,
  setKitchenExtent,
  slotEditInfo,
  type EditResult,
} from "./edit";
import { applyViewOffset, fitBox, viewDir } from "./engine/camera";
import { buildKitchen, syncRunSurfaces, type KitchenEnv } from "./engine/kitchen";
import { GeoCache } from "./engine/geo";
import { GAP_LABEL, HOB_BESIDE_TALL, kitchenRange, materializeLists, planGaps, planKitchen, sanitizeConfig, wallsFor, type KitchenPlan, type ListId, type PlanSlot } from "./plan";
import { breakdown } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { composition, slotName, summarize } from "./summary";
import { DEFAULT_CONFIG, type CabinetSpec, type KitchenConfig, type Layout, type WallId } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const TALL_TYPES = catalog.modules.filter((m) => m.zone === "tall").map((m) => m.id);
const run = (p: KitchenPlan, w: WallId) => p.runs.find((r) => r.wall === w)!;
const slotOf = (r: EditResult) => planKitchen(r.cfg).slots.find((s) => s.id === r.slotId);
const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.min(a.to, b.to) - Math.max(a.from, b.from);
const span = (s: PlanSlot) => ({ from: s.x, to: s.x + s.width });
const T = (type: string, width: number): CabinetSpec => ({ type, width, tall: true });
const B = (type: string, width: number): CabinetSpec => ({ type, width });

/**
 * What must hold for every plan with tall units in it: nothing overlaps on the floor or on the wall, no worktop,
 * backsplash, plinth LED or wall unit over a tall unit, none under the window, in a corner square or over a corner unit.
 */
function invariants(p: KitchenPlan, where: string): void {
  for (const r of p.runs) {
    const floor = [
      ...p.slots.filter((s) => s.run === r.wall && (s.zone === "base" || s.zone === "tall")).map((s) => ({ id: s.id, ...span(s) })),
      ...p.pieces.filter((x) => x.run === r.wall && x.zone !== "upper").map((x) => ({ id: `${x.kind}/${x.zone}@${x.x}`, from: x.x, to: x.x + x.width })),
    ].sort((a, b) => a.from - b.from);
    for (let i = 1; i < floor.length; i++) assert.ok(floor[i].from >= floor[i - 1].to - 0.5, `${where}: ${r.wall} ${floor[i - 1].id} overlaps ${floor[i].id}`);
    const wallRow = [
      ...p.slots.filter((s) => s.run === r.wall && s.zone === "upper").map((s) => ({ id: s.id, ...span(s) })),
      ...p.pieces.filter((x) => x.run === r.wall && x.zone === "upper").map((x) => ({ id: `${x.kind}@${x.x}`, from: x.x, to: x.x + x.width })),
    ].sort((a, b) => a.from - b.from);
    for (let i = 1; i < wallRow.length; i++) assert.ok(wallRow[i].from >= wallRow[i - 1].to - 0.5, `${where}: ${r.wall} wall units ${wallRow[i - 1].id} / ${wallRow[i].id}`);
    for (const t of p.slots.filter((s) => s.run === r.wall && s.zone === "tall")) {
      const tr = span(t);
      for (const w of r.worktops) assert.ok(overlap(w, tr) <= 0.5, `${where}: worktop over ${t.id}`);
      for (const w of r.backsplash) assert.ok(overlap(w, tr) <= 0.5, `${where}: backsplash over ${t.id}`);
      for (const w of r.counters) assert.ok(overlap(w, tr) <= 0.5, `${where}: plinth LED over ${t.id}`);
      for (const u of wallRow) assert.ok(overlap(u, tr) <= 0.5, `${where}: ${u.id} over ${t.id}`);
      for (const c of p.slots.filter((s) => s.run === r.wall && s.corner)) assert.ok(overlap(span(c), tr) <= 0.5, `${where}: ${t.id} over a corner unit`);
      if (p.window && p.window.wall === r.wall) assert.ok(overlap({ from: p.window.offset, to: p.window.offset + p.window.width }, tr) <= 0.5, `${where}: ${t.id} under the window`);
      // B / C: the corner square (wall A's corner unit reaches 60 / 90 cm across) stays free
      if (r.wall !== "a" && r.ends.right === "corner") assert.ok(tr.to <= r.kitchen.to - 59.5, `${where}: ${t.id} in the corner square`);
      if (r.wall !== "a" && r.ends.left === "corner") assert.ok(tr.from >= r.kitchen.from + 59.5, `${where}: ${t.id} in the corner square`);
      assert.ok(tr.from >= r.kitchen.from - 0.5 && tr.to <= r.kitchen.to + 0.5, `${where}: ${t.id} inside the kitchen`);
    }
    // the hull and the pieces agree (older readers of RunPlan.worktop / counter)
    assert.deepEqual(r.worktop, r.worktops.length ? { from: r.worktops[0].from, to: r.worktops[r.worktops.length - 1].to } : null, where);
    assert.deepEqual(r.counter, r.counters.length ? { from: r.counters[0].from, to: r.counters[r.counters.length - 1].to } : null, where);
  }
}

/** a lost sink / hob / dishwasher is named in the note */
function essentialsWarned(before: KitchenPlan, r: EditResult, where: string): void {
  const n = (p: KitchenPlan, f: string) => p.slots.filter((s) => (s.zone === "base" || s.zone === "island") && moduleDef("base", s.type)?.feature === f).length;
  const after = planKitchen(r.cfg);
  for (const f of ["sink", "hob", "dishwasher"]) {
    if (n(after, f) < n(before, f)) assert.match(r.warning ?? "", /uklonjen|nema sudopera|nema ploče/, `${where}: lost ${f} silently`);
  }
}

describe("data model: tall units in a wall's base list (CabinetSpec.tall)", () => {
  it("sanitizeConfig keeps them in wall base lists only; share links carry them (T + tall code) and the filler strip (f)", () => {
    const c = kitchen({
      layout: "L",
      walls: { a: 450, b: 300, c: 220 },
      runs: { a: [B("filer", 6), B("ladice", 60), T("hladnjak", 60), T("pecnica-mikro", 60), B("perilica", 60)], isl: [T("hladnjak", 60), B("ladice", 60)] },
      upperRuns: { a: [T("ormar", 60) as CabinetSpec, B("vrata", 60)] },
    });
    assert.deepEqual(c.runs?.a, [B("filer", 6), B("ladice", 60), T("hladnjak", 60), T("pecnica-mikro", 60), B("perilica", 60)]);
    assert.deepEqual(c.runs?.isl, [B("ladice", 60)], "no tall unit on the island");
    assert.deepEqual(c.upperRuns?.a, [B("vrata", 60)], "nor in a wall-unit list");
    const link = encodeConfig(c);
    assert.match(link, /ra-f6l60Tr60Tom60d60/);
    assert.deepEqual(decodeConfig(link), c);
    // a tall type without the mark in a base list is not a base type: dropped
    assert.deepEqual(kitchen({ runs: { a: [B("hladnjak", 60), B("ladice", 60)] } }).runs?.a, [B("ladice", 60)]);
  });

  it("older links decode to exactly what they did (no tall marks, no filler strips), default kitchens have no column in a run", () => {
    const old = decodeConfig("2.ravna.420.220.220.260.antracit.mramor.bez.1.240.1.0.ra-vv60k50l90.ua-ff90h80n60.t-v80s45r60")!;
    assert.deepEqual(old.runs?.a, [B("vrata2", 60), B("smece", 50), B("ladice", 90)]);
    for (const layout of LAYOUTS) {
      const p = planKitchen(kitchen({ layout }));
      for (const r of p.runs) {
        assert.deepEqual(r.runTalls, [], layout);
        assert.equal(r.worktops.length, r.worktop ? 1 : 0, layout);
      }
      assert.ok(!p.slots.some((s) => /-tall-/.test(s.id)), layout);
    }
  });
});

describe("planner: a column standing in the run", () => {
  const c = kitchen({
    layout: "ravna",
    walls: { a: 480, b: 220, c: 220 },
    tall: false,
    runs: { a: [B("ladice", 60), B("sudoper", 80), B("perilica", 60), T("hladnjak", 60), T("pecnica", 60), B("ladice", 60), B("ploca", 80)] },
    upperRuns: { a: [B("vrata", 60), B("vrata", 80), B("klapna", 60), B("vrata", 60), B("napa", 80)] },
  });
  const p = planKitchen(c);
  const r = run(p, "a");
  const col = r.runTalls[0];

  it("one column of two units between two cover panels; tall slots 'a-tall-0', 'a-tall-1' in the wall's base list", () => {
    assert.equal(r.runTalls.length, 1);
    const tall = p.slots.filter((s) => s.zone === "tall");
    assert.deepEqual(tall.map((s) => s.id), ["a-tall-0", "a-tall-1"]);
    assert.ok(tall.every((s) => s.list?.id === "a"));
    assert.deepEqual(tall.map((s) => s.list?.index), [3, 4]);
    assert.equal(col.to - col.from, 124, "60 + 60 + two 2 cm cover panels");
    assert.equal(p.pieces.filter((x) => x.zone === "tall" && x.kind === "panel").length, 2);
    assert.deepEqual(p.lists.find((l) => l.id === "a")!.entries, c.runs!.a, "entries carry the tall mark (an edit starts from them)");
    assert.equal(slotName("a-tall-1"), "Zid A · 2. visoki slijeva");
    invariants(p, "ravna");
  });

  it("the worktop, the backsplash and the plinth LED stop at it; the wall units flow around it, the hood stays above the hob", () => {
    assert.equal(r.worktops.length, 2);
    assert.ok(Math.abs(r.worktops[0].to - col.from) < 0.01 && Math.abs(r.worktops[1].from - col.to) < 0.01, JSON.stringify(r.worktops));
    assert.equal(r.counters.length, 2);
    assert.ok(r.backsplash.every((b) => b.to <= col.from + 0.01 || b.from >= col.to - 0.01));
    const hood = p.slots.find((s) => s.anchored)!;
    const hob = p.slots.find((s) => s.type === "ploca")!;
    assert.equal(hood.x + hood.width / 2, hob.x + hob.width / 2);
    assert.deepEqual(p.lists.find((l) => l.id === "a")!.dropped, []);
    assert.ok(!p.warnings.some((w) => /ne stane/.test(w)), p.warnings.join(" | "));
  });

  it("priced and itemised (worktop metres without the column), in the summary and the admin quote", () => {
    const wt = r.worktops.reduce((n, w) => n + w.to - w.from, 0);
    assert.ok(wt < r.worktop!.to - r.worktop!.from);
    const b = breakdown(c);
    assert.ok(Number.isFinite(b.total) && b.total > 0);
    const sum = summarize(c).join("\n");
    assert.match(sum, /Visoki elementi u nizu uz zid A: ugradbeni hladnjak 60 cm, pećnica u visini očiju 60 cm/);
    assert.ok(composition(c).find((row) => row.list === "a")!.items.some((it) => it.type === "hladnjak"));
    const q = quoteFromConfig(c, { vatPct: 25, newId: () => "x" });
    assert.equal(q.mode, "plan");
    assert.ok(q.items.some((it) => /^Visoki elementi u nizu – zid A/.test(it.description)));
    const gross = q.items.reduce((s, it) => s + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
    assert.ok(Math.abs(gross - b.total) < Math.max(5, b.total * 0.005), `${gross} vs ${b.total}`);
  });

  it("never under the window: such a column is left out with a note, the rest closes up", () => {
    const w = kitchen({ ...c, window: { wall: "a", offset: 230, width: 100, sill: 100 } });
    const q = planKitchen(w);
    assert.ok(q.warnings.some((x) => /ne može stajati ispod prozora/.test(x)), q.warnings.join(" | "));
    assert.ok(q.lists.find((l) => l.id === "a")!.dropped.some((e) => e.tall));
    invariants(q, "window");
  });

  it("'do stropa': the column has its top box and the cornice runs over it", () => {
    const h = kitchen({ ...c, ceiling: 300, heights: { mode: "do-stropa" } });
    const q = planKitchen(h);
    const cc = run(q, "a").runTalls[0];
    assert.ok(q.heights.cornices.some((x) => x.zone === "tall" && x.run === "a" && x.from === cc.from && x.to === cc.to));
    assert.ok(q.heights.tallSplit !== null);
  });

  it("a hob right beside a column is worth a note; a filler between a column and the room wall is the column's (full height)", () => {
    const hb = kitchen({ layout: "ravna", walls: { a: 300, b: 220, c: 220 }, tall: false, runs: { a: [B("ladice", 60), B("ploca", 60), T("hladnjak", 60), B("sudoper", 80)] } });
    assert.ok(planKitchen(hb).warnings.includes(`Zid A: ${HOB_BESIDE_TALL}`));
    // U, wall C (from the corner with A to the room's wall): a column at its wall end, a 6 cm filler beside it
    const u = kitchen({ layout: "U", walls: { a: 400, b: 300, c: 300 }, tall: false, extents: { c: { length: 300 } } });
    const p0 = planKitchen(u);
    const cEnd = p0.slots.filter((s) => s.run === "c" && s.zone === "base" && !s.corner).sort((x, y) => y.x - x.x)[0];
    const res = changeType(u, cEnd.id, "ormar", "tall");
    if (res.ok) {
      const q = planKitchen(res.cfg);
      invariants(q, "U wall end");
      const rc = run(q, "c");
      for (const f of q.pieces.filter((x) => x.run === "c" && x.kind === "filler" && x.zone === "base")) {
        for (const t of rc.runTalls) assert.ok(overlap({ from: f.x, to: f.x + f.width }, t) <= 0.01);
      }
    }
  });
});

describe('replace with a tall unit (the owner: "da se maknu odmah i gornji i donji element")', () => {
  it("a base cabinet: the tall unit takes its place, the wall units above go, the sink that went is named — one EditResult", () => {
    const c = kitchen({ layout: "L", walls: { a: 450, b: 300, c: 220 } });
    const p0 = planKitchen(c);
    const sink = p0.slots.find((s) => s.type === "sudoper")!;
    const r = changeType(c, sink.id, "hladnjak");
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /zamijenjen/);
    assert.match(r.warning ?? "", /Element za sudoper \(\d+ cm\) je uklonjen/);
    assert.match(r.warning ?? "", /Kuhinja sada nema sudopera/);
    const s = slotOf(r)!;
    assert.equal(s.zone, "tall");
    assert.equal(s.type, "hladnjak");
    assert.equal(s.run, sink.run);
    assert.ok(overlap(span(s), span(sink)) >= 50, "where the sink was");
    // what the column does not take of the 90 cm stays free beside it: the other cabinets stay where they were
    const q = planKitchen(r.cfg);
    for (const o of p0.slots.filter((x) => x.run === sink.run && x.zone === "base" && x.id !== sink.id)) {
      assert.ok(q.slots.some((x) => x.type === o.type && x.width === o.width && Math.abs(x.x - o.x) < 0.5), `${o.id} stays`);
    }
    invariants(q, "L sink");
    essentialsWarned(p0, r, "L sink");
    // undo is the config before: one step
    assert.notDeepEqual(r.cfg, c);
  });

  it("a wall unit: the base cabinet below it gives its place, both go ('Gornji i donji element zamijenjeni visokim elementom.')", () => {
    const c = kitchen({ layout: "L", walls: { a: 450, b: 360, c: 220 } });
    const p0 = planKitchen(c);
    const up = p0.slots.find((s) => s.run === "b" && s.zone === "upper" && !s.corner && s.width >= 45 && p0.slots.some((b) => b.run === "b" && b.zone === "base" && !b.corner && overlap(span(b), span(s)) > s.width / 2))!;
    const r = changeType(c, up.id, "pecnica-mikro", "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /^Gornji i donji element zamijenjeni visokim elementom\./);
    const q = planKitchen(r.cfg);
    const t = slotOf(r)!;
    assert.equal(t.zone, "tall");
    assert.ok(overlap(span(t), span(up)) > 0, "under where the wall unit was");
    invariants(q, "wall unit");
    essentialsWarned(p0, r, "wall unit");
  });

  it("an edited wall-unit list loses exactly the wall units that hang where the column stands; the rest keep their place", () => {
    const c = kitchen({
      layout: "ravna",
      walls: { a: 420, b: 220, c: 220 },
      tall: false,
      runs: { a: [B("ladice", 60), B("vrata", 60), B("ladice", 60), B("sudoper", 80), B("perilica", 60), B("ploca", 80)] },
      upperRuns: { a: [B("vrata", 60), B("vrata", 60), B("vrata", 60), B("vrata", 80), B("vrata", 60), B("napa", 80)] },
    });
    const p0 = planKitchen(c);
    const target = p0.slots.find((s) => s.zone === "base" && s.list?.index === 1)!;
    const r = changeType(c, target.id, "ormar", "tall");
    assert.ok(r.ok, r.warning ?? "");
    const q = planKitchen(r.cfg);
    const t = slotOf(r)!;
    assert.equal(t.width, 60, "the width nearest the cabinet's place (60 cm less the column's two cover panels)");
    // the wall units it stands under go; one that only grazes it (less than a third of its width, ≤ 20 cm) shifts aside
    const under = p0.slots.filter((s) => s.zone === "upper" && overlap(span(s), span(t)) >= Math.min(20, s.width / 3));
    const grazing = p0.slots.filter((s) => s.zone === "upper" && overlap(span(s), span(t)) > 0.5 && !under.includes(s));
    assert.ok(under.length >= 1);
    const left = q.slots.filter((s) => s.zone === "upper" && !s.anchored && s.type !== "prazno").length;
    const before = p0.slots.filter((s) => s.zone === "upper" && !s.anchored).length;
    assert.ok(left <= before - under.length && left >= before - under.length - grazing.length, `${left} of ${before}: ${under.length} under it, ${grazing.length} grazing`);
    assert.match(r.warning ?? "", /zamijenjeni su visokim elementom|Gornji i donji element zamijenjeni/);
    assert.ok(q.slots.some((s) => s.anchored), "the hood stays above the hob");
    invariants(q, "explicit uppers");
  });

  it("refused in a corner, on the island, under the window — with the reason", () => {
    const L = kitchen({ layout: "L" });
    const corner = planKitchen(L).slots.find((s) => s.corner && s.zone === "base")!;
    assert.match(changeType(L, corner.id, "hladnjak").warning ?? "", /U kutu ne može stajati visoki element/);
    const o = kitchen({ layout: "otok" });
    const isl = planKitchen(o).slots.find((s) => s.zone === "island")!;
    const ri = changeType(o, isl.id, "hladnjak", "tall");
    assert.equal(ri.ok, false);
    const w = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, window: { wall: "a", offset: 140, width: 100, sill: 100 } });
    const under = planKitchen(w).slots.find((s) => s.zone === "base" && s.x > 150 && s.x < 200)!;
    assert.equal(changeType(w, under.id, "hladnjak").warning, "Ispod prozora ne može stajati visoki element.");
  });

  it("several columns on one wall and on several walls; each can become a base cabinet again, move or go", () => {
    let c = kitchen({ layout: "L", walls: { a: 450, b: 400, c: 220 } });
    for (const [w, t] of [["a", "pecnica-mikro"], ["b", "hladnjak"], ["b", "ormar"]] as const) {
      const p = planKitchen(c);
      const s = p.slots.filter((x) => x.run === w && x.zone === "base" && !x.corner && x.width >= 60 && !moduleDef("base", x.type)?.feature)[0] ?? p.slots.find((x) => x.run === w && x.zone === "base" && !x.corner)!;
      const r = changeType(c, s.id, t, "tall");
      assert.ok(r.ok, `${w} ${t}: ${r.warning}`);
      c = r.cfg;
    }
    const p = planKitchen(c);
    assert.ok(run(p, "a").runTalls.length >= 1 && run(p, "b").runTalls.length >= 1);
    assert.ok(p.slots.filter((s) => s.zone === "tall" && s.list?.id === "b").length === 2);
    invariants(p, "multi");
    assert.deepEqual(decodeConfig(encodeConfig(c)), c);
    const t = p.slots.find((s) => s.zone === "tall" && s.list?.id === "b")!;
    // its options: other tall types, or a base type again
    const info = slotEditInfo(c, t.id)!;
    assert.equal(info.zone, "tall");
    assert.ok(info.types.some((x) => x.id === "pecnica" && x.width === 60));
    const back = changeType(c, t.id, "ladice");
    assert.ok(back.ok, back.warning ?? "");
    assert.equal(slotOf(back)?.zone, "base");
    for (const f of [moveLeft, moveRight, remove]) {
      const m = f(c, t.id);
      if (m.ok) invariants(planKitchen(m.cfg), f.name);
    }
    assert.ok(remove(c, t.id).ok);
  });

  it("slotEditInfo previews it: `tall` = what changeType gives, `insertAfterTall` / `insertBeforeTall` = what insertAfter / insertBefore give", () => {
    const c = kitchen({ layout: "L", walls: { a: 450, b: 300, c: 220 } });
    const p = planKitchen(c);
    for (const s of p.slots.filter((x) => x.run !== "isl" && !x.corner && (x.zone === "base" || x.zone === "upper")).slice(0, 6)) {
      const info = slotEditInfo(c, s.id)!;
      for (const t of info.tall) {
        const r = changeType(c, s.id, t.id, "tall");
        assert.equal(r.ok, t.width !== null, `${s.id} → ${t.id}: ${r.warning}`);
        if (r.ok) assert.equal(slotOf(r)?.width, t.width);
      }
      if (s.zone !== "base") {
        assert.deepEqual(info.insertAfterTall, []);
        continue;
      }
      for (const [list, ins] of [
        [info.insertAfterTall, insertAfter],
        [info.insertBeforeTall, insertBefore],
      ] as const) {
        for (const t of list) for (const w of moduleDef("tall", t.id)!.widths) assert.equal(ins(c, s.id, t.id, w, "tall").ok, Boolean(t.fitting?.includes(w)), `${s.id} ${t.id} ${w}`);
      }
      assert.deepEqual(insertOptions(c, s.id, "after", "tall"), info.insertAfterTall);
    }
  });

  // the owner's room: L, wall A 300, wall B 450 with a 300 cm kitchen on it (150 cm of bare wall at its open end)
  const owner = () => kitchen({ layout: "L", walls: { a: 300, b: 450, c: 220 }, extents: { b: { length: 300 } } });
  const kitchenLen = (c: KitchenConfig, w: WallId) => {
    const k = kitchenRange(c, w);
    return k.to - k.from;
  };
  const baseRow = (p: KitchenPlan, w: WallId) =>
    p.slots
      .filter((s) => s.run === w && (s.zone === "base" || s.zone === "tall") && !s.corner && s.list?.id === w)
      .sort((a, b) => a.x - b.x)
      .map((s) => `${s.type}${s.zone === "tall" ? "^" : ""}${s.width}`);

  it("a side-by-side fridge for a wall unit of a run with bare wall beyond it: the run grows, no cabinet gets narrower", () => {
    const c = owner();
    const p0 = planKitchen(c);
    assert.deepEqual(baseRow(p0, "b"), ["ladice45", "ladice50", "ploca80", "ladice60"]);
    const up = p0.slots.find((s) => s.run === "b" && s.zone === "upper" && s.type === "vrata" && s.x < 250)!;
    const r = changeType(c, up.id, "hladnjak-sbs", "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /^Gornji i donji element zamijenjeni visokim elementom\. Kuhinja na zidu B duža je za 47 cm\./);
    assert.doesNotMatch(r.warning ?? "", /uži|sada je \d+ cm umjesto/);
    assert.equal(r.uppersGone, 1, "only the wall unit that was replaced (the niche moved along with its cabinet)");
    const p1 = planKitchen(r.cfg);
    // the drawers below the wall unit made way; every other cabinet keeps its width, the hob its place
    assert.deepEqual(baseRow(p1, "b"), ["ladice45", "hladnjak-sbs^96", "ploca80", "ladice60"]);
    const hob = (p: KitchenPlan) => p.slots.find((s) => s.type === "ploca")!.x;
    assert.ok(Math.abs(hob(p1) - hob(p0)) <= 3, "the hob stays (the filler strip at the corner gave its 3 cm)");
    assert.equal(kitchenLen(r.cfg, "b"), 347);
    assert.equal(slotOf(r)?.type, "hladnjak-sbs");
    invariants(p1, "owner sbs");
    assert.deepEqual(decodeConfig(encodeConfig(r.cfg)), r.cfg);
    // a full wall (no bare wall beyond the kitchen) still refuses it with the reason
    const full = kitchen({ layout: "L", walls: { a: 300, b: 300, c: 220 } });
    const fu = planKitchen(full).slots.find((s) => s.run === "b" && s.zone === "upper" && s.type === "vrata")!;
    const no = changeType(full, fu.id, "hladnjak-sbs", "tall");
    if (!no.ok) assert.match(no.warning ?? "", /ne stane/);
    else assert.equal(kitchenLen(no.cfg, "b"), 300, "a full wall cannot grow");
  });

  it("growing the run comes before a narrower neighbour; the question counts only what really goes", () => {
    const c = owner();
    const p0 = planKitchen(c);
    // the drawers under the wall unit: a 60 cm fridge (64 with its cover panels) for 50 cm drawers
    const drawers = p0.slots.find((s) => s.run === "b" && s.type === "ladice" && s.width === 50)!;
    const r = changeType(c, drawers.id, "hladnjak", "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /Kuhinja na zidu B duža je za 11 cm\./);
    assert.deepEqual(baseRow(planKitchen(r.cfg), "b"), ["ladice45", "hladnjak^60", "ploca80", "ladice60"]);
    // a larder that fits the drawers' place needs no room at all
    const l = changeType(c, drawers.id, "smocnica", "tall");
    assert.ok(l.ok);
    assert.equal(kitchenLen(l.cfg, "b"), 300);
    assert.equal(l.uppersGone, 1, "the wall unit above the drawers; the niche beside it only gets narrower");
    assert.match(l.warning ?? "", /^Gornji i donji element zamijenjeni visokim elementom\./);
  });

  it("a column at a run's free end: its '+' keeps the cabinets as they are, '+ lijevo / + desno' on it grow the run into the bare wall", () => {
    const c = owner();
    const p0 = planKitchen(c);
    const end = planGaps(p0).find((g) => g.id === "end:b-left")!;
    const r1 = insertAtGap(c, end.id, "hladnjak", 60, "tall");
    assert.ok(r1.ok, r1.warning ?? "");
    const p1 = planKitchen(r1.cfg);
    assert.deepEqual(baseRow(p1, "b"), baseRow(p0, "b"), "the planner does not fill the run anew beside the new column");
    assert.equal(kitchenLen(r1.cfg, "b"), 364);
    for (const [ins, order] of [
      [insertBefore, ["smocnica", "hladnjak"]],
      [insertAfter, ["hladnjak", "smocnica"]],
    ] as const) {
      const r2 = ins(r1.cfg, r1.slotId!, "smocnica", 60);
      assert.ok(r2.ok, r2.warning ?? "");
      assert.match(r2.warning ?? "", /Kuhinja na zidu B duža je za 60 cm\./);
      const p2 = planKitchen(r2.cfg);
      assert.deepEqual(baseRow(p2, "b"), baseRow(p0, "b"), "the base cabinets keep their room");
      assert.deepEqual(p2.slots.filter((s) => s.list?.id === "tall:b-left").sort((a, b) => a.x - b.x).map((s) => s.type), order);
      assert.equal(kitchenLen(r2.cfg, "b"), 424);
      invariants(p2, "grown column");
    }
    // what the editor offers there agrees
    const info = slotEditInfo(r1.cfg, r1.slotId!)!;
    assert.equal(info.insertBefore.find((t) => t.id === "smocnica")?.width, 60);
  });
});

describe('"+" and tall units', () => {
  it("between two base cabinets of a full row: a tall unit stands in the run there ('Donji ili visoki element')", () => {
    const c = kitchen({ layout: "L" });
    const seam = planGaps(planKitchen(c)).find((g) => g.kind === "seam" && g.zone === "base")!;
    assert.ok(seam);
    assert.equal(seam.label, GAP_LABEL.baseOrTall);
    const o = gapOptions(c, seam.id)!;
    const t = o.tall.find((x) => (x.fitting?.length ?? 0) > 0)!;
    assert.ok(t, "a tall unit fits there");
    const r = insertAtGap(c, seam.id, t.id, t.fitting![t.fitting!.length - 1], "tall");
    assert.ok(r.ok, r.warning ?? "");
    const s = slotOf(r)!;
    assert.equal(s.zone, "tall");
    assert.equal(s.list?.id, seam.run);
    invariants(planKitchen(r.cfg), "seam");
  });

  it("into empty space ('Slobodno mjesto'): the tall unit takes its place, the rest stays empty", () => {
    const c = kitchen({ layout: "ravna", walls: { a: 360, b: 220, c: 220 }, tall: false, runs: { a: [B("ladice", 60), B("slobodno", 90), B("sudoper", 80), B("ploca", 80)] } });
    const g = planGaps(planKitchen(c)).find((x) => x.kind === "free")!;
    const o = gapOptions(c, g.id)!;
    assert.ok(o.tall.find((x) => x.id === "hladnjak")?.fitting?.includes(60));
    const r = insertAtGap(c, g.id, "hladnjak", 60, "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.deepEqual(r.cfg.runs?.a, [B("ladice", 60), T("hladnjak", 60), B("slobodno", 26), B("sudoper", 80), B("ploca", 80)]);
  });

  it("gapOptions previews exactly what insertAtGap does for tall units (one probe per width is sound)", () => {
    const cases = [kitchen({ layout: "L" }), kitchen({ layout: "U", walls: { a: 420, b: 300, c: 300 } }), kitchen({ layout: "ravna", walls: { a: 500, b: 220, c: 220 }, window: { wall: "a", offset: 200, width: 90, sill: 100 } })];
    for (const c of cases) {
      for (const g of planGaps(planKitchen(c))) {
        const o = gapOptions(c, g.id)!;
        if (g.zone !== "base" || g.run === "isl") assert.deepEqual(o.tall, [], `${g.id}: no tall unit there`);
        for (const t of o.tall) {
          for (const w of moduleDef("tall", t.id)!.widths) {
            const r = insertAtGap(c, g.id, t.id, w, "tall");
            assert.equal(r.ok, Boolean(t.fitting?.includes(w)), `${c.layout} ${g.id} ${t.id} ${w}: ${r.warning}`);
          }
        }
      }
    }
  });

  it("the '+' beyond a column at a run's end puts a base cabinet there — beyond the column, which joins the run", () => {
    const c = setKitchenExtent(kitchen({ layout: "L", walls: { a: 400, b: 450, c: 220 } }), "a", { length: 300 }).cfg;
    const g = planGaps(planKitchen(c)).find((x) => x.id === "end:a-right")!;
    assert.equal(g.tallList, "tall", "the tall column stands at that end");
    const col0 = planKitchen(c).slots.filter((s) => s.list?.id === "tall").map((s) => [s.type, s.x]);
    const r = insertAtGap(c, g.id, "ladice", 60);
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /s vanjske strane visokog stupa/);
    const q = planKitchen(r.cfg);
    const s = slotOf(r)!;
    const col = q.slots.filter((x) => x.zone === "tall" && x.run === "a");
    assert.deepEqual(
      col.map((x) => [x.type, x.x]),
      col0,
      "the column stays where it was",
    );
    assert.ok(col.every((x) => x.x + x.width <= s.x), "the cabinet stands beyond it");
    assert.equal(r.cfg.tall, false, "the tall column is part of wall A's run now");
    assert.ok(col.every((x) => x.list?.id === "a"));
    assert.deepEqual(kitchenRange(r.cfg, "a"), { from: 0, to: 362 }, "the run grows by the cabinet and its end panel");
    invariants(q, "beyond");
    // a tall unit at that '+' still joins the column at its outer side
    const t = insertAtGap(c, g.id, "smocnica", 30, "tall");
    assert.ok(t.ok, t.warning ?? "");
    assert.equal(planKitchen(t.cfg).slots.filter((x) => x.list?.id === "tall").length, 3);
  });

  it("a column standing in the run at its end: a tall unit joins it on the outer side, a base cabinet goes beyond it", () => {
    const c = kitchen({ layout: "L", walls: { a: 380, b: 450, c: 220 }, extents: { b: { length: 300 } }, runs: { b: [T("hladnjak", 60), B("ladice", 60), B("vrata", 60)] } });
    const g = planGaps(planKitchen(c)).find((x) => x.id === "end:b-left")!;
    assert.equal(g.label, GAP_LABEL.baseOrTall);
    const t = insertAtGap(c, g.id, "smocnica", 30, "tall");
    assert.ok(t.ok, t.warning ?? "");
    assert.deepEqual(t.cfg.runs?.b?.slice(0, 2), [T("smocnica", 30), T("hladnjak", 60)]);
    assert.equal(planKitchen(t.cfg).runs.find((r) => r.wall === "b")!.runTalls.length, 1, "one column");
    const b = insertAtGap(c, g.id, "ladice", 45);
    assert.ok(b.ok, b.warning ?? "");
    assert.deepEqual(b.cfg.runs?.b?.slice(0, 2), [B("ladice", 45), T("hladnjak", 60)]);
  });

  it("a tall unit at a free end where a wall unit hangs over the bare floor: that wall unit makes way, with a note", () => {
    const c = kitchen({ layout: "L", walls: { a: 300, b: 450, c: 220 }, extents: { b: { length: 300 } } });
    const u = insertAtGap(c, "upend:b-left", "vrata", 60);
    assert.ok(u.ok);
    const r = insertAtGap(u.cfg, "end:b-left", "hladnjak", 60, "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /Gornji element iznad visokog elementa je uklonjen/);
    invariants(planKitchen(r.cfg), "3c");
  });

  it("a tall unit of the same type as the column's outer one joins it too (the wall unit over the bare floor still goes)", () => {
    // found by the fuzz: wall A with a column "ormar 60 + metle 30" standing in the run, bare floor and a wall unit left of it
    const c = decodeConfig("2.ravna.337.457.236.260.antracit.mramor.bez.1.240.1.0.ra-Tv60Tb30p60f1.ua-v30h60")!;
    const o = gapOptions(c, "end:a-left")!;
    const offered = o.tall.filter((t) => t.width !== null);
    assert.ok(offered.some((t) => t.id === "ormar"), "ormar offered");
    const uppers = (p: KitchenPlan) => p.slots.filter((s) => s.run === "a" && s.zone === "upper" && !moduleDef("upper", s.type)?.spacer).length;
    const n0 = uppers(planKitchen(c));
    for (const t of offered) {
      for (const w of t.fitting ?? [t.width!]) {
        const r = insertAtGap(c, "end:a-left", t.id, w, "tall");
        assert.ok(r.ok, `${t.id} ${w}: ${r.warning ?? ""}`);
        const p = planKitchen(r.cfg);
        assert.deepEqual(r.cfg.runs?.a?.[0], T(t.id, w), `${t.id} ${w} joins the column on its outer side`);
        assert.ok(p.slots.some((s) => s.list?.id === "tall"), `${t.id} ${w}: the main column still stands`);
        // the wall unit over the bare floor goes where the wider units reach it (and the count says so)
        assert.equal(r.uppersGone, n0 - uppers(p), `${t.id} ${w}: uppersGone`);
        if (w >= 40) assert.equal(r.uppersGone, 1, `${t.id} ${w}: the wall unit over it goes`);
        invariants(p, `same-type join ${t.id} ${w}`);
      }
    }
  });

  it("'+ desno' in a column: a wall unit over the bare floor beyond it that the row no longer fits goes (it was refused)", () => {
    // found by the fuzz: corner unit, column "pećnica s mikrovalnom + smočnica" in the run, bare floor and a shelf beyond it
    const c = decodeConfig("2.L.376.409.238.260.antracit.mramor.bez.1.240.1.0.ra-Tom60Ts40.rb-l60To60x26Trv96.ua-o60.ub-n60.t-b30.ea-l277.eb-l346.tp-bl")!;
    const info = slotEditInfo(c, "a-tall-0")!;
    const offered = info.insertAfter.filter((t) => t.width !== null);
    assert.ok(offered.some((t) => t.id === "metle"), "metle offered");
    for (const t of offered) {
      for (const w of t.fitting ?? [t.width!]) {
        const r = insertAfter(c, "a-tall-0", t.id, w, "tall");
        assert.ok(r.ok, `${t.id} ${w}: ${r.warning ?? ""}`);
        const p = planKitchen(r.cfg);
        assert.equal(slotOf(r)?.type, t.id, `${t.id} ${w}: the new unit is selected`);
        assert.ok((r.uppersGone ?? 0) >= 1, `${t.id} ${w}: the shelf that no longer fits is counted`);
        invariants(p, `+desno ${t.id} ${w}`);
      }
    }
  });

  it("the island / peninsula row gets its '+' between two cabinets when no room is left inside it (never a tall unit)", () => {
    for (const layout of ["otok", "poluotok", "G"] as Layout[]) {
      const c = kitchen({ layout });
      const g = planGaps(planKitchen(c)).find((x) => x.kind === "seam" && x.list === "isl");
      assert.ok(g, layout);
      assert.equal(g.zone, "island");
      assert.equal(g.label, layout === "otok" ? GAP_LABEL.island : GAP_LABEL.peninsula);
      const o = gapOptions(c, g.id)!;
      assert.deepEqual(o.tall, []);
      const t = o.types.find((x) => x.fitting?.includes(30))!;
      const r = insertAtGap(c, g.id, t.id, 30);
      assert.ok(r.ok, r.warning ?? "");
      assert.equal(slotOf(r)?.zone, "island");
      assert.equal(planKitchen(r.cfg).slots.filter((s) => s.zone === "island").length, planKitchen(c).slots.filter((s) => s.zone === "island").length + 1);
    }
  });
});

describe("the planner's filler kept when a base list is made explicit (cabinets do not slide)", () => {
  it("materialized lists hold the filler at a wall / corner / column end; growing the run leaves the cabinets in place", () => {
    const c = setKitchenExtent(kitchen({ layout: "L", walls: { a: 380, b: 300, c: 220 } }), "b", { length: 180 }).cfg;
    const p0 = planKitchen(c);
    const b0 = p0.slots.filter((s) => s.run === "b" && s.zone === "base").map((s) => [s.type, s.x]);
    const ent = p0.lists.find((l) => l.id === "a")!.entries;
    assert.equal(ent[0].type, "filer", "wall A: the filler beside the corner unit is an entry");
    const r = insertAtGap(c, "upend:b-left", "polica", 60);
    assert.ok(r.ok, r.warning ?? "");
    const p1 = planKitchen(r.cfg);
    assert.deepEqual(
      p1.slots.filter((s) => s.run === "b" && s.zone === "base").map((s) => [s.type, s.x]),
      b0,
      "the cabinets stay where they were",
    );
    const rb = run(p1, "b");
    assert.deepEqual(rb.cabinets, run(p0, "b").cabinets, "the kitchen label measures the same cabinets (not 297 for 300)");
    assert.ok(r.cfg.runs?.b?.some((e) => e.type === "filer"));
    // and it gives way first when room is needed (an insert into its cm works without making anything narrower)
    const full = kitchen({ layout: "L", walls: { a: 380, b: 220, c: 220 } });
    const pf = planKitchen(full);
    const fl = pf.lists.find((l) => l.id === "a")!;
    const filer = fl.entries.find((e) => e.type === "filer");
    assert.ok(filer && filer.width > 0);
    assert.equal(fl.capacity - fl.used >= filer.width - 0.01, true, "its cm count as free");
  });
});

describe("studio camera (headless, three.js math only)", () => {
  it("K.frame holds every room wall, floor to ceiling, over its whole length — framed inside the desktop region at 1440 × 900", () => {
    const VIEW: Partial<Record<Layout, { az: number; el: number }>> = { L: { az: 0.5, el: 0.21 }, U: { az: 0.1, el: 0.3 }, ravna: { az: 0.34, el: 0.2 } };
    for (const [layout, a, b, kb] of [
      ["L", 450, 300],
      ["L", 300, 450],
      ["L", 300, 450, 300],
      ["L", 600, 600],
      ["U", 450, 400],
      ["ravna", 600, 220],
    ] as [Layout, number, number, number?][]) {
      // (kb: the kitchen takes only that much of room wall B — the room's wall is framed whole all the same)
      const c = kitchen({ layout, walls: { a, b, c: b }, ...(kb ? { extents: { b: { length: kb } } } : {}) });
      const K = buildKitchen(engineEnv(), planKitchen(c));
      K.root.updateMatrixWorld(true);
      const W = 1440;
      const H = 900;
      const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 120);
      // the engine's computeRegion with the desktop insets (top bar 72 px, panel 392 + 2 × 20 px)
      const region = { x0: 0.03, x1: 1 - 432 / W - 0.03, y0: 72 / H + 0.06, y1: 0.95 };
      applyViewOffset(cam, W, H, region);
      const v = VIEW[layout]!;
      const f = fitBox(cam, K.frame, K.frame.getCenter(new THREE.Vector3()), viewDir(v.az, v.el), region, 1.5, 60);
      cam.position.copy(f.position);
      cam.lookAt(f.target);
      cam.updateMatrixWorld(true);
      for (const r of planKitchen(c).runs) {
        const g = K.runs.get(r.wall)!.group;
        for (const x of [0, r.length / 100]) {
          for (const y of [0, c.ceiling / 100]) {
            const p = g.localToWorld(new THREE.Vector3(x, y, 0)).project(cam);
            const sx = (p.x + 1) / 2;
            const sy = (1 - p.y) / 2;
            assert.ok(sx >= region.x0 - 1e-3 && sx <= region.x1 + 1e-3 && sy >= region.y0 - 1e-3 && sy <= region.y1 + 1e-3, `${layout} ${a}/${b} ${r.wall} (${x}, ${y}): ${sx.toFixed(3)}, ${sy.toFixed(3)}`);
          }
        }
      }
    }
  });
});

describe("engine (headless scene graph)", () => {
  it("columns in runs build finite geometry; the worktop mesh stops at them; an edit that adds one rebuilds the run's surfaces", () => {
    const c0 = kitchen({ layout: "L", walls: { a: 450, b: 300, c: 220 } });
    const sink = planKitchen(c0).slots.find((s) => s.type === "sudoper")!;
    const r = changeType(c0, sink.id, "hladnjak");
    assert.ok(r.ok);
    const p = planKitchen(r.cfg);
    const K = buildKitchen(engineEnv(), p);
    K.root.updateMatrixWorld(true);
    K.timeline.finish();
    K.root.updateMatrixWorld(true);
    const box = new THREE.Box3();
    K.root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute("position");
      for (let i = 0; i < pos.count * 3; i++) assert.ok(Number.isFinite((pos.array as ArrayLike<number>)[i]), `NaN in ${o.name}`);
    });
    const rr = run(p, sink.run as WallId);
    const runRT = K.runs.get(sink.run)!;
    assert.deepEqual(runRT.worktopPieces?.length, rr.worktops.length);
    // the worktop geometry (run frame) leaves the column's stretch free
    const wt = runRT.worktop!.children[0] as THREE.Mesh;
    wt.geometry.computeBoundingBox();
    const col = rr.runTalls[0];
    const pos = wt.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) * 100;
      assert.ok(x <= col.from + 0.01 || x >= col.to - 0.01, `worktop vertex at ${x} inside the column ${col.from}–${col.to}`);
    }
    box.setFromObject(K.root);
    assert.ok(!box.isEmpty());
    // the element edit (no rebuild) rebuilds the run's worktop, backsplash and plinth LED in place
    const env = engineEnv();
    const K0 = buildKitchen(env, planKitchen(c0));
    assert.equal(K0.runs.get(sink.run)!.worktopPieces?.length, 1);
    assert.equal(syncRunSurfaces(K0, env.mats, p, env.mats.top("mramor"), true), true);
    assert.equal(K0.runs.get(sink.run)!.worktopPieces?.length, 2);
  });
});

describe("fuzz: random kitchens, replace-with-tall on every element, every '+'", () => {
  it("nothing overlaps, no worktop / wall unit over a tall unit, the essentials are named, links round-trip", () => {
    let seed = 20261025;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = <X>(a: readonly X[]) => a[Math.floor(rnd() * a.length)];
    let replaced = 0;
    let inserted = 0;
    for (let k = 0; k < 36; k++) {
      const layout = pick(LAYOUTS);
      let c = kitchen({
        layout,
        walls: { a: 240 + Math.round(rnd() * 360), b: 180 + Math.round(rnd() * 300), c: 180 + Math.round(rnd() * 300) },
        tall: rnd() < 0.7,
        ...(rnd() < 0.35 ? { window: { wall: pick(wallsFor(layout)), offset: Math.round(rnd() * 200), width: 60 + Math.round(rnd() * 100), sill: 100 } } : {}),
        ...(rnd() < 0.25 ? { heights: { mode: "do-stropa" as const }, ceiling: 290 } : {}),
        ...(rnd() < 0.3 ? { extents: { b: { length: 160 + Math.round(rnd() * 100) } } } : {}),
        ...(rnd() < 0.2 ? { tallRuns: { "b-left": [B("ormar", 60)] } } : {}),
      });
      // edited lists, sometimes a column in a run already
      if (rnd() < 0.5) c = sanitizeConfig(materializeLists(c, planKitchen(c), planKitchen(c).lists.map((l) => l.id as ListId).filter((id) => !id.startsWith("tall"))));
      if (rnd() < 0.4) {
        const b = planKitchen(c).slots.filter((s) => s.zone === "base" && !s.corner && s.run !== "isl");
        const r = b.length ? changeType(c, pick(b).id, pick(TALL_TYPES), "tall") : null;
        if (r?.ok) c = r.cfg;
      }
      const p0 = planKitchen(c);
      invariants(p0, `k${k} start`);
      for (const s of p0.slots) {
        if (s.run === "isl" || s.corner || (s.zone !== "base" && s.zone !== "upper")) continue;
        const t = pick(TALL_TYPES);
        const r = changeType(c, s.id, t, "tall");
        if (!r.ok) {
          assert.deepEqual(r.cfg, c, "a refusal leaves the kitchen as it was");
          assert.ok(r.warning, `k${k} ${s.id}: a refusal says why`);
          continue;
        }
        replaced++;
        const where = `k${k} ${layout} ${s.id} → ${t}`;
        const ns = slotOf(r);
        assert.ok(ns && ns.zone === "tall" && ns.type === t, `${where}: the new element (${r.slotId})`);
        const p1 = planKitchen(r.cfg);
        invariants(p1, where);
        essentialsWarned(p0, r, where);
        assert.deepEqual(decodeConfig(encodeConfig(r.cfg)), r.cfg, `${where}: link`);
        assert.ok(Number.isFinite(breakdown(r.cfg).total), where);
      }
      for (const g of planGaps(p0)) {
        const o = gapOptions(c, g.id)!;
        for (const [list, zone] of [
          [o.types, undefined],
          [o.tall, "tall"],
        ] as const) {
          const fit = list.filter((x) => x.fitting?.length);
          if (!fit.length) continue;
          const x = pick(fit);
          const w = pick(x.fitting!);
          const r = insertAtGap(c, g.id, x.id, w, zone);
          assert.ok(r.ok, `k${k} ${g.id} ${x.id} ${w}: offered, so it goes in (${r.warning})`);
          inserted++;
          invariants(planKitchen(r.cfg), `k${k} ${g.id} ${x.id}${w}`);
          essentialsWarned(p0, r, `k${k} ${g.id}`);
        }
      }
    }
    assert.ok(replaced > 150 && inserted > 80, `${replaced} replaced, ${inserted} inserted`);
  });
});

// ---------------------------------------------------------------- headless engine helpers (as in gaps.test.ts)

function engineEnv(): KitchenEnv {
  return {
    mats: stubMaterials(),
    geos: new GeoCache(),
    doc: fakeDocument(),
    fronts: { base: "antracit", upper: "antracit", tall: "kasmir", island: "hrast" },
    topId: "mramor",
    handles: "letvica",
    plinth: "crna",
    labels: false,
    tempo: "quick",
  };
}

/** stand-in materials: mats.x / mats.x(id) are named MeshStandardMaterials (no textures, no WebGL) */
function stubMaterials(): KitchenEnv["mats"] {
  const cache = new Map<string, THREE.Material>();
  const named = (n: string) => {
    let m = cache.get(n);
    if (!m) {
      m = new THREE.MeshStandardMaterial();
      m.name = n;
      cache.set(n, m);
    }
    return m;
  };
  const fns = new Map<string, unknown>();
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, k) => {
      const key = String(k);
      if (key === "highlight") return (m: unknown) => m;
      let f = fns.get(key);
      if (!f) {
        f = Object.setPrototypeOf((...args: unknown[]) => named(`${key}(${args.join(",")})`), named(key));
        Object.defineProperty(f as object, "name", { value: key });
        fns.set(key, f);
      }
      return f;
    },
  }) as unknown as KitchenEnv["mats"];
}

/** just enough of a DOM for the CSS2D dimension labels */
function fakeDocument(): Document {
  const el = (): unknown => ({
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    classList: { add() {} },
    textContent: "",
    className: "",
    append() {},
    appendChild() {},
    addEventListener() {},
    removeEventListener() {},
    setAttribute() {},
    getAttribute: () => null,
  });
  return { createElement: el, createElementNS: el } as unknown as Document;
}
