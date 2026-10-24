/**
 * Human-readable Croatian summary of a kitchen, one line per item.
 * Goes into the lead e-mail (owner + customer) and the studio "Sažetak".
 */

import { frontDef, handleDef, moduleDef, topDef } from "./catalog";
import { planKitchen } from "./plan";
import { backsplashArea } from "./price";
import type { KitchenConfig, Layout, WallId } from "./types";

const LAYOUT_NAME: Record<Layout, string> = {
  ravna: "ravna kuhinja",
  L: "kuhinja u obliku slova L",
  U: "kuhinja u obliku slova U",
  otok: "ravna kuhinja s otokom",
};

const WALL_NAME: Record<WallId, string> = { a: "A", b: "B", c: "C" };
const WALL_HINT: Record<WallId, string> = { a: "stražnji", b: "lijevi", c: "desni" };

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

  lines.push(`Fronta: ${frontDef(c.front)?.name ?? c.front}`);
  lines.push(`Ručke: ${handleDef(c.handles)?.name ?? c.handles}`);
  const topName = topDef(c.top)?.name ?? c.top;
  lines.push(`Radna ploča: ${topName}`);
  // the engine draws a backsplash in the worktop material and price.ts prices it, so the owner sees it too
  const splash = backsplashArea(plan);
  if (splash > 0.05) {
    const m2 = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(splash);
    lines.push(`Zidna obloga: ${topName}, oko ${m2} m² između radne ploče i gornjih elemenata`);
  }

  const tall = plan.slots.filter((s) => s.zone === "tall");
  if (tall.length) {
    const names = tall.map((s) => moduleDef("tall", s.type)?.name.toLowerCase() ?? s.type);
    lines.push(`Visoki stup: da (${names.join(" i ")})`);
  } else {
    lines.push(c.tall ? "Visoki stup: ne stane uz ove mjere" : "Visoki stup: ne");
  }

  lines.push(`LED rasvjeta: ${c.led ? "da (ispod gornjih elemenata, u postolju i nišama)" : "ne"}`);
  if (plan.island) lines.push(`Otok: ${c.island} cm, s pločom koja se spušta do poda i mjestom za sjedenje`);

  // every element-level edit, in plan order
  for (const s of plan.slots) {
    const o = c.overrides[s.id];
    if (!o || s.type !== o || o === s.defaultType) continue;
    const def = moduleDef(s.zone, s.type);
    lines.push(`${slotName(s.id)}: ${def?.name ?? s.type}`);
  }

  for (const w of plan.warnings) lines.push(`Napomena: ${w}`);
  return lines;
}
