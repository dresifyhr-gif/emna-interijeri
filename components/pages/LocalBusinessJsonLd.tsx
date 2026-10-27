import type { CompanySettings } from "@/lib/admin/settings";
import { site } from "@/lib/site";
import { JsonLd } from "./JsonLd";

/**
 * schema.org structured data for every public page: the business (HomeAndConstructionBusiness) and the website (the
 * name Google shows in results), as one @graph. Built only from known facts — the company data comes from
 * getPublicCompany(), and unknown (null) fields are left out entirely, nothing is guessed.
 * Mounted once, in app/(site)/layout.tsx.
 */
export function localBusinessData(company: CompanySettings) {
  const { contact, legal, social } = company;
  const businessId = `${site.url}/#tvrtka`;

  const address: Record<string, string> = {
    "@type": "PostalAddress",
    addressCountry: "HR",
  };
  if (contact.city) address.addressLocality = contact.city;
  if (contact.address) address.streetAddress = contact.address;

  const business: Record<string, unknown> = {
    "@type": "HomeAndConstructionBusiness",
    "@id": businessId,
    name: site.name,
    description: site.description,
    url: site.url,
    logo: `${site.url}/emna-logo-crni.png`,
    image: `${site.url}/og-image.jpg`,
    address,
  };

  if (legal.companyName) business.legalName = legal.companyName;
  if (legal.oib) business.taxID = legal.oib;
  if (contact.phone) business.telephone = contact.phone;
  if (contact.email) business.email = contact.email;
  if (contact.mapUrl) business.hasMap = contact.mapUrl;
  // only when written in schema.org form, e.g. "Mo-Fr 08:00-16:00"
  if (contact.hours && /^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(contact.hours)) business.openingHours = contact.hours;

  const sameAs = [social.instagram, social.facebook].filter((v): v is string => Boolean(v));
  if (sameAs.length) business.sameAs = sameAs;

  const website = {
    "@type": "WebSite",
    "@id": `${site.url}/#web`,
    name: site.name,
    alternateName: site.short,
    url: site.url,
    inLanguage: "hr",
    publisher: { "@id": businessId },
  };

  return { "@context": "https://schema.org", "@graph": [business, website] };
}

export function LocalBusinessJsonLd({ company }: { company: CompanySettings }) {
  return <JsonLd data={localBusinessData(company)} />;
}
