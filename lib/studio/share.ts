/**
 * Share links: a whole kitchen in a short, URL-safe string (no database).
 *
 *   1.L.380.220.220.260.antracit.mramor.bez.1.240.1.0.0
 *   │ │  a   b   c  strop fronta  ploča ručke │  otok │ │ └ izmjene: "ab2-vrata_bu0-vitrina" ili 0
 *   │ └ oblik                         visoki stup  LED └ prozor: "a-120-100-95" (zid-udaljenost-širina-parapet) ili 0
 *   └ verzija
 *
 * Only [A-Za-z0-9._-] are used, so URLSearchParams never percent-encodes it.
 * decodeConfig is forgiving: unknown ids fall back to defaults, lengths are
 * clamped, broken override entries are dropped. It also accepts a base64url
 * JSON KitchenConfig (for future versions / debugging).
 */

import { sanitizeConfig } from "./plan";
import { DEFAULT_CONFIG, type KitchenConfig, type Layout, type WallId } from "./types";

export { sanitizeConfig };

const ZONE_SHORT: Record<string, string> = { base: "b", upper: "u" };

function shortId(id: string): string | null {
  let m = /^([abc])-(base|upper)-(\d{1,2})$/.exec(id);
  if (m) return `${m[1]}${ZONE_SHORT[m[2]]}${m[3]}`;
  m = /^tall-(\d)$/.exec(id);
  if (m) return `t${m[1]}`;
  m = /^isl-(\d{1,2})$/.exec(id);
  if (m) return `i${m[1]}`;
  return null;
}

function longId(s: string): string | null {
  let m = /^([abc])([bu])(\d{1,2})$/.exec(s);
  if (m) return `${m[1]}-${m[2] === "b" ? "base" : "upper"}-${m[3]}`;
  m = /^t(\d)$/.exec(s);
  if (m) return `tall-${m[1]}`;
  m = /^i(\d{1,2})$/.exec(s);
  if (m) return `isl-${m[1]}`;
  return null;
}

const SAFE = /^[a-z0-9]+$/i;

/** Compact, URL-safe string for `?k=` */
export function encodeConfig(input: KitchenConfig): string {
  const c = sanitizeConfig(input);
  const win = c.window ? `${c.window.wall}-${c.window.offset}-${c.window.width}-${c.window.sill}` : "0";
  const ov = Object.entries(c.overrides)
    .map(([id, type]) => {
      const s = shortId(id);
      return s && SAFE.test(type) ? `${s}-${type}` : null;
    })
    .filter((x): x is string => x !== null)
    .sort()
    .join("_");
  return [
    "1",
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
    ov || "0",
  ].join(".");
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

/** Parse a share string. Returns null only if it is not a studio link at all. */
export function decodeConfig(s: string): KitchenConfig | null {
  if (typeof s !== "string") return null;
  const str = s.trim();
  if (!str || str.length > 2000) return null;

  if (str.startsWith("1.")) {
    const p = str.split(".");
    if (p.length < 12) return null;
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
    const d = DEFAULT_CONFIG;
    return sanitizeConfig({
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
      overrides,
    });
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

const LAYOUT_BY_NAME: Record<string, Layout> = { ravna: "ravna", l: "L", u: "U", otok: "otok" };

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
