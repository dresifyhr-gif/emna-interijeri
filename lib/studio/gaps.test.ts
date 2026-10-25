/**
 * The wall "+" round: a "+" on the wall wherever a wall unit can go (beside the window, over bare floor, beyond the
 * kitchen at a free end of the wall-unit row), every "+" offering at least one element (plan.ts planGaps lists only
 * those — edit.ts registers the check), a left-out tall column never blocking a "+", the kitchen label measuring the
 * cabinets (RunPlan.cabinets), end panels hugging the last real wall unit, the engine's labels through a rebuild and
 * after an element edit, and no two faces of different materials in one plane (they would flicker). A full row gets
 * one "+" between two of its elements (kind "seam": a neighbour gets narrower).
 *
 *   npx tsx --test lib/studio/gaps.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { SBS, catalog } from "./catalog";
import { gapOptions, gapsOf, insertAfter, insertAtGap, insertBefore, insertOptions, kitchenExtent, remove, setKitchenExtent, tallPlaces } from "./edit";
import { buildKitchen, syncKitchenLabels, type KitchenEnv } from "./engine/kitchen";
import { GeoCache } from "./engine/geo";
import { GAP_LABEL, kitchenRange, limitsFor, planGaps, planKitchen, sanitizeConfig, wallsFor, type KitchenPlan, type PlanGap } from "./plan";
import { DEFAULT_CONFIG, type HandleStyle, type KitchenConfig, type Layout, type WallId } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const LABELS = new Set<string>(Object.values(GAP_LABEL));
/** the owner's wall B: 450 cm, two cabinets at the corner end, bare floor at the open end */
const ownerB = () => kitchen({ layout: "L", walls: { a: 300, b: 450, c: 220 }, runs: { b: [{ type: "ladice", width: 60 }, { type: "vrata", width: 60 }] } });
const gapOf = (c: KitchenConfig, id: string) => planGaps(planKitchen(c)).find((g) => g.id === id);
const slotOf = (c: KitchenConfig, id: string | null) => planKitchen(c).slots.find((s) => s.id === id);
/** what the picker offers first (as GapLayer does) inserts, and the new element exists */
function firstInsertWorks(c: KitchenConfig, g: PlanGap): string | null {
  const o = gapOptions(c, g.id);
  if (!o) return "gone";
  const fit = [...o.types, ...o.tall].filter((t) => t.width !== null && (t.fitting?.length ?? 0) > 0);
  if (!fit.length) return "nothing fits";
  const t = fit[0];
  const r = insertAtGap(c, g.id, t.id, t.width ?? undefined, o.types.includes(t) ? undefined : "tall");
  if (!r.ok) return `${t.id}: ${r.warning}`;
  return slotOf(r.cfg, r.slotId) ? null : "no new element";
}

describe('wall "+"', () => {
  it("over bare floor: a wall unit goes next to the wall units, the floor under it stays bare", () => {
    const c = ownerB();
    const g = gapOf(c, "upend:b-left");
    assert.ok(g, planGaps(planKitchen(c)).map((x) => x.id).join(", "));
    assert.equal(g.zone, "upper");
    assert.equal(g.label, GAP_LABEL.upper);
    const H = planKitchen(c).heights;
    assert.equal(g.at.y, (H.upperBottom + H.upperTop) / 2, "mid wall-unit height");
    assert.equal(g.at.z, 1, "on the wall");
    const o = gapOptions(c, g.id)!;
    assert.ok(o.types.some((t) => t.id === "vrata" && t.width === 60));
    assert.ok(!o.types.some((t) => t.id === "napa" && (t.fitting?.length ?? 0) > 0), "no hood away from the hob");
    assert.deepEqual(o.tall, []);
    const r = insertAtGap(c, g.id, "vrata", 60);
    assert.ok(r.ok, r.warning ?? "");
    const p = planKitchen(r.cfg);
    const sl = p.slots.find((s) => s.id === r.slotId)!;
    assert.equal(sl.zone, "upper");
    assert.ok(sl.x + sl.width > g.from && sl.x < g.to, `on the bare wall: ${sl.x}`);
    assert.deepEqual(r.cfg.runs?.b, c.runs?.b, "the base cabinets stay as they were");
    assert.deepEqual(kitchenRange(r.cfg, "b"), kitchenRange(c, "b"));
  });

  it("beyond the kitchen: the kitchen grows into the bare wall, its base cabinets stay (bare floor under the new unit)", () => {
    const c = setKitchenExtent(kitchen({ layout: "L", walls: { a: 380, b: 300, c: 220 } }), "b", { length: 180 }).cfg;
    const g = gapOf(c, "upend:b-left")!;
    assert.ok(g && (g.outside ?? 0) >= 100, JSON.stringify(g));
    const base0 = planKitchen(c).slots.filter((s) => s.run === "b" && s.zone === "base").map((s) => [s.type, s.width, s.x]);
    const r = insertAtGap(c, g.id, "polica", 60);
    assert.ok(r.ok, r.warning ?? "");
    const k1 = kitchenRange(r.cfg, "b");
    assert.ok(k1.to - k1.from > 180, `grown: ${JSON.stringify(k1)}`);
    const p = planKitchen(r.cfg);
    // the same cabinets; made explicit they close up to the corner (the planner's filler there, < 30 cm, goes)
    const base1 = p.slots.filter((s) => s.run === "b" && s.zone === "base").map((s) => [s.type, s.width, s.x] as const);
    assert.deepEqual(
      base1.map(([t, w]) => [t, w]),
      base0.map(([t, w]) => [t, w]),
      "base cabinets unchanged",
    );
    base1.forEach(([, , x], i) => assert.ok(Math.abs(x - Number(base0[i][2])) < 30, `${x} vs ${base0[i][2]}`));
    const run = p.runs.find((x) => x.wall === "b")!;
    assert.ok(run.free.some((f) => f.side === "left"), "bare floor under the new wall unit");
    const sl = p.slots.find((s) => s.id === r.slotId)!;
    assert.equal(sl.type, "polica");
    assert.ok(sl.x < kitchenRange(c, "b").from, "beyond the old kitchen");
    // the kitchen label measures the cabinets, the extent editor still knows the room the kitchen reserves
    const e = kitchenExtent(r.cfg, "b")!;
    assert.ok(e.cabinets && e.cabinets.from > e.kitchen.from, JSON.stringify(e));
  });

  it("beside a window: the bare wall the wall units leave there takes a narrow niche", () => {
    const c = kitchen({ layout: "ravna", window: { wall: "a", offset: 120, width: 100, sill: 110 } });
    const g = planGaps(planKitchen(c)).find((x) => x.zone === "upper" && x.from < 120 && x.to > 90);
    assert.ok(g, planGaps(planKitchen(c)).map((x) => `${x.id} ${x.from}-${x.to}`).join(", "));
    const o = gapOptions(c, g.id)!;
    assert.ok(o.types.some((t) => t.id === "nisa" && t.fitting?.includes(20)));
    assert.ok(insertAtGap(c, g.id, "nisa", 20).ok);
  });

  it("a hood is offered only above a hob without one", () => {
    const c = kitchen({ layout: "ravna", walls: { a: 360, b: 220, c: 220 } });
    const p = planKitchen(c);
    const hood = p.slots.find((s) => s.zone === "upper" && s.type === "napa")!;
    const other = p.slots.find((s) => s.zone === "upper" && s.type !== "napa" && !s.corner)!;
    const noHood = remove(c, hood.id).cfg;
    const g = planGaps(planKitchen(noHood)).find((x) => x.kind === "free" && x.zone === "upper" && x.hob)!;
    assert.ok(g, "the bare wall above the hob");
    assert.ok(gapOptions(noHood, g.id)!.types.some((t) => t.id === "napa" && (t.fitting?.length ?? 0) > 0));
    assert.ok(insertAtGap(noHood, g.id, "napa", hood.width).ok);
    const elsewhere = planGaps(planKitchen(remove(c, other.id).cfg)).find((x) => x.kind === "free" && x.zone === "upper")!;
    assert.ok(!elsewhere.hob);
    assert.ok(!insertAtGap(remove(c, other.id).cfg, elsewhere.id, "napa", 60).ok);
  });

  it("default kitchens are unchanged: no free place on the walls (only the joints of full rows), the island grows at its ends", () => {
    for (const layout of LAYOUTS) {
      const gaps = planGaps(planKitchen(kitchen({ layout })));
      assert.ok(gaps.every((g) => g.kind === "island" || g.kind === "seam"), `${layout}: ${gaps.map((g) => g.id).join(", ")}`);
    }
  });
});

describe('a full row: "+" between its elements (the owner: "nema na zidu plus da dodam novi element")', () => {
  it("every default kitchen has a '+' on the wall: between two wall units, one of them gets narrower", () => {
    for (const layout of LAYOUTS) {
      const c = kitchen({ layout });
      const p = planKitchen(c);
      const seams = planGaps(p).filter((g) => g.kind === "seam");
      assert.ok(seams.some((g) => g.zone === "upper"), `${layout}: ${planGaps(p).map((g) => g.id).join(", ")}`);
      for (const g of seams) {
        assert.equal(g.label, g.zone === "upper" ? GAP_LABEL.upper : GAP_LABEL.base);
        assert.ok(g.maxWidth >= 30, `${layout} ${g.id}: ${g.maxWidth}`);
        assert.ok(g.split && g.split <= g.maxWidth);
        const [l, r] = g.between!.map((id) => p.slots.find((s) => s.id === id)!);
        assert.ok(Math.abs(l.x + l.width - r.x) < 0.5 && g.at.x === r.x, `${g.id}: at the joint`);
        assert.equal(g.at.z, (g.zone === "upper" ? 35 : 60) + 0.5, "on the fronts");
        assert.equal(firstInsertWorks(c, g), null, `${layout} ${g.id}`);
        // what the picker starts with goes in between the two, the others keep their widths
        const o = gapOptions(c, g.id)!;
        const t = o.types.find((x) => (x.fitting ?? []).includes(30))!;
        const res = insertAtGap(c, g.id, t.id, 30);
        assert.ok(res.ok, `${layout} ${g.id}: ${res.warning}`);
        const q = planKitchen(res.cfg);
        const row = q.slots.filter((s) => s.list?.id === g.list).sort((m, n) => m.x - n.x);
        const at = row.findIndex((s) => s.id === res.slotId);
        assert.ok(at > 0 && at < row.length - 1, `${g.id}: between two elements`);
        assert.equal(row[at - 1].type, l.type);
        assert.equal(row[at + 1].type, r.type);
        const before = p.slots.filter((s) => s.list?.id === g.list).sort((m, n) => m.x - n.x);
        assert.equal(row.length, before.length + 1);
        const narrower = before.filter((s, i) => row[i < at ? i : i + 1].width !== s.width);
        assert.ok(narrower.length <= 1 && narrower.every((s) => s.id === l.id || s.id === r.id), `${g.id}: only a neighbour gets narrower`);
        if (narrower.length) assert.match(res.warning ?? "", /napravljeno je mjesto: .* sada je \d+ cm umjesto \d+ cm/);
      }
    }
  });

  it("only rows with no other '+'; never beside a corner unit, and a hood never gets narrower", () => {
    // the owner's wall B has bare floor (its own "+"): no joints there; wall A is full
    const p = planKitchen(ownerB());
    const gaps = planGaps(p);
    assert.ok(!gaps.some((g) => g.kind === "seam" && g.run === "b"), gaps.map((g) => g.id).join(", "));
    for (const c of [...LAYOUTS.map((layout) => kitchen({ layout })), kitchen({ layout: "U", walls: { a: 400, b: 350, c: 350 } })]) {
      const q = planKitchen(c);
      const lists = planGaps(q)
        .filter((x) => x.kind === "seam")
        .map((x) => x.list);
      assert.equal(new Set(lists).size, lists.length, `one "+" per full row: ${lists.join(", ")}`);
      for (const g of planGaps(q).filter((x) => x.kind === "seam")) {
        const pair = g.between!.map((id) => q.slots.find((s) => s.id === id)!);
        assert.ok(pair.every((s) => !s.corner), `${g.id}: beside a corner unit`);
        const o = gapOptions(c, g.id)!;
        for (const t of o.types.filter((x) => x.width !== null)) {
          const r = insertAtGap(c, g.id, t.id, t.width!);
          if (!r.ok) continue;
          const hood0 = q.slots.find((s) => s.anchored);
          const hood1 = planKitchen(r.cfg).slots.find((s) => s.anchored);
          if (hood0) assert.equal(hood1?.width, hood0.width, `${g.id} ${t.id}: the hood kept its width`);
        }
      }
    }
  });

  it("a plain cabinet gives way before the sink; base runs use their free cm first", () => {
    const c = kitchen({ layout: "ravna", walls: { a: 304, b: 220, c: 220 }, tall: false, runs: { a: [{ type: "sudoper", width: 80 }, { type: "ladice", width: 60 }, { type: "perilica", width: 60 }, { type: "ploca", width: 60 }, { type: "ladice", width: 40 }] } });
    const g = planGaps(planKitchen(c)).find((x) => x.kind === "seam" && x.zone === "base" && x.index === 1)!;
    assert.ok(g, planGaps(planKitchen(c)).map((x) => x.id).join(", "));
    const r = insertAtGap(c, g.id, "vrata", 30);
    assert.ok(r.ok, r.warning ?? "");
    const list = r.cfg.runs?.a ?? [];
    assert.deepEqual(list.slice(0, 3).map((e) => `${e.type}:${e.width}`), ["sudoper:80", "vrata:30", "ladice:30"]);
  });
});

describe('every "+" offers something', () => {
  // a deterministic sample of edited kitchens: extents, removed elements, windows, tall columns
  let seed = 4242;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pick = <T>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)];
  const cfgs: KitchenConfig[] = [];
  for (let n = 0; n < 70; n++) {
    const layout = pick(LAYOUTS);
    const lim = limitsFor(layout);
    const w = (id: WallId) => Math.round(lim[id][0] + rnd() * (lim[id][1] - lim[id][0]));
    let c = kitchen({
      layout,
      walls: { a: w("a"), b: w("b"), c: w("c") },
      tall: rnd() < 0.7,
      window: rnd() < 0.5 ? { wall: pick(wallsFor(layout)), offset: Math.round(rnd() * 200), width: 60 + Math.round(rnd() * 100), sill: pick([90, 110, 140]) } : null,
    });
    for (let s = 0; s < 5; s++) {
      if (rnd() < 0.4) {
        const wall = pick(wallsFor(layout));
        c = setKitchenExtent(c, wall, { length: Math.round(c.walls[wall] * (0.4 + rnd() * 0.6)), offset: Math.round(rnd() * 100) }).cfg;
      } else {
        const sl = pick(planKitchen(c).slots.filter((x) => x.list));
        if (sl) c = remove(c, sl.id).cfg;
      }
    }
    cfgs.push(c);
  }

  it("each gap has a label and an element that fits; the first one the picker offers inserts", () => {
    let wall = 0;
    for (const c of cfgs) {
      for (const g of gapsOf(c)) {
        assert.ok(LABELS.has(g.label), g.label);
        if (g.zone === "upper") wall++;
        const why = firstInsertWorks(c, g);
        assert.equal(why, null, `${g.id}: ${why} — ${JSON.stringify(c)}`);
      }
    }
    assert.ok(wall >= 20, `only ${wall} wall gaps`);
  });

  it("a tall column left out never blocks the end of its run: it stays left out, with a note", () => {
    // 150 of 186 cm: the side-by-side niche at the left end does not fit; 15 cm more would let it stand again and push the
    // cabinets out — the cabinet asked for wins, the column is taken out of the config (the customer adds it back)
    const c = kitchen({ layout: "ravna", walls: { a: 186, b: 314, c: 301 }, tallRuns: { "a-left": [{ type: "hladnjak-sbs", width: SBS.niche }] }, extents: { a: { length: 150 } } });
    assert.ok(planKitchen(c).warnings.some((x) => /Visoki stup uz zid A \(lijevi kraj\) ne stane/.test(x)));
    const g = gapOf(c, "end:a-right")!;
    assert.ok(g, "the run's end is offered");
    const r = insertAtGap(c, g.id, "boce", 15);
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /ostaje izostavljen/);
    assert.equal(r.cfg.tallRuns?.["a-left"], undefined);
    assert.ok(slotOf(r.cfg, r.slotId));
  });

  it("the island / peninsula never offers a tall column (tall columns stand at the ends of wall runs)", () => {
    for (const layout of ["otok", "poluotok", "G"] as Layout[]) {
      const c = kitchen({ layout });
      for (const g of gapsOf(c).filter((x) => x.run === "isl")) {
        assert.deepEqual(gapOptions(c, g.id)!.tall, []);
        assert.equal(insertAtGap(c, g.id, "hladnjak", 60, "tall").ok, false);
      }
      assert.ok(tallPlaces(c).every((p) => !p.end.startsWith("isl")));
    }
  });
});

describe("review round: what a '+' says and where it stands", () => {
  /** the owner's case as the studio makes it: L 300 / room B 450 / kitchen B 300 at the corner */
  const owner = () => kitchen({ layout: "L", walls: { a: 300, b: 450, c: 220 }, extents: { b: { length: 300 } } });

  it("the end of a run names what it really offers: no tall unit once a wall unit hangs over the bare floor there", () => {
    const c = owner();
    assert.equal(gapOf(c, "end:b-left")?.label, GAP_LABEL.baseOrTall);
    const r = insertAtGap(c, "upend:b-left", "vrata", 60);
    assert.ok(r.ok, r.warning ?? "");
    const g = gapOf(r.cfg, "end:b-left")!;
    assert.ok(g, "the end '+' is still there");
    const o = gapOptions(r.cfg, g.id)!;
    assert.ok(!o.tall.some((t) => (t.fitting?.length ?? 0) > 0), "nothing tall fits under the new wall unit");
    assert.equal(g.label, GAP_LABEL.base, "so the '+' does not promise one");
    for (const layout of LAYOUTS)
      for (const x of gapsOf(kitchen({ layout, walls: { a: 420, b: 360, c: 360 }, extents: { a: { length: 300 }, b: { length: 250 }, c: { length: 250 } } }))) {
        if (x.kind !== "end") continue;
        const ox = gapOptions(kitchen({ layout, walls: { a: 420, b: 360, c: 360 }, extents: { a: { length: 300 }, b: { length: 250 }, c: { length: 250 } } }), x.id)!;
        const tall = ox.tall.some((t) => (t.fitting?.length ?? 0) > 0);
        const base = ox.types.some((t) => (t.fitting?.length ?? 0) > 0);
        assert.equal(x.label, base && tall ? GAP_LABEL.baseOrTall : tall ? GAP_LABEL.tall : GAP_LABEL.base, `${layout} ${x.id}`);
      }
  });

  it("bare wall between wall units: the '+' stands in the opening between their fronts, not on the wall behind them", () => {
    // U with shortened side runs: the planner's wall units on B stop short of the corner unit (bare wall between them)
    const c = kitchen({ layout: "U", walls: { a: 400, b: 350, c: 350 }, extents: { b: { length: 200 }, c: { length: 250 } } });
    const inner = gapsOf(c).filter((g) => g.id.startsWith("up:"));
    assert.ok(inner.length > 0, gapsOf(c).map((g) => g.id).join(", "));
    for (const g of inner) assert.ok(g.at.z > 20, `${g.id}: z ${g.at.z}`);
  });

  it("a base cabinet added beyond a tall column joins the cabinets and says the column moved", () => {
    let c = owner();
    const sbs = insertAtGap(c, "end:b-left", "hladnjak-sbs", undefined, "tall");
    assert.ok(sbs.ok, sbs.warning ?? "");
    c = sbs.cfg;
    const g = gapOf(c, "end:b-left");
    assert.ok(g?.tallList, "the end '+' stands beyond the side-by-side column");
    const r = insertAtGap(c, g!.id, "ladice", 45);
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /visoki stup pomaknut/);
  });
});

describe('a full run: "+ lijevo / + desno" make room', () => {
  it("the element beside it gets narrower (widest that leaves enough), with a note; the row keeps its length", () => {
    const c = sanitizeConfig(DEFAULT_CONFIG);
    const p0 = planKitchen(c);
    const sel = p0.slots.find((s) => s.run === "a" && s.zone === "upper" && s.width >= 80 && !s.corner && !s.anchored)!;
    assert.ok(sel, "a wide wall unit on wall A");
    const o = insertOptions(c, sel.id, "after").filter((t) => (t.fitting?.length ?? 0) > 0);
    assert.ok(o.length > 0, "something can be added next to it although the row is full");
    const r = insertAfter(c, sel.id, "vrata", 30);
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /napravljeno je mjesto/);
    const row = (p: KitchenPlan) => p.slots.filter((s) => s.run === "a" && s.zone === "upper");
    const p1 = planKitchen(r.cfg);
    const end = (p: KitchenPlan) => Math.max(...row(p).map((s) => s.x + s.width));
    assert.ok(end(p1) <= end(p0) + 6.5, "the row does not get longer than its free room");
    assert.equal(row(p1).length, row(p0).length + 1);
    const narrowed = p1.slots.find((s) => s.run === "a" && s.zone === "upper" && Math.abs(s.x - sel.x) < 0.5)!;
    assert.ok(narrowed.width < sel.width && narrowed.type === sel.type, `${narrowed.type} ${narrowed.width}`);
  });

  it("next to the last cabinet before bare wall the kitchen grows (as the end '+' does), nothing gets narrower", () => {
    const c = kitchen({ layout: "L", walls: { a: 300, b: 450, c: 220 }, extents: { b: { length: 300 } } });
    const p = planKitchen(c);
    // wall B's open end is its left end (run-local x = 0): the first base cabinet there
    const first = p.slots.filter((s) => s.run === "b" && s.zone === "base" && !s.corner).sort((x, y) => x.x - y.x)[0];
    const r = insertBefore(c, first.id, "ladice", 60);
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /duža je za 60 cm/);
    assert.doesNotMatch(r.warning ?? "", /napravljeno je mjesto/);
    const k0 = kitchenRange(c, "b");
    const k1 = kitchenRange(r.cfg, "b");
    assert.equal(k1.to - k1.from, k0.to - k0.from + 60);
    const old = planKitchen(r.cfg).slots.find((s) => s.run === "b" && s.zone === "base" && Math.abs(s.x - first.x) < 0.5);
    assert.equal(old?.width, first.width, "the cabinet beside it keeps its width");
  });

  it("a corner unit, the hood above the hob and the tall column never shrink", () => {
    const c = sanitizeConfig(DEFAULT_CONFIG);
    for (const s of planKitchen(c).slots.filter((x) => x.corner || x.anchored || x.zone === "tall")) {
      for (const side of ["before", "after"] as const) {
        for (const t of insertOptions(c, s.id, side)) {
          for (const w of t.fitting ?? []) {
            const r = (side === "after" ? insertAfter : insertBefore)(c, s.id, t.id, w);
            if (r.ok) assert.doesNotMatch(r.warning ?? "", /napravljeno je mjesto/, `${s.id} ${side} ${t.id} ${w}`);
          }
        }
      }
    }
  });
});

describe("plan details", () => {
  it("RunPlan.cabinets: the kitchen without its bare floor", () => {
    const run = planKitchen(ownerB()).runs.find((r) => r.wall === "b")!;
    const free = run.free.find((f) => f.side === "left")!;
    assert.deepEqual(run.cabinets, { from: free.to, to: run.kitchen.to });
    for (const layout of LAYOUTS) for (const r of planKitchen(kitchen({ layout })).runs) assert.deepEqual(r.cabinets, r.kitchen, layout);
  });

  it("an end panel closes the last real wall unit, not the empty space beyond it", () => {
    const c = kitchen({ layout: "ravna", tall: false, window: { wall: "a", offset: 150, width: 100, sill: 110 } });
    const p = planKitchen(c);
    const last = p.slots.filter((s) => s.zone === "upper").sort((x, y) => y.x - x.x)[0];
    const q = planKitchen(remove(c, last.id).cfg);
    const empty = q.slots.find((s) => s.type === "prazno")!;
    const panels = q.pieces.filter((x) => x.zone === "upper" && x.kind === "panel");
    const real = q.slots.filter((s) => s.zone === "upper" && s.type !== "prazno").sort((x, y) => y.x - x.x)[0];
    assert.ok(panels.some((x) => Math.abs(x.x - (real.x + real.width)) < 0.01), "a panel right after the last wall unit");
    assert.ok(!panels.some((x) => Math.abs(x.x - (empty.x + empty.width)) < 0.01), "none floating at the end of the empty space");
  });
});

// ---------------------------------------------------------------- headless engine

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
  const el = (): unknown => {
    const attrs = new Map<string, string>();
    return {
      style: {} as Record<string, string>,
      dataset: {} as Record<string, string>,
      classList: { add() {} },
      textContent: "",
      className: "",
      append() {},
      appendChild() {},
      addEventListener() {},
      removeEventListener() {},
      setAttribute: (k: string, v: string) => attrs.set(k, String(v)),
      getAttribute: (k: string) => attrs.get(k) ?? null,
    };
  };
  return { createElement: el, createElementNS: el } as unknown as Document;
}

const engineEnv = (handles: HandleStyle = "letvica", labels = false, instantLabels = false): KitchenEnv => ({
  mats: stubMaterials(),
  geos: new GeoCache(),
  doc: (labels ? fakeDocument() : undefined) as never,
  fronts: { base: "antracit", upper: "antracit", tall: "kasmir", island: "hrast" },
  topId: "mramor",
  handles,
  plinth: "crna",
  labels,
  tempo: "quick",
  instantLabels,
});

describe("engine labels (headless)", () => {
  const kitchenLabels = (p: KitchenPlan, instant = false) => {
    const K = buildKitchen(engineEnv("letvica", true, instant), p);
    return { K, labels: K.labels.filter((l) => l.kind === "kitchen" && l.wall !== "isl") };
  };

  it("a kitchen label equal to the room's wall is hidden; with bare floor it measures the cabinets", () => {
    const { K, labels } = kitchenLabels(planKitchen(kitchen({ layout: "L" })));
    K.timeline.finish();
    assert.ok(labels.length === 2 && labels.every((l) => l.holder && !l.holder.visible), "default L: both hidden");
    const p = planKitchen(ownerB());
    const b = kitchenLabels(p).labels.find((l) => l.wall === "b")!;
    const cab = p.runs.find((r) => r.wall === "b")!.cabinets!;
    assert.ok(b.holder?.visible);
    assert.equal(Number(b.el.dataset.cm), Math.round(cab.to - cab.from));
    assert.ok(Math.abs(b.group.position.x - cab.from / 100) < 1e-6, "starts at the first cabinet");
  });

  it("after an element edit the kitchen label follows the cabinets (syncKitchenLabels)", () => {
    const c = ownerB();
    const p0 = planKitchen(c);
    const { K, labels } = kitchenLabels(p0);
    const b = labels.find((l) => l.wall === "b")!;
    const first = p0.slots.filter((s) => s.run === "b" && s.zone === "base" && s.list).sort((x, y) => x.x - y.x)[0];
    const p1 = planKitchen(remove(c, first.id).cfg);
    assert.ok(syncKitchenLabels(K, p1));
    const cab = p1.runs.find((r) => r.wall === "b")!.cabinets!;
    assert.equal(Number(b.el.dataset.cm), Math.round(cab.to - cab.from));
    assert.ok(Math.abs(b.group.position.x - cab.from / 100) < 1e-6);
    assert.equal(syncKitchenLabels(K, p1), false, "nothing more to do");
  });

  it("rebuilding in the studio: the labels are there from the first frame", () => {
    const p = planKitchen(ownerB());
    const late = buildKitchen(engineEnv("letvica", true, false), p);
    late.timeline.apply(0);
    assert.ok(late.labels.every((l) => l.el.style.opacity === "0"), "the intro reveals them after the assembly");
    const now = buildKitchen(engineEnv("letvica", true, true), p);
    now.timeline.apply(0);
    assert.ok(now.labels.every((l) => l.el.style.opacity === "1" && l.obj.visible && l.group.visible), "instant");
  });

  it("the studio frames the whole room: every wall over its whole length, the floor labels in front", () => {
    const c = setKitchenExtent(kitchen({ layout: "L", walls: { a: 380, b: 450, c: 220 } }), "b", { length: 200 }).cfg;
    const K = buildKitchen(engineEnv(), planKitchen(c));
    K.root.updateMatrixWorld(true);
    const run = K.runs.get("b")!;
    for (const x of [0, 4.5]) assert.ok(K.frame.containsPoint(run.group.localToWorld(new THREE.Vector3(x, 1, 0.1))), `B at ${x} m`);
    assert.ok(K.frame.containsBox(K.box));
  });
});

describe("no flickering faces (headless)", () => {
  it("no two faces of different materials lie in one plane facing the same way", () => {
    const base = catalog.modules.filter((m) => m.zone === "base" && !m.corner && !m.spacer);
    const upper = catalog.modules.filter((m) => m.zone === "upper" && !m.corner && !m.spacer);
    const w60 = (m: { widths: readonly number[] }) => (m.widths.includes(60) ? 60 : m.widths[0]);
    const cfgs: KitchenConfig[] = [];
    for (const handles of ["bez", "utor", "letvica"] as HandleStyle[]) {
      for (let i = 0; i < base.length; i += 5) {
        cfgs.push(
          kitchen({
            layout: "ravna",
            walls: { a: 600, b: 220, c: 220 },
            handles,
            tall: false,
            runs: { a: base.slice(i, i + 5).map((m) => ({ type: m.id, width: w60(m) })) },
            upperRuns: { a: upper.slice(i % upper.length, (i % upper.length) + 4).map((m) => ({ type: m.id, width: w60(m) })) },
          }),
        );
      }
      cfgs.push(kitchen({ layout: "ravna", handles, tallRun: [{ type: "hladnjak-sbs", width: SBS.niche }, { type: "metle", width: 50 }, { type: "hladnjak", width: 60 }] }));
      cfgs.push(kitchen({ layout: "poluotok", handles, window: { wall: "a", offset: 100, width: 100, sill: 100 }, islandSpec: { bar: { kind: "raised" } } }));
      cfgs.push(kitchen({ layout: "U", handles, corners: { "base-l": "kutni-l", "upper-l": "kutni-dijagonalni" } }));
    }
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    const e1 = new THREE.Vector3();
    const e2 = new THREE.Vector3();
    for (const cfg of cfgs) {
      const K = buildKitchen(engineEnv(cfg.handles), planKitchen(cfg));
      K.timeline.finish();
      K.root.updateMatrixWorld(true);
      const buckets = new Map<string, { mesh: number; mat: string; lo: number[]; hi: number[] }[]>();
      let mi = 0;
      K.root.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh) return;
        const mat = (me.material as THREE.Material).name;
        if (/shadow|glass|dim|fridgeLight|led/i.test(mat)) return;
        const id = mi++;
        const pos = me.geometry.getAttribute("position");
        if (!pos) return;
        const idx = me.geometry.getIndex();
        const cnt = idx ? idx.count : pos.count;
        for (let t = 0; t < cnt; t += 3) {
          const [i0, i1, i2] = idx ? [idx.getX(t), idx.getX(t + 1), idx.getX(t + 2)] : [t, t + 1, t + 2];
          a.fromBufferAttribute(pos, i0).applyMatrix4(me.matrixWorld);
          b.fromBufferAttribute(pos, i1).applyMatrix4(me.matrixWorld);
          c.fromBufferAttribute(pos, i2).applyMatrix4(me.matrixWorld);
          n.crossVectors(e1.subVectors(b, a), e2.subVectors(c, a));
          if (n.length() < 1e-9) continue;
          n.normalize();
          const ax = [0, 1, 2].find((k) => Math.abs(n.getComponent(k)) > 0.999);
          if (ax === undefined) continue;
          const u = (ax + 1) % 3;
          const v = (ax + 2) % 3;
          const key = `${ax}${n.getComponent(ax) > 0 ? "+" : "-"}${Math.round(a.getComponent(ax) * 20000)}`;
          let bk = buckets.get(key);
          if (!bk) buckets.set(key, (bk = []));
          bk.push({
            mesh: id,
            mat,
            lo: [Math.min(a.getComponent(u), b.getComponent(u), c.getComponent(u)), Math.min(a.getComponent(v), b.getComponent(v), c.getComponent(v))],
            hi: [Math.max(a.getComponent(u), b.getComponent(u), c.getComponent(u)), Math.max(a.getComponent(v), b.getComponent(v), c.getComponent(v))],
          });
        }
      });
      for (const list of buckets.values()) {
        for (let i = 0; i < list.length; i++) {
          for (let j = i + 1; j < list.length; j++) {
            const p = list[i];
            const q = list[j];
            if (p.mesh === q.mesh || p.mat === q.mat) continue;
            const ou = Math.min(p.hi[0], q.hi[0]) - Math.max(p.lo[0], q.lo[0]);
            const ov = Math.min(p.hi[1], q.hi[1]) - Math.max(p.lo[1], q.lo[1]);
            assert.ok(!(ou > 0.003 && ov > 0.003), `${p.mat} × ${q.mat} in one plane (${cfg.layout}, ${cfg.handles})`);
          }
        }
      }
    }
  });
});
