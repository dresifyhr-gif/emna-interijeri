"use client";

/**
 * The one "add an element" picker — the same at a "+" in 3D (GapLayer) and behind "+ lijevo / + desno" of the element
 * toolbar and editor: a row of widths, preselected to what fits the free place best, then big tiles of the six most
 * common elements that fit there, and "Više elemenata" for the rest (grouped). Tall units are among them wherever one
 * can stand (a "+" in a wall's base row, at a run's end, between two cabinets, beside a cabinet), with a small "visoki"
 * badge. A tile shows the width it will get — the chosen one, or the nearest its type comes in — and a click adds it
 * at once.
 *
 * Keyboard: the widths are row 0, the tiles the rows after it (overlay.moveFocus: arrows walk them, Home / End jump).
 * The caller focuses the first tile ([data-tile]) when it opens.
 */
import { useId, useMemo, useState } from "react";
import { addModel, widthFor, type AddItem, type AddZone } from "./addModel";
import { ChevronDown, ModuleGlyph } from "./icons";
import s from "./studio.module.css";

export { addItems, type AddItem } from "./addModel";

export function AddPicker({
  items,
  zone,
  stretch,
  docked,
  onPick,
}: {
  /** what fits (types without a fitting width are left out by the picker) */
  items: AddItem[];
  /** the row the elements go into (names of the groups, which elements are common) */
  zone: AddZone;
  /** cm of the free place itself (addModel bestWidth); null when there is none (a run that grows) */
  stretch: number | null;
  docked: boolean;
  onPick: (it: AddItem, width: number) => void;
}) {
  const uid = useId();
  const { fit, chips, best, top, rest, groups } = useMemo(() => addModel(items, zone, stretch), [items, zone, stretch]);
  const [chosen, setChosen] = useState<number | null>(null);
  const width = chosen !== null && chips.includes(chosen) ? chosen : best;
  const [more, setMore] = useState(false);

  if (!fit.length) return <p className="px-2.5 pb-2 text-[12px] leading-relaxed text-mut">Ovdje trenutno ne stane nijedan element.</p>;

  // the keyboard rows (overlay.moveFocus): widths, the common tiles, "Više", each group's tiles
  const topRow = chips.length > 1 ? 1 : 0;
  const moreRow = topRow + Math.ceil(top.length / 3);
  const groupRows = groups.reduce<number[]>((acc, g, k) => [...acc, k ? acc[k - 1] + Math.ceil(groups[k - 1].items.length / 3) : moreRow + 1], []);
  const tiles = (list: AddItem[], base: number) => {
    return (
      <div className="grid grid-cols-3 gap-1.5">
        {list.map((it, j) => {
          const w = widthFor(it, width) ?? 0;
          const exact = width !== null && w === width;
          return (
            <button
              key={`${it.tall ? "tall:" : ""}${it.t.id}`}
              type="button"
              data-tile=""
              data-row={base + Math.floor(j / 3)}
              data-col={j % 3}
              title={it.t.description}
              aria-label={`${it.t.name}${it.tall ? ", visoki element" : ""}, ${w} cm`}
              onClick={() => onPick(it, w)}
              className={`${s.popTile} ${docked ? "min-h-[96px]" : "min-h-[88px]"}`}
            >
              <ModuleGlyph type={it.t.id} zone={it.tall ? "tall" : zone} className={`shrink-0 ${docked ? "h-9 w-9" : "h-8 w-8"}`} />
              <span className="mt-1 line-clamp-2 text-[11px] leading-[1.2]">{it.t.name}</span>
              <span className={`mt-auto flex flex-wrap items-center justify-center gap-x-1 gap-y-1 pt-1 text-[10.5px] tabular-nums leading-none ${exact ? "text-fg/85" : "text-mut"}`}>
                {it.tall && <span className={s.tileBadge}>visoki</span>}
                <span className="whitespace-nowrap">{w} cm</span>
              </span>
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-2.5 px-1.5 pb-1">
      {chips.length > 1 && (
        <div>
          <p id={`${uid}-w`} className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">
            Širina
          </p>
          {/* phone: every width in view (a sideways scroll hid 90 / 100 / 120 behind the edge) — five to a row */}
          <div role="group" aria-labelledby={`${uid}-w`} className={docked ? "grid grid-cols-5 gap-1.5" : "flex flex-wrap gap-1.5"}>
            {chips.map((w, i) => (
              <button
                key={w}
                type="button"
                data-row={0}
                data-col={i}
                aria-pressed={w === width}
                aria-label={`Širina ${w} cm${w === best ? ", najbolje pristaje" : ""}`}
                onClick={() => setChosen(w)}
                className={`${s.popWidth} shrink-0 ${docked ? "h-11 min-w-0" : "h-8 min-w-[38px] !px-2"}`}
              >
                {w}
              </button>
            ))}
          </div>
        </div>
      )}
      {tiles(top, topRow)}
      {groups.length > 0 && (
        <>
          <button
            type="button"
            data-row={moreRow}
            data-col={0}
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
            className={`flex w-full items-center justify-center gap-1.5 rounded-xl border border-white/[0.08] text-[12px] font-medium text-fg/75 transition-colors duration-300 hover:border-white/20 hover:text-fg ${docked ? "h-11" : "h-9"}`}
          >
            {more ? "Manje" : `Više elemenata (${rest.length})`}
            <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform duration-300 ${more ? "rotate-180" : ""}`} />
          </button>
          {more &&
            groups.map((g, k) => (
              <div key={g.id}>
                <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">{g.name}</p>
                {tiles(g.items, groupRows[k])}
              </div>
            ))}
        </>
      )}
    </div>
  );
}
