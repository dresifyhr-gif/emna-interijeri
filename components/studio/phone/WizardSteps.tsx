"use client";

/**
 * The four screens of the phone's step-by-step flow (PhoneWizard): Oblik, Mjere, Stil, Uređaji. Each change goes to
 * the kitchen at once (the 3D preview above follows it) through lib/studio/edit.ts and lib/studio/presets.ts; a refusal
 * or a note shows right under the control that made it (InlineNote).
 */
import { useState } from "react";
import { catalog } from "@/lib/studio/catalog";
import type { EditResult } from "@/lib/studio/edit";
import { applyPreset, matchPreset, STYLE_PRESETS, type StylePreset } from "@/lib/studio/presets";
import type { HandleStyle, HoodKind, KitchenConfig, Layout } from "@/lib/studio/types";
import { HoodGlyph, LayoutIcon } from "../icons";
import { LAYOUTS } from "../meta";
import {
  FRIDGE_OPTIONS,
  HOOD_NAMES,
  ISLAND_OPTIONS,
  OVEN_OPTIONS,
  SINK_NAMES,
  readAppliances,
  setColumnEnd,
  setDishwasher,
  setFridgeKind,
  setHoodKind,
  setIslandUse,
  setOvenPlace,
  setSinkSide,
} from "./appliances";
import { BigStepper, BigSwitch, ChoiceGrid, FlowLabel, InlineNote, type FlowNote } from "./bits";
import {
  ceilingRow,
  heightsMode,
  islandRow,
  measureRows,
  setCeilingHeight,
  setHeightsMode,
  setIslandLength,
  setKitchenFull,
  setKitchenLength,
  setRoomLength,
  setWindowOn,
  windowOn,
} from "./flow";

export type FlowEdit = (r: EditResult, say?: string) => boolean;

/** an edit from a wizard screen: applied (one undo step) and its note kept next to its control, or refused with the reason */
function useFlowEdit(onEdit: FlowEdit) {
  const [note, setNote] = useState<FlowNote | null>(null);
  const run = (where: string, r: EditResult, say?: string): boolean => {
    if (!r.ok) {
      setNote({ where, text: r.warning ?? "Ta izmjena ovdje nije moguća.", tone: "refused" });
      return false;
    }
    onEdit(r, say);
    setNote(r.warning ? { where, text: r.warning, tone: "info" } : null);
    return true;
  };
  return { note, run };
}

/* ------------------------------------------------------------------ Oblik */

export function ShapeScreen({ cfg, onLayout }: { cfg: KitchenConfig; onLayout: (l: Layout) => void }) {
  return (
    <div role="radiogroup" aria-label="Oblik kuhinje" className="grid grid-cols-3 gap-2">
      {LAYOUTS.map((it) => {
        const on = cfg.layout === it.id;
        return (
          <button
            key={it.id}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={`${it.name} — ${it.desc}`}
            onClick={() => onLayout(it.id)}
            className={`flex min-h-[112px] flex-col items-center justify-center rounded-2xl border px-1.5 py-3 text-center transition-[border-color,background-color] duration-300 ease-premium ${
              on ? "border-accent/80 bg-accent/[0.09]" : "border-white/10 bg-white/[0.025] active:bg-white/[0.06]"
            }`}
          >
            <LayoutIcon layout={it.id} className={`h-11 w-11 transition-colors duration-300 ${on ? "text-accent" : "text-fg/70"}`} />
            <span className="mt-2 text-[13.5px] font-medium leading-tight text-fg">{it.name}</span>
            <span className="mt-0.5 text-[10.5px] leading-tight text-mut">{it.desc}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ Mjere */

export function MeasuresScreen({ cfg, onEdit }: { cfg: KitchenConfig; onEdit: FlowEdit }) {
  const { note, run } = useFlowEdit(onEdit);
  const rows = measureRows(cfg);
  const isl = islandRow(cfg);
  const ceil = ceilingRow(cfg);
  const mode = heightsMode(cfg);
  const win = windowOn(cfg);
  return (
    <div className="space-y-3">
      {rows.map((w) => (
        <section key={w.wall} aria-label={w.name} className="rounded-[22px] border border-white/10 bg-white/[0.02] p-4">
          <BigStepper
            label={w.name}
            sub={w.hint}
            value={w.room.value}
            min={w.room.min}
            max={w.room.max}
            onCommit={(v) => run(`room-${w.wall}`, setRoomLength(cfg, w.wall, v), `${w.name}: ${v} cm.`)}
          />
          <InlineNote note={note} where={`room-${w.wall}`} />
          {(w.canShorten || !w.full) && (
            <div className="mt-3">
              <BigSwitch
                title="Kuhinja zauzima cijeli zid"
                note={w.full ? undefined : "Ostatak zida ostaje slobodan."}
                checked={w.full}
                onChange={(on) => run(`full-${w.wall}`, setKitchenFull(cfg, w.wall, on), on ? "Kuhinja zauzima cijeli zid." : "Kuhinja je kraća od zida.")}
              />
            </div>
          )}
          <InlineNote note={note} where={`full-${w.wall}`} />
          {!w.full && (
            <div className="mt-4">
              <BigStepper
                label="Duljina kuhinje"
                sub={`na zidu ${w.wall.toUpperCase()}`}
                value={w.kitchen.value}
                min={w.kitchen.min}
                max={w.kitchen.max}
                onCommit={(v) => run(`kitchen-${w.wall}`, setKitchenLength(cfg, w.wall, v), `Kuhinja na zidu ${w.wall.toUpperCase()}: ${v} cm.`)}
              />
              <InlineNote note={note} where={`kitchen-${w.wall}`} />
            </div>
          )}
        </section>
      ))}

      {isl && (
        <section aria-label={isl.name} className="rounded-[22px] border border-white/10 bg-white/[0.02] p-4">
          <BigStepper label={isl.name} sub={isl.hint} value={isl.value} min={isl.min} max={isl.max} onCommit={(v) => run("isl", setIslandLength(cfg, v), `${isl.name}: ${v} cm.`)} />
          <InlineNote note={note} where="isl" />
        </section>
      )}

      <section aria-label="Strop" className="rounded-[22px] border border-white/10 bg-white/[0.02] p-4">
        <BigStepper label="Visina stropa" value={ceil.value} min={ceil.min} max={ceil.max} onCommit={(v) => run("ceiling", setCeilingHeight(cfg, v), `Strop: ${v} cm.`)} />
        <InlineNote note={note} where="ceiling" />
        <FlowLabel className="mt-5">Gornji elementi</FlowLabel>
        <div className="mt-2.5">
          <ChoiceGrid
            label="Visina gornjih elemenata"
            choices={[
              { id: "standard" as const, name: "Standardno", note: "Do 219 cm" },
              { id: "do-stropa" as const, name: "Do stropa", note: "Više mjesta, bez prašine" },
            ]}
            value={mode === "custom" ? null : mode}
            onChange={(m) => run("heights", setHeightsMode(cfg, m), m === "standard" ? "Standardne visine." : "Kuhinja do stropa.")}
          />
        </div>
        <InlineNote note={note} where="heights" />
      </section>

      <BigSwitch
        title="Prozor na zidu A"
        note={win ? "Sudoper ide ispod prozora; ispred njega nema gornjih elemenata." : "Iznad radne ploče, na stražnjem zidu."}
        checked={win}
        onChange={(on) => run("window", setWindowOn(cfg, on), on ? "Dodan je prozor na zidu A." : "Prozor je uklonjen.")}
      />
      <InlineNote note={note} where="window" />
    </div>
  );
}

/* ------------------------------------------------------------------ Stil */

const swatchOf = (list: readonly { id: string; swatch: string }[], id: string | undefined, fallback = "#2a2a2c") =>
  list.find((x) => x.id === id)?.swatch ?? fallback;

/** a tiny elevation of the look: wall, wall units, worktop, base fronts with their handles, plinth, floor */
function PresetScene({ p }: { p: StylePreset }) {
  const front = swatchOf(catalog.fronts, p.front);
  const top = swatchOf(catalog.tops, p.top);
  const wall = swatchOf(catalog.room.walls, p.wall);
  const floor = swatchOf(catalog.room.floors, p.floor);
  const metal = swatchOf(catalog.finishes.handleColors, p.handleColor, "#1a1a1a");
  const doors = [0, 1, 2];
  return (
    <div aria-hidden="true" className="relative h-[96px] overflow-hidden rounded-t-[18px]" style={{ background: wall }}>
      {/* wall units */}
      <div className="absolute left-3 right-3 top-3 flex h-[24px] gap-px overflow-hidden rounded-[2px] shadow-[0_6px_10px_-6px_rgba(0,0,0,.6)]">
        {doors.map((d) => (
          <span key={d} className="h-full flex-1" style={{ background: front }} />
        ))}
      </div>
      {p.led && <span className="absolute left-4 right-4 top-[37px] h-[8px] bg-gradient-to-b from-[#ffd29a]/45 to-transparent" />}
      {/* worktop */}
      <span className="absolute left-2 right-2 top-[52px] h-[5px] shadow-[0_2px_3px_rgba(0,0,0,.35)]" style={{ background: top }} />
      {/* base fronts */}
      <div className="absolute left-3 right-3 top-[57px] flex h-[25px] gap-px overflow-hidden">
        {doors.map((d) => (
          <span key={d} className="relative h-full flex-1" style={{ background: front }}>
            <Handle style={p.handles} color={metal} />
          </span>
        ))}
      </div>
      {/* plinth and floor */}
      <span className="absolute left-3.5 right-3.5 top-[82px] h-[3px] bg-black/55" />
      <span className="absolute inset-x-0 bottom-0 h-[11px]" style={{ background: floor }} />
    </div>
  );
}

function Handle({ style, color }: { style: HandleStyle; color: string }) {
  if (style === "letvica") return <span className="absolute left-1/2 top-[4px] h-[2px] w-[44%] -translate-x-1/2 rounded-full" style={{ background: color }} />;
  if (style === "gumb") return <span className="absolute left-1/2 top-[4px] h-[4px] w-[4px] -translate-x-1/2 rounded-full" style={{ background: color }} />;
  if (style === "bez" || style === "utor") return <span className="absolute inset-x-0 top-0 h-[2px]" style={{ background: color }} />;
  return null;
}

export function StyleScreen({ cfg, onEdit }: { cfg: KitchenConfig; onEdit: FlowEdit }) {
  const { note, run } = useFlowEdit(onEdit);
  const current = matchPreset(cfg);
  return (
    <div>
      <div role="radiogroup" aria-label="Stil kuhinje" className="grid grid-cols-2 gap-2.5">
        {STYLE_PRESETS.map((p) => {
          const on = current === p.id;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => run("style", applyPreset(cfg, p), `Stil: ${p.name}.`)}
              className={`overflow-hidden rounded-[20px] border text-left transition-[border-color,box-shadow] duration-300 ease-premium ${
                on ? "border-accent shadow-[0_0_0_1px_rgba(201,185,154,.6)]" : "border-white/10"
              }`}
            >
              <PresetScene p={p} />
              <span className="block bg-white/[0.025] px-3 pb-3 pt-2.5">
                <span className="block text-[13.5px] font-medium leading-tight text-fg">{p.name}</span>
                <span className="mt-1 block text-[11px] leading-snug text-mut">{p.note}</span>
              </span>
            </button>
          );
        })}
      </div>
      <InlineNote note={note} where="style" />
      <p className="mt-4 text-[12px] leading-relaxed text-mut">Stil mijenja samo boje i materijale — raspored i mjere ostaju. Svaku boju možete kasnije promijeniti u 3D-u.</p>
    </div>
  );
}

/* ------------------------------------------------------------------ Uređaji */

export function AppliancesScreen({ cfg, onEdit }: { cfg: KitchenConfig; onEdit: FlowEdit }) {
  const { note, run } = useFlowEdit(onEdit);
  const a = readAppliances(cfg);
  const hoods = (Object.keys(HOOD_NAMES) as HoodKind[]).map((id) => ({
    id,
    ...HOOD_NAMES[id],
    glyph: <HoodGlyph kind={id} className="h-8 w-8" />,
  }));
  return (
    <div className="space-y-6">
      <section aria-label="Hladnjak">
        <FlowLabel>Hladnjak</FlowLabel>
        <div className="mt-2.5">
          <ChoiceGrid label="Hladnjak" choices={FRIDGE_OPTIONS} value={a.fridge} onChange={(k) => run("fridge", setFridgeKind(cfg, k), k === "sbs" ? "Dvokrilni hladnjak." : "Ugradbeni hladnjak.")} />
        </div>
        <InlineNote note={note} where="fridge" />
        {a.column && (
          <>
            <p className="mt-4 text-[12.5px] text-fg/80">Visoki stup s hladnjakom stoji</p>
            <div className="mt-2">
              <ChoiceGrid
                label="Gdje stoji visoki stup"
                cols={a.column.places.length > 2 ? 3 : 2}
                choices={a.column.places.map((p) => ({ id: p.end, name: p.label, off: !p.fits }))}
                value={a.column.end}
                onChange={(end) => run("column", setColumnEnd(cfg, end), "Visoki stup je premješten.")}
              />
            </div>
            <InlineNote note={note} where="column" />
          </>
        )}
      </section>

      <section aria-label="Pećnica">
        <FlowLabel>Pećnica</FlowLabel>
        <div className="mt-2.5">
          <ChoiceGrid label="Pećnica" choices={OVEN_OPTIONS} value={a.oven} onChange={(o) => run("oven", setOvenPlace(cfg, o), o === "stup" ? "Pećnica u visokom stupu." : "Pećnica ispod ploče.")} />
        </div>
        <InlineNote note={note} where="oven" />
      </section>

      <section aria-label="Napa">
        <FlowLabel>Napa iznad ploče</FlowLabel>
        <div className="mt-2.5">
          <ChoiceGrid label="Napa" choices={hoods} value={a.hood} onChange={(k) => run("hood", setHoodKind(cfg, k), `Napa: ${HOOD_NAMES[k].name.toLowerCase()}.`)} />
        </div>
        <InlineNote note={note} where="hood" />
      </section>

      {a.island !== null && (
        <section aria-label="Na otoku">
          <FlowLabel>{cfg.layout === "otok" ? "Na otoku" : "Na poluotoku"}</FlowLabel>
          <div className="mt-2.5">
            <ChoiceGrid label="Što je na otoku" choices={ISLAND_OPTIONS} value={a.island} onChange={(f) => run("island", setIslandUse(cfg, f), "Otok je promijenjen.")} />
          </div>
          <InlineNote note={note} where="island" />
        </section>
      )}

      {(a.sinkOptions.length > 0 || a.underWindow !== null) && (
        <section aria-label="Sudoper">
          <FlowLabel>Sudoper</FlowLabel>
          {a.sinkOptions.length > 0 && (
            <div className="mt-2.5">
              <ChoiceGrid
                label="Sudoper u odnosu na ploču"
                choices={a.sinkOptions.map((id) => ({ id, name: SINK_NAMES[id] }))}
                value={a.sink}
                onChange={(s) => run("sink", setSinkSide(cfg, s), `Sudoper: ${SINK_NAMES[s].toLowerCase()}.`)}
              />
            </div>
          )}
          {a.underWindow === true && <p className="mt-2.5 text-[12.5px] leading-snug text-fg/70">Sudoper je ispod prozora.</p>}
          {a.underWindow === false && (
            <button
              type="button"
              onClick={() => run("sink", setSinkSide(cfg, "prozor"), "Sudoper je ispod prozora.")}
              className="mt-2.5 inline-flex min-h-11 items-center rounded-full border border-white/15 px-4 text-[13px] font-medium text-fg/85 transition-colors active:border-accent active:text-accent"
            >
              Stavi sudoper ispod prozora
            </button>
          )}
          <InlineNote note={note} where="sink" />
        </section>
      )}

      {a.dishwasher !== null && (
        <section aria-label="Perilica posuđa">
          <BigSwitch
            title="Perilica posuđa"
            note={a.dishwasher ? "Ugradbena, uz sudoper." : "Bez perilice — ladice na njenom mjestu."}
            checked={a.dishwasher}
            onChange={(on) => run("dishwasher", setDishwasher(cfg, on), on ? "Dodana je perilica posuđa." : "Bez perilice posuđa.")}
          />
          <InlineNote note={note} where="dishwasher" />
        </section>
      )}
      <p className="text-[12px] leading-relaxed text-mut">Okvirna cijena je bez kućanskih aparata — u nju su uračunati elementi u koje se ugrađuju.</p>
    </div>
  );
}
