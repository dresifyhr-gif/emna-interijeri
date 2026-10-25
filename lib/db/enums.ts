/**
 * Status / source values stored in the database.
 * Pure constants (no imports) so client components can use them without pulling in drizzle.
 * Labels and badge tones for the UI live in lib/admin/status.ts.
 */

export const LEAD_SOURCES = ["studio", "kontakt"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

export const LEAD_STATUSES = ["novi", "u_obradi", "ponuda_poslana", "prihvaceno", "odbijeno", "arhiva"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];

export const QUOTE_STATUSES = ["nacrt", "poslana", "prihvacena", "odbijena", "istekla"] as const;
export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const isLeadStatus = (v: unknown): v is LeadStatus =>
  typeof v === "string" && (LEAD_STATUSES as readonly string[]).includes(v);
export const isQuoteStatus = (v: unknown): v is QuoteStatus =>
  typeof v === "string" && (QUOTE_STATUSES as readonly string[]).includes(v);
export const isLeadSource = (v: unknown): v is LeadSource =>
  typeof v === "string" && (LEAD_SOURCES as readonly string[]).includes(v);
