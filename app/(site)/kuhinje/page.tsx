import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { gallery, styleLabel, type Photo } from "@/lib/gallery";
import { Arrow, LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/pages/PageHero";
import { SectionHead } from "@/components/pages/SectionHead";
import { CtaPair } from "@/components/pages/CtaPair";
import { KitchenShapePlan } from "@/components/pages/drawings/KitchenShapePlan";
import { MechanismDrawing } from "@/components/pages/drawings/Mechanisms";
import { pageMetadata } from "@/components/pages/meta";
import { fronts, kitchenPicks, mechanisms, shapes, tops, type Material } from "@/components/pages/kuhinje/data";

const byPath = (src: string): Photo => gallery.find((p) => p.src === src) ?? gallery[0];
const heroPhoto = byPath("/galerija/kuhinja-crna-mramor-2.jpg");

export const metadata: Metadata = pageMetadata({
  title: "Kuhinje po mjeri",
  description:
    "Kuhinje po mjeri: ravne, L, U i s otokom. Ladice s tihim zatvaranjem, klapne, kutni karuseli, fronte i radne ploče po izboru. Složite svoju kuhinju u 3D studiju.",
  path: "/kuhinje",
  image: { url: heroPhoto.src, width: heroPhoto.w, height: heroPhoto.h, alt: heroPhoto.title },
});

const pad = (n: number) => String(n).padStart(2, "0");

export default function KuhinjePage() {
  return (
    <>
      <PageHero
        eyebrow="Kuhinje po mjeri"
        lines={[{ text: "Kuhinja koja" }, { text: "prati vaš zid.", accent: true }]}
        lead={
          <p>
            Svaku kuhinju crtamo od izmjere. Zidovi, kutovi, prozori i instalacije određuju raspored, a vi birate oblik,
            fronte, radnu ploču i mehanizme.
          </p>
        }
        actions={
          <>
            <LinkButton href="/studio" variant="ink" arrow>
              Složite kuhinju u 3D studiju
            </LinkButton>
            <LinkButton href="/kontakt?interes=kuhinja" variant="text" arrow>
              Pošaljite upit
            </LinkButton>
          </>
        }
      >
        <div className="shell relative mt-12 lg:mt-16">
          <figure className="relative aspect-[4/3] overflow-hidden rounded-[22px] bg-hairline sm:aspect-[16/9] lg:aspect-[21/9]">
            <Image
              src={heroPhoto.src}
              alt={heroPhoto.title}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 1440px) 1344px, 100vw"
              className="object-cover object-[50%_60%]"
            />
            <figcaption className="absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/[0.88] px-3 py-1.5 text-[12px] text-graphite backdrop-blur-md sm:bottom-4 sm:left-4">
              {heroPhoto.title}
            </figcaption>
          </figure>
        </div>
      </PageHero>

      {/* ── Oblici ── */}
      <section id="oblici" className="scroll-mt-20 bg-greige py-24 lg:py-32">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <SectionHead
              className="lg:col-span-7"
              eyebrow="Oblik"
              title={
                <>
                  Četiri oblika.
                  <br />
                  <span className="text-taupe">Bezbroj rasporeda.</span>
                </>
              }
            />
            <Reveal delay={0.15} className="lg:col-span-5">
              <p className="max-w-md text-[15px] leading-relaxed text-taupe sm:text-base">
                Oblik ovisi o prostoru i o tome kako kuhate. Odaberite jedan i isprobajte ga u 3D studiju na svojim mjerama.
              </p>
            </Reveal>
          </div>

          <ul className="mt-10 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:mt-14 lg:grid-cols-4">
            {shapes.map((s, i) => (
              <Reveal as="li" key={s.id} delay={i * 0.07}>
                <Link
                  href={`/studio?oblik=${s.id}`}
                  className="group flex h-full flex-col rounded-[18px] border border-hairline bg-card p-6 transition-[border-color,box-shadow] duration-500 ease-premium hover:border-graphite/25 hover:shadow-[0_20px_50px_-24px_rgba(60,48,30,.25)] sm:p-7"
                >
                  <span className="text-[13px] font-medium tabular-nums text-bronze-deep">{pad(i + 1)}</span>
                  <KitchenShapePlan shape={s.id} className="mt-5 text-bronze/80 transition-colors duration-500 group-hover:text-bronze" />
                  <h3 className="heading mt-7 text-[24px] tracking-head-sm">{s.name}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-taupe">{s.text}</p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-7 text-[13.5px] font-medium text-graphite">
                    Isprobajte u 3D studiju
                    <Arrow />
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Mehanizmi i okovi ── */}
      <section id="mehanizmi" className="scroll-mt-20 bg-canvas py-24 lg:py-32">
        <div className="shell grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <SectionHead
                eyebrow="Mehanizmi i okovi"
                title={
                  <>
                    Ono što se ne vidi,
                    <br />
                    <span className="text-taupe">osjeti se svaki dan.</span>
                  </>
                }
                lead="Okovi i mehanizmi određuju kako se kuhinja otvara i zatvara te koliko dugo radi kao prvi dan. Biramo ih za svako mjesto posebno, prema tome što se u njemu sprema."
              />
            </div>
          </div>
          <ol className="border-t border-hairline lg:col-span-7">
            {mechanisms.map((m, i) => (
              <Reveal
                as="li"
                key={m.id}
                className="grid grid-cols-[84px_1fr] gap-5 border-b border-hairline py-8 sm:grid-cols-[140px_1fr] sm:gap-10 sm:py-10"
              >
                <MechanismDrawing id={m.id} className="text-bronze" />
                <div>
                  <span className="text-[13px] font-medium tabular-nums text-bronze-deep">{pad(i + 1)}</span>
                  <h3 className="heading mt-2 text-[22px] tracking-head-sm sm:text-2xl">{m.name}</h3>
                  <p className="mt-2.5 max-w-lg text-[15px] leading-relaxed text-taupe">{m.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Materijali ── */}
      <section id="materijali" className="scroll-mt-20 bg-greige py-24 lg:py-32">
        <div className="shell">
          <SectionHead
            eyebrow="Materijali"
            title={
              <>
                Fronte
                <br />
                <span className="text-taupe">i radne ploče.</span>
              </>
            }
            lead="Fronte određuju kako kuhinja izgleda, a radna ploča kako podnosi svakodnevicu. Točne dekore i boje biramo zajedno, nakon izmjere."
          />
          <div className="mt-10 grid gap-4 lg:mt-14 lg:grid-cols-2">
            <MaterialList title="Fronte" items={fronts} />
            <MaterialList title="Radne ploče" items={tops} />
          </div>
        </div>
      </section>

      {/* ── Realizacije ── */}
      <section id="realizacije" className="scroll-mt-20 bg-canvas py-24 lg:py-32">
        <div className="shell">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <SectionHead
              eyebrow="Realizacije"
              title={
                <>
                  Kuhinje u
                  <br />
                  <span className="text-taupe">stvarnim prostorima.</span>
                </>
              }
            />
            <Reveal delay={0.1}>
              <LinkButton href="/radovi" variant="line" arrow>
                Sve realizacije
              </LinkButton>
            </Reveal>
          </div>

          <ul className="mt-10 grid gap-x-3 gap-y-8 sm:grid-cols-2 lg:mt-14 lg:grid-cols-12 lg:gap-x-4 lg:gap-y-10">
            {kitchenPicks.map((src, i) => {
              const p = byPath(src);
              const span = ["sm:col-span-2 lg:col-span-7", "lg:col-span-5", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4"][i];
              const stretch = i === 1;
              const sizes = i === 0 ? "(min-width: 1024px) 58vw, 100vw" : i === 1 ? "(min-width: 1024px) 42vw, (min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";
              return (
                <Reveal as="li" key={src} delay={(i % 3) * 0.08} className={span}>
                  <figure className="flex h-full flex-col">
                    <div
                      className={`group relative aspect-[4/3] overflow-hidden rounded-[18px] bg-hairline ${
                        stretch ? "lg:aspect-auto lg:flex-1" : ""
                      }`}
                    >
                      <Image
                        src={p.src}
                        alt={p.title}
                        fill
                        sizes={sizes}
                        className="object-cover transition-transform duration-[1400ms] ease-premium group-hover:scale-[1.035]"
                      />
                    </div>
                    <figcaption className="mt-3.5 flex items-baseline justify-between gap-4">
                      <span className="text-[14px] text-graphite">{p.title}</span>
                      <span className="shrink-0 text-[12.5px] text-taupe">{styleLabel[p.style]}</span>
                    </figcaption>
                  </figure>
                </Reveal>
              );
            })}
          </ul>
        </div>
      </section>

      <CtaPair
        eyebrow="Sljedeći korak"
        title={
          <>
            Vaša kuhinja
            <br />
            <span className="text-taupe">počinje mjerom.</span>
          </>
        }
        items={[
          {
            href: "/studio",
            kicker: "3D studio",
            title: "Složite je sami.",
            text: "Unesite mjere svojih zidova, odaberite oblik i elemente, fronte i radnu ploču i odmah vidite okvirnu cijenu. Upit nam stiže s točnim mjerama.",
          },
          {
            href: "/kontakt?interes=kuhinja",
            kicker: "Upit",
            title: "Razgovarajmo.",
            text: "Radije biste razgovarali? Opišite prostor, upišite okvirne mjere i javit ćemo vam se.",
          },
        ]}
      />
    </>
  );
}

function MaterialList({ title, items }: { title: string; items: Material[] }) {
  return (
    <div className="rounded-[20px] border border-hairline bg-card p-6 sm:p-8">
      <h3 className="text-[13px] font-medium text-graphite">{title}</h3>
      <ul className="mt-4 border-t border-hairline">
        {items.map((m, i) => (
          <Reveal
            as="li"
            key={m.name}
            delay={i * 0.05}
            className="grid grid-cols-[48px_1fr] items-start gap-4 border-b border-hairline py-5 last:border-b-0 last:pb-0 sm:grid-cols-[56px_1fr_auto] sm:gap-5"
          >
            <span
              aria-hidden
              className="block aspect-square w-full rounded-[10px] shadow-[inset_0_1px_0_rgba(255,255,255,.25)] ring-1 ring-black/[0.07]"
              style={m.swatch}
            />
            <div>
              <p className="heading text-[19px] tracking-head-sm">{m.name}</p>
              <p className="mt-1.5 max-w-md text-[14px] leading-relaxed text-taupe">{m.text}</p>
            </div>
            {m.studio && (
              <Link
                href={m.studio}
                aria-label={`${m.name}: isprobajte u 3D studiju`}
                className="group col-start-2 inline-flex items-center gap-2 self-center text-[13px] font-medium text-graphite underline-offset-4 hover:underline sm:col-start-3"
              >
                U studiju
                <Arrow />
              </Link>
            )}
          </Reveal>
        ))}
      </ul>
    </div>
  );
}
