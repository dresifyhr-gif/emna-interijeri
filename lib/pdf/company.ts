/**
 * The company block of the PDF — only facts the owner entered (admin "Postavke → Podaci o tvrtki", read on the server by
 * lib/admin/quotes.ts getCompanyInfo, which falls back to lib/site.ts). Nothing here is ever invented: a missing field is
 * left out of the document, and with nothing known the contact page shows the studio link only.
 *
 * Client-safe (no DB): the studio fetches the server's values from /studio/tvrtka at export time and falls back to
 * companyFromSite(); the admin passes getCompanyInfo() from its server component.
 */

import { site } from "../site";

/** what the PDF shows about the company (the document subset of components/admin/quotes/model.ts CompanyInfo) */
export interface PdfCompany {
  /** "EMNA Interijeri" — the wordmark */
  brand: string;
  /** legal name ("EMNA Interijeri d.o.o."); the brand when unknown */
  name: string;
  /** street + city, several lines allowed */
  address: string | null;
  oib: string | null;
  phone: string | null;
  email: string | null;
  /** "emna.hr" (host only, no protocol) */
  web: string | null;
  /** registry / share capital line */
  legalLine: string | null;
}

const clean = (v: unknown, max = 400): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

/** any object with CompanyInfo-like fields (JSON from /studio/tvrtka, getCompanyInfo()) → PdfCompany; junk → the site's facts */
export function normalizeCompany(raw: unknown): PdfCompany {
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const fallback = companyFromSite();
  const brand = clean(o.brand, 80) ?? fallback.brand;
  return {
    brand,
    name: clean(o.name, 160) ?? brand,
    address: clean(o.address, 300),
    oib: clean(o.oib, 20),
    phone: clean(o.phone, 40),
    email: clean(o.email, 200),
    web: hostOf(clean(o.web, 200)),
    legalLine: clean(o.legalLine, 400),
  };
}

/** "https://www.emna.hr/" → "www.emna.hr"; null stays null */
function hostOf(v: string | null): string | null {
  if (!v) return null;
  try {
    return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).host || v;
  } catch {
    return v;
  }
}

/** lib/site.ts alone (what the code knows without the database) */
export function companyFromSite(): PdfCompany {
  const address = [site.legal.seat ?? site.contact.address, site.legal.seat ? null : site.contact.city].filter(Boolean).join("\n") || null;
  return {
    brand: site.name,
    name: site.legal.companyName ?? site.name,
    address,
    oib: site.legal.oib,
    phone: site.contact.phone,
    email: site.contact.email,
    web: null,
    legalLine: [site.legal.registry, site.legal.shareCapital].filter(Boolean).join(" · ") || null,
  };
}

/** the contact lines in reading order, each { label, value } — only what is known */
export function companyLines(c: PdfCompany): { label: string; value: string }[] {
  const out: { label: string; value: string }[] = [];
  if (c.phone) out.push({ label: "Telefon", value: c.phone });
  if (c.email) out.push({ label: "E-mail", value: c.email });
  if (c.web) out.push({ label: "Web", value: c.web });
  if (c.address) out.push({ label: "Adresa", value: c.address });
  return out;
}

/** the legal lines (name if it differs from the brand, OIB, registry) */
export function companyLegal(c: PdfCompany): string[] {
  return [c.name !== c.brand ? c.name : null, c.oib ? `OIB ${c.oib}` : null, c.legalLine].filter((v): v is string => Boolean(v));
}
