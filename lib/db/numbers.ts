/**
 * Human-readable document numbers and public tokens.
 *
 *   await nextLeadNumber()   → "U-2026-0001"
 *   await nextQuoteNumber()  → "P-2026-0001"
 *   newPublicToken()         → 32-char base64url token for a quote's public link
 *
 * Numbers restart every calendar year (Europe/Zagreb). Each call atomically reserves the next
 * value with one upsert on `counters`, so two concurrent inquiries never get the same number;
 * a number whose insert later fails is simply skipped (gaps are fine, duplicates are not).
 */
import "server-only";
import { randomBytes } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb, type Db } from "./index";
import { counters } from "./schema";

export type NumberKind = "lead" | "quote";

const PREFIX: Record<NumberKind, string> = { lead: "U", quote: "P" };

const yearFmt = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zagreb", year: "numeric" });

/** calendar year in Croatia (an inquiry at 00:30 on 1 January belongs to the new year) */
export function zagrebYear(at: Date = new Date()): number {
  return Number(yearFmt.format(at));
}

/** "U-2026-0007" — at least 4 digits, grows past 9999 without breaking sort within a year */
export function formatNumber(kind: NumberKind, year: number, seq: number): string {
  return `${PREFIX[kind]}-${year}-${String(seq).padStart(4, "0")}`;
}

/** reserves and returns the next number of `kind` for the year of `at` */
export async function nextNumber(kind: NumberKind, opts: { db?: Db; at?: Date } = {}): Promise<string> {
  const db = opts.db ?? getDb();
  const year = zagrebYear(opts.at);
  const key = `${kind}:${year}`;
  const [row] = await db
    .insert(counters)
    .values({ key, value: 1 })
    .onConflictDoUpdate({ target: counters.key, set: { value: sql`${counters.value} + 1` } })
    .returning({ value: counters.value });
  if (!row) throw new Error("counter upsert returned no row");
  return formatNumber(kind, year, row.value);
}

export const nextLeadNumber = (opts?: { db?: Db; at?: Date }) => nextNumber("lead", opts);
export const nextQuoteNumber = (opts?: { db?: Db; at?: Date }) => nextNumber("quote", opts);

/** unguessable token for public links (quotes.public_token): 24 random bytes, base64url */
export function newPublicToken(): string {
  return randomBytes(24).toString("base64url");
}
