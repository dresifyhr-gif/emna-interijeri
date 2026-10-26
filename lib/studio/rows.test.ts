/**
 * Review round "napravi sve što misliš": every row has a "+" (seams that make room with several elements, or replace
 * one), one shared cover panel between columns standing side by side, the planner's own sink / hob never pushed out by a
 * wider column (fuzz seed 2016), stable pairing of elements in baseShift, no cabinets sliding when an insert leaves a
 * sliver of bare floor, the "+" at a run's end saying how much longer the kitchen got, and cfg.tall without a switch.
 * (The default-kitchen seams themselves: gaps.test.ts.)
 *
 *   npx tsx --test lib/studio/rows.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog, moduleDef } from "./catalog";
import { changeType, gapOptions, insertAfter, insertAtGap, insertBefore, isEdited, remove, removeColumn, resetAll, setKitchenExtent, slotEditInfo } from "./edit";
import { kitchenRange, limitsFor, planGaps, planKitchen, sanitizeConfig, tallCapacity, wallsFor, type KitchenPlan } from "./plan";
import { decodeConfig, encodeConfig } from "./share";
import { DEFAULT_CONFIG, type CabinetSpec, type KitchenConfig, type Layout, type WallId } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const T = (type: string, width: number): CabinetSpec => ({ type, width, tall: true });
const B = (type: string, width: number): CabinetSpec => ({ type, width });
/** x of the nth base cabinet / tall unit of a type on a wall (not the wall units) */
const xOf = (p: KitchenPlan, wall: WallId, type: string, nth = 0) => p.slots.filter((s) => s.run === wall && s.zone !== "upper" && s.type === type).sort((a, b) => a.x - b.x)[nth]?.x;
const tallPanels = (p: KitchenPlan, wall: WallId) => p.pieces.filter((x) => x.run === wall && x.kind === "panel" && x.zone === "tall").sort((a, b) => a.x - b.x);

describe("every row has a '+'", () => {
  /** a row with an element no other element can take the place of (a 15 cm niche beside the window …) may have none */
  const impossible = (p: KitchenPlan, id: string) => {
    const l = p.lists.find((x) => x.id === id)!;
    const z = l.zone === "upper" ? "upper" : "base";
    const free = l.zone !== "upper" ? Math.max(0, l.capacity - l.used) : 0;
    return !p.slots
      .filter((s) => s.list?.id === id && s.zone !== "tall" && !s.anchored && !s.corner)
      .some((s) => catalog.modules.some((m) => m.zone === z && !m.spacer && !m.corner && !m.filler && m.widths.some((w) => w <= s.width + free + 0.5 && !(m.id === s.type && Math.abs(w - s.width) < 0.5))));
  };

  it("random edited kitchens: each row with an element gets one, and every element its '+' offers goes in", () => {
    let seed = 20261026;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = <X>(a: readonly X[]) => a[Math.floor(rnd() * a.length)];
    let rows = 0;
    let replaced = 0;
    for (let k = 0; k < 40; k++) {
      const layout = pick(LAYOUTS);
      const lim = limitsFor(layout);
      const w = (id: WallId) => Math.round(lim[id][0] + rnd() * (lim[id][1] - lim[id][0]) * 0.6);
      let c = kitchen({ layout, walls: { a: w("a"), b: w("b"), c: w("c") }, tall: rnd() < 0.7 });
      for (let s = 0; s < 4; s++) {
        const p = planKitchen(c);
        if (rnd() < 0.3) {
          const wall = pick(wallsFor(layout));
          c = setKitchenExtent(c, wall, { length: Math.round(c.walls[wall] * (0.5 + rnd() * 0.5)) }).cfg;
        } else {
          const g = pick(planGaps(p));
          const o = g ? gapOptions(c, g.id) : null;
          const t = o ? pick(o.types.filter((x) => x.fitting?.length)) : undefined;
          if (g && t) c = insertAtGap(c, g.id, t.id, pick(t.fitting!)).cfg;
        }
      }
      const p = planKitchen(c);
      const gaps = planGaps(p);
      for (const l of p.lists.filter((x) => x.zone !== "tall")) {
        const els = p.slots.filter((s) => s.list?.id === l.id);
        if (!els.length || els.every((s) => s.zone === "tall" || s.anchored)) continue;
        rows++;
        assert.ok(gaps.some((g) => g.list === l.id) || impossible(p, l.id), `k${k} ${l.id}: no "+" — ${encodeConfig(c)}`);
      }
      for (const g of gaps.filter((x) => x.kind === "seam")) {
        if (g.replace) replaced++;
        const o = gapOptions(c, g.id)!;
        const t = pick(o.types.filter((x) => x.fitting?.length));
        assert.ok(t, `k${k} ${g.id}: offers something`);
        for (const wd of t.fitting!) {
          const r = insertAtGap(c, g.id, t.id, wd);
          assert.ok(r.ok, `k${k} ${g.id} ${t.id} ${wd}: offered, so it goes in (${r.warning}) — ${encodeConfig(c)}`);
          const q = planKitchen(r.cfg);
          // nothing below 30 cm got narrower, no corner unit or hood changed
          for (const s of q.slots.filter((x) => x.list?.id === g.list && x.id !== r.slotId)) {
            const before = p.slots.find((x) => x.list?.id === g.list && x.type === s.type && x.width === s.width);
            if (!before) assert.ok(s.width >= 30 || moduleDef(g.zone === "upper" ? "upper" : "base", s.type)?.spacer, `k${k} ${g.id}: ${s.id} ${s.width}`);
          }
          assert.deepEqual(
            q.slots.filter((x) => x.corner).map((x) => [x.cornerId, x.x, x.width]),
            p.slots.filter((x) => x.corner).map((x) => [x.cornerId, x.x, x.width]),
            `k${k} ${g.id}: corner units`,
          );
          // a hood stays above its hob (it follows a hob that got narrower); one in the row itself never gets narrower
          for (const h of q.slots.filter((x) => x.anchored)) {
            const c = h.x + h.width / 2;
            assert.ok(q.slots.some((x) => x.run === h.run && x.zone === "base" && moduleDef("base", x.type)?.feature === "hob" && Math.abs(x.x + x.width / 2 - c) < 0.6), `k${k} ${g.id}: hood over a hob`);
            if (g.zone === "upper") assert.ok(p.slots.some((x) => x.anchored && x.run === h.run && x.width === h.width), `k${k} ${g.id}: the hood kept its width`);
          }
        }
      }
    }
    assert.ok(rows > 150 && replaced > 3, `${rows} rows, ${replaced} replace "+"`);
  });

  it("a wall-unit row beside the window whose units the flow would move elsewhere gets no broken '+'", () => {
    // the planner's wall units right of the window over cabinets, bare floor left of it: made explicit they would flow
    // into the stretch left of the window — a "+" there must hang where it is shown, or not be offered
    const c = decodeConfig("2.ravna.495.432.264.260.antracit.mramor.bez.1.240.1.a-114-100-120.ra-l30d60v60l30p60l45f4.t-r60")!;
    for (const g of planGaps(planKitchen(c)).filter((x) => x.list === "a:u")) {
      const o = gapOptions(c, g.id)!;
      for (const t of o.types.filter((x) => x.fitting?.length)) {
        const r = insertAtGap(c, g.id, t.id, t.fitting![0]);
        assert.ok(r.ok, `${g.id} ${t.id}`);
        const s = planKitchen(r.cfg).slots.find((x) => x.id === r.slotId)!;
        assert.ok(s.x + s.width > g.from + 0.5 && s.x < g.to - 0.5, `${g.id} ${t.id}: at ${s.x}, the "+" was at ${g.from}–${g.to}`);
      }
    }
  });
});

describe("one cover panel between two columns standing side by side", () => {
  it("a tall unit in place of the last cabinet before the column at the run's end shares that column's panel", () => {
    const c = kitchen({ layout: "L" });
    const dw = planKitchen(c).slots.find((s) => s.run === "a" && s.type === "perilica")!;
    const r = changeType(c, dw.id, "hladnjak", "tall");
    assert.ok(r.ok, r.warning ?? "");
    const p = planKitchen(r.cfg);
    const fridge = p.slots.find((s) => s.run === "a" && s.list?.id === "a" && s.zone === "tall")!;
    const end = p.runs.find((x) => x.wall === "a")!.talls.find((t) => !p.runs[0].runTalls.includes(t))!;
    assert.equal(fridge.x + fridge.width, end.from, "the fridge stands right against the column's cover panel");
    const panels = tallPanels(p, "a");
    for (let i = 1; i < panels.length; i++) assert.ok(panels[i].x - (panels[i - 1].x + panels[i - 1].width) > 0.5, `two panels side by side @${panels[i].x}`);
    assert.equal(panels.length, 3, "one before the fridge, one each side of the column at the end");
    // its column ends where the end column begins (worktop, wall units and the plinth LED stop there)
    assert.equal(p.runs[0].runTalls[0].to, end.from);
    assert.ok(p.runs[0].worktops.every((w) => w.to <= fridge.x - 1.5));
    // the link carries no more than before (the panel is the planner's business)
    assert.deepEqual(decodeConfig(encodeConfig(r.cfg)), r.cfg);
  });

  it("two columns in a run with only a filler strip between are one column: one panel each side, the strip full height", () => {
    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tall: false, runs: { a: [B("ladice", 60), T("ormar", 60), B("filer", 5), T("ormar", 45), B("ploca", 60), B("sudoper", 60)] } });
    const p = planKitchen(c);
    const r = p.runs[0];
    assert.equal(r.runTalls.length, 1, "one column");
    assert.equal(tallPanels(p, "a").length, 2);
    const strip = p.pieces.find((x) => x.kind === "filler" && x.width === 5)!;
    assert.equal(strip.zone, "tall", "the strip stands in the column, full height");
    assert.equal(r.runTalls[0].to - r.runTalls[0].from, 60 + 5 + 45 + 2 * 2);
  });

  it("with free space between them each keeps its own panel (its side would show)", () => {
    // wall A of an L 450 cm: a sink and a fridge column after it, 70 cm left before the column at the run's end
    const c = kitchen({ layout: "L", walls: { a: 450, b: 220, c: 220 }, runs: { a: [B("sudoper", 80), T("hladnjak", 60)] } });
    const p = planKitchen(c);
    const fridge = p.slots.find((s) => s.run === "a" && s.type === "hladnjak" && s.list?.id === "a")!;
    assert.ok(tallPanels(p, "a").some((x) => Math.abs(x.x - (fridge.x + fridge.width)) < 0.01), "the fridge's own panel on its open side");
  });
});

describe("fuzz seed 2016: a wider column never pushes the planner's own sink / hob out", () => {
  const link = "2.poluotok.578.389.445.260.antracit.mramor.bez.0.312.1.0.ri-l60o20l80p80.ea-l325.tal-om60";
  it("the side-by-side fridge in place of the 60 cm unit is refused with the column's real limit; nothing is lost", () => {
    const c = decodeConfig(link)!;
    const hobs = (p: KitchenPlan) => p.slots.filter((s) => s.run === "a" && moduleDef("base", s.type)?.feature === "hob").length;
    assert.equal(hobs(planKitchen(c)), 1, "wall A has its hob (the island one too)");
    const r = changeType(c, "tall-al-0", "hladnjak-sbs", "tall");
    assert.equal(r.ok, false);
    assert.deepEqual(r.cfg, c);
    assert.match(r.warning ?? "", /može biti najviše \d+ cm/);
    const cap = tallCapacity(c, "tall:a-left");
    assert.ok(cap >= 60 && cap < 96, `capacity ${cap}`);
    const info = slotEditInfo(c, "tall-al-0")!;
    assert.equal(info.types.find((t) => t.id === "hladnjak-sbs")?.width, null, "the editor does not offer it");
    // what it does offer keeps the hob
    for (const t of info.types.filter((x) => x.width !== null && !x.current)) {
      const ok = changeType(c, "tall-al-0", t.id);
      assert.ok(ok.ok, t.id);
      assert.equal(hobs(planKitchen(ok.cfg)), 1, `${t.id}: wall A keeps its hob`);
    }
  });
});

describe("baseShift pairs by identity: neighbours of the same type and width", () => {
  it("a 60 cm oven beside the same oven in a column: the wall unit over the bare floor moves along and stays", () => {
    // smeće 45, smeće 60, a column of one oven, bare floor with a lift-up wall unit over it; one more oven goes in before it
    const c = decodeConfig("2.ravna.299.300.300.260.antracit.mramor.bez.0.240.1.0.ra-k45k60To60.ua-v45f60f60")!;
    const r = insertBefore(c, "a-tall-0", "pecnica", 60, "tall");
    assert.ok(r.ok, r.warning ?? "");
    assert.equal(r.uppersGone ?? 0, 0, "no wall unit was in its way");
    assert.deepEqual(r.cfg.upperRuns?.a, c.upperRuns?.a);
    const p = planKitchen(r.cfg);
    const col = p.runs[0].runTalls[0];
    const over = p.slots.filter((s) => s.zone === "upper" && s.x < col.to && s.x + s.width > col.from);
    assert.deepEqual(over, [], "none over the column");
  });

  it("moving a tall unit past a cabinet of the same width keeps the wall units over the cabinets", () => {
    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tall: false, runs: { a: [B("ladice", 60), T("ormar", 60), B("ladice", 60), B("sudoper", 60), B("ploca", 60)] }, upperRuns: { a: [B("vrata", 60), B("prazno", 64), B("vrata", 60), B("vrata", 60), B("napa", 60)] } });
    const r = changeType(c, "a-tall-0", "ormar");
    assert.ok(r.ok);
    const moved = planKitchen(c).slots.find((s) => s.zone === "tall")!;
    const m = insertAfter(c, moved.id, "ormar", 30, "tall");
    assert.ok(m.ok, m.warning ?? "");
    assert.ok(planKitchen(m.cfg).slots.filter((s) => s.zone === "upper").every((u) => planKitchen(m.cfg).runs[0].runTalls.every((t) => u.x >= t.to - 0.5 || u.x + u.width <= t.from + 0.5)));
  });
});

describe("a sliver of bare floor an insert leaves is absorbed at its end — the cabinets do not slide", () => {
  const owner = () => kitchen({ layout: "L", walls: { a: 380, b: 450, c: 220 }, extents: { b: { length: 300 } }, runs: { b: [T("hladnjak", 60), B("ladice", 60), B("vrata", 60)] } });

  it("a tall unit joining the column beside the bare floor: the kitchen ends at the column, nothing else moves", () => {
    const c = owner();
    const p0 = planKitchen(c);
    for (const w of [30, 40, 45]) {
      const r = insertAtGap(c, "end:b-left", "smocnica", w, "tall");
      assert.ok(r.ok, `${w}: ${r.warning}`);
      const p = planKitchen(r.cfg);
      for (const t of ["hladnjak", "ladice", "vrata"]) assert.equal(xOf(p, "b", t), xOf(p0, "b", t), `${w}: ${t} stays`);
      const rb = p.runs.find((x) => x.wall === "b")!;
      assert.deepEqual(rb.free, [], `${w}: no bare floor left`);
      assert.equal(rb.kitchen.from, xOf(p, "b", "smocnica")! - 2, `${w}: the kitchen starts at the column's panel`);
      assert.equal(kitchenRange(r.cfg, "b").to, 450);
    }
  });

  it("a cabinet put in beside a column with bare floor beyond: a filler strip at that end, the cabinets stay", () => {
    const c = decodeConfig("2.L.439.300.300.260.antracit.mramor.bez.1.240.1.0.ra-Tb45l60l45v60l45.ua-o45o60f60o60")!;
    const p0 = planKitchen(c);
    const r = insertAfter(c, "a-tall-0", "ormar", 45, "tall");
    assert.ok(r.ok, r.warning ?? "");
    const p = planKitchen(r.cfg);
    assert.deepEqual(kitchenRange(r.cfg, "a"), kitchenRange(c, "a"), "the kitchen keeps its length");
    assert.equal(xOf(p, "a", "metle"), xOf(p0, "a", "metle"), "the column's first unit stays");
    // every base cabinet after the new unit moved by exactly its width
    for (const [t, n] of [["ladice", 0], ["ladice", 1], ["vrata", 0], ["ladice", 2]] as const) assert.equal(xOf(p, "a", t, n)! - xOf(p0, "a", t, n)!, 45, `${t}#${n}`);
    assert.deepEqual(r.cfg.runs?.a?.at(-1), B("filer", 23));
  });

  it("a base cabinet into the bare floor at an open end leaves no sliver at the corner end either", () => {
    const c = kitchen({ layout: "L", walls: { a: 380, b: 450, c: 220 }, extents: { b: { length: 300 } }, runs: { b: [B("ladice", 60), B("vrata", 60)] } });
    const p0 = planKitchen(c);
    const g = planGaps(p0).find((x) => x.id === "end:b-left")!;
    const w = [45, 50, 60, 80, 90].find((x) => g.floor! - x > 0 && g.floor! - x < 30)!;
    assert.ok(w, `floor ${g.floor}`);
    const r = insertAtGap(c, g.id, "ladice", w);
    assert.ok(r.ok, r.warning ?? "");
    const p = planKitchen(r.cfg);
    assert.equal(xOf(p, "b", "vrata"), xOf(p0, "b", "vrata"), "the cabinets at the corner stay");
    assert.equal(r.cfg.runs?.b?.[0].type, "filer");
  });
});

describe("the '+' at a run's end says how much longer the kitchen got", () => {
  it("a new column, a unit joining the column at the end, a cabinet beyond it", () => {
    const c = kitchen({ layout: "L", walls: { a: 380, b: 450, c: 220 }, extents: { b: { length: 300 } } });
    const n = insertAtGap(c, "end:b-left", "hladnjak", 60, "tall");
    assert.ok(n.ok);
    assert.match(n.warning ?? "", /^Kuhinja na zidu B duža je za 64 cm\./);
    const a = kitchen({ layout: "L", walls: { a: 400, b: 220, c: 220 }, extents: { a: { length: 320 } } });
    const j = insertAtGap(a, "end:a-right", "smocnica", 30, "tall");
    assert.ok(j.ok);
    assert.match(j.warning ?? "", /Kuhinja na zidu A duža je za 30 cm\./);
    const b = insertAtGap(a, "end:a-right", "ladice", 60);
    assert.ok(b.ok);
    assert.equal((b.warning?.match(/duža je za/g) ?? []).length, 1, "said once");
    // joining a column that stands in the run, beyond the bare floor: the run grows by what the floor does not give
    const r = kitchen({ layout: "L", walls: { a: 380, b: 450, c: 220 }, extents: { b: { length: 260 } }, runs: { b: [T("hladnjak", 60), B("ladice", 60), B("vrata", 60)] } });
    const g = planGaps(planKitchen(r)).find((x) => x.id === "end:b-left")!;
    const rr = insertAtGap(r, g.id, "ormar", 90, "tall");
    assert.ok(rr.ok, rr.warning ?? "");
    assert.match(rr.warning ?? "", new RegExp(`Kuhinja na zidu B duža je za ${90 - g.floor!} cm`));
    // the island's "+" at its end too
    const o = kitchen({ layout: "otok" });
    const gi = planGaps(planKitchen(o)).find((x) => x.id === "isl:left")!;
    const ri = insertAtGap(o, gi.id, "ladice", 60);
    assert.ok(ri.ok, ri.warning ?? "");
    assert.match(ri.warning ?? "", new RegExp(`^Otok je duži za ${ri.cfg.island - o.island} cm\\.`));
  });
});

describe("cfg.tall without a switch", () => {
  it("off, its units and place are dead state: dropped; old links decode to the same kitchen", () => {
    const link = "2.ravna.599.348.464.260.antracit.mramor.bez.0.240.1.0.ra-l60Tr60x26s80d45l60l60p80Tom60v50.t-r60o60.tp-al";
    const c = decodeConfig(link)!;
    assert.equal(c.tall, false);
    assert.equal(c.tallRun, undefined);
    assert.equal(c.tallAt, undefined);
    assert.equal(encodeConfig(c), "2.ravna.599.348.464.260.antracit.mramor.bez.0.240.1.0.ra-l60Tr60x26s80d45l60l60p80Tom60v50");
    assert.ok(!planKitchen(c).slots.some((s) => s.list?.id === "tall"), "no main column, as before");
    assert.equal(kitchen({ tall: false, tallRun: [T("ormar", 60)], tallAt: "a-right" }).tallRun, undefined);
    // on, they stay
    assert.deepEqual(kitchen({ tallRun: [B("ormar", 60)], tallAt: "a-right" }).tallRun, [B("ormar", 60)]);
  });

  it("removeColumn takes a whole column away (main, at another end, in a run); resetAll brings the default one back", () => {
    const d = kitchen({});
    const unit = planKitchen(d).slots.find((s) => s.list?.id === "tall")!;
    const r = removeColumn(d, unit.id);
    assert.ok(r.ok);
    assert.equal(r.cfg.tall, false);
    assert.ok(!planKitchen(r.cfg).slots.some((s) => s.zone === "tall"));
    assert.ok(isEdited(r.cfg), "a removed column is an element edit");
    assert.equal(resetAll(r.cfg).tall, true);
    assert.ok(planKitchen(resetAll(r.cfg)).slots.some((s) => s.list?.id === "tall"));
    // no switch needed to get one back: a tall unit at a seam of the full row, or at a free end of a run
    const seam = planGaps(planKitchen(r.cfg)).find((g) => g.kind === "seam" && g.zone === "base" && gapOptions(r.cfg, g.id)!.tall.some((t) => t.fitting?.length))!;
    assert.ok(seam, "a tall unit can go in");
    // a tallRuns column
    const e = kitchen({ layout: "L", walls: { a: 380, b: 300, c: 220 }, tallRuns: { "b-left": [B("ormar", 60), B("smocnica", 30)] } });
    const eu = planKitchen(e).slots.find((s) => s.list?.id === "tall:b-left")!;
    const er = removeColumn(e, eu.id);
    assert.ok(er.ok);
    assert.equal(er.cfg.tallRuns, undefined);
    // a column in a run (two units, a filler strip between): all of it, the wall units stay where they hang
    const i = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tall: false, runs: { a: [B("ladice", 60), T("ormar", 60), B("filer", 5), T("metle", 30), B("ploca", 60), B("sudoper", 60)] }, upperRuns: { a: [B("vrata", 60), B("prazno", 101), B("vrata", 60)] } });
    const iu = planKitchen(i).slots.find((s) => s.type === "metle")!;
    const ir = removeColumn(i, iu.id);
    assert.ok(ir.ok, ir.warning ?? "");
    assert.deepEqual(ir.cfg.runs?.a, [B("ladice", 60), B("ploca", 60), B("sudoper", 60)]);
    const ux = (c: KitchenConfig) => planKitchen(c).slots.filter((s) => s.zone === "upper" && s.type === "vrata").map((s) => s.x);
    assert.deepEqual(ux(ir.cfg), ux(i), "the wall units stay where they hang");
    // not a tall unit: refused
    assert.equal(removeColumn(d, planKitchen(d).slots.find((s) => s.zone === "base")!.id).ok, false);
    // removing the last unit of the main column the old way ends it the same
    const two = remove(remove(d, "tall-0").cfg, "tall-0");
    assert.equal(two.cfg.tall, false);
  });

  it("a column in a run with the window between it and the wall units beyond: they stay, the column goes (fuzz)", () => {
    // the bare wall the column leaves ends at the window (it used to reach over it: the row overflowed, removal refused)
    const k = "2.ravna.652.521.211.260.antracit.mramor.bez.0.240.1.a-190-65-90.ra-l60Trs96l60s80d60l60lb45f18.ua-n60v60f80v45.ea-l487";
    const c = decodeConfig(k)!;
    const ups = (x: KitchenConfig) => planKitchen(x).slots.filter((s) => s.zone === "upper" && moduleDef("upper", s.type)?.spacer !== true).map((s) => `${s.type}@${s.x}`);
    const col = planKitchen(c).slots.find((s) => s.type === "hladnjak-sbs")!;
    for (const r of [removeColumn(c, col.id), remove(c, col.id)]) {
      assert.ok(r.ok, r.warning ?? "");
      assert.equal(planKitchen(r.cfg).slots.some((s) => s.zone === "tall"), false);
      assert.deepEqual(ups(r.cfg), ups(c), "the wall units stay where they hang");
    }
  });
});

describe("a tall unit in a cabinet's place: the run makes room as a seam '+' does", () => {
  const baseOf = (x: KitchenConfig) =>
    planKitchen(x)
      .slots.filter((s) => s.run === "a" && s.zone !== "upper")
      .sort((p, q) => p.x - q.x);
  const fillers = (x: KitchenConfig) => planKitchen(x).pieces.filter((p) => p.run === "a" && p.kind === "filler" && p.zone !== "upper");

  it("a plain cabinet anywhere in the run before the hob beside it, as little as it can (no 19 cm strip for 2 cm)", () => {
    // ravna 372: the 30 cm unit before the column → a 30 cm tall cabinet needs 2 cm (its own cover panel)
    const c = kitchen({ layout: "ravna", walls: { ...DEFAULT_CONFIG.walls, a: 372 } });
    const last = baseOf(c).filter((s) => s.zone === "base").pop()!;
    const hob = baseOf(c).find((s) => moduleDef("base", s.type)?.feature === "hob")!;
    const r = changeType(c, last.id, "ormar", "tall");
    assert.ok(r.ok, r.warning ?? "");
    const after = baseOf(r.cfg);
    assert.equal(after.find((s) => moduleDef("base", s.type)?.feature === "hob")?.width, hob.width, "the hob keeps its width");
    assert.match(r.warning ?? "", /Za visoki element napravljeno je mjesto: tri ladice sada je 40 cm umjesto 45 cm/);
    for (const f of fillers(r.cfg)) assert.ok(f.width < 10, `no wide strip left over (${f.width} cm)`);
  });

  it("a fridge in place of a 30 cm unit: several cabinets give way (refused before), the note names each", () => {
    for (const a of [370, 372, 376]) {
      const c = kitchen({ layout: "ravna", walls: { ...DEFAULT_CONFIG.walls, a } });
      const last = baseOf(c).filter((s) => s.zone === "base").pop()!;
      const r = changeType(c, last.id, "hladnjak", "tall");
      assert.ok(r.ok, `${a}: ${r.warning}`);
      assert.match(r.warning ?? "", /Za visoki element napravljeno je mjesto, uži su: /);
      const after = baseOf(r.cfg);
      assert.ok(after.some((s) => s.zone === "tall" && s.type === "hladnjak" && s.list?.id === "a"), `${a}: the fridge stands in the run`);
      for (const f of ["sink", "hob", "dishwasher"]) assert.ok(after.some((s) => moduleDef("base", s.type)?.feature === f), `${a}: ${f} kept`);
      for (const s of after) if (s.zone === "base") assert.ok(s.width >= 30, `${a}: ${s.type} ${s.width} cm`);
    }
  });

  it("the run's other cabinets give way for a tall unit at a seam '+' too", () => {
    const c = kitchen({ layout: "ravna", walls: { ...DEFAULT_CONFIG.walls, a: 380 } });
    const g = planGaps(planKitchen(c)).find((x) => x.kind === "seam" && x.list === "a")!;
    const o = gapOptions(c, g.id)!;
    const ormar = o.tall.find((t) => t.id === "ormar")!;
    assert.ok(ormar.fitting?.includes(30), "a 30 cm tall cabinet is offered");
    for (const w of ormar.fitting!) {
      const r = insertAtGap(c, g.id, "ormar", w, "tall");
      assert.ok(r.ok, `${w}: ${r.warning}`);
    }
  });
});

describe("the hood above the hob turned into a wall unit, or removed: the wall units stay where they hang", () => {
  const ups = (x: KitchenConfig, wall: WallId) =>
    planKitchen(x)
      .slots.filter((s) => s.run === wall && s.zone === "upper" && !moduleDef("upper", s.type)?.spacer)
      .sort((p, q) => p.x - q.x)
      .map((s) => s.x);
  it("beside the window, between a column and the window, and on the default kitchens", () => {
    const links = [
      "2.otok.648.493.354.260.antracit.mramor.bez.1.240.1.a-212-151-120",
      "2.otok.348.434.454.260.antracit.mramor.bez.1.240.1.a-236-104-90",
      "2.otok.308.125.598.260.antracit.mramor.bez.1.240.1.a-230-63-120",
      ...LAYOUTS.map((l) => encodeConfig(kitchen({ layout: l }))),
    ];
    for (const k of links) {
      const c = decodeConfig(k)!;
      for (const hood of planKitchen(c).slots.filter((s) => s.anchored && s.zone === "upper")) {
        const before = ups(c, hood.run as WallId);
        const swap = changeType(c, hood.id, "vrata");
        assert.ok(swap.ok, `${k} ${swap.warning}`);
        const placed = planKitchen(swap.cfg).slots.find((s) => s.id === swap.slotId)!;
        assert.ok(Math.abs(placed.x - hood.x) < 5, `${k}: the new unit hangs where the hood did (${placed.x} vs ${hood.x})`);
        const gone = remove(c, hood.id);
        assert.ok(gone.ok, `${k} ${gone.warning}`);
        const rest = before.filter((x) => Math.abs(x - hood.x) > 0.5);
        const now = ups(gone.cfg, hood.run as WallId);
        assert.equal(now.length, rest.length, k);
        now.forEach((x, i) => assert.ok(Math.abs(x - rest[i]) < 5, `${k}: a wall unit moved ${rest[i]} → ${x}`));
      }
    }
  });
});
