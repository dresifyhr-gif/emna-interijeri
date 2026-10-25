/**
 * Public entry of the 3D studio engine.
 *
 *   const { createStudioEngine } = await import("@/lib/studio/engine");
 *   const engine = createStudioEngine(el, { mode: "studio", config, onSelect, onReady });
 *
 * Vanilla three.js, no React. Import it dynamically (client only) so three.js
 * is loaded only where the studio / hero is shown. The module itself is
 * SSR-safe (no window/document access at import time).
 */

export { createStudioEngine, SHOWCASE_CONFIG } from "./engine/index";
export type {
  CreateStudioEngine,
  DimTarget,
  HeightSpec,
  KitchenConfig,
  ModuleInfo,
  Mood,
  ScreenRect,
  StudioEngineApi,
  StudioEngineOptions,
  ViewInfo,
} from "./types";
