/**
 * Ready-made messages the owner sends from his phone: a reply to an inquiry (WhatsApp / SMS on the lead page) and a
 * quote's link (WhatsApp on the quote page). Pure and client-safe; tested in lib/admin/whatsapp-text.test.ts.
 *
 *   toWhatsappDigits("091 123 4567")                      "385911234567"
 *   whatsappHref("385911234567", "Pozdrav")               "https://wa.me/385911234567?text=Pozdrav"
 *   smsHref("091 123 4567", "Pozdrav")                    "sms:+385911234567?&body=Pozdrav"
 */

/**
 * A phone number as WhatsApp's wa.me wants it: digits only, with the country code. Croatian numbers typed the local
 * way ("091 …") get 385; "00…" and "+385 (0)91 …" are cleaned up. Null when fewer than 8 digits are left.
 */
export function toWhatsappDigits(phone: string | null | undefined): string | null {
  const raw = (phone ?? "").trim();
  let d = raw.replace(/\D/g, "");
  if (raw.startsWith("+")) {
    // as typed: already international
  } else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = `385${d.slice(1)}`;
  if (d.startsWith("3850")) d = `385${d.slice(4)}`;
  return d.length >= 8 && d.length <= 15 ? d : null;
}

export const whatsappHref = (digits: string, text: string) => `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;

/** `?&body=` opens the text on both iOS and Android; null when the number is unusable */
export function smsHref(phone: string | null | undefined, text: string): string | null {
  const d = toWhatsappDigits(phone);
  return d ? `sms:+${d}?&body=${encodeURIComponent(text)}` : null;
}

const firstName = (name: string | null | undefined) => (name ?? "").trim().split(/\s+/)[0] ?? "";

/**
 * "Pozdrav Ivana, ovdje EMNA Interijeri. Zaprimili smo vaš upit U-2026-0007 za kuhinju iz 3D studija. Kada vam
 * odgovara da se čujemo oko izmjere?"
 */
export function leadReplyText({
  name,
  brand,
  number,
  source,
}: {
  name: string | null | undefined;
  brand: string;
  number: string;
  source: string;
}): string {
  const first = firstName(name);
  return [
    `Pozdrav${first ? ` ${first}` : ""}, ovdje ${brand}.`,
    `Zaprimili smo vaš upit ${number}${source === "studio" ? " za kuhinju iz 3D studija" : ""}.`,
    "Kada vam odgovara da se čujemo oko izmjere?",
  ].join(" ");
}

/**
 * "Dobar dan, Ana Kovač, šaljemo vam ponudu P-2026-0003: https://…" — the name as the owner wrote it on the quote. A
 * greeting that fits any customer: "Poštovani" would need the gender and the vocative of the name.
 * Without `url` it ends with a full stop (the system share sheet adds the link itself).
 */
export function quoteText({ name, number, url }: { name: string | null | undefined; number: string; url?: string }): string {
  const who = (name ?? "").replace(/\s+/g, " ").trim();
  return `Dobar dan${who ? `, ${who}` : ""}, šaljemo vam ponudu ${number}${url ? `: ${url}` : "."}`;
}
