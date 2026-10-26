/**
 * Picture framing of StudioEngineApi.snapshotViews (lib/studio/engine/camera.ts) — the math only, no WebGL: the
 * "kitchen" framing fits the kitchen's own boxes (not their bounding box, which for an L / U spans the bare floor between
 * the runs) into the requested region, centred in it and tight; a requested region is made safe.
 *
 *   npx tsx --test lib/studio/snapshot.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as THREE from "three";
import { applyViewOffset, fitPoints, snapshotRegion, viewDir, type Region } from "./engine/camera";

const corners = (x0: number, x1: number, y0: number, y1: number, z0: number, z1: number): THREE.Vector3[] => {
  const out: THREE.Vector3[] = [];
  for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) out.push(new THREE.Vector3(x, y, z));
  return out;
};

/** an L kitchen (m): wall A 3.8 along x, wall B 2.2 along z, cabinets 0.62 deep up to the wall units at 2.23 */
const L_KITCHEN = [...corners(-1.9, 1.9, 0, 2.23, 0, 0.62), ...corners(-1.9, -1.28, 0, 2.23, 0, 2.2)];
/** a straight run with an island and its seats */
const ISLAND = [...corners(-1.9, 1.9, 0, 2.23, 0, 0.62), ...corners(-1.2, 1.2, 0, 0.94, 1.75, 2.7)];

const COVER: Region = { x0: 0.12, x1: 0.88, y0: 0.17, y1: 0.75 };
const VIEWS: Region = { x0: 0.06, x1: 0.94, y0: 0.08, y1: 0.92 };

describe("snapshot framing", () => {
  for (const [name, pts] of [
    ["L", L_KITCHEN],
    ["otok", ISLAND],
  ] as const) {
    for (const [az, el] of [
      [0.5, 0.24],
      [-0.62, 0.3],
      [0, 0.12],
      [0.3, 1.1],
    ]) {
      for (const [rn, region, W, H] of [
        ["cover", COVER, 2200, 1010],
        ["views", VIEWS, 1560, 740],
      ] as const) {
        it(`${name} at ${az} / ${el}, ${rn}: every corner inside the region, centred, tight`, () => {
          const cam = new THREE.PerspectiveCamera(30, W / H, 0.05, 200);
          applyViewOffset(cam, W, H, region);
          const f = fitPoints(cam, [...pts], viewDir(az, el), region);
          assert.ok(Number.isFinite(f.distance) && f.distance > 0);
          cam.position.copy(f.position);
          cam.lookAt(f.target);
          cam.updateMatrixWorld(true);
          let x0 = 1;
          let x1 = 0;
          let y0 = 1;
          let y1 = 0;
          const v = new THREE.Vector3();
          for (const p of pts) {
            v.copy(p).project(cam);
            const sx = (v.x + 1) / 2;
            const sy = (1 - v.y) / 2;
            x0 = Math.min(x0, sx);
            x1 = Math.max(x1, sx);
            y0 = Math.min(y0, sy);
            y1 = Math.max(y1, sy);
          }
          const tol = 0.003;
          assert.ok(x0 >= region.x0 - tol && x1 <= region.x1 + tol && y0 >= region.y0 - tol && y1 <= region.y1 + tol, `out of the region: ${[x0, x1, y0, y1].map((n) => n.toFixed(3))}`);
          // centred in the region (on the axis that has room to spare)
          assert.ok(Math.abs((x0 + x1) / 2 - (region.x0 + region.x1) / 2) < 0.02, `x centre ${((x0 + x1) / 2).toFixed(3)}`);
          assert.ok(Math.abs((y0 + y1) / 2 - (region.y0 + region.y1) / 2) < 0.02, `y centre ${((y0 + y1) / 2).toFixed(3)}`);
          // tight: it fills the region one way
          assert.ok(x1 - x0 >= region.x1 - region.x0 - 0.02 || y1 - y0 >= region.y1 - region.y0 - 0.02, `loose: ${(x1 - x0).toFixed(3)} × ${(y1 - y0).toFixed(3)}`);
        });
      }
    }
  }

  it("no points: a camera at the minimum distance, nothing NaN", () => {
    const cam = new THREE.PerspectiveCamera(30, 2, 0.05, 200);
    const f = fitPoints(cam, [], viewDir(0.3, 0.3), VIEWS);
    assert.ok([f.position.x, f.position.y, f.position.z, f.distance].every(Number.isFinite));
  });

  it("a requested region is made safe", () => {
    const d = { x0: 0.03, x1: 0.97, y0: 0.05, y1: 0.95 };
    assert.deepEqual(snapshotRegion(undefined), d);
    assert.deepEqual(snapshotRegion({ x0: 0.1, x1: Number.NaN, y0: 0.1, y1: 0.9 }), d);
    assert.deepEqual(snapshotRegion({ x0: 0.4, x1: 0.5, y0: 0.1, y1: 0.9 }), d, "too narrow");
    assert.deepEqual(snapshotRegion({ x0: 0.9, x1: 0.1, y0: -0.5, y1: 1.5 }), { x0: 0.1, x1: 0.9, y0: 0, y1: 1 }, "sorted and clamped");
    assert.deepEqual(snapshotRegion(COVER), COVER);
  });
});
