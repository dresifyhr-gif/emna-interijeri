"use client";

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { usePrefersReducedMotion } from "@/components/ui/motion";

const noop = () => () => {};
const getSaveData = () => !!(navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
const getSaveDataOnServer = () => false;

/** the file is attached once and kept, so pausing never throws the loaded clip away */
function attach(v: HTMLVideoElement, src: string) {
  if (v.getAttribute("src")) return;
  v.preload = "auto";
  v.src = src;
}

/** muted play; a refusal keeps the poster and calls `refused` (a pause interrupting the start is not a refusal) */
function start(v: HTMLVideoElement, refused: () => void) {
  v.muted = true;
  v.play().catch((e: unknown) => {
    if (e instanceof DOMException && e.name === "NotAllowedError") refused();
  });
}

/**
 * A muted looping clip that costs nothing until it is near the screen. The poster (`children`, rendered by the server)
 * sits underneath; the video gets its file only about a screen before it scrolls in, plays while it is on screen and
 * pauses when scrolled away, then fades in over the poster once it really plays.
 * With reduced motion or Save-Data it never starts by itself. The round button pauses and plays it (WCAG 2.2.2), and
 * the visitor's choice wins over scrolling.
 */
export function LoopVideo({ src, children, className = "" }: { src: string; children: ReactNode; className?: string }) {
  const box = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const reduced = usePrefersReducedMotion();
  const saveData = useSyncExternalStore(noop, getSaveData, getSaveDataOnServer);
  const [choice, setChoice] = useState<"play" | "pause" | null>(null);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [shown, setShown] = useState(false);
  // the browser refused to start it (iOS Low Power Mode, autoplay settings): show the play button until a tap starts it
  const [blocked, setBlocked] = useState(false);
  const wantPlay = choice ? choice === "play" : !reduced && !saveData;
  const on = wantPlay && !blocked;

  useEffect(() => {
    const el = box.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const ahead = new IntersectionObserver(([e]) => setNear(e.isIntersecting), { rootMargin: "100% 0px" });
    const onScreen = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.2 });
    ahead.observe(el);
    onScreen.observe(el);
    return () => {
      ahead.disconnect();
      onScreen.disconnect();
    };
  }, []);

  useEffect(() => {
    const v = video.current;
    if (!v) return;
    if (on && (near || visible)) attach(v, src);
    if (on && visible) start(v, () => setBlocked(true));
    else if (!v.paused) v.pause();
  }, [on, near, visible, src]);

  // play and pause right in the tap, so a browser that wants a gesture for playback gets one
  const toggle = () => {
    const v = video.current;
    if (!v) return;
    if (on) {
      setChoice("pause");
      v.pause();
    } else {
      setChoice("play");
      setBlocked(false);
      attach(v, src);
      start(v, () => setBlocked(true));
    }
  };

  return (
    <div ref={box} className={`relative ${className}`}>
      {children}
      <video
        ref={video}
        aria-hidden
        muted
        loop
        playsInline
        preload="none"
        disablePictureInPicture
        onPlaying={() => setShown(true)}
        className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${shown ? "opacity-100" : "opacity-0"}`}
      />
      <button
        type="button"
        onClick={toggle}
        aria-label={on ? "Zaustavi video" : "Pokreni video"}
        className="absolute bottom-2.5 right-2.5 flex h-9 w-9 items-center justify-center rounded-full bg-white/[0.88] text-graphite backdrop-blur-md transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-graphite sm:bottom-3.5 sm:right-3.5"
      >
        {on ? (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 1.5h2v9H3zM7 1.5h2v9H7z" fill="currentColor" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden>
            <path d="M3 1.2v9.6L10.5 6z" fill="currentColor" />
          </svg>
        )}
      </button>
    </div>
  );
}
