/**
 * Dimension lines (thin accent bars + CSS2D label) and the engine's own tiny
 * stylesheet, so the engine can be embedded in any page (no Tailwind needed).
 */

import * as THREE from "three";
import { CSS2DObject } from "three/addons/renderers/CSS2DRenderer.js";
import { boxes } from "./geo";

const STYLE_ID = "emna-studio-style";
let styleUsers = 0;

const CSS = `
.emna-studio-canvas{display:block;width:100%;height:100%;outline:none;-webkit-tap-highlight-color:transparent}
.emna-studio-canvas[data-mode=studio]{touch-action:none;cursor:grab}
.emna-studio-canvas[data-mode=studio]:active{cursor:grabbing}
.emna-studio-canvas[data-mode=studio][data-hover=on]{cursor:pointer}
.emna-studio-canvas:focus-visible{box-shadow:inset 0 0 0 2px rgba(201,185,154,.55)}
.emna-studio-labels{position:absolute;inset:0;pointer-events:none;overflow:hidden}
.emna-studio-dim{font:500 11px/1 var(--font-display,"Space Grotesk"),system-ui,-apple-system,sans-serif;letter-spacing:.12em;color:#C9B99A;background:rgba(8,8,9,.72);padding:6px 11px;border-radius:999px;border:1px solid rgba(201,185,154,.35);white-space:nowrap;-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);transition:opacity .6s cubic-bezier(.2,.8,.2,1);font-variant-numeric:tabular-nums}
.emna-studio-dim b{font-weight:700;color:#F2EFE9;margin-right:.55em}
@media (prefers-reduced-motion:reduce){.emna-studio-dim{transition:none}}
`;

export function injectStyle(doc: Document): void {
  styleUsers++;
  if (doc.getElementById(STYLE_ID)) return;
  const el = doc.createElement("style");
  el.id = STYLE_ID;
  el.textContent = CSS;
  doc.head.appendChild(el);
}

export function releaseStyle(doc: Document): void {
  styleUsers = Math.max(0, styleUsers - 1);
  if (styleUsers === 0) doc.getElementById(STYLE_ID)?.remove();
}

export interface DimLabel {
  group: THREE.Group;
  obj: CSS2DObject;
  el: HTMLElement;
  setText(cm: number): void;
}

/**
 * A dimension line along local x from x0 to x1 at (y, z) in `parent`'s frame.
 * `tag` is the wall letter shown in bold before the measure.
 */
export function dimLine(doc: Document, parent: THREE.Object3D, x0: number, x1: number, y: number, z: number, tag: string, cmValue: number, mat: THREE.Material): DimLabel {
  const group = new THREE.Group();
  group.position.set(x0, y, z);
  const len = Math.max(0.01, x1 - x0);
  const t = 0.0045;
  const bar = new THREE.Mesh(
    boxes([
      [0, -t / 2, -t / 2, len, t / 2, t / 2],
      [0, -0.05, -t / 2, t, 0.05, t / 2],
      [len - t, -0.05, -t / 2, len, 0.05, t / 2],
    ]),
    mat,
  );
  bar.renderOrder = 2;
  group.add(bar);
  const el = doc.createElement("div");
  el.className = "emna-studio-dim";
  el.style.opacity = "0";
  const b = doc.createElement("b");
  b.textContent = tag;
  const span = doc.createElement("span");
  el.append(b, span);
  const obj = new CSS2DObject(el);
  obj.position.set(len / 2, 0.085, 0);
  group.add(obj);
  parent.add(group);
  const setText = (cm: number) => {
    span.textContent = `${Math.round(cm)} cm`;
  };
  setText(cmValue);
  return { group, obj, el, setText };
}
