/**
 * Live top view of the room: walls A/B/C to scale, the cabinet run along each wall,
 * the tall column, the island and the window. The part being edited glows in the accent colour.
 */
import { DIM, type KitchenPlan } from "@/lib/studio/plan";
import type { WallId } from "@/lib/studio/types";

export type SchematicFocus = WallId | "window" | "island" | "ceiling" | null;

type Pt = [number, number];

const VW = 300;
const VH = 196;
const PAD = 30;

export function WallSchematic({ plan, focus, className = "" }: { plan: KitchenPlan; focus: SchematicFocus; className?: string }) {
  const { cfg, walls } = plan;
  const a = cfg.walls.a;
  const b = walls.includes("b") ? cfg.walls.b : 0;
  const c = walls.includes("c") ? cfg.walls.c : 0;
  const isl = plan.island;
  const depth = isl ? isl.backZ + DIM.islandOverhang + 30 : Math.max(b, c, DIM.baseDepth + 150);

  const scale = Math.min((VW - PAD * 2) / a, (VH - PAD * 2) / depth);
  const ox = (VW - a * scale) / 2;
  const oy = PAD;
  const P = (x: number, y: number): Pt => [ox + x * scale, oy + y * scale];

  /** run-local (x along the wall as seen facing it, d = distance from the wall) → plan (cm) */
  const local = (wall: WallId, x: number, d: number): Pt => {
    if (wall === "a") return P(x, d);
    if (wall === "b") return P(d, b - x);
    return P(a - d, x);
  };
  const band = (wall: WallId, from: number, to: number, d0: number, d1: number) => {
    const pts = [local(wall, from, d0), local(wall, to, d0), local(wall, to, d1), local(wall, from, d1)];
    return pts.map((p) => p.map((n) => n.toFixed(1)).join(",")).join(" ");
  };

  const win = plan.window;
  const wallSegments = (wall: WallId): [Pt, Pt][] => {
    const len = cfg.walls[wall];
    if (win && win.wall === wall) {
      const segs: [Pt, Pt][] = [];
      if (win.offset > 0.5) segs.push([local(wall, 0, 0), local(wall, win.offset, 0)]);
      if (win.offset + win.width < len - 0.5) segs.push([local(wall, win.offset + win.width, 0), local(wall, len, 0)]);
      return segs;
    }
    return [[local(wall, 0, 0), local(wall, len, 0)]];
  };

  // label position: A above its wall; B and C inside the room, next to their cabinet run (staggered so they never collide)
  const labelAt = (wall: WallId): { p: Pt; side: "center" | "right" | "left" } => {
    const len = cfg.walls[wall];
    if (wall === "a") return { p: local("a", len / 2, -13 / scale), side: "center" };
    if (wall === "b") return { p: local("b", len * 0.62, DIM.baseDepth + 9 / scale), side: "right" };
    return { p: local("c", len * 0.62, DIM.baseDepth + 9 / scale), side: "left" };
  };

  const hot = (k: SchematicFocus) => focus === k;
  const wallStroke = (w: WallId) => (hot(w) ? "#C9B99A" : "rgba(242,239,233,.62)");

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className={className}
      role="img"
      aria-label={`Tlocrt: ${walls.map((w) => `zid ${w.toUpperCase()} ${cfg.walls[w]} cm`).join(", ")}${
        win ? `, prozor na zidu ${win.wall.toUpperCase()}` : ""
      }${isl ? `, otok ${cfg.island} cm` : ""}`}
    >
      {/* drafting grid */}
      <defs>
        <pattern id="studio-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="rgba(242,239,233,.045)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={VW} height={VH} fill="url(#studio-grid)" rx="14" />

      {/* open sides of the room, dashed */}
      {(() => {
        const [x0, y0] = P(0, 0);
        const [x1, y1] = P(a, depth - 10);
        return (
          <rect
            x={x0}
            y={y0}
            width={x1 - x0}
            height={y1 - y0}
            fill="none"
            stroke="rgba(242,239,233,.12)"
            strokeDasharray="2 4"
            strokeWidth="1"
          />
        );
      })()}

      {/* cabinet runs */}
      {plan.runs.map((r) => (
        <g key={r.wall}>
          {r.worktop && (
            <polygon
              points={band(r.wall, r.worktop.from, r.worktop.to, 0, DIM.baseDepth)}
              fill={hot(r.wall) ? "rgba(201,185,154,.16)" : "rgba(242,239,233,.08)"}
              stroke={hot(r.wall) ? "rgba(201,185,154,.55)" : "rgba(242,239,233,.22)"}
              strokeWidth="0.75"
            />
          )}
          {r.tall && (
            <polygon
              points={band(r.wall, r.tall.from, r.tall.to, 0, DIM.baseDepth)}
              fill="rgba(242,239,233,.2)"
              stroke="rgba(242,239,233,.35)"
              strokeWidth="0.75"
            />
          )}
        </g>
      ))}

      {/* island */}
      {isl &&
        (() => {
          const [x0, y0] = P(isl.centerX - isl.length / 2, isl.backZ - DIM.baseDepth);
          const [x1, y1] = P(isl.centerX + isl.length / 2, isl.backZ + DIM.islandOverhang);
          const [, yb] = P(0, isl.backZ);
          return (
            <g>
              <rect
                x={x0}
                y={y0}
                width={x1 - x0}
                height={y1 - y0}
                rx="1.5"
                fill={hot("island") ? "rgba(201,185,154,.18)" : "rgba(242,239,233,.08)"}
                stroke={hot("island") ? "#C9B99A" : "rgba(242,239,233,.32)"}
                strokeWidth="0.9"
              />
              <line x1={x0} x2={x1} y1={yb} y2={yb} stroke="rgba(242,239,233,.18)" strokeWidth="0.75" strokeDasharray="2 2" />
              <text
                x={(x0 + x1) / 2}
                y={y1 + 13}
                textAnchor="middle"
                className="font-display"
                fontSize="9"
                letterSpacing="1"
                fill={hot("island") ? "#C9B99A" : "rgba(242,239,233,.55)"}
              >
                OTOK {cfg.island}
              </text>
            </g>
          );
        })()}

      {/* walls */}
      {walls.map((w) =>
        wallSegments(w).map(([p0, p1], i) => (
          <line
            key={`${w}-${i}`}
            x1={p0[0]}
            y1={p0[1]}
            x2={p1[0]}
            y2={p1[1]}
            stroke={wallStroke(w)}
            strokeWidth={hot(w) ? 3 : 2.4}
            strokeLinecap="square"
            style={{ transition: "stroke .4s cubic-bezier(.2,.8,.2,1)" }}
          />
        )),
      )}

      {/* window: thin double line in the opening */}
      {win &&
        (() => {
          const g0 = local(win.wall, win.offset, -1.2 / scale);
          const g1 = local(win.wall, win.offset + win.width, -1.2 / scale);
          const h0 = local(win.wall, win.offset, 1.2 / scale);
          const h1 = local(win.wall, win.offset + win.width, 1.2 / scale);
          const col = hot("window") ? "#C9B99A" : "rgba(201,185,154,.7)";
          return (
            <g stroke={col} strokeWidth="0.9">
              <line x1={g0[0]} y1={g0[1]} x2={g1[0]} y2={g1[1]} />
              <line x1={h0[0]} y1={h0[1]} x2={h1[0]} y2={h1[1]} />
            </g>
          );
        })()}

      {/* wall labels: letter badge + length */}
      {walls.map((w) => {
        const { p, side } = labelAt(w);
        const on = hot(w);
        const badgeX = side === "center" ? p[0] - 22 : side === "right" ? p[0] + 7 : p[0] - 7;
        const textX = side === "left" ? badgeX - 10 : badgeX + 10;
        return (
          <g key={`l-${w}`}>
            <circle
              cx={badgeX}
              cy={p[1]}
              r="6.5"
              fill={on ? "#C9B99A" : "rgba(11,11,12,.9)"}
              stroke={on ? "#C9B99A" : "rgba(242,239,233,.35)"}
              strokeWidth="0.8"
            />
            <text x={badgeX} y={p[1] + 2.9} textAnchor="middle" fontSize="8" fontWeight="700" className="font-display" fill={on ? "#0B0B0C" : "#F2EFE9"}>
              {w.toUpperCase()}
            </text>
            <text
              x={textX}
              y={p[1] + 3}
              textAnchor={side === "left" ? "end" : "start"}
              fontSize="9"
              letterSpacing="0.6"
              className="font-display tabular-nums"
              fill={on ? "#C9B99A" : "rgba(242,239,233,.72)"}
            >
              {cfg.walls[w]} cm
            </text>
          </g>
        );
      })}
    </svg>
  );
}
