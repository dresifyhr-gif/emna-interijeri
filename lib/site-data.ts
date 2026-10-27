/**
 * Company data for the public site: what the owner saved in /admin/postavke, falling back field by field to lib/site.ts.
 *
 *   const company = await getPublicCompany();     // server components only
 *   cityLineOf(company)                            // "Grad, Hrvatska" | null
 *   <Header phone={company.contact.phone} />       // client components get plain strings, never this module
 *
 * The read is cached (unstable_cache) under COMPANY_SETTINGS_TAG, so the (site) pages stay static (ISR, at most an
 * hour old) and the updateTag() in the admin save action refreshes them on the next request.
 */
import "server-only";
import { unstable_cache } from "next/cache";
import { cache } from "react";
import {
  COMPANY_SETTINGS_TAG,
  getStoredCompanySettings,
  siteCompanyDefaults,
  withSiteFallback,
  type CompanySettings,
} from "@/lib/admin/settings";
import { dbErrorLabel, isDbConfigured } from "@/lib/db";

export type { CompanySettings };

/** throws when the database fails, so an outage never gets cached as "no data" */
const loadPublicCompany = unstable_cache(
  async (): Promise<CompanySettings> => withSiteFallback(await getStoredCompanySettings()),
  ["public-company-v1"],
  { tags: [COMPANY_SETTINGS_TAG], revalidate: 3600 },
);

/**
 * Effective company data for public pages. Never throws: without a database (local build) or while it is down, the
 * lib/site.ts values are returned, and the failed read is retried on the next render instead of being cached.
 */
export const getPublicCompany = cache(async (): Promise<CompanySettings> => {
  if (!isDbConfigured()) return siteCompanyDefaults();
  try {
    return await loadPublicCompany();
  } catch (err) {
    console.error(`[stranica] podaci o tvrtki nisu učitani (${dbErrorLabel(err)})`);
    return siteCompanyDefaults();
  }
});

type HasContact = Pick<CompanySettings, "contact">;

/** "Grad, Hrvatska" once the city is known, otherwise null (render it through <Fill label="grad">) */
export function cityLineOf(c: HasContact): string | null {
  return c.contact.city ? `${c.contact.city}, Hrvatska` : null;
}

/** a customer can call, write or WhatsApp right away (an address or working hours alone don't count) */
export function hasDirectContact(c: HasContact): boolean {
  return Boolean(c.contact.phone || c.contact.whatsapp || c.contact.email);
}

export type PublicContact = CompanySettings["contact"];

/** the contact fields as a plain object: safe to pass to a client component (no legal data, no functions) */
export function publicContact(c: HasContact): PublicContact {
  const { phone, whatsapp, email, address, city, hours, mapUrl } = c.contact;
  return { phone, whatsapp, email, address, city, hours, mapUrl };
}
