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
export function viewDir(az: number, el: number): THREE.Vector3 {
  return new THREE.Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
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
