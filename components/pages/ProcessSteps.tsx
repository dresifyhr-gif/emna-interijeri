import { Reveal } from "@/components/ui/Reveal";

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

/** Numbered steps as white cards on a light section. */
export function ProcessSteps({ steps = defaultSteps, className = "" }: { steps?: Step[]; className?: string }) {
  return (
    <ol className={`grid gap-3 sm:grid-cols-2 sm:gap-4 ${cols[steps.length] ?? "lg:grid-cols-4"} ${className}`}>
      {steps.map((s, i) => (
        <Reveal
          as="li"
          key={s.title}
          delay={i * 0.08}
          className="flex flex-col rounded-[18px] border border-hairline bg-card p-6 sm:p-7 lg:min-h-[300px]"
        >
          <span aria-hidden className="font-head text-[40px] font-normal leading-none tracking-head text-bronze">
            {String(i + 1).padStart(2, "0")}
          </span>
          <h3 className="heading mt-8 text-[22px] tracking-head-sm lg:mt-auto lg:pt-12">
            <span className="sr-only">Korak {i + 1}: </span>
            {s.title}
          </h3>
          <p className="mt-3 text-[14.5px] leading-relaxed text-taupe">{s.text}</p>
        </Reveal>
      ))}
    </ol>
  );
}
