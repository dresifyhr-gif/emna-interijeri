import { z } from "zod";
import { EMAIL_MAX, PHONE_MIN_DIGITS, phoneDigitCount } from "./lead-client";

/**
 * Body of POST /api/upit — shared by the studio and the contact form.
 * Server-side only in practice: client components import just the types (`import type`)
 * and check fields with the zod-free rules in lib/lead-client.ts, so zod never ships to the browser.
 */
export const leadSchema = z.object({
  source: z.enum(["studio", "kontakt"]),
  name: z.string().trim().min(2).max(100),
  /** free format ("+385 91 …", "091/…"), but it has to contain a callable number */
  phone: z
    .string()
    .trim()
    .min(6)
    .max(30)
    .refine((p) => phoneDigitCount(p) >= PHONE_MIN_DIGITS, { message: `Telefon mora imati barem ${PHONE_MIN_DIGITS} znamenki.` }),
  email: z.email().max(EMAIL_MAX),
  city: z.string().trim().max(80).optional(),
  /** e.g. "Kuhinja", "Ormar", "Interijer" */
  interest: z.string().trim().max(80).optional(),
  /** when they plan to do it, e.g. "1–3 mjeseca" */
  timeline: z.string().trim().max(80).optional(),
  message: z.string().trim().max(3000).optional(),

  // studio only
  /** KitchenConfig — stored as-is in the e-mail; the link below is what matters */
  config: z.unknown().optional(),
  /** absolute link that re-opens exactly this kitchen in the studio */
  configUrl: z.url().max(6000).optional(),
  /** human-readable summary lines produced by the studio */
  summary: z.array(z.string().max(300)).max(60).optional(),
  price: z.object({ low: z.number(), high: z.number() }).optional(),
  /** JPEG data URL of the 3D view */
  snapshot: z.string().startsWith("data:image/").max(3_000_000).optional(),

  /**
   * The visitor confirms they have read the privacy notice (/privatnost). It is an acknowledgement,
   * not the legal basis: answering an inquiry is processing at the data subject's request (GDPR čl. 6. st. 1. t. b).
   */
  consent: z.literal(true),
  /** honeypot — real people leave it empty (the visible input is named differently, see the forms) */
  website: z.string().max(0).optional(),
});

export type LeadInput = z.infer<typeof leadSchema>;

export type LeadResult =
  | {
      ok: true;
      /**
       * false when the owner received the inquiry but the short confirmation e-mail to the
       * visitor could not be sent — the UI must not promise that confirmation then.
       */
      confirmation?: boolean;
    }
  | { ok: false; error: "validation" | "not_configured" | "rate_limited" | "server"; fields?: string[] };
