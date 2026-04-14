"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const advantages = [
  {
    number: "01",
    title: "Vlastita tvornica",
    headline: "Niža cijena, brža isporuka.",
    body:
      "Sami projektiramo i izrađujemo u vlastitim prostorima. Bez posrednika, bez naknade distributera — direktno od majstora do vašeg doma.",
    tag: "Ušteda 20–35%",
  },
  {
    number: "02",
    title: "Kompletna usluga",
    headline: "Jedan kontakt za sve.",
    body:
      "Ne trebate koordinirati dizajnera, dobavljača i montersku ekipu. Mi preuzimamo sve od prvog nacrta do čišćenja nakon montaže.",
    tag: "Turnkey solution",
  },
  {
    number: "03",
    title: "Mjereno, ne standardizirano",
    headline: "Svaki projekt je jedinstven.",
    body:
      "Dolazimo na lice mjesta, uzimamo mjere i projektiramo svaki element prema vašem prostoru. Nema serijskih šablona — nema kompromisa.",
    tag: "100% po mjeri",
  },
];

const proof = [
  { value: "1.000+", label: "Završenih projekata" },
  { value: "3 generacije", label: "Tradicija zanata" },
  { value: "4.9★", label: "Prosječna ocjena" },
  { value: "100%", label: "Ključ u ruke" },
];

export default function WhyUsSection() {
  return (
    <section className="py-24 lg:py-32 bg-stone-50">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* Section label */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4 }}
          className="flex items-center gap-3 mb-16"
        >
          <div className="w-5 h-px bg-accent" />
          <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Zašto EMNA</span>
        </motion.div>

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-px bg-stone-200">
          {advantages.map((item, i) => (
            <motion.div
              key={item.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="group bg-stone-50 hover:bg-white transition-colors duration-300 p-8 lg:p-10"
            >
              <div className="flex items-start justify-between mb-6">
                <span className="font-serif text-5xl text-stone-300 font-light group-hover:text-brand-black/20 transition-colors duration-500 leading-none">
                  {item.number}
                </span>
                <span className="text-[9px] tracking-[0.25em] uppercase border border-brand-black/30 text-brand-black px-2.5 py-1 font-light">
                  {item.tag}
                </span>
              </div>
              <div className="text-[10px] tracking-[0.3em] uppercase text-stone-500 font-light mb-3">
                {item.title}
              </div>
              <h3 className="font-serif text-2xl font-light text-brand-black leading-tight mb-4">
                {item.headline}
              </h3>
              <p className="text-stone-600 text-sm font-light leading-relaxed">
                {item.body}
              </p>
            </motion.div>
          ))}
        </div>

        {/* Proof stats */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="grid grid-cols-2 md:grid-cols-4 mt-3 bg-white border border-stone-100"
        >
          {proof.map((item, i) => (
            <div
              key={item.label}
              className={`py-8 px-6 text-center ${
                i < proof.length - 1 ? "border-r border-stone-100" : ""
              }`}
            >
              <div className="font-serif text-3xl text-brand-black font-light">{item.value}</div>
              <div className="text-stone-500 text-[10px] tracking-[0.2em] uppercase mt-1.5">{item.label}</div>
            </div>
          ))}
        </motion.div>

        {/* CTA */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.4, delay: 0.3 }}
          className="mt-12 text-center"
        >
          <Link
            href="/kontakt"
            className="inline-flex items-center gap-3 bg-brand-black text-white text-xs tracking-[0.2em] uppercase px-10 py-4 hover:bg-brand-dark transition-colors duration-300"
          >
            Zatraži besplatnu konzultaciju
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
