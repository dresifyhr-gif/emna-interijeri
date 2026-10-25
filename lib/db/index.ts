/**
 * Lazy database client (Neon serverless driver over HTTP + Drizzle).
 *
 *   import { getDb, schema } from "@/lib/db";
 *   const rows = await getDb().select().from(schema.leads);
 *
 * Nothing connects at import time, so `next build` works without DATABASE_URL; the first
 * getDb() call throws DbNotConfiguredError when the variable is missing.
 *
 * HTTP transport: every query is one round trip, there are no interactive transactions.
 * For several writes that must succeed together use `getDb().batch([...])` (one transaction).
 */
import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle, type NeonHttpDatabase } from "drizzle-orm/neon-http";
import * as schema from "./schema";

export { schema };
export type Db = NeonHttpDatabase<typeof schema>;

export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set");
    this.name = "DbNotConfiguredError";
  }
}

const g = globalThis as typeof globalThis & { __emnaDb?: Db };

export function isDbConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function getDb(): Db {
  if (g.__emnaDb) return g.__emnaDb;
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new DbNotConfiguredError();
  const db = drizzle({ client: neon(url), schema });
  g.__emnaDb = db;
  return db;
}

/**
 * Postgres error code of a failed query (e.g. "23505" unique violation), if any.
 * Drizzle wraps driver errors, so the code may sit on `cause`.
 */
export function pgErrorCode(err: unknown): string | null {
  for (let e: unknown = err, i = 0; e && i < 4; e = (e as { cause?: unknown }).cause, i++) {
    const code = (e as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}

/** safe one-line description of a DB error for logs — never includes query parameters */
export function dbErrorLabel(err: unknown): string {
  if (err instanceof DbNotConfiguredError) return "not_configured";
  const code = pgErrorCode(err);
  if (code) return `pg ${code}`;
  return err instanceof Error ? err.name : "unknown";
}
