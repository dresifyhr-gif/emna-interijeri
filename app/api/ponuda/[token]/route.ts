/**
 * POST /api/ponuda/<token> — the customer's side of a quote (public, no login).
 *
 *   { "action": "view" }                                       first opening (beacon; no-op afterwards)
 *   { "action": "accept", "name": "Ivan Horvat", "confirm": true }
 *   { "action": "reject", "name": "Ivan Horvat", "reason": "…" }
 *
 * → 200 { ok: true, status? } · 400 validation · 403 forbidden / preview · 404 not_found ·
 *   409 not_sent | expired | already · 413 · 415 · 429 rate_limited · 503 unavailable
 *
 * CSRF: same-origin only (Origin / Fetch Metadata), JSON only. Rate limits are DB-backed and keyed
 * by an HMAC of IP (+ token), so nothing identifying is stored. The token itself is 192 random bits.
 */
import { after } from "next/server";
import { z } from "zod";
import { clientIp, isSameOrigin } from "@/lib/auth/request";
import { getSession } from "@/lib/auth/session";
import { hitThrottle } from "@/lib/auth/throttle";
import { dbErrorLabel, isDbConfigured } from "@/lib/db";
import { readBodyLimited } from "@/lib/lead-server";
import { notifyOwnerOfAnswer } from "@/lib/admin/quote-email";
import { adminQuoteUrl, isQuoteToken, markQuoteViewed, respondToQuote } from "@/lib/admin/quotes";

const MAX_BODY = 8_000;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("view") }),
  z.object({
    action: z.literal("accept"),
    name: z.string().trim().min(3).max(120),
    confirm: z.literal(true),
  }),
  z.object({
    action: z.literal("reject"),
    name: z.string().trim().min(3).max(120),
    reason: z.string().trim().max(1000).optional(),
  }),
]);

const json = (status: number, body: Record<string, unknown>) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store", "x-robots-tag": "noindex, nofollow", "referrer-policy": "no-referrer" },
  });

export async function POST(req: Request, ctx: { params: Promise<{ token: string }> }) {
  if (!isSameOrigin(req.headers, req.url)) return json(403, { ok: false, error: "forbidden" });

  const { token } = await ctx.params;
  if (!isQuoteToken(token)) return json(404, { ok: false, error: "not_found" });

  if (!(req.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return json(415, { ok: false, error: "validation" });
  }
  const raw = await readBodyLimited(req, MAX_BODY);
  if (raw === null) return json(413, { ok: false, error: "validation" });
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return json(400, { ok: false, error: "validation" });
  }
  const parsed = bodySchema.safeParse(data);
  if (!parsed.success) return json(400, { ok: false, error: "validation" });
  const body = parsed.data;

  if (!isDbConfigured()) return json(503, { ok: false, error: "unavailable" });
  const ip = clientIp(req.headers);

  try {
    // the owner previewing the page must never count as the customer
    const admin = await getSession();

    if (body.action === "view") {
      if (admin) return json(200, { ok: true });
      const hit = await hitThrottle("quote-view", ip, { limit: 120, windowSeconds: 600 });
      if (!hit.allowed) return json(429, { ok: false, error: "rate_limited" });
      await markQuoteViewed(token);
      return json(200, { ok: true });
    }

    if (admin) return json(403, { ok: false, error: "preview" });

    const [perToken, perIp] = await Promise.all([
      hitThrottle("quote-answer", `${ip}|${token}`, { limit: 8, windowSeconds: 900 }),
      hitThrottle("quote-answer-ip", ip, { limit: 30, windowSeconds: 900 }),
    ]);
    if (!perToken.allowed || !perIp.allowed) {
      const retry = Math.max(perToken.allowed ? 0 : perToken.retryAfter, perIp.allowed ? 0 : perIp.retryAfter);
      return Response.json(
        { ok: false, error: "rate_limited" },
        { status: 429, headers: { "cache-control": "no-store", "retry-after": String(retry || 60) } },
      );
    }

    const reason = body.action === "reject" ? (body.reason ?? null) : null;
    const res = await respondToQuote(token, { decision: body.action, name: body.name, reason });
    if (!res.ok) {
      const status = res.reason === "not_found" ? 404 : 409;
      return json(status, { ok: false, error: res.reason, ...(res.status ? { status: res.status } : {}) });
    }

    after(() =>
      notifyOwnerOfAnswer({
        number: res.number,
        status: res.status,
        customerName: res.customerName,
        confirmedBy: body.name,
        reason,
        totalCents: res.totalCents,
        leadNumber: res.leadNumber,
        adminUrl: adminQuoteUrl(res.quoteId),
      }),
    );
    return json(200, { ok: true, status: res.status });
  } catch (err) {
    console.error(`[ponuda] odgovor nije spremljen (${dbErrorLabel(err)})`);
    return json(503, { ok: false, error: "unavailable" });
  }
}
