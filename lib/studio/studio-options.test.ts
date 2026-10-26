/**
 * The studio's controls for the "sve što možeš zamisliti" options (components/studio/optionsModel.ts, addModel.ts,
 * tallSwap.ts, icons.tsx) on top of lib/studio/edit.ts: the ways of opening as tiles and per element, short tile names for
 * every hood / backsplash kind, what a full row's "+" and "+ lijevo / + desno" make narrower (said before the pick — "susjedni
 * elementi suzit će se: …", "novi element zamijenit će: …"), the tall unit's question listing the cabinets that get
 * narrower, end units (završeci) at a run's free end — in the element editor and in the end "+" picker — a drawing for every
 * catalogue type, and "+ lijevo / + desno" with a tall unit making room exactly as the "+" between the two does.
 *
 *   npx tsx --test lib/studio/studio-options.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { addItems, addModel } from "../../components/studio/addModel";
import { HandleGlyph, HoodGlyph, ModuleGlyph, SplashGlyph } from "../../components/studio/icons";
import {
  HOOD_SHORT,
  OPEN_KINDS,
  SPLASH_ORDER,
  SPLASH_SHORT,
  elementOpenOptions,
  endChoice,
  insertPreview,
  narrowedBetween,
  openKindOf,
  probeTypeFor,
  seamLine,
  seamPreview,
  seamPreviewAtStart,
  styleForKind,
} from "../../components/studio/optionsModel";
import { narrowLine, tallSwap } from "../../components/studio/tallSwap";
import { catalog, endTypes, moduleDef } from "./catalog";
import {
  backsplashChoices,
  changeType,
  elementOptions,
  gapOptions,
  hoodChoices,
  insertAfter,
  insertAtGap,
  insertBefore,
  insertOptions,
  setElementOptions,
  slotEditInfo,
} from "./edit";
import { openingOf, planGaps, planKitchen, sanitizeConfig, type KitchenPlan, type PlanSlot } from "./plan";
import { DEFAULT_CONFIG, type HandleStyle, type KitchenConfig, type Layout } from "./types";

const kitchen = (over: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...over });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];
const slotOf = (c: KitchenConfig, id: string | null) => (id ? planKitchen(c).slots.find((s) => s.id === id) : undefined);
const listRow = (p: KitchenPlan, id: string) => p.slots.filter((s) => s.list?.id === id).sort((a, b) => a.x - b.x);
const widthsOf = (p: KitchenPlan, id: string) => listRow(p, id).map((s) => `${s.type}${s.zone === "tall" ? "^" : ""}${Math.round(s.width)}`);

describe("opening of the fronts", () => {
  it("four ways as tiles: every handle style belongs to one, and a kind gives a style of its own kind", () => {
    const styles = catalog.handles.map((h) => h.id as HandleStyle);
    for (const h of styles) {
      const k = openKindOf(h);
      assert.ok(OPEN_KINDS.some((o) => o.id === k), h);
      assert.equal(openKindOf(styleForKind(k, h)), k, `${h} → ${k}`);
    }
    // "Ručke" keeps the handle type the kitchen has, else the bar handle
    assert.equal(styleForKind("rucke", "gumb"), "gumb");
    assert.equal(styleForKind("rucke", "push"), "letvica");
    assert.equal(styleForKind("luft", "letvica"), "luft");
  });

  it("one element: the kitchen's way first (no own style), never Gola unless it is the kitchen's — and it applies as chosen", () => {
    const c = kitchen({ layout: "L", handles: "letvica" });
    const opts = elementOpenOptions(c.handles);
    assert.deepEqual(
      opts.map((o) => o.kind),
      ["rucke", "push", "luft"],
    );
    assert.equal(opts[0].kitchen, true);
    assert.equal(opts[0].style, null);
    assert.ok(elementOpenOptions("bez").some((o) => o.kind === "bez" && o.kitchen), "Gola as the kitchen's");
    const s = planKitchen(c).slots.find((x) => x.zone === "base" && x.list && !x.corner)!;
    for (const o of opts.slice(1)) {
      const r = setElementOptions(c, s.id, { open: o.style ?? undefined });
      assert.ok(r.ok, r.warning ?? "");
      assert.equal(openKindOf(openingOf(r.cfg, slotOf(r.cfg, r.slotId)?.opt)), o.kind);
      // back to the kitchen's: no own style left
      const back = setElementOptions(r.cfg, r.slotId!, { open: undefined });
      assert.equal(slotOf(back.cfg, back.slotId)?.opt?.open, undefined);
    }
    // an element with a handle type of its own keeps it under "Ručke"
    assert.equal(elementOpenOptions("push", "gumb").find((o) => o.kind === "rucke")?.style, "gumb");
  });

  it("every hood kind and backsplash kind has a short tile name and a drawing of its own", () => {
    const html = (el: ReturnType<typeof createElement>) => renderToStaticMarkup(el);
    const hoods = hoodChoices(kitchen({})).kinds.map((k) => k.id);
    for (const k of hoods) assert.ok(HOOD_SHORT[k], k);
    assert.equal(new Set(hoods.map((k) => html(createElement(HoodGlyph, { kind: k })))).size, hoods.length, "hood drawings differ");
    const kinds = backsplashChoices(kitchen({})).kinds.map((k) => k.id);
    assert.deepEqual([...kinds].sort(), [...SPLASH_ORDER].sort());
    for (const k of kinds) assert.ok(SPLASH_SHORT[k], k);
    assert.equal(new Set(kinds.map((k) => html(createElement(SplashGlyph, { kind: k })))).size, kinds.length, "backsplash drawings differ");
    // "luft" is not drawn as push-to-open any more
    assert.notEqual(html(createElement(HandleGlyph, { style: "luft" })), html(createElement(HandleGlyph, { style: "push" })));
  });

  it("every catalogue type has a drawing of its own (no fallback box)", () => {
    const html = (type: string, zone: string) => renderToStaticMarkup(createElement(ModuleGlyph, { type, zone }));
    for (const m of catalog.modules) {
      const own = html(m.id, m.zone);
      assert.notEqual(own, html("__none__", m.zone), `${m.zone}:${m.id} has its own drawing`);
    }
  });
});

describe("what an insert makes narrower", () => {
  const S = (id: string, type: string, x: number, width: number): PlanSlot => ({ id, zone: "base", run: "a", x, width, defaultType: type, type, options: [] });

  it("aligns by type and names the one that really got narrower (two equal cabinets, one gone, one new)", () => {
    const before = [S("a0", "ladice", 0, 60), S("a1", "ladice", 60, 60), S("a2", "sudoper", 120, 80), S("a3", "vrata", 200, 60)];
    // the second drawer unit got narrower, the door went, a new unit was put in
    const after = [S("b0", "ladice", 0, 60), S("b1", "ladice", 60, 45), S("new", "ormar", 105, 30), S("b2", "sudoper", 135, 80)];
    assert.deepEqual(narrowedBetween(before, after, new Set(["new"])), [{ slotId: "b1", name: "tri ladice", from: 60, to: 45 }]);
    assert.deepEqual(narrowedBetween(before, before), []);
  });

  it("a full row's '+': the preview is what the insert does, worded for one / several / a replaced element", () => {
    let one = 0;
    let many = 0;
    let replaced = 0;
    for (const layout of LAYOUTS) {
      for (const walls of [DEFAULT_CONFIG.walls, { a: 300, b: 260, c: 240 }]) {
        const c = kitchen({ layout, walls });
        const p = planKitchen(c);
        for (const g of planGaps(p).filter((x) => x.kind === "seam")) {
          const pv = seamPreviewAtStart(c, p, g);
          assert.ok(pv, `${layout} ${g.id}: a preview`);
          const line = seamLine(pv, Boolean(g.replace));
          if (g.replace) {
            const r = p.slots.find((s) => s.id === g.replace)!;
            assert.equal(line, `novi element zamijenit će: ${moduleDef(r.zone === "island" ? "base" : r.zone, r.type)!.name.toLowerCase()}, ${Math.round(r.width)} cm`);
            replaced++;
            continue;
          }
          // the same insert, done: exactly those elements are narrower, by exactly that much
          const t = probeTypeFor(g.zone, pv.width)!;
          const r = insertAtGap(c, g.id, t, pv.width);
          assert.ok(r.ok, `${layout} ${g.id} ${pv.width}: ${r.warning}`);
          const after = new Map(listRow(planKitchen(r.cfg), g.list).map((s) => [s.id, s.width]));
          for (const n of pv.narrowed) assert.equal(after.get(n.slotId), n.to, `${layout} ${g.id}: ${n.name}`);
          if (pv.narrowed.length === 1) {
            assert.match(line, /^susjedni element suzit će se: .+ \d+ → \d+ cm$/);
            one++;
          } else if (pv.narrowed.length > 1) {
            assert.match(line, /^susjedni elementi suzit će se: .+ → .+, .+ → .+ cm$/);
            many++;
          } else assert.equal(line, "stane bez sužavanja");
          // the edit's own note names the same elements
          for (const n of pv.narrowed) assert.ok((r.warning ?? "").includes(n.name), `${layout} ${g.id}: the note names ${n.name}`);
        }
      }
    }
    assert.ok(one > 0 && many > 0 && replaced > 0, `one ${one}, many ${many}, replaced ${replaced}`);
    // without a preview: the general line
    assert.equal(seamLine(null), "susjedni element suzit će se");
    assert.equal(seamLine(null, true), "novi element zamijenit će susjedni");
  });

  it("a wider width chosen in the picker: the preview follows it", () => {
    const c = kitchen({ layout: "ravna" });
    const p = planKitchen(c);
    const g = planGaps(p).find((x) => x.kind === "seam" && x.zone === "upper" && !x.replace)!;
    const a = seamPreview(c, p, g, 30);
    const b = seamPreview(c, p, g, 60);
    assert.ok(a && b);
    const sum = (x: NonNullable<typeof a>) => x.narrowed.reduce((n, y) => n + y.from - y.to, 0);
    assert.ok(sum(b) > sum(a), "60 cm takes more than 30 cm");
  });

  it("'+ lijevo / + desno' on a full row: the preview is what that insert makes narrower", () => {
    let checked = 0;
    for (const layout of ["ravna", "L", "U"] as Layout[]) {
      const c = kitchen({ layout });
      const p = planKitchen(c);
      for (const s of p.slots.filter((x) => x.run !== "isl" && x.zone === "base" && x.list && !x.corner)) {
        const r = insertAfter(c, s.id, probeTypeFor("base", 30)!, 30);
        if (!r.ok) continue;
        const n = insertPreview(p, r, s.list!.id);
        assert.ok(n.length >= 1, `${layout} ${s.id}`);
        for (const x of n) assert.ok((r.warning ?? "").includes(`${x.name} sada je ${x.to} cm umjesto ${x.from} cm`), r.warning ?? "");
        checked++;
      }
    }
    assert.ok(checked > 0);
  });

  it("the tall unit's question lists the cabinets that stay but get narrower — as the edit's note does", () => {
    let seen = 0;
    for (const layout of ["ravna", "L", "U"] as Layout[]) {
      const c = kitchen({ layout });
      const p = planKitchen(c);
      for (const s of p.slots.filter((x) => x.zone === "base" && x.run !== "isl" && !x.corner)) {
        const sw = tallSwap(c, p, s, "hladnjak");
        if (!sw.result.ok) continue;
        const note = sw.result.warning ?? "";
        if (!/napravljeno je mjesto/.test(note)) {
          assert.deepEqual(sw.narrowed, [], `${layout} ${s.id}: nothing narrower`);
          assert.equal(narrowLine(sw.narrowed), null);
          continue;
        }
        assert.ok(sw.narrowed.length > 0, `${layout} ${s.id}: ${note}`);
        for (const n of sw.narrowed) assert.ok(note.includes(`${n.name}`) && note.includes(`${n.to} cm umjesto ${n.from} cm`), `${layout} ${s.id}: ${n.name} in "${note}"`);
        assert.match(narrowLine(sw.narrowed) ?? "", /^Uži će biti: .+ \d+ → \d+ cm\.$/);
        seen++;
      }
    }
    assert.ok(seen > 0);
  });
});

describe("'+ lijevo / + desno' with a tall unit", () => {
  it("makes room exactly as the '+' between the two elements does", () => {
    let compared = 0;
    for (const layout of ["ravna", "L", "U"] as Layout[]) {
      const c = kitchen({ layout });
      const p = planKitchen(c);
      const seam = planGaps(p).find((g) => g.kind === "seam" && g.zone === "base" && !g.replace && g.between?.[0] && g.between?.[1])!;
      const [a, b] = seam.between!;
      for (const [t, w] of [
        ["ormar", 30],
        ["smocnica", 30],
        ["ormar", 45],
      ] as const) {
        const g = insertAtGap(c, seam.id, t, w, "tall");
        const r1 = insertAfter(c, a, t, w, "tall");
        const r2 = insertBefore(c, b, t, w, "tall");
        assert.equal(r1.ok, g.ok, `${layout} ${t} ${w}: + desno like the "+"`);
        assert.equal(r2.ok, g.ok, `${layout} ${t} ${w}: + lijevo like the "+"`);
        if (!g.ok) continue;
        assert.deepEqual(widthsOf(planKitchen(r1.cfg), seam.run), widthsOf(planKitchen(g.cfg), seam.run), `${layout} ${t} ${w}`);
        assert.deepEqual(widthsOf(planKitchen(r2.cfg), seam.run), widthsOf(planKitchen(g.cfg), seam.run), `${layout} ${t} ${w}`);
        compared++;
      }
    }
    assert.ok(compared >= 4, `${compared}`);
  });

  it("a full run where the element beside it alone cannot give enough: offered now, the note names who got narrower", () => {
    const c = kitchen({ layout: "ravna" });
    const p = planKitchen(c);
    // the hob's neighbour: the hob does not shrink below its width, the rest of the run gives way
    const s = p.slots.filter((x) => x.run === "a" && x.zone === "base" && x.list && !x.corner).pop()!;
    const offered = insertOptions(c, s.id, "before", "tall").filter((t) => t.width !== null && t.id !== "bocna" && t.id !== "bocna-rebrasta");
    assert.ok(offered.length > 0, "tall units offered beside it");
    for (const t of offered.slice(0, 3)) {
      for (const w of t.fitting ?? []) {
        const r = insertBefore(c, s.id, t.id, w, "tall");
        assert.ok(r.ok, `${t.id} ${w}: ${r.warning}`);
        assert.equal(slotOf(r.cfg, r.slotId)?.type, t.id);
      }
    }
  });
});

describe("end units (završeci)", () => {
  it("the last element at a free end of its run offers them; an end unit there can become another; elsewhere none", () => {
    const c = kitchen({
      layout: "L",
      walls: { a: 520, b: 300, c: 220 },
      runs: {
        a: [
          { type: "ladice", width: 60 },
          { type: "sudoper", width: 80 },
          { type: "perilica", width: 60 },
          { type: "ploca", width: 60 },
          { type: "ladice", width: 60 },
        ],
      },
    });
    const p = planKitchen(c);
    const row = p.slots.filter((s) => s.run === "a" && s.zone === "base" && s.list && !s.corner).sort((x, y) => x.x - y.x);
    const last = row[row.length - 1];
    const e = endChoice(c, p, slotEditInfo(c, last.id)!);
    assert.ok(e, "the last base cabinet before the free end");
    assert.equal(e.mode, "add");
    assert.equal(e.side, "right");
    assert.deepEqual(
      e.items.map((t) => t.id),
      endTypes("base").map((d) => d.id),
    );
    // in the middle of the run, at the corner: none
    assert.equal(endChoice(c, p, slotEditInfo(c, row[1].id)!), null);
    const corner = p.slots.find((s) => s.run === "a" && s.corner)!;
    assert.equal(endChoice(c, p, slotEditInfo(c, corner.id)!), null);
    // add one: it stands at the end (in place of the end panel); on it: the others, itself chosen
    const t = e.items.find((x) => x.width !== null)!;
    const r = insertAfter(c, last.id, t.id, t.width!);
    assert.ok(r.ok, r.warning ?? "");
    const added = slotOf(r.cfg, r.slotId)!;
    assert.equal(added.end?.side, "right");
    const p2 = planKitchen(r.cfg);
    const e2 = endChoice(r.cfg, p2, slotEditInfo(r.cfg, added.id)!);
    assert.equal(e2?.mode, "change");
    assert.ok(e2?.items.find((x) => x.id === t.id)?.current);
    const other = e2!.items.find((x) => !x.current && x.width !== null)!;
    const r2 = changeType(r.cfg, added.id, other.id);
    assert.ok(r2.ok, r2.warning ?? "");
    assert.ok(slotOf(r2.cfg, r2.slotId)?.end, "the other end unit stands at the end too");
  });

  it("wall units and a tall column end the same way; the island has none", () => {
    const c = kitchen({ layout: "otok" });
    const p = planKitchen(c);
    for (const zone of ["upper", "tall"] as const) {
      const ends = p.slots
        .filter((s) => s.zone === zone && s.run !== "isl")
        .map((s) => ({ s, e: endChoice(c, p, slotEditInfo(c, s.id)!) }))
        .filter((x) => x.e);
      assert.ok(ends.length > 0, `${zone}: an end unit can go somewhere`);
      for (const { e } of ends) assert.ok(e!.items.every((t) => moduleDef(zone, t.id)?.group === "zavrsetak"));
    }
    for (const s of p.slots.filter((x) => x.run === "isl")) {
      const info = slotEditInfo(c, s.id);
      if (info) assert.equal(endChoice(c, p, info), null, s.id);
    }
  });

  it("the end '+' picker shows them in a block of their own; elsewhere they stay under 'Više' (Završeci)", () => {
    const c = kitchen({ layout: "L", walls: { a: 520, b: 300, c: 220 }, runs: { a: [{ type: "ladice", width: 60 }, { type: "sudoper", width: 80 }, { type: "perilica", width: 60 }, { type: "ploca", width: 60 }, { type: "ladice", width: 60 }] } });
    const p = planKitchen(c);
    const end = planGaps(p).find((g) => g.kind === "end")!;
    const o = gapOptions(c, end.id)!;
    const m = addModel(addItems(o.types, o.tall), "base", null, { ends: true });
    assert.ok(m.ends.length > 0);
    assert.ok(m.ends.every((it) => it.t.group === "zavrsetak" && !it.tall));
    assert.ok(!m.groups.some((g) => g.items.some((it) => !it.tall && it.t.group === "zavrsetak")), "not again under Više");
    assert.ok(!m.top.some((it) => it.t.group === "zavrsetak"));
    const plain = addModel(addItems(o.types, o.tall), "base", null);
    assert.deepEqual(plain.ends, []);
    assert.ok(plain.groups.some((g) => g.id === "zavrsetak"), "under Više elsewhere");
  });
});

describe("element options as the editor shows them", () => {
  it("only what applies: a vitrine its glass, a hob its hood, floating shelves rows and LED, a wall unit its depth in do-stropa", () => {
    const c = kitchen({
      layout: "L",
      walls: { a: 520, b: 300, c: 220 },
      ceiling: 280,
      heights: { mode: "do-stropa" },
      runs: {
        a: [
          { type: "ladice", width: 60 },
          { type: "vitrina", width: 50 },
          { type: "sudoper", width: 80 },
          { type: "perilica", width: 60 },
          { type: "ploca", width: 60 },
          { type: "ladice", width: 60 },
        ],
      },
    });
    const p = planKitchen(c);
    const by = (type: string, zone = "base") => p.slots.find((s) => s.type === type && s.zone === zone && s.run === "a")!;
    const vit = elementOptions(c, by("vitrina").id)!;
    assert.ok(vit.glass && vit.open && !vit.hood && !vit.rows);
    const hob = elementOptions(c, by("ploca").id)!;
    assert.ok(hob.hood && !hob.glass);
    const up = elementOptions(c, p.slots.find((s) => s.run === "a" && s.zone === "upper" && !s.corner && !s.anchored)!.id)!;
    assert.ok(up.depth?.shown, "the do-stropa row is there");
  });
});
