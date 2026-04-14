"use client";

import { useState } from "react";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

interface FormData {
  name: string;
  phone: string;
  email: string;
  space: string;
  note: string;
}

const faqs = [
  {
    q: "Kako izgleda proces od upita do montaže?",
    a: "Proces ide u 5 koraka: (1) Pošaljete upit ili nazovete — odgovaramo unutar 24h. (2) Dolazimo na besplatno mjerenje i konzultaciju. (3) U roku 5 radnih dana primate 3D vizualizaciju i detaljnu ponudu. (4) Nakon potvrde, izrada traje 4–8 tjedana ovisno o opsegu. (5) Montažu izvodi naš tim, a predajemo vam gotov prostor.",
  },
  {
    q: "Koliko košta konzultacija i mjerenje?",
    a: "Konzultacija i mjerenje su potpuno besplatni, bez obveze. Ponudu dobivate bez ikakvih pretplata ili skrivenih naknada — samo ako se odlučite za suradnju, dogovaramo uvjete.",
  },
  {
    q: "Radite li samo kuhinje ili i ostale prostore?",
    a: "Opremamo kompletne prostore — kuhinje, ormari i garderobe, spavaće sobe, dnevni boravci, poslovni prostori, ordinacije i uredi. Radimo i turnkey projekte gdje preuzimamo kompletno opremanje od prvog razgovora do predaje ključa.",
  },
  {
    q: "Koliko traje izrada i montaža?",
    a: "Standardna kuhinja ili ormar: 4–6 tjedana od potvrde narudžbe. Kompletan interijer apartmana: 6–10 tjedana. Poslovni prostori: po dogovoru. Montaža traje 1–3 dana ovisno o kompleksnosti projekta.",
  },
  {
    q: "Radite li po cijeloj Hrvatskoj?",
    a: "Da — montiramo na cijelom području Hrvatske. Imamo vlastiti tim majstora koji putuje s projektima. Za inozemne projekte (Slovenija, BiH, Austrija) kontaktirajte nas direktno za informacije o dostupnosti.",
  },
  {
    q: "Dajete li jamstvo na radove i materijale?",
    a: "Da. Dajemo 5 godina jamstva na naše radove i ugradnju. Materijali dolaze s jamstvima proizvođača (tipično 10–15 godina za korpuse, 2–5 godina za mehanizme). Svi naši partneri imaju EU certifikate.",
  },
  {
    q: "Mogu li vidjeti uzorke materijala prije narudžbe?",
    a: "Apsolutno — u showroomu imate na raspolaganju stotine uzoraka materijala, boja i završnih obrada koje možete opipati i usporediti u stvarnim uvjetima. Preporučujemo posjet showroomu kao drugi korak nakon prvog kontakta.",
  },
  {
    q: "Kako plaćanje funkcionira?",
    a: "Standardno: 30% predujam pri potvrdi narudžbe, 40% pri završetku izrade (prije montaže), 30% pri predaji. Za veće projekte možemo dogovoriti prilagođene uvjete plaćanja. Prihvaćamo sve uobičajene načine plaćanja.",
  },
];

export default function KontaktPage() {
  const [form, setForm] = useState<FormData>({
    name: "",
    phone: "",
    email: "",
    space: "",
    note: "",
  });
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) {
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const subject = encodeURIComponent(`Upit — ${form.name}`);
    const body = encodeURIComponent(
      `Ime i prezime: ${form.name}\nTelefon: ${form.phone}\nEmail: ${form.email}\nProstor: ${form.space}\n\nNapomena:\n${form.note}`
    );
    window.location.href = `mailto:info@emnainterijeri.hr?subject=${subject}&body=${body}`;
    setSubmitted(true);
  }

  const inputClass =
    "border border-stone-200 w-full px-4 py-3.5 text-sm focus:outline-none focus:border-brand-black transition-colors font-sans bg-white text-brand-dark placeholder:text-stone-300";

  return (
    <main>
      <Header />

      {/* ── Hero ── */}
      <section className="relative min-h-[55vh] flex items-end pb-16 pt-32">
        <Image
          src="/kuhinja-6.png"
          alt="Kontakt — EMNA Interijeri"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/60 to-black/85" />

        <div className="relative max-w-6xl mx-auto px-6 lg:px-8 w-full">
          <motion.p
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-accent text-[10px] tracking-[0.45em] uppercase font-light mb-4 flex items-center gap-3"
          >
            <span className="w-5 h-px bg-accent" />
            Kontakt
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-5xl lg:text-7xl font-light text-white leading-tight max-w-2xl"
          >
            Razgovarajmo
            <br />
            <span className="text-accent">o vašem interijeru.</span>
          </motion.h1>
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.25 }}
            className="flex flex-wrap gap-6 mt-8 text-white/50 text-xs tracking-wider font-light"
          >
            {["Besplatna konzultacija", "Ponuda za 24h", "Bez obveze"].map((item) => (
              <span key={item} className="flex items-center gap-2">
                <span className="w-1 h-1 rounded-full bg-accent" />
                {item}
              </span>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ── Form + Info ── */}
      <section className="bg-white py-24">
        <div className="max-w-6xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-[1fr_380px] gap-16 items-start">

            {/* Left: Form */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6 }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="w-5 h-px bg-accent" />
                <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Upit</span>
              </div>
              <h2 className="font-serif text-3xl lg:text-4xl font-light text-brand-black mb-10">
                Pošaljite nam upit
              </h2>

              {submitted ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.97 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className="border border-stone-100 p-12 text-center bg-stone-50"
                >
                  <div className="w-10 h-px bg-accent mx-auto mb-6" />
                  <h3 className="font-serif text-2xl font-light text-brand-black mb-3">Hvala na upitu!</h3>
                  <p className="text-stone-500 font-light text-sm leading-relaxed max-w-sm mx-auto">
                    Otvorili smo vaš email klijent s predpopunjenom porukom. Pošaljite je i javit ćemo se unutar 24 sata.
                  </p>
                  <button
                    onClick={() => setSubmitted(false)}
                    className="mt-8 text-xs tracking-widest text-stone-400 hover:text-brand-black transition-colors uppercase font-light"
                  >
                    ← Novi upit
                  </button>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid sm:grid-cols-2 gap-5">
                    <div>
                      <label className="block text-[10px] tracking-[0.2em] text-stone-400 uppercase mb-2 font-light">
                        Ime i prezime <span className="text-accent">*</span>
                      </label>
                      <input
                        type="text"
                        name="name"
                        required
                        value={form.name}
                        onChange={handleChange}
                        placeholder="Ana Horvat"
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] tracking-[0.2em] text-stone-400 uppercase mb-2 font-light">
                        Telefon <span className="text-accent">*</span>
                      </label>
                      <input
                        type="tel"
                        name="phone"
                        required
                        value={form.phone}
                        onChange={handleChange}
                        placeholder="+385 91 234 5678"
                        className={inputClass}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] tracking-[0.2em] text-stone-400 uppercase mb-2 font-light">
                      Email <span className="text-accent">*</span>
                    </label>
                    <input
                      type="email"
                      name="email"
                      required
                      value={form.email}
                      onChange={handleChange}
                      placeholder="ana@email.com"
                      className={inputClass}
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] tracking-[0.2em] text-stone-400 uppercase mb-2 font-light">
                      Što trebate opremiti?
                    </label>
                    <select
                      name="space"
                      value={form.space}
                      onChange={handleChange}
                      className={`${inputClass} cursor-pointer`}
                    >
                      <option value="">— Odaberite —</option>
                      <option>Kuhinja</option>
                      <option>Ormar / garderoba</option>
                      <option>Spavaća soba</option>
                      <option>Kompletan apartman / kuća</option>
                      <option>Poslovni prostor / ured</option>
                      <option>Više prostorija</option>
                      <option>Nešto drugo</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[10px] tracking-[0.2em] text-stone-400 uppercase mb-2 font-light">
                      Poruka / napomena
                    </label>
                    <textarea
                      name="note"
                      rows={5}
                      value={form.note}
                      onChange={handleChange}
                      placeholder="Opišite prostor, željeni stil, dimenzije ili posebne zahtjeve..."
                      className={`${inputClass} resize-none`}
                    />
                  </div>

                  <button
                    type="submit"
                    className="w-full bg-brand-black text-white py-4 text-xs tracking-[0.22em] uppercase hover:bg-brand-dark transition-colors font-sans"
                  >
                    Pošalji upit
                  </button>

                  <p className="text-stone-300 text-xs font-light text-center">
                    Odgovaramo unutar 24 sata · Bez obveze
                  </p>
                </form>
              )}
            </motion.div>

            {/* Right: Info card */}
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: 0.15 }}
              className="space-y-4"
            >
              {/* Contact details */}
              <div className="bg-stone-50 p-8">
                <svg width="80" height="40" viewBox="0 0 88 44" fill="none" xmlns="http://www.w3.org/2000/svg" className="mb-7" aria-label="EMNA Interijeri">
                  <g fill="#0A0A0A">
                    <rect x="1" y="1" width="6" height="6" opacity="0.9"/>
                    <rect x="9" y="1" width="6" height="6" opacity="0.9"/>
                    <rect x="17" y="1" width="6" height="6" opacity="0.9"/>
                    <rect x="1" y="9" width="6" height="6" opacity="0.5"/>
                    <rect x="9" y="9" width="6" height="6" opacity="0.5"/>
                    <rect x="17" y="9" width="6" height="6" opacity="0.5"/>
                  </g>
                  <text x="1" y="33" fontFamily="'Raleway', sans-serif" fontSize="14" fontWeight="300" letterSpacing="4" fill="#0A0A0A">EMNA</text>
                  <text x="1" y="43" fontFamily="'DM Sans', sans-serif" fontSize="6" fontWeight="300" letterSpacing="3.5" fill="#9ca3af">INTERIJERI</text>
                </svg>

                <ul className="space-y-5">
                  {[
                    {
                      icon: (
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="1" y="3" width="14" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.3"/><path d="M1 3l7 6 7-6" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                      ),
                      label: "Email",
                      value: <a href="mailto:info@emnainterijeri.hr" className="hover:text-brand-black transition-colors">info@emnainterijeri.hr</a>,
                    },
                    {
                      icon: (
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M2.5 2.5h3l1.5 3.5-2 1.5a9 9 0 004 4l1.5-2 3.5 1.5v3a1 1 0 01-1 1C6 15.5.5 10 .5 3.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
                      ),
                      label: "Telefon",
                      value: <a href="tel:+385000000000" className="hover:text-brand-black transition-colors">+385 xx xxx xxxx</a>,
                    },
                    {
                      icon: (
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 1a5 5 0 015 5c0 4-5 9-5 9S3 10 3 6a5 5 0 015-5z" stroke="currentColor" strokeWidth="1.3"/><circle cx="8" cy="6" r="1.5" stroke="currentColor" strokeWidth="1.2"/></svg>
                      ),
                      label: "Showroom",
                      value: <span>Zagreb, Hrvatska</span>,
                    },
                    {
                      icon: (
                        <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.3"/><path d="M8 4.5v4l2.5 1.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/></svg>
                      ),
                      label: "Radno vrijeme",
                      value: <span>Pon–Pet · 08:00–17:00</span>,
                    },
                  ].map(({ icon, label, value }) => (
                    <li key={label} className="flex items-start gap-3">
                      <span className="text-accent mt-0.5 flex-shrink-0">{icon}</span>
                      <div>
                        <p className="text-[9px] tracking-[0.25em] text-stone-400 uppercase font-light mb-0.5">{label}</p>
                        <div className="text-sm text-brand-dark font-light">{value}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Process mini-strip */}
              <div className="bg-brand-black p-8">
                <p className="text-[9px] tracking-[0.35em] text-accent uppercase font-light mb-5">Kako funkcionira</p>
                <ol className="space-y-4">
                  {[
                    "Pošaljete upit → odgovaramo za 24h",
                    "Besplatno mjerenje i konzultacija",
                    "3D vizualizacija i ponuda za 5 dana",
                    "Izrada 4–8 tjedana, montaža 1–3 dana",
                  ].map((step, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <span className="font-serif text-accent text-xs mt-0.5 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
                      <span className="text-white/60 text-xs font-light leading-relaxed">{step}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </motion.div>

          </div>
        </div>
      </section>

      {/* ── FAQ ── */}
      <section className="py-24 bg-stone-50">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">

          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-4"
          >
            <div className="w-5 h-px bg-accent" />
            <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Česta pitanja</span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-serif text-4xl lg:text-5xl font-light text-brand-black mb-14 leading-tight"
          >
            Imate pitanja?<br />
            <span className="text-stone-400">Imamo odgovore.</span>
          </motion.h2>

          <div className="space-y-0 divide-y divide-stone-200">
            {faqs.map((faq, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.4, delay: i * 0.05 }}
              >
                <button
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                  className="w-full text-left py-6 flex items-start justify-between gap-6 group"
                >
                  <span className={`font-light text-base leading-snug transition-colors duration-200 ${openFaq === i ? "text-brand-black" : "text-brand-dark group-hover:text-brand-black"}`}>
                    {faq.q}
                  </span>
                  <span className={`flex-shrink-0 w-5 h-5 border rounded-full flex items-center justify-center transition-all duration-300 mt-0.5 ${openFaq === i ? "border-brand-black bg-brand-black" : "border-stone-300 group-hover:border-brand-black"}`}>
                    <svg
                      width="8"
                      height="8"
                      viewBox="0 0 10 10"
                      fill="none"
                      className={`transition-transform duration-300 ${openFaq === i ? "rotate-45" : ""}`}
                    >
                      <path
                        d="M5 1v8M1 5h8"
                        stroke={openFaq === i ? "white" : "#6b7280"}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                  </span>
                </button>

                <AnimatePresence initial={false}>
                  {openFaq === i && (
                    <motion.div
                      key="answer"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3, ease: "easeInOut" }}
                      className="overflow-hidden"
                    >
                      <p className="pb-6 text-stone-500 font-light text-sm leading-relaxed max-w-2xl">
                        {faq.a}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="mt-14 pt-10 border-t border-stone-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6"
          >
            <p className="text-stone-500 font-light text-sm leading-relaxed">
              Niste našli odgovor?<br />
              <span className="text-brand-black">Nazovite nas direktno.</span>
            </p>
            <div className="flex gap-3 flex-wrap">
              <a
                href="tel:+385000000000"
                className="inline-flex items-center gap-2 border border-brand-black text-brand-black text-xs tracking-[0.18em] uppercase px-6 py-3 hover:bg-brand-black hover:text-white transition-all duration-300"
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M2.5 2.5h3l1.5 3.5-2 1.5a9 9 0 004 4l1.5-2 3.5 1.5v3a1 1 0 01-1 1C6 15.5.5 10 .5 3.5a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/></svg>
                Nazovite nas
              </a>
              <a
                href="#"
                onClick={(e) => { e.preventDefault(); window.scrollTo({ top: 0, behavior: "smooth" }); }}
                className="inline-flex items-center gap-2 bg-brand-black text-white text-xs tracking-[0.18em] uppercase px-6 py-3 hover:bg-brand-dark transition-all duration-300"
              >
                Pošaljite upit
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </a>
            </div>
          </motion.div>

        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </main>
  );
}
