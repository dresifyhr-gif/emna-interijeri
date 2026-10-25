/**
 * Client-safe model for quotes (ponude): limits, dates, status rules, OIB check and the shape the
 * document renders. Shared by the editor (client), QuoteDocument (server and client) and
 * lib/admin/quotes.ts (server). No DB / Node imports here.
 *
 * Money is always integer euro cents; unit prices are NET (bez PDV-a) — see lib/admin/quote-math.ts.
 */
import type { QuoteStatus } from "@/lib/db/enums";
import type { QuoteItem } from "@/lib/db/schema";

export type { QuoteItem, QuoteStatus };

/** hard limits, enforced by the server (lib/admin/quotes.ts) and mirrored by the editor */
export const QUOTE_LIMITS = {
  items: 200,
  description: 300,
  details: 2000,
  unit: 20,
  customerName: 200,
  email: 200,
  phone: 40,
  address: 500,
  title: 200,
  notes: 5000,
  terms: 10000,
  /** largest quantity on one line */
  qtyMax: 100_000,
  /** 1.000.000,00 € per unit */
  unitPriceMaxCents: 100_000_000,
} as const;

/** suggestions for the unit field (free text is allowed) */
export const UNIT_SUGGESTIONS = ["kom", "m", "m²", "kompl.", "paušal", "sat"] as const;

/** a customer can still answer, and the owner can still edit, a quote in these statuses */
export const EDITABLE_STATUSES: readonly QuoteStatus[] = ["nacrt", "poslana", "istekla"];

/** accepted / rejected quotes are a record of what the customer answered: never edited again */
export const isQuoteLocked = (status: string): boolean => status === "prihvacena" || status === "odbijena";

/* ================================================================== dates (Europe/Zagreb) */

const dayFmt = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zagreb", year: "numeric", month: "2-digit", day: "2-digit" });

/** today's calendar date in Croatia, "YYYY-MM-DD" */
export function todayZagreb(now: Date = new Date()): string {
  return dayFmt.format(now);
}

/** calendar date of an instant in Croatia, "YYYY-MM-DD" */
export function zagrebDay(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  const d = at instanceof Date ? at : new Date(at);
  return Number.isNaN(d.getTime()) ? null : dayFmt.format(d);
}

export const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** true for a real calendar day "YYYY-MM-DD" (no 2026-02-30) */
export function isIsoDay(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DAY_RE.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** "2026-10-24" + 30 → "2026-11-23" (pure calendar arithmetic, no time zones involved) */
export function addDays(isoDay: string, days: number): string {
  const [y, m, d] = isoDay.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + Math.trunc(days)));
  return dt.toISOString().slice(0, 10);
}

/** "valid until" is inclusive: a quote valid until 30. 11. can still be accepted on 30. 11. */
export function isPastDay(validUntil: string | null | undefined, today: string = todayZagreb()): boolean {
  return Boolean(validUntil) && (validUntil as string) < today;
}

/** a sent quote whose validity has run out is "istekla", whatever the stored status still says */
export function effectiveQuoteStatus(status: QuoteStatus, validUntil: string | null, today: string = todayZagreb()): QuoteStatus {
  return status === "poslana" && isPastDay(validUntil, today) ? "istekla" : status;
}

/* ================================================================== OIB */

/** Croatian OIB: 11 digits, ISO 7064 MOD 11,10 check digit */
export function isValidOib(raw: string): boolean {
  const oib = raw.trim();
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  let check = 11 - a;
  if (check === 10) check = 0;
  return check === Number(oib[10]);
}

/* ================================================================== numbers */

const qtyFmt = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 3 });
const pctFmt = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 2 });

/** 2.5 → "2,5" */
export const formatQty = (n: number): string => (Number.isFinite(n) ? qtyFmt.format(n) : "");
/** 25 → "25 %" (Croatian puts a space before %) */
export const formatPct = (n: number): string => `${Number.isFinite(n) ? pctFmt.format(n) : "0"} %`;

/**
 * "1,5" / "1.5" / "1.234,5" / "1 234" → number; null when it is not a number.
 * A comma is the decimal separator when present (dots then group thousands), as typed in Croatia.
 */
export function parseDecimal(raw: string): number | null {
  const s = raw.replace(/[\s %]/g, "");
  if (!s) return null;
  const normalised = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d+(?:\.\d+)?$/.test(normalised)) return null;
  const n = Number(normalised);
  return Number.isFinite(n) ? n : null;
}

/** cents → "1234,56" for an input field (no thousands dots, so it parses back unchanged) */
export function centsToInput(cents: number): string {
  if (!Number.isFinite(cents)) return "";
  const neg = cents < 0;
  const abs = Math.abs(Math.round(cents));
  const eur = Math.floor(abs / 100);
  const c = abs % 100;
  return `${neg ? "-" : ""}${eur},${String(c).padStart(2, "0")}`;
}

/** 2.5 → "2,5" for an input field */
export const numberToInput = (n: number): string => (Number.isFinite(n) ? String(n).replace(".", ",") : "");

/* ================================================================== editor payload */

/** what the editor sends to the save action (validated again on the server) */
export interface QuoteFormValues {
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  customerAddress: string;
  customerOib: string;
  title: string;
  items: QuoteItem[];
  discountPct: number;
  vatPct: number;
  /** "YYYY-MM-DD" or "" */
  validUntil: string;
  notes: string;
  terms: string;
}

/** field error keys: the form field names above, or `item:<item id>:<field>` for a line */
export type QuoteFieldErrors = Record<string, string>;

export type SaveQuoteResult =
  | { ok: true; id: string; number: string; /** updated_at ISO — send it back with the next save */ version: string }
  | { ok: false; error: string; fieldErrors?: QuoteFieldErrors; /** someone else changed the quote meanwhile */ conflict?: boolean };

export type QuoteActionResult = { ok: true; message?: string } | { ok: false; error: string };

/* ================================================================== document */

/** company block on the quote — from settings "company", else lib/site.ts (only known facts) */
export interface CompanyInfo {
  /** brand shown in the wordmark, e.g. "EMNA Interijeri" */
  brand: string;
  /** legal name, e.g. "EMNA Interijeri d.o.o." (falls back to brand) */
  name: string;
  /** street + city, multi-line allowed */
  address: string | null;
  oib: string | null;
  iban: string | null;
  bank: string | null;
  phone: string | null;
  email: string | null;
  web: string | null;
  /** registry / MBS / share capital / management line(s) for the footer */
  legalLine: string | null;
  /** who signs for the company, e.g. "Ime Prezime, direktor" */
  signatory: string | null;
}

export interface QuoteCustomer {
  name: string;
  address: string | null;
  oib: string | null;
  email: string | null;
  phone: string | null;
}

/** everything QuoteDocument needs — already safe to show to the customer (no internal notes, no ids) */
export interface QuoteDocumentData {
  number: string;
  title: string;
  /** effective status (see effectiveQuoteStatus) */
  status: QuoteStatus;
  /** date of the quote, "YYYY-MM-DD" (sent date, else created date) */
  issuedOn: string;
  validUntil: string | null;
  customer: QuoteCustomer;
  items: QuoteItem[];
  discountPct: number;
  vatPct: number;
  notes: string | null;
  terms: string | null;
  company: CompanyInfo;
  /** 3D view of the kitchen (admin file route or the public token route), when the linked inquiry has one */
  imageUrl?: string | null;
  acceptedAt?: string | null;
  rejectedAt?: string | null;
}
