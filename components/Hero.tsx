"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import Link from "next/link";

const stats = [
  { value: "1000+", label: "Projekata" },
  { value: "3 gen.", label: "Tradicija" },
  { value: "100%", label: "Ključ u ruke" },
  { value: "Vlastita", label: "Tvornica" },
];

export default function Hero() {
  return (
    <section className="relative min-h-screen overflow-hidden bg-brand-black">
      <Image
        src="https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=2000&q=85"
        alt="Luksuzni moderni interijer"
        fill
        priority
        className="object-cover opacity-60"
      />
      {/* Gradient overlays */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/20" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/20" />

      {/* Main content */}
      <div className="absolute inset-0 flex flex-col justify-start pt-32 md:justify-center md:pt-0 px-8 lg:px-20 xl:px-28 pb-36 md:pb-0">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between w-full">
        <div className="max-w-xl lg:max-w-lg xl:max-w-2xl">

          {/* Eyebrow */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="flex items-center gap-3 mb-6 md:mb-8"
          >
            <div className="w-8 h-px bg-accent" />
            <span className="text-accent text-[10px] tracking-[0.3em] sm:tracking-[0.4em] uppercase font-light whitespace-nowrap">
              Kompletno opremanje interijera
            </span>
          </motion.div>

          {/* Headline */}
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="font-serif text-4xl sm:text-5xl md:text-6xl lg:text-7xl xl:text-8xl font-light text-white leading-[1.02] tracking-tight"
          >
            Vaš interijer,
            <br />
            <span className="text-accent">od ideje</span>
            <br />
            do ključa.
          </motion.h1>

          {/* Subline */}
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.38 }}
            className="text-white/60 text-base md:text-lg font-light mt-5 md:mt-7 leading-relaxed max-w-xl"
          >
            Vlastita proizvodnja, projektiranje i montaža. Kuhinje, ormari,
            spavaće sobe, poslovni prostori — sve pod jednim krovom.
          </motion.p>

          {/* CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.52 }}
            className="flex flex-wrap gap-4 mt-8 md:mt-10"
          >
            <Link
              href="/kontakt"
              className="bg-white text-brand-black px-7 sm:px-9 py-3.5 sm:py-4 text-xs tracking-[0.18em] uppercase font-medium hover:bg-accent transition-all duration-300"
            >
              Zatraži ponudu
            </Link>
            <Link
              href="/interijeri"
              className="border border-white/35 text-white px-7 sm:px-9 py-3.5 sm:py-4 text-xs tracking-[0.18em] uppercase hover:bg-white/8 hover:border-white/60 transition-all duration-300"
            >
              Pogledaj projekte →
            </Link>
          </motion.div>

          {/* Trust micro-signals */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.75 }}
            className="hidden sm:flex flex-wrap gap-6 mt-10"
          >
            {["Besplatna konzultacija", "Ponuda za 24h", "Bez obveze"].map((item) => (
              <div key={item} className="flex items-center gap-2">
                <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="#C9B99A" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span className="text-white/40 text-xs font-light tracking-wide">{item}</span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* Desktop logo — right column */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.5 }}
          className="hidden lg:flex flex-1 items-center justify-center"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/emna-logo-bijeli.png"
            alt="EMNA Interijeri"
            className="h-72 xl:h-80 w-auto object-contain opacity-80"
          />
        </motion.div>

        </div>
      </div>

      {/* Bottom stats bar */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, delay: 1.0 }}
        className="absolute bottom-0 left-0 right-0 border-t border-white/10"
      >
        <div className="max-w-7xl mx-auto px-8 lg:px-20">
          <div className="grid grid-cols-2 md:grid-cols-4">
            {stats.map((stat, i) => (
              <div
                key={stat.label}
                className={`py-5 px-6 text-center ${
                  i < stats.length - 1 ? "border-r border-white/10" : ""
                }`}
              >
                <div className="font-serif text-2xl text-white font-light">{stat.value}</div>
                <div className="text-white/35 text-[10px] tracking-[0.2em] uppercase mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 1, delay: 1.3 }}
        className="absolute bottom-24 right-8 lg:right-20 flex-col items-center gap-3 hidden lg:flex"
      >
        <span className="text-white/20 text-[9px] tracking-[0.3em] uppercase rotate-90 mb-2">Scroll</span>
        <motion.div animate={{ y: [0, 8, 0] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" className="text-white/20">
            <path d="M10 3v14M4 11l6 6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </motion.div>
      </motion.div>
    </section>
  );
}
