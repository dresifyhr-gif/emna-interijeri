"use client";

import { motion } from "framer-motion";

const testimonials = [
  {
    quote:
      "Kuhinja je ispala još bolje nego što smo zamislili. Sve je bilo profesionalno, precizno i na vrijeme. Preporučujemo EMNA Interijeri svima koji žele ozbiljnu ekipu.",
    author: "Marija i Ivan Kovač",
    location: "Zagreb",
    project: "Moderna kuhinja s otokom",
  },
  {
    quote:
      "Od prve ideje do montaže sve je bilo na razini ozbiljne europske firme. Kvaliteta materijala i preciznost izrade su impresivni.",
    author: "Ana Perić",
    location: "Split",
    project: "Minimalistička kuhinja",
  },
  {
    quote:
      "Cijeli proces je bio glatko vođen. 3D projekt koji smo dobili na početku odgovarao je gotovoj kuhinji do svakog detalja.",
    author: "Tomislav Marić",
    location: "Rijeka",
    project: "L kuhinja po mjeri",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="bg-stone-75 py-24 lg:py-32">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-16">
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="text-accent text-xs tracking-[0.35em] uppercase font-light mb-4"
          >
            Recenzije
          </motion.p>
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.1 }}
            className="font-serif text-4xl lg:text-5xl font-light text-brand-black"
          >
            Što kažu naši klijenti
          </motion.h2>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {testimonials.map((t, index) => (
            <motion.div
              key={t.author}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.6, delay: index * 0.12 }}
              className="bg-white border border-stone-100 p-8 flex flex-col"
            >
              {/* Stars */}
              <div className="flex gap-0.5 mb-6">
                {[...Array(5)].map((_, i) => (
                  <svg key={i} width="14" height="14" viewBox="0 0 14 14" fill="#C9B99A">
                    <path d="M7 1l1.8 3.6 4 .6-2.9 2.8.7 3.9L7 10.1l-3.6 1.8.7-3.9L1.2 5.2l4-.6L7 1z" />
                  </svg>
                ))}
              </div>

              {/* Quote */}
              <p className="text-brand-dark font-light leading-relaxed text-base flex-1">
                &ldquo;{t.quote}&rdquo;
              </p>

              {/* Divider */}
              <div className="w-8 h-px bg-accent mt-8 mb-6" />

              {/* Author */}
              <div>
                <p className="font-medium text-sm text-brand-black">{t.author}</p>
                <p className="text-xs text-stone-400 mt-1 font-light">
                  {t.project} · {t.location}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
