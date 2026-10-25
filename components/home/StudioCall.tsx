import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { Spotlight } from "./Spotlight";
import { StudioLaunch } from "./StudioLaunch";

/** the studio's steps (components/studio/meta.ts STEPS) */
const STEPS = ["Oblik", "Zidovi", "Elementi", "Boje", "Ploča i detalji", "Pošalji"];

/** 06 · Poziv u studio — a single spotlight from above, one sentence, one button. */
export function StudioCall() {
  return (
    <section
      aria-labelledby="studio-naslov"
      className="cv-auto relative isolate overflow-hidden bg-ink-900 py-36 text-center text-fg sm:py-44 lg:py-56"
    >
      <Spotlight />
      <div className="shell relative">
        <Reveal y={12}>
          <Eyebrow index="05" className="justify-center">
            3D studio
          </Eyebrow>
        </Reveal>
        <MaskLines
          id="studio-naslov"
          lines={[{ text: "Složite svoju kuhinju." }, { text: "Za dvije minute.", accent: true }]}
          className="mx-auto mt-8 max-w-[18ch] text-[clamp(38px,6.4vw,104px)] sm:max-w-none"
        />
        <Reveal delay={0.2}>
          <p className="mx-auto mt-8 max-w-xl text-base leading-relaxed text-fg/70 sm:text-lg">
            Upišite mjere prostorije i koliki dio zidova zauzima kuhinja, odaberite oblik — i s otokom, poluotokom ili
            šankom — pa složite elemente, boje fronti, radnu ploču i detalje. Okvirnu cijenu vidite odmah, a upit nam
            šaljete s mjerama i slikom svoje kuhinje.
          </p>
        </Reveal>
        <Reveal delay={0.3} className="mt-11 flex justify-center">
          <StudioLaunch className="!px-8 !py-4 text-[14px]">Uđi u 3D studio</StudioLaunch>
        </Reveal>
        <Reveal delay={0.4}>
          <ol aria-label="Koraci u 3D studiju" className="mx-auto mt-16 flex max-w-3xl flex-wrap justify-center gap-x-7 gap-y-3 sm:mt-20">
            {STEPS.map((s, i) => (
              <li key={s} className="eyebrow flex items-center gap-2 text-fg/55">
                <span className="tabular-nums text-accent/80">{String(i + 1).padStart(2, "0")}</span>
                {s}
              </li>
            ))}
          </ol>
        </Reveal>
      </div>
    </section>
  );
}
