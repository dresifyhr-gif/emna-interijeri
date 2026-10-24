"use client";

import { usePathname } from "next/navigation";
import { LinkButton } from "@/components/ui/Button";

/**
 * The footer's big 3D-studio invitation. Hidden on the homepage, which already ends with its own
 * "Složite svoju kuhinju." section (components/home/StudioCall) right before the contact form.
 */
export function FooterCta() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="shell border-b border-white/10 py-20 lg:py-28">
      <p className="eyebrow text-accent">3D studio</p>
      <div className="mt-6 flex flex-col items-start justify-between gap-10 lg:flex-row lg:items-end">
        <h2 className="display max-w-4xl text-[clamp(44px,7vw,112px)]">
          Složite svoju
          <br />
          <span className="text-accent">kuhinju.</span>
        </h2>
        <LinkButton href="/studio" variant="light" arrow>
          Uđi u studio
        </LinkButton>
      </div>
    </div>
  );
}
