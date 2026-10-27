"use client";

/**
 * The studio's view — "3D" (the engine), "Tlocrt" (the floor plan) or "Nacrt" (a wall's elevation, the island's working
 * side) — and in 3D where the camera stands ("3D studio", "Iz prostorije", "Frontalno", "Odozgo": StudioEngineApi.setView),
 * remembered for this visit (sessionStorage; in memory only when storage is blocked), the view switch's rows, and the hub
 * the 2D view tells the overlays through.
 *
 * The overlays over the kitchen (element toolbar, "+" markers, the selection leader) read where things are on screen from
 * a ViewSource: the 3D engine's api, or in 2D the ViewHub that PlanView publishes its ViewInfo to — the same shape, so the
 * toolbar and the "+" work on the drawing exactly as they do in 3D.
 */
import { useSyncExternalStore } from "react";
import type { ViewInfo, ViewPreset, WallId } from "@/lib/studio/types";
import type { ViewSource } from "./overlay";

export type StudioView = "3d" | "tlocrt" | "nacrt";
/** which elevation "Nacrt" shows: a wall, or the island / peninsula from its working side */
export type NacrtPick = WallId | "isl";

function sessionValue<T extends string>(key: string, parse: (raw: string | null) => T, server: T) {
  let value: T | null = null;
  const subs = new Set<() => void>();
  const read = (): T => {
    if (value === null) {
      let raw: string | null = null;
      try {
        raw = window.sessionStorage.getItem(key);
      } catch {
        // storage blocked: the default
      }
      value = parse(raw);
    }
    return value;
  };
  const subscribe = (cb: () => void) => {
    subs.add(cb);
    return () => {
      subs.delete(cb);
    };
  };
  const set = (v: T) => {
    if (read() === v) return;
    value = v;
    try {
      window.sessionStorage.setItem(key, v);
    } catch {
      // storage blocked: remembered while the page is open
    }
    subs.forEach((cb) => cb());
  };
  const useValue = () => useSyncExternalStore(subscribe, read, () => server);
  return { read, set, useValue };
}

/** the view switch's rows (px): the gap under the top bar, one row, the gap between rows (ViewSwitch) */
export const VIEW_DOCK = { desktop: { top: 12, row: 42, gap: 8 }, docked: { top: 8, row: 50, gap: 6 } } as const;

/** px the view switch takes under the top bar; `second` = its second row shows (the camera presets in 3D, the walls of "Nacrt") */
export function viewDockHeight(docked: boolean, second: boolean): number {
  const g = docked ? VIEW_DOCK.docked : VIEW_DOCK.desktop;
  return g.top + g.row + (second ? g.gap + g.row : 0);
}

const view = sessionValue<StudioView>("emna-studio-view", (raw) => (raw === "tlocrt" || raw === "nacrt" ? raw : "3d"), "3d");
export const setStudioView = view.set;
/** the remembered view, read straight away (client only — not for rendering: the server renders "3d") */
export const readStudioView = view.read;
export const useStudioView = view.useValue;

const nacrt = sessionValue<NacrtPick>("emna-studio-nacrt", (raw) => (raw === "b" || raw === "c" || raw === "isl" ? raw : "a"), "a");
export const setNacrtPick = nacrt.set;
export const useNacrtPick = nacrt.useValue;

/**
 * where the 3D camera stands (StudioEngineApi.setView): "studio" orbits the kitchen as always, "prostorija" stands in the
 * room's entrance at eye level, "frontalno" looks straight at wall A, "odozgo" from above — remembered for the visit
 */
export const parseCameraPreset = (raw: string | null): ViewPreset =>
  raw === "prostorija" || raw === "frontalno" || raw === "odozgo" ? raw : "studio";
const camera = sessionValue<ViewPreset>("emna-studio-camera", parseCameraPreset, "studio");
export const setCameraPreset = camera.set;
export const useCameraPreset = camera.useValue;

/**
 * The drawings (lib/studio/drawings) — loaded with the first 2D view, or a moment earlier when the pointer / focus reaches
 * the switcher, never with the studio itself (they stay out of its first-load bundle, as for the PDF export)
 */
export type DrawingsLib = typeof import("@/lib/studio/drawings");
let drawingsLib: DrawingsLib | null = null;
let drawingsLoad: Promise<DrawingsLib> | null = null;
export const loadedDrawings = (): DrawingsLib | null => drawingsLib;
export function loadDrawings(): Promise<DrawingsLib> {
  if (drawingsLib) return Promise.resolve(drawingsLib);
  drawingsLoad ??= import("@/lib/studio/drawings").then(
    (m) => (drawingsLib = m),
    (err: unknown) => {
      // a chunk that did not arrive (offline): the next try loads it again
      drawingsLoad = null;
      throw err;
    },
  );
  return drawingsLoad;
}

/** what the studio may ask of the mounted 2D view */
export interface PlanControl {
  /** light an element up (a row of the "Elementi" list is pointed at); null: none */
  highlight(id: string | null): void;
  /** the UI's insets changed: fit again (when fitted) and tell the overlays */
  resize(): void;
  /** keyboard focus back to the drawing (its selected element, else the one focused last) — where the 3D canvas would get it */
  focus(): void;
}

/** the 2D view's ViewSource: PlanView publishes, the overlays subscribe; the studio asks the mounted view through it */
export interface ViewHub extends ViewSource, PlanControl {
  publish(v: ViewInfo | null): void;
  /** PlanView registers itself (null when it goes) */
  attach(c: PlanControl | null): void;
}

export function createViewHub(): ViewHub {
  let last: ViewInfo | null = null;
  let control: PlanControl | null = null;
  const subs = new Set<(v: ViewInfo) => void>();
  return {
    attach(c) {
      control = c;
    },
    highlight: (id) => control?.highlight(id),
    resize: () => control?.resize(),
    focus: () => control?.focus(),
    publish(v) {
      last = v;
      if (v) subs.forEach((fn) => fn(v));
    },
    subscribe(fn) {
      subs.add(fn);
      // like the engine: a new listener gets the current state on the next frame
      const raf = window.requestAnimationFrame(() => {
        if (last && subs.has(fn)) fn(last);
      });
      return () => {
        window.cancelAnimationFrame(raf);
        subs.delete(fn);
      };
    },
    viewInfo: () => last,
  };
}
