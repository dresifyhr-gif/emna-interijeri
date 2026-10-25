/**
 * Credential check with throttling: 5 attempts / 15 min per IP + username, 30 / 15 min per IP.
 * Unknown usernames take as long as wrong passwords (dummy scrypt), and both get the same answer.
 */
import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { adminUsers } from "@/lib/db/schema";
import { PASSWORD_MAX, normalizeUsername, verifyAgainstDummy, verifyPassword } from "./password";
import { clearThrottle, hitThrottle } from "./throttle";

const WINDOW_SECONDS = 15 * 60;
const PER_PAIR = 5;
const PER_IP = 30;

export type LoginResult =
  | { ok: true; user: { id: string; username: string; sessionVersion: number } }
  | { ok: false; reason: "invalid" }
  | { ok: false; reason: "throttled"; retryAfter: number };

export async function attemptLogin(input: { username: string; password: string; ip: string }): Promise<LoginResult> {
  const username = normalizeUsername(input.username).slice(0, 100);
  const password = input.password;
  const pairId = `${input.ip}|${username}`;

  const [ipHit, pairHit] = await Promise.all([
    hitThrottle("login-ip", input.ip, { limit: PER_IP, windowSeconds: WINDOW_SECONDS }),
    hitThrottle("login", pairId, { limit: PER_PAIR, windowSeconds: WINDOW_SECONDS }),
  ]);
  if (!ipHit.allowed || !pairHit.allowed) {
    const retryAfter = Math.max(ipHit.allowed ? 0 : ipHit.retryAfter, pairHit.allowed ? 0 : pairHit.retryAfter);
    return { ok: false, reason: "throttled", retryAfter };
  }

  if (!username || !password || password.length > PASSWORD_MAX) {
    await verifyAgainstDummy(password.slice(0, PASSWORD_MAX));
    return { ok: false, reason: "invalid" };
  }

  const [user] = await getDb()
    .select({
      id: adminUsers.id,
      username: adminUsers.username,
      passwordHash: adminUsers.passwordHash,
      sessionVersion: adminUsers.sessionVersion,
    })
    .from(adminUsers)
    .where(eq(adminUsers.username, username))
    .limit(1);

  const ok = user ? await verifyPassword(password, user.passwordHash) : await verifyAgainstDummy(password);
  if (!user || !ok) return { ok: false, reason: "invalid" };

  await clearThrottle("login", pairId).catch(() => {});
  return { ok: true, user: { id: user.id, username: user.username, sessionVersion: user.sessionVersion } };
}
