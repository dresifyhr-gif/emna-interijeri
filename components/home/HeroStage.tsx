"use client";

import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StudioEngineApi } from "@/lib/studio/types";
import { LinkButton } from "@/components/ui/Button";
import { HERO_CONFIG, PRESET_RANGES, engineProgress, presetIndexAt, type HeroPreset } from "./heroConfig";
import { StudioLaunch } from "./StudioLaunch";
import s from "./home.module.css";

const STATIC_STYLE = { opacity: 1, y: 0, visibility: "visible" as const };

/* ------------------------------------------------------------------ environment (hydration-safe) */

const RM = "(prefers-reduced-motion: reduce)";
const serverFalse = () => false;

function subscribeReduced(cb: () => void) {
  const m = window.matchMedia(RM);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const getReduced = () => window.matchMedia(RM).matches;

type NetInfo = {
  saveData?: boolean;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
};
const connection = (): NetInfo | undefined => (navigator as Navigator & { connection?: NetInfo }).connection;
function subscribeSaveData(cb: () => void) {
  const c = connection();
  c?.addEventListener?.("change", cb);
  return () => c?.removeEventListener?.("change", cb);
}
const getSaveData = () => Boolean(connection()?.saveData);

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/* ------------------------------------------------------------------ hero */

/**
 * Homepage hero: a tall scroll section with a sticky full-screen stage.
 * The live 3D kitchen (lib/studio/engine, showcase mode) assembles itself as an intro; scrolling then turns
 * the camera and cycles three material pairs (engine.setProgress), in both directions.
 * Until the engine reports its first frame — and permanently when WebGL fails, the visitor prefers reduced
 * motion or has Save-Data on — the server-rendered line-drawing `poster` is shown and the hero is one screen tall.
 */
export function HeroStage({
  poster,
  presets,
  readout,
}: {
  /** server-rendered line drawing (HeroPoster) */
  poster: ReactNode;
  /** the three material pairs the engine cycles through (heroPresets(), resolved on the server) */
  presets: HeroPreset[];
  /** e.g. "Kuhinja s otokom · zid 420 cm · otok 240 cm" */
  readout: string;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const mountRef = useRef<HTMLDivElement>(null);
  const engineRef = useRef<StudioEngineApi | null>(null);
  /** false until the visitor scrolls: until then the engine plays its own assembly intro */
  const drivingRef = useRef(false);

  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);

  const reduced = useSyncExternalStore(subscribeReduced, getReduced, serverFalse);
  const saveData = useSyncExternalStore(subscribeSaveData, getSaveData, serverFalse);
  const wants3d = !reduced && !saveData;
  const still = !wants3d || failed;
  const live = wants3d && ready && !failed;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  // mount / dispose the engine (three.js is fetched only here, after the page is idle)
  useEffect(() => {
    if (!wants3d) return;
    const el = mountRef.current;
    if (!el) return;
    let cancelled = false;
    let gotFrame = false;
    let engine: StudioEngineApi | null = null;
    let watchdog: number | null = null;

    const boot = async () => {
      try {
        const { createStudioEngine } = await import("@/lib/studio/engine");
        if (cancelled) return;
        engine = createStudioEngine(el, {
          mode: "showcase",
          config: HERO_CONFIG,
          onReady: () => {
            gotFrame = true;
            if (!cancelled) setReady(true);
          },
        });
        engineRef.current = engine;
        // a GPU that never delivers a first frame: give up and keep the poster
        watchdog = window.setTimeout(() => {
          if (cancelled || gotFrame) return;
          engine?.dispose();
          engine = null;
          engineRef.current = null;
          setFailed(true);
        }, 15000);
        // page restored mid-hero: follow the scroll position right away
        const p = scrollYProgress.get();
        if (p > 0.002) {
          drivingRef.current = true;
          engine.setProgress(engineProgress(p));
        }
      } catch (err) {
        if (cancelled) return;
        setFailed(true);
        if (process.env.NODE_ENV !== "production") console.warn("EMNA naslovnica: 3D prikaz nije dostupan.", err);
      }
    };

    const w = window as IdleWindow;
    const ric = w.requestIdleCallback;
    const idle = ric ? ric.call(w, () => void boot(), { timeout: 1200 }) : null;
    const timer = idle === null ? window.setTimeout(() => void boot(), 200) : null;

    return () => {
      cancelled = true;
      if (idle !== null) w.cancelIdleCallback?.(idle);
      if (timer !== null) window.clearTimeout(timer);
      if (watchdog !== null) window.clearTimeout(watchdog);
      engine?.dispose();
      engineRef.current = null;
      drivingRef.current = false;
      setReady(false);
    };
  }, [wants3d, scrollYProgress]);

  // scroll events only touch React state when the caption actually changes (3 times per pass), never per frame
  const activeRef = useRef(0);
  useMotionValueEvent(scrollYProgress, "change", (p) => {
    const idx = presetIndexAt(p);
    if (idx !== activeRef.current) {
      activeRef.current = idx;
      setActive(idx);
    }
    const engine = engineRef.current;
    if (!engine) return;
    if (!drivingRef.current) {
      if (p < 0.002) return;
      drivingRef.current = true;
    }
    engine.setProgress(engineProgress(p));
  });

  // overlay choreography (only applied while the 3D is live)
  // The opacity ranges always span 0…1: framer-motion runs scroll-linked opacity as a native scroll-driven
  // animation (ViewTimeline, on the compositor) with the input range as keyframe offsets. A range like
  // [0.17, 0.27] left the browser to invent keyframes at 0 and 1 from the element's base style, so the
  // captions faded out again while scrolling and the "Listajte" cue came back.
  const introOpacity = useTransform(scrollYProgress, [0, 0.02, 0.17, 1], [1, 1, 0, 0]);
  const introY = useTransform(scrollYProgress, [0, 0.17], [0, -44]);
  const introVis = useTransform(introOpacity, (v) => (v < 0.02 ? "hidden" : "visible"));
  const storyOpacity = useTransform(scrollYProgress, [0, 0.17, 0.27, 1], [0, 0, 1, 1]);
  const storyY = useTransform(scrollYProgress, [0.17, 0.27], [32, 0]);
  const storyVis = useTransform(storyOpacity, (v) => (v < 0.02 ? "hidden" : "visible"));
  const cueOpacity = useTransform(scrollYProgress, [0, 0.06, 1], [1, 0, 0]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby="naslovnica-naslov"
      // the header drops its backdrop blur while it sits over this section (blurring a live canvas every frame is costly)
      data-header="solid"
      className={`relative bg-ink ${still ? "h-[100svh]" : "h-[220vh]"} motion-reduce:h-[100svh]`}
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        {/* poster: line drawing until the first 3D frame (and as the fallback); hidden once faded out so the
            browser stops compositing a full-screen SVG under the canvas */}
        <div
          className={`absolute inset-0 transition-[opacity,visibility] duration-[1600ms] ease-premium ${live ? "invisible opacity-0" : "visible opacity-100"}`}
        >
          {poster}
        </div>

        {/* live 3D — the engine appends its own canvas here */}
        <div
          ref={mountRef}
          className={`absolute inset-0 transition-opacity duration-[1600ms] ease-premium ${live ? "opacity-100" : "opacity-0"}`}
        />

        <div aria-hidden className={`pointer-events-none absolute inset-0 ${s.scrim}`} />

        <div className={`shell relative z-10 grid h-full ${s.heroLayout}`}>
          {/* own compositor layer while scroll-driven: the big headline (with its soft text-shadow) is rasterised
              once and only moved/faded, instead of being repainted on every scroll frame */}
          <motion.div
            style={live ? { opacity: introOpacity, y: introY, visibility: introVis } : STATIC_STYLE}
            className={`col-start-1 row-start-1 max-w-[46rem] ${live ? "[will-change:transform,opacity]" : ""}`}
          >
            <p className={`eyebrow flex items-center gap-4 text-accent ${s.fadeUp}`} style={{ animationDelay: "0.05s" }}>
              <span aria-hidden className="h-px w-8 bg-accent/70" />
              Kuhinje i namještaj po mjeri
            </p>
            <h1 id="naslovnica-naslov" className={`display mt-6 text-fg ${s.h1}`}>
              {[
                { t: "Kuhinje", accent: false },
                { t: "po mjeri.", accent: true },
                { t: "Bez kompromisa.", accent: false },
              ].map((l, i) => (
                <span key={l.t} className="block overflow-hidden pb-[0.06em] -mb-[0.06em]">
                  <span className={`${s.rise} ${l.accent ? "text-accent" : ""}`} style={{ animationDelay: `${0.12 + i * 0.1}s` }}>
                    {l.t}
                  </span>
                </span>
              ))}
            </h1>
            <p
              className={`mt-7 max-w-[30rem] text-[15px] leading-relaxed text-fg/75 sm:text-base ${s.lead} ${s.fadeUp}`}
              style={{ animationDelay: "0.55s" }}
            >
              Projektiramo, izrađujemo i montiramo kuhinje, ormare i interijere. Složite svoju kuhinju u 3D studiju i
              odmah vidite okvirnu cijenu.
            </p>
            <div className={`mt-8 flex flex-wrap gap-2.5 sm:gap-3 ${s.fadeUp}`} style={{ animationDelay: "0.7s" }}>
              <StudioLaunch variant="accent">Uđi u 3D studio</StudioLaunch>
              <LinkButton href="/radovi" variant="outline">
                Pogledaj radove
              </LinkButton>
            </div>
          </motion.div>

          {live && (
            <motion.div
              style={{ opacity: storyOpacity, y: storyY, visibility: storyVis }}
              className="col-start-1 row-start-1 w-full max-w-[34rem] [will-change:transform,opacity]"
            >
              <PresetStory presets={presets} active={active} progress={scrollYProgress} />
            </motion.div>
          )}
        </div>

        {/* bottom bar: scroll cue + live indicator */}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10">
          <div className="shell flex items-end justify-between gap-6 pb-5 sm:pb-7">
            <motion.div style={live ? { opacity: cueOpacity } : { opacity: 1 }} className="flex items-center gap-3 text-fg/55">
              <span aria-hidden className={`block h-9 w-px bg-white/15 ${s.cue}`} />
              <span className="eyebrow">Listajte</span>
            </motion.div>
            {!still && (
              <div className="text-right">
                <p className="eyebrow flex items-center justify-end gap-2.5 text-fg/80">
                  <span
                    aria-hidden
                    className={`inline-block h-[7px] w-[7px] rounded-full ${live ? `bg-accent ${s.liveDot}` : "bg-fg/30"}`}
                  />
                  {live ? "Uživo 3D" : "Učitavanje 3D prikaza"}
                </p>
                <p className="mt-2 hidden text-[11px] tracking-wide text-mut sm:block">{readout}</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ material story (scroll-synchronised with the engine presets) */

function PresetStory({ presets, active, progress }: { presets: HeroPreset[]; active: number; progress: MotionValue<number> }) {
  const current = presets[Math.min(active, presets.length - 1)];
  return (
    <div>
      <p className="eyebrow flex items-center gap-4 text-accent">
        <span aria-hidden className="h-px w-8 bg-accent/70" />
        Isti prostor, tri izvedbe
      </p>
      <ol className="mt-7 space-y-5">
        {presets.map((p, i) => (
          <PresetRow key={`${p.front}-${p.top}`} preset={p} index={i} on={i === active} progress={progress} />
        ))}
      </ol>
      {current && (
        <div className="mt-9">
          <LinkButton href={current.href} variant="outline" arrow>
            Složite ovu kombinaciju
          </LinkButton>
        </div>
      )}
    </div>
  );
}

function PresetRow({ preset, index, on, progress }: { preset: HeroPreset; index: number; on: boolean; progress: MotionValue<number> }) {
  const [a, b] = PRESET_RANGES[index] ?? [0, 1];
  const bar = useTransform(progress, [a, b], [0, 1]);
  return (
    <li className={`transition-colors duration-700 ease-premium ${on ? "text-fg" : "text-fg/30"}`} aria-current={on ? "true" : undefined}>
      <div className="flex items-center gap-4">
        <span className={`eyebrow w-6 shrink-0 tabular-nums ${on ? "text-accent" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
        <span aria-hidden className="flex shrink-0 -space-x-1.5">
          <span className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ background: preset.frontSwatch }} />
          <span className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ background: preset.topSwatch }} />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-[clamp(22px,2.4vw,34px)] font-medium leading-none tracking-[-0.02em]">
            {preset.frontName}
          </span>
          <span className="mt-1.5 block text-[12px] tracking-wide text-current opacity-70">Radna ploča: {preset.topName}</span>
        </span>
      </div>
      <div className="ml-10 mt-3 h-px bg-white/10">
        <motion.div style={{ scaleX: bar }} className="h-px origin-left bg-accent" />
      </div>
    </li>
  );
}
