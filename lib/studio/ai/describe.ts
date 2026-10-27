/**
 * A compact text picture of the current kitchen for the model (what it edits with ops.ts): the room, every row with its
 * slot ids, element types and widths (cm) and where each starts, the tall columns and which end they stand at, the
 * island, the window and the finishes. Built from the plan, so it is right for a kitchen edited by hand too. Ids are
 * catalogue ids — the model answers with the same ids.
 *
 *   Oblik: L (zidovi A i B). Strop 260 cm.
 *   Zid A: prostorija 420 cm, kuhinja 0–420 cm.
 *     donji: a-base-0 kutni 110 @0 | a-base-1 perilica 60 @110 | a-base-2 sudoper 80 @170 | …
 *     gornji: a-upper-0 vrata 80 @0 | …
 *     visoki stup (desni kraj): tall-ar-0 pecnica 60
 */
import { frontDef, topDef } from "../catalog";
import { backsplashOfCfg, frontFor, hoodKindOf, planKitchen, sanitizeConfig, worktopThickness, type KitchenPlan, type PlanSlot } from "../plan";
import { encodeConfig } from "../share";
import { DEFAULT_CONFIG, type KitchenConfig, type WallId } from "../types";
import { LAYOUT_NAME } from "./moves";

const row = (slots: PlanSlot[]) => slots.map((s) => `${s.id} ${s.type} ${Math.round(s.width)} @${Math.round(s.x)}${s.corner ? " (kut)" : ""}${s.zone === "tall" ? " (visoki)" : ""}`).join(" | ");

function columnSide(plan: KitchenPlan, s: PlanSlot): string {
  const r = plan.runs.find((x) => x.wall === s.run);
  if (!r) return "";
  const mid = (r.kitchen.from + r.kitchen.to) / 2;
  return s.x + s.width / 2 < mid ? "lijevi kraj" : "desni kraj";
}

export function describeKitchen(input: KitchenConfig): string {
  const cfg = sanitizeConfig(input);
  const plan = planKitchen(cfg);
  const out: string[] = [];
  out.push(`Oblik: ${cfg.layout} — ${LAYOUT_NAME[cfg.layout]}. Strop ${cfg.ceiling} cm.`);
  for (const r of plan.runs) {
    const w = r.wall;
    const W = w.toUpperCase();
    const k = r.kitchen;
    const full = k.from < 0.5 && k.to > r.length - 0.5;
    out.push(`Zid ${W}: prostorija ${r.length} cm, kuhinja ${full ? "cijelom duljinom" : `${Math.round(k.from)}–${Math.round(k.to)} cm (${Math.round(k.to - k.from)} cm)`}.`);
    const mine = plan.slots.filter((s) => s.run === w).sort((p, q) => p.x - q.x);
    const inRun = (s: PlanSlot) => s.zone === "base" || (s.zone === "tall" && s.list?.id === w);
    const base = mine.filter(inRun);
    const upper = mine.filter((s) => s.zone === "upper");
    if (base.length) out.push(`  donji: ${row(base)}`);
    if (upper.length) out.push(`  gornji: ${row(upper)}`);
    const columns = new Map<string, PlanSlot[]>();
    for (const s of mine.filter((x) => x.zone === "tall" && !inRun(x))) {
      const id = s.list?.id ?? "tall";
      columns.set(id, [...(columns.get(id) ?? []), s]);
    }
    for (const [, units] of columns) out.push(`  visoki stup (${columnSide(plan, units[0])}): ${units.map((s) => `${s.id} ${s.type} ${Math.round(s.width)}`).join(" | ")}`);
    const hoods = r.hoods.map((h) => `${h.kind} ${h.width} cm iznad ${h.hob}`);
    if (hoods.length) out.push(`  vidljiva napa: ${hoods.join(", ")}`);
  }
  for (const b of plan.bareWalls ?? []) out.push(`Zid ${b.wall.toUpperCase()}: prostorija ${b.length} cm, bez kuhinje.`);
  if (plan.island) {
    const isl = plan.island;
    const slots = plan.slots.filter((s) => s.run === "isl").sort((p, q) => p.x - q.x);
    const name = isl.kind === "otok" ? "Otok" : `Poluotok (${isl.side === "left" ? "lijevi" : "desni"} kraj zida A)`;
    const seats = isl.bar ? `šank ${isl.bar.kind === "raised" ? "povišeni" : "stol"}` : `${isl.seats.length} sjedala`;
    out.push(`${name}: ${Math.round(isl.length)} cm, dubina ${isl.depth} cm, ${seats}${isl.hood ? ", napa iznad" : ""}.`);
    if (slots.length) out.push(`  elementi: ${row(slots)}`);
  }
  if (plan.window) {
    const wn = plan.window;
    out.push(`Prozor: zid ${wn.wall.toUpperCase()}, od ${wn.offset} do ${wn.offset + wn.width} cm od lijevog kraja zida, parapet ${wn.sill} cm.`);
  } else out.push("Prozor: nema.");
  const h = plan.heights;
  out.push(
    `Visine: ${h.mode === "do-stropa" ? "do stropa" : h.mode === "custom" ? "po mjeri" : "standardne"}, radna ploča ${h.worktop} cm, gornji ${Math.round(h.upperBottom)}–${Math.round(h.upperTop)} cm, visoki stup do ${Math.round(h.tallTop)} cm${cfg.heights?.onePiece ? ", visoki iz jednog komada" : ""}.`,
  );
  const fr = (id: string) => `${id} (${frontDef(id)?.name ?? id})`;
  const zones = (["upper", "tall", "island"] as const).filter((z) => cfg.zoneFronts?.[z]).map((z) => `${z === "upper" ? "gornje" : z === "tall" ? "visoke" : "otok"} ${fr(frontFor(cfg, z))}`);
  const bs = backsplashOfCfg(cfg);
  out.push(
    [
      `Fronte: ${fr(cfg.front)}${zones.length ? `; ${zones.join("; ")}` : ""}`,
      `radna ploča: ${cfg.top} (${topDef(cfg.top)?.name ?? cfg.top}) ${worktopThickness(cfg)} cm`,
      `otvaranje: ${cfg.handles === "bez" ? "gola (bez ručki)" : cfg.handles}`,
      `LED: ${cfg.led ? "da" : "ne"}`,
      `napa: ${hoodKindOf(cfg)}`,
      `zid iza ploče: ${bs.kind}${bs.finish ? ` ${bs.finish}` : ""}`,
      `prostorija: zid ${cfg.room?.wall ?? "studio"}, pod ${cfg.room?.floor ?? "studio"}`,
    ].join("; ") + ".",
  );
  if (plan.warnings.length) out.push(`Napomene plana: ${plan.warnings.join(" ")}`);
  return out.join("\n");
}

/** the walls of this kitchen that hold a kitchen run (for prompts / tests) */
export function kitchenWalls(cfg: KitchenConfig): WallId[] {
  return planKitchen(sanitizeConfig(cfg)).runs.map((r) => r.wall);
}

/**
 * The studio's own starting kitchen, untouched (desktop and "Otvorite 3D odmah" open with it): a customer who describes
 * their kitchen here means a new one (a brief), not edits of the example — the model is told so (prompt.ts)
 */
export function isStarterKitchen(cfg: KitchenConfig): boolean {
  return encodeConfig(sanitizeConfig(cfg)) === encodeConfig(sanitizeConfig(DEFAULT_CONFIG));
}
