/**
 * The studio's 2D view helpers (lib/studio/drawings/view.ts, svgFrame): every element of a drawing has a hit area (the
 * floor plan: every floor element on top, the wall units under them; an elevation: every element of its run), every "+"
 * of a drawing has its place (on the floor plan inside the empty space it stands for), and svgFrame tells where toSVG puts
 * the drawing. Every layout and random kitchens. Pure: no DOM.
 *
 *   npx tsx --test lib/studio/drawing-view.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog } from "./catalog";
import { changeType, gapOptions, insertAtGap } from "./edit";
import { drawingGaps, drawingHits, elevation, floorPlan, isEmpty, planRunXf, svgFrame, toSVG, type Box, type Drawing, type ElevationId } from "./drawings";
import { isSpacer } from "./drawings/common";
import { DIM, limitsFor, planGaps, planKitchen, sanitizeConfig, wallsFor, type KitchenPlan } from "./plan";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout, type WallId } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const finiteBox = (b: Box) => [b.x0, b.y0, b.x1, b.y1].every(Number.isFinite) && !isEmpty(b);
const inside = (p: readonly [number, number], b: Box, tol = 0.6) => p[0] >= b.x0 - tol && p[0] <= b.x1 + tol && p[1] >= b.y0 - tol && p[1] <= b.y1 + tol;

/** every invariant of the 2D view's helpers on one plan */
function check(p: KitchenPlan, where: string): void {
  // ---- the floor plan: every element but the empty wall-unit spaces (not drawn there); wall units under the rest
  const fp = floorPlan(p);
  const hits = drawingHits(p, fp);
  const refs = hits.map((h) => h.ref);
  assert.equal(new Set(refs).size, refs.length, `${where} tlocrt: an element twice`);
  for (const s of p.slots) {
    if (s.zone === "upper" && isSpacer(s)) continue;
    assert.ok(refs.includes(s.id), `${where} tlocrt: ${s.id} (${s.type}) has no hit area`);
  }
  let seenTop = false;
  for (const h of hits) {
    assert.ok(finiteBox(h.box), `${where} tlocrt ${h.ref}: box`);
    assert.equal(h.under, h.zone === "upper", `${where} tlocrt ${h.ref}: only wall units are under`);
    // paint order: the ones under first
    if (!h.under) seenTop = true;
    else assert.ok(!seenTop, `${where} tlocrt: ${h.ref} under after one on top`);
    const tag = fp.tags.find((t) => t.ref === h.ref);
    if (tag) assert.ok(inside([tag.box.x0, tag.box.y0], h.box) && inside([tag.box.x1, tag.box.y1], h.box), `${where} tlocrt ${h.ref}: the tag's box is in it`);
  }
  // ---- the floor plan's "+": every gap of a floor row and of the island, an empty space's inside its element
  const fg = drawingGaps(p, fp);
  for (const g of planGaps(p)) {
    const at = fg.get(g.id);
    if (g.zone === "upper") {
      assert.equal(at, undefined, `${where} tlocrt: a wall unit's "+" ${g.id}`);
      continue;
    }
    assert.ok(at && Number.isFinite(at[0]) && Number.isFinite(at[1]), `${where} tlocrt: "+" ${g.id}`);
    if (g.kind === "free" && g.slotId) {
      const h = hits.find((x) => x.ref === g.slotId);
      assert.ok(h && inside(at, h.box, 1), `${where} tlocrt: "+" ${g.id} inside its empty space ${g.slotId}`);
    }
  }
  // the run frames put a floor element's middle into its own footprint
  for (const s of p.slots.filter((x) => x.zone !== "upper")) {
    const m = planRunXf(p, s.run);
    assert.ok(m, `${where}: ${s.run} has a frame`);
    const h = hits.find((x) => x.ref === s.id);
    const c: [number, number] = [m.a * (s.x + s.width / 2) + m.c * -(DIM.baseDepth / 2) + m.e, m.b * (s.x + s.width / 2) + m.d * -(DIM.baseDepth / 2) + m.f];
    assert.ok(h && inside(c, h.box, 1), `${where} tlocrt: ${s.id}'s middle is in its footprint`);
  }

  // ---- the elevations: every element of the run, its "+" on the wall
  const ids: ElevationId[] = [...wallsFor(p.cfg.layout), ...(p.island ? (["isl", "isl-straga"] as const) : [])];
  for (const id of ids) {
    const d = elevation(p, id);
    assert.ok(d, `${where}: ${id}`);
    const eh = drawingHits(p, d);
    const er = new Set(eh.map((h) => h.ref));
    assert.equal(er.size, eh.length, `${where} ${d.id}: an element twice`);
    const run = id === "isl-straga" ? null : id;
    if (run) for (const s of p.slots.filter((x) => x.run === run && !isSpacer(x))) assert.ok(er.has(s.id), `${where} ${d.id}: ${s.id} (${s.type}) has no hit area`);
    for (const h of eh) {
      assert.ok(finiteBox(h.box), `${where} ${d.id} ${h.ref}: box`);
      assert.ok(!h.under, `${where} ${d.id}: nothing is under on an elevation`);
    }
    const eg = drawingGaps(p, d);
    if (!run) {
      assert.equal(eg.size, 0, `${where} ${d.id}: no "+" on the seating side`);
      continue;
    }
    const L = run === "isl" ? (p.island?.length ?? 0) : p.cfg.walls[run as WallId];
    for (const g of planGaps(p).filter((x) => x.run === run)) {
      const at = eg.get(g.id);
      assert.ok(at, `${where} ${d.id}: "+" ${g.id}`);
      assert.ok(at[0] >= -40 && at[0] <= L + 40 && at[1] >= 0 && at[1] <= p.ceiling, `${where} ${d.id}: "+" ${g.id} at ${at}`);
    }
    assert.equal(eg.size, planGaps(p).filter((x) => x.run === run).length, `${where} ${d.id}: only its run's "+"`);
  }
}

describe("2D view helpers: every layout", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: default, window, "do stropa", corner units, empty spaces`, () => {
      check(planKitchen(kitchen({ layout })), layout);
      const wall = wallsFor(layout)[wallsFor(layout).length - 1];
      check(planKitchen(kitchen({ layout, window: { wall, offset: 30, width: 90, sill: 105 } })), `${layout} window`);
      check(planKitchen(kitchen({ layout, heights: { mode: "do-stropa" }, ceiling: 290 })), `${layout} do stropa`);
      if (layout !== "ravna") check(planKitchen(kitchen({ layout, corners: { "base-l": "kutni-l", "upper-l": "kutni-dijagonalni-staklo" } })), `${layout} shaped corners`);
      // an empty space in the base row and in the wall-unit row (their "+" stand inside them)
      let c = kitchen({ layout });
      for (const [zone, type] of [["base", "slobodno"], ["upper", "prazno"]] as const) {
        const s = planKitchen(c).slots.find((x) => x.zone === zone && !x.corner && x.options.includes(type));
        const r = s ? changeType(c, s.id, type) : null;
        assert.ok(r?.ok, `${layout}: an empty space in the ${zone} row`);
        c = r.cfg;
      }
      const pe = planKitchen(c);
      assert.ok(planGaps(pe).filter((g) => g.kind === "free").length >= 2, `${layout}: the empty spaces have their "+"`);
      check(pe, `${layout} empty spaces`);
    });
  }
});

describe("2D view helpers: random kitchens", () => {
  it("edited runs, tall units, filled gaps, islands", () => {
    let seed = 20261027;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = <X>(a: readonly X[]) => a[Math.floor(rnd() * a.length)];
    const TALL = catalog.modules.filter((m) => m.zone === "tall" && !m.spacer).map((m) => m.id);
    for (let k = 0; k < 30; k++) {
      const layout = pick(LAYOUTS);
      const lim = limitsFor(layout);
      const w = (id: WallId) => Math.round(lim[id][0] + rnd() * (lim[id][1] - lim[id][0]) * 0.7);
      let c = kitchen({
        layout,
        walls: { a: w("a"), b: w("b"), c: w("c") },
        tall: rnd() < 0.7,
        ...(rnd() < 0.3 ? { islandSpec: { functions: pick(["none", "hob", "sink", "both"] as const), depth: pick([60, 90, 120]), ...(rnd() < 0.4 ? { bar: { kind: pick(["raised", "table"] as const) } } : {}) } } : {}),
      });
      for (let e = 0; e < 6; e++) {
        const p = planKitchen(c);
        const r = rnd();
        if (r < 0.45) {
          const s = pick(p.slots.filter((x) => x.options.length > 1 && !x.anchored));
          const t = s ? pick(s.options) : null;
          const res = s && t ? changeType(c, s.id, t) : null;
          if (res?.ok) c = res.cfg;
        } else if (r < 0.65) {
          const s = pick(p.slots.filter((x) => x.zone === "base" && !x.corner && x.run !== "isl"));
          const res = s ? changeType(c, s.id, pick(TALL), "tall") : null;
          if (res?.ok) c = res.cfg;
        } else {
          const g = pick(planGaps(p));
          const o = g ? gapOptions(c, g.id) : null;
          const t = o ? pick(o.types.filter((x) => x.fitting?.length)) : undefined;
          const res = g && t ? insertAtGap(c, g.id, t.id, pick(t.fitting!)) : null;
          if (res?.ok) c = res.cfg;
        }
      }
      check(planKitchen(c), `k${k} ${layout}`);
    }
  });
});

describe("2D view helpers: svgFrame", () => {
  it("is where toSVG puts the drawing: its paper size at any scale, the drawing inside it", () => {
    const p = planKitchen(kitchen({ layout: "U", islandSpec: {}, window: { wall: "a", offset: 120, width: 100, sill: 100 } }));
    const all: Drawing[] = [floorPlan(p), ...(["a", "b", "c"] as const).map((w) => elevation(p, w)!)];
    for (const d of all) {
      for (const opts of [{}, { scale: 13.7, title: false, margin: 2.5, textSize: 2.8 }, { fit: { width: 277, height: 170 } }, { scale: 3.1, labels: "both" as const, title: false }]) {
        const f = svgFrame(d, opts);
        const r = toSVG(d, opts);
        assert.equal(f.scale, r.scale, `${d.id}: scale`);
        assert.ok(Math.abs(f.width - r.width) < 1e-6 && Math.abs(f.height - r.height) < 1e-6, `${d.id}: paper ${f.width}×${f.height} vs ${r.width}×${r.height}`);
        // the geometry lies on the paper, inside its margin
        const X = (x: number) => (x - f.box.x0) * f.s + f.margin;
        const Y = (y: number) => (f.box.y1 - y) * f.s + f.margin;
        assert.ok(X(d.bounds.x0) >= f.margin - 1e-6 && X(d.bounds.x1) <= f.width - f.margin + 1e-6, `${d.id}: x on the paper`);
        assert.ok(Y(d.bounds.y1) >= f.margin - 1e-6 && Y(d.bounds.y0) <= f.height - f.margin - (opts.title === false ? 0 : 11) + 1e-6, `${d.id}: y on the paper`);
        // a primitive's point lands where toSVG draws it (the first line of the drawing)
        const ln = d.prims.find((x) => x.t === "line");
        if (ln && ln.t === "line") {
          const m = new RegExp(`<line x1="([-\\d.]+)" y1="([-\\d.]+)"`).exec(r.svg);
          assert.ok(m, `${d.id}: a line`);
          assert.ok(Math.abs(Number(m[1]) - X(ln.a[0])) < 0.02 && Math.abs(Number(m[2]) - Y(ln.a[1])) < 0.02, `${d.id}: line at ${m[1]},${m[2]} vs ${X(ln.a[0])},${Y(ln.a[1])}`);
        }
      }
    }
  });
});
