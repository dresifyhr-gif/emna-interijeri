/**
 * Line drawing of the hero kitchen, generated from the real planner (lib/studio/plan.ts) so the poster
 * shows the same modules, in the same places, as the 3D scene that replaces it.
 * Pure TypeScript; called from a server component, so plan.ts never ships to the browser for this.
 */

import { DIM, planKitchen } from "@/lib/studio/plan";
import type { KitchenConfig } from "@/lib/studio/types";
import {
  box,
  boundsOf,
  boxFaces,
  camera,
  centerDepth,
  kota,
  pathOf,
  ringY,
  seg,
  type Box,
  type FaceKind,
  type Label,
} from "./drawingKit";

export interface PosterShape {
  d: string;
  /** "face" = filled outline (hides what is behind it), "line" = detail stroke, "faint" = room / floor grid, "dim" = dimension line, "led" = glowing strip */
  kind: "face" | "line" | "faint" | "dim" | "led";
  face?: FaceKind;
  /** animation delay in seconds */
  delay: number;
}

export interface PosterDrawing {
  viewBox: string;
  shapes: PosterShape[];
  labels: (Label & { delay: number })[];
}

/** close to the engine's showcase camera while it assembles (orbit start ≈ 0.6 rad, elevation ≈ 0.32) */
const AZ = 0.62;
const EL = 0.33;

export function buildPoster(cfg: KitchenConfig): PosterDrawing {
  const plan = planKitchen(cfg);
  const c = camera(AZ, EL);
  const runA = plan.runs.find((r) => r.wall === "a");
  const A = runA?.length ?? cfg.walls.a;
  const plinth = DIM.plinth;
  const top = DIM.worktopTop;
  const topT = 4;
  const baseD = DIM.baseDepth;
  const upD = DIM.upperDepth;
  const upB = plan.upperBottom;
  const upT = plan.upperTop;

  const shapes: PosterShape[] = [];
  const labels: (Label & { delay: number })[] = [];
  const add = (d: string, kind: PosterShape["kind"], delay: number, face?: FaceKind) => shapes.push({ d, kind, delay, face });
  /** things in front of every solid (stools, island dimension) — appended after the solids */
  const late: PosterShape[] = [];
  const addLate = (d: string, kind: PosterShape["kind"], delay: number) => late.push({ d, kind, delay });

  // ---------------------------------------------------------------- room: wall A outline + floor grid
  const wx0 = -40;
  const wx1 = A + 40;
  const floorZ = (plan.island ? plan.island.backZ + DIM.islandOverhang : 200) + 110;
  for (let x = 0; x <= A; x += 60) add(seg(c, [x, 0, 0], [x, 0, floorZ]), "faint", 0.05 + x / 4000);
  for (let z = 60; z <= floorZ; z += 60) add(seg(c, [wx0, 0, z], [wx1, 0, z]), "faint", 0.1 + z / 4000);
  add(seg(c, [wx0, 0, 0], [wx1, 0, 0]), "line", 0);
  add(seg(c, [wx0, plan.ceiling, 0], [wx1, plan.ceiling, 0]), "faint", 0.2);
  add(seg(c, [wx0, 0, 0], [wx0, plan.ceiling, 0]), "faint", 0.15);
  add(seg(c, [wx1, 0, 0], [wx1, plan.ceiling, 0]), "faint", 0.15);

  // ---------------------------------------------------------------- solids (painter's order)
  type Solid = { b: Box; delay: number; details?: (b: Box) => string[] };
  const solids: Solid[] = [];

  const counter = runA?.counter;
  const tall = runA?.tall;
  const uppers = runA?.uppers ?? [];
  const runEnd = tall ? tall.to : counter?.to ?? A;
  const baseSlots = plan.slots.filter((s) => s.run === "a" && s.zone === "base");
  const upperSlots = plan.slots.filter((s) => s.run === "a" && s.zone === "upper");
  const tallSlots = plan.slots.filter((s) => s.zone === "tall");

  // plinth (recessed) under the whole wall run
  solids.push({ b: box(counter?.from ?? 0, runEnd, 0, plinth, 0, baseD - 6), delay: 0.35 });

  if (counter) {
    solids.push({
      b: box(counter.from, counter.to, plinth, top - topT, 0, baseD),
      delay: 0.45,
      details: (b) => {
        const z = b.z1;
        const out: string[] = [];
        for (const s of baseSlots) {
          if (s.x > b.x0 + 0.5) out.push(seg(c, [s.x, b.y0, z], [s.x, b.y1, z]));
          const x0 = s.x;
          const x1 = s.x + s.width;
          const h = b.y1 - b.y0 - 6;
          const yy = (f: number) => b.y0 + h * f;
          if (s.type === "ladice") {
            out.push(seg(c, [x0, yy(0.42), z], [x1, yy(0.42), z]));
            out.push(seg(c, [x0, yy(0.76), z], [x1, yy(0.76), z]));
          } else if (s.type === "ploca") {
            out.push(seg(c, [x0, yy(0.5), z], [x1, yy(0.5), z]));
          }
        }
        // handleless (gola) channel under the worktop
        out.push(seg(c, [b.x0 + 2, b.y1 - 6, z], [b.x1, b.y1 - 6, z]));
        return out;
      },
    });
    // worktop with sink and hob
    solids.push({
      b: box(counter.from, counter.to, top - topT, top, 0, DIM.worktopDepth),
      delay: 0.75,
      details: () => {
        const out: string[] = [];
        const sink = baseSlots.find((s) => s.id === plan.sinkId) ?? baseSlots.find((s) => s.type === "sudoper");
        if (sink) {
          const cx = sink.x + sink.width / 2;
          const w = Math.min(50, sink.width - 12);
          out.push(pathOf(c, [[cx - w / 2, top, 12], [cx + w / 2, top, 12], [cx + w / 2, top, 52], [cx - w / 2, top, 52]], true));
          out.push(pathOf(c, [[cx, top, 5], [cx, top + 26, 5], [cx, top + 26, 16]]));
        }
        const hob = baseSlots.find((s) => s.id === plan.hobId) ?? baseSlots.find((s) => s.type === "ploca");
        if (hob) {
          const cx = hob.x + hob.width / 2;
          const w = Math.min(58, hob.width - 4);
          out.push(pathOf(c, [[cx - w / 2, top, 6], [cx + w / 2, top, 6], [cx + w / 2, top, 56], [cx - w / 2, top, 56]], true));
          for (const [dx, dz, r] of [
            [-13, 18, 8],
            [13, 18, 6.5],
            [-13, 43, 6.5],
            [13, 43, 8],
          ] as const) {
            out.push(ringY(c, cx + dx, top, dz, r, 28));
          }
        }
        return out;
      },
    });
  }

  for (const u of uppers) {
    solids.push({
      b: box(u.from - DIM.panel, u.to, upB, upT, 0, upD),
      delay: 0.95,
      details: (b) => {
        const z = b.z1;
        const out: string[] = [];
        for (const s of upperSlots) {
          if (s.x + s.width <= u.from || s.x >= u.to) continue;
          if (s.x > b.x0 + DIM.panel + 0.5) out.push(seg(c, [s.x, b.y0, z], [s.x, b.y1, z]));
          if (s.type === "nisa") {
            const i = 2;
            out.push(pathOf(c, [[s.x + i, b.y0 + i, z], [s.x + s.width - i, b.y0 + i, z], [s.x + s.width - i, b.y1 - i, z], [s.x + i, b.y1 - i, z]], true));
            out.push(seg(c, [s.x + i, b.y0 + (b.y1 - b.y0) / 2, z], [s.x + s.width - i, b.y0 + (b.y1 - b.y0) / 2, z]));
          } else if (s.type === "napa") {
            out.push(seg(c, [s.x, b.y0 + 9, z], [s.x + s.width, b.y0 + 9, z]));
          } else if (s.type === "klapna") {
            out.push(seg(c, [s.x, b.y0 + (b.y1 - b.y0) / 2, z], [s.x + s.width, b.y0 + (b.y1 - b.y0) / 2, z]));
          }
        }
        return out;
      },
    });
  }

  if (tall) {
    solids.push({
      b: box(tall.from, tall.to, plinth, upT, 0, baseD),
      delay: 0.6,
      details: (b) => {
        const z = b.z1;
        const out: string[] = [];
        for (const s of tallSlots) {
          out.push(seg(c, [s.x, b.y0, z], [s.x, b.y1, z]));
          const x0 = s.x + 4;
          const x1 = s.x + s.width - 4;
          if (s.type === "pecnica") {
            out.push(seg(c, [s.x, 82, z], [s.x + s.width, 82, z]));
            out.push(seg(c, [s.x, 142, z], [s.x + s.width, 142, z]));
            out.push(pathOf(c, [[x0, 92, z], [x1, 92, z], [x1, 132, z], [x0, 132, z]], true));
            out.push(seg(c, [s.x, 46, z], [s.x + s.width, 46, z]));
          } else if (s.type === "hladnjak") {
            out.push(seg(c, [s.x, 88, z], [s.x + s.width, 88, z]));
          } else if (s.type === "smocnica") {
            out.push(seg(c, [s.x, 120, z], [s.x + s.width, 120, z]));
          }
        }
        out.push(seg(c, [tall.from + DIM.panel, b.y0, z], [tall.from + DIM.panel, b.y1, z]));
        out.push(seg(c, [tall.to - DIM.panel, b.y0, z], [tall.to - DIM.panel, b.y1, z]));
        return out;
      },
    });
  }

  // island: seating side faces the viewer — recessed back panel, waterfall sides, slab with overhang
  if (plan.island) {
    const L = plan.island.length;
    const x0 = plan.island.centerX - L / 2;
    const x1 = plan.island.centerX + L / 2;
    const zf = plan.island.backZ - DIM.baseDepth;
    const zb = plan.island.backZ;
    const zo = zb + DIM.islandOverhang;
    const wf = DIM.islandWaterfall;
    solids.push({ b: box(x0 + wf, x1 - wf, plinth, top - topT, zf, zb), delay: 1.15 });
    solids.push({ b: box(x0, x0 + wf, 0, top, zf, zo), delay: 1.2 });
    solids.push({ b: box(x0 + wf, x1 - wf, top - topT, top, zf, zo), delay: 1.3 });
    solids.push({ b: box(x1 - wf, x1, 0, top, zf, zo), delay: 1.35 });

    // two stools under the overhang
    const stools = [x0 + L * 0.33, x0 + L * 0.67];
    stools.forEach((sx, i) => {
      const sz = zo + 14;
      const dl = 1.6 + i * 0.08;
      addLate(ringY(c, sx, 66, sz, 17), "line", dl);
      addLate(ringY(c, sx, 26, sz, 13), "faint", dl + 0.05);
      for (const [dx, dz] of [
        [-12, -12],
        [12, -12],
        [-12, 12],
        [12, 12],
      ] as const) {
        addLate(seg(c, [sx + dx * 0.9, 64, sz + dz * 0.9], [sx + dx * 1.25, 0, sz + dz * 1.25]), "line", dl + 0.04);
      }
    });

    // island length
    const k = kota(c, [x0, 0, zo + 52], [x1, 0, zo + 52], `${L}`, { extFrom: [[x0, 0, zo + 4], [x1, 0, zo + 4]], tick: 5, lift: 8 });
    addLate(k.line + k.ticks, "dim", 2.0);
    k.ext.forEach((d) => addLate(d, "faint", 1.9));
    labels.push({ ...k.label, delay: 2.4 });
  }

  solids.sort((p, q) => centerDepth(c, p.b) - centerDepth(c, q.b));
  for (const s of solids) {
    for (const f of boxFaces(c, s.b)) add(f.d, "face", s.delay, f.kind);
    for (const d of s.details?.(s.b) ?? []) add(d, "line", s.delay + 0.35);
  }
  shapes.push(...late);

  // LED strip under the wall units (switches on last)
  if (cfg.led) {
    for (const u of uppers) add(seg(c, [u.from + 3, upB - 0.5, upD - 6], [u.to - 8, upB - 0.5, upD - 6]), "led", 2.3);
  }

  // ---------------------------------------------------------------- dimensions
  const kA = kota(c, [0, upT + 26, 0], [A, upT + 26, 0], `${A}`, { extFrom: [[0, upT + 4, 0], [A, upT + 4, 0]], tick: 5, lift: 8 });
  add(kA.line + kA.ticks, "dim", 1.8);
  kA.ext.forEach((d) => add(d, "faint", 1.7));
  labels.push({ ...kA.label, delay: 2.2 });

  const hx = -22;
  const kH = kota(c, [hx, 0, baseD], [hx, top, baseD], `${top}`, { extFrom: [[-3, 0, baseD], [-3, top, baseD]], tick: 4, lift: 8 });
  add(kH.line + kH.ticks, "dim", 1.9);
  kH.ext.forEach((d) => add(d, "faint", 1.85));
  labels.push({ ...kH.label, delay: 2.3 });

  const bb = boundsOf(
    shapes.map((s) => s.d),
    18,
  );
  return { viewBox: `${bb.x} ${bb.y} ${bb.w} ${bb.h}`, shapes, labels };
}
