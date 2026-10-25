import type { Metadata } from "next";
import Link from "next/link";
import {
  Alert,
  Badge,
  EmptyState,
  Input,
  LinkButton,
  PageHeader,
  QuoteStatusBadge,
  StatCard,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  buttonClass,
  cx,
  rowLinkClass,
} from "@/components/admin/ui";
import { IconPlus } from "@/components/admin/quotes/icons";
import { formatCents, formatDate, formatRelative, plural } from "@/lib/admin/format";
import { listQuotes, type QuoteListRow } from "@/lib/admin/quotes";
import { QUOTE_STATUS_LABEL } from "@/lib/admin/status";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { QUOTE_STATUSES, isQuoteStatus, type QuoteStatus } from "@/lib/db/enums";

export const metadata: Metadata = { title: "Ponude" };

type SP = Promise<Record<string, string | string[] | undefined>>;

const fold = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/gi, "d")
    .toLowerCase();

function matches(r: QuoteListRow, q: string): boolean {
  const hay = fold([r.number, r.customerName, r.title, r.customerEmail ?? "", r.leadNumber ?? ""].join(" "));
  return fold(q)
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

function href(status: QuoteStatus | null, q: string): string {
  const p = new URLSearchParams();
  if (status) p.set("status", status);
  if (q) p.set("q", q);
  const s = p.toString();
  return s ? `/admin/ponude?${s}` : "/admin/ponude";
}

export default async function QuotesPage({ searchParams }: { searchParams: SP }) {
  await requireAdmin();
  const sp = await searchParams;
  const status = isQuoteStatus(sp.status) ? sp.status : null;
  const q = typeof sp.q === "string" ? sp.q.trim().slice(0, 100) : "";
  const deleted = typeof sp.obrisana === "string" && /^P-\d{4}-\d{4,6}$/.test(sp.obrisana) ? sp.obrisana : null;

  let data: Awaited<ReturnType<typeof listQuotes>> | null = null;
  try {
    data = await listQuotes();
  } catch (err) {
    console.error(`[admin] ponude se ne mogu učitati (${dbErrorLabel(err)})`);
  }

  const all = data?.rows ?? [];
  const counts = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0])) as Record<QuoteStatus, number>;
  const sums = Object.fromEntries(QUOTE_STATUSES.map((s) => [s, 0])) as Record<QuoteStatus, number>;
  for (const r of all) {
    counts[r.status]++;
    sums[r.status] += r.totalCents;
  }
  const searched = q ? all.filter((r) => matches(r, q)) : all;
  const rows = status ? searched.filter((r) => r.status === status) : searched;

  return (
    <>
      <PageHeader
        eyebrow="Ponude"
        title="Ponude"
        description="Ponude kupcima — iz upita iz 3D studija stavke se popune same, iz kataloga studija."
        actions={
          <LinkButton href="/admin/ponude/nova" variant="primary" size="sm" icon={<IconPlus />}>
            Nova ponuda
          </LinkButton>
        }
      />

      {deleted && (
        <Alert tone="success" className="mb-6">
          Nacrt {deleted} je obrisan.
        </Alert>
      )}

      {!data ? (
        <Alert tone="danger" title="Ponude se trenutno ne mogu učitati.">
          Baza podataka ne odgovara. Osvježite stranicu za minutu.
        </Alert>
      ) : all.length === 0 ? (
        <EmptyState
          title="Još nema ponuda."
          description="Napravite ponudu iz upita (otvorite upit iz 3D studija pa „Nova ponuda” — stavke i cijene popune se iz kuhinje koju je kupac složio) ili praznu ponudu od nule."
          action={
            <LinkButton href="/admin/ponude/nova" variant="primary" size="sm" icon={<IconPlus />}>
              Nova ponuda
            </LinkButton>
          }
        />
      ) : (
        <div className="space-y-8">
          <section aria-label="Brojke" className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard
              label="Čekaju odgovor"
              value={counts.poslana}
              hint={counts.poslana ? `Ukupno ${formatCents(sums.poslana)} s PDV-om.` : "Nijedna poslana ponuda ne čeka odgovor."}
              href={href("poslana", "")}
              highlight={counts.poslana > 0}
            />
            <StatCard
              label="Prihvaćeno"
              value={counts.prihvacena}
              hint={counts.prihvacena ? `Ukupno ${formatCents(sums.prihvacena)} s PDV-om.` : "Još nijedna prihvaćena ponuda."}
              href={href("prihvacena", "")}
            />
            <StatCard
              label="Nacrti"
              value={counts.nacrt}
              hint={counts.nacrt ? `${counts.nacrt} ${plural(counts.nacrt, "ponuda čeka", "ponude čekaju", "ponuda čeka")} slanje.` : "Nema ponuda u izradi."}
              href={href("nacrt", "")}
            />
          </section>

          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <nav aria-label="Filtriraj po statusu" className="-mx-1 overflow-x-auto">
              <ul className="flex gap-1 px-1">
                {[null, ...QUOTE_STATUSES].map((s) => {
                  const active = s === status;
                  const n = s ? counts[s] : all.length;
                  return (
                    <li key={s ?? "sve"}>
                      <Link
                        href={href(s, q)}
                        aria-current={active ? "page" : undefined}
                        className={cx(
                          "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-[12.5px] font-medium transition-colors",
                          active ? "bg-white/[0.08] text-fg" : "text-fg/60 hover:bg-white/[0.04] hover:text-fg",
                        )}
                      >
                        {s ? QUOTE_STATUS_LABEL[s] : "Sve"}
                        <span className={cx("tabular-nums", active ? "text-accent" : "text-mut")}>{n}</span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>

            <form action="/admin/ponude" method="get" role="search" className="flex gap-2 lg:w-[340px]">
              {status && <input type="hidden" name="status" value={status} />}
              <Input
                name="q"
                type="search"
                aria-label="Traži ponude"
                placeholder="Broj, kupac, naslov…"
                defaultValue={q}
                maxLength={100}
                className="h-9"
              />
              <button type="submit" className={buttonClass("secondary", "sm")}>
                Traži
              </button>
            </form>
          </div>

          {rows.length === 0 ? (
            <EmptyState
              title="Nema ponuda za ovaj odabir."
              description={q ? `Ništa ne odgovara upitu „${q}”${status ? ` među ponudama sa statusom „${QUOTE_STATUS_LABEL[status]}”` : ""}.` : "Odaberite drugi status."}
              action={
                <LinkButton href="/admin/ponude" size="sm">
                  Prikaži sve
                </LinkButton>
              }
            />
          ) : (
            <Table caption="Ponude" minWidth={820}>
              <THead>
                <TR>
                  <TH>Ponuda</TH>
                  <TH>Status</TH>
                  <TH align="right">Ukupno</TH>
                  <TH align="right">Izrađena</TH>
                  <TH align="right">Vrijedi do</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id} interactive>
                    <TD>
                      <Link href={`/admin/ponude/${r.id}`} className={rowLinkClass}>
                        {r.customerName}
                      </Link>
                      <span className="mt-0.5 block max-w-[420px] truncate text-[12px] text-mut">
                        {r.number}
                        {r.title ? ` · ${r.title}` : ""}
                        {r.leadNumber ? ` · upit ${r.leadNumber}` : ""}
                      </span>
                    </TD>
                    <TD>
                      <span className="flex flex-wrap items-center gap-1.5">
                        <QuoteStatusBadge status={r.status} />
                        {r.status === "poslana" && r.viewedAt && (
                          <Badge tone="muted" dot={false}>
                            otvorena {formatDate(r.viewedAt)}
                          </Badge>
                        )}
                      </span>
                    </TD>
                    <TD align="right" nowrap className="tabular-nums">
                      {r.itemCount ? formatCents(r.totalCents) : <span className="text-mut">—</span>}
                    </TD>
                    <TD align="right" muted nowrap>
                      {formatRelative(r.createdAt)}
                    </TD>
                    <TD align="right" muted nowrap className={r.status === "istekla" ? "text-rose-200/80" : undefined}>
                      {r.validUntil ? formatDate(r.validUntil) : "—"}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}

          {data.truncated && (
            <p className="text-[12.5px] text-mut">Prikazano je i pretraženo zadnjih 1000 ponuda.</p>
          )}
        </div>
      )}
    </>
  );
}
