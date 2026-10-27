/**
 * The "Opiši kuhinju" endpoint as plain Request → Response functions with injected dependencies (who is an admin, the
 * database throttle, the model call), so it is unit-tested without Next, a database or the network. The route
 * (app/api/studio/ai/route.ts) wires the real ones (server.ts).
 *
 *   GET   → { enabled: boolean }  may this visitor use it now (STUDIO_AI mode + admin session)
 *   POST  { message, config, image, history } → { ok: true, config, changed, reply, notes, assumptions }
 *         or { ok: false, error, message } with a friendly Croatian message — never a stack trace
 *
 * Order of checks: mode → same origin → admin (mode "admin") → JSON body ≤ LIMITS.body → schema → photo → the kitchen
 * link → per-IP limit → the site's daily cap → the model → brief / operations → the new share link. The customer's
 * text and photo are never logged, only sizes, timings, tokens and cost.
 */
import { decodeConfig, encodeConfig } from "../share";
import { sanitizeConfig } from "../plan";
import type { KitchenConfig } from "../types";
import { briefSaysNothing, composeKitchen } from "./compose";
import { checkImage } from "./image";
import { AiModelError, classifyError, type AiErrorCode, type ModelCall, type ModelCallResult } from "./model";
import { applyOps } from "./ops";
import { SYSTEM_PROMPT, userTurnText } from "./prompt";
import { AiRequestSchema, LIMITS } from "./schema";
import { ADMIN_PER_HOUR, PER_IP_PER_HOUR, aiAllowed, aiMode, dailyCap, type AiEnv } from "./status";

export interface ThrottleHit {
  allowed: boolean;
  retryAfter: number;
}

export interface AiDeps {
  env: AiEnv;
  /** a valid emna_admin session on this request */
  isAdmin(req: Request): Promise<boolean>;
  /** the database throttle (lib/auth/throttle.ts hitThrottle); null = no database (development only) */
  throttle: ((scope: string, key: string, opts: { limit: number; windowSeconds: number }) => Promise<ThrottleHit>) | null;
  callModel: ModelCall;
  clientIp(req: Request): string;
  sameOrigin(req: Request): boolean;
  log?(line: string): void;
}

export type AiSuccess = {
  ok: true;
  /** the kitchen as a share-link string (lib/studio/share.ts decodeConfig), or null when there is still no kitchen */
  config: string | null;
  /** the kitchen differs from the one sent */
  changed: boolean;
  reply: string;
  notes: string[];
  assumptions: string[];
};
export type AiFailure = { ok: false; error: string; message: string };

const json = (body: AiSuccess | AiFailure | { enabled: boolean }, status = 200, headers: Record<string, string> = {}) =>
  Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });

const failure = (status: number, error: string, message: string, headers: Record<string, string> = {}) => json({ ok: false, error, message }, status, headers);

const MODEL_MESSAGE: Record<AiErrorCode, [number, string]> = {
  auth: [503, "Pomoćnik trenutno nije dostupan. Kuhinju možete složiti i sami u studiju."],
  credits: [503, "Pomoćnik trenutno nije dostupan. Kuhinju možete složiti i sami u studiju."],
  rate: [503, "Pomoćnik je trenutno zauzet — pokušajte ponovno za minutu."],
  unavailable: [503, "Pomoćnik trenutno nije dostupan — pokušajte ponovno malo kasnije."],
  timeout: [504, "Pomoćnik se predugo zadržao — pokušajte ponovno, po mogućnosti kraćim opisom."],
  output: [502, "Nisam uspio složiti kuhinju iz tog opisa — pokušajte ga napisati malo drukčije."],
  unknown: [502, "Nešto nije u redu s pomoćnikom — pokušajte ponovno."],
};

async function readBody(req: Request, limit: number): Promise<string | null> {
  const declared = Number(req.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) return null;
  if (!req.body) return "";
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel().catch(() => {});
      return null;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

const isJson = (req: Request) => (req.headers.get("content-type") ?? "").split(";")[0]?.trim().toLowerCase() === "application/json";
const isProd = (env: AiEnv) => env.NODE_ENV === "production";

function compose(output: ModelCallResult["output"], cfg: KitchenConfig | null): { cfg: KitchenConfig | null; notes: string[]; assumptions: string[]; applied: number; refused: number } {
  // a brief that says nothing (a model filling the form for "hvala" or a question) never wipes the kitchen on screen
  if (output.brief && !(cfg && briefSaysNothing(output.brief))) {
    const c = composeKitchen(output.brief);
    if (!output.ops.length) return { cfg: c.cfg, notes: c.notes, assumptions: c.assumptions, applied: 1, refused: 0 };
    const o = applyOps(c.cfg, output.ops);
    return { cfg: o.cfg, notes: [...c.notes, ...o.notes], assumptions: c.assumptions, applied: 1 + o.applied, refused: o.refused };
  }
  if (!cfg) return { cfg: null, notes: [], assumptions: [], applied: 0, refused: 0 };
  const o = applyOps(cfg, output.ops);
  return { cfg: o.cfg, notes: o.notes, assumptions: [], applied: o.applied, refused: o.refused };
}

export function createStudioAiHandler(deps: AiDeps) {
  const log = deps.log ?? ((line: string) => console.info(line));

  async function GET(req: Request): Promise<Response> {
    const mode = aiMode(deps.env);
    let enabled = mode === "on";
    if (mode === "admin") enabled = await deps.isAdmin(req).catch(() => false);
    return json({ enabled });
  }

  async function POST(req: Request): Promise<Response> {
    const env = deps.env;
    const mode = aiMode(env);
    if (mode === "off") return failure(403, "disabled", "Pomoćnik trenutno nije uključen.");
    if (!deps.sameOrigin(req)) return failure(403, "forbidden", "Zahtjev nije dopušten.");
    const admin = await deps.isAdmin(req).catch(() => false);
    if (!aiAllowed(mode, admin)) return failure(403, "disabled", "Pomoćnik trenutno nije uključen.");
    if (!isJson(req)) return failure(415, "validation", "Zahtjev nije ispravan.");

    let raw: string | null;
    try {
      raw = await readBody(req, LIMITS.body);
    } catch {
      return failure(400, "validation", "Zahtjev nije ispravan.");
    }
    if (raw === null) return failure(413, "too_large", "Poruka sa slikom je prevelika — pošaljite manju sliku.");
    let data: unknown;
    try {
      data = JSON.parse(raw);
    } catch {
      return failure(400, "validation", "Zahtjev nije ispravan.");
    }
    const parsed = AiRequestSchema.safeParse(data);
    if (!parsed.success) {
      const tooLong = parsed.error.issues.some((i) => i.path[0] === "message" && i.code === "too_big");
      return failure(400, "validation", tooLong ? `Opis je predug — najviše ${LIMITS.message} znakova.` : "Zahtjev nije ispravan.");
    }
    const body = parsed.data;
    const message = body.message.trim();

    // the photo
    let image: { mediaType: string; base64: string } | null = null;
    let imageBytes = 0;
    if (body.image) {
      const chk = checkImage(body.image);
      if (!chk.ok) return failure(chk.status, "image", chk.message);
      image = { mediaType: chk.mediaType, base64: chk.base64 };
      imageBytes = chk.bytes;
    }
    if (!message && !image) return failure(400, "empty", "Napišite kakvu kuhinju želite ili dodajte fotografiju.");

    // the kitchen it is about
    let current: KitchenConfig | null = null;
    if (body.config) {
      current = decodeConfig(body.config);
      if (!current) return failure(400, "config", "Ne mogu pročitati trenutnu kuhinju — osvježite stranicu i pokušajte ponovno.");
    }

    // limits: per visitor and hour, then the whole site per day — every valid request counts
    if (!deps.throttle) {
      if (isProd(env)) return failure(503, "not_configured", "Pomoćnik trenutno nije dostupan.");
    } else {
      try {
        const ip = deps.clientIp(req);
        const hit = await deps.throttle("studio-ai-ip", ip, { limit: admin ? ADMIN_PER_HOUR : PER_IP_PER_HOUR, windowSeconds: 3600 });
        if (!hit.allowed) {
          return failure(429, "rate_limited", "Previše zahtjeva u kratkom vremenu — pokušajte ponovno malo kasnije.", { "retry-after": String(hit.retryAfter) });
        }
        const day = await deps.throttle("studio-ai-day", "site", { limit: dailyCap(env), windowSeconds: 86_400 });
        if (!day.allowed) return failure(503, "daily_cap", "Pomoćnik je danas imao puno posla — pokušajte ponovno sutra.", { "retry-after": String(day.retryAfter) });
      } catch {
        if (isProd(env)) return failure(503, "unavailable", "Pomoćnik trenutno nije dostupan — pokušajte ponovno malo kasnije.");
        log("[studio-ai] ograničenje nije provjereno (baza nije dostupna) — razvoj, nastavljam");
      }
    }

    // the model
    const history = (body.history ?? []).slice(-LIMITS.historyTurns).map((t) => ({ role: t.role, text: t.text.slice(0, LIMITS.historyText) }));
    let result: ModelCallResult;
    try {
      result = await deps.callModel({ system: SYSTEM_PROMPT, history, userText: userTurnText(message, current, Boolean(image)), image });
    } catch (e) {
      const code = e instanceof AiModelError ? e.code : classifyError(e);
      log(`[studio-ai] greška modela: ${code} (poruka ${message.length} zn., slika ${imageBytes} B)`);
      const [status, text] = MODEL_MESSAGE[code];
      return failure(status, `model_${code}`, text);
    }

    // brief → a new kitchen, operations → the current one
    let out: ReturnType<typeof compose>;
    try {
      out = compose(result.output, current);
    } catch {
      log("[studio-ai] greška pri slaganju kuhinje");
      return failure(500, "compose", "Nisam uspio složiti kuhinju iz tog opisa — pokušajte ga napisati malo drukčije.");
    }
    const before = current ? encodeConfig(sanitizeConfig(current)) : null;
    const after = out.cfg ? encodeConfig(out.cfg) : null;
    const changed = after !== before;

    let reply = result.output.reply.trim().slice(0, 400);
    if (out.refused > 0 && out.applied === 0) reply = "Tu promjenu nisam mogao napraviti — pogledajte napomenu ispod.";
    else if (out.refused > 0) reply = `${reply || "Napravio sam što je moguće."} Neke promjene nisu išle — pogledajte napomene.`;
    if (!reply) reply = changed ? (current ? "Kuhinja je promijenjena." : "Kuhinja je složena — pogledajte je u 3D prikazu.") : "Nisam ništa mijenjao.";

    const cost = result.costUsd !== null ? `$${result.costUsd.toFixed(5)}` : "?";
    log(
      `[studio-ai] ok ${mode}${admin ? " admin" : ""} model=${result.model} ${result.ms} ms in=${result.inputTokens ?? "?"} out=${result.outputTokens ?? "?"} cached=${result.cachedTokens ?? 0} cost=${cost} ` +
        `brief=${result.output.brief ? 1 : 0} ops=${result.output.ops.length} refused=${out.refused}${result.rescued ? " rescued" : ""} msg=${message.length} img=${imageBytes}`,
    );
    return json({ ok: true, config: after, changed, reply, notes: out.notes.slice(0, 12), assumptions: out.assumptions.slice(0, 12) });
  }

  return { GET, POST };
}
