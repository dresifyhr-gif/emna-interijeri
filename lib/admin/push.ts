/**
 * Notifying the owner without e-mail: Web Push to the phones where he switched it on (Postavke → Obavijesti),
 * plus the cookie that marks which quote answers are new in the admin.
 *
 *   if (isPushConfigured()) after(() => sendPush(leadPayload({ id, number, source, city, priceLow, priceHigh })).catch(log));
 *   await savePushSubscription(normalizeSubscription(input)!, { userId, ua });   // the settings page
 *   const since = quotesSeenSince(cookies.get(QUOTES_SEEN_COOKIE)?.value);
 *   const answers = await answeredQuotesSince(since);                            // badge + dashboard alerts
 *
 * Keys: VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY / VAPID_SUBJECT (.env.example, generated once with
 * `npx web-push generate-vapid-keys`). Without them nothing is sent and the settings page says so.
 * Subscriptions are kept in the settings table under PUSH_SUBSCRIPTIONS_KEY: at most 20, one per endpoint.
 * A device the push service no longer knows (404 / 410) is dropped on the next send. Two devices
 * subscribing in the same instant can lose one write — accepted at this scale (no migration needed).
 *
 * Server only. The I/O half loads lib/db, lib/admin/settings.ts and web-push on first use, so the pure
 * helpers run in plain Node: npx tsx --test lib/admin/push.test.ts
 * Never log an endpoint or its keys: together they let anyone push to the owner's phone.
 */
import { desc, gt, or, sql } from "drizzle-orm";
import { z } from "zod";
import { formatEur, formatPriceRange } from "@/lib/admin/format";
import { quoteTotals } from "@/lib/admin/quote-math";
import { LEAD_SOURCE_LABEL } from "@/lib/admin/status";
import { isLeadSource } from "@/lib/db/enums";
import { quotes } from "@/lib/db/schema";

/** settings key of the subscription list */
export const PUSH_SUBSCRIPTIONS_KEY = "push_subscriptions";
export const MAX_PUSH_SUBSCRIPTIONS = 20;

/** how long the push service keeps a message for a phone that is off (seconds) */
const TTL_SECONDS = 3 * 24 * 60 * 60;
/** socket timeout per push service request, well inside the time a route's after() may run */
const SEND_TIMEOUT_MS = 10_000;

/** what the browser hands over (PushSubscription.toJSON(), minus expirationTime) */
export interface PushSubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export interface StoredPushSubscription extends PushSubscriptionInput {
  /** admin_users.id of whoever switched it on */
  userId: string;
  /** user agent at that moment, to tell devices apart */
  ua: string | null;
  /** ISO time */
  createdAt: string;
}

/** the JSON public/admin-sw.js shows */
export interface PushPayload {
  title: string;
  body: string;
  /** admin path opened on tap */
  url: string;
  /** a newer notice with the same tag replaces the older one */
  tag: string;
}

export interface PushReport {
  sent: number;
  failed: number;
  /** devices dropped because the push service no longer knows them */
  removed: number;
}

/* ================================================================== pure helpers */

/** the server POSTs to this URL: a public https host on the default port, never an address on our own network */
function isPushEndpoint(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  const host = url.hostname;
  return (
    url.protocol === "https:" &&
    !url.port &&
    !url.username &&
    !url.password &&
    host.includes(".") &&
    !host.includes(":") &&
    !host.startsWith("[") &&
    !/^[\d.]+$/.test(host)
  );
}

const base64url = (min: number, max: number) =>
  z
    .string()
    .min(min)
    .max(max)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/);

const subscriptionSchema = z.object({
  endpoint: z.string().max(1000).refine(isPushEndpoint),
  keys: z.object({
    /** P-256 public key, 65 bytes → 87 characters */
    p256dh: base64url(40, 200),
    /** 16 random bytes → 22 characters */
    auth: base64url(16, 100),
  }),
});

const storedSchema = subscriptionSchema.extend({
  userId: z.string().max(100),
  ua: z.string().max(300).nullable().catch(null),
  createdAt: z.string().max(40),
});

/** a subscription from the browser → the part worth keeping, or null when it doesn't look like one */
export function normalizeSubscription(input: unknown): PushSubscriptionInput | null {
  const parsed = subscriptionSchema.safeParse(input);
  if (!parsed.success) return null;
  const { endpoint, keys } = parsed.data;
  return { endpoint, keys: { p256dh: keys.p256dh, auth: keys.auth } };
}

/** the stored setting → valid entries only (one bad entry never costs the others) */
export function readSubscriptions(raw: unknown): StoredPushSubscription[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const parsed = storedSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  });
}

/** adds or refreshes one device (by endpoint, newest last), keeping the newest MAX_PUSH_SUBSCRIPTIONS */
export function upsertSubscription(list: readonly StoredPushSubscription[], sub: StoredPushSubscription): StoredPushSubscription[] {
  return [...list.filter((s) => s.endpoint !== sub.endpoint), sub].slice(-MAX_PUSH_SUBSCRIPTIONS);
}

export function removeEndpoint(list: readonly StoredPushSubscription[], endpoint: string): StoredPushSubscription[] {
  return list.filter((s) => s.endpoint !== endpoint);
}

/** one line, trimmed and cut; null when empty */
function clean(v: string | null | undefined, max: number): string | null {
  const t = v?.replace(/\s+/g, " ").trim();
  return t ? t.slice(0, max) : null;
}

const positive = (n: number | null | undefined) => (typeof n === "number" && Number.isFinite(n) && n > 0 ? n : null);

/** "Novi upit U-2026-0007" · "3D studio · Zagreb · 8.400 – 9.100 €" (missing parts left out) */
export function leadPayload(lead: {
  id: string;
  number: string;
  source: string;
  city?: string | null;
  /** okvirna cijena in whole euros (studio only) */
  priceLow?: number | null;
  priceHigh?: number | null;
}): PushPayload {
  const body = [
    isLeadSource(lead.source) ? LEAD_SOURCE_LABEL[lead.source] : null,
    clean(lead.city, 60),
    formatPriceRange(positive(lead.priceLow), positive(lead.priceHigh)) || null,
  ].filter(Boolean);
  return {
    title: `Novi upit ${lead.number}`,
    body: body.join(" · "),
    url: `/admin/upiti/${lead.id}`,
    tag: `upit-${lead.id}`,
  };
}

/** "Ponuda P-2026-0003 je prihvaćena" · "Ivan Horvat · 9.240 €" */
export function quoteAnswerPayload(quote: {
  id: string;
  number: string;
  accepted: boolean;
  customerName?: string | null;
  /** with PDV, integer cents */
  totalCents?: number | null;
}): PushPayload {
  const cents = positive(quote.totalCents);
  const body = [clean(quote.customerName, 80), cents ? formatEur(Math.round(cents / 100)) : null].filter(Boolean);
  return {
    title: `Ponuda ${quote.number} je ${quote.accepted ? "prihvaćena" : "odbijena"}`,
    body: body.join(" · "),
    url: `/admin/ponude/${quote.id}`,
    tag: `ponuda-${quote.id}`,
  };
}

/** "Pošalji probnu obavijest" on the settings page */
export const TEST_PAYLOAD: PushPayload = {
  title: "Probna obavijest",
  body: "Obavijesti na ovom uređaju rade. Ovako će izgledati novi upit.",
  url: "/admin/postavke/obavijesti",
  tag: "proba",
};

/* ================================================================== "new answers" in the admin */

/** cookie (path /admin) with the ISO time the owner last opened Ponude; quote answers after it count as new */
export const QUOTES_SEEN_COOKIE = "emna_ponude_seen";
/** without the cookie (new phone, cleared browser) answers of the last 14 days count as new */
export const QUOTES_SEEN_FALLBACK_DAYS = 14;

/** from when quote answers count as new; a missing, broken or future cookie never hides anything */
export function quotesSeenSince(cookie: string | null | undefined, now: Date = new Date()): Date {
  const fallback = new Date(now.getTime() - QUOTES_SEEN_FALLBACK_DAYS * 24 * 60 * 60 * 1000);
  const t = cookie && /^\d{4}-\d{2}-\d{2}T/.test(cookie) ? Date.parse(cookie) : NaN;
  if (!Number.isFinite(t)) return fallback;
  return new Date(Math.min(t, now.getTime()));
}

export interface AnsweredQuote {
  id: string;
  number: string;
  /** false = rejected */
  accepted: boolean;
  customerName: string;
  /** with PDV, integer cents */
  totalCents: number;
  /** ISO time of the answer */
  answeredAt: string;
}

/**
 * Quotes accepted or rejected after `since`, newest first — the Ponude badge, the dashboard alerts and
 * whether opening Ponude has anything to mark as seen. Throws when the database fails.
 */
export async function answeredQuotesSince(since: Date, limit = 20): Promise<AnsweredQuote[]> {
  const { getDb } = await import("@/lib/db");
  const rows = await getDb()
    .select({
      id: quotes.id,
      number: quotes.number,
      customerName: quotes.customerName,
      items: quotes.items,
      discountPct: quotes.discountPct,
      vatPct: quotes.vatPct,
      acceptedAt: quotes.acceptedAt,
      rejectedAt: quotes.rejectedAt,
    })
    .from(quotes)
    .where(or(gt(quotes.acceptedAt, since), gt(quotes.rejectedAt, since)))
    .orderBy(desc(sql`coalesce(${quotes.acceptedAt}, ${quotes.rejectedAt})`))
    .limit(limit);
  return rows.map((r) => ({
    id: r.id,
    number: r.number,
    accepted: r.acceptedAt !== null,
    customerName: r.customerName,
    totalCents: quoteTotals(Array.isArray(r.items) ? r.items : [], r.discountPct, r.vatPct).totalCents,
    answeredAt: (r.acceptedAt ?? r.rejectedAt ?? since).toISOString(),
  }));
}

/* ================================================================== keys */

interface VapidDetails {
  subject: string;
  publicKey: string;
  privateKey: string;
}

const keyBytes = (key: string) => (/^[A-Za-z0-9_-]+={0,2}$/.test(key) ? Buffer.from(key, "base64url").length : 0);

/** the three VAPID values, or null when one is missing or malformed (then push is simply off) */
function vapid(): VapidDetails | null {
  const subject = process.env.VAPID_SUBJECT?.trim();
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  if (!subject || !publicKey || !privateKey) return null;
  if (!/^(mailto:|https:\/\/)\S+$/.test(subject)) return null;
  if (keyBytes(publicKey) !== 65 || keyBytes(privateKey) !== 32) return null;
  return { subject, publicKey, privateKey };
}

export function isPushConfigured(): boolean {
  return vapid() !== null;
}

/** the key browsers subscribe with (public by design); null when push is off */
export function vapidPublicKey(): string | null {
  return vapid()?.publicKey ?? null;
}

/* ================================================================== store + send (database, network) */

const settingsStore = () => import("@/lib/admin/settings");

/** every subscribed device; throws when the database fails */
export async function listPushSubscriptions(): Promise<StoredPushSubscription[]> {
  const { getSetting } = await settingsStore();
  return readSubscriptions(await getSetting(PUSH_SUBSCRIPTIONS_KEY));
}

export async function savePushSubscription(
  sub: PushSubscriptionInput,
  who: { userId: string; ua: string | null },
  now: Date = new Date(),
): Promise<void> {
  const { getSetting, setSetting } = await settingsStore();
  const list = readSubscriptions(await getSetting(PUSH_SUBSCRIPTIONS_KEY));
  const entry: StoredPushSubscription = { ...sub, userId: who.userId, ua: clean(who.ua, 300), createdAt: now.toISOString() };
  await setSetting(PUSH_SUBSCRIPTIONS_KEY, upsertSubscription(list, entry));
}

/** false when the device wasn't on the list */
export async function deletePushSubscription(endpoint: string): Promise<boolean> {
  const { getSetting, setSetting } = await settingsStore();
  const list = readSubscriptions(await getSetting(PUSH_SUBSCRIPTIONS_KEY));
  const next = removeEndpoint(list, endpoint);
  if (next.length === list.length) return false;
  await setSetting(PUSH_SUBSCRIPTIONS_KEY, next);
  return true;
}

const statusOf = (err: unknown) => {
  const code = (err as { statusCode?: unknown } | null)?.statusCode;
  return typeof code === "number" ? code : null;
};

/**
 * Sends one notice to every subscribed device (or only to `endpoint`) and drops the ones that are gone.
 * Does nothing without VAPID keys or devices. Rejects only when the database can't be read.
 */
export async function sendPush(payload: PushPayload, opts: { endpoint?: string } = {}): Promise<PushReport> {
  const report: PushReport = { sent: 0, failed: 0, removed: 0 };
  const keys = vapid();
  if (!keys) return report;
  const all = await listPushSubscriptions();
  const targets = opts.endpoint === undefined ? all : all.filter((s) => s.endpoint === opts.endpoint);
  if (targets.length === 0) return report;

  // CommonJS: everything hangs off the default export
  const { default: webpush } = await import("web-push");
  const body = JSON.stringify(payload);
  const results = await Promise.allSettled(
    targets.map((s) =>
      webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, body, {
        vapidDetails: keys,
        TTL: TTL_SECONDS,
        urgency: "high",
        contentEncoding: "aes128gcm",
        timeout: SEND_TIMEOUT_MS,
      }),
    ),
  );

  const gone = new Set<string>();
  const problems: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      report.sent++;
      return;
    }
    report.failed++;
    const status = statusOf(r.reason);
    if (status === 404 || status === 410) gone.add(targets[i].endpoint);
    problems.push(status ? String(status) : r.reason instanceof Error ? r.reason.name : "unknown");
  });
  if (problems.length) console.warn(`[push] ${problems.length} od ${targets.length} nije poslano (${problems.join(", ")})`);

  if (gone.size) {
    try {
      // read again: a device switched on while we were sending must stay
      const { getSetting, setSetting } = await settingsStore();
      const fresh = readSubscriptions(await getSetting(PUSH_SUBSCRIPTIONS_KEY));
      const next = fresh.filter((s) => !gone.has(s.endpoint));
      if (next.length !== fresh.length) await setSetting(PUSH_SUBSCRIPTIONS_KEY, next);
      report.removed = fresh.length - next.length;
    } catch (err) {
      console.warn(`[push] ugašeni uređaji nisu uklonjeni (${err instanceof Error ? err.name : "unknown"})`);
    }
  }
  return report;
}
