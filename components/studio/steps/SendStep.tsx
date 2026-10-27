"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import { fetchCompanyContact, type CompanyContact } from "@/lib/lead-client";
import { TIMELINES } from "@/lib/lead-extras";
import { site, telHref, waHref } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { RadioGrid, SectionLabel } from "../controls";
import { CopyLinkButton } from "../CopyLink";
import { useMediaQuery } from "../hooks";
import { PdfButton, type PdfExportApi } from "../PdfExport";
import { ChevronRight, ChevronUp, Spinner } from "../icons";
import { EASE, eur } from "../meta";
import { SummaryList } from "../SummaryList";
import { MESSAGE_MAX, type LeadField, type LeadValues, type StudioLead } from "../useStudioLead";
import type { StepProps } from "./types";

export interface SendStepProps extends StepProps {
  lead: StudioLead;
  summary: string[];
  price: { low: number; high: number };
  preview: string | null;
  /** 3D is not available (no snapshot) */
  noEngine: boolean;
  getUrl: () => string;
  fieldId: (f: LeadField | "timeline" | "hp") => string;
  /** "Preuzmite PDF kuhinje" */
  pdf: PdfExportApi;
}

export function SendStep({ lead, summary, price, preview, noEngine, getUrl, fieldId, compact, pdf }: SendStepProps) {
  const reduce = Boolean(useReducedMotion());
  const uid = useId();
  /** phones: the form first, the kitchen folded into one row above it */
  const phone = useMediaQuery("(max-width: 767px)");
  const [kitchenOpen, setKitchenOpen] = useState(false);
  const formTopRef = useRef<HTMLDivElement>(null);
  const { values, errors, status, update, blur, submit } = lead;
  const sending = status === "sending";

  const onText =
    (key: "name" | "phone" | "email" | "city" | "message" | "website") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      update(key, e.target.value);

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void submit();
  }

  // phones: the step opens with the form at the top of the sheet — scrolled there, not focused (that would pop the
  // keyboard over half the screen)
  useEffect(() => {
    const el = formTopRef.current;
    if (!phone || !el) return;
    const box = scrollParent(el);
    if (box) box.scrollTop += el.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
  }, [phone]);

  const kitchen = (
    <>
      <KitchenPreview preview={preview} noEngine={noEngine} price={price} compact={compact} reduce={reduce} />
      <SummaryBlock summary={summary} />
      {/* the kitchen as a PDF */}
      <PdfButton
        pdf={pdf}
        label="Preuzmite PDF kuhinje"
        hint={
          noEngine
            ? "Tlocrt, nacrti zidova s kotama, popis elemenata i materijali — za vas ili za razgovor s nama."
            : "3D prikazi, tlocrt, nacrti zidova s kotama, popis elemenata i materijali — za vas ili za razgovor s nama."
        }
        className="mt-6"
      />
    </>
  );

  return (
    <div>
      {phone ? (
        <div ref={formTopRef}>
          <button
            type="button"
            onClick={() => setKitchenOpen((v) => !v)}
            aria-expanded={kitchenOpen}
            aria-controls={`${uid}-kitchen`}
            className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-ink-900/60 px-4 py-3 text-left transition-colors hover:border-white/20"
          >
            <span className="min-w-0 flex-1 truncate text-[13px] text-fg">
              <span className="text-fg/70">Vaša kuhinja</span>
              <span aria-hidden="true" className="mx-1.5 text-mut">
                ·
              </span>
              <span className="font-medium tabular-nums">
                {eur(price.low)} – {eur(price.high)} €
              </span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-[12.5px] font-medium text-accent">
              Sažetak
              <ChevronRight className={`h-4 w-4 transition-transform duration-300 ${kitchenOpen ? "rotate-90" : ""}`} />
            </span>
          </button>
          <AnimatePresence initial={false}>
            {kitchenOpen && (
              <motion.div
                key="kitchen"
                id={`${uid}-kitchen`}
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto", transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
                exit={{ opacity: 0, height: 0, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
                className="overflow-hidden"
              >
                <div className="pb-2 pt-4">{kitchen}</div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      ) : (
        kitchen
      )}

      {/* ---------- form */}
      <SectionLabel className={phone ? "mt-6" : "mt-9"}>Vaši podaci</SectionLabel>
      <form noValidate onSubmit={onSubmit} aria-label="Upit za kuhinju" aria-busy={sending} className="relative mt-2">
        {/* honeypot — hidden from people and assistive tech; bots fill it.
            The input name is deliberately not "website"/"url", which autofill and identity extensions target
            (a filled honeypot silently drops a real inquiry). The JSON key stays `website` and is sent only when filled. */}
        <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0">
          <label htmlFor={fieldId("hp")}>Ne ispunjavajte ovo polje</label>
          <input
            id={fieldId("hp")}
            type="text"
            name="emna_hp"
            tabIndex={-1}
            autoComplete="off"
            data-1p-ignore
            data-lpignore="true"
            data-bwignore
            data-form-type="other"
            value={values.website}
            onChange={onText("website")}
          />
        </div>

        <TextField
          id={fieldId("name")}
          label="Ime i prezime"
          autoComplete="name"
          value={values.name}
          onChange={onText("name")}
          onBlur={() => blur("name")}
          error={errors.name}
          disabled={sending}
          reduce={reduce}
        />
        <TextField
          id={fieldId("phone")}
          label="Telefon"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          value={values.phone}
          onChange={onText("phone")}
          onBlur={() => blur("phone")}
          error={errors.phone}
          disabled={sending}
          reduce={reduce}
        />
        <TextField
          id={fieldId("email")}
          label="E-mail"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={values.email}
          onChange={onText("email")}
          onBlur={() => blur("email")}
          error={errors.email}
          disabled={sending}
          reduce={reduce}
        />
        <TextField
          id={fieldId("city")}
          label="Grad"
          autoComplete="address-level2"
          value={values.city}
          onChange={onText("city")}
          onBlur={() => blur("city")}
          error={errors.city}
          hint="Gdje je prostor — za izmjeru i montažu."
          disabled={sending}
          reduce={reduce}
        />

        <fieldset className="mt-4" disabled={sending}>
          <legend id={fieldId("timeline")} className="mb-3 text-[13px] text-mut">
            Kada planirate?
          </legend>
          <RadioGrid
            labelledBy={fieldId("timeline")}
            items={TIMELINES.map((t) => ({ id: t }))}
            value={values.timeline}
            onChange={(t) => update("timeline", values.timeline === t ? "" : (t as LeadValues["timeline"]))}
            className="grid grid-cols-2 gap-2"
            itemClassName={(on) =>
              `rounded-full border px-3 py-2.5 text-[12.5px] font-medium transition-colors duration-300 ease-premium ${
                on ? "border-fg bg-fg text-ink" : "border-white/[0.12] text-fg/70 hover:border-white/30 hover:text-fg"
              }`
            }
          >
            {(t) => t.id}
          </RadioGrid>
        </fieldset>

        <TextField
          className="mt-4"
          id={fieldId("message")}
          label="Napomena"
          multiline
          value={values.message}
          onChange={onText("message")}
          onBlur={() => blur("message")}
          error={errors.message}
          hint={
            values.message.length > MESSAGE_MAX - 400
              ? `${values.message.length} / ${MESSAGE_MAX} znakova`
              : "Po želji: aparati koje već imate, rok, pitanja."
          }
          disabled={sending}
          reduce={reduce}
        />

        <Consent
          id={fieldId("consent")}
          checked={values.consent}
          onChange={(c) => update("consent", c)}
          error={errors.consent}
          disabled={sending}
          reduce={reduce}
        />

        <button
          type="submit"
          aria-disabled={sending}
          className={`group mt-7 inline-flex w-full items-center justify-center gap-2.5 rounded-full bg-accent px-6 py-4 text-[13.5px] font-semibold tracking-wide text-ink transition-all duration-300 ease-premium hover:bg-fg ${
            sending ? "cursor-progress opacity-90" : ""
          }`}
        >
          {sending ? (
            <>
              <Spinner />
              Šaljem upit…
            </>
          ) : status === "server" || status === "rate_limited" ? (
            "Pokušajte ponovno"
          ) : (
            "Pošaljite upit"
          )}
        </button>
        <p className={`mt-3 text-center text-[11.5px] leading-relaxed ${status === "invalid" ? "text-[#E39A84]" : "text-mut"}`}>
          {status === "invalid"
            ? "Provjerite označena polja."
            : "Podatke koristimo samo kako bismo odgovorili na vaš upit."}
        </p>

        <AnimatePresence initial={false}>
          {(status === "not_configured" || status === "server" || status === "rate_limited") && (
            <motion.div
              key={status}
              role="alert"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto", transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
              exit={{ opacity: 0, height: 0, transition: { duration: reduce ? 0 : 0.3, ease: EASE } }}
              className="overflow-hidden"
            >
              <StatusPanel status={status} getUrl={getUrl} summary={summary} values={values} pdf={pdf} />
            </motion.div>
          )}
        </AnimatePresence>
      </form>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

/** the nearest ancestor that scrolls (the sheet's or the panel's body) */
function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const o = getComputedStyle(p).overflowY;
    if (o === "auto" || o === "scroll") return p;
  }
  return null;
}

function KitchenPreview({
  preview,
  noEngine,
  price,
  compact,
  reduce,
}: {
  preview: string | null;
  noEngine: boolean;
  price: { low: number; high: number };
  compact: boolean;
  reduce: boolean;
}) {
  return (
    <figure className="relative overflow-hidden rounded-2xl border border-white/10 bg-ink-900/60">
      <div className={`relative w-full ${compact ? "aspect-[16/9]" : "aspect-[16/10]"}`}>
        <AnimatePresence>
          {preview ? (
            <motion.div
              key={preview}
              className="absolute inset-0"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.8, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.4 } }}
            >
              <Image src={preview} alt="Snimka vaše kuhinje iz 3D prikaza" fill unoptimized sizes="400px" className="object-cover" />
            </motion.div>
          ) : (
            <motion.div key="empty" className="absolute inset-0 flex items-center justify-center" exit={{ opacity: 0 }}>
              <p className="px-6 text-center text-[12px] text-mut">
                {noEngine ? "3D prikaz nije dostupan na ovom uređaju — upit šaljemo bez slike." : "Pripremamo snimku vaše kuhinje…"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
        <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-900/85 to-transparent" />
      </div>
      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-4">
        <span className="eyebrow text-fg/80">Vaša kuhinja</span>
        <span className="font-display text-[14px] font-medium tabular-nums text-fg">
          <span className="mr-1.5 font-sans text-[11px] font-normal text-fg/70">okvirno</span>
          {eur(price.low)} – {eur(price.high)} €
        </span>
      </figcaption>
    </figure>
  );
}

function SummaryBlock({ summary }: { summary: string[] }) {
  const [allLines, setAllLines] = useState(false);
  const shownLines = allLines ? summary : summary.slice(0, 7);
  return (
    <>
      <SectionLabel className="mt-7">Sažetak</SectionLabel>
      <SummaryList lines={shownLines} className="mt-2" />
      {summary.length > 7 && (
        <button
          type="button"
          onClick={() => setAllLines((v) => !v)}
          aria-expanded={allLines}
          className="mt-1 inline-flex items-center gap-1.5 text-[12px] font-medium text-accent transition-colors hover:text-fg"
        >
          {allLines ? "Prikaži manje" : `Prikaži sve (${summary.length})`}
          <ChevronUp className={`h-3.5 w-3.5 transition-transform duration-300 ${allLines ? "" : "rotate-180"}`} />
        </button>
      )}
    </>
  );
}

function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  reduce,
  multiline = false,
  className = "",
  type = "text",
  inputMode,
  autoComplete,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  error?: string;
  hint?: string;
  reduce: boolean;
  multiline?: boolean;
  className?: string;
  type?: "text" | "tel" | "email";
  inputMode?: "text" | "tel" | "email";
  autoComplete?: string;
  disabled?: boolean;
}) {
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const base = `peer block w-full appearance-none rounded-none border-0 border-b bg-transparent px-0 pb-2.5 pt-6 text-[16px] leading-snug text-fg caret-accent outline-none transition-colors duration-300 ease-premium focus:outline-none focus-visible:outline-none disabled:opacity-70 [&:-webkit-autofill]:[-webkit-text-fill-color:#F2EFE9] [&:-webkit-autofill]:[transition:background-color_99999s_ease-out_0s] ${
    error ? "border-[#E39A84]/50 hover:border-[#E39A84]" : "border-white/15 hover:border-white/30"
  }`;
  const common = {
    id,
    value,
    onChange,
    onBlur,
    disabled,
    placeholder: " ",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        {multiline ? (
          <textarea
            {...common}
            rows={2}
            maxLength={MESSAGE_MAX + 200}
            className={`${base} max-h-[14rem] min-h-[5.5rem] resize-none [field-sizing:content]`}
          />
        ) : (
          <input
            {...common}
            type={type}
            inputMode={inputMode}
            autoComplete={autoComplete}
            spellCheck={type === "email" ? false : undefined}
            autoCapitalize={type === "email" ? "none" : undefined}
            className={base}
          />
        )}
        <label
          htmlFor={id}
          className={`pointer-events-none absolute left-0 top-6 origin-top-left -translate-y-5 scale-[0.74] text-[16px] leading-snug transition-[transform,color] duration-500 ease-premium peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-5 peer-focus:scale-[0.74] ${
            error ? "text-[#E39A84]" : "text-mut peer-focus:text-accent"
          }`}
        >
          {label}
        </label>
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left transition-transform duration-500 ease-premium peer-focus:scale-x-100 ${
            error ? "scale-x-100 bg-[#E39A84] opacity-70" : "scale-x-0 bg-accent"
          }`}
        />
      </div>
      <div className="min-h-[1.5rem] pt-1.5">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.p
              key="e"
              id={errId}
              className="text-[12.5px] leading-snug text-[#E39A84]"
              initial={{ opacity: 0, y: reduce ? 0 : -4 }}
              animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.35, ease: EASE } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
            >
              {error}
            </motion.p>
          ) : hint ? (
            <motion.p
              key="h"
              id={hintId}
              className="text-[12px] leading-snug text-mut"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: reduce ? 0 : 0.35 } }}
              exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
            >
              {hint}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Consent({
  id,
  checked,
  onChange,
  error,
  reduce,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  reduce: boolean;
  disabled?: boolean;
}) {
  const errId = `${id}-error`;
  return (
    <div className="mt-5">
      <div className="flex items-start gap-3.5">
        <span className="relative mt-[2px] flex h-5 w-5 shrink-0">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            className={`peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border bg-transparent transition-colors duration-300 ease-premium checked:border-accent checked:bg-accent ${
              error && !checked ? "border-[#E39A84]" : "border-white/30"
            }`}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 20 20"
            className="pointer-events-none absolute inset-0 h-5 w-5 text-ink opacity-0 transition-opacity duration-300 peer-checked:opacity-100"
          >
            <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
        <label htmlFor={id} className="cursor-pointer text-[12.5px] leading-relaxed text-mut">
          Upoznat/a sam s{" "}
          <Link
            href="/privatnost"
            target="_blank"
            className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
          >
            politikom privatnosti
            <span className="sr-only"> (otvara se u novoj kartici)</span>
          </Link>{" "}
          i s time da se moji podaci obrađuju radi odgovora na ovaj upit.
        </label>
      </div>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={errId}
            className="mt-2 pl-[34px] text-[12.5px] leading-snug text-[#E39A84]"
            initial={{ opacity: 0, y: reduce ? 0 : -4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.35, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.15 } }}
          >
            {error}
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * How to reach the company when sending fails: lib/site.ts, and where it has no phone or e-mail, what the owner
 * entered in /admin/postavke (GET /studio/tvrtka, fetched only then).
 */
function useDirectContact(): { phone: string | null; email: string | null; whatsapp: string | null } {
  const [company, setCompany] = useState<CompanyContact | null>(null);
  useEffect(() => {
    if (site.contact.phone && site.contact.email) return;
    let alive = true;
    void fetchCompanyContact().then((c) => {
      if (alive) setCompany(c);
    });
    return () => {
      alive = false;
    };
  }, []);
  return {
    phone: site.contact.phone ?? company?.phone ?? null,
    email: site.contact.email ?? company?.email ?? null,
    whatsapp: site.contact.whatsapp,
  };
}

function StatusPanel({
  status,
  getUrl,
  summary,
  values,
  pdf,
}: {
  status: "not_configured" | "server" | "rate_limited";
  getUrl: () => string;
  summary: string[];
  values: LeadValues;
  pdf: PdfExportApi;
}) {
  const { phone, email, whatsapp } = useDirectContact();
  const hasDirect = Boolean(phone || email || whatsapp);
  const direct = hasDirect || showTodos;
  const copy: Record<typeof status, { title: string; text: string }> = {
    not_configured: {
      title: "Online slanje još nije uključeno.",
      text: direct
        ? "Sve je spremno, ali slanje upita s ove stranice još nije aktivirano — vaš upit zato nije stigao do nas. Javite nam se izravno i pošaljite link na svoju kuhinju: u njemu su sve mjere i odabiri."
        : "Sve je spremno, ali slanje upita s ove stranice još nije aktivirano — vaš upit zato nije stigao do nas. Spremite link na svoju kuhinju (u njemu su sve mjere i odabiri) i pokušajte ponovno malo kasnije.",
    },
    server: {
      title: "Slanje trenutno ne uspijeva.",
      text: direct
        ? "Došlo je do pogreške na našoj strani i upit nije poslan. Pokušajte ponovno za minutu ili nam se javite izravno."
        : "Došlo je do pogreške na našoj strani i upit nije poslan. Pokušajte ponovno za minutu.",
    },
    rate_limited: {
      title: "Previše pokušaja zaredom.",
      text: "Radi zaštite od neželjenih poruka slanje je privremeno ograničeno. Pokušajte ponovno za nekoliko minuta.",
    },
  };
  const { title, text } = copy[status];
  const showPhone = Boolean(phone) || showTodos;
  const showEmail = Boolean(email) || showTodos;

  const mailBody = () =>
    [
      `Ime i prezime: ${values.name.trim()}`,
      `Telefon: ${values.phone.trim()}`,
      `E-mail: ${values.email.trim()}`,
      values.city.trim() ? `Grad: ${values.city.trim()}` : "",
      values.timeline ? `Kada planiram: ${values.timeline}` : "",
      "",
      ...summary,
      "",
      `Link na kuhinju: ${getUrl()}`,
      values.message.trim() ? `\n${values.message.trim().slice(0, 1200)}` : "",
    ]
      .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
      .join("\n");

  return (
    <div className="mt-6 rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <p className="eyebrow text-accent">Upit nije poslan</p>
      <p className="mt-3 font-display text-[18px] font-medium leading-tight tracking-tight">{title}</p>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-mut">{text}</p>

      {status !== "rate_limited" && direct && (
        <ul className="mt-5 space-y-2.5 text-[13.5px]">
          {showPhone && (
            <ContactLine label="Telefon">
              <Fill value={phone} label="telefon">
                {(v) => (
                  <a href={telHref(v)} className="text-fg underline decoration-white/30 underline-offset-4 hover:decoration-accent">
                    {v}
                  </a>
                )}
              </Fill>
            </ContactLine>
          )}
          {showEmail && (
            <ContactLine label="E-mail">
              <Fill value={email} label="e-mail">
                {(v) => (
                  <span className="flex flex-col gap-1">
                    <a href={`mailto:${v}`} className="text-fg underline decoration-white/30 underline-offset-4 hover:decoration-accent">
                      {v}
                    </a>
                    <a
                      href={`mailto:${v}?subject=${encodeURIComponent("Upit iz 3D studija")}&body=${encodeURIComponent(mailBody())}`}
                      className="text-[12px] text-accent underline decoration-accent/40 underline-offset-4 hover:text-fg"
                    >
                      Pošaljite ovaj upit e-mailom
                    </a>
                  </span>
                )}
              </Fill>
            </ContactLine>
          )}
          {whatsapp && (
            <ContactLine label="WhatsApp">
              <a
                href={waHref(whatsapp, `Pozdrav, evo moje kuhinje iz 3D studija: ${getUrl()}`)}
                target="_blank"
                rel="noreferrer"
                className="text-fg underline decoration-white/30 underline-offset-4 hover:decoration-accent"
              >
                Pošaljite poruku
              </a>
            </ContactLine>
          )}
        </ul>
      )}

      {/* the kitchen never gets lost: its link (all measures and choices) and the PDF, whatever went wrong */}
      <CopyLinkButton getUrl={getUrl} label="Kopirajte link kuhinje" className="mt-5" showField block />
      <PdfButton pdf={pdf} label="Preuzmite PDF" className="mt-3" />
      <p className="mt-4 text-[11.5px] text-mut">Ono što ste upisali ostaje u formi.</p>
    </div>
  );
}

function ContactLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <li className="flex items-baseline gap-3">
      <span className="eyebrow w-[74px] shrink-0 text-mut">{label}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}
