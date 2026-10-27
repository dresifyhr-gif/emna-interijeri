"use client";

/**
 * Technical-drawing kit: thin accent lines that draw themselves when scrolled into view,
 * dimension lines with architectural ticks and labels in cm, callout bubbles.
 * Colour comes from `currentColor` — set `text-bronze` on the light pages (`text-accent` on dark).
 *
 * The drawing is pure CSS (`.drawing` / `.dr-draw` / `.dr-fade` in globals.css): the server HTML is
 * the finished drawing, "mount" drawings (heroes) animate from the first paint without JS, "view"
 * drawings are armed after mount only while still below the fold. Reduced motion: drawn, no motion.
 */

import { useRef, type CSSProperties, type ReactNode } from "react";
import { useScrollReveal } from "@/components/ui/motion";

/** stagger index for the CSS delays */
const order = (i: number) => ({ "--i": i }) as CSSProperties;

const NO_REF = { current: null };

/* ---------- geometry helpers (plain functions, SVG path strings) ---------- */

export const rect = (x: number, y: number, w: number, h: number) => `M${x} ${y}h${w}v${h}h${-w}Z`;

export const circle = (cx: number, cy: number, r: number) =>
  `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;

export const polar = (cx: number, cy: number, r: number, deg: number): [number, number] => {
  const a = (deg * Math.PI) / 180;
  return [+(cx + r * Math.cos(a)).toFixed(2), +(cy + r * Math.sin(a)).toFixed(2)];
};

/** arc on a circle from angle a0 to a1 (degrees, screen coordinates: 0 = right, 90 = down) */
export const arc = (cx: number, cy: number, r: number, a0: number, a1: number) => {
  const [x0, y0] = polar(cx, cy, r, a0);
  const [x1, y1] = polar(cx, cy, r, a1);
  const large = Math.abs(a1 - a0) > 180 ? 1 : 0;
  const sweep = a1 > a0 ? 1 : 0;
  return `M${x0} ${y0}A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}`;
};

/** open arrowhead with its tip at (x, y), pointing towards `deg` */
export const arrowHead = (x: number, y: number, deg: number, len = 6) => {
  const [ax, ay] = polar(x, y, len, deg + 180 - 28);
  const [bx, by] = polar(x, y, len, deg + 180 + 28);
  return `M${ax} ${ay}L${x} ${y}L${bx} ${by}`;
};

/* ---------- components ---------- */

export function Drawing({
  viewBox,
  label,
  className = "",
  children,
  trigger = "view",
  strokeWidth = 1.2,
}: {
  viewBox: string;
  /** accessible description of the drawing */
  label: string;
  className?: string;
  children: ReactNode;
  /** "view": draw when scrolled into view, "mount": draw immediately (heroes) */
  trigger?: "view" | "mount";
  strokeWidth?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  // "mount" drawings never get armed: their CSS animation already runs from the first paint
  useScrollReveal(trigger === "view" ? ref : NO_REF, "0px 0px -12% 0px");
  return (
    <svg
      ref={ref}
      viewBox={viewBox}
      role="img"
      aria-label={label}
      className={`drawing block h-auto w-full overflow-visible ${trigger === "mount" ? "drawing-mount" : ""} ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ fontFamily: "var(--font-sans)" }}
    >
      {children}
    </svg>
  );
}

/** A line/shape that draws itself. `soft` = secondary (walls, context), `dashed` fades in instead. */
export function P({
  d,
  i = 0,
  soft = false,
  dashed = false,
  w,
  fill,
}: {
  d: string;
  i?: number;
  soft?: boolean;
  dashed?: boolean;
  w?: number;
  fill?: string;
}) {
  return (
    <path
      d={d}
      // dashed lines cannot also be drawn with a dash offset: they fade in instead
      className={dashed ? "dr-fade" : "dr-draw"}
      pathLength={dashed ? undefined : 1}
      style={order(i)}
      strokeOpacity={soft ? 0.42 : 1}
      strokeDasharray={dashed ? "3 4" : undefined}
      strokeWidth={w}
      fill={fill}
    />
  );
}

/** Text that fades in after the lines. */
export function T({
  x,
  y,
  children,
  i = 0,
  anchor = "middle",
  size = 9,
  soft = false,
  rotate,
  spacing = 0.8,
  weight = 500,
}: {
  x: number;
  y: number;
  children: ReactNode;
  i?: number;
  anchor?: "start" | "middle" | "end";
  size?: number;
  soft?: boolean;
  rotate?: number;
  spacing?: number;
  weight?: number;
}) {
  return (
    <text
      x={x}
      y={y}
      className="dr-fade"
      style={order(i)}
      textAnchor={anchor}
      fontSize={size}
      fontWeight={weight}
      letterSpacing={spacing}
      fill="currentColor"
      fillOpacity={soft ? 0.6 : 0.95}
      stroke="none"
      transform={rotate ? `rotate(${rotate} ${x} ${y})` : undefined}
    >
      {children}
    </text>
  );
}

/**
 * Dimension line (kota) between two points on one axis, with 45° ticks and a centred label.
 * `side` puts the label above/left (-1) or below/right (1) of the line.
 */
export function Dim({
  x1,
  y1,
  x2,
  y2,
  label,
  i = 0,
  side = -1,
  size = 9,
}: {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label: string;
  i?: number;
  side?: -1 | 1;
  size?: number;
}) {
  const horizontal = Math.abs(y1 - y2) < Math.abs(x1 - x2);
  const t = 3.5;
  const tick = (x: number, y: number) => `M${x - t} ${y + t}L${x + t} ${y - t}`;
  const d = `M${x1} ${y1}L${x2} ${y2}${tick(x1, y1)}${tick(x2, y2)}`;
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  return (
    <>
      <P d={d} i={i} soft w={1} />
      {horizontal ? (
        <T x={mx} y={side < 0 ? my - 6 : my + size + 4} i={i} size={size} soft>
          {label}
        </T>
      ) : (
        <T x={side < 0 ? mx - 7 : mx + 7 + size} y={my} i={i} size={size} soft rotate={-90}>
          {label}
        </T>
      )}
    </>
  );
}

/** Numbered callout bubble with a leader line to (tx, ty). */
export function Callout({
  x,
  y,
  tx,
  ty,
  n,
  i = 0,
}: {
  x: number;
  y: number;
  tx: number;
  ty: number;
  n: string;
  i?: number;
}) {
  const r = 9;
  const dx = tx - x;
  const dy = ty - y;
  const len = Math.hypot(dx, dy) || 1;
  const sx = x + (dx / len) * r;
  const sy = y + (dy / len) * r;
  return (
    <>
      <P d={`M${sx} ${sy}L${tx} ${ty}`} i={i} soft w={0.9} />
      <P d={circle(tx, ty, 1.6)} i={i} fill="currentColor" />
      <P d={circle(x, y, r)} i={i} />
      <T x={x} y={y + 3} i={i} size={8} spacing={0.2} weight={600}>
        {n}
      </T>
    </>
  );
}
