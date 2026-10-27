/**
 * Public company data (lib/site-data.ts): the owner's admin values over lib/site.ts field by field, the helpers the
 * public pages use (city line, "is there a direct contact", the client-safe contact subset), the page → inquiry
 * interest links (lib/site.ts) and the JSON-LD built from the company (no null or empty field, always a WebSite node).
 *
 *   npx tsx --test lib/site-data.test.ts
 */
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { after, before, describe, it } from "node:test";
import { inquiryHref, interestForPath, site, telHref, waHref } from "./site";

// lib/site-data.ts and lib/admin/settings.ts start with `import "server-only"`, which throws outside a React Server
// Components build: answer it with an empty module first, then load them
const req = createRequire(__filename);
const serverOnly = req.resolve("server-only");
req.cache[serverOnly] = { id: serverOnly, filename: serverOnly, loaded: true, exports: {} } as NodeJS.Module;

let data: typeof import("./site-data");
let settings: typeof import("./admin/settings");
let jsonLd: typeof import("../components/pages/LocalBusinessJsonLd");

before(async () => {
  [data, settings, jsonLd] = await Promise.all([
    import("./site-data"),
    import("./admin/settings"),
    import("../components/pages/LocalBusinessJsonLd"),
  ]);
});

/** lib/site.ts holds nulls until the owner's data is put there: give it known values for the fallback tests */
type Writable<T> = { -readonly [K in keyof T]: T[K] };
const siteContact = site.contact as Writable<typeof site.contact>;
const siteLegal = site.legal as Writable<typeof site.legal>;
const original = { contact: { ...site.contact }, legal: { ...site.legal } };
const restoreSite = () => {
  Object.assign(siteContact, original.contact);
  Object.assign(siteLegal, original.legal);
};

describe("withSiteFallback: admin values over lib/site.ts, field by field", () => {
  after(restoreSite);

  it("an admin value wins, a missing one falls back to lib/site.ts, unknown stays null", () => {
    siteContact.phone = "+385 1 000 0000";
    siteContact.city = "Kodgrad";
    siteLegal.oib = "12345678903";
    const stored = settings.normalizeCompany({ contact: { phone: "+385 91 123 4567", email: "info@primjer.hr" } });
    const c = settings.withSiteFallback(stored);
    assert.equal(c.contact.phone, "+385 91 123 4567");
    assert.equal(c.contact.email, "info@primjer.hr");
    assert.equal(c.contact.city, "Kodgrad");
    assert.equal(c.legal.oib, "12345678903");
    assert.equal(c.contact.whatsapp, null);
    assert.equal(c.social.instagram, null);
    restoreSite();
  });

  it("an empty or blank admin value counts as not filled in", () => {
    siteContact.phone = "+385 1 000 0000";
    const c = settings.withSiteFallback(settings.normalizeCompany({ contact: { phone: "", email: "   ", city: 42 } }));
    assert.equal(c.contact.phone, "+385 1 000 0000");
    assert.equal(c.contact.email, null);
    assert.equal(c.contact.city, null);
    restoreSite();
  });

  it("never saved in admin: exactly lib/site.ts, every field present", () => {
    const c = settings.withSiteFallback(settings.normalizeCompany(null));
    assert.deepEqual(c, settings.siteCompanyDefaults());
    for (const group of Object.keys(settings.COMPANY_FIELDS) as (keyof typeof settings.COMPANY_FIELDS)[]) {
      for (const key of settings.COMPANY_FIELDS[group]) assert.ok(key in c[group], `${group}.${key}`);
    }
  });
});

describe("getPublicCompany", () => {
  it("without a database returns the lib/site.ts values and does not throw", async () => {
    const saved = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    try {
      assert.deepEqual(await data.getPublicCompany(), settings.siteCompanyDefaults());
    } finally {
      if (saved !== undefined) process.env.DATABASE_URL = saved;
    }
  });
});

describe("helpers for public pages", () => {
  const company = (contact: Record<string, string>) => settings.normalizeCompany({ contact });

  it("cityLineOf: 'Grad, Hrvatska' only once the city is known", () => {
    assert.equal(data.cityLineOf(company({ city: "Zagreb" })), "Zagreb, Hrvatska");
    assert.equal(data.cityLineOf(company({ address: "Ulica 1" })), null);
  });

  it("hasDirectContact: phone, WhatsApp or e-mail; an address or working hours alone are not enough", () => {
    assert.equal(data.hasDirectContact(company({ phone: "+385 91 123 4567" })), true);
    assert.equal(data.hasDirectContact(company({ whatsapp: "385911234567" })), true);
    assert.equal(data.hasDirectContact(company({ email: "info@primjer.hr" })), true);
    assert.equal(data.hasDirectContact(company({ address: "Ulica 1", city: "Zagreb", hours: "pon–pet 8–16 h" })), false);
    assert.equal(data.hasDirectContact(company({})), false);
  });

  it("publicContact: only the contact fields, as a plain serialisable object", () => {
    const c = settings.normalizeCompany({
      contact: { phone: "+385 91 123 4567", mapUrl: "https://maps.app.goo.gl/x" },
      legal: { oib: "12345678903", bank: "Banka d.d." },
    });
    const pub = data.publicContact(c);
    assert.deepEqual(Object.keys(pub).sort(), ["address", "city", "email", "hours", "mapUrl", "phone", "whatsapp"]);
    assert.equal(pub.phone, "+385 91 123 4567");
    assert.equal(pub.mapUrl, "https://maps.app.goo.gl/x");
    assert.deepEqual(JSON.parse(JSON.stringify(pub)), pub);
    assert.ok(!JSON.stringify(pub).includes("12345678903"));
  });
});

describe("inquiry links (lib/site.ts)", () => {
  it("the page decides the interest: /ormari → ormar, /interijeri → interijer, everything else kuhinja", () => {
    assert.equal(interestForPath("/ormari"), "ormar");
    assert.equal(interestForPath("/ormari/klizni"), "ormar");
    assert.equal(interestForPath("/interijeri"), "interijer");
    assert.equal(interestForPath("/"), "kuhinja");
    assert.equal(interestForPath("/kuhinje"), "kuhinja");
    assert.equal(interestForPath("/ormarici"), "kuhinja");
  });

  it("every link lands on the form (#upit), with the measurement wish only when asked", () => {
    assert.equal(inquiryHref("ormar"), "/kontakt?interes=ormar#upit");
    assert.equal(inquiryHref("kuhinja", { measurement: true }), "/kontakt?interes=kuhinja&izmjera=1#upit");
  });
});

describe("phone and WhatsApp links from the owner's numbers", () => {
  it("telHref keeps the number as typed but drops the trunk 0 after the country code", () => {
    assert.equal(telHref("+385 91 123 4567"), "tel:+385911234567");
    assert.equal(telHref("+385 (0)91 123 4567"), "tel:+385911234567");
    assert.equal(telHref("00385 (0)91 123 4567"), "tel:+385911234567");
    assert.equal(telHref("091 123 4567"), "tel:0911234567");
  });

  it("the WhatsApp field is saved in wa.me form without the trunk 0, and an older saved value is fixed in the link", () => {
    const form = (wa: string) => {
      const f = new FormData();
      f.set("contact.whatsapp", wa);
      return settings.parseCompanyForm(f);
    };
    for (const typed of ["+385 (0)91 123 4567", "091 123 4567", "00385 91 123 4567"]) {
      const r = form(typed);
      assert.ok(r.ok, typed);
      assert.equal(r.value.contact.whatsapp, "385911234567", typed);
    }
    assert.equal(form("123").ok, false);
    assert.equal(waHref("3850911234567"), "https://wa.me/385911234567");
  });
});

describe("LocalBusiness JSON-LD", () => {
  const nulls = (v: unknown): boolean =>
    v === null || v === "" || (Array.isArray(v) ? v.length === 0 || v.some(nulls) : typeof v === "object" && Object.values(v as object).some(nulls));

  it("with nothing known: valid JSON, no null or empty field, a business and a WebSite node", () => {
    const ld = JSON.parse(JSON.stringify(jsonLd.localBusinessData(settings.normalizeCompany(null))));
    assert.equal(nulls(ld), false);
    const types = ld["@graph"].map((n: { "@type": string }) => n["@type"]);
    assert.deepEqual(types, ["HomeAndConstructionBusiness", "WebSite"]);
    const [business, website] = ld["@graph"];
    assert.equal(business.telephone, undefined);
    assert.equal(business.sameAs, undefined);
    assert.equal(business.logo, `${site.url}/emna-logo-crni.png`);
    assert.deepEqual(business.address, { "@type": "PostalAddress", addressCountry: "HR" });
    assert.equal(website.name, "EMNA Interijeri");
    assert.equal(website.alternateName, "EMNA");
    assert.equal(website.url, site.url);
  });

  it("with the owner's data: telephone, e-mail, address and profiles, still no empty field", () => {
    const c = settings.normalizeCompany({
      contact: { phone: "+385 91 123 4567", email: "info@primjer.hr", address: "Ulica 1", city: "Zagreb" },
      social: { instagram: "https://www.instagram.com/emna/" },
    });
    const [business] = jsonLd.localBusinessData(c)["@graph"] as Record<string, unknown>[];
    assert.equal(nulls(business), false);
    assert.equal(business.telephone, "+385 91 123 4567");
    assert.equal(business.email, "info@primjer.hr");
    assert.deepEqual(business.address, {
      "@type": "PostalAddress",
      addressCountry: "HR",
      addressLocality: "Zagreb",
      streetAddress: "Ulica 1",
    });
    assert.deepEqual(business.sameAs, ["https://www.instagram.com/emna/"]);
  });
});
