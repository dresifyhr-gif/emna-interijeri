"use client";

/**
 * Form controls for the studio panel: radio grids and segmented pickers with real
 * radio-group keyboard behaviour, a switch, and a centimetre field (− / + with
 * press-and-hold, typed value, slider).
 */
import { motion, useReducedMotion } from "framer-motion";
import { useId, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react";
import { useHoldRepeat } from "./hooks";
import { MinusIcon, NoteIcon, PlusIcon } from "./icons";
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
  className = "",
}: {
  label?: string;
  labelledBy?: string;
  options: readonly { id: T; label: ReactNode; aria?: string }[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "md";
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
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
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
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(o.id)}
            onKeyDown={(e) => {
              const n = rovingIndex(e, i, options.length);
              if (n === null) return;
              e.preventDefault();
              onChange(options[n].id);
              refs.current[n]?.focus();
            }}
            className={`relative flex items-center justify-center gap-1.5 rounded-full px-2 font-medium tracking-wide transition-colors duration-300 ease-premium ${h} ${
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
  children,
}: {
  title: string;
  description?: ReactNode;
  checked: boolean;
  onChange: (v: boolean) => void;
  children?: ReactNode;
}) {
  const uid = useId();
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 transition-colors duration-500 ease-premium hover:border-white/20">
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
  className?: string;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const set = (v: number) => onChange(clamp(Math.round(v), lo, hi));

  const dec = useHoldRepeat((step) => set(step === 1 ? value - 1 : Math.ceil(value / step) * step - step));
  const inc = useHoldRepeat((step) => set(step === 1 ? value + 1 : Math.floor(value / step) * step + step));

  const commitDraft = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft !== "" && Number.isFinite(n)) set(n);
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
                  set(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
                }
              }}
              className="w-full bg-transparent pl-3.5 pr-8 text-right font-display text-[15px] font-medium tabular-nums text-fg outline-none focus-visible:outline-none"
            />
            <span aria-hidden="true" className="pointer-events-none absolute right-3 text-[11px] text-mut">
              {unit}
            </span>
          </div>
          <button type="button" aria-label={`${label}: povećaj`} disabled={value >= hi} className={stepBtn} {...inc}>
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

export function Notes({ items }: { items: string[] }) {
  if (!items.length) return null;
  return (
    <ul className="mt-6 space-y-2" aria-label="Napomene">
      {items.map((w) => (
        <li key={w} className="flex gap-3 rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-fg/85">
          <NoteIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
          <span>{w}</span>
        </li>
      ))}
    </ul>
  );
}
