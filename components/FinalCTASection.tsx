"use client";

import Image from "next/image";
import { motion } from "framer-motion";

export default function FinalCTASection() {
  return (
    <section id="kontakt" className="relative py-32 lg:py-48 overflow-hidden">
      {/* Background image */}
      <Image
        src="/kuhinja-1.png"
        alt="EMNA Interijeri"
        fill
        className="object-cover"
      />
      <div className="absolute inset-0 bg-black/75" />

      {/* Content */}
      <div className="relative max-w-4xl mx-auto px-6 lg:px-8 text-center">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="text-accent text-xs tracking-[0.4em] uppercase font-light"
        >
          Kontakt
        </motion.p>

        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="font-serif text-4xl lg:text-6xl font-light text-white mt-4 leading-tight"
        >
          Zatražite 3D prijedlog
          <br />
          vaše buduće kuhinje
        </motion.h2>

        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          whileInView={{ opacity: 1, scaleX: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="w-12 h-px bg-accent mx-auto mt-8"
        />

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
          className="text-white/55 text-lg font-light mt-8 max-w-xl mx-auto leading-relaxed"
        >
          Pošaljite dimenzije i željeni stil — mi vam pripremamo profesionalni
          3D projekt i točnu ponudu unutar 24h.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.4 }}
          className="flex flex-col sm:flex-row gap-4 justify-center mt-12"
        >
          <a
            href="mailto:info@emnainterijeri.hr"
            className="bg-white text-brand-black px-10 py-4 text-sm tracking-wider font-medium hover:bg-accent transition-colors"
          >
            Zatraži 3D dizajn
          </a>
          <a
            href="tel:+385000000000"
            className="border border-white/40 text-white px-10 py-4 text-sm tracking-wider hover:bg-white/10 transition-colors"
          >
            Pozovite nas
          </a>
        </motion.div>

        {/* Contact info row */}
        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.55 }}
          className="flex flex-wrap justify-center gap-10 mt-16 text-white/35 text-sm font-light"
        >
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M2 2h3l1.5 3.5-2 1.5a8 8 0 003.5 3.5l1.5-2L13 12v3a1 1 0 01-1 1C5.4 15.5-.5 9.6.5 2.5A1 1 0 012 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span>+385 xx xxx xxxx</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <rect x="1" y="3" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M1 3l6 5 6-5" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
            </svg>
            <span>info@emnainterijeri.hr</span>
          </div>
          <div className="flex items-center gap-2">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M7 1a4 4 0 014 4c0 3-4 8-4 8S3 8 3 5a4 4 0 014-4z" stroke="currentColor" strokeWidth="1.2" />
              <circle cx="7" cy="5" r="1.2" stroke="currentColor" strokeWidth="1" />
            </svg>
            <span>Zagreb, Hrvatska</span>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
