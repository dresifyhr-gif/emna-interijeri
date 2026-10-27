"use client";

/**
 * Front view of one run, to scale, as a technical drawing: the wall with its window, wall units, base cabinets,
 * the tall columns (at its ends and standing in it), fillers and the worktop. Cabinets are clickable (they select the element); keyboard and
 * assistive tech use the element list next to it, so the drawing itself is one image.
 *
 * The island is drawn mirrored (as seen from the room, towards wall A) — see meta.isFlipped.
 * Heights come from plan.heights (worktop 85 / 90 / 95, wall units, the top row and cornice of "do stropa"); a tall unit
 * in one piece up to the ceiling (plan.ts tallSplitOf) has no split line.
 */
import { useState } from "react";
import { DIM, tallSplitOf, type KitchenPlan, type PlanSlot, type RunId } from "@/lib/studio/plan";
import { cornerFoot, moduleDef } from "@/lib/studio/catalog";
import { ModuleGlyph } from "./icons";
import { isFlipped, islandWord, runName } from "./meta";

const ACCENT = "#C9B99A";

export function RunElevation({
  plan,
  run,
  selected = null,
  onPick,
  onHover,
  boxWidth = 336,
  boxHeight = 132,
  className = "",
}: {
  plan: KitchenPlan;
  run: RunId;
  selected?: string | null;
  onPick?: (slotId: string) => void;
  /** the pointer is over a cabinet (null: left the drawing) — e.g. to light it up in 3D */
  onHover?: (slotId: string | null) => void;
  /** the rendered size in px (to decide whether a cabinet is big enough for its little drawing) */
  boxWidth?: number;
  boxHeight?: number;
  className?: string;
}) {
  const [hover, setHoverState] = useState<string | null>(null);
  const setHover = (id: string | null) => {
    setHoverState(id);
    onHover?.(id);
  };
  const isl = run === "isl";
  const len = isl ? (plan.island?.length ?? 0) : plan.cfg.walls[run];
  if (!len) return null;
  const flip = isFlipped(run);
  const hp = plan.heights;
  const worktop = hp.worktop;
  const baseTop = worktop - DIM.worktopT;
  // wall units with the top row of "do stropa" on them, the tall column to its own top
  const upperTop = hp.topRow ? hp.topRow.to : hp.upperTop;
  const cornice = hp.cornice;
  const top = isl ? worktop + 8 : Math.min(plan.ceiling, Math.max(hp.top, upperTop, plan.window?.top ?? 0) + 14);
  const mx = Math.max(6, len * 0.025);
  const vbW = len + mx * 2;
  const vbH = top + 8;
  const scale = Math.min(boxWidth / vbW, boxHeight / vbH);
  const Y = (y: number) => top - y;
  const X = (x: number, w: number) => (flip ? len - x - w : x);

  const slots = plan.slots.filter((s) => s.run === run);
  const pieces = plan.pieces.filter((p) => p.run === run);
  const win = !isl && plan.window && plan.window.wall === run ? plan.window : null;
  const runPlan = isl ? null : plan.runs.find((r) => r.wall === run);

  const zoneY = (z: PlanSlot["zone"] | "filler-base" | "filler-upper" | "filler-tall"): [number, number] => {
    if (z === "upper" || z === "filler-upper") return [hp.upperBottom, upperTop];
    if (z === "tall" || z === "filler-tall") return [hp.plinth, hp.tallTop];
    return [hp.plinth, baseTop];
  };

  // the part of wall A's corner unit that reaches along walls B / C (a blind corner 60 cm, an L / diagonal unit 90 cm)
  const cornerZones: { x: number; w: number; y0: number; y1: number }[] = [];
  if (run === "b" || run === "c") {
    const atEnd = run === "b";
    const corner = (id: string) => plan.slots.find((s) => s.cornerId === id);
    const base = corner(atEnd ? "base-l" : "base-r");
    const up = corner(atEnd ? "upper-l" : "upper-r");
    if (base) {
      const w = cornerFoot("base", base.type).across;
      cornerZones.push({ x: atEnd ? len - w : 0, w, y0: hp.plinth, y1: baseTop });
    }
    if (up) {
      const w = cornerFoot("upper", up.type).across;
      cornerZones.push({ x: atEnd ? len - w : 0, w, y0: hp.upperBottom, y1: upperTop });
    }
  }

  const counts = { base: 0, upper: 0, tall: 0, island: 0 };
  for (const s of slots) if (!moduleDef(s.zone, s.type)?.spacer) counts[s.zone]++;
  const aria = isl
    ? `${islandWord(plan.cfg.layout)}, ${Math.round(len)} cm: ${counts.island} elemenata`
    : `${runName(run)}, ${len} cm: ${counts.base} donjih, ${counts.upper} gornjih${counts.tall ? `, ${counts.tall} visokih` : ""} elemenata${win ? ", prozor" : ""}`;

  return (
    <svg
      viewBox={`${-mx} 0 ${vbW} ${vbH}`}
      preserveAspectRatio="xMidYMax meet"
      role="img"
      aria-label={aria}
      className={className}
      onPointerLeave={() => setHover(null)}
    >
      {/* the wall */}
      {!isl && <rect x={0} y={Y(top)} width={len} height={top} fill="rgba(242,239,233,.025)" />}
      <line x1={-mx} x2={len + mx} y1={Y(0)} y2={Y(0)} stroke="rgba(242,239,233,.35)" strokeWidth={1} vectorEffect="non-scaling-stroke" />

      {win && (
        <g>
          <rect
            x={win.offset}
            y={Y(win.top)}
            width={win.width}
            height={win.top - win.sill}
            fill="rgba(201,185,154,.07)"
            stroke="rgba(201,185,154,.55)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
          <line
            x1={win.offset + win.width / 2}
            x2={win.offset + win.width / 2}
            y1={Y(win.top)}
            y2={Y(win.sill)}
            stroke="rgba(201,185,154,.35)"
            strokeWidth={1}
            vectorEffect="non-scaling-stroke"
          />
        </g>
      )}

      {cornerZones.map((c, i) => (
        <rect
          key={`k${i}`}
          x={c.x}
          y={Y(c.y1)}
          width={c.w}
          height={c.y1 - c.y0}
          fill="rgba(242,239,233,.03)"
          stroke="rgba(242,239,233,.18)"
          strokeDasharray="3 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* the kitchen run on the room's wall: bare wall beyond it, bare floor it leaves (an edited run) */}
      {runPlan && runPlan.kitchen.from > 0.5 && (
        <line x1={0} x2={runPlan.kitchen.from} y1={Y(0) - 1.5} y2={Y(0) - 1.5} stroke="rgba(242,239,233,.2)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      )}
      {runPlan && runPlan.kitchen.to < len - 0.5 && (
        <line x1={runPlan.kitchen.to} x2={len} y1={Y(0) - 1.5} y2={Y(0) - 1.5} stroke="rgba(242,239,233,.2)" strokeWidth={1} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      )}
      {runPlan?.free.map((f, i) => (
        <rect
          key={`free${i}`}
          x={f.from + 0.6}
          y={Y(baseTop)}
          width={Math.max(0.5, f.to - f.from - 1.2)}
          height={baseTop - hp.plinth}
          rx={1.2}
          fill="none"
          stroke="rgba(201,185,154,.45)"
          strokeDasharray="3 3"
          strokeWidth={1}
          vectorEffect="non-scaling-stroke"
        />
      ))}

      {/* worktop: its pieces (a tall unit standing in the run interrupts it — RunPlan.worktops) */}
      {isl ? (
        <rect x={0} y={Y(worktop)} width={len} height={DIM.worktopT} fill="rgba(242,239,233,.32)" />
      ) : (
        (runPlan?.worktops ?? (runPlan?.worktop ? [runPlan.worktop] : [])).map((w, i) => (
          <rect key={`w${i}`} x={w.from} y={Y(worktop)} width={w.to - w.from} height={4} fill="rgba(242,239,233,.32)" />
        ))
      )}

      {/* fillers and end panels */}
      {pieces.map((p, i) => {
        const [y0, y1] = zoneY(`filler-${p.zone}`);
        return (
          <rect
            key={`p${i}`}
            x={X(p.x, p.width)}
            y={Y(y1)}
            width={p.width}
            height={y1 - y0}
            fill="rgba(242,239,233,.12)"
          />
        );
      })}

      {/* "do stropa": the cornice strip from the cabinets' top line to the ceiling */}
      {!isl &&
        cornice &&
        hp.cornices
          .filter((c) => c.run === run && c.to > c.from)
          .map((c, i) => (
            <rect
              key={`c${i}`}
              x={X(c.from, c.to - c.from)}
              y={Y(cornice.to)}
              width={c.to - c.from}
              height={cornice.to - cornice.from}
              fill="rgba(242,239,233,.1)"
            />
          ))}

      {/* cabinets */}
      {slots.map((s) => {
        const def = moduleDef(s.zone, s.type);
        const spacer = Boolean(def?.spacer);
        const [y0, y1] = zoneY(s.zone);
        const x = X(s.x, s.width);
        const h = y1 - y0;
        const on = s.id === selected;
        const hot = s.id === hover;
        const g = Math.min(s.width * 0.62, h * 0.62, 44);
        const showGlyph = g * scale >= 13 && s.width >= 25;
        // the line a tall unit is split on ("do stropa": the unit + its top box) — none when it is in one piece
        const split = s.zone === "tall" ? tallSplitOf(plan.cfg, hp, s.opt) : null;
        return (
          <g
            key={s.id}
            onClick={onPick ? () => onPick(s.id) : undefined}
            onPointerEnter={() => setHover(s.id)}
            style={{ cursor: onPick ? "pointer" : undefined, color: on ? ACCENT : hot ? "rgba(242,239,233,.85)" : "rgba(242,239,233,.5)" }}
          >
            <rect
              x={x + 0.6}
              y={Y(y1)}
              width={Math.max(0.5, s.width - 1.2)}
              height={h}
              rx={1.2}
              fill={on ? "rgba(201,185,154,.22)" : spacer ? (hot ? "rgba(242,239,233,.05)" : "transparent") : hot ? "rgba(242,239,233,.14)" : "rgba(242,239,233,.07)"}
              stroke={on ? ACCENT : spacer ? "rgba(242,239,233,.28)" : hot ? "rgba(242,239,233,.7)" : "rgba(242,239,233,.34)"}
              strokeWidth={on ? 1.6 : 1}
              strokeDasharray={spacer && !on ? "3 3" : undefined}
              vectorEffect="non-scaling-stroke"
              style={{ transition: "fill .3s cubic-bezier(.2,.8,.2,1), stroke .3s cubic-bezier(.2,.8,.2,1)" }}
            />
            {/* the top row on a wall unit / the top box on a tall unit ("do stropa") */}
            {!spacer && ((s.zone === "upper" && hp.topRow) || split !== null) && (
              <line
                x1={x + 0.6}
                x2={x + s.width - 0.6}
                y1={Y(s.zone === "upper" ? hp.upperTop : (split ?? hp.tallTop))}
                y2={Y(s.zone === "upper" ? hp.upperTop : (split ?? hp.tallTop))}
                stroke="currentColor"
                strokeOpacity={0.55}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            )}
            {showGlyph && !spacer && (
              <ModuleGlyph type={s.type} zone={s.zone} x={x + (s.width - g) / 2} y={Y(y0 + (h + g) / 2)} width={g} height={g} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
