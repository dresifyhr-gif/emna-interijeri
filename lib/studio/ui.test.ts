/**
 * Studio UI helpers (components/studio/meta.ts, room.ts, addModel.ts, tallSwap.ts) on top of lib/studio/edit.ts: the
 * names the room / kitchen controls use (wall ends, "+" places, the peninsula), what "Cijeli zid" off, the kitchen-length
 * editor, "Podigni strop na X cm" and the bar's length switch do, that every "+" the studio can show offers something to
 * add, that what the add picker offers first (its first tile at the preselected width) can be added, and tall units
 * standing in a base run as the UI shows them (their row, the question before "Zamijeni" takes another element away,
 * the way back to a base cabinet).
 *
 *   npx tsx --test lib/studio/ui.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extentRange, offsetFrom, raiseForTall, shorterBar, shorterKitchen } from "../../components/studio/room";
import { addItems, addModel, bestWidth, gapStretch, widthFor, type AddZone } from "../../components/studio/addModel";
import { gapPlace, isInRunTall, isRoomCorner, islandWord, noRoomText, resetTarget, rowOf, rowSlots, runName, seatsText, slotPlace, wallEndName } from "../../components/studio/meta";
import { baseChoices, elementsWord, swapQuestion, tallSwap } from "../../components/studio/tallSwap";
import { moduleDef } from "./catalog";
import { changeType, gapOptions, gapsOf, heightChoices, insertAtGap, islandChoices, kitchenExtent, remove, setBar, setKitchenExtent, slotEditInfo } from "./edit";
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

describe("add picker", () => {
  const zoneOf = (z: string): AddZone => (z === "upper" ? "upper" : z === "island" ? "island" : "base");

  it("the preselected width fills the free place when it can, else 60 cm", () => {
    const ws = [30, 40, 45, 50, 60, 80, 90, 100, 120];
    assert.equal(bestWidth(ws, 45), 45);
    assert.equal(bestWidth(ws, 47), 45);
    assert.equal(bestWidth(ws, 90), 90);
    assert.equal(bestWidth(ws, 150), 60);
    assert.equal(bestWidth(ws, null), 60);
    assert.equal(bestWidth([30, 40], null), 40);
    assert.equal(bestWidth([], 60), null);
  });

  it("a tile takes the chosen width when its type comes in it, else the nearest below", () => {
    const t = { id: "perilica", name: "Perilica posuđa", description: "", group: "voda" as const, widths: [45, 60], width: 60, current: false, fitting: [45, 60] };
    assert.equal(widthFor({ t, tall: false }, 45), 45);
    assert.equal(widthFor({ t, tall: false }, 90), 60);
    assert.equal(widthFor({ t, tall: false }, 30), 45);
    assert.equal(widthFor({ t, tall: false }, null), 60);
  });

  it("every '+': six common tiles at most, and the first one at the preselected width goes in", () => {
    const cfgs: KitchenConfig[] = [];
    for (const layout of LAYOUTS) {
      const base = cfgOf({ layout, walls: { a: 480, b: 420, c: 420 } });
      cfgs.push(base);
      const e = kitchenExtent(base, "a");
      if (e) cfgs.push(setKitchenExtent(base, "a", { length: e.length.min + 40 }).cfg);
      // a wall unit taken away: bare wall with a "+"
      const up = planKitchen(base).slots.find((x) => x.zone === "upper" && !x.corner && !x.anchored);
      if (up) {
        const r = remove(base, up.id);
        if (r.ok) cfgs.push(r.cfg);
      }
    }
    let seen = 0;
    for (const cfg of cfgs) {
      for (const g of gapsOf(cfg)) {
        const o = gapOptions(cfg, g.id);
        assert.ok(o, g.id);
        const m = addModel(addItems(o.types, o.tall), zoneOf(g.zone), gapStretch(g));
        assert.ok(m.top.length > 0 && m.top.length <= 6, `${cfg.layout} ${g.id}: ${m.top.length} tiles`);
        assert.equal(m.best === null, m.chips.length === 0, `${g.id}: a width is preselected when there are widths`);
        assert.equal(m.top.length + m.rest.length, m.fit.length);
        const first = m.top[0];
        const w = widthFor(first, m.best);
        assert.ok(w !== null);
        const r = insertAtGap(cfg, g.id, first.t.id, w, first.tall ? "tall" : undefined);
        assert.ok(r.ok, `${cfg.layout} ${g.id} ${first.t.id} ${w}: ${r.warning}`);
        seen++;
      }
    }
    assert.ok(seen >= 10, `only ${seen} gaps`);
  });

  it("bare wall left by a wall unit: its width preselected; above a hob the hood comes first", () => {
    const cfg = cfgOf({});
    const slots = planKitchen(cfg).slots.filter((x) => x.zone === "upper" && !x.corner);
    const plain = slots.find((x) => x.type !== "napa" && x.width >= 60 && x.width <= 90);
    assert.ok(plain);
    const r = remove(cfg, plain.id);
    assert.ok(r.ok);
    const g = gapsOf(r.cfg).find((x) => x.slotId === plain.id);
    assert.ok(g);
    const o = gapOptions(r.cfg, g.id)!;
    assert.equal(addModel(addItems(o.types), "upper", gapStretch(g)).best, plain.width);
    const hood = slots.find((x) => x.type === "napa");
    assert.ok(hood);
    const h = remove(cfg, hood.id);
    const hg = gapsOf(h.cfg).find((x) => x.slotId === hood.id);
    assert.ok(hg?.hob);
    const ho = gapOptions(h.cfg, hg.id)!;
    assert.equal(addModel(addItems(ho.types), "upper", gapStretch(hg)).top[0].t.id, "napa");
  });

  it("a run's free end mixes base cabinets and tall units, the tall ones also under 'Više'", () => {
    const cfg = setKitchenExtent(cfgOf({ walls: { a: 450, b: 300, c: 220 } }), "a", { length: 300 }).cfg;
    const g = gapsOf(cfg).find((x) => x.kind === "end");
    assert.ok(g);
    const o = gapOptions(cfg, g.id)!;
    const m = addModel(addItems(o.types, o.tall), "base", gapStretch(g));
    assert.ok(m.top.some((x) => x.tall) && m.top.some((x) => !x.tall));
    assert.ok(m.groups.some((x) => x.id === "tall" && x.items.every((i) => i.tall)));
    assert.equal(m.best, 60);
  });
});

describe("tall units standing in a base run (the UI)", () => {
  /** L: a 30 cm tall unit at the "+" between wall A's sink and dishwasher */
  const withTall = () => {
    const cfg = cfgOf({ layout: "L" });
    const r = insertAtGap(cfg, "seam:a:2", "ormar", 30, "tall");
    assert.ok(r.ok, r.warning ?? "");
    return { cfg: r.cfg, id: r.slotId! };
  };

  it("is listed in the base row in its place, not in the tall column's row; its reset is the wall's", () => {
    const { cfg, id } = withTall();
    const p = planKitchen(cfg);
    const t = p.slots.find((s) => s.id === id)!;
    assert.equal(t.zone, "tall");
    assert.ok(isInRunTall(t));
    assert.ok(!p.slots.filter((s) => s.list?.id === "tall").some(isInRunTall), "the end columns are not in the run");
    const base = rowSlots(p.slots, "a", "base");
    const i = base.findIndex((s) => s.id === id);
    assert.ok(i > 0 && i < base.length - 1, "between the cabinets");
    for (let k = 1; k < base.length; k++) assert.ok(base[k].x >= base[k - 1].x + base[k - 1].width - 0.5, "left to right, no overlap");
    assert.ok(!rowSlots(p.slots, "a", "tall").some((s) => s.id === id));
    assert.ok(rowSlots(p.slots, "a", "tall").length > 0, "the end column stays in its own row");
    assert.deepEqual(rowOf(t), { run: "a", zone: "base" });
    assert.deepEqual(resetTarget(t), { run: "a", zone: "base" });
    assert.equal(slotPlace(t), "Zid A · visoki");
    assert.doesNotMatch(noRoomText(t, 4), /Visoki stup/);
  });

  it('"Zamijeni": asks only when another element goes, in plain Croatian, and names a lost sink / hob / dishwasher', () => {
    assert.equal(swapQuestion(1, 1), "Ukloniti donji i gornji element i staviti visoki?");
    assert.equal(swapQuestion(1, 2), "Ukloniti donji element i 2 gornja elementa i staviti visoki?");
    assert.equal(swapQuestion(0, 1), "Ukloniti gornji element i staviti visoki?");
    assert.equal(elementsWord(5, "gornji"), "5 gornjih elemenata");
    assert.equal(elementsWord(22, "donji"), "22 donja elementa");
    const cfg = cfgOf({ layout: "L" });
    const p = planKitchen(cfg);
    // a wall unit over the dishwasher: the dishwasher goes too
    const up = p.slots.find((s) => s.run === "a" && s.zone === "upper" && !s.corner && s.x >= 170)!;
    const sw = tallSwap(cfg, p, up, "hladnjak");
    assert.ok(sw.result.ok, sw.result.warning ?? "");
    assert.equal(sw.ask, "Ukloniti donji i gornji element i staviti visoki?");
    assert.deepEqual(sw.essentials, ["perilica posuđa"]);
    assert.match(sw.result.warning ?? "", /Gornji i donji element zamijenjeni visokim elementom/);
    // the same edit as changeType (what the toolbar applies on "Da, zamijeni")
    assert.equal(JSON.stringify(sw.result.cfg), JSON.stringify(changeType(cfg, up.id, "hladnjak", "tall").cfg));
    // a base cabinet with only bare wall above it: nothing else goes — no question
    let bare = cfg;
    for (const id of ["b-upper-2", "b-upper-3"]) bare = remove(bare, id).cfg;
    const pb = planKitchen(bare);
    const b = pb.slots.find((s) => s.id === "b-base-2")!;
    const free = tallSwap(bare, pb, b, "ormar");
    assert.ok(free.result.ok, free.result.warning ?? "");
    assert.equal(free.base, 1);
    assert.equal(free.upper, 0);
    assert.equal(free.ask, null);
  });

  it("every tall unit the studio offers in an element's place goes in, and the question matches what went", () => {
    let seen = 0;
    for (const layout of LAYOUTS) {
      const cfg = cfgOf({ layout });
      const p = planKitchen(cfg);
      for (const s of p.slots.filter((x) => x.run !== "isl" && (x.zone === "base" || x.zone === "upper") && !x.corner)) {
        const info = slotEditInfo(cfg, s.id);
        for (const t of info?.tall.filter((x) => x.width !== null) ?? []) {
          const sw = tallSwap(cfg, p, s, t.id);
          assert.ok(sw.result.ok, `${layout} ${s.id} ${t.id}: ${sw.result.warning}`);
          const after = planKitchen(sw.result.cfg);
          assert.ok(after.slots.some((x) => x.id === sw.result.slotId && x.zone === "tall"), `${layout} ${s.id}: the tall unit is selected`);
          // the core's note says how many wall units went (edit.ts commitTall): the question counts the same
          const w = sw.result.warning ?? "";
          if (/Gornji i donji element zamijenjeni/.test(w) && !/iznad visokog/.test(w)) assert.deepEqual([sw.base, sw.upper], [1, 1], `${layout} ${s.id} ${t.id}: ${w}`);
          const m = /Donji element i (\d+) gornja? elementa? zamijenjeni/.exec(w);
          if (m) assert.equal(sw.upper, Number(m[1]), `${layout} ${s.id} ${t.id}: ${w}`);
          if (sw.ask === null) assert.equal(sw.base + sw.upper, Number(!moduleDefSpacer(s)), `${layout} ${s.id} ${t.id}: nothing else went`);
          seen++;
        }
      }
    }
    assert.ok(seen >= 40, `only ${seen}`);
  });

  it("a tall unit standing in the run can be a base cabinet again", () => {
    const { cfg, id } = withTall();
    const t = planKitchen(cfg).slots.find((s) => s.id === id)!;
    const t0 = performance.now();
    const back = baseChoices(cfg, t);
    assert.ok(performance.now() - t0 < 200, "planned quickly enough for a picker");
    const fit = back.filter((c) => c.width !== null);
    assert.ok(fit.some((c) => c.id === "ladice" || c.id === "vrata"), JSON.stringify(back.map((c) => [c.id, c.width])));
    const r = changeType(cfg, id, fit[0].id);
    assert.ok(r.ok, r.warning ?? "");
    const now = planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)!;
    assert.equal(now.zone, "base");
    assert.equal(now.width, fit[0].width);
    // other slots: nothing to go back to
    assert.deepEqual(baseChoices(cfg, planKitchen(cfg).slots.find((s) => s.zone === "base" && !s.corner)!), []);
  });

  it("a tall unit that fits is always among the common tiles", () => {
    const t = (id: string, group = "ladice") => ({ id, name: id, description: "", group: group as "ladice", widths: [15, 30], width: 15, current: false, fitting: [15] });
    const items = addItems(["ladice", "vrata", "perilica", "smece", "boce", "police", "sudoper"].map((id) => t(id)), [t("smocnica", "visoki")]);
    const m = addModel(items, "base", 15);
    assert.equal(m.top.length, 6);
    assert.equal(m.top[5].t.id, "smocnica");
    assert.ok(m.top[5].tall);
    assert.equal(m.top.length + m.rest.length, m.fit.length);
    assert.ok(!m.rest.some((x) => x.tall));
  });

  it("the add picker at a wall's base '+' between cabinets mixes tall units into the common tiles", () => {
    const cfg = cfgOf({ layout: "L" });
    const g = gapsOf(cfg).find((x) => x.id === "seam:a:2");
    assert.ok(g);
    const o = gapOptions(cfg, g.id)!;
    const m = addModel(addItems(o.types, o.tall), "base", gapStretch(g));
    assert.ok(m.top.some((x) => x.tall), JSON.stringify(m.top.map((x) => x.t.id)));
    const first = m.top.find((x) => x.tall)!;
    const r = insertAtGap(cfg, g.id, first.t.id, widthFor(first, m.best) ?? undefined, "tall");
    assert.ok(r.ok, r.warning ?? "");
  });
});

/** empty space / a filler strip (not a cabinet) */
function moduleDefSpacer(s: { zone: "base" | "upper" | "tall" | "island"; type: string }): boolean {
  const d = moduleDef(s.zone, s.type);
  return Boolean(d?.spacer || d?.filler);
}

