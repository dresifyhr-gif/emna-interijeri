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
 * Closing section on paper: a heading and two large link panels (usually 3D studio + upit).
 * The first panel is the primary one (inked).
 */
export function CtaPair({
  eyebrow,
  title,
  items,
  id,
}: {
  eyebrow: string;
  title: ReactNode;
  items: [CtaItem, CtaItem];
  id?: string;
}) {
  return (
    <section id={id} className="bg-paper py-24 text-ink lg:py-36">
      <div className="shell">
        <SectionHead eyebrow={eyebrow} title={title} tone="paper" />
        <div className="mt-14 grid gap-4 lg:mt-20 lg:grid-cols-2">
          {items.map((item, i) => {
            const primary = i === 0;
            return (
              <Reveal key={item.href} delay={i * 0.1}>
                <Link
                  href={item.href}
                  className={`group relative flex min-h-[300px] flex-col justify-between overflow-hidden p-8 transition-colors duration-500 ease-premium sm:p-10 lg:min-h-[360px] ${
                    primary
                      ? "bg-ink text-fg hover:bg-ink-700"
                      : "border border-ink/20 text-ink hover:border-ink hover:bg-paper-dark"
                  }`}
                >
                  <span className={`eyebrow ${primary ? "text-accent" : "text-accent-deep"}`}>{item.kicker}</span>
                  <span className="mt-12 block">
                    <span className="display block text-[clamp(32px,3.6vw,56px)]">{item.title}</span>
                    <span className={`mt-5 block max-w-md text-[15px] leading-relaxed ${primary ? "text-fg/65" : "text-ink/65"}`}>
                      {item.text}
                    </span>
                  </span>
                  <span
                    aria-hidden
                    className={`absolute right-8 top-8 flex h-12 w-12 items-center justify-center rounded-full border transition-all duration-500 ease-premium sm:right-10 sm:top-10 ${
                      primary
                        ? "border-white/20 group-hover:border-accent group-hover:bg-accent group-hover:text-ink"
                        : "border-ink/25 group-hover:border-ink group-hover:bg-ink group-hover:text-paper"
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
