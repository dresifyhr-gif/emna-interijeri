import Link from "next/link";
import Image from "next/image";

const navLinks = [
  { label: "Interijeri", href: "/interijeri" },
  { label: "Kuhinje", href: "/kuhinje" },
  { label: "Ormari", href: "/ormari" },
  { label: "O nama", href: "/o-nama" },
  { label: "Pitanja", href: "/blog" },
  { label: "Kontakt", href: "/kontakt" },
];

const serviceLinks = [
  "Kompletni interijeri",
  "Kuhinje po mjeri",
  "Ormari i garderobe",
  "Spavaće sobe",
  "Poslovni prostori",
];

export default function Footer() {
  return (
    <footer className="bg-brand-black border-t border-white/10 pt-16 pb-8">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* 4-col grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-12 mb-16">
          {/* Col 1 — Brand */}
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/emna-logo-bijeli.png"
              alt="EMNA Interijeri"
              className="h-20 w-auto object-contain"
            />
            <p className="text-white/30 text-sm mt-4 font-light">
              Kompletno opremanje interijera
            </p>

            {/* Social icons */}
            <div className="flex gap-4 mt-6">
              {/* Instagram */}
              <a
                href="#"
                aria-label="Instagram"
                className="text-white/30 hover:text-white transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <rect
                    x="1.5"
                    y="1.5"
                    width="15"
                    height="15"
                    rx="4"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <circle
                    cx="9"
                    cy="9"
                    r="3.5"
                    stroke="currentColor"
                    strokeWidth="1.4"
                  />
                  <circle cx="13" cy="5" r="0.8" fill="currentColor" />
                </svg>
              </a>

              {/* Facebook */}
              <a
                href="#"
                aria-label="Facebook"
                className="text-white/30 hover:text-white transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M12 2h-2a3 3 0 00-3 3v2H5v3h2v6h3v-6h2l1-3h-3V5a1 1 0 011-1h2V2z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>

              {/* Houzz */}
              <a
                href="#"
                aria-label="Houzz"
                className="text-white/30 hover:text-white transition-colors"
              >
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path
                    d="M3 2v14h5v-6h4v6h3V8L9 4 3 2z"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinejoin="round"
                  />
                </svg>
              </a>
            </div>
          </div>

          {/* Col 2 — Navigacija */}
          <div>
            <p className="text-white/30 text-xs tracking-widest uppercase mb-4">
              Navigacija
            </p>
            <ul className="space-y-0.5">
              {navLinks.map((link) => (
                <li key={link.label}>
                  <Link
                    href={link.href}
                    className="text-white/50 hover:text-white text-sm font-light py-1 block transition-colors"
                  >
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 3 — Usluge */}
          <div>
            <p className="text-white/30 text-xs tracking-widest uppercase mb-4">
              Usluge
            </p>
            <ul className="space-y-0.5">
              {serviceLinks.map((link) => (
                <li key={link}>
                  <span className="text-white/50 text-sm font-light py-1 block">
                    {link}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* Col 4 — Kontakt */}
          <div>
            <p className="text-white/30 text-xs tracking-widest uppercase mb-4">
              Kontakt
            </p>
            <ul className="space-y-2">
              <li className="flex items-center gap-2 text-white/50 text-sm font-light">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="flex-shrink-0">
                  <rect x="1" y="2.5" width="11" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1 2.5l5.5 4.5L12 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                info@emnainterijeri.hr
              </li>
              <li className="flex items-center gap-2 text-white/50 text-sm font-light">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="flex-shrink-0">
                  <path d="M2 2h2.5l1 3-1.5 1.5A6.5 6.5 0 007.5 9.5L9 8l3 1v2.5A1 1 0 0111 12.5C5 12.5.5 8 .5 2A1 1 0 012 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
                </svg>
                +385 xx xxx xxxx
              </li>
              <li className="flex items-center gap-2 text-white/50 text-sm font-light">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="flex-shrink-0">
                  <circle cx="6.5" cy="5" r="2" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.5 1a4 4 0 014 4c0 3-4 7-4 7S2.5 8 2.5 5a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.2" />
                </svg>
                Zagreb, Hrvatska
              </li>
              <li className="flex items-center gap-2 text-white/50 text-sm font-light">
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none" className="flex-shrink-0">
                  <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M6.5 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Pon–Pet 08:00–17:00
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom strip */}
        <div className="border-t border-white/10 pt-8 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-white/20 text-xs">
            © 2026 EMNA Interijeri. Sva prava pridržana.
          </p>
          <p className="text-white/20 text-xs">
            Dizajnirano s pažnjom prema detaljima.
          </p>
        </div>
      </div>
    </footer>
  );
}
