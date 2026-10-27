/**
 * "Opiši kuhinju": edit operations on an existing kitchen (also one edited by hand) — done ones, refused ones (a Croatian
 * note, the kitchen unchanged), slot ids that changed under earlier operations, and a fuzz run that must never throw.
 *
 *   npx tsx --test lib/studio/ai/*.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { changeType } from "../edit";
import { planKitchen, sanitizeConfig } from "../plan";
import { decodeConfig, encodeConfig } from "../share";
import { DEFAULT_CONFIG, type KitchenConfig } from "../types";
import { describeKitchen } from "./describe";
import { applyOps } from "./ops";
import { columnEnd } from "./moves";
import { BLANK_ISLAND, BLANK_STYLE, EditOpSchema, type EditOp } from "./schema";

const L: KitchenConfig = sanitizeConfig({ ...DEFAULT_CONFIG, layout: "L", walls: { a: 420, b: 290, c: 220 } });
const slots = (cfg: KitchenConfig) => planKitchen(cfg).slots;
const sinkOf = (cfg: KitchenConfig) => {
  const p = planKitchen(cfg);
  return p.slots.find((s) => s.id === p.sinkId)!;
};
const op = (o: EditOp) => EditOpSchema.parse(o);

describe("describeKitchen", () => {
  it("lists every row with slot ids, types, widths and places, the column ends, finishes", () => {
    const d = describeKitchen(L);
    assert.match(d, /^Oblik: L/);
    assert.match(d, /Zid A: prostorija 420 cm, kuhinja cijelom duljinom/);
    assert.match(d, /donji: a-base-0 kutni 110 @0 \(kut\)/);
    assert.match(d, /visoki stup \(desni kraj\): tall-0 pecnica 60 \| tall-1 hladnjak 60/);
    assert.match(d, /Prozor: nema\./);
    assert.match(d, /Fronte: antracit \(Antracit mat\)/);
    for (const s of slots(L)) assert.ok(d.includes(s.id), `${s.id} in the description`);
  });
});

describe("applyOps", () => {
  it("moves the sink right along its row", () => {
    const before = sinkOf(L);
    const r = applyOps(L, [op({ op: "pomakni", element: before.id, direction: "desno", steps: 0 })]);
    assert.equal(r.applied, 1);
    assert.equal(r.refused, 0);
    assert.ok(sinkOf(r.cfg).x > before.x);
  });

  it("all the way left (steps 9) stops at the corner, still ok", () => {
    const before = sinkOf(L);
    const r = applyOps(L, [op({ op: "pomakni", element: before.id, direction: "lijevo", steps: 9 })]);
    assert.equal(r.applied, 1);
    assert.ok(sinkOf(r.cfg).x < before.x);
  });

  it("changes materials with free words", () => {
    const r = applyOps(L, [op({ op: "stil", style: { ...BLANK_STYLE, front: "antracit lak", worktop: "crni kamen", handles: "letvica", handle_color: "zlatne" } })]);
    assert.equal(r.cfg.front, "antracit-sjaj");
    assert.equal(r.cfg.top, "crni");
    assert.equal(r.cfg.handles, "letvica");
    assert.equal(r.cfg.finish?.handleColor, "mesing");
  });

  it("an unknown element is refused with a note, the kitchen unchanged", () => {
    const r = applyOps(L, [op({ op: "ukloni", element: "z-base-9", whole_column: "" })]);
    assert.equal(r.applied, 0);
    assert.equal(r.refused, 1);
    assert.match(r.notes[0], /^Uklanjanje elementa: nije išlo — element z-base-9 ne postoji/);
    assert.equal(encodeConfig(r.cfg), encodeConfig(L));
  });

  it("a move that has no room is refused (sink to a full wall), the kitchen unchanged", () => {
    const tight = applyOps(L, [op({ op: "hladnjak", kind: "side-by-side", side: "lijevo", wall: "", finish: "", handles: "" })]).cfg;
    const r = applyOps(tight, [op({ op: "premjesti", element: sinkOf(tight).id, wall: "b", side: "" })]);
    assert.equal(r.refused, 1);
    assert.match(r.notes[0], /^Premještanje elementa: nije išlo — /);
    assert.equal(encodeConfig(r.cfg), encodeConfig(tight));
  });

  it("the sink (with its dishwasher) to another wall", () => {
    const r = applyOps(L, [op({ op: "premjesti", element: sinkOf(L).id, wall: "b", side: "" })]);
    assert.equal(r.refused, 0, r.notes.join(" "));
    assert.equal(sinkOf(r.cfg).run, "b");
    // the dishwasher goes along where it fits, else it stays — never lost; no hole is left on wall A
    assert.ok(slots(r.cfg).some((s) => s.type === "perilica"), "the dishwasher is still there");
    assert.ok(!planKitchen(r.cfg).warnings.some((w) => /Zid A: \d+ cm ispod radne ploče ostaje bez elementa/.test(w)), planKitchen(r.cfg).warnings.join(" "));
    const roomy = sanitizeConfig({ ...L, walls: { a: 420, b: 380, c: 220 } });
    const r2 = applyOps(roomy, [op({ op: "premjesti", element: sinkOf(roomy).id, wall: "b", side: "" })]);
    assert.equal(sinkOf(r2.cfg).run, "b");
    assert.equal(slots(r2.cfg).find((s) => s.type === "perilica")?.run, "b", "with room, the dishwasher comes along");
  });

  it("the fridge to the other side: a side-by-side on the left (its own column), then back", () => {
    const r = applyOps(L, [op({ op: "hladnjak", kind: "side-by-side", side: "lijevo", wall: "", finish: "tamni inox", handles: "udubljena" })]);
    assert.equal(r.refused, 0, r.notes.join(" "));
    const fridge = slots(r.cfg).find((s) => s.type === "hladnjak-sbs");
    assert.ok(fridge);
    assert.equal(fridge.run, "b");
    assert.equal(r.cfg.finish?.fridge, "tamni-inox");
    assert.equal(r.cfg.finish?.fridgeHandle, "udubljena");
    assert.ok(slots(r.cfg).some((s) => s.type === "pecnica"), "the oven stayed");
  });

  it("the oven under the hob, then back into a column", () => {
    const a = applyOps(L, [op({ op: "pecnica", place: "ispod-ploce", height: "", below: "", microwave: "" })]);
    assert.equal(a.refused, 0, a.notes.join(" "));
    assert.ok(slots(a.cfg).some((s) => s.type === "ploca-pecnica"));
    assert.ok(!slots(a.cfg).some((s) => s.type === "pecnica"));
    const b = applyOps(a.cfg, [op({ op: "pecnica", place: "stup", height: "oci", below: "vrata", microwave: "da" })]);
    assert.equal(b.refused, 0, b.notes.join(" "));
    const oven = slots(b.cfg).find((s) => s.type === "pecnica-mikro");
    assert.ok(oven);
    assert.equal(oven.opt?.ovenAt, "oci");
    assert.equal(oven.opt?.below, "vrata");
    assert.ok(slots(b.cfg).some((s) => s.type === "ploca"), "the hob is a plain hob again");
  });

  it("adds an island: ravna → otok, then its details", () => {
    const r = applyOps(DEFAULT_CONFIG, [op({ op: "oblik", layout: "otok" }), op({ op: "otok", island: { ...BLANK_ISLAND, length: 200, hob: "da", seats: 2 } })]);
    assert.equal(r.refused, 0, r.notes.join(" "));
    assert.equal(r.cfg.layout, "otok");
    assert.equal(r.cfg.island, 200);
    assert.equal(r.cfg.islandSpec?.functions, "hob");
  });

  it("island details without an island are refused with a hint", () => {
    const r = applyOps(L, [op({ op: "otok", island: { ...BLANK_ISLAND, seats: 4 } })]);
    assert.ok(r.notes.some((n) => /nema otok/.test(n)));
    assert.equal(r.cfg.layout, "L");
  });

  it("layouts: L → U keeps wall A and B; a kitchen taken off wall B leaves a room wall", () => {
    const u = applyOps(L, [op({ op: "oblik", layout: "U" })]);
    assert.equal(u.cfg.layout, "U");
    const off = applyOps(L, [op({ op: "zid", wall: "b", room: 0, kitchen: -1, start: "" })]);
    assert.equal(off.cfg.layout, "ravna");
    assert.deepEqual(off.cfg.room?.bare, ["b"]);
  });

  it("walls: the room wall and the kitchen run on it", () => {
    const r = applyOps(L, [op({ op: "zid", wall: "a", room: 480, kitchen: 360, start: "kut" })]);
    assert.equal(r.refused, 0, r.notes.join(" "));
    assert.equal(r.cfg.walls.a, 480);
    const run = planKitchen(r.cfg).runs.find((x) => x.wall === "a")!;
    assert.equal(Math.round(run.kitchen.to - run.kitchen.from), 360);
  });

  it("window: added in the middle of wall A, then removed", () => {
    const a = applyOps(L, [op({ op: "prozor", wall: "a", width: 120, from_left: 0, position: "sredina", sill: 0 })]);
    assert.deepEqual(a.cfg.window, { wall: "a", offset: 150, width: 120, sill: 95 });
    const b = applyOps(a.cfg, [op({ op: "prozor", wall: "nema", width: 0, from_left: 0, position: "", sill: 0 })]);
    assert.equal(b.cfg.window, null);
  });

  it("heights up to the ceiling in one piece", () => {
    const r = applyOps(L, [op({ op: "visine", mode: "do-stropa", one_piece: "da", worktop: 0, gap: 0 })]);
    assert.equal(r.cfg.heights?.mode, "do-stropa");
    assert.equal(r.cfg.heights?.onePiece, true);
  });

  it("adds a larder next to the fridge, swaps and resizes elements", () => {
    const fridge = slots(L).find((s) => s.type === "hladnjak")!;
    const a = applyOps(L, [op({ op: "dodaj", type: "smocnica", zone: "visoki", wall: "", side: "", next_to: fridge.id, width: 30 })]);
    assert.equal(a.refused, 0, a.notes.join(" "));
    assert.ok(slots(a.cfg).some((s) => s.type === "smocnica"));
    const drawers = slots(L).find((s) => s.zone === "base" && s.type === "ladice" && s.width >= 60)!;
    const b = applyOps(L, [op({ op: "zamijeni", element: drawers.id, type: "vrata2", width: 0 })]);
    assert.equal(b.refused, 0, b.notes.join(" "));
    assert.ok(slots(b.cfg).filter((s) => s.type === "vrata2").length >= 1);
  });

  it("ids the model saw still find their element after earlier operations renumbered the row", () => {
    const base = slots(L).filter((s) => s.run === "a" && s.zone === "base").sort((p, q) => p.x - q.x);
    const first = base.find((s) => !s.cornerId && s.type !== "sudoper" && s.type !== "perilica")!;
    const sink = sinkOf(L);
    // remove a cabinet left of the sink, then move "the sink" by the id it had before
    const r = applyOps(L, [op({ op: "ukloni", element: first.id, whole_column: "" }), op({ op: "pomakni", element: sink.id, direction: "desno", steps: 0 })]);
    assert.equal(r.refused, 0, r.notes.join(" "));
    assert.equal(sinkOf(r.cfg).type, "sudoper");
  });

  it("works on a kitchen edited by hand (explicit runs)", () => {
    const p = planKitchen(L);
    const drawer = p.slots.find((s) => s.run === "b" && s.type === "ladice")!;
    const edited = changeType(L, drawer.id, "smece").cfg;
    assert.ok(edited.runs?.b, "an explicit list");
    const r = applyOps(edited, [op({ op: "stil", style: { ...BLANK_STYLE, front: "hrast" } }), op({ op: "napa", kind: "kosa", finish: "crna", island: "" })]);
    assert.equal(r.refused, 0);
    assert.equal(r.cfg.front, "hrast");
    assert.equal(r.cfg.hood?.kind, "kosa");
    assert.ok(slots(r.cfg).some((s) => s.type === "smece"), "the hand edit stays");
  });

  it("moves the tall column to the other end", () => {
    const r = applyOps(L, [op({ op: "premjesti", element: "tall-0", wall: "b", side: "lijevo" })]);
    assert.equal(r.refused, 0, r.notes.join(" "));
    assert.equal(columnEnd(r.cfg, "tall"), "b-left");
  });

  it("never throws: 300 random operations on a few kitchens", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rnd() * xs.length)];
    const kitchens = [L, DEFAULT_CONFIG, sanitizeConfig({ ...DEFAULT_CONFIG, layout: "U" }), sanitizeConfig({ ...DEFAULT_CONFIG, layout: "otok" })];
    const types = ["ladice", "vrata", "sudoper", "ploca", "smocnica", "hladnjak-sbs", "vitrina", "nisa", "napa", "xx"];
    const make = (cfg: KitchenConfig): EditOp => {
      const ids = [...slots(cfg).map((s) => s.id), "a-base-99", ""];
      const el = pick(ids);
      const n = () => pick([0, -1, 30, 60, 90, 120, 999, 45]);
      const all: EditOp[] = [
        { op: "pomakni", element: el, direction: pick(["lijevo", "desno"] as const), steps: pick([0, 1, 9]) },
        { op: "premjesti", element: el, wall: pick(["a", "b", "c", "otok"] as const), side: pick(["", "lijevo", "desno"] as const) },
        { op: "zamijeni", element: el, type: pick(types), width: n() },
        { op: "sirina", element: el, width: n() },
        { op: "ukloni", element: el, whole_column: pick(["", "da"] as const) },
        { op: "dodaj", type: pick(types), zone: pick(["donji", "gornji", "visoki", "otok"] as const), wall: pick(["", "a", "b", "c"] as const), side: pick(["", "lijevo", "desno"] as const), next_to: pick(["", el]), width: n() },
        { op: "hladnjak", kind: pick(["", "ugradbeni", "side-by-side", "bez"] as const), side: pick(["", "lijevo", "desno"] as const), wall: pick(["", "a", "b", "c"] as const), finish: pick(["", "crni", "x"]), handles: pick(["", "udubljena"] as const) },
        { op: "pecnica", place: pick(["", "stup", "ispod-ploce"] as const), height: pick(["", "oci", "nisko"] as const), below: pick(["", "vrata"] as const), microwave: pick(["", "da", "ne"] as const) },
        { op: "oblik", layout: pick(["ravna", "L", "U", "otok", "poluotok", "G"] as const) },
        { op: "zid", wall: pick(["a", "b", "c"] as const), room: n(), kitchen: n(), start: pick(["", "kut", "kraj"] as const) },
        { op: "gornji", kind: pick(["ormarici", "police", "bez"] as const), wall: pick(["", "a", "b"] as const) },
        { op: "otok", island: { ...BLANK_ISLAND, length: n(), seats: pick([0, 2, 9]), bar: pick(["", "povisen", "stol", "nema"] as const), sink: pick(["", "da"] as const) } },
        { op: "opcije", element: el, open: pick(["", "push", "gola"] as const), drawers: pick(["", "msv", "4"] as const), bowl: pick(["", "lijevo"] as const), hob_width: n() },
        { op: "prozor", wall: pick(["a", "b", "c", "nema"] as const), width: n(), from_left: n(), position: pick(["", "lijevo", "desno"] as const), sill: n() },
        { op: "strop", cm: pick([0, 200, 280, 400]) },
      ];
      return pick(all);
    };
    for (let i = 0; i < 300; i++) {
      let cfg = pick(kitchens);
      const ops = [make(cfg), make(cfg)];
      const r = applyOps(cfg, ops);
      cfg = r.cfg;
      assert.equal(r.applied + r.refused, 2);
      assert.deepEqual(sanitizeConfig(cfg), cfg);
      assert.ok(decodeConfig(encodeConfig(cfg)), "encodes");
      planKitchen(cfg);
    }
  });
});
