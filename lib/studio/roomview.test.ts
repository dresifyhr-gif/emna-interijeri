/**
 * The room view rebuilt after the owner's photo (images/4.webp, "photo v2"): the pose and lens of "Pogled iz prostorije"
 * (engine/camera.ts, calibrated from the photo), the ceiling light's rig at night (engine/lights.ts MOODS.lamp, the bounce
 * lights), the LED strip at the back of the wall units, a lone side-by-side's bridge line and recessed grips, the oven's
 * details, the new catalogue entries (Grafit mat, drawers 2 + 1, the grey oak laminate's boards, Port Laurent veins) and
 * the photo kitchen's final link — with the studio's own look (moods, older links) left as it was.
 *
 *   npx tsx --test lib/studio/roomview.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { SBS, SBS_GRIP, catalog, drawerLayoutDef, finishDef, frontDef, roomFloorDef, topDef } from "./catalog";
import { slotFace } from "./drawings";
import { faceCtx } from "./drawings/common";
import type { Prim } from "./drawings/model";
import { setElementOptions } from "./edit";
import { LAMP, ROOM_EYE, ROOM_LENS, canvasFov, lampSpot, roomLens, roomViewPose } from "./engine/camera";
import { GeoCache } from "./engine/geo";
import { buildKitchen, disposeKitchen, ledLights, moduleCtx, type KitchenEnv } from "./engine/kitchen";
import { Lights, MOODS } from "./engine/lights";
import type { Materials } from "./engine/materials";
import { createModule } from "./engine/modules";
import { planKitchen, sanitizeConfig, sbsAlone } from "./plan";
import { estimate } from "./price";
import { decodeConfig, encodeConfig, studioPath } from "./share";
import { summarize } from "./summary";
import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const near = (a: number, b: number, eps: number, what: string) => assert.ok(Math.abs(a - b) <= eps, `${what}: ${a} vs ${b}`);
const DEG = Math.PI / 180;

/** the photo kitchen as rebuilt (scratchpad recreate/v2/build.ts): the room 5.5 m deep, graphite wall units, 2 + 1 drawers */
const PHOTO_V2: KitchenConfig = {
  v: 1,
  layout: "L",
  walls: { a: 294, b: 550, c: 550 },
  ceiling: 281,
  window: null,
  front: "bijela",
  top: "nero-zlatni",
  handles: "bez",
  tall: true,
  island: 240,
  led: true,
  overrides: {},
  runs: {
    a: [{ type: "ploca", width: 90, opt: { hob: 60, drawers: "2+1" } }],
    b: [
      { type: "vrata", width: 45 },
      { type: "perilica", width: 60 },
      { type: "sudoper", width: 90, opt: { bowl: "left" } },
    ],
  },
  upperRuns: {
    a: [
      { type: "vrata", width: 50 },
      { type: "vrata", width: 45 },
      { type: "vrata", width: 45 },
    ],
    b: [
      { type: "vrata", width: 45 },
      { type: "vrata", width: 50 },
      { type: "vrata", width: 50 },
      { type: "vrata", width: 50 },
    ],
  },
  tallRun: [
    { type: "pecnica-mikro", width: 60, opt: { below: "vrata", ovenAt: "oci" } },
    { type: "ormar", width: 30 },
  ],
  tallAt: "a-right",
  tallRuns: { "b-left": [{ type: "hladnjak-sbs-vrata", width: 96 }] },
  extents: { b: { length: 351 } },
  corners: { "upper-l": "kutni-l" },
  zoneFronts: { upper: "grafit" },
  finish: { handleColor: "bijela", sink: "granit-crni", tap: "crna", appliances: "crno-staklo", plinth: "fronta", fridge: "tamni-inox", fridgeHandle: "udubljena" },
  hood: { kind: "ploca" },
  room: { wall: "kreda", floor: "laminat-sivi-hrast", bare: ["c"], ceiling: true, lamp: true },
  heights: { mode: "do-stropa", worktop: 85, gap: 50, onePiece: true },
  worktop: { thickness: 2 },
  gola: { between: true },
  ledZones: { plinth: false, inner: false },
};
const PHOTO_V2_LINK =
  "/studio?k=2.L.294.550.550.281.bijela.nero-zlatni.bez.1.240.1.0.ra-p90K6P60.rb-v45d60s90B1.ua-v50v45v45.ub-v45v50v50v50.t-om60V1A2v30.kul-kq.fu-grafit.hc-bijela.si-granit-crni.ta-crna.pl-fronta.fr-tamni-inox.fh-udubljena.zw-kreda.zf-laminat-sivi-hrast.eb-l351.tp-ar.tbl-rv96.h-sp85g50j.n-k3.wt-20.lz-p0i0.gl-m.zb-c.zc-2";

// ---------------------------------------------------------------- headless engine (as photo.test.ts)
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
const env = (cfg: KitchenConfig): KitchenEnv => ({
  mats: stubMaterials(),
  geos: new GeoCache(),
  doc: undefined as never,
  fronts: { base: cfg.front, upper: cfg.zoneFronts?.upper ?? cfg.front, tall: cfg.front, island: cfg.front },
  topId: cfg.top,
  handles: cfg.handles,
  plinth: cfg.finish?.plinth ?? "crna",
  labels: false,
  tempo: "quick",
});
const matName = (me: THREE.Mesh) => (me.material as THREE.Material).name;
const meshes = (root: THREE.Object3D, pick: (me: THREE.Mesh) => boolean): THREE.Mesh[] => {
  const out: THREE.Mesh[] = [];
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh && pick(me)) out.push(me);
  });
  return out;
};
const boxOf = (list: THREE.Mesh[]): THREE.Box3 => {
  const out = new THREE.Box3();
  const b = new THREE.Box3();
  for (const me of list) {
    me.geometry.computeBoundingBox();
    b.copy(me.geometry.boundingBox!).applyMatrix4(me.matrixWorld);
    out.union(b);
  }
  return out;
};
const polyBox = (p: Prim) => {
  const pts = p.t === "poly" ? p.pts : [];
  return { x0: Math.min(...pts.map((q) => q[0])), x1: Math.max(...pts.map((q) => q[0])), y0: Math.min(...pts.map((q) => q[1])), y1: Math.max(...pts.map((q) => q[1])) };
};

// ---------------------------------------------------------------- the room view's camera

describe("the room view's pose and lens (camera.ts, calibrated from the photo)", () => {
  // the photo's camera, solved from 7 corners of its cabinets (2.7 px rms): (1.206, 1.695, 5.419) m, looking at
  // (-1.123, 1.529, 0), 56.3° up / down over the 4:3 frame (71° across)
  const photo = { a: 2.94, depth: 5.5, left: true, right: false, ceiling: 2.81, footprint: { minX: -1.47, maxX: 1.47, minZ: 0, maxZ: 3.53 } };

  it("an L in a 5.5 m deep room: in the doorway beside the bare wall, eye level, aiming at the inner corner — the photo", () => {
    const p = roomViewPose(photo);
    near(p.position.x, 1.206, 0.01, "x");
    near(p.position.y, 1.695, 0.01, "eye");
    near(p.position.z, 5.419, 0.01, "z");
    near(p.aim.x, -1.123, 0.01, "aim x");
    near(p.aim.y, 1.529, 0.01, "aim y");
    assert.equal(p.aim.z, 0);
    assert.equal(p.across, ROOM_LENS.across, "the phone's main lens");
    near(roomLens(4 / 3, p.across), 56.31, 0.05, "56.3° up / down at 4:3");
    // the orbit centre: on the line of sight, level with the base fronts
    near(p.target.z, 0.6, 1e-9, "target z");
    const toAim = p.aim.clone().sub(p.position).normalize();
    const toTarget = p.target.clone().sub(p.position).normalize();
    near(toAim.dot(toTarget), 1, 1e-9, "target on the line of sight");
  });

  it("mirrored for a kitchen on wall C; in the middle for U / straight / none; inside deep rooms; under low ceilings", () => {
    const c = roomViewPose({ ...photo, left: false, right: true, footprint: { ...photo.footprint } });
    near(c.position.x, -1.206, 0.01, "beside wall B");
    near(c.aim.x, 1.123, 0.01, "at the inner corner by wall C");
    for (const [left, right] of [
      [true, true],
      [false, false],
    ]) {
      const m = roomViewPose({ ...photo, left, right });
      assert.equal(m.position.x, 0);
      assert.equal(m.aim.x, 0);
    }
    assert.equal(roomViewPose({ ...photo, depth: 12 }).position.z, 6.5, "never further than 6.5 m from wall A");
    assert.ok(roomViewPose({ ...photo, ceiling: 1.9 }).position.y <= 1.6 + 1e-9, "under the ceiling");
  });

  it("a shallow room: in the middle, at most 60 cm past the entrance, with a wider (ultra-wide) lens", () => {
    // the default L: walls B / C 220 cm, its side run reaching the entrance
    const p = roomViewPose({ a: 3.8, depth: 2.2, left: true, right: false, ceiling: 2.6, footprint: { minX: -1.9, maxX: 1.9, minZ: 0, maxZ: 2.2 } });
    assert.equal(p.position.x, 0, "too shallow to stand in a corner");
    assert.ok(p.position.z <= 2.2 + 0.6 + 1e-9 && p.position.z > 2.2, `${p.position.z}`);
    assert.ok(p.across > ROOM_LENS.across && p.across <= ROOM_LENS.maxAcross, `${p.across}`);
    // a straight kitchen in an open room (4 m): the main lens is enough
    assert.equal(roomViewPose({ a: 3.8, depth: 4, left: false, right: false, ceiling: 2.6, footprint: { minX: -1.9, maxX: 1.9, minZ: 0, maxZ: 0.62 } }).across, 71);
  });

  it("the lens over the visible area: 71° across landscape pictures, never under 52° across, at most 80° up / down", () => {
    for (const aspect of [16 / 9, 1.6, 4 / 3]) near(2 * Math.atan(Math.tan((roomLens(aspect) / 2) * DEG) * aspect) / DEG, 71, 0.01, `across at ${aspect}`);
    for (const aspect of [1.1, 0.9, 0.6, 0.45]) {
      const up = roomLens(aspect);
      assert.ok(up <= ROOM_LENS.maxUp + 1e-9, `${aspect}: ${up}`);
      assert.ok(2 * Math.atan(Math.tan((up / 2) * DEG) * aspect) / DEG >= Math.min(52, 2 * Math.atan(Math.tan(40 * DEG) * aspect) / DEG) - 1e-6, `${aspect}`);
    }
    assert.ok(roomLens(4 / 3, 95) > roomLens(4 / 3), "wider when asked");
    // the canvas's lens for a visible area: the same angle when the area is the whole canvas, wider for a smaller one
    near(canvasFov(56.3, 900, 900), 56.3, 1e-9, "whole canvas");
    assert.ok(canvasFov(56.3, 900, 828) > 56.3);
  });

  it("the ceiling light hangs where the photo's does: over the middle of wall A, 2.2 m into a 5.5 m room, 12 cm down", () => {
    const l = lampSpot(2.94, 5.5);
    near(l.x - 2.94 / 2, -0.03, 0.05, "photo: 3 cm left of the middle");
    near(l.z, 2.2, 0.03, "photo: 2.20 m from wall A");
    near(LAMP.drop, 0.117, 0.01, "photo: the ring 11.7 cm under the ceiling");
    near(LAMP.outer, 0.224, 0.01, "photo: the ring 45 cm across");
    assert.equal(ROOM_EYE, 1.7);
  });
});

// ---------------------------------------------------------------- the ceiling light's rig

function stubMats(): Materials {
  const std = () => new THREE.MeshStandardMaterial();
  const phys = () => new THREE.MeshPhysicalMaterial();
  return {
    led: new THREE.MeshBasicMaterial(),
    glassGlow: () => {},
    windowGlass: new THREE.MeshPhysicalMaterial({ emissive: "#000000" }),
    ovenLight: new THREE.MeshBasicMaterial(),
    ceilingLit: std(),
    blackGlass: phys(),
    ovenWindow: phys(),
    appliance: phys(),
    hob: phys(),
  } as unknown as Materials;
}

describe("the ceiling light lights the room at night (lights.ts)", () => {
  it("MOODS.lamp: every mood knows every value; the studio's moods are as they were (no halo, no bounce)", () => {
    const keys = Object.keys(MOODS.day).sort();
    for (const m of ["off", "night", "lamp"] as const) assert.deepEqual(Object.keys(MOODS[m]).sort(), keys, m);
    assert.deepEqual(MOODS.day, { hemi: 0.5, key: 2.15, rim: 0.85, fill: 0.42, env: 0.52, led: 0, rect: 0, sun: 1, glow: 1, bloom: 0.22, halo: 0, bounce: 0 });
    assert.deepEqual(MOODS.night, { hemi: 0.07, key: 0.62, rim: 0.12, fill: 0.06, env: 0.09, led: 1, rect: 1, sun: 0, glow: 0.05, bloom: 0.62, halo: 0, bounce: 0 });
    assert.ok(MOODS.lamp.led === 1 && MOODS.lamp.halo > 0 && MOODS.lamp.bounce > 0 && MOODS.lamp.sun === 0);
  });

  it("the key spot and the fill move to the lamp, the bounce lights stand across the room; and back to the studio's", () => {
    const scene = new THREE.Scene();
    const L = new Lights(scene, 2, 512, true);
    L.aim(new THREE.Box3(new THREE.Vector3(-1.5, 0, 0), new THREE.Vector3(1.5, 2.8, 3.5)));
    const studio = [L.key.position.clone(), L.key.target.position.clone(), L.fill.position.clone(), L.rim.position.clone(), L.sun.position.clone()];
    const angle = L.key.angle;
    const lamp = new THREE.Vector3(0, 2.69, 2.2);
    L.setLamp(lamp, new THREE.Vector3(1, 0, 0), 1.47);
    assert.ok(L.lampLit);
    near(L.key.position.distanceTo(lamp), 0.04, 1e-9, "key at the lamp");
    assert.ok(L.key.target.position.y === 0, "shining down");
    assert.ok(L.fill.position.y < lamp.y && L.fill.decay > 0, "the fill under the lamp, falling off");
    assert.ok(L.rim.position.x < -5, "the bounce onto the bare wall comes from the kitchen's side");
    assert.ok(L.sun.position.x > 1 && L.sun.position.x < 1.47, "the bounce back stands inside the room, in front of the bare wall");
    L.cur = { ...MOODS.lamp };
    L.apply(scene, stubMats(), { strength: 0 });
    near(L.sun.intensity, 2.6 * MOODS.lamp.bounce, 1e-9, "the sun spot is the bounce at night");
    near(L.rim.intensity, MOODS.lamp.rim, 1e-9, "rim at full");
    // a lamp with kitchens on both side walls (U): no bounce
    L.setLamp(lamp, null, 1.47);
    L.apply(scene, stubMats(), { strength: 0 });
    assert.equal(L.rim.intensity, 0);
    assert.equal(L.sun.intensity, 0);
    L.setLamp(null);
    assert.ok(!L.lampLit);
    const now = [L.key.position, L.key.target.position, L.fill.position, L.rim.position];
    now.forEach((v, i) => near(v.distanceTo(studio[i]), 0, 1e-9, `studio rig ${i}`));
    assert.equal(L.key.angle, angle);
    assert.equal(L.fill.decay, 0);
    assert.equal(L.key.penumbra, 0.85);
  });
});

// ---------------------------------------------------------------- the kitchen (headless)

describe("the photo kitchen v2", () => {
  const c = sanitizeConfig(PHOTO_V2);

  it("plans without warnings and links to the final link (old ones decode as before)", () => {
    const p = planKitchen(c);
    assert.deepEqual(p.warnings, []);
    assert.equal(studioPath(c), PHOTO_V2_LINK);
    assert.deepEqual(decodeConfig(encodeConfig(c)), c);
    assert.ok(estimate(c).low > 0);
    assert.ok(summarize(c).some((l) => l.includes("Grafit mat")), "summary names the graphite wall units");
    assert.ok(summarize(c).some((l) => l.includes("dvije plitke + duboka") || l.includes("Dvije plitke + duboka")), "and the 2 + 1 drawers");
  });

  it("LED strips sit at the back of the wall units and wash the backsplash (tilted towards the wall)", () => {
    const p = planKitchen(c);
    const K = buildKitchen(env(c), p);
    K.timeline.finish();
    const under = K.leds.filter((z) => z.kind === "under");
    assert.ok(under.length >= 2);
    for (const z of under) {
      z.mesh.geometry.computeBoundingBox();
      const b = z.mesh.geometry.boundingBox!;
      assert.ok(b.min.z >= 0.012 && b.max.z <= 0.04, `strip at z ${b.min.z}…${b.max.z} (run frame)`);
    }
    for (const l of ledLights(K, 10).slice(0, under.length)) {
      assert.ok(l.dir.y < -0.9, "mostly down");
      // towards wall A (−z) or wall B (−x)
      assert.ok(l.dir.z < -0.1 || l.dir.x < -0.1, `towards the wall: ${l.dir.toArray()}`);
    }
    disposeKitchen(K);
  });

  it("a side-by-side alone in its column: the bridge right above the appliance (engine and drawings); recessed grips at hand height, a slim display", () => {
    const p = planKitchen(c);
    const s = p.slots.find((x) => x.type === "hladnjak-sbs-vrata")!;
    assert.ok(sbsAlone(p.slots, s));
    assert.ok(s.look?.includes('["a",true]'), s.look);
    assert.equal(moduleCtx(env(c), p, undefined, s).sbsAlone, true);
    // drawings: the bridge doors from the appliance's top + the air gap
    const f = slotFace(s, faceCtx(p, s));
    const fronts = f.prims.filter((q) => q.t === "poly" && q.layer === "fronta").map(polyBox);
    const bridge = fronts.filter((b) => b.y0 > 150);
    assert.ok(bridge.length >= 2, "two bridge doors");
    near(Math.min(...bridge.map((b) => b.y0)), SBS.applianceHeight + SBS.topGap, 0.5, "bridge from 180 cm");
    const dark = f.prims.filter((q) => q.t === "poly" && q.fill === "dark").map(polyBox);
    const grips = dark.filter((b) => Math.abs(b.y1 - b.y0 - SBS_GRIP.length) < 0.5);
    assert.equal(grips.length, 2, "a grip in each door");
    for (const g of grips) near((g.y0 + g.y1) / 2, SBS_GRIP.centre, 0.5, "grip at hand height");
    assert.ok(dark.some((b) => Math.abs(b.y1 - b.y0 - 21) < 0.5 && Math.abs((b.y0 + b.y1) / 2 - SBS_GRIP.display) < 0.5), "slim display");
    assert.ok(!dark.some((b) => Math.abs(b.y1 - b.y0 - 28) < 0.5), "no dispenser");
    // the engine: the bridge doors' fronts start at the same line (world metres)
    const m = createModule(moduleCtx(env(c), p, undefined, s), s);
    const bridgeFronts = meshes(m.fronts, (me) => matName(me).startsWith("front(") && boxOf([me]).min.y > 1.2);
    assert.ok(bridgeFronts.length >= 2);
    const lift = (p.heights.plinth - 10) / 100;
    near(boxOf(bridgeFronts).min.y + lift, (SBS.applianceHeight + SBS.topGap) / 100, 0.01, "bridge bottom in 3D");
  });

  it("a side-by-side beside an oven column keeps the older line (an integrated fridge's top door)", () => {
    const c2 = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, ceiling: 260, tallRun: [{ type: "hladnjak-sbs-vrata", width: SBS.niche }, { type: "pecnica", width: 60 }] });
    const p2 = planKitchen(c2);
    const s2 = p2.slots.find((x) => x.type === "hladnjak-sbs-vrata")!;
    assert.ok(!sbsAlone(p2.slots, s2));
    assert.ok(!s2.look?.includes('["a",true]'));
    assert.equal(moduleCtx(env(c2), p2, undefined, s2).sbsAlone, undefined);
    const f = slotFace(s2, faceCtx(p2, s2));
    const bridge = f.prims.filter((q) => q.t === "poly" && q.layer === "fronta").map(polyBox).filter((b) => b.y0 > 150);
    assert.ok(Math.min(...bridge.map((b) => b.y0)) > SBS.applianceHeight + SBS.topGap + 1, "on the column's line, higher");
  });

  it("the oven: a smoked window, steel knobs and trims", () => {
    const p = planKitchen(c);
    const s = p.slots.find((x) => x.type === "pecnica-mikro")!;
    const m = createModule(moduleCtx(env(c), p, undefined, s), s);
    assert.equal(meshes(m.root, (me) => matName(me) === "ovenWindow").length, 2, "oven and microwave windows");
    assert.ok(meshes(m.root, (me) => matName(me) === "brushed").length >= 3, "handle bar, foot trim, knobs, strip line");
  });
});

// ---------------------------------------------------------------- catalogue

describe("catalogue entries of the photo v2", () => {
  it("Grafit mat, drawers 2 + 1, the laminate's narrow boards, Port Laurent veins, a lighter dark steel", () => {
    const g = frontDef("grafit");
    assert.ok(g && g.pricePerMeter > 0 && g.render.color === "#45464a");
    const withG = kitchen({ zoneFronts: { upper: "grafit" } });
    assert.ok(encodeConfig(withG).includes("fu-grafit"));
    assert.deepEqual(decodeConfig(encodeConfig(withG))?.zoneFronts, { upper: "grafit" });

    const d = drawerLayoutDef("2+1");
    assert.ok(d);
    assert.deepEqual(d.ratios, [0.25, 0.25, 0.5]);
    assert.equal(new Set(catalog.drawerLayouts.map((x) => x.code)).size, catalog.drawerLayouts.length, "codes unique");
    const c0 = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 } });
    const drawers = planKitchen(c0).slots.find((s) => s.type === "ladice")!;
    const r = setElementOptions(c0, drawers.id, { drawers: "2+1" });
    assert.ok(r.ok, r.warning ?? "");
    assert.ok(encodeConfig(r.cfg).includes("K6"));
    assert.deepEqual(decodeConfig(encodeConfig(r.cfg)), r.cfg);

    assert.equal(roomFloorDef("laminat-sivi-hrast")?.render.boards, 12);
    assert.equal(topDef("nero-zlatni")?.render.veins, "diagonal");
    assert.equal(topDef("nero-zlatni")?.render.tones?.[1], "#c8a35e", "gold veins");
    const steel = finishDef("fridges", "tamni-inox");
    assert.ok(steel && (steel.render.metalness ?? 1) < 0.6, "reads as dark brushed steel under any light");
  });

  it("the default kitchen is untouched: no lone side-by-side, no new fields", () => {
    const p = planKitchen(kitchen({}));
    assert.ok(!p.slots.some((s) => s.look?.includes('["a",true]')));
    assert.equal(encodeConfig(kitchen({})), "2.L.380.220.220.260.antracit.mramor.bez.1.240.1.0");
  });
});
