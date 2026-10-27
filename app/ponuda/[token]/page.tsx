import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { PrintButton } from "@/components/admin/quotes/QuoteActions";
import { QuoteDocument, QuotePrintStyles } from "@/components/admin/quotes/QuoteDocument";
import { formatCents, formatLongDate } from "@/lib/admin/format";
import { quoteTotals } from "@/lib/admin/quote-math";
import { getCompanyInfo, getQuoteByToken, isQuoteToken, toDocumentData } from "@/lib/admin/quotes";
import { getSession } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { telHref } from "@/lib/site";
import { QuoteResponse, ViewBeacon } from "./QuoteResponse";

type Params = Promise<{ token: string }>;

/** one lookup per request, shared by generateMetadata and the page */
const load = cache(async (token: string) => getQuoteByToken(token));

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { token } = await params;
  if (!isQuoteToken(token)) return {};
  try {
    const pq = await load(token);
    if (pq && pq.status !== "nacrt") return { title: `Ponuda ${pq.quote.number}` };
  } catch {
    /* the page reports it */
  }
  return {};
}

function Frame({ children, brand = "EMNA" }: { children: React.ReactNode; brand?: string }) {
  return (
    <>
      <header className="no-print shell flex items-center justify-between gap-4 py-6">
        <Link href="/" className="group inline-flex flex-col leading-none" aria-label={`${brand} — naslovnica`}>
          <span className="font-display text-[18px] font-medium tracking-[0.42em] text-fg transition-opacity group-hover:opacity-80">EMNA</span>
          <span className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.5em] text-fg/60">Interijeri</span>
        </Link>
      </header>
      <main id="sadrzaj" className="shell pb-24">
        {children}
      </main>
    </>
  );
}

export default async function PublicQuotePage({ params }: { params: Params }) {
  await connection();
  const { token } = await params;
  if (!isQuoteToken(token)) notFound();

  let pq: Awaited<ReturnType<typeof load>> = null;
  try {
    pq = await load(token);
  } catch (err) {
    console.error(`[ponuda] javna ponuda se ne može učitati (${dbErrorLabel(err)})`);
    return (
      <Frame>
        <div className="mx-auto max-w-xl py-24 text-center">
          <p className="eyebrow text-accent">Ponuda</p>
          <h1 className="mt-4 font-display text-[32px] font-medium tracking-tight">Ponuda se trenutno ne može otvoriti.</h1>
          <p className="mt-3 text-[15px] text-fg/70">Pokušajte ponovno za nekoliko minuta.</p>
        </div>
      </Frame>
    );
  }
  if (!pq) notFound();

  // the logged-in owner may preview a draft; their visit is never recorded and they cannot answer
  const preview = Boolean(await getSession());
  if (pq.status === "nacrt" && !preview) notFound();

  const q = pq.quote;
  const company = await getCompanyInfo();
  const data = toDocumentData(q, pq.status, company, pq.leadSnapshotPath ? `/api/ponuda/${token}/slika` : null);
  const totals = quoteTotals(data.items, data.discountPct, data.vatPct);
  const canRespond = pq.status === "poslana";

  const contact = [
    company.phone ? (
      <a key="tel" href={telHref(company.phone)} className="text-fg underline decoration-white/20 underline-offset-4 hover:decoration-accent">
        {company.phone}
      </a>
    ) : null,
    company.email ? (
      <a key="mail" href={`mailto:${company.email}`} className="text-fg underline decoration-white/20 underline-offset-4 hover:decoration-accent">
        {company.email}
      </a>
    ) : null,
  ].filter(Boolean);

  const statusNote =
    pq.status === "prihvacena"
      ? {
          title: "Ponuda je prihvaćena.",
          text: `${q.acceptedAt ? `Prihvaćena ${formatLongDate(q.acceptedAt)}. ` : ""}Hvala na povjerenju — javit ćemo vam se oko sljedećih koraka.`,
          tone: "border-emerald-300/25 bg-emerald-400/[0.07]",
        }
      : pq.status === "odbijena"
        ? {
            title: "Ponuda je odbijena.",
            text: `${q.rejectedAt ? `Odbijena ${formatLongDate(q.rejectedAt)}. ` : ""}Ako želite izmjenu ili novu ponudu, javite nam se.`,
            tone: "border-white/12 bg-white/[0.04]",
          }
        : pq.status === "istekla"
          ? {
              title: "Rok valjanosti je istekao.",
              text: `${q.validUntil ? `Ponuda je vrijedila do ${formatLongDate(q.validUntil)}, pa je više nije moguće prihvatiti. ` : ""}Za novu ponudu javite nam se.`,
              tone: "border-amber-300/25 bg-amber-400/[0.07]",
            }
          : pq.status === "nacrt"
            ? {
                title: "Nacrt — kupac ovu stranicu još ne može otvoriti.",
                text: "Poveznica proradi za kupca kad ponudu u administraciji označite kao poslanu.",
                tone: "border-white/12 bg-white/[0.04]",
              }
            : null;

  return (
    <Frame brand={company.brand}>
      <QuotePrintStyles />
      {!preview && canRespond && !q.viewedAt && <ViewBeacon token={token} />}

      <div className="no-print mx-auto max-w-[210mm]">
        {preview && (
          <p className="mb-6 rounded-xl border border-accent/30 bg-accent/[0.08] px-4 py-3 text-[13px] text-fg/85">
            Pregled iz administracije — ova posjeta se ne bilježi kao otvaranje kod kupca.
          </p>
        )}
        <p className="eyebrow flex items-center gap-3 text-accent">
          <span aria-hidden className="h-px w-6 bg-accent/70" />
          Ponuda {q.number}
        </p>
        <h1 className="mt-4 font-display text-[clamp(30px,5vw,52px)] font-medium leading-[1.04] tracking-head">
          {q.title || "Vaša ponuda"}
        </h1>
        <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
          <dl className="flex flex-wrap gap-x-10 gap-y-3 text-[14px]">
            <div>
              <dt className="eyebrow text-[10px] text-mut">Za</dt>
              <dd className="mt-1 text-fg">{q.customerName}</dd>
            </div>
            <div>
              <dt className="eyebrow text-[10px] text-mut">Ukupno s PDV-om</dt>
              <dd className="mt-1 font-display text-[22px] font-medium leading-none tabular-nums text-fg">{formatCents(totals.totalCents)}</dd>
            </div>
            {q.validUntil && (
              <div>
                <dt className="eyebrow text-[10px] text-mut">Vrijedi do</dt>
                <dd className="mt-1 text-fg">{formatLongDate(q.validUntil)}</dd>
              </div>
            )}
          </dl>
          <div className="flex flex-wrap gap-3">
            {canRespond && (
              <a
                href="#odgovor"
                className="inline-flex h-10 items-center justify-center rounded-full bg-accent px-5 text-[13px] font-semibold tracking-wide text-ink transition-colors hover:bg-fg"
              >
                Odgovori na ponudu
              </a>
            )}
            <PrintButton variant="secondary" />
          </div>
        </div>

        {statusNote && (
          <div role="status" className={`mt-8 rounded-2xl border px-5 py-4 ${statusNote.tone}`}>
            <p className="font-medium text-fg">{statusNote.title}</p>
            <p className="mt-1 text-[14px] leading-relaxed text-fg/75">{statusNote.text}</p>
          </div>
        )}
      </div>

      <div className="mt-10">
        <QuoteDocument data={data} className="rounded-[4px]" />
      </div>

      <div id="odgovor" className="no-print mx-auto mt-10 max-w-[210mm] scroll-mt-8">
        <QuoteResponse
          token={token}
          number={q.number}
          totalCents={totals.totalCents}
          validUntil={q.validUntil}
          canRespond={canRespond}
          preview={preview}
        />
        <p className="mt-8 text-center text-[13.5px] leading-relaxed text-fg/60">
          {contact.length ? (
            <>
              Pitanja ili izmjene? Javite nam se: {contact.length === 2 ? [contact[0], " ili ", contact[1]] : contact[0]}.
            </>
          ) : (
            "Pitanja ili izmjene? Odgovorite na poruku kojom ste dobili ovu ponudu."
          )}
        </p>
      </div>
    </Frame>
  );
}
