"use client";

/**
 * The element editor's own options of the selected element (lib/studio/edit.ts elementOptions / setElementOptions), each
 * shown only where it applies — and the end units at a free end of its run:
 *
 *   Završetak kuhinje   at a free end of the run: rounded / angled open shelves, thick side panels (optionsModel endChoice)
 *                       go beyond it, in place of the run's end panel; on an end unit itself: the other end units
 *   Otvaranje           this element's own way of opening — the kitchen's first ("kao kuhinja"), handles, push, finger gap
 *   Staklo              vitrines: glass, frame, LED (shelves in "Napredno"), "Kao ostale vitrine" drops its own
 *   Dubina nadgradnog   a wall unit's top box in the "do stropa" row: 30 / 35 / 45 / 60 cm
 *   Napa iznad ploče    a hob: its own hood (a visible one takes the wall units above it away — the note says so)
 *   Police / LED        floating shelves: boards 1–3; open units with a light: LED on / off
 *
 * Corner units take the kitchen's settings (not list entries): a line says where those are chosen. Every change is an
 * undo step and the editor follows the element (its id can change on a first edit of a run).
 */
import { useMemo, type ReactNode } from "react";
import { catalog } from "@/lib/studio/catalog";
import { changeType, elementOptions, insertAfter, insertBefore, setElementOptions, type EditResult, type SlotEditInfo, type TypeChoice } from "@/lib/studio/edit";
import { TOP_DEPTH_DEFAULT, type KitchenPlan } from "@/lib/studio/plan";
import type { ElementOpts, GlassSpec, HoodKind, KitchenConfig } from "@/lib/studio/types";
import { ChipRadio, gridIndex } from "./controls";
import type { ApplyOptions } from "./ElementEditor";
import { HandleGlyph, HoodGlyph, ModuleGlyph, ResetIcon } from "./icons";
import { GlassControls, SwitchLine, TileRadio } from "./OptionPickers";
import { HOOD_SHORT, elementOpenOptions, endChoice, type OpenKind } from "./optionsModel";
import s from "./studio.module.css";

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export interface ElementOptionsProps {
  cfg: KitchenConfig;
  plan: KitchenPlan;
  info: SlotEditInfo;
  advanced: boolean;
  desktop: boolean;
  /** ids of the editor's headings start with this */
  idBase: string;
  onEdit: (r: EditResult, opts?: ApplyOptions) => boolean;
  /** a new action starts (the editor drops a stale refusal) */
  begin: () => void;
}

function Section({ title, id, children, action }: { title: string; id: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mt-5">
      <div className="flex items-center justify-between gap-3">
        <p id={id} className="eyebrow flex items-center gap-3 text-mut">
          <span aria-hidden="true" className="h-px w-5 bg-accent/60" />
          {title}
        </p>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </div>
  );
}

/** "Kao kuhinja" — the element drops its own setting */
function BackToKitchen({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="inline-flex min-h-8 items-center gap-1.5 text-[11.5px] font-medium text-mut transition-colors hover:text-fg">
      <ResetIcon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

export function ElementOptionSections({ cfg, plan, info, advanced, desktop, idBase, onEdit, begin }: ElementOptionsProps) {
  const slot = info.slot;
  const opts = useMemo(() => elementOptions(cfg, slot.id), [cfg, slot.id]);
  const end = useMemo(() => endChoice(cfg, plan, info), [cfg, plan, info]);

  const set = (patch: Partial<ElementOpts>, say: string, key: string) => {
    begin();
    return onEdit(setElementOptions(cfg, slot.id, patch), { say, coalesce: `opt-${slot.id}-${key}` });
  };

  /* ---------------------------------------------------------------- end units */
  const endSection = end ? (
    <Section title={end.mode === "add" ? "Završetak kuhinje" : "Završetak"} id={`${idBase}-end`}>
      <p className="-mt-1 mb-2.5 text-[11.5px] leading-snug text-mut">
        {end.mode === "add"
          ? `${end.side === "left" ? "Lijevi" : "Desni"} kraj ${slot.zone === "upper" ? "gornjih elemenata" : slot.zone === "tall" ? "visokog stupa" : "kuhinje"}: umjesto obične bočne ploče — otvorene police ili deblja ploča.`
          : "Ovaj element završava kuhinju umjesto obične bočne ploče."}
      </p>
      <EndTiles
        labelledBy={`${idBase}-end`}
        items={end.items}
        zone={slot.zone}
        strip={!desktop}
        onPick={(t) => {
          begin();
          if (t.current) return;
          const ins = (w?: number) => (end.side === "left" ? insertBefore : insertAfter)(cfg, slot.id, t.id, w);
          if (t.width === null) {
            // why it does not fit, as the edit itself says it
            const why = end.mode === "change" ? changeType(cfg, slot.id, t.id).warning : ins().warning;
            onEdit({ cfg, ok: false, warning: why || `${t.name} (od ${Math.min(...t.widths)} cm) ovdje ne stane.`, slotId: slot.id });
            return;
          }
          if (end.mode === "change") {
            onEdit(changeType(cfg, slot.id, t.id), { say: `Završetak je sada ${lower(t.name)}.` });
            return;
          }
          onEdit(ins(t.width), { say: `Dodan završetak: ${lower(t.name)}, ${t.width} cm.` });
        }}
      />
    </Section>
  ) : null;

  if (!opts) return endSection;

  // corner units follow the kitchen's settings
  if (!opts.editable) {
    return (
      <>
        {endSection}
        {(opts.open || opts.glass) && (
          <p className="mt-5 text-[12px] leading-relaxed text-mut">
            Kutni element preuzima postavke cijele kuhinje: otvaranje fronti{opts.glass ? " i staklo vitrina" : ""} birate u koraku Boje.
          </p>
        )}
      </>
    );
  }

  /* ---------------------------------------------------------------- opening */
  const openOpts = opts.open ? elementOpenOptions(cfg.handles, opts.open.own ? opts.open.value : null) : [];
  const openNow: OpenKind | null = opts.open ? (openOpts.find((o) => (o.style ?? cfg.handles) === opts.open!.value)?.kind ?? openOpts[0]?.kind ?? null) : null;
  const openSection = opts.open ? (
    <Section title="Otvaranje" id={`${idBase}-open`}>
      <ChipRadio
        labelledBy={`${idBase}-open`}
        cols={openOpts.length}
        options={openOpts.map((o) => ({
          value: o.kind,
          label: (
            <span className="flex flex-col items-center gap-0.5">
              <HandleGlyph style={o.style ?? cfg.handles} className="h-6 w-6" />
              <span>{o.name}</span>
            </span>
          ),
          aria: `${o.name}${o.kitchen ? ", kao cijela kuhinja" : ""}`,
          sub: o.kitchen ? "kao kuhinja" : undefined,
        }))}
        value={openNow}
        onChange={(k) => {
          const o = openOpts.find((x) => x.kind === k);
          if (!o) return;
          set({ open: o.style ?? undefined }, o.kitchen ? `Otvaranje kao cijela kuhinja: ${o.name.toLowerCase()}.` : `Ovaj element: ${o.name.toLowerCase()}.`, "open");
        }}
      />
    </Section>
  ) : null;

  /* ---------------------------------------------------------------- glass */
  const glass = opts.glass;
  const glassSection = glass ? (
    <Section
      title="Staklo"
      id={`${idBase}-glass`}
      action={glass.own ? <BackToKitchen label="Kao ostale vitrine" onClick={() => set({ glass: undefined }, "Staklo kao ostale vitrine.", "glass-reset")} /> : undefined}
    >
      <GlassControls choices={glass} advanced={advanced} onChange={(patch: Partial<GlassSpec>, say) => set({ glass: patch }, say, `glass-${Object.keys(patch)[0]}`)} />
      {!glass.own && glass.elements > 1 && <p className="mt-3 text-[11.5px] leading-snug text-mut">Izbor vrijedi samo za ovu vitrinu — za sve vitrine: korak Boje.</p>}
    </Section>
  ) : null;

  /* ---------------------------------------------------------------- top-box depth */
  const kitchenDepth = cfg.heights?.topDepth ?? TOP_DEPTH_DEFAULT;
  const depthSection =
    opts.depth && opts.depth.shown ? (
      <Section title="Dubina nadgradnog ormarića" id={`${idBase}-depth`}>
        <ChipRadio
          labelledBy={`${idBase}-depth`}
          options={opts.depth.options.map((d) => ({ value: d, label: `${d} cm`, sub: d === kitchenDepth ? "kao kuhinja" : undefined }))}
          value={opts.depth.value}
          onChange={(d) => set({ depth: d === kitchenDepth ? undefined : d }, `Nadgradni ormarić dubok ${d} cm.`, "depth")}
        />
        <p className="mt-2 text-[11.5px] leading-snug text-mut">Ormarić u redu do stropa iznad ovog elementa. Gornji elementi su duboki 35 cm.</p>
      </Section>
    ) : null;

  /* ---------------------------------------------------------------- the hood above a hob */
  const hood = opts.hood;
  const kitchenHood: HoodKind = cfg.hood?.kind ?? "ugradbena";
  const island = slot.zone === "island";
  const hoodSection = hood ? (
    <Section title="Napa iznad ploče" id={`${idBase}-hood`}>
      {island ? (
        <TileRadio
          labelledBy={`${idBase}-hood`}
          cols={2}
          options={[
            { id: "iznad", name: "Stropna napa", icon: <HoodGlyph kind={cfg.hood?.island === "kaseta" ? "kaseta" : "otok"} className="h-9 w-9" />, sub: kitchenHood !== "ploca" ? "kao kuhinja" : undefined },
            { id: "ploca", name: "U ploči", icon: <HoodGlyph kind="ploca" className="h-9 w-9" />, sub: kitchenHood === "ploca" ? "kao kuhinja" : undefined },
          ]}
          value={hood.value === "ploca" ? "ploca" : "iznad"}
          onChange={(v) =>
            set(
              { hood: v === "ploca" ? (kitchenHood === "ploca" ? undefined : "ploca") : kitchenHood === "ploca" ? "ugradbena" : undefined },
              v === "ploca" ? "Ploča s ugrađenim odsisom, bez nape iznad." : "Stropna napa iznad ploče.",
              "hood",
            )
          }
        />
      ) : (
        <TileRadio
          labelledBy={`${idBase}-hood`}
          options={hood.options.map((h) => ({ id: h.id, name: HOOD_SHORT[h.id], icon: <HoodGlyph kind={h.id} className="h-9 w-9" />, sub: h.id === kitchenHood ? "kao kuhinja" : undefined, aria: h.name }))}
          value={hood.value}
          onChange={(k: HoodKind) => set({ hood: k === kitchenHood ? undefined : k }, `Napa: ${catalog.hoods.kinds.find((x) => x.id === k)?.name.toLowerCase() ?? ""}.`, "hood")}
        />
      )}
      <p className="mt-2 text-[11.5px] leading-snug text-mut">
        {catalog.hoods.kinds.find((k) => k.id === hood.value)?.note}
        {hood.width ? ` Ovdje ${hood.width} cm.` : ""}
      </p>
    </Section>
  ) : null;

  /* ---------------------------------------------------------------- shelves, LED */
  const rows = opts.rows;
  const led = opts.led;
  const shelfSection =
    rows || led ? (
      <Section title={rows ? "Police" : "Rasvjeta"} id={`${idBase}-rows`}>
        {rows && (
          <ChipRadio
            labelledBy={`${idBase}-rows`}
            options={rows.options.map((n) => ({ value: n, label: n === 1 ? "1 polica" : `${n} police` }))}
            value={rows.value}
            onChange={(n) => set({ rows: n }, n === 1 ? "Jedna polica." : `${n} police.`, "rows")}
          />
        )}
        {led && (
          <div className={rows ? "mt-3.5" : ""}>
            <SwitchLine
              label="LED rasvjeta"
              description={rows ? "Traka ispod svake police." : "Traka u otvorenom dijelu."}
              checked={led.value}
              onChange={(on) => set({ led: on ? undefined : false }, on ? "LED rasvjeta uključena." : "Bez LED rasvjete.", "led")}
            />
            {!cfg.led && led.value && <p className="mt-1.5 text-[11.5px] leading-snug text-mut">Rasvjeta kuhinje je isključena (korak Ploča i detalji → LED rasvjeta).</p>}
          </div>
        )}
      </Section>
    ) : null;

  return (
    <>
      {endSection}
      {glassSection}
      {hoodSection}
      {shelfSection}
      {depthSection}
      {openSection}
    </>
  );
}

/** end units as tiles with their drawing (a strip on a phone); arrows move focus, Enter / Space picks */
function EndTiles({ items, zone, strip, labelledBy, onPick }: { items: TypeChoice[]; zone: string; strip: boolean; labelledBy: string; onPick: (t: TypeChoice) => void }) {
  return (
    <div
      role="group"
      aria-labelledby={labelledBy}
      className={strip ? `${s.noScrollbar} -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1` : "grid grid-cols-3 gap-2"}
      onKeyDown={(e) => {
        const btns = [...e.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
        const i = btns.indexOf(e.target as HTMLButtonElement);
        if (i < 0) return;
        const n = gridIndex(e, i, btns.length, strip ? 1 : 3);
        if (n === null) return;
        e.preventDefault();
        btns[n]?.focus();
      }}
    >
      {items.map((t, i) => {
        const fits = t.width !== null;
        const sub = t.current ? "odabrano" : fits ? `${t.width} cm` : "ne stane";
        return (
          <button
            key={t.id}
            type="button"
            aria-pressed={t.current}
            aria-disabled={!fits || undefined}
            aria-label={`${t.name}, ${sub}`}
            tabIndex={t.current || (i === 0 && !items.some((x) => x.current)) ? 0 : -1}
            title={t.description}
            onClick={() => onPick(t)}
            className={`group relative flex flex-col items-center rounded-xl border px-1.5 pb-2 pt-2.5 text-center transition-[border-color,background-color] duration-300 ease-premium ${
              strip ? "w-[92px] shrink-0 snap-start" : ""
            } ${
              t.current
                ? "border-accent/70 bg-accent/[0.09]"
                : fits
                  ? "border-white/[0.08] bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.04]"
                  : "border-white/[0.05] opacity-45 hover:opacity-70"
            }`}
          >
            <ModuleGlyph type={t.id} zone={zone} className={`h-9 w-9 transition-colors duration-300 ${t.current ? "text-accent" : "text-fg/65 group-hover:text-fg"}`} />
            <span className={`mt-1.5 line-clamp-2 min-h-[2.4em] text-[11.5px] leading-[1.2] ${t.current ? "text-fg" : "text-fg/80"}`}>{t.name}</span>
            <span className={`mt-1 text-[10.5px] tabular-nums leading-none ${t.current ? "text-accent" : "text-mut"}`}>{sub}</span>
          </button>
        );
      })}
    </div>
  );
}
