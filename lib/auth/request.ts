/**
 * Request helpers shared by the admin's server actions and route handlers.
 * No "server-only" / next imports so it can be used from proxy.ts as well.
 */
import { site } from "@/lib/site";

function originOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

/** first hop of x-forwarded-for (set by Vercel), or x-real-ip, or "unknown" */
export function clientIp(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return (forwarded || headers.get("x-real-ip")?.trim() || "unknown").slice(0, 64);
}

/**
 * CSRF guard for anything that changes state.
 * Browsers always send Origin on POST/PUT/PATCH/DELETE and on Server Action calls; it must be
 * the host the request arrived on (or the canonical site.url). A missing Origin is accepted only
 * when Fetch Metadata says the request is same-origin — so cross-site forms and fetches fail.
 */
export function isSameOrigin(headers: Headers, requestUrl?: string): boolean {
  const origin = headers.get("origin");
  if (origin === null || origin === "") {
    return headers.get("sec-fetch-site")?.trim().toLowerCase() === "same-origin";
  }
  let from: URL;
  try {
    from = new URL(origin); // the opaque origin "null" throws here
  } catch {
    return false;
  }
  if (from.protocol !== "https:" && from.protocol !== "http:") return false;
  if (from.origin === originOf(site.url)) return true;
  if (requestUrl && from.origin === originOf(requestUrl)) return true;
  const host = (headers.get("x-forwarded-host") ?? headers.get("host"))?.split(",")[0]?.trim().toLowerCase();
  return Boolean(host) && from.host.toLowerCase() === host;
}

const AUTH_PAGES = ["/admin/prijava", "/admin/postavljanje", "/admin/odjava"];

/**
 * Where to go after logging in: only a path inside /admin on our own origin
 * (no "//evil.com", no "\\", no login/setup/logout loops). Anything else → "/admin".
 */
export function safeAdminNext(raw: unknown): string {
  if (typeof raw !== "string" || raw.length === 0 || raw.length > 500) return "/admin";
  if (!raw.startsWith("/") || raw.startsWith("//") || raw.includes("\\")) return "/admin";
  let u: URL;
  try {
    u = new URL(raw, "http://admin.invalid");
  } catch {
    return "/admin";
  }
  if (u.origin !== "http://admin.invalid") return "/admin";
  if (u.pathname !== "/admin" && !u.pathname.startsWith("/admin/")) return "/admin";
  if (AUTH_PAGES.some((p) => u.pathname === p || u.pathname.startsWith(`${p}/`))) return "/admin";
  return `${u.pathname}${u.search}`;
}
