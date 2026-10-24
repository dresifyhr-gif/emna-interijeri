import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";

export type Tone = "dark" | "paper";

/** Eyebrow + display heading + optional lead, for both dark and paper sections. */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "dark",
  className = "",
  titleClassName = "",
  as: Tag = "h2",
}: {
  eyebrow: string;
  title: ReactNode;
  lead?: ReactNode;
  tone?: Tone;
  className?: string;
  titleClassName?: string;
  as?: "h2" | "h3";
}) {
  const paper = tone === "paper";
  return (
    <div className={className}>
      <Reveal y={14}>
        <p className={`eyebrow flex items-center gap-4 ${paper ? "text-accent-deep" : "text-accent"}`}>
          <span aria-hidden className={`h-px w-8 ${paper ? "bg-accent-deep/70" : "bg-accent/70"}`} />
          {eyebrow}
        </p>
      </Reveal>
      <Reveal delay={0.08}>
        <Tag className={`display mt-6 text-[clamp(38px,5.6vw,92px)] ${titleClassName}`}>{title}</Tag>
      </Reveal>
      {lead && (
        <Reveal delay={0.16}>
          <div className={`mt-7 max-w-xl text-base leading-relaxed sm:text-lg ${paper ? "text-ink/70" : "text-fg/70"}`}>
            {lead}
          </div>
        </Reveal>
      )}
    </div>
  );
}
