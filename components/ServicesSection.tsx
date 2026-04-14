"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const services = [
  {
    id: "kuhinje",
    category: "Kuhinje",
    title: "Kuhinje po mjeri",
    desc: "MDF mat, visoki sjaj, kamene ploče. Svaki detalj projektiran za vaš prostor.",
    href: "/kuhinje",
    image: "/kuhinja-1.png",
    colSpan: "md:col-span-2",
    aspect: "aspect-[4/3]",
  },
  {
    id: "ormari",
    category: "Ormari",
    title: "Ormari i garderobe",
    desc: "Ugradbeni ormari i walk-in garderobe maksimalnog kapaciteta.",
    href: "/ormari",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
    colSpan: "md:col-span-1",
    aspect: "aspect-[3/4]",
  },
  {
    id: "spavace",
    category: "Spavaće sobe",
    title: "Spavaće sobe",
    desc: "Kreveti, noćni ormarići, toaletni stolovi — kompletni setovi.",
    href: "/interijeri",
    image: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80",
    colSpan: "md:col-span-1",
    aspect: "aspect-[3/4]",
  },
  {
    id: "poslovni",
    category: "Poslovni prostori",
    title: "Uredi i ordinacije",
    desc: "Recepcije, radne stanice, čekaonice — funkcionalno i reprezentativno.",
    href: "/interijeri",
    image: "https://images.unsplash.com/photo-1497366754035-f200968a6e72?auto=format&fit=crop&w=800&q=80",
    colSpan: "md:col-span-2",
    aspect: "aspect-[4/3]",
  },
  {
    id: "kompletan",
    category: "Kompletni interijer",
    title: "Kompletno opremanje apartmana",
    desc: "Predajte nam tlocrt — preuzimamo sve, od dizajna do posljednjeg vijka.",
    href: "/kontakt",
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=1600&q=80",
    colSpan: "md:col-span-3",
    aspect: "aspect-[16/6] lg:aspect-[16/5]",
  },
];

export default function ServicesSection() {
  return (
    <section className="py-24 lg:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
          <div>
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4 }}
              className="flex items-center gap-3 mb-4"
            >
              <div className="w-5 h-px bg-accent" />
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Naše usluge</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-serif text-4xl md:text-5xl font-light text-brand-black leading-tight"
            >
              Sve što vaš prostor
              <br />
              treba.
            </motion.h2>
          </div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="text-stone-400 font-light text-sm max-w-xs leading-relaxed"
          >
            Od pojedinačnih elemenata do kompletnog opremanja — sami biramo što odgovara vašim potrebama.
          </motion.p>
        </div>

        {/* Bento grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {services.map((service, i) => (
            <motion.div
              key={service.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`${service.colSpan}`}
            >
              <Link
                href={service.href}
                className={`group relative overflow-hidden block ${service.aspect} bg-stone-100`}
              >
                <Image
                  src={service.image}
                  alt={service.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                />
                {/* Gradient overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/15 transition-colors duration-500" />

                {/* Content */}
                <div className="absolute inset-0 flex flex-col justify-end p-6 lg:p-8">
                  <span className="text-accent text-[9px] tracking-[0.35em] uppercase font-light mb-2">
                    {service.category}
                  </span>
                  <h3 className="font-serif text-xl lg:text-2xl font-light text-white leading-tight mb-2">
                    {service.title}
                  </h3>
                  <p className="text-white/55 text-sm font-light leading-relaxed line-clamp-2 mb-4">
                    {service.desc}
                  </p>
                  <div className="flex items-center gap-2 text-white/60 group-hover:text-accent transition-colors duration-300">
                    <span className="text-xs tracking-wider">Saznaj više</span>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path d="M5 12h14M12 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                {/* Arrow top-right on hover */}
                <div className="absolute top-5 right-5 w-8 h-8 border border-white/0 group-hover:border-white/30 transition-all duration-300 flex items-center justify-center">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" className="opacity-0 group-hover:opacity-60 transition-opacity duration-300">
                    <path d="M7 17L17 7M7 7h10v10" />
                  </svg>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
