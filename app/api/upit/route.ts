/**
 * POST /api/upit — inquiries from the contact form and the 3D studio.
 * Runs on the Node.js runtime (the default; no `runtime` export so it stays compatible with Cache Components).
 * Every response body is a LeadResult (lib/lead-schema.ts).
 */
import { leadSchema, type LeadResult } from "@/lib/lead-schema";
import {
  LeadSendError,
  MAX_BODY_BYTES,
  clientIp,
  getLeadEmailEnv,
  isHoneypotHit,
  issueFields,
  rateLimit,
  readBodyLimited,
  sendLeadEmails,
} from "@/lib/lead-server";
import { site } from "@/lib/site";

export const maxDuration = 30;

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

  // 5. honeypot: pretend everything went fine, send nothing
  if (isHoneypotHit(data)) return reply({ ok: true, confirmation: true }, 200);

  // 6. validate
  const parsed = leadSchema.safeParse(data);
  if (!parsed.success) {
    const fields = issueFields(parsed.error.issues);
    return reply({ ok: false, error: "validation", ...(fields.length ? { fields } : {}) }, 400);
  }

  // 7. e-mail configured?
  const env = getLeadEmailEnv();
  if (!env) return reply({ ok: false, error: "not_configured" }, 503);

  // 8. send
  const requestOrigin = originOf(req.url); // null → links fall back to site.url

  try {
    const { confirmationSent } = await sendLeadEmails(parsed.data, { env, requestOrigin });
    return reply({ ok: true, confirmation: confirmationSent }, 200);
  } catch (err) {
    const code = err instanceof LeadSendError ? err.code : "unknown";
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[upit] slanje nije uspjelo (${code}): ${message}`);
    return reply({ ok: false, error: "server" }, 500);
  }
}
