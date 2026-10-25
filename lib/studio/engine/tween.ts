import type * as THREE from "three";

// ------------------------------------------------------------------ easing

export type Ease = (t: number) => number;

/** CSS-style cubic-bezier easing (Newton–Raphson + bisection fallback). */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): Ease {
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 6; i++) {
      const e = sx(t) - x;
      if (Math.abs(e) < 1e-5) return sy(t);
      const d = dx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= e / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 20; i++) {
      const v = sx(t);
      if (Math.abs(v - x) < 1e-5) break;
      if (v < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

export const E = {
  /** the house curve: cubic-bezier(.2,.8,.2,1) */
  premium: cubicBezier(0.2, 0.8, 0.2, 1),
  out: (t: number) => 1 - Math.pow(1 - t, 3),
  inOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  in: (t: number) => t * t * t,
  sine: (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * t),
  lin: (t: number) => t,
} satisfies Record<string, Ease>;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

// ------------------------------------------------------------------ tweens

interface Tween {
  t0: number;
  dur: number;
  fn: (e: number, k: number) => void;
  ease: Ease;
  done?: () => void;
  tag: unknown;
  started: boolean;
  onStart?: () => void;
}

/**
 * Tweens in seconds, driven by `update(now)` from the render loop. `now` must be a clock that starts at 0
 * (the engine passes its own rendered time, not the RAF timestamp): tweens added before the first frame
 * are stamped with `now = 0`, and a clock counted from page load would make them start part-way or
 * already finished.
 */
export class Tweens {
  private list: Tween[] = [];
  /** time of the last update() (same clock as update's argument) */
  now = 0;

  add(
    dur: number,
    delay: number,
    fn: (e: number, k: number) => void,
    opts: { ease?: Ease; done?: () => void; tag?: unknown; onStart?: () => void } = {},
  ): void {
    this.list.push({
      t0: this.now + delay,
      dur: Math.max(1e-4, dur),
      fn,
      ease: opts.ease ?? E.premium,
      done: opts.done,
      tag: opts.tag,
      started: false,
      onStart: opts.onStart,
    });
  }

  /** promise flavour; resolves on completion or cancel */
  run(dur: number, delay: number, fn: (e: number, k: number) => void, ease: Ease = E.premium, tag?: unknown): Promise<void> {
    return new Promise((res) => this.add(dur, delay, fn, { ease, done: res, tag }));
  }

  wait(sec: number, tag?: unknown): Promise<void> {
    return this.run(sec, 0, () => {}, E.lin, tag);
  }

  /** remove tweens with this tag; `finish` jumps them to their end state first */
  cancel(tag: unknown, finish = false): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const w = this.list[i];
      if (w.tag !== tag) continue;
      this.list.splice(i, 1);
      if (finish) {
        if (!w.started) w.onStart?.();
        w.fn(1, 1);
      }
      w.done?.();
    }
  }

  has(tag: unknown): boolean {
    return this.list.some((w) => w.tag === tag);
  }

  get active(): boolean {
    return this.list.length > 0;
  }

  /** any tween running or waiting that is not tagged `tag` (the engine: "is anything but the camera moving?") */
  activeExcept(tag: unknown): boolean {
    for (const w of this.list) if (w.tag !== tag) return true;
    return false;
  }

  update(now: number): void {
    this.now = now;
    const finished: Tween[] = [];
    for (let i = 0; i < this.list.length; i++) {
      const w = this.list[i];
      const p = (now - w.t0) / w.dur;
      if (p < 0) continue;
      if (!w.started) {
        w.started = true;
        w.onStart?.();
      }
      const k = clamp01(p);
      w.fn(w.ease(k), k);
      if (k >= 1) finished.push(w);
    }
    if (finished.length) {
      this.list = this.list.filter((w) => !finished.includes(w));
      for (const w of finished) w.done?.();
    }
  }

  clear(): void {
    const l = this.list;
    this.list = [];
    for (const w of l) w.done?.();
  }
}

// ------------------------------------------------------------------ timeline

export type TrackKind = "extrude" | "slideZ" | "drop" | "growX" | "growY" | "pop" | "label";

interface Track {
  obj: THREE.Object3D;
  kind: TrackKind;
  t0: number;
  dur: number;
  amt: number;
  ease: Ease;
  base: { px: number; py: number; pz: number; sx: number; sy: number; sz: number };
  el?: HTMLElement;
}

const MIN_SCALE = 1e-4;

/**
 * Scrubbable assembly. Every animated object gets a track on a shared time
 * axis; `apply(t)` is a pure function of t, so the hero can drive it with
 * scroll progress in both directions and the studio can play it in real time.
 */
export class Timeline {
  private tracks: Track[] = [];
  end = 0;

  add(obj: THREE.Object3D, kind: TrackKind, t0: number, dur: number, amt = 0, ease: Ease = E.premium, el?: HTMLElement): void {
    this.tracks.push({
      obj,
      kind,
      t0,
      dur: Math.max(0.01, dur),
      amt,
      ease,
      base: {
        px: obj.position.x,
        py: obj.position.y,
        pz: obj.position.z,
        sx: obj.scale.x,
        sy: obj.scale.y,
        sz: obj.scale.z,
      },
      el,
    });
    this.end = Math.max(this.end, t0 + dur);
  }

  /** objects whose track starts after time `t` (used by the hero to know what is still hidden) */
  apply(t: number): void {
    for (const k of this.tracks) {
      const p = (t - k.t0) / k.dur;
      const o = k.obj;
      const b = k.base;
      if (k.kind === "label") {
        if (k.el) k.el.style.opacity = String(clamp01(p));
        o.visible = p > 0;
        continue;
      }
      if (p <= 0) {
        o.visible = false;
        continue;
      }
      o.visible = true;
      const e = k.ease(clamp01(p));
      switch (k.kind) {
        case "extrude":
        case "growY":
          o.scale.y = Math.max(MIN_SCALE, b.sy * e);
          break;
        case "growX":
          o.scale.x = Math.max(MIN_SCALE, b.sx * e);
          break;
        case "slideZ":
          o.position.z = b.pz + k.amt * (1 - e);
          break;
        case "drop":
          o.position.y = b.py + k.amt * (1 - e);
          break;
        case "pop":
          o.scale.set(Math.max(MIN_SCALE, b.sx * e), Math.max(MIN_SCALE, b.sy * e), Math.max(MIN_SCALE, b.sz * e));
          break;
      }
    }
  }

  /** put everything at rest (end state) */
  finish(): void {
    this.apply(this.end + 1);
  }
}
