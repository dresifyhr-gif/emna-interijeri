"use server";

/**
 * Server actions for Postavke. Each one: Origin + session check (requireAdminAction), input
 * validation, then the write. Passwords are never logged or echoed back to the form.
 */
import { revalidatePath, updateTag } from "next/cache";
import { headers } from "next/headers";
import { eq, sql } from "drizzle-orm";
import type { ActionResult } from "@/components/admin/leads/types";
import type { FormState } from "@/components/admin/settings/types";
import { isUuid } from "@/lib/admin/leads";
import {
  COMPANY_SETTINGS_TAG,
  QUOTE_DEFAULTS_TAG,
  SETTING_KEYS,
  parseCompanyForm,
  parseQuoteDefaultsForm,
  setSetting,
} from "@/lib/admin/settings";
import { PASSWORD_MAX, hashPassword, normalizeUsername, passwordProblem, usernameProblem, verifyPassword } from "@/lib/auth/password";
import { clientIp } from "@/lib/auth/request";
import { requireAdminAction, startSession, type AdminSession } from "@/lib/auth/session";
import { clearThrottle, hitThrottle } from "@/lib/auth/throttle";
import { dbErrorLabel, getDb, pgErrorCode } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";

const MAX_ADMINS = 20;
/** serialises user removals so two admins removing each other can't leave zero (setup.ts uses 7_302_419) */
const USERS_LOCK_ID = 7_302_420;

const str = (v: FormDataEntryValue | null) => (typeof v === "string" ? v : "");
const now = () => Date.now();

const failed = (message: string, extra: Partial<FormState> = {}): FormState => ({
  ok: false,
  message,
  errors: {},
  values: null,
  at: now(),
  ...extra,
});

/* ================================================================== company */

export async function saveCompanyAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();
  const parsed = parseCompanyForm(formData);
  if (!parsed.ok) {
    const n = Object.keys(parsed.errors).length;
    return failed(n === 1 ? "Provjerite označeno polje." : `Provjerite označena polja (${n}).`, {
      errors: parsed.errors,
      values: parsed.values,
    });
  }
  try {
    await setSetting(SETTING_KEYS.company, parsed.value);
  } catch (err) {
    console.error(`[admin] podaci o tvrtki nisu spremljeni (${dbErrorLabel(err)})`);
    const values = Object.fromEntries(
      [...formData.entries()].filter((e): e is [string, string] => typeof e[1] === "string" && e[0].includes(".")),
    );
    return failed("Spremanje nije uspjelo. Pokušajte ponovno za minutu.", { values });
  }
  updateTag(COMPANY_SETTINGS_TAG);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Podaci o tvrtki su spremljeni.", errors: {}, values: null, at: now() };
}

/* ================================================================== quote defaults */

export async function saveQuoteDefaultsAction(_prev: FormState, formData: FormData): Promise<FormState> {
  await requireAdminAction();
  const parsed = parseQuoteDefaultsForm(formData);
  if (!parsed.ok) {
    const n = Object.keys(parsed.errors).length;
    return failed(n === 1 ? "Provjerite označeno polje." : `Provjerite označena polja (${n}).`, {
      errors: parsed.errors,
      values: parsed.values,
    });
  }
  try {
    await setSetting(SETTING_KEYS.quoteDefaults, parsed.value);
  } catch (err) {
    console.error(`[admin] postavke ponuda nisu spremljene (${dbErrorLabel(err)})`);
    return failed("Spremanje nije uspjelo. Pokušajte ponovno za minutu.", {
      values: {
        vatPct: str(formData.get("vatPct")),
        validDays: str(formData.get("validDays")),
        terms: str(formData.get("terms")),
        notes: str(formData.get("notes")),
      },
    });
  }
  updateTag(QUOTE_DEFAULTS_TAG);
  revalidatePath("/admin", "layout");
  return { ok: true, message: "Postavke ponuda su spremljene.", errors: {}, values: null, at: now() };
}

/* ================================================================== users */

type Reauth = "ok" | "wrong" | "throttled" | "gone";

/** checks the logged-in admin's own password; 5 tries per 15 minutes per user (and per IP) */
async function verifyOwnPassword(admin: AdminSession, password: string): Promise<Reauth> {
  const ip = clientIp(await headers());
  const [userHit, ipHit] = await Promise.all([
    hitThrottle("reauth", admin.userId, { limit: 5, windowSeconds: 15 * 60 }),
    hitThrottle("reauth-ip", ip, { limit: 20, windowSeconds: 15 * 60 }),
  ]);
  if (!userHit.allowed || !ipHit.allowed) return "throttled";
  const [user] = await getDb()
    .select({ hash: adminUsers.passwordHash })
    .from(adminUsers)
    .where(eq(adminUsers.id, admin.userId))
    .limit(1);
  if (!user) return "gone";
  if (!password || password.length > PASSWORD_MAX || !(await verifyPassword(password, user.hash))) return "wrong";
  await clearThrottle("reauth", admin.userId).catch(() => {});
  return "ok";
}

const REAUTH_MESSAGE: Record<Exclude<Reauth, "ok" | "wrong">, string> = {
  throttled: "Previše pogrešnih pokušaja lozinke. Pokušajte ponovno za 15 minuta.",
  gone: "Vaš korisnički račun više ne postoji. Prijavite se ponovno.",
};

/** fields: current, password, confirm */
export async function changePasswordAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAction();
  const current = str(formData.get("current"));
  const password = str(formData.get("password"));
  const confirm = str(formData.get("confirm"));

  const errors: Record<string, string> = {};
  if (!current) errors.current = "Upišite trenutnu lozinku.";
  const problem = passwordProblem(password, admin.username);
  if (problem) errors.password = problem;
  else if (password === current) errors.password = "Nova lozinka mora se razlikovati od trenutne.";
  if (!errors.password && password !== confirm) errors.confirm = "Lozinke se ne podudaraju.";
  if (Object.keys(errors).length) return failed("Lozinka nije promijenjena.", { errors });

  let sessionVersion: number;
  try {
    const check = await verifyOwnPassword(admin, current);
    if (check === "wrong") return failed("Lozinka nije promijenjena.", { errors: { current: "Trenutna lozinka nije točna." } });
    if (check !== "ok") return failed(REAUTH_MESSAGE[check]);

    const passwordHash = await hashPassword(password);
    // new hash + new session version in one statement: every other session is invalid from now on
    const [row] = await getDb()
      .update(adminUsers)
      .set({ passwordHash, sessionVersion: sql`${adminUsers.sessionVersion} + 1` })
      .where(eq(adminUsers.id, admin.userId))
      .returning({ sessionVersion: adminUsers.sessionVersion });
    if (!row) return failed(REAUTH_MESSAGE.gone);
    sessionVersion = row.sessionVersion;
  } catch (err) {
    console.error(`[admin] lozinka nije promijenjena (${dbErrorLabel(err)})`);
    return failed("Promjena nije uspjela. Pokušajte ponovno za minutu.");
  }

  // keep this device logged in with the new session version
  try {
    await startSession({ id: admin.userId, username: admin.username, sessionVersion });
  } catch (err) {
    console.error(`[admin] nova sesija nije izdana (${err instanceof Error ? err.name : "unknown"})`);
    return failed("Lozinka je promijenjena, ali trebate se ponovno prijaviti.");
  }
  return {
    ok: true,
    message: "Lozinka je promijenjena. Svi ostali uređaji su odjavljeni.",
    errors: {},
    values: null,
    at: now(),
  };
}

/** fields: newUsername, newPassword, newConfirm, current (the logged-in admin's own password) */
export async function addAdminUserAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const admin = await requireAdminAction();
  const rawUsername = str(formData.get("newUsername")).slice(0, 100);
  const username = normalizeUsername(rawUsername);
  const password = str(formData.get("newPassword"));
  const confirm = str(formData.get("newConfirm"));
  const current = str(formData.get("current"));
  const echo = { values: { username: rawUsername } };

  const errors: Record<string, string> = {};
  const uProblem = usernameProblem(username);
  if (uProblem) errors.newUsername = uProblem;
  const pProblem = passwordProblem(password, username);
  if (pProblem) errors.newPassword = pProblem;
  if (!errors.newPassword && password !== confirm) errors.newConfirm = "Lozinke se ne podudaraju.";
  if (!current) errors.current = "Upišite svoju trenutnu lozinku.";
  if (Object.keys(errors).length) return failed("Administrator nije dodan.", { errors, ...echo });

  try {
    const check = await verifyOwnPassword(admin, current);
    if (check === "wrong") {
      return failed("Administrator nije dodan.", { errors: { current: "Vaša lozinka nije točna." }, ...echo });
    }
    if (check !== "ok") return failed(REAUTH_MESSAGE[check], echo);

    const [{ n }] = await getDb()
      .select({ n: sql<number>`count(*)::int` })
      .from(adminUsers);
    if (Number(n) >= MAX_ADMINS) return failed(`Najviše može biti ${MAX_ADMINS} administratora.`, echo);

    const passwordHash = await hashPassword(password);
    await getDb().insert(adminUsers).values({ username, passwordHash });
  } catch (err) {
    if (pgErrorCode(err) === "23505") {
      return failed("Administrator nije dodan.", { errors: { newUsername: "To korisničko ime već postoji." }, ...echo });
    }
    console.error(`[admin] administrator nije dodan (${dbErrorLabel(err)})`);
    return failed("Dodavanje nije uspjelo. Pokušajte ponovno za minutu.", echo);
  }

  revalidatePath("/admin/postavke/korisnici");
  return {
    ok: true,
    message: `Administrator „${username}“ je dodan i može se odmah prijaviti na /admin/prijava.`,
    errors: {},
    values: null,
    at: now(),
  };
}

/** field: id — removes ANOTHER admin; the last remaining admin can never be removed */
export async function removeAdminUserAction(_prev: ActionResult, formData: FormData): Promise<ActionResult> {
  const admin = await requireAdminAction();
  const id = formData.get("id");
  const fail = (message: string): ActionResult => ({ ok: false, message, at: now() });
  if (!isUuid(id)) return fail("Neispravan zahtjev. Osvježite stranicu.");
  if (id === admin.userId) return fail("Sebe ne možete ukloniti — to može samo drugi administrator.");

  let removed: string | null = null;
  try {
    const db = getDb();
    // lock → the checks and the delete see every earlier removal (READ COMMITTED, one statement)
    const [, result] = await db.batch([
      db.execute(sql`select pg_advisory_xact_lock(${USERS_LOCK_ID})`),
      db.execute(sql`
        delete from ${adminUsers} as target
        where target.id = ${id}
          and exists (select 1 from ${adminUsers} as me where me.id = ${admin.userId})
          and (select count(*) from ${adminUsers} as everyone) > 1
        returning target.username`),
    ]);
    const rows = (result as unknown as { rows?: Array<{ username: string }> }).rows ?? [];
    removed = rows[0]?.username ?? null;
  } catch (err) {
    console.error(`[admin] administrator nije uklonjen (${dbErrorLabel(err)})`);
    return fail("Uklanjanje nije uspjelo. Pokušajte ponovno za minutu.");
  }
  if (!removed) return fail("Korisnik nije uklonjen: možda je već uklonjen, ili bi to bio posljednji administrator.");

  revalidatePath("/admin/postavke/korisnici");
  return { ok: true, message: `Administrator „${removed}“ je uklonjen.`, at: now() };
}
