"use client";

/**
 * A button that opens a native modal <dialog> asking for confirmation, then runs a server action.
 * Used for destructive steps (delete an inquiry, remove an admin user).
 *
 *   <ConfirmDialog triggerLabel="Obriši upit" title="Obrisati upit U-2026-0001?"
 *     description="…" confirmLabel="Da, obriši" action={deleteLeadAction} fields={{ id }} />
 *
 * The dialog gives focus to "Odustani" first (the safe choice), Esc closes it, focus returns to
 * the trigger. A failed action shows its message inside the dialog; a successful one closes it
 * (or the action redirects).
 */
import { useActionState, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Alert, Button, SubmitButton, type ButtonSize, type ButtonVariant } from "@/components/admin/ui";
import { IDLE_RESULT, type ActionResult } from "./types";

export function ConfirmDialog({
  triggerLabel,
  triggerVariant = "danger",
  triggerSize = "sm",
  triggerIcon,
  triggerClassName,
  triggerAriaLabel,
  title,
  description,
  confirmLabel,
  pendingLabel = "Radim…",
  action,
  fields,
  tone = "danger",
}: {
  triggerLabel: ReactNode;
  triggerVariant?: ButtonVariant;
  triggerSize?: ButtonSize;
  triggerIcon?: ReactNode;
  triggerClassName?: string;
  /** when the visible label alone is ambiguous in a list (e.g. "Ukloni" → "Ukloni korisnika ana") */
  triggerAriaLabel?: string;
  title: ReactNode;
  description: ReactNode;
  confirmLabel: ReactNode;
  pendingLabel?: ReactNode;
  action: (prev: ActionResult, formData: FormData) => Promise<ActionResult>;
  /** hidden inputs sent with the action */
  fields: Record<string, string>;
  tone?: "danger" | "default";
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const [state, formAction] = useActionState(action, IDLE_RESULT);
  /** `at` of the result that was on screen when the dialog last opened — older errors stay hidden */
  const [dismissedAt, setDismissedAt] = useState(0);
  const titleId = useId();
  const descId = useId();

  // a successful run closes the dialog (state.at changes on every run)
  useEffect(() => {
    if (state.ok && state.at) dialog.current?.close();
  }, [state]);

  const open = () => {
    setDismissedAt(state.at);
    dialog.current?.showModal();
    cancel.current?.focus();
  };
  const close = () => dialog.current?.close();

  const showError = !state.ok && Boolean(state.message) && state.at !== dismissedAt;

  return (
    <>
      <Button
        ref={trigger}
        variant={triggerVariant}
        size={triggerSize}
        icon={triggerIcon}
        className={triggerClassName}
        aria-label={triggerAriaLabel}
        aria-haspopup="dialog"
        onClick={open}
      >
        {triggerLabel}
      </Button>
      <dialog
        ref={dialog}
        aria-labelledby={titleId}
        aria-describedby={descId}
        onClose={() => trigger.current?.focus()}
        onClick={(e) => {
          // click on the backdrop (outside the panel) closes
          if (e.target === e.currentTarget) close();
        }}
        className="m-auto w-[min(460px,calc(100vw-32px))] max-w-none rounded-2xl border border-white/10 bg-ink-700 p-0 text-fg shadow-[0_40px_120px_-20px_rgba(0,0,0,.8)] backdrop:bg-ink-900/75 backdrop:backdrop-blur-sm"
      >
        <form action={formAction} className="p-6 sm:p-7">
          {Object.entries(fields).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
          <div aria-hidden className="mb-5 flex items-center gap-2 text-accent/60">
            <span className="h-2 w-px rotate-45 bg-current" />
            <span className="h-px w-10 bg-current" />
          </div>
          <h2 id={titleId} className="font-display text-[20px] font-medium leading-snug tracking-tight text-fg">
            {title}
          </h2>
          <div id={descId} className="mt-3 space-y-2 text-[13.5px] leading-relaxed text-mut">
            {description}
          </div>
          {showError && (
            <Alert tone="danger" className="mt-5">
              {state.message}
            </Alert>
          )}
          <div className="mt-7 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button ref={cancel} variant="ghost" onClick={close}>
              Odustani
            </Button>
            <SubmitButton variant={tone === "danger" ? "danger" : "primary"} pendingLabel={pendingLabel}>
              {confirmLabel}
            </SubmitButton>
          </div>
        </form>
      </dialog>
    </>
  );
}
