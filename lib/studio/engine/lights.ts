/**
 * Studio lighting: key spot (shadows), hemisphere, rim, fill, a sweep spot for
 * material changes, daylight through the window (spot + area light) and a
 * fixed pool of RectAreaLights for the LED strips. Light counts — including
 * which lights cast shadows — never change after creation, so shaders are
 * compiled once (boot's compileAsync covers the window and no-window states).
 */

import * as THREE from "three";
import type { Mood } from "../types";
import { LED_GAIN, LED_OFF, LED_ON, type Materials } from "./materials";

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
}

export const MOODS: Record<Mood | "off", MoodValues> = {
  off: { hemi: 0, key: 0, rim: 0, fill: 0, env: 0, led: 0, rect: 0, sun: 0, glow: 0, bloom: 0.25 },
  day: { hemi: 0.5, key: 2.15, rim: 0.85, fill: 0.42, env: 0.52, led: 0, rect: 0, sun: 1, glow: 1, bloom: 0.22 },
  night: { hemi: 0.07, key: 0.62, rim: 0.12, fill: 0.06, env: 0.09, led: 1, rect: 1, sun: 0, glow: 0.05, bloom: 0.62 },
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

export class Lights {
  readonly hemi = new THREE.HemisphereLight("#fff4e6", "#0a0a0b", 0);
  readonly key = new THREE.SpotLight("#fff0da", 0, 0, 0.6, 0.85, 0);
  readonly rim = new THREE.DirectionalLight("#cdd6ff", 0);
  readonly fill = new THREE.PointLight("#ffe7cc", 0, 0, 0);
  readonly sweep = new THREE.SpotLight("#fff3e0", 0, 0, 0.34, 1, 0);
  readonly sun = new THREE.SpotLight("#fff6ea", 0, 0, 0.5, 1, 0);
  readonly winRect: THREE.RectAreaLight;
  readonly pool: THREE.RectAreaLight[] = [];
  private poolPower: number[] = [];
  private hasWindow = false;
  cur: MoodValues = { ...MOODS.off };
  sweepIntensity = 0;

  constructor(
    readonly scene: THREE.Scene,
    poolSize: number,
    shadowSize: number,
  ) {
    const k = this.key;
    k.castShadow = true;
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
    s.shadow.mapSize.set(Math.max(512, shadowSize / 2), Math.max(512, shadowSize / 2));
    s.shadow.bias = -0.0003;
    s.shadow.normalBias = 0.03;
    s.shadow.radius = 5;
    s.shadow.camera.near = 0.5;
    s.shadow.camera.far = 14;
    this.winRect = new THREE.RectAreaLight("#e8eef5", 0, 1, 1);
    scene.add(this.hemi, k, k.target, this.rim, this.fill, this.sweep, this.sweep.target, s, s.target, this.winRect);
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
    k.shadow.camera.near = Math.max(1, dist - r - 3);
    k.shadow.camera.far = dist + r + 4;
    k.shadow.camera.updateProjectionMatrix();
    k.target.updateMatrixWorld();
    this.rim.position.set(c.x - 6, 4, c.z - 1);
    this.fill.position.set(c.x - 4, 2.2, c.z + 6);
  }

  setWindow(w: WindowLight | null): void {
    this.hasWindow = Boolean(w);
    // The sun keeps castShadow on even without a window: toggling it changes the number of shadow-casting
    // lights, which recompiles every lit shader on the first window toggle. Without a window its shadow map
    // is rendered once and then left alone (its intensity is 0, so it shows nowhere).
    this.sun.shadow.autoUpdate = this.hasWindow;
    this.sun.shadow.needsUpdate = true;
    if (!w) {
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
    const wr = this.winRect;
    wr.width = w.width * 0.94;
    wr.height = w.height * 0.94;
    wr.position.copy(w.center).addScaledVector(w.normal, 0.02);
    wr.lookAt(w.center.clone().addScaledVector(w.normal, 2));
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
    this.rim.intensity = v.rim;
    this.fill.intensity = v.fill;
    scene.environmentIntensity = v.env;
    const led = v.led * ledScale;
    mats.led.color.copy(LED_OFF).lerp(new THREE.Color(LED_ON).multiplyScalar(LED_GAIN), led);
    this.pool.forEach((r, i) => (r.intensity = 26 * this.poolPower[i] * led * v.rect));
    this.sun.intensity = this.hasWindow ? 2.6 * v.sun : 0;
    this.winRect.intensity = this.hasWindow ? 5 * v.sun : 0;
    mats.windowGlass.emissiveIntensity = 0.12 + 0.85 * v.glow;
    mats.windowGlass.emissive.set(v.glow > 0.4 ? "#dfe9f2" : "#1a2433");
    mats.ovenLight.color.setRGB(0.16 + 0.5 * led, 0.1 + 0.3 * led, 0.04 + 0.1 * led);
    this.sweep.intensity = this.sweepIntensity;
    bloom.strength = v.bloom;
  }
}
