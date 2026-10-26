/**
 * 2D drawings (lib/studio/drawings): the floor plan and the elevations of every layout and of many random kitchens —
 * no NaN anywhere, every element drawn and labelled once per drawing it belongs to, every element inside its wall,
 * dimension chains that add up (the elements of a run to the run, the kitchen and the window to the wall, the heights to
 * the ceiling), every catalogue type at every width and opening style inside its slot, the SVG well formed and to
 * scale, the DXF entity list complete. Pure: no DOM, no three.js.
 *
 *   npx tsx --test lib/studio/drawings.test.ts
 */
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it } from "node:test";
import { catalog } from "./catalog";
import { changeType, gapOptions, insertAtGap, setKitchenExtent } from "./edit";
import {
  DIM_GAP,
  dimValue,
  drawingFinite,
  elementLabels,
  elevation,
  fitScale,
  floorPlan,
  kitchenDrawings,
  paperSize,
  primPoints,
  slotFace,
  toDxfEntities,
  toSVG,
  type Dim,
  type Drawing,
} from "./drawings";
import { DIM, limitsFor, materializeLists, planGaps, planKitchen, sanitizeConfig, wallsFor, type KitchenPlan, type ListId, type PlanSlot } from "./plan";
import { DEFAULT_CONFIG, type HandleStyle, type KitchenConfig, type Layout, type WallId } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const HANDLES: HandleStyle[] = ["bez", "letvica", "gumb", "utor", "push", "luft"];
const EPS = 0.51;

const sum = (ds: Dim[]) => ds.reduce((a, d) => a + dimValue(d), 0);
const chainOf = (d: Drawing, suffix: string) => d.dims.filter((x) => x.chain?.endsWith(`:${suffix}`));
const near = (a: number, b: number, tol = 0.01) => Math.abs(a - b) <= tol;

/** every invariant of a plan's drawings; `where` names the kitchen in failures */
function checkDrawings(p: KitchenPlan, where: string): { plan: Drawing; elevations: Drawing[] } {
  const d = kitchenDrawings(p);
  const all = [d.plan, ...d.elevations];
  const labels = elementLabels(p);
  // labels: unique, every element has one
  assert.equal(new Set(labels.values()).size, labels.size, `${where}: unique labels`);
  for (const dr of all) {
    assert.ok(drawingFinite(dr), `${where} ${dr.id}: a NaN / Infinity`);
    assert.ok(dr.prims.length > 0, `${where} ${dr.id}: empty`);
    for (const dm of dr.dims) assert.ok(dimValue(dm) >= 0.04, `${where} ${dr.id} ${dm.chain}: a zero dimension`);
    const refs = dr.tags.map((t) => t.ref);
    assert.equal(new Set(refs).size, refs.length, `${where} ${dr.id}: an element tagged twice`);
    for (const t of dr.tags) assert.equal(t.label, labels.get(t.ref), `${where} ${dr.id}: ${t.ref} has its label`);
  }
  const named = (s: PlanSlot) => labels.has(s.id);

  // ---- the floor plan: every floor element tagged, inside the room
  const A = p.cfg.walls.a;
  const deep = Math.max(...wallsFor(p.cfg.layout).map((w) => (w === "a" ? 0 : p.cfg.walls[w])), 0);
  const floor = p.slots.filter((s) => s.zone !== "upper" && named(s));
  assert.deepEqual(d.plan.tags.map((t) => t.ref).sort(), floor.map((s) => s.id).sort(), `${where}: plan tags`);
  for (const t of d.plan.tags) {
    const s = p.slots.find((x) => x.id === t.ref)!;
    if (s.run === "isl") {
      const m = DIM.islandOverhangMax + 2;
      assert.ok(t.box.x0 >= -m && t.box.x1 <= A + m && t.box.y1 <= EPS, `${where} plan: ${t.ref} ${JSON.stringify(t.box)} off the room`);
    } else {
      assert.ok(t.box.x0 >= -EPS && t.box.x1 <= A + EPS && t.box.y1 <= EPS && t.box.y0 >= -deep - DIM.baseDepth - EPS, `${where} plan: ${t.ref} ${JSON.stringify(t.box)} outside the walls`);
    }
  }
  // the walls' chains add up to the walls
  for (const w of wallsFor(p.cfg.layout)) {
    const len = p.cfg.walls[w];
    const wallDim = d.plan.dims.filter((x) => x.chain === `tlocrt:${w}:zid`);
    assert.equal(wallDim.length, 1, `${where} plan: wall ${w}`);
    assert.ok(near(dimValue(wallDim[0]), len), `${where} plan: wall ${w} ${dimValue(wallDim[0])} ≠ ${len}`);
    for (const k of ["kuhinja", "prozor"]) {
      const c = d.plan.dims.filter((x) => x.chain === `tlocrt:${w}:${k}`);
      if (c.length) assert.ok(near(sum(c), len), `${where} plan ${w} ${k}: ${sum(c)} ≠ ${len}`);
    }
  }
  if (p.island?.kind === "otok") {
    const c = d.plan.dims.filter((x) => x.chain === "tlocrt:otok-polozaj");
    const x0 = p.island.centerX - p.island.length / 2;
    const x1 = p.island.centerX + p.island.length / 2;
    assert.ok(near(sum(c), Math.max(A, x1) - Math.min(0, x0)), `${where}: island position chain`);
    const len = [...c, ...d.plan.dims.filter((x) => x.chain === "tlocrt:otok-duljina")];
    assert.ok(len.some((x) => near(dimValue(x), p.island!.length)), `${where}: the island's length`);
  }

  // ---- the walls' elevations
  for (const r of p.runs) {
    const e = d.elevations.find((x) => x.id === `zid-${r.wall}`);
    assert.ok(e, `${where}: elevation of ${r.wall}`);
    const L = r.length;
    const C = p.ceiling;
    const mine = p.slots.filter((s) => s.run === r.wall && named(s));
    assert.deepEqual(e.tags.map((t) => t.ref).sort(), mine.map((s) => s.id).sort(), `${where} ${e.id}: tags`);
    for (const t of e.tags) {
      assert.ok(t.box.x0 >= -EPS && t.box.x1 <= L + EPS && t.box.y0 >= -EPS && t.box.y1 <= C + EPS, `${where} ${e.id}: ${t.ref} ${JSON.stringify(t.box)} outside the wall ${L} × ${C}`);
    }
    // every element's primitives inside the wall (end units may draw over the run's end panel, still on the wall)
    for (const pr of e.prims) {
      if (!pr.ref || pr.ref.includes(":")) continue;
      for (const q of primPoints(pr)) {
        assert.ok(q[0] >= -EPS && q[0] <= L + EPS && q[1] >= -EPS && q[1] <= C + EPS, `${where} ${e.id}: ${pr.ref} (${pr.layer}) at ${q} outside the wall ${L} × ${C}`);
      }
    }
    const els = chainOf(e, "elementi");
    if (r.cabinets) {
      assert.ok(els.length >= 1, `${where} ${e.id}: element chain`);
      assert.ok(near(sum(els), r.cabinets.to - r.cabinets.from), `${where} ${e.id}: elements ${sum(els)} ≠ cabinets ${r.cabinets.to - r.cabinets.from}`);
      // every element's edges are stops of the chain
      const stops = new Set(els.flatMap((x) => [x.a[0], x.b[0]]).map((v) => Math.round(v * 10)));
      for (const s of p.slots.filter((x) => x.run === r.wall && x.zone !== "upper" && named(x))) {
        // an end unit takes the place of the run's end panel too (PlanSlot.end)
        const pad = s.end?.pad ?? 0;
        for (const v of [s.x - (s.end?.side === "left" ? pad : 0), s.x + s.width + (s.end?.side === "right" ? pad : 0)]) {
          if (v < r.cabinets.from + 0.06 || v > r.cabinets.to - 0.06) continue;
          assert.ok([...stops].some((x) => Math.abs(x - v * 10) <= 1), `${where} ${e.id}: ${s.id} edge ${v} not in the element chain`);
        }
      }
    } else assert.equal(els.length, 0);
    const k = chainOf(e, "kuhinja");
    if (k.length) assert.ok(near(sum(k), L), `${where} ${e.id}: kitchen chain ${sum(k)} ≠ ${L}`);
    const z = chainOf(e, "zid");
    assert.equal(z.length, 1);
    assert.ok(near(dimValue(z[0]), L), `${where} ${e.id}: wall`);
    const v = chainOf(e, "visine");
    assert.ok(near(sum(v), C), `${where} ${e.id}: heights ${sum(v)} ≠ ceiling ${C}`);
    assert.ok(v.some((x) => near(Math.min(x.a[1], x.b[1]), 0) && near(Math.max(x.a[1], x.b[1]), p.heights.plinth)), `${where} ${e.id}: the plinth`);
    for (const x of chainOf(e, "gornji")) assert.ok(x.a[0] >= -EPS && x.b[0] <= L + EPS, `${where} ${e.id}: wall-unit chain inside the wall`);
    const win = p.window && p.window.wall === r.wall ? p.window : null;
    assert.equal(chainOf(e, "prozor").length > 0, Boolean(win), `${where} ${e.id}: window chain`);
    if (win) {
      assert.ok(near(sum(chainOf(e, "prozor")), L), `${where} ${e.id}: window chain`);
      assert.ok(near(sum(chainOf(e, "prozor-visina")), C), `${where} ${e.id}: window heights`);
    }
  }

  // ---- the island / peninsula
  if (p.island) {
    const I = p.island;
    for (const id of ["isl", "isl-straga"] as const) {
      const e = elevation(p, id);
      assert.ok(e && d.elevations.some((x) => x.id === e.id), `${where}: island elevation ${id}`);
      assert.ok(near(sum(chainOf(e, "elementi")), I.length), `${where} ${e.id}: chain ${sum(chainOf(e, "elementi"))} ≠ ${I.length}`);
      const v = chainOf(e, "visine");
      assert.ok(near(Math.max(...v.flatMap((x) => [x.a[1], x.b[1]])), Math.max(I.hood || I.kind === "poluotok" ? p.ceiling : 0, p.heights.worktop, I.bar && (id === "isl-straga" || I.bar.kind === "raised") ? I.bar.height : 0)), `${where} ${e.id}: heights`);
      for (const t of e.tags) assert.ok(t.box.x0 >= -EPS && t.box.x1 <= I.length + EPS, `${where} ${e.id}: ${t.ref} on the island`);
      if (id === "isl") assert.deepEqual(e.tags.map((t) => t.ref).sort(), p.slots.filter((s) => s.run === "isl" && named(s)).map((s) => s.id).sort(), `${where}: island tags`);
      else assert.equal(e.tags.length, 0);
    }
  } else assert.equal(elevation(p, "isl"), null);
  return d;
}

// ---------------------------------------------------------------- every layout

describe("drawings: every layout", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: default, window, "do stropa", every opening style`, () => {
      checkDrawings(planKitchen(kitchen({ layout })), layout);
      const wall = wallsFor(layout)[wallsFor(layout).length - 1];
      checkDrawings(planKitchen(kitchen({ layout, window: { wall, offset: 30, width: 90, sill: 105 } })), `${layout} window`);
      checkDrawings(planKitchen(kitchen({ layout, heights: { mode: "do-stropa" }, ceiling: 290 })), `${layout} do stropa`);
      checkDrawings(planKitchen(kitchen({ layout, heights: { mode: "custom", upper: 90, tallTop: 230, worktop: 95 }, ceiling: 270, worktop: { thickness: 2 } })), `${layout} custom`);
      for (const handles of HANDLES) checkDrawings(planKitchen(kitchen({ layout, handles })), `${layout} ${handles}`);
    });
  }

  it("islands and peninsulas: every option", () => {
    const specs: KitchenConfig["islandSpec"][] = [
      { functions: "both", depth: 120, seatSide: "left", overhang: 30, stools: 3 },
      { functions: "hob", depth: 90, bar: { kind: "raised" }, hoodAbove: 75 },
      { functions: "sink", bar: { kind: "table", depth: 80 }, stools: 4, waterfall: false },
      { side: "left", functions: "hob", seatSide: "right" },
      { depth: 100, overhang: 0, hood: false },
    ];
    for (const layout of ["otok", "poluotok", "G"] as Layout[]) {
      for (const islandSpec of specs) {
        for (const hood of [undefined, { island: "kaseta" as const }, { kind: "ploca" as const }]) {
          const c = kitchen({ layout, islandSpec, ...(hood ? { hood } : {}), island: layout === "otok" ? 260 : 220 });
          checkDrawings(planKitchen(c), `${layout} ${JSON.stringify(islandSpec)} ${JSON.stringify(hood)}`);
        }
      }
    }
  });

  it("wall A's corner units keep their whole width in its chain; on B / C the corner stretch is one segment", () => {
    const p = planKitchen(kitchen({ layout: "U" }));
    const a = elevation(p, "a")!;
    const corners = p.slots.filter((s) => s.corner && s.zone === "base");
    assert.equal(corners.length, 2);
    for (const s of corners) assert.ok(chainOf(a, "elementi").some((x) => near(Math.min(x.a[0], x.b[0]), s.x) && near(dimValue(x), s.width)), `${s.id}: ${s.width}`);
    const b = elevation(p, "b")!;
    const r = p.runs.find((x) => x.wall === "b")!;
    assert.ok(chainOf(b, "elementi").some((x) => near(Math.max(x.a[0], x.b[0]), r.length) && near(dimValue(x), 60)), "B: the blind corner's 60 cm");
    // an L-shaped corner unit: 90 cm along B, its second leaf drawn there
    const q = planKitchen(kitchen({ layout: "L", corners: { "base-l": "kutni-l", "upper-l": "kutni-dijagonalni" } }));
    const qb = elevation(q, "b")!;
    const len = q.runs.find((x) => x.wall === "b")!.length;
    assert.ok(chainOf(qb, "elementi").some((x) => near(dimValue(x), 90) && near(Math.max(x.a[0], x.b[0]), len)), "B: the L corner's 90 cm");
    const leaf = qb.prims.filter((x) => x.ref === q.slots.find((s) => s.cornerId === "base-l")!.id && x.layer === "fronta");
    assert.ok(leaf.length > 0, "the corner unit's leaf on wall B");
  });

  it("the floor plan: walls as one outline, window cut into it, island and its distance from wall A", () => {
    const p = planKitchen(kitchen({ layout: "otok", window: { wall: "a", offset: 100, width: 120, sill: 100 }, islandSpec: { functions: "sink" } }));
    const fp = floorPlan(p);
    const walls = fp.prims.filter((x) => x.layer === "zid");
    assert.ok(walls.some((x) => x.t === "poly" && x.noStroke && x.fill === "wall"), "filled walls");
    assert.ok(walls.some((x) => x.t === "line" && x.weight === "heavy"), "their outline");
    assert.ok(fp.prims.some((x) => x.layer === "prozor"), "the window");
    const gap = fp.dims.filter((x) => x.chain === "tlocrt:otok-razmak");
    assert.ok(gap.some((x) => near(dimValue(x), DIM.aisle)), `the aisle (${gap.map(dimValue)})`);
    assert.ok(fp.prims.some((x) => x.layer === "uredaj" && x.ref?.startsWith("isl-")), "the island sink");
    assert.ok(fp.prims.some((x) => x.layer === "sjedenje"), "the stools");
    assert.equal(fp.tags.filter((t) => t.ref.startsWith("isl-")).length, p.slots.filter((s) => s.run === "isl").length);
  });

  it("a bar or a table beyond the island's / peninsula's worktop: the depth chain runs out to its outer edge", () => {
    let beyond = 0;
    for (const layout of ["otok", "poluotok", "G"] as Layout[]) {
      for (const bar of [{ kind: "raised" }, { kind: "table" }, { kind: "table", depth: 80 }, { kind: "raised", depth: 40 }] as const) {
        const p = planKitchen(kitchen({ layout, islandSpec: { bar } }));
        const I = p.island!;
        const B = I.bar!;
        const fp = floorPlan(p);
        const z0 = Math.min(...I.slab.map((r) => r.z0));
        const where = `${layout} ${JSON.stringify(bar)}`;
        if (B.z0 >= Math.min(z0, I.outer) - 2) continue;
        beyond++;
        if (I.kind === "otok") {
          assert.ok(near(sum(fp.dims.filter((x) => x.chain === "tlocrt:otok-razmak")), I.backZ - B.z0), `${where}: from wall A out to the bar`);
        } else {
          const z1 = Math.max(...I.slab.map((r) => r.z1));
          assert.ok(near(sum(fp.dims.filter((x) => x.chain === "tlocrt:poluotok-dubina")), z1 - B.z0), `${where}: the peninsula's depth with its bar`);
        }
      }
    }
    assert.ok(beyond >= 6, `only ${beyond} bars stand beyond the worktop`);
  });

  it("visible hoods, rails, cornices, top boxes and tall units in a run reach the elevations", () => {
    const c = kitchen({ layout: "L", hood: { kind: "dimnjak" }, rails: ["a", "b"], heights: { mode: "do-stropa" }, ceiling: 300, backsplash: { kind: "plocice" } });
    const p = planKitchen(c);
    const d = checkDrawings(p, "hood + rails + do stropa");
    const all = d.elevations.flatMap((e) => e.prims);
    assert.ok(all.some((x) => x.layer === "napa"), "the chimney hood");
    assert.ok(d.elevations.some((e) => e.dims.some((x) => x.chain?.endsWith(":napa"))), "its height above the worktop");
    assert.ok(all.some((x) => x.layer === "obloga" && x.fill === "tile"), "a tiled backsplash");
    assert.ok(p.heights.topRow && all.some((x) => x.t === "poly" && x.layer === "fronta" && primPoints(x).some((q) => near(q[1], p.heights.topRow!.to))), "top boxes");
    const r = p.runs.find((x) => x.rail);
    assert.ok(r && d.elevations.find((e) => e.id === `zid-${r.wall}`)!.prims.some((x) => x.layer === "obloga" && x.weight === "medium"), "the rail");
  });
});

// ---------------------------------------------------------------- every element

describe("drawings: every catalogue element at every width and opening style", () => {
  it("stays inside its slot (its end panel too), with doors / drawers where it has fronts", () => {
    const p = planKitchen(kitchen({ layout: "ravna", heights: { mode: "do-stropa" }, ceiling: 290 }));
    let n = 0;
    for (const m of catalog.modules) {
      if (m.filler) continue;
      const widths = m.widths.length ? m.widths : [m.minWidth];
      for (const width of widths) {
        for (const open of HANDLES) {
          for (const zone of m.zone === "base" ? (["base", "island"] as const) : ([m.zone] as const)) {
            if (zone === "island" && !m.island) continue;
            const corner = m.corner ? (["left", "right"] as const) : ([undefined] as const);
            for (const side of corner) {
              const s: PlanSlot = {
                id: "x",
                zone,
                run: zone === "island" ? "isl" : "a",
                x: 0,
                width: m.corner ? (m.cornerShape && m.cornerShape !== "blind" ? (zone === "upper" ? 60 : 90) : zone === "upper" ? 80 : 110) : width,
                defaultType: m.id,
                type: m.id,
                options: [],
                ...(side ? { corner: side } : {}),
                ...(m.endUnit ? { end: { side: "right" as const, pad: 2 } } : {}),
                opt: { open },
              };
              const f = slotFace(s, { plan: p, hinge: "left", tallHinge: "right" });
              n++;
              const pad = m.endUnit ? 2 : 0;
              for (const pr of f.prims) {
                for (const q of primPoints(pr)) {
                  assert.ok(Number.isFinite(q[0]) && Number.isFinite(q[1]), `${m.zone}/${m.id} ${width}`);
                  assert.ok(q[0] >= -0.01 && q[0] <= s.width + pad + 0.01 && q[1] >= -0.01 && q[1] <= p.ceiling + 0.01, `${m.zone}/${m.id} ${s.width} ${open}: ${q}`);
                }
              }
              assert.ok(f.box.x1 - f.box.x0 > 0 && f.box.y1 > f.box.y0, `${m.id}: a box`);
              if (m.spacer) assert.ok(f.spacer && f.prims.every((x) => x.layer === "prazno"), `${m.id}: dashed`);
              else assert.ok(f.prims.length > 0, `${m.zone}/${m.id}: drawn`);
            }
          }
        }
      }
    }
    assert.ok(n > 1500, `${n} faces`);
  });

  it("drawers, doors and their opening symbols follow the 3D engine", () => {
    const p = planKitchen(kitchen({ layout: "ravna", handles: "letvica" }));
    const slot = (type: string, width: number, zone: PlanSlot["zone"] = "base"): PlanSlot => ({ id: "x", zone, run: "a", x: 0, width, defaultType: type, type, options: [] });
    const fronts = (s: PlanSlot, hinge: "left" | "right" = "left") => slotFace(s, { plan: p, hinge, tallHinge: hinge }).prims;
    const count = (ps: ReturnType<typeof fronts>, layer: string) => ps.filter((x) => x.layer === layer).length;
    // three drawers, one bar handle each, no opening symbol
    const lad = fronts(slot("ladice", 60));
    assert.equal(count(lad, "fronta"), 3);
    assert.equal(count(lad, "rucka"), 3);
    assert.equal(count(lad, "otvaranje"), 0);
    // the hob's top drawer is fixed (no handle)
    assert.equal(count(fronts(slot("ploca", 60)), "rucka"), 2);
    // one door up to 62 cm, two above
    assert.equal(count(fronts(slot("vrata", 60)), "otvaranje"), 1);
    assert.equal(count(fronts(slot("vrata2", 80)), "otvaranje"), 2);
    // the symbol's apex points at the hinge
    const sym = (hinge: "left" | "right") => {
      const pr = fronts(slot("vrata", 50), hinge).find((x) => x.layer === "otvaranje")!;
      assert.equal(pr.t, "poly");
      return pr.t === "poly" ? pr.pts[1][0] : NaN;
    };
    assert.equal(sym("left"), 0);
    assert.equal(sym("right"), 50);
    // a lift-up flap points up, the dishwasher's drop front down
    const flap = fronts(slot("klapna", 60, "upper")).find((x) => x.layer === "otvaranje")!;
    assert.ok(flap.t === "poly" && near(flap.pts[1][1], p.heights.upperTop));
    const pm = fronts(slot("perilica", 60)).find((x) => x.layer === "otvaranje")!;
    assert.ok(pm.t === "poly" && near(pm.pts[1][1], p.heights.plinth));
    // the fridge column: freezer, fridge, top door
    assert.equal(count(fronts(slot("hladnjak", 60, "tall")), "otvaranje"), 3);
    // Gola: a channel under the worktop and no handles
    const gola = planKitchen(kitchen({ layout: "ravna", handles: "bez" }));
    const g = slotFace(slot("ladice", 60), { plan: gola, hinge: "left", tallHinge: "left" }).prims;
    assert.ok(g.some((x) => x.layer === "rucka" && x.fill === "dark"), "the Gola channel");
    assert.ok(!g.some((x) => x.t === "circle" || (x.layer === "rucka" && x.weight === "medium")), "no handles");
  });
});

// ---------------------------------------------------------------- random kitchens

describe("drawings: random kitchens", () => {
  it("edited runs, tall units in runs, columns at run ends, extents, windows, heights, every element type", () => {
    let seed = 20261026;
    const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    const pick = <X>(a: readonly X[]) => a[Math.floor(rnd() * a.length)];
    const TALL = catalog.modules.filter((m) => m.zone === "tall" && !m.spacer).map((m) => m.id);
    let kitchens = 0;
    let elements = 0;
    for (let k = 0; k < 70; k++) {
      const layout = pick(LAYOUTS);
      const lim = limitsFor(layout);
      const w = (id: WallId) => Math.round(lim[id][0] + rnd() * (lim[id][1] - lim[id][0]) * 0.7);
      let c = kitchen({
        layout,
        walls: { a: w("a"), b: w("b"), c: w("c") },
        tall: rnd() < 0.7,
        handles: pick(HANDLES),
        ...(rnd() < 0.4 ? { window: { wall: pick(wallsFor(layout)), offset: Math.round(rnd() * 150), width: 60 + Math.round(rnd() * 100), sill: 95 + Math.round(rnd() * 30) } } : {}),
        ...(rnd() < 0.3 ? { heights: { mode: "do-stropa" as const, topDepth: pick([30, 35, 45, 60]) }, ceiling: 250 + Math.round(rnd() * 70) } : {}),
        ...(rnd() < 0.2 ? { heights: { mode: "custom" as const, upper: pick([60, 80, 90, 105]), tallTop: 200 + Math.round(rnd() * 40), worktop: pick([85, 90, 95]) } } : {}),
        ...(rnd() < 0.3 ? { hood: { kind: pick(["ugradbena", "dimnjak", "kosa", "ploca"] as const), island: pick(["dimnjak", "kaseta"] as const) } } : {}),
        ...(rnd() < 0.3 ? { islandSpec: { functions: pick(["none", "hob", "sink", "both"] as const), depth: pick([60, 90, 100, 120]), seatSide: pick(["back", "left", "right"] as const), ...(rnd() < 0.4 ? { bar: { kind: pick(["raised", "table"] as const) } } : {}) } } : {}),
        ...(rnd() < 0.25 ? { tallRuns: { [pick(["b-left", "c-right", "a-left"] as const)]: [{ type: pick(TALL), width: 60 }] } } : {}),
        ...(rnd() < 0.2 ? { rails: [pick(wallsFor(layout))] } : {}),
        ...(rnd() < 0.2 ? { corners: { "base-l": pick(["kutni", "kutni-l", "kutni-dijagonalni", "kutni-ladice", "kutna-polica"]), "upper-l": pick(["vrata", "kutni-l", "kutni-dijagonalni-staklo", "kutna-polica"]) } } : {}),
      });
      if (rnd() < 0.3) {
        const wall = pick(wallsFor(layout));
        c = setKitchenExtent(c, wall, { length: Math.round(c.walls[wall] * (0.55 + rnd() * 0.4)), offset: Math.round(rnd() * 30) }).cfg;
      }
      if (rnd() < 0.5) c = sanitizeConfig(materializeLists(c, planKitchen(c), planKitchen(c).lists.map((l) => l.id as ListId).filter((id) => !id.startsWith("tall"))));
      // change some elements to other types (every catalogue type over the run), stand tall units in runs, fill "+"
      for (let e = 0; e < 6; e++) {
        const p = planKitchen(c);
        const r = rnd();
        if (r < 0.5) {
          const s = pick(p.slots.filter((x) => x.options.length > 1 && !x.anchored));
          const t = s ? pick(s.options) : null;
          if (s && t) {
            const res = changeType(c, s.id, t);
            if (res.ok) c = res.cfg;
          }
        } else if (r < 0.7) {
          const s = pick(p.slots.filter((x) => x.zone === "base" && !x.corner && x.run !== "isl"));
          const res = s ? changeType(c, s.id, pick(TALL), "tall") : null;
          if (res?.ok) c = res.cfg;
        } else {
          const g = pick(planGaps(p));
          const o = g ? gapOptions(c, g.id) : null;
          const t = o ? pick(o.types.filter((x) => x.fitting?.length)) : undefined;
          if (g && t) {
            const res = insertAtGap(c, g.id, t.id, pick(t.fitting!));
            if (res.ok) c = res.cfg;
          }
        }
      }
      const p = planKitchen(c);
      checkDrawings(p, `k${k} ${layout}`);
      kitchens++;
      elements += p.slots.length;
    }
    assert.ok(kitchens === 70 && elements > 1000, `${kitchens} kitchens, ${elements} elements`);
  });
});

// ---------------------------------------------------------------- SVG and DXF

describe("drawings: SVG and DXF", () => {
  const p = planKitchen(kitchen({ layout: "U", window: { wall: "a", offset: 140, width: 100, sill: 100 }, handles: "gumb", islandSpec: {} }));
  const d = kitchenDrawings(p);

  it("SVG: well formed, to scale, Croatian text, no NaN", () => {
    for (const dr of [d.plan, ...d.elevations]) {
      for (const labels of ["none", "label", "name", "both"] as const) {
        const r = toSVG(dr, { scale: 20, labels });
        assert.ok(r.svg.startsWith("<svg") && r.svg.endsWith("</svg>"), dr.id);
        assert.ok(!/NaN|undefined|Infinity/.test(r.svg), `${dr.id}: NaN in the SVG`);
        assert.equal((r.svg.match(/<g[ >]/g) ?? []).length, (r.svg.match(/<\/g>/g) ?? []).length, `${dr.id}: groups`);
        assert.match(r.svg, /width="[\d.]+mm" height="[\d.]+mm"/);
        assert.equal(r.scale, 20);
        // the drawing itself at 1:20: 1 cm = 0.5 mm, so the paper is at least its bounds / 2
        assert.ok(r.width >= (dr.bounds.x1 - dr.bounds.x0) / 2 && r.height >= (dr.bounds.y1 - dr.bounds.y0) / 2, dr.id);
        if (labels === "both" || labels === "name") assert.ok(dr.tags.length === 0 || /ladice|vrata|Pećnica|hladnjak|sudoper|Kutni|Ploča/.test(r.svg), `${dr.id}: names`);
      }
    }
    assert.match(toSVG(d.elevations[0], { labels: "both" }).svg, /Gornja vrata/);
    assert.match(toSVG(d.plan).svg, /Tlocrt/);
  });

  it("a fitted drawing takes the largest standard scale that fits the paper", () => {
    const fit = { width: 277, height: 180 };
    for (const dr of [d.plan, ...d.elevations]) {
      const sc = fitScale(dr, fit);
      const r = toSVG(dr, { fit });
      assert.equal(r.scale, sc);
      assert.ok(r.width <= fit.width + 1e-6 && r.height <= fit.height + 1e-6, `${dr.id} at 1:${sc}: ${r.width} × ${r.height}`);
      const bigger = [5, 10, 20, 25, 50, 75, 100, 200].filter((x) => x < sc);
      for (const b of bigger) {
        const ps = paperSize(dr, b);
        assert.ok(ps.width > fit.width || ps.height > fit.height, `${dr.id}: 1:${b} would fit`);
      }
    }
    // dimension chains keep their paper spacing at any scale
    const e = d.elevations[0];
    const a = toSVG(e, { scale: 20 });
    const b = toSVG(e, { scale: 50 });
    assert.ok(a.width > b.width && b.width > (e.bounds.x1 - e.bounds.x0) / 5 + 2 * DIM_GAP);
  });

  it("DXF: every primitive, tag and dimension as an entity, in model cm", () => {
    for (const dr of [d.plan, ...d.elevations]) {
      const ents = toDxfEntities(dr, { scale: 20 });
      assert.equal(ents.filter((x) => x.type === "DIMENSION").length, dr.dims.length);
      assert.equal(ents.length, dr.prims.length + dr.tags.length + dr.dims.length);
      const exploded = toDxfEntities(dr, { scale: 20, explodeDims: true });
      assert.equal(exploded.filter((x) => x.type === "DIMENSION").length, 0);
      for (const x of exploded) {
        const nums = JSON.stringify(x).match(/-?\d+(\.\d+)?(e-?\d+)?/g) ?? [];
        assert.ok(!JSON.stringify(x).includes("null"), `${dr.id}: ${JSON.stringify(x)}`);
        assert.ok(nums.every((v) => Number.isFinite(Number(v))));
      }
      for (const x of ents) if (x.type === "DIMENSION") assert.ok(Number.isFinite(x.line[0]) && Number.isFinite(x.line[1]) && x.value > 0);
    }
  });

  it("the drawing model is pure: no three.js, no DOM, no React", () => {
    const dir = join(__dirname, "drawings");
    for (const f of readdirSync(dir).filter((x) => x.endsWith(".ts"))) {
      const src = readFileSync(join(dir, f), "utf8");
      assert.ok(!/from "(three|react)|[^.\w](document|window)\.[a-zA-Z]/.test(src), `${f} imports three / react or touches the DOM`);
    }
  });
});
