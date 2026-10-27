"use client";

/**
 * The phone's first screen at /studio (no ?k= link): "Kako želite početi?" over a photo of a real EMNA kitchen, and
 * the ways in as big cards near the thumb — [Nastavite svoju kuhinju: a kitchen saved on this device, lib/studio/autosave.ts]
 * [Opišite kuhinju (AI): AiEntry.tsx, only when the AI helper is enabled] [Korak po korak] [Otvorite 3D odmah]. Any other
 * way than "Nastavite" starts a new kitchen. The 3D engine is not started while this shows (only its code is fetched).
 * A phone held sideways (`landscape`) has the photo at the left and the cards beside it.
 */
import Image from "next/image";
import { motion } from "framer-motion";
import type { ReactNode } from "react";
import { Arrow } from "@/components/ui/Button";
import { CubeIcon, LayersIcon } from "../icons";
import { EASE } from "../meta";
import { AiStartCard } from "./AiEntry";

/** a finished kitchen of the gallery (lib/gallery.ts), clean on every side: no stickers on the appliances */
const BACKDROP = "/galerija/kuhinja-tamna-drvo-l.jpg";

function ResumeIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={className} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4.5v3.8h3.8" />
      <path d="M12 8v4.2l2.8 1.8" />
    </svg>
  );
}

export function PhoneStart({
  onWizard,
  on3d,
  onAi,
  aiBusy = false,
  resume,
  landscape = false,
  reduce,
}: {
  onWizard: () => void;
  on3d: () => void;
  /** the AI entry (AiStartCard) — absent: not shown */
  onAi?: () => void;
  /** the AI is working on a kitchen */
  aiBusy?: boolean;
  /** a kitchen saved on this device: the first choice, "Nastavite svoju kuhinju" — absent: none */
  resume?: { label: string; onResume: () => void };
  /** the phone is held sideways */
  landscape?: boolean;
  reduce: boolean;
}) {
  const rise = (i: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    animate: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.7, delay: reduce ? 0 : 0.12 + i * 0.07, ease: EASE } },
  });
  return (
    <motion.section
      aria-labelledby="studio-start-title"
      className={`absolute inset-0 z-50 flex overflow-y-auto overscroll-contain bg-ink ${landscape ? "flex-row" : "flex-col"}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.35, ease: EASE } }}
    >
      <div
        className={`relative shrink-0 overflow-hidden ${
          landscape ? "sticky top-0 h-full w-[40%]" : resume ? "h-[32svh] min-h-[180px]" : "h-[42svh] min-h-[220px]"
        }`}
      >
        <Image
          src={BACKDROP}
          alt=""
          fill
          sizes={landscape ? "40vw" : "100vw"}
          loading="eager"
          fetchPriority="high"
          className="object-cover object-[50%_45%]"
        />
        <span aria-hidden="true" className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-ink-900/80 to-transparent" />
        {landscape ? (
          <span aria-hidden="true" className="absolute inset-y-0 right-0 w-[55%] bg-gradient-to-l from-ink via-ink/60 to-transparent" />
        ) : (
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-[70%] bg-gradient-to-t from-ink via-ink/75 to-transparent" />
        )}
      </div>

      <div
        className={`relative flex flex-1 flex-col pb-[calc(18px+env(safe-area-inset-bottom))] ${
          landscape ? "min-h-full px-6 pt-16" : "-mt-20 px-5"
        }`}
      >
        <motion.p {...rise(0)} className="eyebrow text-accent">
          3D studio
        </motion.p>
        <motion.h2 {...rise(1)} id="studio-start-title" className={`display mt-3 ${landscape ? "text-[28px]" : "text-[34px]"}`}>
          Kako želite početi?
        </motion.h2>
        <motion.p {...rise(2)} className="mt-3 max-w-[34ch] text-[14px] leading-relaxed text-fg/70">
          {resume
            ? "Vaša zadnja kuhinja spremljena je na ovom uređaju — nastavite je ili složite novu."
            : "Složite kuhinju po svojim mjerama — okvirnu cijenu vidite odmah."}
        </motion.p>

        <div className={`mt-auto space-y-2.5 ${landscape ? "pt-5" : "pt-7"}`}>
          {resume && (
            <motion.div {...rise(3)}>
              <StartCard
                primary
                icon={<ResumeIcon className="h-6 w-6" />}
                title="Nastavite svoju kuhinju"
                note={resume.label}
                onClick={resume.onResume}
              />
            </motion.div>
          )}
          {onAi && (
            <motion.div {...rise(4)}>
              <AiStartCard onOpen={onAi} busy={aiBusy} />
            </motion.div>
          )}
          <motion.div {...rise(5)}>
            <StartCard
              primary={!resume}
              icon={<LayersIcon className="h-6 w-6" />}
              title={resume ? "Nova kuhinja, korak po korak" : "Korak po korak"}
              note="Oblik, mjere, stil i uređaji — četiri kratka koraka."
              onClick={onWizard}
            />
          </motion.div>
          <motion.div {...rise(6)}>
            <StartCard
              icon={<CubeIcon className="h-6 w-6" />}
              title="Otvorite 3D odmah"
              note="Krenite od gotove kuhinje i mijenjajte je u 3D-u."
              onClick={on3d}
            />
          </motion.div>
        </div>
        <motion.p {...rise(7)} className="mt-4 text-center text-[11.5px] text-mut">
          Bez registracije · upit šaljete tek kad želite
        </motion.p>
      </div>
    </motion.section>
  );
}

function StartCard({ icon, title, note, onClick, primary = false }: { icon: ReactNode; title: string; note: string; onClick: () => void; primary?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-[76px] w-full items-center gap-4 rounded-[22px] px-4 py-3.5 text-left transition-colors duration-300 ease-premium ${
        primary ? "bg-accent text-ink active:bg-fg" : "border border-white/[0.14] bg-white/[0.03] text-fg active:bg-white/[0.07]"
      }`}
    >
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${primary ? "bg-ink/10 text-ink" : "bg-white/[0.06] text-accent"}`}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-semibold leading-tight">{title}</span>
        <span className={`mt-1 block text-[12.5px] leading-snug ${primary ? "text-ink/65" : "text-mut"}`}>{note}</span>
      </span>
      <Arrow />
    </button>
  );
}
