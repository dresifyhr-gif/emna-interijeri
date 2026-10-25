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
export function useEngineView(apiRef: RefObject<StudioEngineApi | null>, live: boolean, fn: (v: ViewInfo) => void) {
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
