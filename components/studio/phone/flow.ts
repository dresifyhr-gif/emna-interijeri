/**
 * The phone's simple flow — pure logic, no React (tested in lib/studio/phone-flow.test.ts):
 *
 *   start   "Kako želite početi?" — [Nastavite svoju kuhinju: one saved on this device] [Opišite kuhinju (AI): only when
 *           enabled] [Korak po korak] [Otvorite 3D odmah]
 *   wizard  four screens, one thing each: Oblik → Mjere → Stil → Uređaji, then the full-screen 3D
 *   3d      the full-screen 3D view with a small bottom bar (price, "Uredi", "Pošaljite upit"); "Korak po korak" at the top
 *           of the "Uredi" sheet and "Na početak" in the summary go back to the wizard's first screen, the kitchen kept
 *
 * Where the visitor is in it is remembered for the visit (sessionStorage, phone/stage.ts): a reload goes back to the
 * same screen. A link to a kitchen (?k=) opens straight into the 3D view. Desktops and tablets never see it; a phone held
 * sideways does (PHONE_QUERY), with its panels at the side or in one row (PHONE_LANDSCAPE_QUERY).
 *
 * The "Mjere" screen's edits go through lib/studio/edit.ts (setWallLength, setKitchenExtent, setCeiling, setHeights), so
 * a value out of range comes back as the planner's own friendly Croatian note.
 */
import { kitchenExtent, setCeiling, setHeights, setKitchenExtent, setWallLength, wallLimits, type EditResult } from "@/lib/studio/edit";
import { hasIsland, isPeninsula, limitsFor, planKitchen, sanitizeConfig, wallsFor } from "@/lib/studio/plan";
import type { KitchenConfig, WallId, WindowSpec } from "@/lib/studio/types";
import { fitToPlanner, islandLimits } from "../limits";
import { WALL_HINT, islandWord } from "../meta";
import { shorterKitchen } from "../room";

/* ------------------------------------------------------------------ which screen */

/**
 * the phone UI: a narrow screen, or a phone held sideways — a low screen with a finger for a pointer (a low desktop
 * window has a mouse and keeps the full studio, as tablets do)
 */
export const PHONE_QUERY = "(max-width: 767px), (max-height: 500px) and (pointer: coarse)";
/** …held sideways: the wizard's panel stands at the right and the 3D view's bar is one row, so the kitchen keeps the height */
export const PHONE_LANDSCAPE_QUERY = "(max-height: 500px) and (pointer: coarse)";

export type WizardStepId = "oblik" | "mjere" | "stil" | "uredaji";

export interface WizardStep {
  id: WizardStepId;
  title: string;
  lead: string;
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  { id: "oblik", title: "Oblik kuhinje", lead: "Kako kuhinja stoji u prostoriji?" },
  { id: "mjere", title: "Mjere", lead: "Duljine zidova i visina stropa. Točne mjere uzimamo na izmjeri." },
  { id: "stil", title: "Stil", lead: "Gotove kombinacije boja i materijala. Sve se kasnije može promijeniti." },
  { id: "uredaji", title: "Uređaji", lead: "Hladnjak, pećnica, napa, sudoper i perilica." },
];

export const WIZARD_LAST = WIZARD_STEPS.length - 1;

export type PhoneStage = { kind: "start" } | { kind: "wizard"; step: number } | { kind: "3d" };

export const clampStep = (i: number) => Math.max(0, Math.min(WIZARD_LAST, Math.round(Number.isFinite(i) ? i : 0)));

/** what sessionStorage keeps ("start", "wizard:2", "3d") */
export function stageKey(s: PhoneStage): string {
  return s.kind === "wizard" ? `wizard:${clampStep(s.step)}` : s.kind;
}

/** the remembered stage; null = nothing remembered (or something unreadable) */
export function parseStage(raw: string | null | undefined): PhoneStage | null {
  if (raw === "start") return { kind: "start" };
  if (raw === "3d") return { kind: "3d" };
  const m = /^wizard:(\d)$/.exec(raw ?? "");
  return m ? { kind: "wizard", step: clampStep(Number(m[1])) } : null;
}

/** a kitchen saved on this device (lib/studio/autosave.ts), as the studio opens */
export interface SavedEntry {
  /** there is one */
  has: boolean;
  /** …and it is offered back ("Nastavite svoju kuhinju": no kitchen or preset in the address, not the one on screen) */
  offer: boolean;
}

/**
 * the first screen, until the visitor chooses a way in: a saved kitchen offered back waits on the start screen (its first
 * choice); else what was remembered this visit — the 3D view only with a kitchen to show (a link, or one saved on this
 * device: the default kitchen in 3D would look as if theirs had been changed) —, else the 3D view for a link to a kitchen
 * (?k=), else the start
 */
export function firstStage(remembered: PhoneStage | null, link: boolean, saved: SavedEntry = { has: false, offer: false }): PhoneStage {
  if (saved.offer) return { kind: "start" };
  if (remembered) return remembered.kind === "3d" && !link && !saved.has ? { kind: "start" } : remembered;
  return link ? { kind: "3d" } : { kind: "start" };
}

/** "Korak po korak" in the "Uredi" sheet, "Na početak" in the summary: the wizard's first screen, the kitchen kept */
export const WIZARD_AGAIN: PhoneStage = { kind: "wizard", step: 0 };

/** "Dalje": the next wizard screen, or the 3D view after the last one */
export function nextStage(step: number): PhoneStage {
  return step >= WIZARD_LAST ? { kind: "3d" } : { kind: "wizard", step: clampStep(step + 1) };
}

/** "Natrag": the previous wizard screen, or the start after the first one */
export function prevStage(step: number): PhoneStage {
  return step <= 0 ? { kind: "start" } : { kind: "wizard", step: clampStep(step - 1) };
}

/* ------------------------------------------------------------------ "Mjere" */

export interface Range3 {
  value: number;
  min: number;
  max: number;
}

export interface MeasureRow {
  wall: WallId;
  /** "Zid A" */
  name: string;
  /** "stražnji" (only with more than one wall) */
  hint: string | null;
  /** the room's wall */
  room: Range3;
  /** the kitchen takes the whole wall */
  full: boolean;
  /** the kitchen's own length on it (when not the whole wall) */
  kitchen: Range3;
  /** the wall can hold a shorter kitchen ("Kuhinja zauzima cijeli zid" can be switched off) */
  canShorten: boolean;
}

/** the kitchen's walls with their lengths and ranges, A → C */
export function measureRows(input: KitchenConfig): MeasureRow[] {
  const cfg = sanitizeConfig(input);
  const used = wallsFor(cfg.layout);
  return used.flatMap((w): MeasureRow[] => {
    const info = kitchenExtent(cfg, w);
    const lim = wallLimits(cfg, w);
    if (!info || !lim) return [];
    return [
      {
        wall: w,
        name: `Zid ${w.toUpperCase()}`,
        hint: used.length > 1 ? WALL_HINT[w] : null,
        room: { value: cfg.walls[w], min: lim.min, max: lim.max },
        full: info.full,
        kitchen: { value: info.length.value, min: info.length.min, max: info.length.max },
        canShorten: shorterKitchen(info) !== null,
      },
    ];
  });
}

/** the island / peninsula length ("Otok", "Poluotok") — null for layouts without one */
export function islandRow(input: KitchenConfig): (Range3 & { name: string; hint: string }) | null {
  const cfg = sanitizeConfig(input);
  if (!hasIsland(cfg.layout)) return null;
  const lim = wallLimits(cfg, "isl");
  if (!lim) return null;
  // the planner keeps an island centred on wall A only up to wall A + 40 cm (limits.ts)
  const [lo, hi] = cfg.layout === "otok" ? islandLimits(cfg) : [lim.min, lim.max];
  return {
    name: islandWord(cfg.layout),
    hint: isPeninsula(cfg.layout) ? "od zida A do slobodnog kraja" : "duljina radne ploče",
    value: cfg.island,
    min: lo,
    max: Math.max(lo, Math.min(hi, lim.max)),
  };
}

export function ceilingRow(input: KitchenConfig): Range3 {
  const cfg = sanitizeConfig(input);
  const [min, max] = limitsFor(cfg.layout).ceiling;
  return { value: cfg.ceiling, min, max };
}

/** the room's wall (a kitchen that takes the whole wall follows it) */
export const setRoomLength = (cfg: KitchenConfig, wall: WallId, cm: number): EditResult => setWallLength(cfg, wall, cm);

/** the island's / peninsula's length */
export const setIslandLength = (cfg: KitchenConfig, cm: number): EditResult => setWallLength(cfg, "isl", cm);

/** "Kuhinja zauzima cijeli zid": on = the kitchen follows the wall again; off = one cabinet (60 cm) shorter than it */
export function setKitchenFull(input: KitchenConfig, wall: WallId, full: boolean): EditResult {
  const cfg = sanitizeConfig(input);
  if (full) return setKitchenExtent(cfg, wall, null);
  const info = kitchenExtent(cfg, wall);
  const len = info ? shorterKitchen(info) : null;
  if (!info || len === null) return { cfg, ok: false, warning: `Zid ${wall.toUpperCase()} je prekratak za kraću kuhinju.`, slotId: null };
  return setKitchenExtent(cfg, wall, { length: len });
}

/** the kitchen's own length on a wall (from the wall's corner end) */
export const setKitchenLength = (cfg: KitchenConfig, wall: WallId, cm: number): EditResult => setKitchenExtent(cfg, wall, { length: cm });

export const setCeilingHeight = (cfg: KitchenConfig, cm: number): EditResult => setCeiling(cfg, cm);

/** "Standardno" / "Do stropa" — what the kitchen's heights are now ("custom" from "Napredno" shows neither) */
export function heightsMode(input: KitchenConfig): "standard" | "do-stropa" | "custom" {
  return planKitchen(sanitizeConfig(input)).heights.mode;
}

export const setHeightsMode = (cfg: KitchenConfig, mode: "standard" | "do-stropa"): EditResult =>
  setHeights(cfg, mode === "standard" ? { mode: "standard" } : { mode: "do-stropa" });

/** the window on wall A (the planner puts the sink under it) */
export function windowOn(input: KitchenConfig): boolean {
  const cfg = sanitizeConfig(input);
  return Boolean(cfg.window && wallsFor(cfg.layout).includes(cfg.window.wall));
}

/** "Prozor na zidu A": a 100 cm window in the middle of wall A (sill 95 cm, as the "Zidovi" step adds it), or none */
export function setWindowOn(input: KitchenConfig, on: boolean): EditResult {
  const cfg = sanitizeConfig(input);
  let window: WindowSpec | null = null;
  if (on) {
    const len = cfg.walls.a;
    const width = Math.min(100, len - 40);
    window = { wall: "a", width, offset: Math.round((len - width) / 2), sill: 95 };
  }
  const next = fitToPlanner(sanitizeConfig({ ...cfg, window }));
  const before = new Set(planKitchen(cfg).warnings);
  const notes = planKitchen(next).warnings.filter((w) => !before.has(w));
  return { cfg: next, ok: true, warning: notes.length ? notes.join(" ") : null, slotId: null };
}
