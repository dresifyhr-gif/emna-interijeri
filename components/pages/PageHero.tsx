import type { CSSProperties, ReactNode } from "react";
import { HeroTitle, type TitleLine } from "./HeroTitle";

/** CSS-only entrance (`.hero-fade` in globals.css): visible on the first paint without JS, still with reduced motion. */
const fade = (delay: number, y: number) => ({ animationDelay: `${delay}s`, "--hero-y": `${y}px` }) as CSSProperties;

// sized so the longest single word of each page still fits a 375 px screen
const sizes = {
  /** one long word filling the width ("Razgovarajmo.") */
  fit: "text-[clamp(36px,10.4vw,188px)]",
  lg: "text-[clamp(48px,9.4vw,152px)]",
  md: "text-[clamp(42px,7.4vw,120px)]",
  sm: "text-[clamp(36px,6vw,96px)]",
};

/** Faint blueprint grid used behind dark heroes. */
export function BlueprintGrid({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={`pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,233,.045)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,239,233,.045)_1px,transparent_1px)] bg-[size:72px_72px] [mask-image:radial-gradient(ellipse_80%_70%_at_30%_0%,black,transparent_75%)] ${className}`}
    />
  );
}

/**
 * Dark page opener: eyebrow, huge masked headline, lead + actions.
 * `aside` sits to the right on large screens (drawings), `children` below (photos, extras).
 */
export function PageHero({
  eyebrow,
  lines,
  lead,
  actions,
  aside,
  children,
  size = "lg",
  index,
}: {
  eyebrow: string;
  lines: TitleLine[];
  lead?: ReactNode;
  actions?: ReactNode;
  aside?: ReactNode;
  children?: ReactNode;
  size?: keyof typeof sizes;
  /** small technical index shown next to the eyebrow, e.g. "K—01" */
  index?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-ink pb-16 pt-[136px] sm:pb-20 lg:pb-28 lg:pt-[184px]">
      <BlueprintGrid />
      <div className={`shell relative ${aside ? "grid items-end gap-14 lg:grid-cols-12 lg:gap-10" : ""}`}>
        <div className={aside ? "lg:col-span-7" : ""}>
          <p className="hero-fade eyebrow flex items-center gap-4 text-accent" style={fade(0, 12)}>
            <span aria-hidden className="h-px w-8 bg-accent/70" />
            {eyebrow}
            {index && <span className="text-mut">{index}</span>}
          </p>
          <HeroTitle lines={lines} className={`mt-7 ${sizes[size]}`} />
          {(lead || actions) && (
            <div className={`mt-10 grid gap-8 lg:mt-14 ${aside ? "" : "lg:grid-cols-12 lg:items-end"}`}>
              {lead && (
                <div className={`hero-fade ${aside ? "max-w-xl" : "max-w-xl lg:col-span-6"}`} style={fade(0.35, 28)}>
                  <div className="text-base leading-relaxed text-fg/70 sm:text-lg">{lead}</div>
                </div>
              )}
              {actions && (
                <div
                  className={`hero-fade flex flex-wrap gap-3 ${aside ? "" : "lg:col-span-6 lg:justify-end"}`}
                  style={fade(0.45, 28)}
                >
                  {actions}
                </div>
              )}
            </div>
          )}
        </div>
        {aside && <div className="lg:col-span-5">{aside}</div>}
      </div>
      {children}
    </section>
  );
}
