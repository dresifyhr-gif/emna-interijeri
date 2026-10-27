/**
 * Style presets (lib/studio/presets.ts — "Stil" in the phone's step-by-step flow): every id is a catalog id, applying a
 * preset changes finishes only (never what stands where), the look survives a share link, and the studio recognises the
 * preset it wears.
 *
 *   npx tsx --test lib/studio/presets.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { catalog } from "./catalog";
import { changeType, insertAtGap, gapsOf, setElementOptions } from "./edit";
import { planKitchen, sanitizeConfig } from "./plan";
import { applyPreset, matchPreset, presetById, STYLE_PRESETS } from "./presets";
import { configFromQuery, encodeConfig } from "./share";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout } from "./types";

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const cfgOf = (patch: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...patch });
const ids = (list: readonly { id: string }[]) => new Set(list.map((x) => x.id));

/** what stands where: every slot's id, type, width and place (the plan without its finishes) */
const layoutOf = (cfg: KitchenConfig) =>
  planKitchen(cfg)
    .slots.map((s) => `${s.id}:${s.type}:${s.width}@${Math.round(s.x)}`)
    .join(" ");

describe("style presets — data", () => {
  it("five or six presets with unique ids and Croatian names", () => {
    assert.ok(STYLE_PRESETS.length >= 5 && STYLE_PRESETS.length <= 6, `${STYLE_PRESETS.length} presets`);
    assert.equal(new Set(STYLE_PRESETS.map((p) => p.id)).size, STYLE_PRESETS.length);
    for (const p of STYLE_PRESETS) {
      assert.match(p.id, /^[a-z0-9-]+$/);
      assert.ok(p.name.trim().length > 3 && p.note.trim().length > 10, p.id);
      assert.equal(presetById(p.id), p);
    }
  });

  it("every id is a catalog id", () => {
    const fronts = ids(catalog.fronts);
    const tops = ids(catalog.tops);
    const handles = ids(catalog.handles);
    const colors = ids(catalog.finishes.handleColors);
    const sinks = ids(catalog.finishes.sinks);
    const taps = ids(catalog.finishes.taps);
    const appliances = ids(catalog.finishes.appliances);
    const leds = ids(catalog.finishes.leds);
    const walls = ids(catalog.room.walls);
    const floors = ids(catalog.room.floors);
    for (const p of STYLE_PRESETS) {
      assert.ok(fronts.has(p.front), `${p.id}: front ${p.front}`);
      assert.ok(tops.has(p.top), `${p.id}: top ${p.top}`);
      assert.ok(handles.has(p.handles), `${p.id}: handles ${p.handles}`);
      if (p.handleColor) assert.ok(colors.has(p.handleColor), `${p.id}: handle colour ${p.handleColor}`);
      if (p.sink) assert.ok(sinks.has(p.sink), `${p.id}: sink ${p.sink}`);
      if (p.tap) assert.ok(taps.has(p.tap), `${p.id}: tap ${p.tap}`);
      if (p.appliances) assert.ok(appliances.has(p.appliances), `${p.id}: appliances ${p.appliances}`);
      if (p.ledColor) assert.ok(leds.has(p.ledColor), `${p.id}: led ${p.ledColor}`);
      assert.ok(walls.has(p.wall), `${p.id}: wall ${p.wall}`);
      assert.ok(floors.has(p.floor), `${p.id}: floor ${p.floor}`);
      if (p.backsplash?.finish) {
        const b = catalog.backsplashes.find((x) => x.id === p.backsplash?.finish);
        assert.ok(b, `${p.id}: backsplash ${p.backsplash.finish}`);
        assert.equal(b.kind, p.backsplash.kind, `${p.id}: backsplash kind`);
      }
      // a handle colour only where the opening style shows one
      const def = catalog.handles.find((h) => h.id === p.handles);
      if (p.handleColor) assert.ok(def?.coloured, `${p.id}: ${p.handles} has no colour`);
    }
  });

  it("the presets look different from each other (front + worktop)", () => {
    const looks = STYLE_PRESETS.map((p) => `${p.front}/${p.top}`);
    assert.equal(new Set(looks).size, looks.length);
  });
});

describe("applyPreset — finishes only", () => {
  for (const layout of LAYOUTS) {
    it(`${layout}: every preset changes the look and nothing that stands`, () => {
      const base = cfgOf({ layout, window: { wall: "a", offset: 120, width: 100, sill: 95 } });
      for (const p of STYLE_PRESETS) {
        const r = applyPreset(base, p);
        assert.ok(r.ok, `${p.id}: ${r.warning}`);
        const c = r.cfg;
        assert.equal(c.front, p.front);
        assert.equal(c.top, p.top);
        assert.equal(c.handles, p.handles);
        assert.equal(c.led, p.led);
        assert.equal(c.room?.wall ?? "studio", p.wall);
        assert.equal(c.room?.floor ?? "studio", p.floor);
        // the same kitchen: layout, room, heights and every element in its place
        assert.equal(c.layout, base.layout);
        assert.deepEqual(c.walls, base.walls);
        assert.equal(c.ceiling, base.ceiling);
        assert.deepEqual(c.window, base.window);
        assert.equal(c.island, base.island);
        assert.deepEqual(c.heights, base.heights);
        assert.equal(layoutOf(c), layoutOf(base), `${layout} / ${p.id}: the elements moved`);
      }
    });
  }

  it("one look for the whole kitchen: two-tone zones and zone opening styles go, an element's own options stay", () => {
    let c = cfgOf({ layout: "L", zoneFronts: { upper: "bijela", tall: "hrast" }, zoneHandles: { upper: "push" } });
    const plan = planKitchen(c);
    const drawers = plan.slots.find((s) => s.zone === "base" && s.list && s.type.startsWith("ladice"));
    assert.ok(drawers);
    const own = setElementOptions(c, drawers.id, { open: "gumb" });
    assert.ok(own.ok, own.warning ?? "");
    c = own.cfg;
    const r = applyPreset(c, "grafit-mramor");
    assert.ok(r.ok);
    assert.equal(r.cfg.zoneFronts, undefined);
    assert.equal(r.cfg.zoneHandles, undefined);
    const opens = Object.values(r.cfg.runs ?? {}).flatMap((l) => (l ?? []).map((e) => e.opt?.open));
    assert.ok(opens.includes("gumb"), "the element's own opening style stays");
  });

  it("keeps the customer's elements: an edited run and a swapped element stay as they are", () => {
    let c = cfgOf({ layout: "ravna" });
    const gap = gapsOf(c).find((g) => g.kind === "seam" && g.zone === "base");
    assert.ok(gap);
    const ins = insertAtGap(c, gap.id, "ladice", 40);
    assert.ok(ins.ok, ins.warning ?? "");
    c = ins.cfg;
    const plan = planKitchen(c);
    const doors = plan.slots.find((s) => s.zone === "upper" && s.type === "vrata");
    assert.ok(doors);
    const sw = changeType(c, doors.id, "vitrina");
    assert.ok(sw.ok, sw.warning ?? "");
    c = sw.cfg;
    for (const p of STYLE_PRESETS) assert.equal(layoutOf(applyPreset(c, p).cfg), layoutOf(c), p.id);
  });

  it("single-wall room finishes give way to the preset's one finish", () => {
    const c = cfgOf({ room: { wall: "bijela", walls: { b: "cigla" }, floor: "parket" } });
    const r = applyPreset(c, "zelena-crni-mramor");
    assert.equal(r.cfg.room?.walls, undefined);
    assert.equal(r.cfg.room?.wall, "kreda");
    assert.equal(r.cfg.room?.floor, "riblja-kost");
  });

  it("the oak worktop gets white tiles behind it; a stone preset goes back to the worktop material", () => {
    const oak = applyPreset(cfgOf({}), "bijela-hrast").cfg;
    // (the first tiles of their kind are the default: a link leaves the finish out)
    assert.equal(oak.backsplash?.kind, "plocice");
    assert.equal(oak.backsplash?.finish ?? "subway-bijele", "subway-bijele");
    const stone = applyPreset(oak, "bijeli-lak-crni-kamen").cfg;
    assert.equal(stone.backsplash?.kind ?? "ploca", "ploca");
  });

  it("an unknown preset is refused and changes nothing", () => {
    const c = cfgOf({});
    const r = applyPreset(c, "nema-ga");
    assert.equal(r.ok, false);
    assert.ok(r.warning);
    assert.equal(encodeConfig(r.cfg), encodeConfig(c));
  });
});

describe("matchPreset and share links", () => {
  it("the studio recognises the preset a kitchen wears, and the default kitchen wears none", () => {
    assert.equal(matchPreset(cfgOf({})), null);
    for (const p of STYLE_PRESETS) assert.equal(matchPreset(applyPreset(cfgOf({ layout: "U" }), p).cfg), p.id);
  });

  it("a two-tone kitchen wears no preset", () => {
    const c = applyPreset(cfgOf({}), "antracit-kamen").cfg;
    assert.equal(matchPreset({ ...c, zoneFronts: { upper: "bijela" } }), null);
  });

  it("a shared link opens the same look", () => {
    for (const p of STYLE_PRESETS) {
      const c = applyPreset(cfgOf({ layout: "otok" }), p).cfg;
      const back = configFromQuery({ k: encodeConfig(c) });
      assert.equal(back.front, p.front);
      assert.equal(back.top, p.top);
      assert.equal(back.handles, p.handles);
      assert.equal(back.room?.wall, p.wall);
      assert.equal(back.room?.floor, p.floor);
      assert.equal(matchPreset(back), p.id);
      assert.equal(encodeConfig(back), encodeConfig(c));
    }
  });
});
