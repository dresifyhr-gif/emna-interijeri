"use client";

import { useActionState, useRef, useState } from "react";
import { Input, PasswordInput, SubmitButton } from "@/components/admin/ui";
import { FormMessage, useResultFocus } from "./form-bits";
import { StrengthMeter } from "./StrengthMeter";
import { IDLE_FORM, type FormState } from "./types";

/** adds another administrator; asks for your own password first (a stolen session can't add a backdoor user) */
export function AddUserForm({ action }: { action: (prev: FormState, formData: FormData) => Promise<FormState> }) {
  const [state, formAction] = useActionState(action, IDLE_FORM);
  const form = useRef<HTMLFormElement>(null);
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [seenAt, setSeenAt] = useState(0);

  if (seenAt !== state.at) {
    setSeenAt(state.at);
    setPassword("");
    setUsername(state.ok ? "" : (state.values?.username ?? ""));
  }
  useResultFocus(state, form);

  return (
    <form ref={form} action={formAction} noValidate className="space-y-5">
      <FormMessage state={state} />
      <div key={state.at} className="space-y-5">
        <div className="grid gap-5 sm:grid-cols-2">
          <Input
            name="newUsername"
            label="Korisničko ime"
            hint="Mala slova i brojke, npr. ime. Ne mora biti e-mail."
            autoComplete="off"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
            minLength={3}
            maxLength={40}
            value={username}
            onChange={(e) => setUsername(e.currentTarget.value)}
            error={state.errors.newUsername}
          />
          <div className="space-y-3">
            <PasswordInput
              name="newPassword"
              label="Lozinka za novog korisnika"
              hint="Najmanje 10 znakova."
              autoComplete="new-password"
              required
              minLength={10}
              maxLength={200}
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              error={state.errors.newPassword}
            />
            <StrengthMeter password={password} username={username} />
          </div>
          <PasswordInput
            name="newConfirm"
            label="Ponovite lozinku"
            autoComplete="new-password"
            required
            maxLength={200}
            error={state.errors.newConfirm}
          />
          <PasswordInput
            id="f-add-current"
            name="current"
            label="Vaša trenutna lozinka"
            hint="Potvrda da ste to vi."
            autoComplete="current-password"
            required
            maxLength={200}
            error={state.errors.current}
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-md text-[12px] leading-relaxed text-mut">
          Novi administrator ima puni pristup: upiti, ponude i postavke. Lozinku mu predajte uživo ili porukom, ne e-mailom.
        </p>
        <SubmitButton pendingLabel="Dodajem…">Dodaj administratora</SubmitButton>
      </div>
    </form>
  );
}
