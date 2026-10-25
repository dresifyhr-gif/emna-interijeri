/**
 * /admin/odjava — POST (from the shell's "Odjava" form) clears the session cookie and goes to
 * /admin/prijava. Cross-site POSTs are refused; GET never logs out (no logout via a link/image).
 */
import { NextResponse } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/jwt";
import { isSameOrigin } from "@/lib/auth/request";

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers, req.url)) {
    return new NextResponse("Zahtjev nije dopušten.", { status: 403, headers: { "cache-control": "no-store" } });
  }
  // 303: the browser follows with a GET
  const res = NextResponse.redirect(new URL("/admin/prijava", req.url), { status: 303 });
  res.headers.set("cache-control", "no-store");
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export function GET(req: Request) {
  const res = NextResponse.redirect(new URL("/admin", req.url), { status: 303 });
  res.headers.set("cache-control", "no-store");
  return res;
}
