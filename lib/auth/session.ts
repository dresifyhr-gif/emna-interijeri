/**
 * Admin sessions for Server Components, Server Actions and Route Handlers.
 *
 *   // page.tsx / layout.tsx (every admin page — layouts are not re-run on client navigation)
 *   const admin = await requireAdmin();
 *
 *   // "use server" action that changes data
 *   export async function save(formData: FormData) {
 *     const admin = await requireAdminAction();   // Origin check + session, redirects if logged out
 *     …
 *   }
 *
 *   // app/api/admin/…/route.ts
 *   export async function POST(req: Request) {
 *     const auth = await requireAdminApi(req);     // 401/403 Response or the session
 *     if (auth instanceof Response) return auth;
 *     …
 *   }
 *
 * proxy.ts only does an optimistic JWT check; these functions are the real gate: they verify the
 * token AND that the user still exists with the same session_version.
 */
import "server-only";
import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq, sql } from "drizzle-orm";
import { getDb, isDbConfigured } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { SESSION_COOKIE, SESSION_TTL_SECONDS, isSessionConfigured, signSessionToken, verifySessionToken } from "./jwt";
import { isSameOrigin, safeAdminNext } from "./request";

export interface AdminSession {
  userId: string;
  username: string;
}

/** request header set by proxy.ts with the requested admin path (used for ?next= after login) */
export const PATH_HEADER = "x-emna-admin-path";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** true when the admin can work at all (session secret + database present) */
export function isAdminConfigured(): boolean {
  return isSessionConfigured() && isDbConfigured();
}

/**
 * The logged-in admin, or null. Cached per request, so a layout and its page share one lookup.
 * A database outage yields null (→ login page) rather than a crash.
 */
export const getSession = cache(async (): Promise<AdminSession | null> => {
  if (!isAdminConfigured()) return null;
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const claims = await verifySessionToken(token);
  if (!claims || !UUID_RE.test(claims.sub)) return null;
  try {
    const [user] = await getDb()
      .select({ id: adminUsers.id, username: adminUsers.username, sessionVersion: adminUsers.sessionVersion })
      .from(adminUsers)
      .where(eq(adminUsers.id, claims.sub))
      .limit(1);
    if (!user || user.sessionVersion !== claims.sv) return null;
    return { userId: user.id, username: user.username };
  } catch {
    return null;
  }
});

async function loginUrl(): Promise<string> {
  const h = await headers();
  const next = safeAdminNext(h.get(PATH_HEADER));
  return next === "/admin" ? "/admin/prijava" : `/admin/prijava?next=${encodeURIComponent(next)}`;
}

/** for pages and layouts: the session, or a redirect to /admin/prijava */
export async function requireAdmin(): Promise<AdminSession> {
  const session = await getSession();
  if (!session) redirect(await loginUrl());
  return session;
}

export class AdminForbiddenError extends Error {
  constructor() {
    super("Zahtjev nije dopušten.");
    this.name = "AdminForbiddenError";
  }
}

/** true when the current Server Action / request comes from our own origin */
export async function isSameOriginAction(): Promise<boolean> {
  return isSameOrigin(await headers());
}

/**
 * for Server Actions that read or change data: Origin check (throws AdminForbiddenError)
 * plus session (redirects to the login page when logged out).
 */
export async function requireAdminAction(): Promise<AdminSession> {
  if (!(await isSameOriginAction())) throw new AdminForbiddenError();
  return requireAdmin();
}

const json = (status: number, error: string) =>
  Response.json({ ok: false, error }, { status, headers: { "cache-control": "no-store" } });

/**
 * for Route Handlers: the session, or a ready 401/403 Response.
 * Non-GET/HEAD requests must also pass the Origin check.
 */
export async function requireAdminApi(req: Request): Promise<AdminSession | Response> {
  const method = req.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD" && !isSameOrigin(req.headers, req.url)) return json(403, "forbidden");
  const session = await getSession();
  if (!session) return json(401, "unauthorized");
  return session;
}

/* ================================================================== cookie */

const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
});

/** issues the session cookie (Server Actions / Route Handlers only) and stamps last_login_at */
export async function startSession(user: { id: string; username: string; sessionVersion: number }): Promise<void> {
  const token = await signSessionToken({ sub: user.id, u: user.username, sv: user.sessionVersion });
  (await cookies()).set(SESSION_COOKIE, token, { ...cookieOptions(), maxAge: SESSION_TTL_SECONDS });
  try {
    await getDb().update(adminUsers).set({ lastLoginAt: sql`now()` }).where(eq(adminUsers.id, user.id));
  } catch {
    /* cosmetic — never block a login on it */
  }
}

/** removes the session cookie (Server Actions / Route Handlers only) */
export async function endSession(): Promise<void> {
  (await cookies()).set(SESSION_COOKIE, "", { ...cookieOptions(), maxAge: 0 });
}

/** invalidates every session of a user (e.g. after a password change); call startSession again to stay logged in */
export async function revokeAllSessions(userId: string): Promise<number> {
  const [row] = await getDb()
    .update(adminUsers)
    .set({ sessionVersion: sql`${adminUsers.sessionVersion} + 1` })
    .where(eq(adminUsers.id, userId))
    .returning({ sessionVersion: adminUsers.sessionVersion });
  return row?.sessionVersion ?? 0;
}
