import Image from "next/image";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { LoopVideo } from "./LoopVideo";
import { MaskLines } from "./MaskLines";

/** both cards are 4:5; lg: the media column is 1.3 of the 2.3 shell fractions, split in two */
const SIZES = "(min-width: 1440px) 380px, (min-width: 1024px) 27vw, 50vw";

const LABEL = "absolute bottom-2.5 left-2.5 rounded-full bg-white/[0.88] px-3 py-1.5 text-[11.5px] text-graphite backdrop-blur-md sm:bottom-3.5 sm:left-3.5 sm:text-[12px]";

/**
 * Iz 3D-a u stvarnost — greige, between "Kako radimo" and the dark studio band. One real kitchen twice: as the 3D studio
 * draws it (a still from the studio's evening view) and as it stands after montage (a muted loop cut from the owner's own
 * footage, public/video). Both are cropped from the same viewpoint so the two cards read as one comparison.
 */
export function StudioToReal() {
  return (
    <section aria-labelledby="stvarnost-naslov" className="cv-auto bg-greige py-24 sm:py-28 lg:py-32">
      <div className="shell grid items-center gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)] lg:gap-16">
        <div>
          <Reveal y={12}>
            <Eyebrow>Iz 3D-a u stvarnost</Eyebrow>
          </Reveal>
          <MaskLines
            id="stvarnost-naslov"
            lines={[{ text: "Prvo u 3D-u." }, { text: "Onda u vašem domu.", accent: true }]}
            className="mt-4 text-[clamp(34px,4.2vw,56px)]"
          />
          <Reveal delay={0.1}>
            <p className="mt-6 max-w-[26rem] text-[15px] leading-relaxed text-taupe">
              Lijevo je kuhinja složena u našem 3D studiju, desno ista kuhinja nakon montaže. Isti raspored, iste fronte, isto
              staklo iza ploče.
            </p>
          </Reveal>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-4">
          <Reveal y={24}>
            <figure className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-hairline">
              <Image
                src="/video/kuhinja-3d-studio.jpg"
                alt="Kuhinja složena u 3D studiju: bijeli visoki elementi, sivi gornji, crno staklo sa zlatnim žilama"
                fill
                sizes={SIZES}
                className="object-cover"
              />
              <figcaption className={LABEL}>3D studio</figcaption>
            </figure>
          </Reveal>
          <Reveal y={24} delay={0.08}>
            <figure className="relative aspect-[4/5] overflow-hidden rounded-2xl bg-hairline">
              <LoopVideo src="/video/kuhinja-3d-stvarnost.mp4" className="h-full w-full">
                <Image src="/video/kuhinja-3d-stvarnost.jpg" alt="Ista kuhinja nakon montaže" fill sizes={SIZES} className="object-cover" />
              </LoopVideo>
              <figcaption className={LABEL}>Montirano</figcaption>
            </figure>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
