import type { Metadata } from "next";
import Link from "next/link";
import { nav } from "@/lib/site";
import { Wordmark } from "@/components/site/Wordmark";
import { LinkButton } from "@/components/ui/Button";

export const metadata: Metadata = {
  title: "Stranica nije pronađena",
  robots: { index: false },
};

/** 404 — rendered in the root layout (no site header), so it carries its own wordmark and links. */
export default function NotFound() {
  return (
    <main className="relative flex min-h-[100svh] flex-col overflow-hidden bg-ink text-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,233,.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,239,233,.045)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_80%_70%_at_30%_10%,black,transparent_75%)]"
      />

      <div className="shell relative flex h-[72px] items-center">
        <Wordmark />
      </div>

      <div className="shell relative flex flex-1 flex-col justify-center py-16">
        <p className="eyebrow flex items-center gap-4 text-accent">
          <span aria-hidden className="h-px w-8 bg-accent/70" />
          Greška 404
        </p>

        <h1 className="mt-6">
          <span className="sr-only">Stranica nije pronađena (404)</span>
          <span aria-hidden className="display block text-[clamp(120px,30vw,400px)] leading-[0.78] text-fg">
            404
          </span>
        </h1>

        {/* a dimension line that measures nothing */}
        <div aria-hidden className="mt-8 flex max-w-[min(100%,56rem)] items-center gap-3 text-accent">
          <span className="h-3 w-px rotate-45 bg-accent" />
          <span className="h-px flex-1 bg-accent/50" />
          <span className="eyebrow whitespace-nowrap">? cm</span>
          <span className="h-px flex-1 bg-accent/50" />
          <span className="h-3 w-px rotate-45 bg-accent" />
        </div>

        <p className="mt-10 max-w-lg text-lg leading-relaxed text-fg/70">
          Ova stranica ne postoji ili je premještena. Sve ostalo je i dalje po mjeri.
        </p>

        <div className="mt-10 flex flex-wrap gap-3">
          <LinkButton href="/" variant="light" arrow>
            Na naslovnicu
          </LinkButton>
          <LinkButton href="/studio" variant="outline">
            Otvori 3D studio
          </LinkButton>
        </div>

        <nav aria-label="Stranice" className="mt-16 border-t border-white/10 pt-6">
          <ul className="flex flex-wrap gap-x-8 gap-y-3 text-[11px] font-medium uppercase tracking-[0.2em] text-fg/60">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="transition-colors hover:text-accent">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/pitanja" className="transition-colors hover:text-accent">
                Česta pitanja
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </main>
  );
}
