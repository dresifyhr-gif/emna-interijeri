/**
 * Front layouts the 3D engine (lib/studio/engine/modules.ts) and the 2D drawings (lib/studio/drawings/face.ts,
 * floorplan.ts) share, so both show exactly the same element: the drawer split of a drawer unit (with the Gola channel
 * between its drawers), the oven column's variants (door / drawers below, oven low or at eye level, microwave above),
 * the sink bowl's place in its cabinet and the hob's width. Pure: cm, no three.js, no DOM.
 *
 * What an absent option means is always what every older link drew: the engine and the drawings got these numbers from
 * here once the "photo" round added the options, not new ones.
 */

import { catalog, drawerLayoutDef } from "./catalog";
import type { DrawerLayout, ElementOpts, KitchenConfig } from "./types";

// ---------------------------------------------------------------- drawers

/** the drawer units (and the hob over drawers) and the split each has of its own */
export const DRAWER_TYPES: Readonly<Record<string, DrawerLayout>> = { ladice: "1+2", ladice2: "duboke2", ladice4: "4", ploca: "1+2" };

/** the Gola channel between two drawers (KitchenConfig.gola.between), cm — the same profile as under the worktop */
export const GOLA_MID = 3.5;

/** a drawer unit's split: its own (opt.drawers), the kitchen's (KitchenConfig.drawerLayout), the type's; null = no drawer unit */
export function drawerLayoutOf(cfg: Pick<KitchenConfig, "drawerLayout">, type: string, opt?: ElementOpts): DrawerLayout | null {
  const own = DRAWER_TYPES[type];
  if (!own) return null;
  return opt?.drawers ?? cfg.drawerLayout ?? own;
}

/** front heights of a drawer unit, top → bottom, as shares of its stack (null: not a drawer unit) */
export function drawerRatios(cfg: Pick<KitchenConfig, "drawerLayout">, type: string, opt?: ElementOpts): number[] | null {
  const id = drawerLayoutOf(cfg, type, opt);
  if (!id) return null;
  return drawerLayoutDef(id)?.ratios ?? drawerLayoutDef(DRAWER_TYPES[type])?.ratios ?? null;
}

/** drawers beyond the type's own (price.ts: catalog.extras.drawerExtra each) */
export function extraDrawers(cfg: Pick<KitchenConfig, "drawerLayout">, type: string, opt?: ElementOpts): number {
  const own = drawerLayoutDef(DRAWER_TYPES[type])?.ratios.length ?? 0;
  const now = drawerRatios(cfg, type, opt)?.length ?? own;
  return Math.max(0, now - own);
}

/** the Gola channel runs between the drawers (handleless fronts with KitchenConfig.gola.between) */
export function golaBetween(cfg: Pick<KitchenConfig, "gola">, handles: string): boolean {
  return handles === "bez" && cfg.gola?.between === true;
}

/**
 * A stack of drawers from y0 to y1 (y1 = under the worktop's Gola channel / the carcass top), top → bottom: each
 * front's [from, to] and, with `mid` (the Gola channel between drawers), the channels between them. Without `mid`
 * exactly the split every older drawer unit had (each front `ratio × (y1 − y0)`).
 */
export function drawerStack(y0: number, y1: number, ratios: readonly number[], mid = false): { fronts: [number, number][]; channels: [number, number][] } {
  const fronts: [number, number][] = [];
  const channels: [number, number][] = [];
  const n = ratios.length;
  const H = y1 - y0 - (mid ? (n - 1) * GOLA_MID : 0);
  let y = y1;
  ratios.forEach((r, i) => {
    if (mid && i > 0) {
      channels.push([y - GOLA_MID, y]);
      y -= GOLA_MID;
    }
    const h = r * H;
    fronts.push([y - h, y]);
    y -= h;
  });
  return { fronts, channels };
}

// ---------------------------------------------------------------- oven column

/** what an oven column ("pecnica" / "pecnica-mikro") holds, bottom → top (cm in the frame it was asked in) */
export interface OvenColumn {
  /** the drawers under the oven (top → bottom), or [] with a door */
  drawers: [number, number][];
  /** one door under the oven (ElementOpts.below "vrata"), or null */
  door: [number, number] | null;
  /** the oven's drop-down door */
  oven: [number, number];
  /** the control strip above it */
  strip: [number, number];
  /** the microwave above the oven ("pecnica-mikro"), or null */
  micro: [number, number] | null;
  /** the door of the cabinet above (null when there is no room for one) */
  above: [number, number] | null;
}

/** oven door + strip, microwave (cm) — what modules.ts always built */
export const OVEN = { height: 59.5, strip: 9, micro: 38 } as const;

/**
 * An oven column from y0 (its plinth top) to y1 (its top), `worktop` = the worktop surface in the same frame. Absent
 * options = every older column: two drawers of min(29, 14 % of the column) under the oven, the door / microwave above.
 *   ovenAt "nisko"  the oven one drawer's height above the plinth
 *   ovenAt "oci"    the oven's bottom on the worktop line (eye level), the microwave above it
 *   below "vrata"   one door under the oven instead of drawers
 */
export function ovenColumn(y0: number, y1: number, worktop: number, micro: boolean, opt?: ElementOpts): OvenColumn {
  const H = y1 - y0;
  const drawerH = Math.min(29, H * 0.14);
  const need = OVEN.height + (micro ? OVEN.micro + 12 : 20);
  let ovenY0 = y0 + 2 * drawerH;
  if (opt?.ovenAt === "nisko") ovenY0 = y0 + drawerH;
  else if (opt?.ovenAt === "oci") ovenY0 = Math.max(y0 + drawerH, Math.min(worktop, y1 - need));
  const ovenY1 = Math.min(y1 - 20, ovenY0 + OVEN.height);
  const strip: [number, number] = [ovenY1 - OVEN.strip, ovenY1];
  const oven: [number, number] = [ovenY0, ovenY1 - OVEN.strip];
  let drawers: [number, number][] = [];
  let door: [number, number] | null = null;
  if (opt?.below === "vrata") door = ovenY0 - y0 > 10 ? [y0, ovenY0] : null;
  else if (!opt?.ovenAt) drawers = [
    [y0 + drawerH, y0 + 2 * drawerH],
    [y0, y0 + drawerH],
  ];
  else {
    // as many drawers of about a standard drawer's height as fit under the oven
    const n = Math.max(1, Math.round((ovenY0 - y0) / Math.max(1, drawerH)));
    const h = (ovenY0 - y0) / n;
    for (let i = n - 1; i >= 0; i--) drawers.push([y0 + i * h, y0 + (i + 1) * h]);
    if (ovenY0 - y0 < 6) drawers = [];
  }
  let m: [number, number] | null = null;
  let above: [number, number] | null = null;
  if (micro) {
    const microY1 = Math.min(y1 - 12, ovenY1 + OVEN.micro);
    m = [ovenY1, microY1];
    if (y1 - microY1 > 12) above = [microY1, y1];
  } else if (y1 - ovenY1 > 15) above = [ovenY1, y1];
  return { drawers, door, oven, strip, micro: m, above };
}

// ---------------------------------------------------------------- sink and hob

/** the sink bowl in its cabinet (cm, element-local x): width, and where it sits (ElementOpts.bowl; centred = every older sink) */
export function sinkBowl(width: number, opt?: ElementOpts): { x0: number; x1: number; wide: boolean } {
  const wide = width >= 99;
  const bw = Math.min(width - 14, wide ? 86 : 70);
  const margin = 7;
  let xc = width / 2;
  if (opt?.bowl === "left") xc = margin + bw / 2;
  else if (opt?.bowl === "right") xc = width - margin - bw / 2;
  return { x0: xc - bw / 2, x1: xc + bw / 2, wide };
}

/** hob widths a hob can have of its own (ElementOpts.hob), cm — the glass sizes hobs come in */
export const HOB_WIDTHS = [30, 58, 60, 70, 78, 80, 88, 90] as const;

/** the hob's glass width in its cabinet (cm): its own (opt.hob, at most the cabinet less 2 cm), else what the cabinet takes (60 → 58, 80–90 → 78, ≥ 100 → 88) */
export function hobWidthOf(width: number, opt?: ElementOpts): number {
  const auto = Math.min(width >= 99 ? 88 : width >= 80 ? 78 : 58, width - 4);
  if (opt?.hob === undefined) return auto;
  return Math.min(opt.hob, width - 2);
}

/** catalog check: the drawer layout ids (sanitize) */
export const DRAWER_LAYOUT_IDS: readonly DrawerLayout[] = catalog.drawerLayouts.map((d) => d.id);
