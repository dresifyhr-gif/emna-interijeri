/**
 * Password hashing with node:crypto scrypt (N = 2^15, r = 8, p = 1, 16-byte salt, 64-byte key).
 * Stored as "scrypt$<N>$<r>$<p>$<salt b64url>$<hash b64url>" so the cost can be raised later
 * without breaking existing hashes (verify reads the parameters from the string).
 */
import "server-only";
import { randomBytes, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

const N = 2 ** 15;
const R = 8;
const P = 1;
const KEY_LEN = 64;
const SALT_LEN = 16;
/** scrypt needs ~128·N·r bytes (32 MiB here); Node's default cap is exactly 32 MiB, so leave headroom */
const MAX_MEM = 128 * 1024 * 1024;

export const PASSWORD_MIN = 10;
/** long passphrases are fine; this only stops absurd payloads */
export const PASSWORD_MAX = 200;
export const USERNAME_MIN = 3;
export const USERNAME_MAX = 40;
export const USERNAME_RE = /^[a-z0-9](?:[a-z0-9._-]*[a-z0-9])?$/;

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scryptCb(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LEN);
  const key = await scrypt(password, salt, KEY_LEN, { N, r: R, p: P, maxmem: MAX_MEM });
  return ["scrypt", N, R, P, salt.toString("base64url"), key.toString("base64url")].join("$");
}

/** constant-time check; false for any malformed hash */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (![n, r, p].every(Number.isSafeInteger) || n < 2 ** 14 || n > 2 ** 20 || r < 1 || r > 32 || p < 1 || p > 16) return false;
  const salt = Buffer.from(parts[4], "base64url");
  const expected = Buffer.from(parts[5], "base64url");
  if (salt.length < 16 || expected.length < 32) return false;
  try {
    const actual = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAX_MEM });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

/**
 * Burns the same CPU as a real check, for logins with an unknown username,
 * so response time doesn't reveal which usernames exist.
 */
let dummyHash: Promise<string> | null = null;
export async function verifyAgainstDummy(password: string): Promise<false> {
  dummyHash ??= hashPassword(randomBytes(18).toString("base64url"));
  await verifyPassword(password, await dummyHash);
  return false;
}

export function normalizeUsername(raw: string): string {
  return raw.normalize("NFKC").trim().toLowerCase();
}

/** Croatian error for an invalid (already normalised) username, or null */
export function usernameProblem(username: string): string | null {
  if (username.length < USERNAME_MIN) return `Korisničko ime mora imati barem ${USERNAME_MIN} znaka.`;
  if (username.length > USERNAME_MAX) return `Korisničko ime može imati najviše ${USERNAME_MAX} znakova.`;
  if (!USERNAME_RE.test(username))
    return "Dopuštena su mala slova bez dijakritike, brojke te točka, crtica i podvlaka (ne na početku ni na kraju).";
  return null;
}

/** Croatian error for a password that must be refused, or null */
export function passwordProblem(password: string, username?: string): string | null {
  if (password.length < PASSWORD_MIN) return `Lozinka mora imati barem ${PASSWORD_MIN} znakova.`;
  if (password.length > PASSWORD_MAX) return `Lozinka može imati najviše ${PASSWORD_MAX} znakova.`;
  if (/^(.)\1+$/u.test(password)) return "Lozinka ne smije biti jedan znak ponovljen.";
  if (username && password.toLowerCase().includes(username.toLowerCase()) && username.length >= USERNAME_MIN)
    return "Lozinka ne smije sadržavati korisničko ime.";
  return null;
}
