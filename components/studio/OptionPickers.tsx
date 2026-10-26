"use client";

/**
 * Controls for the kitchen's finer options (hoods, glass, opening of the fronts, the backsplash), shared by the steps and
 * the element editor:
 *
 *   TileRadio      a radio group of picture tiles (hood kinds, ways of opening, backsplash kinds) — arrows move and pick,
 *                  skipping tiles that are not available; a tile can carry a small second line ("kao kuhinja")
 *   SwitchLine     one line with a switch (LED, glass shelves)
 *   GlassControls  the glass of vitrines: kind (samples), frame, LED and — "Napredno" or when off — glass shelves
 */
import { useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import type { GlassChoices } from "@/lib/studio/edit";
import type { GlassFrame, GlassSpec, GlassType } from "@/lib/studio/types";
import { ChoiceChips, Switch, rovingIndex } from "./controls";
import { RoomSwatches } from "./SurfacePicker";

export interface TileOption<T extends string> {
  id: T;
  name: string;
  /** a small second line ("kao kuhinja", "90 cm") */
  sub?: string;
  icon: ReactNode;
  /** not available here: dimmed, skipped by the arrows, `why` in its tooltip */
  disabled?: boolean;
  why?: string;
  /** accessible name (defaults to name + sub) */
  aria?: string;
}

export function TileRadio<T extends string>({
  label,
  labelledBy,
  describedBy,
  options,
  value,
  onChange,
  cols = 4,
  className = "",
}: {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  options: readonly TileOption<T>[];
  value: T | null;
  onChange: (id: T) => void;
  cols?: number;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]));
  const cur = options.findIndex((o) => o.id === value);
  const stop = cur >= 0 && !options[cur].disabled ? cur : (enabled[0] ?? -1);
  const onKey = (e: KeyboardEvent, i: number) => {
    const k = rovingIndex(e, Math.max(0, enabled.indexOf(i)), enabled.length);
    if (k === null || !enabled.length) return;
    e.preventDefault();
    const j = enabled[k];
    onChange(options[j].id);
    refs.current[j]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`grid gap-2 ${className}`}
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const on = i === cur;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={o.disabled || undefined}
            aria-label={o.aria ?? (o.sub ? `${o.name}, ${o.sub}` : o.name)}
            title={o.disabled ? o.why : undefined}
            tabIndex={i === stop ? 0 : -1}
            onClick={() => !o.disabled && onChange(o.id)}
            onKeyDown={(e) => onKey(e, i)}
            className={`group flex min-h-[86px] flex-col items-center gap-1.5 rounded-xl border px-1 pb-2.5 pt-2.5 text-center transition-[border-color,background-color] duration-300 ease-premium ${
              on
                ? "border-accent/70 bg-accent/[0.09]"
                : o.disabled
                  ? "cursor-not-allowed border-white/[0.05] opacity-45"
                  : "border-white/[0.08] bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.04]"
            }`}
          >
            <span aria-hidden="true" className={`flex h-9 w-9 items-center justify-center transition-colors duration-300 ${on ? "text-accent" : "text-fg/60 group-hover:text-fg"}`}>
              {o.icon}
            </span>
            <span className={`text-[11.5px] font-medium leading-[1.15] ${on ? "text-fg" : "text-fg/80"}`}>{o.name}</span>
            {o.sub && <span className={`-mt-0.5 text-[10px] leading-none ${on ? "text-accent" : "text-mut"}`}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** a label (and a short description) with a switch at the end of the line */
export function SwitchLine({ label, description, checked, onChange }: { label: string; description?: string; checked: boolean; onChange: (v: boolean) => void }) {
  const uid = useId();
  return (
    <div className="flex items-start gap-4">
      <div className="min-w-0 flex-1">
        <label id={`${uid}-l`} htmlFor={`${uid}-s`} className="block cursor-pointer text-[12.5px] leading-snug text-fg/85">
          {label}
        </label>
        {description && (
          <p id={`${uid}-d`} className="mt-0.5 text-[11.5px] leading-snug text-mut">
            {description}
          </p>
        )}
      </div>
      <Switch id={`${uid}-s`} checked={checked} onChange={onChange} labelledBy={`${uid}-l`} describedBy={description ? `${uid}-d` : undefined} />
    </div>
  );
}

/** a small uppercase label above a group of choices */
export function MiniLabel({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={`mb-2 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90 ${className}`}>
      {children}
    </p>
  );
}

/**
 * The glass of vitrines (lib/studio/edit.ts glassChoices: the kitchen's, or one element's): its kind as samples (the
 * chosen one named, with its note), the frame, the LED inside and — "Napredno", or while they are off — the glass
 * shelves. `onChange` gets the field that changed and what to announce.
 */
export function GlassControls({
  choices,
  advanced,
  onChange,
}: {
  choices: GlassChoices;
  advanced: boolean;
  onChange: (patch: Partial<GlassSpec>, say: string) => void;
}) {
  const uid = useId();
  const v = choices.value;
  const type = choices.types.find((t) => t.current) ?? choices.types[0];
  const frame = choices.frames.find((f) => f.current) ?? choices.frames[0];
  return (
    <div className="space-y-4">
      <div>
        <p id={`${uid}-t`} className="text-[12.5px] text-fg/80">
          Vrsta stakla <span className="ml-1.5 text-fg">{type?.name}</span>
        </p>
        <div className="mt-2.5">
          <RoomSwatches
            label="Vrsta stakla"
            items={choices.types}
            value={v.type}
            onChange={(id) => onChange({ type: id as GlassType }, `Staklo: ${choices.types.find((t) => t.id === id)?.name ?? ""}.`)}
          />
        </div>
        {type && <p className="mt-1.5 text-[11.5px] leading-snug text-mut">{type.note}</p>}
      </div>
      <div>
        <MiniLabel id={`${uid}-f`}>Okvir</MiniLabel>
        <ChoiceChips
          labelledBy={`${uid}-f`}
          options={choices.frames}
          value={frame?.id ?? "fronta"}
          onChange={(id) => onChange({ frame: id as GlassFrame }, `Okvir stakla: ${choices.frames.find((f) => f.id === id)?.name ?? ""}.`)}
        />
      </div>
      <SwitchLine
        label="LED rasvjeta unutra"
        description="Traka uz rub, svijetli kroz staklo i police."
        checked={v.led}
        onChange={(on) => onChange({ led: on }, on ? "LED rasvjeta u vitrini je uključena." : "Vitrina bez LED rasvjete.")}
      />
      {(advanced || !v.shelves) && (
        <SwitchLine
          label="Staklene police"
          description="Isključeno: vitrina bez polica, posuđe stoji na dnu."
          checked={v.shelves}
          onChange={(on) => onChange({ shelves: on }, on ? "Vitrina sa staklenim policama." : "Vitrina bez polica.")}
        />
      )}
    </div>
  );
}
