"use client";

/**
 * The studio's 2D view — "Tlocrt" (the floor plan) and "Nacrt" (a wall's elevation, the island's working side): the
 * drawings of lib/studio/drawings (the ones the PDF prints; loaded with the first 2D view), drawn for the dark studio in
 * the 3D view's place. The 3D engine keeps its kitchen meanwhile but does not render (<Studio> moves its canvas out of
 * view).
 *
 * Drawing: toSVG laid out for the screen (Look: k px per paper mm — dimension text ≈ 11 px, lines screen hairlines). A
 * zoom first scales the laid-out SVG (vector: crisp), and once it settles the drawing is laid out again at the new scale
 * (text and dimension chains back to their size, the kitchen larger). The view lives in drawing cm (z px per cm and where
 * the origin is on screen), so a new layout or an edit never moves what is under the pointer; while the drawing is fitted
 * ("Uklopi", a new drawing) it stays fitted through edits, resizes and the phone's sheet gliding. Where the dimension
 * chains would leave the kitchen too little of a small view (a narrow phone with its sheet open) the fitted drawing goes
 * without them ("Približite crtež za mjere") and they come back zoomed in.
 *
 * Interaction, as in 3D: a click / tap on an element selects it (<Studio> shows the element toolbar over it, docked
 * above the sheet on a phone), on empty paper clears the selection; hovering lights an element up and names it, and so
 * does pointing at its row in the "Elementi" list; the "+" of every empty place on this drawing come from GapLayer, fed
 * through the ViewHub with the same ViewInfo the engine reports (drawingGaps / drawingHits). Drag pans, the wheel and a
 * pinch zoom (about the pointer), "+", "−" and "Uklopi" (also the keys + − 0). An element selected elsewhere (the list,
 * the toolbar's arrows, an edit) is brought into view — on "Nacrt" the drawing turns to its wall. Keyboard: the elements
 * are one Tab stop — the arrows walk them in the drawing's directions, Enter / Space select, Delete removes the selected
 * one, Escape clears it, Tab from it goes to its toolbar.
 *
 * Nothing here renders per frame through React: the transforms are written straight into the DOM, ViewInfo goes out once
 * per animation frame in which the view moved.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import type { Box, Drawing, DrawingHit, SvgColors, SvgOptions } from "@/lib/studio/drawings";
import { planGaps, type KitchenPlan, type PlanSlot } from "@/lib/studio/plan";
import type { GapView, ViewInfo } from "@/lib/studio/types";
import { FitIcon, MinusIcon, PlusIcon } from "./icons";
import type { Insets } from "./overlay";
import s from "./studio.module.css";
import { loadDrawings, loadedDrawings, type DrawingsLib, type NacrtPick, type ViewHub } from "./viewMode";

/**
 * How the drawing is laid out on screen: k px per paper mm, dimension text `text` mm (≈ 11 px on a desktop, ≈ 10.5 px on a
 * phone, where the dimension chains sit closer — DIM_GAP / DIM_STEP are paper mm — so the kitchen gets more of the little
 * room above the sheet), element tags with their names on a desktop, the labels ("A3") alone on a phone.
 */
interface Look {
  k: number;
  text: number;
  labels: SvgOptions["labels"];
}
const LOOK = { desktop: { k: 4.6, text: 2.4, labels: "both" }, phone: { k: 3.8, text: 2.8, labels: "label" } } as const satisfies Record<string, Look>;
/** paper mm around the drawing (the view has its own padding) */
const MARGIN = 2.5;
/** line weights (paper mm → ×k px): cut walls ≈ 2 px, outlines ≈ 1.3 px, divisions ≈ 0.9 px, details ≈ 0.65 px */
const WEIGHTS = { heavy: 0.44, medium: 0.3, light: 0.2, fine: 0.15 } as const;
/** light lines on the studio's dark, dimensions in the accent */
const COLORS: Partial<SvgColors> = {
  ink: "#E6E1D8",
  accent: "#C9B99A",
  paper: "#131315",
  wall: "#45423D",
  section: "#25242A",
  worktop: "#2B2924",
  glass: "#1C282D",
  appliance: "#29292E",
  tile: "#23211D",
  dark: "#5A5650",
  muted: "#8F897E",
};
/** a zoom this far from the laid-out scale is laid out again once it settles */
const RELAYOUT = 0.015;
const SETTLE_MS = 170;
const TWEEN_MS = 280;
/** a press that moves less than this (px) is a click */
const SLOP = { mouse: 4, touch: 9 } as const;
/** at least this much of the drawing stays inside the view (px) when it is dragged away */
const KEEP = 72;
const BTN_STEP = 1.45;

export type PlanPick = { kind: "tlocrt" } | { kind: "nacrt"; wall: NacrtPick };

interface View {
  /** px per drawing cm */
  z: number;
  /** where the drawing's origin is on screen (px); y is up in the drawing */
  ox: number;
  oy: number;
}

interface Built {
  /** the SVG's inner markup for the paper group (a nested <svg> in paper mm) */
  html: string;
  /** the scale (px per cm) it was laid out at, and the px per paper mm then */
  zr: number;
  k: number;
  /** with its dimension chains */
  dims: boolean;
  box: Box;
  margin: number;
  /** paper mm */
  width: number;
  height: number;
}

/** how the drawing is laid out: at z px per cm, with or without its dimension chains */
interface Lay {
  z: number;
  dims: boolean;
}

const svgOpts = (z: number, look: Look, dims = true): SvgOptions => ({
  scale: (10 * look.k) / z,
  textSize: look.text,
  margin: MARGIN,
  title: false,
  dims,
  labels: look.labels,
  weights: WEIGHTS,
  colors: COLORS,
  idPrefix: "studio-2d",
});

function build(lib: DrawingsLib, d: Drawing, lay: Lay, look: Look): Built {
  const zr = lay.z;
  const opts = svgOpts(zr, look, lay.dims);
  const f = lib.svgFrame(d, opts);
  const { svg } = lib.toSVG(d, opts);
  // nested in the paper group: its own units are paper mm (the group scales them), no tooltip of its own
  const html = svg.replace(/^<svg([^>]*?) width="([\d.]+)mm" height="([\d.]+)mm"/, '<svg$1 width="$2" height="$3" overflow="visible"').replace(/<title>[\s\S]*?<\/title>/, "");
  return { html, zr, k: look.k, dims: lay.dims, box: f.box, margin: f.margin, width: f.width, height: f.height };
}

/** the largest z (px per cm) at which the laid-out drawing (with its dimensions or without) fits w × h px */
function fitZ(lib: DrawingsLib, d: Drawing, w: number, h: number, look: Look, dims: boolean): number {
  let lo = 0.02;
  let hi = 60;
  for (let i = 0; i < 26; i++) {
    const mid = Math.sqrt(lo * hi);
    const f = lib.svgFrame(d, svgOpts(mid, look, dims));
    if (f.width * look.k <= w && f.height * look.k <= h) lo = mid;
    else hi = mid;
  }
  return lo;
}

const centre = (b: Box) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
/** a drawing box (cm) on screen (px) */
const screenBox = (v: View, b: Box) => ({ x: v.ox + b.x0 * v.z, y: v.oy - b.y1 * v.z, w: (b.x1 - b.x0) * v.z, h: (b.y1 - b.y0) * v.z });
/** how far one may zoom out / in, from the fitted scale */
const zoomLimits = (fz: number) => ({ lo: fz * 0.5, hi: Math.max(fz * 10, 7) });
/** a pointer's position in the view (px) */
const localPoint = (el: HTMLElement | null, e: { clientX: number; clientY: number }) => {
  const r = el?.getBoundingClientRect();
  return { x: e.clientX - (r?.left ?? 0), y: e.clientY - (r?.top ?? 0) };
};
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const ease = (t: number) => 1 - (1 - t) ** 3;

/** the nearest element in an arrow key's direction (drawing y is up), in the same layer first */
function nextHit(hits: DrawingHit[], from: DrawingHit, key: string): DrawingHit | null {
  const c = centre(from.box);
  let best: DrawingHit | null = null;
  let score = Infinity;
  for (const h of hits) {
    if (h === from) continue;
    const p = centre(h.box);
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const [main, cross] = key === "ArrowRight" ? [dx, dy] : key === "ArrowLeft" ? [-dx, dy] : key === "ArrowUp" ? [dy, dx] : [-dy, dx];
    if (main <= 1) continue;
    // the floor plan's wall units lie under the base row: the arrows stay in the layer they start in, when they can
    const v = main + 2.2 * Math.abs(cross) + (h.under !== from.under ? 400 : 0);
    if (v < score) {
      score = v;
      best = h;
    }
  }
  return best;
}

export interface PlanViewProps {
  plan: KitchenPlan;
  pick: PlanPick;
  hub: ViewHub;
  selectedId: string | null;
  insetsRef: RefObject<Insets>;
  /** px under the top bar taken by the view switcher (and the wall picker) */
  chromeTop: number;
  /** px above the bottom inset covered by something docked there (the phone's element toolbar): a selected element is kept above it */
  reserveBottom: number;
  /** phone: smaller paddings, touch targets, no hover */
  docked: boolean;
  /** the UI is in (the zoom controls fade in with it) */
  shown: boolean;
  reduce: boolean;
  /** a click on an element (its slot id) or on empty paper (null) */
  onPick: (id: string | null) => void;
  /** Delete / Backspace on the selected element */
  onRemove: () => void;
  /** "Nacrt" shows another wall than the selected element's (picked in the list, or the toolbar went past a corner) */
  onWall: (wall: NacrtPick) => void;
  /** the first drawing is on screen */
  onDrawn?: () => void;
}

export function PlanView({ plan, pick, hub, selectedId, insetsRef, chromeTop, reserveBottom, docked, shown, reduce, onPick, onRemove, onWall, onDrawn }: PlanViewProps) {
  const pickKey = pick.kind === "tlocrt" ? "tlocrt" : pick.wall;
  // the drawings (lib/studio/drawings) load with the first 2D view, not with the studio (as for the PDF)
  const [lib, setLib] = useState<DrawingsLib | null>(loadedDrawings);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (lib) return;
    let alive = true;
    loadDrawings().then(
      (m) => alive && setLib(m),
      (err: unknown) => {
        console.warn("[studio] crtež se nije mogao učitati:", err);
        if (alive) setFailed(true);
      },
    );
    return () => {
      alive = false;
    };
  }, [lib]);
  const drawing = useMemo(() => (lib ? (pickKey === "tlocrt" ? lib.floorPlan(plan) : (lib.elevation(plan, pickKey) ?? lib.floorPlan(plan))) : null), [lib, plan, pickKey]);
  const hits = useMemo(() => (lib && drawing ? lib.drawingHits(plan, drawing) : []), [lib, plan, drawing]);
  const gapAt = useMemo(() => (lib && drawing ? lib.drawingGaps(plan, drawing) : new Map<string, readonly [number, number]>()), [lib, plan, drawing]);
  const slots = useMemo(() => new Map(plan.slots.map((x) => [x.id, x])), [plan]);
  const look: Look = docked ? LOOK.phone : LOOK.desktop;

  const [lay, setLay] = useState<Lay | null>(null);
  const built = useMemo(() => (lib && drawing && lay ? build(lib, drawing, lay, look) : null), [lib, drawing, lay, look]);
  const [hover, setHover] = useState<string | null>(null);
  const [focusId, setFocusId] = useState<string | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const paperRef = useRef<SVGGElement>(null);
  const hitRef = useRef<SVGGElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const V = useRef<View>({ z: 1, ox: 0, oy: 0 });
  const fitted = useRef(true);
  const fitZRef = useRef(1);
  const layRef = useRef<Lay | null>(null);
  /**
   * the dimension chains show from this scale up (px per cm): 0 = always; where they would leave the kitchen too little
   * of a small view (a phone with its sheet open) the fitted drawing goes without them, and they come back zoomed in
   */
  const dimsFrom = useRef(0);
  const builtRef = useRef<Built | null>(null);
  const live = useRef({ lib, drawing, hits, gapAt, plan, selectedId, hover, look, chromeTop, reserveBottom, docked, reduce });
  const raf = useRef(0);
  const tween = useRef(0);
  const settleT = useRef(0);
  const lastPick = useRef<string | null>(null);
  const hl = useRef<string | null>(null);

  useLayoutEffect(() => {
    live.current = { lib, drawing, hits, gapAt, plan, selectedId, hover, look, chromeTop, reserveBottom, docked, reduce };
    layRef.current = lay;
  });

  /* ---------------------------------------------------------------- geometry */

  /** the part of the screen the drawing is fitted into (px) */
  const fitArea = useCallback(() => {
    const el = rootRef.current;
    const w = el?.clientWidth ?? 0;
    const h = el?.clientHeight ?? 0;
    const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const L = live.current;
    const px = L.docked ? 14 : 36;
    const x0 = Math.max(0, ins.left) + px;
    const y0 = Math.max(0, ins.top) + L.chromeTop + (L.docked ? 10 : 18);
    // desktop: the drawing's title under it
    const x1 = Math.max(x0 + 80, w - Math.max(0, ins.right) - px);
    const y1 = Math.max(y0 + 80, h - Math.max(0, ins.bottom) - (L.docked ? 14 : 58));
    return { x0, y0, x1, y1, w, h };
  }, [insetsRef]);

  /* ---------------------------------------------------------------- ViewInfo for the overlays (once per frame) */

  const publishNow = useCallback(() => {
    raf.current = 0;
    const el = rootRef.current;
    if (!el) return;
    const L = live.current;
    const size = { w: el.clientWidth, h: el.clientHeight };
    const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const A = { x0: Math.max(0, ins.left), y0: Math.max(0, ins.top), x1: size.w - Math.max(0, ins.right), y1: size.h - Math.max(0, ins.bottom) };
    const { z, ox, oy } = V.current;
    const on = (x: number, y: number) => x >= A.x0 + 6 && x <= A.x1 - 6 && y >= A.y0 + 6 && y <= A.y1 - 6;
    const gaps: GapView[] = [];
    for (const g of planGaps(L.plan)) {
      const p = L.gapAt.get(g.id);
      if (!p) continue;
      const x = ox + p[0] * z;
      const y = oy - p[1] * z;
      gaps.push({
        id: g.id,
        kind: g.kind,
        run: g.run,
        zone: g.zone,
        label: g.label,
        ...(g.side ? { side: g.side } : {}),
        ...(g.replace ? { replace: g.replace } : {}),
        offset_cm: g.from,
        width_cm: g.to - g.from,
        maxWidth_cm: g.maxWidth,
        anchor: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 },
        visible: on(x, y),
      });
    }
    const info: ViewInfo = { size, walls: [], gaps };
    const sel = L.selectedId ? L.hits.find((h) => h.ref === L.selectedId) : undefined;
    if (sel) {
      const r = screenBox(V.current, sel.box);
      info.selected = {
        id: sel.ref,
        rect: r,
        anchor: { x: r.x + r.w / 2, y: r.y },
        tag: null,
        visible: r.x + r.w > A.x0 && r.x < A.x1 && r.y + r.h > A.y0 && r.y < A.y1,
      };
    }
    hub.publish(info);
    // the hover label sits over its element
    const tip = tipRef.current;
    const hv = L.hover && L.hover !== L.selectedId ? L.hits.find((h) => h.ref === L.hover) : undefined;
    if (tip) {
      if (hv) {
        const r = screenBox(V.current, hv.box);
        tip.style.transform = `translate3d(${Math.round(r.x + r.w / 2)}px, ${Math.round(r.y - 8)}px, 0) translate(-50%, -100%)`;
        tip.dataset.on = "";
      } else delete tip.dataset.on;
    }
  }, [hub, insetsRef]);

  const publish = useCallback(() => {
    if (!raf.current) raf.current = window.requestAnimationFrame(publishNow);
  }, [publishNow]);

  /** the view → the DOM (the paper group, the hit areas), and ViewInfo on the next frame */
  const apply = useCallback(() => {
    const { z, ox, oy } = V.current;
    const b = builtRef.current;
    const g = paperRef.current;
    if (b && g) {
      const k = (b.k * z) / b.zr;
      const px = ox + b.box.x0 * z - b.margin * k;
      const py = oy - b.box.y1 * z - b.margin * k;
      g.setAttribute("transform", `translate(${px.toFixed(2)} ${py.toFixed(2)}) scale(${k.toFixed(5)})`);
    }
    hitRef.current?.setAttribute("transform", `matrix(${z.toFixed(5)} 0 0 ${(-z).toFixed(5)} ${ox.toFixed(2)} ${oy.toFixed(2)})`);
    publish();
  }, [publish]);

  /** keep some of the drawing in view */
  const clampPan = useCallback(() => {
    const b = builtRef.current;
    if (!b) return;
    const A = fitArea();
    const v = V.current;
    const k = (b.k * v.z) / b.zr;
    const x0 = v.ox + b.box.x0 * v.z - b.margin * k;
    const y0 = v.oy - b.box.y1 * v.z - b.margin * k;
    const w = b.width * k;
    const h = b.height * k;
    if (x0 > A.x1 - KEEP) v.ox -= x0 - (A.x1 - KEEP);
    else if (x0 + w < A.x0 + KEEP) v.ox += A.x0 + KEEP - (x0 + w);
    if (y0 > A.y1 - KEEP) v.oy -= y0 - (A.y1 - KEEP);
    else if (y0 + h < A.y0 + KEEP) v.oy += A.y0 + KEEP - (y0 + h);
  }, [fitArea]);

  /** a zoom settled: lay the drawing out again at its scale (text back to its size) */
  const settle = useCallback(() => {
    window.clearTimeout(settleT.current);
    settleT.current = window.setTimeout(() => {
      const z = V.current.z;
      const dims = z >= dimsFrom.current;
      const l = layRef.current;
      if (!l || Math.abs(z / l.z - 1) > RELAYOUT || l.dims !== dims) setLay({ z, dims });
    }, SETTLE_MS);
  }, []);

  const stopTween = useCallback(() => {
    if (tween.current) window.cancelAnimationFrame(tween.current);
    tween.current = 0;
  }, []);

  /** glide to a view (instant with reduced motion) */
  const goTo = useCallback(
    (to: View, animate: boolean) => {
      stopTween();
      if (!animate || live.current.reduce) {
        V.current = to;
        apply();
        settle();
        return;
      }
      const from = { ...V.current };
      const t0 = performance.now();
      const step = (now: number) => {
        const t = Math.min(1, (now - t0) / TWEEN_MS);
        const e = ease(t);
        // the scale in log space, the origin so that the screen centre of the move stays steady
        const z = from.z * (to.z / from.z) ** e;
        V.current = { z, ox: from.ox + (to.ox - from.ox) * e, oy: from.oy + (to.oy - from.oy) * e };
        apply();
        if (t < 1) tween.current = window.requestAnimationFrame(step);
        else {
          tween.current = 0;
          V.current = to;
          apply();
          settle();
        }
      };
      tween.current = window.requestAnimationFrame(step);
    },
    [apply, settle, stopTween],
  );

  const fit = useCallback(
    (animate: boolean) => {
      const el = rootRef.current;
      const L = live.current;
      if (!el || !el.clientWidth || !el.clientHeight || !L.lib || !L.drawing) return;
      const A = fitArea();
      const aw = A.x1 - A.x0;
      // with its dimensions, unless they would take more than about half of the view from the kitchen
      let bare = fitZ(L.lib, L.drawing, aw, A.y1 - A.y0, L.look, false);
      const full = fitZ(L.lib, L.drawing, aw, A.y1 - A.y0, L.look, true);
      const dims = full >= bare * 0.55;
      if (!dims) {
        // room for the line that says the dimensions come with a zoom
        A.y0 = Math.min(A.y1 - 40, A.y0 + 16);
        bare = fitZ(L.lib, L.drawing, aw, A.y1 - A.y0, L.look, false);
      }
      dimsFrom.current = dims ? 0 : bare * 1.5;
      const z = dims ? full : bare;
      const f = L.lib.svgFrame(L.drawing, svgOpts(z, L.look, dims));
      const K = L.look.k;
      const W = f.width * K;
      const H = f.height * K;
      fitZRef.current = z;
      fitted.current = true;
      const to = {
        z,
        ox: A.x0 + (A.x1 - A.x0 - W) / 2 - f.box.x0 * z + f.margin * K,
        oy: A.y0 + (A.y1 - A.y0 - H) / 2 + f.box.y1 * z + f.margin * K,
      };
      const l = layRef.current;
      if (!l || Math.abs(z / l.z - 1) > 0.001 || l.dims !== dims) setLay({ z, dims });
      goTo(to, animate);
    },
    [fitArea, goTo],
  );

  /** zoom by `f` about a screen point */
  const zoomAt = useCallback(
    (px: number, py: number, f: number, animate: boolean) => {
      const { lo, hi } = zoomLimits(fitZRef.current);
      const v = tween.current ? { ...V.current } : V.current;
      const nz = clamp(v.z * f, lo, hi);
      if (Math.abs(nz - v.z) < 1e-9) return;
      const r = nz / v.z;
      fitted.current = false;
      const to = { z: nz, ox: px - (px - v.ox) * r, oy: py - (py - v.oy) * r };
      if (animate) {
        goTo(to, true);
        return;
      }
      stopTween();
      V.current = to;
      clampPan();
      apply();
      settle();
    },
    [apply, clampPan, goTo, settle, stopTween],
  );

  const zoomCentre = (f: number) => {
    const A = fitArea();
    zoomAt((A.x0 + A.x1) / 2, (A.y0 + A.y1) / 2, f, true);
  };

  /**
   * bring an element into view, just as far as it takes (keyboard, the list, an edit that selected a new one, a tap on a
   * phone under the docked toolbar)
   */
  const reveal = useCallback(
    (ref: string) => {
      const L = live.current;
      const h = L.hits.find((x) => x.ref === ref);
      if (!h) return;
      const F = fitArea();
      const A = { x0: F.x0, y0: F.y0, x1: F.x1, y1: Math.max(F.y0 + 40, F.y1 - L.reserveBottom) };
      const r = screenBox(V.current, h.box);
      const shift = (lo: number, hi: number, a0: number, a1: number) => (hi - lo > a1 - a0 ? (a0 + a1) / 2 - (lo + hi) / 2 : lo < a0 ? a0 - lo : hi > a1 ? a1 - hi : 0);
      const dx = shift(r.x, r.x + r.w, A.x0, A.x1);
      const dy = shift(r.y, r.y + r.h, A.y0, A.y1);
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
      fitted.current = false;
      goTo({ ...V.current, ox: V.current.ox + dx, oy: V.current.oy + dy }, true);
    },
    [fitArea, goTo],
  );

  /* ---------------------------------------------------------------- the drawing changes */

  // a new drawing (another view, or an edit): fitted again when it was fitted (always for another view), else it stays
  useLayoutEffect(() => {
    const another = lastPick.current !== pickKey;
    lastPick.current = pickKey;
    if (another || fitted.current) fit(false);
    else {
      clampPan();
      apply();
    }
  }, [drawing, pickKey, fit, clampPan, apply]);

  // a new layout of the SVG: its frame from now on
  useLayoutEffect(() => {
    builtRef.current = built;
    apply();
  }, [built, apply]);

  // the first drawing has been painted: tell the studio (it holds the 3D engine back until then)
  const drawn = useRef(false);
  useEffect(() => {
    if (!built || drawn.current) return;
    let r2 = 0;
    const r1 = window.requestAnimationFrame(() => {
      r2 = window.requestAnimationFrame(() => {
        drawn.current = true;
        onDrawn?.();
      });
    });
    return () => {
      window.cancelAnimationFrame(r1);
      window.cancelAnimationFrame(r2);
    };
  }, [built, onDrawn]);

  // the size of the view, the UI's insets (the phone's sheet glides): fitted again, else kept in view
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const resize = () => {
      if (fitted.current) fit(false);
      else {
        clampPan();
        apply();
      }
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    hub.attach({
      resize,
      focus: () => hitRef.current?.querySelector<SVGElement>('[tabindex="0"]')?.focus({ preventScroll: true }),
      highlight: (id) => {
        const g = hitRef.current;
        if (!g || hl.current === id) return;
        if (hl.current) g.querySelector(`[data-ref="${CSS.escape(hl.current)}"]`)?.removeAttribute("data-hl");
        hl.current = id;
        if (id) g.querySelector(`[data-ref="${CSS.escape(id)}"]`)?.setAttribute("data-hl", "");
      },
    });
    return () => {
      ro.disconnect();
      hub.attach(null);
      hub.publish(null);
      window.cancelAnimationFrame(raf.current);
      raf.current = 0;
      stopTween();
      window.clearTimeout(settleT.current);
    };
  }, [hub, fit, clampPan, apply, stopTween]);

  // the chrome above it changed (the wall picker came / went): fitted again
  useEffect(() => {
    if (fitted.current) fit(false);
  }, [chromeTop, docked, fit]);

  // the selection: the overlays follow it; one picked elsewhere (the list, the toolbar, an edit) comes into view — on
  // another wall's elevation: that wall. But when the visitor picks another wall themselves ("Zid B" while an element of
  // wall A is selected), that wall stays: the selection is let go instead of pulling the elevation back to its own wall.
  const onPickRef = useRef(onPick);
  const lastSel = useRef<{ id: string | null; pick: string } | null>(null);
  useLayoutEffect(() => {
    onPickRef.current = onPick;
  });
  useEffect(() => {
    publish();
    const id = selectedId;
    const before = lastSel.current;
    lastSel.current = { id, pick: pickKey };
    if (!id) return;
    if (!live.current.hits.some((h) => h.ref === id)) {
      const sl = slots.get(id);
      if (!sl || pickKey === "tlocrt") return;
      const wallChosen = before !== null && before.id === id && before.pick !== "tlocrt" && before.pick !== pickKey;
      if (wallChosen && live.current.drawing) onPickRef.current(null);
      else onWall(sl.run);
      return;
    }
    reveal(id);
  }, [selectedId, publish, reveal, slots, pickKey, onWall]);

  useEffect(() => {
    publish();
  }, [hits, gapAt, hover, publish]);

  /* ---------------------------------------------------------------- pointer: pan, pinch, click */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<
    | { kind: "pan"; x0: number; y0: number; ox: number; oy: number; moved: boolean; ref: string | null; touch: boolean }
    | { kind: "pinch"; d0: number; mx: number; my: number; v: View }
    | null
  >(null);

  const startPinch = () => {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    gesture.current = { kind: "pinch", d0: Math.max(10, Math.hypot(b.x - a.x, b.y - a.y)), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, v: { ...V.current } };
  };

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const t = e.target as Element;
    // the zoom buttons and the hover label are not the drawing
    if (t.closest("[data-plan-ui]")) return;
    stopTween();
    const p = localPoint(rootRef.current, e);
    pointers.current.set(e.pointerId, p);
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // a pointer that is already gone
    }
    if (pointers.current.size >= 2) {
      startPinch();
      return;
    }
    const ref = t.closest("[data-ref]")?.getAttribute("data-ref") ?? null;
    gesture.current = { kind: "pan", x0: p.x, y0: p.y, ox: V.current.ox, oy: V.current.oy, moved: false, ref, touch: e.pointerType !== "mouse" };
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!pointers.current.has(e.pointerId)) return;
    const p = localPoint(rootRef.current, e);
    pointers.current.set(e.pointerId, p);
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pinch") {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const { lo, hi } = zoomLimits(fitZRef.current);
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const z = clamp(g.v.z * (d / g.d0), lo, hi);
      const r = z / g.v.z;
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      fitted.current = false;
      V.current = { z, ox: mx - (g.mx - g.v.ox) * r, oy: my - (g.my - g.v.oy) * r };
      clampPan();
      apply();
      return;
    }
    const dx = p.x - g.x0;
    const dy = p.y - g.y0;
    if (!g.moved && Math.hypot(dx, dy) < (g.touch ? SLOP.touch : SLOP.mouse)) return;
    // a drag, not a hover: the name over the element it began on goes
    if (!g.moved) setHover(null);
    g.moved = true;
    fitted.current = false;
    V.current = { ...V.current, ox: g.ox + dx, oy: g.oy + dy };
    clampPan();
    apply();
  };

  const endPointer = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.delete(e.pointerId);
    const g = gesture.current;
    if (g?.kind === "pinch") {
      // one finger stays: it pans on from where it is (no click)
      const rest = [...pointers.current.values()][0];
      gesture.current = rest ? { kind: "pan", x0: rest.x, y0: rest.y, ox: V.current.ox, oy: V.current.oy, moved: true, ref: null, touch: true } : null;
      settle();
      return;
    }
    gesture.current = null;
    if (!g) return;
    if (g.moved) {
      settle();
      return;
    }
    if (cancelled) return;
    onPick(g.ref);
    if (g.ref) setFocusId(g.ref);
  };

  // the wheel zooms about the pointer (a trackpad pinch arrives as a wheel with Ctrl)
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if ((e.target as Element | null)?.closest?.("[data-plan-ui]")) return;
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? el.clientHeight : 1;
      const dy = e.deltaY * unit;
      const f = Math.exp(-clamp(dy, -240, 240) * (e.ctrlKey ? 0.011 : 0.0022));
      const p = localPoint(el, e);
      zoomAt(p.x, p.y, f, false);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------------------------------------------------------------- keyboard */

  const tabStop = (selectedId && hits.some((h) => h.ref === selectedId) ? selectedId : null) ?? (focusId && hits.some((h) => h.ref === focusId) ? focusId : null) ?? hits.find((h) => !h.under)?.ref ?? hits[0]?.ref ?? null;

  const focusHit = (ref: string) => {
    setFocusId(ref);
    hitRef.current?.querySelector<SVGElement>(`[data-ref="${CSS.escape(ref)}"]`)?.focus({ preventScroll: true });
    reveal(ref);
  };

  const onHitKey = (e: KeyboardEvent<SVGGElement>) => {
    const ref = (e.target as Element).getAttribute("data-ref");
    if (!ref || e.altKey || e.metaKey || e.ctrlKey) return;
    const h = hits.find((x) => x.ref === ref);
    if (!h) return;
    if (e.key.startsWith("Arrow")) {
      e.preventDefault();
      const n = nextHit(hits, h, e.key);
      if (n) focusHit(n.ref);
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onPick(ref);
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && ref === selectedId) {
      e.preventDefault();
      // its area goes with it: focus stays in the drawing — on its left neighbour (slot ids count along the row, so the
      // ones before it keep theirs), else on what moves into its place (its id)
      setFocusId(nextHit(hits, h, "ArrowLeft")?.ref ?? ref);
      onRemove();
      window.setTimeout(() => hitRef.current?.querySelector<SVGElement>('[tabindex="0"]')?.focus({ preventScroll: true }), 0);
      return;
    }
    if (e.key === "Escape" && selectedId) {
      e.preventDefault();
      onPick(null);
      return;
    }
    // with the element selected: Tab goes straight to its toolbar
    if (e.key === "Tab" && !e.shiftKey && ref === selectedId) {
      const bar = document.querySelector<HTMLElement>("[data-studio-toolbar]");
      const first = bar && !bar.inert ? bar.querySelector<HTMLElement>("button") : null;
      if (first) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const onRootKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === "+" || e.key === "=") zoomCentre(BTN_STEP);
    else if (e.key === "-" || e.key === "_") zoomCentre(1 / BTN_STEP);
    else if (e.key === "0") fit(true);
    else return;
    e.preventDefault();
  };

  /* ---------------------------------------------------------------- render */

  const nameOf = (h: DrawingHit, sl: PlanSlot | undefined) => {
    const name = sl ? (lib?.slotTypeName(sl) ?? sl.type) : "Element";
    const w = sl ? `${Math.round(sl.width)} cm` : "";
    return { name, w, aria: `${h.label ? `${h.label}: ` : ""}${name}${w ? `, ${w}` : ""}` };
  };
  const sel = selectedId ? hits.find((h) => h.ref === selectedId) : undefined;
  const hv = hover && hover !== selectedId ? hits.find((h) => h.ref === hover) : undefined;
  const hvName = hv ? nameOf(hv, slots.get(hv.ref)) : null;
  const title = pickKey === "tlocrt" ? "Tlocrt kuhinje" : `Nacrt: ${drawing?.title ?? "zid"}`;

  return (
    <div
      ref={rootRef}
      className={`${s.plan} absolute inset-0 z-[1] overflow-hidden`}
      data-docked={docked || undefined}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endPointer(e, false)}
      onPointerCancel={(e) => endPointer(e, true)}
      onKeyDown={onRootKey}
    >
      <svg className="absolute inset-0 h-full w-full" role="group" aria-label={title} aria-describedby="studio-2d-help">
        {/* toSVG escapes every text it writes (labels, names, dimensions): the markup is the drawing's own */}
        <g ref={paperRef} className={s.planPaper} aria-hidden="true" dangerouslySetInnerHTML={built ? { __html: built.html } : undefined} />
        <g
          ref={hitRef}
          onKeyDown={onHitKey}
          onPointerOver={(e) => {
            if (e.pointerType !== "mouse") return;
            const ref = (e.target as Element).closest("[data-ref]")?.getAttribute("data-ref") ?? null;
            setHover(ref);
          }}
          onPointerOut={(e) => {
            if (e.pointerType !== "mouse") return;
            const to = (e.relatedTarget as Element | null)?.closest?.("[data-ref]");
            if (!to) setHover(null);
          }}
        >
          {hits.map((h) => {
            const n = nameOf(h, slots.get(h.ref));
            const on = h.ref === selectedId;
            return (
              <rect
                key={h.ref}
                data-ref={h.ref}
                className={s.planHit}
                x={h.box.x0}
                y={h.box.y0}
                width={h.box.x1 - h.box.x0}
                height={h.box.y1 - h.box.y0}
                vectorEffect="non-scaling-stroke"
                role="button"
                tabIndex={h.ref === tabStop ? 0 : -1}
                aria-label={n.aria}
                aria-pressed={on}
                data-sel={on || undefined}
                data-under={h.under || undefined}
                onFocus={() => setFocusId(h.ref)}
              />
            );
          })}
          {/* the selection on top of everything (a wall unit in the floor plan is under the base cabinets) */}
          {sel && (
            <rect
              className={s.planSel}
              x={sel.box.x0}
              y={sel.box.y0}
              width={sel.box.x1 - sel.box.x0}
              height={sel.box.y1 - sel.box.y0}
              vectorEffect="non-scaling-stroke"
              strokeDasharray={sel.under ? "5 4" : undefined}
              aria-hidden="true"
            />
          )}
        </g>
      </svg>

      <p id="studio-2d-help" className="sr-only">
        Strelice prelaze s elementa na element, Enter ga odabire, Delete uklanja odabrani. Povlačenjem pomičete crtež, kotačićem ili
        s dva prsta ga približavate; tipke plus i minus približavaju, nula uklapa crtež.
      </p>

      {/* the hovered element's name (desktop) */}
      <div ref={tipRef} data-plan-ui="" aria-hidden="true" className={s.planTip}>
        {hvName && (
          <>
            {hv?.label && <span className="font-semibold text-fg">{hv.label}</span>}
            <span className="text-fg/80">{hvName.name}</span>
            {hvName.w && <span className="tabular-nums text-mut">{hvName.w}</span>}
          </>
        )}
      </div>

      {/* zoom */}
      <div
        data-plan-ui=""
        className={`absolute z-[3] flex items-center gap-0.5 rounded-full border border-white/10 bg-ink-900/60 p-1 backdrop-blur-md transition-opacity duration-500 ease-premium motion-reduce:transition-none ${
          shown ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
        style={
          docked
            ? { top: `calc(var(--studio-inset-top, 56px) + 8px)`, right: 12 }
            : { top: `calc(var(--studio-inset-top, 72px) + 12px)`, right: `calc(var(--studio-inset-right, 0px) + 4px)` }
        }
        inert={!shown}
      >
        <ZoomButton label="Udalji crtež" keys="-" docked={docked} onClick={() => zoomCentre(1 / BTN_STEP)}>
          <MinusIcon className="h-4 w-4" />
        </ZoomButton>
        <ZoomButton label="Uklopi crtež u prikaz" keys="0" docked={docked} onClick={() => fit(true)} wide={!docked}>
          <FitIcon className="h-4 w-4" />
          {!docked && <span className="text-[11.5px] font-medium tracking-wide">Uklopi</span>}
        </ZoomButton>
        <ZoomButton label="Približi crtež" keys="+" docked={docked} onClick={() => zoomCentre(BTN_STEP)}>
          <PlusIcon className="h-4 w-4" />
        </ZoomButton>
      </div>

      {/* a small view shows the drawing without its dimensions: they come with a zoom */}
      {built && !built.dims && (
        <p
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 z-[2] text-center text-[11px] tracking-wide text-mut transition-opacity duration-500 ease-premium motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
          style={{ top: `calc(var(--studio-inset-top, ${docked ? 56 : 72}px) + ${chromeTop + 2}px)` }}
        >
          Približite crtež za mjere
        </p>
      )}

      {/* still loading (one small chunk), or it did not arrive */}
      {!built && (
        <p role={failed ? "alert" : undefined} className="pointer-events-none absolute inset-x-0 top-1/2 z-[2] -translate-y-1/2 text-center text-[12.5px] text-mut">
          {failed ? "Crtež se nije mogao učitati. Provjerite vezu i ponovno odaberite prikaz." : <span className="sr-only">Učitavam crtež…</span>}
        </p>
      )}

      {/* the drawing's title, like a title block (desktop) */}
      {!docked && drawing && (
        <div
          aria-hidden="true"
          className={`pointer-events-none absolute bottom-5 left-9 z-[2] max-w-[min(60%,560px)] transition-opacity duration-500 ease-premium motion-reduce:transition-none ${shown ? "opacity-100" : "opacity-0"}`}
        >
          <p className="text-[13px] font-semibold tracking-wide text-fg/90">{drawing.title}</p>
          {drawing.subtitle && <p className="mt-0.5 truncate text-[11.5px] text-mut">{drawing.subtitle}</p>}
        </div>
      )}
    </div>
  );
}

function ZoomButton({
  label,
  keys,
  docked,
  wide = false,
  onClick,
  children,
}: {
  label: string;
  keys: string;
  docked: boolean;
  wide?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-keyshortcuts={keys}
      title={label}
      onClick={onClick}
      className={`flex items-center justify-center gap-1.5 rounded-full text-fg/75 transition-colors duration-300 ease-premium hover:bg-white/[0.07] hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent ${
        docked ? "h-10 w-10 max-[359px]:h-9 max-[359px]:w-9" : wide ? "h-8 px-3" : "h-8 w-8"
      }`}
    >
      {children}
    </button>
  );
}
