import type { ReactNode } from "react";
import { Reveal } from "@/components/ui/Reveal";

export type Tone = "light" | "dark";

/**
 * Label + heading + optional lead. Headings are `.heading` (Inter Tight, sentence case); emphasise the second half
 * with colour only: <span className="text-taupe"> on light, <span className="text-accent"> on dark.
 */
export function SectionHead({
  eyebrow,
  title,
  lead,
  tone = "light",
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
  const dark = tone === "dark";
  return (
    <div className={className}>
      <Reveal y={14}>
        <p className={`kicker ${dark ? "text-accent" : "text-taupe"}`}>{eyebrow}</p>
      </Reveal>
      <Reveal delay={0.08}>
        <Tag className={`heading mt-4 text-[clamp(32px,4.2vw,56px)] ${titleClassName}`}>{title}</Tag>
      </Reveal>
      {lead && (
        <Reveal delay={0.16}>
          <div className={`mt-5 max-w-xl text-[15px] leading-relaxed sm:text-base ${dark ? "text-fg/70" : "text-taupe"}`}>{lead}</div>
        </Reveal>
      )}
    </div>
  );
}
