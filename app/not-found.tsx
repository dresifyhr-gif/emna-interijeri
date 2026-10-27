import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { nav } from "@/lib/site";
import { Wordmark } from "@/components/site/Wordmark";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Stranica nije pronađena",
  robots: { index: false },
};

/** light like the rest of the public site (the root layout's colour is the studio's dark one) */
export const viewport: Viewport = {
  themeColor: "#FAF8F5",
  colorScheme: "light",
};

/**
 * 404 — rendered in the root layout (no site header), so it carries its own wordmark and links. Light like the rest of
 * the public site (`.site` in globals.css gives the warm white base and the graphite focus ring).
 */
export default function NotFound() {
  return (
    <main className="site relative flex min-h-[100svh] flex-col overflow-hidden bg-canvas font-sans text-graphite">
      <div className="shell relative flex h-[72px] items-center">
        <Wordmark />
      </div>

      <div className="shell relative flex flex-1 flex-col justify-center py-16">
        <p className="kicker text-taupe">Greška 404</p>

        <h1 className="mt-5">
          <span className="sr-only">Stranica nije pronađena (404)</span>
          <span aria-hidden className="heading block text-[clamp(112px,26vw,340px)] leading-[0.85] tracking-[-0.05em] text-graphite">
            404
          </span>
        </h1>

        {/* a dimension line that measures nothing */}
        <div aria-hidden className="mt-8 flex max-w-[min(100%,56rem)] items-center gap-3 text-bronze">
          <span className="h-3 w-px rotate-45 bg-bronze" />
          <span className="h-px flex-1 bg-bronze/40" />
          <span className="whitespace-nowrap text-[13px] font-medium text-bronze-deep">? cm</span>
          <span className="h-px flex-1 bg-bronze/40" />
          <span className="h-3 w-px rotate-45 bg-bronze" />
        </div>

        <p className="mt-10 max-w-lg text-lg leading-relaxed text-taupe">
          Ova stranica ne postoji ili je premještena. Sve ostalo je i dalje po mjeri.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
          <LinkButton href="/" variant="ink" arrow>
            Na naslovnicu
          </LinkButton>
          <LinkButton href="/studio" variant="text" arrow>
            Otvorite 3D studio
          </LinkButton>
        </div>

        <nav aria-label="Stranice" className="mt-16 border-t border-hairline pt-6">
          <ul className="flex flex-wrap gap-x-7 gap-y-3 text-[14px] text-graphite/75">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="transition-colors hover:text-graphite">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/pitanja" className="transition-colors hover:text-graphite">
                Česta pitanja
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </main>
  );
}
