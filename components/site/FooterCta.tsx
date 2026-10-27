"use client";

import { usePathname } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";
import { inquiryHref, interestForPath, type InquiryInterest } from "@/lib/site";

type Band = { kicker: string; title: string; accent: string; href: string; cta: string };

const studio: Band = {
  kicker: "3D studio",
  title: "Složite svoju kuhinju.",
  accent: "Okvirnu cijenu vidite odmah.",
  href: "/studio",
  cta: "Otvorite 3D studio",
};

/** wardrobe and interior visitors are asked for their measurements, not sent to the kitchen tool */
const inquiry: Partial<Record<InquiryInterest, Band>> = {
  ormar: {
    kicker: "Upit za ormar",
    title: "Pošaljite mjere ormara.",
    accent: "Javit ćemo vam se.",
    href: inquiryHref("ormar"),
    cta: "Pošaljite upit",
  },
  interijer: {
    kicker: "Upit za interijer",
    title: "Pošaljite mjere prostora.",
    accent: "Javit ćemo vam se.",
    href: inquiryHref("interijer"),
    cta: "Pošaljite upit",
  },
};

/**
 * Pages without the band: the homepage has its own dark 3D studio band (components/home/StudioBand), and on the
 * contact and privacy pages an invitation right above the footer only gets in the way.
 */
const NONE = new Set(["/", "/kontakt", "/privatnost"]);

/** The footer's closing invitation — the one dark band of every subpage, matched to what the page is about. */
export function FooterCta() {
  const pathname = usePathname();
  if (NONE.has(pathname)) return null;
  const band = inquiry[interestForPath(pathname)] ?? studio;
  return (
    <div className="relative overflow-hidden border-b border-white/[0.08] bg-[radial-gradient(ellipse_60%_90%_at_85%_0%,#1d1c1f_0%,#141416_55%,#111113_100%)]">
      <div className="shell flex flex-col items-start justify-between gap-10 py-20 lg:flex-row lg:items-end lg:py-28">
        <div>
          <p className="kicker text-accent">{band.kicker}</p>
          <h2 className="heading mt-5 max-w-3xl text-[clamp(36px,5vw,64px)]">
            {band.title}{" "}
            <span className="block text-accent">{band.accent}</span>
          </h2>
        </div>
        <LinkButton href={band.href} variant="cream" arrow className="shrink-0">
          {band.cta}
        </LinkButton>
      </div>
    </div>
  );
}
