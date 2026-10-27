"use client";

/**
 * The 3D studio crashed (three.js, WebGL, the AI, the PDF …): dark like the studio, in Croatian, never Next's English
 * page. "Pokušajte ponovno" renders the studio again (reset); when the error comes straight back, the page itself is
 * reloaded — its address keeps the kitchen (?k=). The kitchen is also saved on this device (lib/studio/autosave.ts: the
 * studio writes a waiting change as it goes), so the next visit offers it back. An inquiry works without 3D: /kontakt.
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { Arrow } from "@/components/ui/Button";
import { Wordmark } from "@/components/site/Wordmark";

/** when "Pokušajte ponovno" last reset the studio — module state: it outlives this page when the error shows again */
let resetAt = -Infinity;
/** the error back within this long of a reset: the reset did not help */
const AGAIN_MS = 4000;

export default function StudioError({ error, reset }: { error: unknown; reset: () => void }) {
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    console.error("[studio]", error);
    // shown again right after a reset: the page itself again (the address keeps the kitchen)
    if (performance.now() - resetAt < AGAIN_MS) window.location.reload();
    return () => {
      alive.current = false;
    };
  }, [error]);

  const again = () => {
    resetAt = performance.now();
    reset();
    // still here a moment later (the same error page kept): the reset did not help
    window.setTimeout(() => {
      if (alive.current) window.location.reload();
    }, 1500);
  };

  return (
    <main className="fixed inset-0 flex flex-col overflow-y-auto bg-ink text-fg">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,233,.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,239,233,.045)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_70%_60%_at_40%_30%,black,transparent_75%)]"
      />
      <div className="relative flex h-14 shrink-0 items-center px-4 sm:px-6 lg:h-[72px] lg:px-8">
        <Wordmark sub={false} />
      </div>

      <div className="relative mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-6 pb-16 pt-8">
        <p className="eyebrow text-accent">3D studio</p>
        <h1 className="display mt-4 text-[clamp(28px,5vw,44px)]">Nešto je pošlo krivo s 3D prikazom.</h1>
        <p className="mt-4 text-[15px] leading-relaxed text-fg/70">
          Pokušajte ponovno — studio se otvara s istom kuhinjom. Ako se greška ponovi, upit nam možete poslati i bez 3D
          prikaza.
        </p>

        <div className="mt-8 flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            onClick={again}
            className="group inline-flex h-12 items-center justify-center gap-2.5 rounded-full bg-accent px-6 text-[14px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg"
          >
            Pokušajte ponovno
            <Arrow />
          </button>
          <Link
            href="/kontakt#upit"
            className="inline-flex h-12 items-center justify-center rounded-full border border-white/20 px-6 text-[14px] font-semibold tracking-wide text-fg transition-colors duration-300 ease-premium hover:border-accent hover:text-accent"
          >
            Pošaljite upit bez 3D-a
          </Link>
        </div>

        <p className="mt-8 border-t border-white/10 pt-5 text-[13px] leading-relaxed text-mut">
          Kuhinja koju ste složili spremljena je na ovom uređaju: kad ponovno otvorite studio, možete je nastaviti.
        </p>
      </div>
    </main>
  );
}
