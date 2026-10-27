/**
 * Browser side of "Opiši kuhinju" — no zod, no server code, safe in any client component.
 *
 *   const { enabled } = await aiStatus();                      // show the feature at all?
 *   const image = file ? await downscaleImage(file) : null;     // JPEG data URL ≤ 1600 px, ≤ 1,5 MB
 *   const r = await askStudioAi({ message, config: encodeConfig(cfg), image, history });
 *   if (r.ok && r.config) setConfig(decodeConfig(r.config)!);   // r.reply, r.notes, r.assumptions → show them
 *   else if (!r.ok) show(r.message);                           // always a friendly Croatian sentence
 */

export const AI_ENDPOINT = "/api/studio/ai";

/** what the server accepts (lib/studio/ai/schema.ts LIMITS) */
export const AI_LIMITS = {
  message: 1500,
  imageBytes: 1_500_000,
  /** the client's longest side; the server takes up to 2048 */
  imageSide: 1600,
  historyTurns: 8,
  historyText: 1000,
} as const;

export interface AiTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AskStudioAiInput {
  /** the customer's words (≤ 1500 characters; may be empty when an image is sent) */
  message: string;
  /** the current kitchen as a share-link string (lib/studio/share.ts encodeConfig), or null when there is none yet */
  config: string | null;
  /** a JPEG / PNG / WebP data URL — use downscaleImage */
  image?: string | null;
  /** the last turns of the conversation, oldest first (trimmed to 8 × 1000 characters here) */
  history?: AiTurn[];
  signal?: AbortSignal;
}

export type AskStudioAiResult =
  | {
      ok: true;
      /** the new kitchen (share-link string → decodeConfig), or null when there is still no kitchen */
      config: string | null;
      changed: boolean;
      /** one or two Croatian sentences for the customer */
      reply: string;
      /** what could not be done / what the planner adjusted */
      notes: string[];
      /** what was assumed because the customer did not say it */
      assumptions: string[];
    }
  | {
      ok: false;
      /** disabled | forbidden | validation | too_large | image | empty | config | rate_limited | daily_cap | model_* | network | aborted … */
      error: string;
      /** always a friendly Croatian sentence */
      message: string;
      /** seconds, for rate_limited / daily_cap */
      retryAfter?: number;
    };

const NETWORK = "Nema veze s poslužiteljem — provjerite internet i pokušajte ponovno.";

/** ask the AI to build / change the kitchen */
export async function askStudioAi(input: AskStudioAiInput): Promise<AskStudioAiResult> {
  const message = (input.message ?? "").slice(0, AI_LIMITS.message);
  const history = (input.history ?? []).slice(-AI_LIMITS.historyTurns).map((t) => ({ role: t.role, text: t.text.slice(0, AI_LIMITS.historyText) }));
  let res: Response;
  try {
    res = await fetch(AI_ENDPOINT, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message, config: input.config, image: input.image ?? null, history }),
      signal: input.signal,
      credentials: "same-origin",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { ok: false, error: "aborted", message: "Prekinuto." };
    return { ok: false, error: "network", message: NETWORK };
  }
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    /* a proxy page, a platform timeout … */
  }
  const b = (body ?? {}) as Record<string, unknown>;
  if (res.ok && b.ok === true) {
    return {
      ok: true,
      config: typeof b.config === "string" ? b.config : null,
      changed: b.changed === true,
      reply: typeof b.reply === "string" ? b.reply : "",
      notes: Array.isArray(b.notes) ? b.notes.filter((x): x is string => typeof x === "string") : [],
      assumptions: Array.isArray(b.assumptions) ? b.assumptions.filter((x): x is string => typeof x === "string") : [],
    };
  }
  const retry = Number(res.headers.get("retry-after"));
  return {
    ok: false,
    error: typeof b.error === "string" ? b.error : res.status === 504 ? "model_timeout" : "server",
    message: typeof b.message === "string" && b.message ? b.message : res.status === 504 ? "Pomoćnik se predugo zadržao — pokušajte ponovno." : "Nešto nije u redu — pokušajte ponovno.",
    ...(Number.isFinite(retry) && retry > 0 ? { retryAfter: retry } : {}),
  };
}

/** may this visitor use the AI helper now (STUDIO_AI mode, admin session)? false on any error */
export async function aiStatus(signal?: AbortSignal): Promise<{ enabled: boolean }> {
  try {
    const res = await fetch(AI_ENDPOINT, { method: "GET", signal, credentials: "same-origin", cache: "no-store" });
    if (!res.ok) return { enabled: false };
    const b = (await res.json()) as { enabled?: unknown };
    return { enabled: b.enabled === true };
  } catch {
    return { enabled: false };
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Slika se ne može pročitati."));
    r.readAsDataURL(blob);
  });
}

/**
 * A photo (File / Blob from an <input type="file"> or a paste) → a JPEG data URL with the longer side ≤ `maxSide`
 * (default 1600 px) and ≤ `maxBytes` (default 1,5 MB), the EXIF orientation applied. Throws an Error with a Croatian
 * message when the browser cannot read the image (e.g. HEIC on some browsers).
 */
export async function downscaleImage(file: Blob, opts: { maxSide?: number; maxBytes?: number; quality?: number } = {}): Promise<string> {
  const maxSide = opts.maxSide ?? AI_LIMITS.imageSide;
  const maxBytes = opts.maxBytes ?? AI_LIMITS.imageBytes;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Ovu sliku preglednik ne može otvoriti — pošaljite JPEG ili PNG.");
  }
  try {
    let scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    let quality = opts.quality ?? 0.85;
    for (let attempt = 0; attempt < 6; attempt++) {
      const w = Math.max(1, Math.round(bitmap.width * scale));
      const h = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Slika se ne može pripremiti.");
      ctx.fillStyle = "#ffffff"; // a transparent PNG gets a white background, not black
      ctx.fillRect(0, 0, w, h);
      ctx.drawImage(bitmap, 0, 0, w, h);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
      if (!blob) throw new Error("Slika se ne može pripremiti.");
      if (blob.size <= maxBytes) return await blobToDataUrl(blob);
      // too big: a bit less quality first, then smaller
      if (quality > 0.65) quality -= 0.1;
      else scale *= 0.8;
    }
    throw new Error("Slika je prevelika — pokušajte s manjom.");
  } finally {
    bitmap.close();
  }
}
