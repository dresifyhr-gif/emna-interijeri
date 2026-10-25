"use client";

import Link from "next/link";
import { useActionState, useId, useState } from "react";
import { Alert, Input, PasswordInput, SubmitButton, buttonClass, cx } from "@/components/admin/ui";
import { passwordStrength, type StrengthLevel } from "@/lib/auth/strength";
import { setupAction, type SetupState } from "./actions";

const BAR: Record<StrengthLevel, string> = {
  0: "bg-white/10",
  1: "bg-rose-300",
  2: "bg-amber-300",
  3: "bg-accent",
  4: "bg-emerald-300",
};

function StrengthMeter({ password, username }: { password: string; username: string }) {
  const id = useId();
  if (!password) return null;
  const s = passwordStrength(password, username);
  return (
    <div className="space-y-2" aria-live="polite" id={id}>
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span
            key={i}
            className={cx("h-1 flex-1 rounded-full transition-colors duration-300", s.level >= i ? BAR[s.level] : "bg-white/10")}
          />
        ))}
      </div>
      <p className="text-[12.5px] leading-snug text-mut">
        <span className="font-medium text-fg/85">Jačina: {s.label}.</span> {s.hint}
      </p>
    </div>
  );
}

export function SetupForm({ code }: { code: string }) {
  const [state, formAction] = useActionState<SetupState, FormData>(setupAction, { error: null, fields: {}, username: "" });
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");

  if (state.done) {
    return (
      <div className="space-y-5">
        <Alert tone="info" title="Administracija je već postavljena.">
          Prijavite se postojećim korisničkim imenom i lozinkom.
        </Alert>
        <Link href="/admin/prijava" className={buttonClass("primary", "md", "w-full")}>
          Na prijavu
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-5" noValidate>
      <input type="hidden" name="kod" value={code} />
      {state.error && <Alert tone="danger">{state.error}</Alert>}
      <Input
        name="username"
        label="Korisničko ime"
        hint="Mala slova i brojke, npr. ime ili „emna“. Ne mora biti e-mail."
        autoComplete="username"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        required
        minLength={3}
        maxLength={40}
        defaultValue={state.username}
        key={`u-${state.username}`}
        onChange={(e) => setUsername(e.currentTarget.value)}
        error={state.fields.username}
        autoFocus
      />
      <div className="space-y-3">
        <PasswordInput
          name="password"
          label="Lozinka"
          hint="Najmanje 10 znakova. Najbolja je fraza od nekoliko riječi."
          autoComplete="new-password"
          required
          minLength={10}
          maxLength={200}
          value={password}
          onChange={(e) => setPassword(e.currentTarget.value)}
          error={state.fields.password}
        />
        <StrengthMeter password={password} username={username} />
      </div>
      <PasswordInput
        name="confirm"
        label="Ponovite lozinku"
        autoComplete="new-password"
        required
        maxLength={200}
        error={state.fields.confirm}
      />
      <SubmitButton className="w-full" pendingLabel="Postavljam…">
        Postavi administraciju
      </SubmitButton>
      <p className="text-[12px] leading-relaxed text-mut">
        Lozinku spremite u upravitelj lozinki. Ova poveznica prestaje raditi čim se administrator postavi.
      </p>
    </form>
  );
}
