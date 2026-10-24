import { site } from "@/lib/site";
import { JsonLd } from "./JsonLd";

/**
 * schema.org LocalBusiness for EMNA, built only from facts present in lib/site.ts.
 * Unknown (null) fields are left out entirely — nothing is guessed.
 * Mount once, e.g. in app/(site)/layout.tsx or on the homepage.
 */
export function localBusinessData() {
  const { contact, legal, social } = site;

  const address: Record<string, string> = {
    "@type": "PostalAddress",
    addressCountry: "HR",
  };
  if (contact.city) address.addressLocality = contact.city;
  if (contact.address) address.streetAddress = contact.address;

  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "HomeAndConstructionBusiness",
    "@id": `${site.url}/#tvrtka`,
    name: site.name,
    description: site.description,
    url: site.url,
    image: `${site.url}/og-image.jpg`,
    address,
  };

  if (legal.companyName) data.legalName = legal.companyName;
  if (legal.oib) data.taxID = legal.oib;
  if (contact.phone) data.telephone = contact.phone;
  if (contact.email) data.email = contact.email;
  if (contact.mapUrl) data.hasMap = contact.mapUrl;
  // only when written in schema.org form, e.g. "Mo-Fr 08:00-16:00"
  if (contact.hours && /^(Mo|Tu|We|Th|Fr|Sa|Su)/.test(contact.hours)) data.openingHours = contact.hours;

  const sameAs = [social.instagram, social.facebook].filter((v): v is string => Boolean(v));
  if (sameAs.length) data.sameAs = sameAs;

  return data;
}

export function LocalBusinessJsonLd() {
  return <JsonLd data={localBusinessData()} />;
}
