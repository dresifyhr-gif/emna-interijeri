/**
 * The browser half of the PDF export: pictures from the 3D engine (the studio's own, or one started off screen for the
 * admin), the company facts, building the document and handing the file to the browser.
 *
 *   const { exportKitchenPdf } = await import("@/lib/pdf/browser");   // jsPDF, fonts and drawings load here, not before
 *   await exportKitchenPdf({ cfg, configUrl, showPrice: true, pictures: { engine: apiRef.current }, onProgress });
 *
 * Everything degrades: no WebGL / no engine / a picture that fails → a PDF without the 3D page (the cover shows the floor
 * plan as line art, or the fallback image); the company facts unreachable → lib/site.ts.
 */

import { site } from "../site";
import { sanitizeConfig } from "../studio/plan";
import { studioPath } from "../studio/share";
import type { KitchenConfig, SnapshotView, SnapshotViewId, StudioEngineApi } from "../studio/types";
import { companyFromSite, normalizeCompany, type PdfCompany } from "./company";
import { pricePolicy } from "./content";
import type { PdfImage } from "./document";
import { createKitchenPdf, type KitchenPdfFile } from "./index";

/**
 * the cover's camera: the layout's own studio angle (what the customer saw first — every run of a U, the working side
 * of a peninsula), a little lower than the studio's
 */
export const COVER_VIEW: SnapshotView = { id: "naslovnica", label: "Naslovnica", az: 0, el: 0.24, home: true };

/**
 * Where the kitchen sits in the pictures (StudioEngineApi.snapshotViews `frame: "kitchen"`: the kitchen itself fills the
 * region, the room's walls run out of the picture). The cover keeps clear of the wordmark and the date at the top and of
 * the fade into the page at the bottom (document.ts cover: the last 44 of its 136 mm); the views keep a small margin.
 */
export const COVER_REGION = { x0: 0.12, x1: 0.88, y0: 0.17, y1: 0.75 } as const;
export const VIEW_REGION = { x0: 0.06, x1: 0.94, y0: 0.08, y1: 0.92 } as const;

/** the four presets of the "3D prikazi" page, in order */
export const PDF_VIEWS: SnapshotViewId[] = ["perspektiva-desno", "perspektiva-lijevo", "frontalno", "pticja-perspektiva"];

/** a phone / small screen: smaller pictures (GPU memory, time, file size) */
function smallDevice(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = typeof window.matchMedia === "function" && window.matchMedia("(pointer: coarse)").matches;
  return coarse || Math.min(window.innerWidth, window.innerHeight) < 700;
}

/** picture sizes (px): the cover (≈ the cover's 297 × 136 mm) and the views (≈ the grid cells, 2.1 : 1) */
export function pictureSizes(small = smallDevice()): { hero: [number, number]; view: [number, number] } {
  return small ? { hero: [1500, 690], view: [1100, 520] } : { hero: [2200, 1010], view: [1560, 740] };
}

const okShot = (url: unknown): url is string => typeof url === "string" && url.startsWith("data:image/") && url.length > 2000;

export interface CapturedPictures {
  hero: PdfImage | null;
  views: PdfImage[];
}

/**
 * The cover picture and the four views from a running engine (StudioEngineApi.snapshotViews, one picture per call so the
 * page can show progress and the studio stays responsive). An engine without snapshotViews, or one that fails, gives none.
 */
export async function captureEngineViews(api: StudioEngineApi | null | undefined, onProgress?: (done: number, total: number) => void): Promise<CapturedPictures> {
  const out: CapturedPictures = { hero: null, views: [] };
  if (!api?.snapshotViews) return out;
  const { hero, view } = pictureSizes();
  const total = 1 + PDF_VIEWS.length;
  try {
    const [h] = await api.snapshotViews({ views: [COVER_VIEW], width: hero[0], height: hero[1], quality: 0.86, frame: "kitchen", region: COVER_REGION });
    if (h && okShot(h.dataUrl)) out.hero = { dataUrl: h.dataUrl, width: h.width, height: h.height, label: h.label };
  } catch (err) {
    console.warn("[pdf] slika za naslovnicu nije uspjela:", err);
  }
  onProgress?.(1, total);
  for (let i = 0; i < PDF_VIEWS.length; i++) {
    try {
      const [v] = await api.snapshotViews({ views: [PDF_VIEWS[i]], width: view[0], height: view[1], quality: 0.85, frame: "kitchen", region: VIEW_REGION });
      if (v && okShot(v.dataUrl)) out.views.push({ dataUrl: v.dataUrl, width: v.width, height: v.height, label: v.label });
    } catch (err) {
      console.warn("[pdf] 3D prikaz nije uspio:", err);
    }
    onProgress?.(2 + i, total);
  }
  // nothing from the engine (context lost, …): no cover picture either
  if (!out.views.length && !out.hero) return { hero: null, views: [] };
  return out;
}

/**
 * Pictures of a kitchen that is not on screen (the admin): a studio engine in an invisible container, its pictures, then
 * it is disposed. Null when WebGL is unavailable or the engine does not get ready in time.
 */
export async function renderOffscreenViews(cfg: KitchenConfig, onProgress?: (done: number, total: number) => void, timeoutMs = 25000): Promise<CapturedPictures | null> {
  if (typeof document === "undefined") return null;
  let api: StudioEngineApi | null = null;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  // in the viewport (the engine renders only while it is in view) but invisible, behind the page and not clickable
  host.style.cssText = "position:fixed;left:0;top:0;width:640px;height:400px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden;contain:strict;";
  document.body.appendChild(host);
  try {
    const { createStudioEngine } = await import("../studio/engine");
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(() => reject(new Error("3D prikaz se nije učitao na vrijeme")), timeoutMs);
      try {
        api = createStudioEngine(host, {
          mode: "studio",
          config: cfg,
          mood: "day",
          onReady: () => {
            window.clearTimeout(timer);
            resolve();
          },
        });
      } catch (err) {
        window.clearTimeout(timer);
        reject(err);
      }
    });
    const shots = await captureEngineViews(api, onProgress);
    return shots.hero || shots.views.length ? shots : null;
  } catch (err) {
    console.warn("[pdf] 3D prikaz nije dostupan:", err);
    return null;
  } finally {
    (api as StudioEngineApi | null)?.dispose();
    host.remove();
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error ?? new Error("read failed"));
    r.readAsDataURL(blob);
  });
}

/** an image URL (same origin) as a PdfImage — JPEG / PNG as they are, anything else re-encoded to JPEG; null on failure */
export async function loadImage(url: string, label?: string): Promise<PdfImage | null> {
  try {
    const res = await fetch(url, { credentials: "same-origin" });
    if (!res.ok) return null;
    const blob = await res.blob();
    let dataUrl = await blobToDataUrl(blob);
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const width = img.naturalWidth;
    const height = img.naturalHeight;
    if (!width || !height) return null;
    if (!/^image\/(jpeg|png)$/i.test(blob.type)) {
      const c = document.createElement("canvas");
      c.width = width;
      c.height = height;
      const g = c.getContext("2d");
      if (!g) return null;
      g.drawImage(img, 0, 0);
      dataUrl = c.toDataURL("image/jpeg", 0.88);
    }
    return { dataUrl, width, height, label };
  } catch {
    return null;
  }
}

/** the company facts for the PDF (GET /studio/tvrtka), lib/site.ts when the server cannot be reached */
export async function fetchCompany(timeoutMs = 5000): Promise<PdfCompany> {
  const ctl = new AbortController();
  const t = window.setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch("/studio/tvrtka", { signal: ctl.signal, headers: { accept: "application/json" } });
    if (res.ok) return normalizeCompany(await res.json());
  } catch {
    /* offline, blocked: the site's facts */
  } finally {
    window.clearTimeout(t);
  }
  return companyFromSite();
}

/** hand a file to the browser ("Preuzmi") */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  a.remove();
  // some browsers read the blob after click() returns
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export type ExportStage = "slike" | "dokument" | "spremanje";

export interface ExportOptions {
  /** the kitchen — a KitchenConfig or a stored one (leads.config): it is sanitized here */
  cfg: unknown;
  /** the link that reopens it; absent = site.url + its studio path */
  configUrl?: string | null;
  /** who exports: decides the price rule (content.ts pricePolicy) unless `showPrice` says otherwise */
  source: "studio" | "admin";
  /** show the rough price; absent = pricePolicy(source) */
  showPrice?: boolean;
  /**
   * where the 3D pictures come from: a running engine (the studio), an off-screen one started for this export
   * ("offscreen", the admin) or none; `fallback` is an image URL used for the cover when there are no 3D pictures
   */
  pictures: { engine?: StudioEngineApi | null; offscreen?: boolean; fallback?: string | null };
  /** absent = fetched from /studio/tvrtka */
  company?: PdfCompany | null;
  preparedFor?: string | null;
  reference?: string | null;
  fileTag?: string | null;
  /** stage and overall progress 0..1 */
  onProgress?: (stage: ExportStage, progress: number) => void;
  /** false = only build the file (default true: the browser downloads it) */
  download?: boolean;
}

export interface ExportResult extends KitchenPdfFile {
  /** the PDF has the 3D pages */
  with3d: boolean;
}

/** pictures → document → file → download, with progress (pictures 0–55 %, document 55–96 %, file 96–100 %) */
export async function exportKitchenPdf(o: ExportOptions): Promise<ExportResult> {
  const report = (stage: ExportStage, p: number) => o.onProgress?.(stage, Math.max(0, Math.min(1, p)));
  report("slike", 0.02);
  const cfg = sanitizeConfig(o.cfg);
  const configUrl = o.configUrl && /^https?:\/\//i.test(o.configUrl) ? o.configUrl : `${site.url}${studioPath(cfg)}`;
  const companyP = o.company !== undefined ? Promise.resolve(o.company ?? companyFromSite()) : fetchCompany();
  let pics: CapturedPictures = { hero: null, views: [] };
  const picProgress = (done: number, total: number) => report("slike", 0.04 + (0.51 * done) / total);
  if (o.pictures.engine) pics = await captureEngineViews(o.pictures.engine, picProgress);
  else if (o.pictures.offscreen) pics = (await renderOffscreenViews(cfg, picProgress)) ?? pics;
  if (!pics.hero && o.pictures.fallback) pics.hero = await loadImage(o.pictures.fallback, "3D prikaz");
  report("dokument", 0.56);
  const company = await companyP;
  const file = await createKitchenPdf({
    cfg,
    configUrl,
    hero: pics.hero,
    views: pics.views,
    company,
    showPrice: o.showPrice ?? pricePolicy(o.source),
    preparedFor: o.preparedFor,
    reference: o.reference,
    fileTag: o.fileTag,
    onProgress: (d) => report("dokument", 0.56 + 0.4 * d),
  });
  report("spremanje", 0.97);
  if (o.download !== false) downloadBlob(file.blob, file.fileName);
  report("spremanje", 1);
  return { ...file, with3d: pics.views.length > 0 };
}
