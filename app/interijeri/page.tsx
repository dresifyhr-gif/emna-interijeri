import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProjectsSection from "@/components/ProjectsSection";
import FinalCTASection from "@/components/FinalCTASection";
import Image from "next/image";

export const metadata = {
  title: "Interijeri | EMNA Interijeri",
  description: "Pogledajte naše kompletno opremljene apartmane, kuće i poslovne prostore.",
};

export default function InterijerPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative h-[60vh] min-h-[440px] overflow-hidden bg-brand-black">
          <Image
            src="https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=2000&q=85"
            alt="Kompletni interijeri EMNA Interijeri"
            fill
            priority
            className="object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-8 lg:px-20 xl:px-28 pt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Naši projekti</span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light text-white leading-tight max-w-2xl">
              Kompletni interijeri
              <br />
              <span className="text-accent">po mjeri.</span>
            </h1>
            <p className="text-white/60 text-lg font-light mt-6 max-w-xl leading-relaxed">
              Svaki projekt je jedinstven. Pogledajte neke od naših realizacija.
            </p>
          </div>
        </section>
        <ProjectsSection />
        <FinalCTASection />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
