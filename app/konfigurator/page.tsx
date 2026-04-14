"use client";

import Image from "next/image";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import KitchenConfiguratorSection from "@/components/KitchenConfiguratorSection";
import WhatsAppButton from "@/components/WhatsAppButton";

export default function KonfiguratorPage() {
  return (
    <main>
      <Header />

      {/* ── Hero ── */}
      <section className="relative min-h-[35vh] flex items-center justify-center pt-20 lg:pt-24">
        <Image
          src="/kuhinja-5.png"
          alt="Konfigurator kuhinja"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/70 to-black/70" />
        <div className="relative text-center px-6">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-accent text-xs tracking-[0.4em] uppercase font-light mb-4"
          >
            KONFIGURATOR
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-5xl font-light text-white leading-tight"
          >
            Dizajnirajte svoju kuhinju
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-white/60 font-light mt-4 text-base max-w-md mx-auto"
          >
            Odaberite raspored, stil i materijale. Ponudu dobivate unutar 24h.
          </motion.p>
        </div>
      </section>

      <KitchenConfiguratorSection />

      <Footer />
      <WhatsAppButton />
    </main>
  );
}
