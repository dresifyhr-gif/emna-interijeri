/**
 * "Opiši kuhinju": free words → catalogue ids, and the composer (brief → KitchenConfig) for Croatian descriptions as
 * fixed briefs (what a model fills in for them) — no network.
 *
 *   npx tsx --test lib/studio/ai/*.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { planKitchen, sanitizeConfig } from "../plan";
import { decodeConfig, encodeConfig } from "../share";
import type { KitchenConfig } from "../types";
import { composeKitchen } from "./compose";
import { columnEnd } from "./moves";
import { BLANK_ISLAND, blankBrief, type KitchenBrief } from "./schema";
import { norm, resolveBacksplash, resolveFloor, resolveFront, resolveHandleColor, resolveHandles, resolveRoomWall, resolveTop } from "./vocab";

const brief = (f: (b: KitchenBrief) => void): KitchenBrief => {
  const b = blankBrief();
  f(b);
  return b;
};

/** every composed kitchen: valid, plans with a sink and a hob somewhere, survives a share link unchanged */
function sound(cfg: KitchenConfig, label: string) {
  assert.deepEqual(sanitizeConfig(cfg), cfg, `${label}: sanitized`);
  const plan = planKitchen(cfg);
  assert.ok(plan.sinkId, `${label}: has a sink`);
  assert.ok(plan.hobId, `${label}: has a hob`);
  const back = decodeConfig(encodeConfig(cfg));
  assert.ok(back, `${label}: share link decodes`);
  assert.equal(encodeConfig(back as KitchenConfig), encodeConfig(cfg), `${label}: share link round trip`);
  return plan;
}

const types = (cfg: KitchenConfig) => planKitchen(cfg).slots.map((s) => s.type);

describe("vocab: free words → catalogue ids", () => {
  it("normalizes Croatian letters and punctuation", () => {
    assert.equal(norm("Ručkice, GOLA!"), "ruckice gola");
    assert.equal(norm("Đurđa  šž"), "durda sz");
  });
  it("fronts", () => {
    assert.equal(resolveFront("bijeli lak"), "lak");
    assert.equal(resolveFront("bijelim lakom"), "lak");
    assert.equal(resolveFront("bijela mat"), "bijela");
    assert.equal(resolveFront("antracit"), "antracit");
    assert.equal(resolveFront("antracit lak"), "antracit-sjaj");
    assert.equal(resolveFront("hrast"), "hrast");
    assert.equal(resolveFront("hrastove fronte"), "hrast");
    assert.equal(resolveFront("tamni hrast"), "hrast-dimljeni");
    assert.equal(resolveFront("crni lak"), "crna-sjaj");
    assert.equal(resolveFront("kadulja zelena"), "kadulja");
    assert.equal(resolveFront("siva-tamna"), "siva-tamna");
    assert.equal(resolveFront("ljubičasta"), null);
    assert.equal(resolveFront(""), null);
  });
  it("worktops", () => {
    assert.equal(resolveTop("crni kamen"), "crni");
    assert.equal(resolveTop("crnim kamenom"), "crni");
    assert.equal(resolveTop("bijeli mramor"), "mramor");
    assert.equal(resolveTop("crni mramor"), "nero");
    assert.equal(resolveTop("crni mramor sa zlatnim žilama"), "nero-zlatni");
    assert.equal(resolveTop("hrastova ploča"), "hrast");
    assert.equal(resolveTop("bijeli kvarc"), "kvarc-bijeli");
    assert.equal(resolveTop("nero-zlatni"), "nero-zlatni");
    assert.equal(resolveTop("staklo"), null);
  });
  it("handles: gola wins over a generic ručkice", () => {
    assert.equal(resolveHandles("ručkice gola"), "bez");
    assert.equal(resolveHandles("bez ručki"), "bez");
    assert.equal(resolveHandles("ručkice"), "letvica");
    assert.equal(resolveHandles("na dodir"), "push");
    assert.equal(resolveHandles("tip-on"), "push");
    assert.equal(resolveHandles("gumbi"), "gumb");
    assert.equal(resolveHandles("luft za prste"), "luft");
    assert.equal(resolveHandles("letvica"), "letvica");
    assert.equal(resolveHandles("nešto treće"), null);
  });
  it("finishes, room, backsplash", () => {
    assert.equal(resolveHandleColor("zlatne"), "mesing");
    assert.equal(resolveHandleColor("crne"), "crna");
    assert.equal(resolveRoomWall("bijeli zid"), "bijela");
    assert.equal(resolveFloor("riblja kost"), "riblja-kost");
    assert.equal(resolveFloor("svijetli parket"), "parket-svijetli");
    assert.deepEqual(resolveBacksplash("crno staklo"), { kind: "staklo", finish: "staklo-crno" });
    assert.deepEqual(resolveBacksplash("metro pločice"), { kind: "plocice", finish: "subway-bijele" });
    assert.deepEqual(resolveBacksplash("do pola"), { kind: "pola" });
    assert.deepEqual(resolveBacksplash("bez"), { kind: "bez" });
    assert.deepEqual(resolveBacksplash("kao radna ploča"), { kind: "ploca" });
  });
});

describe("composer: Croatian descriptions (as fixed briefs) → kitchens", () => {
  it("1. the owner's: zid 4,20 m, drugi 2,90 m, visina 2,60, L, dupli frižider lijevo, sudoper ispod prozora, bijeli lak, crni kamen, ručkice gola", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 420;
        b.walls.b.room = 290;
        b.ceiling = 260;
        b.fridge = { kind: "side-by-side", side: "lijevo", wall: "", finish: "", handles: "" };
        b.sink = { wall: "", under_window: "da", side: "", width: 0, dishwasher: "" };
        b.style.front = "bijeli lak";
        b.style.worktop = "crni kamen";
        b.style.handles = "gola";
      }),
    );
    const plan = sound(r.cfg, "owner");
    assert.equal(r.cfg.layout, "L");
    assert.deepEqual([r.cfg.walls.a, r.cfg.walls.b, r.cfg.ceiling], [420, 290, 260]);
    assert.equal(r.cfg.front, "lak");
    assert.equal(r.cfg.top, "crni");
    assert.equal(r.cfg.handles, "bez");
    // the side-by-side at the open (left) end of wall B, the oven column stays on the right of A
    const sbs = plan.slots.find((s) => s.type === "hladnjak-sbs");
    assert.ok(sbs);
    assert.equal(columnEnd(r.cfg, "tall"), "b-left");
    assert.ok(plan.slots.some((s) => s.type === "pecnica"));
    // a window was assumed on wall A and the sink stands under it
    assert.equal(r.cfg.window?.wall, "a");
    const sink = plan.slots.find((s) => s.id === plan.sinkId)!;
    const w = r.cfg.window!;
    assert.equal(sink.run, "a");
    assert.ok(sink.x < w.offset + w.width && sink.x + sink.width > w.offset, "sink under the window");
    assert.ok(r.assumptions.some((a) => /Prozor/.test(a)));
    assert.ok(!r.assumptions.some((a) => /strop/.test(a)), "the ceiling was given");
  });

  it("1b. \"dupli frižider lijevo\" with the model naming wall A: the side wins (A's left end is the corner)", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 420;
        b.walls.b.room = 290;
        b.fridge = { kind: "side-by-side", side: "lijevo", wall: "a", finish: "", handles: "" };
      }),
    );
    sound(r.cfg, "side wins");
    assert.equal(columnEnd(r.cfg, "tall"), "b-left");
    assert.ok(types(r.cfg).includes("pecnica"), "the oven column stays");
    assert.deepEqual(r.notes, []);
  });

  it("2. ravna 3 m, bijela mat, hrastova radna ploča, crne letvice", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 300;
        b.style.front = "bijela mat";
        b.style.worktop = "hrastova ploča";
        b.style.handles = "letvica";
        b.style.handle_color = "crne";
      }),
    );
    sound(r.cfg, "ravna");
    assert.equal(r.cfg.layout, "ravna");
    assert.equal(r.cfg.walls.a, 300);
    assert.equal(r.cfg.front, "bijela");
    assert.equal(r.cfg.top, "hrast");
    assert.equal(r.cfg.handles, "letvica");
    assert.equal(r.cfg.finish?.handleColor, "crna");
    assert.ok(r.assumptions.includes("Pretpostavio sam visinu stropa 260 cm."));
  });

  it("3. U 3,2 × 2,4 × 2,4, antracit, bijeli kvarc, do stropa iz jednog komada, strop 2,7", () => {
    const r = composeKitchen(
      brief((b) => {
        b.walls.a.room = 320;
        b.walls.b.room = 240;
        b.walls.c.room = 240;
        b.ceiling = 270;
        b.heights = { mode: "do-stropa", one_piece: "da", worktop: 0 };
        b.style.front = "antracit";
        b.style.worktop = "bijeli kvarc";
      }),
    );
    sound(r.cfg, "U");
    assert.equal(r.cfg.layout, "U", "inferred from three walls");
    assert.ok(r.assumptions.some((a) => /slova U/.test(a)));
    assert.equal(r.cfg.heights?.mode, "do-stropa");
    assert.equal(r.cfg.heights?.onePiece, true);
    assert.equal(r.cfg.top, "kvarc-bijeli");
  });

  it("4. otok: zid 4 m, otok 2,2 m sa sudoperom i 3 barske stolice, hrast, crni mramor", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "otok";
        b.walls.a.room = 400;
        b.island = { ...BLANK_ISLAND, length: 220, sink: "da", seats: 3 };
        b.style.front = "hrast";
        b.style.worktop = "crni mramor";
      }),
    );
    const plan = sound(r.cfg, "otok");
    assert.equal(r.cfg.island, 220);
    assert.equal(r.cfg.islandSpec?.functions, "sink");
    assert.equal(plan.slots.find((s) => s.id === plan.sinkId)?.run, "isl", "the sink is on the island");
    assert.equal(plan.island?.seats.length, 3);
    assert.equal(r.cfg.top, "nero");
  });

  it("5. L 3,6 i 2,5, pećnica ispod ploče, frižider desno, bez perilice", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 360;
        b.walls.b.room = 250;
        b.oven = { place: "ispod-ploce", side: "", height: "", below: "", microwave: "" };
        b.fridge = { kind: "ugradbeni", side: "desno", wall: "", finish: "", handles: "" };
        b.sink = { wall: "", under_window: "", side: "", width: 0, dishwasher: "ne" };
      }),
    );
    sound(r.cfg, "pećnica ispod ploče");
    const t = types(r.cfg);
    assert.ok(t.includes("ploca-pecnica"), "oven under the hob");
    assert.ok(!t.includes("pecnica") && !t.includes("pecnica-mikro"), "no oven column");
    assert.ok(t.includes("hladnjak"));
    assert.equal(columnEnd(r.cfg, "tall"), "a-right");
    assert.ok(!t.includes("perilica"), "no dishwasher");
  });

  it("6. poluotok lijevo, zid 3,8 m, povišeni šank", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "poluotok";
        b.walls.a.room = 380;
        b.island = { ...BLANK_ISLAND, side: "lijevo", bar: "povisen" };
      }),
    );
    const plan = sound(r.cfg, "poluotok");
    assert.equal(r.cfg.islandSpec?.side, "left");
    assert.equal(r.cfg.islandSpec?.bar?.kind, "raised");
    assert.equal(plan.island?.side, "left");
  });

  it("7. G 3,5 i 2,8, gola, kadulja, drvena ploča", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "G";
        b.walls.a.room = 350;
        b.walls.b.room = 280;
        b.style.handles = "gola";
        b.style.front = "kadulja zelena";
        b.style.worktop = "drvena ploča";
      }),
    );
    sound(r.cfg, "G");
    assert.equal(r.cfg.layout, "G");
    assert.equal(r.cfg.front, "kadulja");
    assert.equal(r.cfg.top, "hrast");
    assert.ok(r.assumptions.some((a) => /Poluotok je dug/.test(a)));
  });

  it("8. ravna 2,8 m, bez gornjih elemenata — samo police", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 280;
        b.wall_units = "police";
      }),
    );
    const plan = sound(r.cfg, "police");
    const uppers = plan.slots.filter((s) => s.zone === "upper" && s.type !== "prazno");
    assert.ok(uppers.length > 0);
    assert.ok(uppers.every((s) => s.type === "police-visece" || s.type === "napa"), uppers.map((s) => s.type).join(","));
  });

  it("9. bez ikakvih gornjih: vidljiva napa, otvorena kutna polica", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 380;
        b.walls.b.room = 240;
        b.wall_units = "bez";
      }),
    );
    const plan = sound(r.cfg, "bez gornjih");
    assert.ok(plan.slots.filter((s) => s.zone === "upper").every((s) => s.type === "kutna-polica"));
    assert.equal(r.cfg.hood?.kind, "dimnjak");
    assert.ok(plan.runs.some((x) => x.hoods.length > 0), "a visible hood above the hob");
  });

  it("10. L: zid A 4,5 m, ali kuhinja samo 3 m; zid B 3 m", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a = { room: 450, kitchen: 300, start: "kut" };
        b.walls.b.room = 300;
      }),
    );
    const plan = sound(r.cfg, "extent");
    assert.equal(r.cfg.walls.a, 450);
    const run = plan.runs.find((x) => x.wall === "a")!;
    assert.equal(Math.round(run.kitchen.to - run.kitchen.from), 300);
    assert.equal(run.kitchen.from, 0, "from the corner");
  });

  it("11. ravna 4 m: hladnjak, smočnica 30 i pećnica s mikrovalnom u visini očiju, vrata ispod", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 400;
        b.fridge = { kind: "ugradbeni", side: "", wall: "", finish: "", handles: "" };
        b.oven = { place: "stup", side: "", height: "oci", below: "vrata", microwave: "da" };
        b.tall_units = [{ type: "smocnica", width: 30 }];
      }),
    );
    const plan = sound(r.cfg, "stup");
    const col = plan.slots.filter((s) => s.zone === "tall" && s.list?.id === "tall").sort((p, q) => p.x - q.x);
    assert.deepEqual(
      col.map((s) => `${s.type} ${s.width}`),
      ["pecnica-mikro 60", "smocnica 30", "hladnjak 60"],
      "oven towards the kitchen, the fridge at the open end",
    );
    const oven = col[0];
    assert.equal(oven.opt?.ovenAt, "oci");
    assert.equal(oven.opt?.below, "vrata");
  });

  it("12. ravna 3,4 m, prozor desno širok 120, sudoper ispod prozora", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 340;
        b.window = { wall: "a", width: 120, from_left: 0, position: "desno", sill: 0 };
        b.sink = { wall: "", under_window: "da", side: "", width: 0, dishwasher: "" };
      }),
    );
    const plan = sound(r.cfg, "prozor desno");
    const w = r.cfg.window!;
    assert.equal(w.width, 120);
    assert.ok(w.offset > 340 / 2 - 60, "towards the right");
    const sink = plan.slots.find((s) => s.id === plan.sinkId)!;
    assert.ok(sink.x < w.offset + w.width && sink.x + sink.width > w.offset, "sink under the window");
  });

  it("13. unknown words keep the defaults and say so", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 300;
        b.style.front = "ljubičasta s točkicama";
        b.style.worktop = "staklena";
        b.room = { wall_finish: "neonsko roza", floor: "", ceiling_lamp: "da" };
      }),
    );
    sound(r.cfg, "unknown");
    assert.equal(r.cfg.front, "antracit");
    assert.ok(r.notes.some((n) => /Boju fronti „ljubičasta s točkicama“ nemam/.test(n)));
    assert.ok(r.notes.some((n) => /Radnu ploču „staklena“ nemam/.test(n)));
    assert.ok(r.notes.some((n) => /neonsko roza/.test(n)));
    assert.equal(r.cfg.room?.ceiling, true);
    assert.equal(r.cfg.room?.lamp, true);
  });

  it("14. a side-by-side that cannot fit falls back with a note, never breaks the kitchen", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 200;
        b.fridge = { kind: "side-by-side", side: "", wall: "", finish: "crni", handles: "" };
      }),
    );
    sound(r.cfg, "tiny sbs");
    assert.ok(r.notes.length > 0, "says what happened");
  });

  it("15. nothing but a style (a Pinterest photo): defaults for the room, every one stated", () => {
    const r = composeKitchen(
      brief((b) => {
        b.style.front = "hrast";
        b.style.worktop = "bijeli mramor";
        b.style.backsplash = "crno staklo";
        b.room = { wall_finish: "", floor: "riblja kost", ceiling_lamp: "" };
      }),
    );
    sound(r.cfg, "style only");
    assert.equal(r.cfg.layout, "ravna");
    assert.ok(r.assumptions.some((a) => /zid A dug/.test(a)));
    assert.ok(r.assumptions.some((a) => /strop/.test(a)));
    assert.deepEqual(r.cfg.backsplash, { kind: "staklo", finish: "staklo-crno" });
    assert.equal(r.cfg.room?.floor, "riblja-kost");
  });

  it("16. walls out of range are clamped with a note; a window on a wall without a kitchen makes it a room wall", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 1200;
        b.walls.b.room = 260;
        b.walls.c.room = 300;
        b.window = { wall: "c", width: 100, from_left: 0, position: "sredina", sill: 0 };
      }),
    );
    sound(r.cfg, "clamped");
    assert.equal(r.cfg.walls.a, 800);
    assert.ok(r.notes.some((n) => /Zid A može biti od/.test(n)));
    assert.deepEqual(r.cfg.room?.bare, ["c"]);
    assert.equal(r.cfg.walls.c, 300);
  });

  it("17. hob 90 on wall B, oven in the column at eye level, chimney hood in black", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 400;
        b.walls.b.room = 300;
        b.hob = { wall: "b", width: 90, oven_below: "" };
        b.hood = { kind: "dimnjak", finish: "crna", island: "" };
        b.oven = { place: "stup", side: "", height: "oci", below: "", microwave: "" };
      }),
    );
    const plan = sound(r.cfg, "hob");
    const hob = plan.slots.find((s) => s.id === plan.hobId)!;
    assert.equal(hob.run, "b");
    assert.equal(hob.width, 90);
    assert.equal(r.cfg.hood?.kind, "dimnjak");
    assert.equal(r.cfg.hood?.finish, "crna");
    assert.equal(plan.slots.find((s) => s.type === "pecnica")?.opt?.ovenAt, "oci");
  });

  it("18. \"ravni zid 4,5 m, otok 2,4 m s pločom\": a model that names the wall still gets the island", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "ravna";
        b.walls.a.room = 450;
        b.hob = { wall: "otok", width: 0, oven_below: "" };
        b.island = { ...BLANK_ISLAND, length: 240, sink: "ne", hob: "da", seats: 4, hood: "da" };
      }),
    );
    const plan = sound(r.cfg, "ravna + otok");
    assert.equal(r.cfg.layout, "otok");
    assert.equal(r.cfg.island, 240);
    assert.equal(plan.slots.find((s) => s.id === plan.hobId)?.run, "isl", "the hob is on the island");
    assert.ok(!r.notes.some((n) => /nema otoka/.test(n)), r.notes.join(" | "));
  });

  it("19. an L with an island described becomes G (L with a peninsula), with a note", () => {
    const r = composeKitchen(
      brief((b) => {
        b.layout = "L";
        b.walls.a.room = 400;
        b.walls.b.room = 300;
        b.island = { ...BLANK_ISLAND, length: 160, seats: 2 };
      }),
    );
    sound(r.cfg, "L + otok");
    assert.equal(r.cfg.layout, "G");
    assert.ok(r.notes.some((n) => /poluotok/.test(n)));
  });
});
