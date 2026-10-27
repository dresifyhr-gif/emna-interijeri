/**
 * What a host that draws on top of a Drawing needs to make it interactive — the studio's 2D view (components/studio/
 * PlanView.tsx): where every element is (hit areas, the selection's outline) and where the "+" of every empty place goes
 * (plan.ts planGaps). Drawing cm, like the rest of the model; toSVG / svgFrame turn them into paper mm. Pure: no DOM.
 */

import { DIM, planGaps, type KitchenPlan, type RunId, type SlotZone } from "../plan";
import { elementLabels } from "./common";
import { wallFrame } from "./floorplan";
import { EMPTY_BOX, apply, grow, isEmpty, primPoints, rotMove, type Box, type Drawing, type Pt, type Xf } from "./model";

/** one element of a drawing, as a hit area */
export interface DrawingHit {
  /** plan slot id */
  ref: string;
  /** what it covers (drawing cm): its tag's box, else everything drawn for it */
  box: Box;
  zone: SlotZone;
  /** "A3" (elementLabels); null for empty space, which is not numbered */
  label: string | null;
  /**
   * drawn under the others and picked only where nothing else is: the wall units in the floor plan (dashed, above the
   * cut — the base cabinet under one is what a click there means)
   */
  under: boolean;
}

/** a run's plan frame (u along the run, v = −depth) → the floor plan's frame (null: the plan has no such run) */
export function planRunXf(plan: KitchenPlan, run: RunId): Xf | null {
  const f = run === "isl" ? plan.island?.frame : plan.runs.some((r) => r.wall === run) ? wallFrame(plan, run) : null;
  if (!f) return null;
  return rotMove((f.rot * 180) / Math.PI, f.x, -f.z);
}

/**
 * Every element drawn in `d` as a hit area, in paint order: the ones `under` first, then the rest by the order of the
 * plan's slots — a host that draws them in this order and lets the topmost take a click picks what the drawing shows on
 * top. An element seen twice in one drawing (wall A's L-shaped corner unit, its second leaf on wall B's elevation) is one
 * hit area around both.
 */
export function drawingHits(plan: KitchenPlan, d: Drawing): DrawingHit[] {
  const slots = new Map(plan.slots.map((s) => [s.id, s]));
  const labels = elementLabels(plan);
  const boxes = new Map<string, Box>();
  const tagged = new Set<string>();
  for (const t of d.tags) {
    if (!slots.has(t.ref)) continue;
    const b = boxes.get(t.ref) ?? EMPTY_BOX;
    boxes.set(t.ref, grow(grow(b, [t.box.x0, t.box.y0]), [t.box.x1, t.box.y1]));
    tagged.add(t.ref);
  }
  // elements without a tag (empty space, the floor plan's wall units, a corner unit's second leaf): what is drawn for them
  for (const p of d.prims) {
    const ref = p.ref;
    if (!ref || p.t === "text" || !slots.has(ref) || tagged.has(ref)) continue;
    let b = boxes.get(ref) ?? EMPTY_BOX;
    for (const q of primPoints(p)) b = grow(b, q);
    boxes.set(ref, b);
  }
  // the second leaf of a corner unit seen on a neighbouring wall carries the same ref as its tag on that wall: both
  for (const p of d.prims) {
    const ref = p.ref;
    if (!ref || p.t === "text" || !tagged.has(ref)) continue;
    const b = boxes.get(ref);
    if (!b) continue;
    const pts = primPoints(p);
    if (pts.every((q) => q[0] >= b.x0 - 0.5 && q[0] <= b.x1 + 0.5 && q[1] >= b.y0 - 0.5 && q[1] <= b.y1 + 0.5)) continue;
    let g = b;
    for (const q of pts) g = grow(g, q);
    // a far-away piece is a different drawing of it (not one outline): keep the tag's box
    if (g.x1 - g.x0 <= (b.x1 - b.x0) * 3 + 120 && g.y1 - g.y0 <= (b.y1 - b.y0) * 3 + 120) boxes.set(ref, g);
  }
  const out: DrawingHit[] = [];
  for (const s of plan.slots) {
    const b = boxes.get(s.id);
    if (!b || isEmpty(b) || b.x1 - b.x0 < 0.5 || b.y1 - b.y0 < 0.5) continue;
    out.push({ ref: s.id, box: b, zone: s.zone, label: labels.get(s.id) ?? null, under: d.kind === "plan" && s.zone === "upper" });
  }
  return [...out.filter((h) => h.under), ...out.filter((h) => !h.under)];
}

/**
 * Where the "+" of each empty place goes on `d` (drawing cm), by gap id (planGaps): on an elevation the gaps of its run
 * (the island's working side has the island's), on the floor plan every gap of a floor row and of the island (a wall
 * unit's "+" would sit on the base row's — those are on the elevations), at mid-depth of the cabinets. The seating side
 * of the island has none.
 */
export function drawingGaps(plan: KitchenPlan, d: Drawing): Map<string, Pt> {
  const out = new Map<string, Pt>();
  const gaps = planGaps(plan);
  if (d.kind === "plan") {
    for (const g of gaps) {
      if (g.zone === "upper") continue;
      const m = planRunXf(plan, g.run);
      if (!m) continue;
      const z = g.run === "isl" ? g.at.z : Math.max(g.at.z, DIM.baseDepth / 2);
      out.set(g.id, apply(m, [g.at.x, -z]));
    }
    return out;
  }
  const run: RunId | null = /^zid-[abc]$/.test(d.id) ? (d.id.slice(4) as RunId) : d.id === "otok" || d.id === "poluotok" ? "isl" : null;
  if (!run) return out;
  for (const g of gaps) if (g.run === run) out.set(g.id, [g.at.x, g.at.y]);
  return out;
}
