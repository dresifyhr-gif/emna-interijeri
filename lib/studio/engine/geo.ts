import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

/**
 * Box-projected UVs in metres (+ offset), so a texture keeps the same scale on
 * every panel and grain continues across neighbouring fronts.
 */
export function projectUV(geo: THREE.BufferGeometry, ox = 0, oy = 0, oz = 0): THREE.BufferGeometry {
  const pos = geo.getAttribute("position");
  const nor = geo.getAttribute("normal");
  if (!pos || !nor) return geo;
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) + ox;
    const y = pos.getY(i) + oy;
    const z = pos.getZ(i) + oz;
    const nx = Math.abs(nor.getX(i));
    const ny = Math.abs(nor.getY(i));
    const nz = Math.abs(nor.getZ(i));
    let u: number;
    let v: number;
    if (nx >= ny && nx >= nz) {
      u = z;
      v = y;
    } else if (ny >= nz) {
      u = x;
      v = z;
    } else {
      u = x;
      v = y;
    }
    uv[i * 2] = u;
    uv[i * 2 + 1] = v;
  }
  geo.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return geo;
}

/** box from min/max corners (already positioned in the parent frame), UVs in metres */
export function boxMinMax(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(Math.max(1e-4, x1 - x0), Math.max(1e-4, y1 - y0), Math.max(1e-4, z1 - z0));
  g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2);
  return projectUV(g);
}

export type BoxSpec = [x0: number, y0: number, z0: number, x1: number, y1: number, z1: number];

/** several boxes merged into one geometry (one draw call) */
export function boxes(list: BoxSpec[], uvOffset: [number, number, number] = [0, 0, 0]): THREE.BufferGeometry {
  const parts = list.filter((b) => b[3] - b[0] > 1e-4 && b[4] - b[1] > 1e-4 && b[5] - b[2] > 1e-4).map((b) => {
    const g = new THREE.BoxGeometry(b[3] - b[0], b[4] - b[1], b[5] - b[2]);
    g.translate((b[0] + b[3]) / 2, (b[1] + b[4]) / 2, (b[2] + b[5]) / 2);
    return g;
  });
  if (!parts.length) return new THREE.BufferGeometry();
  const merged = parts.length === 1 ? parts[0] : mergeGeometries(parts, false);
  if (parts.length > 1) parts.forEach((p) => p.dispose());
  return projectUV(merged, uvOffset[0], uvOffset[1], uvOffset[2]);
}

/** front panel with 1.5 mm rounded edges, centred on the origin */
export function roundedPanel(w: number, h: number, d: number, uvAt: [number, number, number], radius = 0.0015): THREE.BufferGeometry {
  const g = new RoundedBoxGeometry(Math.max(0.002, w), Math.max(0.002, h), Math.max(0.002, d), 2, radius);
  return projectUV(g, uvAt[0], uvAt[1], uvAt[2]);
}

export function mesh(geo: THREE.BufferGeometry, mat: THREE.Material | THREE.Material[], cast = true, receive = true): THREE.Mesh {
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = cast;
  m.receiveShadow = receive;
  return m;
}

/** dispose every geometry below `root` (materials are owned by the library; shared geometries by the cache) */
export function disposeGeometries(root: THREE.Object3D): void {
  root.traverse((o) => {
    const g = (o as THREE.Mesh).geometry as THREE.BufferGeometry | undefined;
    if (g && typeof g.dispose === "function" && !g.userData.shared) g.dispose();
  });
}

/**
 * Geometries that many modules use unchanged (knobs, taps, bottles, jars, plates, bins …): built once per
 * engine, positioned by their mesh. Marked `userData.shared` so disposeGeometries leaves them alone.
 */
export class GeoCache {
  private map = new Map<string, THREE.BufferGeometry>();

  get(key: string, make: () => THREE.BufferGeometry): THREE.BufferGeometry {
    let g = this.map.get(key);
    if (!g) {
      g = make();
      g.userData.shared = true;
      this.map.set(key, g);
    }
    return g;
  }

  dispose(): void {
    for (const g of this.map.values()) g.dispose();
    this.map.clear();
  }
}
