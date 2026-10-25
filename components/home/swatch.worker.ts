/**
 * Paints homepage material swatches off the main thread (spawned by paintSwatches in swatchTexture.ts; painting lives in swatchPaint.ts):
 * OffscreenCanvas 2D → JPEG blob → back to the page. One message per swatch.
 */

import { paintSwatchInto, swatchCanvasSize, type SwatchJob, type SwatchReply } from "./swatchPaint";

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<SwatchJob>) => void) | null;
  postMessage(message: SwatchReply): void;
};

scope.onmessage = (e) => {
  const job = e.data;
  void (async () => {
    try {
      const { w, h } = swatchCanvasSize(job.render, job.size);
      const canvas = new OffscreenCanvas(w, h);
      const g = canvas.getContext("2d");
      if (!g) throw new Error("no 2d context");
      paintSwatchInto(g, job.id, job.render, { size: job.size, horizontal: job.horizontal });
      const blob = await canvas.convertToBlob({ type: "image/jpeg", quality: 0.88 });
      scope.postMessage({ id: job.id, blob });
    } catch {
      scope.postMessage({ id: job.id, error: true });
    }
  })();
};
