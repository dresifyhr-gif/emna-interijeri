/**
 * The studio's last kitchen on this device (lib/studio/autosave.ts): what is stored round-trips, anything else is nothing
 * saved (malformed JSON, another shape, a code that is no studio link, older than 90 days), when the kitchen is offered
 * back ("Nastavite svoju kuhinju"), its label, and the storage wrapper never throws.
 *
 *   npx tsx --test lib/studio/autosave.test.ts
 */
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { fitToPlanner } from "../../components/studio/limits";
import {
  AUTOSAVE_KEY,
  AUTOSAVE_MAX_AGE_MS,
  kitchenLabel,
  parseSaved,
  readSaved,
  serializeSaved,
  shouldOfferRestore,
  writeSaved,
  type SavedKitchen,
} from "./autosave";
import { sanitizeConfig } from "./plan";
import { configFromQuery, decodeConfig, encodeConfig } from "./share";
import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

const NOW = Date.UTC(2026, 9, 27, 12);
const DAY = 24 * 60 * 60 * 1000;
const cfgOf = (patch: Partial<KitchenConfig>): KitchenConfig => fitToPlanner(sanitizeConfig({ ...DEFAULT_CONFIG, ...patch }));
const U = cfgOf({ layout: "U", walls: { a: 380, b: 220, c: 260 }, front: "krem-sjaj", top: "granit-crni" });
const savedOf = (cfg: KitchenConfig, savedAt = NOW - DAY): SavedKitchen => ({ code: encodeConfig(cfg), label: kitchenLabel(cfg), savedAt });

describe("autosave — what is stored", () => {
  it("round-trips, and the code opens the same kitchen as its ?k= link", () => {
    const s = savedOf(U);
    assert.deepEqual(parseSaved(serializeSaved(s), NOW), s);
    // what <Studio> builds from ?k= (fitToPlanner(configFromQuery)) is the same kitchen: restoring gives the same link
    const restored = fitToPlanner(configFromQuery({ k: s.code }));
    assert.equal(encodeConfig(restored), s.code);
  });

  it("malformed or foreign values are nothing saved", () => {
    const good = savedOf(U);
    const bad: (string | null | undefined)[] = [
      null,
      undefined,
      "",
      "{",
      "null",
      "42",
      '"2.L.380"',
      "[]",
      JSON.stringify({ ...good, code: 7 }),
      JSON.stringify({ ...good, label: null }),
      JSON.stringify({ ...good, label: "   " }),
      JSON.stringify({ ...good, label: "x".repeat(81) }),
      JSON.stringify({ ...good, savedAt: "yesterday" }),
      JSON.stringify({ ...good, savedAt: null }),
      JSON.stringify({ code: good.code, label: good.label }),
      "x".repeat(5000),
    ];
    for (const raw of bad) assert.equal(parseSaved(raw, NOW), null, String(raw).slice(0, 60));
  });

  it("a code decodeConfig cannot read is rejected", () => {
    for (const code of ["", "hello", "9.Q.1", "x".repeat(2100)]) {
      assert.equal(decodeConfig(code), null, `precondition: ${code.slice(0, 20)}`);
      assert.equal(parseSaved(serializeSaved({ ...savedOf(U), code }), NOW), null, code.slice(0, 20));
    }
  });

  it("older than 90 days is forgotten; a date in the future (a wrong clock) too", () => {
    assert.ok(parseSaved(serializeSaved(savedOf(U, NOW - AUTOSAVE_MAX_AGE_MS + DAY)), NOW));
    assert.equal(parseSaved(serializeSaved(savedOf(U, NOW - AUTOSAVE_MAX_AGE_MS - DAY)), NOW), null);
    assert.equal(parseSaved(serializeSaved(savedOf(U, NOW + 2 * DAY)), NOW), null);
    assert.ok(parseSaved(serializeSaved(savedOf(U, NOW + 1000)), NOW), "a second ahead is the same moment");
  });

  it("the label is trimmed", () => {
    const s = parseSaved(serializeSaved({ ...savedOf(U), label: "  U 380 × 220 × 260 · krem sjajni lak " }), NOW);
    assert.equal(s?.label, "U 380 × 220 × 260 · krem sjajni lak");
  });
});

describe("autosave — the offer", () => {
  const def = encodeConfig(fitToPlanner(configFromQuery({})));

  it("/studio without a kitchen link and a saved kitchen: offered, also over a preset (?oblik / ?front / ?top)", () => {
    assert.equal(shouldOfferRestore({ hasKitchenLink: false, saved: savedOf(U), currentCode: def }), true);
    const preset = encodeConfig(fitToPlanner(configFromQuery({ oblik: "L", front: "lak", top: "hrast" })));
    assert.equal(shouldOfferRestore({ hasKitchenLink: false, saved: savedOf(U), currentCode: preset }), true);
  });

  it("nothing saved, a kitchen link in the address, or the same kitchen on screen: not offered", () => {
    assert.equal(shouldOfferRestore({ hasKitchenLink: false, saved: null, currentCode: def }), false);
    assert.equal(shouldOfferRestore({ hasKitchenLink: true, saved: savedOf(U), currentCode: def }), false);
    const same = savedOf(U);
    assert.equal(shouldOfferRestore({ hasKitchenLink: false, saved: same, currentCode: same.code }), false);
  });
});

describe("autosave — the label", () => {
  it("shape, the walls A → C and the front", () => {
    assert.equal(kitchenLabel(cfgOf({})), "L 380 × 220 · antracit");
    assert.equal(kitchenLabel(U), "U 380 × 220 × 260 · krem sjajni lak");
    assert.equal(kitchenLabel(cfgOf({ layout: "ravna", walls: { a: 300, b: 220, c: 220 }, front: "hrast-dimljeni" })), "Ravna 300 · hrast dimljeni");
    assert.match(kitchenLabel(cfgOf({ layout: "otok" })), /^S otokom \d+ · antracit$/);
  });

  it("every layout and front gives a short label that parseSaved accepts", () => {
    for (const layout of ["ravna", "L", "U", "otok", "poluotok", "G"] as const) {
      const c = cfgOf({ layout });
      const s = savedOf(c);
      assert.ok(s.label.length <= 80, s.label);
      assert.deepEqual(parseSaved(serializeSaved(s), NOW), s, layout);
    }
  });
});

describe("autosave — storage", () => {
  const g = globalThis as { window?: unknown };
  afterEach(() => {
    delete g.window;
  });

  it("without a window (server, tests) it reads nothing and writes nothing, without throwing", () => {
    assert.equal(readSaved(), null);
    assert.doesNotThrow(() => writeSaved(savedOf(U)));
  });

  it("blocked storage (private mode): nothing, no throw", () => {
    const boom = () => {
      throw new Error("SecurityError");
    };
    g.window = { localStorage: { getItem: boom, setItem: boom } };
    assert.equal(readSaved(), null);
    assert.doesNotThrow(() => writeSaved(savedOf(U)));
    g.window = {
      get localStorage() {
        return boom();
      },
    };
    assert.equal(readSaved(), null);
    assert.doesNotThrow(() => writeSaved(savedOf(U)));
  });

  it("writes under emna-studio-zadnja and reads it back", () => {
    const store = new Map<string, string>();
    g.window = { localStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) } };
    const s = savedOf(U, Date.now() - 1000);
    writeSaved(s);
    assert.ok(store.has(AUTOSAVE_KEY));
    assert.deepEqual(readSaved(), s);
    store.set(AUTOSAVE_KEY, "{broken");
    assert.equal(readSaved(), null);
  });
});
