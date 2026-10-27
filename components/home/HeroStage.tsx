"use client";

import { motion, useMotionValueEvent, useScroll, useTransform, type MotionValue } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import type { StudioEngineApi } from "@/lib/studio/types";
import { LinkButton } from "@/components/ui/Button";
import { HERO_CONFIG, PRESET_RANGES, engineProgress, heroStart, presetIndexAt, type HeroPreset, type HeroStart } from "./heroConfig";
import { StudioLaunch } from "./StudioLaunch";
import s from "./home.module.css";

const STATIC_STYLE = { opacity: 1, y: 0, visibility: "visible" as const };

/* ------------------------------------------------------------------ environment (hydration-safe) */

const RM = "(prefers-reduced-motion: reduce)";

type NetInfo = {
  saveData?: boolean;
  addEventListener?: (type: string, cb: () => void) => void;
  removeEventListener?: (type: string, cb: () => void) => void;
};
type DeviceNavigator = Navigator & { connection?: NetInfo; deviceMemory?: number };
const connection = (): NetInfo | undefined => (navigator as DeviceNavigator).connection;

/** reduced motion and Save-Data can change while the page is open; the hardware cannot */
function subscribeStart(cb: () => void) {
  const m = window.matchMedia(RM);
  const c = connection();
  m.addEventListener("change", cb);
  c?.addEventListener?.("change", cb);
  return () => {
    m.removeEventListener("change", cb);
    c?.removeEventListener?.("change", cb);
  };
}
const getStart = (): HeroStart => {
  const nav = navigator as DeviceNavigator;
  return heroStart({
    reducedMotion: window.matchMedia(RM).matches,
    saveData: Boolean(connection()?.saveData),
    coarse: window.matchMedia("(pointer: coarse)").matches,
    cores: nav.hardwareConcurrency || undefined,
    memory: nav.deviceMemory,
  });
};
/** the server renders the tall hero the 3D needs; devices that won't start it by themselves shrink it on hydration */
const serverStart = (): HeroStart => "auto";

type IdleWindow = Window & {
  requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/* ------------------------------------------------------------------ hero */

/**
 * Homepage hero: a tall scroll section with a sticky full-screen stage.
 * The live 3D kitchen (lib/studio/engine, showcase mode) assembles itself as an intro; scrolling then turns
 * the camera and cycles three material pairs (engine.setProgress), in both directions.
 * The server-rendered line-drawing `poster` is the first paint, with the text and the rough price beside it; the engine
 * (three.js and the kitchen build — seconds of main-thread work on a phone) is fetched only after the load event and an
 * idle moment, and only while the hero is on screen. Where it does not start by itself (heroStart: weaker phones and
 * tablets, Save-Data) the poster keeps a "Pokrenite 3D" button; with reduced motion, or when WebGL fails, the poster
 * stays and the hero is one screen tall.
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
  /** "Pokrenite 3D" was tapped */
  const [requested, setRequested] = useState(false);

  const start = useSyncExternalStore(subscribeStart, getStart, serverStart);
  const wants3d = start === "auto" || (start === "tap" && requested);
  const still = !wants3d || failed;
  const live = wants3d && ready && !failed;

  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end end"] });

  // mount / dispose the engine (three.js is fetched only here, never on the page's critical path)
  useEffect(() => {
    if (!wants3d) return;
    const el = mountRef.current;
    const section = sectionRef.current;
    if (!el || !section) return;
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

    // tapped "Pokrenite 3D": now. By itself: after the load event, then an idle moment, then once the hero is on screen
    // (a visitor who has already scrolled on gets it when they come back up)
    const w = window as IdleWindow;
    let idle: number | null = null;
    let timer: number | null = null;
    let io: IntersectionObserver | null = null;
    const whenOnScreen = () => {
      io = new IntersectionObserver((entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io?.disconnect();
        io = null;
        void boot();
      });
      io.observe(section);
    };
    const afterLoad = () => {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(whenOnScreen, { timeout: 2000 });
      else timer = window.setTimeout(whenOnScreen, 300);
    };
    if (start !== "auto") void boot();
    else if (document.readyState === "complete") afterLoad();
    else window.addEventListener("load", afterLoad, { once: true });

    return () => {
      cancelled = true;
      window.removeEventListener("load", afterLoad);
      if (idle !== null) w.cancelIdleCallback?.(idle);
      if (timer !== null) window.clearTimeout(timer);
      io?.disconnect();
      if (watchdog !== null) window.clearTimeout(watchdog);
      engine?.dispose();
      engineRef.current = null;
      drivingRef.current = false;
      setReady(false);
    };
  }, [wants3d, start, scrollYProgress]);

  // after "Pokrenite 3D" the hero grows from one screen to its scroll height; framer measures the section only on
  // scroll and resize, so ask it to measure again (otherwise the overlay keeps the one-screen progress until a scroll)
  useEffect(() => {
    if (requested) window.dispatchEvent(new Event("resize"));
  }, [requested]);

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

  /** the swatch chip scrolls the hero to a preset (the scroll drives the engine), roughly into the middle of its range */
  const showPreset = (i: number) => {
    const el = sectionRef.current;
    if (!el) return;
    const travel = el.offsetHeight - window.innerHeight;
    const at = [0, 0.5, 0.85][i] ?? 0;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY + travel * at });
  };

  // beside the poster: the first pair's price (a one-screen hero has no scroll progress); over the live 3D it follows the scroll
  const current = presets[live ? Math.min(active, presets.length - 1) : 0];

  return (
    <section
      ref={sectionRef}
      aria-labelledby="naslovnica-naslov"
      // the header turns light-on-dark over this section and drops its backdrop blur here (blurring a live canvas
      // every frame is costly)
      data-header="dark"
      data-tone="dark"
      className={`relative bg-night text-fg ${still ? "h-[100svh]" : "h-[220vh]"} motion-reduce:h-[100svh]`}
    >
      <div className="sticky top-0 h-[100svh] w-full overflow-hidden">
        {/* poster: line drawing until the first 3D frame (and as the fallback); hidden once faded out so the
            browser stops compositing a full-screen SVG under the canvas */}
        <div
          className={`absolute inset-0 transition-[opacity,visibility] duration-[1600ms] ease-premium ${live ? "invisible opacity-0" : "visible opacity-100"}`}
        >
          {poster}
        </div>

        {/* live 3D — the engine appends its own canvas here (its background is the same #141416) */}
        <div
          ref={mountRef}
          className={`absolute inset-0 transition-opacity duration-[1600ms] ease-premium ${live ? "opacity-100" : "opacity-0"}`}
        />

        {/* static overlay: the warm radial lift and the text-legibility scrims (composited, never repainted) */}
        <div aria-hidden className={`pointer-events-none absolute inset-0 ${s.scrim}`} />

        <div className={`shell relative z-10 grid h-full ${s.heroLayout}`}>
          {/* own compositor layer while scroll-driven: the big headline is rasterised once and only moved/faded,
              instead of being repainted on every scroll frame */}
          <motion.div
            style={live ? { opacity: introOpacity, y: introY, visibility: introVis } : STATIC_STYLE}
            className={`col-start-1 row-start-1 ${s.intro} ${live ? "[will-change:transform,opacity]" : ""}`}
          >
            <p className={`kicker text-accent ${s.fadeUp}`} style={{ animationDelay: "0.05s" }}>
              Kuhinje i namještaj po mjeri
            </p>
            <h1 id="naslovnica-naslov" className={`heading mt-5 ${s.h1}`}>
              {[
                { t: "Kuhinje po mjeri.", accent: false },
                { t: "Bez kompromisa.", accent: true },
              ].map((l, i) => (
                <span key={l.t} className="-my-[0.12em] block overflow-hidden py-[0.12em]">
                  <span className={`${s.rise} ${l.accent ? "text-accent" : ""}`} style={{ animationDelay: `${0.12 + i * 0.1}s` }}>
                    {l.t}
                  </span>
                </span>
              ))}
            </h1>
            <p
              className={`mt-6 max-w-[30rem] text-[15px] leading-relaxed text-fg/70 sm:text-[17px] sm:leading-[1.65] ${s.lead} ${s.fadeUp}`}
              style={{ animationDelay: "0.45s" }}
            >
              Mjerimo, projektiramo u 3D-u, izrađujemo i montiramo kuhinje, ormare i interijere. Složite svoju kuhinju u 3D
              studiju i odmah vidite okvirnu cijenu.
            </p>
            <div className={`mt-8 flex flex-wrap items-center gap-x-5 gap-y-3 ${s.fadeUp}`} style={{ animationDelay: "0.6s" }}>
              <StudioLaunch variant="cream">Složite kuhinju u 3D-u</StudioLaunch>
              {/* phones: an inquiry one tap away (the works are the very next section); larger screens: the works */}
              <LinkButton href="/kontakt#upit" variant="text" arrow className="sm:hidden">
                Pošaljite upit
              </LinkButton>
              <LinkButton href="/radovi" variant="text" arrow className="hidden sm:inline-flex">
                Pogledajte radove
              </LinkButton>
            </div>
            <ul className={`mt-10 grid-cols-3 gap-6 border-t border-white/[0.12] pt-6 ${s.trust} ${s.fadeUp}`} style={{ animationDelay: "0.75s" }}>
              {TRUST.map((t) => (
                <li key={t.text} className="text-[13px] leading-snug text-fg/80">
                  <span aria-hidden className="mb-3 flex h-8 w-8 items-center justify-center rounded-[9px] border border-white/[0.16] text-accent">
                    {t.icon}
                  </span>
                  {t.text}
                </li>
              ))}
            </ul>
          </motion.div>

          {live && (
            <motion.div
              style={{ opacity: storyOpacity, y: storyY, visibility: storyVis }}
              className={`col-start-1 row-start-1 w-full max-w-[30rem] [will-change:transform,opacity] ${s.story}`}
            >
              <PresetStory presets={presets} active={active} progress={scrollYProgress} />
            </motion.div>
          )}
        </div>

        {/* chips: live indicator, the kitchen's rough price (from the first paint, over the poster too), and over the live
            3D the three front finishes — or, where the 3D waits for a tap, the button that starts it */}
        <div className="pointer-events-none absolute inset-0 z-10">
          {!still && (
            <div className={`chip-night flex items-center gap-2.5 px-3.5 py-2.5 text-[12px] ${s.chipLive}`}>
              <span
                aria-hidden
                className={`inline-block h-[7px] w-[7px] shrink-0 rounded-full ${live ? `bg-[#6FB27D] ${s.liveDot}` : "bg-fg/30"}`}
              />
              <span>
                <span className="block font-medium">{live ? "Uživo 3D" : "Učitavanje 3D prikaza"}</span>
                <span className="mt-0.5 block text-[11px] text-fg/55">{readout}</span>
              </span>
            </div>
          )}

          {current && (
            <div className={`chip-night px-3.5 py-2.5 text-right sm:px-4 sm:py-3 ${s.chipPrice}`}>
              <span className={`text-[11px] text-fg/60 ${s.wide}`}>Okvirna cijena</span>
              <span className={`text-[10.5px] text-fg/60 ${s.tall}`}>okvirno, bez aparata</span>
              <span className="mt-0.5 block font-head text-[15px] font-semibold tabular-nums tracking-head-sm text-accent sm:mt-1 sm:text-[17px]">
                {current.price}
              </span>
              <span className={`mt-1 text-[10.5px] text-fg/50 ${s.wide}`}>bez kućanskih aparata</span>
            </div>
          )}

          {start === "tap" && !live && !failed && (
            <button
              type="button"
              onClick={() => setRequested(true)}
              disabled={requested}
              aria-label={requested ? undefined : "Pokrenite 3D prikaz kuhinje"}
              className={`chip-night pointer-events-auto flex min-h-11 items-center gap-2.5 px-3.5 py-2 text-[13px] font-medium transition-colors duration-300 hover:border-white/30 disabled:cursor-progress ${s.chipSwatch}`}
            >
              <svg aria-hidden width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth={1.2} className="text-accent">
                <path d="M9 1.8 15.5 5.5v7L9 16.2 2.5 12.5v-7Z" />
                <path d="M2.5 5.5 9 9.2l6.5-3.7M9 9.2v7" />
              </svg>
              {requested ? <span className={s.loading}>Učitavanje 3D-a</span> : "Pokrenite 3D"}
            </button>
          )}

          {live && current && (
            <div className={`chip-night pointer-events-auto flex items-center gap-3 px-2 py-1.5 sm:px-3.5 sm:py-2.5 ${s.chipSwatch}`}>
              <span className={`pl-1 text-[11px] leading-tight text-fg/60 ${s.wide}`}>
                Fronta
                <span className="block text-[12px] font-medium text-fg">{current.frontName}</span>
              </span>
              <span className="flex items-center gap-1.5" role="group" aria-label="Izvedbe u 3D prikazu">
                {presets.map((p, i) => (
                  <button
                    key={`${p.front}-${p.top}`}
                    type="button"
                    onClick={() => showPreset(i)}
                    aria-pressed={i === active}
                    aria-label={`Prikaži izvedbu ${i + 1}: ${p.frontName}, radna ploča ${p.topName}`}
                    className="flex h-8 w-8 items-center justify-center rounded-full"
                  >
                    <span
                      aria-hidden
                      className={`block h-[22px] w-[22px] rounded-full border border-black/20 transition-[outline-color] duration-300 ${
                        i === active ? "outline outline-[1.5px] outline-offset-2 outline-accent" : "outline outline-[1.5px] outline-offset-2 outline-transparent"
                      }`}
                      style={{ background: p.frontSwatch }}
                    />
                  </button>
                ))}
              </span>
            </div>
          )}
        </div>

        {/* scroll cue */}
        <div className={`pointer-events-none absolute inset-x-0 bottom-0 z-10 ${s.cueBar}`}>
          <div className="shell pb-5 sm:pb-7">
            <motion.div style={live ? { opacity: cueOpacity } : { opacity: 1 }} className="flex items-center gap-3 text-fg/55">
              <span aria-hidden className={`block h-9 w-px bg-white/15 ${s.cue}`} />
              <span className="kicker">Listajte</span>
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ trust row */

const icon = { width: 18, height: 18, viewBox: "0 0 18 18", fill: "none", stroke: "currentColor", strokeWidth: 1.2 } as const;

const TRUST: { text: string; icon: ReactNode }[] = [
  {
    text: "Izmjera na licu mjesta",
    icon: (
      <svg {...icon}>
        <path d="M2 11.5 11.5 2 16 6.5 6.5 16Z" />
        <path d="m5 9.5 1.6 1.6M7.2 7.3l1 1M9.4 5.1l1.6 1.6M11.6 2.9l1 1" />
      </svg>
    ),
  },
  {
    text: "3D projekt prije izrade",
    icon: (
      <svg {...icon}>
        <path d="M9 1.8 15.5 5.5v7L9 16.2 2.5 12.5v-7Z" />
        <path d="M2.5 5.5 9 9.2l6.5-3.7M9 9.2v7" />
      </svg>
    ),
  },
  {
    text: "Izrada i montaža",
    icon: (
      <svg {...icon}>
        <path d="M2 15.5h14M3.5 15.5V6.5h11v9M3.5 10.5h11" />
        <path d="M8 8.5h2M8 12.5h2" />
      </svg>
    ),
  },
];

/* ------------------------------------------------------------------ material story (scroll-synchronised with the engine presets) */

function PresetStory({ presets, active, progress }: { presets: HeroPreset[]; active: number; progress: MotionValue<number> }) {
  const current = presets[Math.min(active, presets.length - 1)];
  return (
    <div>
      <p className="kicker text-accent">Isti prostor, tri izvedbe</p>
      <ol className="mt-7 space-y-5">
        {presets.map((p, i) => (
          <PresetRow key={`${p.front}-${p.top}`} preset={p} index={i} on={i === active} progress={progress} />
        ))}
      </ol>
      {current && (
        <div className="mt-9">
          <LinkButton href={current.href} variant="line-dark" arrow>
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
    // the rows not shown are quieter but still readable (fg/55 ≈ 5.5:1, their second line ≈ 4.7:1 on the charcoal)
    <li className={`transition-colors duration-700 ease-premium ${on ? "text-fg" : "text-fg/55"}`} aria-current={on ? "true" : undefined}>
      <div className="flex items-center gap-4">
        <span className={`w-6 shrink-0 text-[12px] font-medium tabular-nums ${on ? "text-accent" : ""}`}>{String(index + 1).padStart(2, "0")}</span>
        <span aria-hidden className="flex shrink-0 -space-x-1.5">
          <span className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ background: preset.frontSwatch }} />
          <span className="h-5 w-5 rounded-full ring-1 ring-white/20" style={{ background: preset.topSwatch }} />
        </span>
        <span className="min-w-0">
          <span className="heading block text-[clamp(22px,2.2vw,30px)] leading-none">{preset.frontName}</span>
          <span className={`mt-1.5 block text-[12.5px] text-current ${on ? "opacity-70" : "opacity-90"}`}>Radna ploča: {preset.topName}</span>
        </span>
      </div>
      <div className="ml-10 mt-3 h-px bg-white/10">
        <motion.div style={{ scaleX: bar }} className="h-px origin-left bg-accent" />
      </div>
    </li>
  );
}
