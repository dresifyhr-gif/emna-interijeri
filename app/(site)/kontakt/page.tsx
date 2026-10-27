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

      <section id="upit" className="scroll-mt-20 bg-greige py-20 lg:py-28">
        <div className="shell grid gap-12 lg:grid-cols-12 lg:gap-10">
          <aside aria-label="Kontakt podaci" className="lg:col-span-4">
            <Reveal y={14}>
              <p className="kicker text-taupe">Izravno</p>
            </Reveal>
            <div className="mt-6">
              <ContactDetails />
            </div>

            <Reveal delay={0.2} className="mt-8">
              <Link
                href="/studio"
                className="group flex items-center justify-between gap-6 rounded-[20px] bg-graphite p-6 text-fg transition-colors duration-500 ease-premium hover:bg-black"
              >
                <span>
                  <span className="kicker block text-accent">3D studio</span>
                  <span className="heading mt-3 block text-xl tracking-head-sm">Radije složite kuhinju sami?</span>
                  <span className="mt-1.5 block text-sm text-fg/65">Upit iz studija stiže s mjerama i slikom.</span>
                </span>
                <span
                  aria-hidden
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/20 transition-colors duration-500 ease-premium group-hover:border-fg group-hover:bg-fg group-hover:text-graphite"
                >
                  <Arrow />
                </span>
              </Link>
            </Reveal>
          </aside>

          <div className="lg:col-span-7 lg:col-start-6">
            <Reveal y={14}>
              <p className="kicker text-taupe">Upit</p>
            </Reveal>
            <Reveal delay={0.08}>
              <h2 className="heading mt-4 text-[clamp(32px,4vw,52px)]">Pošaljite upit.</h2>
            </Reveal>
            <Reveal delay={0.14}>
              <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-taupe sm:text-base">
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
                          className="text-graphite underline decoration-graphite/30 decoration-1 underline-offset-4 hover:decoration-graphite"
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
            <Reveal delay={0.2} className="mt-8">
              <div className="rounded-[20px] bg-card p-6 shadow-[0_20px_50px_-20px_rgba(60,48,30,.18)] sm:p-9">
                <Suspense fallback={<ContactForm variant="paper" />}>
                  <InterestContactForm variant="paper" />
                </Suspense>
              </div>
            </Reveal>
          </div>
        </div>
      </section>

      <section aria-labelledby="suradnja" className="bg-canvas py-24 lg:py-32">
        <div className="shell">
          <SectionHead
            eyebrow="Kako izgleda suradnja"
            title={
              <span id="suradnja">
                Od upita
                <br />
                <span className="text-taupe">do montaže.</span>
              </span>
            }
          />
          <div className="mt-10 lg:mt-14">
            <Timeline steps={collaborationSteps} />
          </div>
          <Reveal className="mt-12 lg:mt-16">
            <p className="text-[14.5px] text-taupe">
              Imate pitanje prije upita?{" "}
              <Link href="/pitanja" className="text-graphite underline decoration-graphite/30 decoration-1 underline-offset-4 hover:decoration-graphite">
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
