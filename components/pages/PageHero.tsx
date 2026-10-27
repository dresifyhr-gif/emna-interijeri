import type { CSSProperties, ReactNode } from "react";
import { HeroTitle, type TitleLine } from "./HeroTitle";

/** CSS-only entrance (`.hero-fade` in globals.css): visible on the first paint without JS, still with reduced motion. */
const fade = (delay: number, y: number) => ({ animationDelay: `${delay}s`, "--hero-y": `${y}px` }) as CSSProperties;

// sized so the longest single word of each page still fits a 375 px screen
const sizes = {
  /** one long word filling the width ("Razgovarajmo.") */
  fit: "text-[clamp(44px,11.6vw,136px)]",
  lg: "text-[clamp(42px,6.6vw,96px)]",
  md: "text-[clamp(40px,6vw,88px)]",
  sm: "text-[clamp(36px,5vw,72px)]",
};

/**
 * Light page opener: small caps label, big sentence-case headline (second line in taupe), lead + actions.
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
  /** small index shown next to the label, e.g. "K—01" */
  index?: string;
}) {
  return (
    <section className="relative overflow-hidden bg-canvas pb-14 pt-[124px] sm:pb-16 lg:pb-20 lg:pt-[164px]">
      <div className={`shell relative ${aside ? "grid items-end gap-12 lg:grid-cols-12 lg:gap-10" : ""}`}>
        <div className={aside ? "lg:col-span-7" : ""}>
          <p className="hero-fade kicker flex items-center gap-3 text-taupe" style={fade(0, 12)}>
            {eyebrow}
            {index && <span className="text-taupe/70">{index}</span>}
          </p>
          <HeroTitle lines={lines} className={`mt-5 ${sizes[size]}`} />
          {(lead || actions) && (
            <div className={`mt-8 grid gap-7 lg:mt-10 ${aside ? "" : "lg:grid-cols-12 lg:items-end"}`}>
              {lead && (
                <div className={`hero-fade ${aside ? "max-w-xl" : "max-w-xl lg:col-span-6"}`} style={fade(0.3, 20)}>
                  <div className="text-base leading-relaxed text-taupe sm:text-[17px] sm:leading-[1.65]">{lead}</div>
                </div>
              )}
              {actions && (
                <div
                  className={`hero-fade flex flex-wrap items-center gap-x-5 gap-y-3 ${aside ? "" : "lg:col-span-6 lg:justify-end"}`}
                  style={fade(0.4, 20)}
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
