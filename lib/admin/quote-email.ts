/**
 * Quote e-mails over Resend — optional, like the lead e-mails: they exist only when RESEND_API_KEY,
 * LEAD_EMAIL_FROM and LEAD_EMAIL_TO are set (lib/lead-server.ts getLeadEmailEnv).
 *
 *   isQuoteEmailConfigured()                → show "Pošalji kupcu e-mailom" or not
 *   await sendQuoteToCustomer({ … })        → the link to /ponuda/<token> (no attachments)
 *   await notifyOwnerOfAnswer({ … })        → "Ponuda P-2026-0001 je prihvaćena"
 *
 * Every value goes through esc() / attr() from lib/lead-email/shared.ts. Errors are reported by
 * name only — never with addresses or content.
 */
import "server-only";
import { Resend } from "resend";
import { getLeadEmailEnv } from "@/lib/lead-server";
import { C, FONT, button, esc, eyebrow, headline, layout, link, oneLine, paragraph, rows, rule, spacer } from "@/lib/lead-email/shared";
import { formatCents, formatLongDate } from "@/lib/admin/format";
import { site } from "@/lib/site";
import type { CompanyInfo } from "@/components/admin/quotes/model";

export function isQuoteEmailConfigured(): boolean {
  return getLeadEmailEnv() !== null;
}

export type SendResult = { ok: true } | { ok: false; error: "not_configured" | "send_failed" };

/** "Ivan" from "Ivan Horvat", letters only (it goes into a greeting) */
function greetingName(name: string): string {
  const first = oneLine(name).split(" ")[0] ?? "";
  return first.replace(/[^A-Za-zÀ-žČĆĐŠŽčćđšž'-]/g, "").slice(0, 30);
}

export interface QuoteMail {
  to: string;
  customerName: string;
  number: string;
  title: string;
  totalCents: number;
  validUntil: string | null;
  link: string;
  company: CompanyInfo;
}

export function renderQuoteMail(m: QuoteMail): { subject: string; html: string; text: string } {
  const brand = m.company.brand || site.name;
  const subject = `Ponuda ${m.number}${m.title ? ` · ${oneLine(m.title).slice(0, 80)}` : ""} · ${brand}`;
  const hi = greetingName(m.customerName);
  const greeting = hi ? `Poštovani/a ${hi},` : "Poštovani,";
  const total = formatCents(m.totalCents);
  const valid = m.validUntil ? formatLongDate(m.validUntil) : null;

  const header = `
${rule()}
${spacer(18)}
${eyebrow(`Ponuda ${m.number}`, C.accent)}
${spacer(14)}
${headline("Vaša ponuda")}
${spacer(18)}
<p style="margin:0;font-family:${FONT};font-size:16px;line-height:26px;color:#CFCAC1;">${esc(greeting)} pripremili smo ponudu${
    m.title ? ` za <span style="color:${C.fg};">${esc(oneLine(m.title))}</span>` : ""
  }. Možete je pregledati, ispisati i odgovoriti na nju jednim klikom.</p>`;

  const facts: Array<[string, string]> = [["Broj ponude", esc(m.number)], ["Ukupno s PDV-om", `<strong>${esc(total)}</strong>`]];
  if (valid) facts.push(["Vrijedi do", esc(valid)]);

  const contact = [
    m.company.phone ? `telefon ${link(`tel:${m.company.phone.replace(/[^\d+]/g, "")}`, m.company.phone)}` : null,
    m.company.email ? `e-mail ${link(`mailto:${m.company.email}`, m.company.email)}` : null,
  ].filter(Boolean);

  const body = `
${rows(facts)}
${spacer(28)}
${button(m.link, "Otvori ponudu", "ink", { block: true, big: true })}
${spacer(12)}
<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${C.mutPaper};text-align:center;">Poveznica je osobna — vodi samo do ove ponude.</div>
${spacer(32)}
${paragraph(
  contact.length
    ? `Imate pitanje ili želite izmjenu? Javite se na ${contact.join(" ili ")}, ili jednostavno odgovorite na ovaj e-mail.`
    : "Imate pitanje ili želite izmjenu? Jednostavno odgovorite na ovaj e-mail.",
  C.ink,
  15,
)}`;

  const footer = `<strong style="color:${C.ink};font-weight:600;">${esc(m.company.name)}</strong>${
    m.company.address ? ` · ${esc(oneLine(m.company.address))}` : ""
  }${m.company.oib ? ` · OIB ${esc(m.company.oib)}` : ""}<br>Ovu poruku ste primili jer vam je ${esc(brand)} pripremio ponudu.`;

  const html = layout({
    title: subject,
    preheader: `Ponuda ${m.number}: ukupno ${total}${valid ? `, vrijedi do ${valid}` : ""}.`,
    header,
    body,
    footer,
  });

  const text = [
    greeting,
    "",
    `pripremili smo ponudu${m.title ? ` za ${oneLine(m.title)}` : ""}. Možete je pregledati, ispisati i odgovoriti na nju na poveznici:`,
    m.link,
    "",
    `Broj ponude: ${m.number}`,
    `Ukupno s PDV-om: ${total}`,
    ...(valid ? [`Vrijedi do: ${valid}`] : []),
    "",
    "Imate pitanje ili želite izmjenu? Odgovorite na ovaj e-mail.",
    "",
    m.company.name,
  ].join("\n");

  return { subject, html, text };
}

/** sends the quote link to the customer; reply-to is the owner's inbox */
export async function sendQuoteToCustomer(m: QuoteMail): Promise<SendResult> {
  const env = getLeadEmailEnv();
  if (!env) return { ok: false, error: "not_configured" };
  const { subject, html, text } = renderQuoteMail(m);
  try {
    const res = await new Resend(env.apiKey).emails.send({
      from: env.from,
      to: [m.to],
      replyTo: env.to[0],
      subject,
      html,
      text,
      tags: [{ name: "type", value: "quote" }],
    });
    if (res.error) {
      console.error(`[ponude] ${m.number}: e-mail kupcu nije poslan (${res.error.name ?? "resend_error"})`);
      return { ok: false, error: "send_failed" };
    }
    return { ok: true };
  } catch (err) {
    console.error(`[ponude] ${m.number}: e-mail kupcu nije poslan (${err instanceof Error ? err.name : "unknown"})`);
    return { ok: false, error: "send_failed" };
  }
}

/** tells the owner that the customer accepted / rejected (best effort, never throws) */
export async function notifyOwnerOfAnswer(a: {
  number: string;
  status: "prihvacena" | "odbijena";
  customerName: string;
  confirmedBy: string;
  reason?: string | null;
  totalCents: number;
  leadNumber: string | null;
  adminUrl: string;
}): Promise<void> {
  const env = getLeadEmailEnv();
  if (!env) return;
  const accepted = a.status === "prihvacena";
  const verb = accepted ? "prihvaćena" : "odbijena";
  const subject = `Ponuda ${a.number} je ${verb} · ${oneLine(a.customerName).slice(0, 80)}`;

  // plain values; escaped for the HTML version only
  const facts: Array<[string, string]> = [
    ["Ponuda", a.number],
    ["Kupac", oneLine(a.customerName)],
    [accepted ? "Potvrdio/la" : "Odgovorio/la", oneLine(a.confirmedBy)],
    ["Ukupno s PDV-om", formatCents(a.totalCents)],
  ];
  if (a.leadNumber) facts.push(["Upit", a.leadNumber]);
  if (a.reason) facts.push(["Razlog", oneLine(a.reason)]);

  const html = layout({
    title: subject,
    preheader: `${oneLine(a.customerName)} je ${accepted ? "prihvatio/la" : "odbio/la"} ponudu ${a.number}.`,
    header: `${rule()}${spacer(18)}${eyebrow(accepted ? "Ponuda prihvaćena" : "Ponuda odbijena", C.accent)}${spacer(14)}${headline(a.number)}`,
    body: `${rows(facts.map(([l, v]) => [l, esc(v)]))}${spacer(28)}${button(a.adminUrl, "Otvori ponudu u administraciji", "ink", { block: true })}`,
    footer: `${esc(site.name)} · administracija`,
  });
  const text = [
    `Ponuda ${a.number} je ${verb}.`,
    "",
    ...facts.map(([l, v]) => `${l}: ${v}`),
    "",
    a.adminUrl,
  ].join("\n");

  try {
    const res = await new Resend(env.apiKey).emails.send({
      from: env.from,
      to: env.to,
      subject,
      html,
      text,
      tags: [{ name: "type", value: "quote_answer" }],
    });
    if (res.error) console.error(`[ponude] ${a.number}: obavijest vlasniku nije poslana (${res.error.name ?? "resend_error"})`);
  } catch (err) {
    console.error(`[ponude] ${a.number}: obavijest vlasniku nije poslana (${err instanceof Error ? err.name : "unknown"})`);
  }
}
