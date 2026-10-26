/**
 * Quotes (ponude) — server data layer for the admin pages, the public /ponuda/<token> page and
 * POST /api/ponuda/<token>.
 *
 *   const rows = await listQuotes();                       // newest first, effective status + totals
 *   const res = await createQuote(values, { leadId });     // "P-2026-0001", public token, lead → u_obradi
 *   const res = await updateQuote(id, values, version);    // optimistic: fails when changed meanwhile
 *   await changeQuoteStatus(id, "poslana");                // keeps the linked lead in step
 *   await respondToQuote(token, { decision: "accept", name })   // the customer's answer (public)
 *
 * Rules:
 * - money is integer cents, unit prices are net; totals come from lib/admin/quote-math.ts
 * - "istekla": a sent quote past its valid_until (inclusive, Europe/Zagreb) — swept by expireDueQuotes()
 *   and also derived on read (effectiveQuoteStatus), so an expired quote can never be accepted
 * - accepted / rejected quotes are locked (no edits; duplicate them instead)
 * - the customer's answer moves the linked lead to prihvaceno / odbijeno and appends a line to the
 *   lead's internal notes (who confirmed, reason) — the schema has no column for it on quotes
 * Never log customer data: only dbErrorLabel(err) and quote numbers.
 */
import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import type { PgUpdateSetSource } from "drizzle-orm/pg-core";
import { z } from "zod";
import { getDb, pgErrorCode, type Db } from "@/lib/db";
import { QUOTE_STATUSES, type LeadStatus, type QuoteStatus } from "@/lib/db/enums";
import { newPublicToken, nextQuoteNumber } from "@/lib/db/numbers";
import { leads, quotes, type Quote, type QuoteItem } from "@/lib/db/schema";
import { getSetting, SETTING_KEYS } from "@/lib/admin/settings";
import { quoteTotals } from "@/lib/admin/quote-math";
import { formatDateTime } from "@/lib/admin/format";
import { isValidEmail } from "@/lib/lead-client";
import { site } from "@/lib/site";
import {
  EDITABLE_STATUSES,
  QUOTE_LIMITS,
  addDays,
  effectiveQuoteStatus,
  isIsoDay,
  isPastDay,
  isQuoteLocked,
  isValidOib,
  todayZagreb,
  zagrebDay,
  type CompanyInfo,
  type QuoteDocumentData,
  type QuoteFieldErrors,
  type QuoteFormValues,
  type SaveQuoteResult,
} from "@/components/admin/quotes/model";
import { quoteFromConfig, type QuotePrefill } from "./quote-from-config";

export type { Quote, QuoteItem };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** lib/db/numbers.ts newPublicToken(): 24 random bytes as base64url */
const TOKEN_RE = /^[A-Za-z0-9_-]{32}$/;

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);
export const isQuoteToken = (v: unknown): v is string => typeof v === "string" && TOKEN_RE.test(v);

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const blankToNull = (v: string | null | undefined) => {
  const t = v?.trim();
  return t ? t : null;
};

/* ================================================================== settings */

export const DEFAULT_VAT_PCT = 25;
export const DEFAULT_VALID_DAYS = 30;

export interface QuoteDefaults {
  vatPct: number;
  /** a new quote is valid for this many days */
  validDays: number;
  terms: string | null;
  notes: string | null;
}

/** one level of nesting flattened ({ legal: { oib } } → oib), so either settings shape works */
function flatten(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (isObj(v)) {
      for (const [ik, iv] of Object.entries(v)) {
        if (!(ik in out)) out[ik] = iv;
        out[`${k}.${ik}`] = iv;
      }
    }
  }
  for (const [k, v] of Object.entries(o)) out[k] = v; // top level wins
  return out;
}

function pickString(o: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

function pickNumber(o: Record<string, unknown>, keys: readonly string[]): number | null {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const n = Number(v.trim().replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return null;
}

/**
 * Settings key "quote_defaults" (written by /admin/postavke). Expected shape:
 *   { vatPct: 25, validDays: 30, terms: "…", notes: "…" }
 * (a few aliases are read too: pdv, vat, validityDays, uvjeti, napomena). Missing → 25 % and 30 days.
 */
export async function getQuoteDefaults(): Promise<QuoteDefaults> {
  let raw: unknown = null;
  try {
    raw = await getSetting(SETTING_KEYS.quoteDefaults);
  } catch {
    raw = null; // a settings hiccup must not block writing a quote
  }
  const o = isObj(raw) ? flatten(raw) : {};
  const vat = pickNumber(o, ["vatPct", "vat_pct", "vat", "pdv", "pdvPct", "pdv_pct"]);
  const days = pickNumber(o, ["validDays", "valid_days", "validityDays", "validity_days", "rokValjanosti", "rok_valjanosti"]);
  return {
    vatPct: vat !== null && vat >= 0 && vat <= 100 ? round(vat, 2) : DEFAULT_VAT_PCT,
    validDays: days !== null && days >= 1 && days <= 365 ? Math.round(days) : DEFAULT_VALID_DAYS,
    terms: pickString(o, ["terms", "uvjeti", "defaultTerms", "paymentTerms"]),
    notes: pickString(o, ["notes", "napomena", "note", "defaultNotes"]),
  };
}

/**
 * Company block for the quote: settings key "company" (written by /admin/postavke) when present,
 * otherwise only the facts in lib/site.ts — nothing invented. Expected shape (flat or nested one level):
 *   { name, brand?, address, zip?, city?, oib, iban, bank, phone, email, web, legalLine?, signatory? }
 */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  let raw: unknown = null;
  try {
    raw = await getSetting(SETTING_KEYS.company);
  } catch {
    raw = null;
  }
  const o = isObj(raw) ? flatten(raw) : {};
  const s = (keys: readonly string[]) => pickString(o, keys);

  // the registered seat (legal.seat in /admin/postavke) is the address for documents; else the contact address + city
  let address = s(["seat", "legal.seat", "sjediste", "registeredAddress"]);
  if (!address) {
    address = s(["address", "contact.address", "adresa", "street", "ulica", "streetAddress"]);
    const zip = s(["zip", "postalCode", "postal_code", "postanskiBroj", "postanski_broj"]);
    const city = s(["city", "contact.city", "grad", "mjesto", "place"]);
    if (address && (zip || city) && !address.includes(city ?? "\u0000")) address = `${address}\n${[zip, city].filter(Boolean).join(" ")}`;
    if (!address && (zip || city)) address = [zip, city].filter(Boolean).join(" ");
  }
  address ??= site.legal.seat ?? site.contact.address ?? null;

  const siteHost = (() => {
    if (!process.env.NEXT_PUBLIC_SITE_URL?.trim()) return null; // the Vercel fallback address is not for paper
    try {
      return new URL(site.url).host;
    } catch {
      return null;
    }
  })();

  const legalParts = [
    s(["legalLine", "legal_line", "registry", "register", "mbs", "sud"]) ?? site.legal.registry,
    s(["shareCapital", "share_capital", "temeljniKapital"]) ?? site.legal.shareCapital,
  ].filter((v): v is string => Boolean(v));

  return {
    brand: s(["brand", "tradeName", "trade_name"]) ?? site.name,
    name: s(["legalName", "legal_name", "companyName", "company_name", "name", "naziv", "nazivTvrtke"]) ?? site.legal.companyName ?? site.name,
    address,
    oib: s(["oib", "OIB", "vatId", "vat_id"]) ?? site.legal.oib,
    iban: s(["iban", "IBAN"]),
    bank: s(["bank", "banka", "bankName", "bank_name"]) ?? site.legal.bank,
    phone: s(["phone", "telefon", "tel", "mobile", "mobitel"]) ?? site.contact.phone,
    email: s(["email", "e-mail", "mail"]) ?? site.contact.email,
    web: s(["web", "website", "url", "webStranica"]) ?? siteHost,
    legalLine: legalParts.length ? legalParts.join(" · ") : null,
    signatory: s(["signatory", "management", "director", "direktor", "owner", "vlasnik", "odgovornaOsoba"]) ?? site.legal.management ?? site.legal.owner,
  };
}

/* ================================================================== input */

const itemSchema = z.object({
  id: z.string().trim().min(1).max(64),
  description: z.string().trim().max(QUOTE_LIMITS.description),
  details: z.string().trim().max(QUOTE_LIMITS.details).nullish(),
  qty: z.number().min(0).max(QUOTE_LIMITS.qtyMax),
  unit: z.string().trim().max(QUOTE_LIMITS.unit),
  unit_price_cents: z.number().int().min(0).max(QUOTE_LIMITS.unitPriceMaxCents),
  discount_pct: z.number().min(0).max(100),
});

const inputSchema = z.object({
  customerName: z.string().trim().max(QUOTE_LIMITS.customerName),
  customerEmail: z.string().trim().max(QUOTE_LIMITS.email),
  customerPhone: z.string().trim().max(QUOTE_LIMITS.phone),
  customerAddress: z.string().trim().max(QUOTE_LIMITS.address),
  customerOib: z.string().trim().max(20),
  title: z.string().trim().max(QUOTE_LIMITS.title),
  items: z.array(itemSchema).max(QUOTE_LIMITS.items),
  discountPct: z.number().min(0).max(100),
  vatPct: z.number().min(0).max(100),
  validUntil: z.string().trim().max(10),
  notes: z.string().trim().max(QUOTE_LIMITS.notes),
  terms: z.string().trim().max(QUOTE_LIMITS.terms),
});

const FIELD_LABEL: Record<string, string> = {
  customerName: "Ime kupca je predugo.",
  customerEmail: "E-mail je predug.",
  customerPhone: "Telefon je predug.",
  customerAddress: "Adresa je preduga.",
  title: "Naslov je predug.",
  notes: "Napomena je preduga.",
  terms: "Uvjeti su predugi.",
  discountPct: "Popust mora biti između 0 i 100 %.",
  vatPct: "PDV mora biti između 0 i 100 %.",
  validUntil: "Datum nije ispravan.",
};

const ITEM_LABEL: Record<string, string> = {
  description: "Opis je predug.",
  details: "Dodatni opis je predug.",
  qty: `Količina mora biti između 0 i ${QUOTE_LIMITS.qtyMax.toLocaleString("hr-HR")}.`,
  unit: "Jedinica je preduga.",
  unit_price_cents: "Cijena nije ispravna.",
  discount_pct: "Popust mora biti između 0 i 100 %.",
};

export interface CleanQuoteInput {
  customerName: string;
  customerEmail: string | null;
  customerPhone: string | null;
  customerAddress: string | null;
  customerOib: string | null;
  title: string;
  items: QuoteItem[];
  discountPct: number;
  vatPct: number;
  validUntil: string | null;
  notes: string | null;
  terms: string | null;
}

/** validates the editor payload; field errors use the keys of QuoteFieldErrors */
export function parseQuoteInput(raw: unknown): { ok: true; value: CleanQuoteInput } | { ok: false; fieldErrors: QuoteFieldErrors } {
  const parsed = inputSchema.safeParse(raw);
  const errors: QuoteFieldErrors = {};
  if (!parsed.success) {
    const items = isObj(raw) && Array.isArray(raw.items) ? raw.items : [];
    for (const issue of parsed.error.issues) {
      const [top, index, field] = issue.path;
      if (top === "items" && typeof index === "number" && typeof field === "string") {
        const id = isObj(items[index]) && typeof items[index].id === "string" ? (items[index].id as string) : String(index);
        errors[`item:${id}:${field}`] ??= ITEM_LABEL[field] ?? "Vrijednost nije ispravna.";
      } else if (top === "items") {
        errors.items ??= `Ponuda može imati najviše ${QUOTE_LIMITS.items} stavki.`;
      } else if (typeof top === "string") {
        errors[top] ??= FIELD_LABEL[top] ?? "Vrijednost nije ispravna.";
      } else {
        errors.form ??= "Podaci ponude nisu ispravni.";
      }
    }
    return { ok: false, fieldErrors: errors };
  }

  const v = parsed.data;
  if (!v.customerName) errors.customerName = "Upišite ime i prezime ili naziv kupca.";
  if (v.customerEmail && !isValidEmail(v.customerEmail)) errors.customerEmail = "E-mail adresa nije ispravna.";
  if (v.customerOib && !isValidOib(v.customerOib)) errors.customerOib = "OIB nije ispravan (11 znamenki s ispravnim kontrolnim brojem).";
  if (v.validUntil && !isIsoDay(v.validUntil)) errors.validUntil = "Datum nije ispravan.";

  const seen = new Set<string>();
  const items: QuoteItem[] = [];
  for (const it of v.items) {
    const details = it.details?.trim() ?? "";
    // a completely empty row is just dropped
    if (!it.description && !details && it.unit_price_cents === 0) continue;
    if (!it.description) errors[`item:${it.id}:description`] = "Upišite opis stavke.";
    const id = seen.has(it.id) ? globalThis.crypto.randomUUID() : it.id;
    seen.add(id);
    items.push({
      id,
      description: it.description,
      ...(details ? { details } : {}),
      qty: round(it.qty, 3),
      unit: it.unit,
      unit_price_cents: it.unit_price_cents,
      discount_pct: round(it.discount_pct, 2),
    });
  }

  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };
  return {
    ok: true,
    value: {
      customerName: v.customerName,
      customerEmail: blankToNull(v.customerEmail),
      customerPhone: blankToNull(v.customerPhone),
      customerAddress: blankToNull(v.customerAddress),
      customerOib: blankToNull(v.customerOib),
      title: v.title,
      items,
      discountPct: round(v.discountPct, 2),
      vatPct: round(v.vatPct, 2),
      validUntil: v.validUntil || null,
      notes: blankToNull(v.notes),
      terms: blankToNull(v.terms),
    },
  };
}

/* ================================================================== reads */

/** stored status "poslana" past its date → "istekla" (persisted; updated_at is left alone on purpose) */
export async function expireDueQuotes(db: Db = getDb()): Promise<void> {
  await db
    .update(quotes)
    .set({ status: "istekla", updatedAt: sql`${quotes.updatedAt}` })
    .where(and(eq(quotes.status, "poslana"), sql`${quotes.validUntil} < ${todayZagreb()}::date`));
}

export interface QuoteListRow {
  id: string;
  number: string;
  /** effective status */
  status: QuoteStatus;
  customerName: string;
  customerEmail: string | null;
  title: string;
  totalCents: number;
  itemCount: number;
  validUntil: string | null;
  createdAt: string;
  sentAt: string | null;
  viewedAt: string | null;
  leadId: string | null;
  leadNumber: string | null;
}

const LIST_LIMIT = 1000;

function toListRow(
  r: Pick<Quote, "id" | "number" | "status" | "customerName" | "customerEmail" | "title" | "items" | "discountPct" | "vatPct" | "validUntil" | "createdAt" | "sentAt" | "viewedAt" | "leadId">,
  leadNumber: string | null,
  today: string,
): QuoteListRow {
  const items = Array.isArray(r.items) ? r.items : [];
  return {
    id: r.id,
    number: r.number,
    status: effectiveQuoteStatus(r.status, r.validUntil, today),
    customerName: r.customerName,
    customerEmail: r.customerEmail,
    title: r.title,
    totalCents: quoteTotals(items, r.discountPct, r.vatPct).totalCents,
    itemCount: items.length,
    validUntil: r.validUntil,
    createdAt: r.createdAt.toISOString(),
    sentAt: r.sentAt?.toISOString() ?? null,
    viewedAt: r.viewedAt?.toISOString() ?? null,
    leadId: r.leadId,
    leadNumber,
  };
}

const listColumns = {
  id: quotes.id,
  number: quotes.number,
  status: quotes.status,
  customerName: quotes.customerName,
  customerEmail: quotes.customerEmail,
  title: quotes.title,
  items: quotes.items,
  discountPct: quotes.discountPct,
  vatPct: quotes.vatPct,
  validUntil: quotes.validUntil,
  createdAt: quotes.createdAt,
  sentAt: quotes.sentAt,
  viewedAt: quotes.viewedAt,
  leadId: quotes.leadId,
  leadNumber: leads.number,
};

/** every quote (newest first, up to 1000) with effective status and total — the list page filters in memory */
export async function listQuotes(): Promise<{ rows: QuoteListRow[]; truncated: boolean }> {
  const db = getDb();
  await expireDueQuotes(db);
  const today = todayZagreb();
  const rows = await db
    .select(listColumns)
    .from(quotes)
    .leftJoin(leads, eq(leads.id, quotes.leadId))
    .orderBy(desc(quotes.createdAt))
    .limit(LIST_LIMIT + 1);
  return {
    rows: rows.slice(0, LIST_LIMIT).map((r) => toListRow(r, r.leadNumber ?? null, today)),
    truncated: rows.length > LIST_LIMIT,
  };
}

/** quotes made for one inquiry (for the lead detail page), newest first */
export async function quotesForLead(leadId: string): Promise<QuoteListRow[]> {
  if (!isUuid(leadId)) return [];
  const db = getDb();
  const today = todayZagreb();
  const rows = await db
    .select(listColumns)
    .from(quotes)
    .leftJoin(leads, eq(leads.id, quotes.leadId))
    .where(eq(quotes.leadId, leadId))
    .orderBy(desc(quotes.createdAt))
    .limit(100);
  return rows.map((r) => toListRow(r, r.leadNumber ?? null, today));
}

export interface QuoteLeadInfo {
  id: string;
  number: string;
  name: string;
  status: LeadStatus;
  source: string;
  snapshotPath: string | null;
  /** the studio kitchen (leads.config) — for "Preuzmi PDF kuhinje" on the quote (getQuoteDetail fills it) */
  config?: Record<string, unknown> | null;
  configUrl?: string | null;
}

export interface QuoteDetail {
  quote: Quote;
  /** effective status */
  status: QuoteStatus;
  lead: QuoteLeadInfo | null;
  /** updated_at ISO — the optimistic-concurrency token for updateQuote */
  version: string;
}

export async function getQuoteDetail(id: string): Promise<QuoteDetail | null> {
  if (!isUuid(id)) return null;
  const db = getDb();
  await expireDueQuotes(db);
  const [row] = await db
    .select({
      quote: quotes,
      lead: {
        id: leads.id,
        number: leads.number,
        name: leads.name,
        status: leads.status,
        source: leads.source,
        snapshotPath: leads.snapshotPath,
        config: leads.config,
        configUrl: leads.configUrl,
      },
    })
    .from(quotes)
    .leftJoin(leads, eq(leads.id, quotes.leadId))
    .where(eq(quotes.id, id))
    .limit(1);
  if (!row) return null;
  return {
    quote: row.quote,
    status: effectiveQuoteStatus(row.quote.status, row.quote.validUntil),
    lead: row.lead?.id ? (row.lead as QuoteLeadInfo) : null,
    version: row.quote.updatedAt.toISOString(),
  };
}

/** the document data (customer-safe) for print, the public page and e-mails */
export function toDocumentData(q: Quote, status: QuoteStatus, company: CompanyInfo, imageUrl: string | null = null): QuoteDocumentData {
  return {
    number: q.number,
    title: q.title,
    status,
    issuedOn: zagrebDay(q.sentAt ?? q.createdAt) ?? todayZagreb(),
    validUntil: q.validUntil,
    customer: {
      name: q.customerName,
      address: q.customerAddress,
      oib: q.customerOib,
      email: q.customerEmail,
      phone: q.customerPhone,
    },
    items: Array.isArray(q.items) ? q.items : [],
    discountPct: q.discountPct,
    vatPct: q.vatPct,
    notes: q.notes,
    terms: q.terms,
    company,
    imageUrl,
    acceptedAt: q.acceptedAt?.toISOString() ?? null,
    rejectedAt: q.rejectedAt?.toISOString() ?? null,
  };
}

/** form values for the editor from a stored quote */
export function toFormValues(q: Quote): QuoteFormValues {
  return {
    customerName: q.customerName,
    customerEmail: q.customerEmail ?? "",
    customerPhone: q.customerPhone ?? "",
    customerAddress: q.customerAddress ?? "",
    customerOib: q.customerOib ?? "",
    title: q.title,
    items: Array.isArray(q.items) ? q.items : [],
    discountPct: q.discountPct,
    vatPct: q.vatPct,
    validUntil: q.validUntil ?? "",
    notes: q.notes ?? "",
    terms: q.terms ?? "",
  };
}

export interface NewQuoteDraft {
  values: QuoteFormValues;
  lead: (QuoteLeadInfo & { email: string; phone: string; city: string | null }) | null;
  /** the ?upit= id did not match an inquiry */
  leadMissing: boolean;
  prefill: Pick<QuotePrefill, "mode" | "warnings" | "studioGrossEur"> | null;
}

/** initial editor values for /admin/ponude/nova[?upit=<leadId>] (nothing is stored yet) */
export async function buildNewQuoteDraft(leadId: string | null): Promise<NewQuoteDraft> {
  const defaults = await getQuoteDefaults();
  const today = todayZagreb();
  const base: QuoteFormValues = {
    customerName: "",
    customerEmail: "",
    customerPhone: "",
    customerAddress: "",
    customerOib: "",
    title: "",
    items: [],
    discountPct: 0,
    vatPct: defaults.vatPct,
    validUntil: addDays(today, defaults.validDays),
    notes: defaults.notes ?? "",
    terms: defaults.terms ?? "",
  };
  if (!leadId) return { values: base, lead: null, leadMissing: false, prefill: null };
  if (!isUuid(leadId)) return { values: base, lead: null, leadMissing: true, prefill: null };

  const [lead] = await getDb()
    .select({
      id: leads.id,
      number: leads.number,
      name: leads.name,
      email: leads.email,
      phone: leads.phone,
      city: leads.city,
      status: leads.status,
      source: leads.source,
      interest: leads.interest,
      config: leads.config,
      summary: leads.summary,
      priceLow: leads.priceLow,
      priceHigh: leads.priceHigh,
      snapshotPath: leads.snapshotPath,
    })
    .from(leads)
    .where(eq(leads.id, leadId))
    .limit(1);
  if (!lead) return { values: base, lead: null, leadMissing: true, prefill: null };

  const values: QuoteFormValues = {
    ...base,
    customerName: lead.name,
    customerEmail: lead.email,
    customerPhone: lead.phone,
    customerAddress: lead.city ?? "",
  };

  let prefill: NewQuoteDraft["prefill"] = null;
  if (lead.source === "studio") {
    const pre = quoteFromConfig(lead.config, {
      vatPct: defaults.vatPct,
      fallbackPrice: { low: lead.priceLow, high: lead.priceHigh },
      summary: lead.summary,
    });
    values.items = pre.items;
    values.title = pre.title;
    // the owner's own default note first, then the kitchen-specific one
    values.notes = [defaults.notes, pre.notes].filter(Boolean).join("\n\n");
    prefill = { mode: pre.mode, warnings: pre.warnings, studioGrossEur: pre.studioGrossEur };
  } else {
    values.title = lead.interest ? `${lead.interest} po mjeri` : "";
  }

  return {
    values,
    lead: {
      id: lead.id,
      number: lead.number,
      name: lead.name,
      status: lead.status,
      source: lead.source,
      snapshotPath: lead.snapshotPath,
      email: lead.email,
      phone: lead.phone,
      city: lead.city,
    },
    leadMissing: false,
    prefill,
  };
}

/* ================================================================== writes */

function columnsFrom(v: CleanQuoteInput) {
  return {
    customerName: v.customerName,
    customerEmail: v.customerEmail,
    customerPhone: v.customerPhone,
    customerAddress: v.customerAddress,
    customerOib: v.customerOib,
    title: v.title,
    items: v.items,
    discountPct: v.discountPct,
    vatPct: v.vatPct,
    validUntil: v.validUntil,
    notes: v.notes,
    terms: v.terms,
  };
}

async function insertQuote(
  db: Db,
  values: Omit<typeof quotes.$inferInsert, "number" | "publicToken">,
  opts: { advanceLead?: boolean } = {},
): Promise<{ id: string; number: string; version: string }> {
  for (let attempt = 0; ; attempt++) {
    const number = await nextQuoteNumber({ db });
    const insert = db
      .insert(quotes)
      .values({ ...values, number, publicToken: newPublicToken() })
      .returning({ id: quotes.id, number: quotes.number, updatedAt: quotes.updatedAt });
    try {
      let rows: Array<{ id: string; number: string; updatedAt: Date }>;
      if (opts.advanceLead && values.leadId) {
        // a new quote for a fresh inquiry means the owner is working on it
        const [inserted] = await db.batch([
          insert,
          db
            .update(leads)
            .set({ status: "u_obradi" })
            .where(and(eq(leads.id, values.leadId), eq(leads.status, "novi"))),
        ]);
        rows = inserted;
      } else {
        rows = await insert;
      }
      const row = rows[0];
      if (!row) throw new Error("quote insert returned no row");
      return { id: row.id, number: row.number, version: row.updatedAt.toISOString() };
    } catch (err) {
      // 23505: number or token collided (both practically impossible) → take the next number
      if (pgErrorCode(err) !== "23505" || attempt >= 2) throw err;
    }
  }
}

/** stores a new draft ("nacrt"); a missing / unknown lead id simply leaves the quote unlinked */
export async function createQuote(v: CleanQuoteInput, opts: { leadId?: string | null } = {}): Promise<SaveQuoteResult> {
  const db = getDb();
  let leadId: string | null = null;
  if (opts.leadId && isUuid(opts.leadId)) {
    const [lead] = await db.select({ id: leads.id }).from(leads).where(eq(leads.id, opts.leadId)).limit(1);
    leadId = lead?.id ?? null;
  }
  const row = await insertQuote(db, { ...columnsFrom(v), leadId, status: "nacrt" }, { advanceLead: true });
  return { ok: true, id: row.id, number: row.number, version: row.version };
}

/** same instant (to the millisecond) as the version the editor loaded */
const sameVersion = (version: string) =>
  sql`abs(extract(epoch from (${quotes.updatedAt} - ${version}::timestamptz))) < 0.001`;

export async function updateQuote(id: string, v: CleanQuoteInput, version: string | null): Promise<SaveQuoteResult> {
  if (!isUuid(id)) return { ok: false, error: "Ponuda nije pronađena." };
  const versionOk = version && !Number.isNaN(Date.parse(version));
  const db = getDb();
  const rows = await db
    .update(quotes)
    .set(columnsFrom(v))
    .where(
      and(
        eq(quotes.id, id),
        inArray(quotes.status, [...EDITABLE_STATUSES]),
        ...(versionOk ? [sameVersion(version as string)] : []),
      ),
    )
    .returning({ id: quotes.id, number: quotes.number, updatedAt: quotes.updatedAt });
  const row = rows[0];
  if (row) return { ok: true, id: row.id, number: row.number, version: row.updatedAt.toISOString() };

  const [current] = await db.select({ status: quotes.status }).from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!current) return { ok: false, error: "Ponuda više ne postoji." };
  if (isQuoteLocked(current.status)) {
    return {
      ok: false,
      conflict: true,
      error: `Ponuda je u međuvremenu ${current.status === "prihvacena" ? "prihvaćena" : "odbijena"} i više se ne može mijenjati. Za izmjene je duplicirajte.`,
    };
  }
  return {
    ok: false,
    conflict: true,
    error: "Ponuda je u međuvremenu promijenjena (možda u drugoj kartici). Osvježite stranicu — vaše izmjene nisu spremljene.",
  };
}

const STATUS_DONE: Record<QuoteStatus, string> = {
  nacrt: "Ponuda je vraćena u nacrt.",
  poslana: "Ponuda je označena kao poslana.",
  prihvacena: "Ponuda je označena kao prihvaćena.",
  odbijena: "Ponuda je označena kao odbijena.",
  istekla: "Ponuda je označena kao istekla.",
};

/** lead status that follows a quote status (null = leave the lead alone) */
const LEAD_FOLLOWS: Partial<Record<QuoteStatus, { to: LeadStatus; from?: LeadStatus[] }>> = {
  poslana: { to: "ponuda_poslana", from: ["novi", "u_obradi"] },
  prihvacena: { to: "prihvaceno" },
  odbijena: { to: "odbijeno" },
};

export type StatusChangeResult = { ok: true; message: string; leadId: string | null } | { ok: false; error: string };

/**
 * Owner-driven status change. → poslana needs at least one line and a validity date that has not
 * passed; it stamps sent_at once. → prihvacena / odbijena stamps the answer time. The linked lead
 * follows (ponuda_poslana / prihvaceno / odbijeno) in the same transaction.
 */
export async function changeQuoteStatus(id: string, next: QuoteStatus): Promise<StatusChangeResult> {
  if (!isUuid(id) || !(QUOTE_STATUSES as readonly string[]).includes(next)) return { ok: false, error: "Nepoznata ponuda ili status." };
  const db = getDb();
  await expireDueQuotes(db);
  const [q] = await db
    .select({ status: quotes.status, items: quotes.items, validUntil: quotes.validUntil, leadId: quotes.leadId, customerName: quotes.customerName })
    .from(quotes)
    .where(eq(quotes.id, id))
    .limit(1);
  if (!q) return { ok: false, error: "Ponuda nije pronađena." };
  if (q.status === next) return { ok: true, message: STATUS_DONE[next], leadId: q.leadId };

  const today = todayZagreb();
  if (next === "poslana") {
    if (!Array.isArray(q.items) || q.items.length === 0) return { ok: false, error: "Ponuda nema nijednu stavku — dodajte stavke i spremite je." };
    if (!q.customerName.trim()) return { ok: false, error: "Upišite ime kupca i spremite ponudu." };
    if (isPastDay(q.validUntil, today)) return { ok: false, error: "Rok valjanosti je prošao. Produljite ga, spremite ponudu pa je označite kao poslanu." };
  }

  const set: PgUpdateSetSource<typeof quotes> = { status: next };
  if (next === "poslana") {
    set.sentAt = sql`coalesce(${quotes.sentAt}, now())`;
    set.acceptedAt = null;
    set.rejectedAt = null;
  } else if (next === "prihvacena") {
    set.acceptedAt = sql`now()`;
    set.rejectedAt = null;
  } else if (next === "odbijena") {
    set.rejectedAt = sql`now()`;
    set.acceptedAt = null;
  } else {
    set.acceptedAt = null;
    set.rejectedAt = null;
  }

  // only if nobody (e.g. the customer) changed the status since we read it
  const update = db
    .update(quotes)
    .set(set)
    .where(and(eq(quotes.id, id), eq(quotes.status, q.status)))
    .returning({ id: quotes.id });

  const follow = LEAD_FOLLOWS[next];
  let updated: Array<{ id: string }>;
  if (follow && q.leadId) {
    const leadUpdate = db
      .update(leads)
      .set({ status: follow.to })
      .where(
        and(
          eq(leads.id, q.leadId),
          // in the same transaction: only when the quote update above went through
          sql`exists (select 1 from ${quotes} where ${quotes.id} = ${id} and ${quotes.status} = ${next})`,
          ...(follow.from ? [inArray(leads.status, follow.from)] : []),
        ),
      );
    const [res] = await db.batch([update, leadUpdate]);
    updated = res;
  } else {
    updated = await update;
  }
  if (updated.length === 0) return { ok: false, error: "Status ponude se u međuvremenu promijenio. Osvježite stranicu." };
  return { ok: true, message: STATUS_DONE[next], leadId: q.leadId };
}

/** a new draft with the same customer and lines (fresh line ids, new number, validity from today) */
export async function duplicateQuote(id: string): Promise<{ id: string; number: string } | null> {
  if (!isUuid(id)) return null;
  const db = getDb();
  const [q] = await db.select().from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!q) return null;
  const defaults = await getQuoteDefaults();
  const items = (Array.isArray(q.items) ? q.items : []).map((it) => ({ ...it, id: globalThis.crypto.randomUUID() }));
  const row = await insertQuote(db, {
    leadId: q.leadId,
    status: "nacrt",
    customerName: q.customerName,
    customerEmail: q.customerEmail,
    customerPhone: q.customerPhone,
    customerAddress: q.customerAddress,
    customerOib: q.customerOib,
    title: q.title,
    items,
    discountPct: q.discountPct,
    vatPct: q.vatPct,
    validUntil: addDays(todayZagreb(), defaults.validDays),
    notes: q.notes,
    terms: q.terms,
  });
  return { id: row.id, number: row.number };
}

/** only drafts can be deleted (a sent quote is something the customer may have seen) */
export async function deleteDraftQuote(id: string): Promise<{ ok: true; number: string } | { ok: false; error: string }> {
  if (!isUuid(id)) return { ok: false, error: "Ponuda nije pronađena." };
  const rows = await getDb()
    .delete(quotes)
    .where(and(eq(quotes.id, id), eq(quotes.status, "nacrt")))
    .returning({ number: quotes.number });
  if (rows[0]) return { ok: true, number: rows[0].number };
  return { ok: false, error: "Obrisati se mogu samo nacrti. Poslanu ponudu vratite u nacrt ili je označite kao odbijenu." };
}

/** stamps sent_at / status after the quote e-mail went out (lead → ponuda_poslana) */
export async function markQuoteSent(id: string): Promise<void> {
  const db = getDb();
  const [q] = await db.select({ status: quotes.status, leadId: quotes.leadId }).from(quotes).where(eq(quotes.id, id)).limit(1);
  if (!q) return;
  const update = db
    .update(quotes)
    .set({ status: "poslana", sentAt: sql`now()`, acceptedAt: null, rejectedAt: null })
    .where(and(eq(quotes.id, id), inArray(quotes.status, [...EDITABLE_STATUSES])));
  if (q.leadId) {
    await db.batch([
      update,
      db
        .update(leads)
        .set({ status: "ponuda_poslana" })
        .where(and(eq(leads.id, q.leadId), inArray(leads.status, ["novi", "u_obradi"]))),
    ]);
  } else {
    await update;
  }
}

/* ================================================================== public (customer) */

export interface PublicQuote {
  quote: Quote;
  status: QuoteStatus;
  leadSnapshotPath: string | null;
}

/** the quote behind a public token (any status — the page decides what a draft shows) */
export async function getQuoteByToken(token: string): Promise<PublicQuote | null> {
  if (!isQuoteToken(token)) return null;
  const db = getDb();
  await expireDueQuotes(db);
  const [row] = await db
    .select({ quote: quotes, snapshotPath: leads.snapshotPath })
    .from(quotes)
    .leftJoin(leads, eq(leads.id, quotes.leadId))
    .where(eq(quotes.publicToken, token))
    .limit(1);
  if (!row) return null;
  return {
    quote: row.quote,
    status: effectiveQuoteStatus(row.quote.status, row.quote.validUntil),
    leadSnapshotPath: row.snapshotPath ?? null,
  };
}

/**
 * Private blob path of the 3D view shown on the public quote (the linked inquiry's snapshot).
 * Drafts only for an admin preview. Read-only — no expiry sweep, it runs on every image request.
 */
export async function quoteSnapshotForToken(token: string, opts: { allowDraft: boolean }): Promise<string | null> {
  if (!isQuoteToken(token)) return null;
  const [row] = await getDb()
    .select({ status: quotes.status, snapshotPath: leads.snapshotPath })
    .from(quotes)
    .innerJoin(leads, eq(leads.id, quotes.leadId))
    .where(eq(quotes.publicToken, token))
    .limit(1);
  if (!row?.snapshotPath) return null;
  if (row.status === "nacrt" && !opts.allowDraft) return null;
  return row.snapshotPath;
}

/** first time the customer opened the link (drafts never count); updated_at is left alone */
export async function markQuoteViewed(token: string): Promise<void> {
  if (!isQuoteToken(token)) return;
  await getDb()
    .update(quotes)
    .set({ viewedAt: sql`now()`, updatedAt: sql`${quotes.updatedAt}` })
    .where(and(eq(quotes.publicToken, token), sql`${quotes.viewedAt} is null`, sql`${quotes.status} <> 'nacrt'`));
}

const oneLine = (s: string, max: number) =>
  s
    .replace(/[\u0000-\u001f\u007f]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim()
    .slice(0, max);

export type RespondResult =
  | {
      ok: true;
      status: "prihvacena" | "odbijena";
      number: string;
      quoteId: string;
      customerName: string;
      totalCents: number;
      leadNumber: string | null;
    }
  | { ok: false; reason: "not_found" | "not_sent" | "expired" | "already"; status?: QuoteStatus };

/**
 * The customer's answer from /ponuda/<token>. One statement (atomic): only a sent, still valid
 * quote changes; the linked lead follows and gets a line in its internal notes.
 */
export async function respondToQuote(
  token: string,
  answer: { decision: "accept" | "reject"; name: string; reason?: string | null },
  now: Date = new Date(),
): Promise<RespondResult> {
  if (!isQuoteToken(token)) return { ok: false, reason: "not_found" };
  const accept = answer.decision === "accept";
  const status: QuoteStatus = accept ? "prihvacena" : "odbijena";
  const leadStatus: LeadStatus = accept ? "prihvaceno" : "odbijeno";
  const today = todayZagreb(now);
  const name = oneLine(answer.name, 120);
  const reason = answer.reason ? oneLine(answer.reason, 1000) : "";

  const db = getDb();
  const result = await db.execute<{
    id: string;
    number: string;
    customer_name: string;
    items: unknown;
    discount_pct: string | number;
    vat_pct: string | number;
    lead_number: string | null;
  }>(sql`
    with q as (
      update ${quotes}
      set status = ${status},
          accepted_at = ${accept ? sql`now()` : sql`null`},
          rejected_at = ${accept ? sql`null` : sql`now()`},
          viewed_at = coalesce(viewed_at, now()),
          updated_at = now()
      where public_token = ${token}
        and status = 'poslana'
        and (valid_until is null or valid_until >= ${today}::date)
      returning id, number, lead_id, customer_name, items, discount_pct, vat_pct
    ),
    l as (
      update ${leads}
      set status = ${leadStatus},
          updated_at = now(),
          notes = concat_ws(E'\n\n', nullif(btrim(${leads.notes}), ''),
            '[' || ${formatDateTime(now)}::text || '] Ponuda ' || q.number || ' ' ||
            ${accept ? "prihvaćena putem poveznice — potvrdio/la: " : "odbijena putem poveznice — "}::text || ${name}::text ||
            ${reason ? `. Razlog: ${reason}` : ""}::text)
      from q
      where ${leads.id} = q.lead_id
      returning ${leads.number} as lead_number
    )
    select q.id, q.number, q.customer_name, q.items, q.discount_pct, q.vat_pct, (select lead_number from l limit 1) as lead_number
    from q
  `);

  const row = result.rows[0];
  if (row) {
    const items = Array.isArray(row.items) ? (row.items as QuoteItem[]) : [];
    return {
      ok: true,
      status: accept ? "prihvacena" : "odbijena",
      number: row.number,
      quoteId: row.id,
      customerName: row.customer_name,
      totalCents: quoteTotals(items, Number(row.discount_pct), Number(row.vat_pct)).totalCents,
      leadNumber: row.lead_number ?? null,
    };
  }

  const [current] = await db
    .select({ status: quotes.status, validUntil: quotes.validUntil })
    .from(quotes)
    .where(eq(quotes.publicToken, token))
    .limit(1);
  if (!current) return { ok: false, reason: "not_found" };
  const eff = effectiveQuoteStatus(current.status, current.validUntil, today);
  if (eff === "prihvacena" || eff === "odbijena") return { ok: false, reason: "already", status: eff };
  if (eff === "istekla") return { ok: false, reason: "expired", status: eff };
  return { ok: false, reason: "not_sent", status: eff };
}

/* ================================================================== links */

/** the customer's link; `origin` defaults to the canonical site.url */
export function publicQuoteUrl(token: string, origin: string = site.url): string {
  return `${origin.replace(/\/+$/, "")}/ponuda/${token}`;
}

/** absolute admin link to a quote (owner e-mails) */
export function adminQuoteUrl(id: string): string {
  return `${site.url.replace(/\/+$/, "")}/admin/ponude/${id}`;
}
