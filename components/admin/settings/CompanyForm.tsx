"use client";

/**
 * "Podaci o tvrtki": every company field from lib/site.ts (contact, legal, social, facts),
 * validated on the server (lib/admin/settings.ts parseCompanyForm).
 */
import { useActionState, useRef, useState } from "react";
import { Input, Textarea } from "@/components/admin/ui";
import { COMPANY_SECTIONS } from "./company-fields";
import { ErrorSummary, SaveBar, useResultFocus, useUnsavedWarning } from "./form-bits";
import { IDLE_FORM, type FormState } from "./types";

const LABELS = Object.fromEntries(COMPANY_SECTIONS.flatMap((s) => s.fields.map((f) => [f.name, f.label])));

export function CompanyForm({
  initial,
  updatedAt,
  action,
}: {
  /** "contact.phone" → current value */
  initial: Record<string, string>;
  updatedAt: string | null;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction, pending] = useActionState(action, IDLE_FORM);
  const form = useRef<HTMLFormElement>(null);
  const [dirty, setDirty] = useState(false);
  const [seenAt, setSeenAt] = useState(0);

  if (seenAt !== state.at) {
    setSeenAt(state.at);
    if (state.ok) setDirty(false);
  }
  useResultFocus(state, form);
  useUnsavedWarning(dirty);

  // after a failed save show what was typed; otherwise what is stored (normalised by the server)
  const values = !state.ok && state.values ? state.values : initial;

  return (
    <form ref={form} action={formAction} onChange={() => setDirty(true)} noValidate className="space-y-6">
      <ErrorSummary state={state} labels={LABELS} />

      {/* remount on every result so inputs pick up the new default values */}
      <div key={state.at} className="space-y-6">
        {COMPANY_SECTIONS.map((section) => (
          <fieldset key={section.group} className="rounded-2xl border border-white/[0.07] bg-ink-700/50 p-5 sm:p-6">
            <legend className="float-left mb-5 w-full">
              <span className="block font-display text-[17px] font-medium tracking-tight text-fg">{section.title}</span>
              <span className="mt-1 block max-w-2xl text-[13px] leading-relaxed text-mut">{section.description}</span>
            </legend>
            <div className="clear-both grid gap-x-5 gap-y-5 sm:grid-cols-2">
              {section.fields.map((field) => {
                const common = {
                  name: field.name,
                  label: field.label,
                  hint: field.hint,
                  placeholder: field.placeholder,
                  maxLength: field.maxLength,
                  autoComplete: field.autoComplete ?? "off",
                  defaultValue: values[field.name] ?? "",
                  error: state.errors[field.name],
                  fieldClassName: field.wide ? "sm:col-span-2" : undefined,
                };
                return field.multiline ? (
                  <Textarea key={field.name} rows={2} {...common} />
                ) : (
                  <Input key={field.name} type={field.type ?? "text"} inputMode={field.inputMode} {...common} />
                );
              })}
            </div>
          </fieldset>
        ))}
      </div>

      <SaveBar pending={pending} dirty={dirty} state={state} updatedAt={updatedAt} />
    </form>
  );
}
