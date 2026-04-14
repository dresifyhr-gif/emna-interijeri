"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const checkmarks = [
  "Personalizirani 3D projekt u roku 48 sati",
  "Točna ponuda bez skrivenih troškova",
  "Savjetovanje s iskusnim dizajnerima",
];

const layoutOptions = ["Ravna", "L oblik", "U oblik", "Otok"];
const styleChips = [
  { label: "Svijetlo", className: "bg-stone-100 text-stone-600 border border-stone-200" },
  { label: "Tamno", className: "bg-brand-black text-white border border-brand-black" },
  { label: "Drvo", className: "bg-amber-100 text-amber-900 border border-amber-200" },
  { label: "Minimal", className: "bg-white text-stone-600 border border-stone-300" },
];

export default function ConfiguratorSection() {
  return (
    <section id="konfigurator" className="bg-white py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-16 lg:gap-24 items-center">
          {/* Left — copy */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            <p className="text-accent text-xs tracking-[0.3em] uppercase font-light">
              KONFIGURATOR
            </p>
            <h2 className="font-serif text-4xl lg:text-5xl font-light mt-4 leading-tight text-brand-black">
              Dizajnirajte kuhinju<br />po svojoj mjeri
            </h2>
            <p className="text-stone-500 font-light leading-relaxed mt-6 max-w-md">
              Recite nam kakvu kuhinju zamišljate — dimenzije, stil, materijal.
              Naš tim priprema profesionalni 3D projekt i točnu ponudu, bez
              skrivenih troškova.
            </p>

            {/* Checkmarks */}
            <ul className="mt-8 space-y-3">
              {checkmarks.map((item) => (
                <li key={item} className="flex items-start gap-3">
                  <span className="text-accent font-medium mt-0.5">✓</span>
                  <span className="text-sm text-brand-mid font-light leading-relaxed">
                    {item}
                  </span>
                </li>
              ))}
            </ul>

            <a
              href="#kontakt"
              className="inline-flex items-center mt-10 bg-brand-black text-white px-8 py-4 text-sm tracking-wider font-medium hover:bg-brand-mid transition-colors"
            >
              Zatražite 3D dizajn →
            </a>
          </motion.div>

          {/* Right — mockup card */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.15 }}
          >
            <div className="bg-stone-50 rounded-2xl p-6 shadow-2xl shadow-stone-200 border border-stone-100">
              {/* Step tabs */}
              <div className="flex gap-2 flex-wrap">
                <button className="bg-brand-black text-white rounded-full px-4 py-1.5 text-xs font-medium">
                  Prostor
                </button>
                {["Dimenzije", "Stil", "Materijal"].map((tab) => (
                  <button
                    key={tab}
                    className="bg-white text-stone-400 border border-stone-200 rounded-full px-4 py-1.5 text-xs font-light hover:border-stone-300 transition-colors"
                  >
                    {tab}
                  </button>
                ))}
              </div>

              {/* Layout picker */}
              <p className="text-xs text-stone-400 uppercase tracking-wider mt-5 mb-2">
                Odaberite raspored
              </p>
              <div className="grid grid-cols-2 gap-2">
                {layoutOptions.map((opt, i) => (
                  <button
                    key={opt}
                    className={`rounded-lg py-2 text-sm font-light transition-colors ${
                      i === 0
                        ? "bg-brand-black text-white"
                        : "bg-white border border-stone-200 text-stone-600 hover:border-stone-300"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>

              {/* Style picker */}
              <p className="text-xs text-stone-400 uppercase tracking-wider mt-5 mb-2">
                Stil
              </p>
              <div className="flex flex-wrap gap-2">
                {styleChips.map((chip) => (
                  <button
                    key={chip.label}
                    className={`rounded-full px-3 py-1 text-xs font-light transition-opacity ${chip.className}`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>

              {/* Kitchen preview image */}
              <div className="relative mt-4 rounded-xl overflow-hidden aspect-video">
                <Image
                  src="https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80"
                  alt="Pregled kuhinje u konfiguraciji"
                  fill
                  className="object-cover"
                />
              </div>

              {/* Price estimate */}
              <div className="flex items-center justify-between mt-4 bg-white rounded-xl p-4 border border-stone-100">
                <div>
                  <p className="text-xs text-stone-400 mb-0.5">Procjena</p>
                  <p className="font-serif text-xl text-brand-black">
                    6.800 € – 8.900 €
                  </p>
                </div>
                <div className="flex items-center gap-1.5 bg-green-50 text-green-700 text-xs px-3 py-1.5 rounded-full border border-green-100">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  Ažurirano
                </div>
              </div>

              {/* Card CTA */}
              <button className="w-full mt-4 bg-brand-black text-white py-3 rounded-xl text-sm font-medium tracking-wide hover:bg-brand-mid transition-colors">
                Zatražite 3D dizajn →
              </button>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
