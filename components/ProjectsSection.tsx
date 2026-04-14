"use client";

import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";

const projects = [
  {
    id: "p1",
    title: "Kompletni interijer, Zagreb",
    category: "Apartman · 58m²",
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=80",
    span: "row-span-2",
  },
  {
    id: "p2",
    title: "Kuhinja s otokom",
    category: "Kuhinja · Nordijski stil",
    image: "/kuhinja-2.png",
    span: "",
  },
  {
    id: "p3",
    title: "Garderoba i spavaća",
    category: "Spavaća soba · Po mjeri",
    image: "https://images.unsplash.com/photo-1631049307264-da0ec9d70304?auto=format&fit=crop&w=800&q=80",
    span: "",
  },
  {
    id: "p4",
    title: "Kuhinja s ladicama",
    category: "Kuhinja · Moderni dizajn",
    image: "/kuhinja-3.png",
    span: "",
  },
  {
    id: "p5",
    title: "Walk-in garderoba",
    category: "Garderoba · 14m²",
    image: "https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?auto=format&fit=crop&w=800&q=80",
    span: "",
  },
];

export default function ProjectsSection() {
  return (
    <section className="py-24 lg:py-32 bg-stone-50">
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
              <span className="text-accent text-[10px] tracking-[0.38em] uppercase font-light">Naši projekti</span>
            </motion.div>
            <motion.h2
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="font-serif text-4xl md:text-5xl font-light text-brand-black leading-tight"
            >
              Svaki prostor
              <br />
              priča svoju priču.
            </motion.h2>
          </div>
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.2 }}
          >
            <Link
              href="/interijeri"
              className="inline-flex items-center gap-2 border border-brand-black text-brand-black text-xs tracking-[0.18em] uppercase px-6 py-3 hover:bg-brand-black hover:text-white transition-all duration-300"
            >
              Svi projekti
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </Link>
          </motion.div>
        </div>

        {/* Editorial grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 grid-rows-auto md:grid-rows-2 gap-3">
          {projects.map((project, i) => (
            <motion.div
              key={project.id}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.08 }}
              className={`${project.span}`}
            >
              <Link href="/interijeri" className="group relative overflow-hidden block h-64 md:h-full min-h-[240px] bg-stone-200">
                <Image
                  src={project.image}
                  alt={project.title}
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-105"
                  sizes="(max-width: 768px) 100vw, 33vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                <div className="absolute bottom-0 left-0 right-0 p-6">
                  <div className="text-accent text-[9px] tracking-[0.3em] uppercase font-light mb-1">{project.category}</div>
                  <div className="font-serif text-lg text-white font-light">{project.title}</div>
                </div>
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
