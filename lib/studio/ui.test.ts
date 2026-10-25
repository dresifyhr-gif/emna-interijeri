/**
 * Studio UI helpers (components/studio/meta.ts, room.ts) on top of lib/studio/edit.ts: the names the room / kitchen
 * controls use (wall ends, "+" places, the peninsula), what "Cijeli zid" off, the kitchen-length editor, "Podigni strop
 * na X cm" and the bar's length switch do, and that every "+" the studio can show offers something to add.
 *
 *   npx tsx --test lib/studio/ui.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extentRange, fullKitchenWalls, offsetFrom, raiseForTall, shorterBar, shorterKitchen } from "../../components/studio/room";
import { gapPlace, isRoomCorner, islandWord, resetTarget, runName, seatsText, wallEndName } from "../../components/studio/meta";
import { gapOptions, gapsOf, heightChoices, insertAtGap, islandChoices, kitchenExtent, setBar, setKitchenExtent } from "./edit";
import { planKitchen, sanitizeConfig } from "./plan";
import { configFromQuery, encodeConfig } from "./share";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout } from "./types";

const cfgOf = (patch: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...patch });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];

describe("names", () => {
  it("wall ends: room corners by layout, else the plain end", () => {
    assert.equal(wallEndName("L", "a", "left"), "kut sa zidom B");
    assert.equal(wallEndName("L", "a", "right"), "desni kraj zida");
    assert.equal(wallEndName("U", "a", "right", true), "kuta sa zidom C");
    assert.equal(wallEndName("ravna", "a", "left", true), "lijevog kraja zida");
    assert.equal(wallEndName("L", "b", "right"), "kut sa zidom A");
    assert.equal(wallEndName("L", "b", "left"), "lijevi kraj zida");
    assert.equal(wallEndName("U", "c", "left"), "kut sa zidom A");
    // a peninsula stands at the end of wall A's kitchen run, not at an end of the wall
    assert.equal(wallEndName("G", "a", "right"), "desni kraj zida");
    assert.equal(isRoomCorner("G", "a", "left"), true);
    assert.equal(isRoomCorner("poluotok", "a", "right"), false);
  });

  it("the peninsula is named as such", () => {
    assert.equal(islandWord("otok"), "Otok");
    assert.equal(islandWord("poluotok"), "Poluotok");
    assert.equal(runName("isl", "G"), "Poluotok");
    assert.equal(runName("b", "G"), "Zid B");
  });

  it("seats: Croatian plural forms", () => {
    assert.equal(seatsText(0, false), "bez stolica");
    assert.equal(seatsText(1, false), "1 barska stolica");
    assert.equal(seatsText(3, false), "3 barske stolice");
    assert.equal(seatsText(5, false), "5 barskih stolica");
    assert.equal(seatsText(4, true), "4 stolice");
  });

  it("a column of its own resets alone (resetRun of its list removes it)", () => {
    const cfg = configFromQuery({ k: "2.L.380.300.220.260.antracit.mramor.bez.1.240.1.0.eb-l260.tbl-rs96", oblik: null, front: null, top: null });
    const sl = planKitchen(cfg).slots.find((s) => s.list?.id === "tall:b-left");
    assert.ok(sl);
    assert.deepEqual(resetTarget(sl), { run: "tall:b-left" });
    const main = planKitchen(cfg).slots.find((s) => s.list?.id === "tall");
    assert.ok(main);
    assert.deepEqual(resetTarget(main), { run: "tall" });
  });
});

describe("room vs kitchen controls", () => {
  it('"Cijeli zid" off: 60 cm shorter, never below the shortest run; a wall at its shortest cannot', () => {
    const cfg = cfgOf({});
    const b = kitchenExtent(cfg, "b");
    assert.ok(b?.full);
    assert.equal(shorterKitchen(b), 160);
    const r = setKitchenExtent(cfg, "b", { length: shorterKitchen(b) ?? 0 });
    assert.equal(kitchenExtent(r.cfg, "b")?.full, false);
    assert.equal(kitchenExtent(r.cfg, "b")?.length.value, 160);
    // a kitchen as long as its wall is "the whole wall" again — why the switch does not just keep the length
    assert.equal(kitchenExtent(setKitchenExtent(cfg, "b", { length: 220 }).cfg, "b")?.full, true);
    const short = cfgOf({ walls: { a: 380, b: 150, c: 220 } });
    assert.equal(shorterKitchen(kitchenExtent(short, "b")!), 120);
    const min = cfgOf({ walls: { a: 380, b: 120, c: 220 } });
    assert.equal(shorterKitchen(kitchenExtent(min, "b")!), null);
  });

  it("the length editor: switching the end measured from keeps the kitchen where it is", () => {
    const cfg = setKitchenExtent(cfgOf({ walls: { a: 380, b: 450, c: 220 } }), "b", { length: 300 }).cfg;
    const e = kitchenExtent(cfg, "b")!;
    assert.deepEqual(e.kitchen, extentRange(450, e.anchor, e.offset.value, e.length.value));
    const other = e.anchor === "left" ? "right" : "left";
    const off = offsetFrom(450, e.kitchen, other);
    assert.deepEqual(extentRange(450, other, off, e.length.value), e.kitchen);
    const moved = setKitchenExtent(cfg, "b", { anchor: other, offset: off, length: e.length.value });
    assert.deepEqual(kitchenExtent(moved.cfg, "b")?.kitchen, e.kitchen);
  });

  it("phone labels: the walls whose kitchen takes the whole wall", () => {
    assert.deepEqual(fullKitchenWalls(planKitchen(cfgOf({}))), ["a", "b"]);
    const k = setKitchenExtent(cfgOf({}), "b", { length: 160 }).cfg;
    assert.deepEqual(fullKitchenWalls(planKitchen(k)), ["a"]);
  });
});

describe('"Podigni strop na X cm"', () => {
  it("raises the ceiling just enough and the tall column with it, in one edit", () => {
    const cfg = cfgOf({});
    const t = heightChoices(cfg).tallTop;
    assert.equal(t.max, 257);
    assert.match(t.maxReason, /strop 260 cm/);
    const r = raiseForTall(cfg, 275);
    assert.ok(r);
    assert.equal(r.ceiling, 278);
    assert.equal(r.result.cfg.ceiling, 278);
    assert.equal(r.result.cfg.heights?.mode, "custom");
    assert.equal(Math.round(planKitchen(r.result.cfg).heights.tallTop), 275);
    assert.match(r.notes.join(" "), /Strop je podignut na 278 cm/);
    // the link carries it
    assert.equal(encodeConfig(configFromQuery({ k: encodeConfig(r.result.cfg), oblik: null, front: null, top: null })), encodeConfig(r.result.cfg));
  });

  it("a wish above what any ceiling allows ends at the highest ceiling", () => {
    const cfg = cfgOf({});
    const top = heightChoices(cfg).tallTop.ceilingMax;
    const r = raiseForTall(cfg, top + 40);
    assert.ok(r);
    assert.equal(r.result.cfg.ceiling, top + 3);
    assert.equal(Math.round(planKitchen(r.result.cfg).heights.tallTop), top);
  });
});

describe('"+" places', () => {
  it("every gap the studio can show has a name and something that fits", () => {
    const cfgs: KitchenConfig[] = [];
    for (const layout of LAYOUTS) {
      cfgs.push(cfgOf({ layout }));
      const walls = layout === "L" || layout === "G" ? (["a", "b"] as const) : layout === "U" ? (["a", "b", "c"] as const) : (["a"] as const);
      for (const w of walls) {
        const base = cfgOf({ layout, walls: { a: 480, b: 420, c: 420 } });
        const e = kitchenExtent(base, w);
        if (e) cfgs.push(setKitchenExtent(base, w, { length: e.length.min + 20 }).cfg);
      }
    }
    let seen = 0;
    for (const cfg of cfgs) {
      for (const g of gapsOf(cfg)) {
        seen++;
        const name = gapPlace(g, cfg.layout);
        assert.match(name, /^(Zid [ABC]|Otok|Poluotok) · /);
        const o = gapOptions(cfg, g.id);
        assert.ok(o, g.id);
        const fit = [...o.types, ...o.tall].filter((t) => t.width !== null && (t.fitting?.length ?? 0) > 0);
        assert.ok(fit.length > 0, `${cfg.layout} ${g.id}: nothing fits`);
        // what the picker offers first works
        const t = fit[0];
        const r = insertAtGap(cfg, g.id, t.id, t.width ?? undefined, o.types.includes(t) ? undefined : "tall");
        assert.ok(r.ok, `${cfg.layout} ${g.id} ${t.id}: ${r.warning}`);
        assert.ok(r.slotId && planKitchen(r.cfg).slots.some((s) => s.id === r.slotId), `${g.id}: the new element is selected`);
      }
    }
    assert.ok(seen >= 10, `only ${seen} gaps`);
  });

  it("a run's free end offers tall units, the side-by-side fridge among them", () => {
    const cfg = configFromQuery({ k: "2.L.380.300.220.260.antracit.mramor.bez.1.240.1.0.eb-l160", oblik: null, front: null, top: null });
    const g = gapsOf(cfg).find((x) => x.kind === "end");
    assert.ok(g);
    assert.equal(gapPlace(g, cfg.layout), "Zid B · lijevi kraj");
    const o = gapOptions(cfg, g.id);
    assert.ok(o?.tall.some((t) => t.id === "hladnjak-sbs" && t.width === 96));
  });
});

describe("island panel", () => {
  it('"Cijelom duljinom" off gives a bar clearly shorter than the island, which the planner keeps', () => {
    for (const layout of ["otok", "poluotok", "G"] as Layout[]) {
      const cfg = setBar(cfgOf({ layout }), { kind: "raised" }).cfg;
      const c = islandChoices(cfg);
      assert.ok(c);
      assert.equal(c.bar.length.value, null);
      const len = shorterBar(c.bar);
      assert.ok(len >= c.bar.length.min && len <= c.bar.length.max - 20, `${layout}: ${len}`);
      const r = setBar(cfg, { length: len });
      const b = islandChoices(r.cfg)?.bar;
      assert.equal(b?.length.value, len);
      assert.equal(Math.round((b?.plan?.to ?? 0) - (b?.plan?.from ?? 0)), len);
    }
  });
});
