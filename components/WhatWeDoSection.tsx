"use client";

import { motion } from "framer-motion";
import Link from "next/link";

const spaces = [
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
        <polyline points="9,22 9,12 15,12 15,22"/>
      </svg>
    ),
    label: "Apartmani",
    desc: "Kompletno opremanje",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"/>
        <line x1="12" y1="2" x2="12" y2="7"/>
        <path d="M5 22V12h14v10"/>
      </svg>
    ),
    label: "Kuće",
    desc: "Svi prostori po mjeri",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="7" width="20" height="14" rx="2"/>
        <path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>
        <line x1="12" y1="12" x2="12" y2="16"/>
        <line x1="10" y1="14" x2="14" y2="14"/>
      </svg>
    ),
    label: "Ordinacije",
    desc: "Funkcionalni interijeri",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="3" width="20" height="14" rx="2"/>
        <line x1="8" y1="21" x2="16" y2="21"/>
        <line x1="12" y1="17" x2="12" y2="21"/>
      </svg>
    ),
    label: "Uredi",
    desc: "Radni prostori i recepcije",
  },
  {
    icon: (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z"/>
        <line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 01-8 0"/>
      </svg>
    ),
    label: "Poslovni prostori",
    desc: "Kafići, butici, showroomi",
  },
];

export default function WhatWeDoSection() {
  return (
    <section className="bg-brand-black py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* Heading */}
        <div className="max-w-3xl mb-16 lg:mb-20">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="flex items-center gap-3 mb-6"
          >
            <div className="w-6 h-px bg-accent" />
            <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Što radimo</span>
          </motion.div>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-4xl md:text-5xl lg:text-6xl font-light text-white leading-tight"
          >
            Opremamo kompletne
            <br />
            <span className="text-accent">prostore</span> — turnkey.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-stone-400 text-lg font-light mt-6 leading-relaxed"
          >
            Od prvog razgovora do predaje ključa — sami projektiramo,
            proizvodimo i montiramo. Bez posrednika, bez odgađanja.
          </motion.p>
        </div>

        {/* Space type grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-px bg-white/5 border border-white/5">
          {spaces.map((space, i) => (
            <motion.div
              key={space.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.08 }}
              className="group flex flex-col items-center text-center py-10 px-6 bg-brand-black hover:bg-white/4 transition-colors duration-300 cursor-default"
            >
              <div className="text-stone-500 group-hover:text-accent transition-colors duration-300 mb-4">
                {space.icon}
              </div>
              <div className="text-white font-serif font-light text-lg mb-1">{space.label}</div>
              <div className="text-stone-500 text-xs font-light">{space.desc}</div>
            </motion.div>
          ))}
        </div>

        {/* Bottom CTA */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="mt-12 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 pt-10 border-t border-white/8"
        >
          <p className="text-stone-400 text-sm font-light max-w-lg">
            Radimo i za privatne naručitelje, investitore i tvrtke.
            Svaki projekt je jedinstven — bez serijske ponude.
          </p>
          <Link
            href="/kontakt"
            className="flex-shrink-0 border border-white/20 text-white text-xs tracking-[0.15em] uppercase px-6 sm:px-8 py-3.5 hover:bg-white/6 hover:border-white/40 transition-all duration-300 whitespace-nowrap"
          >
            Razgovarajmo o projektu →
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
