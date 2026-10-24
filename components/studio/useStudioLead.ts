"use client";

/**
 * Lead form state for step 6. Lives in <Studio> so the typed values survive switching steps.
 * Success is shown only when the API answers ok — "not configured" and errors are reported honestly.
 */
import { useCallback, useRef, useState } from "react";
import { leadSchema, type LeadInput } from "@/lib/lead-schema";
import { sendLead } from "@/lib/lead-client";
import type { KitchenConfig } from "@/lib/studio/types";
import type { Timeline } from "./meta";

export type LeadField = "name" | "phone" | "email" | "city" | "message" | "consent";
export type LeadStatus = "idle" | "sending" | "invalid" | "not_configured" | "rate_limited" | "server" | "success";

export interface LeadValues {
  name: string;
  phone: string;
  email: string;
  city: string;
  timeline: Timeline | "";
  message: string;
  consent: boolean;
  /** honeypot */
  website: string;
}

export const LEAD_FIELDS: LeadField[] = ["name", "phone", "email", "city", "message", "consent"];
export const MESSAGE_MAX = 3000;

const EMPTY: LeadValues = {
  name: "",
  phone: "",
  email: "",
  city: "",
  timeline: "",
  message: "",
  consent: false,
  website: "",
};

/** the checkbox acknowledges the privacy notice; answering the inquiry itself rests on the pre-contract basis (see /privatnost) */
const CONSENT_ERROR = "Potvrdite da ste se upoznali s politikom privatnosti.";

const isField = (k: string): k is LeadField => (LEAD_FIELDS as string[]).includes(k);

export function validateLeadField(field: LeadField, v: LeadValues): string | null {
  switch (field) {
    case "name": {
      const n = v.name.trim();
      if (n.length < 2) return "Upišite ime i prezime.";
      if (n.length > 100) return "Ime je predugo.";
      return null;
    }
    case "phone": {
      const p = v.phone.trim();
      if (p.replace(/\D/g, "").length < 6 || p.length < 6) return "Upišite broj telefona na koji vas možemo nazvati.";
      if (p.length > 30) return "Broj telefona je predug.";
      return null;
    }
    case "email":
      return leadSchema.shape.email.safeParse(v.email.trim()).success ? null : "Upišite ispravnu e-mail adresu.";
    case "city":
      return v.city.trim().length > 80 ? "Naziv mjesta je predug." : null;
    case "message":
      return v.message.trim().length > MESSAGE_MAX ? `Napomena je preduga — najviše ${MESSAGE_MAX} znakova.` : null;
    case "consent":
      return v.consent ? null : CONSENT_ERROR;
  }
}

const FALLBACK: Record<LeadField, string> = {
  name: "Provjerite ime i prezime.",
  phone: "Provjerite broj telefona.",
  email: "Provjerite e-mail adresu.",
  city: "Provjerite naziv mjesta.",
  message: "Provjerite napomenu.",
  consent: CONSENT_ERROR,
};

function validateAll(v: LeadValues): Partial<Record<LeadField, string>> {
  const errors: Partial<Record<LeadField, string>> = {};
  for (const f of LEAD_FIELDS) {
    const e = validateLeadField(f, v);
    if (e) errors[f] = e;
  }
  return errors;
}

export interface SentInfo {
  first: string;
  email: string;
  /** a picture of the kitchen went out with the inquiry */
  withImage: boolean;
  /** the customer's confirmation e-mail: sent, failed, or not reported by the API (null) */
  confirmation: boolean | null;
}

/** optional extras an ok reply may carry (`confirmation` / `image`); older replies are just `{ ok: true }` */
function replyFlag(res: object, ...keys: string[]): boolean | null {
  for (const k of keys) {
    const v = (res as Record<string, unknown>)[k];
    if (typeof v === "boolean") return v;
  }
  return null;
}

export function useStudioLead({
  getSnapshot,
  fieldId,
  getPayloadExtras,
}: {
  /** JPEG data URL of the kitchen, or undefined when 3D isn't available */
  getSnapshot: () => Promise<string | undefined>;
  /** DOM id of a field's input (for focusing the first error) */
  fieldId: (f: LeadField) => string;
  /** studio data captured at submit time */
  getPayloadExtras: () => {
    config: KitchenConfig;
    configUrl: string;
    summary: string[];
    price: { low: number; high: number };
  };
}) {
  const [values, setValues] = useState<LeadValues>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<LeadField, string>>>({});
  const [status, setStatus] = useState<LeadStatus>("idle");
  const [sent, setSent] = useState<SentInfo | null>(null);
  const sendingRef = useRef(false);

  const focusFirst = useCallback(
    (errs: Partial<Record<LeadField, string>>) => {
      const first = LEAD_FIELDS.find((f) => errs[f]);
      if (first) document.getElementById(fieldId(first))?.focus();
    },
    [fieldId],
  );

  function update<K extends keyof LeadValues>(key: K, value: LeadValues[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    // a field that already shows an error is re-checked live, so the error clears as soon as it's fixed
    const k = key as string;
    if (isField(k) && errors[k]) {
      const nextErrors = { ...errors, [k]: validateLeadField(k, next) ?? undefined };
      setErrors(nextErrors);
      if (status === "invalid" && !Object.values(nextErrors).some(Boolean)) setStatus("idle");
    }
  }

  const blur = useCallback(
    (field: Exclude<LeadField, "consent">) => {
      // only check what was typed — no scolding for tabbing through
      if (!values[field].trim()) return;
      const e = validateLeadField(field, values);
      setErrors((prev) => ({ ...prev, [field]: e ?? undefined }));
    },
    [values],
  );

  const submit = useCallback(async () => {
    if (sendingRef.current) return;
    const errs = validateAll(values);
    if (Object.keys(errs).length) {
      setErrors(errs);
      setStatus("invalid");
      focusFirst(errs);
      return;
    }

    sendingRef.current = true;
    setStatus("sending");

    const extras = getPayloadExtras();
    const snapshot = await getSnapshot().catch(() => undefined);
    const city = values.city.trim();
    const message = values.message.trim();
    const payload: LeadInput = {
      source: "studio",
      name: values.name.trim(),
      phone: values.phone.trim(),
      email: values.email.trim(),
      interest: "Kuhinja",
      ...(city ? { city } : {}),
      ...(values.timeline ? { timeline: values.timeline } : {}),
      ...(message ? { message } : {}),
      config: extras.config,
      configUrl: extras.configUrl,
      summary: extras.summary.slice(0, 60).map((l) => l.slice(0, 300)),
      price: extras.price,
      ...(snapshot ? { snapshot } : {}),
      consent: true,
    };

    // the shared schema must agree before we hit the network; a picture is never worth a failed send
    let check = leadSchema.safeParse(payload);
    if (!check.success && payload.snapshot) {
      delete payload.snapshot;
      check = leadSchema.safeParse(payload);
    }
    if (!check.success) {
      const fromSchema: Partial<Record<LeadField, string>> = {};
      for (const issue of check.error.issues) {
        const k = String(issue.path[0] ?? "");
        if (isField(k)) fromSchema[k] = FALLBACK[k];
      }
      sendingRef.current = false;
      if (Object.keys(fromSchema).length) {
        setErrors(fromSchema);
        setStatus("invalid");
        focusFirst(fromSchema);
      } else {
        setStatus("server");
      }
      return;
    }

    const res = await sendLead(values.website ? { ...payload, website: values.website } : payload);
    sendingRef.current = false;

    if (res.ok) {
      setSent({
        first: payload.name.split(/\s+/)[0] ?? payload.name,
        email: payload.email,
        // the server can still drop a picture it doesn't accept — trust its word when it gives one
        withImage: replyFlag(res, "image", "snapshot") ?? Boolean(payload.snapshot),
        confirmation: replyFlag(res, "confirmation", "confirmationSent"),
      });
      setStatus("success");
      return;
    }
    if (res.error === "validation") {
      const fromServer: Partial<Record<LeadField, string>> = {};
      for (const k of res.fields ?? []) if (isField(k)) fromServer[k] = validateLeadField(k, values) ?? FALLBACK[k];
      if (!Object.keys(fromServer).length) {
        // nothing the visitor can fix — a failed send, never a success
        setStatus("server");
        return;
      }
      setErrors(fromServer);
      setStatus("invalid");
      focusFirst(fromServer);
      return;
    }
    setStatus(res.error);
  }, [values, getSnapshot, focusFirst, getPayloadExtras]);

  /** back to editing after a successful send (values stay, so a second send needs a deliberate click) */
  const dismissSuccess = useCallback(() => setStatus("idle"), []);

  return { values, errors, status, sent, update, blur, submit, dismissSuccess };
}

export type StudioLead = ReturnType<typeof useStudioLead>;
