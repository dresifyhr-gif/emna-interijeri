/**
 * Database-backed fixed-window throttle (shared by every serverless instance).
 *
 *   const hit = await hitThrottle("login", `${ip}|${username}`, { limit: 5, windowSeconds: 900 });
 *   if (!hit.allowed) … hit.retryAfter seconds
 *
 * Each call counts as one attempt. Keys are HMAC-SHA256(scope + id), so no IP address or
 * username is ever stored in clear.
 */
import "server-only";
import { createHmac } from "node:crypto";
import { eq, lt, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { authThrottle } from "@/lib/db/schema";

export interface ThrottleResult {
  allowed: boolean;
  /** attempts in the current window, including this one */
  count: number;
  /** seconds until the window resets */
  retryAfter: number;
}

function throttleKey(scope: string, id: string): string {
  const secret = process.env.ADMIN_SESSION_SECRET?.trim() || "emna-throttle";
  return `${scope}:${createHmac("sha256", secret).update(`${scope}\u0000${id}`).digest("base64url")}`;
}

export async function hitThrottle(
  scope: string,
  id: string,
  opts: { limit: number; windowSeconds: number },
): Promise<ThrottleResult> {
  const db = getDb();
  const key = throttleKey(scope, id);
  const win = Math.max(1, Math.floor(opts.windowSeconds));
  const expired = sql`${authThrottle.windowStart} < now() - make_interval(secs => ${win})`;
  const [row] = await db
    .insert(authThrottle)
    .values({ key, count: 1 })
    .onConflictDoUpdate({
      target: authThrottle.key,
      set: {
        count: sql`case when ${expired} then 1 else ${authThrottle.count} + 1 end`,
        windowStart: sql`case when ${expired} then now() else ${authThrottle.windowStart} end`,
      },
    })
    .returning({
      count: authThrottle.count,
      left: sql<number>`greatest(1, ceil(extract(epoch from (${authThrottle.windowStart} + make_interval(secs => ${win}) - now()))))::int`,
    });

  // now and then, drop windows that ended long ago
  if (Math.random() < 0.05) {
    db.delete(authThrottle)
      .where(lt(authThrottle.windowStart, sql`now() - interval '1 day'`))
      .catch(() => {});
  }

  const count = Number(row?.count ?? 1);
  return { allowed: count <= opts.limit, count, retryAfter: Number(row?.left ?? win) };
}

/** forget the attempts for this scope + id (e.g. after a successful login) */
export async function clearThrottle(scope: string, id: string): Promise<void> {
  await getDb().delete(authThrottle).where(eq(authThrottle.key, throttleKey(scope, id)));
}
