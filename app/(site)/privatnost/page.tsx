/**
 * Politika privatnosti — DRAFT.
 * TODO(vlasnik): pregledati i potvrditi (po mogućnosti uz pravni savjet) prije objave
 * (cijeli popis: docs/PRIJE-OBJAVE.md):
 *  - podaci voditelja obrade (lib/site.ts → legal, contact.email)
 *  - pružatelj hostinga i poslovne e-pošte, mehanizam prijenosa podataka u SAD
 *  - rok čuvanja upita (RETENTION_MONTHS)
 *  - tekst privole u formama (ContactForm, 3D studio) mora odgovarati točki 3 (pravna osnova)
 *
 * Missing controller facts never vanish silently: development shows "upisati …" markers, a
 * production build shows a visible note on the page and logs a warning during the build.
 */
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { site } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { PageHero } from "@/components/pages/PageHero";
import { pageMetadata } from "@/components/pages/meta";

export const metadata: Metadata = pageMetadata({
  title: "Politika privatnosti",
  description:
    "Kako EMNA Interijeri obrađuje osobne podatke iz upita i 3D studija: koje podatke prikupljamo, zašto, koliko dugo ih čuvamo i koja su vaša prava.",
  path: "/privatnost",
});

/** TODO(vlasnik): potvrditi rok čuvanja upita koji nisu prešli u suradnju */
const RETENTION_MONTHS = 12;
const UPDATED = "24. listopada 2026.";

/** what a GDPR controller notice (čl. 13. st. 1. t. a) cannot do without */
const controllerMissing = [
  !site.legal.companyName && "puni naziv tvrtke",
  !site.legal.oib && "OIB",
  !site.legal.seat && "sjedište",
  !site.contact.email && "e-mail za pitanja o privatnosti",
].filter((v): v is string => Boolean(v));

if (process.env.NODE_ENV === "production" && controllerMissing.length > 0) {
  console.warn(
    `[PRIJE OBJAVE] /privatnost: nedostaju podaci voditelja obrade (${controllerMissing.join(", ")}). ` +
      "Upišite ih u lib/site.ts — popis: docs/PRIJE-OBJAVE.md.",
  );
}

const sections = [
  { id: "voditelj", title: "Tko obrađuje vaše podatke" },
  { id: "podaci", title: "Koje podatke prikupljamo" },
  { id: "svrha", title: "Svrha i pravna osnova" },
  { id: "primatelji", title: "Tko još vidi podatke" },
  { id: "cuvanje", title: "Koliko dugo ih čuvamo" },
  { id: "prava", title: "Vaša prava" },
  { id: "kolacici", title: "Kolačići" },
  { id: "sigurnost", title: "Sigurnost" },
  { id: "izmjene", title: "Izmjene" },
] as const;

function Section({ id, n, children }: { id: (typeof sections)[number]["id"]; n: number; children: ReactNode }) {
  const title = sections.find((s) => s.id === id)?.title;
  return (
    <section id={id} aria-labelledby={`${id}-naslov`} className="scroll-mt-28 border-t border-hairline pt-9">
      <div className="flex items-baseline gap-4">
        <span className="text-[13px] font-medium tabular-nums text-bronze-deep">{String(n).padStart(2, "0")}</span>
        <h2 id={`${id}-naslov`} className="heading text-[24px] tracking-head-sm sm:text-[28px]">
          {title}
        </h2>
      </div>
      <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-taupe sm:text-base [&_a]:text-graphite [&_a]:underline [&_a]:decoration-graphite/30 [&_a]:decoration-1 [&_a]:underline-offset-4 [&_a:hover]:decoration-graphite [&_strong]:font-semibold [&_strong]:text-graphite [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:pl-5 [&_li::marker]:text-bronze">
        {children}
      </div>
    </section>
  );
}

export default function PrivatnostPage() {
  const { legal, contact } = site;
  const controller = [
    { label: "Naziv", value: legal.companyName ?? (showTodos ? null : site.name), todo: "puni naziv tvrtke" },
    { label: "OIB", value: legal.oib, todo: "OIB" },
    { label: "Sjedište", value: legal.seat, todo: "sjedište" },
    { label: "Vlasnik obrta", value: legal.owner, todo: "vlasnik (ako je obrt)" },
    { label: "E-mail", value: contact.email, todo: "e-mail za pitanja o privatnosti" },
    { label: "Telefon", value: contact.phone, todo: "telefon" },
  ].filter((r) => r.value || showTodos);

  // "na info@…" when the e-mail is known, otherwise point to the contact form (marker in development)
  const reachUs = contact.email ? (
    <>
      na <a href={`mailto:${contact.email}`}>{contact.email}</a>
    </>
  ) : showTodos ? (
    <>
      na <Fill value={null} label="e-mail" />
    </>
  ) : (
    <>
      putem forme na stranici <Link href="/kontakt">Kontakt</Link>
    </>
  );

  return (
    <>
      <PageHero
        size="sm"
        eyebrow="Privatnost"
        lines={[{ text: "Politika" }, { text: "privatnosti.", accent: true }]}
        lead={
          <p>
            Koje podatke prikupljamo kad nam pošaljete upit, zašto, koliko dugo ih čuvamo i kako ih možete zatražiti ili
            obrisati.
          </p>
        }
      />

      <section className="bg-canvas pb-24 pt-6 lg:pb-32 lg:pt-8">
        <div className="shell grid gap-12 lg:grid-cols-12 lg:gap-10">
          <nav aria-label="Sadržaj" className="lg:col-span-3">
            <div className="lg:sticky lg:top-32">
              <p className="kicker text-taupe">Sadržaj</p>
              <ol className="mt-5 space-y-2.5 text-[14px]">
                {sections.map((s, i) => (
                  <li key={s.id}>
                    <a href={`#${s.id}`} className="flex gap-3 text-graphite/75 transition-colors hover:text-graphite">
                      <span className="tabular-nums text-taupe">{String(i + 1).padStart(2, "0")}</span>
                      {s.title}
                    </a>
                  </li>
                ))}
              </ol>
              <p className="mt-8 text-[13px] text-taupe">Posljednja izmjena: {UPDATED}</p>
            </div>
          </nav>

          <div className="max-w-2xl space-y-14 lg:col-span-8 lg:col-start-5">
            {showTodos && (
              <div role="note" className="rounded-2xl border border-dashed border-bronze/60 bg-greige p-5 text-[14px] leading-relaxed text-graphite">
                <strong className="font-semibold">Nacrt za pregled.</strong> Ovu politiku vlasnik mora pregledati i potvrditi
                (po mogućnosti uz pravni savjet) prije objave: podatke voditelja obrade, pružatelje hostinga i e-pošte,
                prijenos podataka u SAD, rok čuvanja od {RETENTION_MONTHS} mjeseci i tekst privole u formama (mora
                odgovarati točki 3). Popis svega što treba prije objave je u docs/PRIJE-OBJAVE.md. Ova napomena vidljiva je
                samo u razvoju.
              </div>
            )}

            <p className="text-[17px] leading-relaxed text-graphite/85">
              Osobne podatke obrađujemo u skladu s Općom uredbom o zaštiti podataka (EU) 2016/679 (GDPR) i Zakonom o
              provedbi Opće uredbe o zaštiti podataka. Prikupljamo samo ono što je potrebno da odgovorimo na vaš upit.
            </p>

            <Section id="voditelj" n={1}>
              <p>Voditelj obrade osobnih podataka je:</p>
              <dl className="grid gap-x-8 gap-y-4 rounded-2xl border border-hairline bg-card p-5 sm:grid-cols-2">
                {controller.map((r) => (
                  <div key={r.label}>
                    <dt className="text-[13px] text-taupe">{r.label}</dt>
                    <dd className="mt-1 text-graphite">
                      <Fill value={r.value} label={r.todo} />
                    </dd>
                  </div>
                ))}
              </dl>
              {/* production with missing facts: say so instead of silently showing a shorter list */}
              {!showTodos && controllerMissing.length > 0 && (
                <p role="note" className="rounded-2xl border border-hairline bg-greige p-4 text-[14px] text-graphite">
                  Dio podataka o voditelju obrade još nije objavljen na ovoj stranici ({controllerMissing.join(", ")}).
                </p>
              )}
              <p>Za sva pitanja o osobnim podacima javite nam se {reachUs}.</p>
            </Section>

            <Section id="podaci" n={2}>
              <p>
                <strong>Forma za upit.</strong> Ime i prezime, broj telefona, e-mail adresa te, ako ih upišete, grad, što vas
                zanima, kada planirate radove i vaša poruka.
              </p>
              <p>
                <strong>Upit iz 3D studija.</strong> Isti kontakt podaci te kuhinja koju ste složili: mjere zidova i stropa,
                oblik, odabrani materijali i dodaci, okvirna cijena, slika 3D prikaza i poveznica koja otvara tu
                konfiguraciju. Dok kuhinju slažete, podaci ostaju u vašem pregledniku i ne šalju nam se dok ne pošaljete
                upit.
              </p>
              <p>
                <strong>Tehnički podaci.</strong> Pri slanju upita IP adresa se kratkotrajno koristi u radnoj memoriji
                poslužitelja kako bismo ograničili broj upita i zaštitili stranicu od zlouporabe; ne spremamo je uz upit.
                Pružatelj smještaja stranice može voditi uobičajene zapise poslužitelja (IP adresa, vrijeme pristupa,
                vrsta preglednika).
              </p>
              <p>Ne prikupljamo posebne kategorije osobnih podataka i ne izrađujemo profile.</p>
            </Section>

            <Section id="svrha" n={3}>
              <ul>
                <li>
                  <strong>Odgovor na upit, izmjera i priprema ponude</strong>: obrada je potrebna kako bismo na vaš zahtjev
                  poduzeli radnje prije sklapanja ugovora (čl. 6. st. 1. t. b GDPR-a). Označavanjem polja privole u formi
                  pristajete da vas u vezi s upitom kontaktiramo telefonom ili e-poštom (čl. 6. st. 1. t. a GDPR-a). Privolu
                  možete povući u bilo kojem trenutku, bez utjecaja na zakonitost obrade prije povlačenja.
                </li>
                <li>
                  <strong>Izvršenje ugovora</strong>, ako se odlučite za suradnju (čl. 6. st. 1. t. b), te ispunjavanje
                  zakonskih obveza, primjerice računovodstvenih i poreznih (čl. 6. st. 1. t. c).
                </li>
                <li>
                  <strong>Zaštita stranice od zlouporabe i neželjenih poruka</strong>: legitimni interes (čl. 6. st. 1. t. f).
                </li>
              </ul>
              <p>Podatke iz upita ne koristimo za oglašavanje i ne šaljemo promotivne poruke.</p>
            </Section>

            <Section id="primatelji" n={4}>
              <p>Podatke ne prodajemo i ne ustupamo trećima za njihove svrhe. Pristup imaju samo izvršitelji obrade koji nam pomažu da upit stigne do nas:</p>
              <ul>
                <li>
                  <strong>Resend, Inc.</strong> (SAD), usluga dostave e-pošte: preko nje upit stiže do nas, a vama potvrda o
                  primitku.
                </li>
                <li>
                  <strong>Pružatelj smještaja (hostinga) stranice</strong>, na čijim se poslužiteljima stranica i forma
                  izvode. <Fill value={null} label="naziv pružatelja hostinga, npr. Vercel Inc. (SAD)" />
                </li>
                <li>
                  <strong>Pružatelj poslovne e-pošte</strong> u čiji pretinac upiti stižu.{" "}
                  <Fill value={null} label="naziv pružatelja e-pošte" />
                </li>
              </ul>
              <p>
                Kad se podaci prenose izvan Europskog gospodarskog prostora, prijenos se temelji na odluci Europske komisije o
                primjerenosti (EU–SAD okvir za privatnost podataka) ili na standardnim ugovornim klauzulama Europske
                komisije. <Fill value={null} label="potvrditi mehanizam prijenosa za svakog izvršitelja" />
              </p>
              <p>
                Ako nam pišete putem WhatsAppa ili otvorite poveznicu na kartu, za te usluge vrijede pravila privatnosti
                njihovih pružatelja. Stranica ih ne učitava dok ih sami ne otvorite.
              </p>
            </Section>

            <Section id="cuvanje" n={5}>
              <ul>
                <li>
                  Upite nakon kojih ne dođe do suradnje čuvamo najdulje {RETENTION_MONTHS} mjeseci od posljednjeg kontakta, a
                  zatim ih brišemo.
                </li>
                <li>
                  Ako sklopimo ugovor, podatke čuvamo koliko je potrebno za njegovo izvršenje i jamstvene obveze, a
                  računovodstvenu dokumentaciju onoliko koliko propisuju porezni i računovodstveni propisi.
                </li>
                <li>IP adrese korištene za ograničenje broja upita ne spremamo trajno.</li>
              </ul>
            </Section>

            <Section id="prava" n={6}>
              <p>U svakom trenutku možete zatražiti:</p>
              <ul>
                <li>pristup podacima koje o vama imamo i njihovu kopiju (čl. 15.),</li>
                <li>ispravak netočnih podataka (čl. 16.),</li>
                <li>brisanje podataka (čl. 17.),</li>
                <li>ograničenje obrade (čl. 18.),</li>
                <li>prenosivost podataka (čl. 20.),</li>
                <li>prigovor na obradu koja se temelji na legitimnom interesu (čl. 21.),</li>
                <li>povlačenje privole (čl. 7. st. 3.).</li>
              </ul>
              <p>
                Zahtjev pošaljite {reachUs}. Odgovorit ćemo bez nepotrebnog odgađanja, a najkasnije u roku od mjesec
                dana.
              </p>
              <p>
                Ako smatrate da obrada vaših podataka nije zakonita, možete podnijeti pritužbu nadzornom tijelu:{" "}
                <strong>Agencija za zaštitu osobnih podataka</strong>, Selska cesta 136, 10000 Zagreb,{" "}
                <a href="https://azop.hr" target="_blank" rel="noreferrer">
                  azop.hr
                </a>
                .
              </p>
            </Section>

            <Section id="kolacici" n={7}>
              <p>
                Stranica ne postavlja kolačiće za praćenje, analitiku ni oglašavanje, zato nema ni trake za privolu.
                Fontovi se poslužuju s našeg poslužitelja, bez učitavanja s vanjskih servisa.
              </p>
              <p>Ako to ikad promijenimo, prvo ćemo ažurirati ovu stranicu i zatražiti vašu privolu gdje je ona potrebna.</p>
            </Section>

            <Section id="sigurnost" n={8}>
              <p>
                Stranica i forma rade isključivo preko šifrirane veze (HTTPS). Upitima pristupaju samo osobe koje na njima
                rade. Ne donosimo odluke isključivo automatiziranom obradom i ne izrađujemo profile.
              </p>
            </Section>

            <Section id="izmjene" n={9}>
              <p>
                Ovu politiku možemo izmijeniti kad se promijeni način na koji obrađujemo podatke. Važeća verzija uvijek je
                objavljena na ovoj stranici. Posljednja izmjena: {UPDATED}
              </p>
            </Section>
          </div>
        </div>
      </section>
    </>
  );
}
