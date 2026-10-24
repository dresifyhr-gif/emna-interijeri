"use client";

/**
 * Element editor: opens when a cabinet is clicked in 3D. Desktop: a glass card beside the element with a
 * thin leader line to an anchor dot. Mobile: a bottom card over the controls (the dot still marks the element).
 *
 * ModuleInfo.screen is a one-off anchor (it does not follow the camera), so <Studio> closes this
 * whenever the view moves.
 */
import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, type RefObject } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import type { KitchenPlan } from "@/lib/studio/plan";
import type { ModuleInfo } from "@/lib/studio/types";
import { rovingIndex } from "./controls";
import { CheckIcon, CloseIcon, ModuleGlyph, PlayIcon, ResetIcon } from "./icons";
import { EASE, clamp, slotLabel } from "./meta";
import { PriceBlock } from "./Price";
import s from "./studio.module.css";

export interface ModulePopoverProps {
  info: ModuleInfo;
  plan: KitchenPlan;
  desktop: boolean;
  /** px the fixed UI covers: the top bar, and the control panel on the right (desktop) */
  insets: { top: number; right: number };
  /** clicks inside this element (the 3D canvas) are handled by <Studio> */
  canvasRef: RefObject<HTMLElement | null>;
  onPick: (type: string) => void;
  onReset: () => void;
  onDemo: () => void;
  onClose: (refocusCanvas: boolean) => void;
  /** shown in the phone card, which covers the sheet's price */
  price: { low: number; high: number };
}

const CARD_W = 316;
const GAP = 64;

export function ModulePopover({ info, plan, desktop, insets, canvasRef, onPick, onReset, onDemo, onClose, price }: ModulePopoverProps) {
  const reduce = useReducedMotion();
  const cardRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const endRef = useRef<SVGCircleElement>(null);
  const optRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const slot = plan.slots.find((x) => x.id === info.id);
  const type = slot?.type ?? info.type;
  const def = moduleDef(info.zone, type);
  const options = (slot?.options ?? info.options)
    .map((id) => moduleDef(info.zone, id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));
  const current = options.findIndex((o) => o.id === type);
  const changed = Boolean(slot && slot.type !== slot.defaultType);
  const width = Math.round(slot?.width ?? info.width);
  const titleId = `studio-mod-${info.id}`;

  // ---- place the card beside the anchor (desktop) — imperative, measured before paint
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card || !desktop) return;
    const W = window.innerWidth;
    const H = window.innerHeight;
    const { x, y } = info.screen;
    const minX = 16;
    const maxX = W - insets.right - 16;
    const minY = insets.top + 12;
    const maxY = H - 16;
    const w = card.offsetWidth;
    const h = card.offsetHeight;
    let left = x + GAP;
    let side: "right" | "left" = "right";
    if (left + w > maxX) {
      left = x - GAP - w;
      side = "left";
    }
    left = clamp(left, minX, Math.max(minX, maxX - w));
    const top = clamp(y - 48, minY, Math.max(minY, maxY - h));
    card.style.left = `${left}px`;
    card.style.top = `${top}px`;
    const line = lineRef.current;
    if (line) {
      const ex = side === "right" ? left : left + w;
      const ey = clamp(y, top + 24, top + h - 24);
      line.setAttribute("x1", String(x));
      line.setAttribute("y1", String(y));
      line.setAttribute("x2", String(ex));
      line.setAttribute("y2", String(ey));
      endRef.current?.setAttribute("cx", String(ex));
      endRef.current?.setAttribute("cy", String(ey));
    }
  }, [info, desktop, insets.right, insets.top, type, options.length]);

  // ---- Esc and click-outside close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const inside = cardRef.current?.contains(document.activeElement) ?? false;
      onClose(inside);
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (!t) return;
      if (cardRef.current?.contains(t)) return;
      if (canvasRef.current?.contains(t)) return; // handled by the canvas listeners in <Studio>
      onClose(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown, true);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown, true);
    };
  }, [onClose, canvasRef]);

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="eyebrow text-accent">
            {slotLabel(info.id)} · {width} cm
          </p>
          <h2 id={titleId} className="mt-2.5 font-display text-[19px] font-medium leading-tight tracking-tight">
            {def?.name ?? "Element"}
          </h2>
        </div>
        <button
          type="button"
          onClick={() => onClose(true)}
          aria-label="Zatvori uređivanje elementa"
          className="-mr-1.5 -mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-fg/60 transition-colors duration-300 hover:bg-white/[0.06] hover:text-fg"
        >
          <CloseIcon className="h-[18px] w-[18px]" />
        </button>
      </div>
      {def?.description && <p className="mt-2 text-[12.5px] leading-relaxed text-mut">{def.description}</p>}

      {options.length > 1 ? (
        <>
          <p id={`${titleId}-opts`} className="eyebrow mt-5 text-mut">
            Izvedba
          </p>
          <div role="radiogroup" aria-labelledby={`${titleId}-opts`} className="mt-2.5 space-y-1.5">
            {options.map((o, i) => {
              const on = i === current;
              return (
                <button
                  key={o.id}
                  ref={(el) => {
                    optRefs.current[i] = el;
                  }}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  // one tab stop for the group; arrows / Home / End move and pick, like every other radio group in the studio
                  tabIndex={on || (current < 0 && i === 0) ? 0 : -1}
                  onClick={() => !on && onPick(o.id)}
                  onKeyDown={(e) => {
                    const n = rovingIndex(e, i, options.length);
                    if (n === null) return;
                    e.preventDefault();
                    if (n !== current) onPick(options[n].id);
                    optRefs.current[n]?.focus();
                  }}
                  title={o.description}
                  className={`group flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-[border-color,background-color] duration-300 ease-premium ${
                    on ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]"
                  }`}
                >
                  <ModuleGlyph
                    type={o.id}
                    zone={info.zone}
                    className={`h-7 w-7 shrink-0 transition-colors duration-300 ${on ? "text-accent" : "text-fg/60 group-hover:text-fg"}`}
                  />
                  <span className={`min-w-0 flex-1 text-[13px] leading-tight ${on ? "text-fg" : "text-fg/80 group-hover:text-fg"}`}>
                    {o.name}
                  </span>
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                      on ? "bg-accent text-ink" : "border border-white/15 text-transparent"
                    }`}
                  >
                    <CheckIcon className="h-3 w-3" />
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
        <p className="mt-4 text-[12px] leading-relaxed text-mut">Za ovo mjesto nema drugih izvedbi.</p>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-white/[0.08] pt-4">
        <button
          type="button"
          onClick={onDemo}
          className="inline-flex items-center gap-2 text-[12.5px] font-semibold tracking-wide text-fg transition-colors duration-300 hover:text-accent"
        >
          <PlayIcon className="h-4 w-4" />
          Prikaži mehanizam
        </button>
        {changed && (
          <button
            type="button"
            onClick={onReset}
            className="inline-flex items-center gap-2 text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
          >
            <ResetIcon className="h-4 w-4" />
            Vrati zadano
          </button>
        )}
      </div>
    </>
  );

  return (
    <>
      {/* anchor on the element */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute z-30 h-3 w-3 -translate-x-1/2 -translate-y-1/2"
        style={{ left: info.screen.x, top: info.screen.y }}
      >
        <span className={s.pulse} />
        <span className="absolute inset-0 rounded-full border border-accent bg-ink/60" />
        <span className="absolute inset-[3.5px] rounded-full bg-accent" />
      </span>

      {desktop ? (
        <>
          <svg aria-hidden="true" className="pointer-events-none absolute inset-0 z-30 h-full w-full overflow-visible">
            <line ref={lineRef} stroke="#C9B99A" strokeWidth="1.25" strokeOpacity="0.9" />
            <circle ref={endRef} r="2.5" fill="#C9B99A" />
          </svg>
          <motion.div
            ref={cardRef}
            role="dialog"
            aria-labelledby={titleId}
            className="glass absolute z-40 max-h-[calc(100svh-120px)] overflow-y-auto rounded-[22px] p-5 shadow-[0_30px_80px_-30px_rgba(0,0,0,.9)]"
            style={{ width: CARD_W }}
            initial={{ opacity: 0, scale: reduce ? 1 : 0.97 }}
            animate={{ opacity: 1, scale: 1, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
          >
            {body}
          </motion.div>
        </>
      ) : (
        <motion.div
          ref={cardRef}
          role="dialog"
          aria-labelledby={titleId}
          className="glass absolute inset-x-0 bottom-0 z-40 max-h-[72svh] overflow-y-auto rounded-t-[26px] border-b-0 px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-5 shadow-[0_-30px_80px_-30px_rgba(0,0,0,.9)]"
          initial={{ y: reduce ? 0 : "100%", opacity: reduce ? 0 : 1 }}
          animate={{ y: 0, opacity: 1, transition: { duration: reduce ? 0 : 0.55, ease: EASE } }}
        >
          <span aria-hidden="true" className="mx-auto -mt-1 mb-4 block h-1 w-10 rounded-full bg-white/20" />
          {body}
          <PriceBlock price={price} compact className="mt-4 border-t border-white/[0.08] pt-4" />
        </motion.div>
      )}
    </>
  );
}
