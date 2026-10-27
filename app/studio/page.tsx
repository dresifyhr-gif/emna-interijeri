import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/components/pages/meta";
import { Studio } from "@/components/studio/Studio";
import { StudioFallback } from "@/components/studio/StudioLoader";

export const metadata: Metadata = pageMetadata({
  title: "3D konfigurator kuhinje: složite kuhinju i vidite cijenu",
  // (at most 155 characters: search results show no more)
  description:
    "Složite kuhinju po mjeri u 3D-u: oblik, mjere, elementi, boje i ploča. Okvirnu cijenu vidite odmah, a upit s mjerama i slikom šaljete izravno nama.",
  path: "/studio",
});

export const viewport: Viewport = {
  themeColor: "#0B0B0C",
  colorScheme: "dark",
  // the studio is a full-screen app: keep the layout stable when the on-screen keyboard opens
  interactiveWidget: "resizes-content",
};

/**
 * Full-screen configurator, outside the (site) group — no site header/footer.
 * <Studio> reads ?k= / ?oblik= / ?front= / ?top= with useSearchParams, hence the Suspense boundary.
 */
export default function StudioPage() {
  return (
    <Suspense fallback={<StudioFallback />}>
      <Studio />
    </Suspense>
  );
}
