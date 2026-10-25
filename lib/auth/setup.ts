/**
 * First-run setup: /admin/postavljanje?kod=<ADMIN_SETUP_TOKEN> creates the first admin user.
 * Works only while admin_users is empty AND the code matches; afterwards it is inert.
 */
import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { hashPassword } from "./password";

const MIN_TOKEN_LENGTH = 16;
/** arbitrary constant: serialises concurrent setup attempts */
const SETUP_LOCK_ID = 7_302_419;

export function isSetupTokenConfigured(): boolean {
  return (process.env.ADMIN_SETUP_TOKEN?.trim().length ?? 0) >= MIN_TOKEN_LENGTH;
}

/** constant-time comparison (both sides hashed first, so length differences don't leak either) */
export function isValidSetupCode(code: unknown): boolean {
  const expected = process.env.ADMIN_SETUP_TOKEN?.trim();
  if (!expected || expected.length < MIN_TOKEN_LENGTH) return false;
  if (typeof code !== "string" || code.length === 0 || code.length > 512) return false;
  const a = createHash("sha256").update(code.trim(), "utf8").digest();
  const b = createHash("sha256").update(expected, "utf8").digest();
  return timingSafeEqual(a, b);
}

export async function adminExists(): Promise<boolean> {
  const rows = await getDb().select({ one: sql<number>`1` }).from(adminUsers).limit(1);
  return rows.length > 0;
}

/**
 * Creates the first admin, atomically: an advisory lock serialises concurrent attempts and the
 * insert only happens while the table is still empty. Returns null when an admin already exists.
 */
export async function createFirstAdmin(
  username: string,
  password: string,
): Promise<{ id: string; username: string; sessionVersion: number } | null> {
  const db = getDb();
  const passwordHash = await hashPassword(password);
  const [, inserted] = await db.batch([
    db.execute(sql`select pg_advisory_xact_lock(${SETUP_LOCK_ID})`),
    db.execute(sql`
      insert into ${adminUsers} (username, password_hash)
      select ${username}, ${passwordHash}
      where not exists (select 1 from ${adminUsers})
      returning id, username, session_version`),
  ]);
  const row = (inserted as unknown as { rows?: Array<{ id: string; username: string; session_version: number }> }).rows?.[0];
  return row ? { id: row.id, username: row.username, sessionVersion: Number(row.session_version) } : null;
}
