/**
 * The owner's "photo" round (build the kitchen of a photo identically): black marble with gold veins and more stones,
 * tall units in one piece up to the ceiling, the oven column's variants, the side-by-side fridge's own finish and
 * handles, the Gola profile's colours and its channel between drawers, drawer splits, LED zones, bare room walls, the
 * side-by-side niche's exact footprint, the wall units' gap and top-row split, new floors, the plinth's finish and
 * recess, opening styles per zone, the hob's own width and the sink bowl's place — older links untouched, share links,
 * price, summary, the admin quote prefill, the edit helpers, the 2D drawings and the engine (headless).
 *
 *   npx tsx --test lib/studio/photo.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { quoteFromConfig } from "../admin/quote-from-config";
import { SBS, catalog, drawerLayoutDef, finishDef, roomFloorDef, topDef } from "./catalog";
import { kitchenDrawings, slotFace } from "./drawings";
import { faceCtx } from "./drawings/common";
import {
  elementOptions,
  fridgeChoices,
  golaChoices,
  heightChoices,
  ledZoneChoices,
  plinthChoices,
  roomWalls,
  setBareWall,
  setDrawerLayout,
  setElementOptions,
  setFridge,
  setGola,
  setHeights,
  setKitchenExtent,
  setLedZones,
  setOvenColumn,
  setPlinth,
  setRoomCeiling,
  setWallKitchen,
  setZoneHandles,
  zoneHandleChoices,
} from "./edit";
import { heightsOf } from "./engine/dims";
import { GeoCache } from "./engine/geo";
import { buildKitchen, disposeKitchen, ledLights, moduleCtx, type KitchenEnv } from "./engine/kitchen";
import { finishLook } from "./engine/materials";
import { createModule } from "./engine/modules";
import { DRAWER_TYPES, GOLA_MID, drawerRatios, drawerStack, extraDrawers, hobWidthOf, ovenColumn, sinkBowl } from "./fronts";
import {
  DIM,
  TALL_DOOR_MAX,
  columnPanel,
  geometryKey,
  ledZoneOn,
  openingOf,
  planHeights,
  planKitchen,
  sanitizeConfig,
  tallSplitOf,
  type KitchenPlan,
} from "./plan";
import { TOP_BOX_HARDWARE, breakdown, ledShare, optionsCost } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { elementOptionsText, summarize } from "./summary";
import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const roundTrip = (c: KitchenConfig) => decodeConfig(encodeConfig(c));
const quoteAddsUp = (cfg: KitchenConfig, label: string) => {
  const b = breakdown(cfg);
  const q = quoteFromConfig(cfg, { vatPct: 25, newId: () => "x" });
  assert.equal(q.mode, "plan", label);
  const gross = q.items.reduce((sum, it) => sum + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
  assert.ok(Math.abs(gross - b.total) < Math.max(5, b.total * 0.005), `${label}: ${gross} vs ${b.total}`);
  assert.ok(!q.items.some((it) => /^Ostalo/.test(it.description)), `${label}: everything itemised`);
  return q;
};

/** the photo (images/4.webp): L + a bare right wall, every new option the photo needs */
const PHOTO: KitchenConfig = {
  v: 1,
  layout: "L",
  walls: { a: 294, b: 420, c: 420 },
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
    a: [{ type: "ploca", width: 90, opt: { hob: 60, drawers: "msv" } }],
    b: [
      { type: "vrata", width: 45 },
      { type: "perilica", width: 60 },
      { type: "sudoper", width: 90, opt: { bowl: "left" } },
    ],
  },
  upperRuns: {
    a: [
      { type: "vrata", width: 50 },
      { type: "napa", width: 90 },
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
  zoneFronts: { upper: "antracit" },
  finish: { handleColor: "bijela", sink: "granit-crni", tap: "crna", plinth: "fronta", fridge: "tamni-inox", fridgeHandle: "udubljena" },
  room: { wall: "kreda", floor: "laminat-sivi-hrast", bare: ["c"], ceiling: true, lamp: true },
  heights: { mode: "do-stropa", worktop: 85, gap: 50, onePiece: true },
  worktop: { thickness: 2 },
  gola: { between: true },
  ledZones: { plinth: false, inner: false },
};
const photo = () => sanitizeConfig(PHOTO);

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
        // (used as a material itself — mats.gola, mats.fridge …: its name is the key)
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
const moduleOf = (plan: KitchenPlan, id: string, cfg: KitchenConfig) => {
  const s = plan.slots.find((x) => x.id === id)!;
  return createModule(moduleCtx({ ...env(cfg), handles: cfg.handles }, plan, undefined, s), s);
};

describe("the photo kitchen", () => {
  it("plans, links, prices, summarises and quotes", () => {
    const c = photo();
    const p = planKitchen(c);
    assert.deepEqual(p.warnings, []);
    assert.deepEqual(p.bareWalls, [{ wall: "c", length: 420 }]);
    assert.deepEqual(roundTrip(c), c);
    const sum = summarize(c);
    for (const want of [
      "Zid C (desni): 420 cm, bez kuhinje",
      "Radna ploča: Nero zlatni (Port Laurent), debljina 2 cm",
      "Profil Gola: i između ladica (svaka ladica ima svoj hvat)",
      "Dvokrilni hladnjak: tamni inox (grafit), udubljene ručke (hladnjak nije uračunat u cijenu)",
      "LED rasvjeta: da (toplo bijelo, ispod gornjih elemenata)",
    ]) {
      assert.ok(sum.includes(want), `${want}\n${sum.join("\n")}`);
    }
    assert.ok(sum.some((l) => /visoki stup do 279 cm, u jednom komadu/.test(l)), sum.join("\n"));
    assert.ok(sum.some((l) => l.includes("Ručke: Bez ručki (profil Gola), bijeli profil")), sum.join("\n"));
    const q = quoteAddsUp(c, "photo");
    assert.ok(q.items.some((it) => it.description === "Visoki elementi u jednom komadu do stropa"));
    assert.ok(q.items.some((it) => it.description === "Profil Gola između ladica"));
    assert.ok(q.items.some((it) => it.description === "LED rasvjeta – traka" && it.details === "ispod gornjih elemenata"));
  });

  it("draws: the bare wall in the floor plan, the oven column, the drawers with their channels, no top box on one-piece units", () => {
    const p = planKitchen(photo());
    const d = kitchenDrawings(p);
    // the bare wall C is a wall of the floor plan (and has its length)
    assert.ok(d.plan.dims.some((x) => x.chain === "tlocrt:c:zid"), "wall C's length");
    const ctx = faceCtx(p, p.slots.find((s) => s.id === "tall-0")!);
    const oven = slotFace(p.slots.find((s) => s.id === "tall-0")!, ctx);
    const fronts = oven.prims.filter((x) => x.t === "poly" && x.layer === "fronta");
    // one door under the oven, one above the microwave: no drawers, no top box flap
    assert.equal(fronts.length, 2, JSON.stringify(fronts));
    const hob = p.slots.find((s) => s.type === "ploca")!;
    const hf = slotFace(hob, faceCtx(p, hob));
    // three drawers (small / medium / large) and two Gola channels between them, the one under the worktop too
    assert.equal(hf.prims.filter((x) => x.t === "poly" && x.layer === "fronta").length, 3);
    assert.equal(hf.prims.filter((x) => x.t === "poly" && x.layer === "rucka").length, 3);
  });

  it("builds in 3D (headless): the bare wall, one-piece tall units, the fridge's own material and recessed grips", () => {
    const c = photo();
    const p = planKitchen(c);
    const K = buildKitchen(env(c), p);
    K.timeline.finish();
    assert.deepEqual(
      K.walls.map((w) => w.id).sort(),
      ["a", "b", "c"],
      "three room walls: the kitchen's and the bare one",
    );
    // one piece: the oven column's carcass reaches the column's top line (no split on the top row's line)
    const tall = K.modules.get("tall-0")!;
    // (world space: the column stands h.lift lower for the 85 cm worktop)
    const top = boxOf(meshes(tall.body, (me) => matName(me).startsWith("carcass("))).max.y;
    assert.ok(Math.abs(top - p.heights.tallTop / 100) < 0.005, `carcass up to ${top}`);
    const sbs = K.modules.get("tall-bl-0")!;
    assert.ok(meshes(sbs.fronts, (me) => matName(me) === "fridge").length >= 2, "fridge doors in the fridge material");
    assert.equal(meshes(sbs.fronts, (me) => matName(me) === "brushed").length, 0, "no bar handles: recessed grips");
    // LED: only the strips under the wall units get area lights
    const lights = ledLights(K, 20, (k) => ledZoneOn(c, k));
    assert.ok(lights.length > 0);
    assert.ok(K.leds.some((z) => z.kind === "plinth"));
    disposeKitchen(K);
  });
});

describe("1 · stones", () => {
  it("black marble with gold veins, gold Calacatta and graphite quartz are worktops with swatches and prices", () => {
    for (const id of ["nero-zlatni", "calacatta-zlatni", "kvarc-grafit", "kvarc-sivi"]) {
      const t = topDef(id)!;
      assert.ok(t && t.pricePerMeter > 0 && t.swatch, id);
      const c = kitchen({ top: id });
      assert.equal(c.top, id);
      assert.equal(roundTrip(c)?.top, id);
    }
    // gold veins: the marble's vein tone is a gold
    assert.equal(topDef("nero-zlatni")!.render.tones?.[1], "#c8a35e");
  });
});

describe("2 · tall units in one piece up to the ceiling", () => {
  const c0 = kitchen({ layout: "L", walls: { a: 380, b: 260, c: 220 }, ceiling: 280, heights: { mode: "do-stropa" } });
  it("kitchen-wide and per element; within TALL_DOOR_MAX; priced instead of the top box", () => {
    const p0 = planKitchen(c0);
    assert.ok(p0.heights.tallSplit !== null);
    const r = setHeights(c0, { onePiece: true });
    const p1 = planKitchen(r.cfg);
    for (const s of p1.slots.filter((x) => x.zone === "tall")) assert.equal(tallSplitOf(r.cfg, p1.heights, s.opt), null, s.id);
    assert.ok(p1.slots.filter((s) => s.zone === "tall").every((s) => s.look?.includes('"p"')), "the look keys the one piece");
    const b0 = breakdown(c0);
    const b1 = breakdown(r.cfg);
    const n = p1.slots.filter((s) => s.zone === "tall").length;
    assert.ok(Math.abs(b1.cabinets - (b0.cabinets - n * TOP_BOX_HARDWARE)) < 1e-6, "no top-box stays");
    assert.equal(b1.options, n * catalog.extras.tallOnePiece);
    // one element split again
    const id = p1.slots.find((s) => s.zone === "tall")!.id;
    const r2 = setElementOptions(r.cfg, id, { onePiece: false });
    const p2 = planKitchen(r2.cfg);
    const s2 = p2.slots.find((s) => s.id === r2.slotId)!;
    assert.equal(tallSplitOf(r2.cfg, p2.heights, s2.opt), p2.heights.tallSplit);
    assert.deepEqual(roundTrip(r2.cfg), r2.cfg);
    // too tall a ceiling: still split, with a note
    const high = setHeights(kitchen({ ceiling: 340, heights: { mode: "do-stropa" } }), { onePiece: true });
    const ph = planKitchen(high.cfg);
    assert.ok(ph.heights.tallTop - ph.heights.plinth > TALL_DOOR_MAX);
    assert.ok(ph.slots.filter((s) => s.zone === "tall").every((s) => tallSplitOf(high.cfg, ph.heights, s.opt) !== null));
    assert.ok(ph.warnings.some((w) => /u jednom komadu/.test(w)), ph.warnings.join(" "));
    assert.equal(heightChoices(r.cfg).onePiece.value, true);
    assert.equal(elementOptions(r.cfg, id)?.onePiece?.value, true);
  });
  it("the engine and the drawings draw no top box; the side-by-side bridge goes up to the top line", () => {
    const c = setHeights(kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, ceiling: 280, tallRun: [{ type: "hladnjak-sbs", width: SBS.niche }, { type: "ormar", width: 60 }], heights: { mode: "do-stropa" } }), { onePiece: true }).cfg;
    const p = planKitchen(c);
    for (const s of p.slots.filter((x) => x.zone === "tall")) {
      const ctx = moduleCtx(env(c), p, undefined, s);
      assert.equal(ctx.ut, heightsOf(p).tallTop - heightsOf(p).lift, s.id);
      assert.equal(ctx.h?.tallSplit, null, s.id);
      const f = slotFace(s, faceCtx(p, s));
      assert.ok(Math.abs(f.box.y1 - p.heights.tallTop) < 0.01, `${s.id} face up to the top line`);
    }
  });
});

describe("3 · oven columns", () => {
  it("door below, low / eye level, microwave or not — shared by the engine and the drawings; default = every older column", () => {
    const d = ovenColumn(10, 209, 90, true);
    // every older column: two drawers of min(29, 14 %), the oven above them, microwave, a door above
    assert.equal(d.drawers.length, 2);
    assert.ok(Math.abs(d.oven[0] - (10 + 2 * Math.min(29, 199 * 0.14))) < 1e-9);
    const eye = ovenColumn(10, 269, 90, true, { below: "vrata", ovenAt: "oci" });
    assert.deepEqual(eye.drawers, []);
    assert.deepEqual(eye.door, [10, 90]);
    assert.equal(eye.oven[0], 90);
    assert.ok(eye.micro && eye.micro[0] >= eye.strip[1] - 1e-9);
    const low = ovenColumn(10, 209, 90, false, { ovenAt: "nisko" });
    assert.equal(low.drawers.length, 1);
    assert.equal(low.micro, null);

    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 } });
    const p = planKitchen(c);
    const oven = p.slots.find((s) => s.type === "pecnica")!;
    const r = setOvenColumn(c, oven.id, { below: "vrata", at: "oci", micro: true });
    assert.ok(r.ok, r.warning ?? "");
    const p1 = planKitchen(r.cfg);
    const s = p1.slots.find((x) => x.id === r.slotId)!;
    assert.equal(s.type, "pecnica-mikro");
    assert.deepEqual(s.opt, { below: "vrata", ovenAt: "oci" });
    assert.equal(elementOptionsText(r.cfg, s), "pećnica u visini očiju, ispod pećnice vrata");
    assert.deepEqual(elementOptions(r.cfg, s.id)?.oven, { below: "vrata", at: "oci", micro: true });
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    // the engine: a door holder under the oven, the oven's drop door at the worktop line
    const m = moduleOf(p1, s.id, r.cfg);
    const drops = m.holders.filter((h) => h.kind === "drop");
    assert.equal(drops.length, 1);
    assert.ok(Math.abs(drops[0].node.position.y - (heightsOf(p1).workY - heightsOf(p1).lift) - 0.0015) < 0.01, `oven at ${drops[0].node.position.y}`);
    assert.ok(m.holders.some((h) => h.kind === "door" && h.node.position.y < 0.6), "a door under the oven");
    assert.ok(!setOvenColumn(c, p.slots.find((x) => x.zone === "base")!.id, { below: "vrata" }).ok, "only oven columns");
  });
});

describe("4 · the side-by-side fridge's own finish and handles", () => {
  it("independent of the oven fronts; recessed handles; summary, link", () => {
    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tallRun: [{ type: "hladnjak-sbs", width: SBS.niche }], finish: { appliances: "inox" } });
    const r = setFridge(c, { finish: "crni", handle: "udubljena" });
    assert.deepEqual(r.cfg.finish, { appliances: "inox", fridge: "crni", fridgeHandle: "udubljena" });
    const look = finishLook(r.cfg.handles, r.cfg.finish);
    assert.equal(look.fridge.color, finishDef("fridges", "crni")!.render.color);
    assert.equal(look.appliance.color, finishDef("appliances", "inox")!.render.color);
    // absent: the fridge looks like the appliance fronts (every older link)
    const l0 = finishLook(c.handles, c.finish);
    assert.equal(l0.fridge, l0.appliance);
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    assert.ok(summarize(r.cfg).some((l) => l.startsWith("Dvokrilni hladnjak: crni, udubljene ručke")));
    assert.equal(fridgeChoices(r.cfg).shown, true);
    assert.equal(fridgeChoices(r.cfg).finishes.length, 4);
    assert.ok(!setFridge(c, { finish: "zlatni" }).ok);
    assert.deepEqual(setFridge(r.cfg, { finish: null, handle: null }).cfg.finish, { appliances: "inox" });
    assert.equal(breakdown(r.cfg).total, breakdown(c).total, "the fridge is an appliance: not priced");
  });
});

describe("5 · Gola colours, the channel between drawers, drawer splits", () => {
  it("white and aluminium profiles; channels between drawers in the engine, drawings and price", () => {
    for (const id of ["crna", "inox", "bijela", "alu"]) assert.ok(catalog.finishes.handleColors.some((h) => h.id === id), id);
    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, runs: { a: [{ type: "ladice", width: 60 }, { type: "sudoper", width: 80 }, { type: "ploca", width: 60 }] } });
    const r = setGola(c, { color: "alu", between: true });
    assert.equal(r.cfg.finish?.handleColor, "alu");
    assert.deepEqual(r.cfg.gola, { between: true });
    assert.equal(golaChoices(r.cfg).between, true);
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    const p = planKitchen(r.cfg);
    const dr = p.slots.find((s) => s.type === "ladice")!;
    assert.ok(dr.look?.includes('"m"'));
    const m = moduleOf(p, dr.id, r.cfg);
    // the channel under the worktop and one between each pair of drawers
    assert.equal(meshes(m.fronts, (me) => matName(me) === "gola").length, 3);
    const st = drawerStack(10, 82.5, [0.22, 0.39, 0.39], true);
    assert.equal(st.channels.length, 2);
    assert.ok(Math.abs(st.fronts.reduce((n, [a, b]) => n + b - a, 0) + 2 * GOLA_MID - 72.5) < 1e-9);
    const oc = optionsCost(p).find((o) => o.id === "golaMid")!;
    // ladice 60 (2 channels) + the hob's drawers 60 (2 channels)
    assert.equal(oc.qty, 2.4);
    quoteAddsUp(r.cfg, "gola");
    // without Gola (another opening style) there is no channel to price
    assert.equal(optionsCost(planKitchen({ ...r.cfg, handles: "letvica" })).length, 0);
  });

  it("drawer splits kitchen-wide and per element: small / medium / large like the photo, three equal, two deep, 1 + 2", () => {
    assert.deepEqual(drawerLayoutDef("msv")!.ratios, [0.2, 0.28, 0.52]);
    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, runs: { a: [{ type: "ladice2", width: 60 }, { type: "sudoper", width: 80 }, { type: "ploca", width: 60 }] } });
    const r = setDrawerLayout(c, "jednake3");
    assert.equal(r.cfg.drawerLayout, "jednake3");
    const p = planKitchen(r.cfg);
    const d2 = p.slots.find((s) => s.type === "ladice2")!;
    assert.deepEqual(drawerRatios(r.cfg, d2.type, d2.opt), [1 / 3, 1 / 3, 1 / 3]);
    assert.equal(extraDrawers(r.cfg, d2.type, d2.opt), 1);
    assert.equal(breakdown(r.cfg).options, catalog.extras.drawerExtra);
    const e = setElementOptions(r.cfg, d2.id, { drawers: "duboke2" });
    const s = planKitchen(e.cfg).slots.find((x) => x.id === e.slotId)!;
    assert.deepEqual(s.opt, { drawers: "duboke2" });
    assert.equal(breakdown(e.cfg).options, 0);
    assert.deepEqual(roundTrip(e.cfg), e.cfg);
    assert.equal(Object.keys(DRAWER_TYPES).length, 4);
    const m = moduleOf(p, d2.id, r.cfg);
    assert.equal(m.holders.filter((h) => h.kind === "drawer").length, 3, "three drawers in 3D");
    assert.equal(elementOptions(r.cfg, d2.id)?.drawers?.value, "jednake3");
    assert.ok(summarize(r.cfg).includes("Podjela ladica: tri jednake ladice"));
  });
});

describe("6 · LED zones", () => {
  it("under the wall units, in the plinth, in niches — one by one; priced by share; summary", () => {
    const c = kitchen({});
    assert.equal(ledShare(c), 1);
    const r = setLedZones(c, { plinth: false });
    assert.deepEqual(r.cfg.ledZones, { plinth: false });
    assert.ok(Math.abs(ledShare(r.cfg) - (1 - catalog.extras.ledZoneShare.plinth)) < 1e-9);
    assert.ok(breakdown(r.cfg).led < breakdown(c).led);
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    assert.deepEqual(
      ledZoneChoices(r.cfg).zones.map((z) => z.on),
      [true, false, true],
    );
    assert.ok(summarize(r.cfg).some((l) => l === "LED rasvjeta: da (toplo bijelo, ispod gornjih elemenata, u nišama i vitrinama)"));
    // switching a zone on turns the kitchen's LED on
    assert.equal(setLedZones({ ...r.cfg, led: false }, { under: true }).cfg.led, true);
    assert.equal(setLedZones(r.cfg, null).cfg.ledZones, undefined);
    quoteAddsUp(r.cfg, "led zones");
  });
});

describe("7 · room walls without a kitchen", () => {
  it("an L kitchen in a closed room with a bare right wall: no run, no '+', no note; A's end against it", () => {
    const c0 = kitchen({ layout: "L", walls: { a: 300, b: 300, c: 220 } });
    const r = setBareWall(c0, "c", true, 550);
    assert.ok(r.ok, r.warning ?? "");
    assert.deepEqual(r.cfg.room?.bare, ["c"]);
    assert.equal(r.cfg.walls.c, 550);
    const p = planKitchen(r.cfg);
    assert.deepEqual(p.bareWalls, [{ wall: "c", length: 550 }]);
    assert.deepEqual(p.walls, ["a", "b"]);
    const a = p.runs.find((x) => x.wall === "a")!;
    assert.equal(a.ends.right, "wall");
    assert.equal(a.openRight, false);
    assert.deepEqual(p.warnings, planKitchen(c0).warnings);
    assert.notEqual(geometryKey(r.cfg), geometryKey(c0));
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    assert.deepEqual(
      roomWalls(r.cfg).map((w) => [w.wall, w.kitchen, w.bare]),
      [
        ["a", true, false],
        ["b", true, false],
        ["c", false, true],
      ],
    );
    assert.ok(!setBareWall(c0, "b", true).ok, "wall B has a kitchen");
    assert.ok(!setBareWall(kitchen({ layout: "G" }), "c", true).ok, "the peninsula stands there");
    assert.ok(summarize(r.cfg).includes("Zid C (desni): 550 cm, bez kuhinje"));
  });

  it("kitchen length 0 on a wall: the layout changes, the room wall stays; and back", () => {
    const u = kitchen({ layout: "U", walls: { a: 360, b: 300, c: 300 } });
    const off = setKitchenExtent(u, "c", { length: 0 });
    assert.ok(off.ok, off.warning ?? "");
    assert.equal(off.cfg.layout, "L");
    assert.deepEqual(off.cfg.room?.bare, ["c"]);
    assert.equal(off.cfg.walls.c, 300);
    const on = setWallKitchen(off.cfg, "c", true);
    assert.equal(on.cfg.layout, "U");
    assert.equal(on.cfg.room?.bare, undefined);
    assert.equal(setWallKitchen(kitchen({ layout: "L" }), "b", false).cfg.layout, "ravna");
    assert.equal(setWallKitchen(kitchen({ layout: "G" }), "b", false).cfg.layout, "poluotok");
    assert.ok(!setWallKitchen(u, "b", false).ok, "A + C is no layout");
    assert.ok(!setWallKitchen(u, "a", false).ok);
  });
});

describe("8 · the side-by-side niche's footprint", () => {
  it("a column that is just the niche takes exactly 96 cm: no cover panels of its own", () => {
    assert.equal(columnPanel([{ type: "hladnjak-sbs" }]), 0);
    assert.equal(columnPanel([{ type: "hladnjak-sbs" }, { type: "ormar" }]), DIM.panel);
    const c = kitchen({ layout: "L", walls: { a: 380, b: 360, c: 220 }, tallRuns: { "b-left": [{ type: "hladnjak-sbs-vrata", width: SBS.niche }] } });
    const p = planKitchen(c);
    const b = p.runs.find((r) => r.wall === "b")!;
    const col = b.talls[0];
    assert.equal(col.to - col.from, SBS.niche);
    assert.equal(p.pieces.filter((x) => x.run === "b" && x.zone === "tall").length, 0);
    // the main tall column too
    const t = planKitchen(kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tallRun: [{ type: "hladnjak-sbs", width: SBS.niche }] }));
    assert.equal(t.runs[0].tall!.to - t.runs[0].tall!.from, SBS.niche);
  });
});

describe("10 · wall units: the gap to the worktop and the top row's height", () => {
  it("in every mode; the top row split as asked or one row up to the ceiling", () => {
    const c = kitchen({});
    const std = planKitchen(setHeights(c, { gap: 50 }).cfg).heights;
    assert.equal(std.upperBottom - std.worktop, 50);
    assert.equal(std.upperTop - std.upperBottom, 72, "standard wall units keep 72 cm");
    assert.equal(std.tallTop, std.upperTop, "the column on the wall units' line");
    const ds = setHeights(kitchen({ ceiling: 280 }), { mode: "do-stropa", gap: 60, topRow: 40 });
    const h = planKitchen(ds.cfg).heights;
    assert.equal(h.upperBottom - h.worktop, 60);
    assert.equal(h.topRow!.to - h.topRow!.from, 40);
    assert.deepEqual(roundTrip(ds.cfg), ds.cfg);
    // one row up to the ceiling where it fits
    const one = planHeights(setHeights(kitchen({ ceiling: 260 }), { mode: "do-stropa", topRow: 0 }).cfg).heights;
    assert.equal(one.topRow, null);
    const ch = heightChoices(ds.cfg);
    assert.equal(ch.gap.value, 60);
    assert.equal(ch.topRow.value, 40);
    assert.ok(setHeights(c, { gap: 52 }).warning?.includes("Razmak"));
    assert.ok(summarize(ds.cfg).some((l) => l.includes("razmak radna ploča – gornji 60 cm")));
    // undefined goes back to the planner's choice
    assert.equal(setHeights(ds.cfg, { gap: undefined, topRow: undefined }).cfg.heights?.gap, undefined);
  });
});

describe("11 · floors", () => {
  it("grey oak laminate, white oak, dark walnut, grey 60 × 120 tiles, light micro-cement", () => {
    for (const id of ["laminat-sivi-hrast", "hrast-bijeli", "orah-tamni", "plocice-sive-60x120", "mikrocement-svijetli"]) {
      assert.ok(roomFloorDef(id), id);
      const c = kitchen({ room: { floor: id } });
      assert.equal(c.room?.floor, id);
      assert.equal(roundTrip(c)?.room?.floor, id);
    }
  });
});

describe("12 · the plinth: aluminium, recess", () => {
  it("finish and recess, priced / drawn / built", () => {
    const c = kitchen({});
    const r = setPlinth(c, { finish: "alu", recess: 3 });
    assert.deepEqual(r.cfg.plinth, { recess: 3 });
    assert.equal(r.cfg.finish?.plinth, "alu");
    assert.equal(plinthChoices(r.cfg).recess, 3);
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    assert.equal(planKitchen(r.cfg).heights.plinthRecess, 3);
    assert.notEqual(geometryKey(r.cfg), geometryKey(c));
    assert.ok(breakdown(r.cfg).finishes > breakdown(c).finishes);
    assert.ok(summarize(r.cfg).includes("Postolje: aluminijsko postolje, uvučeno 3 cm"));
    const p = planKitchen(r.cfg);
    const s = p.slots.find((x) => x.zone === "base" && !x.corner)!;
    const m = moduleOf(p, s.id, r.cfg);
    const z = boxOf(m.plinths).max.z;
    assert.ok(Math.abs(z - (DIM.baseFace / 100 - 0.03)) < 0.002, `plinth face at ${z}`);
    assert.equal(sanitizeConfig({ ...r.cfg, plinth: { recess: 6 } }).plinth, undefined, "the default is not stored");
    assert.ok(setPlinth(c, { recess: 5 }).warning?.includes("uvučeno"));
  });
});

describe("13 · opening style per zone", () => {
  it("base Gola, wall units and the tall column push-to-open; an element's own still wins", () => {
    const c = kitchen({ handles: "bez" });
    let cfg = setZoneHandles(c, "upper", "push").cfg;
    cfg = setZoneHandles(cfg, "tall", "push").cfg;
    assert.deepEqual(cfg.zoneHandles, { upper: "push", tall: "push" });
    assert.equal(openingOf(cfg, undefined, "upper"), "push");
    assert.equal(openingOf(cfg, { open: "letvica" }, "upper"), "letvica");
    assert.equal(openingOf(cfg, undefined, "base"), "bez");
    assert.deepEqual(roundTrip(cfg), cfg);
    const p = planKitchen(cfg);
    const up = p.slots.find((s) => s.zone === "upper" && !s.corner)!;
    assert.equal(moduleCtx(env(cfg), p, undefined, up).handles, "push");
    assert.ok(up.look?.includes('"z"'));
    assert.deepEqual(
      zoneHandleChoices(cfg).map((z) => z.value),
      ["bez", "push", "push", "bez"],
    );
    assert.ok(summarize(cfg).some((l) => l.startsWith("Otvaranje po zonama: gornji elementi: otvaranje na dodir; visoki stup: otvaranje na dodir")));
    quoteAddsUp(cfg, "zones");
    // the kitchen's own style is not stored for a zone
    assert.equal(setZoneHandles(c, "base", "bez").cfg.zoneHandles, undefined);
  });
});

describe("14 · the hob's own width, the sink bowl's place", () => {
  it("a 60 cm hob in a 90 cm cabinet (and its hood follows the hob); the bowl at the left / right", () => {
    assert.equal(hobWidthOf(90), 78);
    assert.equal(hobWidthOf(90, { hob: 60 }), 60);
    assert.deepEqual(sinkBowl(90), { x0: 10, x1: 80, wide: false });
    assert.deepEqual(sinkBowl(90, { bowl: "left" }), { x0: 7, x1: 77, wide: false });
    const c = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, hood: { kind: "dimnjak" }, runs: { a: [{ type: "ladice", width: 60 }, { type: "sudoper", width: 90 }, { type: "ploca", width: 90 }] } });
    const p = planKitchen(c);
    assert.equal(p.runs[0].hoods[0].width, 90);
    const hob = p.slots.find((s) => s.type === "ploca")!;
    const r = setElementOptions(c, hob.id, { hob: 60 });
    const p1 = planKitchen(r.cfg);
    assert.equal(p1.runs[0].hoods[0].width, 60, "the chimney hood follows the 60 cm hob");
    assert.equal(elementOptions(r.cfg, r.slotId!)?.hob?.value, 60);
    const sink = p1.slots.find((s) => s.type === "sudoper")!;
    const r2 = setElementOptions(r.cfg, sink.id, { bowl: "right" });
    assert.deepEqual(roundTrip(r2.cfg), r2.cfg);
    const p2 = planKitchen(r2.cfg);
    const s2 = p2.slots.find((s) => s.id === r2.slotId)!;
    const m = moduleOf(p2, s2.id, r2.cfg);
    // the worktop's cut-out follows the bowl
    assert.ok(m.hole && Math.abs(m.hole.x1 - (s2.x + s2.width - 7) / 100) < 1e-6, JSON.stringify(m.hole));
    assert.equal(elementOptionsText(r2.cfg, s2), "korito desno");
    // drawings: the hob's rectangle is 60 cm wide in the floor plan
    const fp = kitchenDrawings(p1).plan;
    const hobRects = fp.prims.filter((x) => x.t === "poly" && x.ref === hob.id && x.layer === "uredaj" && x.weight === "medium");
    const span = (pts: readonly (readonly [number, number])[]) => Math.max(...pts.map((q) => q[0])) - Math.min(...pts.map((q) => q[0]));
    assert.ok(hobRects.some((x) => x.t === "poly" && Math.abs(span(x.pts) - 60) < 0.01), JSON.stringify(hobRects));
  });
});

describe("9 · the ceiling and its light (room view)", () => {
  it("room options of the view: not priced, linked, summarised", () => {
    const c = kitchen({});
    const r = setRoomCeiling(c, { ceiling: true, lamp: true });
    assert.deepEqual(r.cfg.room, { ceiling: true, lamp: true });
    assert.equal(breakdown(r.cfg).total, breakdown(c).total);
    assert.equal(geometryKey(r.cfg), geometryKey(c), "the engine shows it without a rebuild");
    assert.deepEqual(roundTrip(r.cfg), r.cfg);
    assert.ok(summarize(r.cfg).some((l) => l.includes("strop sa stropnom svjetiljkom")));
    assert.equal(setRoomCeiling(r.cfg, { ceiling: false, lamp: false }).cfg.room, undefined);
  });
});

describe("older links", () => {
  it("the recreation's first link decodes to the same kitchen; default kitchens carry none of the new fields", () => {
    const first =
      "2.U.294.420.420.281.bijela.nero.bez.1.240.1.0.ra-p90.rb-v45d60s90.rc-0.ua-v50h90.ub-v45v50v50v50.uc-0.t-om60v30.kul-kq.fu-antracit.hc-inox.si-granit-crni.ta-crna.ap-inox.pl-fronta.zw-kreda.zf-parket-svijetli.eb-l355.ec-o300.tp-ar.tbl-rv96.h-sp85.wt-20";
    const c = decodeConfig(first)!;
    assert.equal(encodeConfig(c), first);
    for (const k of ["ledZones", "zoneHandles", "gola", "drawerLayout", "plinth"] as const) assert.equal(c[k], undefined, k);
    for (const layout of ["ravna", "L", "U", "otok", "poluotok", "G"] as const) {
      const d = kitchen({ layout });
      const p = planKitchen(d);
      assert.equal(p.bareWalls, undefined);
      assert.equal(optionsCost(p).length, 0, layout);
      assert.equal(p.heights.plinthRecess, undefined);
      assert.ok(p.slots.every((s) => !s.look), layout);
    }
  });
});
