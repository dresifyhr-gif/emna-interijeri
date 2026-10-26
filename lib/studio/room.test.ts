/**
 * Room vs kitchen tests (the owner: "zidovi prostora je jedno, a dužina kuhinje je drugo"): kitchen extents on the room's
 * walls and the corner rules, the worktop ending with the cabinets, tall columns at any free run end (the side-by-side
 * fridge with its bridge cabinet), the "+" gaps (planGaps / gapOptions / insertAtGap), L-shaped and diagonal corner
 * units, room surfaces, the ceiling helpers — share links, price, summary and the admin quote for all of it, and a
 * headless engine build (three.js scene graph, no WebGL).
 *
 *   npx tsx --test lib/studio/room.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { quoteFromConfig } from "../admin/quote-from-config";
import { SBS, catalog, cornerFoot, cornerTypes } from "./catalog";
import {
  changeType,
  gapOptions,
  heightChoices,
  insertAtGap,
  kitchenExtent,
  moveTall,
  raiseCeilingFor,
  remove,
  resetAll,
  roomFinishes,
  setHeights,
  setKitchenExtent,
  setRoomFinish,
  setRoomWall,
  setWallLength,
  tallPlaces,
} from "./edit";
import { buildKitchen, disposeKitchen, syncRunSurfaces, type KitchenEnv } from "./engine/kitchen";
import { BASE_FACE } from "./engine/dims";
import { GeoCache } from "./engine/geo";
import { DIM, GAP_MIN, geometryKey, kitchenRange, planGaps, planKitchen, sanitizeConfig, tallCapacity, wallsFor, type KitchenPlan } from "./plan";
import { breakdown } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { summarize } from "./summary";
import { DEFAULT_CONFIG, type CornerId, type KitchenConfig, type Layout } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const roundTrip = (c: KitchenConfig) => decodeConfig(encodeConfig(c));
const run = (p: KitchenPlan, w: "a" | "b" | "c") => p.runs.find((r) => r.wall === w)!;
/** the quote adds up to the studio price and itemises everything (no catch-all line) */
function quoteOk(c: KitchenConfig, where: string): ReturnType<typeof quoteFromConfig> {
  const b = breakdown(c);
  assert.ok(Number.isFinite(b.total) && b.total > 0, where);
  const q = quoteFromConfig(c, { vatPct: 25, newId: () => "x" });
  assert.equal(q.mode, "plan", where);
  const gross = q.items.reduce((sum, it) => sum + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
  assert.ok(Math.abs(gross - b.total) < Math.max(5, b.total * 0.005), `${where}: ${gross} vs ${b.total}`);
  assert.ok(!q.items.some((it) => /^Ostalo/.test(it.description)), where);
  return q;
}
/** an L kitchen as in the owner's screenshot: wall B 450 cm, wall A 300 cm */
const OWNER = { layout: "L" as const, walls: { a: 300, b: 450, c: 220 } };
/** the owner's edited wall B: four cabinets on a 450 cm wall (bare floor at its open end) */
const ownerEdited = () =>
  kitchen({
    ...OWNER,
    runs: {
      b: [
        { type: "ladice", width: 60 },
        { type: "sudoper", width: 80 },
        { type: "perilica", width: 60 },
        { type: "ploca", width: 80 },
      ],
    },
  });

describe("room vs kitchen (KitchenConfig.extents)", () => {
  it("older configs: without an extent the kitchen takes every wall; a whole-wall extent is dropped", () => {
    for (const layout of LAYOUTS) {
      const c = kitchen({ layout, walls: { a: 420, b: 300, c: 280 } });
      const p = planKitchen(c);
      for (const r of p.runs) assert.deepEqual(r.kitchen, { from: 0, to: r.length }, `${layout} ${r.wall}`);
      const whole = kitchen({ layout, walls: c.walls, extents: { a: { offset: 0, length: 420 }, b: { length: 300 } } });
      assert.equal(whole.extents, undefined, layout);
      assert.equal(geometryKey(whole), geometryKey(c), layout);
      assert.equal(encodeConfig(whole), encodeConfig(c), layout);
    }
  });

  it("an extent stands at its anchor end, keeps its length on a longer room wall and stays inside the wall", () => {
    const c = setKitchenExtent(kitchen(OWNER), "b", { length: 300 }).cfg;
    assert.deepEqual(c.extents, { b: { length: 300 } });
    // B's corner end is its right end (the corner with A): the kitchen is 300 cm from there
    assert.deepEqual(kitchenRange(c, "b"), { from: 150, to: 450 });
    const p = planKitchen(c);
    assert.ok(p.slots.filter((s) => s.run === "b").every((s) => s.x >= 150 - 0.01), "nothing of the kitchen on the bare wall");
    assert.ok(run(p, "b").worktop!.from >= 150);
    // a longer room wall: the kitchen keeps its 300 cm at the corner
    const longer = setRoomWall(c, "b", 520).cfg;
    assert.deepEqual(kitchenRange(longer, "b"), { from: 220, to: 520 });
    // the other anchor: 40 cm from the open end, 240 cm long
    const other = setKitchenExtent(kitchen(OWNER), "b", { anchor: "left", offset: 40, length: 240 }).cfg;
    assert.deepEqual(kitchenRange(other, "b"), { from: 40, to: 280 });
    // never longer than the wall, never shorter than the layout's shortest wall
    const r = setKitchenExtent(kitchen(OWNER), "b", { length: 900 });
    assert.equal(r.cfg.extents, undefined);
    assert.ok(r.warning?.includes("450"), r.warning ?? "");
    const short = setKitchenExtent(kitchen(OWNER), "b", { length: 10 });
    assert.equal(kitchenRange(short.cfg, "b").to - kitchenRange(short.cfg, "b").from, 120);
    assert.ok(short.warning);
    const info = kitchenExtent(c, "b")!;
    assert.deepEqual([info.length.value, info.offset.value, info.anchor, info.anchorIsCorner, info.full, info.ends.right], [300, 0, "right", true, false, "corner"]);
    assert.equal(kitchenExtent(c, "c"), null, "L has no wall C");
  });

  it("corners only where both runs reach them; otherwise a run keeps DIM.cornerClear (120 cm) from the corner", () => {
    const base = kitchen(OWNER);
    // 50 cm is too close to stand on its own: into the corner (the corner unit stays)
    const near = setKitchenExtent(base, "a", { offset: 50 });
    assert.equal(near.cfg.extents, undefined);
    assert.match(near.warning ?? "", /ide do kuta/);
    // 80 cm: steps back to 120 cm (B's cabinet in the corner must still open) — no corner unit, B's run goes on to
    // wall A, A starts with an end panel
    const away = setKitchenExtent(base, "a", { offset: 80 });
    assert.deepEqual(away.cfg.extents, { a: { offset: DIM.cornerClear } });
    assert.match(away.warning ?? "", /120 cm od kuta/);
    const p = planKitchen(away.cfg);
    assert.ok(!p.slots.some((s) => s.corner), "no corner unit");
    assert.deepEqual([run(p, "a").ends.left, run(p, "b").ends.right], ["open", "wall"]);
    assert.ok(p.slots.filter((s) => s.run === "b" && s.zone === "base").some((s) => s.x + s.width > 450 - 30), "B's cabinets reach wall A");
    // both runs away from the corner, in a U kitchen too
    const u = setKitchenExtent(kitchen({ layout: "U", walls: { a: 400, b: 300, c: 300 } }), "c", { offset: 100 });
    assert.equal(planKitchen(u.cfg).runs.find((r) => r.wall === "a")!.ends.right, "wall");
    assert.ok(!planKitchen(u.cfg).slots.some((s) => s.cornerId === "base-r"));
  });

  it("the island is centred on wall A's kitchen, a peninsula stands at the end of it", () => {
    const o = setKitchenExtent(kitchen({ layout: "otok", walls: { a: 500, b: 220, c: 220 }, island: 200 }), "a", { length: 300 }).cfg;
    assert.equal(planKitchen(o).island!.centerX, 150);
    const pen = setKitchenExtent(kitchen({ layout: "poluotok", walls: { a: 500, b: 220, c: 220 }, island: 200 }), "a", { length: 320 }).cfg;
    const I = planKitchen(pen).island!;
    assert.equal(I.frame.x, 320);
    const corner = planKitchen(pen).slots.find((s) => s.cornerId === "base-r")!;
    assert.equal(corner.x + corner.width, 320, "the corner unit at the end of the run, not of the wall");
  });

  it("setWallLength moves a whole-wall kitchen with the wall (as before); setRoomWall keeps it", () => {
    const c = kitchen(OWNER);
    assert.deepEqual(kitchenRange(setWallLength(c, "b", 500).cfg, "b"), { from: 0, to: 500 });
    const r = setRoomWall(c, "b", 500);
    assert.deepEqual(kitchenRange(r.cfg, "b"), { from: 50, to: 500 });
    const shorter = setRoomWall(r.cfg, "b", 300);
    assert.deepEqual(kitchenRange(shorter.cfg, "b"), { from: 0, to: 300 });
    assert.equal(shorter.cfg.extents, undefined, "as long as the wall again: the extent goes");
  });

  it("share links, the summary, the price and the admin quote", () => {
    let c = setKitchenExtent(kitchen({ ...OWNER, walls: { a: 400, b: 450, c: 220 } }), "b", { length: 300 }).cfg;
    c = setKitchenExtent(c, "a", { anchor: "right", offset: 0, length: 280 }).cfg;
    assert.deepEqual(roundTrip(c), c);
    assert.ok(encodeConfig(c).includes(".eb-l300"), encodeConfig(c));
    const sum = summarize(c);
    assert.ok(sum.some((l) => l === "Zid B (lijevi): 450 cm, kuhinja 300 cm (od kuta sa zidom A)"), sum.join("\n"));
    assert.ok(sum.some((l) => /^Zid A .*kuhinja 280 cm \(od desnog kraja zida\)/.test(l)), sum.join("\n"));
    const q = quoteOk(c, "extents");
    assert.ok(q.items.some((it) => it.description === "Donji elementi – zid B (kuhinja 300 cm, zid 450 cm)"), q.items.map((i) => i.description).join("\n"));
    // a shorter kitchen costs less than the same kitchen along the whole walls
    assert.ok(breakdown(c).total < breakdown(kitchen({ ...OWNER, walls: { a: 400, b: 450, c: 220 } })).total);
  });
});

describe("the worktop follows the cabinets", () => {
  it("bare floor an edited run leaves at its open end has no worktop, backsplash, plinth LED or planner wall units", () => {
    const c = ownerEdited();
    const p = planKitchen(c);
    const b = run(p, "b");
    const cabinets = p.slots.filter((s) => s.run === "b" && s.zone === "base");
    const first = Math.min(...cabinets.map((s) => s.x));
    assert.deepEqual(b.free, [{ from: 0, to: first - DIM.panel, side: "left" }]);
    assert.equal(b.worktop!.from, first - DIM.panel, "the worktop starts at the run's end panel");
    assert.ok(b.backsplash.every((x) => x.from >= first - DIM.panel - 0.01));
    assert.equal(b.counter!.from, first - DIM.panel);
    assert.ok(p.slots.filter((s) => s.run === "b" && s.zone === "upper").every((s) => s.x >= first - DIM.panel - 0.01), "no wall units over bare floor");
    assert.ok(p.warnings.some((w) => /uz zid ostaje slobodno, bez elemenata i radne ploče/.test(w)), p.warnings.join(" | "));
    // the same run without the bare floor costs more (worktop and backsplash over it)
    const filled = kitchen({ ...OWNER });
    assert.ok(breakdown(c).worktop < breakdown(filled).worktop);
  });

  it("empty space in a list (Slobodno mjesto, a desk) and room between hard ends keep their worktop; the planner's own runs are full", () => {
    // [end panel][slobodno 120][ladice 60][end panel] + bare floor: the worktop covers the desk and the cabinet
    const desk = kitchen({ layout: "ravna", walls: { a: 300, b: 220, c: 220 }, tall: false, runs: { a: [{ type: "slobodno", width: 120 }, { type: "ladice", width: 60 }] } });
    const r = run(planKitchen(desk), "a");
    assert.deepEqual(r.worktop, { from: 0, to: 2 * DIM.panel + 180 });
    // between two hard ends (a tall column, the corner) the free stretch stays under the worktop
    const hard = kitchen({ layout: "L", walls: { a: 400, b: 220, c: 220 }, runs: { a: [{ type: "ladice", width: 60 }] } });
    const ra = run(planKitchen(hard), "a");
    assert.deepEqual(ra.free, []);
    assert.equal(ra.worktop!.to, ra.tall!.from);
    for (const layout of LAYOUTS) {
      const p = planKitchen(kitchen({ layout, walls: { a: 460, b: 300, c: 300 } }));
      for (const x of p.runs) assert.deepEqual(x.free, [], `${layout} ${x.wall}`);
    }
  });
});

describe("tall columns anywhere (tallAt / tallRuns)", () => {
  it("a side-by-side niche with its bridge cabinet at the free end of wall B, beside the cabinets", () => {
    const c = ownerEdited();
    const gap = planGaps(planKitchen(c)).find((g) => g.id === "end:b-left")!;
    assert.ok(gap.floor! > SBS.niche, JSON.stringify(gap));
    const r = insertAtGap(c, gap.id, "hladnjak-sbs", SBS.niche, "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.deepEqual(r.cfg.tallRuns, { "b-left": [{ type: "hladnjak-sbs", width: SBS.niche }] });
    const p = planKitchen(r.cfg);
    const sbs = p.slots.find((s) => s.id === r.slotId)!;
    assert.equal(sbs.type, "hladnjak-sbs");
    assert.equal(sbs.list?.id, "tall:b-left");
    const b = run(p, "b");
    // the column stands right beside the cabinets: no bare floor or worktop over nothing between them
    const firstCabinet = Math.min(...p.slots.filter((s) => s.run === "b" && s.zone === "base").map((s) => s.x));
    assert.equal(sbs.x + sbs.width + DIM.panel, firstCabinet);
    assert.deepEqual(b.free, []);
    assert.equal(b.worktop!.from, firstCabinet);
    assert.deepEqual(b.kitchen, { from: firstCabinet - SBS.niche - 2 * DIM.panel, to: 450 }, "the kitchen ends at the column, the rest is bare wall");
    // the main column stays on A
    assert.ok(p.slots.some((s) => s.list?.id === "tall" && s.run === "a"));
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    const sum = summarize(r.cfg);
    assert.ok(sum.some((l) => l === `Visoki stup uz zid B (lijevi kraj): dvokrilni hladnjak (side-by-side) ${SBS.niche} cm`), sum.join("\n"));
    const q = quoteOk(r.cfg, "sbs");
    assert.ok(q.items.some((it) => it.description === "Visoki elementi – zid B, lijevi kraj"));
  });

  it("tallAt pins the tall column; an end the layout cannot use falls back to the planner's place", () => {
    const c = kitchen({ ...OWNER, tallAt: "b-left" });
    const p = planKitchen(c);
    assert.ok(p.slots.filter((s) => s.zone === "tall").every((s) => s.run === "b" && s.x < 130));
    // hinges towards the open end, fridge at the open end
    assert.equal(p.slots.find((s) => s.id === "tall-0")!.type, "hladnjak");
    // a corner end: ignored (as every older kitchen)
    const corner = kitchen({ ...OWNER, tallAt: "a-left" });
    assert.deepEqual(planKitchen(corner).runs.find((r) => r.wall === "a")!.talls, planKitchen(kitchen(OWNER)).runs.find((r) => r.wall === "a")!.talls);
    // switching to ravna keeps the column (wall B is gone: the planner's place)
    assert.ok(planKitchen({ ...c, layout: "ravna" }).slots.some((s) => s.zone === "tall"));
    assert.deepEqual(roundTrip(c), c);
  });

  it("moveTall, tallPlaces, tallCapacity per column, removing the last unit, resetAll", () => {
    let c = kitchen({ ...OWNER, tallRuns: { "b-left": [{ type: "smocnica", width: 30 }] } });
    const places = tallPlaces(c, "tall:b-left");
    assert.deepEqual(
      places.map((x) => x.end),
      ["a-right", "b-left"],
    );
    assert.ok(places.find((x) => x.end === "b-left")!.current);
    assert.ok(!places.find((x) => x.end === "a-right")!.fits, "the tall column stands there");
    const mv = moveTall(c, "tall", "b-left");
    assert.ok(!mv.ok);
    assert.ok(tallCapacity(c, "tall:b-left") >= 30);
    // removing the last unit of a tallRuns column takes the column away
    const sl = planKitchen(c).slots.find((s) => s.list?.id === "tall:b-left")!;
    assert.equal(remove(c, sl.id).cfg.tallRuns, undefined);
    c = { ...c, tallAt: "a-right" };
    const reset = resetAll(c);
    assert.equal(reset.tallRuns, undefined);
    assert.equal(reset.tallAt, undefined);
  });

  it("a column that does not fit where it is asked to stand is left out with a note, and stays in the config", () => {
    const c = kitchen({ layout: "L", walls: { a: 300, b: 140, c: 220 }, tallRuns: { "b-left": [{ type: "ormar", width: 90 }] } });
    const p = planKitchen(c);
    assert.ok(!p.slots.some((s) => s.list?.id === "tall:b-left"));
    assert.ok(p.warnings.some((w) => /Visoki stup uz zid B \(lijevi kraj\) ne stane/.test(w)), p.warnings.join(" | "));
    assert.ok(c.tallRuns?.["b-left"]);
  });
});

describe("gaps (the studio's \"+\")", () => {
  it("default kitchens have no free place on the walls (the joints of their full rows only); an island can grow at its ends", () => {
    for (const layout of LAYOUTS) {
      const gaps = planGaps(planKitchen(kitchen({ layout })));
      assert.ok(gaps.every((g) => g.kind === "island" || g.kind === "seam"), `${layout}: ${gaps.map((g) => g.id).join(", ")}`);
    }
    assert.deepEqual(
      planGaps(planKitchen(kitchen({ layout: "otok" })))
        .filter((g) => g.kind !== "seam")
        .map((g) => g.id),
      ["isl:left", "isl:right"],
    );
  });

  it("lists bare floor, bare wall beyond the kitchen, empty space and bare wall above the worktop", () => {
    const ids = (c: KitchenConfig) => planGaps(planKitchen(c)).map((g) => g.id);
    // the bare floor (base cabinets or a tall unit), the bare wall above it (wall units), the 25 cm left beside the hood
    // (and wall A's full rows their "+" between elements: every row has one)
    assert.deepEqual(ids(ownerEdited()), ["end:b-left", "upend:b-left", "up:b:390", "seam:a:1", "seam:a:u:0"]);
    const ext = setKitchenExtent(kitchen({ ...OWNER, walls: { a: 400, b: 450, c: 220 } }), "a", { length: 300 }).cfg;
    const g = planGaps(planKitchen(ext)).find((x) => x.id === "end:a-right")!;
    assert.deepEqual([g.floor, g.outside, g.maxWidth], [0, 100, 100]);
    const free = kitchen({ layout: "ravna", walls: { a: 300, b: 220, c: 220 }, tall: false, runs: { a: [{ type: "ladice", width: 60 }, { type: "slobodno", width: 60 }, { type: "ladice", width: 60 }] } });
    assert.ok(ids(free).some((x) => /^free:a-base-/.test(x)), ids(free).join(", "));
    const bare = kitchen({ layout: "ravna", walls: { a: 300, b: 220, c: 220 }, tall: false, upperRuns: { a: [{ type: "vrata", width: 60 }] } });
    // the edited list leaves the rest of the wall bare at its open end: the end of the wall-unit row
    assert.ok(ids(bare).some((x) => /^up(end)?:a[:-]/.test(x)), ids(bare).join(", "));
    // a corner end never has a gap
    for (const x of planGaps(planKitchen(ext))) assert.notEqual(x.id, "end:a-left");
  });

  it("gapOptions previews exactly what insertAtGap does (one probe per width is sound)", () => {
    const cases: KitchenConfig[] = [
      ownerEdited(),
      setKitchenExtent(kitchen({ ...OWNER, walls: { a: 400, b: 450, c: 220 } }), "a", { length: 300 }).cfg,
      kitchen({ layout: "ravna", walls: { a: 320, b: 220, c: 220 }, tall: false, upperRuns: { a: [{ type: "vrata", width: 60 }] }, runs: { a: [{ type: "ladice", width: 60 }, { type: "slobodno", width: 80 }, { type: "ploca", width: 80 }] } }),
      kitchen({ layout: "otok", island: 200 }),
    ];
    for (const c of cases) {
      for (const g of planGaps(planKitchen(c))) {
        const o = gapOptions(c, g.id)!;
        for (const [list, zone] of [
          [o.types, undefined],
          [o.tall, "tall"],
        ] as const) {
          for (const t of list) {
            const def = catalog.modules.find((m) => m.id === t.id && (zone === "tall" ? m.zone === "tall" : m.zone !== "tall"));
            for (const w of def?.widths ?? []) {
              const r = insertAtGap(c, g.id, t.id, w, zone);
              assert.equal(r.ok, Boolean(t.fitting?.includes(w)), `${g.id} ${t.id} ${w}: ${r.warning}`);
              if (r.ok) assert.equal(planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)?.type, t.id, `${g.id} ${t.id} ${w}`);
            }
          }
        }
      }
    }
  });

  it("insertAtGap: base cabinets take the bare floor, then grow the kitchen into the bare wall", () => {
    const ext = setKitchenExtent(kitchen({ ...OWNER, walls: { a: 400, b: 450, c: 220 } }), "a", { length: 300 }).cfg;
    const r = insertAtGap(ext, "end:a-right", "ladice", 60);
    assert.ok(r.ok, r.warning ?? "");
    // the tall column stood at that end: the cabinet goes beyond it, the run grows by it and the end panel beyond it
    assert.deepEqual(kitchenRange(r.cfg, "a"), { from: 0, to: 362 });
    const sl = planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)!;
    assert.equal(sl.type, "ladice");
    assert.ok(planKitchen(r.cfg).slots.filter((s) => s.zone === "tall").every((s) => s.x + s.width <= sl.x), "beyond the column");
    assert.ok(!insertAtGap(ext, "end:a-right", "ladice", 120).ok, "more than the bare wall");
    const isl = insertAtGap(kitchen({ layout: "otok", island: 200 }), "isl:right", "ladice", 60);
    assert.ok(isl.ok);
    // the planner's filler at that end counts as room: the island grows by the rest
    assert.ok(isl.cfg.island >= 259 && isl.cfg.island <= 260, String(isl.cfg.island));
    assert.equal(insertAtGap(kitchen({}), "end:x-left", "ladice").ok, false);
    assert.ok(GAP_MIN <= 15);
  });
});

describe("corner units", () => {
  const corners: [Layout, CornerId][] = [
    ["L", "base-l"],
    ["L", "upper-l"],
    ["U", "base-l"],
    ["U", "base-r"],
    ["U", "upper-l"],
    ["U", "upper-r"],
    ["G", "base-l"],
    ["G", "base-r"],
    ["poluotok", "base-r"],
  ];
  it("every corner type in every corner: its footprint, planned, priced, summarised, linked and quoted", () => {
    for (const [layout, id] of corners) {
      const zone = id.startsWith("base") ? "base" : "upper";
      const c0 = kitchen({ layout, walls: { a: 460, b: 320, c: 320 }, island: 220 });
      const slot0 = planKitchen(c0).slots.find((s) => s.cornerId === id)!;
      assert.ok(slot0, `${layout} ${id}`);
      for (const t of cornerTypes(zone)) {
        const where = `${layout} ${id} ${t.id}`;
        const r = changeType(c0, slot0.id, t.id);
        assert.ok(r.ok, `${where}: ${r.warning}`);
        const p = planKitchen(r.cfg);
        const sl = p.slots.find((s) => s.cornerId === id)!;
        const f = cornerFoot(zone, t.id);
        assert.equal(sl.type, t.id, where);
        assert.equal(sl.width, f.along, where);
        // the neighbour's run stops `across` from the corner (B: its right end, C: its left end)
        const nb = layout === "poluotok" ? null : id.endsWith("-l") ? "b" : layout === "U" ? "c" : null;
        if (nb) {
          const k = run(p, nb).kitchen;
          const own = p.slots.filter((s) => s.run === nb && s.zone === zone && !s.corner);
          const reach = nb === "b" ? Math.max(...own.map((s) => s.x + s.width)) : Math.min(...own.map((s) => s.x));
          const gap = nb === "b" ? k.to - reach : reach - k.from;
          assert.ok(gap >= f.across - 0.01, `${where}: ${gap} vs ${f.across}`);
        }
        if (layout === "poluotok" && zone === "base") assert.equal(p.island!.body.from, f.across, `${where}: the peninsula behind it`);
        assert.deepEqual(roundTrip(r.cfg), r.cfg, where);
        const sum = summarize(r.cfg);
        assert.ok(sum.some((l) => l.includes(t.name) || l.includes(t.name.toLowerCase())), `${where}: ${sum.join(" | ")}`);
        quoteOk(r.cfg, where);
      }
    }
  });

  it("a footprint that would push cabinets out is refused", () => {
    // wall B holds exactly 120 + 120 cm and its end panel behind a blind corner (60 cm across), not behind 90 cm
    const c = kitchen({ layout: "L", walls: { a: 300, b: 302, c: 220 }, runs: { b: [{ type: "ladice", width: 120 }, { type: "sudoper", width: 120 }] } });
    assert.deepEqual(planKitchen(c).lists.find((l) => l.id === "b")!.dropped, []);
    const corner = planKitchen(c).slots.find((s) => s.cornerId === "base-l")!;
    const r = changeType(c, corner.id, "kutni-l");
    assert.equal(r.ok, false);
    assert.match(r.warning ?? "", /90 × 90/);
  });
});

describe("room surfaces", () => {
  it("one wall, every wall, the floor; the same finish as every wall is not stored", () => {
    let c = setRoomFinish(kitchen({}), { wall: "all", finish: "greige" }).cfg;
    c = setRoomFinish(c, { wall: "b", finish: "cigla" }).cfg;
    c = setRoomFinish(c, { floor: "riblja-kost" }).cfg;
    assert.deepEqual(c.room, { wall: "greige", floor: "riblja-kost", walls: { b: "cigla" } });
    assert.deepEqual(roomFinishes(c), { walls: { a: "greige", b: "cigla", c: "greige" }, floor: "riblja-kost" });
    assert.deepEqual(sanitizeConfig({ ...c, room: { ...c.room, walls: { a: "greige", b: "cigla" } } }).room, c.room);
    assert.deepEqual(roundTrip(c), c);
    assert.ok(summarize(c).some((l) => /zid B ciglena obloga/.test(l)));
    assert.equal(setRoomFinish(c, { wall: "a", finish: "nema" }).ok, false);
    assert.equal(setRoomFinish(c, { wall: "all", finish: null }).cfg.room?.walls, undefined);
    // the catalogue has the paints and textures the owner asked for
    assert.ok(catalog.room.walls.filter((w) => !w.render).length >= 14);
    assert.ok(catalog.room.walls.some((w) => w.render?.kind === "brick") && catalog.room.walls.some((w) => w.render?.kind === "tiles"));
    for (const id of ["parket-svijetli", "parket", "parket-tamni", "riblja-kost", "chevron", "plocice-velike-svijetle", "plocice-velike-tamne", "terazzo", "beton", "mikrocement"]) {
      assert.ok(catalog.room.floors.some((f) => f.id === id), id);
    }
  });
});

describe("ceiling helpers", () => {
  it("the tall column's limit says why, and raiseCeilingFor makes room for a 3 m kitchen", () => {
    const c = setHeights(kitchen({}), { mode: "custom", tallTop: 300 }).cfg;
    const hc = heightChoices(c);
    assert.equal(hc.tallTop.max, 257);
    assert.equal(hc.tallTop.maxReason, "strop 260 cm − 3 cm");
    assert.equal(hc.tallTop.ceilingMax, 347);
    const r = raiseCeilingFor(c, 300);
    assert.equal(r.ceiling, 303);
    assert.equal(planKitchen(r.cfg).heights.tallTop, 300, "the kept wish comes back once the ceiling allows it");
    assert.equal(raiseCeilingFor(c, 200).cfg.ceiling, 260, "never lower");
    const hi = raiseCeilingFor(c, 400);
    assert.equal(hi.ceiling, 350);
    assert.match(hi.warning ?? "", /najviše 350/);
  });
});

// ---------------------------------------------------------------- headless engine build

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

const engineEnv = (): KitchenEnv => ({
  mats: stubMaterials(),
  geos: new GeoCache(),
  doc: undefined as never,
  fronts: { base: "antracit", upper: "antracit", tall: "kasmir", island: "hrast" },
  topId: "mramor",
  handles: "letvica",
  plinth: "crna",
  labels: false,
  tempo: "quick",
});

/** world-space boxes of a module's meshes (run-local z: the runs of wall A sit at z = 0) */
function meshBoxes(root: THREE.Object3D, pick: (me: THREE.Mesh) => boolean): THREE.Box3 {
  const out = new THREE.Box3();
  const b = new THREE.Box3();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (!me.isMesh || !pick(me)) return;
    me.geometry.computeBoundingBox();
    b.copy(me.geometry.boundingBox!).applyMatrix4(me.matrixWorld);
    out.union(b);
  });
  return out;
}
const matName = (me: THREE.Mesh) => (me.material as THREE.Material).name;

describe("engine (headless scene graph)", () => {
  it("side-by-side: panels flush with the column's fronts, the doors and handles in front of them, the bridge on the fridge's line", () => {
    const env = engineEnv();
    const plan = planKitchen(kitchen({ layout: "ravna", walls: { a: 340, b: 220, c: 220 }, tallRun: [{ type: "hladnjak", width: 60 }, { type: "hladnjak-sbs", width: SBS.niche }] }));
    const K = buildKitchen(env, plan);
    K.timeline.finish();
    const m = K.modules.get("tall-1")!;
    assert.equal(m.slot.type, "hladnjak-sbs");
    const panels = meshBoxes(m.body, (me) => matName(me).startsWith("front("));
    const doors = meshBoxes(m.fronts, (me) => matName(me) === "appliance");
    const handles = meshBoxes(m.fronts, (me) => matName(me) === "brushed");
    assert.ok(Math.abs(panels.max.z - BASE_FACE) < 0.002, `panels ${panels.max.z}`);
    assert.ok(doors.max.z > BASE_FACE + 0.06, `doors ${doors.max.z}`);
    assert.ok(handles.max.z > doors.max.z + 0.03, `handles ${handles.max.z}`);
    // the bridge flap starts on the integrated fridge's top-door line (its front material, above the appliance)
    const fridge = K.modules.get("tall-0")!;
    const fridgeTop = Math.max(...fridge.holders.map((h) => h.node.position.y)) ;
    assert.ok(fridgeTop > 1.5);
    const bridge = meshBoxes(m.fronts, (me) => matName(me).startsWith("front("));
    assert.ok(bridge.min.y > (SBS.applianceHeight + SBS.topGap) / 100 - 0.005, `bridge ${bridge.min.y}`);
    assert.ok(Math.abs(bridge.max.y - fridge.root.position.y - meshBoxes(fridge.fronts, () => true).max.y + fridge.root.position.y) < 0.01, "same top line");
    disposeKitchen(K);
  });

  it("every corner type builds finite geometry and reaches into the neighbour's strip", () => {
    for (const zone of ["base", "upper"] as const) {
      for (const t of cornerTypes(zone)) {
        const c0 = kitchen({ layout: "U", walls: { a: 460, b: 320, c: 320 } });
        let c = c0;
        for (const id of zone === "base" ? (["base-l", "base-r"] as CornerId[]) : (["upper-l", "upper-r"] as CornerId[])) {
          const sl = planKitchen(c).slots.find((s) => s.cornerId === id)!;
          c = changeType(c, sl.id, t.id).cfg;
        }
        const env = engineEnv();
        const K = buildKitchen(env, planKitchen(c));
        K.timeline.finish();
        for (const m of K.modules.values()) {
          if (!m.slot.corner || m.slot.zone !== zone) continue;
          const b = meshBoxes(m.root, () => true);
          for (const v of [...b.min.toArray(), ...b.max.toArray()]) assert.ok(Number.isFinite(v), `${t.id}`);
          const across = cornerFoot(zone, t.id).across / 100;
          assert.ok(b.max.z > across - 0.05, `${t.id} ${m.slot.corner}: reaches ${b.max.z} of ${across}`);
          assert.ok(m.holders.length > 0 || t.id === "kutna-polica", `${t.id}: moving parts`);
        }
        disposeKitchen(K);
      }
    }
  });

  it("walls carry their surface tag; syncRunSurfaces follows an edit that changes where the cabinets end", () => {
    const env = engineEnv();
    const c = ownerEdited();
    const plan = planKitchen(c);
    const K = buildKitchen(env, plan);
    for (const w of K.walls) assert.deepEqual(w.mesh.userData.surface, { surface: "wall", wall: w.id });
    assert.equal(K.labels.length, 0);
    const before = meshBoxes(K.runs.get("b")!.worktop!, () => true);
    const next = planKitchen(insertAtGap(c, "end:b-left", "ladice", 60).cfg);
    assert.ok(syncRunSurfaces(K, env.mats, next, env.mats.top("mramor"), false));
    const after = meshBoxes(K.runs.get("b")!.worktop!, () => true);
    assert.ok(after.max.z - after.min.z > before.max.z - before.min.z + 0.5, "the worktop of B grew over the new cabinet (B runs along z)");
    assert.equal(K.plan, next);
    assert.equal(syncRunSurfaces(K, env.mats, next, env.mats.top("mramor"), false), false, "nothing to do the second time");
    disposeKitchen(K);
    // every layout builds with extents, tall columns at other ends and textured walls
    for (const layout of LAYOUTS) {
      const cfg = kitchen({ layout, walls: { a: 480, b: 380, c: 380 }, island: 220, extents: { a: { length: 400 }, b: { length: 300 } }, tallRuns: { "b-left": [{ type: "hladnjak-sbs-vrata", width: SBS.niche }] }, room: { wall: "cigla" } });
      const K2 = buildKitchen(engineEnv(), planKitchen(cfg));
      K2.timeline.finish();
      const box = meshBoxes(K2.root, () => true);
      for (const v of [...box.min.toArray(), ...box.max.toArray()]) assert.ok(Number.isFinite(v), layout);
      assert.equal(K2.walls.length, wallsFor(layout).length);
      disposeKitchen(K2);
    }
  });
});
