import type { ReactNode } from "react";
import { site } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { Reveal } from "@/components/ui/Reveal";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";
import { ManifestKota } from "./ManifestKota";

interface Fact {
  key: string;
  value: ReactNode;
  caption: string;
}

function facts(): Fact[] {
  const out: Fact[] = [];
  if (site.facts.projects || showTodos) {
    out.push({
      key: "projects",
      value: <Fill value={site.facts.projects} label="broj realiziranih projekata" />,
      caption: "realiziranih projekata",
    });
  }
  if (site.facts.years || showTodos) {
    out.push({
      key: "years",
      value: <Fill value={site.facts.years} label="godine iskustva" />,
      caption: "godina iskustva",
    });
  }
  out.push({ key: "team", value: "Jedan tim", caption: "od izmjere do montaže" });
  return out;
}

/** 02 · Manifest — paper. One sentence, a dimension line that stretches with the scroll, and only real numbers. */
export function Manifest() {
  const list = facts();
  return (
    <section aria-labelledby="manifest-naslov" className="relative overflow-hidden bg-paper text-ink">
      <div className="shell pb-24 pt-28 sm:pb-32 sm:pt-36 lg:pb-40 lg:pt-48">
        <Reveal y={12}>
          <Eyebrow tone="paper" index="01">
            Po mjeri
          </Eyebrow>
        </Reveal>
        <MaskLines
          id="manifest-naslov"
          lines={[{ text: "Svaki centimetar" }, { text: "je vaš.", accent: true }]}
          accentClass="text-accent-deep"
          className="mt-8 text-[clamp(42px,8.4vw,150px)]"
        />

        <ManifestKota className="mt-16 sm:mt-20 lg:mt-28" />

        <div className="mt-14 grid gap-14 lg:mt-20 lg:grid-cols-12 lg:gap-10">
          <Reveal className="lg:col-span-5">
            <p className="max-w-[34rem] text-lg leading-relaxed text-ink/75 sm:text-xl sm:leading-relaxed">
              Kuhinja po mjeri ne počinje katalogom, nego vašim prostorom. Izmjerimo svaki zid, projektiramo u 3D-u i
              izradimo elemente za točno to mjesto — do zadnjeg centimetra.
            </p>
          </Reveal>

          <dl className={`grid gap-10 sm:gap-8 lg:col-span-7 lg:col-start-6 ${list.length === 3 ? "sm:grid-cols-3" : list.length === 2 ? "sm:grid-cols-2" : ""}`}>
            {list.map((f, i) => (
              <Reveal key={f.key} delay={0.08 * i} className="flex flex-col-reverse border-t border-ink/15 pt-6">
                {/* caption first in the DOM (dt), shown under the number */}
                <dt className="mt-3 text-sm leading-snug text-ink/60">{f.caption}</dt>
                <dd className="font-display text-[clamp(38px,4.2vw,64px)] font-medium leading-none tracking-[-0.03em]">{f.value}</dd>
              </Reveal>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
}
