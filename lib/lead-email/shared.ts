/**
 * Building blocks for the lead e-mails (owner notification + customer confirmation).
 *
 * E-mail HTML is deliberately old-school: tables, inline styles, web-safe fonts.
 * Every value that came from the visitor goes through `esc()` (or `attr()` for
 * hrefs) before it touches the markup.
 */
import type { LeadInput } from "@/lib/lead-schema";
import { site } from "@/lib/site";

/** brand tokens (mirror of tailwind.config.ts) */
export const C = {
  ink: "#0B0B0C",
  ink700: "#111113",
  ink600: "#18181B",
  paper: "#EEEAE3",
  paperDark: "#E4DED3",
  line: "#CFC7B9",
  fg: "#F2EFE9",
  mut: "#8F897E",
  mutPaper: "#6D675D",
  accent: "#C9B99A",
  accentDeep: "#8A7A5C",
  rule: "#2A2926",
} as const;

export const FONT = "'Helvetica Neue',Helvetica,Arial,sans-serif";

/** everything the templates need, already validated and normalised by lib/lead-server.ts */
export interface LeadEmailData {
  lead: LeadInput;
  receivedAt: Date;
  /** absolute link back into the studio, always on our own origin (or null) */
  configUrl: string | null;
  /** "8.400 – 10.900 €" or null */
  price: string | null;
  /** cid of the inline 3D snapshot attachment, or null when there is no (valid) snapshot */
  snapshotCid: string | null;
  /** true when the raw KitchenConfig is attached as JSON (owner mail only) */
  configAttached: boolean;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export const sourceLabel: Record<LeadInput["source"], string> = {
  studio: "3D studio",
  kontakt: "Kontakt forma",
};

/* ------------------------------------------------------------------ text */

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

/** HTML-escape untrusted text */
export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (ch) => ESC[ch]);
}

/** escaped text with line breaks preserved */
export function escMultiline(value: string): string {
  return esc(value.replace(/\r\n?/g, "\n")).replace(/\n/g, "<br>");
}

/** escape a URL for an href attribute; only http(s), mailto and tel survive */
export function attr(url: string): string {
  return /^(https?:|mailto:|tel:)/i.test(url) ? esc(url) : "#";
}

/** collapse whitespace / line breaks (subjects, headers, single-line fields) */
export function oneLine(value: string): string {
  return value.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
}

export function firstName(name: string): string {
  return oneLine(name).split(" ")[0] || oneLine(name);
}

const dateFmt = new Intl.DateTimeFormat("hr-HR", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Zagreb" });
export const formatDate = (d: Date) => dateFmt.format(d);

const numFmt = new Intl.NumberFormat("hr-HR", { maximumFractionDigits: 0 });

/** "8.400 – 10.900 €" — null for missing or nonsensical input */
export function formatPrice(p: LeadInput["price"]): string | null {
  if (!p || !Number.isFinite(p.low) || !Number.isFinite(p.high)) return null;
  const lo = Math.round(Math.min(p.low, p.high));
  const hi = Math.round(Math.max(p.low, p.high));
  if (hi <= 0) return null;
  return lo === hi ? `${numFmt.format(hi)} €` : `${numFmt.format(Math.max(lo, 0))} – ${numFmt.format(hi)} €`;
}

/** "Oblik: L" → { label: "Oblik", value: "L" } so summary lines can render as a two-column table */
export function splitLine(line: string): { label: string | null; value: string } {
  const m = /^([^:]{1,40}):\s+(.+)$/.exec(oneLine(line));
  return m ? { label: m[1], value: m[2] } : { label: null, value: oneLine(line) };
}

/** short, readable form of a long studio link for display (the href stays complete) */
export function shortUrl(url: string): string {
  try {
    const u = new URL(url);
    const full = `${u.host}${u.pathname}${u.search}`;
    return full.length > 56 ? `${full.slice(0, 55)}…` : full;
  } catch {
    return url.slice(0, 56);
  }
}

export const siteHost = (() => {
  try {
    return new URL(site.url).host;
  } catch {
    return site.url;
  }
})();

/* ------------------------------------------------------------------ html blocks */

export function eyebrow(text: string, color: string = C.mutPaper): string {
  return `<div style="font-family:${FONT};font-size:11px;line-height:16px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:${color};">${esc(text)}</div>`;
}

export function spacer(h: number): string {
  return `<div style="height:${h}px;line-height:${h}px;font-size:1px;">&#8202;</div>`;
}

/** short accent rule — the "technical drawing" motif */
export function rule(color: string = C.accent, width = 40): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td style="width:${width}px;height:1px;line-height:1px;font-size:1px;background:${color};">&#8202;</td></tr></table>`;
}

type ButtonTone = "accent" | "ink" | "ghost";

/** bulletproof pill button */
export function button(href: string, label: string, tone: ButtonTone, opts: { block?: boolean; big?: boolean } = {}): string {
  const bg = tone === "accent" ? C.accent : tone === "ink" ? C.ink : "transparent";
  const color = tone === "accent" ? C.ink : C.fg;
  const border = tone === "ghost" ? `border:1px solid #4A4842;` : `border:1px solid ${bg};`;
  const pad = opts.big ? "19px 32px" : "13px 22px";
  const size = opts.big ? 15 : 13;
  const width = opts.block ? ` width="100%" style="width:100%;"` : "";
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"${width}><tr><td align="center" style="border-radius:999px;background:${bg};${border}"><a href="${attr(href)}" target="_blank" style="display:${opts.block ? "block" : "inline-block"};padding:${pad};font-family:${FONT};font-size:${size}px;line-height:18px;font-weight:600;letter-spacing:0.4px;color:${color};text-decoration:none;border-radius:999px;text-align:center;">${esc(label)}&nbsp;&nbsp;&rarr;</a></td></tr></table>`;
}

/** label / value rows separated by hairlines; values are already-safe HTML */
export function rows(items: Array<[label: string | null, valueHtml: string]>): string {
  const body = items
    .map(
      ([label, value]) => `<tr>
  <td valign="top" class="row-l" style="padding:13px 16px 13px 0;border-top:1px solid ${C.line};width:36%;font-family:${FONT};font-size:11px;line-height:18px;font-weight:600;letter-spacing:1.6px;text-transform:uppercase;color:${C.mutPaper};">${label ? esc(label) : "&nbsp;"}</td>
  <td valign="top" class="row-v" style="padding:12px 0;border-top:1px solid ${C.line};font-family:${FONT};font-size:15px;line-height:21px;color:${C.ink};">${value}</td>
</tr>`,
    )
    .join("");
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-bottom:1px solid ${C.line};">${body}</table>`;
}

export function link(href: string, label: string, color: string = C.ink): string {
  return `<a href="${attr(href)}" style="color:${color};text-decoration:underline;text-decoration-color:${C.line};">${esc(label)}</a>`;
}

export function paragraph(html: string, color: string = C.ink, size = 15): string {
  return `<p style="margin:0;font-family:${FONT};font-size:${size}px;line-height:${Math.round(size * 1.6)}px;color:${color};">${html}</p>`;
}

function wordmark(): string {
  const sub = site.name.replace(site.short, "").trim() || site.tagline;
  return `<div style="font-family:${FONT};font-size:17px;line-height:18px;font-weight:500;letter-spacing:7px;color:${C.fg};">${esc(site.short)}</div>
<div style="font-family:${FONT};font-size:8px;line-height:10px;font-weight:600;letter-spacing:4px;text-transform:uppercase;color:${C.mut};padding-top:5px;">${esc(sub)}</div>`;
}

/** the full document: dark header band, paper body, quiet footer */
export function layout(opts: { title: string; preheader: string; header: string; body: string; footer: string }): string {
  return `<!doctype html>
<html lang="hr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(opts.title)}</title>
<style>
  @media (max-width:620px){
    .px{padding-left:24px!important;padding-right:24px!important}
    .h1{font-size:34px!important;line-height:36px!important}
    .row-l{display:block!important;width:100%!important;padding:12px 0 0!important}
    .row-v{display:block!important;width:100%!important;border-top:0!important;padding:4px 0 12px!important}
    .stack{display:block!important;width:100%!important}
    .stack-gap{padding-top:10px!important;padding-left:0!important}
  }
  a{color:inherit}
</style>
</head>
<body style="margin:0;padding:0;background:${C.paperDark};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${esc(opts.preheader)}&#8202;&zwnj;&nbsp;&#8202;&zwnj;&nbsp;&#8202;&zwnj;&nbsp;</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;background:${C.paperDark};">
<tr><td align="center" style="padding:28px 12px 40px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
    <tr><td class="px" style="background:${C.ink};padding:36px 44px 44px;border-radius:6px 6px 0 0;">
      ${wordmark()}
      ${spacer(48)}
      ${opts.header}
    </td></tr>
    <tr><td class="px" style="background:${C.paper};padding:40px 44px 44px;">
      ${opts.body}
    </td></tr>
    <tr><td class="px" style="background:${C.paper};padding:0 44px 36px;border-radius:0 0 6px 6px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border-top:1px solid ${C.line};padding-top:22px;font-family:${FONT};font-size:12px;line-height:19px;color:${C.mutPaper};">
        ${opts.footer}
      </td></tr></table>
    </td></tr>
  </table>
</td></tr>
</table>
</body>
</html>`;
}

/** headline used in both headers */
export function headline(text: string): string {
  return `<h1 class="h1" style="margin:0;font-family:${FONT};font-size:42px;line-height:44px;font-weight:700;letter-spacing:-1px;text-transform:uppercase;color:${C.fg};">${esc(text)}</h1>`;
}

/** the 3D snapshot, inline via cid */
export function snapshotImage(cid: string, alt: string): string {
  return `<img src="cid:${esc(cid)}" alt="${esc(alt)}" width="512" style="display:block;width:100%;max-width:512px;height:auto;border:0;border-radius:4px;background:${C.ink700};font-family:${FONT};font-size:13px;color:${C.mut};">`;
}

/** plain-text helpers */
export const textRule = "————————————————————————";
export function textRows(items: Array<[string | null, string]>): string {
  return items.map(([l, v]) => (l ? `${l}: ${v}` : v)).join("\n");
}
