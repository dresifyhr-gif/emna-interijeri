import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Honest placeholder where project photos will go: an empty image frame drawn the way
 * architects mark a picture to come (crop marks + diagonals). No stock imagery.
 */
export function SoonNote({ subject }: { subject: string }) {
  return (
    <Reveal>
      <div className="relative grid items-center gap-8 rounded-[20px] border border-dashed border-graphite/20 bg-card/60 p-6 sm:grid-cols-[minmax(0,220px)_1fr] sm:p-8">
        <svg viewBox="0 0 220 150" aria-hidden className="w-full max-w-[220px] text-bronze" fill="none" stroke="currentColor" strokeWidth="1">
          <path d="M18 18h184v114H18Z" strokeOpacity=".45" />
          <path d="M18 18 202 132M202 18 18 132" strokeOpacity=".3" strokeDasharray="3 4" />
          <path d="M6 18h8M18 6v8M214 18h-8M202 6v8M6 132h8M18 144v-8M214 132h-8M202 144v-8" />
          <circle cx="110" cy="75" r="14" strokeOpacity=".7" />
          <circle cx="110" cy="75" r="6" />
        </svg>
        <div>
          <p className="kicker text-taupe">Galerija</p>
          <p className="heading mt-3 text-2xl tracking-head-sm sm:text-[28px]">Fotografije realizacija uskoro.</p>
          <p className="mt-3 max-w-lg text-[14.5px] leading-relaxed text-taupe">
            Fotografije {subject} pripremamo za ovu stranicu. Do tada pogledajte{" "}
            <Link href="/radovi" className="text-graphite underline decoration-graphite/30 decoration-1 underline-offset-4 hover:decoration-graphite">
              naše kuhinje
            </Link>{" "}
            ili nam{" "}
            <Link href="/kontakt" className="text-graphite underline decoration-graphite/30 decoration-1 underline-offset-4 hover:decoration-graphite">
              opišite svoj prostor
            </Link>
            .
          </p>
        </div>
      </div>
    </Reveal>
  );
}
