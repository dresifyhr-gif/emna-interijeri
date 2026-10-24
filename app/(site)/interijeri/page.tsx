import type { Metadata } from "next";
import Link from "next/link";
import { Arrow, LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/pages/PageHero";
import { SectionHead } from "@/components/pages/SectionHead";
import { ProcessSteps } from "@/components/pages/ProcessSteps";
import { SoonNote } from "@/components/pages/SoonNote";
import { CtaPair } from "@/components/pages/CtaPair";
import { RoomPlan } from "@/components/pages/drawings/RoomPlan";
import { planCallouts } from "@/components/pages/drawings/legends";
import { pageMetadata } from "@/components/pages/meta";

export const metadata: Metadata = pageMetadata({
  title: "Interijeri po mjeri",
  description:
    "Namještaj po mjeri za cijeli stan ili kuću: kuhinja, dnevni boravak, spavaća soba, hodnik i radna soba, projektirani zajedno u jednoj paleti materijala.",
  path: "/interijeri",
});

const rooms: { name: string; text: string; link?: { href: string; label: string } }[] = [
  {
    name: "Kuhinja",
    text: "Najčešći početak projekta i prostor s najviše tehnike, instalacija i mehanizama.",
    link: { href: "/kuhinje", label: "Kuhinje po mjeri" },
  },
  {
    name: "Dnevni boravak",
    text: "TV zidovi, police, komode i zidne obloge, usklađeni s kuhinjom kad je prostor otvoren.",
  },
  {
    name: "Spavaća soba",
    text: "Ugradbeni ormari, uzglavlja, noćni ormarići i toaletni stolići.",
    link: { href: "/ormari", label: "Ormari po mjeri" },
  },
  {
    name: "Hodnik i ulaz",
    text: "Ulazni ormari, klupe, mjesto za cipele i ogledala, složeni u dubinu koju hodnik dopušta.",
  },
  {
    name: "Radna soba",
    text: "Radni stolovi, police i biblioteke, s predviđenim mjestom za kabele i rasvjetu.",
  },
  {
    name: "Blagovaonica",
    text: "Komode, vitrine i klupe uz stol, u materijalima ostatka prostora.",
  },
];

const principles = [
  {
    title: "Jedna paleta materijala",
    text: "Isti dekori, boje i ručke vode od ulaznih vrata do zadnje police, pa prostor djeluje kao cjelina, a ne kao zbir komada.",
  },
  {
    title: "Usklađene linije",
    text: "Visine, dubine i fuge elemenata dogovaramo za cijeli stan odjednom. Gornji rub kuhinje i ormara u hodniku mogu biti na istoj liniji.",
  },
  {
    title: "Jedan sugovornik",
    text: "Izmjera, projekt, izrada i montaža na jednom su mjestu. Ne usklađujete više izvođača i ne prenosite dogovore s jednog na drugog.",
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function InterijeriPage() {
  return (
    <>
      <PageHero
        eyebrow="Interijeri po mjeri"
        lines={[{ text: "Cijeli prostor," }, { text: "jedan rukopis.", accent: true }]}
        lead={
          <p>
            Kad kuhinja, ormari, hodnik i dnevni boravak nastaju zajedno, materijali i linije se slažu od ulaznih vrata do
            zadnje police. Projektiramo i izrađujemo namještaj po mjeri za cijeli stan ili kuću.
          </p>
        }
        actions={
          <>
            <LinkButton href="/kontakt?interes=interijer" variant="accent" arrow>
              Pošalji upit za interijer
            </LinkButton>
            <LinkButton href="#prostori" variant="outline">
              Što sve radimo
            </LinkButton>
          </>
        }
      >
        <div className="shell relative mt-16 grid gap-10 lg:mt-24 lg:grid-cols-12 lg:items-end">
          <figure className="lg:col-span-8">
            <div className="border border-white/10 bg-ink-700/60 p-4 sm:p-8">
              <RoomPlan trigger="mount" className="text-accent" />
            </div>
            <figcaption className="eyebrow mt-4 text-mut">Tlocrt · primjer stana opremljenog po mjeri</figcaption>
          </figure>
          <ol className="border-t border-white/10 lg:col-span-4">
            {planCallouts.map((c, i) => (
              <Reveal as="li" key={c.n} delay={0.6 + i * 0.06} className="flex items-center gap-4 border-b border-white/10 py-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-accent/70 text-[10px] font-semibold text-accent">
                  {c.n}
                </span>
                <span className="font-display text-lg font-medium tracking-tight">{c.title}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </PageHero>

      {/* ── Prostori ── */}
      <section id="prostori" className="scroll-mt-20 bg-paper py-24 text-ink lg:py-36">
        <div className="shell">
          <SectionHead
            tone="paper"
            eyebrow="Prostori"
            title={
              <>
                Soba po soba,
                <br />
                <span className="text-accent-deep">u istoj liniji.</span>
              </>
            }
            lead="Možete krenuti od jedne prostorije ili od cijelog stana. Ako znate da će se kasnije nastaviti, projektiramo tako da se nastavi bez šava."
          />
          <ol className="mt-14 grid border-t border-ink/15 lg:mt-20 lg:grid-cols-2 lg:gap-x-16">
            {rooms.map((r, i) => (
              <Reveal
                as="li"
                key={r.name}
                delay={(i % 2) * 0.08}
                className="grid grid-cols-[56px_1fr] gap-4 border-b border-ink/15 py-8 sm:grid-cols-[80px_1fr]"
              >
                <span className="font-display text-[28px] font-bold leading-none tracking-tightest text-transparent [-webkit-text-stroke:1px_rgba(138,122,92,.8)] sm:text-[36px]">
                  {pad(i + 1)}
                </span>
                <div>
                  <h3 className="font-display text-2xl font-medium tracking-tight">{r.name}</h3>
                  <p className="mt-2 max-w-md text-[15px] leading-relaxed text-ink/70">{r.text}</p>
                  {r.link && (
                    <Link
                      href={r.link.href}
                      className="group mt-4 inline-flex items-center gap-2 text-[12px] font-semibold tracking-wide text-accent-deep transition-colors hover:text-ink"
                    >
                      {r.link.label}
                      <Arrow />
                    </Link>
                  )}
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Zašto zajedno ── */}
      <section className="bg-ink-700 py-24 lg:py-36">
        <div className="shell">
          <SectionHead
            eyebrow="Zašto zajedno"
            title={
              <>
                Prostor koji
                <br />
                <span className="text-accent">djeluje kao cjelina.</span>
              </>
            }
          />
          <ul className="mt-14 grid gap-px border border-white/10 bg-white/10 lg:mt-20 lg:grid-cols-3">
            {principles.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 0.08} className="flex flex-col bg-ink-700 p-6 sm:p-10">
                <span aria-hidden className="block h-px w-10 bg-accent" />
                <h3 className="mt-8 font-display text-2xl font-medium tracking-tight">{p.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-fg/65">{p.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Kako radimo ── */}
      <section id="kako-radimo" className="scroll-mt-20 bg-ink py-24 lg:py-36">
        <div className="shell">
          <SectionHead
            eyebrow="Kako radimo"
            title={
              <>
                Od tlocrta
                <br />
                <span className="text-accent">do zadnjeg okova.</span>
              </>
            }
          />
          <ProcessSteps className="mt-14 lg:mt-20" />
          <div className="mt-16 lg:mt-24">
            <SoonNote subject="interijera" />
          </div>
        </div>
      </section>

      <CtaPair
        eyebrow="Sljedeći korak"
        title={
          <>
            Opišite prostor.
            <br />
            <span className="text-accent-deep">Nacrtat ćemo ga.</span>
          </>
        }
        items={[
          {
            href: "/kontakt?interes=interijer",
            kicker: "Upit za interijer",
            title: "Počnimo od mjera.",
            text: "Opišite prostorije i upišite okvirne mjere, to je dovoljno za početak. Javit ćemo vam se s pitanjima i prijedlogom izmjere.",
          },
          {
            href: "/studio",
            kicker: "3D studio",
            title: "Ili od kuhinje.",
            text: "Ako cijeli prostor počinje kuhinjom, složite je u 3D studiju na svojim mjerama i pošaljite nam upit.",
          },
        ]}
      />
    </>
  );
}
