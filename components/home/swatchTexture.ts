/**
 * Homepage material swatches: paints them off the main thread in swatch.worker.ts, falling back to the
 * main thread (one swatch per idle slot) where workers or OffscreenCanvas are missing.
 * The painting itself lives in swatchPaint.ts so the worker never imports this file.
 */

import { paintSwatch, swatchBackgroundSize, type SwatchJob, type SwatchReply, type SwatchTexture } from "./swatchPaint";

export { isSolid, paintSwatch, swatchBackgroundSize, type SwatchJob, type SwatchTexture } from "./swatchPaint";

type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };

/**
 * Paints every job and calls `onDone` per finished swatch (object URL — the caller revokes it).
 * Returns a cancel function. Worker first; on any worker problem the rest are painted on the main thread.
 */
export function paintSwatches(jobs: SwatchJob[], onDone: (id: string, t: SwatchTexture) => void): () => void {
  let cancelled = false;
  let worker: Worker | null = null;
  const pending = new Map(jobs.map((j) => [j.id, j]));

  const stopWorker = () => {
    worker?.terminate();
    worker = null;
  };

  const mainThread = () => {
    stopWorker();
    const rest = [...pending.values()];
    pending.clear();
    const w = window as IdleWindow;
    const later = (fn: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 1500 }) : window.setTimeout(fn, 60));
    const next = () => {
      if (cancelled) return;
      const j = rest.shift();
      if (!j) return;
      void paintSwatch(j.id, j.render, { size: j.size, horizontal: j.horizontal }).then((t) => {
        if (t && cancelled) URL.revokeObjectURL(t.url);
        else if (t) onDone(j.id, t);
        later(next);
      });
    };
    later(next);
  };

  const offscreen = typeof OffscreenCanvas !== "undefined" && "convertToBlob" in OffscreenCanvas.prototype;
  if (!jobs.length) return () => {};
  if (typeof Worker === "undefined" || !offscreen) {
    mainThread();
    return () => (cancelled = true);
  }
  try {
    worker = new Worker(new URL("./swatch.worker.ts", import.meta.url), { type: "module" });
  } catch {
    mainThread();
    return () => (cancelled = true);
  }
  worker.onmessage = (e: MessageEvent<SwatchReply>) => {
    const r = e.data;
    const job = pending.get(r.id);
    if (!job || cancelled) return;
    if (!("blob" in r)) {
      // e.g. no 2D context on OffscreenCanvas in this browser: paint the rest here
      mainThread();
      return;
    }
    pending.delete(r.id);
    onDone(r.id, { url: URL.createObjectURL(r.blob), size: swatchBackgroundSize(job.render) });
    if (!pending.size) stopWorker();
  };
  worker.onerror = () => {
    if (!cancelled) mainThread();
  };
  for (const j of jobs) worker.postMessage(j);
  return () => {
    cancelled = true;
    stopWorker();
  };
}
