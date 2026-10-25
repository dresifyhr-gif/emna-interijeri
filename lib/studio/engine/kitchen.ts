/**
 * Builds the whole scene graph for a plan: room walls (with a real window
 * opening), cabinet runs, worktops with sink cut-outs, backsplash, fillers and
 * end panels, LED strips, the island with waterfall top and stools, contact
 * shadows, dimension labels — and the assembly timeline for all of it.
 *
 * World frame: wall A runs along +x (centred on x = 0), the room extends
 * towards +z, y is up. Each run has its own frame (x along the wall from its
 * left end, z away from the wall).
 */

import * as THREE from "three";
import { DIM, type KitchenPlan, type PlanPiece, type PlanSlot, type RunId, type RunPlan } from "../plan";
import type { FrontZone, HandleStyle, WallId } from "../types";
import { BASE_FACE, D, TOP_Y, UPPER_FACE, WORK_Y, cm } from "./dims";
import { boxes, disposeGeometries, mesh, type BoxSpec, type GeoCache } from "./geo";
import { dimLine, type DimLabel } from "./labels";
import type { LedLight, WindowLight } from "./lights";
import type { Mat, Materials } from "./materials";
import { createModule, type BuildCtx, type LedZone, type ModuleRT } from "./modules";
import { E, Timeline } from "./tween";

export interface RunRT {
  id: RunId;
  group: THREE.Group;
  /** metres */
  length: number;
  worktop: THREE.Group | null;
  worktopFrom: number;
  worktopTo: number;
  wall: THREE.Group | null;
  /** counter centre (m, run-local) for door hinge decisions */
  center: number;
}

export interface WallRT {
  id: WallId;
  group: THREE.Group;
}

export interface KitchenRT {
  root: THREE.Group;
  plan: KitchenPlan;
  runs: Map<RunId, RunRT>;
  modules: Map<string, ModuleRT>;
  /** ids in assembly order */
  order: string[];
  /** meshes in the worktop material */
  tops: THREE.Mesh[];
  /** run-level meshes in the front material (fillers, end panels, island back); userData.fz = their FrontZone */
  frontPieces: THREE.Mesh[];
  /** run-level meshes in the carcass material (filler spacers); userData.fz = their FrontZone */
  carcassPieces: THREE.Mesh[];
  /** plinth meshes of fillers (finish); userData.fz = their FrontZone */
  plinthPieces: THREE.Mesh[];
  /** fillers / end panels, rebuilt in place when the handle style changes (group origin: the piece's centre) */
  pieces: { p: PlanPiece; g: THREE.Group }[];
  /** LED strips under the wall units, per wall (rebuilt when the wall units change) */
  underLeds: Map<RunId, THREE.Group[]>;
  islandBack: THREE.Mesh | null;
  walls: WallRT[];
  labels: (DimLabel & { wall: WallId | "isl" })[];
  leds: LedZone[];
  windowLight: WindowLight | null;
  timeline: Timeline;
  /** framing box (world): cabinets only */
  box: THREE.Box3;
  /** cabinets + walls up to the ceiling (world) — the whole "set" */
  room: THREE.Box3;
  /** last time something lands — used for the hero scroll mapping */
  assembled: number;
}

export interface KitchenEnv {
  mats: Materials;
  geos: GeoCache;
  doc: Document;
  /** front material per zone (catalog ids) */
  fronts: Record<FrontZone, string>;
  topId: string;
  handles: HandleStyle;
  /** plinth finish id ("crna" | "inox" | "fronta") */
  plinth: string;
  labels: boolean;
  tempo: "cinematic" | "quick";
}

/** what building one module / piece needs from the environment */
export type ModuleEnv = Pick<KitchenEnv, "mats" | "geos" | "fronts" | "handles" | "plinth">;

/** front zone of a plan piece (island fillers wear the island front) */
export const pieceZone = (p: PlanPiece): FrontZone => (p.run === "isl" ? "island" : p.zone);

/** the plinth material of a zone for a plinth finish */
export function plinthMat(env: Pick<KitchenEnv, "mats" | "fronts" | "plinth">, zone: FrontZone): THREE.Material {
  if (env.plinth === "fronta") return env.mats.front(env.fronts[zone === "upper" ? "base" : zone]);
  if (env.plinth === "inox") return env.mats.plinthSteel;
  return env.mats.plinth;
}

const tallSideOf = (plan: KitchenPlan, run: RunId): "left" | "right" => {
  const r = plan.runs.find((x) => x.wall === run);
  return r?.tall && r.tall.from < 1 ? "left" : "right";
};

/** context for building one module of the current kitchen */
export function moduleCtx(env: ModuleEnv, plan: KitchenPlan, run: RunRT | undefined, slot: PlanSlot): BuildCtx {
  const mats = env.mats;
  const centre = run ? run.center : 0;
  const mid = cm(slot.x + slot.width / 2);
  const fid = env.fronts[slot.zone];
  return {
    mats,
    geos: env.geos,
    front: mats.front(fid),
    carcass: mats.carcass(fid),
    plinth: plinthMat(env, slot.zone),
    handles: env.handles,
    ub: cm(plan.upperBottom),
    ut: cm(plan.upperTop),
    hinge: mid < centre ? "left" : "right",
    tallHinge: tallSideOf(plan, slot.run),
  };
}

// ---------------------------------------------------------------- helpers

/** 9-slice quad: dark inside [x0,x1]x[z0,z1], fading out over `f` metres */
function contactShadow(x0: number, z0: number, x1: number, z1: number, f: number, mat: THREE.Material): THREE.Mesh {
  const xs = [x0 - f, x0 + f, x1 - f, x1 + f];
  const zs = [z0 - f, z0 + f, z1 - f, z1 + f];
  const us = [0, 0.44, 0.56, 1];
  const pos: number[] = [];
  const uv: number[] = [];
  const nor: number[] = [];
  for (let j = 0; j < 4; j++)
    for (let i = 0; i < 4; i++) {
      pos.push(xs[i], 0.0015, zs[j]);
      uv.push(us[i], us[j]);
      nor.push(0, 1, 0);
    }
  const idx: number[] = [];
  for (let j = 0; j < 3; j++)
    for (let i = 0; i < 3; i++) {
      const a = j * 4 + i;
      idx.push(a, a + 4, a + 1, a + 1, a + 4, a + 5);
    }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setIndex(idx);
  const m = new THREE.Mesh(g, mat);
  m.renderOrder = -1;
  return m;
}

function slabWithHoles(
  from: number,
  to: number,
  y0: number,
  y1: number,
  z0: number,
  z1: number,
  holes: { x0: number; x1: number; z0: number; z1: number }[],
): BoxSpec[] {
  const list: BoxSpec[] = [];
  const hs = holes.filter((h) => h.x1 > from && h.x0 < to).sort((a, b) => a.x0 - b.x0);
  let x = from;
  for (const h of hs) {
    const hx0 = Math.max(from, h.x0);
    const hx1 = Math.min(to, h.x1);
    if (hx0 > x) list.push([x, y0, z0, hx0, y1, z1]);
    list.push([hx0, y0, z0, hx1, y1, h.z0]);
    list.push([hx0, y0, h.z1, hx1, y1, z1]);
    x = hx1;
  }
  if (to > x) list.push([x, y0, z0, to, y1, z1]);
  return list;
}

function stool(mats: Materials, geos: GeoCache): THREE.Group {
  const g = new THREE.Group();
  const seat = mesh(geos.get("stool:seat", () => new THREE.CylinderGeometry(0.19, 0.18, 0.045, 48)), mats.oak);
  seat.position.y = 0.66;
  const leg = mesh(geos.get("stool:leg", () => new THREE.CylinderGeometry(0.018, 0.018, 0.64, 16)), mats.black);
  leg.position.y = 0.32;
  const ring = mesh(geos.get("stool:ring", () => new THREE.TorusGeometry(0.14, 0.008, 10, 48)), mats.black);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 0.27;
  const foot = mesh(geos.get("stool:foot", () => new THREE.CylinderGeometry(0.2, 0.21, 0.012, 48)), mats.black);
  foot.position.y = 0.006;
  g.add(seat, leg, ring, foot);
  return g;
}

// ---------------------------------------------------------------- build

export function buildKitchen(env: KitchenEnv, plan: KitchenPlan): KitchenRT {
  const { mats, doc } = env;
  const A = cm(plan.cfg.walls.a);
  const ceil = cm(plan.ceiling);
  const ub = cm(plan.upperBottom);
  const ut = cm(plan.upperTop);
  const top: Mat = mats.top(env.topId);

  const root = new THREE.Group();
  root.position.x = -A / 2;
  const tl = new Timeline();
  const K: KitchenRT = {
    root,
    plan,
    runs: new Map(),
    modules: new Map(),
    order: [],
    tops: [],
    frontPieces: [],
    carcassPieces: [],
    plinthPieces: [],
    pieces: [],
    underLeds: new Map(),
    islandBack: null,
    walls: [],
    labels: [],
    leds: [],
    windowLight: null,
    timeline: tl,
    box: new THREE.Box3(),
    room: new THREE.Box3(),
    assembled: 0,
  };

  const k = env.tempo === "cinematic" ? 1 : 0.6;
  const s = env.tempo === "cinematic" ? 1 : 0.3;

  // ---- runs
  for (const r of plan.runs) {
    const g = new THREE.Group();
    const len = cm(r.length);
    if (r.wall === "b") {
      g.position.set(0, 0, cm(plan.cfg.walls.b));
      g.rotation.y = Math.PI / 2;
    } else if (r.wall === "c") {
      g.position.set(A, 0, 0);
      g.rotation.y = -Math.PI / 2;
    }
    root.add(g);
    const counter = r.counter ?? { from: 0, to: r.length };
    K.runs.set(r.wall, {
      id: r.wall,
      group: g,
      length: len,
      worktop: null,
      worktopFrom: r.worktop ? cm(r.worktop.from) : 0,
      worktopTo: r.worktop ? cm(r.worktop.to) : 0,
      wall: null,
      center: cm((counter.from + counter.to) / 2),
    });
  }
  let islandGroup: THREE.Group | null = null;
  if (plan.island) {
    const g = new THREE.Group();
    const L = cm(plan.island.length);
    g.position.set(cm(plan.island.centerX) + L / 2, 0, cm(plan.island.backZ));
    g.rotation.y = Math.PI;
    root.add(g);
    islandGroup = g;
    K.runs.set("isl", { id: "isl", group: g, length: L, worktop: null, worktopFrom: 0, worktopTo: L, wall: null, center: L / 2 });
  }

  // ---- walls (+ window)
  const win = plan.window;
  const wallExt: { run: WallId; x0: number; x1: number }[] = [];
  plan.runs.forEach((r, wi) => {
    const run = K.runs.get(r.wall)!;
    const len = run.length;
    const T = D.wallT;
    let x0: number;
    let x1: number;
    if (r.wall === "a") {
      x0 = r.openLeft ? -D.wallExtend : -T;
      x1 = r.openRight ? len + D.wallExtend : len + T;
    } else if (r.wall === "b") {
      x0 = -D.wallExtend;
      x1 = len;
    } else {
      x0 = 0;
      x1 = len + D.wallExtend;
    }
    const wg = new THREE.Group();
    wallExt.push({ run: r.wall, x0, x1 });
    const segs: BoxSpec[] = [];
    if (win && win.wall === r.wall) {
      const wo = cm(win.offset);
      const ww = cm(win.width);
      const ws = cm(win.sill);
      const wt = cm(win.top);
      segs.push([x0, 0, -T, wo, ceil, 0], [wo + ww, 0, -T, x1, ceil, 0], [wo, 0, -T, wo + ww, ws, 0], [wo, wt, -T, wo + ww, ceil, 0]);
      const f = 0.055;
      const z0 = -0.095;
      const z1 = -0.035;
      const frame: BoxSpec[] = [
        [wo, ws, z0, wo + f, wt, z1],
        [wo + ww - f, ws, z0, wo + ww, wt, z1],
        [wo + f, ws, z0, wo + ww - f, ws + f, z1],
        [wo + f, wt - f, z0, wo + ww - f, wt, z1],
      ];
      if (ww > 1.3) frame.push([wo + ww / 2 - f * 0.4, ws + f, z0 + 0.01, wo + ww / 2 + f * 0.4, wt - f, z1 - 0.01]);
      wg.add(mesh(boxes(frame), mats.windowFrame));
      const glass = mesh(boxes([[wo + f, ws + f, -0.067, wo + ww - f, wt - f, -0.063]]), mats.windowGlass, false, false);
      glass.renderOrder = 1;
      wg.add(glass);
      if (win.ledge) {
        // the backsplash under the window stops DIM.sillLedgeDrop below the sill (plan.ts: backsplashOf)
        wg.add(mesh(boxes([[wo - 0.03, ws - cm(DIM.sillLedgeDrop), -0.035, wo + ww + 0.03, ws + 0.002, 0.025]]), mats.sill));
      }
      const c = new THREE.Vector3(wo + ww / 2, (ws + wt) / 2, -0.06);
      K.windowLight = {
        center: c,
        normal: new THREE.Vector3(0, 0, 1),
        width: ww - 2 * f,
        height: wt - ws - 2 * f,
      };
    } else {
      segs.push([x0, 0, -T, x1, ceil, 0]);
    }
    const wall = mesh(boxes(segs), mats.wall, true, true);
    wg.add(wall);
    run.group.add(wg);
    run.wall = wg;
    K.walls.push({ id: r.wall, group: wg });
    tl.add(wg, "growY", wi * 0.1 * s, 1.1 * k);
  });

  // ---- modules
  const tBase0 = 0.55 * s;
  const stagger = 0.09 * s;
  const runOrder: RunId[] = ["a", "b", "c"];
  const baseList: ModuleRT[] = [];
  const upperList: ModuleRT[] = [];
  const tallList: ModuleRT[] = [];
  const islList: ModuleRT[] = [];

  for (const slot of plan.slots) {
    const run = K.runs.get(slot.run);
    if (!run) continue;
    const m = createModule(moduleCtx(env, plan, run, slot), slot);
    run.group.add(m.root);
    K.modules.set(slot.id, m);
    if (slot.zone === "base") baseList.push(m);
    else if (slot.zone === "upper") upperList.push(m);
    else if (slot.zone === "tall") tallList.push(m);
    else islList.push(m);
  }
  const runRank = (r: RunId) => runOrder.indexOf(r as WallId);
  // corner first, then outwards: A left->right, B from the corner (high x) to the open end, C from the corner
  const orderKey = (m: ModuleRT) => {
    const x = m.slot.x;
    return runRank(m.slot.run) * 10000 + (m.slot.run === "b" ? 5000 - x : x);
  };
  baseList.sort((p, q) => orderKey(p) - orderKey(q));
  upperList.sort((p, q) => orderKey(p) - orderKey(q));
  tallList.sort((p, q) => p.slot.x - q.slot.x);
  islList.sort((p, q) => p.slot.x - q.slot.x);

  const timeOfBase = new Map<string, number>();
  baseList.forEach((m, i) => {
    const t = tBase0 + i * stagger;
    timeOfBase.set(m.slot.id, t);
    tl.add(m.root, "extrude", t, 0.8 * k);
    m.wrappers.forEach((w, j) => tl.add(w, "slideZ", t + 0.45 * k + j * 0.07 * s, 0.65 * k, 0.5, E.out));
    K.order.push(m.slot.id);
  });
  const tBaseEnd = tBase0 + baseList.length * stagger;
  const tTall = tBaseEnd + 0.05;
  tallList.forEach((m, i) => {
    const t = tTall + i * 0.12 * s;
    tl.add(m.root, "extrude", t, 1.0 * k);
    m.wrappers.forEach((w, j) => tl.add(w, "slideZ", t + 0.6 * k + j * 0.08 * s, 0.65 * k, 0.5, E.out));
    K.order.push(m.slot.id);
  });

  // ---- run pieces: fillers / end panels
  const tIsland = tBaseEnd + 0.5 * k + 0.35 * k;
  const pieceTime = (p: PlanPiece): number => {
    if (p.zone === "tall") return tTall;
    if (p.run === "isl") return tIsland;
    // the time of the nearest base module in the same run
    let best = tBase0;
    let bd = Infinity;
    for (const m of baseList) {
      if (m.slot.run !== p.run) continue;
      const d = Math.abs(m.slot.x + m.slot.width / 2 - (p.x + p.width / 2));
      if (d < bd) {
        bd = d;
        best = timeOfBase.get(m.slot.id) ?? tBase0;
      }
    }
    return best;
  };
  const upperPieces: { obj: THREE.Object3D; near: number }[] = [];
  for (const p of plan.pieces) {
    const run = K.runs.get(p.run);
    if (!run) continue;
    const g = new THREE.Group();
    const made = fillPiece(g, p, env, plan);
    K.frontPieces.push(...made.front);
    K.carcassPieces.push(...made.carcass);
    K.plinthPieces.push(...made.plinth);
    K.pieces.push({ p, g });
    run.group.add(g);
    if (p.zone === "upper") upperPieces.push({ obj: g, near: p.x });
    else tl.add(g, "extrude", pieceTime(p), 0.8 * k);
  }

  // ---- worktops + backsplash
  const tTop = tBaseEnd + 0.5 * k;
  let wtIndex = 0;
  for (const r of plan.runs) {
    const run = K.runs.get(r.wall)!;
    if (!r.worktop) continue;
    const from = cm(r.worktop.from);
    const to = cm(r.worktop.to);
    const g = new THREE.Group();
    g.position.x = from;
    const holes = [...K.modules.values()]
      .filter((m) => m.slot.run === r.wall && m.hole)
      .map((m) => ({ x0: m.hole!.x0 - from, x1: m.hole!.x1 - from, z0: m.hole!.z0, z1: m.hole!.z1 }));
    const wt = mesh(boxes(slabWithHoles(0, to - from, TOP_Y, WORK_Y, 0, D.worktopDepth, holes), [from, 0, 0]), top);
    g.add(wt);
    K.tops.push(wt);
    run.group.add(g);
    run.worktop = g;
    tl.add(g, "growX", tTop + wtIndex * 0.15 * s, 1.0 * k);

    // backsplash: exactly the pieces the plan lists (and price.ts prices): worktop to wall units, around the window
    const bs: BoxSpec[] = r.backsplash.map((p) => [cm(p.from), WORK_Y, 0, cm(p.to), cm(p.top), D.backsplashT]);
    if (bs.length) {
      const bg = new THREE.Group();
      bg.position.y = WORK_Y;
      const me = mesh(boxes(bs.map((b) => [b[0], b[1] - WORK_Y, b[2], b[3], b[4] - WORK_Y, b[5]] as BoxSpec), [0, WORK_Y, 0]), top);
      bg.add(me);
      K.tops.push(me);
      run.group.add(bg);
      tl.add(bg, "growY", tTop + 0.45 * k + wtIndex * 0.15 * s, 0.9 * k);
    }
    wtIndex++;
  }

  // ---- extras (hob, tap) pop after the worktop
  for (const m of [...baseList, ...islList]) {
    if (!m.extras.children.length) continue;
    const t = (m.slot.run === "isl" ? tTop + 0.9 * k : tTop + 0.8 * k) + 0.05 * (K.order.indexOf(m.slot.id) % 4);
    tl.add(m.extras, "pop", t, 0.55 * k, 0, E.out);
  }

  // ---- wall units drop in
  const tUp = tTop + 0.9 * k;
  upperList.forEach((m, i) => {
    tl.add(m.root, "drop", tUp + i * 0.08 * s, 0.85 * k, 0.3);
    K.order.push(m.slot.id);
  });
  for (const p of upperPieces) {
    const run = p.obj.parent;
    let best = 0;
    let bd = Infinity;
    upperList.forEach((m, i) => {
      if (m.root.parent !== run) return;
      const d = Math.abs(m.slot.x - p.near);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    tl.add(p.obj, "drop", tUp + best * 0.08 * s, 0.85 * k, 0.3);
  }
  const tUpEnd = tUp + upperList.length * 0.08 * s + 0.85 * k;

  // ---- LED strips
  const tLed = tUpEnd - 0.2 * k;
  const ledMat = mats.led;
  for (const r of plan.runs) {
    const run = K.runs.get(r.wall)!;
    for (const g of underLeds(K, r, ub, mats)) tl.add(g, "growX", tLed, 0.6 * k);
    if (r.counter) {
      const x0 = cm(r.counter.from) + 0.02;
      const x1 = cm(r.counter.to) - 0.02;
      if (x1 - x0 > 0.2) {
        const g = new THREE.Group();
        g.position.x = x0;
        const z = BASE_FACE - D.plinthRecess;
        const strip = mesh(boxes([[0, 0.004, z + 0.001, x1 - x0, 0.009, z + 0.007]]), ledMat, false, false);
        g.add(strip);
        run.group.add(g);
        K.leds.push({ mesh: strip, length: x1 - x0, kind: "plinth" });
        tl.add(g, "growX", tLed + 0.2 * k, 0.6 * k);
      }
    }
  }
  for (const m of K.modules.values()) for (const z of m.leds) K.leds.push(z);

  // ---- island
  let tEnd = tUpEnd;
  if (plan.island && islandGroup) {
    const g = islandGroup;
    const L = cm(plan.island.length);
    const wf = cm(DIM.islandWaterfall);
    const ov = cm(DIM.islandOverhang);
    const tI = tIsland;
    islList.forEach((m, i) => {
      const t = tI + i * stagger;
      tl.add(m.root, "extrude", t, 0.8 * k);
      m.wrappers.forEach((w, j) => tl.add(w, "slideZ", t + 0.45 * k + j * 0.07 * s, 0.65 * k, 0.5, E.out));
      K.order.push(m.slot.id);
    });
    const tI2 = tI + islList.length * stagger;
    // back panel on the seating side
    const back = new THREE.Group();
    const bp = mesh(boxes([[wf, 0, -D.frontT, L - wf, TOP_Y, 0]]), mats.front(env.fronts.island));
    bp.userData.fz = "island";
    back.add(bp);
    K.frontPieces.push(bp);
    K.islandBack = bp;
    g.add(back);
    tl.add(back, "extrude", tI + 0.1, 0.9 * k);
    // waterfall sides + slab
    const holes = islList.filter((m) => m.hole).map((m) => m.hole!);
    const sides = new THREE.Group();
    const sm = mesh(boxes([[0, 0, -ov, wf, TOP_Y, D.worktopDepth], [L - wf, 0, -ov, L, TOP_Y, D.worktopDepth]]), top);
    sides.add(sm);
    K.tops.push(sm);
    g.add(sides);
    tl.add(sides, "growY", tI2 + 0.15 * k, 0.9 * k);
    const slab = new THREE.Group();
    const sl = mesh(boxes(slabWithHoles(0, L, TOP_Y, WORK_Y, -ov, D.worktopDepth, holes)), top);
    slab.add(sl);
    K.tops.push(sl);
    g.add(slab);
    tl.add(slab, "drop", tI2 + 0.45 * k, 1.0 * k, 0.25);
    const run = K.runs.get("isl")!;
    run.worktop = slab;
    // plinth LED
    const lg = new THREE.Group();
    lg.position.x = wf + 0.02;
    const z = BASE_FACE - D.plinthRecess;
    const strip = mesh(boxes([[0, 0.004, z + 0.001, L - 2 * wf - 0.04, 0.009, z + 0.007]]), ledMat, false, false);
    lg.add(strip);
    g.add(lg);
    K.leds.push({ mesh: strip, length: L - 2 * wf - 0.04, kind: "plinth" });
    tl.add(lg, "growX", tI2 + 0.9 * k, 0.6 * k);
    // stools
    [0.28, 0.72].forEach((f, i) => {
      const st = stool(mats, env.geos);
      st.position.set(L * f, 0, -ov - 0.1);
      g.add(st);
      tl.add(st, "slideZ", tI2 + 1.1 * k + i * 0.15 * s, 0.9 * k, -0.7, E.out);
      const sh = contactShadow(L * f - 0.12, -ov - 0.22, L * f + 0.12, -ov + 0.02, 0.12, mats.shadow);
      g.add(sh);
      tl.add(sh, "pop", tI2 + 1.2 * k + i * 0.15 * s, 0.7 * k);
    });
    const ish = contactShadow(0, -ov, L, BASE_FACE, 0.16, mats.shadow);
    g.add(ish);
    tl.add(ish, "growX", tI, islList.length * stagger + 0.8 * k);
    tEnd = Math.max(tEnd, tI2 + 1.9 * k);
  }

  // ---- contact shadows under wall runs
  for (const r of plan.runs) {
    const run = K.runs.get(r.wall)!;
    const ranges = [r.counter, r.tall].filter((x): x is { from: number; to: number } => Boolean(x));
    if (!ranges.length) continue;
    const from = Math.min(...ranges.map((x) => x.from));
    const to = Math.max(...ranges.map((x) => x.to));
    const sh = contactShadow(cm(from), 0, cm(to), BASE_FACE, 0.14, mats.shadow);
    const g = new THREE.Group();
    g.add(sh);
    run.group.add(g);
    tl.add(g, "growX", tBase0, Math.max(0.6, baseList.length * stagger + 0.8 * k));
  }

  // ---- labels
  const labelY = Math.max(ut + 0.02, Math.min(ut + 0.2, ceil - 0.05));
  if (env.labels) {
    for (const r of plan.runs) {
      const run = K.runs.get(r.wall)!;
      const d = dimLine(doc, run.group, 0, run.length, labelY, 0.42, r.wall.toUpperCase(), r.length, mats.dim);
      K.labels.push({ ...d, wall: r.wall });
      tl.add(d.group, "growX", tEnd + 0.1, 0.8 * k);
      tl.add(d.obj, "label", tEnd + 0.6 * k, 0.5 * k, 0, E.lin, d.el);
    }
    if (plan.island && islandGroup) {
      const L = cm(plan.island.length);
      const d = dimLine(doc, islandGroup, 0, L, WORK_Y + 0.06, -cm(DIM.islandOverhang) - 0.04, "Otok", plan.island.length, mats.dim);
      K.labels.push({ ...d, wall: "isl" });
      tl.add(d.group, "growX", tEnd + 0.2, 0.8 * k);
      tl.add(d.obj, "label", tEnd + 0.7 * k, 0.5 * k, 0, E.lin, d.el);
    }
  }

  K.assembled = tEnd;

  // ---- framing box (world), window light (world)
  root.updateMatrixWorld(true);
  const box = new THREE.Box3();
  const pt = new THREE.Vector3();
  const addLocal = (obj: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) box.expandByPoint(obj.localToWorld(pt.set(x, y, z)));
  };
  for (const r of plan.runs) {
    const run = K.runs.get(r.wall)!;
    addLocal(run.group, 0, run.length, 0, ut + 0.12, 0, 0.62);
  }
  if (plan.island && islandGroup) addLocal(islandGroup, 0, cm(plan.island.length), 0, WORK_Y, -cm(DIM.islandOverhang) - 0.35, 0.64);
  K.box = box;
  const roomBox = box.clone();
  for (const w of wallExt) {
    const run = K.runs.get(w.run)!;
    for (const x of [w.x0, w.x1]) for (const y of [0, ceil]) roomBox.expandByPoint(run.group.localToWorld(pt.set(x, y, 0)));
  }
  K.room = roomBox;

  if (K.windowLight && win) {
    const run = K.runs.get(win.wall)!;
    const c = run.group.localToWorld(K.windowLight.center.clone());
    const n = new THREE.Vector3(0, 0, 1).transformDirection(run.group.matrixWorld);
    K.windowLight = { ...K.windowLight, center: c, normal: n };
  }

  return K;
}

/** area lights wanted by the LED strips, most important first (world space) */
export function ledLights(K: KitchenRT, max: number): LedLight[] {
  const out: LedLight[] = [];
  const pick = (kind: LedZone["kind"], power: number, dir: THREE.Vector3) => {
    const zones = K.leds.filter((z) => z.kind === kind && z.mesh.parent).sort((a, b) => b.length - a.length);
    for (const z of zones) {
      if (out.length >= max) return;
      z.mesh.geometry.computeBoundingBox();
      const bb = z.mesh.geometry.boundingBox;
      if (!bb) continue;
      const c = bb.getCenter(new THREE.Vector3());
      z.mesh.updateWorldMatrix(true, false);
      const wc = z.mesh.localToWorld(c);
      const wd = dir.clone().transformDirection(z.mesh.matrixWorld).normalize();
      out.push({ center: wc, dir: wd, width: z.length, height: kind === "inner" ? 0.03 : 0.04, power });
    }
  };
  pick("under", 1, new THREE.Vector3(0, -1, 0));
  pick("inner", 0.45, new THREE.Vector3(0, -1, 0));
  pick("plinth", 0.55, new THREE.Vector3(0, -1, 0.35));
  return out;
}

/** LED strips under the wall-unit stretches of a run (in K.leds and K.underLeds); returns their groups */
export function underLeds(K: KitchenRT, r: RunPlan, ub: number, mats: Materials): THREE.Group[] {
  const run = K.runs.get(r.wall);
  if (!run) return [];
  const out: THREE.Group[] = [];
  for (const u of r.uppers) {
    const x0 = cm(u.from) + 0.02;
    const x1 = cm(u.to) - 0.02;
    if (x1 - x0 < 0.15) continue;
    const g = new THREE.Group();
    g.position.x = x0;
    const strip = mesh(boxes([[0, ub - 0.006, 0.262, x1 - x0, ub - 0.0012, 0.276]]), mats.led, false, false);
    g.add(strip);
    run.group.add(g);
    K.leds.push({ mesh: strip, length: x1 - x0, kind: "under" });
    out.push(g);
  }
  K.underLeds.set(r.wall, [...(K.underLeds.get(r.wall) ?? []), ...out]);
  return out;
}

/** take a run's under-cabinet LED strips out of the scene (and out of K.leds) */
export function removeUnderLeds(K: KitchenRT, run: RunId): void {
  const gs = K.underLeds.get(run) ?? [];
  const meshes = new Set<THREE.Object3D>();
  for (const g of gs) {
    g.traverse((o) => meshes.add(o));
    disposeGeometries(g);
    g.parent?.remove(g);
  }
  K.leds = K.leds.filter((z) => !meshes.has(z.mesh));
  K.underLeds.delete(run);
}

/**
 * Build the meshes of one filler / end panel into `g` (run frame). The group sits at the piece's centre
 * (so it can grow / shrink in place); UVs stay in run coordinates, so grain still runs on across neighbours.
 */
function fillPiece(g: THREE.Group, p: PlanPiece, env: ModuleEnv, plan: KitchenPlan): { front: THREE.Mesh[]; carcass: THREE.Mesh[]; plinth: THREE.Mesh[] } {
  const mats = env.mats;
  const ub = cm(plan.upperBottom);
  const ut = cm(plan.upperTop);
  const gola = env.handles === "bez";
  const lip = gola ? D.upperLip : 0;
  const cx = cm(p.x + p.width / 2);
  g.position.x = cx;
  const x0 = cm(p.x) - cx;
  const x1 = cm(p.x + p.width) - cx;
  const uv: [number, number, number] = [cx, 0, 0];
  const zone = pieceZone(p);
  const fm: BoxSpec[] = [];
  const cs: BoxSpec[] = [];
  const plinth: THREE.Mesh[] = [];
  if (p.zone === "upper") {
    if (p.kind === "panel") fm.push([x0, ub - lip, 0, x1, ut, UPPER_FACE]);
    else {
      fm.push([x0 + 0.0015, ub - lip, D.upperCarcass + D.frontOff, x1 - 0.0015, ut, UPPER_FACE]);
      cs.push([x0 + 0.001, ub, 0.004, x1 - 0.001, ut, D.upperCarcass]);
    }
  } else if (p.zone === "tall") {
    fm.push([x0, 0, 0, x1, ut, BASE_FACE]);
  } else if (p.kind === "panel") {
    fm.push([x0, 0, 0, x1, TOP_Y, BASE_FACE]);
  } else {
    fm.push([x0 + 0.0015, D.plinth + 0.0015, D.carcass + D.frontOff, x1 - 0.0015, TOP_Y - (gola ? D.golaH : 0) - 0.0015, BASE_FACE]);
    cs.push([x0 + 0.001, D.plinth, 0.004, x1 - 0.001, TOP_Y, D.carcass]);
    const pm = mesh(boxes([[x0 + 0.001, 0, 0.03, x1 - 0.001, D.plinth - 0.002, BASE_FACE - D.plinthRecess]], uv), plinthMat(env, zone));
    pm.userData.fz = zone;
    g.add(pm);
    plinth.push(pm);
    if (gola) g.add(mesh(boxes([[x0, TOP_Y - D.golaH + 0.001, D.carcass - 0.03, x1, TOP_Y - 0.001, D.carcass + 0.001]], uv), mats.gola, false, true));
  }
  const front: THREE.Mesh[] = [];
  const carcass: THREE.Mesh[] = [];
  if (fm.length) {
    const me = mesh(boxes(fm, uv), mats.front(env.fronts[zone]));
    me.userData.fz = zone;
    g.add(me);
    front.push(me);
  }
  if (cs.length) {
    const me = mesh(boxes(cs, uv), mats.carcass(env.fronts[zone]));
    me.userData.fz = zone;
    g.add(me);
    carcass.push(me);
  }
  return { front, carcass, plinth };
}

/** re-dress every filler / end panel for a new handle style (keeps groups, so assembly tracks stay valid) */
export function rebuildPieces(K: KitchenRT, env: ModuleEnv): void {
  K.frontPieces = K.islandBack ? [K.islandBack] : [];
  K.carcassPieces = [];
  K.plinthPieces = [];
  for (const { p, g } of K.pieces) {
    for (const c of [...g.children]) {
      disposeGeometries(c);
      g.remove(c);
    }
    const made = fillPiece(g, p, env, K.plan);
    K.frontPieces.push(...made.front);
    K.carcassPieces.push(...made.carcass);
    K.plinthPieces.push(...made.plinth);
  }
}

/**
 * Replace the fillers / end panels of some runs with the ones `plan` lists (cabinet list edits). Returns the old
 * groups (still in the scene — the caller animates them out and calls disposePiece) and the new ones.
 */
export function replacePieces(K: KitchenRT, env: ModuleEnv, plan: KitchenPlan, runs: Set<RunId>): { removed: THREE.Group[]; added: THREE.Group[] } {
  const removed: THREE.Group[] = [];
  const keep: { p: PlanPiece; g: THREE.Group }[] = [];
  for (const it of K.pieces) {
    if (runs.has(it.p.run)) removed.push(it.g);
    else keep.push(it);
  }
  const gone = new Set<THREE.Object3D>();
  for (const g of removed) g.traverse((o) => gone.add(o));
  K.frontPieces = K.frontPieces.filter((m) => !gone.has(m));
  K.carcassPieces = K.carcassPieces.filter((m) => !gone.has(m));
  K.plinthPieces = K.plinthPieces.filter((m) => !gone.has(m));
  K.pieces = keep;
  const added: THREE.Group[] = [];
  for (const p of plan.pieces) {
    if (!runs.has(p.run)) continue;
    const run = K.runs.get(p.run);
    if (!run) continue;
    const g = new THREE.Group();
    const made = fillPiece(g, p, env, plan);
    K.frontPieces.push(...made.front);
    K.carcassPieces.push(...made.carcass);
    K.plinthPieces.push(...made.plinth);
    K.pieces.push({ p, g });
    run.group.add(g);
    added.push(g);
  }
  return { removed, added };
}

export function disposePiece(g: THREE.Group): void {
  disposeGeometries(g);
  g.parent?.remove(g);
}

/** rebuild the worktop of a run after a sink was added/removed */
export function rebuildWorktop(K: KitchenRT, runId: RunId, top: THREE.Material): void {
  const run = K.runs.get(runId);
  if (!run || !run.worktop) return;
  const g = run.worktop;
  const old = g.children.filter((c) => (c as THREE.Mesh).isMesh) as THREE.Mesh[];
  for (const o of old) {
    g.remove(o);
    o.geometry.dispose();
    const i = K.tops.indexOf(o);
    if (i >= 0) K.tops.splice(i, 1);
  }
  const mods = [...K.modules.values()].filter((m) => m.slot.run === runId && m.hole);
  let me: THREE.Mesh;
  if (runId === "isl") {
    const L = run.length;
    const ov = cm(DIM.islandOverhang);
    me = mesh(boxes(slabWithHoles(0, L, TOP_Y, WORK_Y, -ov, D.worktopDepth, mods.map((m) => m.hole!))), top);
  } else {
    const from = run.worktopFrom;
    const to = run.worktopTo;
    const holes = mods.map((m) => ({ x0: m.hole!.x0 - from, x1: m.hole!.x1 - from, z0: m.hole!.z0, z1: m.hole!.z1 }));
    me = mesh(boxes(slabWithHoles(0, to - from, TOP_Y, WORK_Y, 0, D.worktopDepth, holes), [from, 0, 0]), top);
  }
  g.add(me);
  K.tops.push(me);
}

export function disposeKitchen(K: KitchenRT): void {
  for (const l of K.labels) l.el.remove();
  disposeGeometries(K.root);
  K.root.parent?.remove(K.root);
}
