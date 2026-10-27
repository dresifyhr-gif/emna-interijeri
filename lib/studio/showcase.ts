/**
 * Showcase (homepage hero) data shared by the engine and the hero UI.
 *
 * Pure data — no three.js, no DOM — so the hero can import it (for the scroll
 * captions) without pulling the engine into its bundle. The engine and the
 * captions read the same list, so what the 3D shows and what the text says
 * can never drift apart.
 */

import { DEFAULT_CONFIG, type KitchenConfig } from "./types";

/**
 * what the homepage hero shows when no config is passed: wall A 420 cm, 240 cm island, tall column, white lacquer
 * fronts on a black stone worktop (the first of the three material pairs, see SHOWCASE_PRESETS)
 */
export const SHOWCASE_CONFIG: KitchenConfig = {
  ...DEFAULT_CONFIG,
  layout: "otok",
  walls: { a: 420, b: 220, c: 220 },
  island: 240,
  tall: true,
  front: "lak",
  top: "crni",
  handles: "bez",
  led: true,
  window: null,
  overrides: {},
};

export interface MaterialPair {
  front: string;
  top: string;
}

/**
 * material pairs the showcase cycles through (catalog front / top ids), in the owner's order: white lacquer on black
 * stone, then cashmere and olive on white marble. The rest only stand in when a config starts from one of these.
 */
export const SHOWCASE_PRESETS: readonly MaterialPair[] = [
  { front: "lak", top: "crni" },
  { front: "kasmir", top: "mramor" },
  { front: "maslina", top: "mramor" },
  { front: "antracit", top: "beton" },
  { front: "bijela", top: "nero" },
];

/**
 * The three pairs shown while scrolling (one per third of the orbit):
 * the config's own materials first, then the first two presets that share
 * neither the front nor the worktop with it (for SHOWCASE_CONFIG: kašmir + mramor, maslina + mramor).
 */
export function showcasePresets(cfg: Pick<KitchenConfig, "front" | "top">): MaterialPair[] {
  const first = { front: cfg.front, top: cfg.top };
  const rest = SHOWCASE_PRESETS.filter((p) => p.front !== first.front && p.top !== first.top).slice(0, 2);
  return [first, ...rest.map((p) => ({ ...p }))];
}
