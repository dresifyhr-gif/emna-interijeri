import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Alert, Card, CardHeader, LeadStatusBadge, LinkButton, PageHeader, QuoteStatusBadge } from "@/components/admin/ui";
import { DeleteDraftForm, DuplicateQuoteForm, QuoteSharePanel, QuoteStatusPanel } from "@/components/admin/quotes/QuoteActions";
import { QuoteDocument } from "@/components/admin/quotes/QuoteDocument";
import { QuoteEditor } from "@/components/admin/quotes/QuoteEditor";
import { IconPrint } from "@/components/admin/quotes/icons";
import { isQuoteLocked } from "@/components/admin/quotes/model";
import { adminFileUrl } from "@/lib/admin/files";
import { formatLongDate } from "@/lib/admin/format";
import { isQuoteEmailConfigured } from "@/lib/admin/quote-email";
import { getCompanyInfo, getQuoteDetail, publicQuoteUrl, toDocumentData, toFormValues, type QuoteDetail } from "@/lib/admin/quotes";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { isValidEmail } from "@/lib/lead-client";
import { site } from "@/lib/site";
import { changeQuoteStatusAction, deleteQuoteAction, duplicateQuoteAction, saveQuoteAction, sendQuoteEmailAction } from "../actions";

export const metadata: Metadata = { title: "Ponuda" };

type Params = Promise<{ id: string }>;

/**
 * Origin for the customer link shown in the admin: the canonical site.url in production, the
 * current host in development / Vercel previews (so the link works where you are testing).
 * E-mails always use site.url.
 */
async function linkOrigin(): Promise<string> {
  if (process.env.NODE_ENV === "production" && process.env.VERCEL_ENV !== "preview") return site.url;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? (host?.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : site.url;
}

function mailtoFor(d: QuoteDetail, url: string, companyName: string): string | null {
  const to = d.quote.customerEmail?.trim();
  if (!to || !isValidEmail(to)) return null;
  const q = d.quote;
  const subject = `Ponuda ${q.number}${q.title ? ` – ${q.title}` : ""}`;
  const body = [
    "Poštovani,",
    "",
    `šaljemo vam ponudu ${q.number}${q.title ? ` (${q.title})` : ""}. Pregledati, ispisati i prihvatiti je možete na poveznici:`,
    url,
    "",
    ...(q.validUntil ? [`Ponuda vrijedi do ${formatLongDate(q.validUntil)}.`, ""] : []),
    "Lijep pozdrav,",
    companyName,
  ].join("\n");
  return `mailto:${to}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export default async function QuotePage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;

  let detail: QuoteDetail | null = null;
  let failed = false;
  try {
    detail = await getQuoteDetail(id);
  } catch (err) {
    failed = true;
    console.error(`[admin] ponuda se ne može učitati (${dbErrorLabel(err)})`);
  }
  if (failed) {
    return (
      <>
        <PageHeader eyebrow="Ponude" title="Ponuda" back={{ href: "/admin/ponude", label: "Sve ponude" }} />
        <Alert tone="danger" title="Ponuda se trenutno ne može učitati.">
          Baza podataka ne odgovara. Osvježite stranicu za minutu.
        </Alert>
      </>
    );
  }
  if (!detail) notFound();

  const { quote: q, status, lead } = detail;
  const locked = isQuoteLocked(status);
  const company = await getCompanyInfo();
  const url = publicQuoteUrl(q.publicToken, await linkOrigin());

  const sidebar = (
    <>
      <QuoteStatusPanel
        quoteId={q.id}
        status={status}
        timeline={{
          createdAt: q.createdAt.toISOString(),
          sentAt: q.sentAt?.toISOString() ?? null,
          viewedAt: q.viewedAt?.toISOString() ?? null,
          acceptedAt: q.acceptedAt?.toISOString() ?? null,
          rejectedAt: q.rejectedAt?.toISOString() ?? null,
          validUntil: q.validUntil,
        }}
        changeStatus={changeQuoteStatusAction}
      />
      <QuoteSharePanel
        quoteId={q.id}
        status={status}
        publicUrl={url}
        customerEmail={q.customerEmail}
        mailtoHref={mailtoFor(detail, url, company.name)}
        emailEnabled={isQuoteEmailConfigured()}
        sendEmail={sendQuoteEmailAction}
        changeStatus={changeQuoteStatusAction}
      />
      {lead && (
        <Card padding="sm" aria-labelledby="ponuda-upit">
          <CardHeader id="ponuda-upit" title={`Upit ${lead.number}`} className="mb-3" action={<LeadStatusBadge status={lead.status} />} />
          {lead.snapshotPath && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={adminFileUrl(lead.snapshotPath)}
              alt={`3D prikaz kuhinje iz upita ${lead.number}`}
              className="mb-3 aspect-[4/3] w-full rounded-lg bg-ink-800 object-cover"
            />
          )}
          <p className="text-[13px] text-fg">{lead.name}</p>
          <Link href={`/admin/upiti/${lead.id}`} className="mt-2 inline-block text-[12.5px] font-medium text-mut transition-colors hover:text-accent">
            Otvori upit
          </Link>
        </Card>
      )}
      {status === "nacrt" && (
        <Card padding="sm">
          <DeleteDraftForm id={q.id} number={q.number} action={deleteQuoteAction} />
        </Card>
      )}
    </>
  );

  return (
    <>
      <PageHeader
        eyebrow={
          <>
            Ponuda <QuoteStatusBadge status={status} className="ml-1 normal-case tracking-normal" />
          </>
        }
        title={q.number}
        description={[q.customerName, q.title].filter(Boolean).join(" · ")}
        back={{ href: "/admin/ponude", label: "Sve ponude" }}
        actions={
          <>
            <LinkButton href={`/admin/ponude/${q.id}/ispis`} variant="secondary" size="sm" icon={<IconPrint />}>
              Ispis / PDF
            </LinkButton>
            <DuplicateQuoteForm id={q.id} action={duplicateQuoteAction} />
          </>
        }
      />

      {status === "istekla" && (
        <Alert tone="warning" title="Rok valjanosti je istekao." className="mb-6">
          {q.validUntil ? `Ponuda je vrijedila do ${formatLongDate(q.validUntil)}. ` : ""}Kupac je više ne može prihvatiti. Produljite rok,
          spremite i ponovno je označite kao poslanu.
        </Alert>
      )}

      {locked ? (
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
          <div className="min-w-0 space-y-6">
            <Alert tone={status === "prihvacena" ? "success" : "info"} title={status === "prihvacena" ? "Kupac je prihvatio ponudu." : "Ponuda je odbijena."}>
              Ponuda je zaključana kako bi ostala točno ono na što je kupac odgovorio. Za izmjene je duplicirajte — kopija je novi nacrt.
            </Alert>
            <div className="overflow-hidden rounded-2xl bg-ink-900/60 p-3 sm:p-6">
              <QuoteDocument data={toDocumentData(q, status, company, lead?.snapshotPath ? adminFileUrl(lead.snapshotPath) : null)} />
            </div>
          </div>
          <aside className="min-w-0 space-y-4 xl:sticky xl:top-24">{sidebar}</aside>
        </div>
      ) : (
        <QuoteEditor
          key={q.id}
          quoteId={q.id}
          version={detail.version}
          initial={toFormValues(q)}
          saveAction={saveQuoteAction}
          sidebar={sidebar}
        />
      )}
    </>
  );
}
