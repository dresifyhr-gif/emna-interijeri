/**
 * The quote as a document — one A4 sheet design for the admin print view (/admin/ponude/<id>/ispis)
 * and the customer's page (/ponuda/<token>). Server-safe (no hooks); data comes in ready to show.
 *
 * Print: render <QuotePrintStyles /> once on the page. It hides everything except `.quote-sheet`,
 * sets A4 margins and keeps rows and the totals block from splitting across pages.
 */
import type { ReactNode } from "react";
import { formatCents, formatDate, formatLongDate } from "@/lib/admin/format";
import { lineTotalCents, quoteTotals } from "@/lib/admin/quote-math";
import { QUOTE_STATUS_LABEL } from "@/lib/admin/status";
import { formatPct, formatQty, type QuoteDocumentData } from "./model";

const PRINT_CSS = `
@page { size: A4; margin: 14mm 14mm 16mm; }
@page { @bottom-right { content: counter(page) " / " counter(pages); font: 8pt sans-serif; color: #8a8478; } }
@media print {
  html, body { background: #fff !important; color: #0b0b0c !important; }
  body * { visibility: hidden !important; }
  .quote-sheet, .quote-sheet * { visibility: visible !important; }
  .quote-sheet {
    position: absolute !important; left: 0 !important; top: 0 !important;
    width: 100% !important; max-width: none !important; margin: 0 !important; padding: 0 !important;
    box-shadow: none !important; border: 0 !important; border-radius: 0 !important; background: #fff !important;
  }
  .quote-sheet .q-avoid { break-inside: avoid; page-break-inside: avoid; }
  .quote-sheet thead { display: table-header-group; }
  .quote-sheet tr { break-inside: avoid; page-break-inside: avoid; }
  .quote-sheet a { color: inherit !important; text-decoration: none !important; }
  .no-print { display: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

/** print rules for the sheet — static CSS, no user data */
export function QuotePrintStyles() {
  return <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />;
}

function Label({ children }: { children: ReactNode }) {
  return <p className="mb-2 text-[9.5px] font-semibold uppercase tracking-[0.24em] text-[#8A7A5C]">{children}</p>;
}

function Lines({ lines }: { lines: Array<string | null | undefined | false> }) {
  const shown = lines.filter((l): l is string => typeof l === "string" && l.trim() !== "");
  return (
    <>
      {shown.map((l, i) => (
        <span key={i} className="block whitespace-pre-line">
          {l}
        </span>
      ))}
    </>
  );
}

/** the technical-drawing motif: a dimension line with ticks at both ends */
function DimensionRule({ label }: { label?: string }) {
  return (
    <div aria-hidden className="flex items-center gap-2 text-[#8A7A5C]">
      <span className="h-3 w-px rotate-45 bg-current" />
      <span className="h-px flex-1 bg-current opacity-50" />
      {label && <span className="text-[9px] font-medium uppercase tracking-[0.3em]">{label}</span>}
      {label && <span className="h-px flex-1 bg-current opacity-50" />}
      <span className="h-3 w-px rotate-45 bg-current" />
    </div>
  );
}

function StatusStamp({ data }: { data: QuoteDocumentData }) {
  if (data.status === "prihvacena") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-700/40 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-800">
        Prihvaćeno{data.acceptedAt ? ` ${formatDate(data.acceptedAt)}` : ""}
      </span>
    );
  }
  if (data.status === "nacrt" || data.status === "istekla" || data.status === "odbijena") {
    return (
      <span className="inline-flex items-center rounded-full border border-[#CFC7B9] px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#6D675D]">
        {QUOTE_STATUS_LABEL[data.status]}
      </span>
    );
  }
  return null;
}

export function QuoteDocument({ data, className = "" }: { data: QuoteDocumentData; className?: string }) {
  const { company, customer } = data;
  const t = quoteTotals(data.items, data.discountPct, data.vatPct);
  const lineDiscounts = data.items.some((it) => it.discount_pct > 0);
  const hasDiscount = t.discountCents !== 0;

  const companyLines = [
    company.address,
    company.oib ? `OIB ${company.oib}` : null,
    company.iban ? `IBAN ${company.iban}` : null,
    company.bank, // may already carry the IBAN on its own ("Banka d.d., HR12 …")
    company.phone,
    company.email,
    company.web,
  ];
  const customerLines = [customer.address, customer.oib ? `OIB ${customer.oib}` : null, customer.phone, customer.email];

  return (
    <article
      aria-label={`Ponuda ${data.number}`}
      className={`quote-sheet mx-auto w-full max-w-[210mm] bg-[#FCFBF8] font-sans text-[12.5px] leading-[1.55] text-[#0B0B0C] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.6)] ${className}`}
    >
      <div className="px-5 py-8 sm:px-[16mm] sm:py-[15mm] print:p-0">
        {/* masthead */}
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-6">
          <div className="leading-none">
            <p className="font-display text-[26px] font-medium tracking-[0.42em]">{(company.brand.split(" ")[0] || company.brand).toUpperCase()}</p>
            {company.brand.includes(" ") && (
              <p className="mt-2 text-[8.5px] font-semibold uppercase tracking-[0.5em] text-[#6D675D]">
                {company.brand.split(" ").slice(1).join(" ")}
              </p>
            )}
          </div>
          <div className="text-left sm:text-right">
            <p className="text-[9.5px] font-semibold uppercase tracking-[0.3em] text-[#8A7A5C]">Ponuda</p>
            <p className="mt-1.5 font-display text-[24px] font-medium leading-none tracking-[-0.02em] tabular-nums">{data.number}</p>
            <div className="mt-2.5 sm:flex sm:justify-end">
              <StatusStamp data={data} />
            </div>
          </div>
        </div>

        <div className="mt-8">
          <DimensionRule />
        </div>

        {/* parties + dates */}
        <div className="q-avoid mt-8 grid grid-cols-1 gap-x-8 gap-y-6 sm:grid-cols-[1fr_1fr_auto] print:grid-cols-[1fr_1fr_auto]">
          <div>
            <Label>Izdaje</Label>
            <p className="font-semibold">{company.name}</p>
            <p className="text-[11.5px] text-[#3d3a35]">
              <Lines lines={companyLines} />
            </p>
          </div>
          <div>
            <Label>Kupac</Label>
            <p className="font-semibold">{customer.name}</p>
            <p className="text-[11.5px] text-[#3d3a35]">
              <Lines lines={customerLines} />
            </p>
          </div>
          <dl className="grid grid-cols-[auto_auto] content-start gap-x-5 gap-y-2 text-[11.5px] sm:text-right print:text-right">
            <dt className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[#8A7A5C] sm:text-left print:text-left">Datum</dt>
            <dd className="tabular-nums">{formatDate(data.issuedOn)}</dd>
            {data.validUntil && (
              <>
                <dt className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[#8A7A5C] sm:text-left print:text-left">Vrijedi do</dt>
                <dd className="tabular-nums">{formatDate(data.validUntil)}</dd>
              </>
            )}
            <dt className="text-[9.5px] font-semibold uppercase tracking-[0.2em] text-[#8A7A5C] sm:text-left print:text-left">Valuta</dt>
            <dd>EUR</dd>
          </dl>
        </div>

        {data.title && (
          <h2 className="mt-10 font-display text-[22px] font-medium leading-tight tracking-[-0.02em] sm:text-[26px]">{data.title}</h2>
        )}

        {data.imageUrl && (
          <figure className="q-avoid mt-6">
            {/* private file behind an authenticated / token route — next/image cannot optimise it */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={data.imageUrl}
              alt="3D prikaz kuhinje iz studija"
              className="block max-h-[85mm] w-full rounded-[3px] bg-[#111113] object-cover"
              loading="eager"
            />
            <figcaption className="mt-2 text-[10px] text-[#6D675D]">
              Prikaz iz 3D studija služi kao ilustracija; mjere i izvedba su prema stavkama ponude.
            </figcaption>
          </figure>
        )}

        {/* items */}
        <div className="mt-8">
          {data.items.length === 0 ? (
            <p className="border-y border-[#CFC7B9] py-6 text-center text-[#6D675D]">Ponuda još nema stavki.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <caption className="sr-only">Stavke ponude (cijene bez PDV-a)</caption>
              <thead>
                <tr className="border-b border-[#0B0B0C] text-[9px] font-semibold uppercase tracking-[0.18em] text-[#6D675D]">
                  <th scope="col" className="w-7 py-2 pr-2 font-semibold">
                    Rb.
                  </th>
                  <th scope="col" className="py-2 pr-3 font-semibold">
                    Opis
                  </th>
                  <th scope="col" className="hidden py-2 pr-3 text-right font-semibold sm:table-cell print:table-cell">
                    Kol.
                  </th>
                  <th scope="col" className="hidden py-2 pr-3 font-semibold sm:table-cell print:table-cell">
                    Jed.
                  </th>
                  <th scope="col" className="hidden whitespace-nowrap py-2 pr-3 text-right font-semibold sm:table-cell print:table-cell">
                    Cijena
                  </th>
                  {lineDiscounts && (
                    <th scope="col" className="hidden py-2 pr-3 text-right font-semibold sm:table-cell print:table-cell">
                      Pop.
                    </th>
                  )}
                  <th scope="col" className="py-2 text-right font-semibold">
                    Iznos
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((it, i) => (
                  <tr key={it.id || i} className="border-b border-[#E2DCD1] align-top">
                    <td className="py-3 pr-2 text-[10.5px] tabular-nums text-[#8A7A5C]">{String(i + 1).padStart(2, "0")}</td>
                    <td className="py-3 pr-3">
                      <p className="font-medium">{it.description}</p>
                      {it.details && <p className="mt-0.5 whitespace-pre-line text-[11px] leading-snug text-[#6D675D]">{it.details}</p>}
                      <p className="mt-1 text-[11px] tabular-nums text-[#6D675D] sm:hidden print:hidden">
                        {formatQty(it.qty)} {it.unit} × {formatCents(it.unit_price_cents)}
                        {it.discount_pct > 0 ? ` − ${formatPct(it.discount_pct)}` : ""}
                      </p>
                    </td>
                    <td className="hidden whitespace-nowrap py-3 pr-3 text-right tabular-nums sm:table-cell print:table-cell">{formatQty(it.qty)}</td>
                    <td className="hidden whitespace-nowrap py-3 pr-3 sm:table-cell print:table-cell">{it.unit}</td>
                    <td className="hidden whitespace-nowrap py-3 pr-3 text-right tabular-nums sm:table-cell print:table-cell">
                      {formatCents(it.unit_price_cents)}
                    </td>
                    {lineDiscounts && (
                      <td className="hidden whitespace-nowrap py-3 pr-3 text-right tabular-nums sm:table-cell print:table-cell">
                        {it.discount_pct > 0 ? formatPct(it.discount_pct) : ""}
                      </td>
                    )}
                    <td className="whitespace-nowrap py-3 text-right font-medium tabular-nums">{formatCents(lineTotalCents(it))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="mt-2 text-[10px] text-[#6D675D]">Jedinične cijene i iznosi stavki su bez PDV-a.</p>
        </div>

        {/* totals */}
        <div className="q-avoid mt-6 flex justify-end">
          <dl className="w-full max-w-[300px] text-[12px]">
            <div className="flex justify-between gap-6 py-1.5">
              <dt className="text-[#3d3a35]">{hasDiscount ? "Zbroj stavki" : "Osnovica (bez PDV-a)"}</dt>
              <dd className="tabular-nums">{formatCents(t.subtotalCents)}</dd>
            </div>
            {hasDiscount && (
              <>
                <div className="flex justify-between gap-6 py-1.5">
                  <dt className="text-[#3d3a35]">Popust {formatPct(data.discountPct)}</dt>
                  <dd className="tabular-nums">−{formatCents(t.discountCents)}</dd>
                </div>
                <div className="flex justify-between gap-6 py-1.5">
                  <dt className="text-[#3d3a35]">Osnovica (bez PDV-a)</dt>
                  <dd className="tabular-nums">{formatCents(t.netCents)}</dd>
                </div>
              </>
            )}
            <div className="flex justify-between gap-6 py-1.5">
              <dt className="text-[#3d3a35]">PDV {formatPct(data.vatPct)}</dt>
              <dd className="tabular-nums">{formatCents(t.vatCents)}</dd>
            </div>
            <div className="mt-2 flex items-baseline justify-between gap-6 border-t border-[#0B0B0C] pt-3">
              <dt className="text-[9.5px] font-semibold uppercase tracking-[0.22em]">Ukupno</dt>
              <dd className="font-display text-[22px] font-medium leading-none tracking-[-0.02em] tabular-nums">{formatCents(t.totalCents)}</dd>
            </div>
          </dl>
        </div>

        {(data.notes || data.terms) && (
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 print:grid-cols-2">
            {data.notes && (
              <section className="q-avoid">
                <Label>Napomena</Label>
                <p className="whitespace-pre-line text-[11.5px] text-[#3d3a35]">{data.notes}</p>
              </section>
            )}
            {data.terms && (
              <section className="q-avoid">
                <Label>Uvjeti</Label>
                <p className="whitespace-pre-line text-[11.5px] text-[#3d3a35]">{data.terms}</p>
              </section>
            )}
          </div>
        )}

        {/* signatures */}
        <div className="q-avoid mt-14 grid grid-cols-1 gap-10 sm:grid-cols-2 print:grid-cols-2">
          <div>
            <div className="h-12 border-b border-[#0B0B0C]" />
            <p className="mt-2 text-[10.5px] text-[#3d3a35]">Za {company.name}</p>
            {company.signatory && <p className="text-[10.5px] text-[#6D675D]">{company.signatory}</p>}
          </div>
          <div>
            <div className="h-12 border-b border-[#0B0B0C]" />
            <p className="mt-2 text-[10.5px] text-[#3d3a35]">Kupac: {customer.name}</p>
            <p className="text-[10.5px] text-[#6D675D]">Mjesto, datum i potpis</p>
          </div>
        </div>

        {data.validUntil && (
          <p className="mt-8 text-[10.5px] text-[#6D675D]">Ponuda vrijedi do {formatLongDate(data.validUntil)}.</p>
        )}

        <div className="mt-8">
          <DimensionRule />
        </div>
        <p className="mt-3 text-[9.5px] leading-relaxed text-[#6D675D]">
          {[company.name, company.address?.replace(/\s*\n\s*/g, ", "), company.oib ? `OIB ${company.oib}` : null, company.legalLine]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </div>
    </article>
  );
}
