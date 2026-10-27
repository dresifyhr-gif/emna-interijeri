/**
 * Who may use "Opiši kuhinju" and how much (pure: env in, decisions out — no server imports, unit-tested).
 *
 *   STUDIO_AI           "off" | "admin" | "on" — unset: "on" in development, "admin" in production (only a visitor with a
 *                       valid emna_admin session), so production stays private until the owner approves the cost
 *   STUDIO_AI_DAILY     requests per rolling day for the whole site (default 300), counted in the database
 *   STUDIO_AI_MODEL     AI Gateway "provider/model" (default anthropic/claude-sonnet-5.5)
 *   STUDIO_AI_FALLBACK  comma-separated fallback models (default anthropic/claude-sonnet-5; "none" = no fallback)
 *   STUDIO_AI_TIMEOUT_MS  model call timeout (default 45000, 5000–90000)
 *   STUDIO_AI_REASONING   reasoning effort (default "low": the model fills a form, the code does the geometry)
 */

export type AiMode = "off" | "admin" | "on";

export interface AiEnv {
  STUDIO_AI?: string;
  STUDIO_AI_DAILY?: string;
  STUDIO_AI_MODEL?: string;
  STUDIO_AI_FALLBACK?: string;
  STUDIO_AI_TIMEOUT_MS?: string;
  STUDIO_AI_REASONING?: string;
  NODE_ENV?: string;
}

export const DEFAULT_MODEL = "anthropic/claude-sonnet-5.5";
export const DEFAULT_FALLBACKS = ["anthropic/claude-sonnet-5"];
export const DEFAULT_DAILY = 300;
/** per visitor (IP) and hour; the admin gets more for testing */
export const PER_IP_PER_HOUR = 20;
export const ADMIN_PER_HOUR = 60;

export function aiMode(env: AiEnv): AiMode {
  const v = env.STUDIO_AI?.trim().toLowerCase();
  if (v === "off" || v === "admin" || v === "on") return v;
  return env.NODE_ENV === "production" ? "admin" : "on";
}

/** may this visitor use it: "on" everyone, "admin" only a logged-in admin, "off" nobody */
export function aiAllowed(mode: AiMode, isAdmin: boolean): boolean {
  return mode === "on" || (mode === "admin" && isAdmin);
}

function int(v: string | undefined, fallback: number, lo: number, hi: number): number {
  const n = Number.parseInt(v ?? "", 10);
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}

export function dailyCap(env: AiEnv): number {
  return int(env.STUDIO_AI_DAILY, DEFAULT_DAILY, 0, 100_000);
}

const MODEL_RE = /^[a-z0-9-]+\/[a-z0-9.\-]+$/i;
const REASONING = ["none", "minimal", "low", "medium", "high", "xhigh", "max", "provider-default"] as const;
export type Reasoning = (typeof REASONING)[number];

export interface ModelSettings {
  model: string;
  fallbacks: string[];
  timeoutMs: number;
  reasoning: Reasoning;
}

export function modelSettings(env: AiEnv): ModelSettings {
  const m = env.STUDIO_AI_MODEL?.trim();
  const model = m && MODEL_RE.test(m) ? m : DEFAULT_MODEL;
  const fb = env.STUDIO_AI_FALLBACK?.trim();
  const fallbacks =
    fb === undefined || fb === ""
      ? DEFAULT_FALLBACKS.filter((x) => x !== model)
      : fb.toLowerCase() === "none"
        ? []
        : fb
            .split(",")
            .map((x) => x.trim())
            .filter((x) => MODEL_RE.test(x) && x !== model)
            .slice(0, 3);
  const r = env.STUDIO_AI_REASONING?.trim().toLowerCase() as Reasoning | undefined;
  return {
    model,
    fallbacks,
    timeoutMs: int(env.STUDIO_AI_TIMEOUT_MS, 45_000, 5_000, 90_000),
    reasoning: r && (REASONING as readonly string[]).includes(r) ? r : "low",
  };
}
