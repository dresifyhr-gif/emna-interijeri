/**
 * Every fact about the company lives here.
 *
 * `null` means "the owner hasn't given us this yet". Components must render
 * such a value through <Fill> (components/site/Fill.tsx), which shows a
 * visible "upisati …" marker in development and renders nothing in
 * production — we never ship invented phone numbers, stats or reviews.
 * The full pre-launch list (what the owner must supply and where it goes) is docs/PRIJE-OBJAVE.md.
 *
 * Contact, legal, social and facts are only the fallback: the owner enters them in /admin/postavke, and the public
 * pages read the merged values through getPublicCompany() (lib/site-data.ts), never `site.contact` directly.
 */

export type Maybe<T> = T | null;

const FALLBACK_URL = "https://emna-interijeri.vercel.app";

/**
 * Public origin without a trailing slash. An empty or malformed NEXT_PUBLIC_SITE_URL (the line in
 * .env.example is empty on purpose) falls back to the Vercel address instead of crashing
 * `new URL()` in the root layout; a bare host ("emna.hr") gets https:// in front.
 */
function siteOrigin(raw: string | undefined): string {
  const value = raw?.trim();
  if (!value) return FALLBACK_URL;
  try {
    return new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`).origin;
  } catch {
    return FALLBACK_URL;
  }
}

export const site = {
  name: "EMNA Interijeri",
  short: "EMNA",
  tagline: "Kuhinje i namještaj po mjeri",
  description:
    "Kuhinje, ormari i interijeri po mjeri. Projektiramo u 3D-u, izrađujemo i montiramo. Složite svoju kuhinju u našem 3D studiju i dobijte okvirnu cijenu odmah.",
  url: siteOrigin(process.env.NEXT_PUBLIC_SITE_URL),
  locale: "hr_HR",

  contact: {
    /** display form, e.g. "+385 91 123 4567" */
    phone: null as Maybe<string>,
    /** wa.me form without +, e.g. "385911234567" */
    whatsapp: null as Maybe<string>,
    email: null as Maybe<string>,
    /** street address of workshop / showroom */
    address: null as Maybe<string>,
    /**
     * TODO(vlasnik): potvrditi grad (radionica / izložbeni prostor). Stari prototip navodio je
     * "Zagreb", ali to nitko nije potvrdio, pa do potvrde ostaje null i ide kroz <Fill>.
     */
    city: null as Maybe<string>,
    hours: null as Maybe<string>,
    /** Google Maps link to the address */
    mapUrl: null as Maybe<string>,
  },

  /**
   * Legally required company data (GDPR controller, ZTD čl. 21 for a d.o.o., Zakon o obrtu for an obrt).
   * Fill in what applies to the company's legal form; the rest stays null.
   */
  legal: {
    companyName: null as Maybe<string>, // e.g. "EMNA Interijeri d.o.o."
    oib: null as Maybe<string>,
    seat: null as Maybe<string>, // registered address
    registry: null as Maybe<string>, // e.g. "Trgovački sud u …, MBS …"
    /** d.o.o.: share capital and whether it is paid in full, e.g. "2.500,00 €, uplaćen u cijelosti" */
    shareCapital: null as Maybe<string>,
    /** d.o.o.: members of the management board, e.g. "Ime Prezime, direktor" */
    management: null as Maybe<string>,
    /** bank and IBAN of the business account, e.g. "Banka d.d., HR12 3456 7890 1234 5678 9" */
    bank: null as Maybe<string>,
    /** obrt: owner's name (vlasnik obrta) */
    owner: null as Maybe<string>,
  },

  social: {
    instagram: null as Maybe<string>,
    facebook: null as Maybe<string>,
  },

  /** only real numbers, confirmed by the owner */
  facts: {
    projects: null as Maybe<string>, // e.g. "600+"
    years: null as Maybe<string>, // e.g. "18"
  },
} as const;

export const nav = [
  { href: "/kuhinje", label: "Kuhinje" },
  { href: "/ormari", label: "Ormari" },
  { href: "/interijeri", label: "Interijeri" },
  { href: "/radovi", label: "Radovi" },
  { href: "/o-nama", label: "O nama" },
  { href: "/kontakt", label: "Kontakt" },
] as const;

/** pages listed in the phone menu and the footer but not in the desktop header (it has no room for them) */
export const navMore = [{ href: "/pitanja", label: "Pitanja" }] as const;

export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, "")}`;
export const waHref = (wa: string, text?: string) =>
  `https://wa.me/${wa}${text ? `?text=${encodeURIComponent(text)}` : ""}`;

/** the inquiry form's `?interes=` values a page can preselect */
export type InquiryInterest = "kuhinja" | "ormar" | "interijer";

const underPath = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);

/** what a visitor on this page most likely asks about: /ormari → ormar, /interijeri → interijer, everything else kuhinja */
export function interestForPath(pathname: string): InquiryInterest {
  if (underPath(pathname, "/ormari")) return "ormar";
  if (underPath(pathname, "/interijeri")) return "interijer";
  return "kuhinja";
}

/** the inquiry form on /kontakt, scrolled into view, with the interest preselected (and the wish for a measurement) */
export const inquiryHref = (interest: InquiryInterest, opts: { measurement?: boolean } = {}) =>
  `/kontakt?interes=${interest}${opts.measurement ? "&izmjera=1" : ""}#upit`;
