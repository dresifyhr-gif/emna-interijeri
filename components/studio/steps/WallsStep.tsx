"use client";

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useState } from "react";
import { limitsFor, wallsFor } from "@/lib/studio/plan";
import type { WallId, WindowSpec } from "@/lib/studio/types";
import { Notes, NumberField, Segmented, SectionLabel, ToggleRow } from "../controls";
import { islandLimits, windowLimits } from "../limits";
import { EASE, WALL_HINT } from "../meta";
import { WallSchematic, type SchematicFocus } from "../WallSchematic";
import type { StepProps } from "./types";

export function WallsStep({ cfg, plan, update }: StepProps) {
  const reduce = useReducedMotion();
  const [focus, setFocus] = useState<SchematicFocus>(null);
  const used = wallsFor(cfg.layout);
  const lim = limitsFor(cfg.layout);
  const win = cfg.window && used.includes(cfg.window.wall) ? cfg.window : null;

  const active = (k: SchematicFocus) => (on: boolean) => setFocus((f) => (on ? k : f === k ? null : f));

  const setWall = (w: WallId, v: number) => update({ walls: { ...cfg.walls, [w]: v } });
  const setWindow = (patch: Partial<WindowSpec>) => {
    if (!win) return;
    update({ window: { ...win, ...patch } });
  };
  const toggleWindow = (on: boolean) => {
    if (!on) return update({ window: null });
    const wall: WallId = "a";
    const len = cfg.walls[wall];
    const width = Math.min(100, len - 40);
    update({ window: { wall, width, offset: Math.round((len - width) / 2), sill: 95 } });
  };

  const winLen = win ? cfg.walls[win.wall] : 0;
  // the planner's own ranges (wall − 10 cm, sill 40 cm under the window top), so the field never shows a number the plan ignores
  const winLim = win ? windowLimits(cfg, win.wall) : null;
  // at most wall A + 40 cm: longer islands can no longer be centred on the wall run
  const island = islandLimits(cfg);

  return (
    <div>
      <div className="relative -mx-1 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/40">
        <WallSchematic plan={plan} focus={focus} className="block h-auto w-full" />
        <p className="pointer-events-none absolute left-3.5 top-3 text-[9.5px] font-medium uppercase tracking-[0.24em] text-mut/80">Tlocrt</p>
      </div>

      <SectionLabel className="mt-7">Duljina zidova</SectionLabel>
      <div className="mt-4 space-y-5">
        {used.map((w) => (
          <NumberField
            key={w}
            label={`Zid ${w.toUpperCase()}`}
            sub={used.length > 1 ? WALL_HINT[w] : undefined}
            value={cfg.walls[w]}
            min={lim[w][0]}
            max={lim[w][1]}
            onChange={(v) => setWall(w, v)}
            onActive={active(w)}
          />
        ))}
        <NumberField
          label="Visina stropa"
          value={cfg.ceiling}
          min={lim.ceiling[0]}
          max={lim.ceiling[1]}
          onChange={(v) => update({ ceiling: v })}
          onActive={active("ceiling")}
        />
      </div>

      {cfg.layout === "otok" && (
        <>
          <SectionLabel className="mt-8">Otok</SectionLabel>
          <NumberField
            className="mt-4"
            label="Duljina otoka"
            value={cfg.island}
            min={island[0]}
            max={island[1]}
            onChange={(v) => update({ island: v })}
            onActive={active("island")}
            hint="S pločom koja se s obje strane spušta do poda i mjestom za sjedenje."
          />
        </>
      )}

      <SectionLabel className="mt-8">Prozor</SectionLabel>
      <div className="mt-4">
        <ToggleRow
          title="Na zidu kuhinje je prozor"
          description="Gornji elementi se ispred prozora izostavljaju, donji i radna ploča nastavljaju ispod njega."
          checked={Boolean(win)}
          onChange={toggleWindow}
        >
          <AnimatePresence initial={false}>
            {win && (
              <motion.div
                key="window"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1, transition: { duration: reduce ? 0 : 0.55, ease: EASE } }}
                exit={{ height: 0, opacity: 0, transition: { duration: reduce ? 0 : 0.35, ease: EASE } }}
                className="overflow-hidden"
              >
                <div
                  className="space-y-5 pt-5"
                  onPointerEnter={() => setFocus("window")}
                  onPointerLeave={() => setFocus(null)}
                  onFocus={() => setFocus("window")}
                >
                  {used.length > 1 && (
                    <div>
                      <p id="studio-window-wall" className="mb-2.5 text-[13px] text-fg">
                        Na kojem zidu
                      </p>
                      <Segmented
                        labelledBy="studio-window-wall"
                        options={used.map((w) => ({ id: w, label: `Zid ${w.toUpperCase()}`, aria: `Zid ${w.toUpperCase()}, ${WALL_HINT[w]}` }))}
                        value={win.wall}
                        onChange={(w) => setWindow({ wall: w })}
                        size="sm"
                      />
                    </div>
                  )}
                  <NumberField
                    label="Udaljenost od lijevog ruba"
                    hint="Od lijevog kraja zida do prozora, gledano prema zidu."
                    value={win.offset}
                    min={0}
                    max={Math.max(0, winLen - win.width)}
                    onChange={(v) => setWindow({ offset: v })}
                  />
                  <NumberField
                    label="Širina prozora"
                    value={win.width}
                    min={winLim?.width[0] ?? lim.windowWidth[0]}
                    max={winLim?.width[1] ?? lim.windowWidth[1]}
                    onChange={(v) => setWindow({ width: v, offset: Math.min(win.offset, Math.max(0, winLen - v)) })}
                  />
                  <NumberField
                    label="Visina parapeta"
                    hint="Od poda do donjeg ruba prozora."
                    value={win.sill}
                    min={winLim?.sill[0] ?? lim.sill[0]}
                    max={winLim?.sill[1] ?? lim.sill[1]}
                    onChange={(v) => setWindow({ sill: v })}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </ToggleRow>
      </div>

      <p className="mt-6 text-[12.5px] leading-relaxed text-mut">
        Elementi koje ste uredili ostaju na svom mjestu. Ako neki više ne stane uz nove mjere, ovdje ćete vidjeti napomenu.
      </p>
      <Notes items={plan.warnings} />
    </div>
  );
}
