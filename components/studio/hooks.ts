"use client";

import { useCallback, useEffect, useRef, useSyncExternalStore, type MouseEvent, type PointerEvent } from "react";
import { site } from "@/lib/site";
import { easePremium, eur } from "./meta";

/** matchMedia as a hook (false on the server) */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const noop = () => () => {};

/** the window's inner size, re-read on resize (0 × 0 on the server) */
let lastViewport = { w: 0, h: 0 };
function readViewport() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  if (w !== lastViewport.w || h !== lastViewport.h) lastViewport = { w, h };
  return lastViewport;
}
const SERVER_VIEWPORT = { w: 0, h: 0 };
function subscribeResize(cb: () => void) {
  window.addEventListener("resize", cb);
  return () => window.removeEventListener("resize", cb);
}
export function useViewport(): { w: number; h: number } {
  return useSyncExternalStore(subscribeResize, readViewport, () => SERVER_VIEWPORT);
}

/** window.location.origin on the client, the configured site URL on the server */
export function useOrigin(): string {
  return useSyncExternalStore(
    noop,
    () => window.location.origin,
    () => site.url.replace(/\/+$/, ""),
  );
}

/**
 * Press-and-hold repeat for − / + steppers. The step grows the longer you hold
 * (1 → 5 → 10 cm). Pointer presses repeat; keyboard activation fires once.
 */
export function useHoldRepeat(fn: (step: number) => void) {
  const fnRef = useRef(fn);
  const timer = useRef<number | null>(null);
  useEffect(() => {
    fnRef.current = fn;
  });

  const stop = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
  }, []);

  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    stop();
    fnRef.current(1);
    let n = 0;
    let delay = 420;
    const loop = () => {
      n++;
      fnRef.current(n < 10 ? 1 : n < 26 ? 5 : 10);
      delay = Math.max(55, delay * 0.8);
      timer.current = window.setTimeout(loop, delay);
    };
    timer.current = window.setTimeout(loop, delay);
  }, [stop]);

  return {
    onPointerDown: (e: PointerEvent<HTMLButtonElement>) => {
      if (e.button !== 0) return;
      e.preventDefault();
      start();
    },
    onPointerUp: stop,
    onPointerLeave: stop,
    onPointerCancel: stop,
    onContextMenu: (e: MouseEvent) => e.preventDefault(),
    // keyboard (Enter / Space) produces a click with detail 0; pointer clicks are handled above
    onClick: (e: MouseEvent<HTMLButtonElement>) => {
      if (e.detail === 0) fnRef.current(1);
    },
  };
}

/**
 * Counts a number towards its new value with the premium ease, writing straight
 * into a <span> (no re-render per frame). Returns the ref for that span.
 */
export function useTicker(value: number, reduce: boolean, duration = 950) {
  const ref = useRef<HTMLSpanElement>(null);
  const shown = useRef<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const from = shown.current;
    if (from === null || reduce || from === value) {
      shown.current = value;
      el.textContent = eur(value);
      return;
    }
    let raf = 0;
    const t0 = performance.now();
    const tick = (now: number) => {
      const k = Math.min(1, (now - t0) / duration);
      const v = from + (value - from) * easePremium(k);
      shown.current = v;
      el.textContent = eur(k >= 1 ? value : Math.round(v / 10) * 10);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, reduce, duration]);

  return ref;
}
