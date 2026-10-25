/**
 * Share links: a whole kitchen in a short, URL-safe string (no database).
 *
 * v2 (written now):
 *   2.L.380.220.220.260.antracit.mramor.bez.1.240.1.0[.key-value]*
 *   │ │  a   b   c  strop fronta  ploča ručke │  otok │ └ prozor: "a-120-100-95" (zid-udaljenost-širina-parapet) ili 0
 *   │ └ oblik                         visoki stup  LED
 *   └ verzija
 *
 *   then only what differs from the defaults, one `key-value` field each:
 *     ra / rb / rc / ri   base run of wall A / B / C / the island: type codes + widths, "l60s80d60" ("0" = empty); a tall
 *                         unit standing in a wall's run (CabinetSpec.tall) is its tall code after a capital T ("l60Tr60d60"
 *                         = drawers, a fridge column, the dishwasher), the filler strip at a wall / corner end "f3"
 *     ua / ub / uc        wall units of wall A / B / C (same)
 *     t                   tall column, left → right (same)
 *     kbl kbr kul kur     blind-corner type codes (base-l, base-r, upper-l, upper-r)
 *     fb fu ft fi         front of the base / upper / tall / island zone
 *     hc si ta ap pl le   handle colour, sink, tap, appliances, plinth, LED (catalogue finish ids)
 *     zw zf               room: wall colour, floor
 *     h                   heights (KitchenConfig.heights): mode n / s / c (standard / do-stropa / custom), then
 *                         u<wall-unit height> t<tall column top> (custom) and p<worktop> (not 90): "s", "sp95", "cu90t240"
 *     o                   island / peninsula (KitchenConfig.islandSpec without its bar), letter + number tokens, only
 *                         what differs from the defaults: f1 / f2 / f3 hob / sink / both on it · l peninsula at the left end ·
 *                         d<body depth> · s1 / s2 seats at the left / right end · p<overhang> · n<stools> · w0 no waterfall ·
 *                         h0 no hood above the island hob (downdraft) · a<hood above the worktop>: "o-f1p30n3", "o-ld90w0"
 *     s                   bar (islandSpec.bar): r (raised) / t (table), then h<height> d<depth> l<length>: "s-r", "s-rh115d40l180"
 *     st                  the bar's own top (catalog.tops id): "st-hrast"
 *     ea / eb / ec        where the kitchen stands on wall A / B / C (KitchenConfig.extents), letter + number tokens:
 *                         l<length> o<offset> and x (offset from the other end than the wall's corner end): "eb-l300",
 *                         "eb-o64", "ea-xl240"
 *     tp                  where the tall column stands (tallAt): wall + l / r, "tp-bl"
 *     tal tar tbl tbr tcl tcr   more tall columns at that run end (tallRuns, same list format as `t`): "tbl-rs96"
 *     zwa zwb zwc         room: the finish of one wall (room.walls)
 *
 * v1 (still decoded):
 *   1.L.380.220.220.260.antracit.mramor.bez.1.240.1.0.0 — the 14th field holds positional element edits
 *   ("ab2-vrata_bu0-vitrina"), which sanitizeConfig converts into the v2 lists.
 *
 * Only [A-Za-z0-9._-] are used, so URLSearchParams never percent-encodes it. Codes are lowercase letters
 * (catalog.modules[].code), widths whole cm. decodeConfig is forgiving: unknown ids fall back to defaults,
 * lengths are clamped, broken entries are dropped. It also accepts a base64url JSON KitchenConfig.
 */

import { moduleByCode, moduleDef, type ModuleZone } from "./catalog";
import { RUN_ENDS, defaultAnchor, sanitizeConfig } from "./plan";
import {
  DEFAULT_CONFIG,
  type BarSpec,
  type BaseRunId,
  type CabinetSpec,
  type CornerId,
  type FrontZone,
  type HeightSpec,
  type IslandFunctions,
  type IslandSpec,
  type KitchenConfig,
  type KitchenExtent,
  type RunEnd,
  type WallId,
} from "./types";

export { sanitizeConfig };

const ZONE_SHORT: Record<string, string> = { base: "b", upper: "u" };

function longId(s: string): string | null {
  let m = /^([abc])([bu])(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2] === "b" ? "base" : "upper"}-${m[3]}`;
  m = /^t(\d)$/.exec(s);
  if (m) return `tall-${m[1]}`;
  m = /^i(\d{1,2})$/.exec(s);
  if (m) return `isl-${m[1]}`;
  return null;
}

/** v1 short slot id (kept for reference / tests: "a-base-2" → "ab2") */
export function shortSlotId(id: string): string | null {
  let m = /^([abc])-(base|upper)-(\d{1,2})$/.exec(id);
  if (m) return `${m[1]}${ZONE_SHORT[m[2]]}${m[3]}`;
  m = /^tall-(\d)$/.exec(id);
  if (m) return `t${m[1]}`;
  m = /^isl-(\d{1,2})$/.exec(id);
  if (m) return `i${m[1]}`;
  return null;
}

const SAFE = /^[a-z0-9]+$/i;
/** catalogue ids may contain "-" (they always sit after the key's first "-") */
const SAFE_ID = /^[a-z0-9-]+$/i;

const RUN_KEYS: [string, BaseRunId][] = [
  ["ra", "a"],
  ["rb", "b"],
  ["rc", "c"],
  ["ri", "isl"],
];
const UPPER_KEYS: [string, WallId][] = [
  ["ua", "a"],
  ["ub", "b"],
  ["uc", "c"],
];
const CORNER_KEYS: [string, CornerId][] = [
  ["kbl", "base-l"],
  ["kbr", "base-r"],
  ["kul", "upper-l"],
  ["kur", "upper-r"],
];
const FRONT_KEYS: [string, FrontZone][] = [
  ["fb", "base"],
  ["fu", "upper"],
  ["ft", "tall"],
  ["fi", "island"],
];
const WALL_IDS: WallId[] = ["a", "b", "c"];
/** "b-left" ↔ "bl" (tp-bl, tbl-…) */
const endCode = (e: RunEnd) => `${e[0]}${e.includes("left") ? "l" : "r"}`;
const endOf = (code: string): RunEnd | undefined => RUN_ENDS.find((e) => endCode(e) === code);

function encodeExtent(w: WallId, e: KitchenExtent): string {
  let out = "";
  if (e.anchor && e.anchor !== defaultAnchor(w)) out += "x";
  if (e.offset !== undefined) out += `o${Math.round(e.offset)}`;
  if (e.length !== undefined) out += `l${Math.round(e.length)}`;
  return out;
}

function decodeExtent(w: WallId, s: string): Record<string, unknown> | null {
  const t = tokens(s);
  if (!t) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of t) {
    if (k === "x" && !v) out.anchor = defaultAnchor(w) === "left" ? "right" : "left";
    else if (k === "o" && v) out.offset = Number(v);
    else if (k === "l" && v) out.length = Number(v);
  }
  return out;
}

const FINISH_KEYS: [string, "handleColor" | "sink" | "tap" | "appliances" | "plinth" | "led"][] = [
  ["hc", "handleColor"],
  ["si", "sink"],
  ["ta", "tap"],
  ["ap", "appliances"],
  ["pl", "plinth"],
  ["le", "led"],
];

function encodeList(list: CabinetSpec[], zone: ModuleZone): string {
  if (!list.length) return "0";
  return list
    .map((e) => {
      // a tall unit standing in a base run: "T" + its tall code
      const code = moduleDef(e.tall ? "tall" : zone, e.type)?.code;
      return code ? `${e.tall ? "T" : ""}${code}${Math.round(e.width)}` : "";
    })
    .join("");
}

function decodeList(s: string, zone: ModuleZone): CabinetSpec[] {
  if (s === "0") return [];
  const out: CabinetSpec[] = [];
  const re = /(T?)([a-z]+)(\d{1,3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && out.length < 40) {
    const tall = m[1] === "T";
    // (sanitizeConfig drops a tall unit from any list but a wall's base run)
    const def = moduleByCode(tall ? "tall" : zone, m[2]);
    if (def) out.push(tall ? { type: def.id, width: Number(m[3]), tall: true } : { type: def.id, width: Number(m[3]) });
  }
  return out;
}

/** Compact, URL-safe string for `?k=` */
export function encodeConfig(input: KitchenConfig): string {
  const c = sanitizeConfig(input);
  const win = c.window ? `${c.window.wall}-${c.window.offset}-${c.window.width}-${c.window.sill}` : "0";
  const parts: (string | number)[] = [
    "2",
    c.layout,
    c.walls.a,
    c.walls.b,
    c.walls.c,
    c.ceiling,
    c.front,
    c.top,
    c.handles,
    c.tall ? 1 : 0,
    c.island,
    c.led ? 1 : 0,
    win,
  ];
  for (const [k, r] of RUN_KEYS) {
    const l = c.runs?.[r];
    if (l) parts.push(`${k}-${encodeList(l, "base")}`);
  }
  for (const [k, r] of UPPER_KEYS) {
    const l = c.upperRuns?.[r];
    if (l) parts.push(`${k}-${encodeList(l, "upper")}`);
  }
  if (c.tallRun?.length) parts.push(`t-${encodeList(c.tallRun, "tall")}`);
  for (const [k, id] of CORNER_KEYS) {
    const t = c.corners?.[id];
    const code = t ? moduleDef(id.startsWith("base") ? "base" : "upper", t)?.code : undefined;
    if (code) parts.push(`${k}-${code}`);
  }
  for (const [k, z] of FRONT_KEYS) {
    const f = c.zoneFronts?.[z];
    if (f && SAFE_ID.test(f)) parts.push(`${k}-${f}`);
  }
  for (const [k, f] of FINISH_KEYS) {
    const v = c.finish?.[f];
    if (v && SAFE_ID.test(v)) parts.push(`${k}-${v}`);
  }
  if (c.room?.wall && SAFE_ID.test(c.room.wall)) parts.push(`zw-${c.room.wall}`);
  if (c.room?.floor && SAFE_ID.test(c.room.floor)) parts.push(`zf-${c.room.floor}`);
  for (const w of WALL_IDS) {
    const f = c.room?.walls?.[w];
    if (f && SAFE_ID.test(f)) parts.push(`zw${w}-${f}`);
  }
  for (const w of WALL_IDS) {
    const e = c.extents?.[w];
    const enc = e ? encodeExtent(w, e) : "";
    if (enc) parts.push(`e${w}-${enc}`);
  }
  if (c.tallAt) parts.push(`tp-${endCode(c.tallAt)}`);
  for (const e of RUN_ENDS) {
    const l = c.tallRuns?.[e];
    if (l?.length) parts.push(`t${endCode(e)}-${encodeList(l, "tall")}`);
  }
  if (c.heights) parts.push(`h-${encodeHeights(c.heights)}`);
  if (c.islandSpec) {
    const o = encodeIsland(c.islandSpec);
    if (o) parts.push(`o-${o}`);
    const b = c.islandSpec.bar;
    if (b) {
      parts.push(`s-${encodeBar(b)}`);
      if (b.top && SAFE_ID.test(b.top)) parts.push(`st-${b.top}`);
    }
  }
  return parts.join(".");
}

const FUNCTION_CODE: Record<Exclude<IslandFunctions, "none">, string> = { hob: "1", sink: "2", both: "3" };

/** islandSpec without its bar as tokens (sanitized input: only non-default fields are present) */
function encodeIsland(o: IslandSpec): string {
  let out = "";
  if (o.functions && o.functions !== "none") out += `f${FUNCTION_CODE[o.functions]}`;
  if (o.side === "left") out += "l";
  if (o.depth !== undefined) out += `d${Math.round(o.depth)}`;
  if (o.seatSide === "left") out += "s1";
  else if (o.seatSide === "right") out += "s2";
  if (o.overhang !== undefined) out += `p${Math.round(o.overhang)}`;
  if (o.stools !== undefined) out += `n${Math.round(o.stools)}`;
  if (o.waterfall === false) out += "w0";
  if (o.hood !== undefined) out += `h${o.hood ? 1 : 0}`;
  if (o.hoodAbove !== undefined) out += `a${Math.round(o.hoodAbove)}`;
  return out;
}

function encodeBar(b: BarSpec): string {
  let out = b.kind === "table" ? "t" : "r";
  if (b.height !== undefined) out += `h${Math.round(b.height)}`;
  if (b.depth !== undefined) out += `d${Math.round(b.depth)}`;
  if (b.length !== undefined) out += `l${Math.round(b.length)}`;
  return out;
}

/** letter + number tokens ("f1d90w0" → [["f","1"],["d","90"],["w","0"]]); null when the string is not made of them */
function tokens(s: string): [string, string][] | null {
  if (!/^(?:[a-z]\d{0,3})+$/.test(s)) return null;
  return [...s.matchAll(/([a-z])(\d{0,3})/g)].map((m) => [m[1], m[2]]);
}

function decodeIsland(s: string, into: Record<string, unknown>): void {
  const t = tokens(s);
  if (!t) return;
  for (const [k, v] of t) {
    const n = Number(v);
    if (k === "f") into.functions = (Object.keys(FUNCTION_CODE) as (keyof typeof FUNCTION_CODE)[]).find((f) => FUNCTION_CODE[f] === v);
    else if (k === "l") into.side = "left";
    else if (k === "d" && v) into.depth = n;
    else if (k === "s") into.seatSide = v === "1" ? "left" : v === "2" ? "right" : undefined;
    else if (k === "p" && v) into.overhang = n;
    else if (k === "n" && v) into.stools = n;
    else if (k === "w" && v === "0") into.waterfall = false;
    else if (k === "h" && v) into.hood = v === "1";
    else if (k === "a" && v) into.hoodAbove = n;
  }
}

function decodeBar(s: string): Record<string, unknown> | null {
  const t = tokens(s);
  if (!t || !t.length || (t[0][0] !== "r" && t[0][0] !== "t") || t[0][1]) return null;
  const out: Record<string, unknown> = { kind: t[0][0] === "t" ? "table" : "raised" };
  for (const [k, v] of t.slice(1)) {
    if (!v) continue;
    if (k === "h") out.height = Number(v);
    else if (k === "d") out.depth = Number(v);
    else if (k === "l") out.length = Number(v);
  }
  return out;
}

const HEIGHT_MODE: Record<HeightSpec["mode"], string> = { standard: "n", "do-stropa": "s", custom: "c" };

function encodeHeights(h: HeightSpec): string {
  let out = HEIGHT_MODE[h.mode];
  if (h.mode === "custom") {
    if (h.upper !== undefined) out += `u${Math.round(h.upper)}`;
    if (h.tallTop !== undefined) out += `t${Math.round(h.tallTop)}`;
  }
  if (h.worktop !== undefined) out += `p${Math.round(h.worktop)}`;
  return out;
}

function decodeHeights(s: string): HeightSpec | null {
  const m = /^([nsc])(?:u(\d{2,3}))?(?:t(\d{3}))?(?:p(\d{2,3}))?$/.exec(s);
  if (!m) return null;
  const mode = (Object.keys(HEIGHT_MODE) as HeightSpec["mode"][]).find((k) => HEIGHT_MODE[k] === m[1]) ?? "standard";
  const out: HeightSpec = { mode };
  if (m[2]) out.upper = Number(m[2]);
  if (m[3]) out.tallTop = Number(m[3]);
  if (m[4]) out.worktop = Number(m[4]);
  return out;
}

function fromBase64Url(s: string): string | null {
  try {
    const b64 = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 ? "=".repeat(4 - (b64.length % 4)) : "";
    return atob(b64 + pad);
  } catch {
    return null;
  }
}

/** the 13 fields v1 and v2 share */
function headFields(p: string[]): Record<string, unknown> {
  const n = (i: number, d: number) => {
    const v = Number(p[i]);
    return Number.isFinite(v) ? v : d;
  };
  let window: unknown = null;
  if (p[12] && p[12] !== "0") {
    const w = p[12].split("-");
    if (w.length === 4 && ["a", "b", "c"].includes(w[0])) {
      window = { wall: w[0] as WallId, offset: Number(w[1]), width: Number(w[2]), sill: Number(w[3]) };
    }
  }
  const d = DEFAULT_CONFIG;
  return {
    v: 1,
    layout: p[1],
    walls: { a: n(2, d.walls.a), b: n(3, d.walls.b), c: n(4, d.walls.c) },
    ceiling: n(5, d.ceiling),
    front: p[6],
    top: p[7],
    handles: p[8],
    tall: p[9] === "1" ? true : p[9] === "0" ? false : d.tall,
    island: n(10, d.island),
    led: p[11] === "1" ? true : p[11] === "0" ? false : d.led,
    window,
    overrides: {},
  };
}

/** Parse a share string. Returns null only if it is not a studio link at all. */
export function decodeConfig(s: string): KitchenConfig | null {
  if (typeof s !== "string") return null;
  const str = s.trim();
  if (!str || str.length > 2000) return null;

  if (str.startsWith("1.")) {
    const p = str.split(".");
    if (p.length < 12) return null;
    const overrides: Record<string, string> = {};
    if (p[13] && p[13] !== "0") {
      for (const entry of p[13].split("_")) {
        const k = entry.lastIndexOf("-");
        if (k <= 0) continue;
        const id = longId(entry.slice(0, k));
        const type = entry.slice(k + 1);
        if (id && SAFE.test(type)) overrides[id] = type;
      }
    }
    return sanitizeConfig({ ...headFields(p), overrides });
  }

  if (str.startsWith("2.")) {
    const p = str.split(".");
    if (p.length < 12) return null;
    const cfg: Record<string, unknown> = headFields(p);
    const runs: Partial<Record<BaseRunId, CabinetSpec[]>> = {};
    const upperRuns: Partial<Record<WallId, CabinetSpec[]>> = {};
    const corners: Partial<Record<CornerId, string>> = {};
    const zoneFronts: Partial<Record<FrontZone, string>> = {};
    const finish: Record<string, string> = {};
    const room: Record<string, string> = {};
    const island: Record<string, unknown> = {};
    let bar: Record<string, unknown> | null = null;
    let barTop: string | null = null;
    const extents: Record<string, unknown> = {};
    const tallRuns: Record<string, CabinetSpec[]> = {};
    const roomWalls: Record<string, string> = {};
    for (const field of p.slice(13)) {
      const k = field.indexOf("-");
      if (k <= 0) continue;
      const key = field.slice(0, k);
      const val = field.slice(k + 1);
      const run = RUN_KEYS.find(([x]) => x === key);
      if (run) {
        runs[run[1]] = decodeList(val, "base");
        continue;
      }
      const up = UPPER_KEYS.find(([x]) => x === key);
      if (up) {
        upperRuns[up[1]] = decodeList(val, "upper");
        continue;
      }
      if (key === "t") {
        cfg.tallRun = decodeList(val, "tall");
        continue;
      }
      // tallRuns columns: "tbl-…" (t + wall + l / r)
      const te = /^t([abc][lr])$/.exec(key);
      if (te) {
        const end = endOf(te[1]);
        if (end) tallRuns[end] = decodeList(val, "tall");
        continue;
      }
      const ex = /^e([abc])$/.exec(key);
      if (ex) {
        const e = decodeExtent(ex[1] as WallId, val);
        if (e) extents[ex[1]] = e;
        continue;
      }
      if (key === "tp") {
        const end = endOf(val);
        if (end) cfg.tallAt = end;
        continue;
      }
      const co = CORNER_KEYS.find(([x]) => x === key);
      if (co) {
        const def = moduleByCode(co[1].startsWith("base") ? "base" : "upper", val);
        if (def) corners[co[1]] = def.id;
        continue;
      }
      if (!SAFE_ID.test(val)) continue;
      const fr = FRONT_KEYS.find(([x]) => x === key);
      if (fr) {
        zoneFronts[fr[1]] = val;
        continue;
      }
      const fi = FINISH_KEYS.find(([x]) => x === key);
      if (fi) {
        finish[fi[1]] = val;
        continue;
      }
      if (key === "zw") room.wall = val;
      else if (key === "zf") room.floor = val;
      else if (/^zw[abc]$/.test(key)) roomWalls[key[2]] = val;
      else if (key === "h") {
        const h = decodeHeights(val);
        if (h) cfg.heights = h;
      } else if (key === "o") decodeIsland(val, island);
      else if (key === "s") bar = decodeBar(val);
      else if (key === "st") barTop = val;
    }
    if (bar && barTop) bar.top = barTop;
    if (bar) island.bar = bar;
    if (Object.keys(island).length) cfg.islandSpec = island;
    if (Object.keys(runs).length) cfg.runs = runs;
    if (Object.keys(upperRuns).length) cfg.upperRuns = upperRuns;
    if (Object.keys(corners).length) cfg.corners = corners;
    if (Object.keys(zoneFronts).length) cfg.zoneFronts = zoneFronts;
    if (Object.keys(finish).length) cfg.finish = finish;
    if (Object.keys(roomWalls).length) (room as Record<string, unknown>).walls = roomWalls;
    if (Object.keys(room).length) cfg.room = room;
    if (Object.keys(extents).length) cfg.extents = extents;
    if (Object.keys(tallRuns).length) cfg.tallRuns = tallRuns;
    return sanitizeConfig(cfg);
  }

  // base64url JSON fallback
  const json = fromBase64Url(str);
  if (!json) return null;
  try {
    const obj: unknown = JSON.parse(json);
    if (typeof obj !== "object" || obj === null || !("layout" in obj)) return null;
    return sanitizeConfig(obj);
  } catch {
    return null;
  }
}

const LAYOUT_BY_NAME: Record<string, KitchenConfig["layout"]> = { ravna: "ravna", l: "L", u: "U", otok: "otok", poluotok: "poluotok", g: "G" };

/**
 * Initial studio config from the URL: `?k=` (shared kitchen) wins, otherwise
 * `?oblik=` (ravna | L | U | otok | poluotok | G) preselects the shape and `?front=` / `?top=`
 * a material, on top of DEFAULT_CONFIG. Unknown values fall back to defaults.
 */
export function configFromQuery(q: {
  k?: string | null;
  oblik?: string | null;
  front?: string | null;
  top?: string | null;
}): KitchenConfig {
  const fromLink = q.k ? decodeConfig(q.k) : null;
  if (fromLink) return fromLink;
  const layout = (q.oblik && LAYOUT_BY_NAME[q.oblik.trim().toLowerCase()]) || DEFAULT_CONFIG.layout;
  return sanitizeConfig({
    ...DEFAULT_CONFIG,
    layout,
    front: q.front ?? DEFAULT_CONFIG.front,
    top: q.top ?? DEFAULT_CONFIG.top,
  });
}

/** "/studio?k=…" — prefix with the site origin for an absolute link */
export function studioPath(cfg: KitchenConfig): string {
  return `/studio?k=${encodeConfig(cfg)}`;
}
