"use client";

/**
 * "+" markers over the 3D view at every empty place something can go (the engine's ViewInfo.gaps = plan.ts planGaps):
 * an empty-space element, the free end of a kitchen run (bare floor, or bare wall the kitchen can grow into), bare wall
 * in the wall-unit row (beside the window, between wall units, beyond the kitchen), the ends of the island / peninsula —
 * and, on a row with none of these (full), the joints between its elements ("seam": a neighbour gets narrower).
 * Shown in every step — quiet (small, dimmed) outside "Elementi", full in it or while an element is selected (the joints
 * only then); hovering or focusing one says what it adds and how much room there is ("Dodaj gornji element · slobodno
 * 120 cm", "… · susjedni se suzi").
 *
 * A click opens the add picker anchored at the "+" (AddPicker: widths preselected to what fills the place, the common
 * elements as big tiles, "Više elemenata" for the rest — lib/studio/edit.ts gapOptions checks every width by planning
 * it; at a run's end the tall units are in it too). A pick inserts it (insertAtGap); the new element is selected, so
 * its toolbar takes over.
 *
 * Position: from ViewInfo (api.subscribe), written straight into the DOM — no React render per frame, and nothing here
 * asks the engine to render. React renders only when the plan changes (the set of gaps). A "+" that would sit on a
 * dimension label moves just off it. On a phone the markers are larger (48 px targets) and the picker docks at the
 * bottom, in front of the step sheet.
 *
 * Keyboard: the markers are buttons (Tab — the quiet ones are left out of the Tab order, "Elementi" has them all); in the
 * picker the arrows move between its options, Escape closes it and goes back to its "+".
 */
import { useIsPresent } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, type KeyboardEvent, type RefObject } from "react";
import { gapOptions, insertAtGap, type EditResult } from "@/lib/studio/edit";
import { GAP_LABEL, planGaps, type KitchenPlan, type PlanGap } from "@/lib/studio/plan";
import type { GapView, KitchenConfig, StudioEngineApi, ViewInfo } from "@/lib/studio/types";
import { AddPicker, addItems, type AddItem } from "./AddPicker";
import { gapStretch } from "./addModel";
import { CloseIcon, PlusIcon } from "./icons";
import { clamp, gapPlace, islandWord } from "./meta";
import { areaOf, moveFocus, useEngineView, type Insets } from "./overlay";
import s from "./studio.module.css";

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** the picker keeps this far from its "+" */
const POP_GAP = 18;
/**
 * A dimension label as a "+" sees it when the engine does not report its size (ViewInfo.walls[].size): half of it, a
 * little generous. A "+" that would sit on one moves just off it — sideways or up / down, whichever is the shorter way
 * (sideways only while it stays on screen) — so both stay clickable.
 */
const LABEL = { hw: 58, hh: 15 } as const;
/** around a measured label: its hit area is larger than the pill (labels.ts: 8 px either side, 10 px above / below) */
const LABEL_PAD = { x: 6, y: 6 } as const;
/** half the dot (desktop; the phone's is larger) */
const DOT_R = 13;

/** where a "+" goes on screen: its anchor, moved off a dimension label it would cover */
function spot(gv: GapView, v: ViewInfo, r: number): { x: number; y: number } {
  let x = gv.anchor.x;
  let y = gv.anchor.y;
  for (const l of v.walls) {
    if (!l.visible) continue;
    const hw = (l.size ? l.size.w / 2 + LABEL_PAD.x : LABEL.hw) + r;
    const hh = (l.size ? l.size.h / 2 + LABEL_PAD.y : LABEL.hh) + r;
    const dx = x - l.label.x;
    const dy = y - l.label.y;
    if (Math.abs(dx) >= hw || Math.abs(dy) >= hh) continue;
    const sx = l.label.x + (dx < 0 ? -1 : 1) * (hw + 3);
    const sy = l.label.y + (dy < 0 ? -1 : 1) * (hh + 3);
    const sideways = Math.abs(sx - x) < Math.abs(sy - y) && sx >= r + 4 && sx <= v.size.w - r - 4;
    if (sideways) x = sx;
    else y = sy;
  }
  return { x, y };
}

export interface GapLayerProps {
  apiRef: RefObject<StudioEngineApi | null>;
  live: boolean;
  cfg: KitchenConfig;
  plan: KitchenPlan;
  /** phone: larger markers, the picker docked at the bottom in front of the step sheet */
  docked: boolean;
  insetsRef: RefObject<Insets>;
  /** outside "Elementi" with nothing selected: small, dimmed markers (full on hover / focus) */
  subtle: boolean;
  /** the first-visit coach mark points at the markers: they pulse once */
  pulse?: boolean;
  /** the gap whose picker is open (null: none) */
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** an insert worked or was refused: <Studio> applies it (undo step, toast, selects the new element) */
  onInsert: (r: EditResult, say: string) => void;
}

/** "slobodno 150 cm" (between two elements of a full row: one of them makes room) */
const freeText = (g: PlanGap) => (g.kind === "seam" ? "susjedni se suzi" : `slobodno ${Math.floor(g.maxWidth)} cm`);
/** "Dodaj gornji element" (plan.ts GAP_LABEL) */
const addText = (g: PlanGap) => `Dodaj ${lower(g.label || GAP_LABEL.base)}`;

export function GapLayer({ apiRef, live, cfg, plan, docked, insetsRef, subtle, pulse = false, openId, onOpen, onInsert }: GapLayerProps) {
  const all = useMemo(() => planGaps(plan), [plan]);
  // the joints of full rows ("seam") only where elements are being edited (and for the coach mark): elsewhere a "+" on
  // every joint would crowd a kitchen that has no free place at all
  const gaps = useMemo(() => all.filter((g) => g.kind !== "seam" || !subtle || pulse || g.id === openId), [all, subtle, pulse, openId]);
  const btns = useRef(new Map<string, HTMLButtonElement>());
  const popRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const lastView = useRef<ViewInfo | null>(null);
  const open = openId ? (gaps.find((g) => g.id === openId) ?? null) : null;

  /* ---------------------------------------------------------------- placement (per frame, straight into the DOM) */

  const placePop = useCallback(
    (v: ViewInfo | null) => {
      const p = popRef.current;
      const card = cardRef.current;
      if (!p || !card || !openId || docked) return;
      const gv = v?.gaps?.find((g) => g.id === openId);
      if (!v || !gv) return;
      const A = areaOf(v.size, insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 }, 8);
      const at = spot(gv, v, DOT_R);
      const w = card.offsetWidth;
      const h = card.scrollHeight;
      const above = at.y - POP_GAP - A.y0;
      const below = A.y1 - at.y - POP_GAP;
      const up = above >= h || above >= below;
      const maxH = Math.max(160, up ? above : below);
      card.style.maxHeight = `${Math.round(maxH)}px`;
      const hh = Math.min(h, maxH);
      const y = up ? at.y - POP_GAP - hh : at.y + POP_GAP;
      const x = clamp(at.x - w / 2, A.x0, Math.max(A.x0, A.x1 - w));
      p.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(clamp(y, A.y0, Math.max(A.y0, A.y1 - hh)))}px, 0)`;
      p.dataset.side = up ? "up" : "down";
    },
    [openId, docked, insetsRef],
  );

  const place = useCallback(
    (v: ViewInfo | null) => {
      lastView.current = v;
      const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const A = v ? areaOf(v.size, ins, docked ? 22 : 14) : null;
      const seen = new Set<string>();
      for (const gv of v?.gaps ?? []) {
        const b = btns.current.get(gv.id);
        if (!b || !A) continue;
        seen.add(gv.id);
        const at = v ? spot(gv, v, docked ? 17 : DOT_R) : gv.anchor;
        const on = gv.visible && at.x >= A.x0 && at.x <= A.x1 && at.y >= A.y0 && at.y <= A.y1;
        b.style.transform = `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0)`;
        if (on) b.dataset.on = "";
        else delete b.dataset.on;
        // out of reach while it is not shown (a focused one stays operable while it fades)
        b.inert = !on && document.activeElement !== b;
      }
      for (const [id, b] of btns.current) {
        if (seen.has(id)) continue;
        delete b.dataset.on;
        b.inert = true;
      }
      placePop(v);
    },
    [docked, insetsRef, placePop],
  );

  const present = useIsPresent();
  useEngineView(apiRef, live && present, place);

  // the set of gaps changed (a new plan): place them from the last frame (no render is asked for)
  useLayoutEffect(() => {
    place(apiRef.current?.viewInfo?.() ?? lastView.current);
  }, [apiRef, place, gaps]);

  useEffect(() => {
    if (present) return;
    for (const b of btns.current.values()) {
      delete b.dataset.on;
      b.inert = true;
    }
  }, [present]);

  /* ---------------------------------------------------------------- the picker */

  const opts = useMemo(() => (openId ? gapOptions(cfg, openId) : null), [cfg, openId]);
  const items = useMemo(() => (opts ? addItems(opts.types, opts.tall) : []), [opts]);

  // the gap went away (an edit elsewhere): the picker goes with it
  useEffect(() => {
    if (openId && !open) onOpen(null);
  }, [openId, open, onOpen]);

  // opened: placed before paint, its first option focused
  useLayoutEffect(() => {
    if (!openId) return;
    placePop(apiRef.current?.viewInfo?.() ?? lastView.current);
    const first = popRef.current?.querySelector<HTMLElement>("[data-tile]") ?? popRef.current?.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true });
  }, [openId, apiRef, placePop]);

  // "Više elemenata" makes the card taller: placed again (no render is asked for)
  useEffect(() => {
    const body = cardRef.current?.lastElementChild;
    if (!openId || !body) return;
    const ro = new ResizeObserver(() => placePop(apiRef.current?.viewInfo?.() ?? lastView.current));
    ro.observe(body);
    return () => ro.disconnect();
  }, [openId, apiRef, placePop]);

  // a press anywhere else closes it (its own "+" toggles it)
  useEffect(() => {
    if (!openId) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t || popRef.current?.contains(t) || btns.current.get(openId)?.contains(t)) return;
      onOpen(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [openId, onOpen]);

  const close = (refocus: boolean) => {
    const id = openId;
    onOpen(null);
    if (refocus && id) window.setTimeout(() => btns.current.get(id)?.focus({ preventScroll: true }), 0);
  };

  const pick = ({ t, tall }: AddItem, w: number) => {
    if (!openId) return;
    const r = insertAtGap(cfg, openId, t.id, w, tall ? "tall" : undefined);
    onInsert(r, `Dodano: ${lower(t.name)}, ${w} cm.`);
  };

  const onPopKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    // the arrows walk the widths and tiles
    if (e.defaultPrevented || (e.target as HTMLElement).dataset.row === undefined) return;
    if (popRef.current && moveFocus(popRef.current, e)) e.preventDefault();
  };

  const zoneOf = (g: PlanGap) => (g.zone === "upper" ? "upper" : g.zone === "island" ? "island" : "base");
  /** the run grows to take the new element */
  const grows = (g: PlanGap) =>
    (g.outside ?? 0) > 0.5 && (g.kind === "end" || g.kind === "island" || (g.kind === "upper" && Boolean(g.side)))
      ? ` ${g.run === "isl" ? islandWord(cfg.layout) : "Kuhinja"} se produžuje do novog elementa.`
      : "";

  return (
    <div className={s.gapLayer} data-pulse={pulse || undefined}>
      <div role="group" aria-label="Slobodna mjesta za nove elemente">
        {gaps.map((g) => {
          const where = gapPlace(g, cfg.layout);
          return (
            <button
              key={g.id}
              ref={(el) => {
                if (el) btns.current.set(g.id, el);
                else btns.current.delete(g.id);
              }}
              type="button"
              className={s.gap}
              data-docked={docked || undefined}
              data-subtle={(subtle && openId !== g.id) || undefined}
              // quiet markers stay out of the Tab order (they would come before the panel in every step); in
              // "Elementi" and while editing they are buttons like any other
              tabIndex={subtle && openId !== g.id ? -1 : undefined}
              data-zone={g.zone}
              data-open={openId === g.id || undefined}
              aria-label={`${addText(g)}: ${where}, ${freeText(g)}`}
              aria-haspopup="dialog"
              aria-expanded={openId === g.id}
              onClick={() => onOpen(openId === g.id ? null : g.id)}
            >
              <span aria-hidden="true" className={s.gapDot}>
                <PlusIcon className="h-4 w-4" />
              </span>
              <span aria-hidden="true" className={s.gapTip}>
                {addText(g)} · {freeText(g)}
              </span>
            </button>
          );
        })}
      </div>

      {open && opts && (
        <div ref={popRef} className={s.gapPop} data-docked={docked || undefined}>
          <div
            ref={cardRef}
            role="dialog"
            aria-label={`${addText(open)}: ${gapPlace(open, cfg.layout)}`}
            className={`${s.gapCard} ${s.thinScroll}`}
            onKeyDown={onPopKey}
          >
            <div className="flex items-start gap-2 px-4 pb-2.5 pt-3.5">
              <div className="min-w-0 flex-1">
                <p className="font-display text-[16px] font-medium leading-tight">{addText(open)}</p>
                <p className="mt-1 text-[11.5px] leading-snug text-mut">
                  {open.kind === "seam" ? (
                    <>{gapPlace(open, cfg.layout)}. Nema slobodnog mjesta — susjedni element suzit će se koliko treba.</>
                  ) : (
                    <>
                      {gapPlace(open, cfg.layout)} · <span className="tabular-nums">{freeText(open)}</span>.{grows(open)}
                    </>
                  )}
                </p>
              </div>
              <button
                type="button"
                aria-label="Zatvori"
                onClick={() => close(true)}
                className={`-mr-1.5 -mt-1.5 flex shrink-0 items-center justify-center rounded-full text-fg/55 transition-colors duration-300 hover:bg-white/[0.06] hover:text-fg ${docked ? "h-11 w-11" : "h-8 w-8"}`}
              >
                <CloseIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="px-2 pb-2.5">
              <AddPicker key={open.id} items={items} zone={zoneOf(open)} stretch={gapStretch(open)} docked={docked} onPick={pick} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
