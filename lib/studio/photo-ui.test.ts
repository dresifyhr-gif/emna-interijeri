/**
 * The studio's controls for the "photo" round (components/studio — optionsModel.ts, room.ts, meta.ts, viewMode.ts,
 * icons.tsx, RunElevation.tsx, WallSchematic.tsx) on top of lib/studio/edit.ts: the camera presets of the
 * view switch, opening per zone, the hob's widths, the oven column's choices, the room's walls with "Bez kuhinje" /
 * "Dodaj kuhinju" / a bare wall, the drawings of drawer splits and camera presets, the 2D views of a one-piece tall unit
 * and of a bare room wall — and the photo kitchen's link, built through exactly these controls.
 *
 *   npx tsx --test lib/studio/photo-ui.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { CameraGlyph, DrawerSplitGlyph } from "../../components/studio/icons";
import { frontZones, roomWallIds } from "../../components/studio/meta";
import {
  BOWL_PLACES,
  CAMERA_PRESETS,
  OVEN_AT,
  OVEN_BELOW,
  cameraPresetDef,
  drawersWord,
  hobChoices,
  openKindOf,
  zoneOpenOptions,
} from "../../components/studio/optionsModel";
import { roomWallRows } from "../../components/studio/room";
import { RunElevation } from "../../components/studio/RunElevation";
import { parseCameraPreset, viewDockHeight } from "../../components/studio/viewMode";
import { WallSchematic } from "../../components/studio/WallSchematic";
import { catalog } from "./catalog";
import {
  elementOptions,
  setBareWall,
  setElementOptions,
  setHeights,
  setOvenColumn,
  setRoomCeiling,
  setWallKitchen,
  setZoneHandles,
  zoneHandleChoices,
  type ElementOptionsInfo,
} from "./edit";
import { openingOf, planKitchen, sanitizeConfig } from "./plan";
import { configFromQuery, encodeConfig } from "./share";
import { DEFAULT_CONFIG, type KitchenConfig, type ViewPreset } from "./types";

const cfgOf = (patch: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...patch });
const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);

/** the photo kitchen (lib/studio/photo.test.ts builds it from the edit helpers) */
const PHOTO_K =
  "2.L.294.420.420.281.bijela.nero-zlatni.bez.1.240.1.0.ra-p90K3P60.rb-v45d60s90B1.ua-v50h90.ub-v45v50v50v50.t-om60V1A2v30.kul-kq.fu-antracit.hc-bijela.si-granit-crni.ta-crna.pl-fronta.fr-tamni-inox.fh-udubljena.zw-kreda.zf-laminat-sivi-hrast.eb-l351.tp-ar.tbl-rv96.h-sp85g50j.wt-20.lz-p0i0.gl-m.zb-c.zc-2";
const photo = () => configFromQuery({ k: PHOTO_K, oblik: null, front: null, top: null });

describe("the view switch: camera presets", () => {
  it("every engine preset once, the orbit first, with names and drawings of their own", () => {
    const ids: ViewPreset[] = ["studio", "prostorija", "frontalno", "odozgo"];
    assert.deepEqual(
      CAMERA_PRESETS.map((c) => c.id),
      ids,
    );
    for (const c of CAMERA_PRESETS) {
      assert.ok(c.name && c.short && c.aria, c.id);
      // a phone's label is never longer than the desktop's
      assert.ok(c.short.length <= Math.max(c.name.length, 10), c.id);
    }
    assert.equal(new Set(ids.map((p) => html(createElement(CameraGlyph, { preset: p })))).size, ids.length, "camera drawings differ");
    // the ceiling can be seen (and switched) only where the camera stands under it
    assert.deepEqual(
      CAMERA_PRESETS.filter((c) => c.ceiling).map((c) => c.id),
      ["prostorija", "frontalno"],
    );
    assert.equal(cameraPresetDef("odozgo").name, "Odozgo");
  });

  it("the remembered preset reads back, anything else is the orbit", () => {
    for (const p of ["studio", "prostorija", "frontalno", "odozgo"] as const) assert.equal(parseCameraPreset(p), p);
    assert.equal(parseCameraPreset(null), "studio");
    assert.equal(parseCameraPreset("tlocrt"), "studio");
  });

  it("the dock takes its second row (the presets in 3D, the walls of Nacrt)", () => {
    assert.equal(viewDockHeight(false, false), 12 + 42);
    assert.equal(viewDockHeight(false, true), 12 + 42 + 8 + 42);
    assert.equal(viewDockHeight(true, true), 8 + 50 + 6 + 50);
  });

  it("'Strop' puts the ceiling and its light in the link and takes them out again", () => {
    const on = setRoomCeiling(cfgOf({ layout: "L" }), { ceiling: true, lamp: true });
    assert.ok(on.ok);
    assert.equal(on.cfg.room?.ceiling, true);
    assert.equal(on.cfg.room?.lamp, true);
    assert.match(encodeConfig(on.cfg), /\.zc-2$/);
    const off = setRoomCeiling(on.cfg, { ceiling: false, lamp: false });
    assert.equal(encodeConfig(off.cfg), encodeConfig(cfgOf({ layout: "L" })));
  });
});

describe("opening per zone", () => {
  it("the kitchen's way first ('kao kuhinja'), then every other way — Gola too", () => {
    const o = zoneOpenOptions("push");
    assert.deepEqual(
      o.map((x) => x.kind),
      ["push", "rucke", "bez", "luft"],
    );
    assert.equal(o[0].kitchen, true);
    assert.equal(o[0].style, null);
    assert.equal(o.find((x) => x.kind === "bez")?.style, "bez");
    // "Ručke" keeps the kitchen's handle type; a zone with its own handle type keeps that
    assert.equal(zoneOpenOptions("gumb")[0].kind, "rucke");
    assert.equal(zoneOpenOptions("bez", "utor").find((x) => x.kind === "rucke")?.style, "utor");
  });

  it("picking a way stores it for the zone; 'kao kuhinja' drops it — and an element follows its zone", () => {
    const cfg = cfgOf({ layout: "L", handles: "bez" });
    const pick = zoneOpenOptions(cfg.handles).find((x) => x.kind === "push");
    assert.ok(pick);
    const r = setZoneHandles(cfg, "upper", pick.style);
    assert.ok(r.ok);
    assert.equal(zoneHandleChoices(r.cfg).find((z) => z.zone === "upper")?.value, "push");
    const upper = planKitchen(r.cfg).slots.find((s) => s.zone === "upper");
    assert.ok(upper);
    assert.equal(openKindOf(openingOf(r.cfg, upper.opt, upper.zone)), "push");
    const back = setZoneHandles(r.cfg, "upper", zoneOpenOptions(r.cfg.handles)[0].style);
    assert.equal(encodeConfig(back.cfg), encodeConfig(cfg));
  });

  it("only the zones the kitchen has are offered", () => {
    assert.deepEqual(frontZones(planKitchen(cfgOf({ layout: "ravna", tall: false }))).includes("tall"), false);
    assert.ok(frontZones(planKitchen(cfgOf({ layout: "otok" }))).includes("island"));
  });
});

describe("element options: hob, sink, oven column, drawers", () => {
  it("a 90 cm hob cabinet offers a 60 cm hob; its own width is marked 'standardno' and picking it drops the option", () => {
    const cfg = photo();
    const hob = planKitchen(cfg).slots.find((s) => s.type === "ploca" && s.width >= 89);
    assert.ok(hob, "the photo's 90 cm hob");
    const info = elementOptions(cfg, hob.id)?.hob;
    assert.ok(info);
    const ch = hobChoices(info, hob.width);
    assert.equal(ch.value, 60);
    assert.ok(ch.options.includes(60) && ch.options.includes(ch.auto));
    assert.ok(ch.options.every((w) => w <= hob.width - 2));
    const r = setElementOptions(cfg, hob.id, { hob: undefined });
    assert.equal(elementOptions(r.cfg, r.slotId ?? hob.id)?.hob?.value, ch.auto);
  });

  it("the sink's bowl places are what the element offers", () => {
    const cfg = photo();
    const sink = planKitchen(cfg).slots.find((s) => s.type === "sudoper");
    assert.ok(sink);
    const bowl = elementOptions(cfg, sink.id)?.bowl;
    assert.ok(bowl);
    assert.equal(bowl.value, "left");
    assert.deepEqual(
      BOWL_PLACES.map((b) => b.id),
      bowl.options,
    );
  });

  it("every oven column choice goes through setOvenColumn and reads back", () => {
    const cfg = photo();
    const oven = planKitchen(cfg).slots.find((s) => s.type === "pecnica-mikro");
    assert.ok(oven);
    for (const at of OVEN_AT) {
      for (const below of OVEN_BELOW) {
        const r = setOvenColumn(cfg, oven.id, { at: at.id, below: below.id });
        assert.ok(r.ok, `${at.id} / ${below.id}`);
        const got: ElementOptionsInfo["oven"] = elementOptions(r.cfg, r.slotId ?? oven.id)?.oven;
        assert.deepEqual(got, { below: below.id, at: at.id, micro: true });
      }
    }
    const noMicro = setOvenColumn(cfg, oven.id, { micro: false });
    assert.ok(noMicro.ok);
    assert.equal(elementOptions(noMicro.cfg, noMicro.slotId ?? oven.id)?.oven?.micro, false);
  });

  it("drawer splits: a drawing each (to scale, the Gola channel between drawers when asked), named by count", () => {
    const drawn = catalog.drawerLayouts.map((d) => html(createElement(DrawerSplitGlyph, { ratios: d.ratios })));
    assert.equal(new Set(drawn).size, drawn.length, "drawer drawings differ");
    for (const d of catalog.drawerLayouts) {
      const svg = html(createElement(DrawerSplitGlyph, { ratios: d.ratios }));
      assert.equal(svg.match(/<rect/g)?.length, d.ratios.length, d.id);
      const mid = html(createElement(DrawerSplitGlyph, { ratios: d.ratios, mid: true }));
      assert.equal(mid.match(/<rect/g)?.length, 2 * d.ratios.length - 1, `${d.id} with channels`);
    }
    assert.equal(drawersWord(2), "2 ladice");
    assert.equal(drawersWord(5), "5 ladica");
  });
});

describe("the room's walls ('Zidovi')", () => {
  it("an L kitchen: wall B can go without its kitchen, a bare wall C can be added", () => {
    const cfg = cfgOf({ layout: "L" });
    const rows = roomWallRows(cfg);
    const [a, b, c] = rows;
    assert.equal(a.takeOff, null, "wall A always has the kitchen");
    assert.ok(b.kitchen && b.takeOff);
    assert.equal(b.takeOff.cfg.layout, "ravna");
    assert.deepEqual(b.takeOff.cfg.room?.bare, ["b"]);
    assert.ok(!c.kitchen && !c.bare && c.canBare && c.putOn === null);
    const bare = setBareWall(cfg, "c", true);
    assert.ok(bare.ok);
    assert.deepEqual(roomWallIds(bare.cfg), ["a", "b", "c"]);
    // a bare wall can get the kitchen back: L + bare C → U
    const c2 = roomWallRows(bare.cfg)[2];
    assert.ok(c2.bare && c2.putOn);
    assert.equal(c2.putOn.cfg.layout, "U");
  });

  it("a U kitchen: wall B cannot go alone (no layout for A + C), wall C can", () => {
    const rows = roomWallRows(cfgOf({ layout: "U" }));
    assert.equal(rows[1].takeOff, null);
    assert.equal(rows[2].takeOff?.cfg.layout, "L");
    // the refusal the UI never offers says why
    const r = setWallKitchen(cfgOf({ layout: "U" }), "b", false);
    assert.equal(r.ok, false);
    assert.match(r.warning ?? "", /zida C/);
  });

  it("the room's floor plan in 'Zidovi' draws a bare wall with its length", () => {
    const cfg = setBareWall(cfgOf({ layout: "L", walls: { a: 300, b: 250, c: 330 } }), "c", true).cfg;
    const svg = html(createElement(WallSchematic, { plan: planKitchen(cfg), focus: null }));
    assert.match(svg, /zid C 330 cm, bez kuhinje/);
    assert.match(svg, />330 cm</);
    const none = html(createElement(WallSchematic, { plan: planKitchen(cfgOf({ layout: "L", walls: { a: 300, b: 250, c: 330 } })), focus: null }));
    assert.doesNotMatch(none, /330 cm/);
  });
});

describe("the 'Elementi' drawing: tall units in one piece", () => {
  it("a one-piece tall unit has no split line, the others keep theirs", () => {
    const cfg = setHeights(cfgOf({ layout: "L", ceiling: 280 }), { mode: "do-stropa" }).cfg;
    const plan = planKitchen(cfg);
    assert.notEqual(plan.heights.tallSplit, null, "the kitchen splits its tall units");
    const tall = plan.slots.filter((s) => s.zone === "tall");
    assert.ok(tall.length > 0);
    const run = tall[0].run;
    const lines = (c: KitchenConfig) => html(createElement(RunElevation, { plan: planKitchen(c), run })).match(/<line/g)?.length ?? 0;
    const before = lines(cfg);
    const one = setElementOptions(cfg, tall[0].id, { onePiece: true });
    assert.ok(one.ok);
    assert.equal(lines(one.cfg), before - 1, "one split line less");
    const all = setHeights(cfg, { onePiece: true });
    assert.equal(lines(all.cfg), before - tall.filter((s) => s.run === run).length);
  });
});

describe("the photo kitchen through the studio's controls", () => {
  it("decodes, plans and links back to itself", () => {
    const cfg = photo();
    assert.equal(encodeConfig(cfg), PHOTO_K);
    assert.deepEqual(roomWallIds(cfg), ["a", "b", "c"]);
    assert.equal(roomWallRows(cfg)[2].bare, true);
    // the ceiling the view switch's "Strop" shows
    assert.equal(cfg.room?.ceiling && cfg.room?.lamp, true);
  });
});
