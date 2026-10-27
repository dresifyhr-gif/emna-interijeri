import { gallery, type Photo } from "./gallery";

/**
 * Pure helpers shared by the inquiry forms (components/forms/ContactForm.tsx and the studio's send step).
 * No React and no zod, so both client bundles stay small; tested in lib/lead-extras.test.ts.
 *
 * What does not have its own column in the leads table (the wish for a measurement visit and its time slots, the
 * gallery photo the visitor liked) goes into the message as clearly labelled lines — no schema change, and the owner
 * reads it in /admin/upiti and in the e-mail like the rest of the message.
 */

/** lib/lead-schema.ts: `message` is at most this long */
export const MESSAGE_MAX = 3000;

/** "Kada planirate?" — the same strings from the contact form and from the studio */
export const TIMELINES = ["Što prije", "1–3 mjeseca", "3–6 mjeseci", "Samo istražujem"] as const;
export type Timeline = (typeof TIMELINES)[number];

/** when a measurement visit suits the visitor (multi-select under "Želim dogovoriti izmjeru") */
export const MEASUREMENT_SLOTS = ["radnim danom prije podne", "radnim danom poslije podne", "subotom"] as const;
export type MeasurementSlot = (typeof MEASUREMENT_SLOTS)[number];

export interface MessageExtras {
  /** what the visitor typed */
  message: string;
  measurement?: { wanted: boolean; slots: readonly string[] };
  photo?: Pick<Photo, "title" | "src"> | null;
}

const oneLine = (s: string) => s.replace(/\s+/g, " ").trim();

/** the user's text cut to `max` characters, at the last word that fits, with "…" */
function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  if (max <= 1) return "";
  const room = text.slice(0, max - 1);
  const space = room.search(/\s\S*$/);
  const head = space > max / 2 ? room.slice(0, space) : room;
  return `${head.trimEnd()}…`;
}

/**
 * The message the API receives: the visitor's text, then a block of labelled lines
 * ("— Želim izmjeru: subotom", "— Sviđa mi se fotografija: … (/galerija/….jpg)"). At most MESSAGE_MAX characters —
 * the visitor's text is shortened first, the labelled lines stay whole.
 */
export function composeMessage({ message, measurement, photo }: MessageExtras): string {
  const lines: string[] = [];
  if (measurement?.wanted) {
    const slots = [...new Set(measurement.slots.map(oneLine).filter(Boolean))];
    lines.push(slots.length ? `— Želim izmjeru: ${slots.join(", ")}` : "— Želim izmjeru");
  }
  if (photo) lines.push(`— Sviđa mi se fotografija: ${oneLine(photo.title)} (${photo.src})`);

  const text = message.trim();
  const block = lines.join("\n");
  if (!block) return clip(text, MESSAGE_MAX);
  if (!text) return block.slice(0, MESSAGE_MAX);
  const room = MESSAGE_MAX - block.length - 2;
  const head = room > 0 ? clip(text, room) : "";
  return (head ? `${head}\n\n${block}` : block).slice(0, MESSAGE_MAX);
}

/**
 * `?slika=kuhinja-siva-mramor` → that photo of lib/gallery.ts (looked up by its file name), or null for anything else.
 * Only lowercase letters, digits and dashes get as far as the lookup.
 */
export function findGalleryPhoto(param: string | null | undefined): Photo | null {
  const name = (param ?? "").trim().toLowerCase();
  if (!/^[a-z0-9-]{1,80}$/.test(name)) return null;
  return gallery.find((p) => p.src === `/galerija/${name}.jpg`) ?? null;
}

/* ------------------------------------------------------------------ the API's reply */

/**
 * What an ok reply of POST /api/upit says about the visitor's confirmation e-mail. Newer replies carry
 * `email: "sent" | "failed" | "off"`; older ones only `confirmation: boolean`, where false meant "failed" or just
 * "e-mail is not set up" — so an old false says nothing ("none"), and the forms never claim a failure they can't know.
 */
export function confirmationOf(reply: object): "sent" | "failed" | "none" {
  const r = reply as Record<string, unknown>;
  if (r.email === "failed") return "failed";
  if (r.email === "sent" || r.confirmation === true || r.confirmationSent === true) return "sent";
  return "none";
}

/** the inquiry number of an ok reply ("U-2026-0007"), when the reply has one in that form */
export function leadNumberOf(reply: object): string | null {
  const n = (reply as Record<string, unknown>).number;
  return typeof n === "string" && /^[A-Z]-\d{4}-\d{4,6}$/.test(n) ? n : null;
}
