import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import FinalCTASection from "@/components/FinalCTASection";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Ormari i garderobe | EMNA Interijeri",
  description: "Ugradbeni ormari i walk-in garderobe po mjeri. Vlastita izrada i montaža.",
};

const projects = [
  {
    title: "Walk-in garderoba",
    desc: "Bijela mat · LED osvjetljenje",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1 row-span-2",
  },
  {
    title: "Ugradbeni ormar",
    desc: "Klizna vrata · Ogledalo",
    image: "https://images.unsplash.com/photo-1558997519-83ea9252edf8?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
  {
    title: "Garderoba uz hodnik",
    desc: "Otvoreni sustav · Hrast",
    image: "https://images.unsplash.com/photo-1595526114035-0d45ed16cfbf?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
  {
    title: "Spavaća garderoba",
    desc: "Antracit mat · Soft-close",
    image: "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
  {
    title: "Poslovni ormar",
    desc: "Ured · Bijeli lak",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
];

const types = [
  { name: "Ugradbeni ormari", desc: "Maksimalno iskorištavanje prostora, od poda do stropa" },
  { name: "Walk-in garderobe", desc: "Luksuzne garderobe s punim sadržajem i osvjetljenjem" },
  { name: "Klizna vrata", desc: "Moderan izgled, štede prostor u manjim sobama" },
  { name: "Otvoreni sustavi", desc: "Skandinavski pristup, poluge i vješalice na vidiku" },
  { name: "Ormari za hodnik", desc: "Funkcionalni ulazni ormari s ladicama i ogledalom" },
  { name: "Poslovni ormari", desc: "Uredski i arhivski ormari za poslovne prostore" },
];

export default function OrmariPage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative h-[70vh] min-h-[500px] overflow-hidden bg-brand-black">
          <Image
            src="https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=2000&q=85"
            alt="Ormari i garderobe po mjeri EMNA Interijeri"

            fill
            priority
            className="object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-8 lg:px-20 xl:px-28 pt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Ormari</span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light text-white leading-tight max-w-2xl">
              Ormari i garderobe
              <br />
              <span className="text-accent">po mjeri.</span>
            </h1>
            <p className="text-white/60 text-lg font-light mt-6 max-w-xl leading-relaxed">
              Ugradbeni ormari, walk-in garderobe, klizna vrata — maksimalni prostor za svaki kutak. Sve u vlastitoj izradi.
            </p>
            <div className="flex gap-4 mt-10">
              <Link href="/kontakt" className="bg-white text-brand-black px-8 py-3.5 text-xs tracking-[0.18em] uppercase font-medium hover:bg-accent transition-all duration-300">
                Zatraži ponudu
              </Link>
            </div>
          </div>
        </section>

        {/* Gallery grid */}
        <section className="py-24 bg-white">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Galerija</span>
            </div>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-brand-black mb-12">
              Naši projekti.
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {projects.map((p, i) => (
                <div key={i} className={`relative overflow-hidden group ${p.size} aspect-square`}>
                  <Image
                    src={p.image}
                    alt={p.title}
                    fill
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                    sizes="(max-width: 768px) 50vw, 33vw"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
                  <div className="absolute bottom-0 left-0 p-5">
                    <p className="text-white font-serif text-lg font-light">{p.title}</p>
                    <p className="text-white/50 text-xs font-light mt-1">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Types */}
        <section className="py-24 bg-stone-50">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Vrste</span>
            </div>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-brand-black mb-12">
              Što izrađujemo.
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-stone-200">
              {types.map((t) => (
                <div key={t.name} className="bg-stone-50 hover:bg-white transition-colors duration-300 p-8">
                  <h3 className="font-serif text-xl font-light text-brand-black mb-2">{t.name}</h3>
                  <p className="text-stone-500 text-sm font-light leading-relaxed">{t.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <FinalCTASection />
      </main>
      <Footer />
      <WhatsAppButton />
    </>
  );
}
