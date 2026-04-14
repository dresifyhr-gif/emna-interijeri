import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import FinalCTASection from "@/components/FinalCTASection";
import Image from "next/image";
import Link from "next/link";

export const metadata = {
  title: "Kuhinje po mjeri | EMNA Interijeri",
  description: "Premium kuhinje po mjeri – MDF mat, visoki sjaj, kamene ploče. Vlastita izrada i montaža.",
};

const projects = [
  {
    title: "Kuhinja s otokom",
    desc: "Nordijski stil · Bijela mat + hrast",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1 row-span-2",
  },
  {
    title: "Moderna L-kuhinja",
    desc: "Visoki sjaj · Antracit + beton",
    image: "https://images.unsplash.com/photo-1556912167-f556f1f39fdf?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
  {
    title: "Otvoreni plan",
    desc: "Skandinavski · Bijela + drvo",
    image: "https://images.unsplash.com/photo-1484154218962-a197022b5858?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
  {
    title: "Minimalistička kuhinja",
    desc: "Handleless · Tamno siva",
    image: "https://images.unsplash.com/photo-1556909172-54557c7e4fb7?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
  {
    title: "Rustikalni stil",
    desc: "Furnir hrast · Kamena ploča",
    image: "https://images.unsplash.com/photo-1565183997392-2f6f122e5912?auto=format&fit=crop&w=800&q=80",
    size: "col-span-1",
  },
];

const materials = [
  { name: "MDF Mat", desc: "Svilenkasto mat površine, bez refleksija" },
  { name: "Visoki sjaj", desc: "Luksuzni sjaj, jednostavno čišćenje" },
  { name: "Furnir", desc: "Prirodno drvo, svaki komad jedinstven" },
  { name: "Kamen & keramika", desc: "Radne površine otporne na toplinu" },
  { name: "Lakobel staklo", desc: "Moderan detalj za front ormara" },
  { name: "Inox", desc: "Profesionalni izgled, dugotrajna kvaliteta" },
];

export default function KuhinjePage() {
  return (
    <>
      <Header />
      <main>
        {/* Hero */}
        <section className="relative h-[70vh] min-h-[500px] overflow-hidden bg-brand-black">
          <Image
            src="/kuhinja-hero.png"
            alt="Kuhinje po mjeri EMNA Interijeri"
            fill
            priority
            className="object-cover opacity-55"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/40 to-transparent" />
          <div className="absolute inset-0 flex flex-col justify-center px-8 lg:px-20 xl:px-28 pt-24">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Kuhinje</span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl lg:text-7xl font-light text-white leading-tight max-w-2xl">
              Kuhinje po mjeri
              <br />
              <span className="text-accent">vaše sobe.</span>
            </h1>
            <p className="text-white/60 text-lg font-light mt-6 max-w-xl leading-relaxed">
              MDF mat, visoki sjaj, furnir, kamen — sve materijale nudimo u vlastitoj izradi. Bez posrednika, direktno iz naše tvornice.
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

        {/* Materials */}
        <section className="py-24 bg-stone-50">
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Materijali</span>
            </div>
            <h2 className="font-serif text-4xl md:text-5xl font-light text-brand-black mb-12">
              Što nudimo.
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-px bg-stone-200">
              {materials.map((m) => (
                <div key={m.name} className="bg-stone-50 hover:bg-white transition-colors duration-300 p-8">
                  <h3 className="font-serif text-xl font-light text-brand-black mb-2">{m.name}</h3>
                  <p className="text-stone-500 text-sm font-light leading-relaxed">{m.desc}</p>
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
