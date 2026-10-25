/**
 * Live top view of the room, to scale: the room's walls A / B / C (thick lines, the window as a gap), the kitchen run on
 * each wall where it actually stands (RunPlan.kitchen — it need not take the whole wall), its tall columns, bare floor
 * an edited run leaves free (dashed), and the island or peninsula with its seats and bar, placed through
 * IslandPlan.frame. The part being edited glows in the accent colour: a wall (`a`), the kitchen on it (`k-a`), the
 * window, the island, the ceiling (nothing to draw from above).
 */
import { DIM, type IslandPlan, type IslandRect, type KitchenPlan } from "@/lib/studio/plan";
import type { WallId } from "@/lib/studio/types";

export type SchematicFocus = WallId | `k-${WallId}` | "window" | "island" | "ceiling" | null;

type Pt = [number, number];

const VW = 300;
const VH = 196;
const PAD = 30;
const ACCENT = "#C9B99A";

/** an island-frame point (run-local cm: x along it, z from the back of its cabinets) in room cm (x along wall A, y into the room) */
function islandPoint(I: IslandPlan, x: number, z: number): Pt {
  const { x: fx, z: fz, rot } = I.frame;
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  return [fx + x * c + z * s, fz - x * s + z * c];
}
const rectPts = (I: IslandPlan, r: IslandRect): Pt[] => [
  islandPoint(I, r.from, r.z0),
  islandPoint(I, r.to, r.z0),
  islandPoint(I, r.to, r.z1),
  islandPoint(I, r.from, r.z1),
];

export function WallSchematic({ plan, focus, className = "" }: { plan: KitchenPlan; focus: SchematicFocus; className?: string }) {
  const { cfg, walls } = plan;
  const a = cfg.walls.a;
  const b = walls.includes("b") ? cfg.walls.b : 0;
  const c = walls.includes("c") ? cfg.walls.c : 0;
  const isl = plan.island;

  /** run-local (x along the wall as seen facing it, d = distance from the wall) → room cm */
  const local = (wall: WallId, x: number, d: number): Pt => {
    if (wall === "a") return [x, d];
    if (wall === "b") return [d, b - x];
    return [a - d, x];
  };

  // the island / peninsula in room cm: its worktop (with the overhang), cabinets, bar, seats
  const islSlab = isl ? isl.slab.map((r) => rectPts(isl, r)) : [];
  const islBody = isl ? rectPts(isl, { from: isl.body.from, to: isl.body.to, z0: isl.outer, z1: DIM.baseDepth }) : null;
  const islBar = isl?.bar ? rectPts(isl, { from: isl.bar.from, to: isl.bar.to, z0: Math.min(isl.bar.z0, isl.bar.z1), z1: Math.max(isl.bar.z0, isl.bar.z1) }) : null;
  const islSeats = isl ? isl.seats.map((st) => islandPoint(isl, st.x, st.z)) : [];

  // fit everything (walls, island, a little air into the room) into the drawing
  const pts: Pt[] = [
    [0, 0],
    [a, 0],
    [0, Math.max(b, c, DIM.baseDepth + 150)],
    ...islSlab.flat(),
    ...(islBar ?? []),
    ...islSeats.map(([x, y]): Pt => [x, y + 40]),
  ];
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));
  const maxY = Math.max(...pts.map((p) => p[1])) + 10;
  const scale = Math.min((VW - PAD * 2) / Math.max(1, maxX - minX), (VH - PAD * 2) / Math.max(1, maxY));
  const ox = (VW - (maxX - minX) * scale) / 2 - minX * scale;
  const oy = PAD;
  const P = ([x, y]: Pt): Pt => [ox + x * scale, oy + y * scale];
  const poly = (ps: Pt[]) => ps.map((p) => P(p).map((n) => n.toFixed(1)).join(",")).join(" ");
  const band = (wall: WallId, from: number, to: number, d0: number, d1: number) =>
    poly([local(wall, from, d0), local(wall, to, d0), local(wall, to, d1), local(wall, from, d1)]);

  const win = plan.window;
  const wallSegments = (wall: WallId): [Pt, Pt][] => {
    const len = cfg.walls[wall];
    if (win && win.wall === wall) {
      const segs: [Pt, Pt][] = [];
      if (win.offset > 0.5) segs.push([P(local(wall, 0, 0)), P(local(wall, win.offset, 0))]);
      if (win.offset + win.width < len - 0.5) segs.push([P(local(wall, win.offset + win.width, 0)), P(local(wall, len, 0))]);
      return segs;
    }
    return [[P(local(wall, 0, 0)), P(local(wall, len, 0))]];
  };

  // label position: A above its wall; B and C inside the room, next to their cabinet run (staggered so they never collide)
  const labelAt = (wall: WallId): { p: Pt; side: "center" | "right" | "left" } => {
    const len = cfg.walls[wall];
    if (wall === "a") return { p: P(local("a", len / 2, -13 / scale)), side: "center" };
    if (wall === "b") return { p: P(local("b", len * 0.62, DIM.baseDepth + 9 / scale)), side: "right" };
    return { p: P(local("c", len * 0.62, DIM.baseDepth + 9 / scale)), side: "left" };
  };

  const hot = (k: SchematicFocus) => focus === k;
  const wallStroke = (w: WallId) => (hot(w) ? ACCENT : "rgba(242,239,233,.62)");
  const word = isl?.kind === "poluotok" ? "POLUOTOK" : "OTOK";
  const shortKitchen = plan.runs.filter((r) => r.kitchen.to - r.kitchen.from < r.length - 0.5);

  const [rx0, ry0] = P([0, 0]);
  const [rx1, ry1] = P([a, maxY - 10]);

  return (
    <svg
      viewBox={`0 0 ${VW} ${VH}`}
      className={className}
      role="img"
      aria-label={`Tlocrt: ${walls
        .map((w) => {
          const r = plan.runs.find((x) => x.wall === w);
          const k = r ? Math.round(r.kitchen.to - r.kitchen.from) : cfg.walls[w];
          return `zid ${w.toUpperCase()} ${cfg.walls[w]} cm${k < cfg.walls[w] ? `, kuhinja na njemu ${k} cm` : ""}`;
        })
        .join("; ")}${win ? `; prozor na zidu ${win.wall.toUpperCase()}` : ""}${isl ? `; ${isl.kind === "poluotok" ? "poluotok" : "otok"} ${cfg.island} cm` : ""}`}
    >
      {/* drafting grid */}
      <defs>
        <pattern id="studio-grid" width="12" height="12" patternUnits="userSpaceOnUse">
          <path d="M12 0H0V12" fill="none" stroke="rgba(242,239,233,.045)" strokeWidth="1" />
        </pattern>
      </defs>
      <rect x="0" y="0" width={VW} height={VH} fill="url(#studio-grid)" rx="14" />

      {/* open sides of the room, dashed */}
      <rect x={rx0} y={ry0} width={rx1 - rx0} height={ry1 - ry0} fill="none" stroke="rgba(242,239,233,.12)" strokeDasharray="2 4" strokeWidth="1" />

      {/* the kitchen runs, where they stand on the walls */}
      {plan.runs.map((r) => {
        const on = hot(`k-${r.wall}`) || hot(r.wall);
        return (
          <g key={r.wall}>
            {r.worktop && (
              <polygon
                points={band(r.wall, r.worktop.from, r.worktop.to, 0, DIM.baseDepth)}
                fill={on ? "rgba(201,185,154,.2)" : "rgba(201,185,154,.1)"}
                stroke={on ? "rgba(201,185,154,.75)" : "rgba(201,185,154,.38)"}
                strokeWidth="0.75"
                style={{ transition: "fill .4s cubic-bezier(.2,.8,.2,1), stroke .4s cubic-bezier(.2,.8,.2,1)" }}
              />
            )}
            {r.talls.map((t, i) => (
              <polygon
                key={i}
                points={band(r.wall, t.from, t.to, 0, DIM.baseDepth)}
                fill={on ? "rgba(201,185,154,.34)" : "rgba(201,185,154,.22)"}
                stroke="rgba(201,185,154,.5)"
                strokeWidth="0.75"
              />
            ))}
            {r.free.map((f, i) => (
              <polygon key={`f${i}`} points={band(r.wall, f.from, f.to, 0, DIM.baseDepth)} fill="none" stroke="rgba(201,185,154,.55)" strokeWidth="0.7" strokeDasharray="1.8 1.8" />
            ))}
          </g>
        );
      })}

      {/* island / peninsula */}
      {isl && islBody && (
        <g>
          {islSlab.map((ps, i) => (
            <polygon
              key={i}
              points={poly(ps)}
              fill={hot("island") ? "rgba(201,185,154,.18)" : "rgba(242,239,233,.07)"}
              stroke={hot("island") ? ACCENT : "rgba(242,239,233,.32)"}
              strokeWidth="0.9"
              strokeLinejoin="round"
            />
          ))}
          <polygon points={poly(islBody)} fill="rgba(201,185,154,.1)" stroke="rgba(201,185,154,.38)" strokeWidth="0.6" />
          {islBar && <polygon points={poly(islBar)} fill="rgba(242,239,233,.12)" stroke="rgba(242,239,233,.45)" strokeWidth="0.7" />}
          {islSeats.map((p, i) => {
            const [x, y] = P(p);
            return <circle key={i} cx={x} cy={y} r={Math.max(1.6, 18 * scale)} fill="none" stroke="rgba(242,239,233,.4)" strokeWidth="0.7" />;
          })}
          {(() => {
            const all = islSlab.flat().map(P);
            const cx = all.reduce((s, p) => s + p[0], 0) / Math.max(1, all.length);
            // under the island and its seats
            const yb = Math.max(...all.map((p) => p[1]), ...islSeats.map((p) => P(p)[1] + Math.max(1.6, 18 * scale)));
            return (
              <text
                x={cx}
                y={Math.min(VH - 6, yb + 12)}
                textAnchor="middle"
                className="font-display"
                fontSize="9"
                letterSpacing="1"
                fill={hot("island") ? ACCENT : "rgba(242,239,233,.55)"}
              >
                {word} {cfg.island}
              </text>
            );
          })()}
        </g>
      )}

      {/* the room's walls */}
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
          const g0 = P(local(win.wall, win.offset, -1.2 / scale));
          const g1 = P(local(win.wall, win.offset + win.width, -1.2 / scale));
          const h0 = P(local(win.wall, win.offset, 1.2 / scale));
          const h1 = P(local(win.wall, win.offset + win.width, 1.2 / scale));
          const col = hot("window") ? ACCENT : "rgba(201,185,154,.7)";
          return (
            <g stroke={col} strokeWidth="0.9">
              <line x1={g0[0]} y1={g0[1]} x2={g1[0]} y2={g1[1]} />
              <line x1={h0[0]} y1={h0[1]} x2={h1[0]} y2={h1[1]} />
            </g>
          );
        })()}

      {/* the kitchen's own length where it is shorter than its wall */}
      {shortKitchen.map((r) => {
        const mid = (r.kitchen.from + r.kitchen.to) / 2;
        const [x, y] = P(local(r.wall, mid, DIM.baseDepth / 2));
        const on = hot(`k-${r.wall}`);
        return (
          <text
            key={`k-${r.wall}`}
            x={x}
            y={y + 3}
            textAnchor="middle"
            fontSize="7.5"
            letterSpacing="0.4"
            className="font-display tabular-nums"
            fill={on ? ACCENT : "rgba(201,185,154,.85)"}
            transform={r.wall === "a" ? undefined : `rotate(${r.wall === "b" ? -90 : 90} ${x} ${y})`}
          >
            {Math.round(r.kitchen.to - r.kitchen.from)}
          </text>
        );
      })}

      {/* wall labels: letter badge + the room's length */}
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
              fill={on ? ACCENT : "rgba(11,11,12,.9)"}
              stroke={on ? ACCENT : "rgba(242,239,233,.35)"}
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
              fill={on ? ACCENT : "rgba(242,239,233,.72)"}
            >
              {cfg.walls[w]} cm
            </text>
          </g>
        );
      })}
    </svg>
  );
}
