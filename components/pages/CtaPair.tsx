import Link from "next/link";
import type { ReactNode } from "react";
import { Arrow } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { SectionHead } from "./SectionHead";

export type CtaItem = {
  href: string;
  kicker: string;
  title: string;
  text: string;
};

/**
 * Closing section: a heading and two large link cards (usually 3D studio + upit).
 * The first card is the primary one (graphite), the second a white card. `bg` alternates with the section before it.
 */
export function CtaPair({
  eyebrow,
  title,
  items,
  id,
  bg = "greige",
}: {
  eyebrow: string;
  title: ReactNode;
  items: [CtaItem, CtaItem];
  id?: string;
  bg?: "greige" | "canvas";
}) {
  return (
    <section id={id} className={`py-24 lg:py-32 ${bg === "canvas" ? "bg-canvas" : "bg-greige"}`}>
      <div className="shell">
        <SectionHead eyebrow={eyebrow} title={title} />
        <div className="mt-10 grid gap-4 lg:mt-14 lg:grid-cols-2">
          {items.map((item, i) => {
            const primary = i === 0;
            return (
              <Reveal key={item.href} delay={i * 0.1}>
                <Link
                  href={item.href}
                  className={`group relative flex min-h-[280px] flex-col justify-between overflow-hidden rounded-[20px] p-7 transition-[background-color,box-shadow,border-color] duration-500 ease-premium sm:p-9 lg:min-h-[320px] ${
                    primary
                      ? "bg-graphite text-fg hover:bg-black"
                      : "border border-hairline bg-card text-graphite hover:border-graphite/30 hover:shadow-[0_20px_50px_-24px_rgba(60,48,30,.25)]"
                  }`}
                >
                  <span className={`kicker ${primary ? "text-accent" : "text-taupe"}`}>{item.kicker}</span>
                  <span className="mt-10 block">
                    <span className="heading block text-[clamp(28px,3vw,42px)]">{item.title}</span>
                    <span className={`mt-4 block max-w-md text-[15px] leading-relaxed ${primary ? "text-fg/70" : "text-taupe"}`}>
                      {item.text}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`absolute right-7 top-7 flex h-11 w-11 items-center justify-center rounded-full border transition-colors duration-500 ease-premium sm:right-9 sm:top-9 ${
                      primary
                        ? "border-white/20 group-hover:border-fg group-hover:bg-fg group-hover:text-graphite"
                        : "border-graphite/20 group-hover:border-graphite group-hover:bg-graphite group-hover:text-white"
                    }`}
                  >
                    <Arrow />
                  </span>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
