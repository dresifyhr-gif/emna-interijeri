import type { Metadata } from "next";
import { cityLine, site } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/pages/PageHero";
import { SectionHead } from "@/components/pages/SectionHead";
import { ProcessSteps } from "@/components/pages/ProcessSteps";
import { CtaPair } from "@/components/pages/CtaPair";
import { pageMetadata } from "@/components/pages/meta";

export const metadata: Metadata = pageMetadata({
  title: "O nama",
  description:
    "EMNA Interijeri projektira, izrađuje i montira kuhinje, ormare i interijere po mjeri. Kako radimo i do čega nam je stalo: preciznost, jedan tim od izmjere do montaže i jasna cijena.",
  path: "/o-nama",
});

const values = [
  {
    title: "Preciznost",
    text: "Kuhinja po mjeri vrijedi onoliko koliko je točna izmjera. Zidove koji nisu ravni, kutove i instalacije bilježimo prije crtanja, a ne tek na montaži.",
  },
  {
    title: "Jedan tim od izmjere do montaže",
    text: "Izmjera, projekt, izrada i montaža ostaju u istim rukama. Ono što je dogovoreno ne gubi se između izvođača.",
  },
  {
    title: "Jasna cijena",
    text: "Okvirni raspon cijene vidite odmah u 3D studiju. U ponudi je svaka stavka navedena zasebno, pa znate što plaćate.",
  },
];

export default function ONamaPage() {
  const { facts, legal } = site;
  const factRows = [
    { value: facts.years, label: "godina iskustva", todo: "broj godina rada" },
    { value: facts.projects, label: "izrađenih projekata", todo: "broj izrađenih projekata" },
  ].filter((f) => f.value || showTodos);

  // ZTD čl. 21 (d.o.o.) / Zakon o obrtu: only what applies is filled in lib/site.ts; the rest stays hidden in production
  const legalRows = [
    { label: "Naziv", value: legal.companyName, todo: "puni naziv tvrtke" },
    { label: "OIB", value: legal.oib, todo: "OIB" },
    { label: "Sjedište", value: legal.seat, todo: "sjedište" },
    { label: "Registar", value: legal.registry, todo: "sudski registar / MBS" },
    { label: "Temeljni kapital", value: legal.shareCapital, todo: "temeljni kapital i je li uplaćen u cijelosti (d.o.o.)" },
    { label: "Uprava", value: legal.management, todo: "članovi uprave (d.o.o.)" },
    { label: "Vlasnik", value: legal.owner, todo: "vlasnik (obrt)" },
    { label: "Banka i IBAN", value: legal.bank, todo: "banka i IBAN poslovnog računa" },
  ].filter((r) => r.value || showTodos);

  return (
    <>
      <PageHero
        size="md"
        eyebrow="O nama"
        lines={[{ text: "Radimo po mjeri." }, { text: "Doslovno.", accent: true }]}
        lead={
          <p>
            {site.name} projektira, izrađuje i montira kuhinje, ormare i interijere po mjeri. Ne slažemo kataloške module:
            svaki komad crtamo za prostor u kojem će stajati.
          </p>
        }
        actions={
          <>
            <LinkButton href="/radovi" variant="light" arrow>
              Pogledajte radove
            </LinkButton>
            <LinkButton href="/kontakt" variant="outline">
              Kontakt
            </LinkButton>
          </>
        }
      />

      {factRows.length > 0 && (
        <section aria-label="Brojke" className="border-t border-white/10 bg-ink">
          <dl className={`shell grid ${factRows.length > 1 ? "sm:grid-cols-2" : ""}`}>
            {factRows.map((f, i) => (
              <div
                key={f.label}
                className={`flex flex-row-reverse items-end justify-end gap-5 py-10 sm:py-14 ${i > 0 ? "border-t border-white/10 sm:border-l sm:border-t-0 sm:pl-10" : ""}`}
              >
                {/* dt before dd in the DOM; row-reverse shows the number first */}
                <Fill value={f.value} label={f.todo}>
                  {(v) => (
                    <>
                      <dt className="eyebrow pb-3 text-mut">{f.label}</dt>
                      <dd className="display text-[clamp(56px,8vw,120px)] text-accent">{v}</dd>
                    </>
                  )}
                </Fill>
              </div>
            ))}
          </dl>
        </section>
      )}

      {/* ── Tko smo ── */}
      <section className="bg-paper py-24 text-ink lg:py-36">
        <div className="shell grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-7">
            <Reveal y={14}>
              <p className="eyebrow flex items-center gap-4 text-accent-deep">
                <span aria-hidden className="h-px w-8 bg-accent-deep/70" />
                Tko smo
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="mt-6 font-display text-[clamp(30px,3.8vw,58px)] font-medium leading-[1.05] tracking-tight">
                Kuhinja se ne mijenja svake godine. Zato je radimo tako da odgovara baš vašem prostoru i načinu na koji u
                njemu živite.
              </h2>
            </Reveal>
          </div>
          <div className="space-y-6 text-[17px] leading-relaxed text-ink/75 lg:col-span-5 lg:pt-16">
            <Reveal delay={0.12}>
              <p>
                Prije prve linije na crtežu slušamo: tko kuha, što se sprema, gdje treba svjetlo, što vam smeta u
                prostoru koji sada imate. Tek onda mjerimo i crtamo.
              </p>
            </Reveal>
            <Reveal delay={0.18}>
              <p>
                Projekt vidite u 3D-u prije nego što se izreže prva ploča. Kad ga potvrdite, izrađujemo i montiramo, a vi
                do kraja imate jednog sugovornika.
              </p>
            </Reveal>
            {(site.contact.address || cityLine || showTodos) && (
              <Reveal delay={0.24}>
                <div className="border-t border-ink/15 pt-5">
                  <p className="eyebrow text-mut-paper">Gdje smo</p>
                  <p className="mt-2 text-[15px] text-ink/80">
                    <Fill value={site.contact.address} label="adresa" className="mr-2">
                      {(v) => <>{v}{cityLine ? ", " : ""}</>}
                    </Fill>
                    <Fill value={cityLine} label="grad" />
                  </p>
                </div>
              </Reveal>
            )}
          </div>
        </div>
      </section>

      {/* ── Kako radimo ── */}
      <section id="kako-radimo" className="scroll-mt-20 bg-ink py-24 lg:py-36">
        <div className="shell">
          <SectionHead
            eyebrow="Kako radimo"
            title={
              <>
                Četiri koraka,
                <br />
                <span className="text-accent">jedan tim.</span>
              </>
            }
          />
          <ProcessSteps className="mt-14 lg:mt-20" />
        </div>
      </section>

      {/* ── Vrijednosti ── */}
      <section className="bg-ink-700 py-24 lg:py-36">
        <div className="shell">
          <SectionHead
            eyebrow="Do čega nam je stalo"
            title={
              <>
                Tri stvari
                <br />
                <span className="text-accent">koje ne prepuštamo slučaju.</span>
              </>
            }
          />
          <ol className="mt-14 border-t border-white/10 lg:mt-20">
            {values.map((v, i) => (
              <Reveal
                as="li"
                key={v.title}
                delay={i * 0.06}
                className="grid gap-4 border-b border-white/10 py-10 sm:grid-cols-[120px_1fr] lg:grid-cols-[200px_minmax(0,5fr)_minmax(0,6fr)] lg:items-baseline lg:gap-10 lg:py-14"
              >
                <span className="font-display text-[48px] font-bold leading-none tracking-tightest text-transparent [-webkit-text-stroke:1px_rgba(201,185,154,.7)]">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <h3 className="font-display text-[28px] font-medium leading-tight tracking-tight sm:col-start-2 lg:col-start-auto">
                  {v.title}
                </h3>
                <p className="max-w-xl text-[15px] leading-relaxed text-fg/65 sm:col-start-2 lg:col-start-auto">{v.text}</p>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Podaci o tvrtki ── */}
      {legalRows.length > 0 && (
        <section aria-labelledby="podaci" className="bg-paper py-20 text-ink lg:py-24">
          <div className="shell grid gap-8 lg:grid-cols-12">
            <h2 id="podaci" className="eyebrow text-accent-deep lg:col-span-4">
              Podaci o tvrtki
            </h2>
            <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2 lg:col-span-8">
              {legalRows.map((r) => (
                <div key={r.label} className="border-t border-ink/15 pt-4">
                  <dt className="eyebrow text-mut-paper">{r.label}</dt>
                  <dd className="mt-2 text-[15px]">
                    <Fill value={r.value} label={r.todo} />
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        </section>
      )}

      <CtaPair
        eyebrow="Upoznajmo se"
        title={
          <>
            Počnimo od
            <br />
            <span className="text-accent-deep">vašeg prostora.</span>
          </>
        }
        items={[
          {
            href: "/studio",
            kicker: "3D studio",
            title: "Složite kuhinju.",
            text: "Za dvije minute složite kuhinju po svojim zidovima i pošaljite nam upit s točnim mjerama.",
          },
          {
            href: "/kontakt",
            kicker: "Kontakt",
            title: "Javite nam se.",
            text: "Kuhinja, ormar ili cijeli interijer: opišite što trebate i javit ćemo vam se.",
          },
        ]}
      />
    </>
  );
}
