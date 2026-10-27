/**
 * POST /api/upit — inquiries from the contact form and the 3D studio.
 * Runs on the Node.js runtime (the default; no `runtime` export so it stays compatible with Cache Components).
 * Every response body is a LeadResult (lib/lead-schema.ts).
 *
 * A valid inquiry is always stored in the database first (the owner sees it under /admin/upiti; one retry when
 * the database stumbles), then pushed to the owner's phone (lib/admin/push.ts, after the reply) and e-mailed when
 * Resend is configured. ok:true means "we have it" — stored, e-mailed, or both:
 *
 *   e-mail off   { ok: true, confirmation: false, email: "off", number: "U-2026-0007" }
 *   e-mail on    { ok: true, confirmation, email: "sent" | "failed", number? }
 */
import { after } from "next/server";
import { isPushConfigured, leadPayload, sendPush } from "@/lib/admin/push";
import { leadSchema, type LeadInput, type LeadResult } from "@/lib/lead-schema";
import {
  LeadSendError,
  MAX_BODY_BYTES,
  clientIp,
  getLeadEmailEnv,
  isHoneypotHit,
  issueFields,
  parseSnapshot,
  rateLimit,
  readBodyLimited,
  sendLeadEmails,
  storeLead,
  type StoredLead,
} from "@/lib/lead-server";
import { hitThrottle } from "@/lib/auth/throttle";
import { dbErrorLabel, isDbConfigured, pgErrorCode } from "@/lib/db";
import { markLeadNotified } from "@/lib/db/leads";
import { site } from "@/lib/site";

export const maxDuration = 30;

const STORE_RETRY_MS = 400;

function reply(body: LeadResult, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * Only our own pages may post here. A browser always sends Origin on a POST and cannot forge it,
 * so it must be this deployment (the Host the request came in on, or req.url) or the canonical site.url.
 * Without Origin (curl, very old browsers) Fetch Metadata still flags a cross-site request.
 * Non-browser clients can send anything — for them the rate limit and validation below apply.
 */
function isSameSite(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (origin === null) return req.headers.get("sec-fetch-site")?.trim().toLowerCase() !== "cross-site";

  let from: URL;
  try {
    from = new URL(origin); // the opaque origin "null" (sandboxed iframe, data: page) throws here
  } catch {
    return false;
  }
  if (from.origin === originOf(site.url) || from.origin === originOf(req.url)) return true;

  const host = (req.headers.get("x-forwarded-host") ?? req.headers.get("host"))?.split(",")[0]?.trim().toLowerCase();
  return Boolean(host) && from.host === host;
}

/** exact media type, so "text/plain;x=application/json" (CORS-safelisted, no preflight) is refused */
function isJson(req: Request): boolean {
  const essence = (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase();
  return essence === "application/json";
}

/**
 * storeLead, once more after a short pause when the database stumbled (timeout, dropped connection).
 * A data or constraint error (Postgres class 22 / 23) would fail the same way again, so it isn't retried.
 */
async function storeWithRetry(lead: LeadInput, opts: { requestOrigin: string | null; now: Date }): Promise<StoredLead | null> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await storeLead(lead, opts);
    } catch (err) {
      const again = attempt === 1 && !/^2[23]/.test(pgErrorCode(err) ?? "");
      console.error(`[upit] spremanje u bazu nije uspjelo (${dbErrorLabel(err)})${again ? ", pokušavam ponovno" : ""}`);
      if (!again) return null;
      await new Promise((resolve) => setTimeout(resolve, STORE_RETRY_MS));
    }
  }
}

/** the owner's phone (Web Push), after the reply is sent — a push problem can never change the reply */
function pushToOwner(lead: LeadInput, stored: StoredLead) {
  if (!isPushConfigured()) return;
  try {
    const payload = leadPayload({
      id: stored.id,
      number: stored.number,
      source: lead.source,
      city: lead.city,
      priceLow: lead.price?.low,
      priceHigh: lead.price?.high,
    });
    after(() =>
      sendPush(payload).catch((err) => console.warn(`[upit] ${stored.number}: obavijest na mobitel nije poslana (${dbErrorLabel(err)})`)),
    );
  } catch (err) {
    console.warn(`[upit] ${stored.number}: obavijest na mobitel nije zakazana (${err instanceof Error ? err.name : "unknown"})`);
  }
}

export async function POST(req: Request) {
  // 1. other sites must not be able to make a visitor's browser post an inquiry (and mail an address of their choice).
  //    Checked before the rate limit so forged requests can't use up the visitor's own quota.
  if (!isSameSite(req)) return reply({ ok: false, error: "server" }, 403);

  // 2. rate limit (every other attempt counts, including bots and invalid bodies)
  const limit = rateLimit(clientIp(req.headers));
  if (!limit.ok) return reply({ ok: false, error: "rate_limited" }, 429, { "retry-after": String(limit.retryAfter) });

  // 3. JSON only — a cross-origin application/json request needs a CORS preflight, which this route never grants
  if (!isJson(req)) return reply({ ok: false, error: "validation" }, 415);

  // 4. size guard + parse
  let raw: string | null;
  try {
    raw = await readBodyLimited(req, MAX_BODY_BYTES);
  } catch {
    return reply({ ok: false, error: "validation" }, 400);
  }
  if (raw === null) return reply({ ok: false, error: "validation" }, 413);

  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return reply({ ok: false, error: "validation" }, 400);
  }

  // 5. honeypot: pretend everything went fine (the answer a real inquiry would get), send nothing
  if (isHoneypotHit(data)) {
    const emailOn = getLeadEmailEnv() !== null;
    return reply({ ok: true, confirmation: emailOn, email: emailOn ? "sent" : "off" }, 200);
  }

  // 6. validate
  const parsed = leadSchema.safeParse(data);
  if (!parsed.success) {
    const fields = issueFields(parsed.error.issues);
    return reply({ ok: false, error: "validation", ...(fields.length ? { fields } : {}) }, 400);
  }

  // 7. anywhere to put it? (database and/or e-mail)
  const lead = parsed.data;
  const env = getLeadEmailEnv();
  const dbReady = isDbConfigured();
  if (!env && !dbReady) return reply({ ok: false, error: "not_configured" }, 503);

  // 7b. durable limit on valid inquiries, shared by every serverless instance (the one in step 2 is
  //     per instance): 10 per hour per IP. Fails open — a throttle hiccup must never cost a real inquiry.
  if (dbReady) {
    try {
      const hit = await hitThrottle("upit-ip", clientIp(req.headers), { limit: 10, windowSeconds: 60 * 60 });
      if (!hit.allowed) return reply({ ok: false, error: "rate_limited" }, 429, { "retry-after": String(hit.retryAfter) });
    } catch (err) {
      console.warn(`[upit] ograničenje nije provjereno (${dbErrorLabel(err)})`);
    }
  }

  const requestOrigin = originOf(req.url); // null → links fall back to site.url
  const now = new Date();
  const hasSnapshot = lead.source === "studio" && parseSnapshot(lead.snapshot) !== null;

  // 8. store — the inquiry is never lost once this succeeds — and tell the owner's phone
  const stored = dbReady ? await storeWithRetry(lead, { requestOrigin, now }) : null;
  if (stored) pushToOwner(lead, stored);
  const image = (storedImage: boolean) => (lead.source === "studio" ? { image: storedImage } : {});
  const number = stored ? { number: stored.number } : {};

  // 9. e-mail (optional)
  if (!env) {
    if (!stored) return reply({ ok: false, error: "server" }, 500);
    return reply({ ok: true, confirmation: false, email: "off", ...number, ...image(Boolean(stored.snapshotPath)) }, 200);
  }

  const base = originOf(site.url);
  const adminUrl = stored && base ? `${base}/admin/upiti/${stored.id}` : null;
  try {
    const { confirmationSent } = await sendLeadEmails(lead, {
      env,
      requestOrigin,
      now,
      leadNumber: stored?.number ?? null,
      adminUrl,
    });
    if (stored) {
      await markLeadNotified(stored.id, { owner: true, confirmation: confirmationSent }).catch((err) =>
        console.warn(`[upit] ${stored?.number}: oznaka slanja nije spremljena (${dbErrorLabel(err)})`),
      );
    }
    return reply(
      { ok: true, confirmation: confirmationSent, email: confirmationSent ? "sent" : "failed", ...number, ...image(hasSnapshot) },
      200,
    );
  } catch (err) {
    const code = err instanceof LeadSendError ? err.code : err instanceof Error ? err.name : "unknown";
    console.error(`[upit] slanje e-maila nije uspjelo (${code})${stored ? ` — upit ${stored.number} je spremljen` : ""}`);
    // stored → the owner has it in the admin; the visitor just doesn't get a confirmation
    if (stored) {
      return reply({ ok: true, confirmation: false, email: "failed", ...number, ...image(Boolean(stored.snapshotPath)) }, 200);
    }
    return reply({ ok: false, error: "server" }, 500);
  }
}
