/**
 * One wall of the room seen from the front, flattened to a bar: the room's wall (thin line, its corners marked), the
 * kitchen standing on it (accent block, with its tall columns and any bare floor it leaves) and the bare wall beyond it.
 * Used where the customer sets how long the kitchen is on a wall and where it starts (WallsStep, the 3D length editor),
 * so "the room's wall" and "the kitchen's length" are two visibly different things.
 *
 * Decorative (aria-hidden): the controls next to it say the same in words.
 */
import type { Range } from "@/lib/studio/plan";

const VW = 300;
const VH = 40;
const PAD = 10;

export interface KitchenBarProps {
  /** the room's wall (cm) */
  length: number;
  /** where the kitchen stands on it (wall-local cm, as seen facing the wall) */
  kitchen: Range;
  /** tall columns and bare floor inside the kitchen run (wall-local cm) */
  talls?: Range[];
  free?: Range[];
  /** a window on this wall (wall-local cm) */
  window?: Range | null;
  /** which ends of the wall are room corners (a thick tick there) */
  corners?: { left: boolean; right: boolean };
  /** the kitchen block glows (its controls are hovered / focused) */
  active?: boolean;
  className?: string;
}

export function KitchenBar({ length, kitchen, talls = [], free = [], window: win = null, corners, active = false, className = "" }: KitchenBarProps) {
  const L = Math.max(1, length);
  const sx = (VW - PAD * 2) / L;
  const X = (cm: number) => PAD + cm * sx;
  const yWall = 9;
  const y0 = 13;
  const h = 13;
  const k0 = X(kitchen.from);
  const k1 = X(kitchen.to);
  const klen = Math.round(kitchen.to - kitchen.from);
  const left = Math.round(kitchen.from);
  const right = Math.round(L - kitchen.to);
  const label = (x0: number, x1: number, text: string, accent = false) =>
    x1 - x0 >= text.length * 5.2 + 6 ? (
      <text
        x={(x0 + x1) / 2}
        y={y0 + h + 10}
        textAnchor="middle"
        fontSize="8.5"
        letterSpacing="0.4"
        className="font-display tabular-nums"
        fill={accent ? "#C9B99A" : "rgba(242,239,233,.5)"}
      >
        {text}
      </text>
    ) : null;

  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} aria-hidden="true" focusable="false" className={className}>
      {/* the room's wall */}
      <line x1={X(0)} x2={X(L)} y1={yWall} y2={yWall} stroke="rgba(242,239,233,.42)" strokeWidth="1.4" />
      {win && <line x1={X(win.from)} x2={X(win.to)} y1={yWall} y2={yWall} stroke="#0B0B0C" strokeWidth="2" />}
      {win && <line x1={X(win.from)} x2={X(win.to)} y1={yWall - 1.6} y2={yWall - 1.6} stroke="rgba(201,185,154,.6)" strokeWidth="0.7" />}
      {(["left", "right"] as const).map((side) => {
        const x = side === "left" ? X(0) : X(L);
        const corner = corners?.[side];
        return (
          <line
            key={side}
            x1={x}
            x2={x}
            y1={corner ? yWall - 6 : yWall - 3}
            y2={corner ? y0 + h + 1 : yWall + 3}
            stroke={corner ? "rgba(242,239,233,.55)" : "rgba(242,239,233,.3)"}
            strokeWidth={corner ? 1.6 : 1}
            strokeDasharray={corner ? undefined : "1.5 1.5"}
          />
        );
      })}
      {/* bare wall beyond the kitchen */}
      {left > 0 && <rect x={X(0)} y={y0} width={Math.max(0, k0 - X(0))} height={h} fill="none" stroke="rgba(242,239,233,.16)" strokeWidth="0.8" strokeDasharray="2 2.5" />}
      {right > 0 && <rect x={k1} y={y0} width={Math.max(0, X(L) - k1)} height={h} fill="none" stroke="rgba(242,239,233,.16)" strokeWidth="0.8" strokeDasharray="2 2.5" />}
      {/* the kitchen */}
      <rect
        x={k0}
        y={y0}
        width={Math.max(1, k1 - k0)}
        height={h}
        rx="1.5"
        fill={active ? "rgba(201,185,154,.32)" : "rgba(201,185,154,.2)"}
        stroke={active ? "#C9B99A" : "rgba(201,185,154,.6)"}
        strokeWidth="0.9"
        style={{ transition: "fill .4s cubic-bezier(.2,.8,.2,1), stroke .4s cubic-bezier(.2,.8,.2,1)" }}
      />
      {talls.map((t, i) => (
        <rect key={`t${i}`} x={X(t.from)} y={y0} width={Math.max(1, X(t.to) - X(t.from))} height={h} rx="1" fill="rgba(201,185,154,.34)" />
      ))}
      {free.map((f, i) => (
        <rect
          key={`f${i}`}
          x={X(f.from)}
          y={y0 + 1}
          width={Math.max(1, X(f.to) - X(f.from))}
          height={h - 2}
          fill="#111113"
          stroke="rgba(201,185,154,.55)"
          strokeWidth="0.7"
          strokeDasharray="1.6 1.6"
        />
      ))}
      {label(k0, k1, `kuhinja ${klen} cm`, true)}
      {left > 0 && label(X(0), k0, `${left} cm`)}
      {right > 0 && label(k1, X(L), `${right} cm`)}
    </svg>
  );
}
