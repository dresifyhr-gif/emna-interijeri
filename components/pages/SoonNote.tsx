import Link from "next/link";
import { Reveal } from "@/components/ui/Reveal";

/**
 * Honest placeholder where project photos will go: an empty image frame drawn the way
 * architects mark a picture to come (crop marks + diagonals). No stock imagery.
 */
export function SoonNote({ subject, tone = "dark" }: { subject: string; tone?: "dark" | "paper" }) {
  const paper = tone === "paper";
  return (
    <Reveal>
      <div
        className={`relative grid items-center gap-8 border border-dashed p-6 sm:grid-cols-[minmax(0,220px)_1fr] sm:p-8 ${
          paper ? "border-ink/25" : "border-white/20"
        }`}
      >
        <svg
          viewBox="0 0 220 150"
          aria-hidden
          className={`w-full max-w-[220px] ${paper ? "text-accent-deep" : "text-accent"}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
        >
          <path d="M18 18h184v114H18Z" strokeOpacity=".45" />
          <path d="M18 18 202 132M202 18 18 132" strokeOpacity=".3" strokeDasharray="3 4" />
          <path d="M6 18h8M18 6v8M214 18h-8M202 6v8M6 132h8M18 144v-8M214 132h-8M202 144v-8" />
          <circle cx="110" cy="75" r="14" strokeOpacity=".7" />
          <circle cx="110" cy="75" r="6" />
        </svg>
        <div>
          <p className={`eyebrow ${paper ? "text-accent-deep" : "text-accent"}`}>Galerija</p>
          <p className="mt-3 font-display text-2xl font-medium tracking-tight sm:text-3xl">Fotografije realizacija uskoro.</p>
          <p className={`mt-3 max-w-lg text-sm leading-relaxed ${paper ? "text-ink/65" : "text-fg/60"}`}>
            Fotografije {subject} pripremamo za ovu stranicu. Do tada pogledajte{" "}
            <Link
              href="/radovi"
              className={`underline decoration-1 underline-offset-4 ${paper ? "hover:text-ink" : "hover:text-fg"}`}
            >
              naše kuhinje
            </Link>{" "}
            ili nam{" "}
            <Link
              href="/kontakt"
              className={`underline decoration-1 underline-offset-4 ${paper ? "hover:text-ink" : "hover:text-fg"}`}
            >
              opišite svoj prostor
            </Link>
            .
          </p>
        </div>
      </div>
    </Reveal>
  );
}
