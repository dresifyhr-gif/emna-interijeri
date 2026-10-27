"use client";

/**
 * "Zidovi" — the room and the kitchen in it, as two clearly separate things (the owner: "zidovi prostora je jedno, a
 * dužina kuhinje je drugo"):
 *
 *   Prostorija           the floor plan, the room's wall lengths and the window — a room measure (no undo step, like
 *                        before); a kitchen that takes a whole wall follows that wall (sanitizeConfig / setWallLength).
 *                        A room wall with no kitchen (KitchenConfig.room.bare — an L kitchen in a closed room) is added
 *                        with "+ Zid C" and taken away again ("otvoren prostor"): edit.ts setBareWall, an undo step
 *   Kuhinja na zidovima  per wall: whether the kitchen takes the whole wall, else how long it is and how far from the
 *                        chosen end of the wall it starts (lib/studio/edit.ts kitchenExtent / setKitchenExtent, one undo
 *                        step per gesture), with a bar that shows the kitchen inside the wall; "Bez kuhinje na zidu B"
 *                        takes the kitchen off a wall and keeps the room's wall (setWallKitchen: L → ravna, U → L …),
 *                        "Dodaj kuhinju" on a bare wall puts it back (room.ts roomWallRows offers each only where it
 *                        goes through); then the island's / peninsula's length
 *   Strop i visine       the ceiling, the top of the tall column right under it (with why it cannot go higher and
 *                        "Podigni strop na X cm"), "Kuhinja do stropa", tall units in one piece, the top row's height
 *                        and depth, worktop → wall units, the worktop, wall-unit heights (HeightsSection)
 *
 * What a change caused (a kitchen run moved off a corner, an element left out) stays next to the control that caused it
 * until the room changes again; the planner's other notes are listed at the end. "Jednostavno" leaves out the window
 * sill, the kitchen's distance from the end of its wall and the finer heights (each stays while it is not the default).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useMemo, useState } from "react";
import { kitchenExtent, setBareWall, setKitchenExtent, wallLimits, type EditResult, type ExtentResult } from "@/lib/studio/edit";
import { geometryKey, hasIsland, isPeninsula, limitsFor, planHeights, wallsFor } from "@/lib/studio/plan";
import type { KitchenConfig, WallId, WindowSpec } from "@/lib/studio/types";
import { MoreOptions, Notes, NumberField, Segmented, SectionLabel, Switch, ToggleRow } from "../controls";
import { KitchenBar } from "../KitchenBar";
import { MinusIcon, PlusIcon } from "../icons";
import { roomWallRows, shorterKitchen } from "../room";
import { fitToPlanner, windowLimits } from "../limits";
import { EASE, WALL_HINT, isRoomCorner, islandOf, islandWord, stepIndex, wallEndName } from "../meta";
import { WallSchematic, type SchematicFocus } from "../WallSchematic";
import { HeightsSection } from "./HeightsSection";
import type { StepProps } from "./types";

/** the notes of the last change made here, for the room it produced and the control that made it */
interface LastNotes {
  key: string;
  where: string;
  items: string[];
}

export function WallsStep({ cfg, plan, update, edit, engine, goTo, advanced }: StepProps) {
  const reduce = useReducedMotion();
  const [focus, setFocus] = useState<SchematicFocus>(null);
  const [last, setLast] = useState<LastNotes | null>(null);
  const used = wallsFor(cfg.layout);
  const lim = limitsFor(cfg.layout);
  const win = cfg.window && used.includes(cfg.window.wall) ? cfg.window : null;

  const active = (k: SchematicFocus) => (on: boolean) => setFocus((f) => (on ? k : f === k ? null : f));

  // notes kept next to their control; the list at the end has the rest
  const kept = useMemo(() => planHeights(cfg).notes, [cfg]);
  const roomKey = geometryKey(cfg);
  const freshOf = (where: string) => (last && last.key === roomKey && last.where === where ? last.items.filter((n) => !kept.includes(n)) : []);
  const shownNear = new Set([...(last && last.key === roomKey ? last.items : []), ...kept]);
  const rest = plan.warnings.filter((w) => !shownNear.has(w));
  const remember = useCallback((where: string, items: string[], next: KitchenConfig) => setLast({ key: geometryKey(fitToPlanner(next)), where, items }), []);
  const onHeightNotes = useCallback((items: string[], next: KitchenConfig) => remember("heights", items, next), [remember]);

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

  // the room's walls: the kitchen's, the bare ones and the ones a bare wall can still go on (room.ts roomWallRows)
  const rows = useMemo(() => roomWallRows(cfg), [cfg]);
  const roomCount = rows.filter((w) => w.kitchen || w.bare).length;
  const addable = rows.filter((w) => !w.kitchen && !w.bare && w.canBare);
  const toggleBare = (w: WallId, on: boolean) =>
    edit(setBareWall(cfg, w, on), { say: on ? `Dodan je zid ${w.toUpperCase()} prostorije, bez kuhinje.` : `Bez zida ${w.toUpperCase()}: prostor je s te strane otvoren.` });

  const winLen = win ? cfg.walls[win.wall] : 0;
  // the planner's own ranges (wall − 10 cm, sill 40 cm under the window top), so the field never shows a number the plan ignores
  const winLim = win ? windowLimits(cfg, win.wall) : null;
  const island = hasIsland(cfg.layout) ? wallLimits(cfg, "isl") : null;
  const pen = isPeninsula(cfg.layout);

  return (
    <div>
      {/* ================================================================ the room */}
      <PartHeading n="1" title="Prostorija" lead="Duljine zidova i prozor." />

      <div className="relative -mx-1 mt-5 overflow-hidden rounded-2xl border border-white/10 bg-ink-900/40">
        <WallSchematic plan={plan} focus={focus} className="block h-auto w-full" />
        <p className="pointer-events-none absolute left-3.5 top-3 text-[9.5px] font-medium uppercase tracking-[0.24em] text-mut/80">Tlocrt</p>
        <SchematicKey />
      </div>

      <SectionLabel className="mt-7">Zidovi prostorije</SectionLabel>
      {engine && <p className="mt-2.5 text-[12px] leading-snug text-mut">Ili kliknite sivu kotu u 3D prikazu.</p>}
      <div className="mt-4 space-y-5">
        {rows
          .filter((w) => w.kitchen || w.bare)
          .map((w) => (
            <div key={w.wall}>
              <NumberField
                label={`Zid ${w.wall.toUpperCase()}`}
                sub={roomCount > 1 ? WALL_HINT[w.wall] : undefined}
                hint={w.bare ? "Bez kuhinje — dubina prostorije uz ovaj zid." : undefined}
                value={cfg.walls[w.wall]}
                min={lim[w.wall][0]}
                max={lim[w.wall][1]}
                onChange={(v) => setWall(w.wall, v)}
                onActive={active(w.wall)}
              />
              {w.bare && (
                <button
                  type="button"
                  onClick={() => toggleBare(w.wall, false)}
                  className="mt-1.5 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-medium text-mut transition-colors duration-300 hover:text-fg"
                >
                  <MinusIcon className="h-3.5 w-3.5" />
                  Bez zida {w.wall.toUpperCase()} (otvoren prostor)
                </button>
              )}
            </div>
          ))}
        {addable.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {addable.map((w) => (
              <button
                key={w.wall}
                type="button"
                onClick={() => toggleBare(w.wall, true)}
                onPointerEnter={() => setFocus(w.wall)}
                onPointerLeave={() => setFocus((f) => (f === w.wall ? null : f))}
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-dashed border-white/20 px-3.5 text-[12.5px] text-fg/80 transition-colors duration-300 ease-premium hover:border-accent/60 hover:text-fg"
              >
                <PlusIcon className="h-3.5 w-3.5 text-accent" />
                Zid {w.wall.toUpperCase()} <span className="text-mut">({WALL_HINT[w.wall]}, bez kuhinje)</span>
              </button>
            ))}
          </div>
        )}
        {addable.length > 0 && rows.every((w) => !w.bare) && (
          <p className="-mt-2 text-[12px] leading-snug text-mut">Zatvorena prostorija: dodajte zid uz koji ne stoji kuhinja — vidi se u 3D prikazu i na tlocrtu.</p>
        )}
      </div>

      <SectionLabel className="mt-8">Prozor</SectionLabel>
      <div className="mt-4">
        <ToggleRow
          title="Na zidu kuhinje je prozor"
          description="Ispred prozora nema gornjih elemenata."
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
                    label="Od lijevog kraja zida"
                    hint="Do prozora, gledano prema zidu."
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
                  {(advanced || win.sill !== 95) && (
                    <NumberField
                      label="Visina parapeta"
                      hint="Od poda do donjeg ruba prozora."
                      value={win.sill}
                      min={winLim?.sill[0] ?? lim.sill[0]}
                      max={winLim?.sill[1] ?? lim.sill[1]}
                      onChange={(v) => setWindow({ sill: v })}
                    />
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </ToggleRow>
      </div>

      {/* ================================================================ the kitchen on the walls */}
      <PartHeading
        n="2"
        className="mt-12"
        title="Kuhinja na zidovima"
        lead="Kuhinja ne mora zauzeti cijeli zid — ostatak ostaje slobodan."
      />
      <div className="mt-5 space-y-3">
        {used.map((w) => (
          <KitchenOnWall
            key={w}
            cfg={cfg}
            plan={plan}
            wall={w}
            edit={edit}
            many={used.length > 1}
            advanced={advanced}
            focused={focus === `k-${w}`}
            onActive={active(`k-${w}` as SchematicFocus)}
            notes={freshOf(`ext-${w}`)}
            onNotes={(items, next) => remember(`ext-${w}`, items, next)}
            takeOff={rows.find((x) => x.wall === w)?.takeOff ?? null}
          />
        ))}
        {rows
          .filter((w) => w.bare)
          .map((w) => (
            <div key={w.wall} className="flex items-center gap-3 rounded-2xl border border-dashed border-white/[0.14] px-4 py-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-display text-[15px] font-medium leading-tight">
                  Zid {w.wall.toUpperCase()}
                  <span className="ml-1.5 font-sans text-[12.5px] font-normal text-mut">{WALL_HINT[w.wall]}</span>
                </p>
                <p className="mt-1 text-[12px] tabular-nums leading-snug text-mut">Zid {w.length} cm · bez kuhinje</p>
              </div>
              {w.putOn && (
                <button
                  type="button"
                  onClick={() => w.putOn && edit(w.putOn, { notify: true, say: `Kuhinja i na zidu ${w.wall.toUpperCase()}.` })}
                  className="inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border border-white/15 px-3.5 text-[12px] font-medium text-fg/85 transition-colors duration-300 ease-premium hover:border-accent hover:text-accent"
                >
                  <PlusIcon className="h-3.5 w-3.5" />
                  Dodaj kuhinju
                </button>
              )}
            </div>
          ))}
        {island && (
          <div
            className="rounded-2xl border border-white/10 bg-white/[0.02] p-4"
            onPointerEnter={() => setFocus("island")}
            onPointerLeave={() => setFocus((f) => (f === "island" ? null : f))}
          >
            <p className="font-display text-[15px] font-medium leading-tight">{islandWord(cfg.layout)}</p>
            <NumberField
              className="mt-4"
              label={pen ? "Duljina od zida A" : `Duljina ${islandOf(cfg.layout)}`}
              value={cfg.island}
              min={island.min}
              max={island.max}
              onChange={(v) => update({ island: v })}
              onActive={active("island")}
              hint={pen ? "Od zida A do slobodnog kraja." : undefined}
            />
            <button
              type="button"
              onClick={() => goTo(stepIndex("oblik"))}
              className="mt-3 text-[12px] text-fg/80 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent"
            >
              Sudoper, ploča i šank: korak Oblik
            </button>
          </div>
        )}
      </div>

      {/* ================================================================ ceiling and heights */}
      <PartHeading n="3" className="mt-12" title="Strop i visine" lead="Visina stropa i koliko visoko ide kuhinja." />
      <HeightsSection
        cfg={cfg}
        plan={plan}
        update={update}
        edit={edit}
        advanced={advanced}
        fresh={freshOf("heights")}
        kept={kept}
        onNotes={onHeightNotes}
        onCeilingActive={active("ceiling")}
      />

      {!advanced && (
        <MoreOptions
          what="Visina parapeta, razmak kuhinje od kraja zida, vrh visokog stupa, visina radne ploče i gornjih elemenata, razmak od ploče do gornjih elemenata, visina nadgradnih ormarića."
          className="mt-8"
        />
      )}
      <Notes items={rest} className="mt-8" />
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function PartHeading({ n, title, lead, className = "" }: { n: string; title: string; lead: string; className?: string }) {
  return (
    <div className={className}>
      <h3 className="flex items-baseline gap-3 font-display text-[19px] font-medium leading-tight tracking-tight">
        <span aria-hidden="true" className="text-[11px] font-medium tabular-nums tracking-[0.2em] text-accent">
          {n.padStart(2, "0")}
        </span>
        {title}
      </h3>
      <p className="mt-2 text-[12.5px] leading-relaxed text-mut">{lead}</p>
    </div>
  );
}

/** what the schematic's lines mean */
function SchematicKey() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute bottom-2.5 right-3.5 flex items-center gap-3 text-[9.5px] tracking-[0.06em] text-mut/85">
      <span className="flex items-center gap-1.5">
        <span className="h-[2px] w-3 rounded bg-fg/60" />
        zid
      </span>
      <span className="flex items-center gap-1.5">
        <span className="h-2 w-3 rounded-[2px] border border-accent/60 bg-accent/25" />
        kuhinja
      </span>
    </div>
  );
}

/**
 * One wall's kitchen run: the whole wall (it follows the wall), or a length and a distance from the end it is measured
 * from (KitchenExtent). The bar above the fields shows the kitchen inside the room's wall.
 */
function KitchenOnWall({
  cfg,
  plan,
  wall,
  edit,
  many,
  advanced,
  focused,
  onActive,
  notes,
  onNotes,
  takeOff,
}: Pick<StepProps, "cfg" | "plan" | "edit" | "advanced"> & {
  wall: WallId;
  many: boolean;
  focused: boolean;
  onActive: (on: boolean) => void;
  /** what the last change of this wall's kitchen caused */
  notes: string[];
  onNotes: (items: string[], next: KitchenConfig) => void;
  /** "Bez kuhinje": the kitchen off this wall, the room's wall stays (room.ts roomWallRows; null: not possible here) */
  takeOff: EditResult | null;
}) {
  const info = kitchenExtent(cfg, wall);
  if (!info) return null;
  const run = plan.runs.find((r) => r.wall === wall);
  const W = wall.toUpperCase();
  const L = info.room.value;
  const corners = { left: isRoomCorner(cfg.layout, wall, "left"), right: isRoomCorner(cfg.layout, wall, "right") };
  const win = plan.window && plan.window.wall === wall ? { from: plan.window.offset, to: plan.window.offset + plan.window.width } : null;
  const anchorFrom = wallEndName(cfg.layout, wall, info.anchor, true);
  const len = info.length.value;
  // the cabinets (what the kitchen label in 3D measures) when bare floor is left at an open end
  const cab = info.cabinets ? Math.round(info.cabinets.to - info.cabinets.from) : null;
  // "Jednostavno": where the kitchen starts only when it does not start right at the wall's corner end
  const showOffset = advanced || info.offset.value > 0 || !info.anchorIsCorner;

  const apply = (r: ExtentResult, coalesce?: string) => {
    if (edit(r, { coalesce })) onNotes(r.notes, r.cfg);
  };
  // off: the kitchen gets a length of its own, a little shorter than the wall (room.ts shorterKitchen)
  const setFull = (on: boolean) => {
    if (on) return apply(setKitchenExtent(cfg, wall, null));
    const shorter = shorterKitchen(info);
    if (shorter === null) return edit({ cfg, ok: false, warning: `Zid ${W} je prekratak za kraću kuhinju — najkraća kuhinja na njemu je ${info.length.min} cm.`, slotId: null });
    apply(setKitchenExtent(cfg, wall, { length: shorter }));
  };
  const setLength = (v: number) => apply(setKitchenExtent(cfg, wall, { length: v }), `ext-${wall}-len`);
  // a new start keeps the kitchen's length (it moves along the wall) until it reaches the far end
  const setOffset = (v: number) => apply(setKitchenExtent(cfg, wall, { offset: v, length: Math.min(len, L - v) }), `ext-${wall}-off`);
  const setAnchor = (a: "left" | "right") => apply(setKitchenExtent(cfg, wall, { anchor: a }));

  return (
    <div
      className={`rounded-2xl border p-4 transition-colors duration-500 ease-premium ${focused ? "border-accent/45 bg-accent/[0.04]" : "border-white/10 bg-white/[0.02]"}`}
      onPointerEnter={() => onActive(true)}
      onPointerLeave={() => onActive(false)}
      onFocus={() => onActive(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onActive(false);
      }}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <p className="font-display text-[15px] font-medium leading-tight">
            Zid {W}
            {many && <span className="ml-1.5 font-sans text-[12.5px] font-normal text-mut">{WALL_HINT[wall]}</span>}
          </p>
          <p className="mt-1 text-[12px] tabular-nums leading-snug text-mut">
            Zid {L} cm · kuhinja {len} cm{cab !== null && cab < len ? ` · ormarići ${cab} cm` : ""}
          </p>
        </div>
        <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-[12px] text-fg/80">
          <span id={`studio-full-${wall}`}>Cijeli zid</span>
          <Switch id={`studio-full-${wall}-s`} checked={info.full} onChange={setFull} labelledBy={`studio-full-${wall}`} />
        </label>
      </div>

      <KitchenBar
        className="mt-3 block h-auto w-full"
        length={L}
        kitchen={info.kitchen}
        talls={run?.talls ?? []}
        free={run?.free ?? []}
        window={win}
        corners={corners}
        active={focused}
      />

      {info.full ? (
        <p className="mt-2 text-[12px] leading-relaxed text-mut">Kuhinja prati duljinu zida.</p>
      ) : (
        <div className="mt-3 space-y-5">
          <NumberField label="Duljina kuhinje" value={len} min={info.length.min} max={info.length.max} onChange={setLength} />
          {showOffset && (
            <>
              <NumberField
                label="Razmak"
                sub={`od ${anchorFrom}`}
                hint={info.offset.value > 0 ? `Do kuhinje ostaje ${info.offset.value} cm slobodnog zida.` : "Kuhinja počinje odmah uz taj kraj zida."}
                value={info.offset.value}
                min={info.offset.min}
                max={info.offset.max}
                onChange={setOffset}
              />
              <div>
                <p id={`studio-anchor-${wall}`} className="mb-2.5 text-[13px] text-fg">
                  Razmak mjerim od
                </p>
                <Segmented
                  labelledBy={`studio-anchor-${wall}`}
                  options={(["left", "right"] as const).map((sd) => ({
                    id: sd,
                    label: sd === "left" ? "lijevog kraja" : "desnog kraja",
                    aria: `${sd === "left" ? "Lijevog" : "Desnog"} kraja zida: ${wallEndName(cfg.layout, wall, sd)}`,
                  }))}
                  value={info.anchor}
                  onChange={setAnchor}
                  size="sm"
                />
                <p className="mt-2 text-[11.5px] leading-snug text-mut">Lijevo i desno: gledano prema zidu {W}.</p>
              </div>
            </>
          )}
        </div>
      )}
      <div aria-live="polite">{notes.length > 0 && <Notes items={notes} className="mt-4" />}</div>
      {takeOff && (
        <button
          type="button"
          onClick={() => edit(takeOff, { notify: true, say: `Zid ${W} bez kuhinje.` })}
          className="mt-3 inline-flex min-h-9 items-center gap-1.5 text-[12px] font-medium text-mut transition-colors duration-300 hover:text-fg"
        >
          <MinusIcon className="h-3.5 w-3.5" />
          Bez kuhinje na zidu {W}
        </button>
      )}
    </div>
  );
}
