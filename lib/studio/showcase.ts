/**
 * Showcase (homepage hero) data shared by the engine and the hero UI.
 *
 * Pure data — no three.js, no DOM — so the hero can import it (for the scroll
 * captions) without pulling the engine into its bundle. The engine and the
 * captions read the same list, so what the 3D shows and what the text says
 * can never drift apart.
 */

import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

/** what the homepage hero shows when no config is passed: wall A 420 cm, 240 cm island, tall column */
export const SHOWCASE_CONFIG: KitchenConfig = {
  ...DEFAULT_CONFIG,
  layout: "otok",
  walls: { a: 420, b: 220, c: 220 },
  island: 240,
  tall: true,
  front: "antracit",
  top: "mramor",
  handles: "bez",
  led: true,
  window: null,
  overrides: {},
};

export interface MaterialPair {
  front: string;
  top: string;
}

/** material pairs the showcase cycles through (catalog front / top ids) */
export const SHOWCASE_PRESETS: readonly MaterialPair[] = [
  { front: "antracit", top: "mramor" },
  { front: "hrast", top: "crni" },
  { front: "maslina", top: "hrast" },
  { front: "kasmir", top: "beton" },
];

/**
 * The three pairs shown while scrolling (one per third of the orbit):
 * the config's own materials first, then the first two presets that share
 * neither the front nor the worktop with it.
 */
export function showcasePresets(cfg: Pick<KitchenConfig, "front" | "top">): MaterialPair[] {
  const first = { front: cfg.front, top: cfg.top };
  const rest = SHOWCASE_PRESETS.filter((p) => p.front !== first.front && p.top !== first.top).slice(0, 2);
  return [first, ...rest.map((p) => ({ ...p }))];
}
