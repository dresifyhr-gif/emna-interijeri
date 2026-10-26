import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache, type ReactNode } from "react";
import {
  Alert,
  Card,
  CardHeader,
  EmptyState,
  LeadSourceBadge,
  LeadStatusBadge,
  LinkButton,
  PageHeader,
  QuoteStatusBadge,
  buttonClass,
  cx,
} from "@/components/admin/ui";
import { ConfirmDialog } from "@/components/admin/leads/ConfirmDialog";
import { CopyButton } from "@/components/admin/leads/CopyButton";
import { IconChat, IconCube, IconDownload, IconMail, IconPhone, IconPlus, IconTrash } from "@/components/admin/leads/icons";
import { LeadArchiveButton, LeadStatusControl } from "@/components/admin/leads/LeadStatusControl";
import { LeadPdfButton } from "@/components/admin/leads/LeadPdfButton";
import { NotesEditor } from "@/components/admin/leads/NotesEditor";
import { SummaryList } from "@/components/admin/leads/SummaryList";
import { adminFileUrl } from "@/lib/admin/files";
import { formatCents, formatDate, formatDateTime, formatPriceRange, plural } from "@/lib/admin/format";
import { LEAD_NOTES_MAX, getLeadDetail, isUuid } from "@/lib/admin/leads";
import { getCompanyInfo } from "@/lib/admin/quotes";
import { normalizeCompany } from "@/lib/pdf/company";
import { PRICES_CONFIRMED } from "@/lib/studio/catalog";
import { toWhatsappDigits } from "@/lib/admin/settings";
import { LEAD_SOURCE_LABEL } from "@/lib/admin/status";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { site, telHref } from "@/lib/site";
import { deleteLeadAction, saveLeadNotesAction, setLeadStatusAction } from "../actions";

type Params = Promise<{ id: string }>;

/** one DB round trip per request, shared by generateMetadata and the page */
const load = cache(async (id: string) => {
  if (!isUuid(id)) return { detail: null, failed: false };
  try {
    return { detail: await getLeadDetail(id), failed: false };
  } catch (err) {
    console.error(`[admin] upit se ne može učitati (${dbErrorLabel(err)})`);
    return { detail: null, failed: true };
  }
});

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  await requireAdmin();
  const { id } = await params;
  const { detail } = await load(id);
  // the number only: page titles end up in browser history, customer names should not
  return { title: detail ? `Upit ${detail.lead.number}` : "Upit" };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-x-6 gap-y-1 py-3 sm:grid-cols-[150px_1fr]">
      <dt className="text-[12.5px] text-mut">{label}</dt>
      <dd className="min-w-0 text-[14px] text-fg/90">{children}</dd>
    </div>
  );
}

const safeHttpUrl = (v: string | null) => (v && /^https?:\/\//i.test(v) ? v : null);

export default async function LeadDetailPage({ params }: { params: Params }) {
  await requireAdmin();
  const { id } = await params;
  const { detail, failed } = await load(id);

  if (failed) {
    return (
      <>
        <PageHeader back={{ href: "/admin/upiti", label: "Svi upiti" }} eyebrow="Upit" title="Upit se ne može učitati." />
        <Alert tone="danger" title="Baza podataka ne odgovara.">
          Osvježite stranicu za minutu; ako se ponavlja, javite razvoju.
        </Alert>
      </>
    );
  }
  if (!detail) notFound();

  const { lead, quotes } = detail;
  const configUrl = safeHttpUrl(lead.configUrl);
  const price = formatPriceRange(lead.priceLow, lead.priceHigh);
  const summary = Array.isArray(lead.summary) ? lead.summary.filter((l): l is string => typeof l === "string" && l.trim() !== "") : [];
  const isStudio = lead.source === "studio";
  const waDigits = toWhatsappDigits(lead.phone);
  const subject = `Vaš upit ${lead.number} – ${site.name}`;
  const mailHref = `mailto:${lead.email}?subject=${encodeURIComponent(subject)}`;
  const newQuoteHref = `/admin/ponude/nova?upit=${lead.id}`;
  // the kitchen PDF: only for a studio inquiry that stored its kitchen; the company block from Postavke
  const hasKitchen = isStudio && lead.config !== null && typeof lead.config === "object";
  const pdfCompany = hasKitchen ? normalizeCompany(await getCompanyInfo()) : null;

  return (
    <>
      <PageHeader
        back={{ href: "/admin/upiti", label: "Svi upiti" }}
        eyebrow={`Upit ${lead.number}`}
        title={lead.name}
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <LeadStatusBadge status={lead.status} />
            <LeadSourceBadge source={lead.source} />
            <span>Primljeno {formatDateTime(lead.createdAt)}</span>
          </span>
        }
        actions={
          <>
            {configUrl && (
              <a href={configUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary")}>
                <IconCube size={16} />
                Otvori kuhinju u 3D studiju
                <span className="sr-only">(nova kartica)</span>
              </a>
            )}
            <LinkButton href={newQuoteHref} variant="primary" icon={<IconPlus size={16} />}>
              Napravi ponudu
            </LinkButton>
          </>
        }
      />

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr]">
        {/* status + contact first on phones; right column on desktop */}
        <div className="space-y-6 lg:col-start-2 lg:row-start-1">
          <Card aria-label="Status">
            <LeadStatusControl leadId={lead.id} status={lead.status} action={setLeadStatusAction} />
          </Card>

          <Card aria-labelledby="javite-se">
            <CardHeader id="javite-se" title="Javite se kupcu" className="mb-4" />
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <a href={telHref(lead.phone)} className={buttonClass("primary", "md", "justify-start")}>
                <IconPhone size={16} />
                <span className="truncate">Nazovi {lead.phone}</span>
              </a>
              {waDigits.length >= 9 && (
                <a
                  href={`https://wa.me/${waDigits}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={buttonClass("secondary", "md", "justify-start")}
                >
                  <IconChat size={16} />
                  WhatsApp
                  <span className="sr-only">(nova kartica)</span>
                </a>
              )}
              <a href={mailHref} className={buttonClass("secondary", "md", "justify-start")}>
                <IconMail size={16} />
                Pošalji e-mail
              </a>
            </div>
          </Card>
        </div>

        <div className="min-w-0 space-y-6 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          {isStudio && (
            <Card aria-labelledby="kuhinja">
              <CardHeader
                id="kuhinja"
                eyebrow="3D studio"
                title="Kuhinja koju je kupac složio"
                description={
                  price ? (
                    <>
                      Okvirna cijena iz studija: <span className="font-medium tabular-nums text-fg">{price}</span>. To je izračun
                      studija prema odabranim elementima, ne ponuda.
                    </>
                  ) : (
                    "Studio za ovaj upit nije poslao okvirnu cijenu."
                  )
                }
                action={
                  configUrl ? (
                    <a href={configUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
                      Otvori u studiju ↗<span className="sr-only">(nova kartica)</span>
                    </a>
                  ) : null
                }
              />
              {lead.snapshotPath ? (
                <figure className="mb-6">
                  <a
                    href={adminFileUrl(lead.snapshotPath)}
                    target="_blank"
                    rel="noopener"
                    className="group block overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900"
                  >
                    {/* plain <img>: the file comes from an authenticated route; next/image's optimiser has no session */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={adminFileUrl(lead.snapshotPath)}
                      alt={`3D prikaz kuhinje iz upita ${lead.number}`}
                      loading="lazy"
                      decoding="async"
                      className="block h-auto w-full transition-transform duration-700 ease-premium group-hover:scale-[1.015]"
                    />
                    <span className="sr-only">(otvori u punoj veličini, nova kartica)</span>
                  </a>
                  <figcaption className="mt-2.5 flex flex-wrap items-center justify-between gap-2 text-[12px] text-mut">
                    <span>Prikaz koji je kupac vidio kad je poslao upit.</span>
                    <a
                      href={adminFileUrl(lead.snapshotPath, { download: true })}
                      className="inline-flex items-center gap-1.5 font-medium text-fg/75 transition-colors hover:text-accent"
                    >
                      <IconDownload size={14} />
                      Preuzmi sliku
                    </a>
                  </figcaption>
                </figure>
              ) : (
                <p className="mb-6 rounded-xl border border-dashed border-white/[0.1] px-4 py-5 text-[13px] text-mut">
                  Slika 3D prikaza nije stigla s ovim upitom.
                  {configUrl ? " Kuhinju možete otvoriti u studiju poveznicom gore." : ""}
                </p>
              )}
              {hasKitchen && pdfCompany && (
                <div className="mb-6 rounded-xl border border-white/[0.07] bg-white/[0.02] px-4 py-4">
                  <p className="mb-3 text-[12.5px] leading-relaxed text-mut">
                    PDF za kupca: 3D prikazi, tlocrt i nacrti zidova s kotama, popis elemenata, materijali i kontakt — složen iz
                    kuhinje u ovom upitu.
                  </p>
                  <LeadPdfButton
                    config={lead.config}
                    configUrl={configUrl}
                    leadNumber={lead.number}
                    customerName={lead.name}
                    snapshotUrl={lead.snapshotPath ? adminFileUrl(lead.snapshotPath) : null}
                    company={pdfCompany}
                    pricesConfirmed={PRICES_CONFIRMED}
                  />
                </div>
              )}
              {summary.length > 0 ? (
                <SummaryList lines={summary} />
              ) : (
                <p className="text-[13px] text-mut">Sažetak kuhinje nije spremljen.</p>
              )}
            </Card>
          )}

          {lead.message && (
            <Card aria-labelledby="poruka">
              <CardHeader id="poruka" title="Poruka kupca" className="mb-3" />
              <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed text-fg/90">{lead.message}</p>
            </Card>
          )}

          <Card aria-labelledby="kupac">
            <CardHeader id="kupac" title="Podaci o kupcu" className="mb-1" />
            <dl className="divide-y divide-white/[0.05]">
              <Row label="Ime i prezime">{lead.name}</Row>
              <Row label="Telefon">
                <span className="flex items-center gap-1">
                  <a href={telHref(lead.phone)} className="tabular-nums underline-offset-4 hover:text-accent hover:underline">
                    {lead.phone}
                  </a>
                  <CopyButton value={lead.phone} label="telefon" />
                </span>
              </Row>
              <Row label="E-mail">
                <span className="flex min-w-0 items-center gap-1">
                  <a href={mailHref} className="truncate underline-offset-4 hover:text-accent hover:underline">
                    {lead.email}
                  </a>
                  <CopyButton value={lead.email} label="e-mail" />
                </span>
              </Row>
              <Row label="Grad">{lead.city || <span className="text-mut">nije upisan</span>}</Row>
              {lead.interest && <Row label="Zanima ga">{lead.interest}</Row>}
              {lead.timeline && <Row label="Kada planira">{lead.timeline}</Row>}
              <Row label="Izvor">{LEAD_SOURCE_LABEL[lead.source] ?? lead.source}</Row>
              <Row label="Primljeno">{formatDateTime(lead.createdAt)}</Row>
              <Row label="E-mail obavijesti">
                <span className="block text-[13px] leading-relaxed">
                  {lead.notifiedAt ? (
                    <>Vama poslana {formatDateTime(lead.notifiedAt)}.</>
                  ) : (
                    <span className="text-mut">Vama nije poslana (slanje e-maila nije bilo uključeno ili nije uspjelo).</span>
                  )}
                  <br />
                  {lead.confirmationSentAt ? (
                    <>Kupac je dobio potvrdu {formatDateTime(lead.confirmationSentAt)}.</>
                  ) : (
                    <span className="text-mut">Kupac nije dobio automatsku potvrdu — javite mu se vi.</span>
                  )}
                </span>
              </Row>
            </dl>
          </Card>

          <Card aria-labelledby="ponude">
            <CardHeader
              id="ponude"
              title="Ponude"
              description={
                quotes.length
                  ? `${quotes.length} ${plural(quotes.length, "ponuda", "ponude", "ponuda")} za ovaj upit.`
                  : undefined
              }
              action={
                quotes.length ? (
                  <LinkButton href={newQuoteHref} size="sm" icon={<IconPlus size={14} />}>
                    Nova ponuda
                  </LinkButton>
                ) : null
              }
            />
            {quotes.length === 0 ? (
              <EmptyState
                className="py-10"
                title="Još nema ponude za ovaj upit."
                description={
                  isStudio
                    ? "Ponuda se otvara s podacima kupca i sažetkom kuhinje, a stavke i cijene upisujete vi."
                    : "Ponuda se otvara s podacima kupca; stavke i cijene upisujete vi."
                }
                action={
                  <LinkButton href={newQuoteHref} variant="primary" size="sm" icon={<IconPlus size={14} />}>
                    Napravi ponudu
                  </LinkButton>
                }
              />
            ) : (
              <ul className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07]">
                {quotes.map((q) => (
                  <li key={q.id}>
                    <Link
                      href={`/admin/ponude/${q.id}`}
                      className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1.5 px-4 py-3 transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] focus-visible:outline-none"
                    >
                      <span className="min-w-0">
                        <span className="block text-[14px] font-medium text-fg">
                          {q.number}
                          {q.title ? <span className="font-normal text-fg/70"> · {q.title}</span> : null}
                        </span>
                        <span className="block text-[12px] text-mut">
                          Izrađena {formatDate(q.createdAt)}
                          {q.sentAt ? ` · poslana ${formatDate(q.sentAt)}` : ""}
                        </span>
                      </span>
                      <span className="flex items-center gap-3">
                        <span className="text-[13.5px] tabular-nums text-fg/90">{formatCents(q.totalCents)}</span>
                        <QuoteStatusBadge status={q.status} />
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6 lg:col-start-2 lg:row-start-2">
          <Card aria-label="Interne bilješke">
            <NotesEditor
              leadId={lead.id}
              initialNotes={lead.notes ?? ""}
              maxLength={LEAD_NOTES_MAX}
              save={saveLeadNotesAction}
            />
          </Card>

          <Card aria-labelledby="arhiva">
            <CardHeader
              id="arhiva"
              title="Arhiva i brisanje"
              description={
                lead.status === "arhiva"
                  ? "Upit je u arhivi: ne vidi se među aktivnima, ali ništa nije izgubljeno."
                  : "Arhiviran upit nestaje s popisa aktivnih, a podaci ostaju."
              }
              className="mb-4"
            />
            <div className={cx("flex flex-wrap items-start gap-2")}>
              <LeadArchiveButton leadId={lead.id} status={lead.status} action={setLeadStatusAction} />
              <ConfirmDialog
                triggerLabel="Obriši"
                triggerIcon={<IconTrash size={15} />}
                title={`Trajno obrisati upit ${lead.number}?`}
                description={
                  <>
                    <p>
                      Brišu se kontakt podaci kupca, poruka, bilješke
                      {lead.snapshotPath ? " i slika 3D prikaza" : ""}. Ovo se ne može poništiti.
                    </p>
                    {quotes.length > 0 && (
                      <p>
                        {quotes.length} {plural(quotes.length, "ponuda ostaje", "ponude ostaju", "ponuda ostaje")}, ali više
                        neće biti povezane s ovim upitom.
                      </p>
                    )}
                    <p>Brisanje koristite i kad kupac zatraži brisanje svojih podataka. Za sve ostalo dovoljno je arhivirati.</p>
                  </>
                }
                confirmLabel="Da, trajno obriši"
                pendingLabel="Brišem…"
                action={deleteLeadAction}
                fields={{ id: lead.id }}
              />
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
