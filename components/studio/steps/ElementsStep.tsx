"use client";

/**
 * "Elementi": every cabinet of the kitchen, wall by wall, without having to click in 3D (important on a phone).
 * A front-view drawing of the wall (clickable) and the rows below it open the element editor; pointing at a row
 * (or focusing it) lights the element up in 3D. A tall unit standing in a wall's base run is listed in the base row, in
 * its place between the cabinets ("visoki"); "Visoki stup" lists the columns at the run's ends.
 *
 * A tall column is an element like any other — there is no switch for it: a "+" (a run's end, between two cabinets),
 * "Zamijeni" or the editor's "Dodaj lijevo / desno" adds one, "Ukloni" on one of its units takes the unit or the whole
 * column away (ElementToolbar / ElementEditor), "Vrati sve elemente na zadano" brings the planner's column back.
 */
import { useEffect } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import { isEdited, setWallShelves } from "@/lib/studio/edit";
import { planGaps, planKitchen, sanitizeConfig, type PlanSlot, type RunId } from "@/lib/studio/plan";
import { elementOptionsText } from "@/lib/studio/summary";
import type { WallId } from "@/lib/studio/types";
import { Notes, Segmented, SectionLabel } from "../controls";
import { ChevronRight, ModuleGlyph, PlusIcon, ResetIcon } from "../icons";
import { isInRunTall, islandWord, rowName, rowSlots, runName, sideHint, type RowZone } from "../meta";
import { RunElevation } from "../RunElevation";
import css from "../studio.module.css";
import type { StepProps } from "./types";

export interface ElementsUi {
  selectedId: string | null;
  /** open the element editor for a slot (from this list: focus moves into the editor) */
  onOpen: (slotId: string) => void;
  /** the pointer / focus is on an element's row or drawing: light it up in 3D (null: none) — must be stable */
  onHover: (slotId: string | null) => void;
  runTab: RunId;
  onRunTab: (run: RunId) => void;
  /** put a wall (base + wall units + its corners), the island or the tall column back to the planner */
  onReset: (run: RunId | "tall") => void;
  onResetAll: () => void;
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export function ElementsStep({ cfg, plan, edit, compact, engine, advanced, elements }: StepProps & { elements: ElementsUi }) {
  const { selectedId, onOpen, onHover, onRunTab, onReset, onResetAll } = elements;
  // nothing stays lit when the step goes away
  useEffect(() => () => onHover(null), [onHover]);
  const runs: RunId[] = [...plan.walls, ...(plan.island ? (["isl"] as const) : [])];
  const run = runs.includes(elements.runTab) ? elements.runTab : runs[0];
  // the main column at a run's end (named below when it stands on another wall); tall units standing in a base run are not it
  const tallSlot = plan.slots.find((s) => s.zone === "tall" && s.list?.id === "tall");
  const tallWall = tallSlot?.run ?? null;
  const anyTall = plan.slots.some((s) => s.zone === "tall");
  /**
   * the planner's column was removed ("Ukloni stup"): one tap brings it back where the planner puts it (one undo step) —
   * refused when it no longer fits (the "+" and "Zamijeni" still add tall units wherever one can stand)
   */
  const bringTallBack = () => {
    const next = sanitizeConfig({ ...cfg, tall: true });
    const fits = planKitchen(next).slots.some((s) => s.zone === "tall" && s.list?.id === "tall");
    edit(
      fits
        ? { cfg: next, ok: true, warning: null, slotId: null }
        : { cfg, ok: false, warning: "Zadani visoki stup uz ove mjere ne stane — visoki element dodajte znakom „+” ili s „Zamijeni”.", slotId: null },
      { notify: true, say: "Zadani visoki stup je vraćen." },
    );
  };

  const rows: RowZone[] = run === "isl" ? ["island"] : ["upper", "base", "tall"];
  const wallEdited =
    run === "isl"
      ? isEdited(cfg, "isl")
      : isEdited(cfg, run) || isEdited(cfg, `${run}:u`) || (run === "a" && Boolean(cfg.corners && Object.keys(cfg.corners).length));
  const len = run === "isl" ? Math.round(plan.island?.length ?? cfg.island) : cfg.walls[run];
  const runPlan = run === "isl" ? null : plan.runs.find((r) => r.wall === run);
  // what the kitchen label in 3D says: the cabinets (bare floor at an open end is not part of them)
  const cab = runPlan ? (runPlan.cabinets ?? runPlan.kitchen) : null;
  const kitchenLen = cab ? Math.round(cab.to - cab.from) : len;
  // a "+" on a free place somewhere in 3D; every full row has one between two elements too (neighbours get narrower,
  // or the new element takes one's place); with none at all the hint says how to make room
  const gapsNow = planGaps(plan);
  const anyFree = gapsNow.some((g) => g.kind !== "seam");
  const anySeam = !anyFree && gapsNow.length > 0;

  return (
    <div>
      {runs.length > 1 && (
        <Segmented
          label="Zid"
          options={runs.map((r) => ({ id: r, label: r === "isl" ? islandWord(cfg.layout) : `Zid ${r.toUpperCase()}`, aria: runName(r, cfg.layout) }))}
          value={run}
          onChange={onRunTab}
          size="sm"
        />
      )}

      <figure className={`relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/40 px-3 pb-2 pt-3 ${runs.length > 1 ? "mt-4" : ""}`}>
        <RunElevation
          plan={plan}
          run={run}
          selected={selectedId}
          onPick={onOpen}
          onHover={onHover}
          boxWidth={compact ? 320 : 312}
          boxHeight={compact ? 112 : 132}
          className={`block w-full ${compact ? "h-[112px]" : "h-[132px]"}`}
        />
        <figcaption className="mt-2 flex items-baseline justify-between gap-3 text-[10.5px] tracking-[0.04em] text-mut">
          <span className="font-medium uppercase tracking-[0.2em] text-fg/70">{runName(run, cfg.layout)}</span>
          <span className="tabular-nums">{kitchenLen < len ? `zid ${len} cm · kuhinja ${kitchenLen} cm` : `${len} cm`}</span>
        </figcaption>
      </figure>
      <p className="mt-2 text-[11px] leading-snug text-mut">{sideHint(run, cfg.layout)}</p>

      {rows.map((z) => {
        const list = rowSlots(plan.slots, run, z);
        if (!list.length) return null;
        const labelId = `studio-row-${run}-${z}`;
        return (
          <div key={z} className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel id={labelId}>{rowName(z, cfg.layout)}</SectionLabel>
              {z === "tall" && isEdited(cfg, "tall") && (
                <button
                  type="button"
                  onClick={() => onReset("tall")}
                  className="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-mut transition-colors hover:text-fg"
                >
                  <ResetIcon className="h-3.5 w-3.5" />
                  Vrati zadano
                </button>
              )}
            </div>
            <ul aria-labelledby={labelId} className="mt-3 space-y-1.5">
              {list.map((sl, i) => (
                <li key={sl.id}>
                  <ElementRow cfg={cfg} slot={sl} index={i} on={sl.id === selectedId} onOpen={onOpen} onHover={onHover} />
                </li>
              ))}
            </ul>
            {/* "Napredno": the wall units of the whole wall as floating shelves (and back) in one go */}
            {z === "upper" && run !== "isl" && (advanced || list.some((sl) => sl.type === "police-visece")) && (
              <WallShelves cfg={cfg} wall={run} has={list.some((sl) => sl.type === "police-visece")} edit={edit} />
            )}
          </div>
        );
      })}

      {run !== "isl" && !rows.some((z) => rowSlots(plan.slots, run, z).length) && (
        <p className="mt-6 text-[12.5px] leading-relaxed text-mut">Na ovom zidu trenutno nema elemenata.</p>
      )}

      {wallEdited && (
        <button
          type="button"
          onClick={() => onReset(run)}
          className="mt-5 inline-flex min-h-10 items-center gap-2 text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
        >
          <ResetIcon className="h-4 w-4" />
          {run === "isl" ? `Vrati zadano za ${islandWord(cfg.layout).toLowerCase()}` : `Vrati zadano za zid ${run.toUpperCase()}`}
        </button>
      )}

      {engine && (
        <p className="mt-7 flex items-center gap-2.5 text-[12px] leading-snug text-mut">
          <span aria-hidden="true" className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-accent/50 text-accent">
            <PlusIcon className="h-3.5 w-3.5" />
          </span>
          {anyFree
            ? "Znak + u 3D prikazu dodaje element — na slobodno mjesto, na kraj kuhinje ili između dva elementa (susjedni se suzi)."
            : anySeam
              ? "Sve je popunjeno: znak + između dva elementa dodaje novi — susjedni se suzi i napravi mu mjesto, a gdje ne može, novi ga zamijeni."
              : "Sve je popunjeno: kliknite element pa + lijevo ili + desno — element se suzi i napravi mjesto novome."}
        </p>
      )}
      {/* the tall column: no switch — added and removed like any other element (the owner: "kako mogu ubaciti stup na drugi zid") */}
      <p className={`text-[12px] leading-snug text-mut ${engine ? "mt-2 pl-[34px]" : "mt-7"}`}>
        Visoki stup (hladnjak, pećnica u visini očiju) dodajete{" "}
        {engine
          ? "znakom „+” ili umjesto postojećeg elementa — kliknite ga pa „Zamijeni”."
          : "s popisa: odaberite element pa „Visoki element umjesto ovoga” ili „Dodaj lijevo / desno”."}
        {anyTall && " Uklanjate ga s „Ukloni” na njegovom elementu."} Aparati nisu u okvirnoj cijeni.
        {!cfg.tall && (
          <>
            {" "}
            <button
              type="button"
              onClick={bringTallBack}
              className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
            >
              Vrati zadani visoki stup
            </button>
            .
          </>
        )}
        {tallWall && tallWall !== run && (
          <>
            {" "}
            <button
              type="button"
              onClick={() => onRunTab(tallWall)}
              className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
            >
              Visoki stup stoji uz {tallWall === "isl" ? islandWord(cfg.layout).toLowerCase() : `zid ${tallWall.toUpperCase()}`}
            </button>
            .
          </>
        )}
      </p>

      {isEdited(cfg) && (
        <button
          type="button"
          onClick={onResetAll}
          className="mt-5 inline-flex min-h-10 items-center gap-2 text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
        >
          <ResetIcon className="h-4 w-4" />
          Vrati sve elemente na zadano
        </button>
      )}

      <Notes items={plan.warnings} />
    </div>
  );
}

/**
 * "Napredno" → the wall units of a whole wall as floating shelves (edit.ts setWallShelves: every wall unit the shelves come
 * in, not the hood or the corner unit), or — once there are some — back to wall units with doors
 */
function WallShelves({ cfg, wall, has, edit }: { cfg: StepProps["cfg"]; wall: WallId; has: boolean; edit: StepProps["edit"] }) {
  return (
    <button
      type="button"
      onClick={() =>
        edit(setWallShelves(cfg, wall, has ? null : {}), {
          notify: true,
          say: has ? `Zid ${wall.toUpperCase()}: gornji elementi s vratima.` : `Zid ${wall.toUpperCase()}: viseće police umjesto gornjih elemenata.`,
        })
      }
      className="mt-2.5 inline-flex min-h-10 items-center gap-2 text-[12px] font-medium text-mut transition-colors duration-300 hover:text-fg"
    >
      <ModuleGlyph type={has ? "vrata" : "police-visece"} zone="upper" className="h-5 w-5" />
      {has ? "Viseće police natrag u elemente s vratima" : "Cijeli zid: viseće police umjesto gornjih elemenata"}
    </button>
  );
}

function ElementRow({
  cfg,
  slot,
  index,
  on,
  onOpen,
  onHover,
}: {
  cfg: StepProps["cfg"];
  slot: PlanSlot;
  index: number;
  on: boolean;
  onOpen: (id: string) => void;
  onHover: (id: string | null) => void;
}) {
  const def = moduleDef(slot.zone, slot.type);
  const spacer = Boolean(def?.spacer);
  const name = slot.corner && def && !def.corner ? `Kutni element: ${lower(def.name)}` : (def?.name ?? slot.type);
  /** a tall unit standing in the base run (listed with the base cabinets) */
  const tall = isInRunTall(slot);
  /** what it has of its own: its glass, opening style, an end unit … (summary.ts) */
  const own = elementOptionsText(cfg, slot);
  return (
    <button
      type="button"
      data-slot-row={slot.id}
      onClick={() => onOpen(slot.id)}
      onPointerEnter={(e) => e.pointerType === "mouse" && onHover(slot.id)}
      onPointerLeave={(e) => e.pointerType === "mouse" && onHover(null)}
      onFocus={() => onHover(slot.id)}
      onBlur={() => onHover(null)}
      aria-label={`${index + 1}. ${name}${tall ? ", visoki element" : ""}, ${Math.round(slot.width)} cm${own ? ` (${own})` : ""}. Uredi.`}
      className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-[border-color,background-color] duration-300 ease-premium ${
        on ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]"
      } ${spacer ? "border-dashed" : ""}`}
    >
      <span aria-hidden="true" className="w-4 shrink-0 text-right text-[10.5px] tabular-nums text-mut">
        {index + 1}
      </span>
      <ModuleGlyph
        type={slot.type}
        zone={slot.zone}
        className={`h-8 w-8 shrink-0 transition-colors duration-300 ${on ? "text-accent" : spacer ? "text-fg/35" : "text-fg/60 group-hover:text-fg"}`}
      />
      <span className={`flex min-w-0 flex-1 items-center gap-2 text-[13px] leading-tight ${spacer ? "text-fg/55" : on ? "text-fg" : "text-fg/85 group-hover:text-fg"}`}>
        <span className="min-w-0">
          {name}
          {own && <span className="mt-0.5 block truncate text-[11px] leading-snug text-mut">{own}</span>}
        </span>
        {tall && <span className={`${css.tileBadge} shrink-0`}>visoki</span>}
      </span>
      <span className="shrink-0 text-[12px] tabular-nums text-mut">{Math.round(slot.width)} cm</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-fg/35 transition-colors group-hover:text-accent" />
    </button>
  );
}
