/**
 * Element heights tests (KitchenConfig.heights: standard / "do stropa" / custom, worktop 85–95 cm) — no DOM, no three.js:
 * the planner's heights for every ceiling and layout, sanitizing and old links, share-link round trips, price,
 * summary, the admin quote prefill and the edit helpers (setHeights, heightChoices, setCeiling).
 *
 *   npx tsx --test lib/studio/heights.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { quoteFromConfig } from "../admin/quote-from-config";
import { heightChoices, setCeiling, setHeights } from "./edit";
import { DIM, UPPER_HEIGHTS, WORKTOP_HEIGHTS, limitsFor, planKitchen, sanitizeConfig } from "./plan";
import { breakdown, estimate } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { summarize } from "./summary";
import { DEFAULT_CONFIG, type HeightSpec, type KitchenConfig, type Layout } from "./types";

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok"];
const CEILINGS: number[] = [];
for (let c = 210; c <= 350; c += 5) CEILINGS.push(c);

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });

describe("standard heights (every older link)", () => {
  it("are exactly the v1/v2 heights for every ceiling and layout", () => {
    for (const layout of LAYOUTS) {
      for (const ceiling of CEILINGS) {
        const p = planKitchen(kitchen({ layout, ceiling }));
        const ut = Math.min(219, ceiling - 3);
        assert.equal(p.cfg.heights, undefined);
        assert.equal(p.heights.mode, "standard");
        assert.equal(p.upperTop, ut);
        assert.equal(p.upperBottom, Math.min(147, ut - 50));
        assert.equal(p.heights.tallTop, ut);
        assert.equal(p.heights.worktop, 90);
        assert.equal(p.heights.plinth, DIM.plinth);
        assert.equal(p.heights.topRow, null);
        assert.equal(p.heights.cornice, null);
        assert.equal(p.heights.tallSplit, null);
        assert.equal(p.heights.cornices.length, 0);
      }
    }
  });

  it("sanitizing drops the default and snaps / clamps the rest", () => {
    assert.equal(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "standard" } }).heights, undefined);
    assert.equal(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "standard", worktop: 90 } }).heights, undefined);
    assert.equal(sanitizeConfig({ ...DEFAULT_CONFIG, heights: "do-stropa" }).heights, undefined);
    assert.deepEqual(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "nonsense", worktop: 97 } }).heights, { mode: "standard", worktop: 95 });
    assert.deepEqual(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "do-stropa", upper: 90, tallTop: 250 } }).heights, { mode: "do-stropa" });
    assert.deepEqual(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "custom" } }).heights, { mode: "custom", upper: 72 });
    assert.deepEqual(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "custom", upper: 100, tallTop: 999 } }).heights, { mode: "custom", upper: 105, tallTop: 350 });
    assert.deepEqual(sanitizeConfig({ ...DEFAULT_CONFIG, heights: { mode: "custom", upper: "90", tallTop: "120" } }).heights, { mode: "custom", upper: 90, tallTop: DIM.tallTopMin });
  });
});

describe("do stropa", () => {
  it("reaches the ceiling with real proportions for every ceiling and layout", () => {
    for (const layout of LAYOUTS) {
      for (const ceiling of CEILINGS) {
        for (const worktop of WORKTOP_HEIGHTS) {
          const cfg = kitchen({ layout, ceiling, heights: { mode: "do-stropa", worktop } });
          const p = planKitchen(cfg);
          const h = p.heights;
          const line = h.topRow ? h.topRow.to : h.upperTop;
          const tag = `${layout} ${ceiling} ${worktop}`;
          assert.equal(h.mode, "do-stropa", tag);
          assert.equal(h.tallTop, line, tag);
          assert.ok(line <= ceiling - DIM.cornice + 1e-9, tag);
          assert.deepEqual(h.cornice, { from: line, to: ceiling }, tag);
          assert.equal(h.plinth + h.carcass + DIM.worktopT, worktop, tag);
          assert.ok(h.upperBottom >= worktop + DIM.upperGapMin, tag);
          if (h.topRow) {
            const top = h.topRow.to - h.topRow.from;
            const main = h.upperTop - h.upperBottom;
            assert.ok(top >= DIM.topRowMin - 1e-9 && top <= DIM.topRowMax + 1e-9, `${tag}: top row ${top}`);
            assert.ok(main >= 70 && main <= DIM.upperMainMax, `${tag}: main row ${main}`);
            assert.equal(h.tallSplit, h.topRow.from, tag);
            // up to 320 cm the cabinets end exactly under the 2 cm cornice
            if (ceiling <= 320) assert.equal(line, ceiling - DIM.cornice, tag);
          } else {
            assert.equal(line, ceiling - DIM.cornice, tag);
            assert.ok(h.upperTop - h.upperBottom <= DIM.upperRowMax, tag);
            assert.equal(h.tallSplit, null, tag);
            assert.ok(h.tallTop - h.plinth <= DIM.tallOnePiece, `${tag}: one-piece tall unit`);
          }
          // a cornice strip along the wall units of every wall and over the tall column
          for (const w of p.walls) {
            const ups = p.slots.some((s) => s.zone === "upper" && s.run === w && s.type !== "prazno" && s.type !== "polica");
            if (ups) assert.ok(h.cornices.some((c) => c.run === w && c.zone === "upper"), `${tag}: cornice on ${w}`);
          }
          if (p.slots.some((s) => s.zone === "tall")) assert.ok(h.cornices.some((c) => c.zone === "tall"), `${tag}: cornice on the column`);
          for (const c of h.cornices) assert.ok(c.to > c.from, tag);
        }
      }
    }
  });

  it("a 3 m ceiling gives a second row of top cabinets and a tall column to the same line", () => {
    const h = planKitchen(kitchen({ ceiling: 300, heights: { mode: "do-stropa" } })).heights;
    assert.equal(h.tallTop, 298);
    assert.ok(h.topRow && h.topRow.to === 298);
    assert.equal(h.tallSplit, h.upperTop);
  });
});

describe("custom heights", () => {
  it("fit under the ceiling with a note and keep what was asked for", () => {
    const cfg = kitchen({ ceiling: 240, heights: { mode: "custom", upper: 105, tallTop: 250 } });
    const p = planKitchen(cfg);
    assert.deepEqual(cfg.heights, { mode: "custom", upper: 105, tallTop: 250 });
    assert.ok(p.heights.upperTop <= 240 - DIM.ceilingGap);
    assert.ok(p.heights.tallTop <= 240 - DIM.ceilingGap);
    assert.ok(p.warnings.some((w) => /Gornji elementi od 105 cm ne stanu/.test(w)));
    assert.ok(p.warnings.some((w) => /Visoki stup do 250 cm ne stane/.test(w)));
    // a higher ceiling again: the requested heights come back, no note
    const p2 = planKitchen({ ...cfg, ceiling: 300 });
    assert.equal(p2.heights.upperTop - p2.heights.upperBottom, 105);
    assert.equal(p2.heights.tallTop, 250);
    assert.ok(!p2.warnings.some((w) => /ne stan/.test(w)));
  });

  it("every offered wall-unit height that fits is drawn exactly", () => {
    for (const ceiling of CEILINGS) {
      for (const upper of UPPER_HEIGHTS) {
        const h = planKitchen(kitchen({ ceiling, heights: { mode: "custom", upper } })).heights;
        const fits = 90 + DIM.upperGapMin + upper <= ceiling - DIM.ceilingGap;
        if (fits) assert.equal(h.upperTop - h.upperBottom, upper, `${ceiling} ${upper}`);
        assert.ok(h.upperTop <= ceiling - DIM.ceilingGap, `${ceiling} ${upper}`);
        assert.ok(h.upperBottom >= 90 + DIM.upperGapMin - 1e-9, `${ceiling} ${upper}`);
        assert.ok(h.tallTop >= DIM.tallTopMin && h.tallTop <= Math.max(DIM.tallTopMin, ceiling - DIM.ceilingGap));
        if (h.tallSplit !== null) assert.ok(h.tallSplit > h.plinth && h.tallSplit < h.tallTop);
      }
    }
  });
});

describe("worktop height", () => {
  it("moves the plinth, the backsplash and the wall units with it", () => {
    for (const worktop of WORKTOP_HEIGHTS) {
      const p = planKitchen(kitchen({ heights: { mode: "standard", worktop } }));
      assert.equal(p.heights.worktop, worktop);
      assert.equal(p.heights.plinth + p.heights.carcass + DIM.worktopT, worktop);
      assert.equal(p.upperBottom, worktop + DIM.upperGap);
      for (const r of p.runs) for (const b of r.backsplash) assert.ok(b.top > worktop);
    }
  });
});

describe("share links, price, summary and the admin prefill", () => {
  const specs: (HeightSpec | undefined)[] = [
    undefined,
    { mode: "standard", worktop: 85 },
    { mode: "standard", worktop: 95 },
    { mode: "do-stropa" },
    { mode: "do-stropa", worktop: 95 },
    { mode: "custom", upper: 90 },
    { mode: "custom", upper: 120, tallTop: 260, worktop: 85 },
  ];

  it("round-trip through the share link in every layout", () => {
    for (const layout of LAYOUTS) {
      for (const heights of specs) {
        for (const ceiling of [230, 260, 300]) {
          const cfg = kitchen({ layout, ceiling, heights });
          const back = decodeConfig(encodeConfig(cfg));
          assert.ok(back);
          assert.deepEqual(back.heights, cfg.heights, `${layout} ${ceiling} ${JSON.stringify(heights)}`);
          assert.deepEqual(planKitchen(back).heights, planKitchen(cfg).heights);
        }
      }
    }
    // an older link has no heights field and stays standard
    const old = decodeConfig("2.L.380.220.220.300.antracit.mramor.bez.1.240.1.0");
    assert.equal(old?.heights, undefined);
    assert.equal(planKitchen(old!).upperTop, 219);
  });

  it("taller cabinets cost more; the price and the admin quote stay consistent", () => {
    for (const layout of LAYOUTS) {
      const std = estimate(kitchen({ layout, ceiling: 300 }));
      const top = estimate(kitchen({ layout, ceiling: 300, heights: { mode: "do-stropa" } }));
      assert.ok(top.low > std.low, layout);
      const low = estimate(kitchen({ layout, ceiling: 250, heights: { mode: "do-stropa" } }));
      assert.ok(top.low >= low.low, layout);
      for (const heights of specs) {
        const cfg = kitchen({ layout, ceiling: 280, heights });
        const b = breakdown(cfg);
        assert.ok(Number.isFinite(b.total) && b.total > 0);
        const q = quoteFromConfig(cfg, { vatPct: 25, newId: () => "x" });
        assert.equal(q.mode, "plan", `${layout} ${JSON.stringify(heights)}`);
        assert.ok(q.studioGrossEur !== null && Math.abs(q.studioGrossEur - b.total) < 0.01);
        const gross = q.items.reduce((sum, it) => sum + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
        assert.ok(Math.abs(gross - b.total) < Math.max(5, b.total * 0.005), `${layout} ${JSON.stringify(heights)}: ${gross} vs ${b.total}`);
      }
    }
  });

  it("the admin quote prices taller cabinets on their own lines (top cabinets, cornice) with a 30 cm larder in the column", () => {
    const tallRun = [
      { type: "smocnica", width: 30 },
      { type: "hladnjak", width: 60 },
      { type: "pecnica", width: 60 },
    ];
    const walls = { a: 480, b: 260, c: 220 };
    const std = quoteFromConfig(kitchen({ layout: "L", ceiling: 300, walls, tallRun }), { vatPct: 25, newId: () => "x" });
    const cfg = kitchen({ layout: "L", ceiling: 300, walls, tallRun, heights: { mode: "do-stropa", worktop: 95 } });
    const q = quoteFromConfig(cfg, { vatPct: 25, newId: () => "x" });
    assert.equal(q.mode, "plan");
    const line = (items: typeof q.items, re: RegExp) => items.find((it) => re.test(it.description));
    // wall units and the tall column cost more per metre than in the same kitchen at standard heights
    assert.ok(line(q.items, /^Gornji elementi – zid A/)!.unit_price_cents > line(std.items, /^Gornji elementi – zid A/)!.unit_price_cents);
    const tall = line(q.items, /^Visoki elementi/)!;
    assert.ok(tall.unit_price_cents > line(std.items, /^Visoki elementi/)!.unit_price_cents);
    assert.match(tall.details ?? "", /izvlačna smočnica 30/);
    const h = planKitchen(cfg).heights;
    assert.ok(h.topRow && h.tallSplit !== null && h.cornices.length > 0, "a 3 m ceiling has a top row, split tall units and a cornice");
    assert.ok(line(q.items, /^Nadgradni ormarići do stropa/), "the top cabinets have their own line");
    assert.ok(line(q.items, /^Lajsna do stropa/), "the cornice has its own line");
    assert.ok(!line(std.items, /^Nadgradni|^Lajsna/), "standard kitchens have neither");
    assert.ok(!line(q.items, /^Ostalo/));
    const gross = q.items.reduce((sum, it) => sum + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
    assert.ok(Math.abs(gross - breakdown(cfg).total) < 1, `${gross} vs ${breakdown(cfg).total}`);
  });

  it("the summary names the heights only when they are not the standard ones", () => {
    assert.ok(!summarize(kitchen({})).some((l) => l.startsWith("Visine:")));
    const lines = summarize(kitchen({ ceiling: 300, heights: { mode: "do-stropa" } }));
    const l = lines.find((x) => x.startsWith("Visine:"));
    assert.ok(l && /do stropa/.test(l) && /nadgradni ormarići/.test(l) && /lajsna do stropa 2 cm/.test(l), l);
    assert.ok(summarize(kitchen({ heights: { mode: "standard", worktop: 95 } })).some((x) => x === "Visine: standardne — radna ploča 95 cm, gornji elementi 72 cm (152–224 cm od poda), visoki stup do 224 cm"));
  });
});

describe("edit helpers", () => {
  it("setHeights switches modes and reports what the ceiling did", () => {
    const base = kitchen({ ceiling: 300 });
    const a = setHeights(base, { mode: "do-stropa" });
    assert.ok(a.ok);
    assert.deepEqual(a.cfg.heights, { mode: "do-stropa" });
    assert.equal(a.heights.tallTop, 298);
    // to custom: starts from what is drawn, below the ceiling, without a note
    const b = setHeights(a.cfg, { mode: "custom" });
    assert.equal(b.cfg.heights?.mode, "custom");
    assert.equal(b.cfg.heights?.upper, 105);
    assert.ok((b.cfg.heights?.tallTop ?? 0) <= 300 - DIM.ceilingGap);
    assert.equal(b.warning, null);
    // a snapped value says so
    const c = setHeights(b.cfg, { worktop: 92 });
    assert.equal(c.cfg.heights?.worktop, undefined);
    assert.ok(c.notes.some((n) => /Radna ploča može biti/.test(n)));
    // back to standard
    const d = setHeights(c.cfg, null);
    assert.equal(d.cfg.heights, undefined);
    assert.equal(d.heights.upperTop, 219);
  });

  it("heightChoices and setCeiling", () => {
    const cfg = kitchen({ ceiling: 230, heights: { mode: "custom", upper: 105 } });
    const hc = heightChoices(cfg);
    assert.equal(hc.mode, "custom");
    assert.deepEqual(hc.worktop.map((w) => w.value), [...WORKTOP_HEIGHTS]);
    assert.equal(hc.upper.find((u) => u.value === 105)?.fits, false);
    assert.equal(hc.upper.find((u) => u.value === 72)?.fits, true);
    assert.equal(hc.upper.filter((u) => u.current).length, 1);
    assert.equal(hc.tallTop.max, 230 - DIM.ceilingGap);
    assert.equal(hc.doStropa.tallTop, 228);

    const r = setCeiling(cfg, 999);
    const [, max] = limitsFor(cfg.layout).ceiling;
    assert.equal(r.value, max);
    assert.equal(r.cfg.ceiling, max);
    assert.ok(r.warning && /Visina stropa može biti/.test(r.warning));
    const low = setCeiling(kitchen({ ceiling: 300, heights: { mode: "custom", upper: 120, tallTop: 290 } }), 240);
    assert.ok(low.ok);
    assert.ok(low.warning && /ne stan/.test(low.warning));
    assert.equal(setCeiling(cfg, Number.NaN).ok, false);
  });
});
