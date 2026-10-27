"use client";

/**
 * Form controls for the studio panel: radio grids and segmented pickers with real
 * radio-group keyboard behaviour, a switch, and a centimetre field (− / + with
 * press-and-hold, typed value, slider).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { setStudioMode, useHoldRepeat } from "./hooks";
import { ChevronDown, ChevronUp, MinusIcon, NoteIcon, PlusIcon } from "./icons";
import { EASE, clamp } from "./meta";
import s from "./studio.module.css";

/* ------------------------------------------------------------------ roving radio keyboard */

/** arrow / Home / End target inside a radio group of `n` items (null: not a roving key) */
export function rovingIndex(e: KeyboardEvent, i: number, n: number): number | null {
  switch (e.key) {
    case "ArrowRight":
    case "ArrowDown":
      return (i + 1) % n;
    case "ArrowLeft":
    case "ArrowUp":
      return (i - 1 + n) % n;
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return null;
  }
}

/**
 * Arrow-key target in a grid of `n` buttons with `cols` columns (toolbar-style: arrows move focus, Enter / Space
 * acts). Left / Right step by one, Up / Down by a row, Home / End jump to the ends. null: not a navigation key.
 */
export function gridIndex(e: KeyboardEvent, i: number, n: number, cols: number): number | null {
  switch (e.key) {
    case "ArrowRight":
      return Math.min(n - 1, i + 1);
    case "ArrowLeft":
      return Math.max(0, i - 1);
    case "ArrowDown":
      return cols > 1 ? Math.min(n - 1, i + cols) : Math.min(n - 1, i + 1);
    case "ArrowUp":
      return cols > 1 ? Math.max(0, i - cols) : Math.max(0, i - 1);
    case "Home":
      return 0;
    case "End":
      return n - 1;
    default:
      return null;
  }
}

/* ------------------------------------------------------------------ radio grid */

export function RadioGrid<T extends { id: string }>({
  label,
  labelledBy,
  items,
  value,
  onChange,
  className = "",
  itemClassName,
  itemLabel,
  children,
}: {
  label?: string;
  labelledBy?: string;
  items: readonly T[];
  value: string;
  onChange: (id: T["id"]) => void;
  className?: string;
  itemClassName: (on: boolean) => string;
  /** accessible name of an item (defaults to its visible text) */
  itemLabel?: (item: T) => string;
  children: (item: T, on: boolean) => ReactNode;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = items.findIndex((it) => it.id === value);

  return (
    <div role="radiogroup" aria-label={label} aria-labelledby={labelledBy} className={className}>
      {items.map((it, i) => {
        const on = i === current;
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={itemLabel?.(it)}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(it.id)}
            onKeyDown={(e) => {
              const n = rovingIndex(e, i, items.length);
              if (n === null) return;
              e.preventDefault();
              onChange(items[n].id);
              refs.current[n]?.focus();
            }}
            className={itemClassName(on)}
          >
            {children(it, on)}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ segmented */

export function Segmented<T extends string>({
  label,
  labelledBy,
  options,
  value,
  onChange,
  size = "md",
  fit = false,
  className = "",
}: {
  label?: string;
  labelledBy?: string;
  options: readonly { id: T; label: ReactNode; aria?: string; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
  /** each option as wide as its label (not equal columns) — the group is as wide as its labels */
  fit?: boolean;
  className?: string;
}) {
  const uid = useId();
  const reduce = useReducedMotion();
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = options.findIndex((o) => o.id === value);
  const h = size === "sm" ? "h-8 text-[11.5px]" : "h-10 text-[12.5px]";

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      className={`relative grid rounded-full border border-white/10 bg-white/[0.03] p-1 ${className}`}
      style={{ gridTemplateColumns: fit ? `repeat(${options.length}, auto)` : `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const on = i === current;
        return (
          <button
            key={o.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            title={o.title}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              const n = rovingIndex(e, i, options.length);
              if (n === null) return;
              e.preventDefault();
              onChange(options[n].id);
              refs.current[n]?.focus();
            }}
            className={`relative flex items-center justify-center gap-1.5 rounded-full font-medium tracking-wide transition-colors duration-300 ease-premium ${fit ? "px-2.5" : "px-2"} ${h} ${
              on ? "text-ink" : "text-fg/60 hover:text-fg"
            }`}
          >
            {on && (
              <motion.span
                layoutId={`${uid}-thumb`}
                aria-hidden="true"
                className="absolute inset-0 rounded-full bg-fg"
                transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
              />
            )}
            <span className="relative z-10 flex items-center gap-1.5">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ chip radio (with options that are not available) */

export interface RadioChip<T extends string | number> {
  value: T;
  label: ReactNode;
  /** accessible name (defaults to the visible text) */
  aria?: string;
  /** a small second line under the label ("ne stane") */
  sub?: string;
  /** not available here: shown dimmed, skipped by the arrow keys, `why` in its tooltip */
  disabled?: boolean;
  why?: string;
}

/**
 * Pill choices in a grid — a radio group (arrows move and pick, skipping options that are not available). For values
 * like cm, kinds of seating, island functions.
 */
export function ChipRadio<T extends string | number>({
  label,
  labelledBy,
  describedBy,
  options,
  value,
  onChange,
  cols,
  className = "",
}: {
  label?: string;
  labelledBy?: string;
  describedBy?: string;
  options: readonly RadioChip<T>[];
  value: T | null;
  onChange: (v: T) => void;
  /** grid columns (default: one per option, at most 4) */
  cols?: number;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.flatMap((o, i) => (o.disabled ? [] : [i]));
  const cur = options.findIndex((o) => o.value === value);
  const stop = cur >= 0 && !options[cur].disabled ? cur : (enabled[0] ?? -1);
  const n = cols ?? Math.min(4, options.length);

  const onKey = (e: KeyboardEvent, i: number) => {
    const k = rovingIndex(e, Math.max(0, enabled.indexOf(i)), enabled.length);
    if (k === null || !enabled.length) return;
    e.preventDefault();
    const j = enabled[k];
    onChange(options[j].value);
    refs.current[j]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={label}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      className={`grid gap-2 ${className}`}
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}
    >
      {options.map((o, i) => {
        const on = i === cur;
        return (
          <button
            key={String(o.value)}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.aria}
            aria-disabled={o.disabled || undefined}
            title={o.disabled ? o.why : undefined}
            tabIndex={i === stop ? 0 : -1}
            onClick={() => !o.disabled && onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex min-h-10 flex-col items-center justify-center rounded-2xl border px-1.5 py-1.5 text-center text-[12.5px] font-medium leading-tight tabular-nums transition-colors duration-300 ease-premium ${
              on
                ? "border-accent/70 bg-accent/[0.1] text-fg"
                : o.disabled
                  ? "cursor-not-allowed border-white/[0.05] text-fg/30"
                  : "border-white/[0.12] text-fg/75 hover:border-white/30 hover:text-fg"
            }`}
          >
            <span>{o.label}</span>
            {o.sub && <span className={`mt-0.5 text-[10px] font-normal leading-none ${on ? "text-accent" : "text-mut"}`}>{o.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ small stepper (counts) */

/** − value + for small counts (stools): the value is read out, the buttons say what they do */
export function Stepper({
  label,
  value,
  min,
  max,
  onChange,
  format = (v: number) => String(v),
  hint,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  format?: (v: number) => string;
  hint?: string;
}) {
  const uid = useId();
  const btn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-fg/75 transition-colors duration-300 ease-premium hover:border-accent/70 hover:text-accent disabled:pointer-events-none disabled:opacity-30 select-none touch-manipulation";
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <p id={`${uid}-l`} className="min-w-0 text-[13px] leading-tight text-fg">
          {label}
        </p>
        <div role="group" aria-labelledby={`${uid}-l`} className="flex items-center gap-1.5">
          <button type="button" aria-label={`${label}: manje`} disabled={value <= min} className={btn} onClick={() => onChange(Math.max(min, value - 1))}>
            <MinusIcon className="h-4 w-4" />
          </button>
          <output aria-live="polite" className="w-[86px] text-center font-display text-[15px] font-medium tabular-nums text-fg">
            {format(value)}
          </output>
          <button type="button" aria-label={`${label}: više`} disabled={value >= max} className={btn} onClick={() => onChange(Math.min(max, value + 1))}>
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {hint && <p className="mt-1.5 text-[12px] leading-snug text-mut">{hint}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ switch */

export function Switch({
  id,
  checked,
  onChange,
  labelledBy,
  describedBy,
}: {
  id: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  labelledBy?: string;
  describedBy?: string;
}) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={`relative h-[26px] w-[46px] shrink-0 rounded-full border transition-colors duration-500 ease-premium ${
        checked ? "border-accent bg-accent" : "border-white/20 bg-white/[0.04] hover:border-white/35"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-[3px] top-1/2 h-[18px] w-[18px] -translate-y-1/2 rounded-full shadow-[0_2px_8px_rgba(0,0,0,.45)] transition-[transform,background-color] duration-500 ease-premium ${
          checked ? "translate-x-[20px] bg-ink" : "translate-x-0 bg-fg/80"
        }`}
      />
    </button>
  );
}

export function ToggleRow({
  title,
  description,
  checked,
  onChange,
  prominent = false,
  children,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** a headline choice: the card takes the accent while it is on */
  prominent?: boolean;
  children?: ReactNode;
}) {
  const uid = useId();
  return (
    <div
      className={`rounded-2xl border p-4 transition-colors duration-500 ease-premium ${
        prominent && checked ? "border-accent/45 bg-accent/[0.06] hover:border-accent/70" : "border-white/10 bg-white/[0.02] hover:border-white/20"
      }`}
    >
      <div className="flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <label id={`${uid}-l`} htmlFor={`${uid}-s`} className="block cursor-pointer font-display text-[16px] font-medium leading-tight">
            {title}
          </label>
          {description && (
            <p id={`${uid}-d`} className="mt-1.5 text-[12.5px] leading-relaxed text-mut">
              {description}
            </p>
          )}
        </div>
        <Switch
          id={`${uid}-s`}
          checked={checked}
          onChange={onChange}
          labelledBy={`${uid}-l`}
          describedBy={description ? `${uid}-d` : undefined}
        />
      </div>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------------ centimetre field */

export function NumberField({
  label,
  sub,
  hint,
  value,
  min,
  max,
  unit = "cm",
  onChange,
  onActive,
  onBeyond,
  className = "",
}: {
  label: string;
  sub?: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  onChange: (v: number) => void;
  /** true while the field is hovered / focused (drives the schematic highlight) */
  onActive?: (on: boolean) => void;
  /**
   * the customer asks for more than `max` (types a bigger number, presses + or ↑ at the top): called with what they
   * asked for instead of clamping; `stepped` = by the + button / arrow (then `v` = max + the step). The slider stays
   * within min … max. Without it, + is disabled at the top and bigger numbers are clamped.
   */
  onBeyond?: (v: number, stepped: boolean) => void;
  className?: string;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const set = (v: number) => onChange(clamp(Math.round(v), lo, hi));
  const up = (v: number, stepped: boolean) => (v > hi && onBeyond ? onBeyond(Math.round(v), stepped) : set(v));

  const dec = useHoldRepeat((step) => set(step === 1 ? value - 1 : Math.ceil(value / step) * step - step));
  const inc = useHoldRepeat((step) => up(step === 1 ? value + 1 : Math.floor(value / step) * step + step, true));

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft !== "" && Number.isFinite(n)) up(n, false);
    setDraft(null);
  };

  const pct = hi > lo ? ((value - lo) / (hi - lo)) * 100 : 0;
  const hintId = hint ? `${uid}-h` : undefined;
  const stepBtn =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-fg/75 transition-colors duration-300 ease-premium hover:border-accent/70 hover:text-accent disabled:pointer-events-none disabled:opacity-30 select-none touch-manipulation";

  return (
    <div
      className={className}
      onPointerEnter={() => onActive?.(true)}
      onPointerLeave={() => onActive?.(false)}
      onFocus={() => onActive?.(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) onActive?.(false);
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`${uid}-n`} className="min-w-0 text-[13px] leading-tight text-fg">
          {label}
          {sub && <span className="ml-1.5 text-mut">{sub}</span>}
        </label>
        <div className="flex items-center gap-1.5">
          <button type="button" aria-label={`${label}: smanji`} disabled={value <= lo} className={stepBtn} {...dec}>
            <MinusIcon className="h-4 w-4" />
          </button>
          <div className="relative flex h-9 w-[86px] items-center rounded-full border border-white/[0.12] bg-white/[0.03] transition-colors duration-300 ease-premium focus-within:border-accent/70 hover:border-white/25">
            <input
              id={`${uid}-n`}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              aria-describedby={hintId}
              value={draft ?? String(value)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^\d]/g, "").slice(0, 4);
                setDraft(raw);
                const n = Number(raw);
                if (raw !== "" && n >= lo && n <= hi) onChange(n);
              }}
              onFocus={(e) => e.currentTarget.select()}
              onBlur={commitDraft}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitDraft();
                  e.currentTarget.blur();
                } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  setDraft(null);
                  up(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1), true);
                }
              }}
              className="w-full bg-transparent pl-3.5 pr-8 text-right font-display text-[15px] font-medium tabular-nums text-fg outline-none focus-visible:outline-none"
            />
            <span aria-hidden="true" className="pointer-events-none absolute right-3 text-[11px] text-mut">
              {unit}
            </span>
          </div>
          <button type="button" aria-label={`${label}: povećaj`} disabled={value >= hi && !onBeyond} className={stepBtn} {...inc}>
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min={lo}
        max={hi}
        step={1}
        value={value}
        aria-label={`${label} (klizač)`}
        aria-valuetext={`${value} ${unit}`}
        onChange={(e) => {
          setDraft(null);
          onChange(Number(e.target.value));
        }}
        className={`${s.range} mt-2`}
        style={{ "--p": `${pct}%` } as CSSProperties}
      />
      <div className="flex justify-between text-[10.5px] tabular-nums text-mut/80" aria-hidden="true">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
      {hint && (
        <p id={hintId} className="mt-1.5 text-[12px] leading-snug text-mut">
          {hint}
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ small pieces */

export function SectionLabel({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <p id={id} className={`eyebrow flex items-center gap-3 text-mut ${className}`}>
      <span aria-hidden="true" className="h-px w-5 bg-accent/60" />
      {children}
    </p>
  );
}

export function Notes({ items, className = "mt-6" }: { items: (string | { text: string; action?: ReactNode })[]; className?: string }) {
  if (!items.length) return null;
  return (
    <ul className={`space-y-2 ${className}`} aria-label="Napomene">
      {items.map((it) => {
        const w = typeof it === "string" ? { text: it } : it;
        return (
          <li key={w.text} className="flex gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-fg/85">
            <NoteIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
            <span className="min-w-0">
              {w.text}
              {w.action && <span className="mt-2 block">{w.action}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/**
 * "Jednostavno" left something out of this step: "Više opcija" switches the studio to "Napredno" (remembered), which
 * shows it — `what` says what it is ("razmak od kraja zida, visine po mjeri").
 */
export function MoreOptions({ what, className = "mt-6" }: { what: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={() => setStudioMode("advanced")}
      className={`group flex w-full items-center gap-3 rounded-2xl border border-dashed border-white/[0.12] px-4 py-3 text-left transition-colors duration-300 hover:border-white/25 ${className}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-medium text-fg/85 group-hover:text-fg">Više opcija</span>
        <span className="mt-0.5 block text-[11.5px] leading-snug text-mut">{what}</span>
      </span>
      <ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 text-fg/45" />
    </button>
  );
}

/* ------------------------------------------------------------------ family tabs (material libraries) */

/**
 * Pills that switch a material library between families — a real tablist (arrows / Home / End move and show).
 * `marked` gets a small dot: the family that holds the current choice.
 */
export function FamilyTabs({
  label,
  families,
  value,
  onChange,
  marked,
  panelId,
  idPrefix,
  className = "",
}: {
  label: string;
  families: readonly { id: string; name: string }[];
  value: string;
  onChange: (id: string) => void;
  marked?: string;
  panelId: string;
  idPrefix: string;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = families.findIndex((f) => f.id === value);
  return (
    <div role="tablist" aria-label={label} className={`flex flex-wrap gap-1.5 ${className}`}>
      {families.map((f, i) => {
        const on = i === current;
        return (
          <button
            key={f.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            id={`${idPrefix}-${f.id}`}
            type="button"
            role="tab"
            aria-selected={on}
            aria-controls={panelId}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(f.id)}
            onKeyDown={(e) => {
              const n = rovingIndex(e, i, families.length);
              if (n === null) return;
              e.preventDefault();
              onChange(families[n].id);
              refs.current[n]?.focus();
            }}
            className={`relative inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-[11.5px] font-medium tracking-wide transition-colors duration-300 ease-premium ${
              on ? "border-fg bg-fg text-ink" : "border-white/[0.12] text-fg/65 hover:border-white/30 hover:text-fg"
            }`}
          >
            {f.name}
            {marked === f.id && (
              <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${on ? "bg-ink/70" : "bg-accent"}`} />
            )}
          </button>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ swatch chips (finishes) */

export interface ChipOption {
  id: string;
  name: string;
  /** CSS background of the little sample */
  swatch?: string;
  icon?: ReactNode;
}

/** a row of pill choices with a colour sample — a radio group (arrows move and pick) */
export function ChoiceChips({
  label,
  labelledBy,
  options,
  value,
  onChange,
  className = "",
}: {
  label?: string;
  labelledBy?: string;
  options: readonly ChipOption[];
  value: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <RadioGrid
      label={label}
      labelledBy={labelledBy}
      items={options}
      value={value}
      onChange={onChange}
      className={`flex flex-wrap gap-2 ${className}`}
      itemClassName={(on) =>
        `group inline-flex min-h-10 items-center gap-2.5 rounded-full border py-1.5 pl-1.5 pr-3.5 text-left text-[12.5px] transition-colors duration-300 ease-premium ${
          on ? "border-accent/70 bg-accent/[0.08] text-fg" : "border-white/[0.1] text-fg/75 hover:border-white/25 hover:text-fg"
        }`
      }
    >
      {(o, on) => (
        <>
          {o.icon ? (
            <span aria-hidden="true" className={`flex h-7 w-7 shrink-0 items-center justify-center ${on ? "text-accent" : "text-fg/60"}`}>
              {o.icon}
            </span>
          ) : (
            <span
              aria-hidden="true"
              className={`relative h-7 w-7 shrink-0 rounded-full ring-1 ring-inset transition-shadow duration-300 ${on ? "ring-accent" : "ring-white/15"}`}
              style={{ background: o.swatch }}
            >
              <span className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,.2),transparent_50%,rgba(0,0,0,.2))]" />
            </span>
          )}
          <span className="leading-tight">{o.name}</span>
        </>
      )}
    </RadioGrid>
  );
}

/* ------------------------------------------------------------------ disclosure section */

/**
 * One collapsible "Detalji" row: a button with the section name and its current value, the controls below.
 * Collapsed by default — the customer opens only what they care about.
 */
export function Disclosure({
  title,
  value,
  icon,
  open,
  onToggle,
  children,
}: {
  title: string;
  /** current choice, shown in the closed header */
  value: string;
  icon?: ReactNode;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  const uid = useId();
  const reduce = useReducedMotion();
  return (
    <div className={`rounded-2xl border transition-colors duration-500 ease-premium ${open ? "border-white/[0.16] bg-white/[0.03]" : "border-white/10 bg-white/[0.015] hover:border-white/20"}`}>
      <h3>
        <button
          type="button"
          id={`${uid}-h`}
          aria-expanded={open}
          aria-controls={`${uid}-p`}
          onClick={onToggle}
          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3.5 text-left"
        >
          {icon && (
            <span aria-hidden="true" className={`flex h-8 w-8 shrink-0 items-center justify-center transition-colors duration-300 ${open ? "text-accent" : "text-fg/55"}`}>
              {icon}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-display text-[15px] font-medium leading-tight">{title}</span>
            <span className="mt-1 block truncate text-[12px] leading-tight text-mut">{value}</span>
          </span>
          <ChevronUp
            aria-hidden="true"
            className={`h-4 w-4 shrink-0 text-fg/50 transition-transform duration-500 ease-premium ${open ? "" : "rotate-180"}`}
          />
        </button>
      </h3>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            key="body"
            id={`${uid}-p`}
            role="region"
            aria-labelledby={`${uid}-h`}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1, transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
            exit={{ height: 0, opacity: 0, transition: { duration: reduce ? 0 : 0.3, ease: EASE } }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0.5">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
