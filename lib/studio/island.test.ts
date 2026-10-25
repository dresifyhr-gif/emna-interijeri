/**
 * Island / peninsula tests (KitchenConfig.islandSpec, layouts "poluotok" and "G"): sanitizing and old links, share-link
 * round trips, the hob / sink moving between the walls and the island, the peninsula's geometry against wall A, seats,
 * the bar (šank) and the lowered table, the ceiling hood, price / summary / admin quote, the edit helpers — and a
 * headless engine build (three.js scene graph, no WebGL) of every layout with the new options.
 *
 *   npx tsx --test lib/studio/island.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { quoteFromConfig } from "../admin/quote-from-config";
import { moduleDef } from "./catalog";
import { islandChoices, setBar, setIsland, setIslandFunctions, setIslandHood, setPeninsula, setSeating } from "./edit";
import { buildKitchen, disposeKitchen, type KitchenEnv } from "./engine/kitchen";
import { GeoCache } from "./engine/geo";
import {
  DIM,
  HOOD_ABOVE,
  MAX_STOOLS,
  geometryKey,
  limitsFor,
  materializeLists,
  planKitchen,
  sanitizeConfig,
  type IslandPlan,
  type KitchenPlan,
} from "./plan";
import { breakdown, islandCost } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { islandSummary, summarize } from "./summary";
import { DEFAULT_CONFIG, type IslandSpec, type KitchenConfig, type Layout } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const ISLAND_LAYOUTS: Layout[] = ["otok", "poluotok", "G"];
/** roomy walls per layout (G needs two blind corners on wall A) */
const WALLS = { a: 420, b: 300, c: 260 };

const feature = (type: string) => moduleDef("base", type)?.feature;
const has = (p: KitchenPlan, zone: "base" | "island", f: "sink" | "hob" | "dishwasher") => p.slots.some((s) => s.zone === zone && feature(s.type) === f);
const hoodOnWall = (p: KitchenPlan) => p.slots.some((s) => s.zone === "upper" && Boolean(moduleDef("upper", s.type)?.hood));

/** run-local (x along the island, z from the back of its cabinets) → world cm (wall A's left end at x = 0, its face at z = 0) */
function toWorld(I: IslandPlan, x: number, z: number): { x: number; z: number } {
  const { x: fx, z: fz, rot } = I.frame;
  return { x: fx + x * Math.cos(rot) + z * Math.sin(rot), z: fz - x * Math.sin(rot) + z * Math.cos(rot) };
}
type Rect = { x0: number; x1: number; z0: number; z1: number };
function worldRect(I: IslandPlan, from: number, to: number, z0: number, z1: number): Rect {
  const pts = [toWorld(I, from, z0), toWorld(I, to, z0), toWorld(I, from, z1), toWorld(I, to, z1)];
  return { x0: Math.min(...pts.map((p) => p.x)), x1: Math.max(...pts.map((p) => p.x)), z0: Math.min(...pts.map((p) => p.z)), z1: Math.max(...pts.map((p) => p.z)) };
}
const overlapArea = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0));

/** a spread of island options (every field, alone and combined) */
const SPECS: IslandSpec[] = [
  {},
  { functions: "hob" },
  { functions: "sink" },
  { functions: "both" },
  { depth: 90 },
  { depth: 120, waterfall: false },
  { seatSide: "left", overhang: 30 },
  { seatSide: "right", overhang: 25, stools: 1 },
  { overhang: 0 },
  { stools: 4 },
  { functions: "hob", hood: false },
  { functions: "hob", hoodAbove: 80 },
  { functions: "both", depth: 100, stools: 3, bar: { kind: "raised" } },
  { bar: { kind: "raised", height: 115, depth: 40, length: 150, top: "hrast" } },
  { bar: { kind: "table", depth: 80 }, stools: 3 },
  { functions: "sink", bar: { kind: "table" }, depth: 90 },
  { side: "left" },
  { side: "left", functions: "hob", seatSide: "left", waterfall: false },
];

describe("older islands", () => {
  it("are exactly what they were: no islandSpec, 60 cm body, 35 cm overhang, two stools, two waterfall sides, no hood", () => {
    for (const len of [120, 200, 240, 300, 360]) {
      const c = kitchen({ layout: "otok", walls: { a: 460, b: 220, c: 220 }, island: len });
      assert.equal(c.islandSpec, undefined);
      const I = planKitchen(c).island!;
      assert.equal(I.kind, "otok");
      assert.deepEqual(I.body, { from: DIM.islandWaterfall, to: len - DIM.islandWaterfall });
      assert.deepEqual(I.slab, [{ from: 0, to: len, z0: -DIM.islandOverhang, z1: DIM.worktopDepth }]);
      assert.equal(I.waterfalls.length, 2);
      assert.deepEqual(I.backPanel, I.body);
      assert.equal(I.backRow, null);
      assert.equal(I.endPanels.length, 0);
      assert.deepEqual(
        I.seats.map((s) => [s.kind, s.x, s.z, s.seat]),
        [0.28, 0.72].map((f) => ["stool", len * f, -DIM.islandOverhang - 10, 66]),
      );
      assert.equal(I.hood, null);
      assert.equal(I.bar, null);
      assert.deepEqual(I.functions, { sink: false, hob: false });
      // the walls keep the sink and the hob
      const p = planKitchen(c);
      assert.ok(has(p, "base", "sink") && has(p, "base", "hob"));
      // the original price formula: 1,5 m of worktop per metre of island + two 0,8 m waterfall sides, plus islandFixed
      const ic = islandCost(p)!;
      assert.ok(Math.abs(ic.slabM - (len / 100) * 1.5 - 2 * 0.9 * 0.8) < 1e-9, `${len}: slab metres`);
      assert.equal(ic.barTop + ic.barBuild + ic.backRow + ic.endPanels + ic.hood, 0);
      assert.deepEqual(islandSummary(p), [`Otok: ${len} cm, s pločom koja se spušta do poda i mjestom za sjedenje`]);
    }
  });

  it("old share links decode to the same kitchen (no islandSpec), and an islandSpec is ignored by layouts without an island", () => {
    for (const link of [
      "1.otok.420.220.220.260.hrast.crni.letvica.1.300.1.a-120-100-95.i0-ploca_i2-sudoper",
      "2.otok.420.220.220.260.antracit.mramor.bez.1.240.1.0.ri-l60s90p80.fi-hrast.h-sp95",
      "1.L.380.220.220.260.antracit.mramor.bez.1.240.1.0.0",
    ]) {
      const c = decodeConfig(link)!;
      assert.ok(c, link);
      assert.equal(c.islandSpec, undefined, link);
    }
    for (const layout of ["ravna", "L", "U"] as Layout[]) {
      const a = kitchen({ layout, walls: WALLS });
      const b = kitchen({ layout, walls: WALLS, islandSpec: { functions: "both", bar: { kind: "raised" } } });
      assert.equal(geometryKey(a), geometryKey(b), layout);
      assert.deepEqual(planKitchen(b).slots, planKitchen(a).slots, layout);
      assert.equal(planKitchen(b).island, null);
    }
  });
});

describe("sanitize and share links", () => {
  it("snap every value to the offered options and drop the defaults", () => {
    const c = kitchen({
      layout: "otok",
      islandSpec: {
        functions: "x" as never,
        depth: 97,
        overhang: 33,
        stools: 20,
        hoodAbove: 120,
        hood: false,
        waterfall: true,
        seatSide: "middle" as never,
        bar: { kind: "raised", height: 111, depth: 31, length: 10, top: "nema-takve" },
      },
    });
    assert.deepEqual(c.islandSpec, { depth: 100, stools: MAX_STOOLS, hood: false, hoodAbove: HOOD_ABOVE.max, bar: { kind: "raised", depth: 30, length: DIM.barMinLength } });
    // `hood: true` says what "absent" means anyway (a hood above every island hob) and is dropped
    assert.deepEqual(kitchen({ layout: "otok", islandSpec: { functions: "hob", hood: true } }).islandSpec, { functions: "hob" });
    assert.deepEqual(kitchen({ layout: "otok", islandSpec: { functions: "hob", hood: false } }).islandSpec, { functions: "hob", hood: false });
    assert.equal(kitchen({ layout: "otok", islandSpec: { overhang: 35, stools: 2, depth: 60, waterfall: true } }).islandSpec, undefined);
    assert.equal(kitchen({ layout: "otok", islandSpec: { bar: { kind: "bar" as never } } }).islandSpec, undefined);
  });

  it("round-trip every option in every island layout", () => {
    for (const layout of ISLAND_LAYOUTS) {
      for (const islandSpec of SPECS) {
        const c = kitchen({ layout, walls: WALLS, island: 240, islandSpec });
        const link = encodeConfig(c);
        assert.deepEqual(decodeConfig(link), c, `${layout} ${link}`);
        assert.ok(!/[^a-zA-Z0-9._~-]/.test(link), `${link}: URL-safe`);
      }
    }
    // the layouts by name in ?oblik=
    assert.equal(decodeConfig(encodeConfig(kitchen({ layout: "G", walls: WALLS })))!.layout, "G");
  });

  it("keep the peninsula's length in its own range", () => {
    for (const layout of ["poluotok", "G"] as Layout[]) {
      const [lo, hi] = limitsFor(layout).island;
      assert.equal(kitchen({ layout, walls: WALLS, island: 50 }).island, lo);
      assert.equal(kitchen({ layout, walls: WALLS, island: 999 }).island, hi);
    }
  });
});

describe("hob and sink on the island", () => {
  it("leave the wall runs (and the wall hood) in every island layout; the ceiling hood follows the island hob", () => {
    for (const layout of ISLAND_LAYOUTS) {
      for (const functions of ["none", "hob", "sink", "both"] as const) {
        const p = planKitchen(kitchen({ layout, walls: WALLS, island: 280, islandSpec: { functions } }));
        const where = `${layout} ${functions}`;
        const hob = functions === "hob" || functions === "both";
        const sink = functions === "sink" || functions === "both";
        assert.equal(has(p, "island", "hob"), hob, `${where}: hob on the island`);
        assert.equal(has(p, "base", "hob"), !hob, `${where}: hob on the walls`);
        assert.equal(has(p, "island", "sink"), sink, `${where}: sink on the island`);
        assert.equal(has(p, "base", "sink"), !sink, `${where}: sink on the walls`);
        if (sink) assert.ok(has(p, "island", "dishwasher"), `${where}: the dishwasher goes along`);
        assert.equal(hoodOnWall(p), !hob, `${where}: a wall hood only above a wall hob`);
        assert.deepEqual(p.island!.functions, { sink, hob }, where);
        const I = p.island!;
        if (hob) {
          const h = p.slots.find((s) => s.zone === "island" && feature(s.type) === "hob")!;
          assert.ok(I.hood, `${where}: an island hob gets the ceiling hood`);
          assert.equal(I.hood!.x, h.x + h.width / 2, `${where}: centred above the hob`);
          assert.equal(I.hood!.bottom, p.heights.worktop + HOOD_ABOVE.default);
          assert.equal(I.hood!.ceiling, p.ceiling);
          assert.ok(!p.warnings.some((w) => /ne stane|nema/.test(w)), `${where}: ${p.warnings.join(" | ")}`);
        } else assert.equal(I.hood, null, where);
      }
    }
  });

  it("never stand the hob at a free end: a short island keeps it on the walls, a peninsula moves it towards wall A", () => {
    const short = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 120, islandSpec: { functions: "hob" } }));
    assert.ok(!has(short, "island", "hob") && has(short, "base", "hob"));
    assert.ok(short.warnings.some((w) => /Otok od 120 cm prekratak je za ploču za kuhanje — ostaje uz zid/.test(w)), short.warnings.join(" | "));
    assert.equal(short.island!.hood, null);
    for (const layout of ISLAND_LAYOUTS) {
      for (const len of [150, 160, 180, 200, 240, 300]) {
        for (const side of ["left", "right"] as const) {
          const p = planKitchen(kitchen({ layout, walls: WALLS, island: len, islandSpec: { functions: "hob", side } }));
          const I = p.island!;
          const isl = p.slots.filter((s) => s.zone === "island").sort((a, b) => a.x - b.x);
          const h = isl.findIndex((s) => feature(s.type) === "hob");
          if (h < 0) continue;
          const wallEnd = I.side === "right" ? "left" : I.side === "left" ? "right" : null;
          if (wallEnd !== "left") assert.ok(h > 0, `${layout} ${len} ${side}: a cabinet left of the hob`);
          if (wallEnd !== "right") assert.ok(h < isl.length - 1, `${layout} ${len} ${side}: a cabinet right of the hob`);
        }
      }
    }
    // a 180 cm peninsula: the hob stands next to wall A's corner, a drawer unit at the free end
    const pen = planKitchen(kitchen({ layout: "poluotok", walls: WALLS, island: 180, islandSpec: { functions: "hob" } }));
    const isl = pen.slots.filter((s) => s.zone === "island").sort((a, b) => a.x - b.x);
    assert.equal(feature(isl[0].type), "hob");
    assert.ok(isl[0].x - pen.island!.body.from < 10, "next to the corner (behind a few cm of filler at most)");
  });
});

describe("peninsula geometry", () => {
  for (const [layout, side] of [
    ["poluotok", "right"],
    ["poluotok", "left"],
    ["G", "right"],
  ] as const) {
    it(`${layout} (${side}): stands out from that end of wall A behind its blind corner unit, nothing overlaps`, () => {
      for (const len of [150, 200, 240, 320]) {
        for (const spec of SPECS) {
          const c = kitchen({ layout, walls: WALLS, island: len, islandSpec: { ...spec, side: layout === "G" ? undefined : side } });
          const p = planKitchen(c);
          const I = p.island!;
          const where = `${layout} ${side} ${len} ${JSON.stringify(spec)}`;
          assert.equal(I.kind, "poluotok");
          assert.equal(I.side, side);
          assert.equal(I.length, len);
          const A = c.walls.a;
          const wallEnd = side === "right" ? "left" : "right";
          // the run-local end at wall A lies on the wall (world z = 0), the free end `len` out
          const atWall = toWorld(I, wallEnd === "left" ? 0 : len, 0);
          const atEnd = toWorld(I, wallEnd === "left" ? len : 0, 0);
          assert.ok(Math.abs(atWall.z) < 1e-6 && Math.abs(atEnd.z - len) < 1e-6, `${where}: along z`);
          assert.ok(Math.abs(atWall.x - (side === "right" ? A : 0)) < 1e-6, `${where}: at the ${side} end of wall A`);
          // wall A has a blind corner unit at that end, its cabinets stop before it
          const corner = p.slots.find((s) => s.run === "a" && s.zone === "base" && s.corner === side);
          assert.ok(corner, `${where}: blind corner unit at the ${side} end`);
          // the peninsula's cabinets start behind it (DIM.baseDepth from the wall) and never overlap wall A's
          const wallA = p.slots.filter((s) => s.run === "a" && (s.zone === "base" || s.zone === "tall")).map((s) => ({ x0: s.x, x1: s.x + s.width, z0: 0, z1: DIM.baseDepth }));
          for (const s of p.slots.filter((x) => x.zone === "island")) {
            const r = worldRect(I, s.x, s.x + s.width, 0, DIM.baseDepth);
            assert.ok(r.z0 >= DIM.baseDepth - 1e-6, `${where}: ${s.id} behind the corner`);
            for (const w of wallA) assert.equal(overlapArea(r, w), 0, `${where}: ${s.id} vs wall A`);
          }
          // its worktop meets wall A's without overlapping it
          const run = p.runs.find((r) => r.wall === "a")!;
          const wt = { x0: run.worktop!.from, x1: run.worktop!.to, z0: 0, z1: DIM.worktopDepth };
          for (const r of I.slab) assert.ok(overlapArea(worldRect(I, r.from, r.to, r.z0, r.z1), wt) < 1e-6, `${where}: slab vs wall A worktop`);
          // only the free end can be a waterfall / end panel; the seats keep away from wall A
          for (const w of I.waterfalls) assert.ok(wallEnd === "left" ? w.from >= len - DIM.islandWaterfall - 1e-6 : w.to <= DIM.islandWaterfall + 1e-6, where);
          for (const s of I.seats) {
            if (s.x >= 0 && s.x <= len) assert.ok(wallEnd === "left" ? s.x >= DIM.seatWallGap : s.x <= len - DIM.seatWallGap, `${where}: seat away from the wall`);
            else assert.ok(wallEnd === "left" ? s.x > len : s.x < 0, `${where}: end seats only at the free end`);
          }
          // the tall column (if it fits) stands at the other end of the kitchen
          const tall = p.runs.find((r) => r.tall);
          if (tall && layout === "poluotok") assert.ok(side === "right" ? tall.tall!.from === 0 : tall.tall!.to === A, `${where}: tall column`);
          if (tall && layout === "G") assert.equal(tall.wall, "b", `${where}: G keeps the tall column on wall B`);
        }
      }
    });
  }

  it("a seat side against wall A falls back to the outer side", () => {
    const p = planKitchen(kitchen({ layout: "poluotok", walls: WALLS, island: 220, islandSpec: { seatSide: "left" } }));
    assert.equal(p.island!.seatSide, "back");
    assert.ok(p.island!.seats.every((s) => s.z < p.island!.outer));
  });
});

describe("seats, bar and lowered table", () => {
  it("stools are capped to what fits, with a note; overhang 0 means nobody sits", () => {
    const p = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 200, islandSpec: { stools: 8 } }));
    assert.equal(p.island!.seats.length, p.island!.seatsMax);
    assert.equal(p.island!.seatsMax, Math.floor(200 / DIM.seatPitch));
    assert.ok(p.warnings.some((w) => /stane najviše 3 stolice/.test(w)), p.warnings.join(" | "));
    const none = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 200, islandSpec: { overhang: 0 } })).island!;
    assert.equal(none.seats.length, 0);
    assert.equal(none.seatSide, null);
    assert.equal(none.overhang, 0);
    assert.equal(Math.min(...none.slab.map((r) => r.z0)), none.outer - DIM.islandFlush);
  });

  it("an end seat: the cabinets stop short of the overhang behind an end panel, the stools stand beyond the end", () => {
    const I = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 260, islandSpec: { seatSide: "right", overhang: 30, stools: 2 } })).island!;
    assert.equal(I.body.to, 260 - 30 - DIM.panel);
    assert.equal(I.waterfalls.length, 1);
    assert.ok(I.endPanels.some((r) => r.from === I.body.to));
    assert.ok(I.seats.length >= 1 && I.seats.every((s) => s.x > 260));
  });

  it("a raised bar takes the seats: bar stools at its height, no overhang on the worktop, brackets every ≤ 90 cm", () => {
    for (const layout of ISLAND_LAYOUTS) {
      for (const height of [105, 110, 115]) {
        const p = planKitchen(kitchen({ layout, walls: WALLS, island: 260, islandSpec: { stools: 3, bar: { kind: "raised", height } } }));
        const I = p.island!;
        const b = I.bar!;
        assert.equal(b.kind, "raised");
        assert.equal(b.height, height);
        assert.equal(I.overhang, 0);
        assert.equal(b.to - b.from, 260);
        assert.ok(b.upstand && b.upstand.y0 === p.heights.worktop && b.upstand.y1 === height - DIM.barT);
        assert.ok(b.brackets.length >= 2);
        for (let i = 1; i < b.brackets.length; i++) assert.ok(b.brackets[i] - b.brackets[i - 1] <= DIM.barBracketEvery + 1e-6);
        assert.equal(I.seats.length, 3);
        for (const s of I.seats) {
          assert.equal(s.kind, "stool");
          assert.equal(s.seat, height - DIM.barSeatDrop);
          assert.ok(s.z < b.z0 && s.x >= b.from && s.x <= b.to);
        }
        assert.ok(I.slab.every((r) => r.z0 >= I.outer - DIM.islandFlush - 1e-6), `${layout}: the worktop is flush where the bar is`);
      }
    }
    // at a 95 cm worktop a 105 cm bar would be a 10 cm step: raised to 110 with a note
    const p = planKitchen(kitchen({ layout: "otok", walls: WALLS, heights: { mode: "standard", worktop: 95 }, islandSpec: { bar: { kind: "raised", height: 105 } } }));
    assert.equal(p.island!.bar!.height, 110);
    assert.ok(p.warnings.some((w) => /Šank od 105 cm/.test(w)));
    // a shorter bar: centred on the island, from the free end of a peninsula
    const isl = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 260, islandSpec: { bar: { kind: "raised", length: 160 } } })).island!.bar!;
    assert.deepEqual([isl.from, isl.to], [50, 210]);
    const pen = planKitchen(kitchen({ layout: "poluotok", walls: WALLS, island: 260, islandSpec: { bar: { kind: "raised", length: 160 } } })).island!.bar!;
    assert.deepEqual([pen.from, pen.to], [100, 260]);
  });

  it("a lowered table: 75 cm, chairs at 46 cm, two legs, no outer cabinets", () => {
    const p = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 240, islandSpec: { depth: 120, stools: 4, bar: { kind: "table", depth: 80 } } }));
    const I = p.island!;
    const b = I.bar!;
    assert.equal(b.kind, "table");
    assert.equal(b.height, 75);
    assert.equal(b.depth, 80);
    assert.equal(b.z1, I.outer);
    assert.equal(b.legs.length, 2);
    assert.equal(I.depth, 60, "the outer row would open against the table");
    assert.equal(I.backRow, null);
    assert.ok(p.warnings.some((w) => /uz spušteni stol nema stražnjih ormarića/.test(w)));
    assert.equal(I.seats.length, 4);
    assert.ok(I.seats.every((s) => s.kind === "chair" && s.seat === DIM.chairSeat && s.z < b.z0));
  });

  it("a deeper body: a row of push-to-open cabinets on the outer side instead of the back panel", () => {
    for (const depth of [90, 100, 120]) {
      const I = planKitchen(kitchen({ layout: "otok", walls: WALLS, island: 240, islandSpec: { depth } })).island!;
      assert.equal(I.backPanel, null);
      assert.ok(I.backRow && I.backRow.depth === depth - 60);
      assert.equal(I.outer, -(depth - 60));
      const sum = I.backRow!.doors.reduce((s, w) => s + w, 0);
      assert.ok(Math.abs(sum - (I.backRow!.to - I.backRow!.from)) < 1e-6);
      assert.ok(I.backRow!.doors.every((w) => w <= 60 + 1e-6 && w >= 30));
    }
  });

  it("the ceiling hood: above every island hob (by hand too), off, height, never into the ceiling", () => {
    const base = { layout: "otok" as const, walls: WALLS, island: 260 };
    assert.equal(planKitchen(kitchen({ ...base, islandSpec: { functions: "hob", hood: false } })).island!.hood, null);
    const h = planKitchen(kitchen({ ...base, islandSpec: { functions: "hob", hoodAbove: 80 } })).island!.hood!;
    assert.equal(h.above, 80);
    assert.equal(h.bottom, 170);
    assert.equal(h.top - h.bottom, DIM.hoodBody);
    const low = planKitchen(kitchen({ ...base, ceiling: 210, heights: { mode: "standard", worktop: 95 }, islandSpec: { functions: "hob", hoodAbove: 85 } })).island!.hood!;
    assert.ok(low.top <= 210 - DIM.hoodCeilingMin + 1e-6);
    assert.equal(planKitchen(kitchen({ ...base, islandSpec: { hood: true } })).island!.hood, null, "no hob, no hood");
    // a hob the customer put on the island by hand gets the hood too (an older link's island hob included)
    const runs = { isl: [{ type: "ladice", width: 60 }, { type: "ploca", width: 80 }, { type: "ladice", width: 60 }] };
    const byHand = planKitchen(kitchen({ ...base, runs }));
    const hobSlot = byHand.slots.find((x) => x.zone === "island" && feature(x.type) === "hob")!;
    assert.equal(byHand.island!.hood!.x, hobSlot.x + hobSlot.width / 2, "centred above the hob");
    assert.ok(summarize(byHand.cfg).some((l) => /^Napa: otočna/.test(l)));
    assert.equal(planKitchen(kitchen({ ...base, runs, islandSpec: { hood: false } })).island!.hood, null);
    const v1 = planKitchen(decodeConfig("1.otok.420.220.220.260.hrast.crni.letvica.1.300.1.a-120-100-95.i0-ploca_i2-sudoper")!);
    assert.ok(v1.island!.hood, "v1 link with an island hob");
  });
});

describe("price, summary and admin quote", () => {
  it("every island layout and option is priced, summarised and itemised, and the quote adds up to the studio price", () => {
    for (const layout of ISLAND_LAYOUTS) {
      for (const islandSpec of SPECS) {
        const c = kitchen({ layout, walls: WALLS, island: 260, islandSpec });
        const where = `${layout} ${JSON.stringify(islandSpec)}`;
        const b = breakdown(c);
        assert.ok(Number.isFinite(b.total) && b.total > 0, where);
        const q = quoteFromConfig(c, { vatPct: 25, newId: () => "x" });
        assert.equal(q.mode, "plan", where);
        const gross = q.items.reduce((sum, it) => sum + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
        assert.ok(Math.abs(gross - b.total) < Math.max(5, b.total * 0.005), `${where}: ${gross} vs ${b.total}`);
        assert.ok(!q.items.some((it) => /^Ostalo/.test(it.description)), where);
        const p = planKitchen(c);
        const sum = summarize(c);
        assert.ok(sum.some((l) => l.startsWith(layout === "otok" ? "Otok:" : "Poluotok:")), where);
        if (p.island!.bar) {
          assert.ok(sum.some((l) => /^Šank|^Spušteni stol/.test(l)), `${where}: bar in the summary`);
          assert.ok(q.items.some((it) => /^Ploča šanka|^Ploča spuštenog stola/.test(it.description)), `${where}: bar top line`);
        }
        if (p.island!.hood) {
          assert.ok(sum.some((l) => /^Napa: otočna/.test(l)), where);
          assert.ok(q.items.some((it) => /^Montaža otočne nape/.test(it.description)), where);
        }
        if (p.island!.backRow) assert.ok(q.items.some((it) => /stražnji ormarići/.test(it.description)), where);
      }
    }
  });

  it("the extras cost more: a deeper body, a bar, a table and the hood; end panels cost less than stone sides", () => {
    const base = { layout: "otok" as const, walls: WALLS, island: 260 };
    const plain = breakdown(kitchen(base)).total;
    for (const islandSpec of [{ depth: 90 }, { bar: { kind: "raised" as const } }, { bar: { kind: "table" as const } }]) {
      assert.ok(breakdown(kitchen({ ...base, islandSpec })).total > plain, JSON.stringify(islandSpec));
    }
    assert.ok(breakdown(kitchen({ ...base, islandSpec: { waterfall: false } })).total < plain);
    const hob = breakdown(kitchen({ ...base, islandSpec: { functions: "hob" } }));
    const hobNoHood = breakdown(kitchen({ ...base, islandSpec: { functions: "hob", hood: false } }));
    assert.ok(hob.island > hobNoHood.island, "mounting the ceiling hood");
  });
});

describe("edit helpers", () => {
  const otok = kitchen({ layout: "otok", walls: WALLS, island: 260 });

  it("setIslandFunctions: edited wall runs give their hob / sink up for plain cabinets (the hood unit too) and get them back", () => {
    const edited = materializeLists(otok, planKitchen(otok), ["a", "a:u"]);
    const r = setIslandFunctions(edited, "both");
    assert.ok(r.ok);
    const p = planKitchen(r.cfg);
    assert.ok(!has(p, "base", "hob") && !has(p, "base", "sink") && !has(p, "base", "dishwasher"));
    assert.ok(has(p, "island", "hob") && has(p, "island", "sink"));
    assert.ok(!hoodOnWall(p), "the wall hood unit became a door unit");
    assert.equal(r.cfg.runs!.a!.length, edited.runs!.a!.length, "same widths, plain cabinets");
    const back = setIslandFunctions(r.cfg, "none");
    const q = planKitchen(back.cfg);
    assert.ok(has(q, "base", "hob") && has(q, "base", "sink"));
    assert.ok(!has(q, "island", "hob") && !has(q, "island", "sink"));
    assert.ok(hoodOnWall(q), "the hood unit is back above the hob");
    const hob = q.slots.find((s) => s.zone === "base" && feature(s.type) === "hob")!;
    const hood = q.slots.find((s) => s.zone === "upper" && moduleDef("upper", s.type)?.hood)!;
    assert.ok(Math.abs(hood.x + hood.width / 2 - (hob.x + hob.width / 2)) < 1e-6, "centred above the hob");
    assert.match(back.warning ?? "", /vraćen/);
  });

  it("setBar / setSeating / setIslandHood snap with notes; a bar as long as the island follows its length", () => {
    let r = setBar(otok, { kind: "raised" });
    assert.deepEqual(r.cfg.islandSpec, { bar: { kind: "raised" } });
    assert.match(r.warning ?? "", /prepust za sjedenje/);
    r = setBar(r.cfg, { height: 112, length: 900, top: "hrast" });
    assert.deepEqual(r.cfg.islandSpec!.bar, { kind: "raised", top: "hrast" });
    assert.match(r.warning ?? "", /105, 110, 115/);
    r = setBar(r.cfg, { kind: "table" });
    assert.deepEqual(r.cfg.islandSpec!.bar, { kind: "table", top: "hrast" });
    r = setBar(r.cfg, { length: 150 });
    assert.equal(r.island!.bar!.to - r.island!.bar!.from, 150);
    assert.equal(setBar(r.cfg, null).cfg.islandSpec, undefined);
    const s = setSeating(otok, { side: "left", overhang: 27, stools: 6 });
    assert.equal(s.cfg.islandSpec!.overhang, 25);
    assert.equal(s.cfg.islandSpec!.stools, s.island!.seatsMax);
    assert.match(s.warning ?? "", /0, 25, 30, 35/);
    const h = setIslandHood(setIslandFunctions(otok, "hob").cfg, { above: 95 });
    assert.equal(h.island!.hood!.above, HOOD_ABOVE.max);
    assert.equal(setIslandHood(h.cfg, { on: false }).island!.hood, null);
    // measured from the ceiling: 100 cm below a 260 cm ceiling = 70 cm above a 90 cm worktop
    const fc = setIslandHood(h.cfg, { fromCeiling: 100 });
    assert.equal(fc.cfg.islandSpec!.hoodAbove, 70);
    assert.deepEqual([fc.island!.hood!.bottom, fc.island!.hood!.fromCeiling], [160, 100]);
    assert.equal(fc.warning, null);
    const far = setIslandHood(h.cfg, { fromCeiling: 10 });
    assert.equal(far.island!.hood!.fromCeiling, 260 - 90 - HOOD_ABOVE.max);
    assert.match(far.warning ?? "", /ispod stropa/);
    const ch = islandChoices(fc.cfg)!.hood;
    assert.deepEqual(ch.fromCeiling, { min: 260 - 90 - HOOD_ABOVE.max, max: 260 - 90 - HOOD_ABOVE.min, value: 100 });
    assert.ok(!setIsland(kitchen({ layout: "L" }), { functions: "hob" }).ok);
  });

  it("setPeninsula: side and length; the blind corner unit changes ends with it; G stays at the right", () => {
    const pen = kitchen({ layout: "poluotok", walls: WALLS, island: 200, corners: { "base-r": "kutni-magic" } });
    assert.equal(planKitchen(pen).slots.find((s) => s.corner === "right" && s.zone === "base")!.type, "kutni-magic");
    const r = setPeninsula(pen, { side: "left", length: 400 });
    assert.equal(r.cfg.islandSpec!.side, "left");
    assert.equal(r.cfg.island, limitsFor("poluotok").island[1]);
    assert.match(r.warning ?? "", /od 150 do 320 cm/);
    assert.equal(planKitchen(r.cfg).slots.find((s) => s.corner === "left" && s.zone === "base")!.type, "kutni-magic");
    const g = setPeninsula(kitchen({ layout: "G", walls: WALLS }), { side: "left" });
    assert.equal(g.cfg.islandSpec, undefined);
    assert.match(g.warning ?? "", /desni kraj zida A/);
    assert.ok(!setPeninsula(otok, { side: "left" }).ok);
  });

  it("islandChoices lists what fits", () => {
    const ch = islandChoices(kitchen({ layout: "otok", walls: WALLS, island: 120 }))!;
    assert.equal(ch.kind, "otok");
    assert.deepEqual(
      ch.functions.map((f) => [f.value, f.fits]),
      [
        ["none", true],
        ["hob", false],
        ["sink", true],
        ["both", false],
      ],
    );
    const pen = islandChoices(kitchen({ layout: "poluotok", walls: WALLS, island: 220 }))!;
    assert.deepEqual(pen.sides, ["left", "right"]);
    assert.deepEqual(
      pen.seatSides.map((s) => [s.value, s.available]),
      [
        ["back", true],
        ["left", false],
        ["right", true],
      ],
    );
    assert.equal(islandChoices(kitchen({ layout: "U" })), null);
  });
});

// ---------------------------------------------------------------- headless engine build

/** stand-in materials: every mats.x / mats.x(id) is a named MeshStandardMaterial (no textures, no WebGL) */
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
        // usable both as a material (mats.oak) and as a factory (mats.front(id))
        f = Object.setPrototypeOf((...args: unknown[]) => named(`${key}(${args.join(",")})`), named(key));
        fns.set(key, f);
      }
      return f;
    },
  }) as unknown as KitchenEnv["mats"];
}

describe("engine (headless scene graph)", () => {
  it("builds every layout with every island option: finite geometry, the seats, bar, outer row and hood the plan lists", () => {
    const geos = new GeoCache();
    const env: KitchenEnv = {
      mats: stubMaterials(),
      geos,
      doc: undefined as never,
      fronts: { base: "antracit", upper: "antracit", tall: "antracit", island: "hrast" },
      topId: "mramor",
      handles: "bez",
      plinth: "crna",
      labels: false,
      tempo: "quick",
    };
    const box = new THREE.Box3();
    for (const layout of ISLAND_LAYOUTS) {
      for (const islandSpec of SPECS) {
        const where = `${layout} ${JSON.stringify(islandSpec)}`;
        const plan = planKitchen(kitchen({ layout, walls: WALLS, island: 240, ceiling: 280, islandSpec }));
        const K = buildKitchen(env, plan);
        K.timeline.finish();
        K.root.updateMatrixWorld(true);
        const cached = geosMap(geos);
        const chairGeos = new Set([...cached].filter(([k]) => /^chair:.*:wood$/.test(k)).map(([, g]) => g));
        const stoolGeo = cached.get("stool:seat");
        let meshes = 0;
        let stools = 0;
        let chairs = 0;
        let barTops = 0;
        K.root.traverse((o) => {
          const me = o as THREE.Mesh;
          if (!me.isMesh) return;
          meshes++;
          me.geometry.computeBoundingBox();
          box.copy(me.geometry.boundingBox!).applyMatrix4(me.matrixWorld);
          for (const v of [...box.min.toArray(), ...box.max.toArray()]) assert.ok(Number.isFinite(v), `${where}: finite geometry`);
          if (me.geometry === stoolGeo) stools++;
          if (chairGeos.has(me.geometry)) chairs++;
          if ((me.material as THREE.Material).name === "top(hrast)") barTops++;
        });
        const I = plan.island!;
        assert.ok(meshes > 20, where);
        assert.equal(stools, I.seats.filter((s) => s.kind === "stool").length, `${where}: stools`);
        assert.equal(chairs, I.seats.filter((s) => s.kind === "chair").length, `${where}: chairs`);
        assert.equal(Boolean(K.islandHood), Boolean(I.hood), `${where}: hood`);
        if (I.bar?.top === "hrast") assert.ok(barTops > 0, `${where}: the bar top in its own material`);
        assert.equal(K.islandParts.carcass.length, I.backRow ? 1 : 0, `${where}: outer row`);
        // the camera frame holds the whole island incl. its seats
        assert.ok(!K.box.isEmpty(), where);
        disposeKitchen(K);
      }
    }
  });
});

/** a GeoCache's shared geometries by key (its map is private; read through a cast, for the test only) */
function geosMap(g: GeoCache): Map<string, THREE.BufferGeometry> {
  return (g as unknown as { map: Map<string, THREE.BufferGeometry> }).map;
}
