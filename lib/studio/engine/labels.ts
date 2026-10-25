/**
 * Dimension lines (thin accent bars + CSS2D label), the selected element's width tag, and the engine's own tiny
 * stylesheet, so the engine can be embedded in any page (no Tailwind needed).
 *
 * With StudioEngineOptions.onWallLabel the wall / island labels become buttons (makeEditable): focusable, Enter /
 * Space / click, an accent outline and a pencil on hover and focus (always shown on touch screens), and a hit area
 * larger than the pill for fingers.
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
.emna-studio-dim[role=button]{pointer-events:auto;cursor:pointer;outline:none;touch-action:manipulation;-webkit-tap-highlight-color:transparent;transition:opacity .6s cubic-bezier(.2,.8,.2,1),border-color .3s cubic-bezier(.2,.8,.2,1),background-color .3s cubic-bezier(.2,.8,.2,1),box-shadow .3s cubic-bezier(.2,.8,.2,1)}
.emna-studio-dim[role=button]::before{content:"";position:absolute;inset:-10px -8px}
.emna-studio-dim[role=button]:hover{border-color:rgba(201,185,154,.85);background:rgba(8,8,9,.86);box-shadow:0 0 0 3px rgba(201,185,154,.14)}
.emna-studio-dim[role=button]:focus-visible{border-color:#C9B99A;background:rgba(8,8,9,.9);box-shadow:0 0 0 2px #0B0B0C,0 0 0 4px rgba(201,185,154,.8)}
.emna-studio-dim[role=button]:active{background:rgba(201,185,154,.16)}
.emna-studio-dim[aria-hidden=true]{pointer-events:none}
.emna-studio-pen{display:inline-flex;align-items:center;width:0;margin-left:0;opacity:0;overflow:hidden;vertical-align:-1px;color:#C9B99A;transition:width .3s cubic-bezier(.2,.8,.2,1),margin .3s cubic-bezier(.2,.8,.2,1),opacity .3s cubic-bezier(.2,.8,.2,1)}
.emna-studio-pen svg{display:block;width:11px;height:11px;flex:none}
.emna-studio-dim[role=button]:hover .emna-studio-pen,.emna-studio-dim[role=button]:focus-visible .emna-studio-pen{width:11px;margin-left:7px;opacity:1}
@media (hover:none){.emna-studio-dim[role=button] .emna-studio-pen{width:11px;margin-left:7px;opacity:.8}}
.emna-studio-tag{font:600 10.5px/1 var(--font-display,"Space Grotesk"),system-ui,-apple-system,sans-serif;letter-spacing:.08em;color:#0B0B0C;background:#C9B99A;padding:5px 9px;border-radius:999px;white-space:nowrap;pointer-events:none;opacity:0;font-variant-numeric:tabular-nums;box-shadow:0 4px 14px rgba(0,0,0,.35);transition:opacity .35s cubic-bezier(.2,.8,.2,1)}
.emna-studio-tag[data-on]{opacity:1}
@media (prefers-reduced-motion:reduce){.emna-studio-dim,.emna-studio-dim[role=button],.emna-studio-pen,.emna-studio-tag{transition:none}}
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
  /** the measure shown (also kept in el.dataset.cm) */
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
    el.dataset.cm = String(Math.round(cm));
  };
  setText(cmValue);
  return { group, obj, el, setText };
}

const SVG_NS = "http://www.w3.org/2000/svg";

/**
 * Turn a dimension label into a button: role, focus, Croatian aria-label (kept in sync by setText), a pencil that
 * appears on hover / focus, and `onActivate` on click, Enter or Space. Returns the label with the wrapped setText.
 */
export function makeEditable<T extends DimLabel>(label: T, aria: (cm: number) => string, onActivate: (el: HTMLElement) => void): T {
  const el = label.el;
  const doc = el.ownerDocument;
  el.setAttribute("role", "button");
  el.tabIndex = 0;
  const pen = doc.createElement("span");
  pen.className = "emna-studio-pen";
  pen.setAttribute("aria-hidden", "true");
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("fill", "none");
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", "M10.6 2.6l2.8 2.8M2.5 13.5l.8-3.3 7.8-7.8 2.5 2.5-7.8 7.8-3.3.8z");
  path.setAttribute("stroke", "currentColor");
  path.setAttribute("stroke-width", "1.5");
  path.setAttribute("stroke-linejoin", "round");
  path.setAttribute("stroke-linecap", "round");
  svg.appendChild(path);
  pen.appendChild(svg);
  el.appendChild(pen);
  el.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onActivate(el);
  });
  el.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    e.stopPropagation();
    onActivate(el);
  });
  const base = label.setText;
  label.setText = (cm: number) => {
    base(cm);
    el.setAttribute("aria-label", aria(cm));
  };
  label.setText(Number(el.dataset.cm ?? 0));
  return label;
}

/** a label that is going away (its kitchen collapses): no longer focusable or clickable */
export function retireLabel(label: DimLabel): void {
  const el = label.el;
  el.setAttribute("aria-hidden", "true");
  if (el.getAttribute("role") === "button") el.tabIndex = -1;
}

export interface WidthTag {
  obj: CSS2DObject;
  el: HTMLElement;
  /** the text to show ("60 cm"), or null to fade it out */
  set(text: string | null): void;
}

/** the small accent pill over the selected element ("60 cm"); decorative (the studio UI announces the selection) */
export function widthTag(doc: Document): WidthTag {
  const el = doc.createElement("div");
  el.className = "emna-studio-tag";
  el.setAttribute("aria-hidden", "true");
  const obj = new CSS2DObject(el);
  obj.renderOrder = 10;
  let shown: string | null = null;
  return {
    obj,
    el,
    set(text) {
      if (text === shown) return;
      shown = text;
      if (text) {
        el.textContent = text;
        el.dataset.on = "";
      } else delete el.dataset.on;
    },
  };
}
