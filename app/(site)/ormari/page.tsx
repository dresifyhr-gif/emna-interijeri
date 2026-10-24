import type { Metadata } from "next";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/pages/PageHero";
import { SectionHead } from "@/components/pages/SectionHead";
import { ProcessSteps } from "@/components/pages/ProcessSteps";
import { SoonNote } from "@/components/pages/SoonNote";
import { CtaPair } from "@/components/pages/CtaPair";
import { WardrobeElevation, WardrobeTypeDrawing, type WardrobeTypeId } from "@/components/pages/drawings/Wardrobe";
import { wardrobeCallouts } from "@/components/pages/drawings/legends";
import { pageMetadata } from "@/components/pages/meta";

export const metadata: Metadata = pageMetadata({
  title: "Ormari po mjeri",
  description:
    "Ugradbeni ormari od poda do stropa, garderobe, klizna vrata i ormari pod kosinom. Projektirani prema mjerama prostora, s unutrašnjošću složenom po vašim stvarima.",
  path: "/ormari",
});

const types: { id: WardrobeTypeId; name: string; text: string }[] = [
  {
    id: "ugradbeni",
    name: "Ugradbeni ormari",
    text: "Od poda do stropa i od zida do zida, bez praznine iznad ormara u koju se skuplja prašina. Prate zidove i stropove koji nisu ravni.",
  },
  {
    id: "klizni",
    name: "Klizna vrata",
    text: "Ne trebaju prostor za otvaranje, pa su dobar izbor za uže sobe i hodnike. Fronte u laku, furniru, dekoru ili ogledalu.",
  },
  {
    id: "garderoba",
    name: "Garderobe",
    text: "Zasebna prostorija ili dio sobe s policama, šipkama i ladicama uz zidove, otvoreno ili iza vrata.",
  },
  {
    id: "kosina",
    name: "Ormari pod kosinom",
    text: "U potkrovlju ormar prati kosi strop, pa se iskoristi i najniži dio prostora koji inače ostaje prazan.",
  },
  {
    id: "hodnik",
    name: "Ulazni ormari",
    text: "Mjesto za jakne, cipele i ključeve, s klupom za obuvanje i ogledalom, složeno u dubinu koju hodnik dopušta.",
  },
  {
    id: "otvoreni",
    name: "Otvoreni sustavi",
    text: "Police i šipke bez vrata, za garderobe i prostore u kojima želite sve vidjeti na prvi pogled.",
  },
];

const pad = (n: number) => String(n).padStart(2, "0");

export default function OrmariPage() {
  return (
    <>
      <PageHero
        size="md"
        eyebrow="Ormari po mjeri"
        lines={[{ text: "Od poda" }, { text: "do stropa.", accent: true }]}
        lead={
          <p>
            Ugradbeni ormari, garderobe i ormari pod kosinom, projektirani prema stvarnim mjerama prostora. Unutrašnjost
            slažemo prema onome što u njih spremate.
          </p>
        }
        actions={
          <>
            <LinkButton href="/kontakt?interes=ormar" variant="accent" arrow>
              Pošalji upit za ormar
            </LinkButton>
            <LinkButton href="#iznutra" variant="outline">
              Kako je složen
            </LinkButton>
          </>
        }
        aside={
          <figure className="relative">
            <WardrobeElevation trigger="mount" className="text-accent" />
            <figcaption className="eyebrow mt-4 text-mut">Pogled · ugradbeni ormar 320 × 260 cm</figcaption>
          </figure>
        }
      />

      {/* ── Što izrađujemo ── */}
      <section id="vrste" className="scroll-mt-20 bg-paper py-24 text-ink lg:py-36">
        <div className="shell">
          <SectionHead
            tone="paper"
            eyebrow="Što izrađujemo"
            title={
              <>
                Ormar za svaki
                <br />
                <span className="text-accent-deep">kut i kosinu.</span>
              </>
            }
            lead="Ormar po mjeri ne bira se iz kataloga širina. Crtamo ga za zid, nišu ili potkrovlje u kojem će stajati."
          />
          <ul className="mt-14 grid gap-px border border-ink/15 bg-ink/15 sm:grid-cols-2 lg:mt-20 lg:grid-cols-3">
            {types.map((t, i) => (
              <Reveal as="li" key={t.id} delay={(i % 3) * 0.07} className="group flex flex-col bg-paper p-6 sm:p-8">
                <div className="flex items-start justify-between gap-6">
                  <span className="eyebrow text-mut-paper">{pad(i + 1)}</span>
                  <WardrobeTypeDrawing id={t.id} className="w-[132px] text-accent-deep sm:w-[150px]" />
                </div>
                <h3 className="mt-8 font-display text-2xl font-medium tracking-tight">{t.name}</h3>
                <p className="mt-3 text-[15px] leading-relaxed text-ink/70">{t.text}</p>
              </Reveal>
            ))}
          </ul>
        </div>
      </section>

      {/* ── Unutrašnjost ── */}
      <section id="iznutra" className="scroll-mt-20 bg-ink-700 py-24 lg:py-36">
        <div className="shell">
          <SectionHead
            eyebrow="Unutrašnjost"
            title={
              <>
                Iznutra složen
                <br />
                <span className="text-accent">po vama.</span>
              </>
            }
            lead="Prije crtanja pitamo što spremate: koliko dugih stvari, koliko složenih, koliko pari cipela. Iz toga nastaje raspored polica, šipki i ladica."
          />
          <div className="mt-14 grid gap-12 lg:mt-20 lg:grid-cols-12 lg:gap-10">
            <Reveal className="lg:col-span-7">
              <WardrobeElevation annotated className="text-accent" />
            </Reveal>
            <ol className="border-t border-white/10 lg:col-span-5">
              {wardrobeCallouts.map((c) => (
                <Reveal
                  as="li"
                  key={c.n}
                  className="grid grid-cols-[44px_1fr] gap-4 border-b border-white/10 py-5"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-full border border-accent/70 text-[10px] font-semibold text-accent">
                    {c.n}
                  </span>
                  <div>
                    <h3 className="font-display text-lg font-medium tracking-tight">{c.title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg/60">{c.text}</p>
                  </div>
                </Reveal>
              ))}
            </ol>
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
                Od izmjere
                <br />
                <span className="text-accent">do zadnje police.</span>
              </>
            }
          />
          <ProcessSteps className="mt-14 lg:mt-20" />
          <div className="mt-16 lg:mt-24">
            <SoonNote subject="ormara" />
          </div>
        </div>
      </section>

      <CtaPair
        eyebrow="Sljedeći korak"
        title={
          <>
            Izmjerite nišu.
            <br />
            <span className="text-accent-deep">Ostalo je na nama.</span>
          </>
        }
        items={[
          {
            href: "/kontakt?interes=ormar",
            kicker: "Upit za ormar",
            title: "Pošaljite mjere.",
            text: "Širinu i visinu zida ili niše i visinu stropa. Javit ćemo vam se s pitanjima i prijedlogom izmjere.",
          },
          {
            href: "/interijeri",
            kicker: "Interijeri",
            title: "Cijeli prostor.",
            text: "Ormar je često dio većeg projekta: hodnika, spavaće sobe ili cijelog stana. Pogledajte kako radimo kompletne interijere.",
          },
        ]}
      />
    </>
  );
}
