/**
 * The floor plan (tlocrt): the room's walls with their thickness and the window, every kitchen run (base cabinets
 * 60 cm deep under the worktop outline, tall columns crossed, corner units in their real footprint, wall units and
 * visible hoods dashed above), the island / peninsula (worktop pieces, waterfall sides, back panel or outer row, bar /
 * table, seats, the ceiling hood dashed), sink and hob symbols, and dimension chains: each wall, where the kitchen and
 * its tall columns stand on it, the window, the island's place and the aisle.
 *
 * Drawing frame: x = the room's x (wall A's left end at 0), y = −z (wall A's face at y = 0, the room below). Every run
 * is drawn in its own plan frame (u along the run, v = −depth: into the room is −v) and turned into place, so the
 * geometry is written once for every wall and the island. Pure: no DOM, no three.js.
 */

import { cornerFoot, moduleDef } from "../catalog";
import { DIM, hoodKindOf, wallsFor, type IslandPlan, type KitchenPlan, type PlanSlot, type RunId, type RunPlan } from "../plan";
import type { Layout, WallId } from "../types";
import { WALL_T, elementLabels, isSpacer, runOf, runTitle, slotDef, slotTypeName } from "./common";
import { UPPER_FACE } from "./face";
import {
  EMPTY_BOX,
  boundsOf,
  box,
  chain,
  circle,
  fmtCm,
  grow,
  line,
  mapBox,
  mapPrim,
  poly,
  rect,
  rotMove,
  type Box,
  type Dim,
  type Drawing,
  type Prim,
  type Pt,
  type Style,
  type Tag,
  type Xf,
} from "./model";

const LAYOUT_NAME: Record<Layout, string> = {
  ravna: "ravna kuhinja",
  L: "kuhinja u obliku slova L",
  U: "kuhinja u obliku slova U",
  otok: "kuhinja s otokom",
  poluotok: "kuhinja s poluotokom",
  G: "kuhinja u obliku slova G",
};

/** a run's plan frame (u, v) → the drawing: turned by the run's rotation about y, moved to its origin (x, −z) */
function frameXf(f: { x: number; z: number; rot: number }): Xf {
  return rotMove((f.rot * 180) / Math.PI, f.x, -f.z);
}

/** the frames of the walls' runs (engine kitchen.ts: B turned +90° at z = b, C turned −90° at x = A) */
export function wallFrame(plan: KitchenPlan, wall: WallId): { x: number; z: number; rot: number } {
  const w = plan.cfg.walls;
  if (wall === "b") return { x: 0, z: w.b, rot: Math.PI / 2 };
  if (wall === "c") return { x: w.a, z: 0, rot: -Math.PI / 2 };
  return { x: 0, z: 0, rot: 0 };
}

/** collects primitives drawn in a run's local plan frame, mapped into the drawing */
class Frame {
  constructor(
    readonly out: Prim[],
    readonly m: Xf,
  ) {}
  add(p: Prim): void {
    this.out.push(mapPrim(p, this.m));
  }
  rect(x0: number, v0: number, x1: number, v1: number, s: Style): void {
    if (Math.abs(x1 - x0) < 0.05 || Math.abs(v1 - v0) < 0.05) return;
    this.add(rect(box(x0, v0, x1, v1), s));
  }
  poly(pts: Pt[], closed: boolean, s: Style): void {
    this.add(poly(pts, closed, s));
  }
  box(b: Box): Box {
    return mapBox(b, this.m);
  }
}

/** a rounded rectangle as a closed polyline (corner radius r, 4 segments per corner) */
function roundRect(x0: number, y0: number, x1: number, y1: number, r: number): Pt[] {
  const rr = Math.max(0, Math.min(r, (x1 - x0) / 2, (y1 - y0) / 2));
  const pts: Pt[] = [];
  const corner = (cx: number, cy: number, a0: number) => {
    for (let i = 0; i <= 4; i++) {
      const a = ((a0 + (90 * i) / 4) * Math.PI) / 180;
      pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
    }
  };
  corner(x1 - rr, y0 + rr, -90);
  corner(x1 - rr, y1 - rr, 0);
  corner(x0 + rr, y1 - rr, 90);
  corner(x0 + rr, y0 + rr, 180);
  return pts;
}

/** the sink in a base / island cabinet (engine modules.ts: bowl 70 / 86 cm, 12–52 cm from the back, tap at 7,5) */
function sinkSymbol(g: Frame, s: PlanSlot): void {
  const w = s.width;
  const wide = w >= 99;
  const bw = Math.min(w - 14, wide ? 86 : 70);
  if (bw < 10) return;
  const xc = s.x + w / 2;
  const st: Style = { layer: "uredaj", weight: "light", ref: s.id };
  g.poly(roundRect(xc - bw / 2, -52, xc + bw / 2, -12, 5), true, st);
  if (wide) {
    const dv = xc + bw * 0.12;
    g.add(line([dv, -52], [dv, -12], st));
    g.add(circle([(xc - bw / 2 + dv) / 2, -32], 3.5, { ...st, weight: "fine" }));
    g.add(circle([(dv + xc + bw / 2) / 2, -32], 3.5, { ...st, weight: "fine" }));
  } else g.add(circle([xc, -32], 3.5, { ...st, weight: "fine" }));
  g.add(circle([xc, -7.5], 2.5, st));
}

/** the hob on a base / island cabinet (engine: 58 / 78 / 88 cm wide, 51 deep, centred 33 cm from the back) */
function hobSymbol(plan: KitchenPlan, g: Frame, s: PlanSlot): void {
  const w = s.width;
  const hw = Math.min(w >= 99 ? 88 : w >= 80 ? 78 : 58, w - 4);
  if (hw < 20) return;
  const xc = s.x + w / 2;
  const zc = -DIM.hobCenterZ;
  const st: Style = { layer: "uredaj", weight: "light", ref: s.id };
  g.rect(xc - hw / 2, zc - 25.5, xc + hw / 2, zc + 25.5, { ...st, weight: "medium" });
  const dx = hw / 4;
  const burners: [number, number, number][] = [
    [xc - dx, zc + 12, 8],
    [xc + dx, zc + 12, 6.5],
    [xc - dx, zc - 12, 6.5],
    [xc + dx, zc - 12, 8],
  ];
  if (hw >= 70) burners.push([xc, zc, 10]);
  for (const [x, z, r] of burners) g.add(circle([x, z], r, { ...st, weight: "fine" }));
  // a downdraft hob: the extractor's slot across its middle
  if (hoodKindOf(plan.cfg, s.opt) === "ploca") g.rect(xc - hw / 2 + 2, zc - 3.5, xc + hw / 2 - 2, zc + 3.5, { ...st, fill: "dark", weight: "fine" });
}

function appliances(plan: KitchenPlan, g: Frame, s: PlanSlot): void {
  const f = moduleDef("base", s.type)?.feature;
  if (f === "sink") sinkSymbol(g, s);
  else if (f === "hob") hobSymbol(plan, g, s);
}

/** the outline of an L-shaped / diagonal corner unit in its slot (plan frame of wall A: v = −depth) */
function shapedOutline(s: PlanSlot, zone: "base" | "upper"): Pt[] {
  const f = cornerFoot(zone, s.type);
  const w = s.width;
  const dc = zone === "base" ? DIM.baseDepth : DIM.upperDepth;
  const a = f.across;
  const right = s.corner === "right";
  const X = (x: number) => s.x + (right ? w - x : x);
  const pts: [number, number][] =
    f.shape === "diagonal"
      ? [
          [0, 0],
          [w, 0],
          [w, dc],
          [dc, a],
          [0, a],
        ]
      : [
          [0, 0],
          [w, 0],
          [w, dc],
          [dc, dc],
          [dc, a],
          [0, a],
        ];
  return pts.map(([x, z]): Pt => [X(x), -z]);
}

/** the footprint of an end unit (rounded / angled open shelves, side panel) at its free end */
function endUnitOutline(s: PlanSlot, depth: number): Pt[] {
  const pad = s.end?.pad ?? 0;
  const x0 = s.x - (s.end?.side === "left" ? pad : 0);
  const x1 = s.x + s.width + (s.end?.side === "right" ? pad : 0);
  const out = s.end?.side === "left" ? x0 : x1;
  const inn = s.end?.side === "left" ? x1 : x0;
  const w = x1 - x0;
  if (s.type === "police-zaobljene" || s.type === "polica-zaobljena") {
    // the outer front corner rounded with the shelf's width
    const r = Math.min(w, depth);
    const sg = out > inn ? -1 : 1;
    const pts: Pt[] = [[inn, 0], [out, 0]];
    for (let i = 0; i <= 8; i++) {
      const a = (Math.PI / 2) * (i / 8);
      pts.push([out + sg * r * (1 - Math.cos(a)), -(depth - r) - r * Math.sin(a)]);
    }
    pts.push([inn, -depth]);
    return pts;
  }
  if (s.type === "police-kose" || s.type === "polica-kosa") {
    const c = Math.min(w * 0.85, depth);
    const sg = out > inn ? -1 : 1;
    return [
      [inn, 0],
      [out, 0],
      [out, -(depth - c)],
      [out + sg * c, -depth],
      [inn, -depth],
    ];
  }
  return [
    [x0, 0],
    [x1, 0],
    [x1, -depth],
    [x0, -depth],
  ];
}

/** the floor row and the wall units of one run, in its plan frame */
function drawRun(plan: KitchenPlan, run: RunId, g: Frame, labels: Map<string, string>, tags: Tag[]): void {
  const slots = plan.slots.filter((s) => s.run === run);
  // wall units first (dashed, above), so the floor row draws over them
  for (const s of slots.filter((x) => x.zone === "upper" && !isSpacer(x))) {
    const st: Style = { layer: "iznad", line: "hidden", weight: "fine", ref: s.id };
    if (s.corner && cornerFoot("upper", s.type).shape !== "blind") g.poly(shapedOutline(s, "upper"), true, st);
    else if (slotDef(s)?.endUnit) g.poly(endUnitOutline(s, s.type === "police-visece" ? 27 : UPPER_FACE), true, st);
    else g.rect(s.x, -UPPER_FACE, s.x + s.width, 0, st);
  }
  for (const p of plan.pieces.filter((x) => x.run === run)) {
    const upper = p.zone === "upper";
    g.rect(p.x, upper ? -UPPER_FACE : -DIM.baseDepth, p.x + p.width, 0, upper ? { layer: "iznad", line: "hidden", weight: "fine" } : { layer: "fronta", weight: "light" });
  }
  for (const s of slots.filter((x) => x.zone !== "upper")) {
    const def = slotDef(s);
    const spacer = Boolean(def?.spacer);
    // base, tall and island units: 60 cm with their fronts (a side-by-side's doors stand proud: drawn below)
    const d = DIM.baseDepth;
    const st: Style = spacer ? { layer: "prazno", line: "dashed", weight: "fine", ref: s.id } : { layer: "korpus", weight: s.zone === "tall" ? "medium" : "light", ref: s.id };
    let foot: Box;
    if (s.corner && cornerFoot("base", s.type).shape !== "blind") {
      const pts = shapedOutline(s, "base");
      g.poly(pts, true, st);
      foot = box(s.x, -DIM.baseDepth, s.x + s.width, 0);
    } else if (def?.endUnit) {
      const pts = endUnitOutline(s, d);
      g.poly(pts, true, st);
      let b = EMPTY_BOX;
      for (const q of pts) b = grow(b, q);
      foot = b;
    } else {
      g.rect(s.x, -d, s.x + s.width, 0, st);
      foot = box(s.x, -d, s.x + s.width, 0);
    }
    if (s.zone === "tall" && !spacer && !def?.endUnit) {
      // a full-height unit: crossed
      const x0 = s.x;
      const x1 = s.x + s.width;
      g.add(line([x0, 0], [x1, -d], { layer: "korpus", weight: "fine", ref: s.id }));
      g.add(line([x0, -d], [x1, 0], { layer: "korpus", weight: "fine", ref: s.id }));
      if (s.type === "hladnjak-sbs" || s.type === "hladnjak-sbs-vrata") {
        // the side-by-side's doors stand proud of the column
        g.rect(x0 + 2.5, -67, x1 - 2.5, -d, { layer: "uredaj", weight: "light", ref: s.id });
      }
    }
    if (!spacer) appliances(plan, g, s);
    const label = labels.get(s.id);
    if (label && !spacer) tags.push({ ref: s.id, label, name: slotTypeName(s), zone: s.zone, type: s.type, width: s.width, box: g.box(foot) });
  }
}

/**
 * The room's walls with their thickness (behind the face: +v in each wall's frame), the window cut into its wall: the
 * wall pieces are filled without a stroke and outlined as one (no joint lines where two walls meet in a corner)
 */
function drawWalls(plan: KitchenPlan, prims: Prim[]): void {
  const w = plan.cfg.walls;
  const walls = wallsFor(plan.cfg.layout);
  const T = WALL_T;
  const pieces: Box[] = [];
  for (const wall of walls) {
    const g = new Frame(prims, frameXf(wallFrame(plan, wall)));
    const len = w[wall];
    const u0 = wall === "a" && walls.includes("b") ? -T : 0;
    const u1 = wall === "a" && walls.includes("c") ? len + T : len;
    const win = plan.window && plan.window.wall === wall ? plan.window : null;
    if (!win) {
      pieces.push(g.box(box(u0, 0, u1, T)));
      continue;
    }
    const a = win.offset;
    const b = win.offset + win.width;
    if (a - u0 > 0.05) pieces.push(g.box(box(u0, 0, a, T)));
    if (u1 - b > 0.05) pieces.push(g.box(box(b, 0, u1, T)));
    const ws: Style = { layer: "prozor", weight: "light" };
    // the frame across the opening, the glass in the middle of the wall, the inner and outer face lines
    g.rect(a, T / 2 - 3, b, T / 2 + 3, ws);
    g.add(line([a, T / 2], [b, T / 2], { ...ws, weight: "fine" }));
    g.add(line([a, 0], [b, 0], { ...ws, weight: "fine" }));
    g.add(line([a, T], [b, T], { ...ws, weight: "fine" }));
    if (win.ledge) g.rect(a - 3, -2.5, b + 3, 0, { ...ws, weight: "fine" });
  }
  for (const b of pieces) prims.push(rect(b, { layer: "zid", fill: "wall", noStroke: true }));
  for (const [a, b] of unionOutline(pieces)) prims.push(line(a, b, { layer: "zid", weight: "heavy" }));
}

/** the outline of a union of axis-parallel boxes: every box edge without the parts lying on or in another box */
function unionOutline(boxes: readonly Box[]): [Pt, Pt][] {
  const out: [Pt, Pt][] = [];
  boxes.forEach((r, i) => {
    const edges: { horiz: boolean; at: number; from: number; to: number }[] = [
      { horiz: true, at: r.y0, from: r.x0, to: r.x1 },
      { horiz: true, at: r.y1, from: r.x0, to: r.x1 },
      { horiz: false, at: r.x0, from: r.y0, to: r.y1 },
      { horiz: false, at: r.x1, from: r.y0, to: r.y1 },
    ];
    for (const e of edges) {
      let parts: [number, number][] = [[e.from, e.to]];
      boxes.forEach((o, j) => {
        if (j === i) return;
        const inAcross = e.horiz ? o.y0 - 1e-6 <= e.at && e.at <= o.y1 + 1e-6 : o.x0 - 1e-6 <= e.at && e.at <= o.x1 + 1e-6;
        if (!inAcross) return;
        const c0 = e.horiz ? o.x0 : o.y0;
        const c1 = e.horiz ? o.x1 : o.y1;
        const next: [number, number][] = [];
        for (const [a, b] of parts) {
          if (c1 <= a || c0 >= b) next.push([a, b]);
          else {
            if (c0 > a) next.push([a, c0]);
            if (c1 < b) next.push([c1, b]);
          }
        }
        parts = next;
      });
      for (const [a, b] of parts) {
        if (b - a < 0.01) continue;
        out.push(e.horiz ? [[a, e.at], [b, e.at]] : [[e.at, a], [e.at, b]]);
      }
    }
  });
  return out;
}

/** the island / peninsula in its plan frame (v = −z: its fronts at v = −60, the outer side v > 0) */
function drawIsland(plan: KitchenPlan, I: IslandPlan, g: Frame, labels: Map<string, string>, tags: Tag[]): void {
  const R = (r: { from: number; to: number; z0: number; z1: number }, s: Style) => g.rect(r.from, -r.z1, r.to, -r.z0, s);
  if (I.backPanel) g.rect(I.backPanel.from, 0, I.backPanel.to, DIM.islandBackT, { layer: "fronta", weight: "light" });
  if (I.backRow) {
    g.rect(I.backRow.from, 0, I.backRow.to, I.backRow.depth, { layer: "korpus", weight: "light" });
    let x = I.backRow.from;
    for (const dw of I.backRow.doors.slice(0, -1)) {
      x += dw;
      g.add(line([x, 0], [x, I.backRow.depth], { layer: "korpus", weight: "fine" }));
    }
  }
  drawRun(plan, "isl", g, labels, tags);
  for (const e of I.endPanels) R(e, { layer: "fronta", weight: "light" });
  for (const w of I.waterfalls) R(w, { layer: "radna-ploca", weight: "light", fill: "worktop" });
  for (const s of I.slab) R(s, { layer: "radna-ploca", weight: "medium" });
  const bar = I.bar;
  if (bar) {
    g.rect(bar.from, -bar.z1, bar.to, -bar.z0, { layer: "radna-ploca", weight: "medium" });
    if (bar.upstand) g.rect(bar.from, -bar.upstand.z1, bar.to, -bar.upstand.z0, { layer: "fronta", line: "hidden", weight: "fine" });
    for (const lg of bar.legs) g.rect(lg.from, -bar.z1, lg.to, -bar.z0, { layer: "radna-ploca", weight: "light", fill: "worktop" });
  }
  for (const s of I.seats) {
    const st: Style = { layer: "sjedenje", weight: "light" };
    if (s.kind === "chair") {
      // a chair at the lowered table: its backrest away from the table (towards +v, the outer side)
      g.rect(s.x - 21, -s.z - 21, s.x + 21, -s.z + 21, st);
      g.add(line([s.x - 21, -s.z + 17], [s.x + 21, -s.z + 17], st));
    } else g.add(circle([s.x, -s.z], 17, st));
  }
  const hd = I.hood;
  if (hd) {
    const st: Style = { layer: "iznad", line: "hidden", weight: "fine" };
    g.rect(hd.x - hd.width / 2, -hd.z - hd.depth / 2, hd.x + hd.width / 2, -hd.z + hd.depth / 2, st);
    if (hd.chimney.width > 0) g.rect(hd.x - hd.chimney.width / 2, -hd.z - hd.chimney.depth / 2, hd.x + hd.chimney.width / 2, -hd.z + hd.chimney.depth / 2, st);
  }
}

/** the floor plan of a kitchen (id "tlocrt") */
export function floorPlan(plan: KitchenPlan): Drawing {
  const prims: Prim[] = [];
  const tags: Tag[] = [];
  const dims: Dim[] = [];
  const labels = elementLabels(plan);
  const cfg = plan.cfg;
  const walls = wallsFor(cfg.layout);
  const T = WALL_T;

  drawWalls(plan, prims);
  for (const r of plan.runs) {
    const g = new Frame(prims, frameXf(wallFrame(plan, r.wall)));
    drawRun(plan, r.wall, g, labels, tags);
    for (const wt of r.worktops) g.rect(wt.from, -DIM.worktopDepth, wt.to, 0, { layer: "radna-ploca", weight: "medium" });
    for (const hd of r.hoods) {
      const st: Style = { layer: "iznad", line: "hidden", weight: "fine" };
      g.rect(hd.from, -hd.depth, hd.to, 0, st);
      const c = (hd.from + hd.to) / 2;
      g.rect(c - hd.chimney.width / 2, -hd.chimney.depth, c + hd.chimney.width / 2, 0, st);
    }
  }
  const I = plan.island;
  let islandBox: Box | null = null;
  if (I) {
    const start = prims.length;
    drawIsland(plan, I, new Frame(prims, frameXf(I.frame)), labels, tags);
    islandBox = boundsOf(prims.slice(start));
  }
  const geo = boundsOf(prims);

  // ---- every wall: the window, where the kitchen (and its tall columns) stand on it, the wall
  for (const w of walls) {
    const r = runOf(plan, w);
    if (!r) continue;
    const len = cfg.walls[w];
    // run-local u → the drawing's coordinate along the chain axis, and the point on the wall's outer face
    const axis = w === "a" ? "x" : "y";
    const along = (u: number) => (w === "a" ? u : w === "b" ? u - cfg.walls.b : -u);
    const at = (v: number): Pt => (w === "a" ? [v, T] : w === "b" ? [-T, v] : [cfg.walls.a + T, v]);
    const ref = w === "a" ? T : w === "b" ? -T : cfg.walls.a + T;
    const dir: 1 | -1 = w === "b" ? -1 : 1;
    const id = `tlocrt:${w}`;
    let tier = 0;
    const win = plan.window && plan.window.wall === w ? plan.window : null;
    if (win) dims.push(...chain(axis, [0, win.offset, win.offset + win.width, len].map(along), at, { ref, dir, tier: tier++ }, `${id}:prozor`));
    const parts = kitchenStops(r);
    if (parts.length > 2) dims.push(...chain(axis, parts.map(along), at, { ref, dir, tier: tier++ }, `${id}:kuhinja`));
    dims.push({ axis, a: at(along(0)), b: at(along(len)), place: { ref, dir, tier: tier++ }, chain: `${id}:zid`, label: runTitle(plan, w) });
  }

  // ---- the island: where it stands along wall A and how far from it; the peninsula: its length and depth
  if (I && islandBox) {
    const A = cfg.walls.a;
    if (I.kind === "otok") {
      const x0 = I.centerX - I.length / 2;
      const x1 = I.centerX + I.length / 2;
      const yb = islandBox.y0;
      const pos = chain("x", [0, A, x0, x1], (v) => [v, yb], { ref: yb, dir: -1, tier: 0 }, "tlocrt:otok-polozaj");
      dims.push(...pos);
      // an island overhanging an end of wall A: its own length on the next line
      if (!pos.some((x) => Math.abs(Math.min(x.a[0], x.b[0]) - x0) < 0.05 && Math.abs(Math.max(x.a[0], x.b[0]) - x1) < 0.05)) {
        dims.push({ axis: "x", a: [x0, yb], b: [x1, yb], place: { ref: yb, dir: -1, tier: 1 }, chain: "tlocrt:otok-duljina", label: runTitle(plan, "isl") });
      }
      // from wall A: its cabinets, the aisle, the island's cabinets, its outer row / back, the worktop's overhang
      const z0 = Math.min(...I.slab.map((r) => r.z0));
      const zs = [0, DIM.baseDepth, I.backZ - DIM.baseDepth, I.backZ];
      if (I.outer < -5) zs.push(I.backZ - I.outer);
      if (z0 < I.outer - 2) zs.push(I.backZ - z0);
      // a bar / table beyond the worktop: its outer edge too
      if (I.bar && I.bar.z0 < Math.min(z0, I.outer) - 2) zs.push(I.backZ - I.bar.z0);
      const xr = geo.x1;
      dims.push(...chain("y", zs.map((z) => -z), (v) => [xr, v], { ref: xr, dir: 1, tier: 0 }, "tlocrt:otok-razmak"));
    } else {
      const right = I.side !== "left";
      const xr = right ? islandBox.x1 : islandBox.x0;
      dims.push({ axis: "y", a: [xr, 0], b: [xr, -I.length], place: { ref: xr, dir: right ? 1 : -1, tier: 0 }, chain: "tlocrt:poluotok-duljina", label: runTitle(plan, "isl") });
      // across it: the cabinet fronts, the back, the worktop's outer edge
      const zx = (z: number) => (right ? I.frame.x - z : I.frame.x + z);
      const z0 = Math.min(...I.slab.map((r) => r.z0));
      const zs = [Math.max(...I.slab.map((r) => r.z1)), 0];
      if (I.outer < -5) zs.push(I.outer);
      if (z0 < I.outer - 2) zs.push(z0);
      if (I.bar && I.bar.z0 < Math.min(z0, I.outer) - 2) zs.push(I.bar.z0);
      const yb = islandBox.y0;
      dims.push(...chain("x", zs.map(zx), (v) => [v, yb], { ref: yb, dir: -1, tier: 0 }, "tlocrt:poluotok-dubina"));
    }
  }

  return {
    id: "tlocrt",
    kind: "plan",
    title: "Tlocrt",
    subtitle: `${LAYOUT_NAME[cfg.layout]} · ${walls.map((w) => `zid ${w.toUpperCase()} ${fmtCm(cfg.walls[w])} cm`).join(" · ")}${I ? ` · ${runTitle(plan, "isl").toLowerCase()} ${fmtCm(I.length)} cm` : ""}`,
    bounds: geo,
    prims,
    dims,
    tags,
  };
}

/**
 * the stops of a wall's "kitchen" chain (run-local cm): the wall's ends, where the cabinets start and end, and the tall
 * columns among them — 2 stops (nothing to say beyond the wall) when the kitchen fills the wall without a column
 */
function kitchenStops(r: RunPlan): number[] {
  const out = [0, r.length];
  const c = r.cabinets;
  if (!c) return out;
  const add = (v: number) => {
    if (v > 0.5 && v < r.length - 0.5 && !out.some((o) => Math.abs(o - v) < 0.5)) out.push(v);
  };
  add(c.from);
  add(c.to);
  for (const t of r.talls) {
    add(t.from);
    add(t.to);
  }
  return out.sort((a, b) => a - b);
}
