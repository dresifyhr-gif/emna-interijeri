"use client";

/**
 * /studio — the full-screen 3D kitchen configurator (customer mode).
 *
 * State lives here (config, step, mood, the selected element, lead form); the vanilla three.js engine renders
 * behind the UI and is told about every change. The config is mirrored into the URL (?k=…, v2 links) so any
 * kitchen can be shared or re-opened, and ?front= / ?top= preselect a material.
 *
 * Element editing goes through lib/studio/edit.ts: every edit returns a new config and the id the element has
 * in the new plan; <Studio> applies it, keeps one undo step per edit and asks the engine to follow the element
 * (EngineApi.select) once the engine has the new config.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import { isEdited, resetAll, resetRun, type EditResult } from "@/lib/studio/edit";
import { geometryKey, planKitchen, sanitizeConfig, wallsFor, type PlanSlot, type RunId } from "@/lib/studio/plan";
import { estimate } from "@/lib/studio/price";
import { configFromQuery, encodeConfig, studioPath } from "@/lib/studio/share";
import { summarize } from "@/lib/studio/summary";
import type { FrontZone, KitchenConfig, Layout, ModuleInfo, Mood, WallId } from "@/lib/studio/types";
import { ElementEditor, type ApplyOptions, type EditNote } from "./ElementEditor";
import { useMediaQuery, useOrigin, useViewport } from "./hooks";
import { CursorIcon, OrbitIcon } from "./icons";
import { fitToPlanner } from "./limits";
import { EASE, LAST_STEP, STEPS, clamp, eur, runName, stepIndex } from "./meta";
import { DesktopPanel, MobileSheet, MobileSummary, PANEL_GAP, PANEL_W } from "./Panel";
import { STEP_PANEL_ID, stepTabId } from "./StepNav";
import { StudioLoader } from "./StudioLoader";
import { leadSnapshot, studioSnapshot } from "./snapshot";
import { SuccessOverlay } from "./SuccessOverlay";
import { TOPBAR_H, TopBar } from "./TopBar";
import { useStudioEngine } from "./useStudioEngine";
import { useStudioLead, type LeadField } from "./useStudioLead";
import { ElementsStep } from "./steps/ElementsStep";
import { FrontsStep } from "./steps/FrontsStep";
import { SendStep } from "./steps/SendStep";
import { ShapeStep } from "./steps/ShapeStep";
import { TopStep } from "./steps/TopStep";
import type { StepProps } from "./steps/types";
import { WallsStep } from "./steps/WallsStep";
import s from "./studio.module.css";

const INSET_DESKTOP = { top: TOPBAR_H.desktop, right: PANEL_W + PANEL_GAP * 2, bottom: 0, left: 0 };
const CAMERA_KEYS = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "+", "=", "-", "_"]);
/** how long the engine may report "nothing selected" while it rebuilds / re-lays out under an edit */
const FOLLOW_MS = 2200;
const UNDO_MAX = 25;

type Insets = { top: number; right: number; bottom: number; left: number };
type Anchor = { x: number; y: number };

/** after an edit: the element the engine should select once it has the new config */
interface Follow {
  id: string | null;
  until: number;
  /** the edit changed the room skeleton (tall column widths): the engine rebuilds ~170 ms later */
  geo: boolean;
  sent: boolean;
}

/** the run a slot id stands on ("a-base-2" → a, "isl-1" → isl; tall ids need the plan) */
function runOfSlot(id: string, slots: PlanSlot[]): RunId | null {
  const m = /^([abc])-/.exec(id);
  if (m) return m[1] as WallId;
  if (id.startsWith("isl-")) return "isl";
  return slots.find((x) => x.id === id)?.run ?? null;
}

export function Studio() {
  const params = useSearchParams();
  // sanitizeConfig (inside configFromQuery) turns v1 element edits into v2 lists; the planner's ranges come on top
  const [initial] = useState(() =>
    fitToPlanner(
      configFromQuery({
        k: params.get("k"),
        oblik: params.get("oblik"),
        front: params.get("front"),
        top: params.get("top"),
      }),
    ),
  );
  const [initialKey] = useState(() => encodeConfig(initial));

  const [cfg, setCfg] = useState<KitchenConfig>(initial);
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [mood, setMood] = useState<Mood>("day");
  const [uiShown, setUiShown] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(true);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [hintsGone, setHintsGone] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [announce, setAnnounce] = useState("");

  // ---- element editing
  const [selId, setSelId] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Anchor | null>(null);
  /** false while the camera moves (the anchor point is stale until the engine reports it again) */
  const [anchorLive, setAnchorLive] = useState(true);
  const [note, setNote] = useState<EditNote | null>(null);
  const [undoStack, setUndoStack] = useState<{ cfg: KitchenConfig; sel: string | null }[]>([]);
  const [editorFocus, setEditorFocus] = useState(0);
  const [runTab, setRunTab] = useState<RunId>("a");
  /** the config before a shape change put edited elements back to the planner's (ShapeStep offers it back) */
  const [layoutUndo, setLayoutUndo] = useState<KitchenConfig | null>(null);

  // ---- colours
  const [twoTone, setTwoTone] = useState(() => Boolean(initial.zoneFronts));
  const [frontZone, setFrontZone] = useState<FrontZone>("base");

  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = Boolean(useReducedMotion());
  const origin = useOrigin();
  const viewport = useViewport();
  const uid = useId();

  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusHeading = useRef(false);
  const insetsRef = useRef<Insets>({ top: -1, right: -1, bottom: -1, left: -1 });
  const follow = useRef<Follow | null>(null);
  /** the slot id last announced / opened, so a refreshed anchor is not announced again */
  const shownId = useRef<string | null>(null);
  const openedFrom = useRef<"canvas" | "list">("canvas");
  const focusSeq = useRef(0);
  const restoreRow = useRef<string | null>(null);
  const selRef = useRef<string | null>(null);
  const slotsRef = useRef<PlanSlot[]>([]);

  const plan = useMemo(() => planKitchen(cfg), [cfg]);
  const price = useMemo(() => estimate(cfg), [cfg]);
  const summary = useMemo(() => summarize(cfg), [cfg]);
  const stepId = STEPS[step].id;
  const selSlot = selId ? (plan.slots.find((x) => x.id === selId) ?? null) : null;

  useEffect(() => {
    selRef.current = selSlot ? selSlot.id : null;
    slotsRef.current = plan.slots;
  });

  /* ---------------------------------------------------------------- engine */

  const handleSelect = useCallback((m: ModuleInfo | null) => {
    const f = follow.current;
    const following = Boolean(f && performance.now() < f.until);
    if (!m) {
      // the engine clears its selection while it rebuilds under an edit — the editor stays
      if (following) return;
      shownId.current = null;
      setSelId(null);
      setAnchor(null);
      setNote(null);
      return;
    }
    setSelId(m.id);
    setAnchor(m.screen);
    setAnchorLive(true);
    if (!following && m.id !== shownId.current) {
      // a new element picked in 3D
      openedFrom.current = "canvas";
      setEditorFocus(0);
      setNote(null);
      const run = runOfSlot(m.id, slotsRef.current);
      if (run) setRunTab(run);
      const name = moduleDef(m.zone, m.type)?.name ?? "element";
      setAnnounce(`Odabran element: ${name}, ${Math.round(m.width)} cm. Uređivanje je otvoreno u ploči s postavkama.`);
    }
    shownId.current = m.id;
  }, []);

  const { apiRef, status } = useStudioEngine(containerRef, { config: cfg, mood, onSelect: handleSelect });
  const readyRef = useRef(false);
  useEffect(() => {
    readyRef.current = status === "ready";
  }, [status]);
  /**
   * ask the engine to select (and report) an element — only once it has built the kitchen: before that it would
   * answer "nothing selected" and close the editor
   */
  const engineSelect = useCallback(
    (id: string | null) => {
      if (readyRef.current) apiRef.current?.select?.(id);
    },
    [apiRef],
  );

  /** close the element editor and clear the engine's selection rim */
  const closeEditor = useCallback(
    (refocus = false) => {
      const id = selRef.current;
      follow.current = null;
      shownId.current = null;
      setSelId(null);
      setAnchor(null);
      setNote(null);
      apiRef.current?.deselect();
      if (!refocus) return;
      if (openedFrom.current === "list" && id) restoreRow.current = id;
      else containerRef.current?.querySelector<HTMLCanvasElement>("canvas")?.focus({ preventScroll: true });
    },
    [apiRef],
  );

  /** open the editor for an element picked in the UI (list, drawing, prev / next) */
  const openElement = useCallback(
    (id: string, opts: { focus?: boolean } = {}) => {
      follow.current = null;
      shownId.current = id;
      if (opts.focus) {
        openedFrom.current = "list";
        focusSeq.current += 1;
        setEditorFocus(focusSeq.current);
      }
      const run = runOfSlot(id, slotsRef.current);
      if (run) setRunTab(run);
      setSelId(id);
      setAnchor(null);
      setNote(null);
      // the engine highlights it and reports its anchor (onSelect)
      engineSelect(id);
    },
    [engineSelect],
  );

  // focus goes back to the list row the editor was opened from (once the steps are interactive again)
  useEffect(() => {
    if (selId || !restoreRow.current) return;
    const id = restoreRow.current;
    restoreRow.current = null;
    const t = window.setTimeout(() => {
      const row = document.querySelector<HTMLElement>(`[data-slot-row="${id}"]`);
      if (row) row.focus({ preventScroll: false });
      else document.getElementById(stepTabId(stepIndex("elementi")))?.focus();
    }, 30);
    return () => window.clearTimeout(t);
  }, [selId]);

  // after an edit, the engine follows the element to its new id (a rebuild takes a moment longer)
  useEffect(() => {
    const f = follow.current;
    if (!f || f.sent) return;
    f.sent = true;
    if (!f.geo) {
      engineSelect(f.id);
      return;
    }
    const t1 = window.setTimeout(() => {
      if (follow.current === f) engineSelect(f.id);
    }, 260);
    // once the re-assembly has played: a fresh anchor
    const t2 = window.setTimeout(() => {
      if (follow.current === f) engineSelect(f.id);
    }, 1750);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [cfg, engineSelect]);

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

  // the anchor point does not follow the camera: hide it while the view moves, ask the engine again once it rests
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    let down: { x: number; y: number; t: number } | null = null;
    let timer = 0;
    const refresh = (ms: number) => {
      window.clearTimeout(timer);
      if (!selRef.current) return;
      setAnchorLive(false);
      timer = window.setTimeout(() => {
        const id = selRef.current;
        if (id) engineSelect(id);
      }, ms);
    };
    const onDown = (e: PointerEvent) => {
      down = { x: e.clientX, y: e.clientY, t: performance.now() };
      setHintsGone(true);
      // the customer takes over: what the engine reports from now on is their click, not an edit settling
      follow.current = null;
      if (selRef.current) setAnchorLive(false);
    };
    const onUp = (e: PointerEvent) => {
      const d = down;
      down = null;
      if (!d || !selRef.current) return;
      const moved = Math.hypot(e.clientX - d.x, e.clientY - d.y) > 6 || performance.now() - d.t > 650;
      // a click is answered by the engine (onSelect); a drag orbited — the damping settles in ~0.6 s
      if (moved) refresh(650);
    };
    const onWheel = () => {
      setHintsGone(true);
      refresh(450);
    };
    const onKey = (e: KeyboardEvent) => {
      if (CAMERA_KEYS.has(e.key)) refresh(520);
    };
    const onResize = () => refresh(320);
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("pointerup", onUp, true);
    el.addEventListener("wheel", onWheel, { capture: true, passive: true });
    el.addEventListener("keydown", onKey, true);
    window.addEventListener("resize", onResize);
    return () => {
      window.clearTimeout(timer);
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("pointerup", onUp, true);
      el.removeEventListener("wheel", onWheel, true);
      el.removeEventListener("keydown", onKey, true);
      window.removeEventListener("resize", onResize);
    };
  }, [engineSelect]);

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
    // the sheet animates its height when folded (and when the editor opens) — the kitchen glides with it,
    // and the selected element's point is asked for again once the sheet has settled
    let settle = 0;
    const ro = new ResizeObserver(() => {
      measure();
      if (!selRef.current) return;
      setAnchorLive(false);
      window.clearTimeout(settle);
      settle = window.setTimeout(() => {
        const id = selRef.current;
        if (id) engineSelect(id);
      }, 140);
    });
    ro.observe(sheet);
    return () => {
      window.clearTimeout(settle);
      ro.disconnect();
    };
  }, [desktop, apiRef, engineSelect]);

  // the engine was created after the insets were set on first mount; re-read them once it's live
  useEffect(() => {
    if (status !== "ready") return;
    apiRef.current?.resize();
    // an element opened from the list while the 3D view was still loading
    const id = selRef.current;
    if (id) apiRef.current?.select?.(id);
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

  /** a change from the steps (walls, materials, details): element edits stay, the undo steps go */
  const update = useCallback((patch: Partial<KitchenConfig>) => {
    setCfg((c) => fitToPlanner(sanitizeConfig({ ...c, ...patch })));
    setUndoStack((u) => (u.length ? [] : u));
    setLayoutUndo(null);
  }, []);

  const setLayout = useCallback(
    (layout: Layout) => {
      if (cfg.layout === layout) return;
      const used = wallsFor(layout);
      const win = cfg.window && !used.includes(cfg.window.wall) ? { ...cfg.window, wall: "a" as const } : cfg.window;
      // edited runs and corners belong to the old shape's walls
      const next = fitToPlanner(resetAll({ ...cfg, layout, window: win }));
      // the last shape that had edited elements can be brought back from the "Oblik" step
      setLayoutUndo(isEdited(cfg) ? cfg : layoutUndo);
      setCfg(next);
      setUndoStack([]);
      setRunTab("a");
      closeEditor();
    },
    [cfg, layoutUndo, closeEditor],
  );

  const undoLayout = useCallback(() => {
    if (!layoutUndo) return;
    setCfg(layoutUndo);
    setLayoutUndo(null);
    setAnnounce("Vraćen je prethodni oblik s vašim elementima.");
  }, [layoutUndo]);

  /** apply an edit.ts result: one undo step, follow the element, say what happened */
  const applyEdit = useCallback(
    (r: EditResult, opts: ApplyOptions = {}): boolean => {
      if (!r.ok) {
        const text = r.warning || "Ta izmjena ovdje nije moguća.";
        setNote({ text, tone: "refused", n: performance.now() });
        return false;
      }
      const nextSel = opts.select !== undefined ? opts.select : r.slotId;
      const next = fitToPlanner(r.cfg);
      setUndoStack((u) => [...u.slice(-(UNDO_MAX - 1)), { cfg, sel: selId }]);
      follow.current = { id: nextSel, until: performance.now() + FOLLOW_MS, geo: geometryKey(cfg) !== geometryKey(next), sent: false };
      shownId.current = nextSel;
      setLayoutUndo(null);
      setCfg(next);
      setSelId(nextSel);
      if (!nextSel) setAnchor(null);
      setNote(r.warning ? { text: r.warning, tone: "info", n: performance.now() } : null);
      // the editor's own note region reads out r.warning
      setAnnounce(opts.say ?? "");
      return true;
    },
    [cfg, selId],
  );

  const undo = useCallback(() => {
    const last = undoStack[undoStack.length - 1];
    if (!last) return;
    setUndoStack(undoStack.slice(0, -1));
    const sel = last.sel && planKitchen(last.cfg).slots.some((x) => x.id === last.sel) ? last.sel : null;
    follow.current = { id: sel, until: performance.now() + FOLLOW_MS, geo: geometryKey(cfg) !== geometryKey(last.cfg), sent: false };
    shownId.current = sel;
    setCfg(last.cfg);
    setSelId(sel);
    if (!sel) setAnchor(null);
    setNote({ text: "Zadnja izmjena je poništena.", tone: "info", n: performance.now() });
    setAnnounce("Zadnja izmjena je poništena.");
  }, [undoStack, cfg]);

  /** a run back to the planner: a wall (base, wall units and, on wall A, the corners), the island or the tall column */
  const resetRunTo = useCallback(
    (run: RunId | "tall") => {
      let r: EditResult = resetRun(cfg, run);
      if (run === "a" && r.cfg.corners) {
        const c = { ...r.cfg };
        delete c.corners;
        r = { ...r, cfg: sanitizeConfig(c) };
      }
      // keep the editor on whatever now stands at the same place
      const keep = selId && planKitchen(r.cfg).slots.some((x) => x.id === selId) ? selId : null;
      const label = run === "tall" ? "Visoki stup" : run === "isl" ? "Otok" : runName(run);
      applyEdit(r, { select: keep, say: `${label}: vraćen zadani raspored.` });
    },
    [cfg, selId, applyEdit],
  );

  const resetEverything = useCallback(() => {
    const keep = selId && planKitchen(resetAll(cfg)).slots.some((x) => x.id === selId) ? selId : null;
    applyEdit({ cfg: resetAll(cfg), ok: true, warning: null, slotId: keep }, { say: "Svi elementi vraćeni su na zadani raspored." });
  }, [cfg, selId, applyEdit]);

  /* ---------------------------------------------------------------- steps */

  const goTo = (i: number, opts: { focus?: boolean } = {}) => {
    const n = clamp(i, 0, LAST_STEP);
    if (!desktop) setSheetOpen(true);
    if (selId) closeEditor();
    if (n === step) return;
    setDir(n > step ? 1 : -1);
    setStep(n);
    setSummaryOpen(false);
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
    () => ({ config: sanitizeConfig(cfg), configUrl: `${origin}${studioPath(cfg)}`, summary, price }),
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

  const failed = status === "failed";
  const stepProps: StepProps = {
    cfg,
    plan,
    update,
    setLayout,
    goTo: (i) => goTo(i, { focus: true }),
    mood,
    setMood,
    compact: !desktop,
    engine: !failed,
  };

  const st = STEPS[step];
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
            {st.id === "oblik" && <ShapeStep {...stepProps} onUndoLayout={layoutUndo ? undoLayout : null} />}
            {st.id === "zidovi" && <WallsStep {...stepProps} />}
            {st.id === "elementi" && (
              <ElementsStep
                {...stepProps}
                elements={{
                  selectedId: selSlot?.id ?? null,
                  onOpen: (id) => openElement(id, { focus: true }),
                  runTab,
                  onRunTab: setRunTab,
                  onReset: resetRunTo,
                  onResetAll: resetEverything,
                }}
              />
            )}
            {st.id === "boje" && (
              <FrontsStep {...stepProps} fronts={{ twoTone, setTwoTone, zone: frontZone, setZone: setFrontZone }} />
            )}
            {st.id === "ploca" && <TopStep {...stepProps} />}
            {st.id === "posalji" && (
              <SendStep
                {...stepProps}
                lead={lead}
                summary={summary}
                price={price}
                preview={preview}
                noEngine={failed}
                getUrl={getUrl}
                fieldId={fieldId}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  const editor = selSlot ? (
    <ElementEditor
      cfg={cfg}
      plan={plan}
      slotId={selSlot.id}
      desktop={desktop}
      engine={!failed && status === "ready"}
      note={note}
      focusKey={editorFocus}
      price={price}
      onEdit={applyEdit}
      onNavigate={(id) => openElement(id)}
      onDemo={() => apiRef.current?.demo(selSlot.id)}
      onResetRun={(sl) => resetRunTo(sl.zone === "tall" ? "tall" : sl.run)}
      onUndo={undoStack.length ? undo : null}
      onClose={() => closeEditor(true)}
    />
  ) : null;

  const shell = {
    step,
    onStep: (i: number) => goTo(i),
    onBack: () => goTo(step - 1, { focus: true }),
    onNext: () => goTo(step + 1, { focus: true }),
    price,
    summary,
    getUrl,
    shown: uiShown,
    overlay: editor,
  };

  const loading = status === "loading" && !uiShown;
  const thanks = lead.status === "success" && lead.sent ? lead.sent : null;

  // where the anchor of the selected element is drawn (desktop: a leader line to the panel's edge)
  const showAnchor = Boolean(selSlot && anchor && anchorLive && !failed && uiShown);
  const panelLeft = viewport.w - PANEL_GAP - PANEL_W;

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
            if (selId) closeEditor();
            setSummaryOpen((o) => !o);
          }}
        />

        {/* the 3D view */}
        <div ref={containerRef} className="absolute inset-0 z-0 bg-[#131315]" />

        {failed && <NoWebGL desktop={desktop} />}

        {/* interaction hints */}
        <AnimatePresence>
          {uiShown && !hintsGone && !failed && !selSlot && (
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

        {/* the selected element in 3D: a pulsing point, and on desktop a leader line to the editor */}
        <AnimatePresence>
          {showAnchor && anchor && (
            <motion.div
              key="anchor"
              aria-hidden="true"
              // phone: under the sheet, so a point behind it stays hidden
              className={`pointer-events-none absolute inset-0 ${desktop ? "z-30" : "z-[15]"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
            >
              {desktop && anchor.x < panelLeft - 24 && (
                <svg className="absolute inset-0 h-full w-full overflow-visible">
                  <line
                    x1={anchor.x}
                    y1={anchor.y}
                    x2={panelLeft}
                    y2={clamp(anchor.y, 120, viewport.h - 120)}
                    stroke="#C9B99A"
                    strokeWidth="1"
                    strokeOpacity="0.75"
                    strokeDasharray="2 4"
                  />
                  <circle cx={panelLeft} cy={clamp(anchor.y, 120, viewport.h - 120)} r="2.5" fill="#C9B99A" />
                </svg>
              )}
              <span className="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2" style={{ left: anchor.x, top: anchor.y }}>
                <span className={s.pulse} />
                <span className="absolute inset-0 rounded-full border border-accent bg-ink/60" />
                <span className="absolute inset-[3.5px] rounded-full bg-accent" />
              </span>
            </motion.div>
          )}
        </AnimatePresence>

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
            covered={summaryOpen}
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
          Ovaj preglednik ili uređaj ne može prikazati 3D (WebGL). Oblik, mjere, elemente, boje i detalje odaberite u
          koracima — upit stiže do nas jednako, samo bez slike.
        </p>
      </div>
    </div>
  );
}
