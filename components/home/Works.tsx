import Image from "next/image";
import Link from "next/link";
import { projects, type Project } from "@/lib/gallery";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";

/** lib/gallery.ts lists five different kitchens first, led by the owner's favourites; the homepage shows exactly those */
const COUNT = 5;

/**
 * Grid placement. lg: one big photo spanning two rows on the left, four in a 2 × 2 block on the right (the photos fill
 * their cells). Below lg: the big one full width, the others in pairs, all 4:3.
 * Each tile opens its kitchen in the /radovi lightbox (`/radovi#<kuhinja>`; without JavaScript it scrolls to the card).
 */
function Tile({ project, big }: { project: Project; big: boolean }) {
  const photo = project.cover;
  return (
    <Link
      href={`/radovi#${project.id}`}
      aria-label={`${project.title}: pogledajte fotografije`}
      className="group relative block aspect-[4/3] h-full w-full overflow-hidden rounded-2xl bg-hairline lg:aspect-auto"
    >
      <Image
        src={photo.src}
        alt={project.title}
        fill
        sizes={big ? "(min-width: 1024px) 40vw, 100vw" : "(min-width: 1024px) 28vw, 50vw"}
        className="object-cover transition-transform duration-[1400ms] ease-premium group-hover:scale-[1.04] group-focus-visible:scale-[1.04]"
      />
      <span
        aria-hidden
        className={`absolute bottom-3 left-3 max-w-[calc(100%-1.5rem)] truncate rounded-full bg-white/[0.88] px-3 py-1.5 text-[11.5px] text-graphite backdrop-blur-md sm:bottom-3.5 sm:left-3.5 sm:block sm:text-[12px] ${big ? "" : "hidden"}`}
      >
        {project.title}
      </span>
    </Link>
  );
}

/** Naši radovi — greige. The five lead kitchens from lib/gallery.ts: one big, four small. */
export function Works() {
  const lead = projects.slice(0, COUNT);
  return (
    <section id="radovi" aria-labelledby="radovi-naslov" className="scroll-mt-16 bg-greige py-24 sm:py-28 lg:py-32">
      <div className="shell">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between lg:gap-12">
          <div>
            <Reveal y={12}>
              <Eyebrow>Radovi</Eyebrow>
            </Reveal>
            <MaskLines id="radovi-naslov" lines={[{ text: "Naši radovi" }]} className="mt-4 text-[clamp(34px,4.2vw,56px)]" />
          </div>
          <Reveal delay={0.1} className="max-w-[24rem] lg:pb-1.5">
            <p className="text-[15px] leading-relaxed text-taupe">
              Stvarne kuhinje u stvarnim domovima. Svaka je rađena po mjeri jednog zida, jednog kuta, jednog doma.
            </p>
            <LinkButton href="/radovi" variant="line" arrow className="mt-5">
              Svi radovi{" "}
              <span className="tabular-nums text-taupe">{projects.length}</span>
            </LinkButton>
          </Reveal>
        </div>

        <ul className="mt-10 grid grid-cols-2 gap-3 sm:gap-4 lg:mt-12 lg:h-[clamp(500px,44vw,640px)] lg:grid-cols-[1.25fr_1fr_1fr] lg:grid-rows-2">
          {lead.map((p, i) => (
            <Reveal key={p.id} as="li" delay={(i % 3) * 0.06} y={24} className={`min-h-0 ${i === 0 ? "col-span-2 lg:col-span-1 lg:row-span-2" : ""}`}>
              <Tile project={p} big={i === 0} />
            </Reveal>
          ))}
        </ul>

      </div>
    </section>
  );
}
