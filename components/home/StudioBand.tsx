import { catalog } from "@/lib/studio/catalog";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { StudioLaunch } from "./StudioLaunch";
import { StudioPreview } from "./StudioPreview";

/** Croatian plural: 1 fronta, 2–4 fronte, 5+ fronti (21 fronta, 34 fronte, 14 fronti) */
function plural(n: number, one: string, few: string, many: string) {
  const d = n % 10;
  const h = n % 100;
  if (d === 1 && h !== 11) return one;
  if (d >= 2 && d <= 4 && (h < 12 || h > 14)) return few;
  return many;
}

/** 3D studio — the homepage's one dark band: a still of the studio and what it does, with one button. */
export function StudioBand() {
  const fronts = catalog.fronts.length;
  const tops = catalog.tops.length;
  const points = [
    "Mjere vaših zidova u centimetrima, s prozorom i visinom stropa",
    "Klik na „+” dodaje element, klik na element ga mijenja",
    `${fronts} ${plural(fronts, "fronta", "fronte", "fronti")} i ${tops} ${plural(tops, "radna ploča", "radne ploče", "radnih ploča")}, staklo, nape i police`,
    "Okvirna cijena odmah, PDF i upit s točnim mjerama",
  ];

  return (
    <section
      aria-labelledby="studio-naslov"
      data-header="dark"
      data-tone="dark"
      className="cv-auto relative overflow-hidden bg-night-band py-24 text-fg sm:py-28 lg:py-32"
    >
      <div className="shell grid items-center gap-12 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
        <Reveal y={32} className="order-2 lg:order-1">
          <StudioPreview />
        </Reveal>

        <div className="order-1 lg:order-2">
          <Reveal y={12}>
            <Eyebrow tone="dark">3D studio</Eyebrow>
          </Reveal>
          <MaskLines
            id="studio-naslov"
            lines={[{ text: "Složite svoju kuhinju." }, { text: "Za dvije minute.", accent: true }]}
            accentClass="text-accent"
            className="mt-4 text-[clamp(34px,4.2vw,56px)]"
          />
          <Reveal delay={0.1}>
            <ul className="mt-8 grid gap-3.5">
              {points.map((t) => (
                <li key={t} className="flex gap-3 text-[15px] leading-normal text-fg/80">
                  <span aria-hidden className="mt-[2px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-night">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5.3 4.1 7.3 8 3" stroke="currentColor" strokeWidth="1.5" />
                    </svg>
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </Reveal>
          <Reveal delay={0.18} className="mt-9">
            <StudioLaunch variant="cream">Otvorite 3D studio</StudioLaunch>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
