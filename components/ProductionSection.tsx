"use client";

import Image from "next/image";
import { motion } from "framer-motion";

const features = [
  "EU certificirani MDF materijali premium klase",
  "Precizna CNC izrada do milimetra",
  "Više od 1000 realiziranih projekata",
];

export default function ProductionSection() {
  return (
    <section className="flex flex-col lg:flex-row min-h-[600px]">
      {/* Image side */}
      <div className="relative lg:w-1/2 min-h-[400px] lg:min-h-full overflow-hidden">
        <Image
          src="/proizvodnja.png"
          alt="Moderna proizvodna hala EMNA Interijeri"
          fill
          className="object-cover"
        />
        <div className="absolute inset-0 bg-black/20" />
      </div>

      {/* Content side */}
      <motion.div
        initial={{ opacity: 0, x: 30 }}
        whileInView={{ opacity: 1, x: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.7 }}
        className="lg:w-1/2 bg-stone-50 flex flex-col justify-center p-12 lg:p-16 xl:p-24"
      >
        <p className="text-accent text-xs tracking-[0.3em] uppercase font-light">
          PROIZVODNJA
        </p>
        <h2 className="font-serif text-4xl lg:text-5xl font-light mt-4 leading-tight text-brand-black">
          Moderna proizvodnja<br />velikog kapaciteta
        </h2>

        <p className="text-stone-500 font-light leading-relaxed mt-6">
          Radimo s proizvođačima koji imaju više od 3 generacije zanata iza sebe.
          Svaka kuhinja izrađuje se prema preciznoj tehničkoj dokumentaciji,
          uz rigoroznu kontrolu kvalitete prije isporuke.
        </p>
        <p className="text-stone-500 font-light leading-relaxed mt-4">
          Koristimo isključivo EU certificirane MDF ploče premium klase —
          iste materijale koji se uvoze u cijelu zapadnu Europu. Kvaliteta
          koja se vidi i osjeća godinama, bez kompromisa.
        </p>

        {/* Feature list */}
        <ul className="mt-8 space-y-5">
          {features.map((feature) => (
            <li key={feature} className="flex items-start gap-3">
              <div className="w-8 h-px bg-accent mt-3 flex-shrink-0" />
              <span className="text-sm font-light text-brand-mid leading-relaxed">
                {feature}
              </span>
            </li>
          ))}
        </ul>
      </motion.div>
    </section>
  );
}
