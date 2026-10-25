"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { attemptLogin } from "@/lib/auth/login";
import { clientIp, isSameOrigin, safeAdminNext } from "@/lib/auth/request";
import { isAdminConfigured, startSession } from "@/lib/auth/session";
import { dbErrorLabel } from "@/lib/db";

export interface LoginState {
  error: string | null;
  /** echoed back so the field keeps its value after a failed attempt */
  username: string;
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));

export async function loginAction(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const h = await headers();
  const username = String(formData.get("username") ?? "").slice(0, 100);
  const password = String(formData.get("password") ?? "");
  const next = safeAdminNext(formData.get("next"));

  if (!isSameOrigin(h)) return { error: "Zahtjev nije dopušten. Osvježite stranicu i pokušajte ponovno.", username };
  if (!isAdminConfigured()) return { error: "Administracija još nije podešena na poslužitelju.", username };
  if (!username.trim() || !password) return { error: "Upišite korisničko ime i lozinku.", username };

  let user: { id: string; username: string; sessionVersion: number };
  try {
    const result = await attemptLogin({ username, password, ip: clientIp(h) });
    if (!result.ok) {
      if (result.reason === "throttled") {
        const m = minutes(result.retryAfter);
        return { error: `Previše neuspjelih pokušaja. Pokušajte ponovno za ${m} min.`, username };
      }
      return { error: "Pogrešno korisničko ime ili lozinka.", username };
    }
    user = result.user;
    await startSession(user);
  } catch (err) {
    console.error(`[admin] prijava nije uspjela (${dbErrorLabel(err)})`);
    return { error: "Prijava trenutno nije moguća. Pokušajte ponovno za minutu.", username };
  }

  redirect(next);
}
