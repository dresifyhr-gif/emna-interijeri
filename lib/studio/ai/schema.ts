/**
 * What the model fills in (zod): a small "kitchen brief" for a new kitchen, or a list of edit operations on the current
 * one, plus a short Croatian reply. Deterministic code does the geometry (compose.ts, ops.ts) — the model never writes a
 * KitchenConfig.
 *
 * Built to pass strict structured outputs on every provider behind the AI Gateway:
 *   - every field is REQUIRED; "not said" is a sentinel — 0 for numbers, "" for text and enums, "" for yes/no ("da" /
 *     "ne" / "") — so the schema has no optional parameters (Anthropic: at most 24 across the request)
 *   - only the brief's sections are nullable (a section nobody spoke about is null) — 12 unions in all with the `ops`
 *     items (Anthropic: at most 16 parameters with anyOf / type arrays)
 *   - the edit operations are a union discriminated by `op`, written as z.union (JSON Schema anyOf — z.discriminatedUnion
 *     emits oneOf, which strict structured outputs refuse)
 *   - no numeric / string / array constraints (unsupported in strict mode): ranges are clamped by the composer and by
 *     sanitizeConfig, never trusted from the model
 *
 * The API request body has its own schema (AiRequestSchema) with real limits — that one is never sent to a model.
 */
import { z } from "zod";

// ---------------------------------------------------------------- small building blocks

const cm = (what: string) => z.number().describe(`${what}, in cm (4,20 m = 420); 0 = not said`);
const txt = (what: string) => z.string().describe(`${what}; "" = not said`);
const yesNo = (what: string) => z.enum(["da", "ne", ""]).describe(`${what}: "da" / "ne"; "" = not said`);

export const WALL_IDS = ["a", "b", "c"] as const;
const wall = z.enum(["a", "b", "c", ""]);
const side = z.enum(["lijevo", "desno", ""]);

export const LAYOUTS = ["ravna", "L", "U", "otok", "poluotok", "G"] as const;
export const HANDLE_WORDS = ["gola", "letvica", "gumb", "utor", "push", "luft"] as const;
export const TALL_EXTRA_TYPES = ["smocnica", "ormar", "metle", "vitrina", "police", "vinoteka", "kava", "perilica-rublja", "ormar-nisa"] as const;
export const DRAWER_LAYOUT_IDS = ["jednake3", "msv", "duboke2", "1+2", "4", "2+1"] as const;

// ---------------------------------------------------------------- the brief

export const WallBriefSchema = z.object({
  room: cm("length of this ROOM wall"),
  kitchen: z
    .number()
    .describe(
      "cm of this wall the kitchen run takes when it is shorter than the wall; 0 = not said (the whole wall); -1 = NO kitchen on this wall (a plain room wall)",
    ),
  start: z.enum(["kut", "kraj", ""]).describe('where a shorter kitchen run starts: "kut" = in the corner (default), "kraj" = at the far end of the wall'),
});

export const StyleSchema = z.object({
  front: txt("front colour / finish: a catalogue front id, or the customer's words (\"bijeli lak\", \"antracit\", \"hrast\")"),
  upper_front: txt("wall units' front if different (two-tone)"),
  tall_front: txt("tall units' front if different"),
  island_front: txt("island / peninsula front if different"),
  worktop: txt("worktop: catalogue top id or words (\"crni kamen\", \"bijeli mramor\", \"hrast\")"),
  worktop_thickness: cm("worktop thickness (1.2 / 2 / 4 / 6)"),
  handles: z.enum([...HANDLE_WORDS, ""]).describe('how fronts open: "gola" = handleless Gola profile, "letvica" = bar handles ("ručkice"), "gumb" knobs, "utor" edge grip, "push" push-to-open, "luft" finger gap'),
  handle_color: txt("handle / Gola profile colour (crna, inox, mesing, bijela, alu)"),
  backsplash: txt("between worktop and wall units: \"ploca\" (worktop material), \"pola\", \"bez\", or glass / tiles words (\"crno staklo\", \"metro pločice\")"),
  led: yesNo("LED lights"),
  led_color: txt("LED colour (toplo / neutralno)"),
  sink_finish: txt("sink finish (inox, crni granit, bijeli granit)"),
  tap_finish: txt("tap finish (inox, crna, mesing)"),
  appliance_finish: txt("oven / microwave finish (crno staklo, inox)"),
  plinth: txt("plinth finish (crna, fronta = like the fronts, inox, alu)"),
});

export const IslandBriefSchema = z.object({
  length: cm("island length (peninsula: from wall A to its free end)"),
  depth: cm("island body depth (60 / 90 / 100 / 120)"),
  sink: yesNo("sink in the island"),
  hob: yesNo("hob in the island"),
  seats: z.number().describe("bar stools / chairs; 0 = not said"),
  seat_side: z.enum(["back", "left", "right", ""]).describe("where people sit: back = the long outer side"),
  bar: z.enum(["povisen", "stol", "nema", ""]).describe('"povisen" = raised bar top, "stol" = lowered table, "nema" = none'),
  waterfall: yesNo("worktop running down to the floor at the ends"),
  side: side.describe("peninsula only: the end of wall A it stands out from"),
  hood: yesNo("a ceiling hood above an island hob"),
});

export const KitchenBriefSchema = z.object({
  layout: z.enum([...LAYOUTS, ""]).describe('ravna = one wall (A); L = A + B; U = A + B + C; otok = A + free island; poluotok = A + peninsula; G = A + B + peninsula'),
  walls: z.object({ a: WallBriefSchema, b: WallBriefSchema, c: WallBriefSchema }),
  ceiling: cm("ceiling height"),
  window: z
    .object({
      wall: wall,
      width: cm("window width"),
      from_left: cm("from the wall's left end to the window's left edge (facing the wall)"),
      position: z.enum(["lijevo", "sredina", "desno", ""]).describe("rough place on the wall when no exact distance is given"),
      sill: cm("sill height above the floor"),
    })
    .nullable(),
  sink: z
    .object({
      wall: z.enum(["a", "b", "c", "otok", ""]),
      under_window: yesNo("sink under the window"),
      side: z.enum(["lijevo", "sredina", "desno", ""]).describe("where on its wall"),
      width: cm("sink cabinet width"),
      dishwasher: z.enum(["da", "ne", "45", "60", ""]).describe('"da" / "ne", or its width 45 / 60'),
    })
    .nullable(),
  hob: z
    .object({
      wall: z.enum(["a", "b", "c", "otok", ""]),
      width: cm("hob width (60 / 80 / 90)"),
      oven_below: yesNo("oven under the hob"),
    })
    .nullable(),
  hood: z
    .object({
      kind: z.enum(["ugradbena", "dimnjak", "kosa", "ploca", ""]).describe("ugradbena = hidden in a wall unit, dimnjak = chimney hood, kosa = angled glass, ploca = downdraft hob"),
      finish: z.enum(["inox", "crna", "bijela", ""]),
      island: z.enum(["dimnjak", "kaseta", ""]).describe("island hood: hanging canopy or ceiling cassette"),
    })
    .nullable(),
  fridge: z
    .object({
      kind: z.enum(["ugradbeni", "side-by-side", "bez", ""]).describe('"side-by-side" = double-door ("dupli", "američki") fridge; "bez" = no fridge in the kitchen'),
      side: side.describe("as seen standing in the room facing wall A"),
      wall: wall,
      finish: txt("side-by-side finish (inox, tamni inox, crni, bijeli)"),
      handles: z.enum(["letvica", "udubljena", ""]),
    })
    .nullable(),
  oven: z
    .object({
      place: z.enum(["stup", "ispod-ploce", ""]).describe('"stup" = in a tall oven column, "ispod-ploce" = under the hob'),
      side: side.describe("tall oven column's side when it is not next to the fridge"),
      height: z.enum(["nisko", "standard", "oci", ""]).describe("oven in the column: low / standard / at eye level"),
      below: z.enum(["ladice", "vrata", ""]).describe("under the oven: drawers or one door"),
      microwave: yesNo("built-in microwave above the oven"),
    })
    .nullable(),
  tall_units: z.array(z.object({ type: z.enum(TALL_EXTRA_TYPES), width: cm("width") })).describe("extra tall units next to the fridge (pull-out larder = smocnica, tall cupboard = ormar, broom = metle …); [] = none"),
  island: IslandBriefSchema.nullable(),
  heights: z
    .object({
      mode: z.enum(["standard", "do-stropa", ""]).describe('"do-stropa" = wall units and tall units up to the ceiling'),
      one_piece: yesNo("tall units in one piece up to the ceiling (no top box)"),
      worktop: cm("worktop height (85 / 90 / 95)"),
    })
    .nullable(),
  wall_units: z.enum(["ormarici", "police", "bez", ""]).describe('above the worktop: "ormarici" wall units (default), "police" open shelves, "bez" nothing'),
  style: StyleSchema,
  room: z
    .object({
      wall_finish: txt("room wall colour"),
      floor: txt("floor (parket, beton, pločice, mikrocement …)"),
      ceiling_lamp: yesNo("show the ceiling with a lamp"),
    })
    .nullable(),
});

// ---------------------------------------------------------------- edit operations

const element = z.string().describe('a slot id from the current kitchen description, e.g. "a-base-2", "tall-0", "b-upper-1", "isl-0"');

export const EditOpSchema = z.union([
  z.object({ op: z.literal("stil"), style: StyleSchema }).describe("change colours / materials / handles / LED"),
  z
    .object({
      op: z.literal("prostor"),
      wall: z.enum(["a", "b", "c", "sve", ""]),
      wall_finish: txt("room wall colour"),
      floor: txt("floor"),
      ceiling: yesNo("show the ceiling"),
      lamp: yesNo("ceiling lamp"),
    })
    .describe("room look: wall colour, floor, ceiling"),
  z
    .object({
      op: z.literal("zid"),
      wall: z.enum(WALL_IDS),
      room: cm("new ROOM wall length"),
      kitchen: z.number().describe("new kitchen run length on it (cm); 0 = unchanged; -1 = no kitchen on this wall"),
      start: z.enum(["kut", "kraj", ""]),
    })
    .describe("wall / kitchen run length, kitchen on or off a wall"),
  z.object({ op: z.literal("strop"), cm: z.number().describe("ceiling height in cm") }),
  z
    .object({
      op: z.literal("prozor"),
      wall: z.enum(["a", "b", "c", "nema"]).describe('"nema" = remove the window'),
      width: cm("width"),
      from_left: cm("from the wall's left end"),
      position: z.enum(["lijevo", "sredina", "desno", ""]),
      sill: cm("sill height"),
    })
    .describe("add / move / remove the window"),
  z.object({ op: z.literal("oblik"), layout: z.enum(LAYOUTS) }).describe("change the kitchen shape"),
  z
    .object({
      op: z.literal("visine"),
      mode: z.enum(["standard", "do-stropa", ""]),
      one_piece: yesNo("tall units in one piece"),
      worktop: cm("worktop height"),
      gap: cm("worktop to wall units (45–65)"),
    })
    .describe("heights"),
  z
    .object({ op: z.literal("pomakni"), element, direction: z.enum(["lijevo", "desno"]), steps: z.number().describe("how many places; 0 = one; 9 = all the way") })
    .describe("move an element along its row"),
  z
    .object({ op: z.literal("premjesti"), element, wall: z.enum(["a", "b", "c", "otok"]), side: side.describe("which end of that wall (tall columns: required)") })
    .describe("move an element (sink with its dishwasher, hob, a tall column / the fridge) to another wall or wall end"),
  z
    .object({ op: z.literal("zamijeni"), element, type: z.string().describe("catalogue type id of the same row (base / upper / tall list)"), width: cm("width") })
    .describe("turn an element into another type"),
  z.object({ op: z.literal("sirina"), element, width: z.number().describe("new width in cm") }),
  z.object({ op: z.literal("ukloni"), element, whole_column: yesNo("remove the whole tall column") }),
  z
    .object({
      op: z.literal("dodaj"),
      type: z.string().describe("catalogue type id"),
      zone: z.enum(["donji", "gornji", "visoki", "otok"]),
      wall: wall,
      side: side,
      next_to: z.string().describe('slot id to put it next to; "" = anywhere that fits'),
      width: cm("width"),
    })
    .describe("add an element"),
  z
    .object({
      op: z.literal("hladnjak"),
      kind: z.enum(["ugradbeni", "side-by-side", "bez", ""]),
      side: side,
      wall: wall,
      finish: txt("side-by-side finish"),
      handles: z.enum(["letvica", "udubljena", ""]),
    })
    .describe("fridge type / place / finish"),
  z
    .object({
      op: z.literal("pecnica"),
      place: z.enum(["stup", "ispod-ploce", ""]),
      height: z.enum(["nisko", "standard", "oci", ""]),
      below: z.enum(["ladice", "vrata", ""]),
      microwave: yesNo("microwave above the oven"),
    })
    .describe("oven place / variant"),
  z
    .object({ op: z.literal("napa"), kind: z.enum(["ugradbena", "dimnjak", "kosa", "ploca", ""]), finish: z.enum(["inox", "crna", "bijela", ""]), island: z.enum(["dimnjak", "kaseta", ""]) })
    .describe("hood"),
  z.object({ op: z.literal("otok"), island: IslandBriefSchema }).describe("island / peninsula details (the layout must have one — else use oblik first)"),
  z
    .object({ op: z.literal("gornji"), kind: z.enum(["ormarici", "police", "bez"]), wall: wall })
    .describe("wall units, open shelves or nothing above the worktop (one wall or all)"),
  z
    .object({
      op: z.literal("opcije"),
      element,
      open: z.enum([...HANDLE_WORDS, ""]),
      drawers: z.enum([...DRAWER_LAYOUT_IDS, ""]),
      bowl: z.enum(["lijevo", "sredina", "desno", ""]).describe("sink bowl place"),
      hob_width: cm("hob width inside its cabinet"),
    })
    .describe("one element's options"),
]);

export const ModelOutputSchema = z.object({
  reply: z.string().describe("1–2 short sentences in simple Croatian for the customer: what you did, or one question if something essential is missing"),
  brief: KitchenBriefSchema.nullable().describe("a NEW kitchen (none yet, or the customer starts over / sends a photo of a whole kitchen to copy); null otherwise"),
  ops: z.array(EditOpSchema).describe("changes to the CURRENT kitchen, in order; [] when none"),
});

export type KitchenBrief = z.infer<typeof KitchenBriefSchema>;
export type WallBrief = z.infer<typeof WallBriefSchema>;
export type StyleBrief = z.infer<typeof StyleSchema>;
export type IslandBrief = z.infer<typeof IslandBriefSchema>;
export type EditOp = z.infer<typeof EditOpSchema>;
export type ModelOutput = z.infer<typeof ModelOutputSchema>;

// ---------------------------------------------------------------- blanks (tests, the composer's defaults)

export const BLANK_WALL: WallBrief = { room: 0, kitchen: 0, start: "" };
export const BLANK_STYLE: StyleBrief = {
  front: "",
  upper_front: "",
  tall_front: "",
  island_front: "",
  worktop: "",
  worktop_thickness: 0,
  handles: "",
  handle_color: "",
  backsplash: "",
  led: "",
  led_color: "",
  sink_finish: "",
  tap_finish: "",
  appliance_finish: "",
  plinth: "",
};
export const BLANK_ISLAND: IslandBrief = { length: 0, depth: 0, sink: "", hob: "", seats: 0, seat_side: "", bar: "", waterfall: "", side: "", hood: "" };

/** a brief that says nothing (every field "not said") — tests start from it */
export function blankBrief(): KitchenBrief {
  return {
    layout: "",
    walls: { a: { ...BLANK_WALL }, b: { ...BLANK_WALL }, c: { ...BLANK_WALL } },
    ceiling: 0,
    window: null,
    sink: null,
    hob: null,
    hood: null,
    fridge: null,
    oven: null,
    tall_units: [],
    island: null,
    heights: null,
    wall_units: "",
    style: { ...BLANK_STYLE },
    room: null,
  };
}

// ---------------------------------------------------------------- the API request (never sent to a model)

export const LIMITS = {
  /** characters of the customer's message */
  message: 1500,
  /** characters of a share-link string */
  config: 8000,
  /** decoded image bytes (the client sends a JPEG ≤ 1600 px, ≤ 1,5 MB) */
  imageBytes: 1_500_000,
  /** longest image side the server accepts (px) — the client's 1600 with some room */
  imageSide: 2048,
  /** history turns and their characters */
  historyTurns: 8,
  historyText: 1000,
  /** the whole JSON body (bytes) */
  body: 2_400_000,
} as const;

export const AiRequestSchema = z.object({
  message: z.string().max(LIMITS.message),
  config: z.string().max(LIMITS.config).nullable().optional(),
  image: z.string().nullable().optional(),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(LIMITS.historyText) }))
    .max(LIMITS.historyTurns)
    .optional(),
});
export type AiRequestBody = z.infer<typeof AiRequestSchema>;
