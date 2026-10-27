import Link from "next/link";
import { inquiryHref } from "@/lib/site";
import { Arrow } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { StepRule } from "./StepRule";

const STEPS: { title: string; kicker: string; text: string; link?: { href: string; label: string } }[] = [
  {
    title: "Izmjera",
    kicker: "Na licu mjesta",
    text: "Dolazimo i mjerimo svaki zid, kut, otvor i priključak. Iz tih mjera nastaje sve ostalo.",
    link: { href: inquiryHref("kuhinja", { measurement: true }), label: "Zatražite izmjeru" },
  },
  {
    title: "3D projekt",
    kicker: "Prije izrade",
    text: "Prema mjerama crtamo 3D projekt. Raspored, materijale i detalje vidite prije nego što krenemo u izradu.",
  },
  { title: "Izrada", kicker: "U radionici", text: "Elemente krojimo i slažemo prema projektu, za točno vaš prostor." },
  {
    title: "Montaža",
    kicker: "U vašem prostoru",
    text: "Ugrađujemo, poravnavamo i podešavamo vrata i ladice, a na kraju sve očistimo.",
  },
];

/** Kako radimo — warm white. Four honest steps on a hairline; each rule draws in as it scrolls into view. */
export function Process() {
  return (
    <section aria-labelledby="proces-naslov" className="bg-canvas py-24 sm:py-28 lg:py-32">
      <div className="shell">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div>
            <Reveal y={12}>
              <Eyebrow>Kako radimo</Eyebrow>
            </Reveal>
            <MaskLines
              id="proces-naslov"
              lines={[{ text: "Od zida do kuhinje." }, { text: "Jedan tim.", accent: true }]}
              className="mt-4 text-[clamp(34px,4.2vw,56px)]"
            />
          </div>
          <Reveal delay={0.1} className="max-w-[24rem] lg:pb-1.5">
            <p className="text-[15px] leading-relaxed text-taupe">
              Četiri koraka bez prebacivanja odgovornosti. Kuhinju vidite u 3D-u prije nego što se izreže prva ploča.
            </p>
          </Reveal>
        </div>

        <ol className="mt-12 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:mt-16 lg:grid-cols-4">
          {STEPS.map((s, i) => (
            <li key={s.title} className="relative pt-7">
              <StepRule delay={i * 0.1} />
              <Reveal y={14} delay={i * 0.06}>
                <p className="flex items-baseline justify-between gap-4 text-[13px]">
                  <span className="font-head font-medium tabular-nums text-bronze-deep">
                    <span className="sr-only">Korak </span>
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span className="text-[12px] text-taupe">{s.kicker}</span>
                </p>
                <h3 className="heading mt-4 text-[24px] tracking-head-sm">{s.title}</h3>
                <p className="mt-3 max-w-[17rem] text-[14.5px] leading-relaxed text-taupe">{s.text}</p>
                {s.link && (
                  <Link
                    href={s.link.href}
                    className="group mt-4 inline-flex items-center gap-2 text-[14px] font-medium text-graphite underline decoration-graphite/25 decoration-1 underline-offset-[6px] transition-colors hover:decoration-graphite"
                  >
                    {s.link.label}
                    <Arrow />
                  </Link>
                )}
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
