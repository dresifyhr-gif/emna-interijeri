"use client";

import Link from "next/link";
import Image from "next/image";
import { motion } from "framer-motion";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";

const projects = [
  {
    id: "1",
    photo: "/galerija/kuhinja-siva-mramor.jpg",
    title: "Antracit kuhinja s mramornom pločom",
    category: "Premium",
    location: "Zagreb",
    featured: true,
  },
  {
    id: "2",
    photo: "/galerija/kuhinja-bijela-zlato.jpg",
    title: "Bijela kuhinja s otokom i zlatnim akcentima",
    category: "Premium",
    location: "Split",
    featured: false,
  },
  {
    id: "3",
    photo: "/galerija/kuhinja-zelena-drvo.jpg",
    title: "Tamnozelena kuhinja s drvenim detaljima",
    category: "Moderna",
    location: "Zagreb",
    featured: false,
  },
  {
    id: "4",
    photo: "/galerija/kuhinja-drvo-bijela.jpg",
    title: "L-kuhinja drvo i bijela",
    category: "L oblik",
    location: "Rijeka",
    featured: false,
  },
  {
    id: "5",
    photo: "/galerija/kuhinja-beton-mramor.jpg",
    title: "Beton look s mramornim zastorom",
    category: "Moderna",
    location: "Osijek",
    featured: false,
  },
  {
    id: "6",
    photo: "/galerija/kuhinja-bijela-otok.jpg",
    title: "Bijela kuhinja s crnim otokom",
    category: "Minimal",
    location: "Zadar",
    featured: false,
  },
  {
    id: "7",
    photo: "/galerija/kuhinja-mint-drvo.jpg",
    title: "Mint kuhinja s drvenim gornjim elementima",
    category: "Moderna",
    location: "Varaždin",
    featured: false,
  },
  {
    id: "8",
    photo: "/galerija/kuhinja-bijela-gloss.jpg",
    title: "Bijela visoki sjaj s drvenom pozadinom",
    category: "Minimal",
    location: "Zagreb",
    featured: false,
  },
  {
    id: "9",
    photo: "/galerija/kuhinja-zelena-drvo-2.jpg",
    title: "Zelena kuhinja s toplim drvenim tonovima",
    category: "Moderna",
    location: "Split",
    featured: false,
  },
  {
    id: "10",
    photo: "/galerija/kuhinja-siva-mramor-2.jpg",
    title: "Siva kuhinja s mramornim zastorom",
    category: "Premium",
    location: "Dubrovnik",
    featured: false,
  },
  {
    id: "11",
    photo: "/galerija/kuhinja-drvo-bijela-2.jpg",
    title: "L-kuhinja drvo i bijela — prirodni materijali",
    category: "L oblik",
    location: "Karlovac",
    featured: false,
  },
  {
    id: "12",
    photo: "/galerija/kuhinja-bijela-granit.jpg",
    title: "Bijela kuhinja s crnim granitnim pultom",
    category: "Minimal",
    location: "Rijeka",
    featured: false,
  },
  {
    id: "13",
    photo: "/galerija/kuhinja-bijela-crna-otok.jpg",
    title: "Bijela kuhinja s crnim otokom i zastorom",
    category: "Premium",
    location: "Zagreb",
    featured: false,
  },
  {
    id: "14",
    photo: "/galerija/kuhinja-crna-mramor-2.jpg",
    title: "Crna kuhinja s mramornim podom",
    category: "Premium",
    location: "Split",
    featured: false,
  },
  {
    id: "15",
    photo: "/galerija/kuhinja-krem-drvo.jpg",
    title: "Krem kuhinja s drvenim detaljima",
    category: "Moderna",
    location: "Osijek",
    featured: false,
  },
  {
    id: "16",
    photo: "/galerija/kuhinja-crna-bijela-otok.jpg",
    title: "Crna kuhinja s bijelim otokom",
    category: "Premium",
    location: "Dubrovnik",
    featured: false,
  },
  {
    id: "17",
    photo: "/galerija/kuhinja-tamna-drvo-l.jpg",
    title: "Tamna L-kuhinja s drvenim gornjim",
    category: "L oblik",
    location: "Varaždin",
    featured: false,
  },
  {
    id: "18",
    photo: "/galerija/kuhinja-zelena-crni-mramor.jpg",
    title: "Tamnozelena s crnim mramornim zastorom",
    category: "Premium",
    location: "Rijeka",
    featured: false,
  },
  {
    id: "19",
    photo: "/galerija/kuhinja-zelena-crni-mramor-2.jpg",
    title: "Zelena kuhinja s crnim zlatnim zastorom",
    category: "Premium",
    location: "Zagreb",
    featured: false,
  },
  {
    id: "20",
    photo: "/galerija/kuhinja-beton-mramor-2.jpg",
    title: "Beton look s mramornim pultom",
    category: "Moderna",
    location: "Karlovac",
    featured: false,
  },
  {
    id: "21",
    photo: "/galerija/kuhinja-siva-mozaik.jpg",
    title: "Siva kuhinja s mozaik pločicama",
    category: "Moderna",
    location: "Zadar",
    featured: false,
  },
  {
    id: "22",
    photo: "/galerija/kuhinja-crna-drvo-otok.jpg",
    title: "Crna kuhinja s drvenim otokom",
    category: "Premium",
    location: "Split",
    featured: false,
  },
  {
    id: "23",
    photo: "/galerija/kuhinja-crna-drvo-sala.jpg",
    title: "Crna kuhinja s drvenom trpezarijom",
    category: "Moderna",
    location: "Zagreb",
    featured: false,
  },
  {
    id: "24",
    photo: "/galerija/kuhinja-bijela-klasicna.jpg",
    title: "Bijela klasična kuhinja s patterned pločicama",
    category: "Klasik",
    location: "Slavonski Brod",
    featured: false,
  },
  {
    id: "25",
    photo: "/galerija/kuhinja-bijela-klasicna-2.jpg",
    title: "Bijela klasična — L oblik s toranj elementom",
    category: "Klasik",
    location: "Vinkovci",
    featured: false,
  },
  {
    id: "26",
    photo: "/galerija/kuhinja-smedja-crna.jpg",
    title: "Smeđa kuhinja s crnim zastorom",
    category: "Moderna",
    location: "Pula",
    featured: false,
  },
  {
    id: "27",
    photo: "/galerija/kuhinja-siva-gloss.jpg",
    title: "Siva gloss kuhinja s crnim akcentima",
    category: "Moderna",
    location: "Rijeka",
    featured: false,
  },
  {
    id: "28",
    photo: "/galerija/kuhinja-bijela-drvo-velik.jpg",
    title: "Velika bijela kuhinja s otokom i drvom",
    category: "Premium",
    location: "Zagreb",
    featured: false,
  },
  {
    id: "29",
    photo: "/galerija/kuhinja-bijela-gloss-2.jpg",
    title: "Bijela visoki sjaj s drvenom pozadinom",
    category: "Minimal",
    location: "Split",
    featured: false,
  },
  {
    id: "30",
    photo: "/galerija/kuhinja-bijela-drvo-2.jpg",
    title: "Bijela kuhinja s drvenom pozadinom",
    category: "Minimal",
    location: "Šibenik",
    featured: false,
  },
];

export default function GalerijaPage() {
  return (
    <main>
      <Header />

      {/* ── Hero ── */}
      <section className="relative min-h-[40vh] flex items-center justify-center pt-20 lg:pt-24">
        <Image
          src="/galerija/kuhinja-siva-mramor.jpg"
          alt="Galerija kuhinja"
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/70 via-black/60 to-black/70" />
        <div className="relative text-center px-6">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="text-accent text-xs tracking-[0.4em] uppercase font-light mb-4"
          >
            GALERIJA
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.1 }}
            className="font-serif text-5xl lg:text-6xl font-light text-white leading-tight"
          >
            Naše kuhinje
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            className="text-white/60 font-light mt-4 text-base max-w-md mx-auto"
          >
            Svaka kuhinja nastaje prema vašim dimenzijama i željama.
          </motion.p>
        </div>
      </section>

      {/* ── Gallery Grid ── */}
      <section className="bg-stone-50 py-20">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-[320px]">
            {projects.map((project, index) => (
              <motion.div
                key={project.id}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.6, delay: index * 0.08 }}
                className={`relative overflow-hidden group cursor-pointer ${
                  project.featured ? "lg:row-span-2" : ""
                }`}
              >
                <Image
                  src={project.photo}
                  alt={project.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-5">
                  <span className="inline-block bg-accent/90 text-brand-black text-[10px] px-2.5 py-1 tracking-wider uppercase mb-2">
                    {project.category}
                  </span>
                  <h3 className="font-serif text-lg font-light text-white leading-snug">
                    {project.title}
                  </h3>
                  <p className="text-white/50 text-xs mt-1 font-light">{project.location}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Bottom CTA */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-center mt-20"
          >
            <p className="font-serif text-2xl lg:text-3xl font-light text-brand-black mb-6">
              Zainteresirani za vašu kuhinju?
            </p>
            <Link
              href="/kontakt"
              className="inline-block bg-brand-black text-white px-10 py-4 text-sm tracking-wider hover:bg-brand-dark transition-colors"
            >
              Zatražite ponudu
            </Link>
          </motion.div>
        </div>
      </section>

      <Footer />
      <WhatsAppButton />
    </main>
  );
}
