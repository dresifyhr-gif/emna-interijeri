"use client";

/**
 * "+" markers over the 3D view at every empty place something can go (the engine's ViewInfo.gaps = plan.ts planGaps):
 * an empty-space element, the free end of a kitchen run (bare floor, or bare wall the kitchen can grow into), bare wall
 * above the worktop, the ends of the island / peninsula. Shown while the customer is editing (the "Elementi" step, or an
 * element selected); hovering one says how much room there is ("slobodno 150 cm").
 *
 * A click opens the add picker anchored at the "+": what fits there (lib/studio/edit.ts gapOptions — every width
 * checked by planning it), and at a run's end also tall units (a fridge column, the side-by-side fridge niche with its
 * cabinet above, a larder) that join the column standing there or start a new one. A pick inserts it (insertAtGap); the
 * new element is selected, so its toolbar takes over.
 *
 * Position: from ViewInfo (api.subscribe), written straight into the DOM — no React render per frame, and nothing here
 * asks the engine to render. React renders only when the plan changes (the set of gaps). On a phone the markers are
 * larger and the picker docks above the sheet.
 *
 * Keyboard: the markers are buttons (Tab); in the picker the arrows move between its options, Escape closes it and goes
 * back to its "+".
 */
import { useIsPresent } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { gapOptions, insertAtGap, type EditResult, type TypeChoice } from "@/lib/studio/edit";
import { planGaps, type KitchenPlan, type PlanGap } from "@/lib/studio/plan";
import type { KitchenConfig, StudioEngineApi, ViewInfo } from "@/lib/studio/types";
import { Segmented } from "./controls";
import { AddList } from "./ElementToolbar";
import { CloseIcon, PlusIcon } from "./icons";
import { clamp, gapPlace, islandOf } from "./meta";
import { areaOf, moveFocus, useEngineView, type Insets } from "./overlay";
import s from "./studio.module.css";

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);
/** the picker keeps this far from its "+" */
const POP_GAP = 18;

export interface GapLayerProps {
  apiRef: RefObject<StudioEngineApi | null>;
  live: boolean;
  cfg: KitchenConfig;
  plan: KitchenPlan;
  /** phone: larger markers, the picker docked above the sheet */
  docked: boolean;
  insetsRef: RefObject<Insets>;
  /** the gap whose picker is open (null: none) */
  openId: string | null;
  onOpen: (id: string | null) => void;
  /** an insert worked or was refused: <Studio> applies it (undo step, toast, selects the new element) */
  onInsert: (r: EditResult, say: string) => void;
}

/** "slobodno 150 cm" */
const freeText = (g: PlanGap) => `slobodno ${Math.floor(g.maxWidth)} cm`;

export function GapLayer({ apiRef, live, cfg, plan, docked, insetsRef, openId, onOpen, onInsert }: GapLayerProps) {
  const gaps = useMemo(() => planGaps(plan), [plan]);
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
      const w = card.offsetWidth;
      const h = card.scrollHeight;
      const above = gv.anchor.y - POP_GAP - A.y0;
      const below = A.y1 - gv.anchor.y - POP_GAP;
      const up = above >= h || above >= below;
      const maxH = Math.max(160, up ? above : below);
      card.style.maxHeight = `${Math.round(maxH)}px`;
      const hh = Math.min(h, maxH);
      const y = up ? gv.anchor.y - POP_GAP - hh : gv.anchor.y + POP_GAP;
      const x = clamp(gv.anchor.x - w / 2, A.x0, Math.max(A.x0, A.x1 - w));
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
        const on = gv.visible && gv.anchor.x >= A.x0 && gv.anchor.x <= A.x1 && gv.anchor.y >= A.y0 && gv.anchor.y <= A.y1;
        b.style.transform = `translate3d(${Math.round(gv.anchor.x)}px, ${Math.round(gv.anchor.y)}px, 0)`;
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
  const fits = (l: TypeChoice[]) => l.filter((t) => t.width !== null && (t.fitting?.length ?? 1) > 0);
  const types = opts ? fits(opts.types) : [];
  const talls = opts ? fits(opts.tall) : [];
  // at a run's end: base cabinets or tall units (a list each); the tab is per gap
  const [tabOf, setTabOf] = useState<{ id: string; tab: "base" | "tall" } | null>(null);
  const tab: "base" | "tall" = !types.length && talls.length ? "tall" : tabOf && tabOf.id === openId && talls.length ? tabOf.tab : "base";

  // the gap went away (an edit elsewhere): the picker goes with it
  useEffect(() => {
    if (openId && !open) onOpen(null);
  }, [openId, open, onOpen]);

  // opened: placed before paint, its first option focused
  useLayoutEffect(() => {
    if (!openId) return;
    placePop(apiRef.current?.viewInfo?.() ?? lastView.current);
    const first = popRef.current?.querySelector<HTMLElement>("[data-row]") ?? popRef.current?.querySelector<HTMLElement>("button");
    first?.focus({ preventScroll: true });
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

  const pick = (t: TypeChoice, w: number, zone?: "tall") => {
    if (!openId) return;
    const r = insertAtGap(cfg, openId, t.id, w, zone);
    onInsert(r, `Dodano: ${lower(t.name)}, ${w} cm.`);
  };

  const onPopKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      close(true);
      return;
    }
    // the arrows walk the options (the tabs above them handle their own)
    if (e.defaultPrevented || (e.target as HTMLElement).dataset.row === undefined) return;
    if (popRef.current && moveFocus(popRef.current, e)) e.preventDefault();
  };

  const zoneOf = (g: PlanGap) => (g.zone === "upper" ? "upper" : g.zone === "island" ? "island" : "base");
  const groupName = (g: PlanGap) =>
    g.zone === "upper" ? "Gornji elementi" : g.zone === "island" ? `Elementi ${islandOf(cfg.layout)}` : "Donji elementi";

  return (
    <div className={s.gapLayer}>
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
              data-open={openId === g.id || undefined}
              aria-label={`Dodaj element: ${where}, ${freeText(g)}`}
              aria-haspopup="dialog"
              aria-expanded={openId === g.id}
              onClick={() => onOpen(openId === g.id ? null : g.id)}
            >
              <span aria-hidden="true" className={s.gapDot}>
                <PlusIcon className="h-4 w-4" />
              </span>
              <span aria-hidden="true" className={s.gapTip}>
                {freeText(g)}
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
            aria-label={`Dodaj element: ${gapPlace(open, cfg.layout)}`}
            className={`${s.gapCard} ${s.thinScroll}`}
            onKeyDown={onPopKey}
          >
            <div className="flex items-start gap-2 px-4 pb-2 pt-3.5">
              <div className="min-w-0 flex-1">
                <p className="eyebrow text-accent">Dodaj element</p>
                <p className="mt-1.5 text-[11.5px] leading-snug text-mut">
                  {gapPlace(open, cfg.layout)} · {freeText(open)}
                  {open.kind === "end" && (open.outside ?? 0) > 0.5 ? " — kuhinja se produžuje do novog elementa." : "."}
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
            <div className="px-2 pb-2">
              {types.length > 0 && talls.length > 0 && (
                <div className="px-2 pb-2.5 pt-0.5">
                  <Segmented
                    label="Vrsta elementa"
                    size="sm"
                    options={[
                      { id: "base" as const, label: groupName(open) },
                      { id: "tall" as const, label: "Visoki elementi", aria: "Visoki elementi: hladnjak, pećnica, smočnica" },
                    ]}
                    value={tab}
                    onChange={(t) => openId && setTabOf({ id: openId, tab: t })}
                  />
                </div>
              )}
              {tab === "base" && types.length > 0 && <AddList items={types} zone={zoneOf(open)} docked={docked} onPick={(t, w) => pick(t, w)} />}
              {tab === "tall" && talls.length > 0 && (
                <>
                  <p className="mb-1.5 px-2.5 text-[11.5px] leading-snug text-mut">Visoki stup uz kraj kuhinje — od poda do vrha visokih elemenata.</p>
                  <AddList items={talls} zone="tall" docked={docked} onPick={(t, w) => pick(t, w, "tall")} />
                </>
              )}
              {!types.length && !talls.length && (
                <p className="px-2.5 pb-2 text-[12px] leading-relaxed text-mut">Ovdje trenutno ne stane nijedan element.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
