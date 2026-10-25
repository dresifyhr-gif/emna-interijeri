"use client";

/**
 * Status of an inquiry: a select that saves on change, plus a one-click archive / restore.
 * Both run the same server action (fields: id, status).
 */
import { useActionState, useState } from "react";
import { Select, Spinner, SubmitButton, cx } from "@/components/admin/ui";
import { LEAD_STATUS_OPTIONS, type LeadStatus } from "@/lib/admin/status";
import { IconArchive } from "./icons";
import { IDLE_RESULT, type ActionResult } from "./types";

type StatusAction = (prev: ActionResult, formData: FormData) => Promise<ActionResult>;

const MEANING: Record<LeadStatus, string> = {
  novi: "Upit je stigao, kupcu se još niste javili.",
  u_obradi: "U kontaktu ste: dogovor, izmjera ili priprema ponude.",
  ponuda_poslana: "Kupac je dobio ponudu, čeka se odgovor.",
  prihvaceno: "Kupac je prihvatio ponudu.",
  odbijeno: "Kupac je odustao ili je ponuda odbijena.",
  arhiva: "Skriveno s popisa aktivnih upita. Podaci ostaju sačuvani.",
};

export function LeadStatusControl({ leadId, status, action }: { leadId: string; status: LeadStatus; action: StatusAction }) {
  const [state, formAction, pending] = useActionState(action, IDLE_RESULT);
  const [value, setValue] = useState<LeadStatus>(status);
  const [seen, setSeen] = useState({ status, at: 0 });

  // follow the server: a new status from a re-render, or a failed save (→ back to the stored value)
  if (seen.status !== status || seen.at !== state.at) {
    setSeen({ status, at: state.at });
    if (seen.status !== status || !state.ok) setValue(status);
  }

  const meaning = MEANING[value] ?? "";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={leadId} />
      <Select
        name="status"
        label="Status upita"
        value={value}
        aria-busy={pending || undefined}
        onChange={(e) => {
          setValue(e.currentTarget.value as LeadStatus);
          e.currentTarget.form?.requestSubmit();
        }}
        options={LEAD_STATUS_OPTIONS}
        hint={meaning}
      />
      <p role="status" aria-live="polite" className="flex min-h-[18px] items-center gap-2 text-[12.5px]">
        {pending ? (
          <>
            <Spinner className="text-accent" />
            <span className="text-mut">Spremam…</span>
          </>
        ) : state.message ? (
          <span className={state.ok ? "text-emerald-200/90" : "text-rose-300"}>{state.message}</span>
        ) : null}
      </p>
    </form>
  );
}

/** "Arhiviraj" (or "Vrati iz arhive" → U obradi) as a single button */
export function LeadArchiveButton({
  leadId,
  status,
  action,
  className,
}: {
  leadId: string;
  status: LeadStatus;
  action: StatusAction;
  className?: string;
}) {
  const [state, formAction] = useActionState(action, IDLE_RESULT);
  const archived = status === "arhiva";
  return (
    <form action={formAction} className={cx("space-y-2", className)}>
      <input type="hidden" name="id" value={leadId} />
      <input type="hidden" name="status" value={archived ? "u_obradi" : "arhiva"} />
      <SubmitButton variant="secondary" size="sm" pendingLabel={archived ? "Vraćam…" : "Arhiviram…"}>
        <IconArchive size={15} />
        {archived ? "Vrati iz arhive" : "Arhiviraj"}
      </SubmitButton>
      {!state.ok && state.message && (
        <p role="alert" className="text-[12.5px] text-rose-300">
          {state.message}
        </p>
      )}
    </form>
  );
}
