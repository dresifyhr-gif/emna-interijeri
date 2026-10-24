/**
 * Cabinet builders. Every module lives in its own group whose origin is the
 * module's left-back-floor corner in run-local metres (x along the wall,
 * y up, z away from the wall). Moving parts sit in "holders" whose origin is
 * the real pivot (door hinge, flap top edge, dishwasher bottom edge …) so the
 * mechanism demo is just a rotation or translation of the holder.
 *
 *   root ── body    (carcass, plinth, interior, LED inside)    static
 *        ├─ fronts  (wrapper ─ holder ─ panel [+ handle])        rebuilt when the handle style changes
 *        └─ extras  (hob, tap — things standing on the worktop)
 */

import * as THREE from "three";
import type { PlanSlot } from "../plan";
import type { HandleStyle } from "../types";
import { BASE_FACE, D, TOP_Y, UPPER_FACE, WORK_Y } from "./dims";
import { boxes, disposeGeometries, mesh, roundedPanel, type BoxSpec } from "./geo";
import type { Mat, Materials } from "./materials";

export type HolderKind = "door" | "drawer" | "flap" | "drop" | "pull" | "visor" | "swing" | "fixed";

export interface Holder {
  node: THREE.Object3D;
  kind: HolderKind;
  /** radians (door/flap/drop/swing turn) or metres (drawer/pull/visor), signed */
  amount: number;
  /** seconds after the demo starts */
  delay: number;
  /** "swing" only: extra travel towards the room / sideways (m) */
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
  pickables: THREE.Mesh[];
  /** sink cut-out in the worktop, run-local metres */
  hole: { x0: number; x1: number; z0: number; z1: number } | null;
  leds: LedZone[];
  busy: boolean;
  /** local anchor for the popover (top-front centre) */
  anchor: THREE.Vector3;
}

export interface BuildCtx {
  mats: Materials;
  front: Mat;
  carcass: Mat;
  handles: HandleStyle;
  /** wall-unit bottom / top (m) */
  ub: number;
  ut: number;
  /** hinge side for single doors of this slot */
  hinge: "left" | "right";
  /** hinge side for tall units (towards the open end) */
  tallHinge: "left" | "right";
}

const T = D.board;
const G = D.gap;
const FT = D.frontT;
const BASE_FZ = D.carcass + D.frontOff + FT / 2;
const UPPER_FZ = D.upperCarcass + D.frontOff + FT / 2;
const DOOR_OPEN = 1.62;

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

  body(geo: THREE.BufferGeometry, mat: THREE.Material, carcass = false): THREE.Mesh {
    const me = mesh(geo, mat);
    this.m.body.add(me);
    if (carcass) this.m.carcassMeshes.push(me);
    return me;
  }

  carcass(list: BoxSpec[]): THREE.Mesh {
    return this.body(boxes(list, [this.ox, 0, 0]), this.ctx.carcass, true);
  }

  plinth(): void {
    this.body(boxes([[0.001, 0, 0.03, this.w - 0.001, D.plinth - 0.002, BASE_FACE - D.plinthRecess]]), this.ctx.mats.plinth);
  }

  /** a moving part: wrapper (assembly) > holder (mechanism) */
  holder(kind: HolderKind, x: number, y: number, z: number, amount: number, delay: number, wrap = true): THREE.Group {
    const h = new THREE.Group();
    h.position.set(x, y, z);
    if (wrap) {
      const wr = new THREE.Group();
      wr.add(h);
      this.m.fronts.add(wr);
      this.m.wrappers.push(wr);
    } else this.m.fronts.add(h);
    this.m.holders.push({ node: h, kind, amount, delay, rest: { p: h.position.clone(), r: h.rotation.clone() } });
    return h;
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

  /** handle on a panel; `at` = panel-local position, `dir` = bar orientation */
  handle(panel: THREE.Mesh, dir: "h" | "v", len: number, ax: number, ay: number, force?: HandleStyle): void {
    const style = force ?? this.ctx.handles;
    if (style === "bez") return;
    const mats = this.ctx.mats;
    if (style === "letvica") {
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
      const me = mesh(boxes(list), mats.brushed);
      me.position.set(ax, ay, 0);
      panel.add(me);
    } else {
      const pts = [
        new THREE.Vector2(0.0001, 0),
        new THREE.Vector2(0.0075, 0),
        new THREE.Vector2(0.0075, 0.011),
        new THREE.Vector2(0.0145, 0.017),
        new THREE.Vector2(0.016, 0.022),
        new THREE.Vector2(0.0135, 0.026),
        new THREE.Vector2(0.0001, 0.027),
      ];
      const g = new THREE.LatheGeometry(pts, 24);
      g.rotateX(Math.PI / 2);
      const me = mesh(g, mats.brushed);
      me.position.set(ax, ay, FT / 2);
      panel.add(me);
    }
  }

  // ---------------------------------------------------- front kinds

  door(x0: number, x1: number, y0: number, y1: number, fz: number, hinge: "left" | "right", hpos: "top" | "bottom" | "mid", delay = 0, glass = false): void {
    const fw = x1 - x0 - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const px = hinge === "left" ? x0 + G : x1 - G;
    const h = this.holder("door", px, (y0 + y1) / 2, fz, hinge === "left" ? -DOOR_OPEN : DOOR_OPEN, delay);
    const lx = hinge === "left" ? fw / 2 : -fw / 2;
    let p: THREE.Mesh;
    if (glass) {
      p = this.glassDoor(h, fw, fh, lx, (x0 + x1) / 2, (y0 + y1) / 2, fz);
    } else {
      p = this.panel(h, fw, fh, lx, 0, (x0 + x1) / 2, (y0 + y1) / 2, fz);
    }
    const free = hinge === "left" ? fw / 2 - 0.035 : -fw / 2 + 0.035;
    const len = Math.min(0.2, fh * 0.4);
    if (this.ctx.handles === "letvica") {
      const ay = hpos === "top" ? fh / 2 - 0.05 - len / 2 : hpos === "bottom" ? -fh / 2 + 0.05 + len / 2 : 0;
      this.handle(p, "v", hpos === "mid" ? Math.min(0.5, fh * 0.45) : len, free, ay);
    } else if (this.ctx.handles === "gumb") {
      const ay = hpos === "top" ? fh / 2 - 0.05 : hpos === "bottom" ? -fh / 2 + 0.05 : 0;
      this.handle(p, "v", 0, free, ay);
    }
  }

  glassDoor(h: THREE.Object3D, fw: number, fh: number, lx: number, cx: number, cy: number, fz: number): THREE.Mesh {
    const r = 0.045;
    const list: BoxSpec[] = [
      [-fw / 2, -fh / 2, -FT / 2, -fw / 2 + r, fh / 2, FT / 2],
      [fw / 2 - r, -fh / 2, -FT / 2, fw / 2, fh / 2, FT / 2],
      [-fw / 2 + r, -fh / 2, -FT / 2, fw / 2 - r, -fh / 2 + r, FT / 2],
      [-fw / 2 + r, fh / 2 - r, -FT / 2, fw / 2 - r, fh / 2, FT / 2],
    ];
    const frame = mesh(boxes(list, [this.ox + cx, cy, fz]), this.ctx.front);
    frame.position.set(lx, 0, 0);
    h.add(frame);
    this.m.panels.push(frame);
    const glass = mesh(boxes([[-fw / 2 + r, -fh / 2 + r, -0.002, fw / 2 - r, fh / 2 - r, 0.002]]), this.ctx.mats.doorGlass, false, false);
    frame.add(glass);
    return frame;
  }

  drawer(x0: number, x1: number, y0: number, y1: number, fz: number, depth: number, delay: number, fixed = false): THREE.Mesh {
    const fw = x1 - x0 - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const h = this.holder(fixed ? "fixed" : "drawer", (x0 + x1) / 2, (y0 + y1) / 2, fz, fixed ? 0 : depth * 0.78, delay);
    const p = this.panel(h, fw, fh, 0, 0, (x0 + x1) / 2, (y0 + y1) / 2, fz);
    if (!fixed) {
      const bw = x1 - x0 - 2 * T - 0.03;
      const bh = Math.max(0.06, Math.min(fh - 0.05, 0.2));
      const zb = -FT / 2 - D.frontOff - 0.004;
      const zf = zb - depth;
      const yb = -fh / 2 + 0.012;
      const t = 0.012;
      const geo = boxes([
        [-bw / 2, yb, zf, -bw / 2 + t, yb + bh, zb],
        [bw / 2 - t, yb, zf, bw / 2, yb + bh, zb],
        [-bw / 2 + t, yb, zf, bw / 2 - t, yb + bh * 0.85, zf + t],
        [-bw / 2 + t, yb, zf + t, bw / 2 - t, yb + 0.008, zb],
      ]);
      h.add(mesh(geo, this.ctx.mats.drawer, true, true));
    }
    if (this.ctx.handles === "letvica") this.handle(p, "h", Math.min(fw - 0.12, 0.42), 0, fh / 2 - 0.035);
    else if (this.ctx.handles === "gumb") this.handle(p, "h", 0, 0, fh / 2 - 0.04);
    return p;
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

  doors(y0: number, y1: number, fz: number, hpos: "top" | "bottom" | "mid", glass = false): void {
    if (this.w > 0.62) {
      this.door(0, this.w / 2, y0, y1, fz, "left", hpos, 0, glass);
      this.door(this.w / 2, this.w, y0, y1, fz, "right", hpos, 0.08, glass);
    } else this.door(0, this.w, y0, y1, fz, this.ctx.hinge, hpos, 0, glass);
  }

  flap(y0: number, y1: number, fz: number): void {
    const fw = this.w - 2 * G;
    const fh = y1 - y0 - 2 * G;
    const h = this.holder("flap", this.w / 2, y1 - G, fz, -1.68, 0);
    const p = this.panel(h, fw, fh, 0, -fh / 2, this.w / 2, (y0 + y1) / 2, fz);
    if (this.ctx.handles === "letvica") this.handle(p, "h", Math.min(fw - 0.16, 0.42), 0, -fh / 2 + 0.035);
    else if (this.ctx.handles === "gumb") this.handle(p, "h", 0, 0, -fh / 2 + 0.04);
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
    const me = mesh(boxes([[x0, y - 0.004, z - 0.004, x1, y, z + 0.004]]), this.ctx.mats.led, false, false);
    this.m.body.add(me);
    this.m.leds.push({ mesh: me, length: len, kind: "inner" });
  }
}

// ---------------------------------------------------------------- per zone

function buildBase(b: Mod, includeBody: boolean): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const gola = ctx.handles === "bez";
  const yb = D.plinth;
  const yt = TOP_Y - (gola ? D.golaH : 0);
  const fz = BASE_FZ;
  const corner = m.slot.corner;

  if (includeBody) {
    b.plinth();
    if (type === "perilica") {
      // the machine itself: steel tub + two racks
      const mats = ctx.mats;
      b.body(boxes(hollow(0.012, D.plinth + 0.02, 0.03, w - 0.012, TOP_Y - 0.012, D.carcass - 0.004, 0.008)), mats.basin);
      const rack = (y: number): BoxSpec[] => {
        const r = 0.004;
        const x0 = 0.05;
        const x1 = w - 0.05;
        const z0 = 0.07;
        const z1 = D.carcass - 0.05;
        const list: BoxSpec[] = [
          [x0, y, z0, x1, y + r, z0 + r],
          [x0, y, z1 - r, x1, y + r, z1],
          [x0, y, z0, x0 + r, y + r, z1],
          [x1 - r, y, z0, x1, y + r, z1],
          [x0, y + 0.08, z1 - r, x1, y + 0.08 + r, z1],
        ];
        for (let k = 1; k < 7; k++) {
          const x = x0 + ((x1 - x0) * k) / 7;
          list.push([x, y, z0, x + r, y + 0.06, z0 + r]);
          list.push([x, y, z0, x + r, y + r, z1]);
        }
        return list;
      };
      b.body(boxes([...rack(D.plinth + 0.1), ...rack(D.plinth + 0.42)]), mats.brushed);
    } else {
      const shelves = type === "vrata" ? [D.plinth + D.baseH * 0.5] : [];
      b.carcass(carcassBoxes(w, D.plinth, D.baseH, D.carcass, { top: type !== "sudoper", shelves }));
    }

    if (type === "sudoper") {
      const mats = ctx.mats;
      const bw = Math.min(w - 0.14, 0.7);
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
        mats.basin,
      );
      const drain = mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.003, 28), mats.steel);
      drain.position.set(xc, TOP_Y - depth + 0.003, (z0 + z1) / 2);
      m.body.add(drain);
      m.hole = { x0: b.ox + xc - bw / 2, x1: b.ox + xc + bw / 2, z0, z1 };
      // tap
      const tap = new THREE.Group();
      tap.position.set(xc, WORK_Y, 0.075);
      const pipe = mesh(new THREE.CylinderGeometry(0.014, 0.017, 0.34, 24), mats.steel);
      pipe.position.y = 0.17;
      const arc = mesh(new THREE.TorusGeometry(0.09, 0.012, 14, 36, Math.PI), mats.steel);
      arc.rotation.y = -Math.PI / 2;
      arc.position.set(0, 0.34, 0.09);
      const spout = mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.05, 20), mats.steel);
      spout.position.set(0, 0.315, 0.18);
      const lever = mesh(boxes([[-0.006, -0.006, 0, 0.006, 0.006, 0.09]]), mats.steel);
      lever.position.set(0.032, 0.28, 0.01);
      lever.rotation.x = 0.45;
      tap.add(pipe, arc, spout, lever);
      m.extras.add(tap);
    }

    if (type === "ploca") {
      const hw = Math.min(w >= 0.8 ? 0.78 : 0.58, w - 0.04);
      const g = new THREE.BoxGeometry(hw, 0.006, 0.51);
      const hob = mesh(g, ctx.mats.hob);
      hob.position.set(w / 2, WORK_Y + 0.003, 0.33);
      m.extras.add(hob);
    }

  }

  // ---- fronts
  if (gola) {
    const me = mesh(boxes([[0, yt + 0.001, D.carcass - 0.03, w, TOP_Y - 0.001, D.carcass + 0.001]]), ctx.mats.gola, false, true);
    m.fronts.add(me);
  }

  if (corner) {
    const blind = 0.6;
    const fill = 0.05;
    const doorW = w - blind - fill;
    if (corner === "left") {
      b.fixedPanel(blind + 0.0015, blind + fill - G, yb + G, yt - G, fz);
      b.door(blind + fill, w, yb, yt, fz, "right", "top");
    } else {
      b.fixedPanel(doorW + G, doorW + fill - 0.0015, yb + G, yt - G, fz);
      b.door(0, doorW, yb, yt, fz, "left", "top");
    }
    if (type === "kutni") {
      // Le Mans style corner: two trays glide out of the corner on a curved path
      const left = corner === "left";
      const sgn = left ? 1 : -1;
      const mats = ctx.mats;
      const trayW = Math.min(0.34, doorW - 0.08);
      const open0 = left ? blind + fill : doorW;
      const cx = open0 + sgn * (0.025 + trayW / 2);
      [D.plinth + 0.07, D.plinth + 0.41].forEach((ty, i) => {
        const h = b.holder("swing", cx, ty, 0.3, -sgn * 0.3, 0.32 + i * 0.16, false);
        const hd = b.m.holders[b.m.holders.length - 1];
        hd.dz = 0.47;
        hd.dx = -sgn * 0.02;
        const tray = mesh(roundedPanel(trayW, 0.022, 0.4, [0, 0, 0], 0.01), mats.drawer);
        h.add(tray);
        const rim = mesh(
          boxes([
            [-trayW / 2, 0.011, -0.2, trayW / 2, 0.05, -0.194],
            [-trayW / 2, 0.011, 0.194, trayW / 2, 0.05, 0.2],
            [-trayW / 2, 0.011, -0.2, -trayW / 2 + 0.006, 0.05, 0.2],
          ]),
          mats.brushed,
        );
        h.add(rim);
        const item =
          i === 0
            ? mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.132, 28), mats.ceramic)
            : mesh(new THREE.CylinderGeometry(0.1, 0.095, 0.13, 28), mats.steel);
        item.position.set(0, 0.011 + 0.066, 0);
        h.add(item);
      });
    }
    return;
  }

  switch (type) {
    case "ladice":
      b.drawers(yb, yt, [0.22, 0.39, 0.39], fz, 0.47);
      break;
    case "ploca":
      b.drawers(yb, yt, [0.22, 0.39, 0.39], fz, 0.47, true);
      break;
    case "perilica": {
      const { holder, panel } = b.drop(0, w, yb, yt, fz, 1.42);
      // stainless inner door
      const fh = yt - yb - 2 * G;
      const inner = mesh(boxes([[-(w - 0.06) / 2, 0.02, -FT / 2 - 0.006, (w - 0.06) / 2, fh - 0.03, -FT / 2]]), ctx.mats.basin);
      holder.add(inner);
      if (ctx.handles === "letvica") b.handle(panel, "h", Math.min(w - 0.16, 0.42), 0, fh / 2 - 0.035);
      else if (ctx.handles === "gumb") b.handle(panel, "h", 0, 0, fh / 2 - 0.04);
      break;
    }
    default:
      b.doors(yb, yt, fz, "top");
  }
}

function buildUpper(b: Mod, includeBody: boolean): void {
  const { ctx, m, w } = b;
  const type = m.slot.type;
  const ub = ctx.ub;
  const ut = ctx.ut;
  const depth = D.upperCarcass;
  const fz = UPPER_FZ;
  const lip = ctx.handles === "bez" ? D.upperLip : 0;
  const y0 = ub - lip;
  const corner = m.slot.corner;
  const mats = ctx.mats;

  if (includeBody) {
    if (type === "nisa") {
      const oak = mats.oak;
      const list = carcassBoxes(w, ub, ut - ub, depth, { shelves: [ub + (ut - ub) * 0.5 - T / 2] });
      b.body(boxes(list, [b.ox, 0, 0]), oak);
      b.ledInner(0.04, w - 0.04, ut - T, depth - 0.05);
      // a few quiet objects
      const vase = mesh(
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
        mats.ceramic,
      );
      vase.position.set(w * 0.3, ub + T, depth * 0.5);
      m.body.add(vase);
      if (w >= 0.4) {
        const shelfY = ub + (ut - ub) * 0.5 + T / 2;
        const books: [number, number, THREE.Material][] = [
          [0.028, 0.21, mats.bookA],
          [0.022, 0.19, mats.bookB],
          [0.03, 0.23, mats.bookA],
        ];
        let x = w * 0.62;
        for (const [bt, bh, mat] of books) {
          const bk = mesh(boxes([[x, shelfY, depth * 0.2, x + bt, shelfY + bh, depth * 0.85]]), mat);
          m.body.add(bk);
          x += bt + 0.002;
        }
      }
    } else if (type === "napa") {
      const hz = 0.1;
      b.carcass(carcassBoxes(w, ub + hz, ut - ub - hz, depth, { shelves: [ub + hz + (ut - ub - hz) * 0.5] }));
      b.body(boxes([[0.002, ub, 0.0, w - 0.002, ub + hz, depth - 0.006]]), mats.gola);
      // LED spots under the hood
      for (const sx of [0.3, 0.7]) {
        const spot = mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.002, 20), mats.led, false, false);
        spot.position.set(w * sx, ub - 0.001, depth * 0.45);
        m.body.add(spot);
      }
    } else {
      const shelves = type === "vitrina" ? [] : [ub + (ut - ub) * 0.5];
      b.carcass(carcassBoxes(w, ub, ut - ub, depth, { shelves }));
      if (type === "vitrina") {
        for (const f of [0.34, 0.67]) {
          b.body(boxes([[T + 0.004, ub + (ut - ub) * f, 0.02, w - T - 0.004, ub + (ut - ub) * f + 0.006, depth - 0.02]]), mats.glassShelf);
        }
        b.ledInner(T + 0.02, w - T - 0.02, ut - T, depth - 0.05);
      }
    }
  }

  if (type === "nisa") return;

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
    default:
      b.doors(y0, ut, fz, "bottom");
  }
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

  const freezer = Math.min(0.72, H * 0.34);
  const top = Math.max(0.2, H - freezer - 1.02);
  const fridge = H - freezer - top;

  const drawerH = Math.min(0.29, H * 0.14);
  const ovenH = 0.595;
  const ovenY0 = y0 + 2 * drawerH;
  const ovenY1 = Math.min(y1 - 0.2, ovenY0 + ovenH);

  if (includeBody) {
    b.plinth();
    b.carcass(carcassBoxes(w, y0, H, D.carcass, { shelves: type === "pecnica" ? [ovenY1 + (y1 - ovenY1) * 0.5] : [] }));
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
        mats.gola,
      );
    }
    if (type === "pecnica") {
      const cx0 = 0.03;
      const cx1 = w - 0.03;
      b.body(boxes(hollow(cx0, ovenY0 + 0.01, 0.06, cx1, ovenY1 - 0.1, D.carcass - 0.002, 0.008)), mats.enamel);
      const r = 0.004;
      const ry = ovenY0 + 0.2;
      b.body(
        boxes([
          [cx0 + 0.02, ry, 0.08, cx1 - 0.02, ry + r, 0.08 + r],
          [cx0 + 0.02, ry, D.carcass - 0.04, cx1 - 0.02, ry + r, D.carcass - 0.04 + r],
          [cx0 + 0.02, ry, 0.08, cx0 + 0.02 + r, ry + r, D.carcass - 0.04],
          [cx1 - 0.02 - r, ry, 0.08, cx1 - 0.02, ry + r, D.carcass - 0.04],
        ]),
        mats.brushed,
      );
      b.body(boxes([[w / 2 - 0.08, ovenY1 - 0.125, 0.07, w / 2 + 0.08, ovenY1 - 0.115, 0.075]]), mats.ovenLight);
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
      // control strip (fixed) + oven door (drops down)
      const strip = 0.09;
      const sh = b.holder("fixed", w / 2, ovenY1 - strip / 2, fz, 0, 0);
      const sp = b.panel(sh, w - 2 * G, strip - 2 * G, 0, 0, w / 2, ovenY1 - strip / 2, fz, mats.blackGlass);
      const disp = mesh(boxes([[-0.06, -0.008, FT / 2, 0.06, 0.008, FT / 2 + 0.001]]), mats.display, false, false);
      sp.add(disp);
      const { panel } = b.drop(0, w, ovenY0, ovenY1 - strip, fz, 1.35, mats.blackGlass);
      const fh = ovenY1 - strip - ovenY0 - 2 * G;
      b.handle(panel, "h", w - 0.14, 0, fh / 2 - 0.03, "letvica");
      if (y1 - ovenY1 > 0.15) b.door(0, w, ovenY1, y1, fz, hinge, "bottom", 0.1);
      break;
    }
    case "smocnica": {
      const h = b.holder("pull", w / 2, (y0 + y1) / 2, fz, 0.52, 0);
      const fw = w - 2 * G;
      const fh = H - 2 * G;
      const p = b.panel(h, fw, fh, 0, 0, w / 2, (y0 + y1) / 2, fz);
      if (ctx.handles === "letvica") b.handle(p, "v", 0.5, hinge === "left" ? fw / 2 - 0.035 : -fw / 2 + 0.035, 0.05);
      else if (ctx.handles === "gumb") b.handle(p, "v", 0, hinge === "left" ? fw / 2 - 0.035 : -fw / 2 + 0.035, 0.05);
      const bw = w - 2 * T - 0.04;
      const zb = -FT / 2 - 0.006;
      const zf = zb - 0.5;
      const list: BoxSpec[] = [
        [-0.006, -fh / 2 + 0.05, zf, 0.006, fh / 2 - 0.05, zf + 0.012],
      ];
      const n = 5;
      for (let k = 0; k < n; k++) {
        const yy = -fh / 2 + 0.12 + ((fh - 0.3) * k) / (n - 1);
        list.push([-bw / 2, yy, zf, bw / 2, yy + 0.008, zb]);
        list.push([-bw / 2, yy, zf, -bw / 2 + 0.006, yy + 0.07, zb]);
        list.push([bw / 2 - 0.006, yy, zf, bw / 2, yy + 0.07, zb]);
      }
      h.add(mesh(boxes(list), mats.drawer));
      // a few jars
      for (let k = 0; k < 3; k++) {
        const yy = -fh / 2 + 0.12 + ((fh - 0.3) * (k + 1)) / 4 + 0.008;
        const jar = mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.12, 20), mats.glassShelf);
        jar.position.set(-bw / 4 + k * 0.03, yy + 0.06, zf + 0.15 + k * 0.1);
        h.add(jar);
      }
      break;
    }
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
    pickables: [],
    hole: null,
    leds: [],
    busy: false,
    anchor: new THREE.Vector3(w / 2, ay, az),
  };
}

function build(ctx: BuildCtx, m: ModuleRT, includeBody: boolean): void {
  const b = new Mod(ctx, m);
  if (m.slot.zone === "upper") buildUpper(b, includeBody);
  else if (m.slot.zone === "tall") buildTall(b, includeBody);
  else buildBase(b, includeBody);
  if (m.slot.zone === "upper") m.anchor.y = (ctx.ub + ctx.ut) / 2;
  collectPickables(m);
}

function collectPickables(m: ModuleRT): void {
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
  build(ctx, m, true);
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
  m.panels = [];
  const b = new Mod(ctx, m);
  if (m.slot.zone === "upper") buildUpper(b, false);
  else if (m.slot.zone === "tall") buildTall(b, false);
  else buildBase(b, false);
  collectPickables(m);
}

/** put every moving part back to its rest pose */
export function restModule(m: ModuleRT): void {
  for (const h of m.holders) {
    h.node.position.copy(h.rest.p);
    h.node.rotation.copy(h.rest.r);
  }
}
