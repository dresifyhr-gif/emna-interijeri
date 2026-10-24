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
            <LinkButton href="/studio" variant="accent" arrow>
              Složi kuhinju u 3D studiju
            </LinkButton>
            <LinkButton href="/kontakt?interes=kuhinja" variant="outline">
              Pošalji upit
            </LinkButton>
          </>
        }
      >
        <div className="shell relative mt-16 lg:mt-24">
          <div aria-hidden className="mb-4 flex items-center gap-3 text-accent">
            <span className="h-3 w-px bg-accent" />
            <span className="h-px flex-1 bg-accent/40" />
            <span className="eyebrow">po mjeri</span>
            <span className="h-px flex-1 bg-accent/40" />
            <span className="h-3 w-px bg-accent" />
          </div>
          <figure className="relative aspect-[4/3] overflow-hidden bg-ink-700 sm:aspect-[16/9] lg:aspect-[21/9]">
            <Image
              src={heroPhoto.src}
              alt={heroPhoto.title}
              fill
              loading="eager"
              fetchPriority="high"
              sizes="(min-width: 1440px) 1344px, 100vw"
              className="object-cover object-[50%_60%]"
            />
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-ink/70 via-transparent to-transparent" />
            <figcaption className="eyebrow absolute bottom-4 left-4 text-fg/80 sm:bottom-6 sm:left-6">
              {heroPhoto.title}
            </figcaption>
          </figure>
        </div>
      </PageHero>

      {/* ── Oblici ── */}
      <section id="oblici" className="scroll-mt-20 border-t border-white/10 bg-ink py-24 lg:py-36">
        <div className="shell">
          <div className="grid gap-8 lg:grid-cols-12 lg:items-end">
            <SectionHead
              className="lg:col-span-7"
              eyebrow="Oblik"
              title={
                <>
                  Četiri oblika.
                  <br />
                  <span className="text-accent">Bezbroj rasporeda.</span>
                </>
              }
            />
            <Reveal delay={0.15} className="lg:col-span-5">
              <p className="max-w-md text-base leading-relaxed text-fg/65 sm:text-lg">
                Oblik ovisi o prostoru i o tome kako kuhate. Odaberite jedan i isprobajte ga u 3D studiju na svojim mjerama.
              </p>
            </Reveal>
          </div>

          <ul className="mt-14 grid gap-px border border-white/10 bg-white/10 sm:grid-cols-2 lg:mt-20 lg:grid-cols-4">
            {shapes.map((s, i) => (
              <Reveal as="li" key={s.id} delay={i * 0.07} className="bg-ink">
                <Link
                  href={`/studio?oblik=${s.id}`}
                  className="group flex h-full flex-col p-6 transition-colors duration-500 ease-premium hover:bg-ink-700 sm:p-8"
                >
                  <span className="eyebrow text-mut">{pad(i + 1)}</span>
                  <KitchenShapePlan
                    shape={s.id}
                    className="mt-6 text-accent/80 transition-colors duration-500 group-hover:text-accent"
                  />
                  <h3 className="mt-8 font-display text-2xl font-medium tracking-tight">{s.name}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-fg/60">{s.text}</p>
                  <span className="mt-auto inline-flex items-center gap-2 pt-8 text-[12px] font-semibold tracking-wide text-fg/90 transition-colors group-hover:text-accent">
                    Isprobaj u 3D studiju
                    <Arrow />
                  </span>
                </Link>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Mehanizmi i okovi ── */}
      <section id="mehanizmi" className="scroll-mt-20 bg-paper py-24 text-ink lg:py-36">
        <div className="shell grid gap-14 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-5">
            <div className="lg:sticky lg:top-32">
              <SectionHead
                tone="paper"
                eyebrow="Mehanizmi i okovi"
                title={
                  <>
                    Ono što se ne vidi,
                    <br />
                    <span className="text-accent-deep">osjeti se svaki dan.</span>
                  </>
                }
                titleClassName="!text-[clamp(36px,4.6vw,72px)]"
                lead="Okovi i mehanizmi određuju kako se kuhinja otvara i zatvara te koliko dugo radi kao prvi dan. Biramo ih za svako mjesto posebno, prema tome što se u njemu sprema."
              />
            </div>
          </div>
          <ol className="border-t border-ink/15 lg:col-span-7">
            {mechanisms.map((m, i) => (
              <Reveal
                as="li"
                key={m.id}
                className="grid grid-cols-[84px_1fr] gap-5 border-b border-ink/15 py-8 sm:grid-cols-[140px_1fr] sm:gap-10 sm:py-10"
              >
                <MechanismDrawing id={m.id} className="text-accent-deep" />
                <div>
                  <span className="eyebrow text-mut-paper">{pad(i + 1)}</span>
                  <h3 className="mt-3 font-display text-[22px] font-medium tracking-tight sm:text-2xl">{m.name}</h3>
                  <p className="mt-3 max-w-lg text-[15px] leading-relaxed text-ink/70">{m.text}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Materijali ── */}
      <section id="materijali" className="scroll-mt-20 bg-ink-700 py-24 lg:py-36">
        <div className="shell">
          <SectionHead
            eyebrow="Materijali"
            title={
              <>
                Fronte
                <br />
                <span className="text-accent">i radne ploče.</span>
              </>
            }
            lead="Fronte određuju kako kuhinja izgleda, a radna ploča kako podnosi svakodnevicu. Točne dekore i boje biramo zajedno, nakon izmjere."
          />
          <div className="mt-16 grid gap-16 lg:mt-20 lg:grid-cols-2 lg:gap-20">
            <MaterialList title="Fronte" items={fronts} />
            <MaterialList title="Radne ploče" items={tops} />
          </div>
        </div>
      </section>

      {/* ── Realizacije ── */}
      <section id="realizacije" className="scroll-mt-20 bg-paper py-24 text-ink lg:py-36">
        <div className="shell">
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <SectionHead
              tone="paper"
              eyebrow="Realizacije"
              title={
                <>
                  Kuhinje u
                  <br />
                  <span className="text-accent-deep">stvarnim prostorima.</span>
                </>
              }
            />
            <Reveal delay={0.1}>
              <LinkButton href="/radovi" variant="outline-dark" arrow>
                Sve realizacije
              </LinkButton>
            </Reveal>
          </div>

          <ul className="mt-14 grid gap-x-3 gap-y-8 sm:grid-cols-2 lg:mt-20 lg:grid-cols-12 lg:gap-x-4 lg:gap-y-12">
            {kitchenPicks.map((src, i) => {
              const p = byPath(src);
              const span = ["sm:col-span-2 lg:col-span-7", "lg:col-span-5", "lg:col-span-4", "lg:col-span-4", "lg:col-span-4"][i];
              const stretch = i === 1;
              const sizes = i === 0 ? "(min-width: 1024px) 58vw, 100vw" : i === 1 ? "(min-width: 1024px) 42vw, (min-width: 640px) 50vw, 100vw" : "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw";
              return (
                <Reveal as="li" key={src} delay={(i % 3) * 0.08} className={span}>
                  <figure className="flex h-full flex-col">
                    <div
                      className={`group relative aspect-[4/3] overflow-hidden bg-paper-dark ${
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
                    <figcaption className="mt-4 flex items-baseline justify-between gap-4">
                      <span className="text-[14px] text-ink/80">{p.title}</span>
                      <span className="eyebrow shrink-0 text-mut-paper">{styleLabel[p.style]}</span>
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
            <span className="text-accent-deep">počinje mjerom.</span>
          </>
        }
        items={[
          {
            href: "/studio",
            kicker: "3D studio",
            title: "Složite je sami.",
            text: "Unesite mjere svojih zidova, odaberite oblik, fronte i radnu ploču i odmah vidite okvirnu cijenu. Upit nam stiže s točnim mjerama.",
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
    <div>
      <h3 className="eyebrow text-mut">{title}</h3>
      <ul className="mt-6 border-t border-white/10">
        {items.map((m, i) => (
          <Reveal
            as="li"
            key={m.name}
            delay={i * 0.05}
            className="grid grid-cols-[52px_1fr] items-start gap-5 border-b border-white/10 py-6 sm:grid-cols-[64px_1fr_auto] sm:gap-6"
          >
            <span
              aria-hidden
              className="block aspect-square w-full rounded-[3px] shadow-[inset_0_1px_0_rgba(255,255,255,.18),0_10px_24px_-12px_rgba(0,0,0,.8)] ring-1 ring-white/10"
              style={m.swatch}
            />
            <div>
              <p className="font-display text-xl font-medium tracking-tight">{m.name}</p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-fg/60">{m.text}</p>
            </div>
            {m.studio && (
              <Link
                href={m.studio}
                aria-label={`${m.name}: isprobaj u 3D studiju`}
                className="col-start-2 inline-flex items-center gap-2 self-center text-[12px] font-semibold tracking-wide text-accent transition-colors hover:text-fg sm:col-start-3"
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
