/**
 * The front view of one plan slot (a cabinet, an appliance, an open shelf, an end panel): its outline, the division
 * into doors / drawers / flaps, the handle marks of its opening style and the opening-direction symbols — the same
 * proportions lib/studio/engine/modules.ts builds in 3D (drawer ratios, oven / microwave / fridge splits, corner units,
 * the "do stropa" top boxes).
 *
 * Element-local x (0 = the slot's left edge, cm), absolute heights (cm above the floor). Pure: no DOM, no three.js.
 */

import { SBS, SBS_GRIP, cornerFoot, glassFrameDef, moduleDef } from "../catalog";
import { drawerRatios, drawerStack, golaBetween, ovenColumn } from "../fronts";
import { DIM, glassOf, hasTopBox, openingOf, sbsAlone, shelvesOf, tallSplitOf, type HeightPlan, type KitchenPlan, type PlanSlot } from "../plan";
import type { HandleStyle } from "../types";
import { box, line, poly, rect, type Box, type Prim, type Pt, type Style } from "./model";

/** carcass board (cm) */
const T = 1.8;
/** the Gola channel under the worktop / the finger gap ("luft"): how far base fronts stop below the carcass top */
const GOLA = 3.5;
const LUFT = 3;
/** how far wall-unit fronts reach below the carcass (Gola lip, finger gap) */
const LIP_GOLA = 1.5;
const LIP_LUFT = 2.5;
/** visible face of a wall unit's front from the wall (32,5 carcass + 0,15 bumpers + 1,9 front) */
export const UPPER_FACE = 34.55;
/** blind corners: the blind part and the fixed filler beside the door (base / wall unit) */
const BLIND = { base: 60, upper: 35 } as const;
const BLIND_FILL = 5;

export const gripGap = (h: HandleStyle): number => (h === "bez" ? GOLA : h === "luft" ? LUFT : 0);
export const lipOf = (h: HandleStyle): number => (h === "bez" ? LIP_GOLA : h === "luft" ? LIP_LUFT : 0);

export interface FaceCtx {
  plan: KitchenPlan;
  /** single doors of base / wall / island units hinge on this side (engine: the side away from the run's centre) */
  hinge: "left" | "right";
  /** tall units: towards the outer end of their column */
  tallHinge: "left" | "right";
}

export interface Face {
  prims: Prim[];
  /** what the element covers (element-local x, absolute y): its label goes here */
  box: Box;
  /** empty space (no cabinet) */
  spacer: boolean;
}

type GripAt = { edge: "top" | "bottom" | "mid"; free?: "left" | "right" };

/** the base / island carcass top (= underside of the worktop) */
export const carcassTop = (h: HeightPlan): number => h.worktop - h.worktopT;

/** the top of a tall unit itself (a "do stropa" top box continues above it to h.tallTop) */
export const tallUnitTop = (h: HeightPlan): number => h.tallSplit ?? h.tallTop;

/** the top a wall-unit row reaches (with the "do stropa" top row) */
export const upperRowTop = (h: HeightPlan): number => (h.topRow ? h.topRow.to : h.upperTop);

class FaceBuilder {
  readonly prims: Prim[] = [];
  constructor(
    readonly slot: PlanSlot,
    readonly w: number,
    readonly handles: HandleStyle,
  ) {}

  private st(layer: Style["layer"], extra: Partial<Style> = {}): Style {
    return { layer, ref: this.slot.id, ...extra };
  }

  push(p: Prim): void {
    this.prims.push(p);
  }

  outline(b: Box, weight: Style["weight"] = "medium"): void {
    this.push(rect(b, this.st("korpus", { weight })));
  }

  plinth(x0: number, x1: number, y1: number): void {
    if (y1 <= 0.2 || x1 - x0 <= 0.2) return;
    this.push(rect(box(x0, 0, x1, y1), this.st("cokl", { weight: "light" })));
  }

  /** a front panel (a door, a drawer, a fixed strip) */
  front(b: Box, fill?: Style["fill"]): void {
    if (b.x1 - b.x0 <= 0.05 || b.y1 - b.y0 <= 0.05) return;
    this.push(rect(b, this.st("fronta", { weight: "light", ...(fill ? { fill } : {}) })));
  }

  /** the dashed opening symbol: the apex points at the hinge */
  symbol(b: Box, hinge: "left" | "right" | "top" | "bottom"): void {
    const xm = (b.x0 + b.x1) / 2;
    const ym = (b.y0 + b.y1) / 2;
    const s = this.st("otvaranje", { line: "dashed", weight: "fine" });
    const pts: Pt[] =
      hinge === "left"
        ? [[b.x1, b.y1], [b.x0, ym], [b.x1, b.y0]]
        : hinge === "right"
          ? [[b.x0, b.y1], [b.x1, ym], [b.x0, b.y0]]
          : hinge === "top"
            ? [[b.x0, b.y0], [xm, b.y1], [b.x1, b.y0]]
            : [[b.x0, b.y1], [xm, b.y0], [b.x1, b.y1]];
    this.push(poly(pts, false, s));
  }

  /** the handle of the opening style on a front (engine Mod.grip: positions in cm) */
  grip(b: Box, at: GripAt): void {
    const st = this.handles;
    if (st === "bez" || st === "push" || st === "luft") return;
    const fw = b.x1 - b.x0;
    const fh = b.y1 - b.y0;
    if (fw < 4 || fh < 4) return;
    const s = this.st("rucka", { weight: "medium" });
    if (st === "utor") {
      // the aluminium edge profile (1,6 cm) along the top / bottom edge, or along the free side
      const p = 1.6;
      if (at.edge === "mid" && at.free) {
        const x = at.free === "right" ? b.x1 - p : b.x0;
        this.push(rect(box(x, b.y0, x + p, b.y1), { ...s, weight: "light", fill: "dark" }));
      } else {
        const y = at.edge === "bottom" ? b.y0 : b.y1 - p;
        this.push(rect(box(b.x0, y, b.x1, y + p), { ...s, weight: "light", fill: "dark" }));
      }
      return;
    }
    if (!at.free) {
      // drawers and flaps: centred near the edge
      const ay = at.edge === "bottom" ? b.y0 + (st === "gumb" ? 4 : 3.5) : b.y1 - (st === "gumb" ? 4 : 3.5);
      const xm = (b.x0 + b.x1) / 2;
      if (st === "letvica") {
        const L = Math.min(fw - 12, 42);
        if (L > 2) this.push(rect(box(xm - L / 2, ay - 0.6, xm + L / 2, ay + 0.6), { ...s, fill: "dark" }));
      } else this.push({ t: "circle", c: [xm, ay], r: 1.6, ...s });
      return;
    }
    const ax = at.free === "right" ? b.x1 - 3.5 : b.x0 + 3.5;
    if (st === "letvica") {
      const L = at.edge === "mid" ? Math.min(50, fh * 0.45) : Math.min(20, fh * 0.4);
      const ym = at.edge === "top" ? b.y1 - 5 - L / 2 : at.edge === "bottom" ? b.y0 + 5 + L / 2 : (b.y0 + b.y1) / 2;
      this.push(rect(box(ax - 0.6, ym - L / 2, ax + 0.6, ym + L / 2), { ...s, fill: "dark" }));
    } else {
      const ay = at.edge === "top" ? b.y1 - 5 : at.edge === "bottom" ? b.y0 + 5 : (b.y0 + b.y1) / 2;
      this.push({ t: "circle", c: [ax, ay], r: 1.6, ...s });
    }
  }

  /** a hinged door; `glass` = a framed glass door (frame width in cm) */
  door(b: Box, hinge: "left" | "right", hpos: GripAt["edge"], glass: number | null = null): void {
    this.front(b);
    if (glass !== null) {
      const r = Math.min(glass, (b.x1 - b.x0) / 3, (b.y1 - b.y0) / 3);
      this.push(rect(box(b.x0 + r, b.y0 + r, b.x1 - r, b.y1 - r), this.st("fronta", { weight: "fine", fill: "glass" })));
    }
    this.symbol(b, hinge);
    this.grip(b, { edge: hpos, free: hinge === "left" ? "right" : "left" });
  }

  /** one door, or two (wider than 62 cm, or `two`) — engine Mod.doors */
  doors(x0: number, x1: number, y0: number, y1: number, hpos: GripAt["edge"], hinge: "left" | "right", glass: number | null = null, two?: boolean): void {
    if (two ?? x1 - x0 > 62) {
      const xm = (x0 + x1) / 2;
      this.door(box(x0, y0, xm, y1), "left", hpos, glass);
      this.door(box(xm, y0, x1, y1), "right", hpos, glass);
    } else this.door(box(x0, y0, x1, y1), hinge, hpos, glass);
  }

  drawer(b: Box, fixed = false): void {
    this.front(b);
    if (!fixed) this.grip(b, { edge: "top" });
  }

  /** drawers top → bottom by ratio of y0..y1 (engine Mod.drawers); `mid`: the Gola channel between them (fronts.ts drawerStack) */
  drawers(x0: number, x1: number, y0: number, y1: number, ratios: number[], fixedTop = false, mid = false): void {
    const st = drawerStack(y0, y1, ratios, mid);
    st.fronts.forEach(([a, b], i) => this.drawer(box(x0, a, x1, b), fixedTop && i === 0));
    for (const [a, b] of st.channels) this.channel(x0, x1, a, b);
  }

  /** a lift-up flap hinged at the top */
  flap(b: Box): void {
    this.front(b);
    this.symbol(b, "top");
    this.grip(b, { edge: "bottom" });
  }

  /** a drop-down front hinged at the bottom (dishwasher, oven) */
  drop(b: Box, grip = true): void {
    this.front(b);
    this.symbol(b, "bottom");
    if (grip) this.grip(b, { edge: "top" });
  }

  /** a full-height pull-out (larder, bottle rack) */
  pull(b: Box, at: GripAt): void {
    this.front(b);
    this.grip(b, at);
  }

  /** a shelf board seen from the front */
  board(x0: number, x1: number, y: number, t = T): void {
    if (x1 - x0 <= 0.2) return;
    this.push(rect(box(x0, y, x1, y + t), this.st("police", { weight: "light" })));
  }

  /** the oven: a drop door with its dark window and a steel bar (engine Mod.ovenDoor) */
  ovenDoor(b: Box): void {
    this.push(rect(b, this.st("uredaj", { weight: "light", fill: "appliance" })));
    const fw = b.x1 - b.x0;
    const fh = b.y1 - b.y0;
    if (fw > 12 && fh > 16) this.push(rect(box(b.x0 + 5, b.y0 + 5, b.x1 - 5, b.y1 - 9), this.st("uredaj", { weight: "fine", fill: "dark" })));
    if (fw > 16) this.push(line([b.x0 + 7, b.y1 - 3], [b.x1 - 7, b.y1 - 3], this.st("uredaj", { weight: "medium" })));
    this.symbol(b, "bottom");
  }

  /** the oven's control strip with its display */
  controlStrip(b: Box): void {
    this.push(rect(b, this.st("uredaj", { weight: "light", fill: "appliance" })));
    const xm = (b.x0 + b.x1) / 2;
    const ym = (b.y0 + b.y1) / 2;
    if (b.x1 - b.x0 > 14) this.push(rect(box(xm - 6, ym - 0.8, xm + 6, ym + 0.8), this.st("uredaj", { weight: "fine", fill: "dark" })));
  }

  /** a built-in microwave: a side-hinged glass door and a control column on the right (engine Mod.microwave) */
  microwave(x0: number, x1: number, y0: number, y1: number): void {
    const w = x1 - x0;
    const ctrl = Math.min(13, w * 0.22);
    const d = box(x0, y0, x1 - ctrl, y1);
    this.push(rect(d, this.st("uredaj", { weight: "light", fill: "appliance" })));
    if (d.x1 - d.x0 > 10 && y1 - y0 > 10) this.push(rect(box(d.x0 + 4, y0 + 4, d.x1 - 4, y1 - 4), this.st("uredaj", { weight: "fine", fill: "dark" })));
    this.push(rect(box(x1 - ctrl, y0, x1, y1), this.st("uredaj", { weight: "light", fill: "appliance" })));
    this.symbol(d, "left");
  }

  /** an open box (niche, open shelves) */
  open(b: Box, shelves: number[]): void {
    this.push(rect(b, this.st("police", { weight: "medium" })));
    for (const y of shelves) this.board(b.x0 + T, b.x1 - T, y);
  }

  /** a wine rack: the box and its diagonal lattice */
  wine(b: Box): void {
    this.push(rect(b, this.st("police", { weight: "medium" })));
    const s = this.st("police", { weight: "fine" });
    const step = 10;
    const ix0 = b.x0 + T;
    const ix1 = b.x1 - T;
    const iy0 = b.y0 + T;
    const iy1 = b.y1 - T;
    if (ix1 - ix0 < 4 || iy1 - iy0 < 4) return;
    // y = x + c and y = −x + c, clipped to the inside
    for (let c = Math.ceil((iy0 - ix1) / step) * step; c <= iy1 - ix0; c += step) {
      const xa = Math.max(ix0, iy0 - c);
      const xb = Math.min(ix1, iy1 - c);
      if (xb - xa > 0.5) this.push(line([xa, xa + c], [xb, xb + c], s));
    }
    for (let c = Math.ceil((ix0 + iy0) / step) * step; c <= ix1 + iy1; c += step) {
      const xa = Math.max(ix0, c - iy1);
      const xb = Math.min(ix1, c - iy0);
      if (xb - xa > 0.5) this.push(line([xa, c - xa], [xb, c - xb], s));
    }
  }

  /** a thick side panel (end unit); ribbed: grooves along it */
  sidePanel(b: Box, ribs: boolean, stone: boolean): void {
    this.push(rect(b, this.st(stone ? "radna-ploca" : "fronta", { weight: "medium", ...(stone ? { fill: "worktop" as const } : {}) })));
    if (ribs) {
      const n = Math.max(1, Math.round((b.x1 - b.x0) / 2) - 1);
      for (let i = 1; i <= n; i++) {
        const x = b.x0 + ((b.x1 - b.x0) * i) / (n + 1);
        this.push(line([x, b.y0], [x, b.y1], this.st("fronta", { weight: "fine" })));
      }
    }
  }

  /** the Gola channel under the worktop */
  channel(x0: number, x1: number, y0: number, y1: number): void {
    if (y1 - y0 <= 0.1 || x1 - x0 <= 0.1) return;
    this.push(rect(box(x0, y0, x1, y1), this.st("rucka", { weight: "fine", fill: "dark" })));
  }

  spacer(b: Box): void {
    this.push(rect(b, this.st("prazno", { line: "dashed", weight: "fine" })));
  }
}

/** glass-door frame width (cm): a metal profile's own, else the 4,5 cm front frame */
function glassFrame(plan: KitchenPlan, slot: PlanSlot): number {
  const g = glassOf(plan.cfg, slot.opt);
  const fd = glassFrameDef(g.frame);
  return fd?.render.metal ? fd.render.width : 4.5;
}

/** the x range an end unit draws over: its slot and, at its end, the run's end panel it took over */
function endSpan(slot: PlanSlot): { x0: number; x1: number } {
  const pad = slot.end?.pad ?? 0;
  return { x0: slot.end?.side === "left" ? -pad : 0, x1: slot.width + (slot.end?.side === "right" ? pad : 0) };
}

/**
 * The front view of a plan slot. Base and island units stand on the plinth up to the worktop's underside, wall units
 * hang between plan.heights.upperBottom / upperTop (+ the "do stropa" top box), tall units from the plinth to
 * tallSplit (+ their top box to tallTop).
 */
export function slotFace(slot: PlanSlot, ctx: FaceCtx): Face {
  const { plan } = ctx;
  const h = plan.heights;
  // its own style, its zone's (KitchenConfig.zoneHandles) or the kitchen's — as the engine builds it
  const handles: HandleStyle = openingOf(plan.cfg, slot.opt, slot.zone);
  const b = new FaceBuilder(slot, slot.width, handles);
  const w = slot.width;
  const zone = slot.zone === "island" ? "base" : slot.zone;
  const def = moduleDef(zone, slot.type);
  if (zone === "upper") return upperFace(b, slot, ctx, h, def?.spacer ?? false);
  if (zone === "tall") return tallFace(b, slot, ctx, h);

  // ---- base / island
  const top = carcassTop(h);
  const yb = h.plinth;
  const yt = top - gripGap(handles);
  const full = box(0, 0, w, top);
  if (def?.spacer) {
    b.spacer(box(0, 0, w, top));
    return { prims: b.prims, box: full, spacer: true };
  }
  const H = top - yb;
  const type = slot.type;
  const gola = handles === "bez";
  const corner = slot.corner;
  switch (type) {
    case "vitrina":
      b.plinth(0, w, yb);
      if (gola) b.channel(0, w, yt, top);
      b.doors(0, w, yb, yt, "top", ctx.hinge, glassFrame(plan, slot));
      b.outline(box(0, 0, w, top));
      return { prims: b.prims, box: full, spacer: false };
    case "vinoteka":
      b.plinth(0, w, yb);
      b.wine(box(0, yb, w, top));
      return { prims: b.prims, box: full, spacer: false };
    case "police-zaobljene":
    case "police-kose": {
      const { x0, x1 } = endSpan(slot);
      b.plinth(x0, x1, yb);
      for (const y of [yb, yb + H * 0.36, yb + H * 0.68, top - T]) b.board(x0, x1, y);
      b.push(line([slot.end?.side === "left" ? x1 : x0, yb], [slot.end?.side === "left" ? x1 : x0, top], { layer: "police", weight: "light", ref: slot.id }));
      return { prims: b.prims, box: box(x0, 0, x1, top), spacer: false };
    }
    case "bocna":
    case "bocna-radna":
    case "bocna-rebrasta": {
      const { x0, x1 } = endSpan(slot);
      b.sidePanel(box(x0, 0, x1, top), type === "bocna-rebrasta", type === "bocna-radna");
      return { prims: b.prims, box: box(x0, 0, x1, top), spacer: false };
    }
  }
  if (corner && cornerFoot("base", type).shape !== "blind") {
    shapedCorner(b, slot, "base", yb, top, yt, gola);
    return { prims: b.prims, box: corner === "left" ? box(DIM.baseFace, 0, w, top) : box(0, 0, w - DIM.baseFace, top), spacer: false };
  }

  b.plinth(corner === "left" ? BLIND.base : 0, corner === "right" ? w - BLIND.base : w, yb);
  if (gola && type !== "police") b.channel(corner === "left" ? BLIND.base : 0, corner === "right" ? w - BLIND.base : w, yt, top);

  if (corner) {
    // blind corner: the blind part (towards the corner) is behind the neighbouring run; a fixed filler and the door
    const doorW = w - BLIND.base - BLIND_FILL;
    if (corner === "left") {
      b.front(box(BLIND.base, yb, BLIND.base + BLIND_FILL, yt));
      b.door(box(BLIND.base + BLIND_FILL, yb, w, yt), "right", "top");
      b.outline(box(BLIND.base, 0, w, top));
    } else {
      b.door(box(0, yb, doorW, yt), "left", "top");
      b.front(box(doorW, yb, doorW + BLIND_FILL, yt));
      b.outline(box(0, 0, w - BLIND.base, top));
    }
    // the label goes on the part one sees
    return { prims: b.prims, box: corner === "left" ? box(BLIND.base, 0, w, top) : box(0, 0, w - BLIND.base, top), spacer: false };
  }

  // the drawer split (KitchenConfig.drawerLayout / opt.drawers) and the Gola channel between drawers (gola.between)
  const split = drawerRatios(plan.cfg, type, slot.opt);
  const mid = golaBetween(plan.cfg, handles);
  switch (type) {
    case "ladice":
      b.drawers(0, w, yb, yt, split ?? [0.22, 0.39, 0.39], false, mid);
      break;
    case "ladice2":
      b.drawers(0, w, yb, yt, split ?? [0.5, 0.5], false, mid);
      break;
    case "ladice4":
      b.drawers(0, w, yb, yt, split ?? [0.19, 0.27, 0.27, 0.27], false, mid);
      break;
    case "ladice-unutarnja": {
      const mid = yb + (yt - yb) * 0.5;
      b.drawer(box(0, mid, w, yt));
      b.drawer(box(0, yb, w, mid));
      // the inner drawer behind the upper front
      b.push(rect(box(T + 2, yt - 11.5, w - T - 2, yt - 3.5), { layer: "fronta", line: "hidden", weight: "fine", ref: slot.id }));
      break;
    }
    case "ploca":
      b.drawers(0, w, yb, yt, split ?? [0.22, 0.39, 0.39], true, mid);
      break;
    case "ploca-pecnica":
    case "pecnica-donja": {
      const strip = 9;
      const ovenTop = yt - strip;
      const ovenBot = ovenTop - 50;
      b.controlStrip(box(0, ovenTop, w, yt));
      b.ovenDoor(box(0, ovenBot, w, ovenTop));
      if (ovenBot - yb > 6) b.drawer(box(0, yb, w, ovenBot));
      break;
    }
    case "perilica":
      b.drop(box(0, yb, w, yt));
      break;
    case "smece":
      b.drawer(box(0, yb, w, yt));
      break;
    case "boce":
      b.pull(box(0, yb, w, yt), { edge: "top" });
      break;
    case "police":
      b.open(box(0, yb, w, top), [yb + H * 0.36, yb + H * 0.68]);
      break;
    case "vrata2":
      b.doors(0, w, yb, yt, "top", ctx.hinge, null, true);
      break;
    default:
      b.doors(0, w, yb, yt, "top", ctx.hinge);
  }
  b.outline(box(0, 0, w, top));
  return { prims: b.prims, box: full, spacer: false };
}

/**
 * L-shaped / diagonal corner units (catalog CORNER_FOOT 90 × 90 base, 60 × 60 wall unit) seen on wall A: the leaf on
 * A's side between the neighbour's front line and the slot's far edge; the rest is behind the neighbour's run
 */
function shapedCorner(b: FaceBuilder, slot: PlanSlot, zone: "base" | "upper", f0: number, c1: number, f1: number, gola: boolean): void {
  const w = slot.width;
  const right = slot.corner === "right";
  const face = zone === "base" ? DIM.baseFace : UPPER_FACE;
  const x0 = right ? 0 : face;
  const x1 = right ? w - face : w;
  if (x1 - x0 <= 0.5) return;
  const type = slot.type;
  if (zone === "base") {
    b.plinth(x0, x1, f0);
    if (gola && type !== "kutna-polica") b.channel(x0, x1, f1, c1);
  }
  const fb = box(x0, f0, x1, f1);
  if (type === "kutna-polica") {
    b.open(box(x0, f0, x1, c1), [f0 + (c1 - f0) * 0.5 - T / 2]);
    return;
  }
  if (type === "kutni-ladice") b.drawers(x0, x1, f0, f1, [0.22, 0.39, 0.39]);
  else if (type === "kutni-dijagonalni" || type === "kutni-dijagonalni-staklo") {
    // the diagonal door, seen at 45°
    b.front(fb, type === "kutni-dijagonalni-staklo" ? "glass" : undefined);
    b.symbol(fb, right ? "right" : "left");
  } else {
    // bi-fold: the leaf on A's side folds onto the neighbour's leaf (hinged in the inner corner)
    b.door(fb, right ? "right" : "left", zone === "base" ? "top" : "bottom");
  }
  b.outline(box(x0, zone === "base" ? 0 : f0, x1, c1));
}

function upperFace(b: FaceBuilder, slot: PlanSlot, ctx: FaceCtx, h: HeightPlan, spacer: boolean): Face {
  const { plan } = ctx;
  const w = slot.width;
  const ub = h.upperBottom;
  const ut = h.upperTop;
  const lip = lipOf(b.handles);
  const y0 = ub - lip;
  const type = slot.type;
  const corner = slot.corner;
  const topBox = h.topRow && hasTopBox(type) ? h.topRow : null;
  const envTop = topBox ? topBox.to : ut;
  if (spacer) {
    b.spacer(box(0, ub, w, ut));
    return { prims: b.prims, box: box(0, ub, w, ut), spacer: true };
  }
  const env = box(0, Math.min(y0, ub), w, envTop);
  switch (type) {
    case "police-visece": {
      const { rows } = shelvesOf(slot.opt);
      const n = Math.max(1, Math.min(3, rows));
      const H = ut - ub;
      const ys = n === 1 ? [ub + H * 0.15] : n === 2 ? [ub + H * 0.08, ub + H * 0.6] : [ub + H * 0.06, ub + H * 0.4, ub + H * 0.74];
      const { x0, x1 } = endSpan(slot);
      for (const y of ys) b.board(x0, x1, y, 4);
      return { prims: b.prims, box: box(x0, ub, x1, ut), spacer: false };
    }
    case "vinoteka":
      b.wine(box(0, ub, w, ut));
      if (topBox) b.flap(box(0, topBox.from, w, topBox.to));
      return { prims: b.prims, box: box(0, ub, w, envTop), spacer: false };
    case "polica-zaobljena":
    case "polica-kosa": {
      const { x0, x1 } = endSpan(slot);
      for (const y of [ub, ub + (ut - ub) * 0.5 - T / 2, ut - T]) b.board(x0, x1, y);
      const xs = slot.end?.side === "left" ? x1 : x0;
      b.push(line([xs, ub], [xs, ut], { layer: "police", weight: "light", ref: slot.id }));
      return { prims: b.prims, box: box(x0, ub, x1, ut), spacer: false };
    }
    case "bocna":
    case "bocna-rebrasta": {
      // up through a "do stropa" top row and the cornice: the panel ends the whole stack
      const top = h.cornice ? h.cornice.to : h.topRow ? h.topRow.to : ut;
      const { x0, x1 } = endSpan(slot);
      b.sidePanel(box(x0, y0, x1, top), type === "bocna-rebrasta", false);
      return { prims: b.prims, box: box(x0, y0, x1, top), spacer: false };
    }
    case "nisa":
      b.open(box(0, ub, w, ut), [ub + (ut - ub) * 0.5 - T / 2]);
      // "do stropa": a top box with a flap on the niche too (engine buildHeightExtras)
      if (topBox) b.flap(box(0, topBox.from, w, topBox.to));
      return { prims: b.prims, box: box(0, ub, w, envTop), spacer: false };
    case "polica": {
      // one thick oak shelf at the bottom of the wall-unit zone and a thinner one above
      b.board(0, w, ub, 4);
      b.board(0, w, ub + (ut - ub) * 0.62, 3);
      return { prims: b.prims, box: box(0, ub, w, ut), spacer: false };
    }
  }
  if (corner && cornerFoot("upper", type).shape !== "blind") {
    shapedCorner(b, slot, "upper", y0, ut, ut, false);
    const right = corner === "right";
    if (topBox) b.front(box(right ? 0 : UPPER_FACE, topBox.from, right ? w - UPPER_FACE : w, topBox.to));
    return { prims: b.prims, box: box(right ? 0 : UPPER_FACE, env.y0, right ? w - UPPER_FACE : w, env.y1), spacer: false };
  }
  const glass = type === "vitrina" ? glassFrame(plan, slot) : null;
  if (corner) {
    const doorW = w - BLIND.upper - BLIND_FILL;
    const rows: [number, number][] = [[y0, ut]];
    if (topBox) rows.push([topBox.from, topBox.to]);
    rows.forEach(([a, c], i) => {
      if (corner === "left") {
        b.front(box(BLIND.upper, a, BLIND.upper + BLIND_FILL, c));
        b.door(box(BLIND.upper + BLIND_FILL, a, w, c), "right", "bottom", i === 0 ? glass : null);
      } else {
        b.door(box(0, a, doorW, c), "left", "bottom", i === 0 ? glass : null);
        b.front(box(doorW, a, doorW + BLIND_FILL, c));
      }
    });
    const vis = corner === "left" ? box(BLIND.upper, y0, w, envTop) : box(0, y0, w - BLIND.upper, envTop);
    b.outline(vis);
    return { prims: b.prims, box: vis, spacer: false };
  }
  switch (type) {
    case "klapna":
      b.flap(box(0, y0, w, ut));
      break;
    case "klapna2": {
      // bi-fold lift: two horizontal leaves, the lower folds onto the upper
      const ym = (y0 + ut) / 2;
      b.front(box(0, ym, w, ut));
      b.symbol(box(0, ym, w, ut), "top");
      b.front(box(0, y0, w, ym));
      b.symbol(box(0, y0, w, ym), "top");
      b.grip(box(0, y0, w, ym), { edge: "bottom" });
      break;
    }
    case "vitrina":
      b.doors(0, w, y0, ut, "bottom", ctx.hinge, glass);
      break;
    case "napa": {
      // a hood hidden in the wall unit: its visor (pulls out) under the doors
      const hz = 10;
      b.doors(0, w, ub + hz, ut, "bottom", ctx.hinge);
      b.push(rect(box(0, y0, w, ub + hz), { layer: "napa", weight: "light", fill: "appliance", ref: slot.id }));
      break;
    }
    case "mikrovalna": {
      const mh = Math.min(39, (ut - ub) * 0.56);
      b.microwave(0, w, ub, ub + mh);
      b.flap(box(0, ub + mh, w, ut));
      if (lip > 0) b.front(box(0, y0, w, ub));
      break;
    }
    default:
      b.doors(0, w, y0, ut, "bottom", ctx.hinge);
  }
  if (topBox) b.flap(box(0, topBox.from, w, topBox.to));
  b.outline(box(0, y0, w, envTop));
  return { prims: b.prims, box: env, spacer: false };
}

function tallFace(b: FaceBuilder, slot: PlanSlot, ctx: FaceCtx, h: HeightPlan): Face {
  const { plan } = ctx;
  const w = slot.width;
  const y0 = h.plinth;
  // a tall unit in one piece up to the ceiling (HeightSpec.onePiece / opt.onePiece): no split, no top box
  const split = tallSplitOf(plan.cfg, h, slot.opt);
  const y1 = split ?? h.tallTop;
  const H = y1 - y0;
  const type = slot.type;
  const hinge = ctx.tallHinge;
  const def = moduleDef("tall", type);
  const topBox = split !== null && !def?.endUnit && h.tallTop - split > 10 ? { from: split, to: h.tallTop } : null;
  const env = box(0, 0, w, topBox ? topBox.to : y1);
  if (def?.spacer) {
    b.spacer(env);
    return { prims: b.prims, box: env, spacer: true };
  }
  if (type === "bocna" || type === "bocna-rebrasta") {
    // up to the top of the column, its top box and cornice included
    const top = h.cornice ? h.cornice.to : h.tallTop;
    const { x0, x1 } = endSpan(slot);
    b.sidePanel(box(x0, 0, x1, top), type === "bocna-rebrasta", false);
    return { prims: b.prims, box: box(x0, 0, x1, top), spacer: false };
  }
  b.plinth(0, w, y0);
  if (type === "hladnjak-sbs" || type === "hladnjak-sbs-vrata") sbsFace(b, slot, h, y1, plan.cfg.finish?.fridgeHandle === "udubljena", sbsAlone(plan.slots, slot));
  else
    switch (type) {
      case "vitrina":
        b.doors(0, w, y0, y1, "mid", hinge, glassFrame(plan, slot));
        break;
      case "police":
        b.open(box(0, y0, w, y1), [0.2, 0.4, 0.6, 0.8].map((f) => y0 + H * f));
        break;
      case "vinoteka":
        b.wine(box(0, y0, w, y1));
        break;
      case "ormar-nisa":
      case "kava": {
        // an open niche at worktop height (the coffee nook's behind pocket doors), drawers / a door below, a door above
        const coffee = type === "kava";
        const n0 = Math.min(Math.max(y0 + 50, h.worktop), y1 - 75);
        const n1 = Math.min(n0 + (coffee ? 55 : 45), y1 - 22);
        if (coffee) {
          b.drawer(box(0, y0 + (n0 - y0) * 0.5, w, n0 - T));
          b.drawer(box(0, y0, w, y0 + (n0 - y0) * 0.5));
          b.doors(0, w, n0 - T, n1 + T, "mid", hinge);
        } else {
          b.door(box(0, y0, w, n0 - T), hinge, "top");
          b.open(box(0, n0 - T, w, n1 + T), []);
        }
        b.door(box(0, n1 + T, w, y1), hinge, "bottom");
        break;
      }
      case "hladnjak": {
        const freezer = Math.min(72, H * 0.34);
        const top = Math.max(20, H - freezer - 102);
        const fridge = H - freezer - top;
        b.door(box(0, y0, w, y0 + freezer), hinge, "top");
        b.door(box(0, y0 + freezer, w, y0 + freezer + fridge), hinge, "mid");
        b.door(box(0, y0 + freezer + fridge, w, y1), hinge, "bottom");
        break;
      }
      case "pecnica":
      case "pecnica-mikro": {
        // drawers / a door under the oven, the oven low / standard / at eye level, the microwave (fronts.ts ovenColumn)
        const oc = ovenColumn(y0, y1, h.worktop, type === "pecnica-mikro", slot.opt);
        for (const [a, c] of oc.drawers) b.drawer(box(0, a, w, c));
        if (oc.door) b.door(box(0, oc.door[0], w, oc.door[1]), hinge, "top");
        b.controlStrip(box(0, oc.strip[0], w, oc.strip[1]));
        b.ovenDoor(box(0, oc.oven[0], w, oc.oven[1]));
        if (oc.micro) b.microwave(0, w, oc.micro[0], oc.micro[1]);
        if (oc.above) b.door(box(0, oc.above[0], w, oc.above[1]), hinge, "bottom");
        break;
      }
      case "smocnica":
        b.pull(box(0, y0, w, y1), { edge: "mid", free: hinge === "left" ? "right" : "left" });
        break;
      case "metle":
        b.door(box(0, y0, w, y1), hinge, "mid");
        break;
      case "perilica-rublja":
        b.door(box(0, y0, w, y0 + 85), hinge, "top");
        b.doors(0, w, y0 + 85, y1, "bottom", hinge);
        break;
      default:
        b.doors(0, w, y0, y1, "mid", hinge);
    }
  if (topBox) b.flap(box(0, topBox.from, w, topBox.to));
  b.outline(box(0, 0, w, topBox ? topBox.to : y1));
  return { prims: b.prims, box: env, spacer: false };
}

/**
 * the side-by-side fridge niche (catalog SBS): a side panel each side, the appliance's two doors (freezer left), the
 * bridge cabinet above it up to the column's line (engine modules.ts buildSbs)
 */
function sbsFace(b: FaceBuilder, slot: PlanSlot, h: HeightPlan, y1: number, recessed = false, alone = false): void {
  const w = slot.width;
  const P = SBS.panel;
  const aw = Math.min(SBS.appliance, w - 2 * P - 2 * SBS.gap);
  const ax0 = (w - aw) / 2;
  const ax1 = ax0 + aw;
  const aTop = Math.min(SBS.applianceHeight, y1 - 20);
  const Hc = y1 - h.plinth;
  const fridgeLine = y1 - Math.max(20, Hc - Math.min(72, Hc * 0.34) - 102);
  // (alone in its column — plan.ts sbsAlone — right above the appliance)
  const bridge0 = Math.min(alone ? aTop + SBS.topGap : Math.max(aTop + SBS.topGap, fridgeLine), y1 - 12);
  const split = ax0 + aw * 0.44;
  const s = { layer: "fronta" as const, weight: "light" as const, ref: slot.id };
  b.push(rect(box(0, 0, P, y1), s));
  b.push(rect(box(w - P, 0, w, y1), s));
  const dy0 = 3;
  const leaf = (x0: number, x1: number, hinge: "left" | "right") => {
    const lb = box(x0, dy0, x1, aTop);
    b.push(rect(lb, { layer: "uredaj", weight: "light", fill: "appliance", ref: slot.id }));
    b.symbol(lb, hinge);
    // the long vertical bar handle at the free side — or a recessed grip in the door's edge (FinishSpec.fridgeHandle)
    const L = Math.min(110, (aTop - dy0) * 0.62);
    const ym = (dy0 + aTop) / 2 + 5;
    if (recessed) {
      const gx = hinge === "left" ? x1 - 2.4 : x0;
      const gl = SBS_GRIP.length / 2;
      b.push(rect(box(gx, SBS_GRIP.centre - gl, gx + 2.4, SBS_GRIP.centre + gl), { layer: "uredaj", weight: "fine", fill: "dark", ref: slot.id }));
    } else {
      const fx = hinge === "left" ? x1 - 3 : x0 + 3;
      b.push(rect(box(fx - 0.9, ym - L / 2, fx + 0.9, ym + L / 2), { layer: "uredaj", weight: "medium", fill: "dark", ref: slot.id }));
    }
  };
  leaf(ax0, split, "left");
  leaf(split, ax1, "right");
  // the dispenser on the freezer door — flat doors with recessed grips: a slim display instead
  const dx = ax0 + (split - ax0) * 0.5;
  const dyc = dy0 + (aTop - dy0) * 0.58;
  if (recessed) {
    const sx = ax0 + (split - ax0) * 0.6;
    b.push(rect(box(sx - 2.6, SBS_GRIP.display - 10.5, sx + 2.6, SBS_GRIP.display + 10.5), { layer: "uredaj", weight: "fine", fill: "dark", ref: slot.id }));
  } else b.push(rect(box(dx - 7.5, dyc - 15, dx + 7.5, dyc + 13), { layer: "uredaj", weight: "fine", fill: "dark", ref: slot.id }));
  if (y1 - bridge0 > 10) {
    const x0 = P;
    const x1 = w - P;
    if (slot.type === "hladnjak-sbs-vrata") {
      const mid = (x0 + x1) / 2;
      b.door(box(x0, bridge0, mid, y1), "left", "bottom");
      b.door(box(mid, bridge0, x1, y1), "right", "bottom");
    } else {
      const rows = y1 - bridge0 > 62 ? 2 : 1;
      const rh = (y1 - bridge0) / rows;
      for (let r = 0; r < rows; r++) b.flap(box(x0, bridge0 + r * rh, x1, bridge0 + (r + 1) * rh));
    }
  }
}
