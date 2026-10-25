/**
 * Human-readable Croatian summary of a kitchen, one line per item.
 * Goes into the lead e-mail (owner + customer), the admin and the studio "Sažetak".
 * `composition()` is the same element list as structured data (offers, admin).
 */

import {
  FINISH_DEFAULTS,
  defaultHandleColor,
  finishDef,
  frontDef,
  handleColorDef,
  handleDef,
  moduleDef,
  roomFloorDef,
  roomWallDef,
  topDef,
} from "./catalog";
import { frontFor, planKitchen, type KitchenPlan, type ListId, type SlotZone } from "./plan";
import { backsplashArea } from "./price";
import type { FrontZone, KitchenConfig, Layout, WallId } from "./types";

const LAYOUT_NAME: Record<Layout, string> = {
  ravna: "ravna kuhinja",
  L: "kuhinja u obliku slova L",
  U: "kuhinja u obliku slova U",
  otok: "ravna kuhinja s otokom",
};

const WALL_NAME: Record<WallId, string> = { a: "A", b: "B", c: "C" };
const WALL_HINT: Record<WallId, string> = { a: "stražnji", b: "lijevi", c: "desni" };
const ZONE_FRONT_LABEL: Record<FrontZone, string> = {
  base: "Fronte donjih elemenata",
  upper: "Fronte gornjih elemenata",
  tall: "Fronte visokog stupa",
  island: "Fronte otoka",
};

/**
 * Friendly name of a plan slot for people (owner e-mail, studio summary):
 * "a-base-1" → "Zid A · 2. donji slijeva", "tall-0" → "Visoki stup · 1. slijeva",
 * "isl-1" → "Otok · 2. slijeva". Counted left → right, standing in the room facing that wall
 * (the island from the wall-A side). Unknown ids come back as "Element <id>".
 */
export function slotName(id: string): string {
  const m = /^([abc])-(base|upper)-(\d+)$/.exec(id);
  if (m) return `Zid ${m[1].toUpperCase()} · ${Number(m[3]) + 1}. ${m[2] === "base" ? "donji" : "gornji"} slijeva`;
  const t = /^tall-(\d+)$/.exec(id);
  if (t) return `Visoki stup · ${Number(t[1]) + 1}. slijeva`;
  const i = /^isl-(\d+)$/.exec(id);
  if (i) return `Otok · ${Number(i[1]) + 1}. slijeva`;
  return `Element ${id}`;
}

export interface CompositionItem {
  slotId: string;
  type: string;
  name: string;
  /** cm */
  width: number;
  /** left edge along the run (cm) */
  x: number;
  /** EUR mechanism / fitting add-on from the catalogue (TODO(vlasnik): unconfirmed) */
  priceAdd: number;
  corner: boolean;
  /** empty space, not a cabinet */
  spacer: boolean;
}

export interface CompositionRow {
  /** the editable list (corners are listed in their wall's base / wall-unit row) */
  list: ListId;
  zone: SlotZone;
  /** "Zid A · donji elementi", "Zid B · gornji elementi", "Visoki stup", "Otok" */
  label: string;
  /** the customer edited this run */
  edited: boolean;
  /** front material id of this zone */
  front: string;
  items: CompositionItem[];
}

function rowLabel(list: ListId): string {
  if (list === "tall") return "Visoki stup";
  if (list === "isl") return "Otok";
  return `Zid ${list[0].toUpperCase()} · ${list.endsWith(":u") ? "gornji" : "donji"} elementi`;
}

/** every cabinet of the kitchen, run by run, left → right — exactly what the 3D view draws and price.ts prices */
export function composition(cfg: KitchenConfig, plan: KitchenPlan = planKitchen(cfg)): CompositionRow[] {
  const c = plan.cfg;
  const rows: CompositionRow[] = [];
  for (const l of plan.lists) {
    const run = l.id === "tall" || l.id === "isl" ? null : (l.id[0] as WallId);
    const zone: SlotZone = l.zone;
    const slots = plan.slots
      .filter((s) => (l.id === "tall" ? s.zone === "tall" : l.id === "isl" ? s.zone === "island" : s.run === run && s.zone === zone))
      .sort((p, q) => p.x - q.x);
    if (!slots.length) continue;
    const edited = l.explicit || slots.some((s) => s.cornerId && c.corners?.[s.cornerId]);
    rows.push({
      list: l.id,
      zone,
      label: rowLabel(l.id),
      edited,
      front: frontFor(c, zone),
      items: slots.map((s) => {
        const def = moduleDef(s.zone, s.type);
        // a door or a vitrine in a blind corner is still a corner unit
        const name = def ? (s.corner && !def.corner ? `Kutni element, ${def.name.toLowerCase()}` : def.name) : s.type;
        return {
          slotId: s.id,
          type: s.type,
          name,
          width: Math.round(s.width),
          x: Math.round(s.x * 10) / 10,
          priceAdd: def?.priceAdd ?? 0,
          corner: Boolean(s.corner),
          spacer: Boolean(def?.spacer),
        };
      }),
    });
  }
  return rows;
}

export function summarize(cfg: KitchenConfig): string[] {
  const plan = planKitchen(cfg);
  const c = plan.cfg;
  const lines: string[] = [];

  lines.push(`Oblik: ${LAYOUT_NAME[c.layout]}`);
  for (const w of plan.walls) {
    lines.push(`Zid ${WALL_NAME[w]} (${WALL_HINT[w]}): ${c.walls[w]} cm`);
  }
  lines.push(`Visina stropa: ${c.ceiling} cm`);

  if (plan.window) {
    const w = plan.window;
    lines.push(
      `Prozor: zid ${WALL_NAME[w.wall]}, ${Math.round(w.offset)} cm od lijevog kraja zida, širina ${Math.round(w.width)} cm, parapet ${Math.round(w.sill)} cm`,
    );
  } else {
    lines.push("Prozor: nije označen");
  }

  // fronts: the main one, then every zone that wears another one (only zones the kitchen has)
  lines.push(`Fronta: ${frontDef(c.front)?.name ?? c.front}`);
  const zonesPresent = new Set(plan.slots.map((s) => s.zone));
  for (const z of ["base", "upper", "tall", "island"] as FrontZone[]) {
    const f = c.zoneFronts?.[z];
    if (f && zonesPresent.has(z)) lines.push(`${ZONE_FRONT_LABEL[z]}: ${frontDef(f)?.name ?? f}`);
  }

  const handle = handleDef(c.handles);
  const hc = handleColorDef(c.finish?.handleColor ?? defaultHandleColor(c.handles));
  const colour = handle?.coloured && hc ? `, ${(c.handles === "bez" ? hc.golaName : hc.name).toLowerCase()}` : "";
  lines.push(`Ručke: ${handle?.name ?? c.handles}${colour}`);

  const topName = topDef(c.top)?.name ?? c.top;
  lines.push(`Radna ploča: ${topName}`);
  // the engine draws a backsplash in the worktop material and price.ts prices it, so the owner sees it too
  const splash = backsplashArea(plan);
  if (splash > 0.05) {
    const m2 = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(splash);
    lines.push(`Zidna obloga: ${topName}, oko ${m2} m² između radne ploče i gornjih elemenata`);
  }

  // hardware the kitchen actually has
  const has = (f: (t: string, z: SlotZone) => boolean) => plan.slots.some((s) => f(s.type, s.zone));
  const def = (t: string, z: SlotZone) => moduleDef(z, t);
  if (has((t, z) => def(t, z)?.feature === "sink")) {
    const sink = finishDef("sinks", c.finish?.sink ?? FINISH_DEFAULTS.sink)?.name ?? "";
    const tap = finishDef("taps", c.finish?.tap ?? FINISH_DEFAULTS.tap)?.name ?? "";
    lines.push(`Sudoper: ${sink.toLowerCase()}, slavina: ${tap.toLowerCase()}`);
  }
  const ovens = ["ploca-pecnica", "pecnica-donja", "pecnica", "pecnica-mikro", "mikrovalna"];
  if (has((t) => ovens.includes(t))) {
    lines.push(`Fronte aparata (pećnica, mikrovalna): ${(finishDef("appliances", c.finish?.appliances ?? FINISH_DEFAULTS.appliances)?.name ?? "").toLowerCase()}`);
  }
  if (c.finish?.plinth) lines.push(`Postolje: ${(finishDef("plinths", c.finish.plinth)?.name ?? c.finish.plinth).toLowerCase()}`);

  const tall = plan.slots.filter((s) => s.zone === "tall");
  if (tall.length) {
    const names = tall.map((s) => `${moduleDef("tall", s.type)?.name.toLowerCase() ?? s.type} ${Math.round(s.width)} cm`);
    lines.push(`Visoki stup: da (${names.join(", ")})`);
  } else {
    lines.push(c.tall ? "Visoki stup: ne stane uz ove mjere" : "Visoki stup: ne");
  }

  const led = finishDef("leds", c.finish?.led ?? FINISH_DEFAULTS.led)?.name.toLowerCase();
  lines.push(`LED rasvjeta: ${c.led ? `da (${led}, ispod gornjih elemenata, u postolju i nišama)` : "ne"}`);
  if (plan.island) lines.push(`Otok: ${c.island} cm, s pločom koja se spušta do poda i mjestom za sjedenje`);

  // every run, left → right (edited ones marked) — the owner quotes from this
  for (const row of composition(c, plan)) {
    if (row.list === "tall") continue;
    const items = row.items.map((it) => `${it.spacer ? it.name.toLowerCase() : it.name} ${it.width}`).join(" · ");
    lines.push(`${row.label}${row.edited ? " (uređeno)" : ""}: ${items}`);
  }

  if (c.room?.wall || c.room?.floor) {
    const parts = [
      c.room.wall ? `zid ${roomWallDef(c.room.wall)?.name.toLowerCase()}` : null,
      c.room.floor ? `pod ${roomFloorDef(c.room.floor)?.name.toLowerCase()}` : null,
    ].filter(Boolean);
    lines.push(`Prostor u prikazu (samo za dojam): ${parts.join(", ")}`);
  }

  for (const w of plan.warnings) lines.push(`Napomena: ${w}`);
  return lines;
}
