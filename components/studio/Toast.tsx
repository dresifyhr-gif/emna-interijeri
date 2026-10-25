"use client";

/**
 * One quiet message over the 3D view for edits made on the kitchen itself (element toolbar, wall labels):
 * what happened, the planner's note if there is one, and "Poništi" while that edit is still the last one.
 *
 * It stays 3 s (longer with a note), pauses while hovered or focused, and is a polite live region. Ctrl / ⌘ + Z
 * undoes too (handled by <Studio>), so the timer never takes the undo away from keyboard users.
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useState } from "react";
import { NoteIcon, UndoIcon } from "./icons";
import { EASE } from "./meta";

export interface ToastData {
  text: string;
  /** info = done (maybe with a consequence), refused = nothing changed, done = a quiet confirmation */
  tone: "info" | "refused" | "done";
  /** the undo entry this toast can take back */
  undoId?: number;
  ms: number;
  /** changes with every toast, so the same text is shown (and announced) again */
  n: number;
}

export function Toast({
  toast,
  canUndo,
  onUndo,
  onDismiss,
  desktop,
  raised,
}: {
  toast: ToastData | null;
  /** the toast's edit is still the last undo step */
  canUndo: boolean;
  onUndo: () => void;
  onDismiss: (n: number) => void;
  desktop: boolean;
  /** phone: the element toolbar is docked above the sheet, sit above it */
  raised: boolean;
}) {
  const reduce = Boolean(useReducedMotion());
  const [paused, setPaused] = useState<number | null>(null);
  const n = toast?.n ?? 0;
  const ms = toast?.ms ?? 0;
  const held = paused === n;

  useEffect(() => {
    if (!n || held) return;
    const t = window.setTimeout(() => onDismiss(n), ms);
    return () => window.clearTimeout(t);
  }, [n, ms, held, onDismiss]);

  const hold = (on: boolean) => setPaused(on ? n : null);

  return (
    <div
      className={`pointer-events-none absolute z-[35] flex justify-center px-4 ${desktop ? "bottom-6 left-0" : "inset-x-0"}`}
      style={
        desktop
          ? { right: "var(--studio-inset-right, 0px)" }
          : { bottom: `calc(var(--studio-inset-bottom, 0px) + ${raised ? 74 : 12}px)`, transition: "bottom .5s cubic-bezier(.2,.8,.2,1)" }
      }
    >
      <div role="status" aria-live="polite" aria-atomic="true" className="flex w-full max-w-[460px] justify-center">
        <AnimatePresence initial={false} mode="popLayout">
          {toast && (
            <motion.div
              key={toast.n}
              initial={{ opacity: 0, y: reduce ? 0 : 10, scale: reduce ? 1 : 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
              exit={{ opacity: 0, y: reduce ? 0 : 6, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
              onPointerEnter={() => hold(true)}
              onPointerLeave={() => hold(false)}
              onFocus={() => hold(true)}
              onBlur={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node | null)) hold(false);
              }}
              className={`pointer-events-auto flex min-h-11 max-w-full items-center gap-3 rounded-2xl border bg-ink-700/85 py-1.5 pl-3.5 pr-1.5 text-[12.5px] leading-snug shadow-[0_18px_50px_-18px_rgba(0,0,0,.9)] backdrop-blur-xl backdrop-saturate-150 ${
                toast.tone === "refused" ? "border-[#E39A84]/35" : "border-white/10"
              }`}
            >
              <NoteIcon
                className={`h-4 w-4 shrink-0 ${toast.tone === "refused" ? "text-[#E39A84]" : toast.tone === "done" ? "text-fg/50" : "text-accent"}`}
              />
              <span className="min-w-0 flex-1 py-1.5 text-fg/90">{toast.text}</span>
              {toast.undoId !== undefined && canUndo ? (
                <button
                  type="button"
                  onClick={onUndo}
                  aria-keyshortcuts="Control+Z Meta+Z"
                  className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold tracking-wide text-accent transition-colors duration-300 ease-premium hover:bg-accent/10 hover:text-fg"
                >
                  <UndoIcon className="h-4 w-4" />
                  Poništi
                </button>
              ) : (
                <span className="w-1.5 shrink-0" />
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
