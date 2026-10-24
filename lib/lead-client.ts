import type { LeadInput, LeadResult } from "./lead-schema";

/* ------------------------------------------------------------------ field rules
 * Zod-free, so client components can check fields without shipping zod to the browser.
 * The server still validates everything with the full leadSchema (lib/lead-schema.ts).
 */

/** a phone number must have at least this many digits (the schema enforces the same) */
export const PHONE_MIN_DIGITS = 6;

export const phoneDigitCount = (phone: string) => phone.replace(/\D/g, "").length;

/**
 * The same pattern zod's z.email() uses on the server (zod/v4/core regexes `email`),
 * so the browser accepts exactly what the API accepts.
 */
const EMAIL_RE = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;

export const EMAIL_MAX = 200;

/** expects an already trimmed value */
export const isValidEmail = (email: string) => email.length <= EMAIL_MAX && EMAIL_RE.test(email);

/* ------------------------------------------------------------------ request */

/** Browser-side call to POST /api/upit. Never throws. */
export async function sendLead(payload: LeadInput): Promise<LeadResult> {
  try {
    const res = await fetch("/api/upit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = (await res.json().catch(() => null)) as LeadResult | null;
    if (data && typeof data.ok === "boolean") return data;
    return { ok: false, error: "server" };
  } catch {
    return { ok: false, error: "server" };
  }
}
