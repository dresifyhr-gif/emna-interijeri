"use client";

/**
 * Wall-length editor — opens at a dimension label in 3D ("A 290 cm") when the customer clicks it (engine
 * onWallLabel). A centimetre field with − / + (±1, ±10 with Shift; hold to repeat), the range this wall may have,
 * and before anything changes a preview of what the new length would cause (an element that no longer fits, a
 * window that narrows). Enter applies (lib/studio/edit.ts setWallLength), Escape cancels.
 *
 * Desktop: anchored to the label and following it while the view moves (ViewInfo, written straight into the DOM).
 * Phone: docked under the top bar, where the on-screen keyboard never covers it.
 */
import { useIsPresent } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { setWallLength, wallLimits } from "@/lib/studio/edit";
import type { DimTarget, KitchenConfig, ScreenRect, StudioEngineApi, ViewInfo } from "@/lib/studio/types";
import { useHoldRepeat } from "./hooks";
import { CloseIcon, MinusIcon, NoteIcon, PlusIcon } from "./icons";
import { WALL_HINT, clamp } from "./meta";
import { areaOf, useEngineView, type Insets } from "./overlay";
import s from "./studio.module.css";

export interface DimTargetState {
  wall: DimTarget;
  /** the label's rect when it was clicked (container px) */
  rect: ScreenRect;
  /** changes on every open */
  n: number;
}

const LABEL_HALF = 16;
const GAP = 10;

export function DimEditor({
  apiRef,
  live,
  cfg,
  target,
  docked,
  insetsRef,
  onApply,
  onCancel,
}: {
  apiRef: RefObject<StudioEngineApi | null>;
  live: boolean;
  cfg: KitchenConfig;
  target: DimTargetState;
  docked: boolean;
  insetsRef: RefObject<Insets>;
  onApply: (wall: DimTarget, cm: number) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const { wall } = target;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const shift = useRef(false);

  const lim = wallLimits(cfg, wall) ?? { min: 0, max: 0 };
  const current = wall === "isl" ? cfg.island : cfg.walls[wall];
  const [draft, setDraft] = useState(String(current));
  const n = draft === "" ? NaN : Number(draft);
  const value = Number.isFinite(n) ? clamp(Math.round(n), lim.min, lim.max) : current;
  const out = Number.isFinite(n) && (n < lim.min || n > lim.max);
  const many = cfg.layout !== "ravna" && cfg.layout !== "otok";
  const title = wall === "isl" ? "Duljina otoka" : `Zid ${wall.toUpperCase()}`;

  // what the new length would do, before it is applied (two plans, well under a millisecond)
  const preview = useMemo(() => (value !== current ? setWallLength(cfg, wall, value).warning : null), [cfg, wall, value, current]);

  /* ---------------------------------------------------------------- placement */

  const place = useCallback(
    (v: ViewInfo | null, fallback?: ScreenRect) => {
      const root = rootRef.current;
      if (!root || docked) return;
      const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const size = v?.size ?? { w: window.innerWidth, h: window.innerHeight };
      const A = areaOf(size, ins, 8);
      const l = v?.walls.find((x) => x.wall === wall);
      const c = l ? l.label : fallback ? { x: fallback.x + fallback.w / 2, y: fallback.y + fallback.h / 2 } : null;
      if (!c) return;
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      let y = c.y + LABEL_HALF + GAP;
      let up = false;
      if (y + h > A.y1 && c.y - LABEL_HALF - GAP - h >= A.y0) {
        y = c.y - LABEL_HALF - GAP - h;
        up = true;
      }
      y = clamp(y, A.y0, Math.max(A.y0, A.y1 - h));
      const x = clamp(c.x - w / 2, A.x0, Math.max(A.x0, A.x1 - w));
      root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      root.style.setProperty("--caret-x", `${Math.round(clamp(c.x - x, 20, w - 20))}px`);
      root.dataset.side = up ? "up" : "down";
    },
    [docked, insetsRef, wall],
  );

  // closing (a fade): no more input
  const present = useIsPresent();
  useEngineView(apiRef, live && present, place);
  useEffect(() => {
    if (!present && rootRef.current) rootRef.current.inert = true;
  }, [present]);

  useLayoutEffect(() => {
    place(apiRef.current?.viewInfo?.() ?? null, target.rect);
    const el = inputRef.current;
    if (el) {
      el.focus({ preventScroll: true });
      el.select();
    }
  }, [apiRef, place, target.rect]);

  // a press anywhere else cancels (another wall label opens its own editor)
  useEffect(() => {
    if (!present) return;
    const onDown = (e: globalThis.PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t || rootRef.current?.contains(t) || t.closest?.(".emna-studio-dim[role=button]")) return;
      onCancel();
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onCancel, present]);

  /* ---------------------------------------------------------------- editing */

  const setTo = (v: number) => setDraft(String(clamp(Math.round(v), lim.min, lim.max)));
  const bump = (d: number) => setTo((Number.isFinite(n) ? n : current) + d);
  const dec = useHoldRepeat((step) => bump(-(shift.current ? 10 : step)));
  const inc = useHoldRepeat((step) => bump(shift.current ? 10 : step));

  const apply = () => {
    if (!Number.isFinite(n)) {
      inputRef.current?.focus();
      return;
    }
    onApply(wall, value);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    }
  };

  const stepBtn =
    "flex shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-fg/75 transition-colors duration-300 ease-premium hover:border-accent/70 hover:text-accent disabled:pointer-events-none disabled:opacity-30 select-none touch-manipulation";
  const size = docked ? "h-11 w-11" : "h-10 w-10";

  return (
    <div
      ref={rootRef}
      className={s.dim}
      data-docked={docked || undefined}
      data-side="down"
      role="dialog"
      aria-labelledby={`${uid}-t`}
      aria-describedby={`${uid}-r`}
      onKeyDown={onKeyDown}
      onBlur={(e) => {
        const to = e.relatedTarget as Node | null;
        if (to && !e.currentTarget.contains(to) && !(to as HTMLElement).closest?.(".emna-studio-dim[role=button]")) onCancel();
      }}
    >
      <div className={s.dimCard}>
        <span aria-hidden="true" className={s.dimCaret} />
        <div className="flex items-start gap-2 px-4 pt-3.5">
          <p id={`${uid}-t`} className="eyebrow min-w-0 flex-1 text-accent">
            {title}
            {wall !== "isl" && many && <span className="ml-2 normal-case tracking-normal text-mut">{WALL_HINT[wall]}</span>}
          </p>
          <button
            type="button"
            aria-label="Odustani"
            onClick={onCancel}
            className={`-mr-1.5 -mt-1.5 flex shrink-0 items-center justify-center rounded-full text-fg/55 transition-colors duration-300 hover:bg-white/[0.06] hover:text-fg ${docked ? "h-11 w-11" : "h-8 w-8"}`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2.5 flex items-center gap-2 px-4">
          <button
            type="button"
            aria-label={`${title}: kraće (Shift: 10 cm)`}
            disabled={value <= lim.min}
            className={`${stepBtn} ${size}`}
            {...dec}
            onPointerDown={(e) => {
              shift.current = e.shiftKey;
              dec.onPointerDown(e);
            }}
            onClick={(e) => {
              shift.current = e.shiftKey;
              dec.onClick(e);
            }}
          >
            <MinusIcon className="h-4 w-4" />
          </button>
          <div className="relative flex h-11 min-w-0 flex-1 items-center rounded-full border border-white/[0.14] bg-white/[0.03] transition-colors duration-300 ease-premium focus-within:border-accent/80 hover:border-white/25">
            <label htmlFor={`${uid}-n`} className="sr-only">
              {title}, duljina u centimetrima
            </label>
            <input
              ref={inputRef}
              id={`${uid}-n`}
              type="text"
              inputMode="numeric"
              enterKeyHint="done"
              autoComplete="off"
              aria-describedby={`${uid}-r`}
              aria-invalid={out || !Number.isFinite(n) || undefined}
              value={draft}
              onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  apply();
                } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                  e.preventDefault();
                  bump((e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
                }
              }}
              className="w-full bg-transparent pl-4 pr-10 text-center font-display text-[20px] font-medium tabular-nums text-fg outline-none focus-visible:outline-none"
            />
            <span aria-hidden="true" className="pointer-events-none absolute right-4 text-[12px] text-mut">
              cm
            </span>
          </div>
          <button
            type="button"
            aria-label={`${title}: dulje (Shift: 10 cm)`}
            disabled={value >= lim.max}
            className={`${stepBtn} ${size}`}
            {...inc}
            onPointerDown={(e) => {
              shift.current = e.shiftKey;
              inc.onPointerDown(e);
            }}
            onClick={(e) => {
              shift.current = e.shiftKey;
              inc.onClick(e);
            }}
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        </div>

        <p id={`${uid}-r`} className={`mt-2 px-4 text-center text-[11px] tabular-nums leading-snug ${out ? "text-[#E9AE9C]" : "text-mut"}`}>
          {out ? (n < lim.min ? `Najmanje ${lim.min} cm` : `Najviše ${lim.max} cm`) : `Od ${lim.min} do ${lim.max} cm`}
          <span className="text-mut/70"> · Shift + strelica: 10 cm</span>
        </p>

        <div aria-live="polite" className="px-4">
          {preview && (
            <p className="mt-3 flex gap-2 rounded-xl border border-[#E39A84]/30 bg-[#E39A84]/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-fg/85">
              <NoteIcon className="mt-px h-4 w-4 shrink-0 text-[#E39A84]" />
              <span>
                Uz {value} cm: {preview}
              </span>
            </p>
          )}
        </div>

        <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-white/[0.08] px-3 py-3">
          <button
            type="button"
            onClick={onCancel}
            className={`rounded-full px-4 text-[12.5px] font-medium text-fg/70 transition-colors duration-300 hover:text-fg ${docked ? "h-11" : "h-9"}`}
          >
            Odustani
          </button>
          <button
            type="button"
            onClick={apply}
            aria-keyshortcuts="Enter"
            className={`rounded-full bg-accent px-5 text-[12.5px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg ${docked ? "h-11" : "h-9"}`}
          >
            {value === current ? "U redu" : `Postavi ${value} cm`}
          </button>
        </div>
      </div>
    </div>
  );
}
