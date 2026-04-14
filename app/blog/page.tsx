"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";
import Link from "next/link";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

const categories = ["Sve", "Proces i suradnja", "Kuhinje", "Ormari i interijeri", "Materijali", "Cijene i rokovi"];

const qna = [
  // ── Proces i suradnja ──
  {
    cat: "Proces i suradnja",
    q: "Kako izgleda suradnja od prvog kontakta do predaje?",
    a: "Proces ide u 5 koraka. Najprije pošaljete upit ili nazovete — javimo se unutar 24h. Zatim dolazimo na besplatno mjerenje i konzultaciju u vašem prostoru. U roku 5 radnih dana primate 3D vizualizaciju i detaljnu ponudu. Nakon potvrde i predujma kreće izrada (4–8 tjedana). Na kraju naš tim dolazi na montažu, a vi preuzimate gotov prostor.",
  },
  {
    cat: "Proces i suradnja",
    q: "Treba li mi arhitekt ili projektant prije nego kontaktiram vas?",
    a: "Ne treba. Mi preuzimamo sve od nule — mjerenje, projektiranje, vizualizacije, dozvole (ako su potrebne) i izvedbu. Ako već imate arhitekta ili dizajnera interijera, rado surađujemo po njihovim podlogama.",
  },
  {
    cat: "Proces i suradnja",
    q: "Radite li turnkey projekte (sve pod jednim krovom)?",
    a: "Da, to je naša specijalizacija. Preuzimamo kompletno opremanje apartmana, kuća, ureda i ordinacija — od tlocrta do posljednjeg detalja. Klient na kraju dobiva gotov prostor, bez koordiniranja više izvođača.",
  },
  {
    cat: "Proces i suradnja",
    q: "Mogu li pratiti napredak izrade?",
    a: "Apsolutno. Svaki klijent ima dodijeljen kontakt koji ga redovito obavještava o statusu projekta. Po dogovoru možete i osobno posjetiti našu proizvodnju te vidjeti kako vaš namještaj nastaje.",
  },
  {
    cat: "Proces i suradnja",
    q: "Radite li s privatnim osobama i tvrtkama?",
    a: "Radimo s oboje — privatnim klijentima (stanovi, kuće) i tvrtkama (uredi, ordinacije, hoteli, restorani). Za poslovne klijente imamo iskustvo s većim i vremenski kritičnim projektima.",
  },

  // ── Kuhinje ──
  {
    cat: "Kuhinje",
    q: "Koji oblici kuhinja su dostupni?",
    a: "Projektiramo sve oblike: ravnu, L-oblik, U-oblik, kuhinju s otokom, poluotvorenu i zatvorenu kuhinju. Svaki projekt je jedinstven i prilagođen konkretnoj prostoriji — nema fiksnih modula ni standardnih mjera.",
  },
  {
    cat: "Kuhinje",
    q: "Što je uključeno u kuhinju po mjeri?",
    a: "Standardno: donji i gornji elementi, radna ploča, odvod, ugradnja bijele tehnike, rasvjeta unutar elemenata i sve potrebne police. Možemo dodati i otoke, stolove, bar stolice, nape i bilo što što prostor zahtijeva.",
  },
  {
    cat: "Kuhinje",
    q: "Ugradbena bijela tehnika — trebam li je kupiti sam ili vi osiguravate?",
    a: "Oboje je moguće. Mi surađujemo s provjerenim dobavljačima (Bosch, Siemens, Neff, Miele) te možemo nabaviti tehniku po povoljnijim cijenama. Ako već imate svoju tehniku ili preferirate drugi brand, mi je jednostavno montiramo.",
  },
  {
    cat: "Kuhinje",
    q: "Kako izgleda radna ploča? Koji su materijali dostupni?",
    a: "Nudimo: keramiku, kvarcit, granit, kompaktni laminat, nerđajući čelik i drvo (hrastova daska). Svaki materijal ima svoje prednosti — keramika je najtvrđa, kvarcit je najzahvalniji za čišćenje, a drvo daje toplinu i prirodan izgled. U showroomu možete opipati sve uzorke.",
  },

  // ── Ormari i interijeri ──
  {
    cat: "Ormari i interijeri",
    q: "Radite li ugradbene ormare i walk-in garderobe?",
    a: "Da, to je jedan od naših najčešćih projekata. Ugradbeni ormari maksimalnog kapaciteta koji iskoriste svaki centimetar prostora — uključujući zakošene stropove, niše i nestandardne oblike. Walk-in garderobe projektiramo prema vašim navikama i kolekciji.",
  },
  {
    cat: "Ormari i interijeri",
    q: "Opremljujete li i dnevne boravke, spavaće sobe i kupaonice?",
    a: "Da. Pored kuhinja i ormara radimo TV-zidove, polica sustave, noćne ormarića, toaletne stolove, biblioteke i sav namještaj po mjeri za bilo koju prostoriju. Kupaonice radimo kao dio turnkey projekata.",
  },
  {
    cat: "Ormari i interijeri",
    q: "Možete li opremiti cijeli apartman odjednom?",
    a: "Upravo to je naša specijalnost. Kompletno opremanje apartmana — od kuhinje, hodnika, dnevnog boravka, spavaćih soba do radne sobe — projektiramo kao jedinstven interijer. Sve je vizualno i funkcionalno usklađeno, a vi imate jednog kontakta za sve.",
  },

  // ── Materijali ──
  {
    cat: "Materijali",
    q: "Koji materijali su dostupni za frontove ormara i kuhinja?",
    a: "Nudimo: MDF mat lakiran (900+ boja RAL/NCS paleta), MDF visokim sjajem, furnir (hrast, orah, jasen, tikovina), termoplastična folija, laminat, staklo i nerđajući čelik. Svaki materijal dolazi u više završnih obrada — glatko, mat, svilenkasto, teksturirano.",
  },
  {
    cat: "Materijali",
    q: "Je li MDF ili drvo bolje za kuhinje?",
    a: "Ovisi o prioritetima. MDF lakiran je otporniji na vlagu i lakše se čisti, dostupan je u beskonačno boja i finiševa, a idealan je za moderan stil. Masivno drvo i furnir daju toplinu i jedinstvenost, ali zahtijevaju malo više njege. U showroomu možete usporediti oba i sami donijeti odluku.",
  },
  {
    cat: "Materijali",
    q: "Koje klase ploče koristite za korpuse?",
    a: "Koristimo E1 i E0 ploče certifikatima (CARB2 / PEFC) s minimalnom emisijom formaldehida — sigurne za ljude i djecu. Za zahtjevne projekte dostupna je i greenpaneer certifikacija.",
  },
  {
    cat: "Materijali",
    q: "Mogu li vidjeti i opipati uzorke prije narudžbe?",
    a: "Svakako. U našem showroomu u Zagrebu imate na raspolaganju stotine uzoraka frontova, radnih ploča, okova i mehanizama. Preporučujemo posjet showroomu kao drugi korak — mnogi klijenti promijene odluku tek kada uzorke vide pod prirodnim svjetlom.",
  },

  // ── Cijene i rokovi ──
  {
    cat: "Cijene i rokovi",
    q: "Koliko košta kuhinja po mjeri?",
    a: "Orijentacijski raspon: manja kuhinja (do 3m) od 4.000–8.000 EUR, srednja L-kuhinja (3–5m) od 8.000–18.000 EUR, veći projekti s otokom ili premium materijalima od 18.000 EUR na više. Cijena ovisi o dimenzijama, materijalima i tehnici. Točnu ponudu dobivate besplatno, bez obveze.",
  },
  {
    cat: "Cijene i rokovi",
    q: "Zašto je kuhinja po mjeri skuplja od IKEA kuhinje?",
    a: "Kuhinja po mjeri koristi stvarne dimenzije vašeg prostora, kvalitetnije materijale i mehanizme, te dulje traje. IKEA kuhinja ima standardne module koji se moraju uklopiti u prostor uz kompromise. Naši klijenti redovito izvještavaju da su, s dugoročnog gledišta, zadovoljniji investicijom u mjeru.",
  },
  {
    cat: "Cijene i rokovi",
    q: "Koliko traje izrada?",
    a: "Standardna kuhinja ili ormar: 4–6 tjedana od potvrde i predujma. Kompletan interijer apartmana: 6–10 tjedana. Veći poslovni projekti: po dogovoru. Montaža traje 1–3 radna dana.",
  },
  {
    cat: "Cijene i rokovi",
    q: "Kako funkcionira plaćanje?",
    a: "Standardna dinamika: 30% predujam pri potvrdi narudžbe, 40% pri završetku izrade (prije isporuke), 30% po završenoj montaži. Za veće projekte možemo dogovoriti prilagođenu dinamiku. Prihvaćamo gotovinu, kartice i bankovna plaćanja.",
  },
  {
    cat: "Cijene i rokovi",
    q: "Postoji li jamstvo na radove?",
    a: "Da. Dajemo 5 godina jamstva na naše radove i montažu. Materijali i okovi dolaze s jamstvima proizvođača (10–15 godina za korpuse, 2–5 godina za mehanizme Blum/Hettich). Sve reklamacije rješavamo u roku 14 dana od prijave.",
  },
];

function FaqItem({ item, isOpen, onToggle }: { item: typeof qna[0]; isOpen: boolean; onToggle: () => void }) {
  return (
    <div className="border-b border-stone-200 last:border-0">
      <button
        onClick={onToggle}
        className="w-full text-left py-6 flex items-start justify-between gap-6 group"
      >
        <span className={`font-light text-base leading-snug transition-colors duration-200 pr-2 ${isOpen ? "text-brand-black" : "text-brand-dark group-hover:text-brand-black"}`}>
          {item.q}
        </span>
        <span className={`flex-shrink-0 w-6 h-6 border rounded-full flex items-center justify-center transition-all duration-300 mt-0.5 ${isOpen ? "border-brand-black bg-brand-black" : "border-stone-300 group-hover:border-stone-500"}`}>
          <svg width="9" height="9" viewBox="0 0 10 10" fill="none" className={`transition-transform duration-300 ${isOpen ? "rotate-45" : ""}`}>
            <path d="M5 1v8M1 5h8" stroke={isOpen ? "white" : "#9ca3af"} strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="answer"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <p className="pb-6 text-stone-500 font-light text-sm leading-relaxed max-w-2xl">
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function QnaPage() {
  const [activeCategory, setActiveCategory] = useState("Sve");
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const qnaRef = { current: null as HTMLElement | null };

  const filtered = activeCategory === "Sve" ? qna : qna.filter((q) => q.cat === activeCategory);

  function selectCategory(cat: string) {
    setActiveCategory(cat);
    setOpenIndex(null);
    // Small delay to let state update, then scroll to Q&A section
    setTimeout(() => {
      const el = document.getElementById('qna-section');
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
  }

  return (
    <>
      <Header />
      <main className="bg-white min-h-screen">

        {/* ── Hero ── */}
        <section className="relative min-h-[52vh] flex items-end pb-16 pt-32">
          <Image src="/kuhinja-3.png" alt="Q&A" fill className="object-cover" priority />
          <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/60 to-black/88" />
          <div className="relative max-w-5xl mx-auto px-6 lg:px-8 w-full">
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="text-accent text-[10px] tracking-[0.45em] uppercase font-light mb-4 flex items-center gap-3"
            >
              <span className="w-5 h-px bg-accent" />
              Pitanja i odgovori
            </motion.p>
            <motion.h1
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.1 }}
              className="font-serif text-5xl lg:text-7xl font-light text-white leading-tight"
            >
              Sve što ste<br />
              <span className="text-accent">htjeli znati.</span>
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.25 }}
              className="mt-6 text-white/50 font-light text-base max-w-lg leading-relaxed"
            >
              {qna.length} odgovora na najčešća pitanja o procesu, materijalima, cijenama i rokovima.
            </motion.p>
          </div>
        </section>

        {/* ── Category tabs ── */}
        <div className="sticky top-16 z-30 bg-white border-b border-stone-100 shadow-sm">
          <div className="max-w-5xl mx-auto px-6 lg:px-8">
            <div className="flex gap-0 overflow-x-auto scrollbar-hide">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => selectCategory(cat)}
                  className={`flex-shrink-0 px-5 py-4 text-xs tracking-[0.18em] uppercase font-light border-b-2 transition-all duration-200 ${
                    activeCategory === cat
                      ? "border-brand-black text-brand-black"
                      : "border-transparent text-stone-400 hover:text-stone-700"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* ── Q&A list ── */}
        <section id="qna-section" className="max-w-5xl mx-auto px-6 lg:px-8 py-20">
          <div className="grid lg:grid-cols-[240px_1fr] gap-16 items-start">

            {/* Sidebar — category counts */}
            <div className="hidden lg:block sticky top-36">
              <p className="text-[9px] tracking-[0.35em] text-stone-400 uppercase font-light mb-5">Kategorije</p>
              <ul className="space-y-1">
                {categories.map((cat) => {
                  const count = cat === "Sve" ? qna.length : qna.filter((q) => q.cat === cat).length;
                  return (
                    <li key={cat}>
                      <button
                        onClick={() => selectCategory(cat)}
                        className={`w-full text-left flex items-center justify-between py-2 text-sm font-light transition-colors duration-200 ${
                          activeCategory === cat ? "text-brand-black" : "text-stone-400 hover:text-brand-dark"
                        }`}
                      >
                        <span>{cat}</span>
                        <span className={`text-xs tabular-nums ${activeCategory === cat ? "text-accent" : "text-stone-300"}`}>
                          {count}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>

              <div className="mt-12 pt-8 border-t border-stone-100">
                <p className="text-sm font-light text-stone-500 leading-relaxed mb-5">
                  Ne vidite odgovor<br />koji tražite?
                </p>
                <Link
                  href="/kontakt"
                  className="inline-flex items-center gap-2 text-xs tracking-[0.18em] uppercase border border-brand-black text-brand-black px-5 py-2.5 hover:bg-brand-black hover:text-white transition-all duration-300"
                >
                  Pitajte nas
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                </Link>
              </div>
            </div>

            {/* Questions */}
            <div>
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeCategory}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.25 }}
                >
                  {/* Category heading */}
                  {activeCategory !== "Sve" && (
                    <div className="flex items-center gap-3 mb-8">
                      <div className="w-5 h-px bg-accent" />
                      <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">{activeCategory}</span>
                    </div>
                  )}

                  <div>
                    {filtered.map((item, i) => (
                      <motion.div
                        key={`${activeCategory}-${i}`}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.3, delay: i * 0.04 }}
                      >
                        <FaqItem
                          item={item}
                          isOpen={openIndex === i}
                          onToggle={() => setOpenIndex(openIndex === i ? null : i)}
                        />
                      </motion.div>
                    ))}
                  </div>

                  {/* Mobile contact CTA */}
                  <div className="lg:hidden mt-12 pt-8 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <p className="text-stone-500 font-light text-sm">Ne vidite odgovor koji tražite?</p>
                    <Link
                      href="/kontakt"
                      className="inline-flex items-center gap-2 text-xs tracking-[0.18em] uppercase border border-brand-black text-brand-black px-6 py-3 hover:bg-brand-black hover:text-white transition-all duration-300"
                    >
                      Pitajte nas →
                    </Link>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>

          </div>
        </section>

        {/* ── Bottom CTA ── */}
        <section className="bg-brand-black py-20 px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
            className="max-w-3xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-8"
          >
            <div>
              <p className="text-accent text-[10px] tracking-[0.38em] uppercase font-light mb-3">Sljedeći korak</p>
              <h2 className="font-serif text-3xl font-light text-white leading-tight">
                Spremni za konzultaciju?
              </h2>
              <p className="text-white/40 font-light text-sm mt-2 leading-relaxed max-w-sm">
                Besplatno mjerenje i 3D vizualizacija bez ikakve obveze.
              </p>
            </div>
            <div className="flex gap-3 flex-shrink-0">
              <Link
                href="/kontakt"
                className="inline-flex items-center gap-2 bg-white text-brand-black text-xs tracking-[0.18em] uppercase px-7 py-3.5 hover:bg-accent hover:text-white transition-all duration-300"
              >
                Zatraži ponudu
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </Link>
            </div>
          </motion.div>
        </section>

      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
