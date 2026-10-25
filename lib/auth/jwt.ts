/**
 * Session token (JWT, HS256, signed with ADMIN_SESSION_SECRET).
 *
 * Deliberately free of "server-only", next/headers and the database so proxy.ts can import it
 * for its optimistic check. The authoritative check (user still exists, session version matches)
 * is getSession() in lib/auth/session.ts.
 */
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "emna_admin";
/** 14 days */
export const SESSION_TTL_SECONDS = 14 * 24 * 60 * 60;

const ISSUER = "emna-admin";
const AUDIENCE = "emna-admin";
const MIN_SECRET_LENGTH = 32;

export interface SessionClaims {
  /** admin_users.id */
  sub: string;
  /** username (display only — authorisation always goes by `sub`) */
  u: string;
  /** admin_users.session_version at login */
  sv: number;
}

let cached: { raw: string; key: Uint8Array } | null = null;

function secretKey(): Uint8Array | null {
  const raw = process.env.ADMIN_SESSION_SECRET?.trim();
  if (!raw || raw.length < MIN_SECRET_LENGTH) return null;
  if (cached?.raw !== raw) cached = { raw, key: new TextEncoder().encode(raw) };
  return cached.key;
}

/** false when ADMIN_SESSION_SECRET is missing or shorter than 32 characters */
export function isSessionConfigured(): boolean {
  return secretKey() !== null;
}

export async function signSessionToken(claims: SessionClaims): Promise<string> {
  const key = secretKey();
  if (!key) throw new Error("ADMIN_SESSION_SECRET is not configured");
  return new SignJWT({ u: claims.u, sv: claims.sv })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(key);
}

/** verified claims, or null for a missing / forged / expired / malformed token */
export async function verifySessionToken(token: string | undefined | null): Promise<SessionClaims | null> {
  if (!token || token.length > 4096) return null;
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"], issuer: ISSUER, audience: AUDIENCE });
    const { sub, u, sv } = payload as { sub?: unknown; u?: unknown; sv?: unknown };
    if (typeof sub !== "string" || typeof u !== "string" || typeof sv !== "number") return null;
    return { sub, u, sv };
  } catch {
    return null;
  }
}
