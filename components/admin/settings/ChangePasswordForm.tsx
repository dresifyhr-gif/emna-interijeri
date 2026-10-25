"use client";

import { useActionState, useRef, useState } from "react";
import { PasswordInput, SubmitButton } from "@/components/admin/ui";
import { FormMessage, useResultFocus } from "./form-bits";
import { StrengthMeter } from "./StrengthMeter";
import { IDLE_FORM, type FormState } from "./types";

/** change your own password; every other device is logged out afterwards */
export function ChangePasswordForm({
  username,
  action,
}: {
  username: string;
  action: (prev: FormState, formData: FormData) => Promise<FormState>;
}) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const form = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [seenAt, setSeenAt] = useState(0);

  // passwords are never echoed back: every result starts with empty fields
  if (seenAt !== state.at) {
    setSeenAt(state.at);
    setPassword("");
  }
  useResultFocus(state, form);

  return (
    <form ref={form} action={formAction} noValidate className="space-y-5">
      <FormMessage state={state} />
      {/* for password managers: which account this is */}
      <input
        type="text"
        name="username"
        autoComplete="username"
        value={username}
        readOnly
        tabIndex={-1}
        aria-hidden
        className="sr-only"
      />
      <div key={state.at} className="space-y-5">
        <PasswordInput
          name="current"
          label="Trenutna lozinka"
          autoComplete="current-password"
          required
          maxLength={200}
          error={state.errors.current}
        />
        <div className="space-y-3">
          <PasswordInput
            name="password"
            label="Nova lozinka"
            hint="Najmanje 10 znakova. Najbolja je fraza od nekoliko riječi."
            autoComplete="new-password"
            required
            minLength={10}
            maxLength={200}
            value={password}
            onChange={(e) => setPassword(e.currentTarget.value)}
            error={state.errors.password}
          />
          <StrengthMeter password={password} username={username} />
        </div>
        <PasswordInput
          name="confirm"
          label="Ponovite novu lozinku"
          autoComplete="new-password"
          required
          maxLength={200}
          error={state.errors.confirm}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[12px] leading-relaxed text-mut">Nakon promjene ostali uređaji morat će se ponovno prijaviti.</p>
        <SubmitButton pendingLabel="Mijenjam…">Promijeni lozinku</SubmitButton>
      </div>
    </form>
  );
}
