/**
 * Key/value settings stored in the `settings` table (company data the owner enters in admin).
 *
 *   const company = await getCompanySettings();          // effective data: admin values over lib/site.ts
 *   const defaults = await getQuoteDefaults();           // { vatPct, validDays, terms, notes }
 *
 *   const raw = await getSetting(SETTING_KEYS.company, schema);   // low level: parsed or null
 *   await setSetting(SETTING_KEYS.company, data);
 *
 * Values are JSON. Pass a zod schema to getSetting to get a typed, validated value back
 * (an invalid stored value yields null instead of a crash).
 */
import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { z, type ZodType } from "zod";
import { dbErrorLabel, getDb, isDbConfigured } from "@/lib/db";
import { settings } from "@/lib/db/schema";
import { site } from "@/lib/site";

/** well-known keys — add new ones here so every engineer uses the same string */
export const SETTING_KEYS = {
  /** company / legal data shown on the site and on quotes (CompanySettings below) */
  company: "company",
  /** default quote values (QuoteDefaults below) */
  quoteDefaults: "quote_defaults",
} as const;

/**
 * Cache tags revalidated whenever the owner saves a section. getPublicCompany() (lib/site-data.ts) caches the public
 * site's company data under COMPANY_SETTINGS_TAG, so the save action's updateTag() refreshes the footer, /kontakt,
 * /o-nama, /privatnost and the JSON-LD on the next request. Nothing is cached under QUOTE_DEFAULTS_TAG yet.
 */
export const COMPANY_SETTINGS_TAG = "settings:company";
export const QUOTE_DEFAULTS_TAG = "settings:quote_defaults";

export async function getSetting<T = unknown>(key: string, schema?: ZodType<T>): Promise<T | null> {
  const [row] = await getDb()
    .select({ value: settings.value })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  if (!row) return null;
  if (!schema) return row.value as T;
  const parsed = schema.safeParse(row.value);
  return parsed.success ? parsed.data : null;
}

export async function getSettings(keys: readonly string[]): Promise<Record<string, unknown>> {
  if (keys.length === 0) return {};
  const rows = await getDb()
    .select({ key: settings.key, value: settings.value })
    .from(settings)
    .where(inArray(settings.key, [...keys]));
  return Object.fromEntries(rows.map((r) => [r.key, r.value]));
}

/** upsert; `value` must be JSON-serialisable and not null/undefined (delete the row instead) */
export async function setSetting(key: string, value: unknown): Promise<void> {
  if (value === null || value === undefined) throw new Error("setSetting: value is required");
  await getDb()
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: sql`now()` } });
}

/** when a key was last saved (null = never) */
export async function getSettingUpdatedAt(key: string): Promise<Date | null> {
  const [row] = await getDb()
    .select({ updatedAt: settings.updatedAt })
    .from(settings)
    .where(eq(settings.key, key))
    .limit(1);
  return row?.updatedAt ?? null;
}

/* ================================================================== company (Podaci o tvrtki) */

type Maybe = string | null;

/**
 * Same shape and meaning as `site.contact / legal / social / facts` in lib/site.ts, so the
 * public-site wiring can swap one for the other. Every field is present; null = not filled in.
 */
export interface CompanySettings {
  contact: {
    /** display form, e.g. "+385 91 123 4567" */
    phone: Maybe;
    /** wa.me form: digits only, with country code, e.g. "385911234567" */
    whatsapp: Maybe;
    email: Maybe;
    address: Maybe;
    city: Maybe;
    hours: Maybe;
    /** https link to Google Maps */
    mapUrl: Maybe;
  };
  legal: {
    companyName: Maybe;
    /** 11 digits, checksum verified */
    oib: Maybe;
    seat: Maybe;
    registry: Maybe;
    shareCapital: Maybe;
    management: Maybe;
    /** "Banka d.d., HR12 3456 7890 1234 5678 9" — an HR IBAN in the text is checksum verified */
    bank: Maybe;
    owner: Maybe;
  };
  social: {
    /** full https URL (an @handle is turned into https://www.instagram.com/<handle>/) */
    instagram: Maybe;
    /** full https URL */
    facebook: Maybe;
  };
  facts: {
    /** e.g. "600+" — only real numbers */
    projects: Maybe;
    /** e.g. "18" */
    years: Maybe;
  };
}

export type CompanyGroup = keyof CompanySettings;

/** every group and field, in form order */
export const COMPANY_FIELDS = {
  contact: ["phone", "whatsapp", "email", "address", "city", "hours", "mapUrl"],
  legal: ["companyName", "oib", "seat", "registry", "shareCapital", "management", "bank", "owner"],
  social: ["instagram", "facebook"],
  facts: ["projects", "years"],
} as const satisfies { [G in CompanyGroup]: ReadonlyArray<keyof CompanySettings[G]> };

/** the fields a quote and the legal notice really need */
export const COMPANY_CORE_FIELDS = [
  "contact.phone",
  "contact.email",
  "contact.address",
  "contact.city",
  "legal.companyName",
  "legal.oib",
] as const;

function eachField(fn: (group: CompanyGroup, key: string) => void) {
  for (const group of Object.keys(COMPANY_FIELDS) as CompanyGroup[]) {
    for (const key of COMPANY_FIELDS[group]) fn(group, key);
  }
}

function emptyCompany(): CompanySettings {
  const out = { contact: {}, legal: {}, social: {}, facts: {} } as Record<CompanyGroup, Record<string, Maybe>>;
  eachField((g, k) => (out[g][k] = null));
  return out as unknown as CompanySettings;
}

const cleanStored = (v: unknown): Maybe => (typeof v === "string" && v.trim() ? v.trim().slice(0, 2000) : null);

/** any stored JSON → a complete CompanySettings (unknown keys dropped, bad values → null) */
export function normalizeCompany(raw: unknown): CompanySettings {
  const out = emptyCompany() as unknown as Record<CompanyGroup, Record<string, Maybe>>;
  const src = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  eachField((g, k) => {
    const group = src[g];
    if (group && typeof group === "object") out[g][k] = cleanStored((group as Record<string, unknown>)[k]);
  });
  return out as unknown as CompanySettings;
}

/** the values hard-coded in lib/site.ts (all null until the owner's data is put there) */
export function siteCompanyDefaults(): CompanySettings {
  return normalizeCompany({ contact: site.contact, legal: site.legal, social: site.social, facts: site.facts });
}

/** field-by-field: the first non-null value wins */
function mergeCompany(primary: CompanySettings, fallback: CompanySettings): CompanySettings {
  const p = primary as unknown as Record<CompanyGroup, Record<string, Maybe>>;
  const f = fallback as unknown as Record<CompanyGroup, Record<string, Maybe>>;
  const out = emptyCompany() as unknown as Record<CompanyGroup, Record<string, Maybe>>;
  eachField((g, k) => (out[g][k] = p[g][k] ?? f[g][k] ?? null));
  return out as unknown as CompanySettings;
}

/** stored values, falling back field by field to lib/site.ts (what the site would show) */
export function withSiteFallback(stored: CompanySettings): CompanySettings {
  return mergeCompany(stored, siteCompanyDefaults());
}

/** what the owner saved in admin (all null when never saved); throws when the database fails */
export async function getStoredCompanySettings(): Promise<CompanySettings> {
  return normalizeCompany(await getSetting(SETTING_KEYS.company));
}

/**
 * Effective company data for the public site and for quotes: admin values, falling back field by
 * field to lib/site.ts. Never throws — without a database (build time, outage) it returns the
 * lib/site.ts values, so a public page can always render.
 */
export async function getCompanySettings(): Promise<CompanySettings> {
  const defaults = siteCompanyDefaults();
  if (!isDbConfigured()) return defaults;
  try {
    return withSiteFallback(await getStoredCompanySettings());
  } catch (err) {
    console.error(`[postavke] podaci o tvrtki nisu učitani (${dbErrorLabel(err)})`);
    return defaults;
  }
}

/** how much of the form is filled in */
export function companyCompleteness(c: CompanySettings): {
  filled: number;
  total: number;
  /** "contact.phone"… of the core fields still empty */
  missingCore: string[];
} {
  const flat = c as unknown as Record<CompanyGroup, Record<string, Maybe>>;
  let filled = 0;
  let total = 0;
  eachField((g, k) => {
    total++;
    if (flat[g][k]) filled++;
  });
  const missingCore = COMPANY_CORE_FIELDS.filter((path) => {
    const [g, k] = path.split(".") as [CompanyGroup, string];
    return !flat[g][k];
  });
  return { filled, total, missingCore };
}

/* ------------------------------------------------------------------ validation (form → value) */

const digitsOf = (v: string) => v.replace(/\D/g, "");
const oneLine = (v: string) => v.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();

/** ISO 7064 MOD 11,10 — the OIB check digit */
export function isValidOib(oib: string): boolean {
  if (!/^\d{11}$/.test(oib)) return false;
  let a = 10;
  for (let i = 0; i < 10; i++) {
    a = (a + Number(oib[i])) % 10;
    if (a === 0) a = 10;
    a = (a * 2) % 11;
  }
  const check = (11 - a) % 10;
  return check === Number(oib[10]);
}

/** ISO 13616 mod-97 check of an IBAN (spaces allowed) */
export function isValidIban(raw: string): boolean {
  const iban = raw.replace(/\s/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return false;
  if (iban.startsWith("HR") && iban.length !== 21) return false;
  const moved = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const ch of moved) {
    const n = ch >= "A" && ch <= "Z" ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of n) rest = (rest * 10 + Number(d)) % 97;
  }
  return rest === 1;
}

function httpsUrl(v: string): URL | null {
  try {
    const u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(v) ? v : `https://${v}`);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (!u.hostname.includes(".")) return null;
    u.protocol = "https:";
    return u;
  } catch {
    return null;
  }
}

/** "091 123 4567" / "+385 91…" / "00385 91…" → "385911234567" (wa.me form) */
export function toWhatsappDigits(v: string): string {
  let d = digitsOf(v);
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `385${d.slice(1)}`;
  return d;
}

type Check = (v: string) => { value: Maybe } | { error: string };

const ok = (value: Maybe) => ({ value });
const fail = (error: string) => ({ error });

const text =
  (max: number, opts: { multiline?: boolean } = {}): Check =>
  (raw) => {
    const v = opts.multiline ? raw.replace(/\r\n?/g, "\n").trim() : oneLine(raw);
    if (!v) return ok(null);
    if (v.length > max) return fail(`Najviše ${max} znakova.`);
    return ok(v);
  };

const CHECKS: { [G in CompanyGroup]: Record<keyof CompanySettings[G], Check> } = {
  contact: {
    phone: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      if (v.length > 40 || !/^[+\d\s()./-]+$/.test(v)) return fail("Upišite samo broj, npr. +385 91 123 4567.");
      const n = digitsOf(v).length;
      if (n < 8 || n > 15) return fail("Broj mora imati 8 do 15 znamenki.");
      return ok(v);
    },
    whatsapp: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      if (v.length > 40 || !/^[+\d\s()./-]+$/.test(v)) return fail("Upišite broj mobitela, npr. +385 91 123 4567.");
      const d = toWhatsappDigits(v);
      if (d.length < 9 || d.length > 15) return fail("Broj mora imati pozivni broj zemlje i 9 do 15 znamenki.");
      return ok(d);
    },
    email: (raw) => {
      const v = oneLine(raw).toLowerCase();
      if (!v) return ok(null);
      if (v.length > 200 || !z.email().safeParse(v).success) return fail("Upišite ispravnu e-mail adresu, npr. info@emna.hr.");
      return ok(v);
    },
    address: text(200),
    city: text(80),
    hours: text(200, { multiline: true }),
    mapUrl: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      const u = v.length <= 1000 ? httpsUrl(v) : null;
      if (!u) return fail("Zalijepite cijelu poveznicu, npr. https://maps.app.goo.gl/…");
      return ok(u.toString());
    },
  },
  legal: {
    companyName: text(160),
    oib: (raw) => {
      // "HR12345678901" (PDV identifikacijski broj) is the OIB with a country prefix
      const trimmed = raw.trim().replace(/^HR\s*/i, "");
      if (!trimmed) return ok(null);
      const v = digitsOf(trimmed);
      if (v.length !== 11 || /[^\d\s]/.test(trimmed)) return fail("OIB ima točno 11 znamenki.");
      if (!isValidOib(v)) return fail("OIB nije ispravan — kontrolna znamenka se ne slaže. Provjerite znamenke.");
      return ok(v);
    },
    seat: text(200),
    registry: text(300),
    shareCapital: text(160),
    management: text(300),
    bank: (raw) => {
      const r = text(200)(raw);
      if ("error" in r || !r.value) return r;
      const m = /HR\s?\d{2}(?:\s?\d){10,}/i.exec(r.value);
      if (m && !isValidIban(m[0])) return fail("IBAN nije ispravan — provjerite znamenke (HR + 19 znamenki).");
      return r;
    },
    owner: text(160),
  },
  social: {
    instagram: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      const handle = /^@?([A-Za-z0-9._]{1,30})$/.exec(v);
      if (handle && !v.includes("instagram.")) return ok(`https://www.instagram.com/${handle[1]}/`);
      const u = v.length <= 500 ? httpsUrl(v) : null;
      if (!u || !/(^|\.)instagram\.com$/i.test(u.hostname)) return fail("Upišite @korisničko ime ili poveznicu na Instagram profil.");
      return ok(u.toString());
    },
    facebook: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      if (/^[A-Za-z0-9.-]{2,80}$/.test(v) && !/\.(com|hr|me)$/i.test(v)) return ok(`https://www.facebook.com/${v}`);
      const u = v.length <= 500 ? httpsUrl(v) : null;
      if (!u || !/(^|\.)(facebook\.com|fb\.com|fb\.me)$/i.test(u.hostname)) return fail("Upišite poveznicu na Facebook stranicu.");
      return ok(u.toString());
    },
  },
  facts: {
    projects: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      if (v.length > 20 || !/\d/.test(v)) return fail("Upišite stvarnu brojku, npr. 600+.");
      return ok(v);
    },
    years: (raw) => {
      const v = oneLine(raw);
      if (!v) return ok(null);
      if (v.length > 20 || !/\d/.test(v)) return fail("Upišite broj godina, npr. 18.");
      return ok(v);
    },
  },
};

export type FieldErrors = Record<string, string>;

/**
 * Reads the company form (inputs named "contact.phone", "legal.oib" …) and validates it.
 * Returns the value to store, or Croatian errors keyed by the same names.
 */
export function parseCompanyForm(
  formData: FormData,
): { ok: true; value: CompanySettings } | { ok: false; errors: FieldErrors; values: Record<string, string> } {
  const value = emptyCompany() as unknown as Record<CompanyGroup, Record<string, Maybe>>;
  const errors: FieldErrors = {};
  const values: Record<string, string> = {};
  eachField((g, k) => {
    const name = `${g}.${k}`;
    const raw = String(formData.get(name) ?? "").slice(0, 5000);
    values[name] = raw;
    const check = (CHECKS[g] as Record<string, Check>)[k];
    const r = check(raw);
    if ("error" in r) errors[name] = r.error;
    else value[g][k] = r.value;
  });
  if (Object.keys(errors).length) return { ok: false, errors, values };
  return { ok: true, value: value as unknown as CompanySettings };
}

/* ================================================================== quote defaults (Ponude) */

/**
 * Stored under SETTING_KEYS.quoteDefaults with exactly these keys — the shape lib/admin/quotes.ts
 * (getQuoteDefaults there) reads when it prefills a new quote.
 */
export interface QuoteDefaults {
  /** PDV in percent, 0–100 (25 = standard Croatian rate) */
  vatPct: number;
  /** rok valjanosti: a new quote is valid for this many days (validUntil = today + validDays) */
  validDays: number;
  /** uvjeti plaćanja — prefilled into quotes.terms */
  terms: string | null;
  /** napomena na dnu ponude — prefilled into quotes.notes */
  notes: string | null;
}

export const QUOTE_DEFAULTS_FALLBACK: QuoteDefaults = {
  vatPct: 25,
  validDays: 30,
  terms: null,
  notes: null,
};

export const QUOTE_TEXT_MAX = 4000;

const storedQuoteDefaults = z
  .object({
    vatPct: z.number().min(0).max(100).catch(QUOTE_DEFAULTS_FALLBACK.vatPct),
    validDays: z.number().int().min(1).max(365).catch(QUOTE_DEFAULTS_FALLBACK.validDays),
    terms: z.string().max(QUOTE_TEXT_MAX).nullable().catch(null),
    notes: z.string().max(QUOTE_TEXT_MAX).nullable().catch(null),
  })
  .partial();

/** saved defaults merged over QUOTE_DEFAULTS_FALLBACK; throws when the database fails */
export async function getQuoteDefaults(): Promise<QuoteDefaults> {
  const raw = await getSetting(SETTING_KEYS.quoteDefaults);
  const parsed = storedQuoteDefaults.safeParse(raw ?? {});
  const v = parsed.success ? parsed.data : {};
  return {
    vatPct: v.vatPct ?? QUOTE_DEFAULTS_FALLBACK.vatPct,
    validDays: v.validDays ?? QUOTE_DEFAULTS_FALLBACK.validDays,
    terms: v.terms?.trim() ? v.terms : null,
    notes: v.notes?.trim() ? v.notes : null,
  };
}

/** "25" / "13,5" / "5.5" → number with at most 2 decimals, or null */
function parsePct(raw: string): number | null {
  const s = raw.replace(/\s|%/g, "").replace(",", ".");
  if (!/^\d{1,3}(?:\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  return n >= 0 && n <= 100 ? n : null;
}

export function parseQuoteDefaultsForm(
  formData: FormData,
): { ok: true; value: QuoteDefaults } | { ok: false; errors: FieldErrors; values: Record<string, string> } {
  const values = {
    vatPct: String(formData.get("vatPct") ?? "").slice(0, 20),
    validDays: String(formData.get("validDays") ?? "").slice(0, 20),
    terms: String(formData.get("terms") ?? "").slice(0, QUOTE_TEXT_MAX + 500),
    notes: String(formData.get("notes") ?? "").slice(0, QUOTE_TEXT_MAX + 500),
  };
  const errors: FieldErrors = {};

  const vat = parsePct(values.vatPct);
  if (vat === null) errors.vatPct = "Upišite postotak od 0 do 100, npr. 25.";

  const daysRaw = values.validDays.trim();
  const days = /^\d{1,3}$/.test(daysRaw) ? Number(daysRaw) : NaN;
  if (!Number.isInteger(days) || days < 1 || days > 365) errors.validDays = "Upišite broj dana od 1 do 365.";

  const block = (v: string) => v.replace(/\r\n?/g, "\n").replace(/\n{4,}/g, "\n\n\n").trim();
  const terms = block(values.terms);
  const notes = block(values.notes);
  if (terms.length > QUOTE_TEXT_MAX) errors.terms = `Najviše ${QUOTE_TEXT_MAX} znakova.`;
  if (notes.length > QUOTE_TEXT_MAX) errors.notes = `Najviše ${QUOTE_TEXT_MAX} znakova.`;

  if (Object.keys(errors).length) return { ok: false, errors, values };
  return {
    ok: true,
    value: {
      vatPct: vat as number,
      validDays: days,
      terms: terms || null,
      notes: notes || null,
    },
  };
}
