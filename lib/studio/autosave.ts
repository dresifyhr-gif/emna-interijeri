/**
 * The last kitchen of the 3D studio, kept on this device: a customer who closes the studio (the X, the tab, a link to
 * the site) finds it again on the next visit — "Nastavite svoju kuhinju (L 380 × 220 · antracit)".
 *
 * One entry in localStorage under "emna-studio-zadnja": the share code (lib/studio/share.ts, the same as ?k=), a short
 * label for the offer and when it was saved. Nothing leaves the device. The pure part (serializeSaved, parseSaved,
 * shouldOfferRestore, kitchenLabel) is tested in lib/studio/autosave.test.ts; readSaved / writeSaved are the thin storage
 * wrapper — every access in try/catch (private mode, blocked storage): the studio works the same without them, it just
 * does not remember.
 */
import { frontDef } from "./catalog";
import { sanitizeConfig, wallsFor } from "./plan";
import { decodeConfig } from "./share";
import type { KitchenConfig, Layout } from "./types";

export const AUTOSAVE_KEY = "emna-studio-zadnja";
/** an older kitchen is not offered any more (it is forgotten) */
export const AUTOSAVE_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
/** a change is saved this long after the last one (a slider or a hold-to-repeat stepper writes once) */
export const AUTOSAVE_DEBOUNCE_MS = 800;

export interface SavedKitchen {
  /** the share code (encodeConfig) — what ?k= carries */
  code: string;
  /** "L 380 × 220 · antracit" (kitchenLabel) */
  label: string;
  /** ms since the epoch */
  savedAt: number;
}

export function serializeSaved(s: SavedKitchen): string {
  return JSON.stringify({ code: s.code, label: s.label, savedAt: s.savedAt });
}

/**
 * What storage held, or null: not JSON, not this shape, a code that is no studio link (decodeConfig), saved more than
 * 90 days ago or in the future (a wrong clock), or a label that would not fit a button.
 */
export function parseSaved(raw: string | null | undefined, now = Date.now()): SavedKitchen | null {
  if (typeof raw !== "string" || !raw || raw.length > 4000) return null;
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== "object") return null;
  const { code, label, savedAt } = v as Record<string, unknown>;
  if (typeof code !== "string" || typeof label !== "string" || typeof savedAt !== "number" || !Number.isFinite(savedAt)) return null;
  const age = now - savedAt;
  if (age < -60_000 || age > AUTOSAVE_MAX_AGE_MS) return null;
  const text = label.trim();
  if (!text || text.length > 80) return null;
  if (!decodeConfig(code)) return null;
  return { code, label: text, savedAt };
}

/**
 * Offer the saved kitchen back? Only when /studio opened without a kitchen or a preset in its address (?k, ?oblik, ?front,
 * ?top — those open what they say) and the saved kitchen is not the one already on screen.
 */
export function shouldOfferRestore({
  hasQueryConfig,
  saved,
  currentCode,
}: {
  hasQueryConfig: boolean;
  saved: SavedKitchen | null;
  currentCode: string;
}): boolean {
  return Boolean(saved) && !hasQueryConfig && saved?.code !== currentCode;
}

const SHAPE: Record<Layout, string> = {
  ravna: "Ravna",
  L: "L",
  U: "U",
  otok: "S otokom",
  poluotok: "S poluotokom",
  G: "G",
};

/** "L 380 × 220 · antracit": the shape, the lengths of its walls (A → C) and the front ("… mat" is the usual finish) */
export function kitchenLabel(input: KitchenConfig): string {
  const cfg = sanitizeConfig(input);
  const walls = wallsFor(cfg.layout).map((w) => Math.round(cfg.walls[w]));
  const name = frontDef(cfg.front)?.name.replace(/ mat$/, "") ?? cfg.front;
  const front = name.charAt(0).toLowerCase() + name.slice(1);
  return `${SHAPE[cfg.layout]} ${walls.join(" × ")} · ${front}`;
}

/* ------------------------------------------------------------------ storage (client only) */

/** the saved kitchen, or null (nothing saved, unreadable, too old, storage blocked) */
export function readSaved(): SavedKitchen | null {
  try {
    return parseSaved(window.localStorage.getItem(AUTOSAVE_KEY));
  } catch {
    return null;
  }
}

export function writeSaved(s: SavedKitchen): void {
  try {
    window.localStorage.setItem(AUTOSAVE_KEY, serializeSaved(s));
  } catch {
    // storage blocked or full: the kitchen stays in the link (?k=) only
  }
}
