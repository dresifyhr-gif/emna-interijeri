/**
 * Studio core tests (no DOM, no three.js): every catalogue width in every zone and layout, tall columns of mixed
 * widths (incl. the side-by-side fridge niche and more than three units), the in-kitchen edit helpers
 * (allowedWidths, insertOptions, setWallLength, tall edits), share-link round trips and the admin quote prefill.
 *
 *   npx tsx --test lib/studio/studio.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteFromConfig } from "../admin/quote-from-config";
import { SBS, catalog, moduleDef, type ModuleTypeDef } from "./catalog";
import {
  allowedWidths,
  changeType,
  changeWidth,
  insertAfter,
  insertBefore,
  insertOptions,
  remove,
  setWallLength,
  slotEditInfo,
  wallLimits,
} from "./edit";
import { MAX_TALL, planKitchen, sanitizeConfig, tallCapacity, type KitchenPlan, type ListId } from "./plan";
import { estimate } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { summarize } from "./summary";
import { DEFAULT_CONFIG, type CabinetSpec, type KitchenConfig, type Layout } from "./types";

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok"];
const cfgOf = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const listSlots = (p: KitchenPlan, id: ListId) => p.slots.filter((s) => s.list?.id === id).sort((a, b) => a.x - b.x);
const roundTrip = (c: KitchenConfig) => decodeConfig(encodeConfig(c));
const tallTypes = () => catalog.modules.filter((m) => m.zone === "tall");

/** a kitchen of `layout` with roomy walls and one explicit list holding just `entry` */
function withOne(layout: Layout, zone: "base" | "upper" | "tall" | "island", entry: CabinetSpec): { cfg: KitchenConfig; id: ListId } {
  const base: Partial<KitchenConfig> = { layout, walls: { a: 600, b: 400, c: 400 }, island: 240, tall: zone === "tall" };
  if (zone === "tall") return { cfg: cfgOf({ ...base, tallRun: [entry] }), id: "tall" };
  if (zone === "upper") return { cfg: cfgOf({ ...base, upperRuns: { a: [entry] } }), id: "a:u" };
  if (zone === "island") return { cfg: cfgOf({ ...base, runs: { isl: [entry] } }), id: "isl" };
  return { cfg: cfgOf({ ...base, runs: { a: [entry] } }), id: "a" };
}

function zonesOf(def: ModuleTypeDef): ("base" | "upper" | "tall" | "island")[] {
  if (def.zone === "base") return def.island ? ["base", "island"] : ["base"];
  return [def.zone];
}

describe("catalogue widths", () => {
  it("every width of every type is placed exactly, priced, summarised and survives a share link — in every layout", () => {
    let n = 0;
    for (const def of catalog.modules) {
      if (def.corner || def.spacer) continue;
      for (const zone of zonesOf(def)) {
        for (const layout of LAYOUTS) {
          if (zone === "island" && layout !== "otok") continue;
          for (const width of def.widths) {
            const { cfg, id } = withOne(layout, zone, { type: def.id, width });
            const plan = planKitchen(cfg);
            const slots = listSlots(plan, id);
            const where = `${def.zone}:${def.id} ${width} cm (${zone}, ${layout})`;
            assert.equal(slots.length, 1, `${where}: one slot`);
            assert.equal(slots[0].type, def.id, `${where}: type`);
            assert.equal(slots[0].width, width, `${where}: width`);
            assert.ok(slots[0].options.includes(def.id), `${where}: the slot offers its own type`);
            assert.ok(!plan.warnings.some((w) => /ne stane/.test(w)), `${where}: nothing left out (${plan.warnings.join(" | ")})`);
            const back = roundTrip(cfg);
            assert.deepEqual(back, cfg, `${where}: share link round trip`);
            const p = estimate(cfg);
            assert.ok(p.low > 0 && p.high >= p.low, `${where}: price`);
            const sum = summarize(cfg).join("\n").toLowerCase();
            assert.ok(sum.includes(`${def.name.toLowerCase()} ${width}`), `${where}: summary lists it with its width`);
            n++;
          }
        }
      }
    }
    assert.ok(n > 400, `checked ${n} placements`);
  });

  it("keeps the old widths (old links mean the same element), and the planner's own kitchens use the classic 30–90 set", () => {
    // v2 link with a 60 cm double door, a 50 cm bin, an 80 cm hood and an 80 cm tall cupboard
    const c = decodeConfig("2.ravna.420.220.220.260.antracit.mramor.bez.1.240.1.0.ra-vv60k50l90.ua-ff90h80n60.t-v80s45r60");
    assert.ok(c);
    assert.deepEqual(c.runs?.a, [
      { type: "vrata2", width: 60 },
      { type: "smece", width: 50 },
      { type: "ladice", width: 90 },
    ]);
    assert.deepEqual(c.upperRuns?.a, [
      { type: "klapna2", width: 90 },
      { type: "napa", width: 80 },
      { type: "nisa", width: 60 },
    ]);
    assert.deepEqual(c.tallRun, [
      { type: "ormar", width: 80 },
      { type: "smocnica", width: 45 },
      { type: "hladnjak", width: 60 },
    ]);
    for (const layout of LAYOUTS) {
      for (const a of [240, 380, 520]) {
        const p = planKitchen(cfgOf({ layout, walls: { a, b: 260, c: 260 } }));
        for (const s of p.slots) if (!s.corner && s.zone !== "tall") assert.ok([30, 40, 45, 50, 60, 80, 90].includes(s.width), `${layout} ${a}: ${s.id} ${s.width}`);
      }
    }
  });

  it("the side-by-side niche is one tall slot of SBS.niche cm, in both bridge variants", () => {
    assert.equal(SBS.niche, SBS.panel * 2 + SBS.gap * 2 + SBS.appliance);
    for (const id of ["hladnjak-sbs", "hladnjak-sbs-vrata"]) {
      const def = moduleDef("tall", id);
      assert.ok(def, id);
      assert.deepEqual(def.widths, [SBS.niche]);
      assert.match(def.description, /nije uračunat/);
    }
  });
});

describe("tall column", () => {
  it("takes mixed widths: 30 larder + side-by-side niche + 60 oven column", () => {
    for (const layout of LAYOUTS) {
      const tallRun = [
        { type: "smocnica", width: 30 },
        { type: "hladnjak-sbs", width: SBS.niche },
        { type: "pecnica-mikro", width: 60 },
      ];
      const cfg = cfgOf({ layout, walls: { a: 480, b: 300, c: 420 }, tallRun });
      const p = planKitchen(cfg);
      const t = listSlots(p, "tall");
      assert.deepEqual(
        t.map((s) => [s.type, s.width]),
        tallRun.map((e) => [e.type, e.width]),
        layout,
      );
      for (let i = 1; i < t.length; i++) assert.equal(t[i].x, t[i - 1].x + t[i - 1].width, `${layout}: units side by side`);
      const panels = p.pieces.filter((q) => q.zone === "tall" && q.kind === "panel");
      assert.equal(panels.length, 2, `${layout}: a cover panel at each end`);
      assert.ok(!p.warnings.some((w) => /Visoki stup ne stane/.test(w)), `${layout}: column kept`);
      assert.deepEqual(roundTrip(cfg), cfg, `${layout}: share link`);
      const q = quoteFromConfig(cfg, { vatPct: 25 });
      assert.equal(q.mode, "plan", `${layout}: admin prefill itemises the plan`);
      assert.ok(
        q.items.some((it) => /dvokrilni hladnjak \(side-by-side\) 96/.test(JSON.stringify(it))),
        `${layout}: the side-by-side niche is itemised in the quote`,
      );
    }
  });

  it(`holds more than three units (up to ${MAX_TALL}) when they fit`, () => {
    const six = [
      { type: "smocnica", width: 15 },
      { type: "smocnica", width: 20 },
      { type: "ormar", width: 30 },
      { type: "metle", width: 40 },
      { type: "hladnjak", width: 60 },
      { type: "pecnica", width: 60 },
    ];
    const cfg = cfgOf({ layout: "ravna", walls: { a: 600, b: 220, c: 220 }, tallRun: [...six, { type: "ormar", width: 40 }] });
    assert.equal(cfg.tallRun?.length, MAX_TALL, "longer lists are cut to MAX_TALL");
    const p = planKitchen(cfg);
    assert.equal(listSlots(p, "tall").length, MAX_TALL);
    assert.deepEqual(roundTrip(cfg), cfg);
  });

  it("insert / change width / change type / remove in the tall column", () => {
    let cfg = cfgOf({ layout: "L", walls: { a: 480, b: 260, c: 220 } });
    let r = insertBefore(cfg, "tall-0", "smocnica", 30);
    assert.ok(r.ok, r.warning ?? "");
    cfg = r.cfg;
    assert.deepEqual(cfg.tallRun?.map((e) => `${e.type}:${e.width}`), ["smocnica:30", "pecnica:60", "hladnjak:60"]);
    assert.equal(r.slotId, "tall-0");
    r = changeWidth(cfg, "tall-0", 15);
    assert.ok(r.ok, r.warning ?? "");
    cfg = r.cfg;
    r = insertAfter(cfg, "tall-2", "metle", 30);
    assert.ok(r.ok, r.warning ?? "");
    cfg = r.cfg;
    assert.equal(cfg.tallRun?.length, 4, "a fourth unit");
    r = changeType(cfg, "tall-2", "hladnjak-sbs");
    assert.ok(r.ok, r.warning ?? "");
    cfg = r.cfg;
    assert.deepEqual(cfg.tallRun?.map((e) => `${e.type}:${e.width}`), ["smocnica:15", "pecnica:60", `hladnjak-sbs:${SBS.niche}`, "metle:30"]);
    const cap = tallCapacity(cfg);
    const used = cfg.tallRun!.reduce((n, e) => n + e.width, 0);
    assert.ok(cap >= used, "capacity covers the column");
    // too wide: refused with the column's limit in the note
    r = insertAfter(cfg, "tall-3", "ormar", 90);
    if (used + 90 > cap) {
      assert.ok(!r.ok);
      assert.match(r.warning ?? "", /visokom stupu/);
      assert.match(r.warning ?? "", new RegExp(`najviše ${Math.floor(cap)} cm`));
    }
    // remove down to nothing: the column switches off
    for (let i = cfg.tallRun!.length - 1; i >= 0; i--) {
      r = remove(cfg, "tall-0");
      assert.ok(r.ok, r.warning ?? "");
      cfg = r.cfg;
    }
    assert.equal(cfg.tall, false);
    assert.equal(cfg.tallRun, undefined);
  });

  it("capacity: the column fits up to tallCapacity and not a cm more (where widths allow)", () => {
    for (const layout of LAYOUTS) {
      const cfg = cfgOf({ layout, walls: { a: 420, b: 260, c: 300 } });
      const cap = tallCapacity(cfg);
      assert.ok(cap >= 120, `${layout}: default column fits (${cap})`);
      const info = slotEditInfo(cfg, "tall-0");
      assert.ok(info);
      assert.equal(Math.round(info.free), Math.round(cap - 120), `${layout}: free room of the column`);
    }
  });
});

describe("edit helpers", () => {
  const configs: [string, KitchenConfig][] = [
    ["L default", cfgOf({})],
    ["U", cfgOf({ layout: "U", walls: { a: 360, b: 300, c: 320 } })],
    ["ravna + window", cfgOf({ layout: "ravna", walls: { a: 420, b: 220, c: 220 }, window: { wall: "a", offset: 120, width: 100, sill: 100 } })],
    [
      "otok, edited",
      cfgOf({
        layout: "otok",
        walls: { a: 460, b: 220, c: 220 },
        island: 260,
        runs: { a: [{ type: "ladice", width: 60 }, { type: "sudoper", width: 80 }, { type: "slobodno", width: 75 }, { type: "ploca", width: 90 }] },
        tallRun: [{ type: "smocnica", width: 30 }, { type: "hladnjak", width: 60 }],
      }),
    ],
  ];

  it("allowedWidths: `fits` is exactly what changeWidth does, with a reason when not", () => {
    for (const [name, cfg] of configs) {
      for (const s of planKitchen(cfg).slots) {
        for (const o of allowedWidths(cfg, s.id)) {
          if (o.current) continue;
          const r = changeWidth(cfg, s.id, o.width);
          assert.equal(o.fits, r.ok, `${name} ${s.id} ${s.type} → ${o.width}: ${r.warning}`);
          if (!o.fits) assert.ok(o.reason && o.reason.length > 5, `${name} ${s.id} ${o.width}: reason`);
          else assert.equal(o.reason, null);
          if (r.ok && r.slotId) assert.equal(planKitchen(r.cfg).slots.find((x) => x.id === r.slotId)?.type, o.type, `${name} ${s.id} ${o.width}: type`);
        }
      }
    }
  });

  it("insertOptions: the previewed widths are exactly the inserts that work (type-independent probing is sound)", () => {
    for (const [name, cfg] of configs) {
      for (const s of planKitchen(cfg).slots) {
        for (const side of ["before", "after"] as const) {
          const opts = insertOptions(cfg, s.id, side);
          const ins = side === "after" ? insertAfter : insertBefore;
          for (const o of opts) {
            const def = moduleDef(s.zone === "island" ? "base" : s.zone, o.id)!;
            for (const w of def.widths) {
              const r = ins(cfg, s.id, o.id, w);
              assert.equal(o.fitting?.includes(w) ?? false, r.ok, `${name} ${s.id} ${side} ${o.id} ${w}: ${r.warning}`);
            }
            const d = ins(cfg, s.id, o.id);
            const dw = d.ok && d.slotId ? planKitchen(d.cfg).slots.find((x) => x.id === d.slotId)?.width : null;
            assert.equal(o.width, dw ?? null, `${name} ${s.id} ${side} ${o.id}: default width`);
          }
        }
      }
    }
  });

  it("slotEditInfo stays quick enough for every click", () => {
    const cfg = configs[1][1];
    const t0 = performance.now();
    let n = 0;
    for (const s of planKitchen(cfg).slots) {
      slotEditInfo(cfg, s.id);
      n++;
    }
    const per = (performance.now() - t0) / n;
    assert.ok(per < 80, `${per.toFixed(1)} ms per element`);
  });

  it("setWallLength clamps like sanitizeConfig and explains what changed", () => {
    const cfg = cfgOf({ layout: "L", walls: { a: 380, b: 220, c: 220 }, window: { wall: "a", offset: 200, width: 150, sill: 100 } });
    assert.deepEqual(wallLimits(cfg, "a"), { min: 180, max: 800 });
    assert.equal(wallLimits(cfg, "c"), null);
    assert.equal(wallLimits(cfg, "isl"), null);
    let r = setWallLength(cfg, "a", 290);
    assert.ok(r.ok);
    assert.equal(r.cfg.walls.a, 290);
    assert.equal(r.value, 290);
    assert.match(r.warning ?? "", /Prozor/);
    r = setWallLength(cfg, "a", 5000);
    assert.equal(r.value, 800);
    assert.match(r.warning ?? "", /od 180 do 800 cm/);
    r = setWallLength(cfg, "c", 300);
    assert.ok(!r.ok);
    r = setWallLength(cfg, "b", Number.NaN);
    assert.ok(!r.ok);
    // an edited run that no longer fits: the planner's note comes along
    const edited = cfgOf({ layout: "ravna", tall: false, walls: { a: 400, b: 220, c: 220 }, runs: { a: [{ type: "ladice", width: 120 }, { type: "sudoper", width: 120 }, { type: "ploca", width: 120 }] } });
    r = setWallLength(edited, "a", 260);
    assert.ok(r.ok);
    assert.match(r.warning ?? "", /više ne stane/);
    // island
    const isl = cfgOf({ layout: "otok", walls: { a: 300, b: 220, c: 220 }, island: 300 });
    r = setWallLength(isl, "isl", 400);
    assert.equal(r.value, 340, "island at most wall A + 2 × 20 cm");
    r = setWallLength(isl, "a", 200);
    assert.match(r.warning ?? "", /Otok je skraćen/);
    assert.equal(r.cfg.island, 240);
  });
});

describe("share links", () => {
  it("round-trips kitchens built from every width (lists of all zones)", () => {
    for (const layout of LAYOUTS) {
      const base = tallTypes()
        .filter((d) => d.widths.length > 1)
        .flatMap((d) => d.widths.map((w) => ({ type: d.id, width: w })));
      const cfg = cfgOf({
        layout,
        walls: { a: 800, b: 600, c: 600 },
        runs: { a: catalog.modules.filter((m) => m.zone === "base" && !m.corner && !m.spacer).map((m) => ({ type: m.id, width: m.widths[m.widths.length - 1] })) },
        upperRuns: { a: catalog.modules.filter((m) => m.zone === "upper" && !m.spacer).map((m) => ({ type: m.id, width: m.widths[0] })) },
        tallRun: base.slice(0, MAX_TALL),
      });
      assert.deepEqual(roundTrip(cfg), cfg, layout);
      const link = encodeConfig(cfg);
      assert.match(link, /^[A-Za-z0-9._-]+$/);
    }
  });

  it("decodes the side-by-side codes", () => {
    const c = decodeConfig(`2.ravna.480.220.220.260.antracit.mramor.bez.1.240.1.0.t-s30rs${SBS.niche}om60rv${SBS.niche}`);
    assert.deepEqual(c?.tallRun, [
      { type: "smocnica", width: 30 },
      { type: "hladnjak-sbs", width: SBS.niche },
      { type: "pecnica-mikro", width: 60 },
      { type: "hladnjak-sbs-vrata", width: SBS.niche },
    ]);
  });
});
