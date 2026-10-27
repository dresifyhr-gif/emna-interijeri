import type { ReactNode } from "react";
import { telHref, waHref } from "@/lib/site";
import { cityLineOf, type CompanySettings } from "@/lib/site-data";
import { Fill, showTodos } from "@/components/site/Fill";
import { Reveal } from "@/components/ui/Reveal";

type Row = { label: string; value: string | null; todo: string; render: (v: string) => ReactNode };

const linkCls = "underline decoration-graphite/25 decoration-1 underline-offset-[6px] transition-colors hover:decoration-graphite";

/**
 * Contact facts from getPublicCompany() (admin values over lib/site.ts). Rows whose value is unknown are hidden in
 * production and shown as "upisati …" markers in development. Nothing is invented.
 */
export function ContactDetails({ company }: { company: CompanySettings }) {
  const { contact } = company;
  const cityLine = cityLineOf(company);

  const rows: Row[] = [
    {
      label: "Telefon",
      value: contact.phone,
      todo: "telefon",
      render: (v) => (
        <a href={telHref(v)} className={`heading text-[clamp(26px,2.6vw,34px)] ${linkCls}`}>
          {v}
        </a>
      ),
    },
    {
      label: "WhatsApp",
      value: contact.whatsapp,
      todo: "WhatsApp broj",
      render: (v) => (
        <a
          href={waHref(v, "Pozdrav, zanima me namještaj po mjeri.")}
          target="_blank"
          rel="noreferrer"
          className={linkCls}
        >
          Pošaljite poruku<span className="sr-only"> (otvara WhatsApp u novoj kartici)</span> ↗
        </a>
      ),
    },
    {
      label: "E-mail",
      value: contact.email,
      todo: "e-mail",
      render: (v) => (
        <a href={`mailto:${v}`} className={`break-all ${linkCls}`}>
          {v}
        </a>
      ),
    },
    {
      label: "Radno vrijeme",
      value: contact.hours,
      todo: "radno vrijeme",
      render: (v) => v,
    },
  ];

  const visible = rows.filter((r) => r.value || showTodos);
  // the address row only when there is something to show: never a lone "Hrvatska"
  const showAddress = Boolean(contact.address || cityLine || contact.mapUrl || showTodos);

  return (
    <dl className="border-t border-hairline">
      {visible.map((r, i) => (
        <Reveal key={r.label} delay={i * 0.05} className="border-b border-hairline py-5">
          <dt className="text-[13px] text-taupe">{r.label}</dt>
          <dd className="mt-1.5 text-[17px] text-graphite">
            {r.value ? r.render(r.value) : <Fill value={null} label={r.todo} />}
          </dd>
        </Reveal>
      ))}

      {showAddress && (
        <Reveal delay={visible.length * 0.05} className="border-b border-hairline py-5">
          <dt className="text-[13px] text-taupe">Adresa</dt>
          <dd className="mt-1.5 text-[17px] leading-relaxed text-graphite">
            {(contact.address || showTodos) && (
              <span className="block">
                <Fill value={contact.address} label="adresa" />
              </span>
            )}
            {(cityLine || showTodos) && (
              <span className="block">
                <Fill value={cityLine} label="grad" />
              </span>
            )}
            {contact.mapUrl && (
              <a
                href={contact.mapUrl}
                target="_blank"
                rel="noreferrer"
                className={`mt-3 block w-fit text-[13.5px] font-medium ${linkCls}`}
              >
                Otvori na karti<span className="sr-only"> (nova kartica)</span> ↗
              </a>
            )}
          </dd>
        </Reveal>
      )}
    </dl>
  );
}
