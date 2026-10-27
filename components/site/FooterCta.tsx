"use client";

import { usePathname } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";

/**
 * The footer's 3D-studio invitation — the one dark band of every subpage. Hidden on the homepage, which has its own
 * dark 3D studio band (components/home/StudioBand) further up.
 */
export function FooterCta() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="relative overflow-hidden border-b border-white/[0.08] bg-[radial-gradient(ellipse_60%_90%_at_85%_0%,#1d1c1f_0%,#141416_55%,#111113_100%)]">
      <div className="shell flex flex-col items-start justify-between gap-10 py-20 lg:flex-row lg:items-end lg:py-28">
        <div>
          <p className="kicker text-accent">3D studio</p>
          <h2 className="heading mt-5 max-w-3xl text-[clamp(36px,5vw,64px)]">
            Složite svoju kuhinju.
            <span className="block text-accent">Okvirnu cijenu vidite odmah.</span>
          </h2>
        </div>
        <LinkButton href="/studio" variant="cream" arrow className="shrink-0">
          Otvori 3D studio
        </LinkButton>
      </div>
    </div>
  );
}
