import { catalog, type MaterialDef } from "@/lib/studio/catalog";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { MaterialSwatches, type SwatchItem } from "./MaterialSwatches";

/** a light-to-dark run of fronts and four worktops; the rest are in the studio */
const FRONT_IDS = ["lak", "kasmir", "hrast", "maslina", "orah", "antracit"];
const TOP_IDS = ["mramor", "crni", "beton", "hrast"];

function pick(list: readonly MaterialDef[], ids: string[], group: SwatchItem["group"]): SwatchItem[] {
  return ids
    .map((id) => list.find((m) => m.id === id))
    .filter((m): m is MaterialDef => m !== undefined)
    .map((m) => ({
      id: m.id,
      group,
      name: m.name,
      swatch: m.swatch,
      render: m.render,
      href: `/studio?${group}=${encodeURIComponent(m.id)}`,
    }));
}

/** Materijali — warm white. Fronts and worktops straight from lib/studio/catalog.ts, each opening the studio. */
export function Materials() {
  const fronts = pick(catalog.fronts, FRONT_IDS, "front");
  const tops = pick(catalog.tops, TOP_IDS, "top");

  return (
    <section aria-labelledby="materijali-naslov" className="cv-auto bg-canvas py-24 sm:py-28 lg:py-32">
      <div className="shell">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div>
            <Reveal y={12}>
              <Eyebrow>Materijali</Eyebrow>
            </Reveal>
            <MaskLines
              id="materijali-naslov"
              lines={[{ text: "Odaberite materijal." }, { text: "Vidite ga na svojoj kuhinji.", accent: true }]}
              className="mt-4 text-[clamp(34px,4.2vw,56px)]"
            />
          </div>
          <Reveal delay={0.1} className="max-w-[24rem] lg:pb-1.5">
            <p className="text-[15px] leading-relaxed text-taupe">
              Kliknite uzorak i 3D studio se otvara s tim materijalom već postavljenim na kuhinju.
            </p>
            <p className="mt-2 text-[12.5px] text-taupe">Boje na zaslonu su približne.</p>
          </Reveal>
        </div>

        <Reveal className="mt-10 lg:mt-12" y={28}>
          <MaterialSwatches fronts={fronts} tops={tops} />
        </Reveal>
      </div>
    </section>
  );
}
