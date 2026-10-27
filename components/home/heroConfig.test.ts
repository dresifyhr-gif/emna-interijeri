/**
 * Homepage hero (components/home/heroConfig.ts): when the live 3D starts by itself, waits for a tap, or stays off —
 * and the scroll → engine mapping it relies on.
 *
 *   npx tsx --test components/home/heroConfig.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ASSEMBLED, engineProgress, heroStart, presetIndexAt, type HeroDevice } from "./heroConfig";

const desktop: HeroDevice = { reducedMotion: false, saveData: false, coarse: false, cores: 8, memory: 8 };
const phone = (cores: number | undefined, memory?: number): HeroDevice => ({ reducedMotion: false, saveData: false, coarse: true, cores, memory });

describe("hero 3D start", () => {
  it("desktop starts by itself, whatever the hardware says", () => {
    assert.equal(heroStart(desktop), "auto");
    assert.equal(heroStart({ ...desktop, cores: 2, memory: 2 }), "auto");
    assert.equal(heroStart({ ...desktop, cores: undefined, memory: undefined }), "auto");
  });

  it("phones and tablets start by themselves only with ≥ 6 cores and, when known, ≥ 4 GB", () => {
    assert.equal(heroStart(phone(8, 8)), "auto");
    assert.equal(heroStart(phone(6, 4)), "auto");
    // Safari tells no memory
    assert.equal(heroStart(phone(8)), "auto");
    assert.equal(heroStart(phone(4, 8)), "tap");
    assert.equal(heroStart(phone(8, 2)), "tap");
    assert.equal(heroStart(phone(8, 0.5)), "tap");
    // no core count: not known to be strong enough
    assert.equal(heroStart(phone(undefined, 8)), "tap");
  });

  it("Save-Data waits for a tap, on every device", () => {
    assert.equal(heroStart({ ...desktop, saveData: true }), "tap");
    assert.equal(heroStart({ ...phone(8, 8), saveData: true }), "tap");
  });

  it("reduced motion keeps the poster only", () => {
    assert.equal(heroStart({ ...desktop, reducedMotion: true }), "off");
    assert.equal(heroStart({ ...phone(2, 1), reducedMotion: true, saveData: true }), "off");
  });
});

describe("hero scroll → engine", () => {
  it("the scroll starts where the assembly intro ends and runs to the end of the orbit", () => {
    assert.equal(engineProgress(0), ASSEMBLED);
    assert.equal(engineProgress(1), 1);
    assert.equal(engineProgress(-0.5), ASSEMBLED);
    assert.equal(engineProgress(2), 1);
  });

  it("three presets along the scroll", () => {
    assert.deepEqual([0, 0.2, 0.34, 0.5, 0.67, 1].map(presetIndexAt), [0, 0, 1, 1, 2, 2]);
  });
});
