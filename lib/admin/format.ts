/**
 * Croatian formatting for the admin (client-safe). All dates are shown in Europe/Zagreb.
 *
 *   formatDateTime(lead.createdAt)   "24. 10. 2026. u 14:05"
 *   formatDate("2026-11-30")         "30. 11. 2026."
 *   formatRelative(lead.createdAt)   "prije 5 min" / "jučer" / "24. 10. 2026."
 *   formatCents(123456)              "1.234,56 €"
 *   formatEur(8400)                  "8.400 €"
 *   formatPriceRange(8400, 10900)    "8.400 – 10.900 €"
 */

const TZ = "Europe/Zagreb";

const dateFmt = new Intl.DateTimeFormat("hr-HR", { timeZone: TZ, day: "numeric", month: "numeric", year: "numeric" });
const timeFmt = new Intl.DateTimeFormat("hr-HR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
const longDateFmt = new Intl.DateTimeFormat("hr-HR", { timeZone: TZ, day: "numeric", month: "long", year: "numeric" });
const centsFmt = new Intl.NumberFormat("hr-HR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const eurFmt = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 });

type DateInput = Date | string | number | null | undefined;

function toDate(v: DateInput): Date | null {
  if (v === null || v === undefined || v === "") return null;
  // a bare "YYYY-MM-DD" (Postgres date) is a calendar day, not midnight UTC
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) {
    const [y, m, d] = v.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d, 12));
  }
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "24. 10. 2026." (empty string for no date) */
export function formatDate(v: DateInput): string {
  const d = toDate(v);
  return d ? dateFmt.format(d) : "";
}

/** "24. listopada 2026." */
export function formatLongDate(v: DateInput): string {
  const d = toDate(v);
  return d ? longDateFmt.format(d) : "";
}

/** "24. 10. 2026. u 14:05" */
export function formatDateTime(v: DateInput): string {
  const d = toDate(v);
  return d ? `${dateFmt.format(d)} u ${timeFmt.format(d)}` : "";
}

/** short relative time for lists; falls back to the date after a week */
export function formatRelative(v: DateInput, now: Date = new Date()): string {
  const d = toDate(v);
  if (!d) return "";
  const sec = Math.round((now.getTime() - d.getTime()) / 1000);
  if (sec < 0) return formatDateTime(d);
  if (sec < 60) return "upravo";
  const min = Math.floor(sec / 60);
  if (min < 60) return `prije ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24 && dateFmt.format(d) === dateFmt.format(now)) return `danas u ${timeFmt.format(d)}`;
  const yesterday = new Date(now.getTime() - 24 * 3600 * 1000);
  if (dateFmt.format(d) === dateFmt.format(yesterday)) return `jučer u ${timeFmt.format(d)}`;
  const days = Math.floor(h / 24);
  if (days < 7) return `prije ${Math.max(days, 2)} dana`;
  return formatDate(d);
}

/** integer cents → "1.234,56 €" */
export function formatCents(cents: number | null | undefined): string {
  if (cents === null || cents === undefined || !Number.isFinite(cents)) return "";
  return `${centsFmt.format(Math.round(cents) / 100)} €`;
}

/** whole euros → "8.400 €" */
export function formatEur(eur: number | null | undefined): string {
  if (eur === null || eur === undefined || !Number.isFinite(eur)) return "";
  return `${eurFmt.format(Math.round(eur))} €`;
}

/** okvirna cijena → "8.400 – 10.900 €" ("" when unknown) */
export function formatPriceRange(low: number | null | undefined, high: number | null | undefined): string {
  const lo = Number.isFinite(low) ? Number(low) : null;
  const hi = Number.isFinite(high) ? Number(high) : null;
  if (lo === null && hi === null) return "";
  if (lo === null || hi === null || lo === hi) return formatEur(hi ?? lo);
  return `${eurFmt.format(Math.min(lo, hi))} – ${eurFmt.format(Math.max(lo, hi))} €`;
}

/** "1 upit" / "3 upita" / "5 upita" — Croatian plural forms */
export function plural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
