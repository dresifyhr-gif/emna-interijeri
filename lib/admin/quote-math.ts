/**
 * Quote (ponuda) arithmetic — client-safe, integer cents throughout.
 *
 * Unit prices are NET (bez PDV-a). Per line: qty × unit price, minus the line discount, rounded
 * to the cent. Then the whole-quote discount, then PDV on the discounted net.
 *
 *   const t = quoteTotals(quote.items, quote.discountPct, quote.vatPct);
 *   formatCents(t.totalCents)
 */
import type { QuoteItem } from "@/lib/db/schema";

export type { QuoteItem };

const clampPct = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0);
const num = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? n : 0);

/** line total in cents, after the line discount */
export function lineTotalCents(item: Pick<QuoteItem, "qty" | "unit_price_cents" | "discount_pct">): number {
  const gross = num(item.qty) * num(item.unit_price_cents);
  return Math.round(gross * (1 - clampPct(item.discount_pct) / 100));
}

export interface QuoteTotals {
  /** sum of line totals (after line discounts), net */
  subtotalCents: number;
  /** whole-quote discount amount */
  discountCents: number;
  /** subtotal − discount: the PDV base */
  netCents: number;
  vatCents: number;
  /** net + PDV: what the customer pays */
  totalCents: number;
}

export function quoteTotals(items: readonly QuoteItem[] | null | undefined, discountPct: number, vatPct: number): QuoteTotals {
  const subtotalCents = (items ?? []).reduce((sum, it) => sum + lineTotalCents(it), 0);
  const discountCents = Math.round(subtotalCents * (clampPct(discountPct) / 100));
  const netCents = subtotalCents - discountCents;
  const vatCents = Math.round(netCents * (clampPct(vatPct) / 100));
  return { subtotalCents, discountCents, netCents, vatCents, totalCents: netCents + vatCents };
}

/** "1.234,56" or "1234.56" or "1234" (euros, as typed in a form) → cents; null when not a number */
export function parseEurToCents(raw: string): number | null {
  const s = raw.replace(/\s|€/g, "");
  if (!s) return null;
  // Croatian "1.234,56": dots group thousands, comma is the decimal separator
  const normalised = s.includes(",") ? s.replace(/\./g, "").replace(",", ".") : s;
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalised)) return null;
  return Math.round(Number(normalised) * 100);
}
