/**
 * Pure helpers behind the studio's room / kitchen controls (no React): what the "Cijeli zid" switch, the kitchen-length
 * editor, "Podigni strop na X cm" and the bar's length switch do with lib/studio/edit.ts. Kept here so they are tested
 * (lib/studio/ui.test.ts) and the walls step, the 3D length editor and the island panel do the same thing.
 */
import { raiseCeilingFor, setHeights, type EditResult, type IslandChoices, type KitchenExtentInfo } from "@/lib/studio/edit";
import type { Range } from "@/lib/studio/plan";
import type { KitchenConfig } from "@/lib/studio/types";

/** a kitchen shorter than its wall starts 60 cm (one cabinet) shorter, so the bare wall shows right away */
export const SHORTER_BY = 60;

/**
 * "Cijeli zid" switched off: the kitchen's own length — SHORTER_BY shorter than the wall, at least the shortest kitchen
 * run there. null = the wall is at its shortest: it cannot hold a shorter kitchen (a kitchen as long as its wall is
 * stored as "the whole wall" again, sanitizeConfig drops such an extent).
 */
export function shorterKitchen(info: Pick<KitchenExtentInfo, "room" | "length">): number | null {
  const L = info.room.value;
  const len = Math.max(info.length.min, L - SHORTER_BY);
  return len < L ? len : null;
}

/** the kitchen on a wall `wall` cm long, `offset` cm from its `anchor` end, `length` cm long (wall-local cm) */
export function extentRange(wall: number, anchor: "left" | "right", offset: number, length: number): Range {
  return anchor === "left" ? { from: offset, to: offset + length } : { from: wall - offset - length, to: wall - offset };
}

/** the offset of the kitchen at `r` measured from `anchor` (switching the end measured from keeps the kitchen in place) */
export function offsetFrom(wall: number, r: Range, anchor: "left" | "right"): number {
  return Math.round(anchor === "left" ? r.from : wall - r.to);
}

/**
 * "Podigni strop na X cm": the ceiling raised just enough for a tall column up to `wish` (edit.ts raiseCeilingFor) and
 * the column up to it (custom heights) — one edit; `notes` = what both said. null when it cannot be done.
 */
export function raiseForTall(cfg: KitchenConfig, wish: number): { result: EditResult; notes: string[]; ceiling: number } | null {
  const raised = raiseCeilingFor(cfg, wish);
  if (!raised.ok) return null;
  const res = setHeights(raised.cfg, { mode: "custom", tallTop: Math.min(wish, raised.maxTop) });
  const notes = [raised.warning, ...res.notes].filter((x): x is string => Boolean(x));
  return { result: { ...res, warning: notes.length ? notes.join(" ") : null }, notes, ceiling: raised.ceiling };
}

/** "Cijelom duljinom" switched off: a bar three quarters of the island long (5 cm steps), clearly shorter than it */
export function shorterBar(bar: IslandChoices["bar"]): number {
  const { min, max } = bar.length;
  return Math.max(min, Math.min(max - 20, Math.round((max * 0.75) / 5) * 5));
}
