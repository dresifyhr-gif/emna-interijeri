"use client";

/**
 * Helpers for the HTML overlays drawn over the 3D view (element toolbar, wall-length editor, selection leader).
 *
 * The engine reports where things are on screen through ViewInfo (api.subscribe) after every rendered frame in
 * which the camera, the layout or the selection changed. Overlays write their position straight into the DOM from
 * that callback: no React render per frame, and nothing here ever asks the engine to render.
 */
import { useEffect, useRef, type RefObject } from "react";
import type { StudioEngineApi, ViewInfo } from "@/lib/studio/types";

/**
 * Where the overlays read the view from: the 3D engine's api, or the 2D view's hub (viewMode.ts ViewHub) — both report
 * ViewInfo the same way (subscribe: after every frame in which something moved; viewInfo: the last one)
 */
export type ViewSource = Pick<StudioEngineApi, "subscribe" | "viewInfo">;

/** the parts of the screen the UI covers (px), as told to the engine through the --studio-inset-* properties */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

/** the visible 3D area (px, container coordinates) with a small margin */
export interface Area {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/** the 3D area left free by the UI, `pad` px inside its edges */
export function areaOf(size: { w: number; h: number }, ins: Insets, pad = 8): Area {
  const x0 = Math.max(0, ins.left) + pad;
  const y0 = Math.max(0, ins.top) + pad;
  return {
    x0,
    y0,
    x1: Math.max(x0 + 40, size.w - Math.max(0, ins.right) - pad),
    y1: Math.max(y0 + 40, size.h - Math.max(0, ins.bottom) - pad),
  };
}

/**
 * Listen to the engine's ViewInfo while `live` (the engine has built the kitchen). `fn` may change on every render;
 * the subscription does not.
 */
export function useEngineView(apiRef: RefObject<ViewSource | null>, live: boolean, fn: (v: ViewInfo) => void) {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!live) return;
    const api = apiRef.current;
    if (!api?.subscribe) return;
    return api.subscribe((v) => fnRef.current(v));
  }, [apiRef, live]);
}

/**
 * A question pinned to the foot of a scrolling picker (position: sticky) must not hide the tile it asks about: scroll
 * the nearest scrolling ancestor of `tile` just enough that the tile sits above `bar` (no-op when it already does).
 */
export function keepAbove(tile: HTMLElement | null, bar: HTMLElement | null, gap = 10): void {
  if (!tile || !bar) return;
  let box: HTMLElement | null = tile.parentElement;
  while (box && !(box.scrollHeight > box.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(box).overflowY))) box = box.parentElement;
  if (!box) return;
  const over = tile.getBoundingClientRect().bottom - bar.getBoundingClientRect().top + gap;
  if (over > 0) box.scrollTop += over;
}

/** focus is in a text field (keyboard shortcuts must leave it alone) */
export function isTyping(el: EventTarget | null): boolean {
  const h = el as HTMLElement | null;
  if (!h || typeof h.tagName !== "string") return false;
  if (h.isContentEditable) return true;
  const tag = h.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag !== "INPUT") return false;
  const type = (h as HTMLInputElement).type;
  return !["button", "checkbox", "radio", "range", "submit", "reset"].includes(type);
}

/**
 * Arrow-key focus movement inside a popover whose buttons carry data-row / data-col: Up / Down go to the same column
 * of the previous / next row (or its last button), Left / Right walk the buttons in reading order, Home / End jump
 * to the ends. Returns true when it moved focus.
 */
export function moveFocus(root: HTMLElement, e: { key: string; target: EventTarget | null }): boolean {
  const all = [...root.querySelectorAll<HTMLElement>("[data-row]")];
  if (!all.length) return false;
  const cur = e.target as HTMLElement;
  const i = all.indexOf(cur);
  const at = (el: HTMLElement) => ({ r: Number(el.dataset.row), c: Number(el.dataset.col ?? 0) });
  let next: HTMLElement | undefined;
  switch (e.key) {
    case "ArrowRight":
      next = all[Math.min(all.length - 1, i + 1)];
      break;
    case "ArrowLeft":
      next = all[Math.max(0, i - 1)];
      break;
    case "ArrowDown":
    case "ArrowUp": {
      if (i < 0) {
        next = all[0];
        break;
      }
      const { r, c } = at(cur);
      const rows = [...new Set(all.map((el) => at(el).r))].sort((a, b) => a - b);
      const ri = rows.indexOf(r) + (e.key === "ArrowDown" ? 1 : -1);
      if (ri < 0 || ri >= rows.length) return false;
      const row = all.filter((el) => at(el).r === rows[ri]);
      next = row.find((el) => at(el).c === c) ?? row[Math.min(c, row.length - 1)] ?? row[row.length - 1];
      break;
    }
    case "Home":
      next = all[0];
      break;
    case "End":
      next = all[all.length - 1];
      break;
    default:
      return false;
  }
  if (!next) return false;
  if (next !== cur) next.focus();
  return true;
}

const clampTo = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Two "+" closer than `min` px (centres) cover each other: the later one moves away from the earlier one (straight up
 * when they coincide), a few passes, so every marker stays clickable. In place.
 */
export function spreadApart(pts: { x: number; y: number }[], min: number): void {
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < pts.length; i++)
      for (let j = i + 1; j < pts.length; j++) {
        const a = pts[i];
        const b = pts[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        if (d >= min - 0.5) continue;
        const ux = d > 0.5 ? dx / d : 0;
        const uy = d > 0.5 ? dy / d : -1;
        b.x = a.x + ux * min;
        b.y = a.y + uy * min;
        moved = true;
      }
    if (!moved) return;
  }
}

/**
 * Phone toast (Toast.tsx): its one line goes under the top bar instead of just above the sheet when the line there
 * (`foot`: its bottom edge, px) would cover more than the top would (`top`: the top bar's bottom edge) — the middle of
 * the 3D view (`mid`: where the kitchen is framed), the "+" (`dots`: their centres' y), and, with the element toolbar
 * docked above the sheet (`raised`), the "+" lower down (GapLayer lifts them to just above the toolbar: under the line)
 * and the selected element when it stands on the floor (`selLow`: low in the view; its rect is not known yet right after
 * an edit — the engine rebuilds and selects it later).
 */
export function toastAtTop(o: { top: number; foot: number; mid: number; lineH: number; drop: number; dots: number[]; raised: boolean; selLow: boolean }): boolean {
  const cost = (y0: number, y1: number) => (y0 <= o.mid && y1 >= o.mid ? 100 : 0) + o.dots.filter((y) => y >= y0 - 20 && y <= y1 + 20).length;
  const low = o.raised ? o.dots.filter((y) => y > o.foot + 20).length + (o.selLow ? 3 : 0) : 0;
  return cost(o.top + o.drop, o.top + o.drop + o.lineH) < cost(o.foot - o.lineH, o.foot) + low;
}

/** a coach card keeps this far from what it points at (CoachMarks) */
const CARD_GAP = 16;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
/** px² two rectangles share */
export const overlapArea = (a: Rect, b: Rect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * Where the card goes: below or above its target (`at`; centred on it, else shifted sideways while the caret still
 * reaches it), else a waiting place (`rest`, in order). The first place that covers nothing in `keep` (the control in
 * use: the selected element, its toolbar, the focused control) wins; among those, the one covering the fewest of `dots`
 * (the other "+"). x / y are the card's top left; side: where the target is ("below": the card is below it); cost: how
 * bad the place is (≥ 1e6: it covers something in `keep`), to compare targets.
 */
export function placeCard(
  size: { w: number; h: number },
  A: Area,
  at: { x: number; y: number } | null,
  rest: { x: number; y: number }[],
  keep: Rect[],
  dots: Rect[],
): { x: number; y: number; side: "below" | "above" | "none"; cost: number } {
  const { w, h } = size;
  const fit = (x: number, y: number) => ({ x: clampTo(x, A.x0, Math.max(A.x0, A.x1 - w)), y: clampTo(y, A.y0, Math.max(A.y0, A.y1 - h)) });
  const cands: { x: number; y: number; side: "below" | "above" | "none"; pref: number }[] = [];
  if (at) {
    const below = at.y + CARD_GAP + 14;
    const above = at.y - CARD_GAP - 14 - h;
    // below first when the labels sit high (mark 3) and there is room; the target must stay outside the card
    const order: ("below" | "above")[] = below + h <= A.y1 || above < A.y0 ? ["below", "above"] : ["above", "below"];
    order.forEach((side, k) => {
      for (const [j, dx] of [0, -(w / 2 - 34), w / 2 - 34].entries()) {
        const p = fit(at.x - w / 2 + dx, side === "below" ? below : above);
        // a clamped card that now lies over its target, or whose caret no longer reaches it, is no place for it
        if ((at.y >= p.y - 4 && at.y <= p.y + h + 4) || at.x - p.x < 18 || at.x - p.x > w - 18) continue;
        cands.push({ ...p, side, pref: k * 3 + j });
      }
    });
  }
  rest.forEach((p, k) => cands.push({ ...fit(p.x, p.y), side: "none", pref: 10 + k }));
  let best = cands[0] ?? { ...fit(rest[0]?.x ?? A.x0, rest[0]?.y ?? A.y0), side: "none" as const, pref: 0 };
  let bestCost = Infinity;
  for (const c of cands) {
    const box = { x: c.x, y: c.y, w, h };
    const hard = keep.reduce((n, r) => n + overlapArea(box, r), 0);
    const soft = dots.filter((r) => overlapArea(box, r) > 0).length;
    const cost = (hard > 0 ? 1e6 + hard : 0) + soft * 10 + c.pref;
    if (cost < bestCost) {
      bestCost = cost;
      best = c;
    }
  }
  return { x: best.x, y: best.y, side: best.side, cost: bestCost };
}
