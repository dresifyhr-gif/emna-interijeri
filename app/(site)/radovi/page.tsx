import type { Metadata } from "next";
import { gallery } from "@/lib/gallery";
import { PageHero } from "@/components/pages/PageHero";
import { CtaPair } from "@/components/pages/CtaPair";
import { Gallery } from "@/components/pages/radovi/Gallery";
import { pageMetadata } from "@/components/pages/meta";

const cover = gallery[0];

export const metadata: Metadata = pageMetadata({
  title: "Radovi",
  description:
    "Realizacije kuhinja po mjeri: moderne, minimalističke, premium i klasične, ravne, L, U i s otokom. Pogledajte fotografije i filtrirajte po stilu ili obliku.",
  path: "/radovi",
  image: { url: cover.src, width: cover.w, height: cover.h, alt: cover.title },
});

export default function RadoviPage() {
  return (
    <>
      <PageHero
        size="md"
        eyebrow="Radovi"
        lines={[{ text: "Izmjereno." }, { text: "Izrađeno." }, { text: "Montirano.", accent: true }]}
        lead={
          <p>
            {gallery.length} fotografija kuhinja iz stvarnih prostora. Filtrirajte po stilu ili obliku i otvorite
            fotografiju za pregled preko cijelog zaslona.
          </p>
        }
      />

      <section aria-label="Galerija realizacija" className="bg-canvas pb-24 lg:pb-32">
        <div className="shell">
          <Gallery />
        </div>
      </section>

      <CtaPair
        eyebrow="Vaša kuhinja"
        title={
          <>
            Sljedeća može
            <br />
            <span className="text-taupe">biti vaša.</span>
          </>
        }
        items={[
          {
            href: "/studio",
            kicker: "3D studio",
            title: "Složite je sami.",
            text: "Unesite mjere zidova, odaberite oblik i materijale i odmah vidite okvirnu cijenu.",
          },
          {
            href: "/kontakt?interes=kuhinja",
            kicker: "Upit",
            title: "Pošaljite mjere.",
            text: "Svidjela vam se neka od kuhinja? Napišite koja i pošaljite mjere svog prostora.",
          },
        ]}
      />
    </>
  );
}
