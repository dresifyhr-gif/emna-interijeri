/**
 * Server half of the lead (upit) pipeline, used by app/api/upit/route.ts.
 * Node.js only (pulls in "resend" and Buffer) — never import this from a client component.
 *
 * Env (all three required, otherwise the API answers 503 not_configured):
 *   RESEND_API_KEY   re_…                                   (resend.com → API Keys)
 *   LEAD_EMAIL_TO    owner inbox, comma-separated for more  e.g. "upiti@emna.hr"
 *   LEAD_EMAIL_FROM  verified sender                        e.g. "EMNA Interijeri <upiti@emna.hr>"
 */
import { Resend } from "resend";
import type { LeadInput } from "./lead-schema";
import { site } from "./site";
import { customerEmail } from "./lead-email/customer";
import { ownerEmail } from "./lead-email/owner";
import { formatPrice, type LeadEmailData } from "./lead-email/shared";
import { estimate } from "./studio/price";
import { sanitizeConfig, studioPath } from "./studio/share";
import { summarize } from "./studio/summary";

/** a 3 MB snapshot data URL + the rest of the payload, with headroom */
export const MAX_BODY_BYTES = 3_500_000;

/* ================================================================== env */

export interface LeadEmailEnv {
  apiKey: string;
  to: string[];
  from: string;
}

export function getLeadEmailEnv(): LeadEmailEnv | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.LEAD_EMAIL_FROM?.trim();
  const to = (process.env.LEAD_EMAIL_TO ?? "")
    .split(/[,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
  if (!apiKey || !from || to.length === 0) return null;
  return { apiKey, from, to };
}

/* ================================================================== rate limit */

const WINDOW_MS = 10 * 60 * 1000;
const MAX_PER_WINDOW = 5;

type HitStore = Map<string, number[]>;
// kept on globalThis so dev-mode hot reloads don't reset it
const g = globalThis as typeof globalThis & { __emnaLeadHits?: HitStore };
const hits: HitStore = (g.__emnaLeadHits ??= new Map());

/**
 * Sliding window, in memory: 5 requests / 10 minutes per key.
 * Best effort — on serverless every instance keeps its own window.
 */
export function rateLimit(key: string, now = Date.now()): { ok: true } | { ok: false; retryAfter: number } {
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    hits.set(key, recent);
    return { ok: false, retryAfter: Math.max(1, Math.ceil((recent[0] + WINDOW_MS - now) / 1000)) };
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 5000) {
    for (const [k, list] of hits) if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  }
  return { ok: true };
}

export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || headers.get("x-real-ip")?.trim() || "unknown";
}

/* ================================================================== request body */

/** reads the body as text, or returns null as soon as it exceeds `limit` bytes */
export async function readBodyLimited(req: Request, limit = MAX_BODY_BYTES): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return "";

  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

/** bots fill every field; people never see `website` */
export function isHoneypotHit(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const w = (data as Record<string, unknown>).website;
  return w !== undefined && w !== null && w !== "";
}

/** top-level field names of zod issues, e.g. ["email", "consent"] */
export function issueFields(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey> }>): string[] {
  const out = new Set<string>();
  for (const issue of issues) {
    const key = issue.path[0];
    if (key !== undefined) out.add(String(key));
  }
  return Array.from(out);
}

/* ================================================================== payload normalisation */

const SNAPSHOT_CID = "kuhinja-3d";

interface Snapshot {
  /** base64 */
  content: string;
  contentType: "image/jpeg" | "image/png";
  filename: string;
}

/** accepts only real JPEG/PNG data URLs (checks magic bytes, not just the prefix) */
export function parseSnapshot(dataUrl: string | undefined): Snapshot | null {
  if (!dataUrl) return null;
  const m = /^data:image\/(jpeg|jpg|png);base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl.trim());
  if (!m) return null;
  const b64 = m[2];
  const head = Buffer.from(b64.slice(0, 16), "base64");
  const isJpeg = head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff;
  const isPng = head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47;
  if (isJpeg) return { content: b64, contentType: "image/jpeg", filename: "kuhinja-3d.jpg" };
  if (isPng) return { content: b64, contentType: "image/png", filename: "kuhinja-3d.png" };
  return null;
}

function originOf(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/**
 * The studio link is client-supplied, so it is rebuilt on our own origin and must point at /studio.
 * (Otherwise anyone could make our e-mails carry a "Otvori kuhinju u 3D" button to any site.)
 */
export function safeConfigUrl(raw: string | undefined, requestOrigin: string | null): string | null {
  if (!raw) return null;
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.pathname.replace(/\/+$/, "") !== "/studio") return null;
  const siteOrigin = originOf(site.url);
  const trusted = [siteOrigin, requestOrigin].filter((o): o is string => Boolean(o));
  const base = trusted.includes(u.origin) ? u.origin : siteOrigin;
  if (!base) return null;
  return `${base}/studio${u.search}${u.hash}`;
}

/**
 * The customer confirmation goes to an unverified address, so it must not carry anything the
 * submitter controls (image, summary text, price, link target, free-text fields). Everything about
 * their kitchen is rebuilt here from the sanitized config and linked only to site.url.
 */
function customerData(data: LeadEmailData): LeadEmailData {
  const { lead } = data;
  const base = originOf(site.url);
  let summary: string[] = [];
  let price: string | null = null;
  let configUrl: string | null = null;
  if (lead.source === "studio" && lead.config != null) {
    const cfg = sanitizeConfig(lead.config);
    summary = summarize(cfg);
    price = formatPrice(estimate(cfg));
    configUrl = base ? `${base}${studioPath(cfg)}` : null;
  }
  return {
    ...data,
    lead: { ...lead, summary, interest: undefined, city: undefined, timeline: undefined, message: undefined },
    price,
    configUrl,
    snapshotCid: null,
    configAttached: false,
  };
}

function configAttachment(config: unknown): { content: string; filename: string; contentType: string } | null {
  if (config === undefined || config === null) return null;
  let json: string | undefined;
  try {
    json = JSON.stringify(config, null, 2);
  } catch {
    return null;
  }
  if (!json || json.length > 200_000) return null;
  return {
    content: Buffer.from(json, "utf8").toString("base64"),
    filename: "kuhinja-konfiguracija.json",
    contentType: "application/json",
  };
}

/* ================================================================== send */

export class LeadSendError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "LeadSendError";
    this.code = code;
  }
}

/**
 * 1) notification to the owner (reply-to = customer) — failure throws LeadSendError
 * 2) confirmation to the customer (reply-to = owner) — failure is logged, not fatal:
 *    the owner already has the inquiry, so the visitor must not be told it failed.
 */
export async function sendLeadEmails(
  lead: LeadInput,
  opts: { env: LeadEmailEnv; requestOrigin: string | null; now?: Date },
): Promise<{ confirmationSent: boolean }> {
  const { env } = opts;
  const resend = new Resend(env.apiKey);

  const snapshot = parseSnapshot(lead.snapshot);
  const config = lead.source === "studio" ? configAttachment(lead.config) : null;
  const data: LeadEmailData = {
    lead,
    receivedAt: opts.now ?? new Date(),
    configUrl: safeConfigUrl(lead.configUrl, opts.requestOrigin),
    price: formatPrice(lead.price),
    snapshotCid: snapshot ? SNAPSHOT_CID : null,
    configAttached: Boolean(config),
  };

  const image = snapshot
    ? { content: snapshot.content, filename: snapshot.filename, contentType: snapshot.contentType, contentId: SNAPSHOT_CID }
    : null;
  const tags = [
    { name: "type", value: "lead" },
    { name: "source", value: lead.source },
  ];
  const customerAddress = lead.email.trim();

  const owner = ownerEmail(data);
  const ownerAttachments = [image, config].filter((a): a is NonNullable<typeof a> => a !== null);
  let sent: Awaited<ReturnType<typeof resend.emails.send>>;
  try {
    sent = await resend.emails.send({
      from: env.from,
      to: env.to,
      replyTo: customerAddress,
      subject: owner.subject,
      html: owner.html,
      text: owner.text,
      attachments: ownerAttachments.length ? ownerAttachments : undefined,
      tags,
    });
  } catch (err) {
    throw new LeadSendError("network", err instanceof Error ? err.message : String(err));
  }
  if (sent.error) throw new LeadSendError(sent.error.name, sent.error.message);

  const confirmation = customerEmail(customerData(data));
  try {
    const res = await resend.emails.send({
      from: env.from,
      to: customerAddress,
      replyTo: env.to,
      subject: confirmation.subject,
      html: confirmation.html,
      text: confirmation.text,
      tags: [...tags, { name: "kind", value: "confirmation" }],
    });
    if (res.error) {
      console.warn(`[upit] potvrda kupcu nije poslana: ${res.error.name} — ${res.error.message}`);
      return { confirmationSent: false };
    }
  } catch (err) {
    console.warn(`[upit] potvrda kupcu nije poslana: ${err instanceof Error ? err.message : String(err)}`);
    return { confirmationSent: false };
  }
  return { confirmationSent: true };
}
