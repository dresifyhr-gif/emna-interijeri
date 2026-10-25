"use client";

import { useActionState } from "react";
import { Alert, Input, PasswordInput, SubmitButton } from "@/components/admin/ui";
import { loginAction, type LoginState } from "./actions";

export function LoginForm({ next, disabled = false }: { next: string; disabled?: boolean }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, { error: null, username: "" });

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="next" value={next} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Input
        name="username"
        label="Korisničko ime"
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        maxLength={100}
        defaultValue={state.username}
        key={`u-${state.username}`}
        disabled={disabled}
        autoFocus={!state.username}
      />
      <PasswordInput
        name="password"
        label="Lozinka"
        autoComplete="current-password"
        required
        maxLength={200}
        disabled={disabled}
        autoFocus={Boolean(state.username)}
      />
      <SubmitButton className="w-full" pendingLabel="Prijavljujem…" disabled={disabled}>
        Prijavi se
      </SubmitButton>
    </form>
  );
}
