"use client";

/**
 * Keeps an open admin current without a reload: <AutoRefresh /> (in Shell) re-renders the server parts when
 * the tab comes back into view and every minute while it is visible, so new inquiries and quote answers show
 * up in the badges by themselves. Client state (typed text, open dialogs) survives router.refresh().
 *
 * <MarkSeen action={…} /> runs a server action once when it mounts — Ponude uses it to clear "new answers".
 */
import { useRouter } from "next/navigation";
import { startTransition, useEffect, useRef } from "react";

const EVERY_MS = 60_000;
/** coming back within this time doesn't refresh again */
const MIN_GAP_MS = 10_000;

/** someone is typing: a refresh could move things under their fingers, so it waits for the next round */
function isEditing(): boolean {
  const el = document.activeElement;
  if (!(el instanceof HTMLElement)) return false;
  if (el instanceof HTMLInputElement) return !["button", "submit", "reset", "checkbox", "radio"].includes(el.type);
  return el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement;
}

export function AutoRefresh({ every = EVERY_MS }: { every?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    let timer: ReturnType<typeof setInterval> | null = null;

    const refresh = () => {
      if (isEditing() || Date.now() - last < MIN_GAP_MS) return;
      last = Date.now();
      router.refresh();
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    const start = () => {
      stop();
      timer = setInterval(refresh, every);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") {
        refresh();
        start();
      } else {
        stop();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [router, every]);

  return null;
}

/** calls `action` once per mount (a server action that marks something as seen) */
export function MarkSeen({ action }: { action: () => Promise<unknown> }) {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;
    startTransition(async () => {
      await action().catch(() => {});
    });
  }, [action]);

  return null;
}
