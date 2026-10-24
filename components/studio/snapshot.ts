"use client";

import type { StudioEngineApi } from "@/lib/studio/types";

const INSETS = ["top", "right", "bottom", "left"].map((k) => `--studio-inset-${k}`);
/** keep the JPEG well under the API's 3 MB data-URL limit */
export const SNAPSHOT_MAX_CHARS = 2_800_000;

/**
 * A picture of the kitchen for the preview and the lead e-mail.
 *
 * The live view is framed around the UI (panel on the right / sheet at the bottom). For the picture we frame
 * the kitchen in the whole canvas instead: clear the insets, snapshot, restore. engine.snapshot() renders
 * synchronously, so no frame with the temporary framing ever reaches the screen. Portrait (phone) frames
 * are cropped to 4:3 around the centre, where the kitchen sits.
 */
export async function studioSnapshot(
  api: StudioEngineApi | null,
  container: HTMLElement | null,
  maxWidth: number,
): Promise<string | undefined> {
  if (!api) return undefined;
  let shot: Promise<string>;
  if (container) {
    const prev = INSETS.map((n) => container.style.getPropertyValue(n));
    INSETS.forEach((n) => container.style.setProperty(n, "0px"));
    api.resize();
    try {
      shot = api.snapshot(maxWidth);
    } finally {
      INSETS.forEach((n, i) => (prev[i] ? container.style.setProperty(n, prev[i]) : container.style.removeProperty(n)));
      api.resize();
    }
  } else {
    shot = api.snapshot(maxWidth);
  }
  let url: string;
  try {
    url = await shot;
  } catch {
    return undefined;
  }
  if (!url || !url.startsWith("data:image/")) return undefined;
  return cropToLandscape(url, 4 / 3);
}

/** centre-crop images taller than `aspect` (w/h); wider images are returned as they are */
async function cropToLandscape(url: string, aspect: number): Promise<string> {
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h || w / h >= aspect - 0.01) return url;
    const ch = Math.round(w / aspect);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = ch;
    const g = canvas.getContext("2d");
    if (!g) return url;
    g.drawImage(img, 0, Math.round((h - ch) / 2), w, ch, 0, 0, w, ch);
    return canvas.toDataURL("image/jpeg", 0.85);
  } catch {
    return url;
  }
}

/** snapshot for the lead: 1200 px, falling back to 800 px if the JPEG is unusually heavy */
export async function leadSnapshot(api: StudioEngineApi | null, container: HTMLElement | null): Promise<string | undefined> {
  for (const w of [1200, 800]) {
    const s = await studioSnapshot(api, container, w);
    if (!s) return undefined;
    if (s.length <= SNAPSHOT_MAX_CHARS) return s;
  }
  return undefined;
}
