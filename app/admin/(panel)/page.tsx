import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert, Card, CardHeader, EmptyState, IconExternal, IconInbox, IconQuote, IconSettings, LinkButton, PageHeader, StatCard, cx } from "@/components/admin/ui";
import { IconCheck, IconCube, IconPlus } from "@/components/admin/leads/icons";
import { LeadsTable } from "@/components/admin/leads/LeadsTable";
import { formatEur, plural } from "@/lib/admin/format";
import { getDashboardData, isLeadEmailConfigured, type DashboardData } from "@/lib/admin/leads";
import { SETTING_KEYS, companyCompleteness, getSettings, normalizeCompany, withSiteFallback } from "@/lib/admin/settings";
import { requireAdmin } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Pregled" };

const TZ = "Europe/Zagreb";
const siteHost = new URL(site.url).host;

function greeting(now: Date = new Date()): string {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: TZ, hour: "2-digit", hourCycle: "h23" }).format(now));
  if (hour >= 5 && hour < 11) return "Dobro jutro";
  if (hour >= 11 && hour < 18) return "Dobar dan";
  return "Dobra večer";
}

function today(now: Date = new Date()): string {
  const s = new Intl.DateTimeFormat("hr-HR", { timeZone: TZ, weekday: "long", day: "numeric", month: "long", year: "numeric" }).format(now);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

interface ChecklistItem {
  done: boolean;
  title: string;
  detail: string;
  href?: string;
}

async function loadChecklist(): Promise<ChecklistItem[] | null> {
  try {
    const stored = await getSettings([SETTING_KEYS.company, SETTING_KEYS.quoteDefaults]);
    const c = companyCompleteness(withSiteFallback(normalizeCompany(stored[SETTING_KEYS.company])));
    const email = isLeadEmailConfigured();
    return [
      {
        done: c.missingCore.length === 0,
        title: "Podaci o tvrtki",
        detail: `Upisano ${c.filled} od ${c.total} polja. Telefon, e-mail, adresa, naziv i OIB trebaju za ponude i za stranicu.`,
        href: "/admin/postavke",
      },
      {
        done: stored[SETTING_KEYS.quoteDefaults] !== undefined,
        title: "Uvjeti za ponude",
        detail: "PDV, rok valjanosti i uvjeti plaćanja koji se upisuju u svaku novu ponudu.",
        href: "/admin/postavke/ponude",
      },
      {
        done: email,
        title: "Obavijesti e-mailom",
        detail: email
          ? "Novi upiti stižu i na vaš e-mail."
          : "Još nisu uključene. Upiti se svejedno spremaju ovdje, ali kupac ne dobiva automatsku potvrdu. Uključuje ih razvoj.",
      },
    ];
  } catch (err) {
    console.error(`[admin] pregled: postavke se ne mogu učitati (${dbErrorLabel(err)})`);
    return null;
  }
}

function QuickLink({
  href,
  icon,
  title,
  detail,
  external = false,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  detail: string;
  external?: boolean;
}) {
  const body = (
    <>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/[0.08] text-fg/60 transition-colors group-hover:border-accent/50 group-hover:text-accent">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-medium text-fg">
          {title}
          {external && <span className="sr-only"> (nova kartica)</span>}
        </span>
        <span className="block truncate text-[12px] text-mut">{detail}</span>
      </span>
      <span aria-hidden className="text-fg/30 transition-transform duration-300 ease-premium group-hover:translate-x-0.5 group-hover:text-accent">
        {external ? "↗" : "→"}
      </span>
    </>
  );
  const cls =
    "group flex items-center gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors hover:bg-white/[0.03] focus-visible:bg-white/[0.05] focus-visible:ring-1 focus-visible:ring-accent/60";
  return external ? (
    <a href={href} target="_blank" rel="noopener" className={cls}>
      {body}
    </a>
  ) : (
    <Link href={href} className={cls}>
      {body}
    </Link>
  );
}

function money(cents: number) {
  return <span className="text-[clamp(28px,2.6vw,40px)]">{formatEur(Math.round(cents / 100))}</span>;
}

function Stats({ data }: { data: DashboardData }) {
  const { leads, quotes, accepted } = data;
  const openHint =
    quotes.sent && quotes.drafts
      ? `${quotes.sent} ${plural(quotes.sent, "poslana čeka", "poslane čekaju", "poslanih čeka")} odgovor · ${quotes.drafts} u izradi.`
      : quotes.sent
        ? `${quotes.sent} ${plural(quotes.sent, "poslana čeka", "poslane čekaju", "poslanih čeka")} odgovor kupca.`
        : quotes.drafts
          ? `${quotes.drafts} ${plural(quotes.drafts, "nacrt", "nacrta", "nacrta")}, još ${plural(quotes.drafts, "nije poslan", "nisu poslana", "nije poslano")}.`
          : "Nema ponuda u izradi ni na čekanju.";
  return (
    <section aria-label="Brojke" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Novi upiti"
        value={leads.novi}
        hint={leads.novi ? `${plural(leads.novi, "Čeka", "Čekaju", "Čeka")} vaš prvi odgovor.` : "Svi su upiti pregledani."}
        href="/admin/upiti?status=novi"
        highlight={leads.novi > 0}
      />
      <StatCard
        label="Upiti ovaj mjesec"
        value={leads.thisMonth}
        hint={`Prošli mjesec: ${leads.lastMonth} · ukupno ${leads.total}.`}
        href="/admin/upiti?status=sve"
      />
      <StatCard label="Otvorene ponude" value={quotes.open} hint={openHint} href="/admin/ponude" />
      <StatCard
        label={`Prihvaćeno ${accepted.year}.`}
        value={money(accepted.totalCents)}
        hint={
          accepted.count
            ? `${accepted.count} ${plural(accepted.count, "ponuda", "ponude", "ponuda")} · bez PDV-a ${formatEur(Math.round(accepted.netCents / 100))}.`
            : `Još nema prihvaćenih ponuda u ${accepted.year}.`
        }
        href="/admin/ponude"
      />
    </section>
  );
}

export default async function AdminOverviewPage() {
  const admin = await requireAdmin();

  const [data, checklist] = await Promise.all([
    getDashboardData().catch((err: unknown) => {
      console.error(`[admin] pregled se ne može učitati (${dbErrorLabel(err)})`);
      return null as DashboardData | null;
    }),
    loadChecklist(),
  ]);
  const pending = checklist?.filter((i) => !i.done).length ?? 0;

  return (
    <>
      <PageHeader
        eyebrow={`${greeting()}, ${admin.username}`}
        title="Pregled"
        description={`${today()}. Upiti iz 3D studija i s kontakt forme stižu ovdje — i onda kad slanje e-maila još nije uključeno.`}
        actions={
          <>
            <LinkButton href="/admin/upiti" variant="secondary" size="sm">
              Svi upiti
            </LinkButton>
            <LinkButton href="/admin/ponude/nova" variant="primary" size="sm" icon={<IconPlus size={14} />}>
              Nova ponuda
            </LinkButton>
          </>
        }
      />

      {!data ? (
        <Alert tone="danger" title="Podaci se trenutno ne mogu učitati.">
          Baza podataka ne odgovara. Osvježite stranicu za minutu; ako se ponavlja, provjerite postavke baze na Vercelu.
        </Alert>
      ) : (
        <div className="space-y-8">
          <Stats data={data} />

          <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
            <Card aria-labelledby="zadnji-upiti" className="min-w-0">
              <CardHeader
                id="zadnji-upiti"
                title="Zadnji upiti"
                description={data.recent.length ? "Pet najnovijih, s obje forme." : undefined}
                action={
                  data.recent.length > 0 ? (
                    <LinkButton href="/admin/upiti" size="sm" variant="ghost">
                      Svi upiti →
                    </LinkButton>
                  ) : null
                }
              />
              {data.recent.length === 0 ? (
                <EmptyState
                  title="Još nema upita."
                  description="Kad kupac pošalje kuhinju iz 3D studija ili poruku s kontakt forme, upit se pojavi ovdje: broj, kontakt, a za studio i slika kuhinje, mjere i okvirna cijena."
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
                <LeadsTable rows={data.recent} caption="Zadnji upiti" compact />
              )}
            </Card>

            <div className="space-y-6">
              {checklist && pending > 0 && (
                <Card aria-labelledby="priprema">
                  <CardHeader
                    id="priprema"
                    eyebrow={`${checklist.length - pending} / ${checklist.length}`}
                    title="Priprema za rad"
                    description="Što još nedostaje da ponude i stranica imaju prave podatke."
                    className="mb-4"
                  />
                  <ol className="space-y-1">
                    {checklist.map((item) => {
                      const inner = (
                        <>
                          <span
                            aria-hidden
                            className={cx(
                              "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border",
                              item.done ? "border-emerald-300/40 bg-emerald-400/10 text-emerald-200" : "border-white/15 text-transparent",
                            )}
                          >
                            <IconCheck size={12} />
                          </span>
                          <span className="min-w-0">
                            <span className={cx("block text-[13.5px] font-medium", item.done ? "text-fg/50 line-through decoration-white/20" : "text-fg")}>
                              {item.title}
                              <span className="sr-only">{item.done ? " — gotovo" : " — nije gotovo"}</span>
                            </span>
                            <span className="mt-0.5 block text-[12px] leading-snug text-mut">{item.detail}</span>
                          </span>
                        </>
                      );
                      return (
                        <li key={item.title}>
                          {item.href && !item.done ? (
                            <Link
                              href={item.href}
                              className="flex gap-3 rounded-xl px-2.5 py-2.5 outline-none transition-colors hover:bg-white/[0.03] focus-visible:ring-1 focus-visible:ring-accent/60"
                            >
                              {inner}
                            </Link>
                          ) : (
                            <div className="flex gap-3 px-2.5 py-2.5">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </Card>
              )}

              <Card as="div" padding="sm">
                <CardHeader id="brze-poveznice" title="Brze poveznice" className="mb-2 px-2.5 pt-1" />
                <nav aria-labelledby="brze-poveznice" className="space-y-0.5">
                  <QuickLink href="/admin/upiti" icon={<IconInbox size={16} />} title="Upiti" detail="Pretraga, statusi i bilješke" />
                  <QuickLink href="/admin/ponude/nova" icon={<IconPlus size={16} />} title="Nova ponuda" detail="Prazna ponuda, bez upita" />
                  <QuickLink href="/admin/ponude" icon={<IconQuote size={16} />} title="Ponude" detail="Nacrti, poslane i prihvaćene" />
                  <QuickLink href="/admin/postavke" icon={<IconSettings size={16} />} title="Postavke" detail="Tvrtka, korisnici, uvjeti ponuda" />
                  <QuickLink href="/studio" icon={<IconCube size={16} />} title="3D studio" detail="Ono što vide kupci" external />
                  <QuickLink href="/" icon={<IconExternal size={16} />} title="Javna stranica" detail={siteHost} external />
                </nav>
              </Card>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
