import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { site } from "@/lib/site";
import { ContactForm } from "@/components/forms/ContactForm";
import { Fill, showTodos } from "@/components/site/Fill";
import { Arrow } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { PageHero } from "@/components/pages/PageHero";
import { SectionHead } from "@/components/pages/SectionHead";
import { collaborationSteps } from "@/components/pages/ProcessSteps";
import { ContactDetails } from "@/components/pages/kontakt/ContactDetails";
import { InterestContactForm } from "@/components/pages/kontakt/InterestContactForm";
import { Timeline } from "@/components/pages/kontakt/Timeline";
import { pageMetadata } from "@/components/pages/meta";

export const metadata: Metadata = pageMetadata({
  title: "Kontakt",
  description:
    "Upit za kuhinju, ormar ili interijer po mjeri. Opišite prostor, upišite okvirne mjere i javit ćemo vam se. Kuhinju možete složiti i u 3D studiju.",
  path: "/kontakt",
});

export default function KontaktPage() {
  return (
    <>
      <PageHero
        size="fit"
        eyebrow="Kontakt"
        lines={[{ text: "Razgovarajmo." }]}
        lead={
          <p>
            Pošaljite upit s okvirnim mjerama prostora. Javit ćemo vam se s pitanjima ili prijedlogom termina za izmjeru.
          </p>
        }
      />

      <section id="upit" className="scroll-mt-20 bg-paper py-20 text-ink lg:py-32">
        <div className="shell grid gap-16 lg:grid-cols-12 lg:gap-10">
          <aside aria-label="Kontakt podaci" className="lg:col-span-4">
            <Reveal y={14}>
              <p className="eyebrow flex items-center gap-4 text-accent-deep">
                <span aria-hidden className="h-px w-8 bg-accent-deep/70" />
                Izravno
              </p>
            </Reveal>
            <div className="mt-8">
              <ContactDetails />
            </div>

            <Reveal delay={0.2} className="mt-10">
              <Link
                href="/studio"
                className="group flex items-center justify-between gap-6 bg-ink p-6 text-fg transition-colors duration-500 ease-premium hover:bg-ink-700"
              >
                <span>
                  <span className="eyebrow block text-accent">3D studio</span>
                  <span className="mt-2 block font-display text-xl font-medium tracking-tight">
                    Radije složite kuhinju sami?
                  </span>
                  <span className="mt-1 block text-sm text-fg/60">Upit iz studija stiže s mjerama i slikom.</span>
                </span>
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 transition-all duration-500 ease-premium group-hover:border-accent group-hover:bg-accent group-hover:text-ink"
                >
                  <Arrow />
                </span>
              </Link>
            </Reveal>
          </aside>

          <div className="lg:col-span-7 lg:col-start-6">
            <Reveal y={14}>
              <p className="eyebrow flex items-center gap-4 text-accent-deep">
                <span aria-hidden className="h-px w-8 bg-accent-deep/70" />
                Upit
              </p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="display mt-6 text-[clamp(36px,4.4vw,68px)]">Pošaljite upit.</h2>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mt-5 max-w-lg text-base leading-relaxed text-ink/70">
                Napišite što trebate i gdje. Okvirne mjere zidova i visina stropa pomažu da prvi razgovor bude konkretan.
                {/* the form takes no files: photos and floor plans only once there is a real address to send them to */}
                {(site.contact.email || showTodos) && (
                  <>
                    {" "}
                    Fotografije ili tlocrt prostora možete poslati e-mailom na{" "}
                    <Fill value={site.contact.email} label="e-mail">
                      {(v) => (
                        <a
                          href={`mailto:${v}`}
                          className="text-ink underline decoration-ink/25 decoration-1 underline-offset-4 hover:text-accent-deep hover:decoration-accent-deep"
                        >
                          {v}
                        </a>
                      )}
                    </Fill>
                    .
                  </>
                )}
              </p>
            </Reveal>
            <Reveal delay={0.2} className="mt-10">
              <Suspense fallback={<ContactForm variant="paper" />}>
                <InterestContactForm variant="paper" />
              </Suspense>
            </Reveal>
          </div>
        </div>
      </section>

      <section aria-labelledby="suradnja" className="bg-ink py-24 lg:py-32">
        <div className="shell">
          <SectionHead
            eyebrow="Kako izgleda suradnja"
            title={
              <span id="suradnja">
                Od upita
                <br />
                <span className="text-accent">do montaže.</span>
              </span>
            }
          />
          <div className="mt-14 lg:mt-20">
            <Timeline steps={collaborationSteps} />
          </div>
          <Reveal className="mt-14 lg:mt-20">
            <p className="text-sm text-fg/60">
              Imate pitanje prije upita?{" "}
              <Link href="/pitanja" className="text-fg underline decoration-1 underline-offset-4 hover:text-accent">
                Pogledajte česta pitanja
              </Link>
              .
            </p>
          </Reveal>
        </div>
      </section>
    </>
  );
}
