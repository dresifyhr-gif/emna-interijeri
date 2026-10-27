"use client";

/**
 * Contact / inquiry form (source: "kontakt") that posts to /api/upit.
 * Underline inputs with floating labels, segmented interest picker, honest status handling:
 * success is shown only when the API says ok; "not configured" and errors say so plainly.
 */
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useCallback, useId, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from "react";
import type { LeadInput } from "@/lib/lead-schema";
import { PHONE_MIN_DIGITS, isValidEmail, phoneDigitCount, sendLead } from "@/lib/lead-client";
import { site, telHref, waHref } from "@/lib/site";
import { Fill, showTodos } from "@/components/site/Fill";
import { Button } from "@/components/ui/Button";

export interface ContactFormProps {
  /** "paper" for light sections, "dark" for ink sections */
  variant?: "paper" | "dark";
  /** preselected interest, e.g. "Kuhinja" */
  interest?: "Kuhinja" | "Ormar" | "Interijer" | "Drugo";
  className?: string;
}

type Interest = NonNullable<ContactFormProps["interest"]>;
type Variant = NonNullable<ContactFormProps["variant"]>;
type Field = "name" | "phone" | "email" | "message" | "consent";
type Status = "idle" | "sending" | "success" | "invalid" | "not_configured" | "rate_limited" | "server";

interface Values {
  name: string;
  phone: string;
  email: string;
  interest: Interest;
  message: string;
  consent: boolean;
  /** honeypot */
  website: string;
}

const INTERESTS: Interest[] = ["Kuhinja", "Ormar", "Interijer", "Drugo"];
const FIELD_ORDER: Field[] = ["name", "phone", "email", "message", "consent"];
const MESSAGE_MAX = 3000;
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

function toPayload(v: Values): LeadInput {
  const message = v.message.trim();
  return {
    source: "kontakt",
    name: v.name.trim(),
    phone: v.phone.trim(),
    email: v.email.trim(),
    interest: v.interest,
    ...(message ? { message } : {}),
    consent: true,
  };
}

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

export function ContactForm({ variant = "paper", interest = "Kuhinja", className = "" }: ContactFormProps) {
  const t = THEME[variant];
  const uid = useId();
  const reduce = useReducedMotion();
  const sendingRef = useRef(false);
  const formRef = useRef<HTMLFormElement>(null);

  const [values, setValues] = useState<Values>({
    name: "",
    phone: "",
    email: "",
    interest,
    message: "",
    consent: false,
    website: "",
  });
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [status, setStatus] = useState<Status>("idle");
  const [sent, setSent] = useState<{ first: string; email: string; confirmation: boolean } | null>(null);
  const [minHeight, setMinHeight] = useState<number | undefined>(undefined);

  const fieldId = (f: Field | "interest") => `${uid}-${f}`;
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

  const onText = (key: "name" | "phone" | "email" | "message" | "website") => (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    update(key, e.target.value);

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
        confirmation: res.confirmation !== false,
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
    setValues({ name: "", phone: "", email: "", interest: values.interest, message: "", consent: false, website: "" });
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
              Vaš upit je stigao do nas. Javit ćemo vam se telefonom ili e-mailom da dogovorimo izmjeru i sljedeće korake.
            </p>
            <p className={`mt-3 max-w-md text-sm leading-relaxed ${t.muted}`}>
              {sent.confirmation ? (
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
            <div className="mt-10">
              <Button type="button" variant={t.reset} onClick={reset}>
                Pošalji novi upit
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
            </div>

            <fieldset className="mt-10" disabled={sending}>
              <legend className={`kicker mb-4 ${t.muted}`}>Zanima me</legend>
              <div className={`relative grid grid-cols-4 rounded-full border p-1 ${t.segTrack}`}>
                {INTERESTS.map((opt) => {
                  const on = values.interest === opt;
                  return (
                    <label key={opt} className="relative cursor-pointer select-none">
                      <input
                        type="radio"
                        name={`${uid}-interest`}
                        value={opt}
                        checked={on}
                        onChange={() => update("interest", opt)}
                        className="peer sr-only"
                      />
                      {on && (
                        <motion.span
                          layoutId={`${uid}-thumb`}
                          aria-hidden="true"
                          className={`absolute inset-0 rounded-full ${t.segThumb}`}
                          transition={{ duration: reduce ? 0 : 0.55, ease: EASE }}
                        />
                      )}
                      <span
                        className={`relative z-10 flex h-10 items-center justify-center rounded-full px-1 text-[12.5px] font-medium tracking-wide transition-colors duration-300 ease-premium peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 ${t.segFocus} sm:text-[13px] ${
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
                  "Pošalji upit"
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
  disabled?: boolean;
}) {
  const errId = `${id}-error`;
  const hintId = `${id}-hint`;
  const describedBy = [error ? errId : null, hint ? hintId : null].filter(Boolean).join(" ") || undefined;
  const base = `peer block w-full appearance-none rounded-none border-0 border-b bg-transparent px-0 pb-3 pt-7 text-[17px] leading-snug outline-none transition-colors duration-300 ease-premium focus:outline-none focus-visible:outline-none disabled:opacity-70 [&:-webkit-autofill]:[transition:background-color_99999s_ease-out_0s] ${t.input} ${
    error ? t.errorBorder : t.border
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
        <span className="relative mt-[3px] flex h-5 w-5 shrink-0">
          <input
            id={id}
            type="checkbox"
            checked={checked}
            onChange={(e) => onChange(e.target.checked)}
            disabled={disabled}
            aria-required="true"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errId : undefined}
            className={`peer h-5 w-5 cursor-pointer appearance-none rounded-[6px] border bg-transparent transition-colors duration-300 ease-premium ${
              error && !checked ? t.boxError : t.box
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
  const { phone, email, whatsapp } = site.contact;
  const hasDirect = Boolean(phone || email || whatsapp);
  const showPhone = Boolean(phone) || showTodos;
  const showEmail = Boolean(email) || showTodos;

  const mailBody = [
    `Ime i prezime: ${values.name.trim()}`,
    `Telefon: ${values.phone.trim()}`,
    `E-mail: ${values.email.trim()}`,
    `Zanima me: ${values.interest}`,
    "",
    values.message.trim().slice(0, 1500),
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
                    Pošalji ovaj upit e-mailom
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
