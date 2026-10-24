import Image from "next/image";
import Link from "next/link";
import { gallery, styleLabel, type Photo, type Shape } from "@/lib/gallery";
import { LinkButton } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";

/** editorial picks, alternating dark and light kitchens; missing files are replaced from the gallery */
const PICKS = [
  "kuhinja-crna-drvo-otok",
  "kuhinja-zelena-crni-mramor-2",
  "kuhinja-bijela-zlato",
  "kuhinja-siva-mramor",
  "kuhinja-bijela-drvo-velik",
  "kuhinja-crna-drvo-sala",
];

const SHAPE: Record<Shape, string> = { ravna: "Ravna", L: "L-kuhinja", U: "U-kuhinja", otok: "S otokom" };

function picks(): Photo[] {
  const chosen = PICKS.map((f) => gallery.find((p) => p.src === `/galerija/${f}.jpg`)).filter((p): p is Photo => Boolean(p));
  for (const p of gallery) {
    if (chosen.length >= PICKS.length) break;
    if (!chosen.includes(p)) chosen.push(p);
  }
  return chosen.slice(0, PICKS.length);
}

/**
 * Grid placement. lg: big photo + two stacked, then two stacked + big photo (all cells keep 4:3).
 * Mobile: big photos full width, the small ones in pairs.
 */
const CELLS = [
  { cell: "col-span-2 lg:col-start-1 lg:col-end-9 lg:row-start-1 lg:row-end-3", big: true },
  { cell: "col-span-1 lg:col-start-9 lg:col-end-13 lg:row-start-1", big: false },
  { cell: "col-span-1 lg:col-start-9 lg:col-end-13 lg:row-start-2", big: false },
  { cell: "col-span-1 lg:col-start-1 lg:col-end-5 lg:row-start-3", big: false },
  { cell: "col-span-1 lg:col-start-1 lg:col-end-5 lg:row-start-4", big: false },
  { cell: "col-span-2 lg:col-start-5 lg:col-end-13 lg:row-start-3 lg:row-end-5", big: true },
];

function Tile({ photo, big }: { photo: Photo; big: boolean }) {
  const meta = [styleLabel[photo.style], photo.shape ? SHAPE[photo.shape] : null].filter(Boolean).join(" · ");
  return (
    <Link
      href="/radovi"
      className={`group relative block w-full overflow-hidden bg-paper-dark ${big ? "aspect-[4/3] lg:aspect-auto lg:h-full" : "aspect-[4/3]"}`}
    >
      <Image
        src={photo.src}
        alt={photo.title}
        fill
        sizes={big ? "(min-width: 1024px) 62vw, 100vw" : "(min-width: 1024px) 31vw, 50vw"}
        className="object-cover transition-transform duration-[1600ms] ease-premium group-hover:scale-[1.05] group-focus-visible:scale-[1.05]"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-ink/70 via-ink/0 to-ink/0 opacity-80 transition-opacity duration-700 ease-premium group-hover:opacity-100"
      />
      <span
        aria-hidden
        className="absolute right-4 top-4 flex h-10 w-10 translate-y-1 items-center justify-center rounded-full bg-paper/90 text-ink opacity-0 transition-all duration-500 ease-premium group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
      >
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
          <path d="M3 11L11 3m0 0H4.5M11 3v6.5" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </span>
      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-1.5 p-4 text-fg transition-transform duration-700 ease-premium group-hover:-translate-y-1 sm:p-5 lg:p-6">
        <span
          aria-hidden
          className={`font-display font-medium leading-tight tracking-[-0.01em] ${big ? "text-[17px] sm:text-xl" : "text-[13px] sm:text-[15px]"}`}
        >
          {photo.title}
        </span>
        <span className="eyebrow !text-[10px] text-fg/70">{meta}</span>
      </span>
    </Link>
  );
}

/** 03 · Radovi — paper. Six real photos from lib/gallery.ts as an editorial grid. */
export function Works() {
  const photos = picks();
  return (
    <section aria-labelledby="radovi-naslov" className="bg-paper pb-28 text-ink sm:pb-36 lg:pb-48">
      <div className="shell">
        <div className="border-t border-ink/15 pt-16 sm:pt-20 lg:pt-28">
          <div className="flex flex-col gap-10 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <Reveal y={12}>
                <Eyebrow tone="paper" index="02">
                  Radovi
                </Eyebrow>
              </Reveal>
              <MaskLines
                id="radovi-naslov"
                lines={[{ text: "Naši" }, { text: "radovi.", accent: true }]}
                accentClass="text-accent-deep"
                className="mt-7 text-[clamp(42px,7vw,120px)]"
              />
            </div>
            <Reveal delay={0.15} className="max-w-sm lg:pb-3">
              <p className="text-base leading-relaxed text-ink/70">
                Stvarne kuhinje u stvarnim prostorima. Svaka je rađena po mjeri jednog zida, jednog kuta, jednog doma.
              </p>
              <LinkButton href="/radovi" variant="outline-dark" arrow className="mt-7">
                Svi radovi
                <span className="tabular-nums opacity-60">{gallery.length}</span>
              </LinkButton>
            </Reveal>
          </div>

          <ul className="mt-14 grid grid-cols-2 gap-2.5 sm:gap-4 lg:mt-20 lg:grid-cols-12">
            {photos.map((p, i) => {
              const c = CELLS[i] ?? CELLS[1];
              return (
                <Reveal key={p.src} as="li" delay={(i % 3) * 0.08} y={36} className={c.cell}>
                  <Tile photo={p} big={c.big} />
                </Reveal>
              );
            })}
          </ul>
        </div>
      </div>
    </section>
  );
}
