/**
 * The studio's overlays and UI copy (components/studio, plain helpers — no DOM): the phone toast's first line, the "+"
 * markers kept apart, where a coach card may go, and the tall column as the UI removes it ("Ukloni cijeli stup").
 *
 * Run with the other studio tests: npx tsx --test lib/studio/*.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { columnSlots, elementsCount, firstSentence, isInRunTall } from "../../components/studio/meta";
import { placeCard, spreadApart, toastAtTop, type Rect } from "../../components/studio/overlay";
import { insertAtGap, isEdited, removeColumn, resetAll } from "./edit";
import { planKitchen, sanitizeConfig } from "./plan";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout } from "./types";

const cfgOf = (patch: Partial<KitchenConfig>): KitchenConfig => sanitizeConfig({ ...DEFAULT_CONFIG, ...patch });
const LAYOUTS: Layout[] = ["ravna", "L", "U", "otok", "poluotok", "G"];

describe("toast copy", () => {
  it("the phone's one line is the first sentence; the rest goes behind 'Detalji'", () => {
    assert.deepEqual(firstSentence("Hladnjak je sužen na 45 cm. Gornji element iznad je uklonjen."), [
      "Hladnjak je sužen na 45 cm.",
      "Gornji element iznad je uklonjen.",
    ]);
    assert.deepEqual(firstSentence("Dodano: ladičar, 60 cm."), ["Dodano: ladičar, 60 cm.", ""]);
    // a quote opens the next sentence too; lower case after a full stop does not end one
    assert.deepEqual(firstSentence("Nema mjesta. „Zamijeni” radi."), ["Nema mjesta.", "„Zamijeni” radi."]);
    assert.deepEqual(firstSentence("npr. ovako i dalje"), ["npr. ovako i dalje", ""]);
  });

  it("phone: the one line goes under the top bar when above the sheet it would cover the new element or a '+'", () => {
    // 390 × 844: top bar to 56 px, the sheet from 393 px; above the docked toolbar the line ends 74 px above the sheet
    const at = (o: { raised?: boolean; selLow?: boolean; dots?: number[] }) =>
      toastAtTop({ top: 56, foot: 393 - (o.raised ? 74 : 12), mid: (56 + 393) / 2, lineH: 58, drop: 8, dots: o.dots ?? [], raised: Boolean(o.raised), selLow: Boolean(o.selLow) });
    assert.equal(at({}), false, "nothing in the way: above the sheet");
    assert.equal(at({ raised: true }), false, "a wall unit selected: above its toolbar");
    assert.equal(at({ raised: true, selLow: true }), true, "a cabinet just added (on the floor): it would be under the line");
    assert.equal(at({ raised: true, dots: [372] }), true, "a '+' below the line is lifted under it");
    assert.equal(at({ dots: [350] }), true, "a '+' just above the sheet");
    assert.equal(at({ raised: true, selLow: true, dots: [90, 100] }), true, "the top covers two '+', the line above the toolbar the new cabinet");
    assert.equal(at({ dots: [90, 100, 110] }), false, "the top bar's side is the more crowded one");
  });

  it("element counts in Croatian", () => {
    assert.equal(elementsCount(1), "1 element");
    assert.equal(elementsCount(2), "2 elementa");
    assert.equal(elementsCount(4), "4 elementa");
    assert.equal(elementsCount(5), "5 elemenata");
    assert.equal(elementsCount(11), "11 elemenata");
    assert.equal(elementsCount(21), "21 element");
    assert.equal(elementsCount(22), "22 elementa");
  });
});

describe('"+" markers', () => {
  it("two that would cover each other move apart; others stay where they are", () => {
    const pts = [
      { x: 100, y: 100 },
      { x: 104, y: 100 },
      { x: 300, y: 300 },
      { x: 300, y: 300 },
    ];
    spreadApart(pts, 32);
    const d = (i: number, j: number) => Math.hypot(pts[i].x - pts[j].x, pts[i].y - pts[j].y);
    assert.ok(d(0, 1) >= 31.5, "pushed apart");
    assert.deepEqual(pts[0], { x: 100, y: 100 }, "the first stays");
    assert.ok(d(2, 3) >= 31.5 && pts[3].x === 300 && pts[3].y < 300, "coinciding: the later one goes straight up");
    const far = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ];
    spreadApart(far, 32);
    assert.deepEqual(far, [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
    ]);
  });
});

describe("coach card", () => {
  const A = { x0: 16, y0: 80, x1: 1000, y1: 800 };
  const size = { w: 300, h: 120 };
  const covers = (p: { x: number; y: number }, r: Rect) => p.x < r.x + r.w && p.x + size.w > r.x && p.y < r.y + r.h && p.y + size.h > r.y;

  it("points at its target from below or above, never over it", () => {
    const at = { x: 500, y: 400 };
    const p = placeCard(size, A, at, [{ x: 32, y: 600 }], [], []);
    assert.notEqual(p.side, "none");
    assert.ok(!(at.y >= p.y && at.y <= p.y + size.h), "the target stays outside the card");
  });

  it("never covers the control in use (the selected element's toolbar): another side, else a waiting place", () => {
    const at = { x: 500, y: 400 };
    const below = placeCard(size, A, at, [{ x: 32, y: 600 }], [], []);
    const bar: Rect = { x: below.x, y: below.y, w: size.w, h: 60 };
    const p = placeCard(size, A, at, [{ x: 32, y: 600 }], [bar], []);
    assert.ok(!covers(p, bar), "not over the toolbar");
    // everything near the target taken: the waiting place
    const wall: Rect = { x: 0, y: 0, w: 2000, h: 600 };
    const q = placeCard(size, A, at, [{ x: 32, y: 650 }], [wall], []);
    assert.equal(q.side, "none");
    assert.ok(!covers(q, wall));
  });

  it("covers as few other '+' as it can", () => {
    const at = { x: 500, y: 400 };
    const first = placeCard(size, A, at, [], [], []);
    const dot: Rect = { x: first.x + 100, y: first.y + 40, w: 40, h: 40 };
    const p = placeCard(size, A, at, [], [], [dot]);
    assert.ok(!covers(p, dot), "moved off the '+'");
  });
});

describe("the tall column without a switch (the UI)", () => {
  it("every default kitchen's column: all its units, and removeColumn takes them all", () => {
    for (const layout of LAYOUTS) {
      const cfg = cfgOf({ layout });
      const plan = planKitchen(cfg);
      const unit = plan.slots.find((s) => s.zone === "tall");
      if (!unit) continue;
      const col = columnSlots(plan, unit);
      assert.ok(col.length >= 1 && col.every((s) => s.zone === "tall" && s.list?.id === unit.list?.id), layout);
      const r = removeColumn(cfg, unit.id);
      assert.ok(r.ok, `${layout}: ${r.warning}`);
      const after = planKitchen(r.cfg);
      for (const s of col) assert.ok(!after.slots.some((x) => x.zone === "tall" && x.list?.id === s.list?.id && x.run === s.run && Math.abs(x.x - s.x) < 1), `${layout}: ${s.id} gone`);
      // no column is an element edit: "Vrati sve elemente na zadano" brings it back
      assert.ok(isEdited(r.cfg), layout);
      assert.ok(planKitchen(resetAll(r.cfg)).slots.some((s) => s.zone === "tall"), `${layout}: back with resetAll`);
      // "Vrati zadani visoki stup" (ElementsStep): the planner's column alone comes back, the rest of the kitchen as it was
      if (unit.list?.id === "tall") {
        assert.equal(r.cfg.tall, false, layout);
        const back = planKitchen(sanitizeConfig({ ...r.cfg, tall: true }));
        assert.ok(back.slots.some((s) => s.zone === "tall" && s.list?.id === "tall"), `${layout}: back with tall: true`);
      }
    }
  });

  it("a column standing in the run: its units are the run's tall stretch around it, nothing else", () => {
    const cfg = cfgOf({ layout: "L" });
    const r = insertAtGap(cfg, "seam:a:2", "ormar", 30, "tall");
    assert.ok(r.ok, r.warning ?? "");
    const plan = planKitchen(r.cfg);
    const t = plan.slots.find((s) => s.id === r.slotId)!;
    assert.ok(isInRunTall(t));
    const col = columnSlots(plan, t);
    assert.deepEqual(
      col.map((s) => s.id),
      [t.id],
    );
    assert.deepEqual(columnSlots(plan, plan.slots.find((s) => s.zone === "base")!), [], "not a tall unit");
    const gone = removeColumn(r.cfg, t.id);
    assert.ok(gone.ok, gone.warning ?? "");
    assert.ok(!planKitchen(gone.cfg).slots.some(isInRunTall), "the column in the run is gone");
  });
});
