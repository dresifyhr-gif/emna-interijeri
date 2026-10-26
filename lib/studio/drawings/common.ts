/**
 * What the floor plan and the elevations share: element labels and names, the door-hinge rules of the 3D engine
 * (lib/studio/engine/kitchen.ts moduleCtx / tallSideOf), the room's wall thickness.
 */

import { cornerFoot, moduleDef } from "../catalog";
import { wallsFor, type KitchenPlan, type PlanSlot, type RunId, type RunPlan } from "../plan";
import type { WallId } from "../types";
import type { FaceCtx } from "./face";

/** the room's walls in the drawings (cm) — the 3D engine's wall thickness (engine/dims.ts D.wallT) */
export const WALL_T = 12;

/** "Zid A", "Otok", "Poluotok" */
export function runTitle(plan: KitchenPlan, run: RunId): string {
  if (run === "isl") return plan.island?.kind === "poluotok" ? "Poluotok" : "Otok";
  return `Zid ${run.toUpperCase()}`;
}

/** the catalogue type of a slot (island slots are base types) */
export const slotDef = (s: Pick<PlanSlot, "zone" | "type">) => moduleDef(s.zone === "island" ? "base" : s.zone, s.type);

/** empty space ("Slobodno mjesto", "Bez gornjeg elementa"): drawn dashed, not numbered */
export const isSpacer = (s: Pick<PlanSlot, "zone" | "type">): boolean => Boolean(slotDef(s)?.spacer);

/** the catalogue name of a slot ("Tri ladice") */
export const slotTypeName = (s: Pick<PlanSlot, "zone" | "type">): string => slotDef(s)?.name ?? s.type;

/**
 * Short labels of every element, the same on every drawing (and for a legend / an element table): per run, the floor
 * row left → right (base cabinets, corner units, tall units), then the wall units left → right — "A1" … "A9", "B1" …,
 * the island "O1" …, the peninsula "P1" …. Empty space is not numbered.
 */
export function elementLabels(plan: KitchenPlan): Map<string, string> {
  const out = new Map<string, string>();
  const runs: RunId[] = [...wallsFor(plan.cfg.layout), ...(plan.island ? (["isl"] as const) : [])];
  for (const run of runs) {
    const p = run === "isl" ? (plan.island?.kind === "poluotok" ? "P" : "O") : run.toUpperCase();
    const slots = plan.slots.filter((s) => s.run === run && !isSpacer(s));
    const floor = slots.filter((s) => s.zone !== "upper").sort((a, b) => a.x - b.x);
    const up = slots.filter((s) => s.zone === "upper").sort((a, b) => a.x - b.x);
    [...floor, ...up].forEach((s, i) => out.set(s.id, `${p}${i + 1}`));
  }
  return out;
}

export const runOf = (plan: KitchenPlan, wall: WallId): RunPlan | undefined => plan.runs.find((r) => r.wall === wall);

/** the run's centre the engine hinges single doors around (cm, run-local) */
function runCentre(plan: KitchenPlan, run: RunId): number {
  if (run === "isl") {
    const I = plan.island;
    if (!I) return 0;
    return I.kind === "otok" ? I.length / 2 : (I.body.from + I.body.to) / 2;
  }
  const r = runOf(plan, run);
  if (!r) return 0;
  const c = r.counter ?? { from: 0, to: r.length };
  return (c.from + c.to) / 2;
}

/** the side a tall unit's doors hinge on: towards the outer end of its column (engine kitchen.ts tallSideOf) */
function tallSide(plan: KitchenPlan, slot: PlanSlot): "left" | "right" {
  const r = plan.runs.find((x) => x.wall === slot.run);
  if (!r) return "right";
  const t = r.talls.find((x) => slot.x >= x.from - 0.5 && slot.x < x.to) ?? r.tall;
  if (!t) return "right";
  return t.from - r.kitchen.from < r.kitchen.to - t.to ? "left" : "right";
}

/** the hinge context of one slot */
export function faceCtx(plan: KitchenPlan, slot: PlanSlot): FaceCtx {
  const mid = slot.x + slot.width / 2;
  return { plan, hinge: mid < runCentre(plan, slot.run) ? "left" : "right", tallHinge: tallSide(plan, slot) };
}

/** wall A's corner units: how far each reaches along the neighbouring wall (base / wall unit), null = none there */
export function cornerAcross(plan: KitchenPlan, id: "base-l" | "base-r" | "upper-l" | "upper-r"): { slot: PlanSlot; across: number; shaped: boolean } | null {
  const slot = plan.slots.find((s) => s.cornerId === id);
  if (!slot) return null;
  const f = cornerFoot(id.startsWith("base") ? "base" : "upper", slot.type);
  return { slot, across: f.across, shaped: f.shape !== "blind" };
}
