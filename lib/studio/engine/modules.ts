/**
 * Cabinet builders. Every module lives in its own group whose origin is the
 * module's left-back-floor corner in run-local metres (x along the wall,
 * y up, z away from the wall). Moving parts sit in "holders" whose origin is
 * the real pivot (door hinge, flap top edge, dishwasher bottom edge …) so the
 * mechanism demo is just a rotation or translation of the holder.
 *
 *   root ── body    (carcass, plinth, interior, appliances, LED inside)   static
 *        ├─ fronts  (wrapper ─ holder ─ panel [+ grip])                    rebuilt when the handle style changes
 *        └─ extras  (hob, tap — things standing on the worktop)
 *
 * One builder per catalogue type (catalog.modules); an unknown type falls back to a door unit. Geometries that
 * repeat unchanged (knobs, tap, bottles, plates, jars …) come from the engine's GeoCache.
 */

import * as THREE from "three";
import { SBS, cornerFoot, glassFrameDef, moduleDef } from "../catalog";
import { hasTopBox, type PlanSlot } from "../plan";
import type { FrontZone, GlassSpec, HandleStyle, HoodKind } from "../types";
import { BASE_FACE, D, TOP_Y, UPPER_FACE, gripGapOf, lipOf, type EngineHeights } from "./dims";
import { boxes, disposeGeometries, mesh, roundedPanel, type BoxSpec, type GeoCache } from "./geo";
import type { Mat, Materials } from "./materials";

/** pocket = a door that turns open and then slides back into the carcass beside it (the coffee nook) */
export type HolderKind = "door" | "drawer" | "flap" | "drop" | "pull" | "visor" | "swing" | "glide" | "pocket" | "fixed";

export interface Holder {
  node: THREE.Object3D;
  kind: HolderKind;
  /** radians (door/flap/drop/swing turn) or metres (drawer/pull/visor), signed */
  amount: number;
  /** seconds after the demo starts */
  delay: number;
  /** "swing" / "glide" / "pocket": travel towards the room / sideways (m) */
  dz?: number;
  dx?: number;
  rest: { p: THREE.Vector3; r: THREE.Euler };
}

export interface LedZone {
  mesh: THREE.Mesh;
  length: number;
  kind: "under" | "plinth" | "inner";
}

export interface ModuleRT {
  slot: PlanSlot;
  root: THREE.Group;
  body: THREE.Group;
  fronts: THREE.Group;
  extras: THREE.Group;
  /** assembly wrappers around holders (slide in) */
  wrappers: THREE.Group[];
  holders: Holder[];
  /** meshes in the front material (wave + swap) */
  panels: THREE.Mesh[];
  /** meshes in the carcass material (swap) */
  carcassMeshes: THREE.Mesh[];
  /** plinth meshes (finish: black / inox plinth, or the zone's front) */
  plinths: THREE.Mesh[];
  pickables: THREE.Mesh[];
  /** sink cut-out in the worktop, run-local metres */
  hole: { x0: number; x1: number; z0: number; z1: number } | null;
  leds: LedZone[];
  busy: boolean;
  /** local anchor for the popover (top-front centre) */
  anchor: THREE.Vector3;
  /** the zone whose front material this module wears */
  frontZone: FrontZone;
  /** empty-space slot: nothing but an invisible pick volume */
  ghost: boolean;
  /** meshes in the worktop material (a side panel of worktop): they follow a worktop change */
  tops: THREE.Mesh[];
  /** how its fronts open (push-to-open: the demo pops the fronts first) */
  open: HandleStyle;
}

export interface BuildCtx {
  mats: Materials;
  geos: GeoCache;
  front: Mat;
  carcass: Mat;
  /** plinth material (finish) */
  plinth: THREE.Material;
  handles: HandleStyle;
  /** wall-unit bottom / top (m) */
  ub: number;
  ut: number;
  /** hinge side for single doors of this slot */
  hinge: "left" | "right";
  /** hinge side for tall units (towards the open end) */
  tallHinge: "left" | "right";
  /**
   * the plan's cabinet heights (KitchenConfig.heights) — absent = standard. Tall units: `ut` above is already the top of
   * the unit itself (module-local); a top box and the "do stropa" cornice above it come from buildHeightExtras.
   */
  h?: EngineHeights;
  /** glass-door elements: the glass (KitchenConfig.glass with the element's own over it); absent = clear, front frame */
  glass?: Required<GlassSpec>;
  /** wall units: depth of the top box above it in a "do stropa" second row (m); absent = h.topDepth */
  topDepth?: number;
  /** hobs: the hood it has ("ploca" = a downdraft extractor in the hob) */
  hood?: HoodKind;
  /** the worktop material (side panels of worktop, catalog worktopMaterial); absent = none drawn */
  top?: Mat;
  /** this element's own options: floating shelves' boards / LED, a lit unit's LED */
  opt?: { rows: number; led: boolean };
}

const T = D.board;
/**
 * half of the reveal between fronts: 1,5 mm (3 mm reveals), 2 mm for push-to-open fronts (the latch needs the room). Set
 * by build / rebuildFronts for the module being built (building is synchronous).
 */
let G: number = D.gap;
const FT = D.frontT;
const BASE_FZ = D.carcass + D.frontOff + FT / 2;
const UPPER_FZ = D.upperCarcass + D.frontOff + FT / 2;
const DOOR_OPEN = 1.62;

/** where a grip goes on a front: along the top / bottom edge (centred, or on the free side of a door), or mid-height */
interface GripAt {
  edge: "top" | "bottom" | "mid";
  /** doors: panel-local x of the free (non-hinge) side's handle line; undefined = centred (drawers, flaps) */
  free?: number;
}

// ---------------------------------------------------------------- carcass

function carcassBoxes(
  w: number,
  y0: number,
  h: number,
  depth: number,
  opts: { top?: boolean; bottom?: boolean; shelves?: number[]; back?: boolean } = {},
): BoxSpec[] {
  const { top = true, bottom = true, shelves = [], back = true } = opts;
  const x0 = 0.001;
  const x1 = w - 0.001;
  const y1 = y0 + h;
  const list: BoxSpec[] = [
    [x0, y0, 0, x0 + T, y1, depth],
    [x1 - T, y0, 0, x1, y1, depth],
  ];
  if (back) list.push([x0 + T, y0 + (bottom ? T : 0), 0.004, x1 - T, y1 - (top ? T : 0), 0.004 + D.back]);
  if (bottom) list.push([x0 + T, y0, 0, x1 - T, y0 + T, depth]);
  if (top) list.push([x0 + T, y1 - T, 0, x1 - T, y1, depth]);
  for (const sy of shelves) list.push([x0 + T, sy, 0.02, x1 - T, sy + T, depth - 0.03]);
  return list;
}

/** five thin walls around an inner volume, open towards +z */
function hollow(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t = 0.006): BoxSpec[] {
  return [
    [x0, y0, z0, x0 + t, y1, z1],
    [x1 - t, y0, z0, x1, y1, z1],
    [x0 + t, y0, z0, x1 - t, y0 + t, z1],
    [x0 + t, y1 - t, z0, x1 - t, y1, z1],
    [x0 + t, y0 + t, z0, x1 - t, y1 - t, z0 + t],
  ];
}

/** an open-top tray / basket (four walls + floor) */
function tray(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number, t = 0.006): BoxSpec[] {
  return [
    [x0, y0, z0, x1, y0 + t, z1],
    [x0, y0, z0, x0 + t, y1, z1],
    [x1 - t, y0, z0, x1, y1, z1],
    [x0 + t, y0, z0, x1 - t, y1, z0 + t],
    [x0 + t, y0, z1 - t, x1 - t, y1, z1],
  ];
}

/** a wire rack: a rectangle frame plus `bars` cross wires (y = height of the wires) */
function wireRack(x0: number, x1: number, y: number, z0: number, z1: number, bars: number, r = 0.004): BoxSpec[] {
  const list: BoxSpec[] = [
    [x0, y, z0, x1, y + r, z0 + r],
    [x0, y, z1 - r, x1, y + r, z1],
    [x0, y, z0, x0 + r, y + r, z1],
    [x1 - r, y, z0, x1, y + r, z1],
  ];
  for (let k = 1; k < bars; k++) {
    const x = x0 + ((x1 - x0) * k) / bars;
    list.push([x, y, z0, x + r * 0.7, y + r * 0.7, z1]);
  }
  return list;
}

// ---------------------------------------------------------------- builder

class Mod {
  readonly w: number;
  readonly ox: number;
  constructor(
    readonly ctx: BuildCtx,
    readonly m: ModuleRT,
  ) {
    this.w = m.slot.width / 100;
    this.ox = m.slot.x / 100;
  }

  get mats(): Materials {
    return this.ctx.mats;
  }

  body(geo: THREE.BufferGeometry, mat: THREE.Material, carcass = false): THREE.Mesh {
    const me = mesh(geo, mat);
    this.m.body.add(me);
    if (carcass) this.m.carcassMeshes.push(me);
    return me;
  }

  /** a cached geometry placed at (x, y, z) in module space */
  piece(key: string, make: () => THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, parent: THREE.Object3D = this.m.body, cast = true): THREE.Mesh {
    const me = mesh(this.ctx.geos.get(key, make), mat, cast, true);
    me.position.set(x, y, z);
    parent.add(me);
    return me;
  }

  carcass(list: BoxSpec[]): THREE.Mesh {
    return this.body(boxes(list, [this.ox, 0, 0]), this.ctx.carcass, true);
  }

  /** an open carcass in the front material (open shelves): it takes part in front changes */
  openCarcass(list: BoxSpec[]): THREE.Mesh {
    const me = mesh(boxes(list, [this.ox, 0, 0]), this.ctx.front);
    this.m.body.add(me);
    this.m.panels.push(me);
    return me;
  }

  plinth(): void {
    const me = this.body(boxes([[0.001, 0, 0.03, this.w - 0.001, D.plinth - 0.002, BASE_FACE - D.plinthRecess]], [this.ox, 0, 0]), this.ctx.plinth);
    this.m.plinths.push(me);
  }

  /** invisible pick volume of an empty-space slot */
  ghost(y0: number, y1: number, depth: number): void {
    const me = mesh(boxes([[0.004, y0, 0.004, this.w - 0.004, y1, depth]]), this.mats.ghost, false, false);
    me.userData.ghost = true;
    this.m.body.add(me);
  }

  /** a moving part: wrapper (assembly) > holder (mechanism); `parent` nests it in another holder */
  holder(kind: HolderKind, x: number, y: number, z: number, amount: number, delay: number, wrap = true, parent?: THREE.Object3D): THREE.Group {
    const h = new THREE.Group();
    h.position.set(x, y, z);
    if (parent) parent.add(h);
    else if (wrap) {
      const wr = new THREE.Group();
      wr.add(h);
      this.m.fronts.add(wr);
      this.m.wrappers.push(wr);
    } else this.m.fronts.add(h);
    this.m.holders.push({ node: h, kind, amount, delay, rest: { p: h.position.clone(), r: h.rotation.clone() } });
    return h;
  }

  lastHolder(): Holder {
    return this.m.holders[this.m.holders.length - 1];
  }

  /** front panel centred at (lx, ly) in holder space; (cx, cy, cz) = module-local centre (UV continuity) */
  panel(parent: THREE.Object3D, fw: number, fh: number, lx: number, ly: number, cx: number, cy: number, cz: number, mat?: THREE.Material): THREE.Mesh {
    const me = mesh(roundedPanel(fw, fh, FT, [this.ox + cx, cy, cz]), mat ?? this.ctx.front);
    me.position.set(lx, ly, 0);
    parent.add(me);
    if (!mat || mat === this.ctx.front) this.m.panels.push(me);
    return me;
  }

  /** fixed, non-moving front-material strip (corner filler) */
  fixedPanel(x0: number, x1: number, y0: number, y1: number, fz: number): THREE.Mesh {
    const fw = x1 - x0;
    const fh = y1 - y0;
    const me = mesh(roundedPanel(fw, fh, FT, [this.ox + (x0 + x1) / 2, (y0 + y1) / 2, fz]), this.ctx.front);
    me.position.set((x0 + x1) / 2, (y0 + y1) / 2, fz);
    this.m.fronts.add(me);
    this.m.panels.push(me);
    return me;
  }

  // ---------------------------------------------------- grips

  private bar(panel: THREE.Mesh, dir: "h" | "v", len: number, ax: number, ay: number, mat: THREE.Material): void {
    const L = Math.max(0.08, len);
    const s = 0.011;
    const off = 0.022;
    const z0 = FT / 2;
    const list: BoxSpec[] =
      dir === "h"
        ? [
            [-L / 2, -s / 2, z0 + off - s / 2, L / 2, s / 2, z0 + off + s / 2],
            [-L / 2 + 0.025, -0.004, z0, -L / 2 + 0.033, 0.004, z0 + off],
            [L / 2 - 0.033, -0.004, z0, L / 2 - 0.025, 0.004, z0 + off],
          ]
        : [
            [-s / 2, -L / 2, z0 + off - s / 2, s / 2, L / 2, z0 + off + s / 2],
            [-0.004, -L / 2 + 0.025, z0, 0.004, -L / 2 + 0.033, z0 + off],
            [-0.004, L / 2 - 0.033, z0, 0.004, L / 2 - 0.025, z0 + off],
          ];
    const me = mesh(boxes(list), mat);
    me.position.set(ax, ay, 0);
    panel.add(me);
  }

  private knob(panel: THREE.Mesh, ax: number, ay: number): void {
    const g = this.ctx.geos.get("knob", () => {
      const pts = [
        new THREE.Vector2(0.0001, 0),
        new THREE.Vector2(0.0075, 0),
        new THREE.Vector2(0.0075, 0.011),
        new THREE.Vector2(0.0145, 0.017),
        new THREE.Vector2(0.016, 0.022),
        new THREE.Vector2(0.0135, 0.026),
        new THREE.Vector2(0.0001, 0.027),
      ];
      const lg = new THREE.LatheGeometry(pts, 24);
      lg.rotateX(Math.PI / 2);
      return lg;
    });
    const me = mesh(g, this.mats.handle);
    me.position.set(ax, ay, FT / 2);
    panel.add(me);
  }

  /** aluminium edge-grip profile along one edge of a front (top / bottom), or along its free side (tall doors) */
  private edgeProfile(panel: THREE.Mesh, fw: number, fh: number, at: GripAt): void {
    const p = 0.016;
    const z0 = FT / 2 - 0.01;
    const z1 = FT / 2 + 0.0008;
    // the profile caps the front's edge 0.3 mm proud of it and stops 0.3 mm short of its corners: no face of the
    // profile lies in a face of the front (they would flicker)
    const e = 0.0003;
    let prof: BoxSpec;
    let groove: BoxSpec;
    if (at.edge === "mid" && at.free !== undefined) {
      const sx = at.free > 0 ? fw / 2 : -fw / 2;
      const out = sx + Math.sign(sx) * e;
      const a = Math.min(out, sx - Math.sign(sx) * p);
      const b = Math.max(out, sx - Math.sign(sx) * p);
      prof = [a, -fh / 2 + e, z0, b, fh / 2 - e, z1];
      const g0 = sx > 0 ? sx - 0.012 : sx + 0.004;
      groove = [g0, -fh / 2 + 0.0005, FT / 2 - 0.004, g0 + 0.008, fh / 2 - 0.0005, z1 + 0.0004];
    } else {
      const top = at.edge !== "bottom";
      const y1 = top ? fh / 2 : -fh / 2 + p;
      prof = [-fw / 2 + e, y1 - p - (top ? 0 : e), z0, fw / 2 - e, y1 + (top ? e : 0), z1];
      const gy = top ? fh / 2 - 0.012 : -fh / 2 + 0.004;
      groove = [-fw / 2 + 0.0005, gy, FT / 2 - 0.004, fw / 2 - 0.0005, gy + 0.008, z1 + 0.0004];
    }
    panel.add(mesh(boxes([prof]), this.mats.handle));
    panel.add(mesh(boxes([groove]), this.mats.trim, false, true));
  }

  /** the grip of the current handle style on a front panel (nothing for Gola / push-to-open) */
  grip(panel: THREE.Mesh, fw: number, fh: number, at: GripAt): void {
    const st = this.ctx.handles;
    if (st === "bez" || st === "push" || st === "luft") return;
    if (st === "utor") {
      this.edgeProfile(panel, fw, fh, at);
      return;
    }
    if (at.free === undefined) {
      // drawers and flaps: centred near the edge
      const ay = at.edge === "bottom" ? -fh / 2 + (st === "gumb" ? 0.04 : 0.035) : fh / 2 - (st === "gumb" ? 0.04 : 0.035);
      if (st === "letvica") this.bar(panel, "h", Math.min(fw - 0.12, 0.42), 0, ay, this.mats.handle);
      else this.knob(panel, 0, ay);
      return;
    }
    const len = Math.min(0.2, fh * 0.4);
    if (st === "letvica") {
      const ay = at.edge === "top" ? fh / 2 - 0.05 - len / 2 : at.edge === "bottom" ? -fh / 2 + 0.05 + len / 2 : 0;
      this.bar(panel, "v", at.edge === "mid" ? Math.min(0.5, fh * 0.45) : len, at.free, ay, this.mats.handle);
    } else {
      const ay = at.edge === "top" ? fh / 2 - 0.05 : at.edge === "bottom" ? -fh / 2 + 0.05 : 0;
      this.knob(panel, at.free, ay);
    }
  }

  // ---------------------------------------------------- front kinds

  door(x0: number, x1: number, y0: number, y1: number, fz: number, hinge: "left" | "right", hpos: "top" | "bottom" | "mid", delay = 0, glass = false): THREE.Group {
    const fw = x1 - x0 - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const px = hinge === "left" ? x0 + G : x1 - G;
    const h = this.holder("door", px, (y0 + y1) / 2, fz, hinge === "left" ? -DOOR_OPEN : DOOR_OPEN, delay);
    const lx = hinge === "left" ? fw / 2 : -fw / 2;
    const p = glass ? this.glassDoor(h, fw, fh, lx, (x0 + x1) / 2, (y0 + y1) / 2, fz) : this.panel(h, fw, fh, lx, 0, (x0 + x1) / 2, (y0 + y1) / 2, fz);
    const free = hinge === "left" ? fw / 2 - 0.035 : -fw / 2 + 0.035;
    this.grip(p, fw, fh, { edge: hpos, free });
    return h;
  }

  /**
   * a glass door: a frame in the front (4,5 cm, every older vitrine) or a thin metal profile (KitchenConfig.glass /
   * opt.glass frame), and the glass of its kind (materials.glassOf)
   */
  glassDoor(h: THREE.Object3D, fw: number, fh: number, lx: number, cx: number, cy: number, fz: number): THREE.Mesh {
    const fd = glassFrameDef(this.ctx.glass?.frame);
    const metal = fd?.render.metal;
    const r = metal ? fd.render.width / 100 : 0.045;
    const list: BoxSpec[] = [
      [-fw / 2, -fh / 2, -FT / 2, -fw / 2 + r, fh / 2, FT / 2],
      [fw / 2 - r, -fh / 2, -FT / 2, fw / 2, fh / 2, FT / 2],
      [-fw / 2 + r, -fh / 2, -FT / 2, fw / 2 - r, -fh / 2 + r, FT / 2],
      [-fw / 2 + r, fh / 2 - r, -FT / 2, fw / 2 - r, fh / 2, FT / 2],
    ];
    const frame = mesh(boxes(list, [this.ox + cx, cy, fz]), metal && fd ? this.mats.finishMat(`frame:${fd.id}`, metal) : this.ctx.front);
    frame.position.set(lx, 0, 0);
    h.add(frame);
    // a metal frame keeps its finish through a front change (not one of the panels)
    if (!metal) this.m.panels.push(frame);
    const glass = mesh(boxes([[-fw / 2 + r, -fh / 2 + r, -0.002, fw / 2 - r, fh / 2 - r, 0.002]]), this.mats.glassOf(this.ctx.glass?.type, this.ctx.glass?.led !== false), false, false);
    frame.add(glass);
    return frame;
  }

  /** a glass-door element's inner LED and glass shelves are on (KitchenConfig.glass / opt.glass; on for every older one) */
  get glassLed(): boolean {
    return this.ctx.glass?.led !== false;
  }
  get glassShelves(): boolean {
    return this.ctx.glass?.shelves !== false;
  }

  /** a drawer front with its box; `box`: the kind of drawer behind the front */
  drawer(
    x0: number,
    x1: number,
    y0: number,
    y1: number,
    fz: number,
    depth: number,
    delay: number,
    fixed = false,
    box: "drawer" | "bins" | "none" = "drawer",
  ): { holder: THREE.Group; panel: THREE.Mesh } {
    const fw = x1 - x0 - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const h = this.holder(fixed ? "fixed" : "drawer", (x0 + x1) / 2, (y0 + y1) / 2, fz, fixed ? 0 : depth * 0.78, delay);
    const p = this.panel(h, fw, fh, 0, 0, (x0 + x1) / 2, (y0 + y1) / 2, fz);
    if (!fixed && box !== "none") {
      const bw = x1 - x0 - 2 * T - 0.03;
      const zb = -FT / 2 - D.frontOff - 0.004;
      const zf = zb - depth;
      const yb = -fh / 2 + 0.012;
      if (box === "drawer") {
        const bh = Math.max(0.06, Math.min(fh - 0.05, 0.2));
        const t = 0.012;
        const geo = boxes([
          [-bw / 2, yb, zf, -bw / 2 + t, yb + bh, zb],
          [bw / 2 - t, yb, zf, bw / 2, yb + bh, zb],
          [-bw / 2 + t, yb, zf, bw / 2 - t, yb + bh * 0.85, zf + t],
          [-bw / 2 + t, yb, zf + t, bw / 2 - t, yb + 0.008, zb],
        ]);
        h.add(mesh(geo, this.mats.drawer, true, true));
      } else {
        // waste sorting: a low frame with two or three open bins and their lids
        const frame = boxes([
          [-bw / 2, yb, zf, bw / 2, yb + 0.01, zb],
          [-bw / 2, yb, zf, -bw / 2 + 0.01, yb + 0.12, zb],
          [bw / 2 - 0.01, yb, zf, bw / 2, yb + 0.12, zb],
        ]);
        h.add(mesh(frame, this.mats.drawer));
        const n = bw > 0.36 ? (bw > 0.5 ? 3 : 2) : 1;
        const gap = 0.012;
        const bwi = (bw - 0.02 - gap * (n + 1)) / n;
        const binH = Math.min(fh - 0.12, 0.42);
        for (let i = 0; i < n; i++) {
          const bx0 = -bw / 2 + 0.01 + gap + i * (bwi + gap);
          h.add(mesh(boxes(tray(bx0, yb + 0.01, zf + 0.02, bx0 + bwi, yb + 0.01 + binH, zb - 0.02, 0.005)), this.mats.bin));
          h.add(mesh(boxes([[bx0 - 0.002, yb + 0.012 + binH, zf + 0.018, bx0 + bwi + 0.002, yb + 0.02 + binH, zb - 0.06]]), this.mats.trim));
        }
      }
    }
    this.grip(p, fw, fh, { edge: "top" });
    return { holder: h, panel: p };
  }

  /** stack of drawers top -> bottom by ratio */
  drawers(y0: number, y1: number, ratios: number[], fz: number, depth: number, fixedTop = false): void {
    const H = y1 - y0;
    let y = y1;
    ratios.forEach((r, i) => {
      const h = r * H;
      this.drawer(0, this.w, y - h, y, fz, depth, i * 0.12, fixedTop && i === 0);
      y -= h;
    });
  }

  doors(y0: number, y1: number, fz: number, hpos: "top" | "bottom" | "mid", glass = false, two?: boolean): void {
    if (two ?? this.w > 0.62) {
      this.door(0, this.w / 2, y0, y1, fz, "left", hpos, 0, glass);
      this.door(this.w / 2, this.w, y0, y1, fz, "right", hpos, 0.08, glass);
    } else this.door(0, this.w, y0, y1, fz, this.ctx.hinge, hpos, 0, glass);
  }

  flap(y0: number, y1: number, fz: number, delay = 0): void {
    const fw = this.w - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const h = this.holder("flap", this.w / 2, y1 - G, fz, -1.68, delay);
    const p = this.panel(h, fw, fh, 0, -fh / 2, this.w / 2, (y0 + y1) / 2, fz);
    this.grip(p, fw, fh, { edge: "bottom" });
  }

  /** bi-fold lift: the upper front swings up and out, the lower one (hinged to it) folds back over it */
  biFold(y0: number, y1: number, fz: number): void {
    const fw = this.w - 2 * G;
    const H = y1 - y0;
    const hA = H / 2 - 2 * G;
    const hB = H / 2 - 2 * G;
    const a = this.holder("flap", this.w / 2, y1 - G, fz, -1.3, 0);
    this.panel(a, fw, hA, 0, -hA / 2, this.w / 2, y1 - H / 4, fz);
    const b = this.holder("flap", 0, -hA - 2 * G, 0, 2.55, 0, false, a);
    const pb = this.panel(b, fw, hB, 0, -hB / 2, this.w / 2, y0 + H / 4, fz);
    this.grip(pb, fw, hB, { edge: "bottom" });
  }

  drop(x0: number, x1: number, y0: number, y1: number, fz: number, amount: number, mat?: THREE.Material): { holder: THREE.Group; panel: THREE.Mesh } {
    const fw = x1 - x0 - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const h = this.holder("drop", (x0 + x1) / 2, y0 + G, fz, amount, 0);
    const p = this.panel(h, fw, fh, 0, fh / 2, (x0 + x1) / 2, (y0 + y1) / 2, fz, mat);
    return { holder: h, panel: p };
  }

  ledInner(x0: number, x1: number, y: number, z: number): void {
    const len = x1 - x0;
    if (len < 0.1) return;
    const me = mesh(boxes([[x0, y - 0.004, z - 0.004, x1, y, z + 0.004]]), this.mats.led, false, false);
    this.m.body.add(me);
    this.m.leds.push({ mesh: me, length: len, kind: "inner" });
  }

  // ---------------------------------------------------- appliances

  /** oven cavity (body) between y0 and y1 */
  ovenCavity(y0: number, y1: number): void {
    const mats = this.mats;
    const w = this.w;
    const cx0 = 0.03;
    const cx1 = w - 0.03;
    this.body(boxes(hollow(cx0, y0 + 0.01, 0.06, cx1, y1 - 0.01, D.carcass - 0.002, 0.008)), mats.enamel);
    const r = 0.004;
    const ry = y0 + (y1 - y0) * 0.36;
    this.body(boxes(wireRack(cx0 + 0.02, cx1 - 0.02, ry, 0.08, D.carcass - 0.04, 9, r)), mats.brushed);
    this.body(boxes([[w / 2 - 0.08, y1 - 0.035, 0.07, w / 2 + 0.08, y1 - 0.025, 0.075]]), mats.ovenLight);
  }

  /** drop-down oven door: frame in the appliance finish, a dark glass window and a steel bar */
  ovenDoor(y0: number, y1: number, fz: number, delay = 0): void {
    const w = this.w;
    const { holder, panel } = this.drop(0, w, y0, y1, fz, 1.35, this.mats.appliance);
    holder.userData.delay = delay;
    const fw = w - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const win = mesh(boxes([[-fw / 2 + 0.05, -fh / 2 + 0.05, FT / 2 - 0.001, fw / 2 - 0.05, fh / 2 - 0.09, FT / 2 + 0.0015]]), this.mats.blackGlass, false, true);
    panel.add(win);
    this.bar(panel, "h", fw - 0.14, 0, fh / 2 - 0.03, this.mats.brushed);
  }

  /** fixed control strip with a small display */
  controlStrip(y0: number, y1: number, fz: number): void {
    const w = this.w;
    const sh = this.holder("fixed", w / 2, (y0 + y1) / 2, fz, 0, 0);
    const sp = this.panel(sh, w - 2 * G, y1 - y0 - 2 * G, 0, 0, w / 2, (y0 + y1) / 2, fz, this.mats.appliance);
    sp.add(mesh(boxes([[-0.06, -0.008, FT / 2, 0.06, 0.008, FT / 2 + 0.001]]), this.mats.display, false, false));
  }

  /** built-in microwave between y0 and y1: cavity, side-hinged glass door, control column on the right */
  microwave(y0: number, y1: number, fz: number, delay: number, depth: number, includeBody: boolean): void {
    const w = this.w;
    const mats = this.mats;
    const ctrl = Math.min(0.13, w * 0.22);
    if (includeBody) {
      this.body(boxes(hollow(0.03, y0 + 0.02, Math.max(0.02, depth - 0.3), w - 0.03 - ctrl, y1 - 0.02, depth - 0.002, 0.008)), mats.enamel);
      this.body(boxes([[0.08, y0 + 0.028, Math.max(0.05, depth - 0.26), w - 0.08 - ctrl, y0 + 0.032, depth - 0.04]]), mats.glassShelf);
    }
    // control column (fixed)
    const ch = this.holder("fixed", w - ctrl / 2 - G, (y0 + y1) / 2, fz, 0, 0);
    const cp = this.panel(ch, ctrl - G, y1 - y0 - 2 * G, 0, 0, w - ctrl / 2, (y0 + y1) / 2, fz, mats.appliance);
    cp.add(mesh(boxes([[-0.03, (y1 - y0) / 2 - 0.06, FT / 2, 0.03, (y1 - y0) / 2 - 0.045, FT / 2 + 0.001]]), mats.display, false, false));
    // door, hinged on the left
    const dw = w - ctrl - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const h = this.holder("door", G, (y0 + y1) / 2, fz, -1.5, delay);
    const p = this.panel(h, dw, fh, dw / 2, 0, dw / 2, (y0 + y1) / 2, fz, mats.appliance);
    p.add(mesh(boxes([[-dw / 2 + 0.04, -fh / 2 + 0.04, FT / 2 - 0.001, dw / 2 - 0.04, fh / 2 - 0.04, FT / 2 + 0.0015]]), mats.blackGlass, false, true));
  }

  // ---------------------------------------------------- props

  plates(x: number, y: number, z: number, n: number, parent?: THREE.Object3D): void {
    for (let i = 0; i < n; i++) {
      this.piece("plate", () => new THREE.CylinderGeometry(0.11, 0.095, 0.014, 32), this.mats.ceramic, x, y + 0.007 + i * 0.016, z, parent);
    }
  }

  bottle(x: number, y: number, z: number, parent: THREE.Object3D, tall = 0.3): void {
    const key = `bottle:${tall}`;
    this.piece(
      key,
      () =>
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.0001, 0),
            new THREE.Vector2(0.034, 0),
            new THREE.Vector2(0.036, 0.01),
            new THREE.Vector2(0.036, tall * 0.62),
            new THREE.Vector2(0.014, tall * 0.8),
            new THREE.Vector2(0.012, tall),
            new THREE.Vector2(0.0001, tall),
          ],
          18,
        ),
      this.mats.bottle,
      x,
      y,
      z,
      parent,
      false,
    );
  }

  jar(x: number, y: number, z: number, parent?: THREE.Object3D): void {
    this.piece("jar", () => new THREE.CylinderGeometry(0.04, 0.04, 0.12, 20), this.mats.glassShelf, x, y + 0.06, z, parent, false);
  }

  vase(x: number, y: number, z: number): void {
    this.piece(
      "vase",
      () =>
        new THREE.LatheGeometry(
          [
            new THREE.Vector2(0.0001, 0),
            new THREE.Vector2(0.045, 0),
            new THREE.Vector2(0.06, 0.06),
            new THREE.Vector2(0.05, 0.15),
            new THREE.Vector2(0.028, 0.2),
            new THREE.Vector2(0.032, 0.22),
            new THREE.Vector2(0.0001, 0.215),
          ],
          28,
        ),
      this.mats.ceramic,
      x,
      y,
      z,
    );
  }

  plantPot(x: number, y: number, z: number): void {
    this.piece("pot", () => new THREE.CylinderGeometry(0.055, 0.045, 0.1, 24), this.mats.ceramic, x, y + 0.05, z);
    this.piece("leaves", () => new THREE.IcosahedronGeometry(0.075, 1), this.mats.plant, x, y + 0.15, z);
  }

  books(x: number, y: number, z0: number, z1: number): void {
    const list: [number, number, THREE.Material][] = [
      [0.028, 0.21, this.mats.bookA],
      [0.022, 0.19, this.mats.bookB],
      [0.03, 0.23, this.mats.bookA],
    ];
    let bx = x;
    for (const [bt, bh, mat] of list) {
      this.body(boxes([[bx, y, z0, bx + bt, y + bh, z1]]), mat);
      bx += bt + 0.002;
    }
  }
}

// ---------------------------------------------------------------- per zone

function buildBase(b: Mod, includeBody: boolean): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const mats = ctx.mats;
  const gola = ctx.handles === "bez";
  const yb = D.plinth;
  // the Gola channel or the finger gap ("luft") under the worktop
  const yt = TOP_Y - gripGapOf(ctx.handles);
  const fz = BASE_FZ;
  const corner = m.slot.corner;

  if (type === "slobodno") {
    if (includeBody) b.ghost(D.plinth, TOP_Y - 0.004, D.carcass);
    return;
  }
  // the new elements: vitrines, wine racks, end units (rounded / angled shelves, side panels)
  if (buildBaseExtra(b, includeBody, yb, yt, fz)) return;
  if (corner && cornerFoot("base", type).shape !== "blind") {
    buildShapedCorner(b, "base", includeBody);
    return;
  }

  // ---- body
  if (includeBody) {
    b.plinth();
    if (type === "perilica") {
      // the machine itself: steel tub + two racks
      b.body(boxes(hollow(0.012, D.plinth + 0.02, 0.03, w - 0.012, TOP_Y - 0.012, D.carcass - 0.004, 0.008)), mats.basin);
      const rack = (y: number) => wireRack(0.05, w - 0.05, y, 0.07, D.carcass - 0.05, 7);
      b.body(boxes([...rack(D.plinth + 0.1), ...rack(D.plinth + 0.42)]), mats.brushed);
    } else if (type === "police") {
      const H = TOP_Y - D.plinth;
      b.openCarcass(carcassBoxes(w, D.plinth, H, D.carcass + D.frontOff + FT, { shelves: [D.plinth + H * 0.36, D.plinth + H * 0.68] }));
      if (w >= 0.3) {
        b.plates(w / 2, D.plinth + H * 0.36 + T, D.carcass * 0.6, 4);
        if (w >= 0.4) b.vase(w * 0.5, D.plinth + H * 0.68 + T, D.carcass * 0.55);
        b.jar(Math.max(w * 0.3, T + 0.05), D.plinth + T, D.carcass * 0.6);
      } else {
        // 15–20 cm: a slim end shelf with a jar on each level
        for (const sy of [D.plinth + T, D.plinth + H * 0.36 + T, D.plinth + H * 0.68 + T]) b.jar(w / 2, sy, D.carcass * 0.6);
      }
    } else {
      const shelves = type === "vrata" || type === "vrata2" || (corner && type !== "kutni" && type !== "kutni-lemans" && type !== "kutni-magic") ? [D.plinth + D.baseH * 0.5] : [];
      b.carcass(carcassBoxes(w, D.plinth, D.baseH, D.carcass, { top: type !== "sudoper", shelves }));
    }

    if (type === "sudoper") {
      const wide = w >= 0.99;
      const bw = Math.min(w - 0.14, wide ? 0.86 : 0.7);
      const xc = w / 2;
      const z0 = 0.12;
      const z1 = 0.52;
      const depth = 0.2;
      const t = 0.0015;
      b.body(
        boxes([
          [xc - bw / 2, TOP_Y - depth, z0, xc + bw / 2, TOP_Y - depth + t, z1],
          [xc - bw / 2, TOP_Y - depth, z0, xc - bw / 2 + t, TOP_Y, z1],
          [xc + bw / 2 - t, TOP_Y - depth, z0, xc + bw / 2, TOP_Y, z1],
          [xc - bw / 2, TOP_Y - depth, z0, xc + bw / 2, TOP_Y, z0 + t],
          [xc - bw / 2, TOP_Y - depth, z1 - t, xc + bw / 2, TOP_Y, z1],
        ]),
        mats.sink,
      );
      if (wide) {
        // 1½ bowl: a low divider, a drain in each bowl
        const dv = xc + bw * 0.12;
        b.body(boxes([[dv - 0.004, TOP_Y - depth, z0, dv + 0.004, TOP_Y - 0.035, z1]]), mats.sink);
        b.piece("drain", () => new THREE.CylinderGeometry(0.035, 0.035, 0.003, 28), mats.steel, (xc - bw / 2 + dv) / 2, TOP_Y - depth + 0.003, (z0 + z1) / 2);
        b.piece("drain", () => new THREE.CylinderGeometry(0.035, 0.035, 0.003, 28), mats.steel, (dv + xc + bw / 2) / 2, TOP_Y - depth + 0.003, (z0 + z1) / 2);
      } else b.piece("drain", () => new THREE.CylinderGeometry(0.035, 0.035, 0.003, 28), mats.steel, xc, TOP_Y - depth + 0.003, (z0 + z1) / 2);
      m.hole = { x0: b.ox + xc - bw / 2, x1: b.ox + xc + bw / 2, z0, z1 };
      // tap
      const tap = new THREE.Group();
      tap.position.set(xc, workY(ctx), 0.075);
      b.piece("tap:pipe", () => new THREE.CylinderGeometry(0.014, 0.017, 0.34, 24), mats.tap, 0, 0.17, 0, tap);
      const arc = b.piece("tap:arc", () => new THREE.TorusGeometry(0.09, 0.012, 14, 36, Math.PI), mats.tap, 0, 0.34, 0.09, tap);
      arc.rotation.y = -Math.PI / 2;
      b.piece("tap:spout", () => new THREE.CylinderGeometry(0.012, 0.012, 0.05, 20), mats.tap, 0, 0.315, 0.18, tap);
      const lever = b.piece("tap:lever", () => boxes([[-0.006, -0.006, 0, 0.006, 0.006, 0.09]]), mats.tap, 0.032, 0.28, 0.01, tap);
      lever.rotation.x = 0.45;
      m.extras.add(tap);
    }

    if (type === "ploca" || type === "ploca-pecnica") {
      const hw = Math.min(w >= 0.99 ? 0.88 : w >= 0.8 ? 0.78 : 0.58, w - 0.04);
      const hob = mesh(new THREE.BoxGeometry(hw, 0.006, 0.51), mats.hob);
      hob.position.set(w / 2, workY(ctx) + 0.003, 0.33);
      m.extras.add(hob);
      // a downdraft hob (KitchenConfig.hood "ploca"): the extractor's slot across its middle
      if (ctx.hood === "ploca") {
        const bar = mesh(boxes([[w / 2 - hw / 2 + 0.02, workY(ctx) + 0.0055, 0.33 - 0.035, w / 2 + hw / 2 - 0.02, workY(ctx) + 0.009, 0.33 + 0.035]]), mats.trim, false, true);
        m.extras.add(bar);
      }
    }

    if (type === "ploca-pecnica" || type === "pecnica-donja") {
      const strip = 0.09;
      b.ovenCavity(yt - strip - 0.5, yt - strip);
    }

    if (type === "boce" || type === "smece") {
      // runners at the bottom of the carcass
      b.body(boxes([[T + 0.004, D.plinth + T, 0.06, T + 0.012, D.plinth + T + 0.02, D.carcass - 0.02], [w - T - 0.012, D.plinth + T, 0.06, w - T - 0.004, D.plinth + T + 0.02, D.carcass - 0.02]]), mats.brushed);
    }
  }

  // ---- fronts
  if (gola && type !== "police") {
    const me = mesh(boxes([[0, yt + 0.001, D.carcass - 0.03, w, TOP_Y - 0.001, D.carcass + 0.001]]), mats.gola, false, true);
    m.fronts.add(me);
  }

  if (corner) {
    buildCorner(b, yb, yt, fz);
    return;
  }

  switch (type) {
    case "ladice":
      b.drawers(yb, yt, [0.22, 0.39, 0.39], fz, 0.47);
      break;
    case "ladice2":
      b.drawers(yb, yt, [0.5, 0.5], fz, 0.47);
      break;
    case "ladice4":
      b.drawers(yb, yt, [0.19, 0.27, 0.27, 0.27], fz, 0.47);
      break;
    case "ladice-unutarnja": {
      const H = yt - yb;
      const mid = yb + H * 0.5;
      // the tall upper front opens first, then the hidden drawer behind it slides out
      b.drawer(0, w, mid, yt, fz, 0.47, 0);
      b.drawer(0, w, yb, mid, fz, 0.47, 0.14);
      const ih = b.holder("drawer", w / 2, yt - 0.075, D.carcass - 0.012, 0.3, 0.42, false);
      const bw = w - 2 * T - 0.04;
      ih.add(
        mesh(
          boxes([
            ...tray(-bw / 2, -0.04, -0.45, bw / 2, 0.035, 0, 0.01),
            [-bw / 2, -0.04, -0.012, bw / 2, 0.045, 0],
          ]),
          mats.drawer,
        ),
      );
      ih.add(mesh(boxes([[-bw / 2 + 0.03, -0.025, -0.4, -bw / 2 + 0.09, -0.02, -0.05], [-bw / 2 + 0.11, -0.025, -0.4, -bw / 2 + 0.17, -0.02, -0.05]]), mats.steel));
      break;
    }
    case "ploca":
      b.drawers(yb, yt, [0.22, 0.39, 0.39], fz, 0.47, true);
      break;
    case "ploca-pecnica":
    case "pecnica-donja": {
      const strip = 0.09;
      const ovenTop = yt - strip;
      const ovenBot = ovenTop - 0.5;
      b.controlStrip(ovenTop, yt, fz);
      b.ovenDoor(ovenBot, ovenTop, fz);
      if (ovenBot - yb > 0.06) b.drawer(0, w, yb, ovenBot, fz, 0.47, 0.25);
      break;
    }
    case "perilica": {
      const { holder, panel } = b.drop(0, w, yb, yt, fz, 1.42);
      // stainless inner door
      const fh = yt - yb - 2 * G;
      holder.add(mesh(boxes([[-(w - 0.06) / 2, 0.02, -FT / 2 - 0.006, (w - 0.06) / 2, fh - 0.03, -FT / 2]]), mats.basin));
      b.grip(panel, w - 2 * G, fh, { edge: "top" });
      break;
    }
    case "smece":
      b.drawer(0, w, yb, yt, fz, 0.47, 0, false, "bins");
      break;
    case "boce": {
      // a full-height pull-out with two wire baskets of bottles
      const fh = yt - yb - 2 * G;
      const fw = w - 2 * G;
      const h = b.holder("pull", w / 2, (yb + yt) / 2, fz, 0.44, 0);
      const p = b.panel(h, fw, fh, 0, 0, w / 2, (yb + yt) / 2, fz);
      b.grip(p, fw, fh, { edge: "top" });
      const bw = Math.max(0.06, w - 2 * T - 0.03);
      const zb = -FT / 2 - 0.006;
      const zf = zb - 0.48;
      const list: BoxSpec[] = [[-0.004, -fh / 2 + 0.02, zf, 0.004, fh / 2 - 0.04, zf + 0.008]];
      for (const yy of [-fh / 2 + 0.03, -fh / 2 + fh * 0.52]) {
        list.push(...wireRack(-bw / 2, bw / 2, yy, zf, zb, 2));
        list.push([-bw / 2, yy, zf, -bw / 2 + 0.004, yy + 0.06, zb], [bw / 2 - 0.004, yy, zf, bw / 2, yy + 0.06, zb]);
      }
      h.add(mesh(boxes(list), mats.brushed));
      const n = Math.max(1, Math.floor(0.42 / 0.085));
      for (let k = 0; k < n; k++) {
        const zz = zf + 0.05 + k * 0.085;
        b.bottle(0, -fh / 2 + 0.034, zz, h, 0.3);
        if (k % 2 === 0) b.bottle(0, -fh / 2 + fh * 0.52 + 0.004, zz, h, 0.22);
      }
      break;
    }
    case "police":
      break;
    case "vrata2":
      b.doors(yb, yt, fz, "top", false, true);
      break;
    default:
      b.doors(yb, yt, fz, "top");
  }
}

/** blind-corner base units: a fixed filler and the door, plus whatever comes out of the corner */
function buildCorner(b: Mod, yb: number, yt: number, fz: number): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const mats = ctx.mats;
  const corner = m.slot.corner;
  const blind = 0.6;
  const fill = 0.05;
  const doorW = w - blind - fill;
  const left = corner === "left";
  const sgn = left ? 1 : -1;
  if (left) {
    b.fixedPanel(blind + 0.0015, blind + fill - G, yb + G, yt - G, fz);
    b.door(blind + fill, w, yb, yt, fz, "right", "top");
  } else {
    b.fixedPanel(doorW + G, doorW + fill - 0.0015, yb + G, yt - G, fz);
    b.door(0, doorW, yb, yt, fz, "left", "top");
  }
  const open0 = left ? blind + fill : doorW;
  if (type === "kutni-lemans") {
    // LeMans: two rounded trays glide out of the corner on a curved path
    const trayW = Math.min(0.34, doorW - 0.08);
    const cx = open0 + sgn * (0.025 + trayW / 2);
    [D.plinth + 0.07, D.plinth + 0.41].forEach((ty, i) => {
      const h = b.holder("swing", cx, ty, 0.3, -sgn * 0.3, 0.32 + i * 0.16, false);
      const hd = b.lastHolder();
      hd.dz = 0.47;
      hd.dx = -sgn * 0.02;
      h.add(mesh(roundedPanel(trayW, 0.022, 0.4, [0, 0, 0], 0.01), mats.drawer));
      h.add(
        mesh(
          boxes([
            [-trayW / 2, 0.011, -0.2, trayW / 2, 0.05, -0.194],
            [-trayW / 2, 0.011, 0.194, trayW / 2, 0.05, 0.2],
            [-trayW / 2, 0.011, -0.2, -trayW / 2 + 0.006, 0.05, 0.2],
          ]),
          mats.brushed,
        ),
      );
      if (i === 0) b.piece("pot:big", () => new THREE.CylinderGeometry(0.11, 0.11, 0.132, 28), mats.ceramic, 0, 0.011 + 0.066, 0, h);
      else b.piece("pot:steel", () => new THREE.CylinderGeometry(0.1, 0.095, 0.13, 28), mats.steel, 0, 0.011 + 0.065, 0, h);
    });
  } else if (type === "kutni") {
    // carousel: two half-moon trays fixed to the door swing out with it, a little behind
    // half-moon trays: straight edge along the door, round side towards the wall, pivoting with the door hinge
    const r = Math.min(0.29, (doorW + 0.15) / 2);
    const hx = left ? w - G : G;
    const disc = b.ctx.geos.get(`halfmoon:${r}`, () => new THREE.CylinderGeometry(r, r, 0.018, 36, 1, false, Math.PI / 2, Math.PI));
    const ring = b.ctx.geos.get(`halfmoon:rim:${r}`, () => new THREE.TorusGeometry(r, 0.004, 6, 36, Math.PI));
    [D.plinth + 0.08, D.plinth + 0.4].forEach((ty, i) => {
      const h = b.holder("door", hx, ty, fz - FT / 2 - 0.02, left ? DOOR_OPEN * 0.82 : -DOOR_OPEN * 0.82, 0.12 + i * 0.1, false);
      const cx = -sgn * (r + 0.01);
      const t = mesh(disc, mats.drawer);
      t.position.set(cx, 0, -0.01);
      h.add(t);
      const rim = mesh(ring, mats.brushed);
      rim.rotation.x = -Math.PI / 2;
      rim.position.set(cx, 0.03, -0.01);
      h.add(rim);
      if (i === 0) b.piece("pot:big", () => new THREE.CylinderGeometry(0.11, 0.11, 0.132, 28), mats.ceramic, cx, 0.075, -r * 0.5, h);
      else b.piece("pot:steel", () => new THREE.CylinderGeometry(0.1, 0.095, 0.13, 28), mats.steel, cx, 0.074, -r * 0.5, h);
    });
  } else if (type === "kutni-magic") {
    // Magic corner: front baskets come out with the door, the rear ones then move into the opening
    const bw = Math.min(0.38, doorW - 0.06);
    const front = b.holder("glide", open0 + sgn * (0.02 + bw / 2), 0, 0.32, 0, 0.18, false);
    const fh = b.lastHolder();
    fh.dz = 0.42;
    fh.dx = sgn * 0.02;
    const rear = b.holder("glide", open0 - sgn * (0.06 + bw / 2), 0, 0.3, 0, 0.62, false);
    const rh = b.lastHolder();
    rh.dx = sgn * (bw + 0.08);
    rh.dz = 0.12;
    for (const [h, n] of [
      [front, 0],
      [rear, 1],
    ] as const) {
      for (const yy of [D.plinth + 0.09, D.plinth + 0.43]) {
        h.add(mesh(boxes(tray(-bw / 2, yy, -0.2, bw / 2, yy + 0.09, 0.2, 0.004)), mats.brushed));
        if (n === 0) b.plates(0, yy + 0.004, 0, 3, h);
        else b.jar(-bw / 4, yy + 0.004, 0, h);
      }
    }
  }
}

/** a board of any outline (run-local x / z points, counter-clockwise or not) from y0 to y1 */
function boardGeo(pts: [number, number][], y0: number, y1: number): THREE.BufferGeometry {
  const shape = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, -z)));
  const g = new THREE.ExtrudeGeometry(shape, { depth: y1 - y0, bevelEnabled: false });
  // the shape lies in x / −z, extruded along +z: turn it so the extrusion goes up
  g.rotateX(-Math.PI / 2);
  g.translate(0, y0, 0);
  return g;
}

/**
 * L-shaped and diagonal corner units (catalog cornerShape "l" / "diagonal", CORNER_FOOT): 90 × 90 cm base units and
 * 60 × 60 cm wall units reaching along wall A (the slot, `w` wide) and along the neighbouring wall (`across`, in A's run
 * frame the strip x 0 … depth, z depth … across at a left corner; mirrored at a right one).
 *
 *   kutni-l / kutni-l-karusel   an L carcass with a bi-fold door: the leaf on the neighbour's side hangs on its outer
 *                               edge, the leaf on A's side folds onto it; shelves or two carousel trays inside
 *   kutni-ladice                three L-shaped drawers that glide out of the corner diagonally
 *   kutni-dijagonalni(-staklo)  a five-sided carcass with one door across the corner (glass + LED for the vitrine)
 *   kutna-polica                open L-shaped shelves in the front colour
 */
function buildShapedCorner(b: Mod, zone: "base" | "upper", includeBody: boolean): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const mats = ctx.mats;
  const foot = cornerFoot(zone, type);
  const right = m.slot.corner === "right";
  const base = zone === "base";
  const dc = base ? D.carcass : D.upperCarcass;
  const face = base ? BASE_FACE : UPPER_FACE;
  const fz = base ? BASE_FZ : UPPER_FZ;
  const across = foot.across / 100;
  const gola = ctx.handles === "bez";
  const lip = !base ? lipOf(ctx.handles) : 0;
  // carcass and fronts, bottom → top
  const c0 = base ? D.plinth : ctx.ub;
  const c1 = base ? TOP_Y : ctx.ut;
  const f0 = base ? D.plinth : ctx.ub - lip;
  const f1 = base ? TOP_Y - gripGapOf(ctx.handles) : ctx.ut;
  const X = (x: number) => (right ? w - x : x);
  const bx = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number): BoxSpec =>
    right ? [w - x1, y0, z0, w - x0, y1, z1] : [x0, y0, z0, x1, y1, z1];
  const pts = (list: [number, number][]): [number, number][] => list.map(([x, z]) => [X(x), z]);
  const diagonal = foot.shape === "diagonal";
  const open = type === "kutna-polica";
  /** the carcass outline (left corner): the L, or the L with its inner corner cut on the diagonal */
  const outline: [number, number][] = diagonal
    ? [
        [0, 0],
        [w, 0],
        [w, dc],
        [dc, across],
        [0, across],
      ]
    : [
        [0, 0],
        [w, 0],
        [w, dc],
        [dc, dc],
        [dc, across],
        [0, across],
      ];

  if (includeBody) {
    if (base) {
      // plinth under both legs, set back like every plinth
      const r = D.plinthRecess;
      const pl = b.body(
        boxes([bx(0.001, 0, 0.03, w - 0.001, D.plinth - 0.002, BASE_FACE - r), bx(0.03, 0, BASE_FACE - r, BASE_FACE - r, D.plinth - 0.002, across - 0.001)], [b.ox, 0, 0]),
        ctx.plinth,
      );
      m.plinths.push(pl);
    }
    const boardMat = open ? ctx.front : ctx.carcass;
    const boards: THREE.BufferGeometry[] = [];
    for (const y of [c0, c0 + (c1 - c0) * 0.5 - T / 2, c1 - T]) boards.push(boardGeo(pts(outline), y, y + T));
    for (const g of boards) {
      const me = b.body(g, boardMat, !open);
      if (open) m.panels.push(me);
    }
    // the ends of both legs, and the backs against the two walls
    const sides: BoxSpec[] = [bx(w - T, c0, 0, w, c1, dc), bx(0, c0, across - T, dc, c1, across), bx(0, c0, 0, w, c1, D.back), bx(0, c0, 0, D.back, c1, across)];
    if (open) b.openCarcass(sides);
    else b.carcass(sides);
    if (type === "kutni-dijagonalni-staklo" && b.glassLed) {
      const lx = X(dc * 0.4);
      b.ledInner(Math.min(lx, X(dc * 0.4 + 0.2)), Math.max(lx, X(dc * 0.4 + 0.2)), c1 - T, dc * 0.6);
    }
    if (open) {
      // a few things on the open shelves
      b.plates(X(dc * 0.55), c0 + T, dc * 0.55, 3);
      b.vase(X(dc * 0.5), c0 + (c1 - c0) * 0.5 + T / 2, across * 0.6);
      return;
    }
    if (type === "kutni-l-karusel") {
      // two 3/4 trays (Lazy Susan) turning on a pole: the missing quarter faces the bi-fold door, the pole stands
      // r + 4 cm from both backs so the trays stay inside the carcass (a full disc would poke through the backs and the door)
      const r = Math.min(0.36, across - 0.12);
      const c = r + 0.04;
      const a0 = right ? Math.PI : Math.PI / 2;
      const arc: [number, number][] = [[0, 0]];
      for (let i = 0; i <= 30; i++) {
        const a = a0 + (1.5 * Math.PI * i) / 30;
        arc.push([r * Math.cos(a), r * Math.sin(a)]);
      }
      for (const ty of [c0 + 0.08, c0 + (c1 - c0) * 0.55]) {
        const t = b.piece(`carousel34:${r.toFixed(3)}:${right ? "r" : "l"}`, () => boardGeo(arc, -0.009, 0.009), mats.drawer, X(c), ty, c);
        t.castShadow = true;
      }
      b.piece("carousel:pole", () => new THREE.CylinderGeometry(0.012, 0.012, 0.7, 12), mats.brushed, X(c), c0 + 0.38, c);
    }
  }
  if (open) return;

  // ---- fronts
  if (base && gola) {
    // (each leg ends a millimetre inside the carcass end it runs to: not in one plane with that board)
    const g = mesh(boxes([bx(dc, f1 + 0.001, dc - 0.03, w - 0.001, TOP_Y - 0.001, dc + 0.001), bx(dc - 0.03, f1 + 0.001, dc, dc + 0.001, TOP_Y - 0.001, across - 0.001)]), mats.gola, false, true);
    m.fronts.add(g);
  }
  const H = f1 - f0;
  const cy = (f0 + f1) / 2;
  const leafA = w - face - 2 * G;
  const leafB = across - face - 2 * G;
  if (diagonal) {
    // one door across the corner, from the end of wall A's front line to the neighbour's: hinged at the end that
    // lets its face look into the room, its free end swinging out
    const pA: [number, number] = [X(w - G), face];
    const pN: [number, number] = [X(face), across - G];
    const room: [number, number] = [right ? -1 : 1, 1];
    const turn = (a: [number, number], e: [number, number]) => -Math.atan2(e[1] - a[1], e[0] - a[0]);
    let [hp, ep] = [pN, pA];
    let th = turn(hp, ep);
    // the face (local +z) must look into the room
    if (Math.sin(th) * room[0] + Math.cos(th) * room[1] < 0) {
      [hp, ep] = [pA, pN];
      th = turn(hp, ep);
    }
    const len = Math.hypot(ep[0] - hp[0], ep[1] - hp[1]);
    // the free end moves into the room for this sign of the turn
    const out = (d: number) => Math.cos(th + d) * room[0] - Math.sin(th + d) * room[1];
    const amount = out(-1.3) > out(1.3) ? -1.3 : 1.3;
    const h = b.holder("door", hp[0], cy, hp[1], amount, 0);
    h.rotation.y = th;
    b.lastHolder().rest.r.copy(h.rotation);
    const fw = len - 2 * G;
    const fh = H - 2 * G;
    const glass = type === "kutni-dijagonalni-staklo";
    const p = glass ? b.glassDoor(h, fw, fh, fw / 2 + G, (hp[0] + ep[0]) / 2, cy, fz) : b.panel(h, fw, fh, fw / 2 + G, 0, (hp[0] + ep[0]) / 2, cy, fz);
    p.position.z = -FT / 2;
    b.grip(p, fw, fh, { edge: base ? "top" : "bottom", free: fw / 2 - 0.035 });
    m.anchor.set(X((w + face) / 2), base ? 0.62 : cy, (face + across) / 2);
    return;
  }
  if (type === "kutni-ladice") {
    // three L-shaped drawers: each front is two panels meeting in the inner corner, the drawer glides out diagonally
    const rows = [0.22, 0.39, 0.39];
    let y = f1;
    rows.forEach((rr, i) => {
      const hh = rr * H;
      const y0 = y - hh;
      y = y0;
      const h = b.holder("glide", 0, 0, 0, 0, i * 0.12);
      const hd = b.lastHolder();
      hd.dx = right ? -0.28 : 0.28;
      hd.dz = 0.28;
      const fh = hh - 2 * G;
      const pa = b.panel(h, leafA, fh, X(face + G + leafA / 2), y0 + hh / 2, X(face + G + leafA / 2), y0 + hh / 2, fz);
      pa.position.z = fz;
      const pb = b.panel(h, leafB, fh, X(fz), y0 + hh / 2, X(fz), y0 + hh / 2, face + G + leafB / 2);
      pb.rotation.y = right ? -Math.PI / 2 : Math.PI / 2;
      pb.position.z = face + G + leafB / 2;
      b.grip(pa, leafA, fh, { edge: "top" });
      // the L tray behind the fronts
      const tb = 0.18;
      h.add(mesh(boardGeo(pts([[0.05, 0.05], [w - 0.06, 0.05], [w - 0.06, dc - 0.03], [dc - 0.03, dc - 0.03], [dc - 0.03, across - 0.06], [0.05, across - 0.06]]), y0 + 0.012, y0 + 0.024), mats.drawer));
      h.add(mesh(boxes([bx(0.05, y0 + 0.024, 0.05, w - 0.06, y0 + 0.024 + Math.min(tb, fh - 0.05), 0.062), bx(0.05, y0 + 0.024, 0.05, 0.062, y0 + 0.024 + Math.min(tb, fh - 0.05), across - 0.06)]), mats.drawer));
    });
    m.anchor.set(X((w + face) / 2), base ? 0.62 : cy, (face + across) / 2);
    return;
  }
  // bi-fold: the leaf on the neighbour's side hangs on its outer edge, the leaf on A's side folds onto it
  const fh = H - 2 * G;
  const h1 = b.holder("door", X(fz), cy, across - G, right ? 1.25 : -1.25, 0);
  const pB = b.panel(h1, leafB, fh, 0, 0, X(fz), cy, face + G + leafB / 2);
  pB.rotation.y = right ? -Math.PI / 2 : Math.PI / 2;
  pB.position.set(0, 0, -leafB / 2);
  // the fold between the leaves, in the inner corner where the two front planes meet
  const h2 = b.holder("door", 0, 0, fz - (across - G), right ? -2.5 : 2.5, 0.1, false, h1);
  const pA = b.panel(h2, leafA, fh, 0, 0, X(face + G + leafA / 2), cy, fz);
  pA.position.set(X(face + G + leafA / 2) - X(fz), 0, 0);
  b.grip(pA, leafA, fh, { edge: base ? "top" : "bottom", free: right ? -leafA / 2 + 0.035 : leafA / 2 - 0.035 });
  m.anchor.set(X((w + face) / 2), base ? 0.62 : cy, (face + across) / 2);
}

function buildUpper(b: Mod, includeBody: boolean): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const ub = ctx.ub;
  const ut = ctx.ut;
  const depth = D.upperCarcass;
  const fz = UPPER_FZ;
  // the Gola lip or the finger gap ("luft") below the carcass
  const lip = lipOf(ctx.handles);
  const y0 = ub - lip;
  const corner = m.slot.corner;
  const mats = ctx.mats;

  if (type === "prazno") {
    if (includeBody) b.ghost(ub, ut, depth);
    return;
  }
  // the new elements: floating shelves, wine rack, end units (rounded / angled shelves, side panels)
  if (buildUpperExtra(b, includeBody, ub, ut, y0)) return;
  if (corner && cornerFoot("upper", type).shape !== "blind") {
    buildShapedCorner(b, "upper", includeBody);
    return;
  }

  if (includeBody) {
    if (type === "nisa") {
      const list = carcassBoxes(w, ub, ut - ub, depth, { shelves: [ub + (ut - ub) * 0.5 - T / 2] });
      b.body(boxes(list, [b.ox, 0, 0]), mats.oak);
      if (ctx.opt?.led !== false) b.ledInner(0.04, w - 0.04, ut - T, depth - 0.05);
      if (w >= 0.3) b.vase(Math.max(w * 0.3, T + 0.07), ub + T, depth * 0.5);
      else b.jar(w / 2, ub + T, depth * 0.5);
      if (w >= 0.4) b.books(w * 0.62, ub + (ut - ub) * 0.5 + T / 2, depth * 0.2, depth * 0.85);
    } else if (type === "polica") {
      // one thick oak shelf at the bottom of the wall-unit zone and a thinner one above, LED under each
      const s1 = ub + 0.04;
      const s2 = ub + (ut - ub) * 0.62;
      b.body(boxes([[0.002, ub, 0.004, w - 0.002, s1, depth - 0.02], [0.002, s2, 0.004, w - 0.002, s2 + 0.03, depth - 0.05]], [b.ox, 0, 0]), mats.oak);
      if (ctx.opt?.led !== false) b.ledInner(0.04, w - 0.04, s2 - 0.001, depth - 0.09);
      b.plates(Math.max(w * 0.3, 0.115), s1, depth * 0.5, 3);
      if (w >= 0.45) b.plantPot(w * 0.72, s1, depth * 0.48);
      b.jar(w * 0.55, s2 + 0.03, depth * 0.45);
      if (w >= 0.6) b.jar(w * 0.65, s2 + 0.03, depth * 0.45);
    } else if (type === "napa") {
      const hz = 0.1;
      b.carcass(carcassBoxes(w, ub + hz, ut - ub - hz, depth, { shelves: [ub + hz + (ut - ub - hz) * 0.5] }));
      b.body(boxes([[0.002, ub, 0.0, w - 0.002, ub + hz, depth - 0.006]]), mats.trim);
      // LED spots under the hood
      for (const sx of [0.3, 0.7]) {
        const spot = b.piece("spot", () => new THREE.CylinderGeometry(0.018, 0.018, 0.002, 20), mats.led, w * sx, ub - 0.001, depth * 0.45, m.body, false);
        spot.receiveShadow = false;
      }
    } else if (type === "mikrovalna") {
      b.carcass(carcassBoxes(w, ub, ut - ub, depth));
    } else if (type === "cjedilo") {
      // no bottom: the drainer drips into the sink below
      b.carcass(carcassBoxes(w, ub, ut - ub, depth, { bottom: false }));
      const z0 = 0.04;
      const z1 = depth - 0.03;
      for (const [yy, kind] of [
        [ub + 0.04, "plates"],
        [ub + (ut - ub) * 0.55, "cups"],
      ] as const) {
        b.body(boxes(wireRack(T + 0.01, w - T - 0.01, yy, z0, z1, Math.round(w / 0.03), 0.003)), mats.brushed);
        if (kind === "plates") {
          for (let k = 0; k < Math.min(8, Math.floor((w - 0.1) / 0.035)); k++) {
            const pl = b.piece("plate:upright", () => new THREE.CylinderGeometry(0.11, 0.11, 0.012, 28), mats.ceramic, T + 0.06 + k * 0.035, yy + 0.115, depth * 0.5);
            pl.rotation.z = Math.PI / 2;
          }
        } else {
          for (let k = 0; k < Math.min(5, Math.floor((w - 0.1) / 0.09)); k++) b.jar(T + 0.07 + k * 0.09, yy + 0.003, depth * 0.5);
        }
      }
    } else {
      const shelves = type === "vitrina" || type === "klapna2" ? [] : [ub + (ut - ub) * 0.5];
      b.carcass(carcassBoxes(w, ub, ut - ub, depth, { shelves }));
      if (type === "vitrina") {
        // glass shelves and the inner LED: on unless the kitchen / the element says otherwise (KitchenConfig.glass)
        if (b.glassShelves) {
          for (const f of [0.34, 0.67]) {
            b.body(boxes([[T + 0.004, ub + (ut - ub) * f, 0.02, w - T - 0.004, ub + (ut - ub) * f + 0.006, depth - 0.02]]), mats.glassShelf);
          }
        }
        if (b.glassLed) b.ledInner(T + 0.02, w - T - 0.02, ut - T, depth - 0.05);
        // a few glasses on the shelves (on the bottom without shelves)
        const gy = b.glassShelves ? ub + (ut - ub) * 0.34 + 0.006 : ub + T;
        for (let k = 0; k < Math.floor((w - 0.08) / 0.11); k++) b.jar(T + 0.07 + k * 0.11, gy, depth * 0.5);
      }
      if (type === "klapna2") b.body(boxes([[T + 0.004, ub + (ut - ub) * 0.5, 0.02, w - T - 0.004, ub + (ut - ub) * 0.5 + T, depth - 0.03]], [b.ox, 0, 0]), ctx.carcass, true);
    }
  }

  if (type === "nisa" || type === "polica") return;

  if (corner) {
    const blind = 0.35;
    const fill = 0.05;
    const doorW = w - blind - fill;
    const glass = type === "vitrina";
    if (corner === "left") {
      b.fixedPanel(blind + 0.0045, blind + fill - G, y0 + G, ut - G, fz);
      b.door(blind + fill, w, y0, ut, fz, "right", "bottom", 0, glass);
    } else {
      b.fixedPanel(doorW + G, doorW + fill - 0.0045, y0 + G, ut - G, fz);
      b.door(0, doorW, y0, ut, fz, "left", "bottom", 0, glass);
    }
    return;
  }

  switch (type) {
    case "klapna":
      b.flap(y0, ut, fz);
      break;
    case "klapna2":
      b.biFold(y0, ut, fz);
      break;
    case "vitrina":
      b.doors(y0, ut, fz, "bottom", true);
      break;
    case "napa": {
      const hz = 0.1;
      if (w > 0.62) {
        b.door(0, w / 2, ub + hz, ut, fz, "left", "bottom");
        b.door(w / 2, w, ub + hz, ut, fz, "right", "bottom", 0.08);
      } else b.door(0, w, ub + hz, ut, fz, ctx.hinge, "bottom");
      const vh = hz + lip - 2 * G;
      const h = b.holder("visor", w / 2, y0 + G + vh / 2, fz, 0.16, 0.25);
      b.panel(h, w - 2 * G, vh, 0, 0, w / 2, y0 + G + vh / 2, fz);
      break;
    }
    case "mikrovalna": {
      const mh = Math.min(0.39, (ut - ub) * 0.56);
      b.microwave(ub, ub + mh, fz, 0.15, depth, includeBody);
      b.flap(ub + mh, ut, fz);
      break;
    }
    default:
      b.doors(y0, ut, fz, "bottom");
  }
}

// ---------------------------------------------------------------- new elements (vitrines, wine, end units, shelves, coffee)

/** module-local worktop surface (the module stands h.lift higher): the carcass top + the worktop's thickness */
function workY(ctx: BuildCtx): number {
  return TOP_Y + (ctx.h?.worktopT ?? D.worktopT);
}

/** the x range an end unit draws over (module-local m): its slot, and on its end side the run's end panel it took over */
function endSpan(b: Mod): { x0: number; x1: number; side: "left" | "right" | null } {
  const e = b.m.slot.end;
  const pad = e ? e.pad / 100 : 0;
  return { x0: e?.side === "left" ? -pad : 0, x1: e?.side === "right" ? b.w + pad : b.w, side: e?.side ?? null };
}

/**
 * A thick side panel (catalog "bocna" / "bocna-radna" / "bocna-rebrasta") from y0 to y1, `depth` deep: in the front
 * colour, or (stone) in the worktop material — the worktop running down to the floor at the end of the run. The fluted one
 * has vertical ribs on its outer side (at a free end) and across its front. 1 mm in from a neighbour (no shared face).
 */
function sidePanel(b: Mod, y0: number, y1: number, depth: number, look: { stone?: boolean; ribs?: boolean }): void {
  const { m, ctx } = b;
  const { x0, x1, side } = endSpan(b);
  const a = x0 + (side === "left" ? 0 : 0.001);
  const c = x1 - (side === "right" ? 0 : 0.001);
  if (look.stone && ctx.top) m.tops.push(b.body(boxes([[a, y0, 0.002, c, y1, depth]], [b.ox, 0, 0]), ctx.top));
  else m.panels.push(b.body(boxes([[a, y0, 0.002, c, y1, depth]], [b.ox, 0, 0]), ctx.front));
  if (!look.ribs) return;
  const ribs: BoxSpec[] = [];
  if (side) {
    // ribs along the outer side, every 2,5 cm
    const xf = side === "left" ? a : c;
    for (let z = 0.03; z < depth - 0.03; z += 0.025) ribs.push(side === "left" ? [xf - 0.006, y0 + 0.002, z, xf, y1 - 0.002, z + 0.014] : [xf, y0 + 0.002, z, xf + 0.006, y1 - 0.002, z + 0.014]);
  }
  const n = Math.max(1, Math.floor((c - a) / 0.02));
  const step = (c - a - 0.004) / n;
  for (let i = 0; i < n; i++) {
    const x = a + 0.002 + i * step + step * 0.15;
    ribs.push([x, y0 + 0.002, depth, x + step * 0.7, y1 - 0.002, depth + 0.005]);
  }
  m.panels.push(b.body(boxes(ribs, [b.ox, 0, 0]), ctx.front));
}

/**
 * Open shelves that end the run (catalog "police-zaobljene" / "-kose", "polica-zaobljena" / "-kosa"): at a free end
 * (PlanSlot.end) their boards are rounded / cut at an angle towards the outside, over the end panel they took over;
 * anywhere else plain straight open shelves. Front colour; a back panel; boards at `ys` (bottom faces).
 */
function endShelves(b: Mod, shape: "round" | "angled", ys: number[], y0: number, y1: number, depth: number): void {
  const { m, ctx, w } = b;
  const { x0, x1, side } = endSpan(b);
  if (!side) {
    b.openCarcass(carcassBoxes(w, y0, y1 - y0, depth, { shelves: ys.slice(1, -1) }));
    return;
  }
  const outer = side === "left" ? x0 : x1;
  const inner = side === "left" ? x1 - 0.001 : 0.001;
  const sg = outer > inner ? 1 : -1;
  const span = Math.abs(outer - inner);
  const pts: [number, number][] = [
    [inner, 0.004],
    [outer, 0.004],
  ];
  if (shape === "round") {
    const R = Math.min(span, depth) * 0.98;
    const cx = outer - sg * R;
    const cz = depth - R;
    for (let k = 0; k <= 12; k++) {
      const a = ((Math.PI / 2) * k) / 12;
      pts.push([cx + sg * R * Math.cos(a), cz + R * Math.sin(a)]);
    }
  } else pts.push([outer, depth * 0.35]);
  pts.push([inner, depth]);
  for (const y of ys) m.panels.push(b.body(boardGeo(pts, y, y + T), ctx.front));
  // the back panel between the boards
  m.panels.push(b.body(boxes([[Math.min(inner, outer), y0, 0, Math.max(inner, outer), y1, 0.004]], [b.ox, 0, 0]), ctx.front));
  // a few things on the boards
  const mid = (inner + outer) / 2;
  if (ys.length > 2) b.vase(mid, ys[1] + T, depth * 0.45);
  b.jar(inner + (outer - inner) * 0.3, ys[0] + T, depth * 0.4);
}

/** a wine rack: an open carcass in the front colour with a grid of cubbies, bottles lying in most of them (necks out) */
function wineRack(b: Mod, y0: number, y1: number, depth: number): void {
  const { w } = b;
  b.openCarcass(carcassBoxes(w, y0, y1 - y0, depth));
  const ix0 = T + 0.001;
  const ix1 = w - T - 0.001;
  const iy0 = y0 + T;
  const iy1 = y1 - T;
  const cols = Math.max(1, Math.round((ix1 - ix0) / 0.105));
  const rows = Math.max(1, Math.round((iy1 - iy0) / 0.105));
  const cw = (ix1 - ix0) / cols;
  const ch = (iy1 - iy0) / rows;
  const t = 0.01;
  const grid: BoxSpec[] = [];
  for (let i = 1; i < cols; i++) grid.push([ix0 + i * cw - t / 2, iy0 + 0.0005, 0.02, ix0 + i * cw + t / 2, iy1 - 0.0005, depth - 0.012]);
  for (let j = 1; j < rows; j++) grid.push([ix0 + 0.0005, iy0 + j * ch - t / 2, 0.021, ix1 - 0.0005, iy0 + j * ch + t / 2, depth - 0.013]);
  if (grid.length) b.openCarcass(grid);
  const len = Math.min(0.3, depth - 0.04);
  if (cw < 0.08 || ch < 0.08) return;
  for (let i = 0; i < cols; i++) {
    for (let j = 0; j < rows; j++) {
      if ((i * 7 + j * 3) % 5 === 0) continue;
      const bt = b.piece(`bottle:lying:${len.toFixed(3)}`, () => bottleGeo(len), b.mats.bottle, ix0 + (i + 0.5) * cw, iy0 + j * ch + t / 2 + 0.038, depth - len - 0.02, b.m.body, false);
      bt.rotation.x = Math.PI / 2;
    }
  }
}

/** the lathe of a wine bottle `len` m long (base at y 0) */
function bottleGeo(len: number): THREE.BufferGeometry {
  return new THREE.LatheGeometry(
    [
      new THREE.Vector2(0.0001, 0),
      new THREE.Vector2(0.034, 0),
      new THREE.Vector2(0.036, 0.01),
      new THREE.Vector2(0.036, len * 0.62),
      new THREE.Vector2(0.014, len * 0.8),
      new THREE.Vector2(0.012, len),
      new THREE.Vector2(0.0001, len),
    ],
    18,
  );
}

/** a door that turns open and then slides back into the carcass beside its hinge (pocket door of the coffee nook) */
function pocketDoor(b: Mod, x0: number, x1: number, y0: number, y1: number, fz: number, hinge: "left" | "right", delay: number): void {
  const fw = x1 - x0 - 2 * G;
  const fh = y1 - y0 - 2 * G;
  const px = hinge === "left" ? x0 + G + 0.004 : x1 - G - 0.004;
  const h = b.holder("pocket", px, (y0 + y1) / 2, fz, hinge === "left" ? -Math.PI / 2 : Math.PI / 2, delay);
  b.lastHolder().dz = -(fw - 0.03);
  const p = b.panel(h, fw, fh, hinge === "left" ? fw / 2 - 0.004 : -fw / 2 + 0.004, 0, (x0 + x1) / 2, (y0 + y1) / 2, fz);
  b.grip(p, fw, fh, { edge: "mid", free: hinge === "left" ? fw / 2 - 0.035 : -fw / 2 + 0.035 });
}

/** base elements beyond the classic set; false = not one of them */
function buildBaseExtra(b: Mod, includeBody: boolean, yb: number, yt: number, fz: number): boolean {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const mats = ctx.mats;
  const H = TOP_Y - D.plinth;
  switch (type) {
    case "vitrina": {
      if (includeBody) {
        b.plinth();
        b.carcass(carcassBoxes(w, D.plinth, D.baseH, D.carcass));
        if (b.glassShelves) b.body(boxes([[T + 0.004, D.plinth + H * 0.5, 0.02, w - T - 0.004, D.plinth + H * 0.5 + 0.006, D.carcass - 0.02]]), mats.glassShelf);
        if (b.glassLed) b.ledInner(T + 0.02, w - T - 0.02, TOP_Y - T, D.carcass - 0.05);
        b.plates(w / 2, D.plinth + T, D.carcass * 0.5, 3);
        if (b.glassShelves) for (let k = 0; k < Math.floor((w - 0.08) / 0.11); k++) b.jar(T + 0.07 + k * 0.11, D.plinth + H * 0.5 + 0.006, D.carcass * 0.5);
      }
      if (ctx.handles === "bez") m.fronts.add(mesh(boxes([[0, yt + 0.001, D.carcass - 0.03, w, TOP_Y - 0.001, D.carcass + 0.001]]), mats.gola, false, true));
      b.doors(yb, yt, fz, "top", true);
      return true;
    }
    case "vinoteka":
      if (includeBody) wineRack(b, D.plinth, TOP_Y, D.carcass + D.frontOff + FT);
      return true;
    case "police-zaobljene":
    case "police-kose":
      if (includeBody) {
        endShelves(b, type === "police-zaobljene" ? "round" : "angled", [D.plinth, D.plinth + H * 0.36, D.plinth + H * 0.68, TOP_Y - T], D.plinth, TOP_Y, D.carcass + D.frontOff + FT);
        // the plinth under the back of the boards
        const { x0, x1 } = endSpan(b);
        const pl = b.body(boxes([[x0 + 0.002, 0, 0.03, x1 - 0.002, D.plinth - 0.002, BASE_FACE * 0.5]], [b.ox, 0, 0]), ctx.plinth);
        m.plinths.push(pl);
      }
      return true;
    case "bocna":
    case "bocna-radna":
    case "bocna-rebrasta":
      if (includeBody) sidePanel(b, 0, TOP_Y, BASE_FACE, { stone: type === "bocna-radna", ribs: type === "bocna-rebrasta" });
      return true;
    default:
      return false;
  }
}

/** wall units beyond the classic set; false = not one of them */
function buildUpperExtra(b: Mod, includeBody: boolean, ub: number, ut: number, y0: number): boolean {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const depth = D.upperCarcass;
  switch (type) {
    case "police-visece": {
      if (!includeBody) return true;
      // floating shelves: 1–3 boards on hidden brackets, an LED strip under each (ElementOpts.rows / led)
      const rows = Math.max(1, Math.min(3, ctx.opt?.rows ?? 2));
      const H = ut - ub;
      const ys = rows === 1 ? [ub + H * 0.15] : rows === 2 ? [ub + H * 0.08, ub + H * 0.6] : [ub + H * 0.06, ub + H * 0.4, ub + H * 0.74];
      const t = 0.04;
      const d = 0.27;
      // at a free end of the row the boards run on over the end panel they took over (no panel beside floating shelves)
      const { x0, x1, side } = endSpan(b);
      const a = x0 + (side === "left" ? 0 : 0.002);
      const c = x1 - (side === "right" ? 0 : 0.002);
      m.panels.push(b.body(boxes(ys.map((y): BoxSpec => [a, y, 0.004, c, y + t, d]), [b.ox, 0, 0]), ctx.front));
      ys.forEach((y, i) => {
        if (ctx.opt?.led !== false) b.ledInner(0.04, w - 0.04, y - 0.001, d - 0.05);
        if (i === 0) b.plates(Math.max(w * 0.3, 0.115), y + t, d * 0.5, 3);
        else b.jar(w * 0.55, y + t, d * 0.45);
        if (i === ys.length - 1 && w >= 0.45) b.plantPot(w * 0.75, y + t, d * 0.48);
      });
      return true;
    }
    case "vinoteka":
      if (includeBody) wineRack(b, ub, ut, depth + D.frontOff + FT);
      return true;
    case "polica-zaobljena":
    case "polica-kosa":
      if (includeBody) endShelves(b, type === "polica-zaobljena" ? "round" : "angled", [ub, ub + (ut - ub) * 0.5 - T / 2, ut - T], ub, ut, depth + D.frontOff + FT);
      return true;
    case "bocna":
    case "bocna-rebrasta": {
      // up through a "do stropa" top row and the cornice: the panel ends the whole stack
      const h = ctx.h;
      const top = h?.cornice ? h.cornice.y1 : h?.topRow ? h.topRow.y1 : ut;
      if (includeBody) sidePanel(b, ub, top, UPPER_FACE, { ribs: type === "bocna-rebrasta" });
      // its lip below the carcass (Gola / luft) goes with the fronts — rebuilt when the opening style changes — in front
      // of the backsplash, not in the stone
      if (ub - y0 > 1e-6) {
        const { x0, x1, side } = endSpan(b);
        const me = mesh(boxes([[x0 + (side === "left" ? 0 : 0.001), y0, D.backsplashT + 0.0005, x1 - (side === "right" ? 0 : 0.001), ub, UPPER_FACE]], [b.ox, 0, 0]), ctx.front);
        m.fronts.add(me);
        m.panels.push(me);
      }
      return true;
    }
    default:
      return false;
  }
}

/** tall elements beyond the classic set; false = not one of them. y0 / y1: the unit's bottom / top (module-local) */
function buildTallExtra(b: Mod, includeBody: boolean, y0: number, y1: number, fz: number): boolean {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const mats = ctx.mats;
  const H = y1 - y0;
  const hinge = ctx.tallHinge;
  const lit = ctx.opt?.led !== false;
  // the worktop surface, module-local (a niche at worktop height)
  const wy = workY(ctx);
  switch (type) {
    case "vitrina": {
      if (includeBody) {
        b.plinth();
        b.carcass(carcassBoxes(w, y0, H, D.carcass));
        const levels = [0.22, 0.42, 0.62, 0.8].map((f) => y0 + H * f);
        if (b.glassShelves) b.body(boxes(levels.map((y): BoxSpec => [T + 0.004, y, 0.02, w - T - 0.004, y + 0.006, D.carcass - 0.02])), mats.glassShelf);
        if (b.glassLed) b.ledInner(T + 0.02, w - T - 0.02, y1 - T, D.carcass - 0.05);
        for (const y of b.glassShelves ? levels.slice(0, 3) : [y0 + T]) {
          for (let k = 0; k < Math.floor((w - 0.08) / 0.11); k++) b.jar(T + 0.07 + k * 0.11, y + 0.006, D.carcass * 0.5);
        }
      }
      b.doors(y0, y1, fz, "mid", true);
      return true;
    }
    case "police": {
      if (includeBody) {
        b.plinth();
        const shelves = [0.2, 0.4, 0.6, 0.8].map((f) => y0 + H * f);
        b.openCarcass(carcassBoxes(w, y0, H, D.carcass + D.frontOff + FT, { shelves }));
        if (lit) b.ledInner(0.04, w - 0.04, y1 - T, D.carcass - 0.05);
        b.plates(w / 2, shelves[1] + T, D.carcass * 0.55, 4);
        if (w >= 0.4) b.vase(w * 0.5, shelves[2] + T, D.carcass * 0.5);
        b.books(T + 0.02, shelves[3] + T, D.carcass * 0.2, D.carcass * 0.85);
      }
      return true;
    }
    case "vinoteka":
      if (includeBody) {
        b.plinth();
        wineRack(b, y0, y1, D.carcass + D.frontOff + FT);
        if (lit) b.ledInner(0.04, w - 0.04, y1 - T, D.carcass - 0.05);
      }
      return true;
    case "ormar-nisa":
    case "kava": {
      // an open niche at worktop height (the coffee nook's behind pocket doors), drawers / a door below, a door above
      const coffee = type === "kava";
      const n0 = Math.min(Math.max(y0 + 0.5, wy), y1 - 0.75);
      const n1 = Math.min(n0 + (coffee ? 0.55 : 0.45), y1 - 0.22);
      if (includeBody) {
        b.plinth();
        b.carcass(carcassBoxes(w, y0, H, D.carcass, { shelves: [n0 - T, n1, n1 + (y1 - n1) * 0.5] }));
        // the niche: a front-coloured floor and back, LED under its top
        m.panels.push(b.body(boxes([[T + 0.001, n0, 0.02, w - T - 0.001, n0 + 0.004, D.carcass - 0.004]], [b.ox, 0, 0]), ctx.front));
        if (lit || coffee) b.ledInner(T + 0.03, w - T - 0.03, n1 - 0.001, D.carcass - 0.08);
        if (coffee) {
          // the coffee machine and two cups
          const cw = Math.min(0.3, w - 0.16);
          b.body(boxes([[w / 2 - cw / 2, n0 + 0.004, 0.06, w / 2 + cw / 2, n0 + 0.38, 0.44]]), mats.blackGlass);
          b.body(boxes([[w / 2 - cw / 2 + 0.02, n0 + 0.3, 0.44, w / 2 + cw / 2 - 0.02, n0 + 0.34, 0.442]]), mats.display);
          b.jar(w / 2 + cw / 2 + 0.06 < w - T - 0.04 ? w / 2 + cw / 2 + 0.06 : w / 2, n0 + 0.004, 0.4);
        } else b.vase(w / 2, n0 + 0.004, D.carcass * 0.5);
      }
      if (coffee) {
        b.drawer(0, w, y0 + (n0 - y0) * 0.5, n0 - T, fz, 0.47, 0.18);
        b.drawer(0, w, y0, y0 + (n0 - y0) * 0.5, fz, 0.47, 0.28);
        if (w > 0.62) {
          pocketDoor(b, 0, w / 2, n0 - T, n1 + T, fz, "left", 0);
          pocketDoor(b, w / 2, w, n0 - T, n1 + T, fz, "right", 0.06);
        } else pocketDoor(b, 0, w, n0 - T, n1 + T, fz, hinge, 0);
      } else b.door(0, w, y0, n0 - T, fz, hinge, "top", 0.1);
      b.door(0, w, n1 + T, y1, fz, hinge, "bottom", 0.2);
      return true;
    }
    case "bocna":
    case "bocna-rebrasta": {
      // up to the top of the column, its top box and cornice included (buildHeightExtras leaves it alone)
      const h = ctx.h;
      const top = h ? (h.cornice ? h.cornice.y1 : h.tallTop) - h.lift : y1;
      if (includeBody) sidePanel(b, 0, top, BASE_FACE, { ribs: type === "bocna-rebrasta" });
      return true;
    }
    default:
      return false;
  }
}

/** is this tall type the side-by-side fridge niche (catalog SBS)? */
export const isSbs = (type: string) => type === "hladnjak-sbs" || type === "hladnjak-sbs-vrata";

/**
 * Side-by-side fridge niche (catalog SBS, one slot of SBS.niche cm), as a carpenter builds it around a freestanding
 * side-by-side: full-height side panels in the front colour, flush with the tall units' fronts; the appliance standing
 * in the niche with its body a little proud of them and its two full-height doors (appliance finish, long vertical bar
 * handles, a dispenser on the freezer door) IN FRONT of the cabinet front plane; and a bridge cabinet between the panels,
 * 60 cm deep with its front flush with the column, from the line of an integrated fridge's top door (at least
 * SBS.topGap above the appliance) up to the column's top line — a lift-up flap ("hladnjak-sbs"; two flaps when it is
 * taller than 60 cm) or two doors ("hladnjak-sbs-vrata"), with the column's 3 mm reveals.
 * Demo: both appliance doors swing open, then the bridge opens.
 */
function buildSbs(b: Mod, includeBody: boolean, y1: number): void {
  const { ctx, m, w } = b;
  const mats = ctx.mats;
  const cmm = (v: number) => v / 100;
  const P = cmm(SBS.panel);
  const gap = cmm(SBS.gap);
  const aw = Math.min(cmm(SBS.appliance), w - 2 * P - 2 * gap);
  const ax0 = (w - aw) / 2;
  const ax1 = ax0 + aw;
  // the appliance and its panels stand on the floor, also when the column is lifted for an 85 / 95 cm worktop
  const f0 = -(ctx.h?.lift ?? 0);
  const aTop = Math.min(f0 + cmm(SBS.applianceHeight), y1 - 0.2);
  // panels flush with the fronts; the body a little proud of them; the doors in front
  const pd = BASE_FACE;
  const zBody0 = 0.035;
  const zBody = cmm(SBS.bodyDepth);
  const doorT = cmm(SBS.doorDepth);
  const zDoor = zBody + 0.003 + doorT;
  // the bridge's lower edge: on the line of an integrated fridge's top door in the same column (buildTall), never
  // closer than SBS.topGap above the appliance
  const y0 = D.plinth;
  const Hc = y1 - y0;
  const fridgeLine = y1 - Math.max(0.2, Hc - Math.min(0.72, Hc * 0.34) - 1.02);
  const bridge0 = Math.min(Math.max(aTop + cmm(SBS.topGap), fridgeLine), y1 - 0.12);
  const split = ax0 + aw * 0.44;
  const fz = BASE_FZ;

  if (includeBody) {
    // side panels (bočne obloge) floor to the column's top line, as deep as the tall units
    b.openCarcass([
      [0.001, f0, 0, P, y1, pd],
      [w - P, f0, 0, w - 0.001, y1, pd],
    ]);
    // the appliance: body (its front ~1 cm proud of the panels), feet and a dark ventilation grille at the bottom
    b.body(boxes([[ax0, f0 + 0.012, zBody0, ax1, aTop, zBody]]), mats.appliance);
    b.body(boxes([[ax0 + 0.02, f0, zBody - 0.02, ax1 - 0.02, f0 + 0.012, zBody + 0.002]]), mats.trim);
    // interior (seen with the doors open): white liner, a divider, glass shelves on the fridge side,
    // baskets on the freezer side, and a cool light strip at the top of each compartment
    const ix0 = ax0 + 0.025;
    const ix1 = ax1 - 0.025;
    const iy0 = f0 + 0.09;
    const iy1 = aTop - 0.06;
    const iz0 = zBody0 + 0.05;
    const iz1 = zBody + 0.002;
    b.body(boxes(hollow(ix0, iy0, iz0, ix1, iy1, iz1, 0.012)), mats.liner);
    b.body(boxes([[split - 0.012, iy0, iz0, split + 0.012, iy1, iz1]]), mats.liner);
    const shelves: BoxSpec[] = [];
    for (const f of [0.22, 0.42, 0.62, 0.8]) {
      const yy = iy0 + (iy1 - iy0) * f;
      shelves.push([split + 0.014, yy, iz0 + 0.02, ix1 - 0.014, yy + 0.006, iz1 - 0.02]);
    }
    b.body(boxes(shelves), mats.glassShelf);
    const baskets: BoxSpec[] = [];
    for (const f of [0.08, 0.36, 0.64]) {
      const yy = iy0 + (iy1 - iy0) * f;
      baskets.push(...tray(ix0 + 0.014, yy, iz0 + 0.03, split - 0.014, yy + 0.16, iz1 - 0.04, 0.005));
    }
    b.body(boxes(baskets), mats.drawer);
    const light: BoxSpec[] = [
      [ix0 + 0.03, iy1 - 0.014, iz0 + 0.04, split - 0.03, iy1 - 0.012 + 0.002, iz0 + 0.16],
      [split + 0.04, iy1 - 0.014, iz0 + 0.04, ix1 - 0.04, iy1 - 0.012 + 0.002, iz0 + 0.16],
    ];
    const lm = mesh(boxes(light), mats.fridgeLight, false, false);
    m.body.add(lm);
    // the air gap above the appliance stays dark; the bridge cabinet carcass between the panels, like the column
    b.body(boxes([[ax0, aTop, zBody0, ax1, bridge0 - 0.002, 0.04]]), mats.trim);
    if (y1 - bridge0 > 0.1) b.carcass(carcassBoxes(w - 2 * P, bridge0, y1 - bridge0, D.carcass).map((bx) => [bx[0] + P, bx[1], bx[2], bx[3] + P, bx[4], bx[5]] as BoxSpec));
  }

  // appliance doors in front of the cabinet front plane: hinged on the outer sides, bar handles at the split
  const dy0 = f0 + 0.03;
  const doorH = aTop - dy0;
  const leaf = (x0: number, x1: number, hinge: "left" | "right", delay: number, dispenser: boolean) => {
    const fw = x1 - x0 - 0.003;
    const px = hinge === "left" ? x0 : x1;
    const h = b.holder("door", px, dy0 + doorH / 2, zDoor, hinge === "left" ? -1.45 : 1.45, delay);
    const lx = hinge === "left" ? fw / 2 : -fw / 2;
    const door = mesh(boxes([[-fw / 2, -doorH / 2, -doorT, fw / 2, doorH / 2, 0]]), mats.appliance);
    door.position.set(lx, 0, 0);
    h.add(door);
    // inner door bins (swing with the door; closed, they sit inside the body)
    const bins: BoxSpec[] = [];
    for (const f of [0.2, 0.45, 0.7]) {
      const yy = -doorH / 2 + doorH * f;
      // (inset so that, closed, their sides are not in one plane with the freezer baskets inside)
      bins.push(...tray(-fw / 2 + 0.043, yy, -doorT - 0.09, fw / 2 - 0.043, yy + 0.07, -doorT, 0.004));
    }
    const bm = mesh(boxes(bins), mats.liner);
    bm.position.set(lx, 0, 0);
    h.add(bm);
    // vertical bar handle on the free edge, standing off the door
    const free = hinge === "left" ? fw / 2 - 0.03 : -fw / 2 + 0.03;
    const L = Math.min(1.1, doorH * 0.62);
    const hd = cmm(SBS.handleDepth);
    const bar = mesh(
      boxes([
        [free - 0.009, -L / 2, hd - 0.014, free + 0.009, L / 2, hd],
        [free - 0.006, -L / 2 + 0.03, 0, free + 0.006, -L / 2 + 0.045, hd - 0.014],
        [free - 0.006, L / 2 - 0.045, 0, free + 0.006, L / 2 - 0.03, hd - 0.014],
      ]),
      mats.brushed,
    );
    bar.position.set(lx, 0.05, 0);
    h.add(bar);
    if (dispenser) {
      // water / ice dispenser in the freezer door
      const dx = lx + (hinge === "left" ? fw * 0.05 : -fw * 0.05);
      const disp = mesh(boxes([[-0.075, -0.15, 0.0005, 0.075, 0.13, 0.003]]), mats.blackGlass, false, true);
      disp.position.set(dx, doorH * 0.08, 0);
      h.add(disp);
      const scr = mesh(boxes([[-0.03, 0.09, 0.003, 0.03, 0.11, 0.0035]]), mats.display, false, false);
      scr.position.set(dx, doorH * 0.08, 0);
      h.add(scr);
    }
  };
  leaf(ax0, split, "left", 0, true);
  leaf(split, ax1, "right", 0.1, false);

  // bridge cabinet front(s): flush with the column's fronts, the column's reveals
  if (y1 - bridge0 > 0.1) {
    const x0 = P;
    const x1 = w - P;
    if (m.slot.type === "hladnjak-sbs-vrata") {
      const mid = (x0 + x1) / 2;
      b.door(x0, mid, bridge0, y1, fz, "left", "bottom", 0.35);
      b.door(mid, x1, bridge0, y1, fz, "right", "bottom", 0.43);
    } else {
      // a lift-up flap; a tall bridge (a high column) gets two, so neither is taller than about 60 cm
      const rows = y1 - bridge0 > 0.62 ? 2 : 1;
      const rh = (y1 - bridge0) / rows;
      for (let r = 0; r < rows; r++) {
        const ya = bridge0 + r * rh;
        const yb = ya + rh;
        const fw = x1 - x0 - 2 * G;
        const fh = yb - ya - 2 * G;
        const h = b.holder("flap", (x0 + x1) / 2, yb - G, fz, -1.68, 0.35 + r * 0.1);
        const p = b.panel(h, fw, fh, 0, -fh / 2, (x0 + x1) / 2, (ya + yb) / 2, fz);
        b.grip(p, fw, fh, { edge: "bottom" });
      }
    }
  }
  m.anchor.set(w / 2, Math.min(1.4, aTop * 0.75), zDoor);
}

function buildTall(b: Mod, includeBody: boolean): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const y0 = D.plinth;
  const y1 = ctx.ut;
  const H = y1 - y0;
  const fz = BASE_FZ;
  const hinge = ctx.tallHinge;
  const mats = ctx.mats;
  if (isSbs(type)) {
    buildSbs(b, includeBody, y1);
    return;
  }
  // the new elements: vitrine, open shelves, wine column, coffee nook, LED niche, side panels
  if (buildTallExtra(b, includeBody, y0, y1, fz)) return;

  const freezer = Math.min(0.72, H * 0.34);
  const top = Math.max(0.2, H - freezer - 1.02);
  const fridge = H - freezer - top;

  const drawerH = Math.min(0.29, H * 0.14);
  const ovenH = 0.595;
  const strip = 0.09;
  const ovenY0 = y0 + 2 * drawerH;
  const ovenY1 = Math.min(y1 - 0.2, ovenY0 + ovenH);
  // oven + microwave column
  const microH = 0.38;
  const microY0 = ovenY1;
  const microY1 = Math.min(y1 - 0.12, microY0 + microH);
  const washerH = 0.85;

  if (includeBody) {
    b.plinth();
    const shelves =
      type === "pecnica"
        ? [ovenY1 + (y1 - ovenY1) * 0.5]
        : type === "ormar"
          ? [0.2, 0.4, 0.6, 0.8].map((f) => y0 + H * f)
          : type === "metle"
            ? [y1 - 0.36]
            : type === "perilica-rublja"
              ? [y0 + washerH + 0.02, y0 + washerH + (H - washerH) * 0.5]
              : type === "pecnica-mikro" && microY1 < y1 - 0.15
                ? [microY1 + 0.002]
                : [];
    b.carcass(carcassBoxes(w, y0, H, D.carcass, { shelves }));
    if (type === "hladnjak") {
      const x0 = T + 0.006;
      const x1 = w - T - 0.006;
      const yl0 = y0 + T + 0.006;
      // top edge kept well below the door reveal so the white liner never shows through it
      const yl1 = y0 + freezer + fridge - 0.07;
      // the appliance sits a few cm behind the fronts, so the 3 mm reveals stay dark
      const zl = D.carcass - 0.045;
      b.body(boxes(hollow(x0, yl0, 0.03, x1, yl1, zl, 0.012)), mats.liner);
      // divider between freezer and fridge + glass shelves
      b.body(boxes([[x0, y0 + freezer - 0.09, 0.03, x1, y0 + freezer - 0.07, zl]]), mats.liner);
      for (const f of [0.28, 0.55, 0.8]) {
        const yy = y0 + freezer + fridge * f;
        b.body(boxes([[x0 + 0.012, yy, 0.05, x1 - 0.012, yy + 0.005, zl - 0.02]]), mats.glassShelf);
      }
      // cabinet shelf above the appliance + dark door seals behind each reveal
      const top0 = y0 + freezer + fridge;
      b.carcass([[T + 0.001, top0 - T / 2, 0.02, w - T - 0.001, top0 + T / 2, D.carcass - 0.002]]);
      b.body(
        boxes([
          [x0, y0 + freezer - 0.014, zl, x1, y0 + freezer + 0.014, D.carcass - 0.003],
          [x0, top0 - 0.03, zl, x1, top0 - T / 2, D.carcass - 0.003],
        ]),
        mats.trim,
      );
    }
    if (type === "pecnica" || type === "pecnica-mikro") b.ovenCavity(ovenY0, ovenY1 - strip);
    if (type === "perilica-rublja") {
      // the washing machine behind the lower door: white body, steel porthole ring, dark glass
      const mx0 = T + 0.012;
      const mx1 = w - T - 0.012;
      b.body(boxes([[mx0, y0 + T, 0.03, mx1, y0 + washerH - 0.02, D.carcass - 0.04]]), mats.appliancePlastic);
      const cx = (mx0 + mx1) / 2;
      const cy = y0 + washerH * 0.5;
      const ring = b.piece("washer:ring", () => new THREE.TorusGeometry(0.16, 0.022, 12, 40), mats.steel, cx, cy, D.carcass - 0.04);
      ring.castShadow = false;
      b.piece("washer:glass", () => new THREE.CircleGeometry(0.15, 40), mats.blackGlass, cx, cy, D.carcass - 0.041, m.body, false);
      b.body(boxes([[mx0 + 0.02, y0 + washerH - 0.13, D.carcass - 0.045, mx1 - 0.02, y0 + washerH - 0.05, D.carcass - 0.039]]), mats.trim);
    }
    if (type === "metle") {
      // broom, mop and a vacuum standing inside
      const z = D.carcass * 0.45;
      // up to 40 cm: broom and mop only, centred · 45–50 cm: broom head turned along the depth, vacuum beside it
      const narrow = w < 0.55;
      const bx = w < 0.42 ? w / 2 : narrow ? w * 0.3 : w * 0.25;
      b.piece("broom:stick", () => new THREE.CylinderGeometry(0.012, 0.012, 1.25, 12), mats.bookB, bx, y0 + T + 0.7, z);
      b.body(boxes([narrow ? [bx - 0.03, y0 + T, z - 0.13, bx + 0.03, y0 + T + 0.07, z + 0.13] : [bx - 0.13, y0 + T, z - 0.03, bx + 0.13, y0 + T + 0.07, z + 0.03]]), mats.trim);
      b.piece("broom:stick", () => new THREE.CylinderGeometry(0.012, 0.012, 1.25, 12), mats.steel, narrow ? bx : w * 0.42, y0 + T + 0.7, narrow ? z + 0.17 : z + 0.08);
      if (w >= 0.44) {
        const vx = narrow ? w * 0.68 : w * 0.62;
        // (a millimetre above the shelf: not in one plane with the broom head beside it)
        b.body(boxes([[vx - 0.1, y0 + T + 0.001, z - 0.12, vx + 0.1, y0 + T + 0.32, z + 0.14]]), mats.bin);
        b.piece("vac:hose", () => new THREE.TorusGeometry(0.09, 0.016, 10, 28), mats.trim, vx, y0 + T + 0.44, z);
      }
    }
  }

  switch (type) {
    case "hladnjak": {
      b.door(0, w, y0, y0 + freezer, fz, hinge, "top", 0.1);
      b.door(0, w, y0 + freezer, y0 + freezer + fridge, fz, hinge, "mid", 0);
      b.door(0, w, y0 + freezer + fridge, y1, fz, hinge, "bottom", 0.2);
      break;
    }
    case "pecnica": {
      b.drawer(0, w, y0 + drawerH, y0 + 2 * drawerH, fz, 0.47, 0.18);
      b.drawer(0, w, y0, y0 + drawerH, fz, 0.47, 0.28);
      b.controlStrip(ovenY1 - strip, ovenY1, fz);
      b.ovenDoor(ovenY0, ovenY1 - strip, fz);
      if (y1 - ovenY1 > 0.15) b.door(0, w, ovenY1, y1, fz, hinge, "bottom", 0.1);
      break;
    }
    case "pecnica-mikro": {
      b.drawer(0, w, y0 + drawerH, y0 + 2 * drawerH, fz, 0.47, 0.18);
      b.drawer(0, w, y0, y0 + drawerH, fz, 0.47, 0.28);
      b.controlStrip(ovenY1 - strip, ovenY1, fz);
      b.ovenDoor(ovenY0, ovenY1 - strip, fz);
      b.microwave(microY0, microY1, fz, 0.12, D.carcass, includeBody);
      if (y1 - microY1 > 0.12) b.door(0, w, microY1, y1, fz, hinge, "bottom", 0.22);
      break;
    }
    case "smocnica": {
      const h = b.holder("pull", w / 2, (y0 + y1) / 2, fz, 0.52, 0);
      const fw = w - 2 * G;
      const fh = H - 2 * G;
      const p = b.panel(h, fw, fh, 0, 0, w / 2, (y0 + y1) / 2, fz);
      b.grip(p, fw, fh, { edge: "mid", free: hinge === "left" ? fw / 2 - 0.035 : -fw / 2 + 0.035 });
      const bw = w - 2 * T - 0.04;
      const zb = -FT / 2 - 0.006;
      const zf = zb - 0.5;
      const list: BoxSpec[] = [[-0.006, -fh / 2 + 0.05, zf, 0.006, fh / 2 - 0.05, zf + 0.012]];
      const n = 5;
      for (let k = 0; k < n; k++) {
        const yy = -fh / 2 + 0.12 + ((fh - 0.3) * k) / (n - 1);
        list.push([-bw / 2, yy, zf, bw / 2, yy + 0.008, zb]);
        list.push([-bw / 2, yy, zf, -bw / 2 + 0.006, yy + 0.07, zb]);
        list.push([bw / 2 - 0.006, yy, zf, bw / 2, yy + 0.07, zb]);
      }
      h.add(mesh(boxes(list), mats.drawer));
      if (bw >= 0.2) {
        for (let k = 0; k < 3; k++) {
          const yy = -fh / 2 + 0.12 + ((fh - 0.3) * (k + 1)) / 4 + 0.008;
          b.jar(Math.max(-bw / 4, -bw / 2 + 0.05) + k * 0.03 * Math.min(1, bw / 0.3), yy, zf + 0.15 + k * 0.1, h);
        }
      } else {
        // 15–25 cm larder: slim spice jars in a row along the depth of every second shelf
        const r = Math.max(0.018, Math.min(0.03, bw / 2 - 0.008));
        const key = `spice:${r.toFixed(3)}`;
        for (const k of [0, 2, 4]) {
          const yy = -fh / 2 + 0.12 + ((fh - 0.3) * k) / (n - 1) + 0.008;
          for (let j = 0; j < 4; j++) b.piece(key, () => new THREE.CylinderGeometry(r, r, 0.11, 16), mats.glassShelf, 0, yy + 0.055, zf + 0.07 + j * 0.11, h, false);
        }
      }
      break;
    }
    case "metle":
      b.door(0, w, y0, y1, fz, hinge, "mid", 0);
      break;
    case "perilica-rublja":
      b.door(0, w, y0, y0 + washerH, fz, hinge, "top", 0);
      b.doors(y0 + washerH, y1, fz, "bottom");
      break;
    case "ormar":
    default:
      b.doors(y0, y1, fz, "mid");
  }
}

// ---------------------------------------------------------------- public

function newModule(slot: PlanSlot): ModuleRT {
  const root = new THREE.Group();
  root.position.x = slot.x / 100;
  root.name = slot.id;
  const body = new THREE.Group();
  const fronts = new THREE.Group();
  const extras = new THREE.Group();
  root.add(body, fronts, extras);
  const w = slot.width / 100;
  const ay = slot.zone === "upper" ? 1.83 : slot.zone === "tall" ? 1.4 : 0.62;
  const az = slot.zone === "upper" ? UPPER_FACE : BASE_FACE;
  return {
    slot,
    root,
    body,
    fronts,
    extras,
    wrappers: [],
    holders: [],
    panels: [],
    carcassMeshes: [],
    plinths: [],
    pickables: [],
    hole: null,
    leds: [],
    busy: false,
    anchor: new THREE.Vector3(w / 2, ay, az),
    frontZone: slot.zone,
    ghost: Boolean(moduleDef(slot.zone, slot.type)?.spacer),
    tops: [],
    open: "bez",
  };
}

function build(ctx: BuildCtx, m: ModuleRT, includeBody: boolean): void {
  G = ctx.handles === "push" ? D.pushGap : D.gap;
  m.open = ctx.handles;
  const b = new Mod(ctx, m);
  if (m.slot.zone === "upper") buildUpper(b, includeBody);
  else if (m.slot.zone === "tall") buildTall(b, includeBody);
  else buildBase(b, includeBody);
  buildHeightExtras(b, includeBody);
  if (m.slot.zone === "upper") m.anchor.y = (ctx.ub + ctx.ut) / 2;
  // holders carry their own demo delay overrides (oven doors set userData.delay)
  for (const h of m.holders) if (typeof h.node.userData.delay === "number") h.delay = h.node.userData.delay as number;
  collectPickables(m);
}

/** every mesh of a module answers to its slot id (picking); call again after the id changed */
export function collectPickables(m: ModuleRT): void {
  m.pickables = [];
  m.root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh) {
      me.userData.mid = m.slot.id;
      m.pickables.push(me);
    }
  });
}

/** build a complete module for a plan slot */
export function createModule(ctx: BuildCtx, slot: PlanSlot): ModuleRT {
  const m = newModule(slot);
  // worktop 85 / 95 cm (KitchenConfig.heights): base, island and tall units stand on a 5 / 15 cm plinth
  const lift = ctx.h && slot.zone !== "upper" ? ctx.h.lift : 0;
  if (lift) m.root.position.y = lift;
  build(ctx, m, true);
  if (lift > 0.001 && !m.ghost && !isSbs(slot.type)) {
    // the plinth below the standard 10 cm one
    const skirt = mesh(boxes([[0.001, -lift, 0.03, slot.width / 100 - 0.001, 0.0005, BASE_FACE - D.plinthRecess]], [slot.x / 100, 0, 0]), ctx.plinth);
    m.body.add(skirt);
    m.plinths.push(skirt);
    collectPickables(m);
  }
  return m;
}

/** rebuild the moving fronts (handle style change) — body stays */
export function rebuildFronts(ctx: BuildCtx, m: ModuleRT): void {
  for (const c of [...m.fronts.children]) {
    disposeGeometries(c);
    m.fronts.remove(c);
  }
  m.holders = [];
  m.wrappers = [];
  // the body keeps its front-material meshes (open shelves); only the fronts' panels go
  m.panels = m.panels.filter((p) => p.parent && isInside(p, m.body));
  G = ctx.handles === "push" ? D.pushGap : D.gap;
  m.open = ctx.handles;
  const b = new Mod(ctx, m);
  if (m.slot.zone === "upper") buildUpper(b, false);
  else if (m.slot.zone === "tall") buildTall(b, false);
  else buildBase(b, false);
  buildHeightExtras(b, false);
  for (const h of m.holders) if (typeof h.node.userData.delay === "number") h.delay = h.node.userData.delay as number;
  collectPickables(m);
}

function isInside(o: THREE.Object3D, root: THREE.Object3D): boolean {
  for (let p: THREE.Object3D | null = o; p; p = p.parent) if (p === root) return true;
  return false;
}

/**
 * Heights beyond the standard (KitchenConfig.heights via ctx.h): the top box (nadgradni ormarić with a lift-up flap)
 * on every wall unit of a kitchen with a second row and on every tall unit above ctx.h.tallSplit, and the
 * front-coloured cornice strip from the cabinets' line up to the ceiling ("do stropa"). Module-local metres (tall
 * modules stand ctx.h.lift higher). Nothing for standard heights, empty space or open wall shelves.
 */
function buildHeightExtras(b: Mod, includeBody: boolean): void {
  const { ctx, m, w } = b;
  const h = ctx.h;
  const zone = m.slot.zone;
  if (!h || m.ghost || (zone !== "upper" && zone !== "tall")) return;
  const upper = zone === "upper";
  if (upper && !hasTopBox(m.slot.type)) return;
  // a side panel at the end of a column runs up to the top on its own
  if (!upper && moduleDef("tall", m.slot.type)?.endUnit) return;
  const dy = upper ? 0 : h.lift;
  // a top box deeper / shallower than the wall unit (HeightSpec.topDepth, opt.depth); corner units keep 35 cm
  const td = upper && !m.slot.corner ? (ctx.topDepth ?? h.topDepth) : 0.35;
  const tc = D.upperCarcass + (td - 0.35);
  const fz = upper ? (Math.abs(td - 0.35) < 1e-6 ? UPPER_FZ : tc + D.frontOff + FT / 2) : BASE_FZ;
  const box = upper ? h.topRow : h.tallSplit !== null ? { y0: h.tallSplit, y1: h.tallTop } : null;
  if (box && box.y1 - box.y0 > 0.1) {
    const y0 = box.y0 - dy;
    const y1 = box.y1 - dy;
    const corner = m.slot.corner;
    const shaped = corner && upper ? cornerFoot("upper", m.slot.type) : null;
    if (shaped && shaped.shape !== "blind") {
      // an L-shaped / diagonal corner wall unit: its top box follows both legs, a fixed front on each leg
      const across = shaped.across / 100;
      const dc = D.upperCarcass;
      const right = corner === "right";
      const X = (x: number) => (right ? w - x : x);
      const bx = (x0: number, yy0: number, z0: number, x1: number, yy1: number, z1: number): BoxSpec =>
        right ? [w - x1, yy0, z0, w - x0, yy1, z1] : [x0, yy0, z0, x1, yy1, z1];
      if (includeBody) b.carcass([bx(0, y0, 0, w, y1, dc), bx(0, y0, dc, dc, y1, across)]);
      b.fixedPanel(Math.min(X(UPPER_FACE + G), X(w - G)), Math.max(X(UPPER_FACE + G), X(w - G)), y0 + G, y1 - G, fz);
      // the neighbour's leg: the same strip turned to face along wall A
      const lb = across - UPPER_FACE - 2 * G;
      const pb = b.fixedPanel(X(fz) - lb / 2, X(fz) + lb / 2, y0 + G, y1 - G, UPPER_FACE + G + lb / 2);
      pb.rotation.y = right ? -Math.PI / 2 : Math.PI / 2;
    } else {
      if (includeBody) b.carcass(carcassBoxes(w, y0, y1 - y0, upper ? (Math.abs(td - 0.35) < 1e-6 ? D.upperCarcass : tc) : D.carcass));
      if (corner) {
        // blind corner: the 5 cm filler beside the blind part, a door on the open part (as the unit below)
        const blind = 0.35;
        const fill = 0.05;
        const doorW = w - blind - fill;
        if (corner === "left") {
          b.fixedPanel(blind + 0.0045, blind + fill - G, y0 + G, y1 - G, fz);
          b.door(blind + fill, w, y0, y1, fz, "right", "bottom", 0.3);
        } else {
          b.fixedPanel(doorW + G, doorW + fill - 0.0045, y0 + G, y1 - G, fz);
          b.door(0, doorW, y0, y1, fz, "left", "bottom", 0.3);
        }
      } else b.flap(y0, y1, fz, 0.3);
    }
  }
  if (h.cornice && h.cornice.y1 - h.cornice.y0 > 0.004) {
    b.fixedPanel(0, w, h.cornice.y0 - dy + G, h.cornice.y1 - dy, fz);
    // an L-shaped / diagonal corner wall unit: the strip runs on along the neighbour's leg
    const corner = m.slot.corner;
    const f = corner && upper ? cornerFoot("upper", m.slot.type) : null;
    if (corner && f && f.shape !== "blind") {
      const lb = f.across / 100 - UPPER_FACE;
      const x = corner === "right" ? w - fz : fz;
      const p = b.fixedPanel(x - lb / 2, x + lb / 2, h.cornice.y0 - dy + G, h.cornice.y1 - dy, UPPER_FACE + lb / 2);
      p.rotation.y = corner === "right" ? -Math.PI / 2 : Math.PI / 2;
    }
  }
}

/** put every moving part back to its rest pose */
export function restModule(m: ModuleRT): void {
  for (const h of m.holders) {
    h.node.position.copy(h.rest.p);
    h.node.rotation.copy(h.rest.r);
  }
}
