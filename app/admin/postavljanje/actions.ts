"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { normalizeUsername, passwordProblem, usernameProblem } from "@/lib/auth/password";
import { clientIp, isSameOrigin } from "@/lib/auth/request";
import { isAdminConfigured, startSession } from "@/lib/auth/session";
import { createFirstAdmin, isValidSetupCode } from "@/lib/auth/setup";
import { hitThrottle } from "@/lib/auth/throttle";
import { dbErrorLabel } from "@/lib/db";

export type SetupField = "username" | "password" | "confirm";

export interface SetupState {
  /** form-level problem (bad code, already set up, server) */
  error: string | null;
  fields: Partial<Record<SetupField, string>>;
  username: string;
  /** true when the admin already exists — the form gives way to a link to /admin/prijava */
  done?: boolean;
}

export async function setupAction(_prev: SetupState, formData: FormData): Promise<SetupState> {
  const h = await headers();
  const rawUsername = String(formData.get("username") ?? "").slice(0, 100);
  const username = normalizeUsername(rawUsername);
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const code = formData.get("kod");
  const base: SetupState = { error: null, fields: {}, username: rawUsername };

  if (!isSameOrigin(h)) return { ...base, error: "Zahtjev nije dopušten. Osvježite stranicu i pokušajte ponovno." };
  if (!isAdminConfigured()) return { ...base, error: "Administracija još nije podešena na poslužitelju." };

  try {
    const hit = await hitThrottle("setup-ip", clientIp(h), { limit: 10, windowSeconds: 15 * 60 });
    if (!hit.allowed) {
      return { ...base, error: `Previše pokušaja. Pokušajte ponovno za ${Math.ceil(hit.retryAfter / 60)} min.` };
    }
  } catch (err) {
    console.error(`[admin] postavljanje: ograničenje nije provjereno (${dbErrorLabel(err)})`);
    return { ...base, error: "Postavljanje trenutno nije moguće. Pokušajte ponovno za minutu." };
  }

  if (!isValidSetupCode(code)) {
    return { ...base, error: "Kod za postavljanje nije ispravan. Otvorite točnu poveznicu koju ste dobili." };
  }

  const fields: SetupState["fields"] = {};
  const uProblem = usernameProblem(username);
  if (uProblem) fields.username = uProblem;
  const pProblem = passwordProblem(password, username);
  if (pProblem) fields.password = pProblem;
  if (!fields.password && password !== confirm) fields.confirm = "Lozinke se ne podudaraju.";
  if (Object.keys(fields).length) return { ...base, fields };

  let user: { id: string; username: string; sessionVersion: number } | null;
  try {
    user = await createFirstAdmin(username, password);
    if (user) await startSession(user);
  } catch (err) {
    console.error(`[admin] postavljanje nije uspjelo (${dbErrorLabel(err)})`);
    return { ...base, error: "Spremanje nije uspjelo. Pokušajte ponovno za minutu." };
  }
  if (!user) return { ...base, error: "Administracija je već postavljena.", done: true };

  redirect("/admin");
}
