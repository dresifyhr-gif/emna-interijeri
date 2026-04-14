"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhyUsSection from "@/components/WhyUsSection";
import ProductionSection from "@/components/ProductionSection";
import ProcessSection from "@/components/ProcessSection";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function ONamaPage() {
  return (
    <main>
      <Header />

      {/* ── Hero ── */}
      <section className="relative min-h-[50vh] flex items-center pt-20 lg:pt-24">
        <Image
          src="/kuhinja-4.png"
          alt="O nama — EMNA Interijeri"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-r from-black/65 via-black/50 to-black/30" />
        <div className="relative px-8 lg:px-20 max-w-4xl">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-accent text-xs tracking-[0.4em] uppercase font-light mb-4"
          >
            O NAMA
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-5xl lg:text-7xl font-light text-white leading-tight"
          >
            Tradicija koja se vidi<br />u svakom detalju
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-white/60 font-light mt-6 text-lg max-w-lg leading-relaxed"
          >
            Tri generacije zanata i više od 1000 izrađenih kuhinja — svaka prema vašim dimenzijama i željama.
          </motion.p>
        </div>
      </section>

      <WhyUsSection />
      <ProductionSection />
      <ProcessSection />

      {/* ── Bottom CTA Strip ── */}
      <section className="bg-stone-50 py-16">
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="font-serif text-3xl lg:text-4xl font-light text-brand-black mb-6"
          >
            Spremi za razgovor?
          </motion.p>
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            <Link
              href="/kontakt"
              className="inline-block border border-brand-black text-brand-black px-8 py-3 hover:bg-brand-black hover:text-white transition-colors text-sm tracking-wider"
            >
              Kontaktirajte nas
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </main>
  );
}
