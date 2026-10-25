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

/**
 * How high the kitchen goes (cm). Absent = { mode: "standard", worktop: 90 } — exactly the kitchen of every older link.
 *
 *   standard   wall units 72 cm high, their top at most 219 cm above the floor (and 3 cm below the ceiling);
 *              the tall column ends on the same line
 *   do-stropa  the tall column and the wall units reach the ceiling, minus a front-coloured cornice strip
 *              (plan.ts DIM.cornice) that hides an uneven ceiling. Wall units up to ~105 cm stay one row; on taller
 *              ceilings a second row of top cabinets (nadgradni ormarići, 30–60 cm, lift-up flaps) sits on them, and
 *              every tall unit gets a top box on the same line, so the proportions stay those of a real kitchen
 *   custom     `upper` = wall-unit height (one of plan.ts UPPER_HEIGHTS), `tallTop` = top of the tall column above the
 *              floor. The planner fits both under the ceiling (with a Croatian note when it had to lower them) and
 *              keeps the requested values, so raising the ceiling again restores them.
 *
 * `worktop` (85 / 90 / 95, plan.ts WORKTOP_HEIGHTS) works in every mode: the plinth and the base carcass follow it
 * and the wall units keep their distance to the worktop. Edit through lib/studio/edit.ts setHeights.
 */
export interface HeightSpec {
  mode: "standard" | "do-stropa" | "custom";
  /** custom: wall-unit carcass height (cm) */
  upper?: number;
  /** custom: top of the tall column above the floor (cm) */
  tallTop?: number;
  /** worktop surface above the floor (cm); absent = 90 */
  worktop?: number;
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
  /**
   * explicit tall column, left → right (1 to plan.ts MAX_TALL units, any mix of widths, e.g. 30 larder + 60 fridge +
   * 60 oven); absent = oven + fridge (fridge at the open end)
   */
  tallRun?: CabinetSpec[];
  /** blind-corner unit types (catalog modules with `corner` / `cornerOk`) */
  corners?: Partial<Record<CornerId, string>>;
  /** front material per zone (two-tone kitchens); a missing zone wears `front` */
  zoneFronts?: Partial<Record<FrontZone, string>>;
  finish?: FinishSpec;
  room?: RoomSpec;
  /** element heights / kitchen up to the ceiling; absent = standard heights, worktop at 90 cm */
  heights?: HeightSpec;
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

/** a rectangle in screen px, relative to the engine container's top-left corner */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** a measurement the customer can change by clicking its label in 3D: a wall, or the island */
export type DimTarget = WallId | "isl";

/**
 * Where things are on screen right now, for HTML overlays positioned over the 3D view (an element toolbar,
 * a length editor at a wall label). Px relative to the engine container. See StudioEngineOptions.onViewChange.
 */
export interface ViewInfo {
  /** container size (px) */
  size: { w: number; h: number };
  /** the selected element, if any */
  selected?: {
    id: string;
    /** screen bounding box of the element (base / island units include the worktop above them) */
    rect: ScreenRect;
    /** top centre of `rect` — where a toolbar above the element points to */
    anchor: { x: number; y: number };
    /** centre of the engine's own "60 cm" width tag for this element (keep a toolbar clear of it) */
    tag: { x: number; y: number } | null;
    /** in front of the camera and at least partly on screen */
    visible: boolean;
  };
  /** the dimension labels (one per wall of the layout, plus the island) */
  walls: Array<{
    wall: DimTarget;
    /** what the label says (cm) */
    length_cm: number;
    /** centre of the label (px) */
    label: { x: number; y: number };
    /** shown, faded in and on screen */
    visible: boolean;
  }>;
}

export interface StudioEngineOptions {
  /** "studio": interactive configurator. "showcase": homepage hero, driven by scroll progress, no picking */
  mode: "studio" | "showcase";
  config?: KitchenConfig;
  mood?: Mood;
  onSelect?: (m: ModuleInfo | null) => void;
  onReady?: () => void;
  /**
   * studio: called after a rendered frame in which the camera, the layout, the selection or the container size
   * changed (at most once per animation frame; nothing is rendered just for it). The first call follows the
   * first rendered frame. Same as api.subscribe.
   */
  onViewChange?: (info: ViewInfo) => void;
  /**
   * studio: the wall / island dimension labels become buttons ("Promijeni duljinu zida A, 290 cm"); a click,
   * Enter or Space calls this with the label's rect (px, relative to the container). Without it they stay plain text.
   */
  onWallLabel?: (wall: DimTarget, rect: ScreenRect) => void;
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
  /**
   * studio: a hover rim on an element without selecting it (e.g. while the pointer is over its row in a list);
   * null removes it. Selection and real hover keep their own rim.
   */
  highlight?(id: string | null): void;
  /**
   * studio: listen for ViewInfo (see StudioEngineOptions.onViewChange); the listener gets the current state
   * on the next rendered frame. Returns the unsubscribe function.
   */
  subscribe?(listener: (info: ViewInfo) => void): () => void;
  /** studio: ViewInfo as of the last rendered frame (null before the kitchen is built) */
  viewInfo?(): ViewInfo | null;
  resize(): void;
  dispose(): void;
}

export type CreateStudioEngine = (container: HTMLElement, opts: StudioEngineOptions) => StudioEngineApi;
