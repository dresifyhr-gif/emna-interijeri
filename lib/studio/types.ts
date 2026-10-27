/**
 * Shared contract for the 3D kitchen studio.
 * The engine (lib/studio/engine.ts), the studio UI, the homepage hero and the
 * lead API all speak in these types. Lengths are centimetres everywhere.
 */

/**
 * ravna = one wall (A) · L = walls A + B · U = walls A + B + C · otok = wall A + a free-standing island ·
 * poluotok = wall A + a peninsula (poluotok) standing out from one end of it (IslandSpec.side) ·
 * G = walls A + B + a peninsula at the right end of A (an L kitchen closed by a peninsula)
 */
export type Layout = "ravna" | "L" | "U" | "otok" | "poluotok" | "G";
/**
 * How the fronts open (KitchenConfig.handles, and per element CabinetSpec.opt.open):
 * bez = handleless with the Gola channel profile, letvica = bar handle, gumb = knob,
 * utor = routed edge grip (aluminium J-profile in the front's edge), push = push-to-open (TIP-ON: no grip, 4 mm reveals,
 * the front pops out before it opens), luft = handleless with a finger gap ("luft za prste": wall-unit fronts reach
 * 2,5 cm below the carcass, base fronts stop 3 cm under the worktop — no profile, the carcass edge shows)
 */
export type HandleStyle = "bez" | "letvica" | "gumb" | "utor" | "push" | "luft";

/**
 * Cooker hood above a wall hob (KitchenConfig.hood.kind, per hob CabinetSpec.opt.hood):
 *   ugradbena  hidden in a wall unit ("napa" element above the hob — every older link)
 *   dimnjak    a visible chimney hood on the wall (60 / 90 / 120 cm, following the hob); the wall units above the hob go
 *   kosa       a visible angled glass hood on the wall (same widths); the wall units above the hob go
 *   ploca      a hob with a built-in downdraft extractor ("napa u ploči"): no hood at all, wall units may hang above it
 */
export type HoodKind = "ugradbena" | "dimnjak" | "kosa" | "ploca";
/** visible hood finish (catalog.hoods.finishes) */
export type HoodFinish = "inox" | "crna" | "bijela";
/** the ceiling hood above an island / peninsula hob: canopy + chimney cover (every older link), or a flush ceiling cassette */
export type IslandHoodStyle = "dimnjak" | "kaseta";

/**
 * Hoods of the kitchen. Every field optional; absent = every older link: a hood hidden in a wall unit above a wall hob, a
 * ceiling canopy hood with a chimney cover above an island hob (IslandSpec.hood / hoodAbove still decide whether and how
 * high). `kind` "ploca" (downdraft) means no hood anywhere — the island's too. Edit through lib/studio/edit.ts setHood.
 */
export interface HoodSpec {
  /** wall hobs (and, "ploca", every hob); absent = "ugradbena" */
  kind?: HoodKind;
  /** visible wall / island hood finish; absent = inox (an island canopy without it keeps the appliance finish) */
  finish?: HoodFinish;
  /** the island / peninsula hood; absent = "dimnjak" */
  island?: IslandHoodStyle;
}

/** glass of glass-door elements (vitrines): catalog.glass.types */
export type GlassType = "prozirno" | "satinirano" | "dimljeno" | "broncano" | "rebrasto";
/** the frame around the glass: in the front (every older vitrine) or a thin metal frame (catalog.glass.frames) */
export type GlassFrame = "fronta" | "alu-crni" | "inox" | "zlatni" | "bronca";

/**
 * Glass-door elements (catalog modules with `glass`: vitrines, the diagonal corner vitrine …). Kitchen default
 * (KitchenConfig.glass) and per element (CabinetSpec.opt.glass, field by field over the default). Absent fields = every
 * older vitrine: clear glass in a front-coloured frame, inner LED, glass shelves.
 */
export interface GlassSpec {
  type?: GlassType;
  frame?: GlassFrame;
  /** inner LED strip; absent = on */
  led?: boolean;
  /** glass shelves inside; absent = yes */
  shelves?: boolean;
}

/**
 * Per-element options of a list entry (CabinetSpec.opt). Only what applies to the entry's type is kept (sanitizeConfig);
 * absent = the kitchen-level setting. Edit through lib/studio/edit.ts setElementOptions / elementOptions.
 */
export interface ElementOpts {
  /** how this element's fronts open instead of KitchenConfig.handles (any element with fronts) */
  open?: HandleStyle;
  /** glass-door elements: overrides of KitchenConfig.glass */
  glass?: GlassSpec;
  /** wall units: depth (cm) of the top box above it in a "do stropa" second row (plan.ts TOP_DEPTHS); absent = HeightSpec.topDepth */
  depth?: number;
  /** hobs on a wall run: this hob's hood instead of KitchenConfig.hood.kind */
  hood?: HoodKind;
  /** floating shelves ("police-visece"): 1–3 boards; absent = 2 */
  rows?: number;
  /** open shelves with a light (floating shelves, open niches): LED under the boards; absent = on */
  led?: boolean;
  /**
   * tall units and the side-by-side bridge cabinet in a "do stropa" kitchen: true = one piece from the plinth up to the
   * column's top line (one front, no seam on the wall units' top-row line — doors up to plan.ts TALL_DOOR_MAX), false =
   * split into the unit and a top box even when the kitchen says one piece; absent = HeightSpec.onePiece
   */
  onePiece?: boolean;
  /** oven columns ("pecnica", "pecnica-mikro"): what is under the oven — two drawers (absent) or one door ("vrata") */
  below?: "vrata";
  /**
   * oven columns: where the oven sits — absent = as every older column (two drawers' height above the plinth), "nisko" =
   * low (one drawer's height), "oci" = at eye level (its bottom on the worktop line, the photo's column)
   */
  ovenAt?: OvenAt;
  /** drawer units (and the hob's drawers): the drawer split (catalog.drawerLayouts); absent = KitchenConfig.drawerLayout, else the type's own */
  drawers?: DrawerLayout;
  /** hobs: the hob's own width (cm, plan.ts HOB_WIDTHS: a 60 cm hob in a 90 cm cabinet); absent = what the cabinet takes (60 → 58, 80–90 → 78, ≥ 100 → 88) */
  hob?: number;
  /** sinks: where the bowl sits in its cabinet; absent = centred */
  bowl?: "left" | "right";
}

/** where the oven of an oven column sits (ElementOpts.ovenAt) */
export type OvenAt = "nisko" | "oci";

/**
 * The drawer split of a drawer unit, top → bottom (catalog.drawerLayouts; ElementOpts.drawers / KitchenConfig.drawerLayout):
 *   jednake3   three equal drawers
 *   msv        small + medium + large (0,2 / 0,28 / 0,52 — the photo's drawer unit)
 *   duboke2    two deep drawers
 *   1+2        one shallow + two deep (0,22 / 0,39 / 0,39 — what "Tri ladice" always had)
 *   4          four drawers (0,19 / 0,27 / 0,27 / 0,27)
 *   2+1        two shallow + one deep (0,25 / 0,25 / 0,5 — the photo's drawer unit as measured: 18 / 19 / 39 cm)
 */
export type DrawerLayout = "jednake3" | "msv" | "duboke2" | "1+2" | "4" | "2+1";

/** the side-by-side fridge's handles (FinishSpec.fridgeHandle): long bar handles (absent) or recessed grips in the door edge */
export type FridgeHandle = "letvica" | "udubljena";

/**
 * LED zones (KitchenConfig.ledZones) when not all of them follow KitchenConfig.led: under the wall units, in the plinth,
 * inside niches / vitrines / open units. false = that zone off; absent = it follows `led`. Only meaningful while `led` is on.
 */
export interface LedZones {
  under?: boolean;
  plinth?: boolean;
  inner?: boolean;
}

/** the Gola profile (handles "bez") beyond its colour (FinishSpec.handleColor) */
export interface GolaSpec {
  /** a horizontal Gola channel between the drawers of handleless drawer units (each drawer gets its own grip); absent = only under the worktop */
  between?: boolean;
}

/** the plinth beyond its finish (FinishSpec.plinth) */
export interface PlinthSpec {
  /** how far the plinth stands back from the base fronts (cm, plan.ts PLINTH_RECESSES); absent = 6 */
  recess?: number;
}

/** the 3D camera presets of the studio (StudioEngineApi.setView) */
export type ViewPreset = "studio" | "prostorija" | "frontalno" | "odozgo";

/** worktop thickness (cm): catalog.worktopThickness — 1,2 compact, 2 slim stone, 4 standard (every older link), 6 massive */
export interface WorktopSpec {
  /** cm; absent = 4 */
  thickness?: number;
}

/**
 * Between the worktop and the wall units (KitchenConfig.backsplash):
 *   ploca    worktop material up to the wall units (every older link)
 *   pola     worktop material up to half that height
 *   bez      none (the wall shows)
 *   staklo   back-painted glass in a colour (catalog.backsplashes, kind "staklo") up to the wall units
 *   plocice  tiles (catalog.backsplashes, kind "plocice": subway / hex / zellige in a few colours) up to the wall units
 */
export type BacksplashKind = "ploca" | "pola" | "bez" | "staklo" | "plocice";
export interface BacksplashSpec {
  kind: BacksplashKind;
  /** staklo / plocice: catalog.backsplashes id of that kind; absent = the first of that kind */
  finish?: string;
}
export type Mood = "day" | "night";
/** a = back wall, b = left wall (L and U), c = right wall (U only) */
export type WallId = "a" | "b" | "c";

/** an end of a wall's kitchen run, as seen standing in the room facing that wall: "b-left" = the left end on wall B */
export type RunEnd = `${WallId}-${"left" | "right"}`;

/**
 * Where the kitchen stands on one wall of the room (KitchenConfig.extents). The room's walls (KitchenConfig.walls) and
 * the kitchen's runs are separate things: a 450 cm wall B may hold a kitchen run of 300 cm that starts at the corner
 * with wall A, or 40 cm away from it. Every field is optional; absent (or no extent at all) = the kitchen takes the
 * whole wall — exactly every older link. Lengths in cm; plan.ts kitchenRange resolves it, sanitizeConfig keeps it valid
 * (at least the layout's shortest wall, inside the wall, clear of a neighbouring run that takes the corner). Edit through
 * lib/studio/edit.ts setKitchenExtent / setRoomWall.
 */
export interface KitchenExtent {
  /** cm of the wall the kitchen takes (corner units, cabinets, tall columns); absent = up to the far end of the wall */
  length?: number;
  /** cm of bare wall between the anchor end and the kitchen; absent = 0 (the kitchen starts right at that end) */
  offset?: number;
  /**
   * the end of the wall the offset is measured from (facing the wall); absent = the wall's corner end: A = left (the
   * corner with B), B = right (the corner with A), C = left (the corner with A)
   */
  anchor?: "left" | "right";
}

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
 * `width` is in cm and must be one of that type's widths (spacer types — "slobodno" / "prazno" — and the filler strip
 * "filer" take any width in their range).
 *
 * A wall's base run (KitchenConfig.runs.a / b / c) may also hold TALL units standing in it (`tall: true`, `type` a
 * catalog tall id): consecutive tall entries are one column with a cover panel on each outer side, and at a column the
 * worktop, the backsplash, the plinth LED, the wall units and the top row stop. Absent = an entry of the list's own zone
 * (every older link). Edit through lib/studio/edit.ts (changeType with a tall type, insertAtGap / insertBefore / After
 * with zone "tall").
 */
export interface CabinetSpec {
  type: string;
  width: number;
  /** a tall unit (catalog zone "tall") standing in a wall's base run; anywhere else it is dropped by sanitizeConfig */
  tall?: true;
  /** per-element options (glass, opening style, top-box depth, hood of a hob, shelf rows / LED); absent = kitchen settings */
  opt?: ElementOpts;
}

/** base cabinet runs: the three walls and the island (or the peninsula — layouts "poluotok" / "G" use the same run) */
export type BaseRunId = WallId | "isl";
/**
 * corner units of wall A: base-l = its left end (the A–B corner of L / U / G, the peninsula of a left "poluotok"),
 * base-r = its right end (the A–C corner of U, the peninsula of G / a right "poluotok"); upper-* = the wall units above
 * (no wall units at a peninsula). The type (catalog modules with `corner` / `cornerOk`) decides the footprint: a blind
 * corner (110 × 60 base, 80 × 35 wall unit) or an L-shaped / diagonal unit (90 × 90 base, 60 × 60 wall unit) — see
 * catalog.ts cornerFoot.
 */
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
  /** the side-by-side fridge (catalog.finishes.fridges: inox, tamni inox, crni, bijeli); absent = the appliance finish (every older link) */
  fridge?: string;
  /** the side-by-side fridge's handles; absent = long bar handles */
  fridgeHandle?: FridgeHandle;
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
  /**
   * "do stropa" with a second row of top cabinets: their depth (cm, plan.ts TOP_DEPTHS 30 / 35 / 45 / 60 — shallower or
   * deeper than the 35 cm wall units, e.g. 60 flush with a tall column); absent = 35. Per element: CabinetSpec.opt.depth
   */
  topDepth?: number;
  /**
   * cm from the worktop surface up to the wall units' underside (plan.ts UPPER_GAPS 45–65); absent = 57. Works in every
   * mode (the standard wall units keep their 72 cm and move with it)
   */
  gap?: number;
  /**
   * "do stropa": the height of the second row of top cabinets (cm, plan.ts TOP_ROWS 30–60; the main row takes the rest),
   * 0 = one row of wall units up to the ceiling where that fits (DIM.upperMainMax); absent = the planner's split
   */
  topRow?: number;
  /**
   * "do stropa": tall units (and the side-by-side bridge cabinet) in one piece up to the column's top line instead of the
   * unit + a top box on the top row's line (doors up to plan.ts TALL_DOOR_MAX); per element: ElementOpts.onePiece
   */
  onePiece?: boolean;
}

/** what the island / peninsula worktop holds besides plain cabinets (the planner places it and leaves it off the walls) */
export type IslandFunctions = "none" | "hob" | "sink" | "both";

/** where people sit at the island / peninsula: its outer long side, or one end ("left" / "right" as seen from the cabinet fronts) */
export type SeatSide = "back" | "left" | "right";

/**
 * Šank — always along the outer long side of the island / peninsula (opposite its cabinet fronts). Lengths in cm.
 *
 *   raised  povišeni šank: a bar top `height` above the floor (plan.ts BAR_HEIGHTS 105 / 110 / 115), `depth` deep
 *           (BAR_DEPTHS 30 / 35 / 40), on a front-coloured upstand that stands on the back edge of the worktop; bar stools
 *   table   spušteni stol: a table top at 75 cm (TABLE_HEIGHT), `depth` deep (TABLE_DEPTHS 60 / 70 / 80), against the
 *           island's back on two legs in the table's material; chairs
 *
 * While there is a bar, the main worktop has no seating overhang (IslandSpec.overhang / seatSide are kept, unused):
 * the bar takes the seats. Edit through lib/studio/edit.ts setBar.
 */
export interface BarSpec {
  kind: "raised" | "table";
  /** top surface above the floor (cm); absent = 110 (raised) / 75 (table) */
  height?: number;
  /** cm along the island; absent = its whole length between the end sides (plan.ts clamps it) */
  length?: number;
  /** cm; absent = 35 (raised) / 70 (table) */
  depth?: number;
  /** catalog.tops id of the bar / table top; absent = the kitchen's worktop (KitchenConfig.top) */
  top?: string;
}

/**
 * The island (layout "otok") or the peninsula (layouts "poluotok" and "G"), apart from its length (KitchenConfig.island)
 * and its cabinets (KitchenConfig.runs.isl, the "isl" list for both). Every field is optional; absent = the island of
 * every older link: drawers and doors only, a 60 cm body with a back panel, a 35 cm seating overhang along the back
 * with two counter stools, the worktop down to the floor at both ends (waterfall), no hood. Real dimensions: plan.ts
 * (ISLAND_DEPTHS … and DIM.island*), the geometry the planner derives from them: plan.ts IslandPlan. Edit through
 * lib/studio/edit.ts (setIslandFunctions, setIsland, setSeating, setBar, setPeninsula).
 */
export interface IslandSpec {
  /**
   * hob / sink (with the dishwasher next to it) / both in the island worktop; the wall runs the planner fills then get
   * none of it (a feature the island is too short for stays on the walls, with a note). Absent = "none".
   */
  functions?: IslandFunctions;
  /** peninsula ("poluotok" only): the end of wall A it stands out from; absent = "right". "G" is always right (B is left) */
  side?: "left" | "right";
  /**
   * body depth, cabinet fronts to the outer face (cm): plan.ts ISLAND_DEPTHS 60 / 90 / 100 / 120. 60 = the cabinets and
   * a back panel; deeper = a second row of push-to-open cabinets (30 / 40 / 60 cm deep) opening to the outer side.
   * Absent = 60.
   */
  depth?: number;
  /** absent = "back"; a peninsula cannot seat at the end against the wall (the planner uses "back" then) */
  seatSide?: SeatSide;
  /** worktop overhang on the seat side for the knees (cm): plan.ts OVERHANGS 0 / 25 / 30 / 35; 0 = no seating. Absent = 35 */
  overhang?: number;
  /** stools (or chairs at a table); the planner places at most what fits (plan.ts DIM.seatPitch). Absent = 2 */
  stools?: number;
  /** false = front-coloured end panels instead of the worktop running down to the floor. Absent = true */
  waterfall?: boolean;
  /**
   * otočna napa — a ceiling-hung hood above the (first) hob on the island. Absent = there is one above every hob on it
   * (the one `functions` put there and one the customer placed by hand); false = none (a hob with a built-in downdraft
   * extractor). `true` means the same as absent and is not stored.
   */
  hood?: boolean;
  /** cm from the worktop surface up to the hood's underside (plan.ts HOOD_ABOVE, 60–85); absent = 65 */
  hoodAbove?: number;
  bar?: BarSpec;
}

/** how the room around the kitchen is shown (not part of the kitchen or its price) — catalog.room.* ids */
export interface RoomSpec {
  /** every wall (catalog.room.walls id); absent = the dark studio wall */
  wall?: string;
  floor?: string;
  /** one wall in another finish than `wall` (clicking a wall in 3D: StudioEngineOptions.onSurfaceClick) */
  walls?: Partial<Record<WallId, string>>;
  /**
   * room walls with no kitchen on them (only "b" / "c", and only those the layout does not use for a kitchen run): an L
   * kitchen in a closed room with a bare right wall = layout "L" + bare ["c"]. Their length: KitchenConfig.walls.b / c
   * (the room's depth). Drawn as plain walls (no run, no "+", no note); edit.ts setBareWall / setWallKitchen
   */
  bare?: WallId[];
  /** show the room's ceiling (seen from inside: StudioEngineApi.setView "prostorija"); absent = no ceiling */
  ceiling?: boolean;
  /** a simple round ceiling light in the middle of the room (with `ceiling`); absent = none */
  lamp?: boolean;
}

export interface KitchenConfig {
  v: 1;
  layout: Layout;
  /**
   * the ROOM's walls (cm); b and c are ignored by layouts that don't use those walls. The kitchen takes the whole wall
   * unless `extents` says otherwise.
   */
  walls: { a: number; b: number; c: number };
  ceiling: number;
  window: WindowSpec | null;
  /** id from catalog.fronts */
  front: string;
  /** id from catalog.tops */
  top: string;
  handles: HandleStyle;
  /**
   * the main tall column is on (absent `tallRun`: the planner's fridge + oven where the layout puts it — every default
   * kitchen). LEGACY as a switch: it is the head field of every link and stays for them, but no UI needs a "Visoki stup"
   * toggle any more — the column is an element like the others: lib/studio/edit.ts insertAtGap at a run's free end starts
   * one (tall + tallRun + tallAt), removing its last unit or removeColumn ends it, resetAll brings the default back. Off,
   * sanitizeConfig drops `tallRun` / `tallAt` (dead state; old links with them decode to the same kitchen, without them).
   */
  tall: boolean;
  /**
   * island length (layout "otok"), or the peninsula's length from wall A to its free end ("poluotok", "G"), cm;
   * ignored by the other layouts
   */
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
   * the list too long, leaves elements out from the end (sink / hob / dishwasher last) with a warning. A wall's list
   * may hold tall units standing in the run (CabinetSpec.tall — fridge / oven columns between base cabinets) and the
   * planner's filler strip at a wall / corner / column end ("filer": kept where it was, so the cabinets do not slide
   * when the run changes; it gives way first when room is needed).
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
  /**
   * where the tall column (`tall` / `tallRun`, list "tall") stands: a free end of a wall run. Absent = where the planner
   * puts it (the open end of wall A in "ravna" / "L" / "otok", of C in "U", of B in "G", the other end of A in
   * "poluotok"). An end the layout cannot use (no such wall, a corner) is ignored.
   */
  tallAt?: RunEnd;
  /**
   * more tall columns, each at a free end of a wall run ("b-left": the open end of wall B), left → right like `tallRun`
   * (1 to MAX_TALL units, e.g. a side-by-side fridge niche with its bridge cabinet). Lists "tall:<end>"; an entry at the
   * end where the tall column stands is not placed. Absent = none.
   */
  tallRuns?: Partial<Record<RunEnd, CabinetSpec[]>>;
  /** where the kitchen stands on each wall of the room (see KitchenExtent); absent = the whole wall */
  extents?: Partial<Record<WallId, KitchenExtent>>;
  /** blind-corner unit types (catalog modules with `corner` / `cornerOk`) */
  corners?: Partial<Record<CornerId, string>>;
  /** front material per zone (two-tone kitchens); a missing zone wears `front` */
  zoneFronts?: Partial<Record<FrontZone, string>>;
  finish?: FinishSpec;
  room?: RoomSpec;
  /** element heights / kitchen up to the ceiling; absent = standard heights, worktop at 90 cm */
  heights?: HeightSpec;
  /**
   * the island / peninsula beyond its length and cabinets: hob / sink on it, depth, seating, stools, waterfall ends,
   * the ceiling hood, a bar (šank) or a lowered table. Kept for every layout (like `island`), used by "otok",
   * "poluotok" and "G". Absent = the island of every older link.
   */
  islandSpec?: IslandSpec;
  /** hoods: hidden / chimney / angled glass / downdraft, finish, island style; absent = every older link (see HoodSpec) */
  hood?: HoodSpec;
  /** glass-door elements' default glass, frame, LED and shelves; absent = clear glass in a front-coloured frame (GlassSpec) */
  glass?: GlassSpec;
  /** worktop thickness; absent = 4 cm */
  worktop?: WorktopSpec;
  /** what covers the wall between worktop and wall units; absent = the worktop material up to the wall units */
  backsplash?: BacksplashSpec;
  /** walls with a hanging rail with hooks on the backsplash (reling s kukama); absent = none */
  rails?: WallId[];
  /** LED zones switched off one by one (while `led` is on); absent = every zone follows `led` */
  ledZones?: LedZones;
  /**
   * how the fronts of one zone open instead of `handles` (base Gola, wall units and the tall column push-to-open …);
   * an element's own CabinetSpec.opt.open still wins. Absent = every zone opens as `handles`
   */
  zoneHandles?: Partial<Record<FrontZone, HandleStyle>>;
  /** the Gola profile beyond its colour: a channel between the drawers; absent = only under the worktop */
  gola?: GolaSpec;
  /** the drawer split of every drawer unit (catalog.drawerLayouts); absent = each type's own; per element ElementOpts.drawers */
  drawerLayout?: DrawerLayout;
  /** the plinth's recess behind the fronts; absent = 6 cm */
  plinth?: PlinthSpec;
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

/** a measurement the customer can change by clicking its label in 3D: a wall, or the island / peninsula */
export type DimTarget = WallId | "isl";

/**
 * which dimension label in 3D: a room wall's length ("room", the label above the wall units), or the kitchen run's
 * length on that wall ("kitchen", the label on the floor in front of the cabinets) — the island / peninsula label is
 * { kind: "kitchen", wall: "isl" }
 */
export interface DimLabelTarget {
  kind: "room" | "kitchen";
  wall: DimTarget;
}

/** an empty place in 3D where the studio shows a "+" (plan.ts planGaps; lib/studio/edit.ts gapOptions / insertAtGap) */
export interface GapView {
  /** pass to gapOptions / insertAtGap */
  id: string;
  /**
   * free   an empty-space element ("Slobodno mjesto" / "Bez gornjeg elementa") — something can take its place
   * end    a free end of a wall's kitchen run: the bare floor left at the end of the run and / or the bare wall beyond
   *        the kitchen (an insert there extends the run — "produži kuhinju"); base cabinets or a tall column
   * upper  bare wall in the wall-unit row: between wall units, beside the window, or (with `side`) at a free end of the
   *        row — over bare floor and on the bare wall beyond the kitchen (an insert there grows the kitchen run)
   * island an end of the island / peninsula (free room in it, or it can grow)
   * seam   a full row (every row has one): the joint between two elements — a new one goes in between, the row makes
   *        room (one or more elements narrower); where nothing can, the new one takes an element's place (`replace`)
   */
  kind: "free" | "end" | "upper" | "island" | "seam";
  run: WallId | "isl";
  zone: "base" | "upper" | "island";
  /** what a "+" here adds ("Gornji element", "Donji element", "Donji ili visoki element", "Element otoka" …); absent in older engines */
  label?: string;
  side?: "left" | "right";
  /** run-local cm: left edge of the empty stretch, and its width */
  offset_cm: number;
  width_cm: number;
  /** the widest element that can go here (cm), counting the room the run can grow into */
  maxWidth_cm: number;
  /**
   * seam: the element (slot id) the new one takes the place of — a full row where nothing can make room (plan.ts PlanGap.replace);
   * absent = the new element goes in beside the others
   */
  replace?: string;
  /** where the "+" goes (px, relative to the container) */
  anchor: { x: number; y: number };
  /** in front of the camera and on screen */
  visible: boolean;
}

/** a click on the room itself (not on a cabinet): StudioEngineOptions.onSurfaceClick */
export interface SurfaceHit {
  surface: "wall" | "floor";
  /** the wall that was clicked (surface "wall") */
  wall?: WallId;
  /** px, relative to the container */
  screen: { x: number; y: number };
}

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
  /**
   * the dimension labels: one room label per wall of the layout first (kind "room"), then the island / peninsula, then
   * one kitchen-run label per wall (kind "kitchen") — so `walls.find((l) => l.wall === "a")` is still the room wall
   */
  walls: Array<{
    wall: DimTarget;
    /** absent in engines built before the room / kitchen split = "room" */
    kind?: "room" | "kitchen";
    /** what the label says (cm) */
    length_cm: number;
    /** centre of the label (px) */
    label: { x: number; y: number };
    /** the label pill's size (px) — overlays keep clear of it; absent in older engines and before it is laid out */
    size?: { w: number; h: number };
    /** shown, faded in and on screen */
    visible: boolean;
  }>;
  /** studio: every empty place a "+" can add something to (absent in older engines and the showcase) */
  gaps?: GapView[];
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
  /**
   * studio: every dimension label becomes a button — the room walls ({ kind: "room" }), the kitchen runs and the
   * island ({ kind: "kitchen" }). Takes over from onWallLabel when both are given.
   */
  onDimLabel?: (target: DimLabelTarget, rect: ScreenRect) => void;
  /**
   * studio: a click on a wall or the floor where no cabinet is in the way (to change the wall's paint / the floor);
   * while it is set a hovered wall gets a faint accent rim and the room shows the pointer cursor (the floor counts only
   * inside the room — not behind its walls, not out at the horizon). Without it the room is not clickable.
   */
  onSurfaceClick?: (hit: SurfaceHit) => void;
}

/** the camera presets of StudioEngineApi.snapshotViews (the PDF export's pictures) */
export type SnapshotViewId = "perspektiva-desno" | "perspektiva-lijevo" | "frontalno" | "pticja-perspektiva";

/**
 * A camera for a picture of the kitchen: the angles around the kitchen's centre (the engine frames the whole kitchen in
 * the picture at that angle). A side view the room's walls would block (the camera behind a wall of an L / U kitchen)
 * turns towards the layout's own default view until every wall is in front of the camera.
 */
export interface SnapshotView {
  id: string;
  /** Croatian caption ("Perspektiva desno") */
  label: string;
  /** azimuth (radians): 0 = facing wall A from the room, + = the camera to the right, − = to the left */
  az: number;
  /**
   * `az` is counted from the layout's own studio angle (the one the studio opens at, mirrored for a left peninsula)
   * instead of from wall A — one camera that suits every layout (the PDF's cover); absent = from wall A
   */
  home?: boolean;
  /** elevation above the horizon (radians): 0.1 ≈ eye level, 1.1 ≈ from above */
  el: number;
}

// the presets themselves (SNAPSHOT_VIEWS) live in ./snapshot-views — a runtime value here would ship in the homepage's
// and the studio's first-load JS, which import this file for its types and DEFAULT_CONFIG

export interface SnapshotViewsOptions {
  /** the pictures, in this order (a preset id or a camera of its own); absent = the four presets */
  views?: (SnapshotViewId | SnapshotView)[];
  /** picture size in px; absent = 1600 × 1000 (16:10) */
  width?: number;
  height?: number;
  /** JPEG quality 0..1; absent = 0.88 */
  quality?: number;
  /**
   * what each picture frames: "room" = every wall of the room over its whole length, as the studio frames it (absent);
   * "kitchen" = only the kitchen — its cabinets up to the wall units, the island with its seats — so it fills the picture
   * and the room's walls run out of it (a product shot)
   */
  frame?: "room" | "kitchen";
  /**
   * the part of the picture (fractions 0..1 from the left / top) the framed box has to fit in — the camera aims at its
   * centre, so a picture can leave room for a title or a fade; absent = nearly all of it (3–5 % margins)
   */
  region?: { x0: number; x1: number; y0: number; y1: number };
}

/** one picture of StudioEngineApi.snapshotViews */
export interface ViewSnapshot {
  id: string;
  label: string;
  /** "data:image/jpeg;base64,…" */
  dataUrl: string;
  width: number;
  height: number;
}

export interface StudioEngineApi {
  /** diff-aware: material/handle changes animate in place, geometry changes re-assemble */
  setConfig(cfg: KitchenConfig): void;
  setMood(m: Mood): void;
  /** showcase mode only: 0..1 scroll progress drives assembly, camera orbit and material cycling */
  setProgress(p: number): void;
  /** JPEG data URL of the current view (for the lead e-mail) */
  snapshot(maxWidth?: number): Promise<string>;
  /**
   * Pictures of the kitchen from a few cameras (SNAPSHOT_VIEWS: right / left perspective, frontal, bird's eye) for the
   * PDF export: the whole kitchen framed in each, in the current mood (lights, LEDs), without the dimension labels,
   * the selection / hover rims and the studio's empty-space outlines. The customer's own camera, selection and view
   * are restored after each picture (each renders synchronously; the engine breathes between pictures). Resolves
   * to [] before the kitchen is built or after dispose. Optional: engines built before it do not have it.
   */
  snapshotViews?(opts?: SnapshotViewsOptions): Promise<ViewSnapshot[]>;
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
  /**
   * studio: the camera preset — "studio" (the orbit around the kitchen, the default), "prostorija" (standing in the room
   * at the entrance, eye level ~165 cm, a wide ~60° lens, looking at wall A — with KitchenConfig.room.ceiling the ceiling
   * shows), "frontalno" (straight at wall A), "odozgo" (from above). Every preset can still be orbited / zoomed; a
   * rebuild keeps the preset. Optional: engines built before it do not have it.
   */
  setView?(preset: ViewPreset): void;
  /** the current camera preset */
  getView?(): ViewPreset;
  /**
   * show / hide the ceiling and its light now (overrides KitchenConfig.room.ceiling / lamp until the next config that
   * changes them); absent `light` keeps the light as it is
   */
  setCeiling?(on: boolean, light?: boolean): void;
  resize(): void;
  dispose(): void;
}

export type CreateStudioEngine = (container: HTMLElement, opts: StudioEngineOptions) => StudioEngineApi;
