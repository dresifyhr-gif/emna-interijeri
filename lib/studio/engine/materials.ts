/**
 * Material library: catalogue materials (fronts / tops, created lazily from
 * catalog render params), fixed materials (steel, glass, LED …) and hover
 * highlight variants. Everything is owned here and disposed in one place.
 */

import * as THREE from "three";
import { catalog, frontDef, topDef, type MaterialDef } from "../catalog";
import { concreteTexture, contactShadowTexture, hobTexture, marbleTexture, stoneTexture, woodTexture, type TexOpts } from "./textures";

export type Mat = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

export const ACCENT = new THREE.Color("#C9B99A");
export const LED_ON = new THREE.Color("#ffd29a");
/** LED strip brightness in HDR (bloom threshold is 2.2) */
export const LED_GAIN = 7;
export const LED_OFF = new THREE.Color("#26262a");

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(p);
}

export class Materials {
  readonly tex: TexOpts;
  private fronts = new Map<string, Mat>();
  private tops = new Map<string, Mat>();
  private carcasses = new Map<string, THREE.MeshStandardMaterial>();
  private textures: THREE.Texture[] = [];
  private highlights = new Map<THREE.Material, THREE.Material>();
  /** shared uniform for all highlight variants (accent rim strength) */
  readonly hl = { value: new THREE.Color(0, 0, 0) };

  readonly interior: THREE.MeshStandardMaterial;
  readonly drawer: THREE.MeshStandardMaterial;
  readonly plinth: THREE.MeshStandardMaterial;
  readonly gola: THREE.MeshStandardMaterial;
  readonly steel: THREE.MeshStandardMaterial;
  readonly brushed: THREE.MeshStandardMaterial;
  readonly basin: THREE.MeshStandardMaterial;
  readonly blackGlass: THREE.MeshPhysicalMaterial;
  readonly hob: THREE.MeshPhysicalMaterial;
  readonly black: THREE.MeshStandardMaterial;
  readonly wall: THREE.MeshStandardMaterial;
  readonly floor: THREE.MeshStandardMaterial;
  readonly dim: THREE.MeshBasicMaterial;
  readonly led: THREE.MeshBasicMaterial;
  readonly ledProfile: THREE.MeshStandardMaterial;
  readonly windowGlass: THREE.MeshPhysicalMaterial;
  readonly windowFrame: THREE.MeshStandardMaterial;
  readonly sill: THREE.MeshStandardMaterial;
  readonly liner: THREE.MeshStandardMaterial;
  readonly glassShelf: THREE.MeshPhysicalMaterial;
  readonly doorGlass: THREE.MeshPhysicalMaterial;
  readonly enamel: THREE.MeshStandardMaterial;
  readonly ovenLight: THREE.MeshBasicMaterial;
  readonly ceramic: THREE.MeshStandardMaterial;
  readonly bookA: THREE.MeshStandardMaterial;
  readonly bookB: THREE.MeshStandardMaterial;
  readonly shadow: THREE.MeshBasicMaterial;
  readonly display: THREE.MeshBasicMaterial;

  constructor(opts: TexOpts) {
    this.tex = opts;
    this.interior = std({ color: "#2b2926", roughness: 0.9 });
    this.drawer = std({ color: "#c9c4bb", roughness: 0.55, metalness: 0.35 });
    this.plinth = std({ color: "#0e0e0f", roughness: 0.7 });
    this.gola = std({ color: "#121214", roughness: 0.35, metalness: 0.7 });
    this.steel = std({ color: "#d2d2d2", roughness: 0.22, metalness: 1 });
    this.brushed = std({ color: "#b4b2ad", roughness: 0.34, metalness: 1 });
    this.basin = std({ color: "#8d8d8d", roughness: 0.34, metalness: 1 });
    this.blackGlass = new THREE.MeshPhysicalMaterial({ color: "#0a0a0b", roughness: 0.06, clearcoat: 1, metalness: 0.2 });
    const hobMap = hobTexture(opts);
    this.textures.push(hobMap);
    this.hob = new THREE.MeshPhysicalMaterial({ map: hobMap, roughness: 0.08, clearcoat: 1 });
    this.black = std({ color: "#141415", roughness: 0.45, metalness: 0.6 });
    this.wall = std({ color: "#1d1d20", roughness: 0.95 });
    this.floor = std({ color: "#121213", roughness: 0.78, metalness: 0.0 });
    this.dim = new THREE.MeshBasicMaterial({ color: ACCENT, toneMapped: false, transparent: true, opacity: 0.9 });
    this.led = new THREE.MeshBasicMaterial({ color: LED_OFF.clone(), toneMapped: false });
    this.ledProfile = std({ color: "#9a9893", roughness: 0.35, metalness: 0.9 });
    this.windowGlass = new THREE.MeshPhysicalMaterial({
      color: "#d9e3ec",
      roughness: 0.04,
      metalness: 0,
      transparent: true,
      opacity: 0.55,
      emissive: new THREE.Color("#dfe9f2"),
      emissiveIntensity: 0,
      depthWrite: false,
    });
    this.windowFrame = std({ color: "#1b1b1d", roughness: 0.4, metalness: 0.6 });
    this.sill = std({ color: "#d8d4cc", roughness: 0.3 });
    this.liner = std({ color: "#e9ecef", roughness: 0.4, emissive: new THREE.Color("#f2f6ff"), emissiveIntensity: 0.06 });
    this.glassShelf = new THREE.MeshPhysicalMaterial({ color: "#cfe0e0", roughness: 0.05, transparent: true, opacity: 0.35, depthWrite: false });
    this.doorGlass = new THREE.MeshPhysicalMaterial({
      color: "#9aa3a3",
      roughness: 0.08,
      metalness: 0.1,
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.enamel = std({ color: "#161617", roughness: 0.5, metalness: 0.2 });
    this.ovenLight = new THREE.MeshBasicMaterial({ color: new THREE.Color("#2a1a0c"), toneMapped: false });
    this.ceramic = std({ color: "#d9d2c6", roughness: 0.6 });
    this.bookA = std({ color: "#3d3a35", roughness: 0.8 });
    this.bookB = std({ color: "#8c7b62", roughness: 0.8 });
    const cs = contactShadowTexture();
    this.textures.push(cs);
    this.shadow = new THREE.MeshBasicMaterial({
      color: "#000000",
      alphaMap: cs,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.display = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffb46b").multiplyScalar(1.6), toneMapped: false });
  }

  // ---------------------------------------------------------- catalogue

  front(id: string): Mat {
    const def = frontDef(id) ?? catalog.fronts[0];
    let m = this.fronts.get(def.id);
    if (!m) {
      m = this.build(def, "front");
      this.fronts.set(def.id, m);
    }
    return m;
  }

  top(id: string): Mat {
    const def = topDef(id) ?? catalog.tops[0];
    let m = this.tops.get(def.id);
    if (!m) {
      m = this.build(def, "top");
      this.tops.set(def.id, m);
    }
    return m;
  }

  /** cabinet body colour that goes with a front */
  carcass(frontId: string): THREE.MeshStandardMaterial {
    const def = frontDef(frontId) ?? catalog.fronts[0];
    const col = def.render.carcass ?? "#2f2d2a";
    let m = this.carcasses.get(col);
    if (!m) {
      m = std({ color: col, roughness: 0.82 });
      this.carcasses.set(col, m);
    }
    return m;
  }

  /** oak used for the open niche and stool seats, independent of the chosen front */
  get oak(): Mat {
    return this.front("hrast");
  }

  private build(def: MaterialDef, use: "front" | "top"): Mat {
    const r = def.render;
    const p: THREE.MeshPhysicalMaterialParameters = {
      color: new THREE.Color(r.color),
      roughness: r.roughness,
      metalness: r.metalness ?? 0,
    };
    if (r.kind !== "solid" && r.tones) {
      const key = `${use}:${def.id}`;
      const t =
        r.kind === "wood"
          ? woodTexture(key, r.tones, this.tex)
          : r.kind === "marble"
            ? marbleTexture(key, r.tones, { ...this.tex, size: this.tex.size })
            : r.kind === "stone"
              ? stoneTexture(key, r.tones, this.tex)
              : concreteTexture(key, r.tones, this.tex);
      const tile = r.tile ?? 1;
      // geometry UVs are in metres; one texture repeat covers `tile` metres
      if (r.kind === "marble") t.repeat.set(1 / tile, 2 / tile);
      else t.repeat.set(1 / tile, 1 / tile);
      if (r.kind === "wood" && use === "top") {
        // grain along the worktop length
        t.center.set(0.5, 0.5);
        t.rotation = Math.PI / 2;
      }
      this.textures.push(t);
      p.map = t;
      p.color = new THREE.Color("#ffffff");
    }
    if (r.clearcoat && r.clearcoat > 0) {
      return new THREE.MeshPhysicalMaterial({ ...p, clearcoat: r.clearcoat, clearcoatRoughness: r.clearcoatRoughness ?? 0.1 });
    }
    return new THREE.MeshStandardMaterial(p);
  }

  // ---------------------------------------------------------- highlight

  /** a copy of `m` with a subtle accent fresnel rim (shared uniform `hl`) */
  highlight(m: THREE.Material): THREE.Material {
    let h = this.highlights.get(m);
    if (h) return h;
    // glass and LEDs keep their own look
    if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent) return m;
    const c = m.clone();
    const u = this.hl;
    c.onBeforeCompile = (shader) => {
      shader.uniforms.uHl = u;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uHl;")
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            float hlF = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), 2.2);
            totalEmissiveRadiance += uHl * (0.06 + 0.9 * hlF);
          }`,
        );
    };
    c.customProgramCacheKey = () => "emna-hl";
    h = c;
    this.highlights.set(m, h);
    return h;
  }

  dispose(): void {
    const all = new Set<THREE.Material>();
    for (const m of this.fronts.values()) all.add(m);
    for (const m of this.tops.values()) all.add(m);
    for (const m of this.carcasses.values()) all.add(m);
    for (const m of this.highlights.values()) all.add(m);
    for (const v of Object.values(this)) if (v instanceof THREE.Material) all.add(v);
    for (const m of all) m.dispose();
    for (const t of this.textures) t.dispose();
    this.fronts.clear();
    this.tops.clear();
    this.carcasses.clear();
    this.highlights.clear();
    this.textures = [];
  }
}
