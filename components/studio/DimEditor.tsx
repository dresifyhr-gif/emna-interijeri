"use client";

/**
 * Length editor — opens at a dimension label in 3D when the customer clicks it (engine onDimLabel). The room and the
 * kitchen are two different measures (the owner: "zidovi prostora je jedno, a dužina kuhinje je drugo"), so there are
 * two kinds of label and the editor says which one it changes:
 *
 *   room     the thin grey label above the wall units ("A 380 cm"): the room's wall. A kitchen that takes the whole
 *            wall follows it unless "Kuhinja ide cijelim zidom" is switched off (then it keeps its length) —
 *            lib/studio/edit.ts setWallLength / setRoomWall
 *   kitchen  the accent label on the floor in front of the cabinets ("Kuhinja A 300 cm"): how long the kitchen is on
 *            that wall and how far from the chosen end it starts (setKitchenExtent; "Cijeli zid" puts it back on the
 *            whole wall), with a bar that shows the kitchen inside the wall
 *   island   the island's / peninsula's label: its length (setWallLength(cfg, "isl"))
 *
 * A centimetre field with − / + (±1, ±10 with Shift; hold to repeat) and the range, and before anything changes a
 * preview of what the new numbers would cause (an element that no longer fits, a corner the kitchen has to keep clear
 * of). Enter applies, Escape cancels.
 *
 * Desktop: anchored to the label and following it while the view moves (ViewInfo, written straight into the DOM).
 * Phone: docked under the top bar, where the on-screen keyboard never covers it.
 */
import { useIsPresent } from "framer-motion";
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { kitchenExtent, setKitchenExtent, setRoomWall, setWallLength, wallLimits, type EditResult } from "@/lib/studio/edit";
import type { KitchenPlan } from "@/lib/studio/plan";
import type { DimLabelTarget, KitchenConfig, ScreenRect, StudioEngineApi, ViewInfo } from "@/lib/studio/types";
import { Segmented, Switch } from "./controls";
import { useHoldRepeat } from "./hooks";
import { CloseIcon, MinusIcon, NoteIcon, PlusIcon } from "./icons";
import { KitchenBar } from "./KitchenBar";
import { WALL_HINT, clamp, isRoomCorner, islandOf, wallEndName } from "./meta";
import { areaOf, useEngineView, type Insets } from "./overlay";
import { extentRange, offsetFrom } from "./room";
import s from "./studio.module.css";

export interface DimTargetState {
  target: DimLabelTarget;
  /** the label's rect when it was clicked (container px) */
  rect: ScreenRect;
  /** changes on every open */
  n: number;
}

const LABEL_HALF = 16;
const GAP = 10;

const num = (d: string) => (d === "" ? NaN : Number(d));

export function DimEditor({
  apiRef,
  live,
  cfg,
  plan,
  target,
  docked,
  insetsRef,
  onApply,
  onCancel,
}: {
  apiRef: RefObject<StudioEngineApi | null>;
  live: boolean;
  cfg: KitchenConfig;
  plan: KitchenPlan;
  target: DimTargetState;
  docked: boolean;
  insetsRef: RefObject<Insets>;
  /** apply an edit (`same` = nothing changes: just close); `say` = the toast */
  onApply: (r: EditResult, say: string, same: boolean) => void;
  onCancel: () => void;
}) {
  const uid = useId();
  const { wall, kind } = target.target;
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const isl = wall === "isl";
  const kitchen = kind === "kitchen" && !isl;
  const ext = !isl ? kitchenExtent(cfg, wall) : null;
  const W = isl ? "" : wall.toUpperCase();
  const many = cfg.layout !== "ravna" && cfg.layout !== "otok" && cfg.layout !== "poluotok";

  // ---- what is edited: the room's wall / the island's length, or the kitchen run (length, start, end measured from)
  const lim = kitchen && ext ? { min: ext.length.min, max: ext.room.value } : (wallLimits(cfg, wall) ?? { min: 0, max: 0 });
  const current = isl ? cfg.island : kitchen && ext ? ext.length.value : cfg.walls[wall];
  const [draft, setDraft] = useState(String(current));
  const [offDraft, setOffDraft] = useState(String(ext?.offset.value ?? 0));
  const [anchor, setAnchor] = useState<"left" | "right">(ext?.anchor ?? "left");
  const [follow, setFollow] = useState(true);

  const L = ext?.room.value ?? 0;
  const offN = num(offDraft);
  const offset = kitchen && ext ? clamp(Number.isFinite(offN) ? Math.round(offN) : ext.offset.value, 0, ext.offset.max) : 0;
  const maxLen = kitchen ? Math.max(lim.min, L - offset) : lim.max;
  const n = num(draft);
  const value = Number.isFinite(n) ? clamp(Math.round(n), lim.min, maxLen) : current;
  const out = Number.isFinite(n) && (n < lim.min || n > maxLen);
  const followsWall = !kitchen && !isl && Boolean(ext?.full) && follow;

  const title = isl ? `Duljina ${islandOf(cfg.layout)}` : kitchen ? `Kuhinja na zidu ${W}` : `Zid ${W}`;
  const hint = isl ? (cfg.layout === "otok" ? "" : "od zida A") : kitchen ? (many ? `zid ${WALL_HINT[wall]}` : "") : "prostorija";
  const anchorFrom = !isl ? wallEndName(cfg.layout, wall, anchor, true) : "";

  /** the edit the current numbers make (planned twice — well under a millisecond; renders only follow typing) */
  const result: EditResult = isl
    ? setWallLength(cfg, "isl", value)
    : kitchen
      ? setKitchenExtent(cfg, wall, { anchor, offset, length: value })
      : followsWall || !ext?.full
        ? setWallLength(cfg, wall, value)
        : setRoomWall(cfg, wall, value);
  const same = (kitchen && ext ? value === ext.length.value && offset === ext.offset.value && anchor === ext.anchor : value === current);
  const preview = !same ? result.warning : null;

  /** the kitchen inside the wall as the drafted numbers put it (the bar above the fields) */
  const draftRange = kitchen && ext ? extentRange(L, anchor, offset, value) : null;
  const run = !isl ? plan.runs.find((r) => r.wall === wall) : undefined;

  /* ---------------------------------------------------------------- placement */

  const place = useCallback(
    (v: ViewInfo | null, fallback?: ScreenRect) => {
      const root = rootRef.current;
      if (!root || docked) return;
      const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const size = v?.size ?? { w: window.innerWidth, h: window.innerHeight };
      const A = areaOf(size, ins, 8);
      const l = v?.walls.find((x) => x.wall === wall && (x.kind ?? "room") === kind);
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
    [docked, insetsRef, wall, kind],
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

  // the card grows with a preview: keep it where it belongs
  useLayoutEffect(() => {
    place(apiRef.current?.viewInfo?.() ?? null, target.rect);
  }, [apiRef, place, target.rect, preview, kitchen]);

  // a press anywhere else cancels (another dimension label opens its own editor)
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

  const apply = () => {
    if (!Number.isFinite(n)) {
      inputRef.current?.focus();
      return;
    }
    let say: string;
    if (isl) say = `${title}: ${value} cm.`;
    else if (kitchen) {
      // what the corner rules made of it (a start too close to a corner goes into the corner)
      const got = kitchenExtent(result.cfg, wall);
      const off = got?.offset.value ?? offset;
      say = `Kuhinja na zidu ${W}: ${got?.length.value ?? value} cm${off ? `, ${off} cm od ${wallEndName(cfg.layout, wall, got?.anchor ?? anchor, true)}` : ""}.`;
    }
    else say = `Zid ${W}: ${value} cm${ext?.full ? (followsWall ? ", kuhinja ga prati." : `, kuhinja ostaje ${ext.length.value} cm.`) : "."}`;
    onApply(result, say, same && !result.warning);
  };
  const toWholeWall = () => {
    if (!ext) return;
    onApply(setKitchenExtent(cfg, wall as Exclude<typeof wall, "isl">, null), `Kuhinja na zidu ${W} zauzima cijeli zid (${L} cm).`, false);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onCancel();
    } else if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") {
      e.preventDefault();
      apply();
    }
  };

  const tall = docked ? "h-11" : "h-9";

  return (
    <div
      ref={rootRef}
      className={s.dim}
      data-docked={docked || undefined}
      data-wide={kitchen || undefined}
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
            {hint && <span className="ml-2 normal-case tracking-normal text-mut">{hint}</span>}
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

        {kitchen && ext && draftRange && (
          <div className="px-4 pt-2">
            <KitchenBar
              className="block h-auto w-full"
              length={L}
              kitchen={draftRange}
              talls={same ? (run?.talls ?? []) : []}
              free={same ? (run?.free ?? []) : []}
              corners={{ left: isRoomCorner(cfg.layout, wall, "left"), right: isRoomCorner(cfg.layout, wall, "right") }}
              active
            />
          </div>
        )}

        <BigField
          inputRef={inputRef}
          uid={uid}
          label={kitchen ? "Duljina kuhinje" : title}
          draft={draft}
          setDraft={setDraft}
          value={value}
          current={current}
          min={lim.min}
          max={maxLen}
          docked={docked}
          invalid={out || !Number.isFinite(n)}
        />
        <p id={`${uid}-r`} className={`mt-2 px-4 text-center text-[11px] tabular-nums leading-snug ${out ? "text-[#E9AE9C]" : "text-mut"}`}>
          {out ? (n < lim.min ? `Najmanje ${lim.min} cm` : `Najviše ${maxLen} cm`) : `Od ${lim.min} do ${maxLen} cm`}
          <span className="text-mut/70"> · Shift + strelica: 10 cm</span>
        </p>

        {kitchen && ext && (
          <div className="mt-3.5 space-y-3 border-t border-white/[0.07] px-4 pt-3.5">
            <SmallField
              label={`Razmak od ${anchorFrom}`}
              draft={offDraft}
              setDraft={setOffDraft}
              value={offset}
              min={0}
              max={ext.offset.max}
              docked={docked}
            />
            <div>
              <p id={`${uid}-a`} className="mb-2 text-[11.5px] text-mut">
                Razmak mjerim od
              </p>
              <Segmented
                labelledBy={`${uid}-a`}
                size="sm"
                options={(["left", "right"] as const).map((sd) => ({
                  id: sd,
                  label: sd === "left" ? "lijevog kraja" : "desnog kraja",
                  aria: `${sd === "left" ? "Lijevog" : "Desnog"} kraja: ${wallEndName(cfg.layout, wall, sd)}`,
                }))}
                value={anchor}
                onChange={(a) => {
                  // the kitchen stays where it is: the offset is measured from the other end now
                  const k = draftRange;
                  if (k && a !== anchor) setOffDraft(String(offsetFrom(L, k, a)));
                  setAnchor(a);
                }}
              />
            </div>
          </div>
        )}

        {!kitchen && !isl && ext && (
          <div className="mt-3.5 border-t border-white/[0.07] px-4 pt-3">
            {ext.full ? (
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p id={`${uid}-f`} className="text-[12.5px] leading-tight text-fg/90">
                    Kuhinja ide cijelim zidom
                  </p>
                  <p className="mt-1 text-[11.5px] leading-snug text-mut">
                    {follow ? "Duljina kuhinje prati zid." : `Kuhinja ostaje ${ext.length.value} cm, ostatak zida je slobodan.`}
                  </p>
                </div>
                <Switch id={`${uid}-fs`} checked={follow} onChange={setFollow} labelledBy={`${uid}-f`} />
              </div>
            ) : (
              <p className="text-[11.5px] leading-snug text-mut">
                Kuhinja na ovom zidu ostaje {ext.length.value} cm — nju mijenjate klikom na kotu „Kuhinja {W}” na podu ispred elemenata.
              </p>
            )}
          </div>
        )}

        <div aria-live="polite" className="px-4">
          {preview && (
            <p className="mt-3 flex gap-2 rounded-xl border border-[#E39A84]/30 bg-[#E39A84]/[0.07] px-3 py-2.5 text-[12px] leading-relaxed text-fg/85">
              <NoteIcon className="mt-px h-4 w-4 shrink-0 text-[#E39A84]" />
              <span>{preview}</span>
            </p>
          )}
        </div>

        <div className="mt-3.5 flex items-center justify-end gap-2 border-t border-white/[0.08] px-3 py-3">
          {kitchen && ext && !ext.full && (
            <button
              type="button"
              onClick={toWholeWall}
              className={`mr-auto rounded-full px-3 text-[12px] font-medium text-fg/70 transition-colors duration-300 hover:text-accent ${tall}`}
            >
              Cijeli zid
            </button>
          )}
          <button type="button" onClick={onCancel} className={`rounded-full px-4 text-[12.5px] font-medium text-fg/70 transition-colors duration-300 hover:text-fg ${tall}`}>
            Odustani
          </button>
          <button
            type="button"
            onClick={apply}
            aria-keyshortcuts="Enter"
            className={`rounded-full bg-accent px-5 text-[12.5px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg ${tall}`}
          >
            {same ? "U redu" : `Postavi ${value} cm`}
          </button>
        </div>
      </div>
    </div>
  );
}

const stepBtn =
  "flex shrink-0 items-center justify-center rounded-full border border-white/[0.12] text-fg/75 transition-colors duration-300 ease-premium hover:border-accent/70 hover:text-accent disabled:pointer-events-none disabled:opacity-30 select-none touch-manipulation";

/** the main centimetre field: − / input / + (hold repeats, Shift = 10 cm, ↑ ↓ step) */
function BigField({
  inputRef,
  uid,
  label,
  draft,
  setDraft,
  value,
  current,
  min,
  max,
  docked,
  invalid,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  uid: string;
  label: string;
  draft: string;
  setDraft: (d: string) => void;
  value: number;
  current: number;
  min: number;
  max: number;
  docked: boolean;
  invalid: boolean;
}) {
  const shift = useRef(false);
  const n = num(draft);
  const setTo = (v: number) => setDraft(String(clamp(Math.round(v), min, max)));
  const bump = (d: number) => setTo((Number.isFinite(n) ? n : current) + d);
  const dec = useHoldRepeat((step) => bump(-(shift.current ? 10 : step)));
  const inc = useHoldRepeat((step) => bump(shift.current ? 10 : step));
  const size = docked ? "h-11 w-11" : "h-10 w-10";
  return (
    <div className="mt-2.5 flex items-center gap-2 px-4">
      <button
        type="button"
        aria-label={`${label}: kraće (Shift: 10 cm)`}
        disabled={value <= min}
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
          {label}, duljina u centimetrima
        </label>
        <input
          ref={inputRef}
          id={`${uid}-n`}
          type="text"
          inputMode="numeric"
          enterKeyHint="done"
          autoComplete="off"
          aria-describedby={`${uid}-r`}
          aria-invalid={invalid || undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
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
        aria-label={`${label}: dulje (Shift: 10 cm)`}
        disabled={value >= max}
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
  );
}

/** a second, smaller centimetre field (where the kitchen starts) */
function SmallField({
  label,
  draft,
  setDraft,
  value,
  min,
  max,
  docked,
}: {
  label: string;
  draft: string;
  setDraft: (d: string) => void;
  value: number;
  min: number;
  max: number;
  docked: boolean;
}) {
  const uid = useId();
  const setTo = (v: number) => setDraft(String(clamp(Math.round(v), min, max)));
  const dec = useHoldRepeat((step) => setTo(value - step));
  const inc = useHoldRepeat((step) => setTo(value + step));
  const size = docked ? "h-10 w-10" : "h-8 w-8";
  return (
    <div className="flex items-center justify-between gap-3">
      <label htmlFor={`${uid}-n`} className="min-w-0 text-[12px] leading-tight text-fg/85">
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        <button type="button" aria-label={`${label}: manje`} disabled={value <= min} className={`${stepBtn} ${size}`} {...dec}>
          <MinusIcon className="h-3.5 w-3.5" />
        </button>
        <div className="relative flex h-9 w-[78px] items-center rounded-full border border-white/[0.12] bg-white/[0.03] focus-within:border-accent/70">
          <input
            id={`${uid}-n`}
            type="text"
            inputMode="numeric"
            enterKeyHint="done"
            autoComplete="off"
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^\d]/g, "").slice(0, 4))}
            onKeyDown={(e) => {
              if (e.key === "ArrowUp" || e.key === "ArrowDown") {
                e.preventDefault();
                setTo(value + (e.key === "ArrowUp" ? 1 : -1) * (e.shiftKey ? 10 : 1));
              }
            }}
            className="w-full bg-transparent pl-3 pr-8 text-right font-display text-[14px] font-medium tabular-nums text-fg outline-none focus-visible:outline-none"
          />
          <span aria-hidden="true" className="pointer-events-none absolute right-3 text-[11px] text-mut">
            cm
          </span>
        </div>
        <button type="button" aria-label={`${label}: više`} disabled={value >= max} className={`${stepBtn} ${size}`} {...inc}>
          <PlusIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
