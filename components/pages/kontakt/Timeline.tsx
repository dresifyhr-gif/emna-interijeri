import { Reveal } from "@/components/ui/Reveal";
import type { Step } from "../ProcessSteps";

/**
 * Compact numbered timeline: vertical with a hairline spine on mobile,
 * horizontal rail with nodes on large screens.
 */
export function Timeline({ steps }: { steps: Step[] }) {
  return (
    <div className="relative">
      {/* rails */}
      <span aria-hidden className="absolute bottom-3 left-[11px] top-3 w-px bg-white/15 lg:hidden" />
      <span aria-hidden className="absolute left-0 right-0 top-[11px] hidden h-px bg-white/15 lg:block" />
      <ol className="relative grid gap-0 lg:grid-cols-5 lg:gap-8">
      {steps.map((s, i) => (
        <Reveal as="li" key={s.title} delay={i * 0.08} className="relative pb-10 pl-12 last:pb-0 lg:pb-0 lg:pl-0 lg:pt-12">
          <span
            aria-hidden
            className="absolute left-0 top-0 flex h-[23px] w-[23px] items-center justify-center rounded-full border border-accent bg-ink"
          >
            <span className="h-[7px] w-[7px] rounded-full bg-accent" />
          </span>
          <p className="eyebrow text-accent">
            <span className="sr-only">Korak </span>
            {String(i + 1).padStart(2, "0")}
          </p>
          <h3 className="mt-3 font-display text-xl font-medium tracking-tight">{s.title}</h3>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-fg/60">{s.text}</p>
        </Reveal>
      ))}
      </ol>
    </div>
  );
}
