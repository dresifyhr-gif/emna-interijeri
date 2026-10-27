"use client";

/**
 * "3D | Tlocrt | Nacrt" in the top-left corner of the kitchen view (under the top bar; on a phone with 40 px targets),
 * and for "Nacrt" the elevation to show: the walls of the layout and the island / peninsula. Both are radio groups (the
 * arrow keys move and pick); the choice is remembered for the visit (viewMode.ts).
 */
import { motion } from "framer-motion";
import type { Layout } from "@/lib/studio/types";
import { Segmented } from "./controls";
import { CubeIcon, ElevationIcon, PlanIcon } from "./icons";
import { EASE, islandWord } from "./meta";
import { loadDrawings, type NacrtPick, type StudioView } from "./viewMode";

/** the rows' geometry (px): the gap under the top bar, one row, the gap between rows */
export const VIEW_DOCK = { desktop: { top: 12, row: 42, gap: 8 }, docked: { top: 8, row: 50, gap: 6 } } as const;

const prefetch = () => {
  void loadDrawings().catch(() => {});
};

/** px the dock takes under the top bar */
export function viewDockHeight(docked: boolean, nacrt: boolean): number {
  const g = docked ? VIEW_DOCK.docked : VIEW_DOCK.desktop;
  return g.top + g.row + (nacrt ? g.gap + g.row : 0);
}

export function ViewSwitch({
  view,
  onView,
  nacrt,
  walls,
  onNacrt,
  layout,
  docked,
  shown,
  reduce,
}: {
  view: StudioView;
  onView: (v: StudioView) => void;
  nacrt: NacrtPick;
  /** the elevations this kitchen has */
  walls: readonly NacrtPick[];
  onNacrt: (w: NacrtPick) => void;
  layout: Layout;
  docked: boolean;
  /** the UI is in */
  shown: boolean;
  reduce: boolean;
}) {
  const g = docked ? VIEW_DOCK.docked : VIEW_DOCK.desktop;
  const btn = docked ? "[&_button]:h-10 max-[359px]:[&_button]:px-1.5" : "";
  const icon = docked ? "hidden" : "h-3.5 w-3.5";
  return (
    <motion.div
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : -6 }}
      transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
      inert={!shown}
      // the drawings load a moment before "Tlocrt" / "Nacrt" is chosen
      onPointerEnter={prefetch}
      onFocus={prefetch}
      className={`absolute z-[30] flex flex-col items-start ${shown ? "" : "pointer-events-none"}`}
      style={{ top: `calc(var(--studio-inset-top, ${docked ? 56 : 72}px) + ${g.top}px)`, left: docked ? 12 : 32, gap: g.gap }}
    >
      <div className="rounded-full bg-ink-900/60 shadow-[0_12px_40px_-18px_rgba(0,0,0,.9)] backdrop-blur-md">
        <Segmented
          label="Prikaz kuhinje"
          size="sm"
          className={`${docked ? "w-[180px] max-[359px]:w-[164px]" : "w-[258px]"} ${btn}`}
          options={[
            {
              id: "3d" as const,
              label: (
                <>
                  <CubeIcon className={icon} />
                  3D
                </>
              ),
              aria: "3D prikaz",
            },
            {
              id: "tlocrt" as const,
              label: (
                <>
                  <PlanIcon className={icon} />
                  Tlocrt
                </>
              ),
              aria: "Tlocrt: kuhinja odozgo, s mjerama",
            },
            {
              id: "nacrt" as const,
              label: (
                <>
                  <ElevationIcon className={icon} />
                  Nacrt
                </>
              ),
              aria: "Nacrt: zid sprijeda, s mjerama",
            },
          ]}
          value={view}
          onChange={onView}
        />
      </div>
      {view === "nacrt" && (
        <div
          className="rounded-full bg-ink-900/60 shadow-[0_12px_40px_-18px_rgba(0,0,0,.9)] backdrop-blur-md"
          style={{ width: walls.reduce((n, w) => n + (w === "isl" ? (docked ? 76 : 84) : docked ? 44 : 64), 10) }}
        >
          <Segmented
            label="Koji zid"
            size="sm"
            className={`w-full ${btn}`}
            options={walls.map((w) => ({
              id: w,
              label: w === "isl" ? islandWord(layout) : docked ? w.toUpperCase() : `Zid ${w.toUpperCase()}`,
              aria: w === "isl" ? `${islandWord(layout)}, radna strana` : `Zid ${w.toUpperCase()}`,
            }))}
            value={nacrt}
            onChange={onNacrt}
          />
        </div>
      )}
    </motion.div>
  );
}
