"use client";

/**
 * "3D | Tlocrt | Nacrt" in the top-left corner of the kitchen view (under the top bar; on a phone with 40 px targets),
 * and under it a second row:
 *
 *   3D     where the camera stands (optionsModel CAMERA_PRESETS → StudioEngineApi.setView): "3D studio" (orbiting the
 *          kitchen), "Iz prostorije" (from the room's entrance at eye level, a wide lens — a view like a photo of the
 *          kitchen), "Frontalno" (straight at wall A), "Odozgo" — every one can still be turned and zoomed; picking the
 *          one already chosen puts the camera back to it. Where the camera stands under the ceiling ("Iz prostorije",
 *          "Frontalno") a "Strop" toggle shows the room's ceiling with its light (KitchenConfig.room.ceiling / lamp —
 *          part of the kitchen's link; the finer switches are in "Boje" → "Zidovi, pod i strop").
 *   Nacrt  the elevation to show: the walls of the layout and the island / peninsula.
 *
 * All are radio groups (the arrow keys move and pick); the choices are remembered for the visit (viewMode.ts). On a phone
 * the 3D view is short: the camera row waits behind a button at the end of the first row (its icon shows the preset
 * chosen) and opens under it while wanted (`cameraOpen`).
 *
 * On a desktop the second row goes beside the first when the kitchen view is wide enough (it wraps under it otherwise);
 * the switch reports its height (`onHeight`) and the studio keeps the 3D kitchen framed below it (--studio-inset-top), so
 * the rows never lie over the kitchen. It stands right under the top bar, whatever that inset is.
 */
import { motion } from "framer-motion";
import { useEffect, useId, useRef } from "react";
import type { Layout, ViewPreset } from "@/lib/studio/types";
import { Segmented } from "./controls";
import { CameraGlyph, CeilingIcon, CubeIcon, ElevationIcon, PlanIcon } from "./icons";
import { EASE, islandWord } from "./meta";
import { CAMERA_PRESETS, cameraPresetDef } from "./optionsModel";
import { TOPBAR_H } from "./TopBar";
import { VIEW_DOCK, loadDrawings, type NacrtPick, type StudioView } from "./viewMode";

const prefetch = () => {
  void loadDrawings().catch(() => {});
};

const PILL = "rounded-full bg-ink-900/60 shadow-[0_12px_40px_-18px_rgba(0,0,0,.9)] backdrop-blur-md";

export function ViewSwitch({
  view,
  onView,
  nacrt,
  walls,
  onNacrt,
  layout,
  camera,
  onCamera,
  cameraShown,
  cameraOpen,
  onCameraOpen,
  ceiling,
  onCeiling,
  docked,
  shown,
  reduce,
  onHeight,
}: {
  view: StudioView;
  onView: (v: StudioView) => void;
  nacrt: NacrtPick;
  /** the elevations this kitchen has */
  walls: readonly NacrtPick[];
  onNacrt: (w: NacrtPick) => void;
  layout: Layout;
  /** the 3D camera preset */
  camera: ViewPreset;
  /** a preset was picked (also the one already chosen: the camera goes back to it) */
  onCamera: (p: ViewPreset) => void;
  /** the 3D view works (the presets row shows in 3D) */
  cameraShown: boolean;
  /** phone: the presets row is open (on a desktop it always is) */
  cameraOpen: boolean;
  onCameraOpen: (open: boolean) => void;
  /** the room's ceiling is shown (KitchenConfig.room.ceiling) */
  ceiling: boolean;
  onCeiling: (on: boolean) => void;
  docked: boolean;
  /** the UI is in */
  shown: boolean;
  reduce: boolean;
  /** the switch's height (px, its rows and the gap between them) whenever it changes */
  onHeight?: (h: number) => void;
}) {
  const g = docked ? VIEW_DOCK.docked : VIEW_DOCK.desktop;
  const btn = docked ? "[&_button]:h-10 max-[359px]:[&_button]:px-1.5" : "";
  const icon = docked ? "hidden" : "h-3.5 w-3.5";
  const presets = view === "3d" && cameraShown && (!docked || cameraOpen);
  const ceilingShown = presets && cameraPresetDef(camera).ceiling;
  const rowId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  const heightCb = useRef(onHeight);
  useEffect(() => {
    heightCb.current = onHeight;
  });
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    let last = -1;
    const report = () => {
      const h = Math.round(el.offsetHeight);
      if (h === last) return;
      last = h;
      heightCb.current?.(h);
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div
      ref={boxRef}
      initial={false}
      animate={{ opacity: shown ? 1 : 0, y: shown ? 0 : -6 }}
      transition={{ duration: reduce ? 0 : 0.9, ease: EASE }}
      inert={!shown}
      // the drawings load a moment before "Tlocrt" / "Nacrt" is chosen
      onPointerEnter={prefetch}
      onFocus={prefetch}
      className={`absolute z-[30] flex ${docked ? "flex-col items-start" : "flex-row flex-wrap items-center"} ${shown ? "" : "pointer-events-none"}`}
      style={{
        top: (docked ? TOPBAR_H.mobile : TOPBAR_H.desktop) + g.top,
        left: docked ? 12 : 32,
        gap: g.gap,
        // desktop: as wide as the kitchen view leaves (the settings panel on the right) — the second row wraps when it must
        maxWidth: docked ? undefined : "calc(100vw - var(--studio-inset-right, 0px) - 56px)",
      }}
    >
      <div className="flex items-center" style={{ gap: 6 }}>
        <div className={PILL}>
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
        {docked && view === "3d" && cameraShown && (
          <button
            type="button"
            aria-expanded={cameraOpen}
            aria-controls={rowId}
            aria-label={`Pogled: ${cameraPresetDef(camera).name}`}
            title="Odakle gledate kuhinju"
            onClick={() => onCameraOpen(!cameraOpen)}
            className={`${PILL} flex h-[50px] w-[50px] items-center justify-center border transition-colors duration-300 ease-premium ${
              cameraOpen ? "border-white/30 text-fg" : camera !== "studio" ? "border-accent/60 text-accent" : "border-white/10 text-fg/70"
            }`}
          >
            <CameraGlyph preset={camera} className="h-5 w-5" />
          </button>
        )}
      </div>
      {presets && (
        <div id={rowId} className="flex items-center" style={{ gap: docked ? 6 : 8 }}>
          <div className={PILL}>
            <Segmented
              label="Pogled u 3D prikazu"
              size="sm"
              fit
              className={btn}
              options={CAMERA_PRESETS.map((c) => ({
                id: c.id,
                label: (
                  <>
                    <CameraGlyph preset={c.id} className={icon} />
                    {docked ? c.short : c.name}
                  </>
                ),
                aria: c.aria,
                title: c.aria,
              }))}
              value={camera}
              onChange={onCamera}
            />
          </div>
          {ceilingShown && (
            <button
              type="button"
              aria-pressed={ceiling}
              aria-label="Strop i stropno svjetlo"
              title={ceiling ? "Sakrij strop" : "Prikaži strop sa stropnim svjetlom"}
              onClick={() => onCeiling(!ceiling)}
              className={`${PILL} inline-flex items-center justify-center gap-1.5 border text-[11.5px] font-medium tracking-wide transition-colors duration-300 ease-premium ${
                docked ? "h-[50px] w-[50px]" : "h-[42px] px-3.5"
              } ${ceiling ? "border-accent/70 text-accent" : "border-white/10 text-fg/70 hover:border-white/25 hover:text-fg"}`}
            >
              <CeilingIcon className="h-4 w-4" />
              {!docked && "Strop"}
            </button>
          )}
        </div>
      )}
      {view === "nacrt" && (
        <div className={PILL} style={{ width: walls.reduce((n, w) => n + (w === "isl" ? (docked ? 76 : 84) : docked ? 44 : 64), 10) }}>
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
