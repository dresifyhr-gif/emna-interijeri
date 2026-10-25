/**
 * Next.js 16 proxy (formerly middleware) — admin and the customer's quote page.
 *
 * - every /admin/** and /api/admin/** response: noindex + no framing + strict referrer
 * - optimistic gate: no valid session JWT → /admin/prijava?next=… (pages) or 401 JSON (API)
 * - /ponuda/** and /api/ponuda/** (public, token links): noindex + no framing + no referrer, no gate
 *
 * This is NOT the security boundary: every admin page, server action and route handler must still
 * call requireAdmin() / requireAdminAction() / requireAdminApi() from lib/auth/session.ts.
 *
 * Header precedence: a header set here is NOT overwritten by the route's own response (Next only
 * adds response headers that are not present yet). So no Content-Security-Policy is set here for
 * /api/** — the file routes send their own sandboxing CSP, which must not be replaced.
 */
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/auth/jwt";

const PATH_HEADER = "x-emna-admin-path"; // keep in sync with lib/auth/session.ts

/** reachable without a session */
const PUBLIC_PATHS = ["/admin/prijava", "/admin/postavljanje", "/admin/odjava"];

const under = (pathname: string, prefix: string) => pathname === prefix || pathname.startsWith(`${prefix}/`);

function isPublic(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => under(pathname, p));
}

function harden(res: NextResponse, opts: { api: boolean; referrer: "same-origin" | "no-referrer" }): NextResponse {
  res.headers.set("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
  res.headers.set("X-Frame-Options", "DENY");
  if (!opts.api) res.headers.set("Content-Security-Policy", "frame-ancestors 'none'");
  res.headers.set("Referrer-Policy", opts.referrer);
  res.headers.set("X-Content-Type-Options", "nosniff");
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");

  // the customer's quote (/ponuda/<token>): public, only headers — the token is the access check
  if (under(pathname, "/ponuda") || under(pathname, "/api/ponuda")) {
    return harden(NextResponse.next(), { api: isApi, referrer: "no-referrer" });
  }

  const adminHeaders = { api: isApi, referrer: "same-origin" } as const;

  // always overwrite: the header is ours, a client-sent one must never get through
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set(PATH_HEADER, `${pathname}${search}`.slice(0, 500));
  const pass = () => harden(NextResponse.next({ request: { headers: requestHeaders } }), adminHeaders);

  if (isPublic(pathname)) return pass();

  const claims = await verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value);
  if (claims) return pass();

  if (isApi) {
    return harden(
      NextResponse.json(
        { ok: false, error: "unauthorized" },
        { status: 401, headers: { "cache-control": "no-store", "content-security-policy": "default-src 'none'; frame-ancestors 'none'" } },
      ),
      adminHeaders,
    );
  }

  const login = req.nextUrl.clone();
  login.pathname = "/admin/prijava";
  login.search = "";
  const next = `${pathname}${search}`;
  if (next !== "/admin" && next.length <= 500) login.searchParams.set("next", next);
  return harden(NextResponse.redirect(login), adminHeaders);
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/api/admin/:path*", "/ponuda/:path*", "/api/ponuda/:path*"],
};
