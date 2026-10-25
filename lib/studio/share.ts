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
 *     ra / rb / rc / ri   base run of wall A / B / C / the island: type codes + widths, "l60s80d60" ("0" = empty)
 *     ua / ub / uc        wall units of wall A / B / C (same)
 *     t                   tall column, left → right (same)
 *     kbl kbr kul kur     blind-corner type codes (base-l, base-r, upper-l, upper-r)
 *     fb fu ft fi         front of the base / upper / tall / island zone
 *     hc si ta ap pl le   handle colour, sink, tap, appliances, plinth, LED (catalogue finish ids)
 *     zw zf               room: wall colour, floor
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
import { sanitizeConfig } from "./plan";
import { DEFAULT_CONFIG, type BaseRunId, type CabinetSpec, type CornerId, type FrontZone, type KitchenConfig, type WallId } from "./types";

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
      const code = moduleDef(zone, e.type)?.code;
      return code ? `${code}${Math.round(e.width)}` : "";
    })
    .join("");
}

function decodeList(s: string, zone: ModuleZone): CabinetSpec[] {
  if (s === "0") return [];
  const out: CabinetSpec[] = [];
  const re = /([a-z]+)(\d{1,3})/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) && out.length < 40) {
    const def = moduleByCode(zone, m[1]);
    if (def) out.push({ type: def.id, width: Number(m[2]) });
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
  return parts.join(".");
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
    }
    if (Object.keys(runs).length) cfg.runs = runs;
    if (Object.keys(upperRuns).length) cfg.upperRuns = upperRuns;
    if (Object.keys(corners).length) cfg.corners = corners;
    if (Object.keys(zoneFronts).length) cfg.zoneFronts = zoneFronts;
    if (Object.keys(finish).length) cfg.finish = finish;
    if (Object.keys(room).length) cfg.room = room;
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

const LAYOUT_BY_NAME: Record<string, KitchenConfig["layout"]> = { ravna: "ravna", l: "L", u: "U", otok: "otok" };

/**
 * Initial studio config from the URL: `?k=` (shared kitchen) wins, otherwise
 * `?oblik=` (ravna | L | U | otok) preselects the shape and `?front=` / `?top=`
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
