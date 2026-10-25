/**
 * Shared contract for the 3D kitchen studio.
 * The engine (lib/studio/engine.ts), the studio UI, the homepage hero and the
 * lead API all speak in these types. Lengths are centimetres everywhere.
 */

export type Layout = "ravna" | "L" | "U" | "otok";
/**
 * bez = handleless with the Gola channel profile, letvica = bar handle, gumb = knob,
 * utor = routed edge grip (aluminium J-profile in the front's edge), push = push-to-open, no grip at all
 */
export type HandleStyle = "bez" | "letvica" | "gumb" | "utor" | "push";
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

/**
 * One cabinet in an explicit run (see KitchenConfig.runs). `type` is a catalog.modules id of the run's zone,
 * `width` is in cm and must be one of that type's widths (spacer types — "slobodno" / "prazno" — take any width).
 */
export interface CabinetSpec {
  type: string;
  width: number;
}

/** base cabinet runs: the three walls and the island */
export type BaseRunId = WallId | "isl";
/** blind-corner units of wall A: base-l = A–B corner (L, U), base-r = A–C corner (U); upper-* = the wall units above */
export type CornerId = "base-l" | "base-r" | "upper-l" | "upper-r";
/** zones that can wear their own front material (two-tone kitchens) */
export type FrontZone = "base" | "upper" | "tall" | "island";

/** hardware and appliance finishes — ids from catalog.finishes.*; missing = the catalogue default */
export interface FinishSpec {
  /** catalog.finishes.handleColors (gola profile, bar, knob and edge grip); default: black for gola, inox otherwise */
  handleColor?: string;
  sink?: string;
  tap?: string;
  /** oven / microwave fronts */
  appliances?: string;
  plinth?: string;
  /** LED colour temperature */
  led?: string;
}

/** how the room around the kitchen is shown (not part of the kitchen or its price) — catalog.room.* ids */
export interface RoomSpec {
  wall?: string;
  floor?: string;
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
  /**
   * LEGACY (v1 links): element edits keyed by slot position (module id -> module type id).
   * sanitizeConfig converts them into the explicit lists below and always returns `{}` here — new code never writes it.
   */
  overrides: Record<string, string>;

  // ---------------------------------------------------------------- v2 (all optional: absent = planner default)

  /**
   * Explicit base cabinet sequence of a run, left → right (run-local, as seen facing that wall; the island from
   * the wall-A side), once the customer edits that run. Blind-corner units are not in the list (see `corners`).
   * The planner places exactly these cabinets, closes the remainder with a filler and, when a wall change makes
   * the list too long, leaves elements out from the end (sink / hob / dishwasher last) with a warning.
   * Absent = the planner fills the run itself. Edit through lib/studio/edit.ts, never by hand.
   */
  runs?: Partial<Record<BaseRunId, CabinetSpec[]>>;
  /** explicit wall-unit sequence per wall (same rules; the window and an anchored hood are skipped over) */
  upperRuns?: Partial<Record<WallId, CabinetSpec[]>>;
  /** explicit tall column, left → right (1–3 units); absent = oven + fridge (fridge at the open end) */
  tallRun?: CabinetSpec[];
  /** blind-corner unit types (catalog modules with `corner` / `cornerOk`) */
  corners?: Partial<Record<CornerId, string>>;
  /** front material per zone (two-tone kitchens); a missing zone wears `front` */
  zoneFronts?: Partial<Record<FrontZone, string>>;
  finish?: FinishSpec;
  room?: RoomSpec;
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
  /** the element has moving parts to show (StudioEngineApi.demo); false for open shelves, empty space … */
  demo?: boolean;
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
  /**
   * select a module by plan slot id (rim + onSelect with its ModuleInfo, no mechanism demo); null clears it
   * like a click into empty space. For following an element after an edit (EditResult.slotId). Optional: engines
   * built before v2 do not have it.
   */
  select?(id: string | null): void;
  resize(): void;
  dispose(): void;
}

export type CreateStudioEngine = (container: HTMLElement, opts: StudioEngineOptions) => StudioEngineApi;
