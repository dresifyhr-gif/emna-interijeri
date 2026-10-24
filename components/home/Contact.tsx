import type { ReactNode } from "react";
import { cityLine, site, telHref, waHref } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { Reveal } from "@/components/ui/Reveal";
import { ContactForm } from "@/components/forms/ContactForm";
import { Eyebrow } from "./Eyebrow";
import { MaskLines } from "./MaskLines";

interface Row {
  key: string;
  label: string;
  value: ReactNode;
}

function rows(): Row[] {
  const { phone, email, whatsapp, address, hours } = site.contact;
  const link = "underline decoration-ink/20 decoration-1 underline-offset-[6px] transition-colors hover:text-accent-deep hover:decoration-accent-deep";
  const out: Row[] = [];
  if (phone || showTodos) {
    out.push({
      key: "phone",
      label: "Telefon",
      value: (
        <Fill value={phone} label="telefon">
          {(v) => (
            <a href={telHref(v)} className={link}>
              {v}
            </a>
          )}
        </Fill>
      ),
    });
  }
  if (email || showTodos) {
    out.push({
      key: "email",
      label: "E-mail",
      value: (
        <Fill value={email} label="e-mail">
          {(v) => (
            <a href={`mailto:${v}`} className={link}>
              {v}
            </a>
          )}
        </Fill>
      ),
    });
  }
  if (whatsapp) {
    out.push({
      key: "whatsapp",
      label: "WhatsApp",
      value: (
        <a href={waHref(whatsapp, "Pozdrav, zanima me kuhinja po mjeri.")} target="_blank" rel="noreferrer" className={link}>
          Pošaljite poruku
        </a>
      ),
    });
  }
  if (address || cityLine || showTodos) {
    out.push({
      key: "address",
      label: "Adresa",
      value: (
        <>
          {(address || showTodos) && (
            <span className="block">
              <Fill value={address} label="adresa radionice / izložbenog prostora" />
            </span>
          )}
          {(cityLine || showTodos) && (
            <span className="block">
              <Fill value={cityLine} label="grad" />
            </span>
          )}
        </>
      ),
    });
  }
  if (hours || showTodos) {
    out.push({ key: "hours", label: "Radno vrijeme", value: <Fill value={hours} label="radno vrijeme" /> });
  }
  return out;
}

/** 07 · Kontakt — paper. Real contact details (or visible TODO markers) and the inquiry form. */
export function Contact() {
  const list = rows();
  return (
    <section id="kontakt" aria-labelledby="kontakt-naslov" className="scroll-mt-20 bg-paper text-ink">
      <div className="shell py-28 sm:py-36 lg:py-48">
        <Reveal y={12}>
          <Eyebrow tone="paper" index="06">
            Kontakt
          </Eyebrow>
        </Reveal>
        <MaskLines
          id="kontakt-naslov"
          lines={[{ text: "Razgovarajmo.", accent: false }]}
          className="mt-8 text-[clamp(38px,10.2vw,170px)]"
        />

        <div className="mt-16 grid gap-16 lg:mt-24 lg:grid-cols-12 lg:gap-10">
          <div className="lg:col-span-4">
            <Reveal>
              <p className="max-w-sm text-lg leading-relaxed text-ink/75">
                Opišite prostor, upišite okvirne mjere ili samo ideju. Javit ćemo vam se i dogovoriti sljedeći korak.
              </p>
            </Reveal>
            <dl className="mt-12 divide-y divide-ink/10 border-y border-ink/10">
              {list.map((r, i) => (
                <Reveal key={r.key} delay={0.06 * i} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-4 py-5">
                  <dt className="eyebrow text-mut-paper">{r.label}</dt>
                  <dd className="min-w-0 font-display text-[19px] font-medium leading-snug tracking-[-0.01em] [overflow-wrap:anywhere] sm:text-xl">
                    {r.value}
                  </dd>
                </Reveal>
              ))}
            </dl>
          </div>
          <Reveal delay={0.1} className="lg:col-span-7 lg:col-start-6">
            <ContactForm variant="paper" />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
