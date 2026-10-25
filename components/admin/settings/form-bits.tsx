"use client";

/** small pieces shared by the settings forms */
import { useEffect, type ReactNode, type RefObject } from "react";
import { Alert, Spinner, SubmitButton, cx } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/admin/format";
import type { FormState } from "./types";

/** after a failed run, move focus to the first invalid field (or the message) */
export function useResultFocus(state: FormState, form: RefObject<HTMLFormElement | null>) {
  useEffect(() => {
    if (!state.at || state.ok) return;
    const root = form.current;
    const target =
      root?.querySelector<HTMLElement>('[aria-invalid="true"]') ?? root?.querySelector<HTMLElement>("[data-form-message]");
    target?.focus();
  }, [state.at, state.ok, form]);
}

/** asks before closing the tab while `dirty` */
export function useUnsavedWarning(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);
}

/** "Provjerite označena polja" with a link to each field (ids are f-<name>) */
export function ErrorSummary({
  state,
  labels,
}: {
  state: FormState;
  /** field name → label */
  labels: Record<string, string>;
}) {
  if (state.ok || !state.message) return null;
  const entries = Object.entries(state.errors);
  return (
    <div tabIndex={-1} data-form-message className="outline-none">
      <Alert tone="danger" title={state.message}>
        {entries.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {entries.map(([name, error]) => (
              <li key={name}>
                <a href={`#f-${name}`} className="underline decoration-rose-300/40 underline-offset-2 hover:text-fg">
                  {labels[name] ?? name}
                </a>
                : {error}
              </li>
            ))}
          </ul>
        )}
      </Alert>
    </div>
  );
}

/** inline result line for short forms */
export function FormMessage({ state, className }: { state: FormState; className?: string }) {
  if (!state.message) return null;
  return (
    <div tabIndex={-1} data-form-message className={cx("outline-none", className)}>
      <Alert tone={state.ok ? "success" : "danger"}>{state.message}</Alert>
    </div>
  );
}

/**
 * Sticky bottom bar with the save button and a status line
 * (saving / saved / unsaved changes / last saved at).
 */
export function SaveBar({
  pending,
  dirty,
  state,
  updatedAt,
  label = "Spremi promjene",
  extra,
}: {
  pending: boolean;
  dirty: boolean;
  state: FormState;
  updatedAt: string | null;
  label?: string;
  extra?: ReactNode;
}) {
  let text: ReactNode;
  let tone = "text-mut";
  if (pending) {
    text = (
      <>
        <Spinner className="text-accent" /> Spremam…
      </>
    );
  } else if (state.at && !state.ok && state.message) {
    text = "Nije spremljeno — provjerite poruku iznad.";
    tone = "text-rose-300";
  } else if (dirty) {
    text = "Imate nespremljene promjene.";
    tone = "text-amber-200/90";
  } else if (state.at && state.ok && state.message) {
    text = state.message;
    tone = "text-emerald-200/90";
  } else if (updatedAt) {
    text = `Zadnje spremljeno ${formatDateTime(updatedAt)}.`;
  } else {
    text = "Još ništa nije spremljeno.";
  }

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-white/[0.07] bg-ink/90 px-4 py-3 backdrop-blur-xl backdrop-saturate-150 sm:mx-0 sm:rounded-2xl sm:border sm:px-5">
      <div className="flex items-center justify-between gap-4">
        <p role="status" aria-live="polite" className={cx("flex min-w-0 items-center gap-2 text-[12.5px]", tone)}>
          {text}
        </p>
        <div className="flex shrink-0 items-center gap-2">
          {extra}
          <SubmitButton pendingLabel="Spremam…">{label}</SubmitButton>
        </div>
      </div>
    </div>
  );
}
