/**
 * The QA round over the owner's "sve što možeš zamisliti" options, driven in the production build: what looked wrong on
 * screen and is fixed here — frosted / fluted vitrine glass (no transmission pass, milky by day, glowing with a lit
 * vitrine's LED in the evening, no moiré from afar), the bronze glass frame, the island's ceiling cassette (no floating
 * slab, no shadow), end units that keep the end of their row when changed into or narrowed, and no filler strip left
 * standing alone on the wall beyond empty space.
 *
 *   npx tsx --test lib/studio/polish.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { quoteFromConfig } from "../admin/quote-from-config";
import { catalog, glassFrameDef } from "./catalog";
import { changeType, changeWidth, remove, setGlass, setHood } from "./edit";
import { buildKitchen, moduleCtx, type KitchenEnv } from "./engine/kitchen";
import { GeoCache } from "./engine/geo";
import { Materials } from "./engine/materials";
import { createModule } from "./engine/modules";
import { planKitchen, sanitizeConfig, type KitchenPlan } from "./plan";
import { breakdown } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { summarize } from "./summary";
import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const uppersOf = (p: KitchenPlan, wall = "a") => p.slots.filter((s) => s.run === wall && s.zone === "upper");

/** stand-in materials: mats.x / mats.x(args) are named MeshStandardMaterials (no textures, no WebGL) */
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
        fns.set(key, f);
      }
      return f;
    },
  }) as unknown as KitchenEnv["mats"];
}
const env = (): KitchenEnv => ({
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

/** the real material library, headless: canvas textures get a canvas without a 2D context (nothing is drawn or uploaded) */
function realMaterials(): Materials {
  const g = globalThis as unknown as { document?: unknown };
  g.document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => null }) };
  return new Materials({ size: 64, anisotropy: 4 });
}

describe("vitrine glass", () => {
  it("no kind is transmissive (no second opaque pass); frosted kinds are milky, tinted ones reflect a little", () => {
    const mats = realMaterials();
    for (const t of catalog.glass.types) {
      for (const lit of [false, true]) {
        const m = mats.glassOf(t.id, lit) as THREE.MeshPhysicalMaterial;
        assert.ok(m.transparent, t.id);
        assert.equal(m.depthWrite, false, t.id);
        assert.equal(m.transmission ?? 0, 0, `${t.id}: no transmission`);
        if (t.id === "prozirno") assert.equal(m, mats.doorGlass, "clear glass is every older vitrine's material");
      }
    }
    const frosted = mats.glassOf("satinirano") as THREE.MeshPhysicalMaterial;
    const tinted = mats.glassOf("broncano") as THREE.MeshPhysicalMaterial;
    assert.ok(frosted.opacity > tinted.opacity, "frosted glass hides more than tinted");
    assert.ok(tinted.metalness > 0, "tinted glass reflects a little (reads as glass, not as an open cabinet)");
    // one material per kind (and per lit state for the frosted ones): shared by every door of that kind
    assert.equal(mats.glassOf("rebrasto", true), mats.glassOf("rebrasto", true));
    assert.notEqual(mats.glassOf("rebrasto", true), mats.glassOf("rebrasto", false));
    assert.equal(mats.glassOf("dimljeno", true), mats.glassOf("dimljeno", false), "tinted glass does not glow");
  });

  it("a lit vitrine's frosted door glows with the LED in the evening; unlit doors and daylight do not", () => {
    const mats = realMaterials();
    const lit = mats.glassOf("rebrasto", true) as THREE.MeshPhysicalMaterial;
    const dark = mats.glassOf("rebrasto", false) as THREE.MeshPhysicalMaterial;
    const led = new THREE.Color("#ffc58a");
    mats.glassGlow(0, led);
    assert.equal(lit.emissiveIntensity, 0, "daylight");
    mats.glassGlow(1, led);
    assert.ok(lit.emissiveIntensity > 0.2 && lit.emissiveIntensity < 1, `evening ${lit.emissiveIntensity}`);
    assert.ok(lit.emissive.equals(led), "in the LED colour");
    assert.equal(dark.emissiveIntensity, 1, "a vitrine with the LED off keeps three's default (black emissive)");
    assert.equal(dark.emissive.getHex(), 0);
  });

  it("fluted glass: hand-made mip levels flatten the ribs from afar (no moiré)", () => {
    const n = (realMaterials().glassOf("rebrasto") as THREE.MeshPhysicalMaterial).normalMap!;
    assert.ok(n);
    assert.equal(n.generateMipmaps, false);
    const mips = n.mipmaps as unknown as { data: Uint8Array; width: number; height: number }[];
    assert.equal(mips.length, 7, "64 × 4 down to 1 × 1");
    const slope = (l: { data: Uint8Array }) => Math.abs(l.data[0] - 128);
    assert.ok(slope(mips[0]) > 100, "the full-size level has whole ribs");
    for (let i = 1; i < mips.length; i++) assert.ok(slope(mips[i]) <= slope(mips[i - 1]), `level ${i} is no steeper`);
    assert.equal(slope(mips[mips.length - 2]), 0, "2 texels a rib: flat glass");
  });

  it("the door gets the lit / unlit glass of its element (KitchenConfig.glass and opt.glass LED)", () => {
    const glassName = (cfg: KitchenConfig) => {
      const plan = planKitchen(cfg);
      const s = plan.slots.find((x) => x.type === "vitrina" && x.zone === "upper")!;
      const m = createModule(moduleCtx(env(), plan, undefined, s), s);
      const names: string[] = [];
      m.root.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if (mat?.name?.startsWith("glassOf(")) names.push(mat.name);
      });
      return names;
    };
    const base = { layout: "ravna" as const, upperRuns: { a: [{ type: "vitrina", width: 60 }] } };
    assert.deepEqual(glassName(kitchen({ ...base, glass: { type: "satinirano" } })), ["glassOf(satinirano,true)"]);
    assert.deepEqual(glassName(kitchen({ ...base, glass: { type: "satinirano", led: false } })), ["glassOf(satinirano,false)"]);
    assert.deepEqual(glassName(kitchen({ ...base, upperRuns: { a: [{ type: "vitrina", width: 60, opt: { glass: { led: false } } }] } })), ["glassOf(prozirno,false)"]);
  });

  it("a thin bronze frame: in links, the price, the summary and the quote", () => {
    const bronze = glassFrameDef("bronca");
    assert.ok(bronze?.render.metal, "a metal profile");
    const cfg = kitchen({ layout: "ravna", upperRuns: { a: [{ type: "vitrina", width: 60 }, { type: "vitrina", width: 60, opt: { glass: { frame: "bronca", type: "rebrasto" } } }] } });
    assert.deepEqual(decodeConfig(encodeConfig(cfg)), cfg);
    const kitchenWide = setGlass(cfg, { frame: "bronca" }).cfg;
    assert.equal(kitchenWide.glass?.frame, "bronca");
    assert.deepEqual(decodeConfig(encodeConfig(kitchenWide)), kitchenWide);
    assert.ok(breakdown(kitchenWide).glass > breakdown(cfg).glass, "the frame is a surcharge");
    assert.ok(summarize(cfg).some((l) => /brončan/i.test(l)), summarize(cfg).join(" | "));
    const q = quoteFromConfig(cfg, { vatPct: 25, newId: () => "x" });
    assert.ok(q.items.some((it) => /brončan/i.test(it.description)), "itemised in the admin quote");
    assert.ok(!q.items.some((it) => /^Ostalo/.test(it.description)));
  });
});

describe("the island's ceiling cassette", () => {
  it("only a down-facing ceiling board (nothing floats above the room) and no shadow from the ceiling", () => {
    const cfg = setHood(kitchen({ layout: "otok", walls: { a: 420, b: 220, c: 220 }, islandSpec: { functions: "hob" } }), { island: "kaseta" }).cfg;
    const plan = planKitchen(cfg);
    assert.equal(plan.island?.hood?.style, "kaseta");
    const K = buildKitchen(env(), plan);
    K.timeline.finish();
    assert.ok(K.islandHood);
    const meshes: THREE.Mesh[] = [];
    K.islandHood!.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    assert.ok(meshes.length >= 2);
    for (const me of meshes) assert.equal(me.castShadow, false);
    const board = meshes.find((me) => me.geometry.type === "PlaneGeometry")!;
    assert.ok(board, "the ceiling board");
    const nrm = board.geometry.getAttribute("normal");
    for (let i = 0; i < nrm.count; i++) assert.ok(nrm.getY(i) < -0.99, "it faces down only");
    // the canopy hood (the default) still hangs and casts its shadow
    const canopy = buildKitchen(env(), planKitchen(setHood(cfg, { island: "dimnjak" }).cfg));
    canopy.timeline.finish();
    let casts = false;
    canopy.islandHood!.traverse((o) => (casts ||= Boolean((o as THREE.Mesh).isMesh && o.castShadow)));
    assert.ok(casts);
  });
});

describe("end units keep the end of their row", () => {
  const ravna = () => kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tall: false });

  it("a wall unit at the end changed into narrower rounded shelves: the room it gives up goes inside, it stays at the end", () => {
    const cfg = ravna();
    const last = uppersOf(planKitchen(cfg)).at(-1)!;
    const r = changeType(cfg, last.id, "polica-zaobljena");
    assert.ok(r.ok, r.warning ?? "");
    const ups = uppersOf(planKitchen(r.cfg));
    const shelf = ups.find((s) => s.type === "polica-zaobljena")!;
    assert.equal(r.slotId, shelf.id);
    assert.ok(shelf.end, "drawn rounded: at the free end, in place of the end panel");
    assert.equal(ups.at(-1)!.id, shelf.id, "nothing after it");
    assert.equal(r.cfg.upperRuns!.a!.at(-1)!.type, "polica-zaobljena");
    // narrower still: it stays at the end
    const n = changeWidth(r.cfg, shelf.id, 30);
    assert.ok(n.ok, n.warning ?? "");
    const shelf2 = uppersOf(planKitchen(n.cfg)).find((s) => s.type === "polica-zaobljena")!;
    assert.equal(shelf2.width, 30);
    assert.ok(shelf2.end);
  });

  it("at the start of a row the room goes after it; an end unit in the middle of a row stays where it is", () => {
    const cfg = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, upperRuns: { a: [{ type: "prazno", width: 20 }, { type: "vrata", width: 60 }, { type: "vrata", width: 60 }, { type: "napa", width: 90 }] } });
    const first = uppersOf(planKitchen(cfg)).find((s) => s.type === "vrata")!;
    const r = changeType(cfg, first.id, "polica-kosa");
    assert.ok(r.ok, r.warning ?? "");
    assert.equal(r.cfg.upperRuns!.a![0].type, "polica-kosa", "first in the list");
    const mid = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, upperRuns: { a: [{ type: "vrata", width: 60 }, { type: "vrata", width: 60 }, { type: "napa", width: 90 }, { type: "vrata", width: 60 }] } });
    const m = uppersOf(planKitchen(mid)).find((s) => s.type === "vrata" && s.x > 50)!;
    const rm = changeType(mid, m.id, "polica-zaobljena");
    assert.ok(rm.ok);
    const types = rm.cfg.upperRuns!.a!.map((e) => e.type);
    assert.equal(types.indexOf("polica-zaobljena"), 1, types.join(" "));
  });
});

describe("no filler strip alone on the wall", () => {
  it("the last wall unit removed or narrowed: the end panel closes the last cabinet, the strip beyond becomes bare wall", () => {
    const cfg = kitchen({ layout: "ravna", walls: { a: 400, b: 220, c: 220 }, tall: false });
    const p0 = planKitchen(cfg);
    const last = uppersOf(p0).at(-1)!;
    const stretchesEndAtLastCabinet = (c: KitchenConfig) => {
      const p = planKitchen(c);
      const real = uppersOf(p).filter((s) => s.type !== "prazno");
      const end = Math.max(...real.map((s) => s.x + s.width));
      const r = p.runs.find((x) => x.wall === "a")!;
      assert.ok(r.uppers.every((u) => u.to <= end + 2.01), `${JSON.stringify(r.uppers)} vs ${end}`);
      return p;
    };
    const removed = remove(cfg, last.id);
    assert.ok(removed.ok);
    stretchesEndAtLastCabinet(removed.cfg);
    const narrowed = changeWidth(cfg, last.id, 40);
    assert.ok(narrowed.ok);
    stretchesEndAtLastCabinet(narrowed.cfg);
    // the default kitchen still closes its row with the filler beside the last wall unit
    const r0 = p0.runs.find((x) => x.wall === "a")!;
    assert.equal(r0.uppers.length, 1);
    assert.ok(r0.uppers[0].to > last.x + last.width, "the filler stays next to the cabinet");
  });
});
