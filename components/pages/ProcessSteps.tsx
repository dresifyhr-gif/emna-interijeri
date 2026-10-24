import { Reveal } from "@/components/ui/Reveal";
import type { Tone } from "./SectionHead";

export type Step = { title: string; text: string };

/** The four phases every project goes through (also used on the homepage spec). */
export const defaultSteps: Step[] = [
  {
    title: "Izmjera",
    text: "Mjerimo zidove, kutove, prozore i instalacije te razgovaramo o tome kako prostor koristite: tko kuha, što se sprema, gdje ide svjetlo.",
  },
  {
    title: "3D projekt",
    text: "Prema izmjeri crtamo projekt u 3D-u. Raspored, materijale i svjetlo vidite prije nego što se izreže prva ploča i mijenjamo ga dok ne bude točan.",
  },
  {
    title: "Izrada",
    text: "Elemente izrađujemo prema potvrđenom projektu i vašim mjerama, s okovima i mehanizmima odabranima za svako mjesto.",
  },
  {
    title: "Montaža",
    text: "Montiramo, poravnavamo i podešavamo fronte, ladice i mehanizme. Što sve montaža uključuje, navodimo u ponudi.",
  },
];

/** The steps from first contact to handover, for /kontakt. */
export const collaborationSteps: Step[] = [
  {
    title: "Upit",
    text: "Pošaljite upit putem forme ili iz 3D studija. Okvirne mjere prostora ubrzavaju prvi razgovor.",
  },
  {
    title: "Razgovor i izmjera",
    text: "Javljamo se s pitanjima i dogovaramo izmjeru u vašem prostoru.",
  },
  {
    title: "Projekt i ponuda",
    text: "Dobivate 3D projekt i ponudu u kojoj je svaka stavka navedena zasebno. Projekt doradimo dok ne bude onakav kakav želite.",
  },
  {
    title: "Izrada",
    text: "Nakon potvrde projekta izrađujemo elemente prema vašim mjerama.",
  },
  {
    title: "Montaža",
    text: "Montiramo i podešavamo elemente prema projektu. Opseg montaže navodimo u ponudi stavku po stavku.",
  },
];

const cols: Record<number, string> = { 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5" };

/** Numbered steps on a hairline grid. Outlined numerals echo the line-drawing motif. */
export function ProcessSteps({
  steps = defaultSteps,
  tone = "dark",
  className = "",
}: {
  steps?: Step[];
  tone?: Tone;
  className?: string;
}) {
  const paper = tone === "paper";
  return (
    <ol
      className={`grid gap-px overflow-hidden border ${
        paper ? "border-ink/15 bg-ink/15" : "border-white/10 bg-white/10"
      } sm:grid-cols-2 ${cols[steps.length] ?? "lg:grid-cols-4"} ${className}`}
    >
      {steps.map((s, i) => (
        <Reveal
          as="li"
          key={s.title}
          delay={i * 0.08}
          className={`group relative flex flex-col p-6 sm:p-8 lg:min-h-[340px] ${paper ? "bg-paper" : "bg-ink"}`}
        >
          <span
            aria-hidden
            className={`font-display text-[72px] font-bold leading-none tracking-tightest text-transparent transition-colors duration-700 ease-premium ${
              paper
                ? "[-webkit-text-stroke:1px_rgba(138,122,92,.75)] group-hover:text-accent-deep/15"
                : "[-webkit-text-stroke:1px_rgba(201,185,154,.7)] group-hover:text-accent/10"
            }`}
          >
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="mt-10 font-display text-[22px] font-medium tracking-tight lg:mt-auto lg:pt-14">
            <span className="sr-only">Korak {i + 1}: </span>
            {s.title}
          </h3>
          <span aria-hidden className={`mt-4 block h-px w-10 ${paper ? "bg-accent-deep" : "bg-accent"}`} />
          <p className={`mt-4 text-sm leading-relaxed ${paper ? "text-ink/70" : "text-fg/65"}`}>{s.text}</p>
        </Reveal>
      ))}
    </ol>
  );
}
