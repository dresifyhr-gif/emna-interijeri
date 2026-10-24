import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import { pageMetadata } from "@/components/pages/meta";
import { Studio } from "@/components/studio/Studio";
import { StudioFallback } from "@/components/studio/StudioLoader";

export const metadata: Metadata = pageMetadata({
  title: "3D studio",
  description:
    "Složite kuhinju po svojim mjerama u 3D-u: oblik, zidovi, fronte, radna ploča i dodaci. Okvirnu cijenu vidite odmah, a upit s mjerama, slikom i linkom šaljete izravno nama.",
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
