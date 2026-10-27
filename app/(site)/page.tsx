import type { Metadata, Viewport } from "next";
import { site } from "@/lib/site";
import { HeroStage } from "@/components/home/HeroStage";
import { HeroPoster } from "@/components/home/HeroPoster";
import { HERO_CONFIG, heroReadout } from "@/components/home/heroConfig";
import { heroPresets } from "@/components/home/heroPresets";
import { Works } from "@/components/home/Works";
import { Process } from "@/components/home/Process";
import { StudioBand } from "@/components/home/StudioBand";
import { Materials } from "@/components/home/Materials";
import { Contact } from "@/components/home/Contact";
import { PerfProbe } from "@/components/home/PerfProbe";
import { SHARE_IMAGE } from "@/components/pages/meta";

// title and description come from the root layout defaults; openGraph is repeated in full because a
// page-level openGraph replaces the layout's, and only here does it get og:url
export const metadata: Metadata = {
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: site.locale,
    siteName: site.name,
    url: "/",
    title: `${site.name} · ${site.tagline}`,
    description: site.description,
    images: [SHARE_IMAGE],
  },
};

/** the homepage opens on the dark hero */
export const viewport: Viewport = {
  themeColor: "#141416",
};

/**
 * Dark hero with the live 3D kitchen → light sections (radovi, kako radimo) → the dark 3D studio band → light
 * materials and contact → dark footer.
 */
export default function HomePage() {
  return (
    <>
      <HeroStage poster={<HeroPoster />} presets={heroPresets(HERO_CONFIG)} readout={heroReadout(HERO_CONFIG)} />
      <Works />
      <Process />
      <StudioBand />
      <Materials />
      <Contact />
      <PerfProbe />
    </>
  );
}
