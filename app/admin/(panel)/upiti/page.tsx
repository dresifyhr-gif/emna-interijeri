import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Alert, EmptyState, LinkButton, PageHeader } from "@/components/admin/ui";
import { LeadFilters } from "@/components/admin/leads/LeadFilters";
import { LeadsTable } from "@/components/admin/leads/LeadsTable";
import { Pagination } from "@/components/admin/leads/Pagination";
import { StatusTabs } from "@/components/admin/leads/StatusTabs";
import { leadListHref, listLeads, parseLeadListParams, type LeadList } from "@/lib/admin/leads";
import { LEAD_SOURCE_LABEL, LEAD_STATUS_LABEL } from "@/lib/admin/status";
import { plural } from "@/lib/admin/format";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { isLeadStatus } from "@/lib/db/enums";

export const metadata: Metadata = { title: "Upiti" };

type SearchParams = Record<string, string | string[] | undefined>;

const LEAD_NUMBER_RE = /^U-\d{4}-\d{4,6}$/;

function describeFilter(status: string, source: string | null): string {
  const parts: string[] = [];
  if (status === "aktivni") parts.push("aktivni upiti (bez arhive)");
  else if (status === "sve") parts.push("svi upiti, i arhivirani");
  else if (isLeadStatus(status)) parts.push(`status „${LEAD_STATUS_LABEL[status]}“`);
  if (source === "studio" || source === "kontakt") parts.push(LEAD_SOURCE_LABEL[source].toLowerCase());
  return parts.join(" · ");
}

export default async function LeadsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  await requireAdmin();
  const sp = await searchParams;
  const params = parseLeadListParams(sp);
  const deleted = typeof sp.obrisan === "string" && LEAD_NUMBER_RE.test(sp.obrisan) ? sp.obrisan : null;
  const imageLeft = sp.slika === "0";

  let data: LeadList | null = null;
  try {
    data = await listLeads(params);
  } catch (err) {
    console.error(`[admin] upiti se ne mogu učitati (${dbErrorLabel(err)})`);
  }

  // ?page=9 past the end (e.g. after deleting the last row of a page) → last real page
  if (data && data.total > 0 && data.rows.length === 0 && params.page > data.pageCount) {
    redirect(leadListHref({ ...params, page: data.pageCount }));
  }

  const filtered = Boolean(params.q || params.source);
  const resetHref = filtered ? leadListHref({ status: params.status }) : null;

  return (
    <>
      <PageHeader
        eyebrow="Upiti"
        title="Upiti kupaca"
        description="Sve što stigne iz 3D studija i s kontakt forme, s najnovijim upitom na vrhu. Kliknite red za detalje, bilješke i ponudu."
      />

      {deleted && (
        <Alert tone="success" title={`Upit ${deleted} je obrisan.`} className="mb-6">
          {imageLeft
            ? "Slika 3D prikaza nije se mogla obrisati iz pohrane — javite razvoju da je ukloni."
            : "Obrisani su i kontakt podaci kupca te 3D prikaz."}
        </Alert>
      )}

      {!data ? (
        <Alert tone="danger" title="Upiti se trenutno ne mogu učitati.">
          Baza podataka ne odgovara. Osvježite stranicu za minutu; ako se ponavlja, javite razvoju.
        </Alert>
      ) : data.counts.sve === 0 ? (
        <EmptyState
          title="Još nema nijednog upita."
          description="Čim kupac pošalje kuhinju iz 3D studija ili poruku s kontakt forme, upit se pojavi ovdje — s brojem (npr. U-2026-0001), kontaktom, a za studio i slikom kuhinje, mjerama i okvirnom cijenom. Upiti se spremaju i dok slanje e-maila još nije uključeno."
          action={
            <>
              <LinkButton href="/studio" target="_blank" rel="noopener" size="sm">
                Isprobaj 3D studio
              </LinkButton>
              <LinkButton href="/kontakt" target="_blank" rel="noopener" size="sm" variant="ghost">
                Kontakt forma
              </LinkButton>
            </>
          }
        />
      ) : (
        <div className="space-y-5">
          <StatusTabs params={params} counts={data.counts} />
          <LeadFilters q={params.q} source={params.source} status={params.status} resetHref={resetHref} />

          <p className="text-[12.5px] text-mut" aria-live="polite">
            <span className="tabular-nums text-fg/85">{data.total}</span> {plural(data.total, "upit", "upita", "upita")}
            {" · "}
            {describeFilter(params.status, params.source)}
            {params.q && (
              <>
                {" · "}pretraga „<span className="text-fg/85">{params.q}</span>“
              </>
            )}
          </p>

          {data.rows.length === 0 ? (
            <EmptyState
              title={params.q ? "Ništa ne odgovara pretrazi." : "Ovdje trenutno nema upita."}
              description={
                params.q
                  ? "Provjerite upisano ili potražite samo dio imena, broja telefona ili e-maila."
                  : params.status === "novi"
                    ? "Svi novi upiti su pregledani. Novi će se pojaviti ovdje čim stignu."
                    : "Odaberite drugi status ili poništite filtre."
              }
              action={
                <>
                  {params.q && params.status === "aktivni" && (
                    <LinkButton href={leadListHref({ ...params, status: "sve", page: 1 })} size="sm">
                      Pretraži i arhivu
                    </LinkButton>
                  )}
                  {resetHref && (
                    <LinkButton href={resetHref} size="sm" variant="ghost">
                      Poništi filtre
                    </LinkButton>
                  )}
                </>
              }
            />
          ) : (
            <>
              <LeadsTable rows={data.rows} caption="Popis upita" />
              <Pagination params={params} total={data.total} pageCount={data.pageCount} pageSize={data.pageSize} />
            </>
          )}
        </div>
      )}
    </>
  );
}
