"use client";

/**
 * A page of the public site crashed: the site's header and footer stay (this boundary sits inside app/(site)/layout.tsx),
 * the page's place says so in Croatian, light like the rest of the site — never Next's English page. "Pokušajte ponovno"
 * fetches and renders the page again (retry); the home page and the inquiry form are one tap away.
 */
import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/Button";

export default function SiteError({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="relative overflow-hidden bg-canvas pb-20 pt-[124px] text-graphite sm:pb-24 lg:pt-[164px]">
      <div className="shell">
        <p className="kicker text-taupe">Greška</p>
        <h1 className="heading mt-5 max-w-3xl text-[clamp(34px,6vw,64px)]">Nešto je pošlo krivo.</h1>

        {/* a dimension line that does not close (as on the 404 page) */}
        <div aria-hidden className="mt-8 flex max-w-[min(100%,56rem)] items-center gap-3 text-bronze">
          <span className="h-3 w-px rotate-45 bg-bronze" />
          <span className="h-px flex-1 bg-bronze/40" />
          <span className="whitespace-nowrap text-[13px] font-medium text-bronze-deep">ponovno</span>
          <span className="h-px flex-1 bg-bronze/40" />
          <span className="h-3 w-px rotate-45 bg-bronze" />
        </div>

        <p className="mt-8 max-w-xl text-lg leading-relaxed text-taupe">
          Stranica se nije mogla prikazati. Pokušajte ponovno — a ako se greška ponovi, upit nam možete poslati preko
          kontakt stranice.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
          <Button type="button" variant="ink" arrow onClick={() => retry()}>
            Pokušajte ponovno
          </Button>
          <LinkButton href="/" variant="line">
            Naslovnica
          </LinkButton>
          <LinkButton href="/kontakt#upit" variant="text" arrow>
            Pošaljite upit
          </LinkButton>
        </div>
      </div>
    </section>
  );
}
