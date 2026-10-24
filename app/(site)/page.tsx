import type { Metadata } from "next";
import { site } from "@/lib/site";
import { HeroStage } from "@/components/home/HeroStage";
import { HeroPoster } from "@/components/home/HeroPoster";
import { HERO_CONFIG, heroReadout } from "@/components/home/heroConfig";
import { heroPresets } from "@/components/home/heroPresets";
import { Manifest } from "@/components/home/Manifest";
import { Works } from "@/components/home/Works";
import { Process } from "@/components/home/Process";
import { Materials } from "@/components/home/Materials";
import { StudioCall } from "@/components/home/StudioCall";
import { Contact } from "@/components/home/Contact";

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
    images: [{ url: "/og-image.jpg", width: 1200, height: 630 }],
  },
};

export default function HomePage() {
  return (
    <>
      <HeroStage poster={<HeroPoster />} presets={heroPresets(HERO_CONFIG)} readout={heroReadout(HERO_CONFIG)} />
      <Manifest />
      <Works />
      <Process />
      <Materials />
      <StudioCall />
      <Contact />
    </>
  );
}
