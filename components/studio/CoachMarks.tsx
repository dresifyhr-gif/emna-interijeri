"use client";

/**
 * First-visit coach marks — three short cards, one at a time, each skippable ("Preskoči" ends them all):
 *
 *   1  "Kliknite element za izmjenu"   pointing at a cabinet (done by selecting an element too)
 *   2  "Plus dodaje novi element"       pointing at a "+" when one is on screen (they pulse); done by opening one too
 *   3  "Kliknite kotu za mjere"         pointing at a dimension label (they glow); done by clicking one too
 *
 * How far the customer got is remembered (hooks.ts useCoach: localStorage, in memory when it is blocked). The card
 * follows its target through ViewInfo (written straight into the DOM, never asking the engine to render); with nothing
 * to point at it waits in a corner of the 3D view (desktop: bottom left, phone: under the top bar). It never takes
 * focus; Escape inside it skips.
 *
 * Mark 1's cabinet: ViewInfo has no rects of elements that are not selected, so it is worked out from the "+" places the
 * engine projects (ViewInfo.gaps): a full row's joint ("seam") lies on the fronts of two cabinets, at their mid height —
 * the middle of the wider of the two is half its width away (cabinetPoint). With no joint on screen it points at the
 * middle of the 3D view (a small ring marks the spot either way).
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { planGaps, type KitchenPlan, type PlanGap } from "@/lib/studio/plan";
import type { StudioEngineApi, ViewInfo } from "@/lib/studio/types";
import type { CoachState } from "./hooks";
import { clamp } from "./meta";
import { areaOf, useEngineView, type Area, type Insets } from "./overlay";
import s from "./studio.module.css";

/** `seen`: mark 2 — a "+" is on screen; mark 3 — a kitchen (gold) label is on screen */
const MARKS: { title: string; text: (touch: boolean, seen: boolean) => string }[] = [
  {
    title: "Kliknite element za izmjenu",
    text: (touch) => `${touch ? "Dodirnite" : "Kliknite"} ormarić u 3D prikazu — iznad njega su širina, zamjena, dodavanje i uklanjanje.`,
  },
  {
    title: "Plus dodaje novi element",
    text: (_, gaps) =>
      gaps
        ? "Znak + dodaje element na slobodno mjesto, na zidu i na podu — ili između dva elementa, a susjedni se suzi."
        : "Znak + pojavi se na svakom slobodnom mjestu, na zidu i na podu. Uz odabrani element: + lijevo i + desno.",
  },
  {
    title: "Kliknite kotu za mjere",
    text: (_, kitchen) =>
      kitchen
        ? "Siva kota mijenja zid prostorije, zlatna duljinu kuhinje."
        : "Kota mijenja duljinu zida, a kuhinja ga prati. Kuhinja kraća od zida dobije svoju, zlatnu kotu.",
  },
];

/** room between the card and what it points at */
const GAP = 16;

/**
 * Mark 1: a point on a cabinet on screen (see the file comment) — the selected element when there is one, else the middle
 * of the wider of the two cabinets beside a full row's joint; null when no joint is on screen. Base and island rows
 * before wall units, then the joint nearest the middle of the view.
 *
 * The joint is exact (the engine projects it); the way to the cabinet's middle is half its width at the view's scale,
 * estimated from wall A filling about half of the framed view (the engine frames the whole room: ~1.3 px / cm on a
 * 1440 px desktop, ~0.5 on a phone), a little short of it so it stays on the cabinet. Screen x grows with run-local x
 * on the walls in the studio's view and falls on the island (meta.isFlipped).
 */
export function cabinetPoint(v: ViewInfo, seams: Map<string, PlanGap>, plan: KitchenPlan, A: Area): { x: number; y: number } | null {
  const inA = (p: { x: number; y: number }) => p.x >= A.x0 && p.x <= A.x1 && p.y >= A.y0 && p.y <= A.y1;
  const sel = v.selected;
  if (sel?.visible) {
    const c = { x: sel.rect.x + sel.rect.w / 2, y: sel.rect.y + sel.rect.h / 2 };
    if (inA(c)) return c;
  }
  const cx = (A.x0 + A.x1) / 2;
  const cy = (A.y0 + A.y1) / 2;
  const on = (v.gaps ?? []).filter((g) => g.kind === "seam" && g.visible && inA(g.anchor) && seams.has(g.id));
  on.sort((p, q) => Number(p.zone === "upper") - Number(q.zone === "upper") || Math.hypot(p.anchor.x - cx, p.anchor.y - cy) - Math.hypot(q.anchor.x - cx, q.anchor.y - cy));
  const scale = (0.45 * (A.x1 - A.x0)) / Math.max(200, plan.cfg.walls.a);
  for (const g of on) {
    const [aId, bId] = seams.get(g.id)?.between ?? [];
    const a = plan.slots.find((x) => x.id === aId);
    const b = plan.slots.find((x) => x.id === bId);
    if (!a || !b) continue;
    const k = (g.run === "isl" ? -1 : 1) * scale;
    const p = { x: g.anchor.x + k * (b.width >= a.width ? b.width / 2 : -a.width / 2), y: g.anchor.y };
    if (inA(p)) return p;
  }
  return null;
}

export function CoachMarks({
  apiRef,
  live,
  plan,
  state,
  docked,
  touch,
  insetsRef,
  onNext,
  onSkip,
}: {
  apiRef: RefObject<StudioEngineApi | null>;
  live: boolean;
  /** the shown plan (mark 1 finds a cabinet from the joints of its full rows) */
  plan: KitchenPlan;
  state: Exclude<CoachState, "done">;
  /** phone: the waiting place is under the top bar */
  docked: boolean;
  /** "Dodirnite" instead of "Kliknite" */
  touch: boolean;
  insetsRef: RefObject<Insets>;
  onNext: () => void;
  onSkip: () => void;
}) {
  const i = Number(state);
  const mark = MARKS[i];
  const rootRef = useRef<HTMLDivElement>(null);
  const dotRef = useRef<HTMLSpanElement>(null);
  const seams = useMemo(() => new Map(planGaps(plan).filter((g) => g.kind === "seam").map((g) => [g.id, g])), [plan]);
  // what the mark's wording depends on is on screen (a "+", a kitchen label): React renders only when that changes
  const [seen, setSeen] = useState(false);
  const seenRef = useRef(false);
  const see = useCallback((on: boolean) => {
    if (on === seenRef.current) return;
    seenRef.current = on;
    setSeen(on);
  }, []);

  const place = useCallback(
    (v: ViewInfo | null) => {
      const root = rootRef.current;
      if (!root) return;
      const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
      const size = v?.size ?? { w: window.innerWidth, h: window.innerHeight };
      const A = areaOf(size, ins, 16);
      const w = root.offsetWidth;
      const h = root.offsetHeight;
      const inA = (p: { x: number; y: number }) => p.x >= A.x0 && p.x <= A.x1 && p.y >= A.y0 && p.y <= A.y1;
      // what this mark points at: a "+" on screen, a room label (else any label)
      let at: { x: number; y: number } | null = null;
      if (i === 0) {
        // a cabinet on screen, else the middle of the 3D view (the kitchen is framed there)
        at = (v ? cabinetPoint(v, seams, plan, A) : null) ?? { x: (A.x0 + A.x1) / 2, y: (A.y0 + A.y1) / 2 };
      } else if (i === 1) {
        const g = v?.gaps?.find((x) => x.visible && inA(x.anchor));
        at = g ? g.anchor : null;
        see(Boolean(v?.gaps?.some((x) => x.visible)));
      } else if (i === 2) {
        const ls = v?.walls.filter((l) => l.visible && inA(l.label)) ?? [];
        see(ls.some((l) => l.kind === "kitchen" && l.wall !== "isl"));
        at = (ls.find((l) => (l.kind ?? "room") === "room") ?? ls[0])?.label ?? null;
      }
      let x: number;
      let y: number;
      let side = "none";
      if (at) {
        // below the target when there is room (the labels sit high), else above it
        const below = at.y + GAP + 14;
        const above = at.y - GAP - 14 - h;
        side = below + h <= A.y1 || above < A.y0 ? "below" : "above";
        y = side === "below" ? below : above;
        x = clamp(at.x - w / 2, A.x0, Math.max(A.x0, A.x1 - w));
        root.style.setProperty("--caret-x", `${Math.round(clamp(at.x - x, 22, w - 22))}px`);
      } else if (docked) {
        x = (size.w - w) / 2;
        y = A.y0 + 4;
      } else {
        x = A.x0 + 16;
        y = A.y1 - h - 8;
      }
      y = clamp(y, A.y0, Math.max(A.y0, A.y1 - h));
      root.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0)`;
      root.dataset.side = side;
      // mark 1: a ring on the cabinet it points at
      const dot = dotRef.current;
      if (dot) {
        if (i === 0 && at) {
          dot.style.transform = `translate3d(${Math.round(at.x)}px, ${Math.round(at.y)}px, 0)`;
          dot.dataset.on = "";
        } else delete dot.dataset.on;
      }
    },
    [i, docked, insetsRef, see, seams, plan],
  );

  useEngineView(apiRef, live, place);
  useLayoutEffect(() => {
    place(apiRef.current?.viewInfo?.() ?? null);
  }, [apiRef, place, seen]);
  useEffect(() => {
    const onResize = () => place(apiRef.current?.viewInfo?.() ?? null);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [apiRef, place]);

  return (
    <>
      {i === 0 && <span ref={dotRef} aria-hidden="true" className={s.coachDot} />}
      <div
        ref={rootRef}
        className={s.coach}
        data-side="none"
        role="region"
        aria-label={`Savjet ${i + 1} od ${MARKS.length}`}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            onSkip();
          }
        }}
      >
        <div className={s.coachCard}>
          <span aria-hidden="true" className={s.coachCaret} />
          <div className="px-4 pb-3 pt-3.5" aria-live="polite">
            <p className="flex items-baseline justify-between gap-3">
              <span className="font-display text-[15px] font-medium leading-tight text-fg">{mark.title}</span>
              <span aria-hidden="true" className="shrink-0 text-[10.5px] tabular-nums text-mut">
                {i + 1} / {MARKS.length}
              </span>
            </p>
            <p className="mt-1.5 text-[12px] leading-relaxed text-fg/70">{mark.text(touch, seen)}</p>
          </div>
          <div className="flex items-center justify-end gap-1 border-t border-white/[0.08] px-2.5 py-2">
            <button
              type="button"
              onClick={onSkip}
              className={`rounded-full px-3 text-[12px] font-medium text-mut transition-colors duration-300 hover:text-fg ${docked ? "h-11" : "h-8"}`}
            >
              Preskoči
            </button>
            <button
              type="button"
              onClick={onNext}
              className={`rounded-full bg-accent px-4 text-[12px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg ${docked ? "h-11" : "h-8"}`}
            >
              {i < MARKS.length - 1 ? "Dalje" : "Razumijem"}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
