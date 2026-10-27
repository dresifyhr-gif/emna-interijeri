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
 *
 * Editing on the kitchen itself — a click does the obvious thing: an element selects it and shows the element toolbar
 * over it (ElementToolbar — add left / right, width, replace, remove, mechanism, "Više" for the full ElementEditor in the
 * panel); a dimension label opens the length editor there (DimEditor — the room's wall, or the kitchen run on it, or the
 * island); a "+" (GapLayer: in every step, quiet outside "Elementi"; every full row has one between two elements, where
 * neighbours get narrower or the new element takes one's place — only in "Elementi" / while editing) opens the add
 * picker (AddPicker, tall units wherever one can stand in a wall's base row); a wall or the floor, when nothing else is
 * hit and nothing was open, opens its finishes (SurfacePicker). "Zamijeni" turns a base cabinet or a wall unit into a
 * tall unit (both go — asked first when that takes another element away). A tall column is an element like any other
 * (no "Visoki stup" switch): a "+" or "Zamijeni" adds one, "Ukloni" on one of its units offers the whole column too.
 * Those edits say what they did in a toast with "Poništi" (Ctrl / ⌘ + Z works too; on a phone one line, the planner's
 * note behind "Detalji"). Rows of the "Elementi" list light
 * their element up in 3D. Overlays follow the view through the engine's ViewInfo (overlay.ts) and never make the engine
 * render.
 *
 * "3D | Tlocrt | Nacrt" (ViewSwitch, top-left of the kitchen view; remembered for the visit, viewMode.ts): the 2D views
 * (PlanView) draw the floor plan or a wall's elevation in the 3D view's place — the same drawings as the PDF, live with
 * every edit. A click there selects an element exactly like a click in 3D (the toolbar over it, the editor in the panel),
 * the "+" stand at the drawing's empty places; the overlays read the drawing's ViewInfo from a ViewHub instead of the
 * engine's. Meanwhile the engine keeps its kitchen but renders nothing: its canvas is moved out of view (its own
 * IntersectionObserver pauses the render loop) and comes back, rendering again, with "3D". Without WebGL the 2D views
 * still work. In 3D the switch's second row says where the camera stands ("3D studio", "Iz prostorije" — the room's
 * entrance at eye level, "Frontalno", "Odozgo": engine setView, remembered for the visit) and, under the ceiling, shows the
 * room's ceiling with its light ("Strop": KitchenConfig.room.ceiling / lamp, an undo step).
 *
 * "Jednostavno / Napredno" (the step header; remembered, hooks.ts StudioMode) leaves the finer controls out for
 * customers by default. A first visit gets three skippable coach marks (CoachMarks; on a phone on the step sheet, never
 * over the 3D view).
 *
 * The kitchen-wide options are in the steps — "Boje": how the fronts open (Ručke / Na dodir / Gola / Luft za prste) and
 * the glass of vitrines; "Ploča i detalji": worktop thickness, the wall behind the worktop, the hood, rails; "Zidovi": the
 * depth of the "do stropa" top row. An element's own (its glass, opening, top-box depth, a hob's hood, shelves, end units at
 * a free end of the run) are in the element editor ("Više" in the toolbar — ElementOptions).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import { isEdited, remove, removeColumn, resetAll, resetRun, setRoomCeiling, slotEditInfo, type EditResult, type RunRef } from "@/lib/studio/edit";
import { geometryKey, planKitchen, sanitizeConfig, wallsFor, type PlanSlot, type RunId } from "@/lib/studio/plan";
import { estimate } from "@/lib/studio/price";
import { configFromQuery, encodeConfig, studioPath } from "@/lib/studio/share";
import { summarize } from "@/lib/studio/summary";
import type { DimLabelTarget, FrontZone, KitchenConfig, Layout, ModuleInfo, Mood, ScreenRect, SurfaceHit, ViewPreset, WallId } from "@/lib/studio/types";
import { DimEditor, type DimTargetState } from "./DimEditor";
import { GapLayer } from "./GapLayer";
import { ElementEditor, type ApplyOptions, type EditNote } from "./ElementEditor";
import { ElementToolbar, SelectionLeader } from "./ElementToolbar";
import { CoachMarks } from "./CoachMarks";
import { readCoach, setCoach, setStudioMode, useCoach, useMediaQuery, useOrigin, useStudioMode, useViewport } from "./hooks";
import { OrbitIcon, PlanIcon, Spinner } from "./icons";
import { fitToPlanner } from "./limits";
import { EASE, LAST_STEP, STEPS, clamp, columnSlots, eur, islandWord, resetTarget, runName, stepIndex } from "./meta";
import { cameraPresetDef } from "./optionsModel";
import { isTyping, type Insets, type ViewSource } from "./overlay";
import { DesktopPanel, MobileSheet, MobileSummary, PANEL_GAP, PANEL_W } from "./Panel";
import { PlanView } from "./PlanView";
import { usePdfExport } from "./PdfExport";
import { Segmented } from "./controls";
import { STEP_PANEL_ID, stepTabId } from "./StepNav";
import { StudioLoader } from "./StudioLoader";
import { leadSnapshot, studioSnapshot } from "./snapshot";
import s from "./studio.module.css";
import { SurfacePicker, type SurfaceTarget } from "./SurfacePicker";
import { SuccessOverlay } from "./SuccessOverlay";
import { TOPBAR_H, TopBar } from "./TopBar";
import { useStudioEngine } from "./useStudioEngine";
import { useStudioLead, type LeadField } from "./useStudioLead";
import { Toast, type ToastData } from "./Toast";
import { ElementsStep } from "./steps/ElementsStep";
import { FrontsStep } from "./steps/FrontsStep";
import { SendStep } from "./steps/SendStep";
import { ShapeStep } from "./steps/ShapeStep";
import { TopStep } from "./steps/TopStep";
import type { StepEditOptions, StepProps } from "./steps/types";
import { WallsStep } from "./steps/WallsStep";
import {
  createViewHub,
  readStudioView,
  setCameraPreset,
  setNacrtPick,
  setStudioView,
  useCameraPreset,
  useNacrtPick,
  useStudioView,
  viewDockHeight,
  type NacrtPick,
  type StudioView,
} from "./viewMode";
import { ViewSwitch } from "./ViewSwitch";

const INSET_DESKTOP = { top: TOPBAR_H.desktop, right: PANEL_W + PANEL_GAP * 2, bottom: 0, left: 0 };
/** how long the engine may report "nothing selected" while it rebuilds / re-lays out under an edit */
const FOLLOW_MS = 2200;
const UNDO_MAX = 25;
/** edits of one continuous control (ApplyOptions.coalesce) closer together than this share one undo step */
const COALESCE_MS = 1500;
/** toasts: an edit with "Poništi" (spec: 3 s), one with a planner note, a refusal, a confirmation */
const TOAST_MS = { undo: 3000, note: 6500, refused: 5000, done: 2000 } as const;

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const slotName = (sl: PlanSlot) => {
  const def = moduleDef(sl.zone, sl.type);
  return sl.corner && def && !def.corner ? `Kutni element: ${lower(def.name)}` : (def?.name ?? "element");
};

/** one undo step: the config (and selection) before an edit */
interface UndoEntry {
  id: number;
  cfg: KitchenConfig;
  sel: string | null;
  /** ApplyOptions.coalesce of the edit, and when the last edit of that series happened */
  key?: string;
  t: number;
}

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
  /** the full element editor is open in the panel (a click in 3D only selects: the toolbar shows over the element) */
  const [editorOpen, setEditorOpen] = useState(false);
  const [note, setNote] = useState<EditNote | null>(null);
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [editorFocus, setEditorFocus] = useState(0);
  const [toast, setToast] = useState<ToastData | null>(null);
  /** the length editor at a dimension label (the room's wall, the kitchen run on it, the island) */
  const [dimEdit, setDimEdit] = useState<DimTargetState | null>(null);
  /** the "+" whose add picker is open */
  const [gapOpen, setGapOpen] = useState<string | null>(null);
  /** the finishes popover of a clicked wall / the floor */
  const [surface, setSurface] = useState<SurfaceTarget | null>(null);
  const [runTab, setRunTab] = useState<RunId>("a");
  /** the config before a shape change put edited elements back to the planner's (ShapeStep offers it back) */
  const [layoutUndo, setLayoutUndo] = useState<KitchenConfig | null>(null);

  // ---- 3D / 2D
  const view = useStudioView();
  const nacrtPick = useNacrtPick();
  /** where the 3D camera stands ("3D studio", "Iz prostorije", "Frontalno", "Odozgo" — remembered for the visit) */
  const camera = useCameraPreset();
  /** phone: the camera presets row is open under the view switch (the 3D view is short there; a desktop always shows it) */
  const [cameraOpen, setCameraOpen] = useState(false);
  /** the 2D view's ViewInfo for the overlays (PlanView publishes, they subscribe like to the engine) */
  const [hub] = useState(createViewHub);
  const hubRef = useRef<ViewSource | null>(hub);
  const flat = view !== "3d";
  /**
   * the studio opens in a 2D view (remembered for the visit): the engine waits until the drawing is on screen (or a few
   * seconds), so its heavy first steps do not hold the drawing back; "3D" releases it at once. Read straight from storage
   * (the hydrating render still sees "3d"); never rendered, so server and client may differ.
   */
  const [engineHeld, setEngineHeld] = useState(() => typeof window !== "undefined" && readStudioView() !== "3d");

  // ---- colours
  const [twoTone, setTwoTone] = useState(() => Boolean(initial.zoneFronts));
  const [frontZone, setFrontZone] = useState<FrontZone>("base");

  const desktop = useMediaQuery("(min-width: 1024px)");
  const reduce = Boolean(useReducedMotion());
  const origin = useOrigin();
  const viewport = useViewport();
  const uid = useId();

  const rootRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const focusHeading = useRef(false);
  const insetsRef = useRef<Insets>({ top: -1, right: -1, bottom: -1, left: -1 });
  const follow = useRef<Follow | null>(null);
  /** the slot id last announced / opened, so the engine re-reporting it (after an edit) is not announced again */
  const shownId = useRef<string | null>(null);
  const openedFrom = useRef<"canvas" | "list">("canvas");
  const focusSeq = useRef(0);
  const restoreRow = useRef<string | null>(null);
  const selRef = useRef<string | null>(null);
  /** a 2D view is shown (keyboard focus goes to the drawing, not to the 3D canvas) */
  const flatRef = useRef(false);
  const slotsRef = useRef<PlanSlot[]>([]);
  const undoSeq = useRef(0);
  const toastSeq = useRef(0);
  /** what had focus when the wall-length editor opened (its label), to go back to on Escape */
  const dimOpener = useRef<HTMLElement | null>(null);
  const surfaceSeq = useRef(0);
  /**
   * the 3D view was pressed while something was selected or open (the press closes that): the click that follows is
   * not a wall / floor pick
   */
  const busyPress = useRef(false);
  /** an overlay of the 3D view is open (dimension editor, add picker) — read at the moment of a press */
  const overlayRef = useRef(false);
  /** the latest handlers for listeners registered once */
  const keys = useRef<{ remove: () => void; undo: (() => void) | null }>({ remove: () => {}, undo: null });

  const plan = useMemo(() => planKitchen(cfg), [cfg]);
  const price = useMemo(() => estimate(cfg), [cfg]);
  const summary = useMemo(() => summarize(cfg), [cfg]);
  const stepId = STEPS[step].id;
  const selSlot = selId ? (plan.slots.find((x) => x.id === selId) ?? null) : null;
  const selKey = selSlot?.id ?? null;
  // what the selected element can do (every option planned) — shared by the toolbar and the editor
  const selInfo = useMemo(() => (selKey ? slotEditInfo(cfg, selKey) : null), [cfg, selKey]);
  const coach = useCoach();
  const studioMode = useStudioMode();
  const advanced = studioMode === "advanced";
  const touch = useMediaQuery("(hover: none)");

  useEffect(() => {
    selRef.current = selSlot ? selSlot.id : null;
    flatRef.current = flat;
    slotsRef.current = plan.slots;
    overlayRef.current = Boolean(dimEdit || gapOpen);
  });

  /* ---------------------------------------------------------------- engine */

  const handleSelect = useCallback((m: ModuleInfo | null) => {
    const f = follow.current;
    const following = Boolean(f && performance.now() < f.until);
    if (!m) {
      // the engine clears its selection while it rebuilds under an edit — the toolbar and the editor stay
      if (following) return;
      shownId.current = null;
      setSelId(null);
      setEditorOpen(false);
      setNote(null);
      return;
    }
    setSelId(m.id);
    if (!following && m.id !== shownId.current) {
      // a new element picked in 3D: the toolbar shows over it (an open editor follows it)
      openedFrom.current = "canvas";
      setEditorFocus(0);
      setNote(null);
      // the first coach mark ("Kliknite element") is done
      if (readCoach() === "0") setCoach("1");
      const run = runOfSlot(m.id, slotsRef.current);
      if (run) setRunTab(run);
      const name = moduleDef(m.zone, m.type)?.name ?? "element";
      setAnnounce(`Odabran element: ${name}, ${Math.round(m.width)} cm. Brze radnje su iznad elementa (tipka Tab), Delete ga uklanja.`);
    }
    shownId.current = m.id;
  }, []);

  /** a dimension label in 3D was clicked: the length editor opens there */
  const handleDimLabel = useCallback((target: DimLabelTarget, rect: ScreenRect) => {
    if (readCoach() === "2") setCoach("done");
    setHintsGone(true);
    const a = document.activeElement;
    dimOpener.current = a instanceof HTMLElement && a !== document.body ? a : null;
    setGapOpen(null);
    setSurface(null);
    setDimEdit({ target, rect, n: performance.now() });
  }, []);

  /** a wall or the floor was clicked (nothing selected or open before the press): its finishes open there */
  const handleSurface = useCallback((hit: SurfaceHit) => {
    if (busyPress.current) return;
    surfaceSeq.current += 1;
    setSurface({ hit, n: surfaceSeq.current });
    setAnnounce(hit.surface === "wall" && hit.wall ? `Zid ${hit.wall.toUpperCase()}: odaberite boju ili oblogu.` : "Pod: odaberite pod.");
  }, []);

  const { apiRef, status } = useStudioEngine(containerRef, {
    config: cfg,
    mood,
    onSelect: handleSelect,
    onDimLabel: handleDimLabel,
    onSurfaceClick: handleSurface,
    camera,
    start: !engineHeld,
  });
  useEffect(() => {
    if (!engineHeld) return;
    const t = window.setTimeout(() => setEngineHeld(false), 4000);
    return () => window.clearTimeout(t);
  }, [engineHeld]);
  const releaseEngine = useCallback(() => setEngineHeld(false), []);
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

  const focusCanvas = useCallback(() => {
    if (flatRef.current) hub.focus();
    else containerRef.current?.querySelector<HTMLCanvasElement>("canvas")?.focus({ preventScroll: true });
  }, [hub]);

  /** close the element editor and the toolbar, and clear the engine's selection rim */
  const closeEditor = useCallback(
    (refocus = false) => {
      const id = selRef.current;
      follow.current = null;
      shownId.current = null;
      setSelId(null);
      setEditorOpen(false);
      setNote(null);
      apiRef.current?.deselect();
      if (!refocus) return;
      if (openedFrom.current === "list" && id) restoreRow.current = id;
      else focusCanvas();
    },
    [apiRef, focusCanvas],
  );

  /**
   * select an element picked in the UI (list, drawing, prev / next, the toolbar's arrow keys); `editor` opens the
   * full editor, `focus` also moves focus into it (opened from the list)
   */
  const openElement = useCallback(
    (id: string, opts: { focus?: boolean; editor?: boolean; say?: boolean } = {}) => {
      follow.current = null;
      shownId.current = id;
      if (opts.focus) {
        openedFrom.current = "list";
        focusSeq.current += 1;
        setEditorFocus(focusSeq.current);
      }
      const run = runOfSlot(id, slotsRef.current);
      if (run) setRunTab(run);
      // the first coach mark ("Kliknite element") is done — picked from the "Elementi" list or the drawing too
      if (readCoach() === "0") setCoach("1");
      setSelId(id);
      if (opts.editor) setEditorOpen(true);
      setNote(null);
      apiRef.current?.highlight?.(null);
      if (opts.say) {
        const sl = slotsRef.current.find((x) => x.id === id);
        if (sl) setAnnounce(`Odabran element: ${slotName(sl)}, ${Math.round(sl.width)} cm.`);
      }
      // the engine highlights it and the toolbar follows it (ViewInfo)
      engineSelect(id);
    },
    [engineSelect, apiRef],
  );

  /** "Više" in the toolbar: the full editor in the panel (again: closed, the toolbar stays) */
  const toggleDetails = useCallback(() => {
    if (editorOpen) {
      setEditorOpen(false);
      setNote(null);
      return;
    }
    openedFrom.current = "canvas";
    focusSeq.current += 1;
    setEditorFocus(focusSeq.current);
    setEditorOpen(true);
  }, [editorOpen]);

  /** a row / the drawing of the "Elementi" step is pointed at: light the element up in 3D */
  const hoverElement = useCallback(
    (id: string | null) => {
      if (readyRef.current) apiRef.current?.highlight?.(id);
      hub.highlight(id);
    },
    [apiRef, hub],
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
    // once the re-assembly has played: once more (the rebuild may have cleared the selection again)
    const t2 = window.setTimeout(() => {
      if (follow.current === f) engineSelect(f.id);
    }, 1750);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [cfg, engineSelect]);

  // UI arrives as the intro's camera dolly settles (immediately with reduced motion, without 3D, or in a 2D view — the
  // engine does not render while it is out of view, so it would never get "ready")
  useEffect(() => {
    const delay = flat ? 0 : status === "loading" ? 15000 : status === "ready" && !reduce ? 3000 : 0;
    const t = window.setTimeout(() => setUiShown(true), delay);
    return () => window.clearTimeout(t);
  }, [status, reduce, flat]);

  // interaction hints fade after the first touch of the canvas (or on their own)
  useEffect(() => {
    if (!uiShown || hintsGone) return;
    const t = window.setTimeout(() => setHintsGone(true), 14000);
    return () => window.clearTimeout(t);
  }, [uiShown, hintsGone]);

  // the first touch of the 3D view hides the orbit hint; the customer takes over from an edit settling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const onDown = () => {
      setHintsGone(true);
      // what the engine reports from now on is their click, not an edit settling
      follow.current = null;
      // a press that closes a selection or an overlay is not also a wall / floor pick
      busyPress.current = Boolean(selRef.current || overlayRef.current);
    };
    const onWheel = () => setHintsGone(true);
    // with an element selected: Delete removes it, Tab goes straight to its toolbar (past the wall labels)
    const onKey = (e: KeyboardEvent) => {
      const onCanvas = (e.target as HTMLElement | null)?.tagName === "CANVAS";
      if (!selRef.current || !onCanvas || e.altKey || e.metaKey || e.ctrlKey) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        e.stopPropagation();
        keys.current.remove();
      } else if (e.key === "Tab" && !e.shiftKey) {
        const bar = document.querySelector<HTMLElement>("[data-studio-toolbar]");
        const first = bar && !bar.inert ? bar.querySelector<HTMLElement>("button") : null;
        if (first) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    el.addEventListener("pointerdown", onDown, true);
    el.addEventListener("wheel", onWheel, { capture: true, passive: true });
    el.addEventListener("keydown", onKey, true);
    return () => {
      el.removeEventListener("pointerdown", onDown, true);
      el.removeEventListener("wheel", onWheel, true);
      el.removeEventListener("keydown", onKey, true);
    };
  }, []);

  // Ctrl / ⌘ + Z undoes the last edit (outside text fields) — the toast's "Poništi" without the timer
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z" || isTyping(e.target)) return;
      const fn = keys.current.undo;
      if (!fn) return;
      e.preventDefault();
      fn();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  // framing: tell the engine which part of the screen the UI covers (set on the root: the overlays read them too)
  useEffect(() => {
    const el = rootRef.current;
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
      hub.resize();
    };
    if (desktop) {
      apply(INSET_DESKTOP);
      return;
    }
    const sheet = sheetRef.current;
    const measure = () => apply({ top: TOPBAR_H.mobile, right: 0, bottom: sheet ? Math.round(sheet.offsetHeight) : 0, left: 0 });
    measure();
    if (!sheet) return;
    // the sheet animates its height when folded (and when the editor opens) — the kitchen glides with it, and the
    // toolbar docked above it follows through the same --studio-inset-bottom
    const ro = new ResizeObserver(measure);
    ro.observe(sheet);
    return () => ro.disconnect();
  }, [desktop, apiRef, hub]);

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
      // edited runs, corners and the tall columns' places belong to the old shape's walls; where the kitchen stands on
      // the room's walls (extents) is a room measure and stays (sanitizeConfig applies the new shape's corner rules).
      // A kitchen without its tall column ("Ukloni stup") stays without one: that is no wall's edit (resetAll alone
      // would bring the column back)
      const next = fitToPlanner(sanitizeConfig({ ...resetAll({ ...cfg, layout, window: win }), tall: cfg.tall }));
      // the last shape that had edited elements can be brought back from the "Oblik" step
      setLayoutUndo(isEdited({ ...cfg, tall: true }) ? cfg : layoutUndo);
      setCfg(next);
      setUndoStack([]);
      setRunTab("a");
      setDimEdit(null);
      setGapOpen(null);
      setSurface(null);
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

  const showToast = useCallback((t: Omit<ToastData, "n">) => {
    toastSeq.current += 1;
    setToast({ ...t, n: toastSeq.current });
  }, []);
  const dismissToast = useCallback((n: number) => setToast((t) => (t && t.n === n ? null : t)), []);

  /** an edit that did not happen: the editor's note when it is open, else a toast over the 3D view */
  const refuse = useCallback(
    (text: string) => {
      if (editorOpen) setNote({ text, tone: "refused", n: performance.now() });
      else showToast({ text, tone: "refused", ms: TOAST_MS.refused });
    },
    [editorOpen, showToast],
  );

  /** apply an edit.ts result: one undo step, follow the element, say what happened */
  const applyEdit = useCallback(
    (r: EditResult, opts: ApplyOptions = {}): boolean => {
      if (!r.ok) {
        refuse(r.warning || "Ta izmjena ovdje nije moguća.");
        return false;
      }
      const nextSel = opts.select !== undefined ? opts.select : r.slotId;
      const next = fitToPlanner(r.cfg);
      // an edit of a selected element (a swap, a width …): the first coach mark ("Kliknite element") is done
      if (selId && !opts.quiet && readCoach() === "0") setCoach("1");
      undoSeq.current += 1;
      const id = undoSeq.current;
      const now = performance.now();
      const key = opts.coalesce;
      setUndoStack((u) => {
        const top = u[u.length - 1];
        // the same control again, right after its last edit: the step before the gesture stays the undo target
        if (key && top && top.key === key && now - top.t < COALESCE_MS) return [...u.slice(0, -1), { ...top, t: now }];
        return [...u.slice(-(UNDO_MAX - 1)), { id, cfg, sel: selId, key, t: now }];
      });
      follow.current = { id: nextSel, until: performance.now() + FOLLOW_MS, geo: geometryKey(cfg) !== geometryKey(next), sent: false };
      shownId.current = nextSel;
      setLayoutUndo(null);
      setCfg(next);
      setSelId(nextSel);
      if (!nextSel) setEditorOpen(false);
      if (opts.quiet) {
        // the step shows the edit's notes next to its controls
        setAnnounce(opts.say ?? "");
        return true;
      }
      if (opts.toast) {
        // an edit on the kitchen itself: the toast says it (its live region reads it out) and offers "Poništi"
        showToast({ text: opts.toast, detail: r.warning ?? undefined, tone: "info", undoId: id, ms: r.warning ? TOAST_MS.note : TOAST_MS.undo });
        setNote(null);
        setAnnounce("");
        return true;
      }
      setNote(r.warning ? { text: r.warning, tone: "info", n: performance.now() } : null);
      // with the editor closed nobody would see the note: a toast (the editor's own note region reads it out)
      if (r.warning && !editorOpen) showToast({ text: r.warning, tone: "info", undoId: id, ms: TOAST_MS.note });
      setAnnounce(opts.say ?? "");
      return true;
    },
    [cfg, selId, editorOpen, refuse, showToast],
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
    if (!sel) setEditorOpen(false);
    setDimEdit(null);
    if (editorOpen && sel) {
      setNote({ text: "Zadnja izmjena je poništena.", tone: "info", n: performance.now() });
      setToast(null);
      setAnnounce("Zadnja izmjena je poništena.");
    } else {
      setNote(null);
      showToast({ text: "Izmjena je poništena.", tone: "done", ms: TOAST_MS.done });
    }
  }, [undoStack, cfg, editorOpen, showToast]);

  /** a run back to the planner: a wall (base, wall units and, on wall A, the corners), the island or a tall column */
  const resetRunTo = useCallback(
    (run: RunRef) => {
      let r: EditResult = resetRun(cfg, run);
      if (run === "a" && r.cfg.corners) {
        const c = { ...r.cfg };
        delete c.corners;
        r = { ...r, cfg: sanitizeConfig(c) };
      }
      // keep the editor on whatever now stands at the same place
      const keep = selId && planKitchen(r.cfg).slots.some((x) => x.id === selId) ? selId : null;
      if (typeof run === "string" && run.startsWith("tall:")) {
        applyEdit(r, { select: keep, toast: "Visoki stup je uklonjen." });
        return;
      }
      const label = run === "tall" ? "Visoki stup" : run === "isl" ? islandWord(cfg.layout) : runName(run as WallId);
      applyEdit(r, { select: keep, toast: `${label}: vraćen zadani raspored.` });
    },
    [cfg, selId, applyEdit],
  );

  const resetEverything = useCallback(() => {
    const keep = selId && planKitchen(resetAll(cfg)).slots.some((x) => x.id === selId) ? selId : null;
    applyEdit({ cfg: resetAll(cfg), ok: true, warning: null, slotId: keep }, { toast: "Svi elementi vraćeni su na zadani raspored." });
  }, [cfg, selId, applyEdit]);

  /** "Ukloni" in the toolbar / Delete: the element goes, the selection with it, and a toast offers it back */
  const removeSelected = useCallback(() => {
    const sl = selSlot;
    if (!sl) return;
    const r = remove(cfg, sl.id);
    if (!r.ok) {
      refuse(r.warning ?? "Ovaj element se ne može ukloniti.");
      return;
    }
    const spacer = Boolean(moduleDef(sl.zone, sl.type)?.spacer);
    const bar = document.querySelector("[data-studio-toolbar]");
    const hadFocus = Boolean(bar && bar.contains(document.activeElement));
    // the last unit of a tall column: the column goes with it (say so — there is no switch that would show it)
    const lastOfColumn = sl.zone === "tall" && columnSlots(plan, sl).length === 1;
    applyEdit(r, {
      select: null,
      toast: spacer
        ? "Razmak je zatvoren."
        : lastOfColumn
          ? `Uklonjen je visoki stup: ${lower(slotName(sl))}, ${Math.round(sl.width)} cm.`
          : `Uklonjeno: ${lower(slotName(sl))}, ${Math.round(sl.width)} cm${sl.zone === "upper" ? " (zid ostaje prazan)" : ""}.`,
    });
    // the toolbar goes with the element: keyboard users carry on from the 3D view
    if (hadFocus) window.setTimeout(focusCanvas, 0);
  }, [selSlot, plan, cfg, refuse, applyEdit, focusCanvas]);

  /**
   * "Ukloni cijeli stup" (toolbar, editor): the tall column the selected unit belongs to goes, every unit of it (there is
   * no "Visoki stup" switch — a column comes back with a "+", "Zamijeni" or "Vrati sve elemente na zadano")
   */
  const removeColumnSelected = useCallback(() => {
    const sl = selSlot;
    if (!sl) return;
    const col = columnSlots(plan, sl);
    const r = removeColumn(cfg, sl.id);
    if (!r.ok) {
      refuse(r.warning ?? "Visoki stup se ne može ukloniti.");
      return;
    }
    const bar = document.querySelector("[data-studio-toolbar]");
    const hadFocus = Boolean(bar && bar.contains(document.activeElement));
    // opened from the list: focus goes back there (the row is gone: the step's tab)
    if (editorOpen && openedFrom.current === "list") restoreRow.current = sl.id;
    const names = col.map((x) => lower(slotName(x)));
    applyEdit(r, { select: null, toast: `Uklonjen je visoki stup${names.length > 1 ? `: ${names.join(", ")}` : ""}.` });
    if (hadFocus) window.setTimeout(focusCanvas, 0);
  }, [selSlot, plan, cfg, editorOpen, refuse, applyEdit, focusCanvas]);

  /**
   * an edit.ts result from a step (the heights in "Zidovi"): one undo step (Ctrl / ⌘ + Z), a selected element stays
   * selected where it still stands, and the step shows the notes itself
   */
  const stepEdit = useCallback(
    (r: EditResult, opts: StepEditOptions = {}): boolean => {
      const keep = selId && planKitchen(fitToPlanner(r.cfg)).slots.some((x) => x.id === selId) ? selId : null;
      // notify: the result's note goes into a toast with "Poništi" (the step has no place for it next to its controls)
      return applyEdit(r, { select: keep, quiet: !opts.notify, say: opts.say, coalesce: opts.coalesce });
    },
    [selId, applyEdit],
  );

  /* ---------------------------------------------------------------- wall lengths (the dimension labels in 3D) */

  const cancelDim = useCallback(() => {
    setDimEdit(null);
    const back = dimOpener.current;
    dimOpener.current = null;
    if (back?.isConnected) back.focus({ preventScroll: true });
  }, []);

  /** the room-wall editor's "Promijeni duljinu kuhinje": the kitchen-run editor at the same place */
  const switchDim = useCallback((target: DimLabelTarget) => {
    setDimEdit((d) => (d ? { target, rect: d.rect, n: performance.now() } : d));
  }, []);

  /** the length editor's result: the room's wall (setWallLength / setRoomWall), the kitchen run (setKitchenExtent), the island */
  const applyDim = useCallback(
    (r: EditResult, say: string, same: boolean) => {
      if (!r.ok) {
        refuse(r.warning ?? "Ta duljina ovdje nije moguća.");
        return;
      }
      setDimEdit(null);
      dimOpener.current = null;
      if (same) {
        focusCanvas();
        return;
      }
      const keep = selId && planKitchen(r.cfg).slots.some((x) => x.id === selId) ? selId : null;
      applyEdit(r, { select: keep, toast: say });
      // the labels are built anew with the kitchen: focus waits in the 3D view
      focusCanvas();
    },
    [selId, refuse, applyEdit, focusCanvas],
  );

  /* ---------------------------------------------------------------- "+" places and room surfaces */

  /**
   * a "+" was pressed (or its picker closed): the picker takes over from a selected element's toolbar and an open
   * finishes popover; the second coach mark ("Plus dodaje novi element") is done
   */
  const openGap = useCallback(
    (id: string | null) => {
      setGapOpen(id);
      if (!id) return;
      setSurface(null);
      if (selRef.current) closeEditor();
      if (readCoach() === "1") setCoach("2");
    },
    [closeEditor],
  );

  const insertAtGapDone = useCallback(
    (r: EditResult, say: string) => {
      if (!r.ok) {
        refuse(r.warning ?? "Ovdje nema mjesta za taj element.");
        return;
      }
      setGapOpen(null);
      openedFrom.current = "canvas";
      // the new element is selected: its toolbar takes over (the engine follows it once it has the new kitchen)
      applyEdit(r, { toast: say });
    },
    [refuse, applyEdit],
  );

  const surfaceEdit = useCallback(
    (r: EditResult, say: string, coalesce: string) => {
      applyEdit(r, { select: null, quiet: true, say, coalesce });
    },
    [applyEdit],
  );
  const closeSurface = useCallback(
    (refocus: boolean) => {
      setSurface(null);
      if (refocus) focusCanvas();
    },
    [focusCanvas],
  );

  /* ---------------------------------------------------------------- 3D / Tlocrt / Nacrt */

  /** the elevations "Nacrt" can show: the layout's walls, then the island / peninsula */
  const nacrtWalls = useMemo<NacrtPick[]>(() => [...wallsFor(cfg.layout), ...(plan.island ? (["isl"] as const) : [])], [cfg.layout, plan.island]);
  const nacrt: NacrtPick = nacrtWalls.includes(nacrtPick) ? nacrtPick : "a";

  const changeView = useCallback(
    (v: StudioView) => {
      if (v === view) return;
      setStudioView(v);
      if (v === "3d") setEngineHeld(false);
      // what stands on the other view's places goes: the length editor (a 3D label), a wall's finishes, an open "+"
      setDimEdit(null);
      setSurface(null);
      setGapOpen(null);
      setHintsGone(true);
      setAnnounce(v === "3d" ? "3D prikaz kuhinje." : `${v === "tlocrt" ? "Tlocrt" : "Nacrt"} s mjerama. Odaberite element na crtežu da ga uredite.`);
    },
    [view],
  );

  /**
   * a camera preset of the 3D view (the second row of the view switch): the engine moves there (useStudioEngine); the
   * preset already chosen puts the camera back to it (after the customer turned the view away)
   */
  const changeCamera = useCallback(
    (p: ViewPreset) => {
      setHintsGone(true);
      if (p === camera) apiRef.current?.setView?.(p);
      else setCameraPreset(p);
      setAnnounce(`${cameraPresetDef(p).aria}.`);
    },
    [camera, apiRef],
  );

  /** "Strop" in the view switch: the room's ceiling with its light, both on or both off (one undo step, in the link) */
  const toggleCeiling = useCallback(
    (on: boolean) => {
      const r = setRoomCeiling(cfg, { ceiling: on, lamp: on });
      const keep = selId && planKitchen(r.cfg).slots.some((x) => x.id === selId) ? selId : null;
      applyEdit(r, { select: keep, quiet: true, say: on ? "Prikazan je strop sa stropnim svjetlom." : "Strop je skriven." });
    },
    [cfg, selId, applyEdit],
  );

  // back in 3D: the engine renders again (it was paused out of view; a resize marks the view to be drawn)
  const wasFlat = useRef(flat);
  useEffect(() => {
    if (wasFlat.current && !flat) apiRef.current?.resize();
    wasFlat.current = flat;
  }, [flat, apiRef]);

  /** a click on the 2D drawing: an element selects it as a click in 3D does, the paper clears the selection */
  const pick2d = useCallback(
    (id: string | null) => {
      setHintsGone(true);
      if (!id) {
        if (selRef.current) closeEditor();
        return;
      }
      openedFrom.current = "canvas";
      setEditorFocus(0);
      openElement(id);
      const sl = slotsRef.current.find((x) => x.id === id);
      if (sl) setAnnounce(`Odabran element: ${slotName(sl)}, ${Math.round(sl.width)} cm. Brze radnje su uz element (tipka Tab), Delete ga uklanja.`);
    },
    [closeEditor, openElement],
  );

  /* ---------------------------------------------------------------- steps */

  const goTo = (i: number, opts: { focus?: boolean } = {}) => {
    const n = clamp(i, 0, LAST_STEP);
    if (!desktop) setSheetOpen(true);
    if (selId) closeEditor();
    setGapOpen(null);
    setSurface(null);
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

  /**
   * a picture of the kitchen (the "Pošalji" preview, the inquiry): the 3D view as it is — or, when the 3D view has not been
   * shown yet this visit (2D since the start: the engine built the kitchen but never rendered, its intro still waiting),
   * one of the engine's own camera presets (snapshotViews finishes the assembly and the lights itself)
   */
  const engineShot = useCallback(
    async (width: number, lead: boolean): Promise<string | undefined> => {
      const api = apiRef.current;
      if (!api || status === "failed") return undefined;
      if (status === "ready") return lead ? leadSnapshot(api, containerRef.current) : studioSnapshot(api, containerRef.current, width);
      if (!api.viewInfo?.() || !api.snapshotViews) return undefined;
      const shots = await api.snapshotViews({ views: ["perspektiva-desno"], width, height: Math.round(width * 0.75), quality: 0.85 });
      return shots[0]?.dataUrl;
    },
    [apiRef, status],
  );

  // live snapshot for the "Pošalji" preview
  useEffect(() => {
    if (stepId !== "posalji" || status === "failed") return;
    let alive = true;
    const t = window.setTimeout(() => {
      void engineShot(720, false).then((u) => {
        if (alive && u) setPreview(u);
      });
    }, 700);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [stepId, status, cfg, engineShot]);

  /* ---------------------------------------------------------------- lead */

  const fieldId = useCallback((f: LeadField | "timeline" | "hp") => `${uid}-lead-${f}`, [uid]);
  const getPayloadExtras = useCallback(
    () => ({ config: sanitizeConfig(cfg), configUrl: `${origin}${studioPath(cfg)}`, summary, price }),
    [cfg, origin, summary, price],
  );
  const getSnapshot = useCallback(() => engineShot(1200, true), [engineShot]);
  const lead = useStudioLead({ getSnapshot, fieldId, getPayloadExtras });
  const thanks = lead.status === "success" && lead.sent ? lead.sent : null;

  /* ---------------------------------------------------------------- PDF */

  // "Preuzmi PDF": the kitchen as it is now, its pictures from the running 3D view (none without WebGL); after the
  // inquiry went out, the customer's name goes on the cover. lib/pdf loads only when an export starts.
  const pdf = usePdfExport(
    () => ({
      source: "studio",
      cfg: sanitizeConfig(cfg),
      configUrl: `${origin}${studioPath(cfg)}`,
      // the engine takes its pictures itself, also while it is paused out of view (2D) once it has built the kitchen
      pictures: { engine: status === "ready" || (status === "loading" && apiRef.current?.viewInfo?.()) ? apiRef.current : null },
      preparedFor: thanks ? lead.values.name.trim() || null : null,
    }),
    setAnnounce,
  );

  // the keyboard listeners registered once call the latest handlers
  useEffect(() => {
    keys.current = { remove: removeSelected, undo: undoStack.length && !thanks ? undo : null };
  });

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
    edit: stepEdit,
    setLayout,
    goTo: (i) => goTo(i, { focus: true }),
    mood,
    setMood,
    compact: !desktop,
    engine: !failed,
    advanced,
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
          <div className="flex items-center justify-between gap-3">
            <p className="eyebrow tabular-nums text-mut">
              Korak {String(step + 1).padStart(2, "0")} <span className="text-mut/50">/ {String(STEPS.length).padStart(2, "0")}</span>
            </p>
            {st.id !== "posalji" && <ModeSwitch advanced={advanced} compact={!desktop} />}
          </div>
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
                  onOpen: (id) => openElement(id, { focus: true, editor: true }),
                  onHover: hoverElement,
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
                pdf={pdf}
              />
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );

  const editor =
    selSlot && editorOpen ? (
    <ElementEditor
      cfg={cfg}
      plan={plan}
      slotId={selSlot.id}
      info={selInfo}
      desktop={desktop}
      advanced={advanced}
      engine={!failed && status === "ready"}
      note={note}
      focusKey={editorFocus}
      price={price}
      onEdit={applyEdit}
      onNavigate={(id) => openElement(id, { editor: true })}
      onHover={hoverElement}
      onDemo={() => apiRef.current?.demo(selSlot.id)}
      onResetRun={(sl) => resetRunTo(sl.zone === "tall" ? resetTarget(sl).run : sl.run)}
      onRemoveColumn={removeColumnSelected}
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
    pdf,
  };

  const loading = status === "loading" && !uiShown;
  const live = status === "ready";
  /** where the overlays read the view from, and whether it reports: the engine in 3D, the drawing in 2D (also without WebGL) */
  const viewRef = flat ? hubRef : apiRef;
  const viewLive = flat || live;
  const overlays = flat ? uiShown : live && uiShown && !failed;
  // the element toolbar: over the element (desktop) / docked above the sheet (phone, not while the editor fills it)
  const toolbarOn = Boolean(overlays && selInfo);
  const toolbarHidden = !desktop && (editorOpen || summaryOpen || Boolean(dimEdit) || Boolean(gapOpen));
  // "+" markers in every step (not behind the phone's editor, the summary or the length editor): full while editing (the
  // "Elementi" step, an element selected, a picker open), quiet otherwise
  const gapsOn = Boolean(overlays && !dimEdit && !summaryOpen && !(editorOpen && !desktop));
  const gapsQuiet = stepId !== "elementi" && !selSlot && !gapOpen;
  const panelLeft = viewport.w - PANEL_GAP - PANEL_W;
  // first-visit coach marks: once the UI is in, never over an open picker / editor / the thank-you
  const coachOn = Boolean(!flat && overlays && coach !== "done" && !dimEdit && !gapOpen && !surface && !summaryOpen && !thanks && !(editorOpen && !desktop));
  const canDemo = Boolean(!flat && selSlot && moduleDef(selSlot.zone, selSlot.type)?.demo !== false);
  // the view switch's second row: the walls of "Nacrt", the camera presets in 3D
  const dockH = viewDockHeight(!desktop, view === "nacrt" || (view === "3d" && !failed && (desktop || cameraOpen)));

  return (
    <div ref={rootRef} className="fixed inset-0 overflow-hidden bg-ink text-fg">
      <h1 className="sr-only">3D studio — složite svoju kuhinju po mjeri</h1>

      {/* everything behind the thank-you dialog; `contents` keeps the absolute layout, `inert` takes it out of focus and AT */}
      <div className="contents" inert={Boolean(thanks)}>
        <TopBar
          desktop={desktop}
          step={step}
          mood={mood}
          onMood={setMood}
          controls={uiShown && !failed}
          pdf={uiShown ? pdf : null}
          onSummary={() => {
            if (selId) closeEditor();
            setSummaryOpen((o) => !o);
          }}
        />

        {/* 3D | Tlocrt | Nacrt (and which wall) — before the view in the Tab order */}
        <ViewSwitch
          view={view}
          onView={changeView}
          nacrt={nacrt}
          walls={nacrtWalls}
          onNacrt={setNacrtPick}
          layout={cfg.layout}
          camera={camera}
          onCamera={changeCamera}
          cameraShown={!failed}
          cameraOpen={cameraOpen}
          onCameraOpen={setCameraOpen}
          ceiling={Boolean(cfg.room?.ceiling)}
          onCeiling={toggleCeiling}
          docked={!desktop}
          shown={uiShown}
          reduce={reduce}
        />

        {/* the 3D view — in 2D out of view (its render loop pauses) and out of reach */}
        <div
          ref={containerRef}
          className={`absolute inset-0 z-0 bg-[#131315] ${s.stage}`}
          style={flat ? STAGE_AWAY : undefined}
          inert={flat}
          aria-hidden={flat || undefined}
          data-coach={coachOn && coach === "2" ? "dims" : undefined}
        />

        {/* the 2D view: the floor plan or a wall's elevation, with its dimensions */}
        {flat && (
          <PlanView
            plan={plan}
            pick={view === "nacrt" ? { kind: "nacrt", wall: nacrt } : { kind: "tlocrt" }}
            hub={hub}
            selectedId={selSlot?.id ?? null}
            insetsRef={insetsRef}
            chromeTop={dockH}
            // phone: the element toolbar docked above the sheet (GapLayer DOCKED_BAR)
            reserveBottom={!desktop && toolbarOn && !toolbarHidden ? 74 : 0}
            docked={!desktop}
            shown={uiShown}
            reduce={reduce}
            onPick={pick2d}
            onRemove={removeSelected}
            onWall={setNacrtPick}
            onDrawn={releaseEngine}
          />
        )}

        {failed && !flat && <NoWebGL desktop={desktop} onPlan={() => changeView("tlocrt")} />}

        {/* 3D chosen after the visit began in 2D: the engine is still starting (the loading veil is long gone) */}
        {!flat && uiShown && status === "loading" && (
          <p role="status" className="pointer-events-none absolute inset-0 z-[1] flex items-center justify-center gap-2.5 text-[12.5px] text-mut" style={desktop ? { paddingRight: INSET_DESKTOP.right } : undefined}>
            <Spinner className="text-accent" />
            Učitavam 3D prikaz…
          </p>
        )}


        {/* how to orbit (this visit, once the coach marks are done) */}
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute z-10 flex gap-2 ${desktop ? "bottom-6 left-8 items-end" : "inset-x-0 flex-col items-center"}`}
          // phone: under the view switch (its camera row included)
          style={desktop ? undefined : { top: `calc(var(--studio-inset-top, 56px) + ${dockH + 10}px)` }}
        >
          <AnimatePresence>
            {uiShown && !failed && !flat && !selSlot && !hintsGone && !toast && !dimEdit && coach === "done" && (
              <motion.div
                key="orbit"
                initial={{ opacity: 0, y: reduce ? 0 : 8 }}
                animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.9, delay: reduce ? 0 : 0.8, ease: EASE } }}
                exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.5 } }}
              >
                <Hint icon={<OrbitIcon className="h-4 w-4" />}>{desktop ? "Povucite za okretanje · kotačić približava" : "Povucite za okretanje"}</Hint>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {coachOn && coach !== "done" && (
          <CoachMarks
            key={coach}
            apiRef={apiRef}
            live={live}
            plan={plan}
            state={coach}
            docked={!desktop}
            touch={touch}
            insetsRef={insetsRef}
            selKey={selKey}
            onNext={() => setCoach(coach === "0" ? "1" : coach === "1" ? "2" : "done")}
            onSkip={() => setCoach("done")}
          />
        )}

        {/* desktop, with the editor open in the panel: a leader line from the element to it */}
        {overlays && desktop && editorOpen && selSlot && (
          <SelectionLeader apiRef={viewRef} live={viewLive} slotId={selSlot.id} panelLeft={panelLeft} />
        )}

        {/* on the kitchen itself: "+" at every empty place, the selected element's toolbar, the length editor and the
            finishes of a clicked wall / the floor (they fade out when done) */}
        <AnimatePresence>
          {gapsOn && (
            <motion.div
              key="gaps"
              className={`pointer-events-none absolute inset-0 ${gapOpen ? "z-[27]" : "z-[22]"}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.35, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
            >
              <GapLayer
                apiRef={viewRef}
                live={viewLive}
                cfg={cfg}
                plan={plan}
                docked={!desktop}
                insetsRef={insetsRef}
                subtle={gapsQuiet}
                pulse={coachOn && coach === "1"}
                barDocked={!desktop && toolbarOn && !toolbarHidden}
                openId={gapOpen}
                onOpen={openGap}
                onInsert={insertAtGapDone}
              />
            </motion.div>
          )}
          {overlays && surface && (
            <motion.div
              key={`surface-${surface.n}`}
              className="pointer-events-none absolute inset-0 z-[26] [&>*]:pointer-events-auto"
              initial={false}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
            >
              <SurfacePicker cfg={cfg} target={surface} docked={!desktop} insetsRef={insetsRef} onEdit={surfaceEdit} onClose={closeSurface} />
            </motion.div>
          )}
          {toolbarOn && selInfo && (
            <motion.div
              key="toolbar"
              className="pointer-events-none absolute inset-0 z-[25]"
              initial={false}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.22, ease: EASE } }}
            >
              <ElementToolbar
                apiRef={viewRef}
                live={viewLive}
                cfg={cfg}
                plan={plan}
                info={selInfo}
                docked={!desktop}
                insetsRef={insetsRef}
                hidden={toolbarHidden}
                editorOpen={editorOpen}
                canDemo={canDemo}
                onEdit={applyEdit}
                onRefuse={refuse}
                onRemove={removeSelected}
                onRemoveColumn={removeColumnSelected}
                onDemo={() => selSlot && apiRef.current?.demo(selSlot.id)}
                onMore={toggleDetails}
                onClose={() => closeEditor(true)}
                onNavigate={(id) => openElement(id, { say: true })}
              />
            </motion.div>
          )}
          {overlays && dimEdit && (
            <motion.div
              key={`dim-${dimEdit.n}`}
              className="pointer-events-none absolute inset-0 z-[26] [&>*]:pointer-events-auto"
              initial={false}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.2, ease: EASE } }}
            >
              <DimEditor
                apiRef={apiRef}
                live={live}
                cfg={cfg}
                plan={plan}
                target={dimEdit}
                docked={!desktop}
                insetsRef={insetsRef}
                advanced={advanced}
                onApply={applyDim}
                onCancel={cancelDim}
                onSwitch={switchDim}
              />
            </motion.div>
          )}
        </AnimatePresence>
        <Toast
          toast={overlays || failed ? toast : null}
          canUndo={Boolean(toast?.undoId !== undefined && undoStack[undoStack.length - 1]?.id === toast?.undoId)}
          onUndo={undo}
          onDismiss={dismissToast}
          desktop={desktop}
          raised={toolbarOn && !toolbarHidden}
          // phone: a picker docked at the bottom (add, length, finishes) is in front of the sheet — the toast goes up
          top={!desktop && Boolean(gapOpen || dimEdit || surface)}
          selLow={Boolean(selSlot && selSlot.zone !== "upper")}
          insetsRef={insetsRef}
          below={desktop ? 0 : dockH}
        />

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
          {!desktop && summaryOpen && <MobileSummary key="summary" summary={summary} price={price} getUrl={getUrl} pdf={pdf} onClose={() => setSummaryOpen(false)} />}
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
        {thanks && <SuccessOverlay key="success" sent={thanks} getUrl={getUrl} pdf={pdf} onContinue={lead.dismissSuccess} />}
      </AnimatePresence>

      <p className="sr-only" role="status" aria-live="polite">
        {lead.status === "sending" ? "Šaljem upit…" : lead.status === "invalid" ? "Provjerite označena polja." : announce}
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/** "Jednostavno / Napredno" (remembered): simple leaves the finer controls out (hooks.ts StudioMode) */
function ModeSwitch({ advanced, compact }: { advanced: boolean; compact: boolean }) {
  return (
    <Segmented
      label="Prikaz postavki"
      size="sm"
      // phone: 44 px targets
      className={`shrink-0 ${compact ? "w-[196px] [&_button]:h-11" : "w-[188px]"}`}
      options={[
        { id: "simple" as const, label: "Jednostavno", aria: "Jednostavno: samo glavne postavke" },
        { id: "advanced" as const, label: "Napredno", aria: "Napredno: sve postavke" },
      ]}
      value={advanced ? "advanced" : "simple"}
      onChange={setStudioMode}
    />
  );
}

function Hint({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className="flex items-center gap-2 rounded-full border border-white/10 bg-ink-900/55 px-3.5 py-2 text-[11.5px] text-fg/75 backdrop-blur-md">
      <span className="text-accent">{icon}</span>
      {children}
    </span>
  );
}

/** the 3D view in 2D: out of view (the engine's IntersectionObserver pauses its render loop), its size kept (no re-layout) */
const STAGE_AWAY = { visibility: "hidden", transform: "translate3d(-300vw, 0, 0)" } as const;

function NoWebGL({ desktop, onPlan }: { desktop: boolean; onPlan: () => void }) {
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
        <button
          type="button"
          onClick={onPlan}
          className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-white/20 px-5 py-3 text-[13px] font-semibold tracking-wide text-fg transition-colors duration-300 ease-premium hover:border-accent hover:text-accent"
        >
          <PlanIcon className="h-4 w-4" />
          Pogledajte tlocrt i nacrte
        </button>
      </div>
    </div>
  );
}
