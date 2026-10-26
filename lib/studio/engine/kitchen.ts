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
import { hoodFinishDef, moduleDef } from "../catalog";
import {
  DIM,
  backsplashOfCfg,
  glassOf,
  hoodKindOf,
  openingOf,
  shelvesOf,
  topDepthOf,
  type IslandPlan,
  type KitchenPlan,
  type PlanPiece,
  type PlanSlot,
  type RunId,
  type RunPlan,
  type WallHoodPlan,
} from "../plan";
import type { FrontZone, HandleStyle, WallId } from "../types";
import { BASE_FACE, D, UPPER_FACE, cm, gripGapOf, heightsOf, lipOf } from "./dims";
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
  /** wall runs: the worktop's pieces (m, run-local) — a tall unit standing in the run interrupts it (RunPlan.worktops) */
  worktopPieces?: [number, number][];
  wall: THREE.Group | null;
  /** counter centre (m, run-local) for door hinge decisions */
  center: number;
  /**
   * wall runs: the backsplash, the plinth LED, the contact shadow and the bare-floor marks — rebuilt with the worktop
   * when an element edit changes where the cabinets end (syncRunSurfaces)
   */
  surfaces?: { backsplash: THREE.Group | null; plinthLed: THREE.Group | null; shadow: THREE.Group | null; floor: THREE.Group | null; rail: THREE.Group | null };
}

export interface WallRT {
  id: WallId;
  group: THREE.Group;
  /** the wall itself (room surface: userData.surface = { surface: "wall", wall }) */
  mesh: THREE.Mesh;
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
  /**
   * island / peninsula meshes built once with the kitchen (back panel, end panels, outer row, bar upstand): they stay in
   * frontPieces / carcassPieces / plinthPieces when the fillers are rebuilt (rebuildPieces, replacePieces)
   */
  islandParts: { front: THREE.Mesh[]; carcass: THREE.Mesh[]; plinth: THREE.Mesh[] };
  /** the ceiling hood above the island hob (null = none); rebuilt by syncIslandHood when an edit moves the hob */
  islandHood: THREE.Group | null;
  /** visible wall hoods per wall (plan RunPlan.hoods); rebuilt by syncWallHoods when an edit moves a hob */
  wallHoods: Map<WallId, THREE.Group>;
  walls: WallRT[];
  /**
   * room labels (one per wall), the island / peninsula, then the kitchen-run labels (one per wall, on the floor). A
   * kitchen-run label measures the cabinets (RunPlan.cabinets) and sits in `holder`, hidden while that equals the room's
   * wall (the room label above already says it) — syncKitchenLabels keeps it up to date after an element edit.
   */
  labels: (DimLabel & { wall: WallId | "isl"; kind: "room" | "kitchen"; holder?: THREE.Group })[];
  leds: LedZone[];
  windowLight: WindowLight | null;
  timeline: Timeline;
  /** framing box (world): the cabinets along the room's walls (lights, fog, the sweep) */
  box: THREE.Box3;
  /**
   * the corners (world) of the boxes the kitchen is made of — each run's cabinets (where they stand on the wall, up to
   * the wall units), the island with its seats: a tighter fit than `box`, which for an L / U spans the bare floor between
   * the runs (StudioEngineApi.snapshotViews frame "kitchen")
   */
  boxPoints: THREE.Vector3[];
  /**
   * the studio's framing box (world): every room wall over its whole length, from the floor up to the room labels, the
   * floor in front of the cabinets out to the kitchen labels, the island with its seats
   */
  frame: THREE.Box3;
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
  /** the dimension labels are there from the first frame (a rebuild in the studio: they stay put while it assembles) */
  instantLabels?: boolean;
  /** the material of each room wall (KitchenConfig.room); absent = mats.wall for every wall */
  wallMat?: (wall: WallId) => THREE.Material;
}

/** what building one module / piece needs from the environment (`topId`: side panels of worktop wear it) */
export type ModuleEnv = Pick<KitchenEnv, "mats" | "geos" | "fronts" | "handles" | "plinth"> & { topId?: string };

/** front zone of a plan piece (island fillers wear the island front) */
export const pieceZone = (p: PlanPiece): FrontZone => (p.run === "isl" ? "island" : p.zone);

/** the plinth material of a zone for a plinth finish */
export function plinthMat(env: Pick<KitchenEnv, "mats" | "fronts" | "plinth">, zone: FrontZone): THREE.Material {
  if (env.plinth === "fronta") return env.mats.front(env.fronts[zone === "upper" ? "base" : zone]);
  if (env.plinth === "inox") return env.mats.plinthSteel;
  return env.mats.plinth;
}

/**
 * the side a tall unit's doors hinge on: towards the outer end of its column (the column at the run's left end: left) —
 * at a room wall too: the door opens back against the wall and leaves the worktop beside the column free (the
 * neighbouring run keeps DIM.cornerClear from that corner, room for the open door)
 */
const tallSideOf = (plan: KitchenPlan, slot: PlanSlot): "left" | "right" => {
  const r = plan.runs.find((x) => x.wall === slot.run);
  if (!r) return "right";
  const t = r.talls.find((x) => slot.x >= x.from - 0.5 && slot.x < x.to) ?? r.tall;
  if (!t) return "right";
  return t.from - r.kitchen.from < r.kitchen.to - t.to ? "left" : "right";
};

/** context for building one module of the current kitchen */
export function moduleCtx(env: ModuleEnv, plan: KitchenPlan, run: RunRT | undefined, slot: PlanSlot): BuildCtx {
  const mats = env.mats;
  const centre = run ? run.center : 0;
  const mid = cm(slot.x + slot.width / 2);
  const fid = env.fronts[slot.zone];
  const h = heightsOf(plan);
  const c = plan.cfg;
  const def = moduleDef(slot.zone, slot.type);
  // what the element has of its own (CabinetSpec.opt) over the kitchen's settings — plan.ts resolves it, PlanSlot.look keys it
  const extra: Partial<BuildCtx> = {};
  if (def?.glass) extra.glass = glassOf(c, slot.opt);
  if (slot.zone === "upper" && slot.opt?.depth !== undefined) extra.topDepth = cm(topDepthOf(c, slot.opt));
  if (def?.feature === "hob") extra.hood = hoodKindOf(c, slot.opt);
  if (def?.worktopMaterial) extra.top = mats.top(env.topId ?? c.top);
  if (def?.rows || def?.lit) extra.opt = shelvesOf(slot.opt);
  return {
    ...extra,
    mats,
    geos: env.geos,
    front: mats.front(fid),
    carcass: mats.carcass(fid),
    plinth: plinthMat(env, slot.zone),
    // the element's own opening style (opt.open), else the kitchen's as the scene shows it
    handles: slot.opt?.open ? openingOf(c, slot.opt) : env.handles,
    ub: h.ub,
    // tall units: the top of the unit itself, module-local (the module stands h.lift higher; a top box above
    // h.tallSplit and the cornice are drawn by modules.ts buildHeightExtras)
    ut: slot.zone === "tall" ? (h.tallSplit ?? h.tallTop) - h.lift : h.ut,
    hinge: mid < centre ? "left" : "right",
    tallHinge: tallSideOf(plan, slot),
    h,
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

/** a stool with its seat centre `seatY` m above the floor (0.66 = counter stool at a 90 cm worktop, ~0.8 = bar stool) */
function stool(mats: Materials, geos: GeoCache, seatY = 0.66): THREE.Group {
  const g = new THREE.Group();
  const seat = mesh(geos.get("stool:seat", () => new THREE.CylinderGeometry(0.19, 0.18, 0.045, 48)), mats.oak);
  seat.position.y = seatY;
  const legH = seatY - 0.02;
  const key = Math.abs(legH - 0.64) < 1e-6 ? "stool:leg" : `stool:leg:${legH.toFixed(3)}`;
  const leg = mesh(geos.get(key, () => new THREE.CylinderGeometry(0.018, 0.018, legH, 16)), mats.black);
  leg.position.y = legH / 2;
  const ring = mesh(geos.get("stool:ring", () => new THREE.TorusGeometry(0.14, 0.008, 10, 48)), mats.black);
  ring.rotation.x = Math.PI / 2;
  // the footrest stays ~39 cm below the seat (bar stools get theirs higher up)
  ring.position.y = seatY - 0.39;
  const foot = mesh(geos.get("stool:foot", () => new THREE.CylinderGeometry(0.2, 0.21, 0.012, 48)), mats.black);
  foot.position.y = 0.006;
  g.add(seat, leg, ring, foot);
  return g;
}

/** a chair for the lowered table, facing +z (the table) in the island's run frame; seat centre `seatY` m above the floor */
function chair(mats: Materials, geos: GeoCache, seatY = 0.46): THREE.Group {
  const g = new THREE.Group();
  const y0 = seatY - 0.018;
  const key = `chair:${seatY.toFixed(3)}`;
  // the backrest sits between the two back legs, a little thinner than them (no shared faces: no z-fighting)
  const wood = mesh(
    geos.get(`${key}:wood`, () =>
      boxes([
        [-0.21, y0, -0.2, 0.21, y0 + 0.036, 0.21],
        [-0.165, y0 + 0.17, -0.232, 0.165, y0 + 0.42, -0.218],
      ]),
    ),
    mats.oak,
  );
  const legs: BoxSpec[] = [];
  for (const lx of [-0.185, 0.165]) for (const lz of [-0.205, 0.17]) legs.push([lx, 0, lz, lx + 0.02, y0, lz + 0.02]);
  // the two back legs carry the backrest
  legs.push([-0.185, y0, -0.235, -0.165, y0 + 0.42, -0.215], [0.165, y0, -0.235, 0.185, y0 + 0.42, -0.215]);
  const frame = mesh(geos.get(`${key}:legs`, () => boxes(legs)), mats.black);
  g.add(wood, frame);
  return g;
}

/** the island's main worktop boxes (plan.island.slab, metres) with the sink cut-outs of the pieces they lie in */
export function islandSlab(I: IslandPlan, y0: number, y1: number, holes: { x0: number; x1: number; z0: number; z1: number }[]): BoxSpec[] {
  const out: BoxSpec[] = [];
  for (const r of I.slab) {
    const z0 = cm(r.z0);
    const z1 = cm(r.z1);
    const inside = holes.filter((h) => h.z0 >= z0 - 1e-6 && h.z1 <= z1 + 1e-6);
    out.push(...slabWithHoles(cm(r.from), cm(r.to), y0, y1, z0, z1, inside));
  }
  return out;
}

/** footprint of the island's worktop, bar and table in its run frame (metres) */
function islandExtent(I: IslandPlan): { x0: number; x1: number; z0: number } {
  const xs = I.slab.flatMap((r) => [r.from, r.to]);
  let z0 = Math.min(...I.slab.map((r) => r.z0));
  if (I.bar) {
    xs.push(I.bar.from, I.bar.to);
    z0 = Math.min(z0, I.bar.z0);
  }
  return { x0: cm(Math.min(...xs)), x1: cm(Math.max(...xs)), z0: cm(z0) };
}

// ---------------------------------------------------------------- build

export function buildKitchen(env: KitchenEnv, plan: KitchenPlan): KitchenRT {
  const { mats, doc } = env;
  const A = cm(plan.cfg.walls.a);
  const ceil = cm(plan.ceiling);
  const H = heightsOf(plan);
  const ub = H.ub;
  /** the kitchen's highest cabinet edge (wall units with their top row, the tall column) */
  const ut = Math.max(H.ut, H.topRow?.y1 ?? 0, H.tallTop);
  const TOP_Y = H.topY;
  const WORK_Y = H.workY;
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
    islandParts: { front: [], carcass: [], plinth: [] },
    islandHood: null,
    wallHoods: new Map(),
    walls: [],
    labels: [],
    leds: [],
    windowLight: null,
    timeline: tl,
    box: new THREE.Box3(),
    boxPoints: [],
    frame: new THREE.Box3(),
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
    // the island / peninsula run frame (plan.ts IslandPlan.frame): the island turned to face wall A, a peninsula
    // standing out from one end of it
    const g = new THREE.Group();
    const I = plan.island;
    const L = cm(I.length);
    if (I.kind === "otok") g.position.set(cm(I.centerX) + L / 2, 0, cm(I.backZ));
    else g.position.set(cm(I.frame.x), 0, cm(I.frame.z));
    g.rotation.y = I.frame.rot;
    root.add(g);
    islandGroup = g;
    const center = I.kind === "otok" ? L / 2 : cm((I.body.from + I.body.to) / 2);
    K.runs.set("isl", { id: "isl", group: g, length: L, worktop: null, worktopFrom: 0, worktopTo: L, wall: null, center });
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
    const wall = mesh(boxes(segs), env.wallMat ? env.wallMat(r.wall) : mats.wall, true, true);
    wall.userData.surface = { surface: "wall", wall: r.wall };
    wg.add(wall);
    run.group.add(wg);
    run.wall = wg;
    K.walls.push({ id: r.wall, group: wg, mesh: wall });
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

  // ---- worktops + backsplash (they end with the base cabinets: plan.ts RunPlan.worktop)
  const tTop = tBaseEnd + 0.5 * k;
  let wtIndex = 0;
  for (const r of plan.runs) {
    const g = worktopGroup(K, r, top);
    if (!g) continue;
    tl.add(g, "growX", tTop + wtIndex * 0.15 * s, 1.0 * k);
    // backsplash: exactly the pieces the plan lists (and price.ts prices): worktop to wall units, around the window
    const bg = backsplashGroup(K, r, top, mats);
    if (bg) tl.add(bg, "growY", tTop + 0.45 * k + wtIndex * 0.15 * s, 0.9 * k);
    const rg = railGroup(K, r, mats);
    if (rg) tl.add(rg, "pop", tTop + 1.2 * k + wtIndex * 0.15 * s, 0.6 * k, 0, E.out);
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

  // ---- visible wall hoods above the hobs (plan RunPlan.hoods): they come down with the wall units
  for (const r of plan.runs) {
    const hg = buildWallHoods(env, r);
    const run = K.runs.get(r.wall);
    if (!hg || !run) continue;
    run.group.add(hg);
    K.wallHoods.set(r.wall, hg);
    tl.add(hg, "drop", tUp + 0.2 * k, 0.85 * k, 0.3);
  }

  // ---- LED strips
  const tLed = tUpEnd - 0.2 * k;
  const ledMat = mats.led;
  for (const r of plan.runs) {
    for (const g of underLeds(K, r, ub, mats)) tl.add(g, "growX", tLed, 0.6 * k);
    const g = plinthLedGroup(K, r, mats);
    if (g) tl.add(g, "growX", tLed + 0.2 * k, 0.6 * k);
  }
  for (const m of K.modules.values()) for (const z of m.leds) K.leds.push(z);

  // ---- island / peninsula: exactly the pieces plan.island lists (price.ts prices them)
  let tEnd = tUpEnd;
  if (plan.island && islandGroup) {
    const g = islandGroup;
    const I = plan.island;
    const tI = tIsland;
    islList.forEach((m, i) => {
      const t = tI + i * stagger;
      tl.add(m.root, "extrude", t, 0.8 * k);
      m.wrappers.forEach((w, j) => tl.add(w, "slideZ", t + 0.45 * k + j * 0.07 * s, 0.65 * k, 0.5, E.out));
      K.order.push(m.slot.id);
    });
    const tI2 = tI + islList.length * stagger;
    const islandFront = mats.front(env.fronts.island);
    // back panel on the seating side
    const back = new THREE.Group();
    if (I.backPanel) {
      const bp = mesh(boxes([[cm(I.backPanel.from), 0, -cm(DIM.islandBackT), cm(I.backPanel.to), TOP_Y, 0]]), islandFront);
      bp.userData.fz = "island";
      back.add(bp);
      K.frontPieces.push(bp);
      K.islandParts.front.push(bp);
      K.islandBack = bp;
    }
    g.add(back);
    tl.add(back, "extrude", tI + 0.1, 0.9 * k);
    // waterfall sides + slab
    const holes = islList.filter((m) => m.hole).map((m) => m.hole!);
    if (I.waterfalls.length) {
      const sides = new THREE.Group();
      const sm = mesh(boxes(I.waterfalls.map((r) => [cm(r.from), 0, cm(r.z0), cm(r.to), TOP_Y, cm(r.z1)] as BoxSpec)), top);
      sides.add(sm);
      K.tops.push(sm);
      g.add(sides);
      tl.add(sides, "growY", tI2 + 0.15 * k, 0.9 * k);
    }
    const slab = new THREE.Group();
    const sl = mesh(boxes(islandSlab(I, TOP_Y, WORK_Y, holes)), top);
    slab.add(sl);
    K.tops.push(sl);
    g.add(slab);
    tl.add(slab, "drop", tI2 + 0.45 * k, 1.0 * k, 0.25);
    const run = K.runs.get("isl")!;
    run.worktop = slab;
    // plinth LED
    const lg = new THREE.Group();
    lg.position.x = cm(I.body.from) + 0.02;
    const z = BASE_FACE - D.plinthRecess;
    const ledLen = cm(I.body.to - I.body.from) - 0.04;
    const strip = mesh(boxes([[0, 0.004, z + 0.001, ledLen, 0.009, z + 0.007]]), ledMat, false, false);
    lg.add(strip);
    g.add(lg);
    K.leds.push({ mesh: strip, length: ledLen, kind: "plinth" });
    tl.add(lg, "growX", tI2 + 0.9 * k, 0.6 * k);
    // stools / chairs
    I.seats.forEach((st, i) => {
      const x = cm(st.x);
      const sz = cm(st.z);
      const seat = st.kind === "chair" ? chair(mats, env.geos, cm(st.seat)) : stool(mats, env.geos, cm(st.seat));
      seat.position.set(x, 0, sz);
      g.add(seat);
      // seats slide in from the outer side (−z in the island's run frame); at an end they just appear
      const endSeat = st.x < 0 || st.x > I.length;
      if (endSeat) tl.add(seat, "pop", tI2 + 1.1 * k + i * 0.15 * s, 0.7 * k, 0, E.out);
      else tl.add(seat, "slideZ", tI2 + 1.1 * k + i * 0.15 * s, 0.9 * k, -0.7, E.out);
      const r = st.kind === "chair" ? 0.25 : 0.12;
      const sh = contactShadow(x - r, sz - r, x + r, sz + r, 0.12, mats.shadow);
      g.add(sh);
      tl.add(sh, "pop", tI2 + 1.2 * k + i * 0.15 * s, 0.7 * k);
    });
    const ext = islandExtent(I);
    const ish = contactShadow(ext.x0, ext.z0, ext.x1, BASE_FACE, 0.16, mats.shadow);
    g.add(ish);
    tl.add(ish, "growX", tI, islList.length * stagger + 0.8 * k);
    tEnd = Math.max(tEnd, tI2 + 1.9 * k);
    // what older islands never had (built only when the config asks for it)
    const tX = tI2 + 0.3 * k;
    for (const g2 of buildIslandExtras(K, env, I)) {
      g.add(g2.obj);
      tl.add(g2.obj, g2.track, tX + g2.delay * k, 0.9 * k, g2.track === "drop" ? 0.35 : 0, E.out);
    }
    const hood = buildIslandHood(env, plan);
    if (hood) {
      g.add(hood);
      K.islandHood = hood;
      tl.add(hood, "drop", tI2 + 0.9 * k, 1.0 * k, 0.5);
      tEnd = Math.max(tEnd, tI2 + 1.9 * k);
    }
  }

  // ---- contact shadows under wall runs; the studio marks bare floor an edited run leaves free (plan RunPlan.free)
  for (const r of plan.runs) {
    const g = runShadowGroup(K, r, mats);
    if (g) tl.add(g, "growX", tBase0, Math.max(0.6, baseList.length * stagger + 0.8 * k));
    if (env.labels) {
      const f = floorMarks(K, r, mats);
      if (f) tl.add(f, "pop", tUpEnd, 0.6 * k);
    }
  }

  // ---- labels: the room's walls (above the wall units), the island, then the kitchen runs (on the floor in front).
  // After the assembly — or, rebuilding in the studio (env.instantLabels), from the first frame: they stay where they
  // were while the new kitchen assembles and the camera moves
  const labelY = Math.max(ut + 0.02, Math.min(ut + 0.2, ceil - 0.05));
  const labelAt = (d: DimLabel, at: number) => {
    if (env.instantLabels) {
      tl.add(d.group, "growX", -1, 0.01);
      tl.add(d.obj, "label", -1, 0.01, 0, E.lin, d.el);
      return;
    }
    tl.add(d.group, "growX", tEnd + at, 0.8 * k);
    tl.add(d.obj, "label", tEnd + at + 0.5 * k, 0.5 * k, 0, E.lin, d.el);
  };
  if (env.labels) {
    for (const r of plan.runs) {
      const run = K.runs.get(r.wall)!;
      const d = dimLine(doc, run.group, 0, run.length, labelY, 0.42, r.wall.toUpperCase(), r.length, mats.dim);
      K.labels.push({ ...d, wall: r.wall, kind: "room" });
      labelAt(d, 0.1);
    }
    if (plan.island && islandGroup) {
      const I = plan.island;
      const L = cm(I.length);
      // along the outer edge of the worktop (or of a raised bar, above it)
      const ext = islandExtent(I);
      const ly = I.bar?.kind === "raised" ? cm(I.bar.height) + 0.06 : WORK_Y + 0.06;
      const name = I.kind === "poluotok" ? "Poluotok" : "Otok";
      const d = dimLine(doc, islandGroup, 0, L, ly, ext.z0 - 0.04, name, I.length, mats.dim);
      K.labels.push({ ...d, wall: "isl", kind: "kitchen" });
      labelAt(d, 0.2);
    }
    // the cabinets on each wall: on the floor, in front of the plinth (what they measure — the room's wall is above)
    for (const r of plan.runs) {
      const run = K.runs.get(r.wall)!;
      const holder = new THREE.Group();
      run.group.add(holder);
      const span = kitchenLabelSpan(r);
      const d = dimLine(doc, holder, cm(span.from), cm(span.to), 0.012, BASE_FACE + 0.16, `Kuhinja ${r.wall.toUpperCase()}`, span.to - span.from, mats.dim);
      d.setSpan(cm(span.from), cm(span.to), span.at);
      d.el.classList.add("emna-studio-dim--run");
      holder.visible = span.shown;
      K.labels.push({ ...d, wall: r.wall, kind: "kitchen", holder });
      labelAt(d, 0.25);
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
  const points: THREE.Vector3[] = [];
  const addPoints = (obj: THREE.Object3D, x0: number, x1: number, y0: number, y1: number, z0: number, z1: number) => {
    for (const x of [x0, x1]) for (const y of [y0, y1]) for (const z of [z0, z1]) points.push(obj.localToWorld(new THREE.Vector3(x, y, z)));
  };
  for (const r of plan.runs) {
    const run = K.runs.get(r.wall)!;
    addLocal(run.group, 0, run.length, 0, Math.min(ceil, ut + 0.12), 0, 0.62);
    const span = r.cabinets ?? r.kitchen;
    addPoints(run.group, cm(span.from), cm(span.to), 0, Math.min(ceil, ut + 0.04), 0, 0.62);
  }
  if (plan.island && islandGroup) {
    const I = plan.island;
    const ext = islandExtent(I);
    // the seats too: 35 cm beyond the outer edge, and beyond an end people sit at
    const endL = I.seats.some((st) => st.x < 0) ? 0.35 : 0;
    const endR = I.seats.some((st) => st.x > I.length) ? 0.35 : 0;
    const y1 = Math.max(WORK_Y, I.bar ? cm(I.bar.height) : 0);
    addLocal(islandGroup, ext.x0 - endL, ext.x1 + endR, 0, y1, ext.z0 - 0.35, 0.64);
    addPoints(islandGroup, ext.x0 - endL, ext.x1 + endR, 0, y1, ext.z0 - 0.35, 0.64);
  }
  K.box = box;
  K.boxPoints = points;
  // the studio frames the room: every wall over its whole length up to the room labels, the floor out to the kitchen
  // labels in front of the cabinets, the island with its seats
  const frame = box.clone();
  const frameTop = Math.min(ceil, labelY + 0.16);
  for (const r of plan.runs) {
    const run = K.runs.get(r.wall)!;
    for (const x of [0, run.length]) for (const y of [0, frameTop]) for (const z of [0, BASE_FACE + 0.3]) frame.expandByPoint(run.group.localToWorld(pt.set(x, y, z)));
  }
  K.frame = frame;
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

// ---------------------------------------------------------------- kitchen-run labels

/**
 * where a wall's kitchen label goes and what it says: the cabinets (RunPlan.cabinets — the kitchen without the bare
 * floor at its open ends), shown only when that differs from the room's wall (the room label already says it).
 * B / C: the label sits a little towards the open end, away from the corner where A's label is.
 */
function kitchenLabelSpan(r: RunPlan): { from: number; to: number; at: number; shown: boolean } {
  const c = r.cabinets ?? r.kitchen;
  const shown = Boolean(r.cabinets) && Math.abs(c.to - c.from - r.length) >= 0.5;
  return { from: c.from, to: c.to, at: r.wall === "a" ? 0.5 : r.wall === "b" ? 0.3 : 0.7, shown };
}

/**
 * The kitchen-run labels follow the plan (an element edit can change where the cabinets end without a rebuild): span,
 * text and whether they show. Returns whether anything changed.
 */
export function syncKitchenLabels(K: KitchenRT, plan: KitchenPlan): boolean {
  let changed = false;
  for (const l of K.labels) {
    if (l.kind !== "kitchen" || l.wall === "isl" || !l.holder) continue;
    const r = plan.runs.find((x) => x.wall === l.wall);
    if (!r) continue;
    const span = kitchenLabelSpan(r);
    const cmNow = Math.round(span.to - span.from);
    if (Number(l.el.dataset.cm ?? -1) !== cmNow) {
      l.setText(span.to - span.from);
      changed = true;
    }
    const x0 = l.group.position.x;
    l.setSpan(cm(span.from), cm(span.to), span.at);
    if (Math.abs(l.group.position.x - x0) > 1e-4) changed = true;
    if (l.holder.visible !== span.shown) {
      l.holder.visible = span.shown;
      changed = true;
    }
  }
  return changed;
}

// ---------------------------------------------------------------- per-run surfaces (rebuilt by syncRunSurfaces)

const surfacesOf = (run: RunRT) => (run.surfaces ??= { backsplash: null, plinthLed: null, shadow: null, floor: null, rail: null });

/** the worktop pieces of a wall run (m, run-local): RunPlan.worktops — a plan of an older shape: its one range */
const worktopPiecesOf = (r: RunPlan): [number, number][] =>
  (r.worktops ?? (r.worktop ? [r.worktop] : [])).map((p): [number, number] => [cm(p.from), cm(p.to)]);

/** one mesh of worktop boxes over `pieces` (m, run-local) with the sink cut-outs, relative to the group at `from` */
function worktopMesh(K: KitchenRT, runId: RunId, pieces: [number, number][], from: number, top: THREE.Material): THREE.Mesh {
  const { topY: TOP_Y, workY: WORK_Y } = heightsOf(K.plan);
  const holes = [...K.modules.values()]
    .filter((m) => m.slot.run === runId && m.hole)
    .map((m) => ({ x0: m.hole!.x0 - from, x1: m.hole!.x1 - from, z0: m.hole!.z0, z1: m.hole!.z1 }));
  const specs = pieces.flatMap(([a, b]) => slabWithHoles(a - from, b - from, TOP_Y, WORK_Y, 0, D.worktopDepth, holes));
  return mesh(boxes(specs, [from, 0, 0]), top);
}

/**
 * the worktop of a wall run with its sink cut-outs, into the run's group (null without a worktop): one mesh over its
 * pieces (a tall unit standing in the run interrupts it), the group at its first piece (it grows from there)
 */
function worktopGroup(K: KitchenRT, r: RunPlan, top: THREE.Material): THREE.Group | null {
  const run = K.runs.get(r.wall);
  const pieces = worktopPiecesOf(r);
  if (!run || !pieces.length) return null;
  const from = pieces[0][0];
  const to = pieces[pieces.length - 1][1];
  const g = new THREE.Group();
  g.position.x = from;
  const wt = worktopMesh(K, r.wall, pieces, from, top);
  g.add(wt);
  K.tops.push(wt);
  run.group.add(g);
  run.worktop = g;
  run.worktopFrom = from;
  run.worktopTo = to;
  run.worktopPieces = pieces;
  return g;
}

/** the backsplash pieces of a wall run (plan RunPlan.backsplash) */
function backsplashGroup(K: KitchenRT, r: RunPlan, top: THREE.Material, mats?: Materials): THREE.Group | null {
  const run = K.runs.get(r.wall);
  if (!run || !r.backsplash.length) return null;
  const { workY: WORK_Y } = heightsOf(K.plan);
  const bs: BoxSpec[] = r.backsplash.map((p) => [cm(p.from), WORK_Y, 0, cm(p.to), cm(p.top), D.backsplashT]);
  const bg = new THREE.Group();
  bg.position.y = WORK_Y;
  // KitchenConfig.backsplash: the worktop material (it follows a worktop change: K.tops), or glass / tiles of its own
  const kind = backsplashOfCfg(K.plan.cfg);
  const own = mats && (kind.kind === "staklo" || kind.kind === "plocice") ? mats.backsplash(kind.finish ?? undefined) : null;
  const me = mesh(boxes(bs.map((b) => [b[0], b[1] - WORK_Y, b[2], b[3], b[4] - WORK_Y, b[5]] as BoxSpec), [0, WORK_Y, 0]), own ?? top);
  bg.add(me);
  if (!own) K.tops.push(me);
  run.group.add(bg);
  surfacesOf(run).backsplash = bg;
  return bg;
}

/** the hanging rail with hooks on a wall (plan RunPlan.rail): a steel tube on two brackets, S-hooks along it */
function railGroup(K: KitchenRT, r: RunPlan, mats: Materials): THREE.Group | null {
  const run = K.runs.get(r.wall);
  const rl = r.rail;
  if (!run || !rl) return null;
  // on the backsplash (or the wall without one)
  const z0 = r.backsplash.length ? D.backsplashT : 0;
  const x0 = cm(rl.from);
  const x1 = cm(rl.to);
  const y = cm(rl.y);
  const g = new THREE.Group();
  const rz = z0 + 0.045;
  const list: BoxSpec[] = [
    [x0, y - 0.007, rz - 0.007, x1, y + 0.007, rz + 0.007],
    [x0 + 0.04, y - 0.012, z0 + 0.0005, x0 + 0.055, y + 0.012, rz - 0.007],
    [x1 - 0.055, y - 0.012, z0 + 0.0005, x1 - 0.04, y + 0.012, rz - 0.007],
  ];
  const n = Math.max(2, Math.floor((x1 - x0) / 0.12));
  for (let i = 1; i < n; i++) {
    const x = x0 + ((x1 - x0) * i) / n;
    list.push([x - 0.0025, y - 0.07, rz - 0.0025, x + 0.0025, y - 0.007, rz + 0.0025], [x - 0.0025, y - 0.075, rz - 0.0025, x + 0.0025, y - 0.07, rz + 0.02]);
  }
  g.add(mesh(boxes(list), mats.steel));
  run.group.add(g);
  surfacesOf(run).rail = g;
  return g;
}

/**
 * the LED strip in the plinth along the base cabinets (plan RunPlan.counters: one strip per stretch between the tall
 * units standing in the run), in one group at the first strip (it grows from there)
 */
function plinthLedGroup(K: KitchenRT, r: RunPlan, mats: Materials): THREE.Group | null {
  const run = K.runs.get(r.wall);
  const ranges = (r.counters ?? (r.counter ? [r.counter] : []))
    .map((c) => [cm(c.from) + 0.02, cm(c.to) - 0.02] as const)
    .filter(([x0, x1]) => x1 - x0 > 0.2);
  if (!run || !ranges.length) return null;
  const g0 = ranges[0][0];
  const g = new THREE.Group();
  g.position.x = g0;
  const z = BASE_FACE - D.plinthRecess;
  for (const [x0, x1] of ranges) {
    const strip = mesh(boxes([[x0 - g0, 0.004, z + 0.001, x1 - g0, 0.009, z + 0.007]]), mats.led, false, false);
    g.add(strip);
    K.leds.push({ mesh: strip, length: x1 - x0, kind: "plinth" });
  }
  run.group.add(g);
  surfacesOf(run).plinthLed = g;
  return g;
}

/** the soft contact shadow under a wall run's base cabinets and tall columns */
function runShadowGroup(K: KitchenRT, r: RunPlan, mats: Materials): THREE.Group | null {
  const run = K.runs.get(r.wall);
  if (!run) return null;
  const ranges = [r.counter, ...(r.talls ?? (r.tall ? [r.tall] : []))].filter((x): x is { from: number; to: number } => Boolean(x));
  if (!ranges.length) return null;
  const from = Math.min(...ranges.map((x) => x.from));
  const to = Math.max(...ranges.map((x) => x.to));
  const sh = contactShadow(cm(from), 0, cm(to), BASE_FACE, 0.14, mats.shadow);
  const g = new THREE.Group();
  g.add(sh);
  run.group.add(g);
  surfacesOf(run).shadow = g;
  return g;
}

/** studio: a dashed accent outline on the bare floor an edited run leaves free at its open end (RunPlan.free) */
function floorMarks(K: KitchenRT, r: RunPlan, mats: Materials): THREE.Group | null {
  const run = K.runs.get(r.wall);
  if (!run || !r.free?.length) return null;
  const list: BoxSpec[] = [];
  const t = 0.012;
  const y0 = 0.0012;
  const y1 = 0.0028;
  const z0 = 0.04;
  const z1 = BASE_FACE - 0.02;
  for (const f of r.free) {
    const x0 = cm(f.from) + 0.03;
    const x1 = cm(f.to) - 0.03;
    if (x1 - x0 < 0.1) continue;
    // dashes along the front edge and the wall, solid short ends
    const n = Math.max(1, Math.round((x1 - x0) / 0.14));
    const step = (x1 - x0) / n;
    for (let i = 0; i < n; i++) {
      const a = x0 + i * step + step * 0.2;
      const b = a + step * 0.6;
      list.push([a, y0, z1 - t, b, y1, z1], [a, y0, z0, b, y1, z0 + t]);
    }
    list.push([x0, y0, z0, x0 + t, y1, z1], [x1 - t, y0, z0, x1, y1, z1]);
  }
  if (!list.length) return null;
  const g = new THREE.Group();
  g.add(mesh(boxes(list), mats.dim, false, false));
  run.group.add(g);
  surfacesOf(run).floor = g;
  return g;
}

/**
 * An element edit changed where a wall run's cabinets end (worktop, backsplash, plinth, tall columns, bare floor —
 * plan.ts lets the worktop end with the cabinets): rebuild those surfaces in place, without animation. Call after
 * K.modules holds the new modules (sink cut-outs) and before K.plan = plan. Returns whether anything changed (the
 * caller marks the frame dirty, so the frozen shadow maps re-render).
 */
export function syncRunSurfaces(K: KitchenRT, mats: Materials, plan: KitchenPlan, top: THREE.Material, marks: boolean): boolean {
  let changed = false;
  const old = K.plan;
  K.plan = plan;
  const drop = (g: THREE.Group | null) => {
    if (!g) return;
    const gone = new Set<THREE.Object3D>();
    g.traverse((o) => gone.add(o));
    K.tops = K.tops.filter((m) => !gone.has(m));
    K.leds = K.leds.filter((z) => !gone.has(z.mesh));
    disposeGeometries(g);
    g.parent?.remove(g);
  };
  for (const r of plan.runs) {
    const o = old.runs.find((x) => x.wall === r.wall);
    const run = K.runs.get(r.wall);
    if (!o || !run) continue;
    const key = (x: RunPlan, p: KitchenPlan) =>
      JSON.stringify([x.worktops ?? x.worktop, x.backsplash, x.counters ?? x.counter, x.talls ?? x.tall, x.free ?? [], x.rail ?? null, p.cfg.backsplash ?? null]);
    if (key(o, old) === key(r, plan)) continue;
    changed = true;
    const sf = surfacesOf(run);
    drop(run.worktop);
    run.worktop = null;
    drop(sf.backsplash);
    drop(sf.plinthLed);
    drop(sf.shadow);
    drop(sf.floor);
    drop(sf.rail);
    run.surfaces = { backsplash: null, plinthLed: null, shadow: null, floor: null, rail: null };
    worktopGroup(K, r, top);
    backsplashGroup(K, r, top, mats);
    plinthLedGroup(K, r, mats);
    runShadowGroup(K, r, mats);
    railGroup(K, r, mats);
    if (marks) floorMarks(K, r, mats);
  }
  if (!changed) K.plan = old;
  return changed;
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
  const H = heightsOf(plan);
  const ub = H.ub;
  // fillers and end panels of the wall units cover the top row too, the cornice ("do stropa") runs on above them
  const ut = H.topRow ? H.topRow.y1 : H.ut;
  const up = H.cornice ? H.cornice.y1 : ut;
  const tallUp = H.cornice ? H.cornice.y1 : H.tallTop;
  const TOP_Y = H.topY;
  const gola = env.handles === "bez";
  // the Gola lip / the finger gap ("luft") below the wall units, the channel / gap under the worktop
  const lip = lipOf(env.handles);
  const gripGap = gripGapOf(env.handles);
  // a "do stropa" top row deeper / shallower than the wall units (HeightSpec.topDepth): its stretch of a piece steps out
  const rowFace = H.topRow && Math.abs(H.topDepth - 0.35) > 1e-6 ? UPPER_FACE + (H.topDepth - 0.35) : null;
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
    const split = rowFace !== null && H.topRow ? H.topRow.y0 : up;
    if (p.kind === "panel") {
      // the Gola lip below the wall units stands in front of the backsplash, not in the stone
      fm.push([x0, ub, 0, x1, split, UPPER_FACE]);
      if (rowFace !== null) fm.push([x0, split, 0, x1, up, rowFace]);
      if (lip > 0) fm.push([x0, ub - lip, cm(DIM.backsplashT), x1, ub, UPPER_FACE]);
    }
    else {
      fm.push([x0 + 0.0015, ub - lip, D.upperCarcass + D.frontOff, x1 - 0.0015, split, UPPER_FACE]);
      if (rowFace !== null) fm.push([x0 + 0.0015, split, rowFace - D.frontT, x1 - 0.0015, up, rowFace]);
      cs.push([x0 + 0.001, ub, 0.004, x1 - 0.001, ut, D.upperCarcass]);
    }
  } else if (p.zone === "tall") {
    fm.push([x0, 0, 0, x1, tallUp, BASE_FACE]);
  } else if (p.kind === "panel") {
    fm.push([x0, 0, 0, x1, TOP_Y, BASE_FACE]);
  } else {
    fm.push([x0 + 0.0015, H.plinth + 0.0015, D.carcass + D.frontOff, x1 - 0.0015, TOP_Y - gripGap - 0.0015, BASE_FACE]);
    cs.push([x0 + 0.001, H.plinth, 0.004, x1 - 0.001, TOP_Y, D.carcass]);
    const pm = mesh(boxes([[x0 + 0.001, 0, 0.03, x1 - 0.001, H.plinth - 0.002, BASE_FACE - D.plinthRecess]], uv), plinthMat(env, zone));
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
  K.frontPieces = [...K.islandParts.front];
  K.carcassPieces = [...K.islandParts.carcass];
  K.plinthPieces = [...K.islandParts.plinth];
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
  const { topY: TOP_Y, workY: WORK_Y } = heightsOf(K.plan);
  let me: THREE.Mesh;
  if (runId === "isl" && K.plan.island) {
    me = mesh(boxes(islandSlab(K.plan.island, TOP_Y, WORK_Y, mods.map((m) => m.hole!))), top);
  } else {
    const from = run.worktopFrom;
    me = worktopMesh(K, runId, run.worktopPieces ?? [[from, run.worktopTo]], from, top);
  }
  g.add(me);
  K.tops.push(me);
}

// ---------------------------------------------------------------- island / peninsula extras

/** one part of the island the assembly timeline animates */
interface IslandPart {
  obj: THREE.Group;
  track: "extrude" | "drop" | "pop";
  /** start, relative to the island's other extras (multiples of the tempo) */
  delay: number;
}

/**
 * What an island had never had before KitchenConfig.islandSpec (each only when plan.island lists it): front-coloured end
 * panels, the row of push-to-open cabinets on the outer side of a deeper body, the raised bar (upstand, top, brackets)
 * or the lowered table (top, two legs). Front / carcass / plinth meshes join K.islandParts (material changes reach
 * them), a top in the kitchen's worktop material joins K.tops.
 */
function buildIslandExtras(K: KitchenRT, env: KitchenEnv, I: IslandPlan): IslandPart[] {
  const { mats } = env;
  const H = heightsOf(K.plan);
  const TOP_Y = H.topY;
  const out: IslandPart[] = [];
  const front = mats.front(env.fronts.island);
  const asFront = (me: THREE.Mesh) => {
    me.userData.fz = "island";
    K.frontPieces.push(me);
    K.islandParts.front.push(me);
    return me;
  };
  if (I.endPanels.length) {
    const g = new THREE.Group();
    g.add(asFront(mesh(boxes(I.endPanels.map((r) => [cm(r.from), 0, cm(r.z0), cm(r.to), TOP_Y, Math.min(cm(r.z1), BASE_FACE)] as BoxSpec)), front)));
    out.push({ obj: g, track: "extrude", delay: 0 });
  }
  if (I.backRow) {
    const r = I.backRow;
    const g = new THREE.Group();
    const bd = cm(r.depth);
    const T = D.board;
    const y0 = H.plinth;
    const zb = -0.004;
    const zc = -bd + D.frontT + D.frontOff;
    const carc: BoxSpec[] = [];
    const doors: BoxSpec[] = [];
    let x = cm(r.from);
    for (const w0 of r.doors) {
      const w = cm(w0);
      const x0 = x + 0.001;
      const x1 = x + w - 0.001;
      carc.push(
        [x0, y0, zc, x0 + T, TOP_Y, zb],
        [x1 - T, y0, zc, x1, TOP_Y, zb],
        [x0 + T, y0, zc, x1 - T, y0 + T, zb],
        [x0 + T, TOP_Y - T, zc, x1 - T, TOP_Y, zb],
        [x0 + T, (y0 + TOP_Y) / 2, zc + 0.02, x1 - T, (y0 + TOP_Y) / 2 + T, zb - 0.01],
        [x0 + T, y0 + T, zb - D.back, x1 - T, TOP_Y - T, zb],
      );
      // push-to-open (TIP-ON): plain fronts, 3 mm reveals, no grip
      doors.push([x + D.gap, y0 + D.gap, -bd, x + w - D.gap, TOP_Y - D.gap, -bd + D.frontT]);
      x += w;
    }
    const cm1 = mesh(boxes(carc), mats.carcass(env.fronts.island));
    cm1.userData.fz = "island";
    K.carcassPieces.push(cm1);
    K.islandParts.carcass.push(cm1);
    g.add(cm1, asFront(mesh(boxes(doors), front)));
    const pl = mesh(boxes([[cm(r.from) + 0.001, 0, -bd + D.plinthRecess, cm(r.to) - 0.001, H.plinth - 0.002, -0.03]]), plinthMat(env, "island"));
    pl.userData.fz = "island";
    K.plinthPieces.push(pl);
    K.islandParts.plinth.push(pl);
    g.add(pl);
    out.push({ obj: g, track: "extrude", delay: 0.1 });
  }
  const b = I.bar;
  if (b) {
    const g = new THREE.Group();
    // the top: in the kitchen's worktop (follows it, K.tops) unless the bar has its own (IslandSpec.bar.top)
    const own = K.plan.cfg.islandSpec?.bar?.top;
    const topMat = own ? mats.top(own) : mats.top(env.topId);
    const tops: THREE.Mesh[] = [];
    // a peninsula's raised bar reaching wall A stops at the face of A's backsplash (not 1.2 cm into the stone)
    const wallEnd = I.kind === "poluotok" ? (I.side === "right" ? "left" : "right") : null;
    const splash = b.kind === "raised" ? cm(DIM.backsplashT) : 0;
    const x0 = cm(b.from) + (wallEnd === "left" && b.from < 0.05 ? splash : 0);
    const x1 = cm(b.to) - (wallEnd === "right" && b.to > I.length - 0.05 ? splash : 0);
    const yTop = cm(b.height);
    if (b.kind === "raised" && b.upstand) {
      const u = b.upstand;
      const yu = cm(u.y1);
      g.add(asFront(mesh(boxes([[x0, cm(u.y0), cm(u.z0), x1, yu, cm(u.z1)]]), front)));
      tops.push(mesh(boxes([[x0, yu, cm(b.z0), x1, yTop, cm(b.z1)]]), topMat));
      const br: BoxSpec[] = b.brackets.map((bx) => [cm(bx) - 0.004, yu - 0.12, cm(b.z0) + 0.05, cm(bx) + 0.004, yu, cm(u.z0)]);
      if (br.length) g.add(mesh(boxes(br), mats.black));
    } else {
      const yb = yTop - D.worktopT;
      tops.push(mesh(boxes([[x0, yb, cm(b.z0), x1, yTop, cm(b.z1)], ...b.legs.map((l) => [cm(l.from), 0, cm(b.z0), cm(l.to), yb, cm(b.z1)] as BoxSpec)]), topMat));
    }
    for (const t of tops) {
      g.add(t);
      if (!own) K.tops.push(t);
    }
    out.push({ obj: g, track: b.kind === "raised" ? "drop" : "extrude", delay: 0.45 });
  }
  return out;
}

/** the ceiling hood above the island hob (plan.island.hood), in the island's run frame; null without one */
export function buildIslandHood(env: Pick<KitchenEnv, "mats">, plan: KitchenPlan): THREE.Group | null {
  const h = plan.island?.hood;
  if (!h) return null;
  const { mats } = env;
  const g = new THREE.Group();
  const x = cm(h.x);
  const z = cm(h.z);
  const w = cm(h.width) / 2;
  const d = cm(h.depth) / 2;
  const y0 = cm(h.bottom);
  const y1 = cm(h.top);
  const cw = cm(h.chimney.width) / 2;
  const cd = cm(h.chimney.depth) / 2;
  // the appliance finish (black glass / inox) — or the hoods' own finish (KitchenConfig.hood.finish)
  const fin = h.finish ? hoodFinishDef(h.finish) : undefined;
  const body = fin ? mats.finishMat(`hood:${fin.id}`, fin.render) : mats.appliance;
  if (h.style === "kaseta") {
    // a cassette flush with the ceiling, in a narrow frame of ceiling board in the room's paint. The room has no ceiling
    // and the camera mostly looks from above it: the board only faces down (seen from below it frames the cassette,
    // from above nothing floats there), and nothing here casts a shadow — it sits in the ceiling, it does not hang
    const yc = cm(h.ceiling);
    const m = 0.06;
    const board = new THREE.PlaneGeometry(2 * (w + m), 2 * (d + m));
    board.rotateX(Math.PI / 2);
    board.translate(x, yc, z);
    g.add(mesh(board, mats.wall, false, false));
    g.add(mesh(boxes([[x - w, y0, z - d, x + w, yc - 0.0005, z + d]]), body, false, true));
    g.add(mesh(boxes([[x - w + 0.03, y0 - 0.002, z - d + 0.03, x + w - 0.03, y0, z + d - 0.03]]), mats.brushed, false, true));
    g.add(
      mesh(
        boxes([
          [x - w + 0.05, y0 - 0.003, z - 0.02, x - w + 0.09, y0 - 0.002, z + 0.02],
          [x + w - 0.09, y0 - 0.003, z - 0.02, x + w - 0.05, y0 - 0.002, z + 0.02],
        ]),
        mats.ovenLight,
        false,
        false,
      ),
    );
    return g;
  }
  // canopy and chimney cover, grease filter, two lights underneath
  g.add(
    mesh(
      boxes([
        [x - w, y0, z - d, x + w, y1, z + d],
        [x - cw, y1, z - cd, x + cw, cm(h.ceiling), z + cd],
      ]),
      body,
    ),
  );
  g.add(mesh(boxes([[x - w + 0.03, y0 - 0.002, z - d + 0.03, x + w - 0.03, y0, z + d - 0.03]]), mats.brushed, false, true));
  g.add(
    mesh(
      boxes([
        [x - w / 2 - 0.02, y0 - 0.003, z - 0.02, x - w / 2 + 0.02, y0 - 0.002, z + 0.02],
        [x + w / 2 - 0.02, y0 - 0.003, z - 0.02, x + w / 2 + 0.02, y0 - 0.002, z + 0.02],
      ]),
      mats.ovenLight,
      false,
      false,
    ),
  );
  return g;
}

/**
 * The visible wall hoods of a run (plan RunPlan.hoods, KitchenConfig.hood "dimnjak" / "kosa") in its run frame: a chimney
 * hood (canopy, grease filter, lights, chimney cover up to the ceiling) or an angled glass hood (body against the wall, a
 * tilted black-glass panel, chimney cover) in the hood finish. Null when the run has none.
 */
export function buildWallHoods(env: Pick<KitchenEnv, "mats">, r: RunPlan): THREE.Group | null {
  if (!r.hoods?.length) return null;
  const g = new THREE.Group();
  for (const h of r.hoods) g.add(wallHood(env.mats, h, r.backsplash.length > 0));
  return g;
}

function wallHood(mats: Materials, h: WallHoodPlan, splash: boolean): THREE.Group {
  const g = new THREE.Group();
  const fin = hoodFinishDef(h.finish);
  const body = fin ? mats.finishMat(`hood:${fin.id}`, fin.render) : mats.brushed;
  // in front of the backsplash (1,2 cm) — never in one plane with it or the wall
  const z0 = (splash ? D.backsplashT : 0) + 0.001;
  const x0 = cm(h.from);
  const x1 = cm(h.to);
  const xc = (x0 + x1) / 2;
  const y0 = cm(h.bottom);
  const y1 = cm(h.top);
  const d = cm(h.depth);
  const cw = cm(h.chimney.width) / 2;
  const cd = cm(h.chimney.depth);
  const chimney: BoxSpec = [xc - cw, y1, z0, xc + cw, cm(h.ceiling), z0 + cd];
  if (h.kind === "dimnjak") {
    g.add(mesh(boxes([[x0, y0, z0, x1, y1, z0 + d], chimney]), body));
    g.add(mesh(boxes([[x0 + 0.03, y0 - 0.002, z0 + 0.03, x1 - 0.03, y0, z0 + d - 0.03]]), mats.brushed, false, true));
    g.add(
      mesh(
        boxes([
          [xc - (x1 - x0) / 4 - 0.02, y0 - 0.003, z0 + d * 0.6 - 0.02, xc - (x1 - x0) / 4 + 0.02, y0 - 0.002, z0 + d * 0.6 + 0.02],
          [xc + (x1 - x0) / 4 - 0.02, y0 - 0.003, z0 + d * 0.6 - 0.02, xc + (x1 - x0) / 4 + 0.02, y0 - 0.002, z0 + d * 0.6 + 0.02],
        ]),
        mats.ovenLight,
        false,
        false,
      ),
    );
    return g;
  }
  // angled glass: the body against the wall, the glass from its lower front edge up and back to the body's top
  const bd = 0.12;
  g.add(mesh(boxes([[x0 + 0.02, y0 + 0.02, z0, x1 - 0.02, y1, z0 + bd], chimney]), body));
  const dy = y1 - y0;
  const dz = z0 + bd - (z0 + d);
  const L = Math.hypot(dy, dz);
  const glass = mesh(boxes([[-(x1 - x0) / 2, 0, -0.003, (x1 - x0) / 2, L, 0.003]]), h.finish === "bijela" ? body : mats.blackGlass);
  glass.position.set(xc, y0, z0 + d);
  glass.rotation.x = Math.atan2(dz, dy);
  g.add(glass);
  // the grease filter under the glass's lower edge
  g.add(mesh(boxes([[x0 + 0.03, y0 + 0.015, z0 + bd, x1 - 0.03, y0 + 0.02, z0 + d - 0.02]]), mats.brushed, false, true));
  return g;
}

/** the hobs of a wall run moved (an element edit): their visible hoods follow — rebuilt in place (no animation) */
export function syncWallHoods(K: KitchenRT, env: Pick<KitchenEnv, "mats">, plan: KitchenPlan): boolean {
  let changed = false;
  for (const r of plan.runs) {
    const before = JSON.stringify(K.plan.runs.find((x) => x.wall === r.wall)?.hoods ?? []);
    const after = JSON.stringify(r.hoods ?? []);
    if (before === after && (K.wallHoods.has(r.wall) || !r.hoods?.length)) continue;
    const old = K.wallHoods.get(r.wall);
    if (old) {
      disposeGeometries(old);
      old.parent?.remove(old);
      K.wallHoods.delete(r.wall);
    }
    const run = K.runs.get(r.wall);
    const g = run ? buildWallHoods(env, r) : null;
    if (run && g) {
      run.group.add(g);
      K.wallHoods.set(r.wall, g);
    }
    changed = true;
  }
  return changed;
}

/** the island hob moved (an element edit): the hood follows — rebuilt in place (no animation) */
export function syncIslandHood(K: KitchenRT, env: Pick<KitchenEnv, "mats">, plan: KitchenPlan): boolean {
  const before = JSON.stringify(K.plan.island?.hood ?? null);
  const after = JSON.stringify(plan.island?.hood ?? null);
  if (before === after) return false;
  if (K.islandHood) {
    disposeGeometries(K.islandHood);
    K.islandHood.parent?.remove(K.islandHood);
    K.islandHood = null;
  }
  const g = K.runs.get("isl")?.group;
  const hood = g ? buildIslandHood(env, plan) : null;
  if (g && hood) {
    g.add(hood);
    K.islandHood = hood;
  }
  return true;
}

export function disposeKitchen(K: KitchenRT): void {
  for (const l of K.labels) l.el.remove();
  disposeGeometries(K.root);
  K.root.parent?.remove(K.root);
}
