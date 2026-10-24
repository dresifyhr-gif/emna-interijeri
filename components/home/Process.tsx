import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { ProcessDrawing } from "./ProcessDrawing";
import { PROCESS_DRAWINGS, type ProcessDrawingId } from "./processDrawings";
import { StepRule } from "./StepRule";

const STEPS: { id: ProcessDrawingId; title: string; kicker: string; text: string; drawing: string }[] = [
  {
    id: "izmjera",
    title: "Izmjera",
    kicker: "Na licu mjesta",
    text: "Dolazimo i mjerimo svaki zid, kut, otvor i priključak. Iz tih mjera nastaje sve ostalo.",
    drawing: "Tlocrt prostorije s kotama zidova i laserskim mjerenjem udaljenosti",
  },
  {
    id: "projekt",
    title: "3D projekt",
    kicker: "Prije izrade",
    text: "Prema mjerama crtamo 3D projekt. Raspored, materijale i detalje vidite prije nego što krenemo u izradu.",
    drawing: "Aksonometrijski prikaz L-kuhinje sa strelicom okretanja pogleda",
  },
  {
    id: "izrada",
    title: "Izrada",
    kicker: "U radionici",
    text: "Elemente krojimo i slažemo prema projektu, za točno vaš prostor.",
    drawing: "Rastavljeni korpus elementa: stranice, dno, vrh, polica i leđa",
  },
  {
    id: "montaza",
    title: "Montaža",
    kicker: "U vašem prostoru",
    text: "Ugrađujemo, poravnavamo i podešavamo vrata i ladice, a na kraju sve očistimo.",
    drawing: "Pogled na montiranu kuhinju s libelom i laserskom linijom",
  },
];

/** 04 · Kako nastaje — dark. Four honest steps, each with a technical drawing that draws itself on scroll. */
export function Process() {
  return (
    <section aria-labelledby="proces-naslov" className="relative overflow-hidden bg-ink py-28 text-fg sm:py-36 lg:py-48">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,233,.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,239,233,.035)_1px,transparent_1px)] bg-[size:80px_80px] [mask-image:radial-gradient(ellipse_70%_60%_at_20%_0%,black,transparent_75%)]"
      />
      <div className="shell relative">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Reveal y={12}>
              <Eyebrow index="03">Kako nastaje</Eyebrow>
            </Reveal>
            <MaskLines
              id="proces-naslov"
              lines={[{ text: "Od zida" }, { text: "do kuhinje.", accent: true }]}
              className="mt-7 text-[clamp(42px,7vw,120px)]"
            />
          </div>
          <Reveal delay={0.15} className="lg:col-span-4 lg:col-start-9 lg:pb-3">
            <p className="max-w-md text-base leading-relaxed text-fg/70 sm:text-lg">
              Četiri koraka i jedan tim. Kuhinju vidite u 3D-u prije nego što se izreže prva ploča.
            </p>
          </Reveal>
        </div>

        <ol className="mt-16 grid gap-x-8 gap-y-16 sm:grid-cols-2 lg:mt-24 lg:grid-cols-4 lg:gap-x-10">
          {STEPS.map((s, i) => (
            <li key={s.id} className="relative">
              <StepRule delay={i * 0.12} />
              <div className="flex items-baseline justify-between pt-5">
                <span className="eyebrow tabular-nums text-accent">{String(i + 1).padStart(2, "0")}</span>
                <span className="eyebrow text-mut">{s.kicker}</span>
              </div>
              <div className="relative mt-6 aspect-[8/5] border border-white/[0.07] bg-ink-700/40">
                {/* crop marks */}
                <span aria-hidden className="absolute -left-px -top-px h-2.5 w-2.5 border-l border-t border-accent/50" />
                <span aria-hidden className="absolute -right-px -top-px h-2.5 w-2.5 border-r border-t border-accent/50" />
                <span aria-hidden className="absolute -bottom-px -left-px h-2.5 w-2.5 border-b border-l border-accent/50" />
                <span aria-hidden className="absolute -bottom-px -right-px h-2.5 w-2.5 border-b border-r border-accent/50" />
                <div className="absolute inset-[6%]">
                  <ProcessDrawing data={PROCESS_DRAWINGS[s.id]} label={s.drawing} />
                </div>
              </div>
              <Reveal y={16}>
                <h3 className="mt-8 font-display text-[28px] font-medium leading-none tracking-[-0.02em] sm:text-[30px]">{s.title}</h3>
                <p className="mt-4 max-w-sm text-[15px] leading-relaxed text-mut">{s.text}</p>
              </Reveal>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
