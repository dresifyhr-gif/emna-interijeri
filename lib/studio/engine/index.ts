/**
 * EMNA 3D studio engine — vanilla three.js, framework-agnostic (future SaaS
 * widget). See lib/studio/types.ts for the contract and lib/studio/engine.ts
 * for the public entry.
 *
 * SSR-safe: nothing here touches window/document at module load; everything
 * happens inside createStudioEngine().
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { RectAreaLightUniformsLib } from "three/addons/lights/RectAreaLightUniformsLib.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { geometryKey, planKitchen, sanitizeConfig, type PlanSlot, type RunId } from "../plan";
import {
  DEFAULT_CONFIG,
  type CreateStudioEngine,
  type HandleStyle,
  type KitchenConfig,
  type Layout,
  type ModuleInfo,
  type Mood,
  type StudioEngineApi,
  type StudioEngineOptions,
} from "../types";
import { applyViewOffset, fitBox, viewDir, type Region } from "./camera";
import { buildKitchen, disposeKitchen, ledLights, moduleCtx, rebuildPieces, rebuildWorktop, type KitchenRT } from "./kitchen";
import { injectStyle, releaseStyle } from "./labels";
import { Lights, MOODS } from "./lights";
import { ACCENT, Materials } from "./materials";
import { canDemo, playDemo, stopDemo } from "./mechanisms";
import { createModule, rebuildFronts, type ModuleRT } from "./modules";
import { disposeGeometries } from "./geo";
import { E, Tweens } from "./tween";
import { SHOWCASE_CONFIG, showcasePresets } from "../showcase";

export { SHOWCASE_CONFIG };

/** background colours as they appear on screen (sRGB) */
const BG = { showcase: "#0B0B0C", day: "#131315", night: "#070708" };
const EXPOSURE = 0.95;

const VIEW: Record<Layout, { az: number; el: number; orbit: [number, number]; limit: [number, number] }> = {
  ravna: { az: 0.34, el: 0.2, orbit: [0.55, -0.5], limit: [-1.25, 1.25] },
  L: { az: 0.5, el: 0.21, orbit: [0.82, 0.12], limit: [-1.1, 1.3] },
  U: { az: 0.1, el: 0.3, orbit: [0.28, -0.28], limit: [-0.75, 0.75] },
  otok: { az: 0.45, el: 0.3, orbit: [0.6, -0.45], limit: [-2.4, 2.4] },
};

// ---------------------------------------------------------------- tone mapping helpers

function acesFit(c: [number, number, number]): [number, number, number] {
  const k = EXPOSURE / 0.6;
  const r = c[0] * k;
  const g = c[1] * k;
  const b = c[2] * k;
  // GLSL mat3 columns (as in three's tonemapping_pars_fragment)
  const i0 = 0.59719 * r + 0.35458 * g + 0.04823 * b;
  const i1 = 0.076 * r + 0.90834 * g + 0.01566 * b;
  const i2 = 0.0284 * r + 0.13383 * g + 0.83777 * b;
  const f = (v: number) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
  const a0 = f(i0);
  const a1 = f(i1);
  const a2 = f(i2);
  const o0 = 1.60475 * a0 - 0.53108 * a1 - 0.07367 * a2;
  const o1 = -0.10208 * a0 + 1.10813 * a1 - 0.00605 * a2;
  const o2 = -0.00327 * a0 - 0.07276 * a1 + 1.07602 * a2;
  const cl = (v: number) => Math.min(1, Math.max(0, v));
  return [cl(o0), cl(o1), cl(o2)];
}

/** linear scene colour that ACES maps back to the given screen colour */
function untonemapped(hex: string): THREE.Color {
  const target = new THREE.Color(hex);
  const t: [number, number, number] = [target.r, target.g, target.b];
  const c: [number, number, number] = [...t];
  for (let i = 0; i < 40; i++) {
    const m = acesFit(c);
    for (let j = 0; j < 3; j++) c[j] = Math.max(0, c[j] * (m[j] > 1e-6 ? t[j] / m[j] : 2));
  }
  return new THREE.Color(c[0], c[1], c[2]);
}

// ---------------------------------------------------------------- engine

interface Play {
  t: number;
  delay: number;
  speed: number;
}

class Engine {
  readonly api: StudioEngineApi;
  private readonly doc: Document;
  private readonly win: Window;
  private readonly mode: "studio" | "showcase";
  private readonly mobile: boolean;
  private reduced: boolean;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera: THREE.PerspectiveCamera;
  private readonly composer: EffectComposer;
  private readonly bloom: UnrealBloomPass;
  private readonly output: OutputPass;
  private readonly labels: CSS2DRenderer | null = null;
  private readonly controls: OrbitControls | null = null;
  private readonly mats: Materials;
  private readonly lights: Lights;
  private readonly tweens = new Tweens();
  private readonly envRT: THREE.WebGLRenderTarget;
  private readonly floor: THREE.Mesh;
  private readonly bg = new THREE.Color();
  private readonly fog: THREE.Fog;

  private cfg: KitchenConfig;
  private applied: { front: string; top: string; handles: HandleStyle; led: boolean };
  private mood: Mood;
  private kitchen: KitchenRT | null = null;
  private booting = true;
  private pendingCfg: KitchenConfig | null = null;
  private play: Play | null = null;
  private rebuildTimer: ReturnType<typeof setTimeout> | null = null;

  private size = { w: 1, h: 1 };
  private region: Region = { x0: 0, x1: 1, y0: 0, y1: 1 };
  private fitD = 8;
  private userMoved = false;
  private ledK = 1;

  // showcase
  private progress: number | null = null;
  private sp = 0;
  private autoT = 0;
  private presetIdx = 0;
  private presets: { front: string; top: string }[] = [];
  private lastApplied = -1;

  // interaction
  private hoverId: string | null = null;
  private selectedId: string | null = null;
  private pointer = { x: 0, y: 0, dirty: false, inside: false };
  private down: { x: number; y: number; t: number } | null = null;
  private readonly raycaster = new THREE.Raycaster();
  private readonly tmpA = new THREE.Vector3();
  private readonly tmpB = new THREE.Vector3();
  private rayTargets: THREE.Object3D[] = [];
  private keyCycle = -1;

  // loop
  private raf = 0;
  private last = 0;
  private time = 0;
  private dirty = true;
  private docVisible = true;
  private inView = true;
  private disposed = false;
  private readyFired = false;
  private readonly cleanups: (() => void)[] = [];
  private restorePosition = false;

  constructor(
    private readonly container: HTMLElement,
    private readonly opts: StudioEngineOptions,
  ) {
    this.doc = container.ownerDocument;
    const win = this.doc.defaultView;
    if (!win) throw new Error("EMNA studio: container is not attached to a window");
    this.win = win;
    this.mode = opts.mode;
    const mq = (q: string) => (typeof win.matchMedia === "function" ? win.matchMedia(q) : null);
    const rm = mq("(prefers-reduced-motion: reduce)");
    this.reduced = Boolean(rm?.matches);
    if (rm) {
      const onRm = () => (this.reduced = rm.matches);
      rm.addEventListener?.("change", onRm);
      this.cleanups.push(() => rm.removeEventListener?.("change", onRm));
    }
    const coarse = Boolean(mq("(pointer: coarse)")?.matches);
    this.mobile = coarse || Math.min(win.innerWidth, win.innerHeight) < 700;
    const dpr = Math.min(win.devicePixelRatio || 1, this.mobile ? 1.5 : 2);

    injectStyle(this.doc);
    if (win.getComputedStyle(container).position === "static") {
      container.style.position = "relative";
      this.restorePosition = true;
    }

    // ---- renderer
    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: "high-performance" });
    this.renderer = renderer;
    renderer.setPixelRatio(dpr);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = EXPOSURE;
    renderer.localClippingEnabled = true;
    RectAreaLightUniformsLib.init();
    const canvas = renderer.domElement;
    canvas.className = "emna-studio-canvas";
    canvas.dataset.mode = this.mode;
    if (this.mode === "showcase") {
      canvas.style.pointerEvents = "none";
      canvas.setAttribute("role", "img");
      canvas.setAttribute("aria-label", "3D prikaz kuhinje po mjeri");
    } else {
      canvas.tabIndex = 0;
      canvas.setAttribute("role", "application");
      canvas.setAttribute(
        "aria-label",
        "3D prikaz vaše kuhinje. Povlačenjem okrećete pogled. Tipkovnica: strelice okreću pogled, plus i minus približavaju, Enter odabire sljedeći element, Escape poništava odabir.",
      );
    }
    container.appendChild(canvas);

    this.mats = new Materials({ size: this.mobile ? 512 : 1024, anisotropy: Math.min(8, renderer.capabilities.getMaxAnisotropy()) });

    // ---- scene
    const scene = this.scene;
    this.bg.copy(untonemapped(this.mode === "showcase" ? BG.showcase : BG.day));
    scene.background = this.bg;
    this.fog = new THREE.Fog(this.bg.clone(), 12, 30);
    scene.fog = this.fog;
    const pmrem = new THREE.PMREMGenerator(renderer);
    const room = new RoomEnvironment();
    this.envRT = pmrem.fromScene(room, 0.04);
    scene.environment = this.envRT.texture;
    scene.environmentIntensity = 0;
    room.dispose();
    pmrem.dispose();

    this.floor = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), this.mats.floor);
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    scene.add(this.floor);

    this.camera = new THREE.PerspectiveCamera(30, 1, 0.1, 120);
    this.lights = new Lights(scene, this.mobile ? 4 : 10, this.mobile ? 1024 : 2048);

    // ---- post
    const { w, h } = this.measure();
    this.size = { w, h };
    const rt = new THREE.WebGLRenderTarget(Math.round(w * dpr), Math.round(h * dpr), {
      type: THREE.HalfFloatType,
      samples: this.mobile ? 2 : 4,
    });
    this.composer = new EffectComposer(renderer, rt);
    this.composer.setPixelRatio(dpr);
    this.composer.addPass(new RenderPass(scene, this.camera));
    // threshold high enough that a sunlit white worktop never glows — only LEDs and hot specular spots do
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.3, 0.55, 2.2);
    this.composer.addPass(this.bloom);
    this.output = new OutputPass();
    this.composer.addPass(this.output);

    // ---- studio-only layers
    if (this.mode === "studio") {
      const lr = new CSS2DRenderer();
      lr.domElement.className = "emna-studio-labels";
      container.appendChild(lr.domElement);
      this.labels = lr;
      const c = new OrbitControls(this.camera, canvas);
      c.enableDamping = true;
      c.dampingFactor = 0.07;
      c.rotateSpeed = 0.55;
      c.zoomSpeed = 0.7;
      c.panSpeed = 0.6;
      c.screenSpacePanning = true;
      c.minPolarAngle = 0.45;
      c.maxPolarAngle = 1.5;
      c.minDistance = 1.8;
      c.maxDistance = 20;
      const onStart = () => {
        this.userMoved = true;
        this.tweens.cancel("camera");
      };
      const onChange = () => (this.dirty = true);
      c.addEventListener("start", onStart);
      c.addEventListener("change", onChange);
      this.cleanups.push(() => {
        c.removeEventListener("start", onStart);
        c.removeEventListener("change", onChange);
      });
      this.controls = c;
      this.bindPointer(canvas);
    }

    // ---- config
    this.cfg = sanitizeConfig(opts.config ?? (this.mode === "showcase" ? SHOWCASE_CONFIG : DEFAULT_CONFIG));
    this.applied = { front: this.cfg.front, top: this.cfg.top, handles: this.cfg.handles, led: this.cfg.led };
    this.ledK = this.cfg.led ? 1 : 0;
    this.mood = opts.mood ?? "day";
    this.presets = this.makePresets();

    // ---- observers
    const ro = new ResizeObserver(() => this.resize());
    ro.observe(container);
    this.cleanups.push(() => ro.disconnect());
    if (typeof IntersectionObserver !== "undefined") {
      const io = new IntersectionObserver((entries) => {
        for (const e of entries) this.inView = e.isIntersecting;
        this.updateRunning();
      });
      io.observe(container);
      this.cleanups.push(() => io.disconnect());
    }
    const onVis = () => {
      this.docVisible = this.doc.visibilityState !== "hidden";
      this.updateRunning();
    };
    this.doc.addEventListener("visibilitychange", onVis);
    this.cleanups.push(() => this.doc.removeEventListener("visibilitychange", onVis));
    this.docVisible = this.doc.visibilityState !== "hidden";

    this.api = {
      setConfig: (c) => this.setConfig(c),
      setMood: (m) => this.setMood(m),
      setProgress: (p) => this.setProgress(p),
      snapshot: (mw) => this.snapshot(mw),
      demo: (id) => this.demo(id),
      deselect: () => this.deselect(),
      resize: () => this.resize(),
      dispose: () => this.dispose(),
    };

    this.resize();
    void this.boot();
  }

  // ================================================================ boot

  private async boot(): Promise<void> {
    const K = this.build(this.cfg, "cinematic");
    this.kitchen = K;
    this.scene.add(K.root);
    this.afterBuild(K);
    this.frameCamera(true);

    // compile every program for the render target the composer uses, so the intro doesn't stutter
    try {
      this.renderer.setRenderTarget(this.composer.renderTarget1);
      await this.renderer.compileAsync(this.scene, this.camera);
    } catch {
      /* compile is an optimisation only */
    } finally {
      if (!this.disposed) this.renderer.setRenderTarget(null);
    }
    if (this.disposed) return;

    this.booting = false;
    const instant = this.reduced;
    if (this.mode === "studio") {
      if (instant) {
        K.timeline.finish();
        this.lights.cur = { ...MOODS[this.mood] };
      } else {
        K.timeline.apply(0);
        this.play = { t: 0, delay: 0.35, speed: 1 };
        this.tweenMood(this.mood, 2.2, 0.25);
      }
      this.introCamera(instant);
    } else {
      if (instant) {
        K.timeline.finish();
        this.autoT = K.assembled + 10;
        this.lights.cur = { ...MOODS[this.mood] };
      } else {
        K.timeline.apply(0);
        this.tweenMood(this.mood, 2, 0.1);
      }
    }
    this.dirty = true;
    this.updateRunning();
    if (this.pendingCfg) {
      const c = this.pendingCfg;
      this.pendingCfg = null;
      this.setConfig(c);
    }
  }

  private build(cfg: KitchenConfig, tempo: "cinematic" | "quick"): KitchenRT {
    const plan = planKitchen(cfg);
    return buildKitchen(
      {
        mats: this.mats,
        doc: this.doc,
        frontId: this.applied.front,
        topId: this.applied.top,
        handles: this.applied.handles,
        labels: this.mode === "studio",
        tempo,
      },
      plan,
    );
  }

  /** lights, LEDs, raycast targets for a freshly built kitchen */
  private afterBuild(K: KitchenRT): void {
    this.lights.aim(K.box);
    this.lights.setWindow(K.windowLight);
    this.lights.setLeds(ledLights(K, this.lights.pool.length));
    this.refreshLedVisibility();
    this.refreshRayTargets();
    const c = K.box.getCenter(new THREE.Vector3());
    const r = K.box.getSize(new THREE.Vector3()).length() / 2;
    if (this.controls) {
      this.controls.cursor.copy(c);
      this.controls.maxTargetRadius = Math.max(1, r * 0.7);
    }
  }

  private refreshRayTargets(): void {
    const K = this.kitchen;
    const skip = new Set<THREE.Material>([this.mats.shadow, this.mats.windowGlass, this.mats.doorGlass, this.mats.glassShelf, this.mats.dim]);
    const list: THREE.Object3D[] = [];
    K?.root.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.isMesh && !skip.has(me.material as THREE.Material)) list.push(me);
    });
    this.rayTargets = list;
  }

  private refreshLedVisibility(): void {
    const K = this.kitchen;
    if (!K) return;
    const on = this.ledK > 0.001;
    for (const z of K.leds) z.mesh.visible = on;
  }

  private makePresets(): { front: string; top: string }[] {
    return showcasePresets(this.cfg);
  }

  // ================================================================ camera

  private measure(): { w: number; h: number } {
    return { w: Math.max(1, this.container.clientWidth), h: Math.max(1, this.container.clientHeight) };
  }

  private computeRegion(): Region {
    const { w, h } = this.size;
    if (this.mode === "showcase") {
      if (w / h >= 1.1) return { x0: 0.41, x1: 0.96, y0: 0.08, y1: 0.92 };
      return { x0: 0.05, x1: 0.95, y0: 0.38, y1: 0.95 };
    }
    const cs = this.win.getComputedStyle(this.container);
    const px = (n: string) => {
      const v = parseFloat(cs.getPropertyValue(n));
      return Number.isFinite(v) ? v : 0;
    };
    const t = px("--studio-inset-top");
    const r = px("--studio-inset-right");
    const b = px("--studio-inset-bottom");
    const l = px("--studio-inset-left");
    const x0 = Math.min(0.6, l / w + 0.03);
    const x1 = Math.max(x0 + 0.3, 1 - r / w - 0.03);
    const y0 = Math.min(0.6, t / h + 0.06);
    const y1 = Math.max(y0 + 0.3, 1 - b / h - 0.05);
    return { x0, x1, y0, y1 };
  }

  private view() {
    return VIEW[this.kitchen?.plan.cfg.layout ?? this.cfg.layout];
  }

  /** fit distance for the current kitchen at (az, el); the hero frames the whole set incl. walls */
  private fitAt(az: number, el: number) {
    const K = this.kitchen;
    if (!K) return null;
    const box = this.mode === "showcase" ? K.room : K.box;
    const target = this.frameTarget(K);
    return fitBox(this.camera, box, target, viewDir(az, el), this.region, 1.5, 60);
  }

  private frameTarget(K: KitchenRT): THREE.Vector3 {
    const t = K.box.getCenter(new THREE.Vector3());
    if (this.mode === "showcase") t.y = (K.room.min.y + K.room.max.y) / 2;
    return t;
  }

  /** place the camera at the default framing (studio: keep user's angle after the first frame) */
  private frameCamera(initial: boolean): void {
    const K = this.kitchen;
    if (!K) return;
    const v = this.view();
    // fog starts just behind the kitchen so the floor melts into the background
    const fogAt = () => {
      const r = K.box.getSize(this.tmpA).length() / 2;
      this.fog.near = this.fitD + r * 0.6;
      this.fog.far = this.fog.near + 12 + r;
    };
    if (this.mode === "showcase") {
      const a = this.fitAt(v.orbit[0], v.el);
      const b = this.fitAt(v.orbit[1], v.el);
      const c = this.fitAt(v.az, v.el);
      this.fitD = Math.max(a?.distance ?? 8, b?.distance ?? 8, c?.distance ?? 8);
      fogAt();
      this.updateShowcaseCamera();
      return;
    }
    const c = this.controls;
    if (!c) return;
    let az = v.az;
    let el = v.el;
    if (!initial && this.userMoved) {
      const off = this.camera.position.clone().sub(c.target);
      const sph = new THREE.Spherical().setFromVector3(off);
      az = sph.theta;
      el = Math.PI / 2 - sph.phi;
    }
    const f = this.fitAt(az, el);
    if (!f) return;
    this.fitD = f.distance;
    fogAt();
    c.minAzimuthAngle = v.limit[0];
    c.maxAzimuthAngle = v.limit[1];
    c.maxDistance = Math.max(6, f.distance * 1.8);
    if (initial) {
      this.camera.position.copy(f.position);
      c.target.copy(f.target);
      c.update();
    } else {
      this.tweenCamera(f.position, f.target, this.reduced ? 0.01 : 1.2);
    }
  }

  private introCamera(instant: boolean): void {
    const c = this.controls;
    const K = this.kitchen;
    if (!c || !K) return;
    const v = this.view();
    const f = this.fitAt(v.az, v.el);
    if (!f) return;
    if (instant) {
      this.camera.position.copy(f.position);
      c.target.copy(f.target);
      c.update();
      return;
    }
    const start = f.target.clone().addScaledVector(viewDir(v.az + 0.5, v.el + 0.28), f.distance * 1.45);
    this.camera.position.copy(start);
    c.target.copy(f.target).add(new THREE.Vector3(0, 0.45, 0));
    c.update();
    this.tweenCamera(f.position, f.target, 4.4);
  }

  private tweenCamera(pos: THREE.Vector3, target: THREE.Vector3, dur: number): void {
    const c = this.controls;
    if (!c) return;
    this.tweens.cancel("camera");
    const p0 = this.camera.position.clone();
    const t0 = c.target.clone();
    this.tweens.add(
      dur,
      0,
      (e) => {
        this.camera.position.lerpVectors(p0, pos, e);
        c.target.lerpVectors(t0, target, e);
      },
      { ease: E.inOut, tag: "camera" },
    );
  }

  private updateShowcaseCamera(): void {
    const K = this.kitchen;
    if (!K) return;
    const v = this.view();
    let a: number;
    let o: number;
    if (this.progress === null) {
      a = Math.min(1, this.autoT / Math.max(0.1, K.assembled));
      o = 0;
    } else {
      a = Math.min(1, Math.max(0, this.sp / 0.4));
      o = Math.min(1, Math.max(0, (this.sp - 0.4) / 0.6));
    }
    const drift = this.reduced ? 0 : 1;
    const t = this.time;
    const az = v.orbit[0] + (v.orbit[1] - v.orbit[0]) * E.sine(o) + 0.12 * (1 - E.out(a)) + drift * 0.035 * Math.sin(t * 0.16);
    const el = v.el + 0.05 * (1 - a) + drift * 0.012 * Math.sin(t * 0.11 + 1.3);
    const dist = this.fitD * (1.12 - 0.12 * E.out(a)) * (1 - 0.05 * E.sine(o));
    const target = this.frameTarget(K);
    this.camera.position.copy(target).addScaledVector(viewDir(az, el), dist);
    this.camera.lookAt(target);
  }

  // ================================================================ loop

  private updateRunning(): void {
    const run = !this.disposed && this.docVisible && this.inView && !this.booting;
    if (run && !this.raf) {
      this.last = performance.now() / 1000;
      this.raf = this.win.requestAnimationFrame(this.frame);
    } else if (!run && this.raf) {
      this.win.cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
  }

  private frame = (ms: number) => {
    this.raf = 0;
    if (this.disposed) return;
    this.raf = this.win.requestAnimationFrame(this.frame);
    const now = ms / 1000;
    const dt = Math.min(0.1, Math.max(0, now - this.last));
    this.last = now;
    this.time += dt;
    // tweens run on the engine clock (rendered time): it starts at 0 like Tweens.now, so the intro tweens
    // added in boot() play from their first frame, and it stands still while the loop is paused
    this.tweens.update(this.time);
    const K = this.kitchen;
    let render = this.dirty || this.tweens.active;

    if (K && this.play) {
      this.play.t += dt * this.play.speed;
      const t = this.play.t - this.play.delay;
      if (t >= K.timeline.end) {
        K.timeline.finish();
        this.play = null;
      } else K.timeline.apply(Math.max(0, t));
      render = true;
    }

    if (this.mode === "showcase" && K) {
      this.updateShowcase(dt, K);
      render = true;
    }

    if (this.controls) {
      if (this.controls.update()) render = true;
      if (this.pointer.dirty) {
        this.pointer.dirty = false;
        this.updateHover();
      }
    }

    // dollhouse cut-away: hide a wall when the camera is behind it
    if (K) {
      const cam = this.camera.position;
      const n = this.tmpA;
      const p = this.tmpB;
      for (const w of K.walls) {
        const g = w.group.parent as THREE.Object3D;
        n.set(0, 0, 1).transformDirection(g.matrixWorld);
        p.setFromMatrixPosition(g.matrixWorld);
        const vis = p.sub(cam).negate().dot(n) > -0.05;
        if (w.group.visible !== vis) {
          w.group.visible = vis;
          render = true;
        }
      }
    }

    if (render) {
      this.applyLights();
      this.composer.render(dt);
      this.labels?.render(this.scene, this.camera);
      this.dirty = false;
      if (!this.readyFired) {
        this.readyFired = true;
        const cb = this.opts.onReady;
        if (cb) this.win.requestAnimationFrame(() => !this.disposed && cb());
      }
    }
  };

  private applyLights(): void {
    this.lights.apply(this.scene, this.mats, this.bloom, this.ledK);
    this.fog.color.copy(this.bg);
  }

  private updateShowcase(dt: number, K: KitchenRT): void {
    let t: number;
    if (this.progress === null) {
      this.autoT += dt;
      t = this.autoT;
    } else {
      this.sp += (this.progress - this.sp) * (1 - Math.exp(-dt * 4.5));
      if (Math.abs(this.progress - this.sp) < 1e-4) this.sp = this.progress;
      const a = Math.min(1, Math.max(0, this.sp / 0.4));
      const T0 = Math.min(0.6, K.assembled * 0.12);
      t = a >= 1 ? K.timeline.end + 1 : T0 + (K.assembled - T0) * a;
      const o = Math.min(1, Math.max(0, (this.sp - 0.4) / 0.6));
      const idx = o < 0.34 ? 0 : o < 0.67 ? 1 : 2;
      if (idx !== this.presetIdx && this.presets[idx]) {
        this.presetIdx = idx;
        const p = this.presets[idx];
        this.applyFront(p.front, this.applied.handles, !this.reduced);
        this.applyTop(p.top, !this.reduced);
      }
    }
    const tt = Math.min(t, K.timeline.end + 1);
    if (tt !== this.lastApplied) {
      K.timeline.apply(tt);
      this.lastApplied = tt;
    }
    this.updateShowcaseCamera();
  }

  // ================================================================ moods

  private tweenMood(m: Mood, dur: number, delay = 0): void {
    this.tweens.cancel("mood");
    const from = { ...this.lights.cur };
    const to = MOODS[m];
    const bg0 = this.bg.clone();
    const bg1 = untonemapped(this.mode === "showcase" ? BG.showcase : m === "night" ? BG.night : BG.day);
    this.tweens.add(
      dur,
      delay,
      (e) => {
        const cur = this.lights.cur as unknown as Record<string, number>;
        const f = from as unknown as Record<string, number>;
        const t = to as unknown as Record<string, number>;
        for (const k of Object.keys(t)) cur[k] = f[k] + (t[k] - f[k]) * e;
        this.bg.copy(bg0).lerp(bg1, e);
      },
      { ease: E.inOut, tag: "mood" },
    );
  }

  setMood(m: Mood): void {
    if (this.disposed || (m !== "day" && m !== "night")) return;
    this.mood = m;
    if (this.booting) return;
    this.tweenMood(m, this.reduced ? 0.01 : 1.4);
    this.dirty = true;
  }

  // ================================================================ config

  setConfig(next: KitchenConfig): void {
    if (this.disposed) return;
    const cfg = sanitizeConfig(next);
    if (this.booting || !this.kitchen) {
      this.pendingCfg = cfg;
      return;
    }
    const prev = this.cfg;
    this.cfg = cfg;
    if (this.mode === "showcase") {
      this.presets = this.makePresets();
      this.presetIdx = 0;
    }

    if (cfg.led !== prev.led) this.tweenLed(cfg.led);

    if (geometryKey(prev) !== geometryKey(cfg) || (this.rebuildTimer && this.mode === "studio")) {
      this.updateLabelText(cfg);
      if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
      this.rebuildTimer = setTimeout(
        () => {
          this.rebuildTimer = null;
          this.rebuild();
        },
        this.mode === "showcase" ? 0 : 170,
      );
      return;
    }

    const K = this.kitchen;
    const plan = planKitchen(cfg);
    const changed: PlanSlot[] = [];
    for (const s of plan.slots) {
      const old = K.plan.slots.find((o) => o.id === s.id);
      if (!old || old.type !== s.type) changed.push(s);
    }
    if (changed.length && this.mode === "showcase") {
      // the hero scrubs the assembly timeline, so new modules must be part of it
      this.rebuild();
      return;
    }
    K.plan = plan;
    const handlesChanged = cfg.handles !== this.applied.handles;
    if (handlesChanged && this.play) {
      K.timeline.finish();
      this.play = null;
    }
    // new modules are built with the new handle style, the rest re-dress in the wave
    if (handlesChanged) this.applied.handles = cfg.handles;
    if (changed.length) this.swapModules(changed);
    if (handlesChanged || cfg.front !== this.applied.front) this.applyFront(cfg.front, cfg.handles, !this.reduced, handlesChanged, changed.map((s) => s.id));
    if (cfg.top !== this.applied.top) this.applyTop(cfg.top, !this.reduced);
    this.dirty = true;
  }

  private updateLabelText(cfg: KitchenConfig): void {
    const K = this.kitchen;
    if (!K) return;
    for (const l of K.labels) {
      if (l.wall === "isl") l.setText(cfg.island);
      else l.setText(cfg.walls[l.wall]);
    }
    this.dirty = true;
  }

  private tweenLed(on: boolean): void {
    this.tweens.cancel("led");
    const from = this.ledK;
    const to = on ? 1 : 0;
    this.applied.led = on;
    if (on) {
      this.ledK = Math.max(this.ledK, 0.002);
      this.refreshLedVisibility();
    }
    this.tweens.add(
      this.reduced ? 0.01 : 0.8,
      0,
      (e) => {
        this.ledK = from + (to - from) * e;
      },
      {
        tag: "led",
        done: () => {
          this.ledK = to;
          this.refreshLedVisibility();
        },
      },
    );
  }

  private rebuild(): void {
    if (this.disposed) return;
    const old = this.kitchen;
    if (old) for (const m of old.modules.values()) stopDemo(this.tweens, m);
    this.tweens.cancel("wave", true);
    this.tweens.cancel("reveal", true);
    if (this.selectedId) {
      this.selectedId = null;
      this.opts.onSelect?.(null);
    }
    this.hoverId = null;
    this.applied.front = this.cfg.front;
    this.applied.top = this.cfg.top;
    this.applied.handles = this.cfg.handles;
    if (this.mode === "showcase") {
      this.presets = this.makePresets();
      this.presetIdx = 0;
    }
    const K = this.build(this.cfg, this.mode === "studio" ? "quick" : "cinematic");
    this.kitchen = K;
    this.scene.add(K.root);
    this.afterBuild(K);

    if (old) {
      for (const l of old.labels) l.el.style.opacity = "0";
      if (this.mode === "studio" && !this.reduced) {
        const r = old.root;
        const y0 = r.position.y;
        this.tweens.add(
          0.35,
          0,
          (e) => {
            r.scale.y = Math.max(1e-4, 1 - e);
            r.position.y = y0 - 0.02 * e;
          },
          { ease: E.in, done: () => disposeKitchen(old), tag: "collapse" },
        );
      } else disposeKitchen(old);
    }

    if (this.mode === "studio") {
      if (this.reduced) {
        K.timeline.finish();
        this.play = null;
      } else {
        K.timeline.apply(0);
        this.play = { t: 0, delay: 0.3, speed: Math.max(1, K.timeline.end / 1.15) };
      }
      this.frameCamera(false);
    } else {
      this.lastApplied = -1;
      this.frameCamera(false);
    }
    this.dirty = true;
  }

  // ---------------------------------------------------------------- module swap

  private swapModules(slots: PlanSlot[]): void {
    const K = this.kitchen;
    if (!K) return;
    this.tweens.cancel("reveal", true);
    const touchedRuns = new Set<RunId>();
    for (const slot of slots) {
      const old = K.modules.get(slot.id);
      const run = K.runs.get(slot.run);
      if (!old || !run) continue;
      stopDemo(this.tweens, old);
      this.highlight(old, false);
      const m = createModule(moduleCtx({ mats: this.mats, frontId: this.applied.front, handles: this.applied.handles }, K.plan, run, slot), slot);
      run.group.add(m.root);
      K.modules.set(slot.id, m);
      if (old.hole || m.hole) touchedRuns.add(slot.run);

      const or = old.root;
      const upper = slot.zone === "upper";
      const instant = this.reduced;
      if (instant) {
        or.parent?.remove(or);
        disposeGeometries(or);
      } else {
        const oy = or.position.y;
        this.tweens.add(
          0.3,
          0,
          (e) => {
            if (upper) or.position.y = oy + 0.2 * e;
            or.scale.y = Math.max(1e-4, 1 - e);
          },
          {
            ease: E.in,
            done: () => {
              or.parent?.remove(or);
              disposeGeometries(or);
            },
          },
        );
        const nr = m.root;
        if (upper) {
          const y = nr.position.y;
          nr.position.y = y + 0.25;
          nr.visible = false;
          this.tweens.add(0.6, 0.22, (e) => (nr.position.y = y + 0.25 * (1 - e)), { onStart: () => (nr.visible = true), tag: m });
        } else {
          nr.scale.y = 1e-4;
          nr.visible = false;
          this.tweens.add(0.6, 0.22, (e) => (nr.scale.y = Math.max(1e-4, e)), { onStart: () => (nr.visible = true), tag: m });
          for (const w of m.wrappers) {
            w.position.z = 0.5;
            this.tweens.add(0.5, 0.5, (e) => (w.position.z = 0.5 * (1 - e)), { ease: E.out, tag: m });
          }
          if (m.extras.children.length) {
            m.extras.scale.setScalar(1e-4);
            this.tweens.add(0.45, 0.6, (e) => m.extras.scale.setScalar(Math.max(1e-4, e)), { ease: E.out, tag: m });
          }
        }
      }
      const id = slot.id;
      this.tweens.add(0.01, instant ? 0 : 1.05, () => {}, {
        done: () => {
          if (this.disposed || this.kitchen !== K) return;
          const cur = K.modules.get(id);
          if (!cur) return;
          if (this.selectedId === id) {
            this.highlight(cur, true);
            this.opts.onSelect?.(this.info(cur));
          }
          if (this.mode === "studio" && !this.reduced && canDemo(cur)) void playDemo(this.tweens, cur, { reduced: false });
        },
      });
    }
    for (const r of touchedRuns) rebuildWorktop(K, r, this.mats.top(this.applied.top));
    K.leds = K.leds.filter((z) => z.kind !== "inner");
    for (const m of K.modules.values()) for (const z of m.leds) K.leds.push(z);
    this.tweens.add(0.01, this.reduced ? 0 : 0.32, () => {}, {
      done: () => {
        if (this.kitchen !== K) return;
        this.lights.setLeds(ledLights(K, this.lights.pool.length));
        this.refreshLedVisibility();
        this.refreshRayTargets();
      },
    });
    this.refreshRayTargets();
  }

  // ---------------------------------------------------------------- material waves

  private screenX(obj: THREE.Object3D, local?: THREE.Vector3): number {
    const p = local ? obj.localToWorld(local.clone()) : obj.getWorldPosition(new THREE.Vector3());
    p.project(this.camera);
    return p.x;
  }

  private assign(me: THREE.Mesh, mat: THREE.Material): void {
    if (me.userData.hl) {
      me.userData.baseMat = mat;
      me.material = this.mats.highlight(mat);
    } else me.material = mat;
  }

  /** fronts (and carcass colour / handle style) change as a wave across the screen */
  private applyFront(frontId: string, handles: HandleStyle, animate: boolean, handlesChanged = false, skip: string[] = []): void {
    const K = this.kitchen;
    if (!K) return;
    this.tweens.cancel("wave", true);
    const front = this.mats.front(frontId);
    const carcass = this.mats.carcass(frontId);
    const changedFront = frontId !== this.applied.front;
    this.applied.front = frontId;
    this.applied.handles = handles;
    const ctxEnv = { mats: this.mats, frontId, handles };
    K.root.updateMatrixWorld(true);

    const swapModule = (m: ModuleRT) => {
      if (handlesChanged && !skip.includes(m.slot.id)) {
        stopDemo(this.tweens, m);
        const hl = m.pickables.some((p) => p.userData.hl);
        if (hl) this.highlight(m, false);
        rebuildFronts(moduleCtx(ctxEnv, K.plan, K.runs.get(m.slot.run), m.slot), m);
        if (hl) this.highlight(m, true);
      } else if (changedFront) {
        for (const p of m.panels) this.assign(p, front);
      }
      if (changedFront) for (const c of m.carcassMeshes) this.assign(c, carcass);
    };
    const swapPieces = () => {
      if (handlesChanged) rebuildPieces(K, { mats: this.mats, frontId, handles });
      for (const p of K.frontPieces) p.material = front;
      for (const p of K.carcassPieces) p.material = carcass;
    };

    const mods = [...K.modules.values()];
    if (!animate) {
      mods.forEach(swapModule);
      swapPieces();
      this.refreshRayTargets();
      this.dirty = true;
      return;
    }
    const xs = mods.map((m) => this.screenX(m.root, m.anchor));
    const x0 = Math.min(-1, ...xs);
    const x1 = Math.max(1, ...xs);
    const span = Math.max(0.01, x1 - x0);
    const spread = 0.85;
    mods.forEach((m, i) => {
      const d = ((xs[i] - x0) / span) * spread;
      let swapped = false;
      const z0 = (p: THREE.Mesh) => (p.userData.z0 ??= p.position.z) as number;
      this.tweens.add(
        0.6,
        d,
        (_e, k) => {
          if (!swapped && k >= 0.5) {
            swapped = true;
            swapModule(m);
          }
          const off = Math.sin(Math.PI * k) * 0.045;
          for (const p of m.panels) p.position.z = z0(p) + off;
        },
        {
          ease: E.lin,
          tag: "wave",
          done: () => {
            if (!swapped) swapModule(m);
            for (const p of m.panels) p.position.z = z0(p);
          },
        },
      );
    });
    this.tweens.add(0.01, spread * 0.5 + 0.3, () => {}, { tag: "wave", done: swapPieces });
    this.tweens.add(0.01, spread + 0.7, () => {}, { tag: "wave", done: () => this.refreshRayTargets() });
    this.sweep(K, 1.25);
  }

  /** worktop changes with a clean reveal line moving across the screen */
  private applyTop(topId: string, animate: boolean): void {
    const K = this.kitchen;
    if (!K) return;
    this.tweens.cancel("reveal", true);
    const oldMat = this.mats.top(this.applied.top);
    const newMat = this.mats.top(topId);
    this.applied.top = topId;
    if (oldMat === newMat) return;
    const meshes = [...K.tops];
    if (!animate || !meshes.length) {
      for (const m of meshes) m.material = newMat;
      this.dirty = true;
      return;
    }
    K.root.updateMatrixWorld(true);
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    if (right.lengthSq() < 1e-6) right.set(1, 0, 0);
    right.normalize();
    let sMin = Infinity;
    let sMax = -Infinity;
    const p = new THREE.Vector3();
    for (const me of meshes) {
      me.geometry.computeBoundingBox();
      const bb = me.geometry.boundingBox;
      if (!bb) continue;
      for (const x of [bb.min.x, bb.max.x])
        for (const y of [bb.min.y, bb.max.y])
          for (const z of [bb.min.z, bb.max.z]) {
            const d = me.localToWorld(p.set(x, y, z)).dot(right);
            sMin = Math.min(sMin, d);
            sMax = Math.max(sMax, d);
          }
    }
    const pOld = new THREE.Plane(right.clone(), -sMin);
    const pNew = new THREE.Plane(right.clone().negate(), sMin);
    oldMat.clippingPlanes = [pOld];
    newMat.clippingPlanes = [pNew];
    const dupes = meshes.map((me) => {
      const d = new THREE.Mesh(me.geometry, newMat);
      d.castShadow = me.castShadow;
      d.receiveShadow = me.receiveShadow;
      d.position.copy(me.position);
      d.rotation.copy(me.rotation);
      d.scale.copy(me.scale);
      me.parent?.add(d);
      return d;
    });
    const finish = () => {
      for (const d of dupes) d.parent?.remove(d);
      for (const me of meshes) me.material = newMat;
      oldMat.clippingPlanes = null;
      newMat.clippingPlanes = null;
      oldMat.needsUpdate = true;
      newMat.needsUpdate = true;
      this.dirty = true;
    };
    this.tweens.add(
      1.3,
      0.05,
      (e) => {
        const s = sMin - 0.02 + (sMax - sMin + 0.04) * e;
        pOld.constant = -s;
        pNew.constant = s;
      },
      { ease: E.inOut, tag: "reveal", done: finish },
    );
    this.sweep(K, 1.35);
  }

  /** a soft spotlight that travels across the kitchen with a material change */
  private sweep(K: KitchenRT, dur: number): void {
    this.tweens.cancel("sweep");
    const box = K.box;
    const c = box.getCenter(new THREE.Vector3());
    const right = new THREE.Vector3(1, 0, 0).applyQuaternion(this.camera.quaternion);
    right.y = 0;
    right.normalize();
    const toCam = this.camera.position.clone().sub(c);
    toCam.y = 0;
    toCam.normalize();
    const half = box.getSize(new THREE.Vector3()).length() / 2;
    const a = c.clone().addScaledVector(right, -half - 0.6);
    const b = c.clone().addScaledVector(right, half + 0.6);
    const sw = this.lights.sweep;
    const peak = this.mood === "night" ? 6 : 9;
    this.tweens.add(
      dur,
      0,
      (_e, k) => {
        const x = a.clone().lerp(b, k);
        sw.position.copy(x).addScaledVector(toCam, 2.6).add(new THREE.Vector3(0, 1.6, 0));
        sw.target.position.set(x.x, 0.95, x.z);
        sw.target.updateMatrixWorld();
        this.lights.sweepIntensity = Math.sin(k * Math.PI) * peak;
      },
      { ease: E.lin, tag: "sweep", done: () => (this.lights.sweepIntensity = 0) },
    );
  }

  // ================================================================ interaction

  private bindPointer(canvas: HTMLCanvasElement): void {
    const local = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const p = local(e);
      this.down = { x: p.x, y: p.y, t: performance.now() };
    };
    const onUp = (e: PointerEvent) => {
      const d = this.down;
      this.down = null;
      if (!d || e.button !== 0) return;
      const p = local(e);
      if (Math.hypot(p.x - d.x, p.y - d.y) > 6 || performance.now() - d.t > 650) return;
      this.click(p.x, p.y);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      const p = local(e);
      this.pointer.x = p.x;
      this.pointer.y = p.y;
      this.pointer.inside = true;
      this.pointer.dirty = true;
    };
    const onLeave = () => {
      this.pointer.inside = false;
      this.pointer.dirty = true;
    };
    const onKey = (e: KeyboardEvent) => this.onKey(e);
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerleave", onLeave);
    canvas.addEventListener("keydown", onKey);
    this.cleanups.push(() => {
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerleave", onLeave);
      canvas.removeEventListener("keydown", onKey);
    });
  }

  private pick(x: number, y: number): ModuleRT | null {
    const K = this.kitchen;
    if (!K || this.play) return null;
    const { w, h } = this.size;
    this.raycaster.setFromCamera(new THREE.Vector2((x / w) * 2 - 1, -(y / h) * 2 + 1), this.camera);
    const hits = this.raycaster.intersectObjects(this.rayTargets, false);
    for (const hit of hits) {
      let o: THREE.Object3D | null = hit.object;
      let visible = true;
      while (o) {
        if (!o.visible) {
          visible = false;
          break;
        }
        o = o.parent;
      }
      if (!visible) continue;
      const id = hit.object.userData.mid as string | undefined;
      return id ? (K.modules.get(id) ?? null) : null;
    }
    return null;
  }

  private updateHover(): void {
    const m = this.pointer.inside && !this.down ? this.pick(this.pointer.x, this.pointer.y) : null;
    const id = m?.slot.id ?? null;
    if (id === this.hoverId) return;
    const K = this.kitchen;
    const prev = this.hoverId ? K?.modules.get(this.hoverId) : undefined;
    this.hoverId = id;
    if (prev && prev.slot.id !== this.selectedId) this.highlight(prev, false);
    if (m) this.highlight(m, true);
    this.renderer.domElement.dataset.hover = m ? "on" : "off";
    this.dirty = true;
  }

  private highlight(m: ModuleRT, on: boolean): void {
    let changed = false;
    for (const me of m.pickables) {
      const mat = me.material as THREE.Material;
      if (on && !me.userData.hl) {
        const h = this.mats.highlight(mat);
        if (h === mat) continue;
        me.userData.baseMat = mat;
        me.material = h;
        me.userData.hl = true;
        changed = true;
      } else if (!on && me.userData.hl) {
        me.material = me.userData.baseMat as THREE.Material;
        me.userData.hl = false;
        changed = true;
      }
    }
    if (on && changed) {
      const u = this.mats.hl.value;
      const target = ACCENT.clone().multiplyScalar(0.55);
      this.tweens.cancel("hl");
      const from = u.clone();
      this.tweens.add(0.25, 0, (e) => u.copy(from).lerp(target, e), { tag: "hl" });
    }
    this.dirty = true;
  }

  private select(m: ModuleRT | null): void {
    const K = this.kitchen;
    const prev = this.selectedId ? K?.modules.get(this.selectedId) : undefined;
    this.selectedId = m?.slot.id ?? null;
    if (prev && prev !== m && prev.slot.id !== this.hoverId) this.highlight(prev, false);
    if (m) this.highlight(m, true);
  }

  /** API: clear the selection silently (the caller already knows) */
  private deselect(): void {
    if (this.disposed || !this.selectedId) return;
    this.select(null);
  }

  private click(x: number, y: number): void {
    if (this.play || !this.kitchen) return;
    const m = this.pick(x, y);
    this.select(m);
    this.opts.onSelect?.(m ? this.info(m) : null);
    if (m) void playDemo(this.tweens, m, { reduced: this.reduced });
  }

  private info(m: ModuleRT): ModuleInfo {
    this.kitchen?.root.updateMatrixWorld(true);
    const p = m.root.localToWorld(m.anchor.clone()).project(this.camera);
    const { w, h } = this.size;
    return {
      id: m.slot.id,
      zone: m.slot.zone,
      type: m.slot.type,
      width: m.slot.width,
      options: [...m.slot.options],
      screen: { x: Math.round(((p.x + 1) / 2) * w), y: Math.round(((1 - p.y) / 2) * h) },
    };
  }

  private onKey(e: KeyboardEvent): void {
    const c = this.controls;
    const K = this.kitchen;
    if (!c || !K) return;
    let handled = true;
    const orbit = (dAz: number, dEl: number, zoom = 1) => {
      this.tweens.cancel("camera");
      this.userMoved = true;
      const off = this.camera.position.clone().sub(c.target);
      const s = new THREE.Spherical().setFromVector3(off);
      s.theta = Math.min(c.maxAzimuthAngle, Math.max(c.minAzimuthAngle, s.theta + dAz));
      s.phi = Math.min(c.maxPolarAngle, Math.max(c.minPolarAngle, s.phi - dEl));
      s.radius = Math.min(c.maxDistance, Math.max(c.minDistance, s.radius * zoom));
      const to = c.target.clone().add(new THREE.Vector3().setFromSpherical(s));
      this.tweenCamera(to, c.target.clone(), this.reduced ? 0.01 : 0.35);
    };
    switch (e.key) {
      case "ArrowLeft":
        orbit(-0.14, 0);
        break;
      case "ArrowRight":
        orbit(0.14, 0);
        break;
      case "ArrowUp":
        orbit(0, 0.08);
        break;
      case "ArrowDown":
        orbit(0, -0.08);
        break;
      case "+":
      case "=":
        orbit(0, 0, 0.88);
        break;
      case "-":
      case "_":
        orbit(0, 0, 1.14);
        break;
      case "Enter":
      case " ": {
        if (this.play) break;
        const ids = K.order.filter((id) => K.modules.has(id));
        if (!ids.length) break;
        const cur = this.selectedId ? ids.indexOf(this.selectedId) : this.keyCycle;
        this.keyCycle = (cur + (e.shiftKey ? -1 : 1) + ids.length) % ids.length;
        const m = K.modules.get(ids[this.keyCycle]);
        if (m) {
          this.select(m);
          this.opts.onSelect?.(this.info(m));
          void playDemo(this.tweens, m, { reduced: this.reduced });
        }
        break;
      }
      case "Escape":
        if (this.selectedId) {
          this.select(null);
          this.opts.onSelect?.(null);
        } else handled = false;
        break;
      default:
        handled = false;
    }
    if (handled) {
      e.preventDefault();
      this.dirty = true;
    }
  }

  // ================================================================ public bits

  setProgress(p: number): void {
    if (this.mode !== "showcase" || this.disposed || !Number.isFinite(p)) return;
    const v = Math.min(1, Math.max(0, p));
    if (this.progress === null) {
      // continue smoothly from wherever the idle intro is
      const K = this.kitchen;
      const a = K ? Math.min(1, this.autoT / Math.max(0.1, K.assembled)) : 0;
      this.sp = a * 0.4;
    }
    this.progress = v;
  }

  demo(id: string): void {
    const m = this.kitchen?.modules.get(id);
    if (!m || this.play || this.disposed) return;
    void playDemo(this.tweens, m, { reduced: this.reduced });
    this.dirty = true;
  }

  async snapshot(maxWidth = 1200): Promise<string> {
    if (this.disposed) return "";
    const K = this.kitchen;
    if (K && this.play) {
      K.timeline.finish();
      this.play = null;
    }
    this.tweens.cancel("wave", true);
    this.tweens.cancel("reveal", true);
    const hl: ModuleRT[] = [];
    if (K) {
      for (const m of K.modules.values()) {
        if (m.pickables.some((p) => p.userData.hl)) {
          hl.push(m);
          this.highlight(m, false);
        }
      }
    }
    // the measurements are CSS2D text and never reach the WebGL canvas, so leave their accent bars out too
    const dimsWere = K?.labels.map((l) => l.group.visible) ?? [];
    K?.labels.forEach((l) => (l.group.visible = false));
    const { w, h } = this.size;
    const prevPR = this.renderer.getPixelRatio();
    const pr = Math.max(0.25, Math.min(3, maxWidth / w));
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(pr);
    this.composer.setSize(w, h);
    this.applyLights();
    this.controls?.update();
    this.composer.render(0);
    const outW = Math.round(Math.min(maxWidth, w * pr));
    const outH = Math.round((outW / w) * h);
    const out = this.doc.createElement("canvas");
    out.width = outW;
    out.height = outH;
    const g = out.getContext("2d");
    g?.drawImage(this.renderer.domElement, 0, 0, outW, outH);
    // restore
    this.renderer.setPixelRatio(prevPR);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(prevPR);
    this.composer.setSize(w, h);
    for (const m of hl) this.highlight(m, true);
    K?.labels.forEach((l, i) => (l.group.visible = dimsWere[i] ?? true));
    this.dirty = true;
    return out.toDataURL("image/jpeg", 0.85);
  }

  resize(): void {
    if (this.disposed) return;
    const { w, h } = this.measure();
    this.size = { w, h };
    const cam = this.camera;
    cam.aspect = w / h;
    cam.fov = w / h < 1 ? 40 : 30;
    this.renderer.setSize(w, h, false);
    this.composer.setSize(w, h);
    this.labels?.setSize(w, h);
    this.region = this.computeRegion();
    applyViewOffset(cam, w, h, this.region);
    if (this.kitchen && !this.booting) {
      if (this.mode === "showcase") this.frameCamera(false);
      else if (!this.userMoved && !this.tweens.has("camera")) this.frameCamera(true);
    }
    this.dirty = true;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.raf) this.win.cancelAnimationFrame(this.raf);
    this.raf = 0;
    if (this.rebuildTimer) clearTimeout(this.rebuildTimer);
    this.tweens.clear();
    for (const c of this.cleanups.splice(0)) {
      try {
        c();
      } catch {
        /* ignore */
      }
    }
    this.controls?.dispose();
    const K = this.kitchen;
    this.kitchen = null;
    // anything still in the scene (collapsing kitchens, floor, lights)
    this.scene.traverse((o) => {
      const me = o as THREE.Mesh;
      if (me.isMesh) me.geometry?.dispose();
    });
    if (K) for (const l of K.labels) l.el.remove();
    this.container.querySelectorAll(".emna-studio-dim").forEach((el) => el.remove());
    this.scene.traverse((o) => {
      const l = o as THREE.Light;
      if (l.isLight) l.dispose();
    });
    this.mats.dispose();
    this.envRT.dispose();
    this.bloom.dispose();
    this.output.dispose();
    this.composer.dispose();
    this.scene.clear();
    this.renderer.dispose();
    this.renderer.forceContextLoss();
    this.renderer.domElement.remove();
    this.labels?.domElement.remove();
    if (this.restorePosition) this.container.style.position = "";
    releaseStyle(this.doc);
  }
}

export const createStudioEngine: CreateStudioEngine = (container, opts) => new Engine(container, opts).api;
