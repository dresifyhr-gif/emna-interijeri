/**
 * Confirmation to the customer: thanks, what happens next, their kitchen (studio) and their details.
 *
 * The recipient address is unverified, so nothing the submitter typed is echoed back except a
 * letters-only first name — otherwise the form becomes a relay for phishing from our domain.
 * The kitchen block (summary, price, link) is rebuilt server-side by lib/lead-server.ts.
 */
import { site, telHref } from "@/lib/site";
import {
  C,
  FONT,
  type LeadEmailData,
  type RenderedEmail,
  button,
  esc,
  eyebrow,
  firstName,
  headline,
  layout,
  link,
  oneLine,
  paragraph,
  rows,
  rule,
  siteHost,
  snapshotImage,
  spacer,
  splitLine,
  textRule,
} from "./shared";

const STEPS: Array<[title: string, text: string]> = [
  ["Javimo se", "Pregledamo upit i javimo vam se telefonom ili e-mailom da potvrdimo detalje i dogovorimo izmjeru."],
  ["Izmjera", "Prostor mjerimo na licu mjesta — zidove, visine i sve što utječe na projekt."],
  ["3D projekt i ponuda", "Na temelju izmjere pripremamo 3D projekt i točnu ponudu."],
];

export function customerEmail(d: LeadEmailData): RenderedEmail {
  const { lead } = d;
  const first = firstName(oneLine(lead.name))
    .replace(/[^\p{L}'-]/gu, "")
    .slice(0, 30);
  const thanks = first ? `Hvala, ${first}.` : "Hvala.";
  const summary = (lead.summary ?? []).map(oneLine).filter(Boolean);
  const isStudio = lead.source === "studio";
  const brand = site.name;

  // server-generated ("U-2026-0001"), so it is safe to echo; anything else is dropped
  const number = d.leadNumber && /^[A-Z]-\d{4}-\d{4,6}$/.test(d.leadNumber) ? d.leadNumber : null;
  const subject = `Primili smo vaš upit${number ? ` ${number}` : ""} · ${brand}`;

  /* ---------------- header */
  const header = `
${rule()}
${spacer(18)}
${eyebrow("Upit je zaprimljen", C.accent)}
${spacer(14)}
${headline(thanks)}
${spacer(18)}
<p style="margin:0;font-family:${FONT};font-size:16px;line-height:26px;color:#CFCAC1;">${
    isStudio ? "Vaš upit s kuhinjom iz 3D studija stigao je do nas." : "Vaš upit je stigao do nas."
  } Pregledat ćemo ga i javiti vam se telefonom ili e-mailom.</p>${
    number
      ? `${spacer(14)}<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${C.mut};">Broj upita: <span style="color:${C.fg};letter-spacing:0.5px;">${esc(number)}</span></div>`
      : ""
  }`;

  /* ---------------- steps */
  const steps = `
${eyebrow("Što slijedi", C.accentDeep)}
${spacer(8)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
${STEPS.map(
  ([title, text], i) => `<tr>
  <td valign="top" style="width:44px;padding:16px 0;border-top:1px solid ${C.line};font-family:${FONT};font-size:12px;line-height:22px;font-weight:600;letter-spacing:1.5px;color:${C.accentDeep};">0${i + 1}</td>
  <td valign="top" style="padding:16px 0;border-top:1px solid ${C.line};">
    <div style="font-family:${FONT};font-size:16px;line-height:22px;font-weight:600;color:${C.ink};">${esc(title)}</div>
    <div style="font-family:${FONT};font-size:14px;line-height:22px;color:${C.mutPaper};padding-top:4px;">${esc(text)}</div>
  </td>
</tr>`,
).join("")}
</table>`;

  /* ---------------- their kitchen */
  let kitchen = "";
  if (isStudio && (d.snapshotCid || d.price || d.configUrl || summary.length)) {
    kitchen = `
${spacer(44)}
${eyebrow("Vaša kuhinja", C.accentDeep)}
${spacer(16)}
${d.snapshotCid ? `${snapshotImage(d.snapshotCid, "3D prikaz vaše kuhinje")}${spacer(24)}` : ""}
${
  d.price
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
  <td valign="bottom" style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${C.mutPaper};padding-bottom:4px;">Okvirna cijena</td>
  <td valign="bottom" align="right" style="font-family:${FONT};font-size:26px;line-height:30px;font-weight:700;letter-spacing:-0.5px;color:${C.ink};white-space:nowrap;">${esc(d.price)}</td>
</tr></table>${spacer(6)}${paragraph("Raspon prema vašem odabiru u studiju. Točnu cijenu dajemo nakon izmjere.", C.mutPaper, 13)}${spacer(24)}`
    : ""
}
${
  summary.length
    ? `${rows(
        summary.map((line) => {
          const { label, value } = splitLine(line);
          return [label, esc(value)];
        }),
      )}${spacer(28)}`
    : ""
}
${
  d.configUrl
    ? `${button(d.configUrl, "Otvori svoju kuhinju u 3D", "ink", { block: true, big: true })}${spacer(12)}
<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${C.mutPaper};text-align:center;">Link čuva vašu kuhinju — možete je otvoriti, doraditi i poslati ponovno.</div>`
    : ""
}`;
  }

  /* ---------------- company contact (only real values from lib/site.ts) */
  const { phone: ourPhone, email: ourEmail } = site.contact;
  const reach: string[] = [];
  if (ourPhone) reach.push(`telefon ${link(telHref(ourPhone), ourPhone)}`);
  if (ourEmail) reach.push(`e-mail ${link(`mailto:${ourEmail}`, ourEmail)}`);
  const reachHtml = reach.length
    ? `Trebate nas prije toga? Javite se na ${reach.join(" ili ")}, ili jednostavno odgovorite na ovaj e-mail.`
    : "Želite li nešto dodati, jednostavno odgovorite na ovaj e-mail.";

  const body = `
${steps}
${kitchen}
${spacer(40)}
${paragraph("Ako ste nešto krivo upisali u upitu, odgovorite na ovaj e-mail pa ćemo ispraviti.", C.mutPaper, 13)}
${spacer(28)}
${paragraph(reachHtml, C.ink, 15)}`;

  const company = site.legal.companyName ?? brand;
  const footerLine = [esc(site.tagline), site.contact.city ? esc(site.contact.city) : null].filter(Boolean).join(" · ");
  const footer = `<strong style="color:${C.ink};font-weight:600;">${esc(company)}</strong> · ${footerLine}<br>
${link(site.url, siteHost, C.mutPaper)} · ${link(`${site.url.replace(/\/$/, "")}/privatnost`, "Politika privatnosti", C.mutPaper)}<br>
Ovu poruku ste primili jer ste poslali upit putem naše web stranice.`;

  const html = layout({
    title: subject,
    preheader: isStudio ? "Vaša kuhinja je kod nas. Javit ćemo vam se da dogovorimo izmjeru." : "Vaš upit je kod nas. Javit ćemo vam se uskoro.",
    header,
    body,
    footer,
  });

  /* ---------------- plain text */
  const plainReach = [ourPhone ? `telefon ${ourPhone}` : null, ourEmail ? `e-mail ${ourEmail}` : null].filter(Boolean);
  const text = [
    thanks,
    "",
    `${isStudio ? "Vaš upit s kuhinjom iz 3D studija stigao je do nas." : "Vaš upit je stigao do nas."} Pregledat ćemo ga i javiti vam se telefonom ili e-mailom.`,
    ...(number ? [`Broj upita: ${number}`] : []),
    "",
    "ŠTO SLIJEDI",
    textRule,
    ...STEPS.map(([t, x], i) => `0${i + 1} ${t} — ${x}`),
    "",
    ...(isStudio && d.price ? [`Okvirna cijena: ${d.price} (prema odabiru u studiju; točnu cijenu dajemo nakon izmjere)`, ""] : []),
    ...(isStudio && summary.length ? ["VAŠA KUHINJA", textRule, ...summary, ""] : []),
    ...(d.configUrl ? ["Otvori svoju kuhinju u 3D:", d.configUrl, ""] : []),
    "Ako ste nešto krivo upisali u upitu, odgovorite na ovaj e-mail pa ćemo ispraviti.",
    "",
    plainReach.length
      ? `Trebate nas prije toga? ${plainReach.join(" ili ")} — ili odgovorite na ovaj e-mail.`
      : "Želite li nešto dodati, odgovorite na ovaj e-mail.",
    "",
    `${company} · ${site.url}`,
  ].join("\n");

  return { subject, html, text };
}
