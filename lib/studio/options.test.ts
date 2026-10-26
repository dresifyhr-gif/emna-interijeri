/**
 * The owner's "sve što možeš zamisliti" round: hoods (hidden / chimney / angled glass / downdraft, the island's cassette),
 * glass of vitrines (kind, frame, LED, shelves — kitchen default and per element), end units (završeci: rounded / angled
 * shelves, thick side panels), the depth of the "do stropa" top row, opening styles per element (luft, push), worktop
 * thickness, backsplash kinds, floating shelves, rails and the extras (coffee nook, wine column, LED niche) — older links
 * untouched, share links, price, summary, the admin quote prefill, the edit helpers and the engine (headless).
 *
 *   npx tsx --test lib/studio/options.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { quoteFromConfig } from "../admin/quote-from-config";
import { catalog, endTypes, hoodWidthFor, moduleDef } from "./catalog";
import {
  backsplashChoices,
  changeType,
  changeWidth,
  elementOptions,
  glassChoices,
  heightChoices,
  hoodChoices,
  railChoices,
  setBacksplash,
  setElementOptions,
  setGlass,
  setHeights,
  setHood,
  setRail,
  setWallShelves,
  setWorktop,
  worktopChoices,
} from "./edit";
import { buildKitchen, type KitchenEnv } from "./engine/kitchen";
import { GeoCache } from "./engine/geo";
import { createModule } from "./engine/modules";
import { moduleCtx } from "./engine/kitchen";
import { DIM, geometryKey, planKitchen, sanitizeConfig, type KitchenPlan } from "./plan";
import { backsplashArea, breakdown, estimate } from "./price";
import { decodeConfig, encodeConfig } from "./share";
import { summarize } from "./summary";
import { DEFAULT_CONFIG, type HandleStyle, type KitchenConfig, type Layout } from "./types";

const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const hobOf = (p: KitchenPlan) => p.slots.find((s) => s.id === p.hobId)!;
const quoteAddsUp = (cfg: KitchenConfig, label: string) => {
  const b = breakdown(cfg);
  const q = quoteFromConfig(cfg, { vatPct: 25, newId: () => "x" });
  assert.equal(q.mode, "plan", label);
  const gross = q.items.reduce((sum, it) => sum + (it.unit_price_cents * it.qty * 1.25) / 100, 0);
  assert.ok(Math.abs(gross - b.total) < Math.max(5, b.total * 0.005), `${label}: ${gross} vs ${b.total}`);
  assert.ok(!q.items.some((it) => /^Ostalo/.test(it.description)), `${label}: everything itemised`);
  return q;
};

/** every new option at once (an L kitchen 5,2 m × 3,2 m, do stropa on a 3 m ceiling) */
const everything = (): KitchenConfig =>
  kitchen({
    layout: "L",
    walls: { a: 520, b: 320, c: 220 },
    ceiling: 300,
    handles: "luft",
    heights: { mode: "do-stropa", topDepth: 45 },
    hood: { kind: "dimnjak", finish: "crna" },
    glass: { type: "satinirano", frame: "alu-crni" },
    worktop: { thickness: 2 },
    backsplash: { kind: "plocice", finish: "zellige-zelene" },
    rails: ["a"],
    runs: {
      a: [
        { type: "ladice", width: 60, opt: { open: "push" } },
        { type: "sudoper", width: 80 },
        { type: "perilica", width: 60 },
        { type: "vitrina", width: 50, opt: { glass: { type: "rebrasto", frame: "zlatni" } } },
        { type: "vinoteka", width: 30 },
        { type: "police-zaobljene", width: 30 },
      ],
      b: [
        { type: "bocna-radna", width: 6 },
        { type: "ladice", width: 60 },
        { type: "ploca", width: 80 },
        { type: "ladice4", width: 60 },
      ],
    },
    upperRuns: {
      a: [
        { type: "vitrina", width: 60 },
        { type: "vrata", width: 60, opt: { depth: 60 } },
        { type: "police-visece", width: 90, opt: { rows: 3, led: false } },
      ],
    },
    tallRun: [
      { type: "kava", width: 60 },
      { type: "vinoteka", width: 30 },
      { type: "bocna-rebrasta", width: 6 },
    ],
  });

describe("older links", () => {
  it("decode to the same kitchen and encode to the same string (no new field appears)", () => {
    const links = [
      "2.L.380.220.220.260.antracit.mramor.bez.1.240.1.0",
      "2.U.420.300.320.260.siva-svijetla.calacatta.utor.1.240.1.a-120-100-100.uc-x60v40.t-o60b60r60.kbl-kl.fu-hrast-bijeljeni.ft-antracit.hc-mesing.si-granit-crni.ta-mesing.ap-inox.pl-fronta.le-neutralno.zw-pijesak.zf-plocice-tamne",
      "2.otok.420.220.220.280.hrast.crni.push.1.240.1.0.ri-l60vv80p60l60.o-f1p30n3.h-sp95",
      "2.ravna.500.220.220.260.bijela.beton.letvica.0.240.1.0.ra-l60Tr60s80d60p60.ua-v60g60x30n30",
    ];
    for (const link of links) {
      const cfg = decodeConfig(link)!;
      assert.ok(cfg, link);
      for (const k of ["hood", "glass", "worktop", "backsplash", "rails"] as const) assert.equal(cfg[k], undefined, `${link}: ${k}`);
      const all = [...Object.values(cfg.runs ?? {}), ...Object.values(cfg.upperRuns ?? {}), cfg.tallRun ?? []].flat();
      assert.ok(all.every((e) => e.opt === undefined), `${link}: no element options`);
      assert.equal(encodeConfig(cfg), encodeConfig(decodeConfig(encodeConfig(cfg))!), link);
      assert.deepEqual(decodeConfig(encodeConfig(cfg)), cfg, link);
    }
  });

  it("default kitchens: no element looks, no visible hood, no rail, nothing new priced or named", () => {
    for (const layout of LAYOUTS) {
      for (const handles of ["bez", "letvica", "push"] as HandleStyle[]) {
        const cfg = kitchen({ layout, handles, islandSpec: layout === "otok" ? { functions: "hob" } : undefined });
        const p = planKitchen(cfg);
        assert.ok(p.slots.every((s) => s.look === undefined && s.opt === undefined && s.end === undefined), `${layout} ${handles}`);
        assert.ok(p.runs.every((r) => r.hoods.length === 0 && r.rail === null), layout);
        assert.equal(p.heights.worktopT, DIM.worktopT);
        if (p.island?.hood) assert.equal(p.island.hood.style, "dimnjak");
        const b = breakdown(cfg);
        assert.equal(b.glass + b.hoods + b.rails, 0, layout);
        const lines = summarize(cfg).join("\n");
        assert.doesNotMatch(lines, /Staklo vitrina|Reling|debljina|zidna s dimnjakom|stropna kaseta/, layout);
        assert.equal(geometryKey(cfg), geometryKey(sanitizeConfig({ ...cfg, hood: {}, glass: {}, worktop: { thickness: 4 } })), layout);
      }
    }
  });
});

describe("share links", () => {
  it("round-trip every new field, and element options in lists of every zone", () => {
    const cfg = everything();
    const link = encodeConfig(cfg);
    assert.match(link, /\.n-k1f1\./);
    assert.match(link, /\.g-t1r1(\.|$)/);
    assert.match(link, /\.wt-20(\.|$)/);
    assert.match(link, /\.bs-zellige-zelene(\.|$)/);
    assert.match(link, /\.rl-a(\.|$)/);
    assert.match(link, /\.h-sd45(\.|$)/);
    assert.match(link, /l60O4/);
    assert.match(link, /g50G4F3/);
    assert.match(link, /pv90N3L0/);
    assert.deepEqual(decodeConfig(link), cfg);
    for (const over of [
      { hood: { kind: "kosa" as const, island: "kaseta" as const } },
      { hood: { kind: "ploca" as const } },
      { glass: { led: false, shelves: false } },
      { backsplash: { kind: "pola" as const } },
      { backsplash: { kind: "bez" as const } },
      { backsplash: { kind: "staklo" as const, finish: "staklo-crno" } },
      { worktop: { thickness: 1.2 } },
      { handles: "luft" as const },
      { runs: { a: [{ type: "ploca", width: 60, opt: { hood: "kosa" as const } }, { type: "vrata", width: 60, opt: { open: "luft" as const } }] } },
      { runs: { a: [{ type: "ladice", width: 60 }, { type: "hladnjak", width: 60, tall: true as const, opt: { open: "push" as const } }] } },
    ]) {
      const c = kitchen({ layout: "ravna", walls: { a: 420, b: 220, c: 220 }, ...over });
      assert.deepEqual(decodeConfig(encodeConfig(c)), c, JSON.stringify(over));
    }
  });

  it("sanitizing keeps only what applies to an element and snaps values", () => {
    const c = kitchen({
      layout: "ravna",
      heights: { mode: "do-stropa", topDepth: 50 },
      worktop: { thickness: 3 },
      upperRuns: {
        a: [
          { type: "vrata", width: 60, opt: { glass: { type: "dimljeno" }, depth: 41, rows: 3, hood: "dimnjak" } as never },
          { type: "vitrina", width: 60, opt: { glass: { type: "nepoznato", frame: "inox" } } as never },
          { type: "police-visece", width: 60, opt: { rows: 9, open: "push" } as never },
        ],
      },
    });
    assert.equal(c.heights?.topDepth, 45);
    assert.equal(c.worktop?.thickness, 2, "3 cm snaps to the nearest offered (the thinner on a tie)");
    const [door, vitrine, shelves] = c.upperRuns!.a!;
    assert.deepEqual(door.opt, { depth: 45 }, "a door has no glass, rows or hood; the depth snaps");
    assert.deepEqual(vitrine.opt, { glass: { frame: "inox" } });
    assert.deepEqual(shelves.opt, { rows: 3 }, "floating shelves have no fronts to open");
  });
});

describe("hoods", () => {
  it("a chimney / angled glass hood takes the wall units' place above the hob and follows its width", () => {
    for (const kind of ["dimnjak", "kosa"] as const) {
      for (const layout of ["ravna", "L", "U"] as Layout[]) {
        const cfg = kitchen({ layout, hood: { kind } });
        const p = planKitchen(cfg);
        const hob = hobOf(p);
        const r = p.runs.find((x) => x.wall === hob.run)!;
        assert.equal(r.hoods.length, 1, `${kind} ${layout}`);
        const h = r.hoods[0];
        assert.equal(h.kind, kind);
        assert.equal(h.hob, hob.id);
        assert.equal(h.width, hoodWidthFor(hob.width));
        assert.ok(Math.abs((h.from + h.to) / 2 - (hob.x + hob.width / 2)) < 0.01, "centred above the hob");
        assert.ok(h.top < cfg.ceiling && h.bottom > p.heights.worktop + 40);
        const ups = p.slots.filter((s) => s.run === hob.run && s.zone === "upper");
        assert.ok(ups.every((u) => u.x + u.width <= h.from + 0.01 || u.x >= h.to - 0.01), `${kind} ${layout}: no wall unit above the hood`);
        assert.ok(!ups.some((u) => moduleDef("upper", u.type)?.hood), "no hidden hood element");
        assert.ok(p.pieces.filter((x) => x.run === hob.run && x.zone === "upper").every((x) => x.x + x.width <= h.from + 0.01 || x.x >= h.to - 0.01));
        assert.match(summarize(cfg).join("\n"), kind === "dimnjak" ? /Napa: zidna s dimnjakom/ : /Napa: kosa staklena/);
        assert.ok(breakdown(cfg).hoods > 0);
        const q = quoteAddsUp(cfg, `${kind} ${layout}`);
        assert.ok(q.items.some((it) => /montaža/.test(it.description) && /napa/i.test(it.description)));
      }
    }
    assert.deepEqual([60, 80, 90, 100, 120].map(hoodWidthFor), [60, 90, 90, 120, 120]);
  });

  it("a downdraft hob has no hood anywhere, and the wall units stay above it", () => {
    const cfg = kitchen({ layout: "L", hood: { kind: "ploca" } });
    const p = planKitchen(cfg);
    assert.ok(p.runs.every((r) => r.hoods.length === 0));
    assert.ok(!p.slots.some((s) => s.zone === "upper" && moduleDef("upper", s.type)?.hood));
    const hob = hobOf(p);
    assert.ok(p.slots.some((u) => u.run === hob.run && u.zone === "upper" && u.x < hob.x + hob.width / 2 && u.x + u.width > hob.x + hob.width / 2), "a wall unit above the hob");
    assert.match(summarize(cfg).join("\n"), /Napa: u ploči/);
    const isl = planKitchen(kitchen({ layout: "otok", hood: { kind: "ploca" }, islandSpec: { functions: "hob" } }));
    assert.equal(isl.island?.hood, null, "nor above an island hob");
    quoteAddsUp(cfg, "downdraft");
  });

  it("per hob: its own hood; an edited wall-unit list keeps its hood element and gets it back", () => {
    const c0 = kitchen({ layout: "L" });
    const hob = hobOf(planKitchen(c0));
    const r = setElementOptions(c0, hob.id, { hood: "dimnjak" });
    assert.ok(r.ok, r.warning ?? "");
    const p = planKitchen(r.cfg);
    assert.equal(p.runs.find((x) => x.wall === hob.run)!.hoods.length, 1);
    assert.match(r.warning ?? "", /vidljiva napa/);
    assert.equal(elementOptions(r.cfg, r.slotId!)?.hood?.own, true);
    // an edited wall-unit list with its hood element: hidden under a visible hood, back with the hidden one
    const up = `${hob.run}:u`;
    const ed = kitchen({ layout: "L", upperRuns: { [hob.run]: planKitchen(c0).lists.find((l) => l.id === up)!.entries } as never });
    assert.ok(planKitchen(ed).slots.some((s) => s.zone === "upper" && s.type === "napa"));
    const vis = setHood(ed, { kind: "kosa" });
    assert.ok(!planKitchen(vis.cfg).slots.some((s) => s.zone === "upper" && s.type === "napa"));
    assert.ok(!planKitchen(vis.cfg).warnings.some((w) => /napu/.test(w)), "no note: the hood took its place");
    assert.ok(planKitchen(setHood(vis.cfg, null).cfg).slots.some((s) => s.zone === "upper" && s.type === "napa"));
    // a hood element where the hob has a visible hood is refused with a reason
    const upper = planKitchen(vis.cfg).slots.find((s) => s.run === hob.run && s.zone === "upper" && s.list && !s.corner && moduleDef("upper", "napa")!.widths.includes(s.width));
    if (upper) {
      const x = changeType(vis.cfg, upper.id, "napa");
      assert.equal(x.ok, false);
    }
    const ch = hoodChoices(vis.cfg);
    assert.equal(ch.kind, "kosa");
    assert.ok(ch.hobs.length >= 1 && ch.finishShown);
  });

  it("the island: a ceiling cassette flush with the ceiling, in the hood finish", () => {
    const cfg = kitchen({ layout: "otok", ceiling: 270, hood: { island: "kaseta", finish: "bijela" }, islandSpec: { functions: "hob" } });
    const h = planKitchen(cfg).island!.hood!;
    assert.equal(h.style, "kaseta");
    assert.equal(h.top, 270);
    assert.equal(h.bottom, 270 - DIM.hoodCassette);
    assert.equal(h.finish, "bijela");
    assert.match(summarize(cfg).join("\n"), /stropna kaseta/);
    const canopy = kitchen({ layout: "otok", ceiling: 270, islandSpec: { functions: "hob" } });
    assert.ok(breakdown(cfg).island > breakdown(canopy).island, "the cassette costs more to fit");
    const q = quoteAddsUp(cfg, "kaseta");
    assert.ok(q.items.some((it) => /stropne kasete/.test(it.description)));
  });
});

describe("glass and vitrines", () => {
  it("the kitchen's glass applies to every glass-door element, an element's own over it; frosted / framed cost more", () => {
    const base = kitchen({ layout: "ravna", walls: { a: 420, b: 220, c: 220 }, upperRuns: { a: [{ type: "vitrina", width: 60 }, { type: "vitrina", width: 80 }, { type: "vrata", width: 60 }] } });
    const k = setGlass(base, { type: "satinirano", frame: "inox" }).cfg;
    const p = planKitchen(k);
    const vit = p.slots.filter((s) => s.type === "vitrina");
    assert.ok(vit.every((s) => s.look && /satinirano/.test(s.look)));
    assert.ok(!p.slots.some((s) => s.type === "vrata" && s.look), "not a door");
    assert.ok(breakdown(k).glass > 0 && breakdown(base).glass === 0);
    const own = setElementOptions(k, vit[0].id, { glass: { type: "broncano", led: false } });
    assert.ok(own.ok);
    const g = glassChoices(own.cfg, own.slotId!)!;
    assert.equal(g.value.type, "broncano");
    assert.equal(g.value.frame, "inox", "the kitchen's frame stays");
    assert.equal(g.value.led, false);
    assert.match(summarize(own.cfg).join("\n"), /brončano staklo, okvir tanki inox, bez LED-a/);
    const q = quoteAddsUp(own.cfg, "glass");
    assert.ok(q.items.filter((it) => /^Staklo vitrina/.test(it.description)).length === 2);
    // a width / type change keeps what still applies
    const wider = changeWidth(own.cfg, own.slotId!, 50);
    assert.ok(wider.ok, wider.warning ?? "");
    assert.equal(glassChoices(wider.cfg, wider.slotId!)!.value.type, "broncano");
    const door = changeType(own.cfg, own.slotId!, "vrata");
    assert.ok(door.ok);
    assert.equal(planKitchen(door.cfg).slots.find((x) => x.id === door.slotId)!.opt, undefined, "a door has no glass");
    // back to the kitchen's glass
    const back = setElementOptions(own.cfg, own.slotId!, { glass: undefined });
    assert.equal(glassChoices(back.cfg, back.slotId!)!.value.type, "satinirano");
  });

  it("vitrines in every zone and the diagonal corner vitrine take the glass", () => {
    for (const zone of ["base", "upper", "tall"] as const) assert.ok(catalog.modules.some((m) => m.zone === zone && m.glass && m.id === "vitrina"), zone);
    assert.ok(moduleDef("upper", "kutni-dijagonalni-staklo")?.glass);
  });
});

describe("end units (završeci)", () => {
  it("at a free end they take the end panel's place; in the middle they are plain; widths are unchanged", () => {
    const list = (end: string, w: number) => [{ type: "ladice", width: 60 }, { type: "vrata", width: 60 }, { type: end, width: w }];
    for (const [type, w] of [
      ["police-zaobljene", 30],
      ["police-kose", 40],
      ["bocna", 6],
      ["bocna-radna", 4],
      ["bocna-rebrasta", 8],
    ] as const) {
      const cfg = kitchen({ layout: "L", walls: { a: 380, b: 300, c: 220 }, runs: { b: list(type, w).reverse() } });
      const p = planKitchen(cfg);
      const s = p.slots.find((x) => x.run === "b" && x.type === type)!;
      assert.ok(s.end, `${type} ends B's open end`);
      assert.equal(s.end!.side, "left");
      assert.equal(s.end!.pad, DIM.panel);
      assert.ok(!p.pieces.some((x) => x.run === "b" && x.zone === "base" && x.kind === "panel" && x.x + x.width <= s.x + 0.01), "no end panel beyond it");
      assert.match(summarize(cfg).join("\n"), /završetak lijevog kraja/);
      quoteAddsUp(cfg, type);
      // the same element in the middle of the run
      const mid = planKitchen(kitchen({ layout: "L", walls: { a: 380, b: 300, c: 220 }, runs: { b: [{ type: "ladice", width: 60 }, { type, width: w }, { type: "vrata", width: 60 }] } }));
      assert.ok(!mid.slots.find((x) => x.type === type)!.end);
    }
    assert.deepEqual(
      endTypes("base").map((d) => d.id),
      ["police-zaobljene", "police-kose", "bocna", "bocna-radna", "bocna-rebrasta"],
    );
  });

  it("wall units and the tall column end the same way; a stone side panel is priced as stone", () => {
    const cfg = kitchen({
      layout: "ravna",
      walls: { a: 420, b: 220, c: 220 },
      upperRuns: { a: [{ type: "polica-zaobljena", width: 30 }, { type: "vrata", width: 60 }, { type: "police-visece", width: 90 }] },
      tallRun: [{ type: "hladnjak", width: 60 }, { type: "bocna", width: 6 }],
    });
    const p = planKitchen(cfg);
    assert.equal(p.slots.find((s) => s.type === "polica-zaobljena")!.end?.side, "left");
    const t = p.slots.find((s) => s.zone === "tall" && s.type === "bocna")!;
    assert.equal(t.end?.side, "right");
    assert.ok(!p.pieces.some((x) => x.zone === "tall" && x.kind === "panel" && Math.abs(x.x - (t.x + t.width)) < 0.01));
    const stone = kitchen({ layout: "ravna", runs: { a: [{ type: "ladice", width: 60 }, { type: "bocna-radna", width: 6 }] } });
    const panel = kitchen({ layout: "ravna", runs: { a: [{ type: "ladice", width: 60 }, { type: "bocna", width: 6 }] } });
    assert.ok(breakdown(stone).worktop > breakdown(panel).worktop);
    const q = quoteAddsUp(stone, "stone panel");
    assert.ok(q.items.some((it) => /^Bočne ploče od radne ploče/.test(it.description)));
  });
});

describe("top row depth, opening styles, worktop, backsplash, rails, floating shelves", () => {
  it("the do-stropa top row: shallower / deeper than the wall units, per element too, priced in proportion", () => {
    const at = (topDepth?: number) => kitchen({ layout: "L", ceiling: 300, heights: { mode: "do-stropa", ...(topDepth ? { topDepth } : {}) } });
    const p = planKitchen(at(60));
    assert.ok(p.heights.topRow);
    assert.equal(p.heights.topDepth, 60);
    assert.ok(breakdown(at(60)).cabinets > breakdown(at()).cabinets && breakdown(at(30)).cabinets < breakdown(at()).cabinets);
    assert.match(summarize(at(45)).join("\n"), /nadgradni ormarići \d+ cm \(do \d+ cm, dubina 45 cm\)/);
    const hc = heightChoices(at(45));
    assert.equal(hc.topDepth.value, 45);
    assert.ok(hc.topDepth.shown);
    assert.equal(setHeights(at(), { topDepth: 30 }).cfg.heights?.topDepth, 30);
    const u = p.slots.find((s) => s.zone === "upper" && s.list && !s.corner && s.type !== "napa")!;
    const own = setElementOptions(at(), u.id, { depth: 60 });
    assert.ok(own.ok);
    assert.equal(elementOptions(own.cfg, own.slotId!)!.depth!.value, 60);
    quoteAddsUp(own.cfg, "top depth");
  });

  it("luft and push-to-open, kitchen-wide and per element", () => {
    assert.ok(catalog.handles.some((h) => h.id === "luft"));
    const luft = kitchen({ layout: "L", handles: "luft" });
    assert.equal(luft.handles, "luft");
    assert.equal(decodeConfig(encodeConfig(luft))!.handles, "luft");
    const p = planKitchen(luft);
    const s = p.slots.find((x) => x.zone === "base" && x.list && x.type === "ladice")!;
    const r = setElementOptions(luft, s.id, { open: "push" });
    assert.ok(r.ok);
    assert.match(summarize(r.cfg).join("\n"), /Ručke: Luft za prste \(osim: otvaranje na dodir: 1 element\)/);
    const q = quoteAddsUp(r.cfg, "styles");
    assert.ok(q.items.some((it) => /^Otvaranje elemenata – Otvaranje na dodir/.test(it.description)));
    assert.equal(elementOptions(r.cfg, r.slotId!)!.open!.value, "push");
    assert.equal(elementOptions(r.cfg, r.slotId!)!.open!.own, true);
    // open shelves have no fronts
    const sh = kitchen({ layout: "ravna", upperRuns: { a: [{ type: "police-visece", width: 60 }] } });
    const shs = planKitchen(sh).slots.find((x) => x.type === "police-visece")!;
    assert.equal(elementOptions(sh, shs.id)!.open, null);
  });

  it("worktop thickness: the plinth takes the difference, the surface stays", () => {
    for (const t of [1.2, 2, 6]) {
      const r = setWorktop(kitchen({ layout: "L" }), { thickness: t });
      const h = planKitchen(r.cfg).heights;
      assert.equal(h.worktopT, t);
      assert.equal(h.worktop, 90);
      assert.ok(Math.abs(h.plinth + h.carcass + t - 90) < 1e-6);
      assert.match(summarize(r.cfg).join("\n"), /debljina/);
      quoteAddsUp(r.cfg, `worktop ${t}`);
    }
    const low = setWorktop(kitchen({ layout: "L", heights: { mode: "standard", worktop: 85 } }), { thickness: 6 });
    assert.equal(planKitchen(low.cfg).heights.worktop, 87);
    assert.match(low.warning ?? "", /87 cm/);
    assert.equal(worktopChoices(low.cfg).value, 6);
    assert.ok(estimate(kitchen({ layout: "L", worktop: { thickness: 6 } })).low > estimate(kitchen({ layout: "L" })).low);
  });

  it("backsplash: worktop material, half height, none, glass, tiles", () => {
    const k = kitchen({ layout: "L" });
    const full = backsplashArea(planKitchen(k));
    const half = setBacksplash(k, { kind: "pola" }).cfg;
    assert.ok(Math.abs(backsplashArea(planKitchen(half)) - full / 2) < 0.05);
    const none = setBacksplash(k, { kind: "bez" }).cfg;
    assert.equal(backsplashArea(planKitchen(none)), 0);
    assert.equal(breakdown(none).backsplash, 0);
    assert.match(summarize(none).join("\n"), /bez obloge/);
    const glass = setBacksplash(k, { finish: "staklo-crno" });
    assert.ok(glass.ok);
    assert.deepEqual(glass.cfg.backsplash, { kind: "staklo", finish: "staklo-crno" });
    assert.match(summarize(glass.cfg).join("\n"), /Zidna obloga: Crno staklo/);
    const tiles = setBacksplash(k, { kind: "plocice" }).cfg;
    assert.equal(backsplashChoices(tiles).finish, "subway-bijele");
    assert.equal(setBacksplash(tiles, { kind: "staklo", finish: "hex-crne" }).ok, false, "a tile is not glass");
    for (const c of [half, none, glass.cfg, tiles]) quoteAddsUp(c, JSON.stringify(c.backsplash));
  });

  it("rails with hooks: on a wall with worktop clear of the window", () => {
    const k = kitchen({ layout: "L" });
    const r = setRail(k, "a", true);
    assert.ok(r.ok);
    const rail = planKitchen(r.cfg).runs.find((x) => x.wall === "a")!.rail!;
    assert.ok(rail && rail.to - rail.from >= DIM.railMin && rail.to - rail.from <= DIM.railMax);
    assert.ok(rail.y > planKitchen(r.cfg).heights.worktop && rail.y < planKitchen(r.cfg).heights.upperBottom);
    assert.ok(breakdown(r.cfg).rails > 0);
    assert.match(summarize(r.cfg).join("\n"), /Reling s kukama: zid A/);
    assert.ok(railChoices(r.cfg).find((x) => x.wall === "a")!.on);
    quoteAddsUp(r.cfg, "rail");
    assert.equal(setRail(r.cfg, "a", false).cfg.rails, undefined);
  });

  it("floating shelves over a whole wall, 1–3 boards, LED optional; back to doors", () => {
    const k = kitchen({ layout: "L" });
    const r = setWallShelves(k, "b", { rows: 3, led: false });
    assert.ok(r.ok);
    const ups = planKitchen(r.cfg).slots.filter((s) => s.run === "b" && s.zone === "upper" && !s.corner);
    assert.ok(ups.some((s) => s.type === "police-visece"));
    assert.ok(ups.filter((s) => s.type === "police-visece").every((s) => s.opt?.rows === 3 && s.opt?.led === false));
    assert.ok(breakdown(r.cfg).mechanisms > breakdown(k).mechanisms);
    const q = quoteAddsUp(r.cfg, "shelves");
    assert.ok(q.items.some((it) => /^Viseće police/.test(it.description)));
    const back = setWallShelves(r.cfg, "b", null);
    assert.ok(back.ok);
    assert.ok(!planKitchen(back.cfg).slots.some((s) => s.type === "police-visece"));
  });

  it("everything at once: planned, priced, summarised, linked and quoted", () => {
    const cfg = everything();
    const p = planKitchen(cfg);
    assert.ok(p.warnings.every((w) => !/izostavljen/.test(w)), p.warnings.join(" | "));
    for (const t of ["kava", "vinoteka", "bocna-rebrasta", "vitrina", "police-zaobljene", "bocna-radna", "police-visece"]) assert.ok(p.slots.some((s) => s.type === t), t);
    assert.deepEqual(decodeConfig(encodeConfig(cfg)), cfg);
    quoteAddsUp(cfg, "everything");
    assert.ok(summarize(cfg).length > 20);
  });
});

// ---------------------------------------------------------------- engine (headless scene graph)

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
        fns.set(key, f);
      }
      return f;
    },
  }) as unknown as KitchenEnv["mats"];
}
const env = (handles: HandleStyle = "letvica"): KitchenEnv => ({
  mats: stubMaterials(),
  geos: new GeoCache(),
  doc: undefined as never,
  fronts: { base: "antracit", upper: "antracit", tall: "kasmir", island: "hrast" },
  topId: "mramor",
  handles,
  plinth: "crna",
  labels: false,
  tempo: "quick",
});

describe("engine (headless)", () => {
  it("builds every option in every layout: finite geometry, the wall hoods, the cassette, the rail", () => {
    const cfgs: KitchenConfig[] = [everything()];
    for (const layout of LAYOUTS) {
      cfgs.push(
        kitchen({ layout, hood: { kind: "dimnjak" }, rails: ["a"], backsplash: { kind: "staklo" }, worktop: { thickness: 6 } }),
        kitchen({ layout, hood: { kind: "kosa", island: "kaseta" }, islandSpec: { functions: "hob" }, handles: "luft", glass: { type: "rebrasto", frame: "zlatni" } }),
        kitchen({ layout, ceiling: 300, heights: { mode: "do-stropa", topDepth: 30 }, handles: "push", backsplash: { kind: "pola" }, corners: { "base-l": "kutna-polica" } }),
      );
    }
    const box = new THREE.Box3();
    for (const cfg of cfgs) {
      const plan = planKitchen(cfg);
      const K = buildKitchen(env(cfg.handles), plan);
      K.timeline.finish();
      K.root.updateMatrixWorld(true);
      box.setFromObject(K.root);
      assert.ok([box.min.x, box.min.y, box.min.z, box.max.x, box.max.y, box.max.z].every(Number.isFinite), cfg.layout);
      for (const r of plan.runs) assert.equal(K.wallHoods.has(r.wall), r.hoods.length > 0, `${cfg.layout} ${r.wall}`);
      if (plan.island?.hood) assert.ok(K.islandHood);
      for (const r of plan.runs) if (r.rail) assert.ok(K.runs.get(r.wall)!.surfaces?.rail);
      // a glass / tile backsplash is not in the worktop material: a worktop change leaves it alone
      const glassy = cfg.backsplash?.kind === "staklo" || cfg.backsplash?.kind === "plocice";
      for (const r of plan.runs) {
        const bg = K.runs.get(r.wall)!.surfaces?.backsplash;
        if (!bg) continue;
        const me = bg.children[0] as THREE.Mesh;
        assert.equal(K.tops.includes(me), !glassy);
      }
      // a side panel of worktop follows the worktop (ModuleRT.tops)
      for (const m of K.modules.values()) if (moduleDef(m.slot.zone, m.slot.type)?.worktopMaterial) assert.ok(m.tops.length > 0);
    }
  });

  it("push-to-open fronts have wider reveals; luft fronts stop short of the worktop", () => {
    const front = (handles: HandleStyle) => {
      const cfg = kitchen({ layout: "ravna", handles, runs: { a: [{ type: "vrata", width: 60 }] } });
      const plan = planKitchen(cfg);
      const s = plan.slots.find((x) => x.type === "vrata" && x.zone === "base")!;
      const e = env(handles);
      const m = createModule(moduleCtx(e, plan, undefined, s), s);
      const bb = new THREE.Box3();
      m.fronts.updateMatrixWorld(true);
      bb.setFromObject(m.fronts);
      return { w: bb.max.x - bb.min.x, top: bb.max.y, open: m.open };
    };
    const push = front("push");
    const plain = front("letvica");
    assert.ok(push.w < plain.w - 0.0009, `${push.w} vs ${plain.w}`);
    assert.equal(push.open, "push");
    assert.ok(front("luft").top < front("push").top - 0.02);
  });
});
