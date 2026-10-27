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

// ---------------------------------------------------------------- the room view ("Pogled iz prostorije")

const DEG = Math.PI / 180;

/**
 * The room view's lens, as a phone's main camera sees a room: 71° across a landscape picture (56° up / down at 4:3);
 * a narrower picture keeps the 4:3 frame's up / down until that would be under 52° across (a phone held upright), then
 * widens up and down (at most 80°). A small room needs more (`across`, roomViewPose: the phone's ultra-wide lens), the
 * other angles follow it. `aspect` = width / height of the visible area; returns the vertical field of view (degrees).
 */
export const ROOM_LENS = { across: 71, up: 56.3, minAcross: 52, maxUp: 80, maxAcross: 100 } as const;

export function roomLens(aspect: number, across: number = ROOM_LENS.across): number {
  const a = Math.max(0.2, aspect);
  const wide = Math.tan((across / 2) * DEG);
  let up = a >= 4 / 3 ? 2 * Math.atan(wide / a) : 2 * Math.atan((wide * 3) / 4);
  const minAcross = (ROOM_LENS.minAcross * across) / ROOM_LENS.across;
  if (2 * Math.atan(Math.tan(up / 2) * a) < minAcross * DEG) up = 2 * Math.atan(Math.tan((minAcross / 2) * DEG) / a);
  return Math.min(ROOM_LENS.maxUp, up / DEG);
}

/** the vertical field of view of the whole canvas (h px) whose visible area (`areaH` px tall) has `up` degrees */
export function canvasFov(up: number, h: number, areaH: number): number {
  return (2 * Math.atan((Math.tan((up / 2) * DEG) * h) / Math.max(1, areaH))) / DEG;
}

/** the room's ceiling light: how far it hangs under the ceiling and its glowing ring (m) */
export const LAMP = { drop: 0.12, outer: 0.225, inner: 0.165, height: 0.045, halo: 2.8 } as const;

/**
 * Where the ceiling light hangs (m, the kitchen's frame: x from wall B's face along wall A, z from wall A): over the
 * middle of wall A, a little more than a third of the way into the room (over the cooking zone, in view from the entrance)
 */
export function lampSpot(a: number, depth: number): { x: number; z: number } {
  return { x: a / 2, z: Math.min(depth - 1, Math.max(1.2, depth * 0.4)) };
}

/** eye level of the room view (m) and how far inside the entrance the photographer stands */
export const ROOM_EYE = 1.7;
const DOORWAY = 0.08;
/** against the side wall opposite an L kitchen's side run: this far from it (m) */
const BY_THE_WALL = 0.26;
/** a room this deep (m) or more: the photographer stands in its corner, beside the bare side wall; a shallower one: in the middle */
const CORNER_DEPTH = 3.5;
/** a camera outside a shallow room stays within the side walls' run past the entrance (kitchen.ts D.wallExtend 0.7) */
const OUTSIDE_MAX = 0.6;

/** the kitchen's footprint (m, engine frame) the room view keeps in the picture: its box (KitchenRT.box) */
export interface Footprint {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

/**
 * The room view's pose (engine metres: x = 0 in the middle of wall A, z from wall A into the room): standing in the
 * entrance (`depth`: how deep the room is) at eye level, like a photo of a finished kitchen — in a room at least
 * CORNER_DEPTH deep with only one side wall's kitchen, beside the side wall WITHOUT one (an L: the whole corner and both
 * runs in view), else in the middle; looking at the inner corner of that L (where its wall units meet wall A), else at
 * the middle of wall A, 1.53 m up (the pose of the owner's photo, calibrated from it: eye 1.70 m, 8 cm inside the
 * entrance, 26 cm from the side wall, 71° across). `across` is the lens (degrees across the picture): 71°, or wider so
 * that the kitchen's footprint at least 1.2 m in front of the camera fits, 3.5° to spare (at most 100°; a room too shallow for that
 * moves the camera back, at most OUTSIDE_MAX past the entrance). `aim` is the point looked at; `target` the orbit
 * centre on the same line of sight, level with the base fronts (the room view orbits about the kitchen, not the wall).
 */
export function roomViewPose(o: { a: number; depth: number; left: boolean; right: boolean; ceiling: number; footprint?: Footprint }): {
  position: THREE.Vector3;
  aim: THREE.Vector3;
  target: THREE.Vector3;
  across: number;
} {
  const half = o.a / 2;
  const side = o.left !== o.right && o.depth >= CORNER_DEPTH ? (o.left ? 1 : -1) : 0;
  const x = side * Math.max(0, half - BY_THE_WALL);
  const y = Math.min(ROOM_EYE, o.ceiling - 0.3);
  const aim = new THREE.Vector3(side ? -side * (half - 0.35) : 0, Math.min(1.53, o.ceiling - 0.5), 0);
  /** the lens the footprint needs from depth z (degrees across, 4° to spare each side) */
  const need = (z: number): number => {
    const f = o.footprint;
    if (!f) return ROOM_LENS.across;
    const far = Math.min(f.maxZ, z - 1.2);
    if (far < f.minZ) return ROOM_LENS.across;
    const look = Math.atan2(aim.x - x, z - aim.z);
    let m = 0;
    for (const px of [f.minX, f.maxX])
      for (const pz of [f.minZ, far]) {
        const d = Math.abs(Math.atan2(px - x, z - pz) - look);
        m = Math.max(m, d);
      }
    return Math.max(ROOM_LENS.across, 2 * (m / DEG + 3.5));
  };
  let z = Math.min(6.5, Math.max(2, o.depth - DOORWAY));
  while (need(z) > ROOM_LENS.maxAcross && z < o.depth + OUTSIDE_MAX - 1e-6) z = Math.min(o.depth + OUTSIDE_MAX, z + 0.1);
  const across = Math.min(ROOM_LENS.maxAcross, need(z));
  const position = new THREE.Vector3(x, y, z);
  const t = (position.z - 0.6) / Math.max(0.01, position.z - aim.z);
  const target = position.clone().lerp(aim, Math.min(1, Math.max(0, t)));
  return { position, aim, target, across };
}
