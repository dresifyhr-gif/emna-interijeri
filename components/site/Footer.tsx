import Link from "next/link";
import { cityLine, nav, site, telHref } from "@/lib/site";
import { Fill, showTodos } from "./Fill";
import { Wordmark } from "./Wordmark";
import { FooterCta } from "./FooterCta";

export function Footer() {
  const { contact, legal, social } = site;
  // company data rows: only facts that exist (or "upisati" markers in development) — never a dangling "OIB:"
  const companyRows = [
    { key: "name", value: legal.companyName, label: "puni naziv tvrtke", prefix: null, muted: false },
    { key: "oib", value: legal.oib, label: "OIB", prefix: "OIB: ", muted: false },
    { key: "seat", value: legal.seat, label: "sjedište", prefix: null, muted: false },
    { key: "registry", value: legal.registry, label: "sudski registar / MBS", prefix: null, muted: true },
  ].filter((r) => r.value || showTodos);
  return (
    <footer data-header="dark" data-tone="dark" className="relative overflow-hidden bg-night-deep text-fg">
      <FooterCta />

      <div className={`shell grid gap-12 py-16 sm:grid-cols-2 ${companyRows.length ? "lg:grid-cols-4" : "lg:grid-cols-3"}`}>
        <div>
          <Wordmark />
          <p className="mt-6 max-w-xs text-sm leading-relaxed text-fg/60">{site.tagline}. Izmjera, 3D projekt, izrada i montaža.</p>
        </div>

        <div>
          <p className="kicker text-mut">Stranice</p>
          <ul className="mt-5 space-y-2.5 text-sm">
            {nav.map((n) => (
              <li key={n.href}>
                <Link href={n.href} className="text-fg/75 transition-colors hover:text-fg">
                  {n.label}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/pitanja" className="text-fg/75 transition-colors hover:text-fg">
                Česta pitanja
              </Link>
            </li>
          </ul>
        </div>

        <div>
          <p className="kicker text-mut">Kontakt</p>
          <ul className="mt-5 space-y-2.5 text-sm text-fg/75">
            {(contact.phone || showTodos) && (
              <li>
                <Fill value={contact.phone} label="telefon">
                  {(v) => (
                    <a href={telHref(v)} className="transition-colors hover:text-fg">
                      {v}
                    </a>
                  )}
                </Fill>
              </li>
            )}
            {(contact.email || showTodos) && (
              <li>
                <Fill value={contact.email} label="e-mail">
                  {(v) => (
                    <a href={`mailto:${v}`} className="transition-colors hover:text-fg">
                      {v}
                    </a>
                  )}
                </Fill>
              </li>
            )}
            {(contact.address || cityLine || showTodos) && (
              <li>
                {(contact.address || showTodos) && <Fill value={contact.address} label="adresa" />}
                {(cityLine || showTodos) && (
                  <span className="block text-mut">
                    <Fill value={cityLine} label="grad" />
                  </span>
                )}
              </li>
            )}
            {(contact.hours || showTodos) && (
              <li className="text-mut">
                <Fill value={contact.hours} label="radno vrijeme" />
              </li>
            )}
            <li>
              <Link href="/kontakt" className="text-fg underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-fg">
                Pošaljite upit
              </Link>
            </li>
          </ul>
          {(social.instagram || social.facebook) && (
            <div className="mt-6 flex gap-5 text-[13px] text-fg/75">
              {social.instagram && (
                <a href={social.instagram} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">
                  Instagram
                </a>
              )}
              {social.facebook && (
                <a href={social.facebook} target="_blank" rel="noreferrer" className="transition-colors hover:text-fg">
                  Facebook
                </a>
              )}
            </div>
          )}
        </div>

        {companyRows.length > 0 && (
          <div>
            <p className="kicker text-mut">Tvrtka</p>
            <ul className="mt-5 space-y-2.5 text-sm text-fg/75">
              {companyRows.map((r) => (
                <li key={r.key} className={r.muted ? "text-mut" : undefined}>
                  {r.prefix}
                  <Fill value={r.value} label={r.label} />
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="shell flex flex-col justify-between gap-4 border-t border-white/[0.08] py-8 text-xs text-mut sm:flex-row">
        <p>
          © {new Date().getFullYear()} {legal.companyName ?? site.name}. Sva prava pridržana.
        </p>
        <div className="flex gap-6">
          <Link href="/privatnost" className="transition-colors hover:text-fg">
            Politika privatnosti
          </Link>
          <Link href="/pitanja" className="transition-colors hover:text-fg">
            Česta pitanja
          </Link>
        </div>
      </div>
    </footer>
  );
}
