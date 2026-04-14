"use client";

import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import Image from "next/image";

// ─── Types ────────────────────────────────────────────────────────────────────

type LayoutOption = "Ravna" | "L oblik" | "U oblik" | "Otok";
type StyleOption = "Minimal" | "Moderna" | "Drvo" | "Tamna" | "Svijetla";
type MaterialOption = "MDF Mat" | "MDF Sjaj" | "Drvo dekor" | "Kamen efekt";

interface KitchenConfig {
  layout: LayoutOption;
  width: number;
  height: number;
  depth: number;
  style: StyleOption;
  material: MaterialOption;
}

interface LeadForm {
  name: string;
  phone: string;
  email: string;
  note: string;
}

// ─── Data ─────────────────────────────────────────────────────────────────────

const LAYOUT_OPTIONS = [
  { id: "Ravna" as LayoutOption,   label: "Ravna",   desc: "Linearan raspored" },
  { id: "L oblik" as LayoutOption, label: "L oblik", desc: "Kutni raspored" },
  { id: "U oblik" as LayoutOption, label: "U oblik", desc: "Trostruka linija" },
  { id: "Otok" as LayoutOption,    label: "Otok",    desc: "S kuhinjskim otokom" },
] as const;

const STYLE_OPTIONS = [
  { id: "Minimal" as StyleOption,  label: "Minimal",  swatch: "#F5F5F0", image: "/kuhinja-5.png" },
  { id: "Moderna" as StyleOption,  label: "Moderna",  swatch: "#D4D0CC", image: "/kuhinja-2.png" },
  { id: "Drvo" as StyleOption,     label: "Drvo",     swatch: "#C4A07A", image: "/kuhinja-4.png" },
  { id: "Tamna" as StyleOption,    label: "Tamna",    swatch: "#2A2A2A", image: "/kuhinja-6.png" },
  { id: "Svijetla" as StyleOption, label: "Svijetla", swatch: "#F8F8FF", image: "/kuhinja-3.png" },
] as const;

const MATERIAL_OPTIONS = [
  { id: "MDF Mat" as MaterialOption,     label: "MDF Mat",     sub: "Premium mat završetak",     hex: "#D8D4CE" },
  { id: "MDF Sjaj" as MaterialOption,    label: "MDF Sjaj",    sub: "Visoki sjaj, anti-prst",    hex: "#ECEAE4" },
  { id: "Drvo dekor" as MaterialOption,  label: "Drvo dekor",  sub: "Prirodni uzorak drva",      hex: "#C4A07A" },
  { id: "Kamen efekt" as MaterialOption, label: "Kamen efekt", sub: "Kameni izgled, MDF osnova", hex: "#A8A49E" },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function calcPrice(cfg: KitchenConfig): string {
  const meters = (cfg.width / 100) * 2; // gornji + donji dio
  const low = Math.round((meters * 700) / 50) * 50;
  const high = Math.round((meters * 1000) / 50) * 50;
  return `${low.toLocaleString("hr-HR")} € – ${high.toLocaleString("hr-HR")} €`;
}

function getPreviewImage(style: StyleOption): string {
  const s = STYLE_OPTIONS.find((o) => o.id === style)!;
  return s.image;
}

// ─── Layout SVG Icons ─────────────────────────────────────────────────────────

function RavnaIcon({ active }: { active: boolean }) {
  const c = active ? "#C9B99A" : "#94908A";
  return (
    <svg viewBox="0 0 48 32" fill="none" className="w-full max-w-[56px]">
      <rect x="2" y="3" width="44" height="10" stroke={c} strokeWidth={1.5} />
      <rect x="2" y="19" width="44" height="10" stroke={c} strokeWidth={1.5} />
      <line x1="10" y1="3" x2="10" y2="13" stroke={c} strokeWidth={1.5} />
      <line x1="18" y1="3" x2="18" y2="13" stroke={c} strokeWidth={1.5} />
      <line x1="26" y1="3" x2="26" y2="13" stroke={c} strokeWidth={1.5} />
      <line x1="34" y1="3" x2="34" y2="13" stroke={c} strokeWidth={1.5} />
      <line x1="10" y1="19" x2="10" y2="29" stroke={c} strokeWidth={1.5} />
      <line x1="18" y1="19" x2="18" y2="29" stroke={c} strokeWidth={1.5} />
      <line x1="26" y1="19" x2="26" y2="29" stroke={c} strokeWidth={1.5} />
      <line x1="34" y1="19" x2="34" y2="29" stroke={c} strokeWidth={1.5} />
    </svg>
  );
}

function LOblicIcon({ active }: { active: boolean }) {
  const c = active ? "#C9B99A" : "#94908A";
  return (
    <svg viewBox="0 0 40 40" fill="none" className="w-full max-w-[56px]">
      <rect x="2" y="2" width="10" height="30" stroke={c} strokeWidth={1.5} />
      <rect x="2" y="30" width="36" height="8" stroke={c} strokeWidth={1.5} />
      <line x1="2" y1="10" x2="12" y2="10" stroke={c} strokeWidth={1.5} />
      <line x1="2" y1="18" x2="12" y2="18" stroke={c} strokeWidth={1.5} />
      <line x1="14" y1="30" x2="14" y2="38" stroke={c} strokeWidth={1.5} />
      <line x1="24" y1="30" x2="24" y2="38" stroke={c} strokeWidth={1.5} />
      <line x1="32" y1="30" x2="32" y2="38" stroke={c} strokeWidth={1.5} />
    </svg>
  );
}

function UOblicIcon({ active }: { active: boolean }) {
  const c = active ? "#C9B99A" : "#94908A";
  return (
    <svg viewBox="0 0 48 40" fill="none" className="w-full max-w-[56px]">
      <rect x="2" y="2" width="9" height="30" stroke={c} strokeWidth={1.5} />
      <rect x="37" y="2" width="9" height="30" stroke={c} strokeWidth={1.5} />
      <rect x="2" y="30" width="44" height="8" stroke={c} strokeWidth={1.5} />
      <line x1="2" y1="10" x2="11" y2="10" stroke={c} strokeWidth={1.5} />
      <line x1="2" y1="18" x2="11" y2="18" stroke={c} strokeWidth={1.5} />
      <line x1="37" y1="10" x2="46" y2="10" stroke={c} strokeWidth={1.5} />
      <line x1="37" y1="18" x2="46" y2="18" stroke={c} strokeWidth={1.5} />
      <line x1="15" y1="30" x2="15" y2="38" stroke={c} strokeWidth={1.5} />
      <line x1="26" y1="30" x2="26" y2="38" stroke={c} strokeWidth={1.5} />
      <line x1="35" y1="30" x2="35" y2="38" stroke={c} strokeWidth={1.5} />
    </svg>
  );
}

function OtokIcon({ active }: { active: boolean }) {
  const c = active ? "#C9B99A" : "#94908A";
  return (
    <svg viewBox="0 0 48 40" fill="none" className="w-full max-w-[56px]">
      <rect x="2" y="2" width="44" height="8" stroke={c} strokeWidth={1.5} />
      <rect x="2" y="30" width="44" height="8" stroke={c} strokeWidth={1.5} />
      <rect x="14" y="15" width="20" height="8" stroke={c} strokeWidth={1.5} />
      <line x1="10" y1="2" x2="10" y2="10" stroke={c} strokeWidth={1.5} />
      <line x1="20" y1="2" x2="20" y2="10" stroke={c} strokeWidth={1.5} />
      <line x1="30" y1="2" x2="30" y2="10" stroke={c} strokeWidth={1.5} />
      <line x1="38" y1="2" x2="38" y2="10" stroke={c} strokeWidth={1.5} />
    </svg>
  );
}

function layoutIcon(id: LayoutOption, active: boolean) {
  if (id === "Ravna")   return <RavnaIcon active={active} />;
  if (id === "L oblik") return <LOblicIcon active={active} />;
  if (id === "U oblik") return <UOblicIcon active={active} />;
  return <OtokIcon active={active} />;
}

// ─── Step Icons ───────────────────────────────────────────────────────────────

function ProStorIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="1" y="1" width="6" height="6" />
      <rect x="9" y="1" width="6" height="6" />
      <rect x="1" y="9" width="6" height="6" />
      <rect x="9" y="9" width="6" height="6" />
    </svg>
  );
}

function DimenzijIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <line x1="1" y1="8" x2="15" y2="8" />
      <line x1="1" y1="5" x2="1" y2="11" />
      <line x1="15" y1="5" x2="15" y2="11" />
      <line x1="5" y1="8" x2="5" y2="6" />
      <line x1="9" y1="8" x2="9" y2="6" />
      <line x1="13" y1="8" x2="13" y2="6" />
    </svg>
  );
}

function StilIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <path d="M8 1L9.5 5.5H14.5L10.5 8.5L12 13L8 10L4 13L5.5 8.5L1.5 5.5H6.5Z" />
    </svg>
  );
}

function MaterijIcon() {
  return (
    <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <rect x="1" y="2" width="14" height="3.5" />
      <rect x="1" y="6.25" width="14" height="3.5" />
      <rect x="1" y="10.5" width="14" height="3.5" />
    </svg>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function FormField({
  label, placeholder, value, onChange, type = "text", required = false,
}: {
  label: string; placeholder: string; value: string; onChange: (v: string) => void;
  type?: string; required?: boolean;
}) {
  return (
    <div>
      <label className="block text-xs tracking-wider text-stone-500 uppercase mb-2">{label}</label>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        required={required}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3.5 text-sm text-brand-black placeholder:text-stone-300 focus:outline-none focus:border-accent transition-colors"
      />
    </div>
  );
}

function TextAreaField({
  label, placeholder, value, onChange,
}: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs tracking-wider text-stone-500 uppercase mb-2">{label}</label>
      <textarea
        placeholder={placeholder}
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        className="w-full bg-white border border-stone-200 rounded-xl px-4 py-3.5 text-sm text-brand-black placeholder:text-stone-300 focus:outline-none focus:border-accent transition-colors resize-none"
      />
    </div>
  );
}

function SuccessState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center py-8"
    >
      <div className="w-16 h-16 bg-accent/10 rounded-full flex items-center justify-center mx-auto mb-6">
        <svg className="w-8 h-8 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 13l4 4L19 7" />
        </svg>
      </div>
      <h4 className="font-serif text-2xl font-light mb-3">Zahtjev primljen</h4>
      <p className="text-stone-500 font-light text-sm max-w-sm mx-auto">
        Javit ćemo vam se unutar 24 sata s 3D prijedlogom i točnom ponudom za vašu kuhinju.
      </p>
    </motion.div>
  );
}

// ─── Step definitions ─────────────────────────────────────────────────────────

const STEPS = [
  { label: "Prostor",   number: "01", icon: <ProStorIcon /> },
  { label: "Dimenzije", number: "02", icon: <DimenzijIcon /> },
  { label: "Stil",      number: "03", icon: <StilIcon /> },
  { label: "Materijal", number: "04", icon: <MaterijIcon /> },
] as const;

// ─── Main component ───────────────────────────────────────────────────────────

export default function KitchenConfiguratorSection() {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [config, setConfig] = useState<KitchenConfig>({
    layout: "L oblik",
    width: 220,
    height: 230,
    depth: 60,
    style: "Moderna",
    material: "MDF Mat",
  });
  const [form, setForm] = useState<LeadForm>({ name: "", phone: "", email: "", note: "" });
  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1800));
    setSubmitting(false);
    setSubmitted(true);
  }

  return (
    <section id="konfigurator" className="bg-white py-24 lg:py-32 overflow-hidden">
      <div className="max-w-7xl mx-auto px-6 lg:px-8">

        {/* ── Section header ── */}
        <div className="text-center mb-6">
          <motion.span
            whileInView={{ opacity: 1 }}
            initial={{ opacity: 0 }}
            viewport={{ once: true }}
            className="inline-block text-[10px] tracking-[0.4em] uppercase text-accent mb-4"
          >
            KONFIGURATOR
          </motion.span>
          <motion.h2
            whileInView={{ opacity: 1, y: 0 }}
            initial={{ opacity: 0, y: 20 }}
            viewport={{ once: true }}
            className="font-serif text-4xl lg:text-6xl font-light leading-tight"
          >
            Dizajnirajte svoju kuhinju
          </motion.h2>
          <motion.p
            whileInView={{ opacity: 1 }}
            initial={{ opacity: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="text-stone-500 font-light mt-4 max-w-xl mx-auto leading-relaxed"
          >
            Odaberite raspored, dimenzije, stil i materijale te zatražite 3D prijedlog i točnu ponudu.
          </motion.p>
        </div>

        {/* ── Badges ── */}
        <div className="flex flex-wrap justify-center gap-3 mb-14">
          {["Napredno 3D planiranje", "Bez obveze", "Ponuda unutar 24h"].map((badge) => (
            <span
              key={badge}
              className="bg-stone-50 border border-stone-200 text-stone-600 text-xs px-5 py-2 rounded-full font-light"
            >
              {badge}
            </span>
          ))}
        </div>

        {/* ── Configurator card ── */}
        <motion.div
          whileInView={{ opacity: 1, y: 0 }}
          initial={{ opacity: 0, y: 40 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
          className="grid lg:grid-cols-[380px_1fr] rounded-2xl border border-stone-100 shadow-2xl shadow-stone-100 overflow-hidden bg-white"
        >
          {/* ── LEFT PANEL ── */}
          <div className="flex flex-col p-6 border-r border-stone-100 bg-stone-50/50 min-h-[600px]">

            {/* Step navigation */}
            <div className="space-y-1 mb-6">
              {STEPS.map((s, i) => {
                const active = step === i;
                return (
                  <button
                    key={s.label}
                    onClick={() => setStep(i as 0 | 1 | 2 | 3)}
                    className={`w-full flex items-center gap-3 px-5 py-4 cursor-pointer border-l-2 transition-all text-left ${
                      active
                        ? "border-accent bg-stone-50"
                        : "border-transparent hover:border-stone-200"
                    }`}
                  >
                    <span className="font-mono text-xs text-stone-400">{s.number}</span>
                    <span className={active ? "text-accent" : "text-stone-400"}>{s.icon}</span>
                    <span className="text-sm font-medium flex-1">{s.label}</span>
                    {active && (
                      <svg className="w-4 h-4 text-stone-400" fill="none" viewBox="0 0 16 16" stroke="currentColor" strokeWidth={1.5}>
                        <path d="M6 4l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Step content */}
            <div className="flex-1">
              <AnimatePresence mode="wait">
                {step === 0 && (
                  <motion.div
                    key={0}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="text-xs tracking-wider text-stone-500 uppercase mb-4">Odaberite raspored</p>
                    <div className="grid grid-cols-2 gap-3">
                      {LAYOUT_OPTIONS.map((opt) => {
                        const selected = config.layout === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => setConfig((c) => ({ ...c, layout: opt.id }))}
                            className={`relative flex flex-col items-center gap-3 p-5 rounded-xl border cursor-pointer transition-all text-center ${
                              selected
                                ? "border-accent bg-stone-50 shadow-sm"
                                : "border-stone-200 bg-white hover:border-stone-300"
                            }`}
                          >
                            {layoutIcon(opt.id, selected)}
                            <span className="text-sm font-medium">{opt.label}</span>
                            <span className="text-stone-400 text-xs">{opt.desc}</span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}

                {step === 1 && (
                  <motion.div
                    key={1}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.25 }}
                    className="space-y-7"
                  >
                    {/* Širina */}
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-stone-600">Širina</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded text-xs font-mono">{config.width} cm</span>
                      </div>
                      <input
                        type="range" min={160} max={400} step={10} value={config.width}
                        onChange={(e) => setConfig((c) => ({ ...c, width: Number(e.target.value) }))}
                        className="w-full h-0.5 bg-stone-200 rounded appearance-none cursor-pointer accent-brand-black"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-stone-400">160 cm</span>
                        <span className="text-[10px] text-stone-400">400 cm</span>
                      </div>
                    </div>

                    {/* Visina */}
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-stone-600">Visina</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded text-xs font-mono">{config.height} cm</span>
                      </div>
                      <input
                        type="range" min={200} max={260} step={5} value={config.height}
                        onChange={(e) => setConfig((c) => ({ ...c, height: Number(e.target.value) }))}
                        className="w-full h-0.5 bg-stone-200 rounded appearance-none cursor-pointer accent-brand-black"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-stone-400">200 cm</span>
                        <span className="text-[10px] text-stone-400">260 cm</span>
                      </div>
                    </div>

                    {/* Dubina */}
                    <div>
                      <div className="flex justify-between mb-2">
                        <span className="text-sm text-stone-600">Dubina</span>
                        <span className="bg-stone-100 px-2 py-0.5 rounded text-xs font-mono">{config.depth} cm</span>
                      </div>
                      <input
                        type="range" min={55} max={70} step={5} value={config.depth}
                        onChange={(e) => setConfig((c) => ({ ...c, depth: Number(e.target.value) }))}
                        className="w-full h-0.5 bg-stone-200 rounded appearance-none cursor-pointer accent-brand-black"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-stone-400">55 cm</span>
                        <span className="text-[10px] text-stone-400">70 cm</span>
                      </div>
                    </div>
                  </motion.div>
                )}

                {step === 2 && (
                  <motion.div
                    key={2}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="text-xs tracking-wider text-stone-500 uppercase mb-4">Odaberite stil</p>
                    <div className="flex flex-wrap gap-2">
                      {STYLE_OPTIONS.map((opt) => {
                        const selected = config.style === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => setConfig((c) => ({ ...c, style: opt.id }))}
                            className={`flex items-center gap-2 px-4 py-2.5 rounded-full border text-sm cursor-pointer transition-all ${
                              selected
                                ? "border-brand-black bg-brand-black text-white"
                                : "border-stone-200 bg-white text-stone-600 hover:border-stone-400"
                            }`}
                          >
                            <span
                              className="w-3 h-3 rounded-full flex-shrink-0 border border-stone-200"
                              style={{ backgroundColor: opt.swatch }}
                            />
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="text-xs text-stone-400 mt-4">Stil utječe na prikaz u 3D prijedlogu</p>
                  </motion.div>
                )}

                {step === 3 && (
                  <motion.div
                    key={3}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: 10 }}
                    transition={{ duration: 0.25 }}
                  >
                    <p className="text-xs tracking-wider text-stone-500 uppercase mb-4">Odaberite površinu</p>
                    <div className="grid grid-cols-2 gap-3">
                      {MATERIAL_OPTIONS.map((opt) => {
                        const selected = config.material === opt.id;
                        return (
                          <button
                            key={opt.id}
                            onClick={() => setConfig((c) => ({ ...c, material: opt.id }))}
                            className={`flex items-center gap-3 p-4 rounded-xl border cursor-pointer transition-all text-left ${
                              selected
                                ? "border-accent shadow-sm"
                                : "border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <span
                              className="w-10 h-10 rounded-lg flex-shrink-0"
                              style={{ backgroundColor: opt.hex }}
                            />
                            <span>
                              <span className="block font-medium text-sm">{opt.label}</span>
                              <span className="block text-xs text-stone-400">{opt.sub}</span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Selection summary + nav button */}
            <div className="mt-auto pt-6 border-t border-stone-100">
              <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-3">Vaš odabir</p>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400 font-light">Raspored</span>
                  <span className="font-medium">{config.layout}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400 font-light">Dimenzije</span>
                  <span className="font-medium font-mono text-xs">{config.width}×{config.height}×{config.depth} cm</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400 font-light">Stil</span>
                  <span className="font-medium">{config.style}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-stone-400 font-light">Materijal</span>
                  <span className="font-medium">{config.material}</span>
                </div>
              </div>

              {step < 3 ? (
                <button
                  onClick={() => setStep((prev) => (prev + 1) as 0 | 1 | 2 | 3)}
                  className="mt-5 w-full py-3 bg-brand-black text-white text-sm tracking-wider hover:bg-brand-dark transition-colors rounded-lg"
                >
                  Dalje →
                </button>
              ) : (
                <button
                  onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                  className="mt-5 w-full py-3 bg-accent text-white text-sm tracking-wider hover:opacity-90 transition-opacity rounded-lg"
                >
                  Zatražite 3D prijedlog ↓
                </button>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL — preview ── */}
          <div className="relative flex flex-col h-full min-h-[560px] bg-stone-100">
            <AnimatePresence mode="wait">
              <motion.div
                key={config.style}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.6 }}
              >
                <Image
                  src={getPreviewImage(config.style)}
                  alt="Kuhinja preview"
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 60vw"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              </motion.div>
            </AnimatePresence>

            {/* Top-right badge */}
            <div className="absolute top-4 right-4 z-10">
              <span className="bg-white/90 backdrop-blur-sm text-brand-black text-xs font-medium px-3 py-1.5 rounded-full shadow-sm">
                Napredno 3D planiranje
              </span>
            </div>

            {/* Top-left floating info */}
            <div className="absolute top-4 left-4 z-10 flex flex-col gap-2">
              <motion.div
                key={config.layout}
                layout
                className="bg-white/15 backdrop-blur-md border border-white/30 text-white text-xs px-3 py-1.5 rounded-full"
              >
                📐 {config.layout}
              </motion.div>
              <motion.div
                key={config.material}
                layout
                className="bg-white/15 backdrop-blur-md border border-white/30 text-white text-xs px-3 py-1.5 rounded-full"
              >
                🏷 {config.material}
              </motion.div>
            </div>

            {/* Bottom overlay */}
            <div className="absolute bottom-0 left-0 right-0 z-10 p-6">
              <div className="bg-white/95 backdrop-blur-md rounded-2xl p-5 shadow-2xl">
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-[10px] tracking-widest uppercase text-stone-400 mb-1">Procjena investicije</p>
                    <motion.p
                      key={calcPrice(config)}
                      className="font-serif text-2xl text-brand-black font-light"
                      layout
                    >
                      {calcPrice(config)}
                    </motion.p>
                    <p className="text-[10px] text-stone-400 mt-1">Finalna cijena ovisi o detaljima projekta</p>
                  </div>
                  <button
                    onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                    className="bg-brand-black text-white px-6 py-3 text-sm tracking-wider hover:bg-brand-dark transition-colors rounded-xl whitespace-nowrap"
                  >
                    Zatražite 3D prijedlog →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* ── Lead form ── */}
        <div ref={formRef} className="mt-16 max-w-4xl mx-auto">
          <div className="bg-stone-50 rounded-2xl p-8 lg:p-12 border border-stone-100">

            {/* Form header */}
            <div className="text-center mb-10">
              <span className="text-[10px] tracking-[0.35em] uppercase text-accent">Zatražite ponudu</span>
              <h3 className="font-serif text-3xl lg:text-4xl font-light mt-2 mb-3">Pošaljite svoj odabir</h3>
              <p className="text-stone-500 font-light text-sm">
                Na temelju odabira pripremamo 3D prijedlog i točnu ponudu unutar 24 sata.
              </p>
            </div>

            {/* Selection summary chips */}
            <div className="flex flex-wrap gap-2 justify-center mb-10">
              <span className="bg-white border border-stone-200 text-stone-600 text-xs px-4 py-2 rounded-full">
                Raspored: {config.layout}
              </span>
              <span className="bg-white border border-stone-200 text-stone-600 text-xs px-4 py-2 rounded-full">
                Stil: {config.style}
              </span>
              <span className="bg-white border border-stone-200 text-stone-600 text-xs px-4 py-2 rounded-full">
                Materijal: {config.material}
              </span>
              <span className="bg-accent/10 border border-accent/30 text-brand-black text-xs px-4 py-2 rounded-full font-medium">
                Procjena: {calcPrice(config)}
              </span>
            </div>

            {/* Form or success */}
            {submitted ? (
              <SuccessState />
            ) : (
              <form onSubmit={handleSubmit}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                  <FormField
                    label="Ime i prezime"
                    placeholder="Vaše ime"
                    value={form.name}
                    onChange={(v) => setForm((f) => ({ ...f, name: v }))}
                    required
                  />
                  <FormField
                    label="Broj telefona"
                    placeholder="+385 xx xxx xxxx"
                    type="tel"
                    value={form.phone}
                    onChange={(v) => setForm((f) => ({ ...f, phone: v }))}
                    required
                  />
                  <FormField
                    label="Email adresa"
                    placeholder="email@primjer.hr"
                    type="email"
                    value={form.email}
                    onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    required
                  />
                  <FormField
                    label="Dimenzije prostora"
                    placeholder="npr. 320 × 240 cm"
                    value={`${config.width} × ${config.height} cm`}
                    onChange={() => {}}
                  />
                </div>
                <TextAreaField
                  label="Napomena"
                  placeholder="Dodatne napomene, preferencije, pitanja..."
                  value={form.note}
                  onChange={(v) => setForm((f) => ({ ...f, note: v }))}
                />

                <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mt-8">
                  <p className="text-xs text-stone-400 max-w-xs">
                    Na temelju odabira pripremamo 3D prijedlog i točnu ponudu. Bez obveze.
                  </p>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="bg-brand-black text-white px-10 py-4 text-sm tracking-widest font-medium hover:bg-brand-dark disabled:opacity-50 transition-colors rounded-xl whitespace-nowrap"
                  >
                    {submitting ? "Šaljem..." : "Pošalji za 3D dizajn →"}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

      </div>
    </section>
  );
}
