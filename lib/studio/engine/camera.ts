/** Camera framing: fit a box into a screen region (works with setViewOffset). */

import * as THREE from "three";

export interface Region {
  /** fractions of the container, 0..1 from the left / top */
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}

export interface Framing {
  target: THREE.Vector3;
  position: THREE.Vector3;
  distance: number;
}

const tmpCam = new THREE.PerspectiveCamera();
const v = new THREE.Vector3();

/** unit vector from target towards the camera for azimuth/elevation (radians) */
export function viewDir(az: number, el: number, out = new THREE.Vector3()): THREE.Vector3 {
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
}

/**
 * A requested picture region made safe (StudioEngineApi.snapshotViews `region`): sorted, inside the picture, at least
 * 20 % of it each way; absent or unusable = nearly the whole picture (3–5 % margins)
 */
export function snapshotRegion(r: Partial<Region> | null | undefined): Region {
  const d: Region = { x0: 0.03, x1: 0.97, y0: 0.05, y1: 0.95 };
  if (!r) return d;
  const v = [r.x0, r.x1, r.y0, r.y1];
  if (!v.every((n) => typeof n === "number" && Number.isFinite(n))) return d;
  const [ax, bx, ay, by] = v as number[];
  const c = (n: number) => Math.min(1, Math.max(0, n));
  const out = { x0: c(Math.min(ax, bx)), x1: c(Math.max(ax, bx)), y0: c(Math.min(ay, by)), y1: c(Math.max(ay, by)) };
  return out.x1 - out.x0 < 0.2 || out.y1 - out.y0 < 0.2 ? d : out;
}

/** apply the projection shift so `region` is the visual centre */
export function applyViewOffset(cam: THREE.PerspectiveCamera, W: number, H: number, region: Region): void {
  const cx = (region.x0 + region.x1) / 2 - 0.5;
  const cy = (region.y0 + region.y1) / 2 - 0.5;
  if (Math.abs(cx) < 1e-3 && Math.abs(cy) < 1e-3) cam.clearViewOffset();
  else cam.setViewOffset(W, H, -cx * W, -cy * H, W, H);
  cam.updateProjectionMatrix();
}

/**
 * Smallest distance along `dir` at which every corner of `box` projects
 * inside `region` (container fractions). `cam` provides fov/aspect/viewOffset.
 */
export function fitBox(cam: THREE.PerspectiveCamera, box: THREE.Box3, target: THREE.Vector3, dir: THREE.Vector3, region: Region, min = 1.5, max = 60): Framing {
  tmpCam.copy(cam);
  const corners: THREE.Vector3[] = [];
  for (const x of [box.min.x, box.max.x])
    for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) corners.push(new THREE.Vector3(x, y, z));
  // NDC bounds of the region
  const nx0 = region.x0 * 2 - 1;
  const nx1 = region.x1 * 2 - 1;
  const ny0 = 1 - region.y1 * 2;
  const ny1 = 1 - region.y0 * 2;
  const fits = (d: number) => {
    tmpCam.position.copy(target).addScaledVector(dir, d);
    tmpCam.lookAt(target);
    tmpCam.updateMatrixWorld(true);
    for (const c of corners) {
      v.copy(c).project(tmpCam);
      if (v.z > 1 || v.x < nx0 || v.x > nx1 || v.y < ny0 || v.y > ny1) return false;
    }
    return true;
  };
  let lo = min;
  let hi = max;
  if (fits(lo)) hi = lo;
  else {
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
  }
  return { target: target.clone(), position: target.clone().addScaledVector(dir, hi), distance: hi };
}

/**
 * Frame a set of points (world) from direction `dir`: the smallest distance at which every point projects inside
 * `region`, with the target moved (across the view) until the points' projected bounds sit centred in it — a tight
 * product shot of an L / U kitchen, whose bounding box would include the bare floor between its runs. `cam` provides
 * fov / aspect / viewOffset.
 */
export function fitPoints(cam: THREE.PerspectiveCamera, points: THREE.Vector3[], dir: THREE.Vector3, region: Region, min = 1.5, max = 60): Framing {
  const target = new THREE.Vector3();
  if (!points.length) return { target, position: target.clone().addScaledVector(dir, min), distance: min };
  new THREE.Box3().setFromPoints(points).getCenter(target);
  const nx0 = region.x0 * 2 - 1;
  const nx1 = region.x1 * 2 - 1;
  const ny0 = 1 - region.y1 * 2;
  const ny1 = 1 - region.y0 * 2;
  tmpCam.copy(cam);
  const place = (d: number) => {
    tmpCam.position.copy(target).addScaledVector(dir, d);
    tmpCam.lookAt(target);
    tmpCam.updateMatrixWorld(true);
  };
  const bounds = (d: number) => {
    place(d);
    let x0 = Infinity;
    let x1 = -Infinity;
    let y0 = Infinity;
    let y1 = -Infinity;
    let behind = false;
    for (const p of points) {
      v.copy(p).project(tmpCam);
      if (v.z > 1) behind = true;
      x0 = Math.min(x0, v.x);
      x1 = Math.max(x1, v.x);
      y0 = Math.min(y0, v.y);
      y1 = Math.max(y1, v.y);
    }
    return { x0, x1, y0, y1, behind };
  };
  const fits = (d: number) => {
    const b = bounds(d);
    return !b.behind && b.x0 >= nx0 && b.x1 <= nx1 && b.y0 >= ny0 && b.y1 <= ny1;
  };
  const distance = () => {
    let lo = min;
    let hi = max;
    if (fits(lo)) return lo;
    for (let i = 0; i < 28; i++) {
      const mid = (lo + hi) / 2;
      if (fits(mid)) hi = mid;
      else lo = mid;
    }
    return hi;
  };
  let d = distance();
  const right = new THREE.Vector3();
  const up = new THREE.Vector3();
  for (let k = 0; k < 4; k++) {
    // centre the projected bounds in the region: move the target across the view by the NDC offset at its distance
    const b = bounds(d);
    const dx = (b.x0 + b.x1) / 2 - (nx0 + nx1) / 2;
    const dy = (b.y0 + b.y1) / 2 - (ny0 + ny1) / 2;
    if (Math.abs(dx) < 0.005 && Math.abs(dy) < 0.005) break;
    const halfH = d * Math.tan(THREE.MathUtils.degToRad(tmpCam.fov) / 2);
    right.setFromMatrixColumn(tmpCam.matrixWorld, 0);
    up.setFromMatrixColumn(tmpCam.matrixWorld, 1);
    target.addScaledVector(right, dx * halfH * tmpCam.aspect).addScaledVector(up, dy * halfH);
    d = distance();
  }
  return { target: target.clone(), position: target.clone().addScaledVector(dir, d), distance: d };
}
