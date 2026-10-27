/**
 * What the homepage hero shows, as plain data.
 *
 * Kept here (and not imported from "@/lib/studio/engine") so the homepage never pulls three.js into
 * its initial bundle — the engine itself is loaded with a dynamic import in HeroStage.
 * Client-safe and tiny: no catalogue import here (preset names are resolved on the server, heroPresets.ts).
 */

import { SHOWCASE_CONFIG } from "@/lib/studio/showcase";
import type { KitchenConfig } from "@/lib/studio/types";

/** The engine's SHOWCASE_CONFIG (lib/studio/showcase.ts, pure data): wall A 420 cm, 240 cm island, tall column, white lacquer + black stone. */
export const HERO_CONFIG: KitchenConfig = SHOWCASE_CONFIG;

export interface HeroPreset {
  front: string;
  top: string;
  frontName: string;
  topName: string;
  frontSwatch: string;
  topSwatch: string;
  /** opens the studio with this front + worktop preselected */
  href: string;
  /** the studio's rough estimate for exactly this kitchen in these materials, e.g. "15.800 – 18.500 €" (lib/studio/price.ts) */
  price: string;
}

/**
 * Engine showcase progress: 0 → 0.4 assembles the kitchen, 0.4 → 1 orbits the camera and cycles the presets.
 * On the homepage the assembly plays by itself as an intro (so the first frame is never an empty room);
 * scrolling then drives the orbit and the material changes, in both directions.
 */
export const ASSEMBLED = 0.4;

export const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** hero scroll progress (0..1 across the sticky stage) → engine.setProgress() value */
export const engineProgress = (scroll: number) => ASSEMBLED + (1 - ASSEMBLED) * clamp01(scroll);

/** which preset the engine shows at a given hero scroll progress (it switches at 0.34 and 0.67 of the orbit) */
export const presetIndexAt = (scroll: number) => (scroll < 0.34 ? 0 : scroll < 0.67 ? 1 : 2);

/** where each preset's caption bar starts / ends on the hero scroll (the caption block fades in at ~0.2) */
export const PRESET_RANGES: [number, number][] = [
  [0.2, 0.34],
  [0.34, 0.67],
  [0.67, 1],
];

const LAYOUT_NAME: Record<KitchenConfig["layout"], string> = {
  ravna: "Ravna kuhinja",
  L: "L-kuhinja",
  U: "U-kuhinja",
  otok: "Kuhinja s otokom",
  poluotok: "Kuhinja s poluotokom",
  G: "G-kuhinja",
};

/** what the hero knows about the visitor's device (read in the browser, HeroStage) */
export interface HeroDevice {
  reducedMotion: boolean;
  /** navigator.connection.saveData */
  saveData: boolean;
  /** (pointer: coarse): phones and tablets */
  coarse: boolean;
  /** navigator.hardwareConcurrency (logical cores), when the browser tells */
  cores?: number;
  /** navigator.deviceMemory (GB, rounded down; Chromium only) */
  memory?: number;
}

/**
 * How the hero's live 3D starts:
 *  - "auto": by itself, once the page has loaded and gone idle (desktop; phones and tablets with ≥ 6 cores and,
 *    where the browser tells, ≥ 4 GB) — building the kitchen is seconds of main-thread work on a weaker phone
 *  - "tap":  the poster stays, with a "Pokrenite 3D" button (weaker touch devices, Save-Data)
 *  - "off":  poster only (reduced motion: the 3D hero is a scroll-driven camera)
 */
export type HeroStart = "auto" | "tap" | "off";

export function heroStart(d: HeroDevice): HeroStart {
  if (d.reducedMotion) return "off";
  if (d.saveData) return "tap";
  if (d.coarse && ((d.cores ?? 0) < 6 || (d.memory !== undefined && d.memory < 4))) return "tap";
  return "auto";
}

/** short technical readout of what the hero shows, e.g. "Kuhinja s otokom · zid 420 cm · otok 240 cm" */
export function heroReadout(cfg: KitchenConfig = HERO_CONFIG): string {
  const parts = [LAYOUT_NAME[cfg.layout], `zid ${cfg.walls.a} cm`];
  if (cfg.layout === "otok") parts.push(`otok ${cfg.island} cm`);
  else if (cfg.layout === "poluotok" || cfg.layout === "G") parts.push(`poluotok ${cfg.island} cm`);
  return parts.join(" · ");
}
