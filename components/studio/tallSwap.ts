/**
 * Replacing an element with a tall unit, as the UI asks about it (ElementToolbar "Zamijeni", ElementEditor "Izvedba") —
 * plain data, kept apart from React so it is tested (lib/studio/ui.test.ts).
 *
 * lib/studio/edit.ts changeType(…, "tall") puts a tall unit in the place of a base cabinet or a wall unit of a wall run:
 * the base cabinet below and the wall units above that hang where it now stands go with it (the owner: "da se maknu
 * odmah i gornji i donji element"). The studio asks first — one short line, one click — only when something besides the
 * chosen element goes ("Ukloniti donji i gornji element i staviti visoki?"), and lists the cabinets that stay but get
 * narrower to make room ("Uži će biti: ladičar 60 → 45 cm."); the toast after it offers "Poništi".
 *
 * A tall unit standing in a base run can become a base cabinet again: `baseChoices` lists the base types with the width
 * each would get there (edit.ts SlotEditInfo.types of such a unit are the tall types only).
 */
import { moduleDef, moduleTypes } from "@/lib/studio/catalog";
import { changeType, type EditResult, type TypeChoice } from "@/lib/studio/edit";
import { planKitchen, type KitchenPlan, type PlanSlot } from "@/lib/studio/plan";
import type { KitchenConfig, WallId } from "@/lib/studio/types";
import { isInRunTall } from "./meta";
import { listRow, narrowedBetween, narrowedText, type Narrowed } from "./optionsModel";

export interface TallSwap {
  /** changeType(cfg, slot, type, "tall") */
  result: EditResult;
  /** real elements that go (empty space not counted), the chosen one included: base cabinets, wall units */
  base: number;
  upper: number;
  /** the question to ask before the swap ("Ukloniti donji i gornji element i staviti visoki?"); null: nothing besides the chosen element goes */
  ask: string | null;
  /** sink / hob / dishwasher that go with it, by name ("element za sudoper") */
  essentials: string[];
  /** base cabinets that stay but get narrower to make room for it (the question lists them: "Uži će biti: …") */
  narrowed: Narrowed[];
}

/** "Uži će biti: ladičar 60 → 45 cm." — what the question adds about cabinets that make room (null: none do) */
export const narrowLine = (n: Narrowed[]): string | null => (n.length ? `Uži će biti: ${narrowedText(n)}.` : null);

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
const defOf = (s: Pick<PlanSlot, "zone" | "type">) => moduleDef(s.zone === "island" ? "base" : s.zone, s.type);
/** a cabinet or appliance, not empty space or a filler strip */
const real = (s: PlanSlot) => {
  const d = defOf(s);
  return Boolean(d && !d.spacer && !d.filler);
};
const overlap = (a: { from: number; to: number }, b: { from: number; to: number }) => Math.max(0, Math.min(a.to, b.to) - Math.max(a.from, b.from));
const spanOf = (s: PlanSlot) => ({ from: s.x, to: s.x + s.width });

/** "donji element", "2 donja elementa", "5 donjih elemenata" (adj: "donji" / "gornji") */
export function elementsWord(n: number, adj: "donji" | "gornji"): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return n === 1 ? `${adj} element` : `${n} ${adj} element`;
  const stem = adj.slice(0, -1);
  return m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? `${n} ${stem}a elementa` : `${n} ${stem}ih elemenata`;
}

/** the question before a swap that takes `base` base cabinets and `upper` wall units away */
export function swapQuestion(base: number, upper: number): string {
  if (base === 1 && upper === 1) return "Ukloniti donji i gornji element i staviti visoki?";
  const parts = [base > 0 ? elementsWord(base, "donji") : null, upper > 0 ? elementsWord(upper, "gornji") : null].filter(Boolean);
  return `Ukloniti ${parts.join(" i ")} i staviti visoki?`;
}

/** wall units of `wall` in `plan` that hung where the new column (`colId` in `after`) stands, the chosen one included */
function fallbackUppers(plan: KitchenPlan, after: KitchenPlan, slot: PlanSlot, colId: string | null, wall: WallId): number {
  const col = after.slots.find((s) => s.id === colId);
  const cols = after.runs.find((r) => r.wall === wall)?.runTalls ?? [];
  const at = col ? (cols.find((c) => overlap(c, spanOf(col)) > 0.5) ?? spanOf(col)) : null;
  return plan.slots.filter((u) => {
    if (u.run !== wall || u.zone !== "upper" || u.corner || !real(u)) return false;
    if (u.id === slot.id) return true;
    const h = at ? overlap(at, spanOf(u)) : 0;
    return h >= Math.min(20, u.width / 3) - 0.01;
  }).length;
}

/**
 * What changeType to a tall type does to the slot's wall: how many real base cabinets and wall units go (compared
 * with the plan before), and whether that is more than the chosen element itself (then the UI asks first).
 */
export function tallSwap(cfg: KitchenConfig, plan: KitchenPlan, slot: PlanSlot, type: string): TallSwap {
  const result = changeType(cfg, slot.id, type, "tall");
  if (!result.ok || slot.run === "isl") return { result, base: 0, upper: 0, ask: null, essentials: [], narrowed: [] };
  const wall = slot.run as WallId;
  const after = planKitchen(result.cfg);
  // the wall's base row (tall units standing in it included), before and after: what stays and is narrower now
  const narrowed = narrowedBetween(listRow(plan, wall), listRow(after, wall), new Set(result.slotId ? [result.slotId] : []));
  const onWall = (p: KitchenPlan, zone: PlanSlot["zone"]) => p.slots.filter((s) => s.run === wall && s.zone === zone && real(s));
  // base cabinets do not re-flow (the list is explicit now; a neighbour only gets narrower): the count says it
  const base = Math.max(0, onWall(plan, "base").length - onWall(after, "base").length);
  // wall units do (the planner fills the row again around the column): the core counts those that no longer hang there
  // (EditResult.uppersGone, what its note says); without it, those that hung where the column now stands — one that only
  // grazes it (less than a third of its width, at most 20 cm) stays (edit.ts clearAbove)
  const upper = result.uppersGone ?? fallbackUppers(plan, after, slot, result.slotId, wall);
  // sink / hob / dishwasher the kitchen has fewer of now
  const features = (p: KitchenPlan) => p.slots.filter((s) => (s.zone === "base" || s.zone === "island") && defOf(s)?.feature).map((s) => defOf(s)!.feature!);
  const was = features(plan);
  const now = features(after);
  const essentials = [...new Set(was)]
    .filter((f) => was.filter((x) => x === f).length > now.filter((x) => x === f).length)
    .map((f) => lower(plan.slots.map(defOf).find((d) => d?.feature === f)?.name ?? ""))
    .filter(Boolean);
  const self = real(slot) ? 1 : 0;
  const others = base + upper - self;
  return { result, base, upper, ask: others > 0 ? swapQuestion(base, upper) : null, essentials, narrowed };
}

/**
 * A tall unit standing in a base run: the base types it can become again (changeType with a base type), each with the
 * width it would get there (null: it does not fit). Empty for every other slot.
 */
export function baseChoices(cfg: KitchenConfig, slot: PlanSlot): TypeChoice[] {
  if (!isInRunTall(slot)) return [];
  return moduleTypes("base").map((d) => {
    const r = changeType(cfg, slot.id, d.id);
    const width = r.ok && r.slotId ? (planKitchen(r.cfg).slots.find((s) => s.id === r.slotId)?.width ?? null) : null;
    return { id: d.id, name: d.name, description: d.description, group: d.group, widths: [...d.widths], width, current: false };
  });
}
