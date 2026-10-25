/**
 * Review-round regressions: what the adversarial fuzz of the island / room / kitchen-run work found and fixed —
 * wall A of a U keeping both corner rules, a run stepping back from a corner far enough for the other run's corner
 * cabinet (and a tall column there) to open, the tall column moving on when another column stands at its end, wall
 * units keeping the corner square free when a window leaves no room for the corner unit, the
 * lowered table flush with the island's back, a "+" at a run end when a longer run lets a left-out column stand again,
 * and the L-shaped carousel's trays inside their carcass (headless three.js scene graph, no WebGL).
 *
 *   npx tsx --test lib/studio/review.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { SBS } from "./catalog";
import { gapOptions, insertAtGap } from "./edit";
import { buildKitchen, disposeKitchen, type KitchenEnv } from "./engine/kitchen";
import { GeoCache } from "./engine/geo";
import { DIM, columnDepth, kitchenRange, planGaps, planKitchen, sanitizeConfig } from "./plan";
import { decodeConfig, encodeConfig } from "./share";
import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });

describe("U kitchen: wall A has a corner at each end", () => {
  it("an extent close to both corners keeps both rules (in the corner, or DIM.cornerClear from it)", () => {
    for (let off = 0; off <= 80; off += 3)
      for (const len of [240, 250, 260, 281, 300]) {
        const c = kitchen({ layout: "U", walls: { a: 345, b: 362, c: 400 }, extents: { a: { offset: off, length: len } } });
        const k = kitchenRange(c, "a");
        const dl = k.from;
        const dr = c.walls.a - k.to;
        assert.ok(dl === 0 || dl >= DIM.cornerClear, `left ${dl} (offset ${off}, length ${len})`);
        assert.ok(dr === 0 || dr >= DIM.cornerClear, `right ${dr} (offset ${off}, length ${len})`);
        assert.deepEqual(sanitizeConfig(c), c, "sanitize is idempotent");
        assert.deepEqual(decodeConfig(encodeConfig(c)), c, "share link round trip");
      }
  });

  it("the fuzz case: a 41 cm offset no longer leaves wall B's corner cabinet under wall A's tall column", () => {
    const c = kitchen({ layout: "U", walls: { a: 345, b: 362, c: 400 }, tallAt: "a-left", extents: { a: { offset: 41, length: 240 } } });
    const k = kitchenRange(c, "a");
    assert.ok(k.from === 0 || k.from >= DIM.cornerClear);
    const p = planKitchen(c);
    const a0 = Math.min(...p.slots.filter((s) => s.run === "a").map((s) => s.x));
    // B reaches the corner (its last cabinet stands in the corner square): A's cabinets start beyond B's depth
    assert.ok(k.from > 0 || a0 >= 0, "A starts in the corner with its own corner unit");
    assert.ok(!(k.from > 0 && k.from < DIM.baseDepth), "A never starts inside B's cabinets");
  });
});

describe("tall columns at a room corner", () => {
  // U: wall A runs into both corners, wall C stops short of its corner with A: "a-right" is a room-wall end
  const sbsAt = (cOffset: number) =>
    kitchen({ layout: "U", walls: { a: 400, b: 300, c: 360 }, tall: false, extents: { c: { offset: cOffset } }, tallRuns: { "a-right": [{ type: "hladnjak-sbs", width: SBS.niche }] } });

  it("what a column needs in front of it at a corner (columnDepth) fits in what the corner rules keep clear", () => {
    const need = SBS.applianceDepth + SBS.appliance / 2 + SBS.handleDepth;
    assert.equal(columnDepth([{ type: "hladnjak-sbs", width: SBS.niche }]), need);
    assert.equal(columnDepth([{ type: "hladnjak-sbs-vrata", width: SBS.niche }]), need);
    assert.equal(columnDepth([{ type: "hladnjak", width: 60 }]), DIM.baseDepth);
    assert.equal(columnDepth(undefined), DIM.baseDepth);
    // a neighbour that does not reach the corner keeps DIM.cornerClear from it: room for any column's doors to open
    assert.ok(need + 0.5 <= DIM.cornerClear);
    assert.ok(DIM.baseDepth + 60 <= DIM.cornerClear, "a 60 cm cabinet in the corner and its door / drawer open in front of it");
  });

  it("wall C stepping back from the corner keeps DIM.cornerClear: the side-by-side at A's end there opens its doors", () => {
    for (const off of [64, 80, 100, 130]) {
      const c = sbsAt(off);
      assert.ok(kitchenRange(c, "c").from >= DIM.cornerClear || kitchenRange(c, "c").from === 0, `offset ${off}`);
      const p = planKitchen(c);
      if (kitchenRange(c, "c").from === 0) continue;
      assert.equal(p.runs.find((r) => r.wall === "a")!.ends.right, "wall");
      const sbs = p.slots.find((s) => s.type === "hladnjak-sbs");
      assert.ok(sbs && sbs.run === "a", `offset ${off}: the side-by-side stands at A's end`);
    }
  });

  it("the corner cabinet of the run that reaches the corner has room in front of it", () => {
    // L: wall B steps back from its corner with A; A's first cabinet stands in the corner
    for (const off of [64, 90, 119, 130]) {
      const p = planKitchen(kitchen({ layout: "L", walls: { a: 380, b: 300, c: 220 }, extents: { b: { offset: off } } }));
      const b = p.runs.find((r) => r.wall === "b")!;
      const reach = 300 - b.kitchen.to;
      assert.ok(reach === 0 || reach >= DIM.baseDepth + 60, `offset ${off}: B ends ${reach} cm from the corner`);
    }
  });

  it("another column standing where the planner puts the tall column: the tall column goes to the next free end", () => {
    for (const [layout, end, want] of [
      ["L", "a-right", "b"],
      ["U", "c-right", "b"],
      ["otok", "a-right", "a"],
    ] as const) {
      const p = planKitchen(kitchen({ layout, walls: { a: 420, b: 320, c: 320 }, tallRuns: { [end]: [{ type: "smocnica", width: 40 }] } }));
      const main = p.slots.filter((s) => s.list?.id === "tall");
      assert.equal(main.length, 2, `${layout}: the tall column stands`);
      assert.ok(main.every((s) => s.run === want), `${layout}: on wall ${want.toUpperCase()}`);
      assert.ok(p.slots.some((s) => s.list?.id === `tall:${end}`), `${layout}: the other column stays where it was put`);
      assert.ok(!p.warnings.some((w) => /ne stane/.test(w)), p.warnings.join(" | "));
    }
  });
});

describe("wall units at a corner whose corner unit a window leaves out", () => {
  for (const layout of ["L", "U"] as const) {
    it(`${layout}: wall A's wall units keep the corner square free (their doors would be behind the neighbour's first cabinet)`, () => {
      const c = kitchen({ layout, walls: { a: 380, b: 300, c: 300 }, window: { wall: "a", offset: 60, width: 120, sill: 100 } });
      const p = planKitchen(c);
      assert.ok(!p.slots.some((s) => s.cornerId === "upper-l"), "no corner wall unit (the window is in its way)");
      for (const s of p.slots.filter((x) => x.run === "a" && x.zone === "upper")) assert.ok(s.x >= DIM.upperDepth - 0.01, `${s.id} at ${s.x}`);
      // the neighbour's wall units stop DIM.upperDepth before the corner, as before
      const b = p.slots.filter((x) => x.run === "b" && x.zone === "upper");
      for (const s of b) assert.ok(s.x + s.width <= c.walls.b - DIM.upperDepth + 0.01, `${s.id}`);
    });
  }

  it("U, the window near the right corner: same at the corner with wall C", () => {
    const c = kitchen({ layout: "U", walls: { a: 312, b: 300, c: 300 }, window: { wall: "a", offset: 119, width: 113, sill: 138 } });
    const p = planKitchen(c);
    for (const s of p.slots.filter((x) => x.run === "a" && x.zone === "upper")) assert.ok(s.x + s.width <= c.walls.a - DIM.upperDepth + 0.01, `${s.id} ends at ${s.x + s.width}`);
  });
});

describe("lowered table at the island", () => {
  for (const layout of ["otok", "poluotok", "G"] as const) {
    it(`${layout}: the worktop and its waterfall ends are flush with the body's back, the table butts against them`, () => {
      const p = planKitchen(kitchen({ layout, islandSpec: { bar: { kind: "table" }, stools: 4 } }));
      const I = p.island!;
      assert.equal(I.bar?.kind, "table");
      assert.equal(I.bar!.z1, I.outer);
      for (const r of I.slab) assert.ok(r.z0 >= I.outer - 1e-9, `slab z0 ${r.z0} outer ${I.outer}`);
      for (const w of I.waterfalls) assert.ok(w.z0 >= I.bar!.z1 - 1e-9, "the waterfall does not reach into the table");
      // the raised bar keeps the lip (DIM.islandFlush) it always had
      const q = planKitchen(kitchen({ layout, islandSpec: { bar: { kind: "raised" } } })).island!;
      assert.equal(Math.min(...q.slab.map((r) => r.z0)), q.outer - DIM.islandFlush);
    });
  }
});

describe('"+" at a run end when a longer run lets a left-out tall column stand again', () => {
  it("the base insert grows the run by the column too (with a note) instead of offering nothing", () => {
    const c = kitchen({
      layout: "ravna",
      walls: { a: 341, b: 220, c: 220 },
      tall: false,
      tallRuns: { "a-left": [{ type: "hladnjak-sbs", width: SBS.niche }] },
      extents: { a: { length: 150 } },
    });
    const p0 = planKitchen(c);
    assert.ok(!p0.slots.some((s) => s.type === "hladnjak-sbs"), "the side-by-side does not fit on 150 cm");
    const gap = planGaps(p0).find((g) => g.id === "end:a-right");
    assert.ok(gap);
    const o = gapOptions(c, gap.id)!;
    const t = o.types.find((x) => x.id === "ladice" && x.width !== null);
    assert.ok(t, "drawers are offered");
    const r = insertAtGap(c, gap.id, "ladice", t.width!);
    assert.ok(r.ok, r.warning ?? "");
    assert.match(r.warning ?? "", /visoki stup koji prije nije stao/);
    const p1 = planKitchen(r.cfg);
    assert.ok(p1.slots.some((s) => s.id === r.slotId && s.type === "ladice"));
    assert.ok(p1.slots.some((s) => s.type === "hladnjak-sbs"), "the column stands again");
    assert.equal(p1.lists.find((l) => l.id === "a")!.dropped.length, 0);
  });
});

// ---------------------------------------------------------------- headless engine

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
  fronts: { base: "antracit", upper: "antracit", tall: "antracit", island: "hrast" },
  topId: "mramor",
  handles: "letvica",
  plinth: "crna",
  labels: false,
  tempo: "quick",
});

describe("engine: L-shaped carousel corner", () => {
  for (const [layout, cid] of [
    ["L", "base-l"],
    ["G", "base-r"],
    ["U", "base-r"],
  ] as const) {
    it(`${layout} ${cid}: both 3/4 trays stay inside the carcass, their missing quarter towards the bi-fold door`, () => {
      const p = planKitchen(kitchen({ layout, corners: { [cid]: "kutni-l-karusel" } }));
      const K = buildKitchen(engineEnv(), p);
      K.timeline.finish();
      K.root.updateMatrixWorld(true);
      const sl = p.slots.find((s) => s.type === "kutni-l-karusel")!;
      const M = K.modules.get(sl.id)!;
      const carc = new THREE.Box3();
      const trays: THREE.Mesh[] = [];
      let pole: THREE.Vector3 | null = null;
      M.root.traverse((o) => {
        const me = o as THREE.Mesh;
        if (!me.isMesh) return;
        const name = (me.material as THREE.Material).name;
        me.geometry.computeBoundingBox();
        if (name.startsWith("carcass")) carc.union(me.geometry.boundingBox!.clone().applyMatrix4(me.matrixWorld));
        if (name === "drawer") trays.push(me);
        if (name === "brushed" && (me.geometry as THREE.CylinderGeometry).parameters?.height === 0.7) pole = new THREE.Vector3().setFromMatrixPosition(me.matrixWorld);
      });
      assert.equal(trays.length, 2);
      assert.ok(pole);
      const c = pole as THREE.Vector3;
      // the inner corner of the L (where the door is) lies towards the room (+z) and away from the room corner
      const inward = sl.corner === "left" ? 1 : -1;
      const v = new THREE.Vector3();
      for (const t of trays) {
        const b = t.geometry.boundingBox!.clone().applyMatrix4(t.matrixWorld);
        assert.ok(b.min.x >= carc.min.x - 1e-3 && b.max.x <= carc.max.x + 1e-3 && b.min.z >= carc.min.z - 1e-3 && b.max.z <= carc.max.z + 1e-3, "inside the carcass");
        const pos = t.geometry.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          v.fromBufferAttribute(pos, i).applyMatrix4(t.matrixWorld);
          const dx = (v.x - c.x) * inward;
          const dz = v.z - c.z;
          assert.ok(!(dx > 0.01 && dz > 0.01), "nothing in the quarter facing the door");
        }
      }
      disposeKitchen(K);
    });
  }
});
