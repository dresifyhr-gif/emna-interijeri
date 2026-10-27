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

/** a stalled connection gives up after this long and reports a failed send (the form keeps what was typed) */
const SEND_TIMEOUT_MS = 45_000;

/** Browser-side call to POST /api/upit. Never throws. */
export async function sendLead(payload: LeadInput): Promise<LeadResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), SEND_TIMEOUT_MS);
  try {
    const res = await fetch("/api/upit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    const data = (await res.json().catch(() => null)) as LeadResult | null;
    if (data && typeof data.ok === "boolean") return data;
    return { ok: false, error: "server" };
  } catch {
    return { ok: false, error: "server" };
  } finally {
    clearTimeout(timer);
  }
}

export interface CompanyContact {
  phone: string | null;
  email: string | null;
}

let companyContact: Promise<CompanyContact | null> | null = null;

/**
 * The phone and e-mail the owner entered in /admin/postavke, from GET /studio/tvrtka — for the "Upit nije poslan"
 * panels when lib/site.ts has none. Fetched once per page; null when the route doesn't answer. Never throws.
 */
export function fetchCompanyContact(): Promise<CompanyContact | null> {
  companyContact ??= fetch("/studio/tvrtka")
    .then((res) => (res.ok ? res.json() : null))
    .then((data: unknown) => {
      if (!data || typeof data !== "object") return null;
      const pick = (k: string) => {
        const v = (data as Record<string, unknown>)[k];
        return typeof v === "string" && v.trim() ? v.trim() : null;
      };
      const phone = pick("phone");
      const email = pick("email");
      return {
        phone: phone && phoneDigitCount(phone) >= PHONE_MIN_DIGITS ? phone : null,
        email: email && isValidEmail(email) ? email : null,
      };
    })
    .catch(() => null)
    .then((c) => {
      // a failed fetch is tried again by the next panel
      if (!c) companyContact = null;
      return c;
    });
  return companyContact;
}
