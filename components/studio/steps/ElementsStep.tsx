"use client";

/**
 * "Elementi": every cabinet of the kitchen, wall by wall, without having to click in 3D (important on a phone).
 * A front-view drawing of the wall (clickable) and the rows below it open the element editor.
 */
import { moduleDef } from "@/lib/studio/catalog";
import { isEdited } from "@/lib/studio/edit";
import type { PlanSlot, RunId } from "@/lib/studio/plan";
import { Notes, Segmented, SectionLabel, ToggleRow } from "../controls";
import { ChevronRight, CursorIcon, ModuleGlyph, ResetIcon } from "../icons";
import { ROW_NAME, rowSlots, runName, sideHint, type RowZone } from "../meta";
import { RunElevation } from "../RunElevation";
import type { StepProps } from "./types";

export interface ElementsUi {
  selectedId: string | null;
  /** open the element editor for a slot (from this list: focus moves into the editor) */
  onOpen: (slotId: string) => void;
  runTab: RunId;
  onRunTab: (run: RunId) => void;
  /** put a wall (base + wall units + its corners), the island or the tall column back to the planner */
  onReset: (run: RunId | "tall") => void;
  onResetAll: () => void;
}

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export function ElementsStep({ cfg, plan, update, compact, engine, elements }: StepProps & { elements: ElementsUi }) {
  const { selectedId, onOpen, onRunTab, onReset, onResetAll } = elements;
  const runs: RunId[] = [...plan.walls, ...(plan.island ? (["isl"] as const) : [])];
  const run = runs.includes(elements.runTab) ? elements.runTab : runs[0];
  const tallSlot = plan.slots.find((s) => s.zone === "tall");
  const tallWall = tallSlot?.run ?? null;

  const rows: RowZone[] = run === "isl" ? ["island"] : ["upper", "base", "tall"];
  const wallEdited =
    run === "isl"
      ? isEdited(cfg, "isl")
      : isEdited(cfg, run) || isEdited(cfg, `${run}:u`) || (run === "a" && Boolean(cfg.corners && Object.keys(cfg.corners).length));
  const len = run === "isl" ? Math.round(plan.island?.length ?? cfg.island) : cfg.walls[run];

  return (
    <div>
      {runs.length > 1 && (
        <Segmented
          label="Zid"
          options={runs.map((r) => ({ id: r, label: r === "isl" ? "Otok" : `Zid ${r.toUpperCase()}`, aria: runName(r) }))}
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
          boxWidth={compact ? 320 : 312}
          boxHeight={compact ? 112 : 132}
          className={`block w-full ${compact ? "h-[112px]" : "h-[132px]"}`}
        />
        <figcaption className="mt-2 flex items-baseline justify-between gap-3 text-[10.5px] tracking-[0.04em] text-mut">
          <span className="font-medium uppercase tracking-[0.2em] text-fg/70">{runName(run)}</span>
          <span className="tabular-nums">{len} cm</span>
        </figcaption>
      </figure>
      <p className="mt-2 text-[11px] leading-snug text-mut">{sideHint(run)}</p>

      {rows.map((z) => {
        const list = rowSlots(plan.slots, run, z);
        if (!list.length) return null;
        const labelId = `studio-row-${run}-${z}`;
        return (
          <div key={z} className="mt-6">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel id={labelId}>{ROW_NAME[z]}</SectionLabel>
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
                  <ElementRow slot={sl} index={i} on={sl.id === selectedId} onOpen={onOpen} />
                </li>
              ))}
            </ul>
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
          {run === "isl" ? "Vrati zadano za otok" : `Vrati zadano za zid ${run.toUpperCase()}`}
        </button>
      )}

      <div className="mt-7">
        <ToggleRow
          title="Visoki stup"
          description={
            <>
              Visoki elementi za ugradbeni hladnjak i pećnicu u visini očiju — ili smočnica, ormar, perilica rublja. Sami
              aparati nisu uračunati u okvirnu cijenu.
              {tallWall && tallWall !== run && (
                <>
                  {" "}
                  <button
                    type="button"
                    onClick={() => onRunTab(tallWall)}
                    className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
                  >
                    Stoji uz {tallWall === "isl" ? "otok" : `zid ${tallWall.toUpperCase()}`}
                  </button>
                  .
                </>
              )}
            </>
          }
          checked={cfg.tall}
          onChange={(v) => update({ tall: v })}
        />
      </div>

      <div className="mt-6 flex gap-3.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <CursorIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p className="text-[12.5px] leading-relaxed text-fg/80">
          {engine
            ? "Element možete odabrati i klikom u 3D prikazu. Uz svaku promjenu odmah vidite mehanizam, raspored i okvirnu cijenu."
            : "Odaberite element na popisu: promjene se odmah vide u rasporedu i okvirnoj cijeni."}
        </p>
      </div>

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

function ElementRow({ slot, index, on, onOpen }: { slot: PlanSlot; index: number; on: boolean; onOpen: (id: string) => void }) {
  const def = moduleDef(slot.zone, slot.type);
  const spacer = Boolean(def?.spacer);
  const name = slot.corner && def && !def.corner ? `Kutni element: ${lower(def.name)}` : (def?.name ?? slot.type);
  return (
    <button
      type="button"
      data-slot-row={slot.id}
      onClick={() => onOpen(slot.id)}
      aria-label={`${index + 1}. ${name}, ${Math.round(slot.width)} cm. Uredi.`}
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
      <span className={`min-w-0 flex-1 text-[13px] leading-tight ${spacer ? "text-fg/55" : on ? "text-fg" : "text-fg/85 group-hover:text-fg"}`}>{name}</span>
      <span className="shrink-0 text-[12px] tabular-nums text-mut">{Math.round(slot.width)} cm</span>
      <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-fg/35 transition-colors group-hover:text-accent" />
    </button>
  );
}
