/**
 * Reads and writes for the admin's Upiti (leads) and Pregled (dashboard) pages.
 *
 *   const params = parseLeadListParams(await searchParams);
 *   const { rows, total, pageCount } = await listLeads(params);
 *   const lead = await getLead(id);                    // null for unknown / malformed id
 *   await updateLeadStatus(id, "u_obradi");
 *   await deleteLead(id);                               // also removes the private 3D snapshot
 *
 * Callers are server components / server actions that have already checked the admin session.
 * Errors from the database are thrown; log them with dbErrorLabel(), never err.message (PII).
 */
import "server-only";
import { del } from "@vercel/blob";
import { and, desc, eq, ne, or, sql, type SQL } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { LEAD_STATUSES, isLeadSource, isLeadStatus, type LeadSource, type LeadStatus, type QuoteStatus } from "@/lib/db/enums";
import { leads, quotes, type Lead, type QuoteItem } from "@/lib/db/schema";
import { isBlobConfigured, leadSnapshotPath, safeBlobPath } from "./files";
import { quoteTotals } from "./quote-math";

export const LEADS_PAGE_SIZE = 25;
export const LEAD_NOTES_MAX = 10_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

/* ================================================================== list */

/** "aktivni" = everything except the archive (the default view); "sve" = really everything */
export type LeadStatusFilter = LeadStatus | "aktivni" | "sve";

export interface LeadListParams {
  status: LeadStatusFilter;
  source: LeadSource | null;
  /** trimmed search text ("" = none) */
  q: string;
  /** 1-based */
  page: number;
}

type SearchParams = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export function parseLeadListParams(sp: SearchParams): LeadListParams {
  const rawStatus = first(sp.status);
  const status: LeadStatusFilter = isLeadStatus(rawStatus) || rawStatus === "sve" ? rawStatus : "aktivni";
  const rawSource = first(sp.source);
  const q = first(sp.q).replace(/\s+/g, " ").trim().slice(0, 100);
  const page = Number.parseInt(first(sp.page), 10);
  return {
    status,
    source: isLeadSource(rawSource) ? rawSource : null,
    q,
    page: Number.isFinite(page) && page > 0 ? Math.min(page, 10_000) : 1,
  };
}

/** "/admin/upiti?status=novi&q=…" — default values are left out so URLs stay short */
export function leadListHref(p: Partial<LeadListParams>): string {
  const s = new URLSearchParams();
  if (p.status && p.status !== "aktivni") s.set("status", p.status);
  if (p.source) s.set("source", p.source);
  if (p.q) s.set("q", p.q);
  if (p.page && p.page > 1) s.set("page", String(p.page));
  const qs = s.toString();
  return qs ? `/admin/upiti?${qs}` : "/admin/upiti";
}

const escapeLike = (v: string) => v.replace(/[\\%_]/g, (c) => `\\${c}`);

/** lower-case, Croatian letters folded to ASCII (so "ivic" finds "Ivić") */
const fold = (v: string) =>
  v
    .toLowerCase()
    .replace(/[čć]/g, "c")
    .replace(/đ/g, "d")
    .replace(/š/g, "s")
    .replace(/ž/g, "z");

const foldSql = (col: SQL | typeof leads.name) => sql`translate(lower(${col}), 'čćđšžČĆĐŠŽ', 'ccdszccdsz')`;

function searchCondition(q: string): SQL {
  const pat = `%${escapeLike(fold(q))}%`;
  const conds: SQL[] = [
    sql`${foldSql(leads.name)} like ${pat}`,
    sql`lower(${leads.email}) like ${pat}`,
    sql`lower(${leads.number}) like ${pat}`,
    sql`${foldSql(sql`coalesce(${leads.city}, '')`)} like ${pat}`,
    sql`lower(${leads.phone}) like ${pat}`,
  ];
  // phone numbers: compare digits only, and treat "091…", "+385 91…" and "00385 91…" alike
  const digits = q.replace(/\D/g, "");
  if (digits.length >= 3) {
    const variants = new Set([digits]);
    if (digits.startsWith("00385")) variants.add(digits.slice(5));
    else if (digits.startsWith("385")) variants.add(digits.slice(3));
    else if (digits.startsWith("0")) variants.add(digits.slice(1));
    for (const d of variants) {
      if (d.length >= 3) conds.push(sql`regexp_replace(${leads.phone}, '[^0-9]', '', 'g') like ${`%${d}%`}`);
    }
  }
  return or(...conds) as SQL;
}

function listWhere(p: LeadListParams): SQL | undefined {
  const conds: SQL[] = [];
  if (p.status === "aktivni") conds.push(ne(leads.status, "arhiva"));
  else if (p.status !== "sve") conds.push(eq(leads.status, p.status));
  if (p.source) conds.push(eq(leads.source, p.source));
  if (p.q) conds.push(searchCondition(p.q));
  return conds.length ? and(...conds) : undefined;
}

const listColumns = {
  id: leads.id,
  number: leads.number,
  createdAt: leads.createdAt,
  source: leads.source,
  status: leads.status,
  name: leads.name,
  phone: leads.phone,
  email: leads.email,
  city: leads.city,
  priceLow: leads.priceLow,
  priceHigh: leads.priceHigh,
  hasSnapshot: sql<boolean>`${leads.snapshotPath} is not null`,
};

export interface LeadListRow {
  id: string;
  number: string;
  createdAt: Date;
  source: LeadSource;
  status: LeadStatus;
  name: string;
  phone: string;
  email: string;
  city: string | null;
  priceLow: number | null;
  priceHigh: number | null;
  hasSnapshot: boolean;
}

export interface LeadList {
  rows: LeadListRow[];
  /** rows matching the filters, over all pages */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** per status over ALL leads (filters ignored) — for the status tabs */
  counts: Record<LeadStatus, number> & { aktivni: number; sve: number };
}

export async function listLeads(p: LeadListParams): Promise<LeadList> {
  const db = getDb();
  const where = listWhere(p);
  const [rows, totalRows, countRows] = await db.batch([
    db
      .select(listColumns)
      .from(leads)
      .where(where)
      .orderBy(desc(leads.createdAt), desc(leads.number))
      .limit(LEADS_PAGE_SIZE)
      .offset((p.page - 1) * LEADS_PAGE_SIZE),
    db.select({ n: sql<number>`count(*)::int` }).from(leads).where(where),
    db.select({ status: leads.status, n: sql<number>`count(*)::int` }).from(leads).groupBy(leads.status),
  ]);
  const total = Number(totalRows[0]?.n ?? 0);
  const byStatus = Object.fromEntries(LEAD_STATUSES.map((s) => [s, 0])) as Record<LeadStatus, number>;
  for (const r of countRows) if (isLeadStatus(r.status)) byStatus[r.status] = Number(r.n);
  const sve = Object.values(byStatus).reduce((a, b) => a + b, 0);
  return {
    rows: rows.map((r) => ({ ...r, hasSnapshot: Boolean(r.hasSnapshot) })),
    total,
    page: p.page,
    pageCount: Math.max(1, Math.ceil(total / LEADS_PAGE_SIZE)),
    pageSize: LEADS_PAGE_SIZE,
    counts: { ...byStatus, aktivni: sve - byStatus.arhiva, sve },
  };
}

/* ================================================================== detail */

export interface LeadQuoteRow {
  id: string;
  number: string;
  status: QuoteStatus;
  title: string;
  createdAt: Date;
  sentAt: Date | null;
  /** with PDV, cents */
  totalCents: number;
}

export interface LeadDetail {
  lead: Lead;
  quotes: LeadQuoteRow[];
}

/** the lead and the quotes made from it; null for an unknown or malformed id */
export async function getLeadDetail(id: string): Promise<LeadDetail | null> {
  if (!isUuid(id)) return null;
  const db = getDb();
  const [leadRows, quoteRows] = await db.batch([
    db.select().from(leads).where(eq(leads.id, id)).limit(1),
    db
      .select({
        id: quotes.id,
        number: quotes.number,
        status: quotes.status,
        title: quotes.title,
        createdAt: quotes.createdAt,
        sentAt: quotes.sentAt,
        items: quotes.items,
        discountPct: quotes.discountPct,
        vatPct: quotes.vatPct,
      })
      .from(quotes)
      .where(eq(quotes.leadId, id))
      .orderBy(desc(quotes.createdAt)),
  ]);
  const lead = leadRows[0];
  if (!lead) return null;
  return {
    lead,
    quotes: quoteRows.map(({ items, discountPct, vatPct, ...q }) => ({
      ...q,
      totalCents: safeTotal(items, discountPct, vatPct),
    })),
  };
}

function safeTotal(items: unknown, discountPct: unknown, vatPct: unknown): number {
  try {
    const list = Array.isArray(items) ? (items as QuoteItem[]) : [];
    return quoteTotals(list, Number(discountPct) || 0, Number(vatPct) || 0).totalCents;
  } catch {
    return 0;
  }
}

/* ================================================================== writes */

/** true when the lead exists (and now has `status`) */
export async function updateLeadStatus(id: string, status: LeadStatus): Promise<boolean> {
  if (!isUuid(id) || !isLeadStatus(status)) return false;
  const rows = await getDb().update(leads).set({ status }).where(eq(leads.id, id)).returning({ id: leads.id });
  return rows.length > 0;
}

/** saves the internal notes ("" clears them); returns the save time, or null when the lead is gone */
export async function updateLeadNotes(id: string, notes: string): Promise<Date | null> {
  if (!isUuid(id)) return null;
  const clean = notes.replace(/\r\n?/g, "\n").slice(0, LEAD_NOTES_MAX);
  const rows = await getDb()
    .update(leads)
    .set({ notes: clean.trim() ? clean : null })
    .where(eq(leads.id, id))
    .returning({ updatedAt: leads.updatedAt });
  return rows[0]?.updatedAt ?? null;
}

/**
 * Deletes the lead row (quotes keep existing, their lead_id becomes null) and then its private
 * 3D snapshot. A failed blob delete is logged and reported, but the lead stays deleted.
 */
export async function deleteLead(id: string): Promise<{ number: string; snapshotDeleted: boolean } | null> {
  if (!isUuid(id)) return null;
  const [row] = await getDb()
    .delete(leads)
    .where(eq(leads.id, id))
    .returning({ number: leads.number, snapshotPath: leads.snapshotPath });
  if (!row) return null;

  // the stored path, plus the paths storeLead() would have used (in case the DB update after
  // the upload failed and the path never got recorded)
  const paths = [row.snapshotPath, leadSnapshotPath(id, "image/jpeg"), leadSnapshotPath(id, "image/png")]
    .map((p) => (p ? safeBlobPath(p) : null))
    .filter((p): p is string => Boolean(p));
  let snapshotDeleted = true;
  if (isBlobConfigured() && paths.length) {
    try {
      await del([...new Set(paths)]);
    } catch (err) {
      snapshotDeleted = false;
      console.error(`[admin] ${row.number}: 3D prikaz nije obrisan iz pohrane (${err instanceof Error ? err.name : "unknown"})`);
    }
  } else if (row.snapshotPath) {
    snapshotDeleted = false;
  }
  return { number: row.number, snapshotDeleted };
}

/* ================================================================== dashboard */

export interface DashboardData {
  leads: {
    novi: number;
    thisMonth: number;
    lastMonth: number;
    active: number;
    total: number;
  };
  quotes: {
    /** nacrt + poslana */
    open: number;
    drafts: number;
    sent: number;
  };
  accepted: {
    /** calendar year (Europe/Zagreb) the sums cover */
    year: number;
    count: number;
    totalCents: number;
    netCents: number;
  };
  recent: LeadListRow[];
}

const ZAGREB_NOW = sql`(now() at time zone 'Europe/Zagreb')`;
const monthStart = sql`(date_trunc('month', ${ZAGREB_NOW}) at time zone 'Europe/Zagreb')`;
const prevMonthStart = sql`(date_trunc('month', ${ZAGREB_NOW} - interval '1 month') at time zone 'Europe/Zagreb')`;
const yearStart = sql`(date_trunc('year', ${ZAGREB_NOW}) at time zone 'Europe/Zagreb')`;

export async function getDashboardData(): Promise<DashboardData> {
  const db = getDb();
  const [leadAgg, quoteAgg, acceptedRows, recent] = await db.batch([
    db
      .select({
        novi: sql<number>`count(*) filter (where ${leads.status} = 'novi')::int`,
        thisMonth: sql<number>`count(*) filter (where ${leads.createdAt} >= ${monthStart})::int`,
        lastMonth: sql<number>`count(*) filter (where ${leads.createdAt} >= ${prevMonthStart} and ${leads.createdAt} < ${monthStart})::int`,
        active: sql<number>`count(*) filter (where ${leads.status} <> 'arhiva')::int`,
        total: sql<number>`count(*)::int`,
        year: sql<number>`extract(year from ${ZAGREB_NOW})::int`,
      })
      .from(leads),
    db
      .select({
        open: sql<number>`count(*) filter (where ${quotes.status} in ('nacrt', 'poslana'))::int`,
        drafts: sql<number>`count(*) filter (where ${quotes.status} = 'nacrt')::int`,
        sent: sql<number>`count(*) filter (where ${quotes.status} = 'poslana')::int`,
      })
      .from(quotes),
    db
      .select({ items: quotes.items, discountPct: quotes.discountPct, vatPct: quotes.vatPct })
      .from(quotes)
      .where(and(eq(quotes.status, "prihvacena"), sql`coalesce(${quotes.acceptedAt}, ${quotes.updatedAt}) >= ${yearStart}`)),
    db.select(listColumns).from(leads).orderBy(desc(leads.createdAt), desc(leads.number)).limit(5),
  ]);

  let totalCents = 0;
  let netCents = 0;
  for (const q of acceptedRows) {
    try {
      const t = quoteTotals(Array.isArray(q.items) ? q.items : [], Number(q.discountPct) || 0, Number(q.vatPct) || 0);
      totalCents += t.totalCents;
      netCents += t.netCents;
    } catch {
      /* a malformed quote must not break the dashboard */
    }
  }

  const l = leadAgg[0];
  const qa = quoteAgg[0];
  return {
    leads: {
      novi: Number(l?.novi ?? 0),
      thisMonth: Number(l?.thisMonth ?? 0),
      lastMonth: Number(l?.lastMonth ?? 0),
      active: Number(l?.active ?? 0),
      total: Number(l?.total ?? 0),
    },
    quotes: { open: Number(qa?.open ?? 0), drafts: Number(qa?.drafts ?? 0), sent: Number(qa?.sent ?? 0) },
    accepted: {
      year: Number(l?.year) || new Date().getFullYear(),
      count: acceptedRows.length,
      totalCents,
      netCents,
    },
    recent: recent.map((r) => ({ ...r, hasSnapshot: Boolean(r.hasSnapshot) })),
  };
}

/** e-mail notifications for new leads are on (same rule as lib/lead-server.ts getLeadEmailEnv) */
export function isLeadEmailConfigured(): boolean {
  const to = (process.env.LEAD_EMAIL_TO ?? "").split(/[,;]/).some((s) => s.trim());
  return Boolean(process.env.RESEND_API_KEY?.trim() && process.env.LEAD_EMAIL_FROM?.trim() && to);
}
