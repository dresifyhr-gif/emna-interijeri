/**
 * Render quality for the engine: the tiers it can run at, the adaptive governor that steps the homepage
 * hero (showcase) down when frames are slow, and the live stats the ?fps=1 readout shows.
 *
 * Why tiers and not one setting: the hero is a full-screen WebGL canvas behind scroll-driven text, so on a
 * GPU that cannot keep up the whole page feels sticky. Fill rate (pixels × MSAA samples × a heavy PBR shader)
 * is what costs, so the tiers trade pixel density first, then bloom, then shadow resolution.
 */

export interface Quality {
  /** device pixels per CSS pixel for the canvas and the post-processing targets */
  pr: number;
  /** MSAA samples of the HDR render target */
  samples: number;
  bloom: boolean;
  /** key-light shadow map size (px) */
  shadow: number;
}

/** the interactive studio keeps its original single quality level */
export function studioQuality(dpr: number, mobile: boolean): Quality[] {
  return [{ pr: Math.min(dpr, mobile ? 1.5 : 2), samples: mobile ? 2 : 4, bloom: true, shadow: mobile ? 1024 : 2048 }];
}

/** device-pixel budget for the hero canvas (a 1470×956 laptop at 1.5× is 3.2 MP; only very large screens hit it) */
const SHOWCASE_BUDGET = 4.0e6;
/** MSAA sample budget: 4× only while the canvas is small enough (e.g. a 1080p screen at 1×), else 2× */
const SAMPLE_BUDGET = 8.5e6;

const r2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Hero tiers, best first. Tier 0 caps density at 1.5× (or the pixel budget, never below 1× on a normal screen):
 * at 2× a laptop paid for 5.2 MP × 4 MSAA samples of a heavy shader — mostly invisible on a dark, softly lit
 * scene that sits behind a scrim. MSAA is 4× only on small canvases; at high density 2× is enough.
 */
export function showcaseQuality(dpr: number, w: number, h: number, mobile: boolean): Quality[] {
  const d = Math.max(0.5, dpr || 1);
  const fit = Math.sqrt(SHOWCASE_BUDGET / Math.max(1, w * h));
  const base = r2(d < 1 ? d : Math.min(d, 1.5, Math.max(1, fit)));
  const shadow = mobile ? 1024 : 2048;
  const tiers: Quality[] = [
    { pr: base, samples: mobile || w * h * base * base * 4 > SAMPLE_BUDGET ? 2 : 4, bloom: true, shadow },
    { pr: r2(Math.max(Math.min(base, 1), base * 0.84)), samples: 2, bloom: false, shadow },
    { pr: base > 1.05 ? 1 : r2(Math.min(base, Math.max(0.6, base * 0.85))), samples: 2, bloom: false, shadow: shadow / 2 },
    { pr: r2(Math.min(base, Math.max(0.6, Math.min(0.75, base * 0.75)))), samples: 0, bloom: false, shadow: shadow / 2 },
  ];
  // drop steps that would change nothing
  return tiers.filter((t, i) => {
    if (i === 0) return true;
    const p = tiers[i - 1];
    return t.pr !== p.pr || t.samples !== p.samples || t.bloom !== p.bloom || t.shadow !== p.shadow;
  });
}

const median = (a: number[]) => {
  const s = [...a].sort((x, y) => x - y);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

/** +1: one tier down · −n: go back up n tiers and stop · 0: keep */
export type GovernorVerdict = number;

/**
 * Watches the interval between consecutive full-rate rendered frames (RAF timestamps — a GPU that cannot keep
 * up shows up as longer intervals). Boot phase: after a short warm-up, 0.6 s windows; a window whose median is
 * over 20 ms steps the quality down (first verdict ≈1.2 s after the first frame). Two good windows end the boot
 * phase; after that a slow 2.5 s window (median over 26 ms, e.g. thermal throttling on a phone) can still step
 * down. On a very slow GPU a window also closes after 2.5× its span with as few as 3 frames.
 * A step that does not make frames at least 12 % faster counts as "no gain" (one tier may only drop bloom, which
 * a given GPU may not care about). After two steps in a row without gain the bottleneck is not fill rate (a 30 Hz
 * power-saving cap, a busy main thread): both steps are reverted and the governor stops.
 */
export class FrameGovernor {
  private samples: number[] = [];
  private windowStart = -1;
  /** warm-up: ignore this many frames (texture uploads, first compiles, the poster cross-fade) — at most 600 ms */
  private skip = 12;
  private skipUntil = -1;
  private phase: "boot" | "watch" | "done" = "boot";
  private okWindows = 0;
  private lastBad = 0;
  private noGain = 0;

  get state(): "boot" | "watch" | "done" {
    return this.phase;
  }

  /** `now` and `interval` in ms */
  sample(now: number, interval: number): GovernorVerdict {
    if (this.phase === "done") return 0;
    if (this.skip > 0) {
      if (this.skipUntil < 0) this.skipUntil = now + 600;
      this.skip--;
      if (now < this.skipUntil) return 0;
      this.skip = 0;
    }
    if (this.windowStart < 0) this.windowStart = now;
    // pauses (hidden tab, hero off screen) never reach here (pause()); a very slow frame is still a frame
    this.samples.push(Math.min(interval, 1000));
    const boot = this.phase === "boot";
    const span = boot ? 600 : 2500;
    const elapsed = now - this.windowStart;
    // a full window, or — on a GPU so slow that 20 frames take ages — a longer one with a few frames
    const full = elapsed >= span && this.samples.length >= 20;
    if (!full && !(elapsed >= span * 2.5 && this.samples.length >= 3)) return 0;
    const med = median(this.samples);
    this.samples.length = 0;
    this.windowStart = -1;
    const limit = boot ? 20 : 26;
    if (med <= limit) {
      this.lastBad = 0;
      this.noGain = 0;
      if (boot && ++this.okWindows >= 2) this.phase = "watch";
      return 0;
    }
    this.okWindows = 0;
    if (this.lastBad && med > this.lastBad * 0.88) {
      if (++this.noGain >= 2) {
        this.phase = "done";
        return -this.noGain;
      }
    } else this.noGain = 0;
    this.lastBad = med;
    // the new tier reallocates its buffers: don't judge it by its first frames
    this.skip = 6;
    this.skipUntil = -1;
    return 1;
  }

  /** the loop paused (tab hidden, hero off screen): the next interval is not a frame */
  pause(): void {
    this.samples.length = 0;
    this.windowStart = -1;
    this.skip = Math.max(this.skip, 3);
    this.skipUntil = -1;
  }

  stop(): void {
    this.phase = "done";
  }
}

/** live numbers for the ?fps=1 readout (the engine updates this object in place; it never touches the DOM) */
export interface EngineStats {
  mode: "studio" | "showcase";
  tier: number;
  tiers: number;
  pixelRatio: number;
  samples: number;
  bloom: boolean;
  shadow: number;
  governor: "boot" | "watch" | "done" | "off";
  /** RAF ticks of the engine loop */
  ticks: number;
  /** frames actually rendered */
  renders: number;
  /** frames that re-rendered the shadow maps */
  shadowRenders: number;
  /** smoothed CPU time of one composer.render() (ms) */
  cpuMs: number;
  /** draw calls of the last frame, all passes */
  calls: number;
  triangles: number;
}

/** where the stats live: a property on the engine's canvas, read by components/home/FpsOverlay */
export type StatsCanvas = HTMLCanvasElement & { emnaStats?: EngineStats };
