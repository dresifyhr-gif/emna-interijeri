import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { gallery, type Photo } from "@/lib/gallery";
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

/**
 * Real kitchens of ours that open into the living space (a dining corner, a staircase, an island in the room) —
 * shown until the owner's photos of whole interiors arrive.
 */
const openPlan = ["kuhinja-crna-drvo-sala", "kuhinja-crna-drvo-otok", "kuhinja-bijela-crna-otok"]
  .map((file) => gallery.find((p) => p.src === `/galerija/${file}.jpg`))
  .filter((p): p is Photo => Boolean(p));

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
            <LinkButton href="/kontakt?interes=interijer#upit" variant="ink" arrow>
              Pošaljite upit za interijer
            </LinkButton>
            <LinkButton href="#prostori" variant="text" arrow>
              Što sve radimo
            </LinkButton>
          </>
        }
      >
        <div className="shell relative mt-12 grid gap-10 lg:mt-16 lg:grid-cols-12 lg:items-end">
          <figure className="lg:col-span-8">
            <div className="rounded-[22px] border border-hairline bg-card p-4 sm:p-8">
              <RoomPlan trigger="mount" className="text-bronze" />
            </div>
            <figcaption className="mt-4 text-[12.5px] text-taupe">Tlocrt · primjer stana opremljenog po mjeri</figcaption>
          </figure>
          <ol className="border-t border-hairline lg:col-span-4">
            {planCallouts.map((c, i) => (
              <Reveal as="li" key={c.n} delay={0.6 + i * 0.06} className="flex items-center gap-4 border-b border-hairline py-4">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-bronze/70 text-[10.5px] font-semibold text-bronze-deep">
                  {c.n}
                </span>
                <span className="heading text-lg tracking-head-sm">{c.title}</span>
              </Reveal>
            ))}
          </ol>
        </div>
      </PageHero>

      {/* ── Prostori ── */}
      <section id="prostori" className="scroll-mt-20 bg-greige py-24 lg:py-32">
        <div className="shell">
          <SectionHead
            eyebrow="Prostori"
            title={
              <>
                Soba po soba,{" "}
                <br />
                <span className="text-taupe">u istoj liniji.</span>
              </>
            }
            lead="Možete krenuti od jedne prostorije ili od cijelog stana. Ako znate da će se kasnije nastaviti, projektiramo tako da se nastavi bez šava."
          />
          <ol className="mt-10 grid border-t border-hairline lg:mt-14 lg:grid-cols-2 lg:gap-x-16">
            {rooms.map((r, i) => (
              <Reveal
                as="li"
                key={r.name}
                delay={(i % 2) * 0.08}
                className="grid grid-cols-[56px_1fr] gap-4 border-b border-hairline py-7 sm:grid-cols-[80px_1fr]"
              >
                <span className="font-head text-[30px] font-normal leading-none tracking-head text-bronze sm:text-[36px]">{pad(i + 1)}</span>
                <div>
                  <h3 className="heading text-2xl tracking-head-sm">{r.name}</h3>
                  <p className="mt-2 max-w-md text-[15px] leading-relaxed text-taupe">{r.text}</p>
                  {r.link && (
                    <Link
                      href={r.link.href}
                      className="group mt-3.5 inline-flex items-center gap-2 text-[13.5px] font-medium text-graphite underline-offset-4 hover:underline"
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
      <section className="bg-canvas py-24 lg:py-32">
        <div className="shell">
          <SectionHead
            eyebrow="Zašto zajedno"
            title={
              <>
                Prostor koji{" "}
                <br />
                <span className="text-taupe">djeluje kao cjelina.</span>
              </>
            }
          />
          <ul className="mt-10 grid gap-3 sm:gap-4 lg:mt-14 lg:grid-cols-3">
            {principles.map((p, i) => (
              <Reveal as="li" key={p.title} delay={i * 0.08} className="flex flex-col rounded-[18px] border border-hairline bg-card p-6 sm:p-8">
                <span aria-hidden className="block h-px w-10 bg-bronze" />
                <h3 className="heading mt-7 text-2xl tracking-head-sm">{p.title}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-taupe">{p.text}</p>
              </Reveal>
            ))}
          </ul>

          {openPlan.length > 0 && (
            <figure className="mt-12 lg:mt-16">
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4">
                {openPlan.map((p, i) => (
                  <Reveal as="li" key={p.src} delay={i * 0.08} className={i === 0 ? "col-span-2 sm:col-span-1" : ""}>
                    <Link
                      href={`/radovi#${p.project}`}
                      aria-label={`${p.title}: pogledajte fotografije`}
                      className="group relative block aspect-[4/3] overflow-hidden rounded-[18px] bg-hairline"
                    >
                      <Image
                        src={p.src}
                        alt={p.title}
                        fill
                        sizes={i === 0 ? "(min-width: 640px) 33vw, 100vw" : "(min-width: 640px) 33vw, 50vw"}
                        className="object-cover transition-transform duration-[1400ms] ease-premium group-hover:scale-[1.035]"
                      />
                    </Link>
                  </Reveal>
                ))}
              </ul>
              <figcaption className="mt-4 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
                <span className="text-[14px] text-graphite">
                  Kuhinja kao dio dnevnog prostora <span className="text-taupe">· iz naših realizacija</span>
                </span>
                <Link
                  href="/radovi"
                  className="group inline-flex items-center gap-2 text-[13.5px] font-medium text-graphite underline-offset-4 hover:underline"
                >
                  Sve realizacije
                  <Arrow />
                </Link>
              </figcaption>
            </figure>
          )}
        </div>
      </section>

      {/* ── Kako radimo ── */}
      <section id="kako-radimo" className="scroll-mt-20 bg-greige py-24 lg:py-32">
        <div className="shell">
          <SectionHead
            eyebrow="Kako radimo"
            title={
              <>
                Od tlocrta{" "}
                <br />
                <span className="text-taupe">do zadnjeg okova.</span>
              </>
            }
          />
          <ProcessSteps className="mt-10 lg:mt-14" />
          <SoonNote subject="interijera" className="mt-12 lg:mt-16" />
        </div>
      </section>

      <CtaPair
        bg="canvas"
        eyebrow="Sljedeći korak"
        title={
          <>
            Opišite prostor.{" "}
            <br />
            <span className="text-taupe">Nacrtat ćemo ga.</span>
          </>
        }
        items={[
          {
            href: "/kontakt?interes=interijer#upit",
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
