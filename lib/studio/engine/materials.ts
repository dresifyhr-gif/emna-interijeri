/**
 * Material library: catalogue materials (fronts / tops / floors, created lazily from catalog render params),
 * fixed materials (glass, LED …), hardware finishes and hover highlight variants. Everything is owned here and
 * disposed in one place.
 *
 * Hardware finishes (handles, Gola profile, tap, sink, appliance fronts, plinth) are single shared materials
 * whose colour / roughness / metalness change in place (setFinish): one program each, no rebuild, no recompile.
 * Every one of them keeps the same shader features in every finish (the appliance front always has a clear coat).
 */

import * as THREE from "three";
import {
  FINISH_DEFAULTS,
  backsplashDef,
  catalog,
  defaultHandleColor,
  finishDef,
  frontDef,
  glassTypeDef,
  handleColorDef,
  roomFloorDef,
  roomWallDef,
  topDef,
  type FinishRender,
  type MaterialDef,
} from "../catalog";
import type { FinishSpec, HandleStyle } from "../types";
import {
  brickTexture,
  brushedTexture,
  chevronTexture,
  concreteTexture,
  contactShadowTexture,
  herringboneTexture,
  hexRepeat,
  hexTexture,
  hobTexture,
  marbleTexture,
  ribsNormalTexture,
  plankTexture,
  stoneTexture,
  terrazzoTexture,
  tileTexture,
  woodTexture,
  type TexOpts,
} from "./textures";

export type Mat = THREE.MeshStandardMaterial | THREE.MeshPhysicalMaterial;

export const ACCENT = new THREE.Color("#C9B99A");
export const LED_ON = new THREE.Color("#ffd29a");
/** LED strip brightness in HDR (bloom threshold is 2.2) */
export const LED_GAIN = 7;
export const LED_OFF = new THREE.Color("#26262a");
/** emissive strength of a lit vitrine's frosted door in the evening (well under the bloom threshold: a soft glow) */
const GLASS_GLOW = 0.42;

function std(p: THREE.MeshStandardMaterialParameters) {
  return new THREE.MeshStandardMaterial(p);
}

/** the hardware finish targets of a config (resolved against the catalogue defaults) */
export interface FinishLook {
  handle: FinishRender;
  gola: FinishRender;
  tap: FinishRender;
  sink: FinishRender;
  appliance: FinishRender;
  /** "fronta" = the plinth wears the base front (a material swap, see Engine) */
  plinth: string;
  plinthLook: FinishRender;
  led: string;
}

export function finishLook(handles: HandleStyle, f: FinishSpec | undefined): FinishLook {
  const hc = handleColorDef(f?.handleColor ?? defaultHandleColor(handles)) ?? catalog.finishes.handleColors[0];
  const pl = f?.plinth ?? FINISH_DEFAULTS.plinth;
  return {
    handle: hc.render,
    // the Gola channel profile: same colour family, a touch darker / rougher than a solid bar
    gola: hc.id === "crna" ? { color: "#121214", roughness: 0.35, metalness: 0.7 } : hc.render,
    tap: (finishDef("taps", f?.tap ?? FINISH_DEFAULTS.tap) ?? catalog.finishes.taps[0]).render,
    sink: (finishDef("sinks", f?.sink ?? FINISH_DEFAULTS.sink) ?? catalog.finishes.sinks[0]).render,
    appliance: (finishDef("appliances", f?.appliances ?? FINISH_DEFAULTS.appliances) ?? catalog.finishes.appliances[0]).render,
    plinth: pl,
    plinthLook: (finishDef("plinths", pl) ?? catalog.finishes.plinths[0]).render,
    led: (finishDef("leds", f?.led ?? FINISH_DEFAULTS.led) ?? catalog.finishes.leds[0]).color,
  };
}

export class Materials {
  readonly tex: TexOpts;
  private fronts = new Map<string, Mat>();
  private tops = new Map<string, Mat>();
  private floors = new Map<string, Mat>();
  private wallMats = new Map<string, Mat>();
  private carcasses = new Map<string, THREE.MeshStandardMaterial>();
  /** door glass per kind (catalog.glass.types), metal / hood finishes per key, backsplash glass and tiles per id — lazily */
  private glasses = new Map<string, THREE.Material>();
  /** the frosted door glass of lit vitrines (glassOf with `lit`): glassGlow drives their emissive */
  private litGlass: THREE.MeshPhysicalMaterial[] = [];
  private finishMats = new Map<string, THREE.MeshStandardMaterial>();
  private splashes = new Map<string, Mat>();
  private textures: THREE.Texture[] = [];
  private highlights = new Map<THREE.Material, THREE.Material>();
  private surfaceHighlights = new Map<THREE.Material, THREE.Material>();
  /** shared uniform for all highlight variants (accent rim strength) */
  readonly hl = { value: new THREE.Color(0, 0, 0) };
  /** shared uniform of the room surfaces' hover tint (much fainter than a cabinet's rim) */
  readonly hlSurface = { value: new THREE.Color(0, 0, 0) };

  readonly interior: THREE.MeshStandardMaterial;
  readonly drawer: THREE.MeshStandardMaterial;
  /** black plinth (the "crna" finish); "inox" mutates plinthSteel, "fronta" uses the base front */
  readonly plinth: THREE.MeshStandardMaterial;
  readonly plinthSteel: THREE.MeshStandardMaterial;
  /** Gola channel profile (finish: handle colour) */
  readonly gola: THREE.MeshStandardMaterial;
  /** dark metal for seals, the hood underside, grooves — never changes */
  readonly trim: THREE.MeshStandardMaterial;
  /** bar handles, knobs, edge-grip profiles (finish: handle colour) */
  readonly handle: THREE.MeshStandardMaterial;
  readonly steel: THREE.MeshStandardMaterial;
  /** tap (finish) */
  readonly tap: THREE.MeshStandardMaterial;
  /** sink basin (finish) */
  readonly sink: THREE.MeshStandardMaterial;
  readonly brushed: THREE.MeshStandardMaterial;
  readonly basin: THREE.MeshStandardMaterial;
  readonly blackGlass: THREE.MeshPhysicalMaterial;
  /** oven / microwave door frames and control strips (finish: crno staklo / inox) */
  readonly appliance: THREE.MeshPhysicalMaterial;
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
  readonly bottle: THREE.MeshPhysicalMaterial;
  readonly enamel: THREE.MeshStandardMaterial;
  readonly ovenLight: THREE.MeshBasicMaterial;
  readonly ceramic: THREE.MeshStandardMaterial;
  readonly bin: THREE.MeshStandardMaterial;
  readonly appliancePlastic: THREE.MeshStandardMaterial;
  readonly bookA: THREE.MeshStandardMaterial;
  readonly bookB: THREE.MeshStandardMaterial;
  readonly plant: THREE.MeshStandardMaterial;
  readonly shadow: THREE.MeshBasicMaterial;
  readonly display: THREE.MeshBasicMaterial;
  /** the cool light inside a fridge (side-by-side niche) — always on, independent of the LED setting */
  readonly fridgeLight: THREE.MeshBasicMaterial;
  /** empty-space slots: never drawn, but the raycaster still hits them */
  readonly ghost: THREE.MeshBasicMaterial;
  /** an empty-space slot under the pointer / selected: a faint accent volume */
  readonly ghostHl: THREE.MeshBasicMaterial;

  constructor(opts: TexOpts) {
    this.tex = opts;
    this.interior = std({ color: "#2b2926", roughness: 0.9 });
    this.drawer = std({ color: "#c9c4bb", roughness: 0.55, metalness: 0.35 });
    this.plinth = std({ color: "#0e0e0f", roughness: 0.7 });
    this.plinthSteel = std({ color: "#a9a9a7", roughness: 0.3, metalness: 1 });
    this.gola = std({ color: "#121214", roughness: 0.35, metalness: 0.7 });
    this.trim = std({ color: "#121214", roughness: 0.35, metalness: 0.7 });
    this.handle = std({ color: "#b4b2ad", roughness: 0.34, metalness: 1 });
    this.steel = std({ color: "#d2d2d2", roughness: 0.22, metalness: 1 });
    this.tap = std({ color: "#d2d2d2", roughness: 0.22, metalness: 1 });
    this.sink = std({ color: "#8d8d8d", roughness: 0.34, metalness: 1 });
    this.brushed = std({ color: "#b4b2ad", roughness: 0.34, metalness: 1 });
    this.basin = std({ color: "#8d8d8d", roughness: 0.34, metalness: 1 });
    this.blackGlass = new THREE.MeshPhysicalMaterial({ color: "#0a0a0b", roughness: 0.06, clearcoat: 1, metalness: 0.2 });
    this.appliance = new THREE.MeshPhysicalMaterial({ color: "#0a0a0b", roughness: 0.06, clearcoat: 1, metalness: 0.2 });
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
    this.bottle = new THREE.MeshPhysicalMaterial({ color: "#3e5a3c", roughness: 0.08, transparent: true, opacity: 0.72, depthWrite: false });
    this.enamel = std({ color: "#161617", roughness: 0.5, metalness: 0.2 });
    this.ovenLight = new THREE.MeshBasicMaterial({ color: new THREE.Color("#2a1a0c"), toneMapped: false });
    this.ceramic = std({ color: "#d9d2c6", roughness: 0.6 });
    this.bin = std({ color: "#5d5e60", roughness: 0.62 });
    this.appliancePlastic = std({ color: "#e8e8e6", roughness: 0.45 });
    this.bookA = std({ color: "#3d3a35", roughness: 0.8 });
    this.bookB = std({ color: "#8c7b62", roughness: 0.8 });
    this.plant = std({ color: "#43563a", roughness: 0.75 });
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
    this.fridgeLight = new THREE.MeshBasicMaterial({ color: new THREE.Color("#eef4ff").multiplyScalar(1.25), toneMapped: false });
    this.ghost = new THREE.MeshBasicMaterial({ visible: false });
    this.ghostHl = new THREE.MeshBasicMaterial({ color: ACCENT, transparent: true, opacity: 0.1, depthWrite: false, toneMapped: false });
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

  /** the material is already built (its textures are painted) */
  hasFront(id: string): boolean {
    return this.fronts.has(frontDef(id)?.id ?? "");
  }
  hasTop(id: string): boolean {
    return this.tops.has(topDef(id)?.id ?? "");
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

  /** oak used for the open niche, the wall shelf and stool seats, independent of the chosen front */
  get oak(): Mat {
    return this.front("hrast");
  }

  /** room floor (the studio default is the plain dark floor material) */
  floorMat(id: string | undefined): Mat {
    const def = roomFloorDef(id) ?? catalog.room.floors[0];
    if (def.render.kind === "solid" && def.id === "studio") return this.floor;
    let m = this.floors.get(def.id);
    if (!m) {
      const r = def.render;
      const p: THREE.MeshStandardMaterialParameters = { color: new THREE.Color(r.color), roughness: r.roughness };
      if (r.kind !== "solid" && r.tones) {
        const key = `floor:${def.id}`;
        const opts = { ...this.tex, size: Math.min(1024, this.tex.size) };
        const t =
          r.kind === "planks"
            ? plankTexture(key, r.tones, opts)
            : r.kind === "tiles"
              ? tileTexture(key, r.tones, r.grout ?? "#888888", opts, r.grid)
              : r.kind === "herringbone"
                ? herringboneTexture(key, r.tones, opts)
                : r.kind === "chevron"
                  ? chevronTexture(key, r.tones, opts)
                  : r.kind === "terrazzo"
                    ? terrazzoTexture(key, r.tones, opts)
                    : concreteTexture(key, r.tones, opts);
        // the floor plane is 90 m wide with 0..1 UVs: one repeat per `tile` metres
        const rep = 90 / (r.tile ?? 1);
        t.repeat.set(rep, rep);
        this.textures.push(t);
        p.map = t;
        p.color = new THREE.Color("#ffffff");
      }
      m = std(p);
      this.floors.set(def.id, m);
    }
    return m;
  }

  /** wall colour of the room (applied to the one shared wall material) */
  wallColor(id: string | undefined): { color: THREE.Color; roughness: number } {
    const def = roomWallDef(id) ?? catalog.room.walls[0];
    return { color: new THREE.Color(def.color), roughness: def.roughness };
  }

  /** a room wall finish has a texture (brick, micro-cement, tiles) and needs its own material (wallMat) */
  wallTextured(id: string | undefined): boolean {
    return Boolean((roomWallDef(id) ?? catalog.room.walls[0]).render);
  }

  /**
   * A room wall finish as a material of its own (cached per finish): a textured wall, or one wall painted unlike the
   * others (every wall in the room's main paint shares `wall`, whose colour glides). Wall UVs are in metres
   * (geo.ts projectUV), so a texture repeats every `tile` metres.
   */
  wallMat(id: string | undefined): Mat {
    const def = roomWallDef(id) ?? catalog.room.walls[0];
    let m = this.wallMats.get(def.id);
    if (!m) {
      const p: THREE.MeshStandardMaterialParameters = { color: new THREE.Color(def.color), roughness: def.roughness };
      const r = def.render;
      if (r) {
        const key = `wall:${def.id}`;
        const opts = { ...this.tex, size: Math.min(1024, this.tex.size) };
        const t =
          r.kind === "brick"
            ? brickTexture(key, r.tones, r.grout ?? "#c8c0b4", opts)
            : r.kind === "tiles"
              ? tileTexture(key, r.tones, r.grout ?? "#bbbbbb", opts, [4, 8], true, { cloud: 0.05, grout: 1 / 260, bevel: true })
              : concreteTexture(key, r.tones, opts);
        t.repeat.set(1 / r.tile, 1 / r.tile);
        this.textures.push(t);
        p.map = t;
        p.color = new THREE.Color("#ffffff");
      }
      m = std(p);
      this.wallMats.set(def.id, m);
    }
    return m;
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
      const detail = { density: r.density, veins: r.veins };
      const t =
        r.kind === "wood"
          ? woodTexture(key, r.tones, this.tex, detail)
          : r.kind === "marble"
            ? marbleTexture(key, r.tones, { ...this.tex, size: this.tex.size }, detail)
            : r.kind === "stone"
              ? stoneTexture(key, r.tones, this.tex, detail)
              : r.kind === "brushed"
                ? brushedTexture(key, r.tones, this.tex)
                : concreteTexture(key, r.tones, this.tex);
      const tile = r.tile ?? 1;
      // geometry UVs are in metres; one texture repeat covers `tile` metres
      if (r.kind === "marble") t.repeat.set(1 / tile, 2 / tile);
      else t.repeat.set(1 / tile, 1 / tile);
      if ((r.kind === "wood" && use === "top") || (r.kind === "brushed" && use === "front")) {
        // worktop grain along the worktop length; brushed fronts streak horizontally
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

  // ---------------------------------------------------------- glass, metal finishes, backsplash (KitchenConfig.glass / hood / backsplash)

  /**
   * Door glass of a kind (catalog.glass.types); `lit` = the element's LED is on (GlassSpec.led). Clear glass is
   * `doorGlass`, the glass every older vitrine has. The other kinds are cheap transparent materials, built only when a
   * kitchen uses them: the tinted ones see-through with a little reflection (so they read as glass, not as an open
   * cabinet in a darker colour); the frosted ones (satinirano, rebrasto — catalog render.frosted) milky, hiding what is
   * inside. No transmission: a transmissive door made three.js render every opaque object a second time on each frame
   * it was on screen (230 instead of 128 draw calls a frame in a one-vitrine kitchen), and its blur came out nearly
   * black against the dark studio.
   * In a lit vitrine a frosted door glows with the LED in the evening (glassGlow, driven by Lights.apply). The hover
   * rim leaves every glass alone.
   */
  glassOf(type: string | undefined, lit = false): THREE.Material {
    const def = glassTypeDef(type) ?? catalog.glass.types[0];
    if (def.id === "prozirno") return this.doorGlass;
    const r = def.render;
    const glow = Boolean(r.frosted) && lit;
    const key = glow ? `${def.id}:lit` : def.id;
    let m = this.glasses.get(key);
    if (!m) {
      const p = new THREE.MeshPhysicalMaterial({
        color: r.color,
        roughness: r.roughness,
        metalness: r.frosted ? 0 : 0.12,
        transparent: true,
        opacity: r.opacity,
        depthWrite: false,
      });
      if (r.ribs) {
        const t = ribsNormalTexture();
        // one rib every 2 cm (geometry UVs are in metres)
        t.repeat.set(50, 1);
        this.textures.push(t);
        p.normalMap = t;
        p.normalScale.set(0.8, 0.8);
      }
      if (glow) {
        p.emissive.set(LED_ON);
        p.emissiveIntensity = 0;
        this.litGlass.push(p);
      }
      p.userData.glass = true;
      p.name = `glass:${key}`;
      m = p;
      this.glasses.set(key, m);
    }
    return m;
  }

  /** frosted doors of lit vitrines glow with the LED strips: `k` 0 (day / LED off) … 1 (evening), in the LED colour */
  glassGlow(k: number, color: THREE.Color): void {
    for (const m of this.litGlass) {
      m.emissive.copy(color);
      m.emissiveIntensity = GLASS_GLOW * k;
    }
  }

  /** a hardware-like finish as its own material (thin glass-frame profiles, visible hoods), cached per key */
  finishMat(key: string, r: FinishRender): THREE.MeshStandardMaterial {
    let m = this.finishMats.get(key);
    if (!m) {
      m = std({ color: r.color, roughness: r.roughness, metalness: r.metalness });
      this.finishMats.set(key, m);
    }
    return m;
  }

  /**
   * A backsplash finish (catalog.backsplashes): back-painted glass (a clear-coated colour) or tiles (subway in running
   * bond, hexagons, zellige) at their real size — geometry UVs are in metres.
   */
  backsplash(id: string | undefined): Mat {
    const def = backsplashDef(id) ?? catalog.backsplashes[0];
    let m = this.splashes.get(def.id);
    if (!m) {
      const r = def.render;
      if (def.kind === "staklo") {
        m = new THREE.MeshPhysicalMaterial({ color: r.color, roughness: r.roughness, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03 });
      } else {
        const key = `splash:${def.id}`;
        const opts = { ...this.tex, size: Math.min(1024, this.tex.size) };
        const tones = r.tones ?? [r.color, r.color, r.color];
        const grout = r.grout ?? "#bbbbbb";
        const [tw, th] = r.tile ?? [10, 10];
        let t: THREE.Texture;
        if (r.pattern === "hex") {
          t = hexTexture(key, tones, grout, opts);
          const [u, v] = hexRepeat(tw);
          t.repeat.set(u, v);
        } else if (r.pattern === "zellige") {
          // small handmade squares: strong tone shifts per tile, glazed edges
          t = tileTexture(key, tones, grout, opts, [6, 6], false, { cloud: 0.42, grout: 1 / 300, bevel: true });
          t.repeat.set(1 / ((6 * tw) / 100), 1 / ((6 * th) / 100));
        } else {
          // subway (metro) tiles in running bond
          t = tileTexture(key, tones, grout, opts, [4, 8], true, { cloud: 0.06, grout: 1 / 260, bevel: true });
          t.repeat.set(1 / ((4 * tw) / 100), 1 / ((8 * th) / 100));
        }
        this.textures.push(t);
        m = std({ map: t, color: new THREE.Color("#ffffff"), roughness: r.roughness });
      }
      this.splashes.set(def.id, m);
    }
    return m;
  }

  // ---------------------------------------------------------- finishes

  /** the shared hardware materials and their target looks */
  finishTargets(look: FinishLook): [THREE.MeshStandardMaterial, FinishRender][] {
    return [
      [this.handle, look.handle],
      [this.gola, look.gola],
      [this.tap, look.tap],
      [this.sink, look.sink],
      [this.appliance, look.appliance],
      [this.plinthSteel, look.plinth === "inox" ? look.plinthLook : { color: "#a9a9a7", roughness: 0.3, metalness: 1 }],
    ];
  }

  /** jump every hardware material to `look` (no animation) */
  setFinish(look: FinishLook): void {
    for (const [m, r] of this.finishTargets(look)) {
      m.color.set(r.color);
      m.roughness = r.roughness;
      m.metalness = r.metalness;
    }
  }

  // ---------------------------------------------------------- highlight

  /** a copy of `m` with a subtle accent fresnel rim (shared uniform `hl`) */
  highlight(m: THREE.Material): THREE.Material {
    if (m === this.ghost) return this.ghostHl;
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

  /**
   * a copy of a room surface material (a wall) with a very light accent tint, strongest at grazing angles (shared
   * uniform `hlSurface`): a hovered wall reads as clickable without turning beige
   */
  surfaceHighlight(m: THREE.Material): THREE.Material {
    let h = this.surfaceHighlights.get(m);
    if (h) return h;
    if (!(m instanceof THREE.MeshStandardMaterial) || m.transparent) return m;
    const c = m.clone();
    const u = this.hlSurface;
    c.onBeforeCompile = (shader) => {
      shader.uniforms.uHlS = u;
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform vec3 uHlS;")
        .replace(
          "#include <emissivemap_fragment>",
          `#include <emissivemap_fragment>
          {
            float hlF = pow(1.0 - saturate(abs(dot(normalize(normal), normalize(vViewPosition)))), 3.0);
            totalEmissiveRadiance += uHlS * (0.025 + 0.12 * hlF);
          }`,
        );
    };
    c.customProgramCacheKey = () => "emna-hl-surface";
    h = c;
    this.surfaceHighlights.set(m, h);
    return h;
  }

  /**
   * Hardware materials are mutated in place by setFinish; their highlight clones copied the old values.
   * Called after a finish change so a highlighted handle shows the new colour too.
   */
  refreshHighlights(): void {
    for (const [base, h] of this.highlights) {
      if (base instanceof THREE.MeshStandardMaterial && h instanceof THREE.MeshStandardMaterial) {
        h.color.copy(base.color);
        h.roughness = base.roughness;
        h.metalness = base.metalness;
      }
    }
  }

  dispose(): void {
    const all = new Set<THREE.Material>();
    for (const m of this.fronts.values()) all.add(m);
    for (const m of this.tops.values()) all.add(m);
    for (const m of this.floors.values()) all.add(m);
    for (const m of this.wallMats.values()) all.add(m);
    for (const m of this.carcasses.values()) all.add(m);
    for (const m of this.glasses.values()) all.add(m);
    for (const m of this.finishMats.values()) all.add(m);
    for (const m of this.splashes.values()) all.add(m);
    for (const m of this.highlights.values()) all.add(m);
    for (const m of this.surfaceHighlights.values()) all.add(m);
    for (const v of Object.values(this)) if (v instanceof THREE.Material) all.add(v);
    for (const m of all) m.dispose();
    for (const t of this.textures) t.dispose();
    this.fronts.clear();
    this.tops.clear();
    this.floors.clear();
    this.wallMats.clear();
    this.carcasses.clear();
    this.glasses.clear();
    this.litGlass = [];
    this.finishMats.clear();
    this.splashes.clear();
    this.highlights.clear();
    this.surfaceHighlights.clear();
    this.textures = [];
  }
}
