"use client";

/**
 * /studio — the full-screen 3D kitchen configurator (customer mode).
 *
 * State lives here (config, step, mood, selection, lead form); the vanilla three.js engine renders
 * behind the UI and is told about every change. The config is mirrored into the URL (?k=…) so any
 * kitchen can be shared or re-opened, and ?front= / ?top= preselect a material.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import { geometryKey, planKitchen, sanitizeConfig, wallsFor } from "@/lib/studio/plan";
import { estimate } from "@/lib/studio/price";
import { configFromQuery, encodeConfig, studioPath } from "@/lib/studio/share";
import { summarize } from "@/lib/studio/summary";
import type { KitchenConfig, Layout, ModuleInfo, Mood } from "@/lib/studio/types";
import { useMediaQuery, useOrigin } from "./hooks";
import { CursorIcon, OrbitIcon } from "./icons";
import { fitToPlanner } from "./limits";
import { EASE, EDITS_RESET_NOTE, LAST_STEP, STEPS, clamp, eur } from "./meta";
import { ModulePopover } from "./ModulePopover";
import { DesktopPanel, MobileSheet, MobileSummary, PANEL_GAP, PANEL_W } from "./Panel";
import { STEP_PANEL_ID, stepTabId } from "./StepNav";
import { StudioLoader } from "./StudioLoader";
import { leadSnapshot, studioSnapshot } from "./snapshot";
import { SuccessOverlay } from "./SuccessOverlay";
import { TOPBAR_H, TopBar } from "./TopBar";
import { useStudioEngine } from "./useStudioEngine";
import { useStudioLead, type LeadField } from "./useStudioLead";
import { ExtrasStep } from "./steps/ExtrasStep";
import { FrontsStep } from "./steps/FrontsStep";
import { SendStep } from "./steps/SendStep";
import { ShapeStep } from "./steps/ShapeStep";
import { TopStep } from "./steps/TopStep";
import type { StepProps } from "./steps/types";
import { WallsStep } from "./steps/WallsStep";

const INSET_DESKTOP = { top: TOPBAR_H.desktop, right: PANEL_W + PANEL_GAP * 2, bottom: 0, left: 0 };
const CAMERA_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"]);

type Insets = { top: number; right: number; bottom: number; left: number };

const hasEdits = (c: KitchenConfig) => Object.keys(c.overrides).length > 0;

/**
 * Element edits are keyed by slot position ("a-base-2"). Once the cabinets are re-planned, the same id points at a
 * different cabinet (the dishwasher's slot can become the sink's), so any geometry change drops them.
 */
function withoutStaleEdits(prev: KitchenConfig, next: KitchenConfig): KitchenConfig {
  return hasEdits(next) && geometryKey(prev) !== geometryKey(next) ? { ...next, overrides: {} } : next;
}

/** drop element edits the plan would not apply (an old or hand-edited link), so the link and the summary stay honest */
function withoutRejectedEdits(c: KitchenConfig): KitchenConfig {
  if (!hasEdits(c)) return c;
  const slots = new Map(planKitchen(c).slots.map((s) => [s.id, s]));
  const kept = Object.entries(c.overrides).filter(([id, type]) => {
    const slot = slots.get(id);
    return Boolean(slot && slot.defaultType !== type && slot.options.includes(type));
  });
  return kept.length === Object.keys(c.overrides).length ? c : { ...c, overrides: Object.fromEntries(kept) };
}

export function Studio() {
  const params = useSearchParams();
  const [initial] = useState(() =>
    withoutRejectedEdits(
      fitToPlanner(
        configFromQuery({
          k: params.get("k"),
          oblik: params.get("oblik"),
          front: params.get("front"),
          top: params.get("top"),
        }),
      ),
    ),
  );
  const [initialKey] = useState(() => encodeConfig(initial));

  const [cfg, setCfg] = useState<KitchenConfig>(initial);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [mood, setMood] = useState<Mood>("day");
  const [selected, setSelected] = useState<ModuleInfo | null>(null);
  const [uiShown, setUiShown] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [hintsGone, setHintsGone] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");
  /** a shape / measurement change just cleared the customer's element edits (shown as a note in the step) */
  const [editsReset, setEditsReset] = useState(false);
  const [seenCfg, setSeenCfg] = useState(cfg);
  if (seenCfg !== cfg) {
    // derived during render (not in an effect) so the note appears in the same frame as the re-planned kitchen
    setSeenCfg(cfg);
    if (hasEdits(seenCfg) && !hasEdits(cfg) && geometryKey(seenCfg) !== geometryKey(cfg)) setEditsReset(true);
    else if (editsReset && hasEdits(cfg)) setEditsReset(false);
  }

  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = Boolean(useReducedMotion());
  const origin = useOrigin();
  const uid = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const engineSel = useRef(false);
  const focusHeading = useRef(false);
  const insetsRef = useRef<Insets>({ top: -1, right: -1, bottom: -1, left: -1 });

  const plan = useMemo(() => planKitchen(cfg), [cfg]);
  const price = useMemo(() => estimate(cfg), [cfg]);
  const summary = useMemo(() => summarize(cfg), [cfg]);
  const stepId = STEPS[step].id;

  /* ---------------------------------------------------------------- engine */

  const handleSelect = useCallback((m: ModuleInfo | null) => {
    engineSel.current = Boolean(m);
    setSelected(m);
    if (m) {
      const name = moduleDef(m.zone, m.type)?.name ?? "element";
      setAnnounce(`Odabran element: ${name}, ${Math.round(m.width)} cm. Izvedbu mijenjate u prozoru za uređivanje.`);
    }
  }, []);

  const { apiRef, status } = useStudioEngine(containerRef, { config: cfg, mood, onSelect: handleSelect });

  /** close the element editor and clear the engine's selection rim */
  const deselect = useCallback((refocusCanvas = false) => {
    setSelected(null);
    if (engineSel.current) apiRef.current?.deselect();
    engineSel.current = false;
    if (refocusCanvas) containerRef.current?.querySelector<HTMLCanvasElement>("canvas")?.focus({ preventScroll: true });
  }, [apiRef]);

  // UI arrives as the intro's camera dolly settles (immediately with reduced motion or without 3D)
  useEffect(() => {
    const delay = status === "loading" ? 15000 : status === "ready" && !reduce ? 3000 : 0;
    const t = window.setTimeout(() => setUiShown(true), delay);
    return () => window.clearTimeout(t);
  }, [status, reduce]);

  // interaction hints fade after the first touch of the canvas (or on their own)
  useEffect(() => {
    if (!uiShown || hintsGone) return;
    const t = window.setTimeout(() => setHintsGone(true), 14000);
    return () => window.clearTimeout(t);
  }, [uiShown, hintsGone]);

  // the popover anchor does not follow the camera: close it whenever the view moves
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let down: { x: number; y: number; t: number; sel: boolean } | null = null;
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now(), sel: engineSel.current };
      setHintsGone(true);
      setSelected(null);
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || !d.sel) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 650;
      // a click is answered by the engine (onSelect); a drag only orbited — drop the stale selection
      if (moved && engineSel.current) deselect();
    };
    const onWheel = () => {
      setHintsGone(true);
      if (engineSel.current) deselect();
    };
    const onKey = (e: KeyboardEvent) => {
      if (CAMERA_KEYS.has(e.key)) setSelected(null);
    };
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("wheel", onWheel, { capture: true, passive: true });
    el.addEventListener("keydown", onKey, true);
    const onResize = () => {
      if (engineSel.current) deselect();
    };
    window.addEventListener("resize", onResize);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("wheel", onWheel, true);
      el.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [deselect]);

  // framing: tell the engine which part of the screen the UI covers
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const apply = (v: Insets) => {
      const p = insetsRef.current;
      if (Math.abs(p.top - v.top) + Math.abs(p.right - v.right) + Math.abs(p.bottom - v.bottom) + Math.abs(p.left - v.left) < 1) return;
      insetsRef.current = v;
      el.style.setProperty("--studio-inset-top", `${v.top}px`);
      el.style.setProperty("--studio-inset-right", `${v.right}px`);
      el.style.setProperty("--studio-inset-bottom", `${v.bottom}px`);
      el.style.setProperty("--studio-inset-left", `${v.left}px`);
      apiRef.current?.resize();
    };
    if (desktop) {
      apply(INSET_DESKTOP);
      return;
    }
    const sheet = sheetRef.current;
    const measure = () => apply({ top: TOPBAR_H.mobile, right: 0, bottom: sheet ? Math.round(sheet.offsetHeight) : 0, left: 0 });
    measure();
    if (!sheet) return;
    // the sheet animates its height when folded — the kitchen glides with it
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [desktop, apiRef]);

  // the engine was created after the insets were set on first mount; re-read them once it's live
  useEffect(() => {
    if (status === "ready") apiRef.current?.resize();
  }, [status, apiRef]);

  // Esc closes the summary
  useEffect(() => {
    if (!summaryOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSummaryOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [summaryOpen]);

  /* ---------------------------------------------------------------- URL */

  useEffect(() => {
    const t = window.setTimeout(() => {
      const key = encodeConfig(cfg);
      if (window.location.search.length <= 1 && key === initialKey) return; // untouched default visit: keep /studio clean
      const next = `${window.location.pathname}?k=${key}`;
      if (`${window.location.pathname}${window.location.search}` !== next) window.history.replaceState(null, "", next);
    }, 450);
    return () => window.clearTimeout(t);
  }, [cfg, initialKey]);

  const getUrl = useCallback(() => `${origin}${studioPath(cfg)}`, [origin, cfg]);

  /* ---------------------------------------------------------------- config */

  const update = useCallback((patch: Partial<KitchenConfig>) => {
    setCfg((c) => withoutStaleEdits(c, fitToPlanner(sanitizeConfig({ ...c, ...patch }))));
  }, []);

  const setLayout = useCallback((layout: Layout) => {
    setCfg((c) => {
      if (c.layout === layout) return c;
      const used = wallsFor(layout);
      const win = c.window && !used.includes(c.window.wall) ? { ...c.window, wall: "a" as const } : c.window;
      // element edits belong to the old shape's slots
      return fitToPlanner(sanitizeConfig({ ...c, layout, window: win, overrides: {} }));
    });
  }, []);

  const pickOverride = useCallback(
    (id: string, type: string) => {
      const slot = plan.slots.find((x) => x.id === id);
      setCfg((c) => {
        const overrides = { ...c.overrides };
        if (slot && slot.defaultType === type) delete overrides[id];
        else overrides[id] = type;
        return sanitizeConfig({ ...c, overrides });
      });
    },
    [plan],
  );

  const resetOverride = useCallback((id: string) => {
    setCfg((c) => {
      if (!(id in c.overrides)) return c;
      const overrides = { ...c.overrides };
      delete overrides[id];
      return sanitizeConfig({ ...c, overrides });
    });
  }, []);

  /* ---------------------------------------------------------------- steps */

  const goTo = (i: number, opts: { focus?: boolean } = {}) => {
    const n = clamp(i, 0, LAST_STEP);
    if (!desktop) setSheetOpen(true);
    if (n === step) return;
    setDir(n > step ? 1 : -1);
    setStep(n);
    setSummaryOpen(false);
    setEditsReset(false);
    focusHeading.current = Boolean(opts.focus);
  };

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [step]);

  const headingRef = useCallback((el: HTMLHeadingElement | null) => {
    if (el && focusHeading.current) {
      focusHeading.current = false;
      el.focus({ preventScroll: true });
    }
  }, []);

  // live snapshot for the "Pošalji" preview
  useEffect(() => {
    if (stepId !== "posalji" || status !== "ready") return;
    let alive = true;
    const t = window.setTimeout(() => {
      void studioSnapshot(apiRef.current, containerRef.current, 720).then((u) => {
        if (alive && u) setPreview(u);
      });
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [stepId, status, cfg, apiRef]);

  /* ---------------------------------------------------------------- lead */

  const fieldId = useCallback((f: LeadField | "timeline" | "hp") => `${uid}-lead-${f}`, [uid]);
  const getPayloadExtras = useCallback(
    () => ({ config: cfg, configUrl: `${origin}${studioPath(cfg)}`, summary, price }),
    [cfg, origin, summary, price],
  );
  const getSnapshot = useCallback(() => leadSnapshot(apiRef.current, containerRef.current), [apiRef]);
  const lead = useStudioLead({ getSnapshot, fieldId, getPayloadExtras });

  /* ---------------------------------------------------------------- announcements */

  useEffect(() => {
    if (!uiShown) return;
    const t = window.setTimeout(() => setAnnounce(`Okvirna cijena od ${eur(price.low)} do ${eur(price.high)} eura.`), 1200);
    return () => window.clearTimeout(t);
  }, [price.low, price.high, uiShown]);

  /* ---------------------------------------------------------------- render */

  const stepProps: StepProps = {
    cfg,
    plan,
    update,
    setLayout,
    goTo: (i) => goTo(i, { focus: true }),
    mood,
    setMood,
    compact: !desktop,
    editsReset,
  };

  const st = STEPS[step];
  const failed = status === "failed";
  const stepLead = failed && st.leadNoImage ? st.leadNoImage : st.lead;
  const content = (
    <div id={STEP_PANEL_ID} role="tabpanel" aria-labelledby={stepTabId(step)}>
      <AnimatePresence mode="wait" initial={false} custom={dir}>
        <motion.div
          key={st.id}
          custom={dir}
          initial={{ opacity: 0, x: reduce ? 0 : dir * 28 }}
          animate={{ opacity: 1, x: 0, transition: { duration: reduce ? 0 : 0.55, ease: EASE } }}
          exit={{ opacity: 0, x: reduce ? 0 : dir * -18, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
        >
          <p className="eyebrow tabular-nums text-mut">
            Korak {String(step + 1).padStart(2, "0")} <span className="text-mut/50">/ {String(STEPS.length).padStart(2, "0")}</span>
          </p>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className={`display mt-3 outline-none ${desktop ? "text-[42px]" : "text-[30px]"}`}
          >
            {st.title}
          </h2>
          <p className={`mt-3 leading-relaxed text-fg/70 ${desktop ? "text-[14px]" : "text-[13px]"}`}>{stepLead}</p>
          <div className={desktop ? "mt-8" : "mt-6"}>
            {st.id === "oblik" && <ShapeStep {...stepProps} />}
            {st.id === "zidovi" && <WallsStep {...stepProps} />}
            {st.id === "fronte" && <FrontsStep {...stepProps} />}
            {st.id === "ploca" && <TopStep {...stepProps} />}
            {st.id === "dodaci" && <ExtrasStep {...stepProps} />}
            {st.id === "posalji" && (
              <SendStep
                {...stepProps}
                lead={lead}
                summary={summary}
                price={price}
                preview={preview}
                noEngine={status === "failed"}
                getUrl={getUrl}
                fieldId={fieldId}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  const shell = {
    step,
    onStep: (i: number) => goTo(i),
    onBack: () => goTo(step - 1, { focus: true }),
    onNext: () => goTo(step + 1, { focus: true }),
    price,
    summary,
    getUrl,
    shown: uiShown,
  };

  const loading = status === "loading" && !uiShown;
  const thanks = lead.status === "success" && lead.sent ? lead.sent : null;

  return (
    <div className="fixed inset-0 overflow-hidden bg-ink text-fg">
      <h1 className="sr-only">3D studio — složite svoju kuhinju po mjeri</h1>

      {/* everything behind the thank-you dialog; `contents` keeps the absolute layout, `inert` takes it out of focus and AT */}
      <div className="contents" inert={Boolean(thanks)}>
        <TopBar
          desktop={desktop}
          step={step}
          mood={mood}
          onMood={setMood}
          controls={uiShown && !failed}
          onSummary={() => {
            deselect();
            setSummaryOpen((o) => !o);
          }}
        />

        {/* the 3D view */}
        <div ref={containerRef} className="absolute inset-0 z-0 bg-[#131315]" />

        {failed && <NoWebGL desktop={desktop} />}

        {/* interaction hints */}
        <AnimatePresence>
          {uiShown && !hintsGone && !failed && !selected && (
            <motion.div
              key="hints"
              aria-hidden="true"
              initial={{ opacity: 0, y: reduce ? 0 : 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.8, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.5 } }}
              className={`pointer-events-none absolute z-10 flex gap-2 ${
                desktop ? "bottom-6 left-8" : "inset-x-0 top-[64px] justify-center"
              }`}
            >
              {desktop ? (
                <>
                  <Hint icon={<OrbitIcon className="h-4 w-4" />}>Povucite za okretanje · kotačić približava</Hint>
                  <Hint icon={<CursorIcon className="h-4 w-4" />}>Kliknite element za izmjenu</Hint>
                </>
              ) : (
                <Hint icon={<CursorIcon className="h-4 w-4" />}>Povucite za okretanje · dodirnite element</Hint>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* element editor */}
        {selected && !failed && (
          <ModulePopover
            key={selected.id}
            info={selected}
            plan={plan}
            desktop={desktop}
            insets={{ top: desktop ? TOPBAR_H.desktop : TOPBAR_H.mobile, right: desktop ? INSET_DESKTOP.right : 0 }}
            canvasRef={containerRef}
            onPick={(type) => pickOverride(selected.id, type)}
            onReset={() => resetOverride(selected.id)}
            onDemo={() => apiRef.current?.demo(selected.id)}
            onClose={deselect}
            price={price}
          />
        )}

        {desktop ? (
          <DesktopPanel {...shell} summaryOpen={summaryOpen} onSummary={setSummaryOpen} scrollRef={scrollRef}>
            {content}
          </DesktopPanel>
        ) : (
          <MobileSheet
            {...shell}
            sheetRef={sheetRef}
            scrollRef={scrollRef}
            open={sheetOpen}
            onOpen={setSheetOpen}
            covered={Boolean(selected) || summaryOpen}
          >
            {content}
          </MobileSheet>
        )}

        <AnimatePresence>
          {!desktop && summaryOpen && <MobileSummary key="summary" summary={summary} price={price} getUrl={getUrl} onClose={() => setSummaryOpen(false)} />}
        </AnimatePresence>

        {/* loading veil */}
        <AnimatePresence>
          {loading && (
            <motion.div
              key="loader"
              className="absolute inset-0 z-50 flex items-center justify-center bg-ink"
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 1.1, ease: EASE } }}
            >
              <StudioLoader />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {thanks && <SuccessOverlay key="success" sent={thanks} getUrl={getUrl} onContinue={lead.dismissSuccess} />}
      </AnimatePresence>

      <p className="sr-only" role="status" aria-live="polite">
        {lead.status === "sending" ? "Šaljem upit…" : lead.status === "invalid" ? "Provjerite označena polja." : announce}
      </p>
      <p className="sr-only" role="status" aria-live="polite">
        {editsReset ? EDITS_RESET_NOTE : ""}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function Hint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/55 px-3.5 py-2 text-[11.5px] text-fg/75 backdrop-blur-md">
      <span className="text-accent">{icon}</span>
      {children}
    </span>
  );
}

function NoWebGL({ desktop }: { desktop: boolean }) {
  return (
    <div
      className="absolute inset-0 z-[1] flex items-start justify-center overflow-hidden bg-ink"
      style={desktop ? { paddingRight: INSET_DESKTOP.right, paddingTop: 140 } : { paddingTop: 96 }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,233,.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,239,233,.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_40%_30%,black,transparent_75%)]"
      />
      <div className="relative max-w-md px-6">
        <p className="eyebrow text-accent">3D prikaz nije dostupan</p>
        <p className="mt-4 font-display text-[clamp(26px,4vw,40px)] font-medium leading-[1.05] tracking-tight">
          Kuhinju i dalje možete složiti i poslati.
        </p>
        <p className="mt-4 text-[14px] leading-relaxed text-mut">
          Ovaj preglednik ili uređaj ne može prikazati 3D (WebGL). Oblik, mjere, materijale i dodatke odaberite u koracima — upit
          stiže do nas jednako, samo bez slike.
        </p>
      </div>
    </div>
  );
}
