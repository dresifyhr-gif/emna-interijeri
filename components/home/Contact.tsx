import type { ReactNode } from "react";
import { telHref, waHref } from "@/lib/site";
import { cityLineOf, getPublicCompany, type CompanySettings } from "@/lib/site-data";
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

function rows(company: CompanySettings): Row[] {
  const { phone, email, whatsapp, address, hours } = company.contact;
  const cityLine = cityLineOf(company);
  const link = "underline decoration-graphite/25 decoration-1 underline-offset-[6px] transition-colors hover:decoration-graphite";
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

/**
 * Kontakt — greige. Real contact details from getPublicCompany() (or visible TODO markers) and the inquiry form on a
 * white card. `data-upit`: the phone contact bar (components/site/ContactBar) steps aside while the form is in view.
 */
export async function Contact() {
  const list = rows(await getPublicCompany());
  return (
    <section id="kontakt" data-upit aria-labelledby="kontakt-naslov" className="cv-auto scroll-mt-16 bg-greige">
      <div className="shell grid gap-12 py-24 sm:py-28 lg:grid-cols-12 lg:gap-10 lg:py-32">
        <div className="lg:col-span-5">
          <Reveal y={12}>
            <Eyebrow>Kontakt</Eyebrow>
          </Reveal>
          <MaskLines
            id="kontakt-naslov"
            lines={[{ text: "Razgovarajmo" }, { text: "o vašoj kuhinji.", accent: true }]}
            className="mt-4 text-[clamp(34px,4.4vw,58px)]"
          />
          <Reveal delay={0.08}>
            <p className="mt-6 max-w-[26rem] text-[15px] leading-relaxed text-taupe sm:text-base">
              Opišite prostor, upišite okvirne mjere ili samo ideju. Javit ćemo vam se i dogovoriti sljedeći korak.
            </p>
          </Reveal>
          {list.length > 0 && (
            <dl className="mt-10 border-t border-hairline">
              {list.map((r, i) => (
                <Reveal key={r.key} delay={0.05 * i} className="grid grid-cols-[7.5rem_1fr] items-baseline gap-4 border-b border-hairline py-4">
                  <dt className="text-[13px] text-taupe">{r.label}</dt>
                  <dd className="min-w-0 text-[16px] leading-snug text-graphite [overflow-wrap:anywhere]">{r.value}</dd>
                </Reveal>
              ))}
            </dl>
          )}
        </div>
        <Reveal delay={0.1} className="lg:col-span-7 lg:col-start-6">
          <div className="rounded-[20px] bg-card p-6 shadow-[0_20px_50px_-20px_rgba(60,48,30,.18)] sm:p-9">
            <ContactForm variant="paper" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
