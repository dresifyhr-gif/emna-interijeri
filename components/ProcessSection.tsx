"use client";

import { motion } from "framer-motion";

const steps = [
  {
    number: "01",
    title: "Upit",
    desc: "Kontaktirajte nas telefonom, e-mailom ili putem obrasca. Odgovaramo u roku od 24 sata.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
      </svg>
    ),
  },
  {
    number: "02",
    title: "Konzultacija i mjere",
    desc: "Dolazimo na lokaciju, uzimamo precizne mjere i razgovaramo o vašim željama i budžetu.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 3h18v18H3z"/><path d="M3 9h18M9 21V9"/>
      </svg>
    ),
  },
  {
    number: "03",
    title: "Projekt i ponuda",
    desc: "Izrađujemo detaljan projekt s vizualizacijom i točnom ponudom. Bez skrivenih troškova.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14,2 14,8 20,8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10,9 9,9 8,9"/>
      </svg>
    ),
  },
  {
    number: "04",
    title: "Izrada",
    desc: "Svaki element izrađujemo u vlastitoj tvornici prema vašim mjerama i odabranim materijalima.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z"/>
      </svg>
    ),
  },
  {
    number: "05",
    title: "Montaža i predaja",
    desc: "Naša ekipa vrši profesionalnu montažu. Projekt predajemo čist i spreman za korištenje.",
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20,6 9,17 4,12"/>
      </svg>
    ),
  },
];

export default function ProcessSection() {
  return (
    <section className="py-24 lg:py-32 bg-white overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* Header */}
        <div className="max-w-2xl mb-16">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="w-5 h-px bg-accent" />
            <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Kako radimo</span>
          </motion.div>
          <motion.h2
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-serif text-4xl md:text-5xl font-light text-brand-black leading-tight"
          >
            Od upita do
            <br />
            predaje ključa.
          </motion.h2>
        </div>

        {/* Steps */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-0 relative">
          {/* Connector line (desktop) */}
          <div className="hidden md:block absolute top-10 left-[10%] right-[10%] h-px bg-stone-300 z-0" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="relative z-10 flex flex-col items-center md:items-start text-center md:text-left px-4 py-6"
            >
              {/* Step circle */}
              <div className="w-20 h-20 rounded-full border border-stone-200 bg-white flex flex-col items-center justify-center mb-5 shadow-sm">
                <div className="text-brand-black mb-1">{step.icon}</div>
                <span className="text-[9px] text-stone-400 tracking-widest">{step.number}</span>
              </div>

              <h3 className="font-serif text-lg font-light text-brand-black mb-2">{step.title}</h3>
              <p className="text-stone-600 text-sm font-light leading-relaxed">{step.desc}</p>

              {/* Arrow between steps (desktop) */}
              {i < steps.length - 1 && (
                <div className="hidden md:block absolute top-10 -right-2 z-20 text-stone-400">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              )}
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
