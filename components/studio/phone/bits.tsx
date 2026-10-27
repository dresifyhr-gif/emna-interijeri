"use client";

/**
 * Small pieces of the phone's simple flow: big targets (at least 48 px), one thing per row, calm. The studio's own
 * controls (controls.tsx) are made for the desktop panel; these are the thumb-sized versions.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { useHoldRepeat } from "../hooks";
import { CheckIcon, MinusIcon, NoteIcon, PlusIcon } from "../icons";
import { clamp } from "../meta";

/** what an edit said: a refusal (why) or a note (what else it did) — shown next to the control that made it */
export interface FlowNote {
  /** the control it belongs to */
  where: string;
  text: string;
  tone: "info" | "refused";
}

export function InlineNote({ note, where, className = "mt-3" }: { note: FlowNote | null; where: string; className?: string }) {
  if (!note || note.where !== where) return null;
  return (
    <p
      role={note.tone === "refused" ? "alert" : "status"}
      className={`flex gap-2.5 rounded-2xl border px-3.5 py-3 text-[12.5px] leading-relaxed ${
        note.tone === "refused" ? "border-[#E39A84]/30 bg-[#E39A84]/[0.07] text-fg/90" : "border-accent/25 bg-accent/[0.06] text-fg/85"
      } ${className}`}
    >
      <NoteIcon className={`mt-px h-4 w-4 shrink-0 ${note.tone === "refused" ? "text-[#E39A84]" : "text-accent"}`} />
      <span className="min-w-0">{note.text}</span>
    </p>
  );
}

/**
 * A length in cm with big − / + (hold to go faster: 1 → 5 → 10 cm) and the number itself to type into. The value
 * shown follows the taps at once; the kitchen gets it a moment after the last one (`commitMs`), so holding + does not
 * rebuild the 3D view for every centimetre.
 */
export function BigStepper({
  label,
  sub,
  value,
  min,
  max,
  onCommit,
  commitMs = 450,
}: {
  label: string;
  sub?: string | null;
  value: number;
  min: number;
  max: number;
  onCommit: (v: number) => void;
  commitMs?: number;
}) {
  const uid = useId();
  const [draft, setDraft] = useState<number | null>(null);
  const [typing, setTyping] = useState<string | null>(null);
  const timer = useRef<number | null>(null);
  const latest = useRef(onCommit);
  useEffect(() => {
    latest.current = onCommit;
  });
  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    },
    [],
  );
  const lo = Math.min(min, max);
  const hi = Math.max(min, max);
  const shown = draft ?? value;

  const flush = (v: number) => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    setDraft(null);
    if (v !== value) latest.current(v);
  };
  const later = (v: number) => {
    setDraft(v);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => flush(v), commitMs);
  };
  const cur = () => draft ?? value;
  const dec = useHoldRepeat((step) => later(clamp(step === 1 ? cur() - 1 : Math.ceil(cur() / step) * step - step, lo, hi)));
  const inc = useHoldRepeat((step) => later(clamp(step === 1 ? cur() + 1 : Math.floor(cur() / step) * step + step, lo, hi)));

  const commitTyping = () => {
    if (typing === null) return;
    const n = Number(typing);
    setTyping(null);
    // a number out of range goes to the planner as typed: it clamps it and says so
    if (typing !== "" && Number.isFinite(n)) flush(Math.round(n));
  };

  const btn =
    "flex h-[52px] w-[52px] shrink-0 select-none items-center justify-center rounded-full border border-white/[0.14] bg-white/[0.03] text-fg/85 transition-colors duration-300 ease-premium active:border-accent active:text-accent disabled:pointer-events-none disabled:opacity-30 touch-manipulation";
  return (
    <div>
      <label htmlFor={`${uid}-n`} className="flex items-baseline gap-2 text-[13.5px] leading-tight text-fg">
        {label}
        {sub && <span className="text-[12px] text-mut">{sub}</span>}
      </label>
      <div className="mt-2.5 flex items-center gap-2.5">
        <button type="button" aria-label={`${label}: manje`} disabled={shown <= lo} className={btn} {...dec}>
          <MinusIcon className="h-5 w-5" />
        </button>
        <div className="relative flex h-[52px] min-w-0 flex-1 items-center justify-center rounded-full border border-white/[0.12] bg-white/[0.03] transition-colors duration-300 focus-within:border-accent/70">
          <input
            id={`${uid}-n`}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            aria-describedby={`${uid}-r`}
            value={typing ?? String(shown)}
            onChange={(e) => setTyping(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            onFocus={(e) => {
              setTyping(String(shown));
              e.currentTarget.select();
            }}
            onBlur={commitTyping}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
            className="w-full bg-transparent pr-9 text-center font-display text-[24px] font-medium tabular-nums tracking-tight text-fg outline-none"
            style={{ paddingLeft: 36 }}
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[12px] text-mut">
            cm
          </span>
        </div>
        <button type="button" aria-label={`${label}: više`} disabled={shown >= hi} className={btn} {...inc}>
          <PlusIcon className="h-5 w-5" />
        </button>
      </div>
      <p id={`${uid}-r`} className="mt-1.5 text-center text-[11px] tabular-nums text-mut/80">
        od {lo} do {hi} cm
      </p>
    </div>
  );
}

export interface Choice<T extends string> {
  id: T;
  name: string;
  note?: string;
  /** a small drawing above the name */
  glyph?: ReactNode;
  /** cannot be chosen (the reason is in `note`) */
  off?: boolean;
}

/** a radio group of big tiles (2 per row; `cols` 3 for short labels) */
export function ChoiceGrid<T extends string>({
  label,
  choices,
  value,
  onChange,
  cols = 2,
}: {
  label: string;
  choices: readonly Choice<T>[];
  value: T | null;
  onChange: (v: T) => void;
  cols?: 2 | 3;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = choices.findIndex((c) => c.id === value);
  return (
    <div role="radiogroup" aria-label={label} className={`grid gap-2 ${cols === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
      {choices.map((c, i) => {
        const on = i === current;
        return (
          <button
            key={c.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={c.off || undefined}
            tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
            onClick={() => onChange(c.id)}
            onKeyDown={(e) => {
              const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
              if (!d) return;
              e.preventDefault();
              const n = (i + d + choices.length) % choices.length;
              onChange(choices[n].id);
              refs.current[n]?.focus();
            }}
            className={`relative flex min-h-[56px] flex-col items-start justify-center rounded-2xl border px-3.5 py-2.5 text-left transition-[border-color,background-color] duration-300 ease-premium ${
              on ? "border-accent/80 bg-accent/[0.09]" : "border-white/10 bg-white/[0.025] active:bg-white/[0.06]"
            } ${c.off ? "opacity-45" : ""}`}
          >
            {c.glyph && <span className={`mb-1.5 ${on ? "text-accent" : "text-fg/70"}`}>{c.glyph}</span>}
            <span className="pr-5 text-[14px] font-medium leading-tight text-fg">{c.name}</span>
            {c.note && <span className="mt-0.5 text-[11.5px] leading-snug text-mut">{c.note}</span>}
            {on && (
              <span aria-hidden="true" className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-ink">
                <CheckIcon className="h-3 w-3" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** a yes / no row with a big switch */
export function BigSwitch({ title, note, checked, onChange }: { title: string; note?: string; checked: boolean; onChange: (on: boolean) => void }) {
  const uid = useId();
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={note ? `${uid}-d` : undefined}
      onClick={() => onChange(!checked)}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.025] px-4 py-2.5 text-left transition-colors duration-300 active:bg-white/[0.06]"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-medium leading-tight text-fg">{title}</span>
        {note && (
          <span id={`${uid}-d`} className="mt-0.5 block text-[11.5px] leading-snug text-mut">
            {note}
          </span>
        )}
      </span>
      <span
        aria-hidden="true"
        className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-300 ease-premium ${checked ? "bg-accent" : "bg-white/15"}`}
      >
        <span
          className={`absolute top-1 h-5 w-5 rounded-full bg-fg shadow transition-transform duration-300 ease-premium ${checked ? "translate-x-6" : "translate-x-1"}`}
        />
      </span>
    </button>
  );
}

/** a section label inside a wizard screen */
export function FlowLabel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`eyebrow flex items-center gap-2.5 text-mut ${className}`}>{children}</p>;
}
