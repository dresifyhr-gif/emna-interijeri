/**
 * Studio lighting: key spot (shadows), hemisphere, rim, fill, a sweep spot for
 * material changes, daylight through the window (spot + area light) and a
 * fixed pool of RectAreaLights for the LED strips. Light counts — including
 * which lights cast shadows — never change after creation, so shaders are
 * compiled once (boot's compileAsync covers the window and no-window states).
 *
 * Shadow maps never re-render on their own (shadow.autoUpdate = false): the
 * engine calls invalidateShadows() on frames where geometry moved. A camera
 * move alone (the hero's orbit, studio orbiting) does not change a shadow map.
 */

import * as THREE from "three";
import type { Mood } from "../types";
import { LED_GAIN, LED_OFF, LED_ON, type Materials } from "./materials";

const GLASS_DAY = new THREE.Color("#dfe9f2");
const GLASS_NIGHT = new THREE.Color("#1a2433");

export interface MoodValues {
  hemi: number;
  key: number;
  rim: number;
  fill: number;
  env: number;
  led: number;
  rect: number;
  sun: number;
  glow: number;
  bloom: number;
  /** the lit ceiling light's glow on the ceiling around it (Materials.ceilingLit) */
  halo: number;
  /** lamp rig: the light the bare wall throws back onto the kitchen's side run (the sun spot, free at night) */
  bounce: number;
}

export const MOODS: Record<Mood | "off" | "lamp", MoodValues> = {
  off: { hemi: 0, key: 0, rim: 0, fill: 0, env: 0, led: 0, rect: 0, sun: 0, glow: 0, bloom: 0.25, halo: 0, bounce: 0 },
  day: { hemi: 0.5, key: 2.15, rim: 0.85, fill: 0.42, env: 0.52, led: 0, rect: 0, sun: 1, glow: 1, bloom: 0.22, halo: 0, bounce: 0 },
  night: { hemi: 0.07, key: 0.62, rim: 0.12, fill: 0.06, env: 0.09, led: 1, rect: 1, sun: 0, glow: 0.05, bloom: 0.62, halo: 0, bounce: 0 },
  /**
   * night with the room's ceiling light on (KitchenConfig.room.lamp, Lights.setLamp): the lamp lights the room as in an
   * evening photo — the key spot (its shadows) and the fill come from the lamp, the room's bounce is the hemisphere and
   * the environment (plus the rim: what the white kitchen run throws back onto the bare wall across the room), the LED
   * strips glow on top, the sun spot (dark at night) is the bounce back onto the kitchen's side run. Tuned against the
   * owner's photo of a finished kitchen, seen from the room view's pose (camera.ts roomViewPose).
   */
  lamp: { hemi: 0.45, key: 0.3, rim: 1.35, fill: 1.9, env: 0.25, led: 1, rect: 2.5, sun: 0, glow: 0.05, bloom: 0.2, halo: 0.6, bounce: 0.25 },
};

/** LED strip that wants an area light from the pool (world space) */
export interface LedLight {
  center: THREE.Vector3;
  /** direction the light shines towards */
  dir: THREE.Vector3;
  width: number;
  height: number;
  /** relative strength */
  power: number;
}

export interface WindowLight {
  center: THREE.Vector3;
  /** into the room */
  normal: THREE.Vector3;
  width: number;
  height: number;
}

/** the studio's light colours, and the ceiling light's (a neutral warm white, as a photo's white balance shows it) */
const STUDIO_LIGHT = {
  key: new THREE.Color("#fff0da"),
  fill: new THREE.Color("#ffe7cc"),
  sky: new THREE.Color("#fff4e6"),
  ground: new THREE.Color("#0a0a0b"),
  rim: new THREE.Color("#cdd6ff"),
};
const LAMP_LIGHT = {
  key: new THREE.Color("#fff6ec"),
  fill: new THREE.Color("#fff4e8"),
  sky: new THREE.Color("#f7f4ef"),
  ground: new THREE.Color().setRGB(0.3, 0.291, 0.279),
};

const SUN_COLOR = new THREE.Color("#fff6ea");

export class Lights {
  readonly hemi = new THREE.HemisphereLight(STUDIO_LIGHT.sky, STUDIO_LIGHT.ground, 0);
  readonly key = new THREE.SpotLight(STUDIO_LIGHT.key, 0, 0, 0.6, 0.85, 0);
  readonly rim = new THREE.DirectionalLight(STUDIO_LIGHT.rim, 0);
  readonly fill = new THREE.PointLight(STUDIO_LIGHT.fill, 0, 0, 0);
  readonly sweep = new THREE.SpotLight("#fff3e0", 0, 0, 0.34, 1, 0);
  readonly sun = new THREE.SpotLight(SUN_COLOR, 0, 0, 0.5, 1, 0);
  readonly winRect: THREE.RectAreaLight;
  readonly pool: THREE.RectAreaLight[] = [];
  private poolPower: number[] = [];
  private hasWindow = false;
  /** sun + window area light are in the scene (see `windowLights`) */
  private windowAdded = false;
  cur: MoodValues = { ...MOODS.off };
  /** where the key spot and the fill stand for the studio (aim) — and the ceiling light lighting the room, when set */
  private studioRig: { key: THREE.Vector3; target: THREE.Vector3; angle: number; near: number; far: number; fill: THREE.Vector3; rim: THREE.Vector3 } | null =
    null;
  private lampAt: THREE.Vector3 | null = null;
  /** lamp rig: the direction the bounce light (rim) crosses the room in, null = no bounce light */
  private lampAcross: THREE.Vector3 | null = null;
  /** how much of the mood's rim value the rim light gets (the lamp rig without a bounce direction: none) */
  private rimScale = 1;
  /** where setWindow put the sun (restored when the lamp rig gives it back) */
  private sunRig: { pos: THREE.Vector3; target: THREE.Vector3; angle: number } | null = null;
  /** the lamp rig uses the sun spot as the bounce off the bare wall (MoodValues.bounce) */
  private sunBounce = false;
  /** lamp rig: how far the bare wall is from the lamp, across the room (m) — the bounce light stands just in front of it */
  private lampReach = 1.2;
  sweepIntensity = 0;
  /** LED strip colour in HDR (colour temperature finish × LED_GAIN) */
  private ledHot = new THREE.Color(LED_ON).multiplyScalar(LED_GAIN);
  /** LED colour temperature (not HDR): the glow of lit frosted vitrine doors */
  private ledColor = new THREE.Color(LED_ON);

  /**
   * @param windowLights false leaves the sun spot and the window area light out of the scene until a window
   *   appears (the homepage hero has none: that saves a shadowed spot light and an area light per pixel).
   */
  constructor(
    readonly scene: THREE.Scene,
    poolSize: number,
    shadowSize: number,
    windowLights = true,
  ) {
    const k = this.key;
    k.castShadow = true;
    k.shadow.autoUpdate = false;
    k.shadow.needsUpdate = true;
    k.shadow.mapSize.set(shadowSize, shadowSize);
    k.shadow.bias = -0.00025;
    k.shadow.normalBias = 0.02;
    k.shadow.radius = 3;
    k.shadow.camera.near = 2;
    k.shadow.camera.far = 30;
    this.rim.position.set(-6, 4, -1);
    this.fill.position.set(-4, 2.2, 6);
    const s = this.sun;
    s.castShadow = true;
    s.shadow.autoUpdate = false;
    s.shadow.needsUpdate = true;
    s.shadow.mapSize.set(Math.max(512, shadowSize / 2), Math.max(512, shadowSize / 2));
    s.shadow.bias = -0.0003;
    s.shadow.normalBias = 0.03;
    s.shadow.radius = 5;
    s.shadow.camera.near = 0.5;
    s.shadow.camera.far = 14;
    this.winRect = new THREE.RectAreaLight("#e8eef5", 0, 1, 1);
    scene.add(this.hemi, k, k.target, this.rim, this.fill, this.sweep, this.sweep.target);
    if (windowLights) this.addWindowLights();
    for (let i = 0; i < poolSize; i++) {
      const r = new THREE.RectAreaLight(LED_ON, 0, 0.1, 0.04);
      this.pool.push(r);
      this.poolPower.push(0);
      scene.add(r);
    }
  }

  /** point key/fill/rim at the kitchen and fit the key light's cone */
  aim(box: THREE.Box3): void {
    const c = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const r = Math.max(2.2, Math.hypot(size.x, size.z) / 2 + 0.6);
    const k = this.key;
    k.position.set(c.x + 2.6, 7.2, c.z + 6.4 + size.z * 0.35);
    k.target.position.set(c.x, 0.6, c.z);
    const dist = k.position.distanceTo(k.target.position);
    k.angle = Math.min(1.0, Math.atan(r / dist) + 0.12);
    this.studioRig = {
      key: k.position.clone(),
      target: k.target.position.clone(),
      angle: k.angle,
      near: Math.max(1, dist - r - 3),
      far: dist + r + 4,
      fill: new THREE.Vector3(c.x - 4, 2.2, c.z + 6),
      rim: new THREE.Vector3(c.x - 6, 4, c.z - 1),
    };
    this.place();
  }

  /**
   * The room's ceiling light lights the scene (world position of the lamp, just under the ceiling), or null: the
   * studio's own key and fill again. Only where the lights stand changes (no shader recompiles); the caller re-renders
   * the shadow maps (invalidateShadows) and tweens the mood to MOODS.lamp.
   */
  setLamp(at: THREE.Vector3 | null, across: THREE.Vector3 | null = null, reach = 1.2): void {
    const same = (a: THREE.Vector3 | null, b: THREE.Vector3 | null) => (a && b ? a.distanceTo(b) < 1e-4 : a === b);
    if (same(at, this.lampAt) && same(at ? across : null, this.lampAcross) && Math.abs(reach - this.lampReach) < 1e-4) return;
    this.lampAt = at ? at.clone() : null;
    this.lampAcross = at && across ? across.clone().normalize() : null;
    this.lampReach = reach;
    this.place();
  }

  get lampLit(): boolean {
    return Boolean(this.lampAt);
  }

  /** key spot and fill: from the lamp (a wide, soft cone straight down; a point light under it) or the studio rig */
  private place(): void {
    const k = this.key;
    const f = this.fill;
    const L = this.lampAt;
    const h = this.hemi;
    if (L) {
      // (a soft, wide cone down and towards the entrance — the side a visitor looks from: the lamp's own shadows)
      k.position.set(L.x, L.y - 0.04, L.z);
      k.target.position.set(L.x, 0, L.z + 1.5);
      k.angle = 1.2;
      k.penumbra = 0.6;
      k.shadow.camera.near = 0.05;
      k.shadow.camera.far = Math.max(4, L.y + 6);
      f.position.set(L.x, L.y - 0.35, L.z);
      // (the lamp's light falls off a little with distance; a white room bounces the rest everywhere — the hemisphere
      // light's warm grey floor bounce lights the ceiling, as it does in a photo)
      f.decay = 0.7;
      k.color.copy(LAMP_LIGHT.key);
      f.color.copy(LAMP_LIGHT.fill);
      h.color.copy(LAMP_LIGHT.sky);
      h.groundColor.copy(LAMP_LIGHT.ground);
      // the bounce: level with the worktops, across the room from the kitchen's side run to the bare wall opposite
      const r = this.rim;
      const a = this.lampAcross;
      this.rimScale = a ? 1 : 0;
      r.target.position.set(L.x, 1.4, L.z);
      r.position.copy(r.target.position).addScaledVector(a ?? new THREE.Vector3(0, 0, -1), -10).add(new THREE.Vector3(0, 0.6, 0));
      r.color.copy(LAMP_LIGHT.fill);
      // the bounce back from the bare wall onto the kitchen's side run: the sun spot (dark at night anyway), wide and soft
      const sun = this.sun;
      this.sunBounce = Boolean(a);
      if (a) {
        // (inside the room, in front of the bare wall: the wall itself casts the spot's shadows)
        sun.position.set(L.x, 1.8, L.z).addScaledVector(a, Math.max(0.3, this.lampReach - 0.1));
        sun.target.position.set(L.x, 1.4, L.z).addScaledVector(a, -1.5);
        sun.target.updateMatrixWorld();
        sun.angle = 1.2;
        sun.color.copy(LAMP_LIGHT.fill);
        sun.shadow.needsUpdate = true;
      }
    } else {
      const s = this.studioRig;
      if (s) {
        k.position.copy(s.key);
        k.target.position.copy(s.target);
        k.angle = s.angle;
        k.shadow.camera.near = s.near;
        k.shadow.camera.far = s.far;
        f.position.copy(s.fill);
      }
      k.penumbra = 0.85;
      f.decay = 0;
      k.color.copy(STUDIO_LIGHT.key);
      f.color.copy(STUDIO_LIGHT.fill);
      h.color.copy(STUDIO_LIGHT.sky);
      h.groundColor.copy(STUDIO_LIGHT.ground);
      this.rimScale = 1;
      if (this.sunBounce) {
        this.sunBounce = false;
        const sun = this.sun;
        const w = this.sunRig;
        if (w) {
          sun.position.copy(w.pos);
          sun.target.position.copy(w.target);
          sun.angle = w.angle;
          sun.target.updateMatrixWorld();
        }
        sun.color.copy(SUN_COLOR);
        sun.shadow.needsUpdate = true;
      }
      if (s) this.rim.position.copy(s.rim);
      this.rim.target.position.set(0, 0, 0);
      this.rim.color.copy(STUDIO_LIGHT.rim);
    }
    this.rim.target.updateMatrixWorld();
    k.shadow.camera.updateProjectionMatrix();
    k.target.updateMatrixWorld();
    this.invalidateShadows();
  }

  private addWindowLights(): void {
    if (this.windowAdded) return;
    this.windowAdded = true;
    this.scene.add(this.sun, this.sun.target, this.winRect);
  }

  /** re-render the shadow maps on the next frame (geometry moved / appeared / disappeared) */
  invalidateShadows(): void {
    this.key.shadow.needsUpdate = true;
    if (this.windowAdded && (this.hasWindow || this.sunBounce)) this.sun.shadow.needsUpdate = true;
  }

  /** key-light shadow resolution (quality tiers); the map is reallocated on the next shadow render */
  setShadowSize(size: number): void {
    const sh = this.key.shadow;
    if (sh.mapSize.x === size) return;
    sh.mapSize.set(size, size);
    sh.map?.dispose();
    sh.map = null;
    sh.needsUpdate = true;
  }

  setWindow(w: WindowLight | null): void {
    this.hasWindow = Boolean(w);
    // a window in a scene built without window lights: add them now (one shader recompile, hero only)
    if (w) this.addWindowLights();
    // The sun keeps castShadow on even without a window: toggling it changes the number of shadow-casting
    // lights, which recompiles every lit shader on the first window toggle. Without a window its shadow map
    // is rendered once and then left alone (its intensity is 0, so it shows nowhere); with one it is
    // re-rendered only when geometry changes (invalidateShadows).
    this.sun.shadow.needsUpdate = true;
    if (!w) {
      this.sunRig = null;
      this.winRect.intensity = 0;
      this.sun.intensity = 0;
      return;
    }
    const out = w.normal.clone().multiplyScalar(-1);
    const pos = w.center.clone().addScaledVector(out, 3.2).add(new THREE.Vector3(0, 2.2, 0));
    this.sun.position.copy(pos);
    const tgt = w.center.clone().addScaledVector(w.normal, 1.6);
    tgt.y = 0.2;
    this.sun.target.position.copy(tgt);
    this.sun.target.updateMatrixWorld();
    this.sun.angle = Math.min(0.75, Math.atan((Math.max(w.width, w.height) * 0.75) / 3.6) + 0.12);
    this.sunRig = { pos: pos.clone(), target: tgt.clone(), angle: this.sun.angle };
    if (this.sunBounce) this.place();
    const wr = this.winRect;
    wr.width = w.width * 0.94;
    wr.height = w.height * 0.94;
    wr.position.copy(w.center).addScaledVector(w.normal, 0.02);
    wr.lookAt(w.center.clone().addScaledVector(w.normal, 2));
  }

  /** LED colour temperature (catalog.finishes.leds[].color): strips and their area lights */
  setLedColor(hex: string): void {
    this.ledHot.set(hex).multiplyScalar(LED_GAIN);
    this.ledColor.set(hex);
    for (const r of this.pool) r.color.set(hex);
  }

  /** assign pool lights to LED strips (most important first) */
  setLeds(list: LedLight[]): void {
    this.pool.forEach((r, i) => {
      const l = list[i];
      if (!l) {
        this.poolPower[i] = 0;
        r.intensity = 0;
        return;
      }
      r.width = Math.max(0.05, l.width);
      r.height = Math.max(0.02, l.height);
      r.position.copy(l.center);
      r.lookAt(l.center.clone().add(l.dir));
      this.poolPower[i] = l.power;
    });
  }

  /** push current values into lights, scene and the LED material */
  apply(scene: THREE.Scene, mats: Materials, bloom: { strength: number }, ledScale = 1): void {
    const v = this.cur;
    this.hemi.intensity = v.hemi;
    this.key.intensity = v.key;
    this.rim.intensity = v.rim * this.rimScale;
    this.fill.intensity = v.fill;
    scene.environmentIntensity = v.env;
    const led = v.led * ledScale;
    mats.led.color.copy(LED_OFF).lerp(this.ledHot, led);
    mats.glassGlow(led, this.ledColor);
    this.pool.forEach((r, i) => (r.intensity = 26 * this.poolPower[i] * led * v.rect));
    this.sun.intensity = (this.hasWindow ? 2.6 * v.sun : 0) + (this.sunBounce && this.windowAdded ? 2.6 * v.bounce : 0);
    this.winRect.intensity = this.hasWindow ? 5 * v.sun : 0;
    mats.windowGlass.emissiveIntensity = 0.12 + 0.85 * v.glow;
    mats.windowGlass.emissive.copy(v.glow > 0.4 ? GLASS_DAY : GLASS_NIGHT);
    mats.ovenLight.color.setRGB(0.16 + 0.5 * led, 0.1 + 0.3 * led, 0.04 + 0.1 * led);
    mats.ceilingLit.emissiveIntensity = 0.75 * v.halo;
    // a lamp-lit room: the environment is dim for the diffuse light, but glossy black glass still mirrors a bright room
    const mirror = 1 + 3 * v.halo;
    mats.blackGlass.envMapIntensity = mirror;
    mats.ovenWindow.envMapIntensity = mirror;
    mats.appliance.envMapIntensity = mirror;
    mats.hob.envMapIntensity = mirror;
    this.sweep.intensity = this.sweepIntensity;
    bloom.strength = v.bloom;
  }
}
