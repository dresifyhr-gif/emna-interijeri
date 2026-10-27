"use client";

/**
 * One quiet message over the 3D view for edits made on the kitchen itself (element toolbar, wall labels, "+"): what
 * happened, the planner's note if there is one (`detail`), and "Poništi" while that edit is still the last one.
 *
 * Desktop: the whole message at the foot of the 3D view. Phone: compact — one line and "Poništi", just above the step
 * sheet (above the docked element toolbar while it is there). It goes under the top bar instead when a picker is docked
 * at the bottom, or when the line above the sheet would cover the middle of the 3D view (where the kitchen is framed), a
 * "+" or the selected element (above the docked toolbar: a floor unit) that the top would not. A longer message or a note gets "Detalji": it opens the rest in place (and holds the
 * timer until it is closed again).
 *
 * It stays 3 s (longer with a note), pauses while hovered, focused or opened, and is a polite live region (the whole
 * text is read out, also when only one line shows). Ctrl / ⌘ + Z undoes too (handled by <Studio>), so the timer never
 * takes the undo away from keyboard users.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { ChevronDown, NoteIcon, UndoIcon } from "./icons";
import { EASE, firstSentence } from "./meta";
import { toastAtTop, type Insets } from "./overlay";

export interface ToastData {
  /** what happened (one short sentence) */
  text: string;
  /** the planner's note about it (what else changed): shown after the text; on a phone behind "Detalji" */
  detail?: string;
  /** info = done (maybe with a consequence), refused = nothing changed, done = a quiet confirmation */
  tone: "info" | "refused" | "done";
  /** the undo entry this toast can take back */
  undoId?: number;
  ms: number;
  /** changes with every toast, so the same text is shown (and announced) again */
  n: number;
}

/** phone: px between the step sheet and the toast; with the element toolbar docked above the sheet, past it */
const LIFT = { sheet: 12, toolbar: 74 } as const;
/** phone: px between the top bar and the toast when it goes up */
const DROP = 8;
/** phone: the compact toast's height (one line of 44 px targets, its padding and border) */
const LINE_H = 58;

export function Toast({
  toast,
  canUndo,
  onUndo,
  onDismiss,
  desktop,
  raised,
  top = false,
  selLow = false,
  insetsRef,
  below = 0,
}: {
  toast: ToastData | null;
  /** the toast's edit is still the last undo step */
  canUndo: boolean;
  onUndo: () => void;
  onDismiss: (n: number) => void;
  desktop: boolean;
  /** phone: the element toolbar is docked above the sheet, sit above it */
  raised: boolean;
  /** phone: something is docked at the bottom in front of the sheet (a picker): under the top bar instead */
  top?: boolean;
  /**
   * phone: the selected element stands on the floor (base, tall, island) — low in the 3D view, where the line above the
   * docked toolbar would cover it (its rect is not known yet right after an edit: the engine rebuilds and selects it later)
   */
  selLow?: boolean;
  /** the UI's insets over the 3D view (phone: is there room below the middle of the 3D view?) */
  insetsRef?: RefObject<Insets>;
  /** phone: px under the top bar taken by other controls (the view switcher) — a toast that goes up stays below them */
  below?: number;
}) {
  const reduce = Boolean(useReducedMotion());
  const [paused, setPaused] = useState<number | null>(null);
  /** phone: the toast whose "Detalji" are open */
  const [opened, setOpened] = useState<number | null>(null);
  /** phone: the toast whose one line does not show its whole first sentence */
  const [clipped, setClipped] = useState<number | null>(null);
  /** phone: the line above the sheet would cover the middle of the 3D view or a "+" (the top would not) — under the top bar */
  const [cramped, setCramped] = useState(false);
  const lineRef = useRef<HTMLSpanElement>(null);
  const n = toast?.n ?? 0;
  const ms = toast?.ms ?? 0;
  const compact = !desktop;
  // phone: the first sentence on the line, the rest (and the planner's note) behind "Detalji"
  const [head, tail] = toast ? (compact ? firstSentence(toast.text) : [toast.text, ""]) : ["", ""];
  const rest = [tail, toast?.detail ?? ""].filter(Boolean).join(" ");
  const open = compact && opened === n && n > 0;
  const held = paused === n || open;
  const more = compact && Boolean(rest || clipped === n);

  useEffect(() => {
    if (!n || held) return;
    const t = window.setTimeout(() => onDismiss(n), ms);
    return () => window.clearTimeout(t);
  }, [n, ms, held, onDismiss]);

  // phone: does the line show its sentence whole; does it fit above the sheet without covering the middle of the 3D view
  // or a "+" (read once per toast — nothing here follows the view)
  useLayoutEffect(() => {
    if (!compact || !n) return;
    const el = lineRef.current;
    setClipped(el && el.scrollWidth > el.clientWidth + 1 ? n : null);
    const ins = insetsRef?.current;
    if (!ins || ins.bottom < 0) return;
    const H = window.innerHeight;
    const top = Math.max(0, ins.top) + below;
    const foot = H - Math.max(0, ins.bottom) - (raised ? LIFT.toolbar : LIFT.sheet);
    const mid = (top + H - Math.max(0, ins.bottom)) / 2;
    const dots = [...document.querySelectorAll<HTMLElement>("[data-gap-btn][data-on]")].map((b) => {
      const r = b.getBoundingClientRect();
      return r.y + r.height / 2;
    });
    setCramped(toastAtTop({ top, foot, mid, lineH: LINE_H, drop: DROP, dots, raised, selLow }));
  }, [compact, n, raised, selLow, insetsRef, below]);

  const hold = (on: boolean) => setPaused(on ? n : null);
  const atTop = compact && (top || cramped);
  const tint = toast?.tone === "refused" ? "text-[#E39A84]" : toast?.tone === "done" ? "text-fg/50" : "text-accent";
  const said = toast ? (toast.detail ? `${toast.text} ${toast.detail}` : toast.text) : "";

  return (
    <div
      className={`pointer-events-none absolute z-[35] flex justify-center ${desktop ? "bottom-6 left-0 px-4" : "inset-x-0 px-3"}`}
      style={
        desktop
          ? { right: "var(--studio-inset-right, 0px)" }
          : atTop
            ? { top: `calc(var(--studio-inset-top, 56px) + ${DROP + below}px)` }
            : {
                bottom: `calc(var(--studio-inset-bottom, 0px) + ${raised ? LIFT.toolbar : LIFT.sheet}px)`,
                transition: "bottom .5s cubic-bezier(.2,.8,.2,1)",
              }
      }
    >
      {/* the whole message for assistive tech (the phone shows one line of it) */}
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {said}
      </p>
      {/* relative + one toast's height: popLayout takes the leaving toast out of the flow and places it here, so it fades
          where it was (bottom-anchored on a phone) instead of dropping over the bottom bar; it takes no taps while leaving */}
      <div className="relative flex min-h-11 w-full max-w-[460px] justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {toast && (
            <motion.div
              key={toast.n}
              initial={{ opacity: 0, y: reduce ? 0 : atTop ? -10 : 10, scale: reduce ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
              exit={{ opacity: 0, y: reduce ? 0 : atTop ? -6 : 6, pointerEvents: "none", transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
              onPointerEnter={(e) => e.pointerType === "mouse" && hold(true)}
              onPointerLeave={(e) => e.pointerType === "mouse" && hold(false)}
              // keyboard focus holds it (a tap on "Detalji" leaves focus on the button: that must not keep it forever)
              onFocus={(e) => (e.target as HTMLElement).matches?.(":focus-visible") && hold(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold(false);
              }}
              className={`pointer-events-auto max-w-full rounded-2xl border bg-ink-700/85 shadow-[0_18px_50px_-18px_rgba(0,0,0,.9)] backdrop-blur-xl backdrop-saturate-150 ${
                compact ? "w-full" : ""
              } ${toast.tone === "refused" ? "border-[#E39A84]/35" : "border-white/10"}`}
            >
              <div className={`flex min-h-11 items-center py-1.5 pr-1.5 text-[12.5px] leading-snug ${compact ? "gap-1.5 pl-3" : "gap-3 pl-3.5"}`}>
                <NoteIcon aria-hidden="true" className={`h-4 w-4 shrink-0 ${tint}`} />
                {/* (read out by the status line above) */}
                {compact ? (
                  <span ref={lineRef} aria-hidden="true" className={`min-w-0 flex-1 py-1.5 text-fg/90 ${open ? "" : "truncate"}`}>
                    {head}
                  </span>
                ) : (
                  <span aria-hidden="true" className="min-w-0 flex-1 py-1.5 text-fg/90">
                    {toast.text}
                    {toast.detail && <span className="text-fg/65"> {toast.detail}</span>}
                  </span>
                )}
                {more && (
                  <button
                    type="button"
                    aria-expanded={open}
                    aria-label={open ? "Sakrij detalje" : "Detalji"}
                    onClick={() => setOpened(open ? null : n)}
                    className="inline-flex h-11 shrink-0 items-center gap-0.5 rounded-xl px-1 text-[11.5px] font-medium text-fg/70 underline decoration-white/25 underline-offset-4 transition-colors duration-300 hover:text-fg"
                  >
                    Detalji
                    <ChevronDown aria-hidden="true" className={`h-3 w-3 transition-transform duration-300 ${open ? "rotate-180" : ""}`} />
                  </button>
                )}
                {toast.undoId !== undefined && canUndo ? (
                  <button
                    type="button"
                    onClick={onUndo}
                    aria-keyshortcuts="Control+Z Meta+Z"
                    className={`inline-flex shrink-0 items-center gap-1.5 rounded-xl text-[12.5px] font-semibold tracking-wide text-accent transition-colors duration-300 ease-premium hover:bg-accent/10 hover:text-fg ${
                      compact ? "h-11 px-2" : "h-9 px-3"
                    }`}
                  >
                    <UndoIcon className="h-4 w-4" />
                    Poništi
                  </button>
                ) : (
                  <span className="w-1.5 shrink-0" />
                )}
              </div>
              {open && rest && (
                <p
                  aria-hidden="true"
                  className="overflow-y-auto border-t border-white/[0.07] px-3.5 pb-3 pt-2.5 text-[12px] leading-relaxed text-fg/75"
                  // the rest of the note may reach over the middle of the 3D view (asked for), not past it
                  style={{ maxHeight: "calc((100svh - var(--studio-inset-top, 56px) - var(--studio-inset-bottom, 0px)) * 0.55)" }}
                >
                  {rest}
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
