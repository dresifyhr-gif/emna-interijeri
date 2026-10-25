"use client";

import { useEffect, useRef } from "react";
import type { StatsCanvas } from "@/lib/studio/engine/quality";

/**
 * Developer readout for checking scroll smoothness (open the homepage with ?fps=1). Loaded only then
 * (PerfProbe), never part of the normal bundle. Once a second it shows:
 *  - stranica: frames the page produced (main-thread RAF), the longest frame, frames over 20 / 33 ms;
 *  - dugi zadaci: long main-thread tasks (Chromium only);
 *  - 3D: what the hero engine rendered (renders/s, shadow-map renders/s, CPU ms per frame, draw calls)
 *    and its current quality tier (DPR, MSAA, bloom, shadow map, governor phase) — from the canvas' emnaStats.
 */
export default function FpsOverlay() {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let windowStart = last;
    let frames = 0;
    let worst = 0;
    let over20 = 0;
    let over33 = 0;
    let longTasks = 0;
    let longMs = 0;
    let prev: { renders: number; shadowRenders: number; ticks: number } | null = null;

    let po: PerformanceObserver | null = null;
    try {
      po = new PerformanceObserver((list) => {
        for (const e of list.getEntries()) {
          longTasks++;
          longMs += e.duration;
        }
      });
      po.observe({ type: "longtask", buffered: false });
    } catch {
      po = null;
    }

    const tick = (now: number) => {
      const d = now - last;
      last = now;
      frames++;
      if (d > worst) worst = d;
      if (d > 20) over20++;
      if (d > 34) over33++;
      const span = now - windowStart;
      if (span >= 1000) {
        const secs = span / 1000;
        const lines = [
          `stranica  ${Math.round(frames / secs)} fps · najdulji kadar ${Math.round(worst)} ms · >20 ms: ${over20} · >33 ms: ${over33}`,
          po ? `dugi zadaci ${longTasks} (${Math.round(longMs)} ms)` : "dugi zadaci: nije podržano u ovom pregledniku",
        ];
        const s = document.querySelector<StatsCanvas>("canvas.emna-studio-canvas")?.emnaStats;
        if (s) {
          const rps = prev ? Math.round((s.renders - prev.renders) / secs) : 0;
          const sps = prev ? Math.round((s.shadowRenders - prev.shadowRenders) / secs) : 0;
          const tps = prev ? Math.round((s.ticks - prev.ticks) / secs) : 0;
          prev = { renders: s.renders, shadowRenders: s.shadowRenders, ticks: s.ticks };
          lines.push(
            `3D  ${rps} render/s (petlja ${tps}/s) · sjene ${sps}/s · CPU ${s.cpuMs.toFixed(1)} ms · ${s.calls} poziva · ${Math.round(s.triangles / 1000)}k trokuta`,
            `3D  razina ${s.tier + 1}/${s.tiers} · DPR ${s.pixelRatio} · MSAA ${s.samples} · bloom ${s.bloom ? "da" : "ne"} · sjena ${s.shadow} · regulator ${s.governor}`,
          );
        } else {
          prev = null;
          lines.push("3D  nije aktivan");
        }
        if (ref.current) ref.current.textContent = lines.join("\n");
        windowStart = now;
        frames = 0;
        worst = 0;
        over20 = 0;
        over33 = 0;
        longTasks = 0;
        longMs = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      po?.disconnect();
    };
  }, []);

  return (
    <pre
      ref={ref}
      aria-hidden
      className="pointer-events-none fixed bottom-3 left-3 z-[90] max-w-[calc(100vw-24px)] whitespace-pre-wrap rounded-md bg-black/80 px-3 py-2 font-mono text-[10px] leading-[1.5] text-[#9ef0b0] sm:text-[11px]"
    >
      mjerim…
    </pre>
  );
}
