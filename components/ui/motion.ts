import { useEffect, useSyncExternalStore, type RefObject } from "react";

/**
 * Motion helpers shared by the scroll reveals (Reveal, MaskLines, StepRule, Spotlight, drawings).
 *
 * Rule: the server HTML and the first client render always show the FINAL state, so visitors
 * without JS, with prefers-reduced-motion or on a slow connection see every word, and server and
 * client markup are identical (no hydration mismatch). Motion is added only after mount.
 */

const REDUCE = "(prefers-reduced-motion: reduce)";

function subscribeReduced(onChange: () => void) {
  const query = window.matchMedia(REDUCE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}
const getReduced = () => window.matchMedia(REDUCE).matches;
const getReducedOnServer = () => false;

/**
 * prefers-reduced-motion without a hydration mismatch: false on the server and while hydrating,
 * the real value immediately afterwards (and live when the setting changes).
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribeReduced, getReduced, getReducedOnServer);
}

const getMotionAllowed = () => !window.matchMedia(REDUCE).matches;
const getMotionAllowedOnServer = () => false;

/**
 * For scroll-linked effects whose start state is "not drawn yet": false on the server and while
 * hydrating (so the HTML carries the finished, still version), true right after mount unless the
 * visitor prefers reduced motion.
 */
export function useMotionAllowed(): boolean {
  return useSyncExternalStore(subscribeReduced, getMotionAllowed, getMotionAllowedOnServer);
}

/**
 * Scroll reveal driven by a `data-reveal` attribute that CSS turns into the animation:
 *  - nothing set (server, first render, reduced motion, already on screen at mount) → final state;
 *  - "armed" → hidden start state, set after mount only for elements still below the fold;
 *  - "in"    → set when the element scrolls into view; the CSS transition/animation plays.
 * The attribute is written straight to the DOM (React never renders it), so re-renders keep it.
 */
export function useScrollReveal(ref: RefObject<Element | null>, rootMargin = "0px 0px -10% 0px") {
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia(REDUCE).matches) return;
    // visible (or scrolled past) when the page became interactive: leave it exactly as rendered
    if (el.getBoundingClientRect().top < window.innerHeight) return;

    el.setAttribute("data-reveal", "armed");
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        el.setAttribute("data-reveal", "in");
        io.disconnect();
      },
      { rootMargin },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [ref, rootMargin]);
}
