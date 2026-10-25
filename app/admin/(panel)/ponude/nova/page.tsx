import type { Metadata } from "next";
import Link from "next/link";
import { desc } from "drizzle-orm";
import * as studioCatalog from "@/lib/studio/catalog";
import { Alert, Card, CardHeader, LeadSourceBadge, LeadStatusBadge, PageHeader, Select, buttonClass } from "@/components/admin/ui";
import { QuoteEditor } from "@/components/admin/quotes/QuoteEditor";
import { adminFileUrl } from "@/lib/admin/files";
import { formatDate, formatEur } from "@/lib/admin/format";
import { buildNewQuoteDraft, type NewQuoteDraft } from "@/lib/admin/quotes";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel, getDb } from "@/lib/db";
import { leads } from "@/lib/db/schema";
import { saveQuoteAction } from "../actions";

export const metadata: Metadata = { title: "Nova ponuda" };

type SP = Promise<Record<string, string | string[] | undefined>>;

/** the studio catalogue says whether its prices are confirmed; read defensively (the module is still changing) */
const pricesConfirmed = (studioCatalog as unknown as Record<string, unknown>).PRICES_CONFIRMED === true;

async function recentLeads() {
  return getDb()
    .select({ id: leads.id, number: leads.number, name: leads.name, source: leads.source, createdAt: leads.createdAt })
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .limit(50);
}

function PrefillNotice({ draft }: { draft: NewQuoteDraft }) {
  if (draft.leadMissing) {
    return (
      <Alert tone="warning" title="Upit nije pronađen.">
        Poveznica ne vodi do postojećeg upita. Ponudu možete složiti od nule ili odabrati upit iznad.
      </Alert>
    );
  }
  const p = draft.prefill;
  if (!p) return null;
  if (p.mode === "plan") {
    return (
      <Alert tone="info" title="Stavke su složene iz kuhinje u 3D studiju.">
        <span className="block">
          Elementi po zidovima (svaki dio u svojoj fronti), oprema, radna ploča, obloga, ručke i završne obrade, LED i montaža —
          količine iz plana kuhinje, cijene iz kataloga studija preračunate bez PDV-a.
          {p.studioGrossEur ? ` Ukupno s PDV-om odgovara procjeni koju je kupac vidio u studiju (oko ${formatEur(p.studioGrossEur)}).` : ""}
        </span>
        {!pricesConfirmed && (
          <span className="mt-1.5 block text-amber-100/90">Cijene u katalogu studija još nisu potvrđene — provjerite svaku stavku prije slanja.</span>
        )}
        {p.warnings.length > 0 && (
          <ul className="mt-2 list-disc space-y-0.5 pl-5">
            {p.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        )}
      </Alert>
    );
  }
  if (p.mode === "estimate") {
    return (
      <Alert tone="warning" title="Kuhinja nije raščlanjena na stavke.">
        Konfiguraciju iz studija nije bilo moguće pročitati stavku po stavku, pa je upisana jedna stavka s procjenom iz studija
        {p.studioGrossEur ? ` (oko ${formatEur(p.studioGrossEur)} s PDV-om)` : ""}. Razdijelite je na stavke prije slanja.
      </Alert>
    );
  }
  return (
    <Alert tone="info" title="Upit nema podataka iz 3D studija.">
      Podaci kupca su preuzeti; stavke upišite sami.
    </Alert>
  );
}

export default async function NewQuotePage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const upit = typeof sp.upit === "string" && sp.upit.trim() ? sp.upit.trim() : null;

  let draft: NewQuoteDraft | null = null;
  let picker: Awaited<ReturnType<typeof recentLeads>> = [];
  try {
    [draft, picker] = await Promise.all([buildNewQuoteDraft(upit), upit ? Promise.resolve([]) : recentLeads()]);
  } catch (err) {
    console.error(`[admin] nova ponuda se ne može pripremiti (${dbErrorLabel(err)})`);
  }

  const lead = draft?.lead ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Ponude"
        title="Nova ponuda"
        description={
          lead
            ? `Za upit ${lead.number} · ${lead.name}. Ništa se ne sprema dok ne kliknete „Spremi nacrt”.`
            : "Ništa se ne sprema dok ne kliknete „Spremi nacrt”."
        }
        back={lead ? { href: `/admin/upiti/${lead.id}`, label: `Upit ${lead.number}` } : { href: "/admin/ponude", label: "Sve ponude" }}
      />

      {!draft ? (
        <Alert tone="danger" title="Nova ponuda se trenutno ne može pripremiti.">
          Baza podataka ne odgovara. Osvježite stranicu za minutu.
        </Alert>
      ) : (
        <QuoteEditor
          quoteId={null}
          leadId={lead?.id ?? null}
          version={null}
          initial={draft.values}
          saveAction={saveQuoteAction}
          notice={<PrefillNotice draft={draft} />}
          sidebar={
            lead ? (
              <Card padding="sm" aria-labelledby="nova-upit">
                <CardHeader id="nova-upit" title={`Upit ${lead.number}`} className="mb-3" action={<LeadStatusBadge status={lead.status} />} />
                {lead.snapshotPath && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={adminFileUrl(lead.snapshotPath)}
                    alt={`3D prikaz kuhinje iz upita ${lead.number}`}
                    className="mb-3 aspect-[4/3] w-full rounded-lg bg-ink-800 object-cover"
                  />
                )}
                <p className="text-[13px] font-medium text-fg">{lead.name}</p>
                <p className="text-[12.5px] text-mut">{[lead.city, lead.phone, lead.email].filter(Boolean).join(" · ")}</p>
                <div className="mt-3 flex items-center justify-between gap-2">
                  <LeadSourceBadge source={lead.source} />
                  <Link href={`/admin/upiti/${lead.id}`} className="text-[12.5px] font-medium text-mut transition-colors hover:text-accent">
                    Otvori upit
                  </Link>
                </div>
              </Card>
            ) : picker.length > 0 ? (
              <Card padding="sm" aria-labelledby="nova-iz-upita">
                <CardHeader
                  id="nova-iz-upita"
                  title="Iz upita"
                  description="Preuzmite podatke kupca — a za kuhinju iz 3D studija i stavke s cijenama."
                  className="mb-3"
                />
                <form action="/admin/ponude/nova" method="get" className="space-y-3">
                  <Select
                    name="upit"
                    label="Upit"
                    required
                    placeholder="Odaberite upit…"
                    options={picker.map((l) => ({
                      value: l.id,
                      label: `${l.number} · ${l.name}${l.source === "studio" ? " · 3D studio" : ""} · ${formatDate(l.createdAt)}`,
                    }))}
                  />
                  <button type="submit" className={buttonClass("secondary", "sm")}>
                    Učitaj upit
                  </button>
                  <p className="text-[12px] leading-snug text-mut">Nespremljene izmjene u obrascu tada se odbacuju.</p>
                </form>
              </Card>
            ) : null
          }
        />
      )}
    </>
  );
}
