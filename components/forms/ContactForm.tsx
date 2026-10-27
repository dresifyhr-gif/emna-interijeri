"use client";

/**
 * Contact / inquiry form (source: "kontakt") that posts to /api/upit.
 * Underline inputs with floating labels, segmented interest and timeline pickers, an optional measurement wish,
 * honest status handling: success is shown only when the API says ok; "not configured" and errors say so plainly.
 * The measurement wish and a liked gallery photo travel in the message (lib/lead-extras.ts composeMessage).
 */
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { Photo } from "@/lib/gallery";
import type { LeadInput } from "@/lib/lead-schema";
import { PHONE_MIN_DIGITS, fetchCompanyContact, isValidEmail, phoneDigitCount, sendLead, type CompanyContact } from "@/lib/lead-client";
import {
  MEASUREMENT_SLOTS,
  MESSAGE_MAX,
  TIMELINES,
  composeMessage,
  confirmationOf,
  leadNumberOf,
  type MeasurementSlot,
  type Timeline,
} from "@/lib/lead-extras";
import { site, telHref, waHref } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { Button } from "@/components/ui/Button";

export interface ContactFormProps {
  /** "paper" for light sections, "dark" for ink sections */
  variant?: "paper" | "dark";
  /** preselected interest, e.g. "Kuhinja" */
  interest?: "Kuhinja" | "Ormar" | "Interijer" | "Drugo";
  /** "Želim dogovoriti izmjeru" ticked from the start (/kontakt?izmjera=1) */
  measurement?: boolean;
  /** the gallery photo the visitor came from (/kontakt?slika=…); they can take it off the inquiry */
  photo?: Photo | null;
  className?: string;
}

type Interest = NonNullable<ContactFormProps["interest"]>;
type Variant = NonNullable<ContactFormProps["variant"]>;
type Field = "name" | "phone" | "email" | "city" | "message" | "consent";
type Status = "idle" | "sending" | "success" | "invalid" | "not_configured" | "rate_limited" | "server";

interface Values {
  name: string;
  phone: string;
  email: string;
  city: string;
  interest: Interest;
  timeline: Timeline | "";
  /** wants a measurement visit; `slots` are the times that suit them */
  measurement: boolean;
  slots: MeasurementSlot[];
  photo: Photo | null;
  message: string;
  consent: boolean;
  /** honeypot */
  website: string;
}

interface Sent {
  first: string;
  email: string;
  confirmation: ReturnType<typeof confirmationOf>;
  number: string | null;
}

const INTERESTS: Interest[] = ["Kuhinja", "Ormar", "Interijer", "Drugo"];
const FIELD_ORDER: Field[] = ["name", "phone", "email", "city", "message", "consent"];
const EASE = [0.2, 0.8, 0.2, 1] as const;
/** the checkbox acknowledges the privacy notice; answering the inquiry itself needs no separate consent */
const CONSENT_ERROR = "Potvrdite da ste pročitali politiku privatnosti.";

/* ------------------------------------------------------------------ validation */

function validateField(field: Field, v: Values): string | null {
  switch (field) {
    case "name": {
      const n = v.name.trim();
      if (n.length < 2) return "Upišite ime i prezime.";
      if (n.length > 100) return "Ime je predugo.";
      return null;
    }
    case "phone": {
      const p = v.phone.trim();
      if (phoneDigitCount(p) < PHONE_MIN_DIGITS || p.length < 6) return "Upišite broj telefona na koji vas možemo nazvati.";
      if (p.length > 30) return "Broj telefona je predug.";
      return null;
    }
    case "email":
      return isValidEmail(v.email.trim()) ? null : "Upišite ispravnu e-mail adresu.";
    case "city":
      return v.city.trim().length > 80 ? "Naziv mjesta je predug." : null;
    case "message":
      return v.message.trim().length > MESSAGE_MAX ? `Poruka je preduga — najviše ${MESSAGE_MAX} znakova.` : null;
    case "consent":
      return v.consent ? null : CONSENT_ERROR;
  }
}

/** used when the server rejects a field the client check accepted */
const FALLBACK: Record<Field, string> = {
  name: "Provjerite ime i prezime.",
  phone: "Provjerite broj telefona.",
  email: "Provjerite e-mail adresu.",
  city: "Provjerite naziv mjesta.",
  message: "Provjerite poruku.",
  consent: CONSENT_ERROR,
};

const isField = (k: string): k is Field => (FIELD_ORDER as string[]).includes(k);

function validateAll(v: Values): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {};
  for (const f of FIELD_ORDER) {
    const e = validateField(f, v);
    if (e) errors[f] = e;
  }
  return errors;
}

/** the visitor's message with the measurement wish and the liked photo as labelled lines */
const fullMessage = (v: Values) =>
  composeMessage({ message: v.message, measurement: { wanted: v.measurement, slots: v.slots }, photo: v.photo });

function toPayload(v: Values): LeadInput {
  const city = v.city.trim();
  const message = fullMessage(v);
  return {
    source: "kontakt",
    name: v.name.trim(),
    phone: v.phone.trim(),
    email: v.email.trim(),
    interest: v.interest,
    ...(city ? { city } : {}),
    ...(v.timeline ? { timeline: v.timeline } : {}),
    ...(message ? { message } : {}),
    consent: true,
  };
}

const emptyValues = (interest: Interest, measurement = false, photo: Photo | null = null): Values => ({
  name: "",
  phone: "",
  email: "",
  city: "",
  interest,
  timeline: "",
  measurement,
  slots: [],
  photo,
  message: "",
  consent: false,
  website: "",
});

/* ------------------------------------------------------------------ theme */

const THEME = {
  paper: {
    text: "text-graphite",
    muted: "text-taupe",
    label: "text-taupe peer-focus:text-graphite",
    input: "text-graphite caret-bronze [&:-webkit-autofill]:[-webkit-text-fill-color:#1A1A18]",
    border: "border-graphite/20 hover:border-graphite/40",
    focusLine: "bg-graphite",
    error: "text-[#9A3B2B]",
    errorLine: "bg-[#9A3B2B]",
    errorBorder: "border-[#9A3B2B]/60 hover:border-[#9A3B2B]",
    segTrack: "border-hairline",
    segThumb: "bg-graphite",
    segOn: "text-white",
    segOff: "text-graphite/60 hover:text-graphite",
    segFocus: "peer-focus-visible:outline-graphite",
    chipOn: "border-graphite bg-graphite text-white",
    chipOff: "border-graphite/20 text-graphite/70 hover:border-graphite/45 hover:text-graphite",
    placeholder: "placeholder:text-transparent focus:placeholder:text-taupe/70",
    box: "border-graphite/35 checked:border-graphite checked:bg-graphite",
    boxError: "border-[#9A3B2B]",
    tick: "text-white",
    link: "text-graphite underline decoration-graphite/30 underline-offset-4 transition-colors hover:decoration-graphite",
    panel: "border-hairline bg-greige/70",
    accent: "text-bronze-deep",
    ring: "stroke-graphite/15",
    submit: "ink" as const,
    reset: "line" as const,
  },
  dark: {
    text: "text-fg",
    muted: "text-mut",
    label: "text-mut peer-focus:text-accent",
    input: "text-fg caret-accent [&:-webkit-autofill]:[-webkit-text-fill-color:#F2EFE9]",
    border: "border-white/15 hover:border-white/30",
    focusLine: "bg-accent",
    error: "text-[#E39A84]",
    errorLine: "bg-[#E39A84]",
    errorBorder: "border-[#E39A84]/50 hover:border-[#E39A84]",
    segTrack: "border-white/12",
    segThumb: "bg-fg",
    segOn: "text-ink",
    segOff: "text-fg/55 hover:text-fg",
    segFocus: "peer-focus-visible:outline-accent",
    chipOn: "border-fg bg-fg text-ink",
    chipOff: "border-white/15 text-fg/65 hover:border-white/30 hover:text-fg",
    placeholder: "placeholder:text-transparent focus:placeholder:text-mut/70",
    box: "border-white/30 checked:border-accent checked:bg-accent",
    boxError: "border-[#E39A84]",
    tick: "text-ink",
    link: "text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent",
    panel: "border-white/10 bg-white/[0.03]",
    accent: "text-accent",
    ring: "stroke-white/15",
    submit: "light" as const,
    reset: "outline" as const,
  },
} satisfies Record<Variant, Record<string, string>>;

type Theme = (typeof THEME)[Variant];

/* ------------------------------------------------------------------ form */

export function ContactForm({ variant = "paper", interest = "Kuhinja", measurement = false, photo = null, className = "" }: ContactFormProps) {
  const t = THEME[variant];
  const uid = useId();
  const reduce = useReducedMotion();
  const sendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Values>(() => emptyValues(interest, measurement, photo));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [sent, setSent] = useState<Sent | null>(null);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);

  const fieldId = (f: Field | "measurement") => `${uid}-${f}`;
  const sending = status === "sending";

  function update<K extends keyof Values>(key: K, value: Values[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    // once a field has shown an error, re-check it live so it clears as soon as it's fixed
    if (isField(key) && errors[key]) {
      const nextErrors = { ...errors, [key]: validateField(key, next) ?? undefined };
      setErrors(nextErrors);
      if (status === "invalid" && !Object.values(nextErrors).some(Boolean)) setStatus("idle");
    }
  }

  const onText = (key: "name" | "phone" | "email" | "city" | "message" | "website") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update(key, e.target.value);

  const toggleSlot = (slot: MeasurementSlot) => {
    const next = values.slots.includes(slot) ? values.slots.filter((s) => s !== slot) : [...values.slots, slot];
    update("slots", MEASUREMENT_SLOTS.filter((s) => next.includes(s)));
  };

  function onBlur(field: Exclude<Field, "consent">) {
    // validate on blur only when something is typed — no scolding for tabbing through
    if (!values[field].trim()) return;
    const e = validateField(field, values);
    setErrors((prev) => ({ ...prev, [field]: e ?? undefined }));
  }

  function focusFirst(errs: Partial<Record<Field, string>>) {
    const first = FIELD_ORDER.find((f) => errs[f]);
    if (first) document.getElementById(fieldId(first))?.focus();
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sendingRef.current) return;

    const errs = validateAll(values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setStatus("invalid");
      focusFirst(errs);
      return;
    }

    // the server validates again with the full schema; mismatches come back as `fields` below
    const payload = toPayload(values);

    sendingRef.current = true;
    setStatus("sending");
    // `website` stays out of the payload for people; only a filled honeypot (a bot) sends it
    const res = await sendLead(values.website ? { ...payload, website: values.website } : payload);
    sendingRef.current = false;

    if (res.ok) {
      setMinHeight(formRef.current?.offsetHeight);
      setSent({
        first: payload.name.split(/\s+/)[0] ?? payload.name,
        email: payload.email,
        confirmation: confirmationOf(res),
        number: leadNumberOf(res),
      });
      setStatus("success");
      return;
    }

    if (res.error === "validation") {
      const fromServer: Partial<Record<Field, string>> = {};
      for (const k of res.fields ?? []) if (isField(k)) fromServer[k] = validateField(k, values) ?? FALLBACK[k];
      if (!Object.keys(fromServer).length) {
        // nothing the visitor can fix (e.g. oversized body) — treat as a failed send, never as success
        setStatus("server");
        return;
      }
      setErrors(fromServer);
      setStatus("invalid");
      focusFirst(fromServer);
      return;
    }
    setStatus(res.error);
  }

  function reset() {
    setValues(emptyValues(values.interest));
    setErrors({});
    setSent(null);
    setStatus("idle");
    setMinHeight(undefined);
  }

  const focusSuccess = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    el.focus({ preventScroll: true });
    el.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
  }, []);

  const swap = {
    initial: { opacity: 0, y: reduce ? 0 : 16 },
    animate: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.7, ease: EASE } },
    exit: { opacity: 0, y: reduce ? 0 : -12, transition: { duration: reduce ? 0 : 0.35, ease: EASE } },
  };

  const liveText =
    status === "sending"
      ? "Šaljem upit…"
      : status === "success"
        ? "Upit je poslan. Hvala!"
        : status === "invalid"
          ? "Provjerite označena polja."
          : "";

  const messageLength = values.message.length;

  return (
    <div className={`relative flex flex-col ${t.text} ${className}`} style={minHeight ? { minHeight } : undefined}>
      <p className="sr-only" role="status" aria-live="polite">
        {liveText}
      </p>

      <AnimatePresence mode="wait" initial={false}>
        {status === "success" && sent ? (
          <motion.div
            key="success"
            ref={focusSuccess}
            tabIndex={-1}
            aria-labelledby={`${uid}-thanks`}
            className="flex flex-1 flex-col justify-center py-6 outline-none"
            {...swap}
          >
            <DrawnCheck theme={t} reduce={Boolean(reduce)} />
            <p className={`kicker mt-8 ${t.accent}`}>Upit je poslan</p>
            <h3 id={`${uid}-thanks`} className="heading mt-4 text-[clamp(34px,4.4vw,56px)]">
              Hvala, {sent.first}.
            </h3>
            <p className={`mt-6 max-w-md text-[15px] leading-relaxed ${t.muted}`}>
              {sent.confirmation === "none"
                ? "Upit je stigao. Javit ćemo vam se telefonom da dogovorimo izmjeru."
                : "Vaš upit je stigao do nas. Javit ćemo vam se telefonom ili e-mailom da dogovorimo izmjeru i sljedeće korake."}
            </p>
            {sent.number && (
              <p className={`mt-5 text-[15px] ${t.muted}`}>
                Broj vašeg upita: <span className={`font-medium tabular-nums ${t.text}`}>{sent.number}</span>
              </p>
            )}
            {/* a sentence about the confirmation e-mail only when the API said what happened to it */}
            {sent.confirmation !== "none" && (
              <p className={`mt-3 max-w-md text-sm leading-relaxed ${t.muted}`}>
                {sent.confirmation === "sent" ? (
                  <>
                    Kratku potvrdu šaljemo na <span className={t.text}>{sent.email}</span>.
                  </>
                ) : (
                  <>
                    Potvrdu na <span className={t.text}>{sent.email}</span> ovaj put nismo uspjeli poslati, ali upit je
                    stigao i javit ćemo vam se.
                  </>
                )}
              </p>
            )}
            <div className="mt-10">
              <Button type="button" variant={t.reset} onClick={reset}>
                Pošaljite novi upit
              </Button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            ref={formRef}
            noValidate
            onSubmit={onSubmit}
            aria-label="Forma za upit"
            aria-busy={sending}
            data-variant={variant}
            {...swap}
          >
            {/* honeypot — hidden from people and assistive tech; bots fill it.
                The input name is deliberately not "website"/"url", which autofill and identity extensions target
                (a filled honeypot silently drops a real inquiry). The JSON key stays `website`. */}
            <div aria-hidden="true" className="pointer-events-none absolute -left-[10000px] top-0 h-px w-px overflow-hidden opacity-0">
              <label htmlFor={`${uid}-hp`}>Ne ispunjavajte ovo polje</label>
              <input
                id={`${uid}-hp`}
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

            {values.photo && (
              <PhotoChip photo={values.photo} onRemove={() => update("photo", null)} theme={t} disabled={sending} />
            )}

            <div className="grid gap-x-10 gap-y-1 sm:grid-cols-2">
              <TextField
                className="sm:col-span-2"
                id={fieldId("name")}
                label="Ime i prezime"
                autoComplete="name"
                value={values.name}
                onChange={onText("name")}
                onBlur={() => onBlur("name")}
                error={errors.name}
                theme={t}
                reduce={Boolean(reduce)}
                disabled={sending}
              />
              <TextField
                id={fieldId("phone")}
                label="Telefon"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                value={values.phone}
                onChange={onText("phone")}
                onBlur={() => onBlur("phone")}
                error={errors.phone}
                theme={t}
                reduce={Boolean(reduce)}
                disabled={sending}
              />
              <TextField
                id={fieldId("email")}
                label="E-mail"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={values.email}
                onChange={onText("email")}
                onBlur={() => onBlur("email")}
                error={errors.email}
                theme={t}
                reduce={Boolean(reduce)}
                disabled={sending}
              />
              <TextField
                className="sm:col-span-2"
                id={fieldId("city")}
                label="Grad"
                autoComplete="address-level2"
                placeholder="gdje je prostor"
                value={values.city}
                onChange={onText("city")}
                onBlur={() => onBlur("city")}
                error={errors.city}
                hint="Po želji — za izmjeru i montažu."
                theme={t}
                reduce={Boolean(reduce)}
                disabled={sending}
              />
            </div>

            <Segmented
              className="mt-8"
              legend="Zanima me"
              name={`${uid}-interest`}
              options={INTERESTS}
              value={values.interest}
              onChange={(v) => update("interest", v)}
              theme={t}
              reduce={Boolean(reduce)}
              disabled={sending}
            />

            {/* the studio's answers (lib/lead-extras.ts TIMELINES); a second tap clears the choice */}
            <Segmented
              className="mt-8"
              legend="Kada planirate?"
              name={`${uid}-timeline`}
              options={TIMELINES}
              value={values.timeline}
              onChange={(v) => update("timeline", v)}
              onClear={() => update("timeline", "")}
              wrap
              theme={t}
              reduce={Boolean(reduce)}
              disabled={sending}
            />

            <div className="mt-8">
              <div className="flex items-start gap-3.5">
                <Tick
                  id={fieldId("measurement")}
                  checked={values.measurement}
                  onChange={(c) => update("measurement", c)}
                  theme={t}
                  disabled={sending}
                  aria-controls={`${uid}-slots`}
                />
                <label htmlFor={fieldId("measurement")} className={`cursor-pointer text-[15px] leading-snug ${t.text}`}>
                  Želim dogovoriti izmjeru
                  <span className={`mt-0.5 block text-[13px] ${t.muted}`}>Dolazimo u prostor i uzimamo točne mjere.</span>
                </label>
              </div>
              <AnimatePresence initial={false}>
                {values.measurement && (
                  <motion.div
                    key="slots"
                    id={`${uid}-slots`}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto", transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
                    exit={{ opacity: 0, height: 0, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
                    className="overflow-hidden"
                  >
                    {/* the padding sits outside the fieldset: a legend ignores its fieldset's top padding */}
                    <div className="pl-[34px] pt-5">
                      <fieldset disabled={sending}>
                        <legend className={`mb-3 text-[13px] font-medium ${t.text}`}>
                          Kada vam odgovara? <span className={`font-normal ${t.muted}`}>Po želji, može i više odgovora.</span>
                        </legend>
                        <div className="flex flex-wrap gap-2">
                          {MEASUREMENT_SLOTS.map((slot) => {
                            const on = values.slots.includes(slot);
                            return (
                              <label key={slot} className="relative cursor-pointer select-none">
                                <input type="checkbox" checked={on} onChange={() => toggleSlot(slot)} className="peer sr-only" />
                                <span
                                  className={`flex min-h-10 items-center rounded-full border px-4 py-2 text-[13px] font-medium leading-tight transition-colors duration-300 ease-premium peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${t.segFocus} ${
                                    on ? t.chipOn : t.chipOff
                                  }`}
                                >
                                  {slot}
                                </span>
                              </label>
                            );
                          })}
                        </div>
                      </fieldset>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <TextField
              className="mt-6"
              id={fieldId("message")}
              label="Poruka"
              multiline
              value={values.message}
              onChange={onText("message")}
              onBlur={() => onBlur("message")}
              error={errors.message}
              hint={
                messageLength > MESSAGE_MAX - 400
                  ? `${messageLength} / ${MESSAGE_MAX} znakova`
                  : "Po želji: prostor, okvirne mjere, rok ili ideje koje imate."
              }
              theme={t}
              reduce={Boolean(reduce)}
              disabled={sending}
            />

            <Consent
              id={fieldId("consent")}
              checked={values.consent}
              onChange={(c) => update("consent", c)}
              error={errors.consent}
              theme={t}
              reduce={Boolean(reduce)}
              disabled={sending}
            />

            <div className="mt-10 flex flex-col-reverse gap-5 sm:flex-row sm:items-center sm:justify-between">
              <p className={`max-w-xs text-xs leading-relaxed ${status === "invalid" ? t.error : t.muted}`}>
                {status === "invalid" ? "Provjerite označena polja." : "Podatke koristimo samo kako bismo odgovorili na vaš upit."}
              </p>
              <Button
                type="submit"
                variant={t.submit}
                arrow={!sending}
                aria-disabled={sending}
                className={`min-w-[190px] ${sending ? "cursor-progress" : ""}`}
              >
                {sending ? (
                  <>
                    <Spinner />
                    Šaljem…
                  </>
                ) : (
                  "Pošaljite upit"
                )}
              </Button>
            </div>

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
                  <StatusPanel status={status} theme={t} values={values} />
                </motion.div>
              )}
            </AnimatePresence>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ------------------------------------------------------------------ pieces */

function TextField({
  id,
  label,
  value,
  onChange,
  onBlur,
  error,
  hint,
  theme: t,
  reduce,
  multiline = false,
  className = "",
  type = "text",
  inputMode,
  autoComplete,
  placeholder,
  disabled,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  onBlur: () => void;
  error?: string;
  hint?: string;
  theme: Theme;
  reduce: boolean;
  multiline?: boolean;
  className?: string;
  type?: "text" | "tel" | "email";
  inputMode?: "text" | "tel" | "email";
  autoComplete?: string;
  /** shown only while the field has focus (the label sits where it would be otherwise) */
  placeholder?: string;
  disabled?: boolean;
}) {
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const base = `peer block w-full appearance-none rounded-none border-0 border-b bg-transparent px-0 pb-3 pt-7 text-[17px] leading-snug outline-none transition-colors duration-300 ease-premium focus:outline-none focus-visible:outline-none disabled:opacity-70 [&:-webkit-autofill]:[transition:background-color_99999s_ease-out_0s] ${t.input} ${
    placeholder ? t.placeholder : ""
  } ${error ? t.errorBorder : t.border}`;

  const common = {
    id,
    value,
    onChange,
    onBlur,
    disabled,
    // a blank placeholder still drives the floating label (:placeholder-shown)
    placeholder: placeholder ?? " ",
    "aria-invalid": error ? true : undefined,
    "aria-describedby": describedBy,
  } as const;

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        {multiline ? (
          <textarea
            {...common}
            rows={3}
            maxLength={MESSAGE_MAX + 200}
            className={`${base} min-h-[7.5rem] resize-none [field-sizing:content] max-h-[22rem]`}
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
          className={`pointer-events-none absolute left-0 top-7 origin-top-left -translate-y-6 scale-[0.72] text-[17px] leading-snug transition-[transform,color] duration-500 ease-premium peer-placeholder-shown:translate-y-0 peer-placeholder-shown:scale-100 peer-focus:-translate-y-6 peer-focus:scale-[0.72] ${
            error ? t.error : t.label
          }`}
        >
          {label}
        </label>
        {/* focus line draws in from the left */}
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left transition-transform duration-500 ease-premium peer-focus:scale-x-100 ${
            error ? `${t.errorLine} scale-x-100 opacity-70` : `${t.focusLine} scale-x-0`
          }`}
        />
      </div>
      <div className="min-h-[1.75rem] pt-2">
        <AnimatePresence mode="wait" initial={false}>
          {error ? (
            <motion.p
              key="e"
              id={errId}
              className={`text-[13px] leading-snug ${t.error}`}
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
              className={`text-[13px] leading-snug ${t.muted}`}
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
  theme: t,
  reduce,
  disabled,
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
  theme: Theme;
  reduce: boolean;
  disabled?: boolean;
}) {
  const errId = `${id}-error`;
  return (
    <div className="mt-6">
      <div className="flex items-start gap-3.5">
        <Tick
          id={id}
          checked={checked}
          onChange={onChange}
          theme={t}
          disabled={disabled}
          invalid={Boolean(error) && !checked}
          aria-required="true"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errId : undefined}
        />
        <label htmlFor={id} className={`cursor-pointer text-sm leading-relaxed ${t.muted}`}>
          Pročitao/la sam{" "}
          <Link href="/privatnost" target="_blank" className={t.link}>
            politiku privatnosti
            <span className="sr-only"> (otvara se u novoj kartici)</span>
          </Link>{" "}
          i razumijem da ćete podatke iz ovog upita koristiti za odgovor na njega.
        </label>
      </div>
      <AnimatePresence initial={false}>
        {error && (
          <motion.p
            id={errId}
            className={`mt-2 pl-[34px] text-[13px] leading-snug ${t.error}`}
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

/** the form's square checkbox with a drawn tick; the label sits next to it */
function Tick({
  id,
  checked,
  onChange,
  theme: t,
  disabled,
  invalid = false,
  ...aria
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  theme: Theme;
  disabled?: boolean;
  invalid?: boolean;
  "aria-required"?: "true";
  "aria-invalid"?: true;
  "aria-describedby"?: string;
  "aria-controls"?: string;
}) {
  return (
    <span className="relative mt-[3px] flex h-5 w-5 shrink-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        {...aria}
        className={`peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border bg-transparent transition-colors duration-300 ease-premium ${
          invalid ? t.boxError : t.box
        }`}
      />
      <svg
        aria-hidden="true"
        viewBox="0 0 20 20"
        className={`pointer-events-none absolute inset-0 h-5 w-5 opacity-0 transition-opacity duration-300 peer-checked:opacity-100 ${t.tick}`}
      >
        <path d="M5.5 10.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/**
 * Pill track with a thumb that glides to the chosen option (radio inputs underneath). `wrap`: two by two on phones,
 * for longer labels. With `onClear`, tapping the chosen option again clears it (an optional question).
 */
function Segmented<T extends string>({
  legend,
  name,
  options,
  value,
  onChange,
  onClear,
  wrap = false,
  theme: t,
  reduce,
  disabled,
  className = "",
}: {
  legend: string;
  name: string;
  options: readonly T[];
  value: T | "";
  onChange: (v: T) => void;
  onClear?: () => void;
  wrap?: boolean;
  theme: Theme;
  reduce: boolean;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <fieldset className={className} disabled={disabled}>
      <legend className={`kicker mb-4 ${t.muted}`}>{legend}</legend>
      <div
        className={`relative grid border p-1 ${t.segTrack} ${
          wrap ? "grid-cols-2 gap-y-1 rounded-[24px] sm:grid-cols-4 sm:gap-y-0 sm:rounded-full" : "grid-cols-4 rounded-full"
        }`}
      >
        {options.map((opt) => {
          const on = value === opt;
          return (
            <label key={opt} className="relative cursor-pointer select-none">
              <input
                type="radio"
                name={name}
                value={opt}
                checked={on}
                onChange={() => onChange(opt)}
                // a click on the option that is already chosen fires no change — it clears an optional question
                onClick={on && onClear ? onClear : undefined}
                className="peer sr-only"
              />
              {on && (
                <motion.span
                  layoutId={`${name}-thumb`}
                  aria-hidden="true"
                  className={`absolute inset-0 rounded-full ${t.segThumb}`}
                  transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
                />
              )}
              <span
                className={`relative z-10 flex h-10 items-center justify-center rounded-full px-1 text-center text-[12.5px] font-medium leading-tight tracking-wide transition-colors duration-300 ease-premium peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${t.segFocus} sm:text-[13px] ${
                  on ? t.segOn : t.segOff
                }`}
              >
                {opt}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** the gallery photo the visitor came from (/kontakt?slika=…), with a way to take it off the inquiry */
function PhotoChip({ photo, onRemove, theme: t, disabled }: { photo: Photo; onRemove: () => void; theme: Theme; disabled?: boolean }) {
  return (
    <div className={`mb-6 flex items-center gap-4 rounded-2xl border p-2 pr-1.5 ${t.panel}`}>
      <Image
        src={photo.src}
        alt=""
        width={photo.w}
        height={photo.h}
        sizes="80px"
        className="h-[60px] w-20 shrink-0 rounded-xl object-cover"
      />
      <p className="min-w-0 flex-1">
        <span className={`block text-[12.5px] ${t.muted}`}>Sviđa mi se ova kuhinja</span>
        <span className="mt-0.5 block text-[14.5px] font-medium leading-snug">{photo.title}</span>
      </p>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        aria-label="Uklonite fotografiju iz upita"
        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-colors duration-300 ease-premium ${t.segOff}`}
      >
        <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
          <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      </button>
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
  theme: t,
  values,
}: {
  status: "not_configured" | "server" | "rate_limited";
  theme: Theme;
  values: Values;
}) {
  const copy: Record<typeof status, { title: string; text: string }> = {
    not_configured: {
      title: "Online slanje još nije uključeno.",
      text: "Forma je spremna, ali slanje upita s ove stranice još nije aktivirano — vaš upit zato nije stigao do nas.",
    },
    server: {
      title: "Slanje trenutno ne uspijeva.",
      text: "Došlo je do pogreške na našoj strani i upit nije poslan. Pokušajte ponovno za minutu.",
    },
    rate_limited: {
      title: "Previše pokušaja zaredom.",
      text: "Radi zaštite od neželjenih poruka slanje je privremeno ograničeno. Pokušajte ponovno za nekoliko minuta.",
    },
  };
  const { title, text } = copy[status];
  const { phone, email, whatsapp } = useDirectContact();
  const hasDirect = Boolean(phone || email || whatsapp);
  const showPhone = Boolean(phone) || showTodos;
  const showEmail = Boolean(email) || showTodos;

  const mailBody = [
    `Ime i prezime: ${values.name.trim()}`,
    `Telefon: ${values.phone.trim()}`,
    `E-mail: ${values.email.trim()}`,
    ...(values.city.trim() ? [`Grad: ${values.city.trim()}`] : []),
    `Zanima me: ${values.interest}`,
    ...(values.timeline ? [`Kada planiram: ${values.timeline}`] : []),
    "",
    fullMessage(values).slice(0, 1500),
  ].join("\n");

  return (
    <div className={`mt-8 rounded-2xl border p-6 sm:p-7 ${t.panel}`}>
      <p className={`kicker ${t.accent}`}>Upit nije poslan</p>
      <p className="heading mt-3 text-xl leading-tight tracking-head-sm">{title}</p>
      <p className={`mt-3 text-sm leading-relaxed ${t.muted}`}>{text}</p>

      {(hasDirect || showTodos) && <p className={`mt-5 text-sm ${t.text}`}>Javite nam se izravno:</p>}
      <ul className="mt-3 space-y-2.5 text-[15px]">
        {showPhone && (
          <ContactLine label="Telefon" theme={t}>
            <Fill value={phone} label="telefon">
              {(v) => (
                <a href={telHref(v)} className={t.link}>
                  {v}
                </a>
              )}
            </Fill>
          </ContactLine>
        )}
        {showEmail && (
          <ContactLine label="E-mail" theme={t}>
            <Fill value={email} label="e-mail">
              {(v) => (
                <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <a href={`mailto:${v}`} className={t.link}>
                    {v}
                  </a>
                  <a
                    href={`mailto:${v}?subject=${encodeURIComponent("Upit s web stranice")}&body=${encodeURIComponent(mailBody)}`}
                    className={`text-[13px] ${t.link}`}
                  >
                    Pošaljite ovaj upit e-mailom
                  </a>
                </span>
              )}
            </Fill>
          </ContactLine>
        )}
        {whatsapp && (
          <ContactLine label="WhatsApp" theme={t}>
            <a href={waHref(whatsapp, "Pozdrav, zanima me namještaj po mjeri.")} target="_blank" rel="noreferrer" className={t.link}>
              Pošaljite poruku
            </a>
          </ContactLine>
        )}
      </ul>

      {status === "not_configured" && !hasDirect && !showTodos && (
        <p className={`mt-4 text-sm ${t.muted}`}>Molimo pokušajte ponovno malo kasnije.</p>
      )}
      {status !== "rate_limited" && <p className={`mt-5 text-xs ${t.muted}`}>Ono što ste upisali ostaje u formi.</p>}
    </div>
  );
}

function ContactLine({ label, theme: t, children }: { label: string; theme: Theme; children: ReactNode }) {
  return (
    <li className="flex items-baseline gap-4">
      <span className={`kicker w-24 shrink-0 ${t.muted}`}>{label}</span>
      <span className="min-w-0">{children}</span>
    </li>
  );
}

function Spinner() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" className="animate-spin">
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
      <path d="M12.5 7A5.5 5.5 0 0 0 7 1.5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** thin circle + tick that draw themselves — the "technical drawing" motif */
function DrawnCheck({ theme: t, reduce }: { theme: Theme; reduce: boolean }) {
  const draw = (delay: number, duration: number) =>
    reduce
      ? { initial: false as const }
      : {
          initial: { pathLength: 0 },
          animate: { pathLength: 1 },
          transition: { duration, delay, ease: EASE },
        };
  return (
    <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true" className={t.accent}>
      <circle cx="32" cy="32" r="31" fill="none" strokeWidth="1" className={t.ring} />
      <g transform="rotate(-90 32 32)">
        <motion.circle cx="32" cy="32" r="31" fill="none" stroke="currentColor" strokeWidth="1" {...draw(0.15, 1.1)} />
      </g>
      <motion.path
        d="M21 33l7.5 7.5L44 25"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        {...draw(0.75, 0.6)}
      />
    </svg>
  );
}
