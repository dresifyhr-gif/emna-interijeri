/**
 * Shared contract for the 3D kitchen studio.
 * The engine (lib/studio/engine.ts), the studio UI, the homepage hero and the
 * lead API all speak in these types. Lengths are centimetres everywhere.
 */

export type Layout = "ravna" | "L" | "U" | "otok";
export type HandleStyle = "bez" | "letvica" | "gumb"; // handleless (gola profile), bar handle, knob
export type Mood = "day" | "night";
/** a = back wall, b = left wall (L and U), c = right wall (U only) */
export type WallId = "a" | "b" | "c";

export interface WindowSpec {
  wall: WallId;
  /** distance from the wall's left end to the window's left edge */
  offset: number;
  width: number;
  /** height of the window sill above the floor */
  sill: number;
}

export interface KitchenConfig {
  v: 1;
  layout: Layout;
  /** b and c are ignored by layouts that don't use those walls */
  walls: { a: number; b: number; c: number };
  ceiling: number;
  window: WindowSpec | null;
  /** id from catalog.fronts */
  front: string;
  /** id from catalog.tops */
  top: string;
  handles: HandleStyle;
  /** tall column (fridge + oven) at the right end of wall a */
  tall: boolean;
  /** island length, used only when layout === "otok" */
  island: number;
  led: boolean;
  /** element-level edits made by clicking a module: module id -> module type id */
  overrides: Record<string, string>;
}

export const DEFAULT_CONFIG: KitchenConfig = {
  v: 1,
  layout: "L",
  walls: { a: 380, b: 220, c: 220 },
  ceiling: 260,
  window: null,
  front: "antracit",
  top: "mramor",
  handles: "bez",
  tall: true,
  island: 240,
  led: true,
  overrides: {},
};

/** what the engine reports when the user clicks a cabinet */
export interface ModuleInfo {
  id: string;
  zone: "base" | "upper" | "tall" | "island";
  /** current module type id (catalog.modules) */
  type: string;
  /** cm */
  width: number;
  /** module type ids this slot may be switched to */
  options: string[];
  /** screen position (px, relative to the engine container) to anchor a popover */
  screen: { x: number; y: number };
}

export interface StudioEngineOptions {
  /** "studio": interactive configurator. "showcase": homepage hero, driven by scroll progress, no picking */
  mode: "studio" | "showcase";
  config?: KitchenConfig;
  mood?: Mood;
  onSelect?: (m: ModuleInfo | null) => void;
  onReady?: () => void;
}

export interface StudioEngineApi {
  /** diff-aware: material/handle changes animate in place, geometry changes re-assemble */
  setConfig(cfg: KitchenConfig): void;
  setMood(m: Mood): void;
  /** showcase mode only: 0..1 scroll progress drives assembly, camera orbit and material cycling */
  setProgress(p: number): void;
  /** JPEG data URL of the current view (for the lead e-mail) */
  snapshot(maxWidth?: number): Promise<string>;
  /** open/close a module's doors or drawers to show its mechanism */
  demo(moduleId: string): void;
  /** clear the current selection (hover rim) without calling onSelect — for UI that closes its own editor */
  deselect(): void;
  resize(): void;
  dispose(): void;
}

export type CreateStudioEngine = (container: HTMLElement, opts: StudioEngineOptions) => StudioEngineApi;
