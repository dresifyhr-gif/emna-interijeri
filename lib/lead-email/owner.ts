/** E-mail to the owner: everything about the inquiry, with one-tap call / reply / open-in-3D. */
import { site, telHref } from "@/lib/site";
import {
  C,
  FONT,
  type LeadEmailData,
  type RenderedEmail,
  button,
  esc,
  escMultiline,
  eyebrow,
  formatDate,
  headline,
  layout,
  link,
  oneLine,
  paragraph,
  rows,
  rule,
  shortUrl,
  siteHost,
  snapshotImage,
  sourceLabel,
  spacer,
  splitLine,
  textRows,
  textRule,
} from "./shared";

export function ownerEmail(d: LeadEmailData): RenderedEmail {
  const { lead } = d;
  const name = oneLine(lead.name);
  const phone = oneLine(lead.phone);
  const email = lead.email.trim();
  const source = sourceLabel[lead.source];
  const received = formatDate(d.receivedAt);
  const summary = (lead.summary ?? []).map(oneLine).filter(Boolean);
  const isStudio = lead.source === "studio";

  const subject = `Novi upit · ${source} · ${name}`;

  /* ---------------- header */
  const replyHref = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(`Vaš upit · ${site.name}`)}`;
  const header = `
${rule()}
${spacer(18)}
${eyebrow(`Novi upit · ${source}`, C.accent)}
${spacer(14)}
${headline(name)}
${spacer(12)}
<div style="font-family:${FONT};font-size:13px;line-height:20px;color:${C.mut};">Primljeno ${esc(received)}</div>
${spacer(28)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
  <td class="stack" valign="top">${button(telHref(phone), `Nazovi ${phone}`, "accent")}</td>
  <td class="stack stack-gap" valign="top" style="padding-left:10px;">${button(replyHref, "Odgovori e-mailom", "ghost")}</td>
</tr></table>`;

  /* ---------------- studio block */
  let studio = "";
  if (isStudio && (d.snapshotCid || d.price || d.configUrl || summary.length)) {
    const priceRow = d.price
      ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
  <td valign="bottom" style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${C.mutPaper};padding-bottom:4px;">Okvirna cijena</td>
  <td valign="bottom" align="right" style="font-family:${FONT};font-size:26px;line-height:30px;font-weight:700;letter-spacing:-0.5px;color:${C.ink};white-space:nowrap;">${esc(d.price)}</td>
</tr></table>${spacer(4)}<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${C.mutPaper};">Izračun iz studija prema kupčevu odabiru — nije ponuda.</div>`
      : "";

    studio = `
${eyebrow("Kuhinja iz 3D studija", C.accentDeep)}
${spacer(16)}
${d.snapshotCid ? `${snapshotImage(d.snapshotCid, `3D prikaz kuhinje — ${name}`)}${spacer(24)}` : ""}
${priceRow ? `${priceRow}${spacer(24)}` : ""}
${
  d.configUrl
    ? `${button(d.configUrl, "Otvori kuhinju u 3D", "ink", { block: true, big: true })}${spacer(10)}
<div style="font-family:${FONT};font-size:12px;line-height:18px;color:${C.mutPaper};text-align:center;word-break:break-all;">${link(d.configUrl, shortUrl(d.configUrl), C.mutPaper)}</div>${spacer(32)}`
    : ""
}
${
  summary.length
    ? `${eyebrow("Sažetak konfiguracije")}${spacer(12)}${rows(
        summary.map((line) => {
          const { label, value } = splitLine(line);
          return [label, esc(value)];
        }),
      )}${spacer(36)}`
    : ""
}`;
  }

  /* ---------------- contact */
  const contact: Array<{ label: string; plain: string; html: string }> = [
    { label: "Ime i prezime", plain: name, html: esc(name) },
    { label: "Telefon", plain: phone, html: link(telHref(phone), phone) },
    { label: "E-mail", plain: email, html: link(`mailto:${email}`, email) },
  ];
  const optional: Array<[string, string | undefined]> = [
    ["Grad", lead.city],
    ["Interes", lead.interest],
    ["Kada planira", lead.timeline],
  ];
  for (const [label, value] of optional) {
    const v = value ? oneLine(value) : "";
    if (v) contact.push({ label, plain: v, html: esc(v) });
  }
  contact.push({ label: "Izvor", plain: source, html: esc(source) });

  const message = lead.message?.trim()
    ? `${spacer(36)}${eyebrow("Poruka")}${spacer(14)}
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;"><tr>
  <td style="border-left:2px solid ${C.accent};padding:2px 0 2px 18px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.ink};">${escMultiline(lead.message.trim())}</td>
</tr></table>`
    : "";

  const body = `
${studio}
${eyebrow("Kontakt", C.accentDeep)}
${spacer(12)}
${rows(contact.map((c) => [c.label, c.html]))}
${message}
${spacer(36)}
${paragraph(
  `Odgovor na ovaj e-mail ide izravno kupcu (${esc(email)}).${
    d.configAttached ? " Tehnički zapis konfiguracije nalazi se u privitku (JSON)." : ""
  }`,
  C.mutPaper,
  13,
)}`;

  const footer = `Upit poslan putem stranice ${esc(siteHost)} · ${esc(source)} · ${esc(received)}`;

  const html = layout({
    title: subject,
    preheader: `${name} · ${phone}${d.price ? ` · okvirno ${d.price}` : ""}`,
    header,
    body,
    footer,
  });

  /* ---------------- plain text */
  const text = [
    `NOVI UPIT · ${source.toUpperCase()}`,
    `Primljeno ${received}`,
    "",
    textRows(contact.map((c) => [c.label, c.plain])),
    "",
    ...(isStudio && d.price ? [`Okvirna cijena: ${d.price} (izračun iz studija, nije ponuda)`, ""] : []),
    ...(d.configUrl ? ["Otvori kuhinju u 3D:", d.configUrl, ""] : []),
    ...(summary.length ? ["SAŽETAK KONFIGURACIJE", textRule, ...summary, ""] : []),
    ...(lead.message?.trim() ? ["PORUKA", textRule, lead.message.trim(), ""] : []),
    `Odgovor na ovaj e-mail ide izravno kupcu (${email}).`,
    d.snapshotCid ? "3D prikaz kuhinje nalazi se u privitku." : "",
  ]
    .filter((l, i, a) => !(l === "" && a[i - 1] === ""))
    .join("\n");

  return { subject, html, text };
}
