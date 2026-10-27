import type { Metadata } from "next";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/pages/PageHero";
import { CtaPair } from "@/components/pages/CtaPair";
import { JsonLd } from "@/components/pages/JsonLd";
import { Accordion } from "@/components/pages/pitanja/Accordion";
import { allFaqs, faq } from "@/components/pages/pitanja/faq";
import { pageMetadata } from "@/components/pages/meta";

export const metadata: Metadata = pageMetadata({
  title: "Česta pitanja",
  description:
    "Odgovori na najčešća pitanja o kuhinjama, ormarima i interijerima po mjeri: suradnja, oblici kuhinja, materijali, cijene i 3D studio.",
  path: "/pitanja",
});

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: allFaqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export default function PitanjaPage() {
  return (
    <>
      <JsonLd data={faqJsonLd} />

      <PageHero
        size="md"
        eyebrow="Česta pitanja"
        lines={[{ text: "Pitanja" }, { text: "i odgovori.", accent: true }]}
        lead={
          <p>
            O suradnji, oblicima kuhinja, materijalima, cijenama i 3D studiju. Ako odgovor ne nađete ovdje, pitajte nas
            izravno.
          </p>
        }
      />

      <section aria-label="Pitanja po temama" className="bg-canvas pb-24 pt-6 lg:pb-32 lg:pt-8">
        <div className="shell grid gap-12 lg:grid-cols-12 lg:gap-10">
          <nav aria-label="Teme" className="lg:col-span-3">
            <div className="lg:sticky lg:top-32">
              <p className="kicker text-taupe">Teme</p>
              <ul className="mt-5 flex flex-wrap gap-2 lg:flex-col lg:gap-0">
                {faq.map((g) => (
                  <li key={g.id}>
                    <a
                      href={`#${g.id}`}
                      className="inline-flex items-center gap-3 rounded-full border border-hairline bg-card px-4 py-2 text-[13.5px] text-graphite/85 transition-colors hover:border-graphite/40 hover:text-graphite lg:w-full lg:justify-between lg:rounded-none lg:border-0 lg:border-b lg:border-hairline lg:bg-transparent lg:px-0 lg:py-3"
                    >
                      {g.title}
                      <span className="tabular-nums text-[12px] text-taupe">{g.items.length}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </nav>

          <div className="space-y-16 lg:col-span-8 lg:col-start-5 lg:space-y-24">
            {faq.map((g, i) => (
              <section key={g.id} id={g.id} aria-labelledby={`${g.id}-naslov`} className="scroll-mt-28">
                <Reveal y={14}>
                  <div className="mb-5 flex items-baseline gap-4">
                    <span className="text-[13px] font-medium tabular-nums text-bronze-deep">{String(i + 1).padStart(2, "0")}</span>
                    <h2 id={`${g.id}-naslov`} className="heading text-[clamp(28px,3vw,40px)]">
                      {g.title}
                    </h2>
                  </div>
                </Reveal>
                <Accordion items={g.items} groupId={g.id} />
              </section>
            ))}
          </div>
        </div>
      </section>

      <CtaPair
        eyebrow="Niste našli odgovor?"
        title={
          <>
            Pitajte nas
            <br />
            <span className="text-taupe">izravno.</span>
          </>
        }
        items={[
          {
            href: "/kontakt",
            kicker: "Kontakt",
            title: "Pošaljite pitanje.",
            text: "Napišite što vas zanima, a ako već imate mjere prostora, upišite i njih.",
          },
          {
            href: "/studio",
            kicker: "3D studio",
            title: "Isprobajte sami.",
            text: "Složite kuhinju po svojim mjerama i odmah vidite okvirnu cijenu.",
          },
        ]}
      />
    </>
  );
}
