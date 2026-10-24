import { catalog } from "@/lib/studio/catalog";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { MaterialSwatches, type SwatchItem } from "./MaterialSwatches";

/** worktops shown on the homepage (the rest are in the studio) */
const TOP_IDS = ["mramor", "crni", "beton", "hrast"];

/** 05 · Materijali — dark. Fronts and a few worktops straight from lib/studio/catalog.ts. */
export function Materials() {
  const fronts: SwatchItem[] = catalog.fronts.map((m) => ({
    id: m.id,
    group: "front",
    name: m.name,
    swatch: m.swatch,
    render: m.render,
    href: `/studio?front=${encodeURIComponent(m.id)}`,
  }));
  const tops: SwatchItem[] = catalog.tops
    .filter((m) => TOP_IDS.includes(m.id))
    .map((m) => ({
      id: m.id,
      group: "top",
      name: m.name,
      swatch: m.swatch,
      render: m.render,
      href: `/studio?top=${encodeURIComponent(m.id)}`,
    }));

  return (
    <section aria-labelledby="materijali-naslov" className="relative overflow-hidden bg-ink-700 py-28 text-fg sm:py-36 lg:py-48">
      <div className="shell relative">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="lg:col-span-7">
            <Reveal y={12}>
              <Eyebrow index="04">Materijali</Eyebrow>
            </Reveal>
            <MaskLines
              id="materijali-naslov"
              lines={[{ text: "Odaberite" }, { text: "materijal.", accent: true }]}
              className="mt-7 text-[clamp(42px,7vw,120px)]"
            />
          </div>
          <Reveal delay={0.15} className="lg:col-span-4 lg:col-start-9 lg:pb-3">
            <p className="max-w-md text-base leading-relaxed text-fg/70 sm:text-lg">
              Odaberite uzorak — 3D studio se otvara s tim materijalom već postavljenim na kuhinju.
            </p>
            <p className="mt-4 text-[12px] text-mut">Boje na zaslonu su približne.</p>
          </Reveal>
        </div>

        <Reveal className="mt-16 lg:mt-24" y={40}>
          <MaterialSwatches fronts={fronts} tops={tops} />
        </Reveal>
      </div>
    </section>
  );
}
