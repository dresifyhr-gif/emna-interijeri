/**
 * The one model call, through the Vercel AI Gateway (AI SDK 7, a plain "provider/model" string; authentication is the
 * project's OIDC token on Vercel / `vercel env pull` locally, or AI_GATEWAY_API_KEY). Structured output with the
 * schema of schema.ts; a reply that does not quite fit the schema is rescued part by part (lenientOutput) rather than
 * failing the whole request. Errors become an AiModelError with a code the route turns into a Croatian message.
 * Never logs or returns the customer's text or photo.
 */
import { NoObjectGeneratedError, Output, generateText, type ModelMessage } from "ai";
import { EditOpSchema, KitchenBriefSchema, ModelOutputSchema, type ModelOutput } from "./schema";
import type { HistoryTurn } from "./prompt";
import type { ModelSettings } from "./status";

export type AiErrorCode = "auth" | "credits" | "rate" | "unavailable" | "timeout" | "output" | "unknown";

export class AiModelError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AiModelError";
  }
}

export interface ModelCallInput {
  system: string;
  history: HistoryTurn[];
  userText: string;
  image: { mediaType: string; base64: string } | null;
}

export interface ModelCallResult {
  output: ModelOutput;
  /** the model that answered (a fallback may have) */
  model: string;
  inputTokens: number | null;
  outputTokens: number | null;
  cachedTokens: number | null;
  /** USD as the gateway billed it (providerMetadata.gateway.cost); null when not reported */
  costUsd: number | null;
  generationId: string | null;
  ms: number;
  /** the structured output had to be rescued part by part */
  rescued: boolean;
}

export type ModelCall = (input: ModelCallInput) => Promise<ModelCallResult>;

/** history (oldest first) + this turn → model messages: starts with the customer, roles alternate, the photo goes last */
export function buildMessages(input: ModelCallInput): ModelMessage[] {
  const turns: HistoryTurn[] = [];
  for (const t of input.history) {
    const text = t.text.trim();
    if (!text) continue;
    if (!turns.length && t.role === "assistant") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === t.role) last.text = `${last.text}\n${text}`;
    else turns.push({ role: t.role, text });
  }
  // the current turn is the customer's: a dangling customer turn in the history joins it
  let prefix = "";
  if (turns.length && turns[turns.length - 1].role === "user") prefix = `${turns.pop()?.text}\n\n`;
  const msgs: ModelMessage[] = turns.map((t) => (t.role === "user" ? { role: "user", content: t.text } : { role: "assistant", content: t.text }));
  const text = prefix ? `RANIJE (nastavak): ${prefix}${input.userText}` : input.userText;
  msgs.push({
    role: "user",
    content: input.image ? [{ type: "file", mediaType: input.image.mediaType, data: input.image.base64 }, { type: "text", text }] : [{ type: "text", text }],
  });
  return msgs;
}

/** a model answer that is valid JSON but not quite the schema: keep what is valid (reply, brief, each op on its own) */
export function lenientOutput(raw: unknown): ModelOutput | null {
  let v = raw;
  if (typeof v === "string") {
    const s = v.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "");
    const a = s.indexOf("{");
    const b = s.lastIndexOf("}");
    if (a < 0 || b <= a) return null;
    try {
      v = JSON.parse(s.slice(a, b + 1));
    } catch {
      return null;
    }
  }
  if (!v || typeof v !== "object") return null;
  const full = ModelOutputSchema.safeParse(v);
  if (full.success) return full.data;
  const o = v as Record<string, unknown>;
  const reply = typeof o.reply === "string" ? o.reply : "";
  const brief = o.brief ? KitchenBriefSchema.safeParse(o.brief) : null;
  const ops = Array.isArray(o.ops) ? o.ops.map((x) => EditOpSchema.safeParse(x)).filter((r) => r.success).map((r) => r.data) : [];
  if (!reply && !(brief && brief.success) && !ops.length) return null;
  return { reply, brief: brief && brief.success ? brief.data : null, ops };
}

/** walk RetryError.lastError / cause chains for what the gateway said */
function errorFacts(e: unknown): { status: number | null; type: string; name: string; text: string } {
  let status: number | null = null;
  let type = "";
  const names: string[] = [];
  const texts: string[] = [];
  const seen = new Set<unknown>();
  let cur: unknown = e;
  for (let i = 0; cur && typeof cur === "object" && i < 6 && !seen.has(cur); i++) {
    seen.add(cur);
    const x = cur as { statusCode?: unknown; type?: unknown; name?: unknown; message?: unknown; lastError?: unknown; cause?: unknown; responseBody?: unknown };
    if (status === null && typeof x.statusCode === "number") status = x.statusCode;
    if (!type && typeof x.type === "string") type = x.type;
    if (typeof x.name === "string") names.push(x.name);
    if (typeof x.message === "string") texts.push(x.message);
    if (typeof x.responseBody === "string") texts.push(x.responseBody.slice(0, 400));
    cur = x.lastError ?? x.cause;
  }
  return { status, type, name: names.join(" "), text: texts.join(" ").toLowerCase() };
}

export function classifyError(e: unknown): AiErrorCode {
  if (e instanceof AiModelError) return e.code;
  const f = errorFacts(e);
  if (/timeout|aborted|abort/i.test(f.name) || f.text.includes("timed out") || f.text.includes("timeout")) return "timeout";
  if (NoObjectGeneratedError.isInstance(e) || /NoObjectGenerated|NoOutputGenerated|TypeValidation|JSONParse/.test(f.name)) return "output";
  if (f.status === 401 || f.type === "authentication_error" || f.text.includes("oidc") || f.text.includes("api key")) return "auth";
  if (f.status === 402 || f.text.includes("insufficient") || f.text.includes("quota") || f.text.includes("free tier") || f.text.includes("credits") || f.text.includes("customer_verification")) return "credits";
  if (f.status === 429 || f.type === "rate_limit_exceeded") return "rate";
  if ((f.status !== null && f.status >= 500) || f.type === "model_not_found" || f.text.includes("no_providers_available")) return "unavailable";
  return "unknown";
}

const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
};

/** the model call through the AI Gateway with these settings */
export function createGatewayModelCall(settings: ModelSettings): ModelCall {
  return async (input) => {
    const t0 = Date.now();
    let rescued = false;
    try {
      const result = await generateText({
        model: settings.model,
        instructions: input.system,
        messages: buildMessages(input),
        output: Output.object({ name: "kuhinja", description: "Odgovor kupcu i kuhinja ili izmjene.", schema: ModelOutputSchema }),
        reasoning: settings.reasoning,
        maxOutputTokens: 8000,
        maxRetries: 1,
        timeout: settings.timeoutMs,
        providerOptions: {
          gateway: {
            ...(settings.fallbacks.length ? { models: settings.fallbacks } : {}),
            // the system prompt is the same for every request: let the provider cache it
            caching: "auto",
            // only providers that do not train on the prompts (the privacy page says so)
            disallowPromptTraining: true,
          },
        },
      });
      let output: ModelOutput | null = null;
      try {
        output = result.output;
      } catch {
        output = lenientOutput(result.text);
        rescued = true;
      }
      if (!output) throw new AiModelError("output", "Model nije vratio kuhinju.");
      const gw = (result.providerMetadata?.gateway ?? {}) as Record<string, unknown>;
      const routing = gw.routing as { resolvedProvider?: unknown; finalModel?: unknown } | undefined;
      return {
        output,
        model: typeof result.response?.modelId === "string" ? result.response.modelId : typeof routing?.finalModel === "string" ? routing.finalModel : settings.model,
        inputTokens: num(result.usage?.inputTokens),
        outputTokens: num(result.usage?.outputTokens),
        cachedTokens: num((result.usage as { inputTokenDetails?: { cacheReadTokens?: unknown } } | undefined)?.inputTokenDetails?.cacheReadTokens),
        costUsd: num(gw.cost),
        generationId: typeof gw.generationId === "string" ? gw.generationId : null,
        ms: Date.now() - t0,
        rescued,
      };
    } catch (e) {
      // a structured answer that missed the schema: rescue what is valid instead of failing the customer
      if (NoObjectGeneratedError.isInstance(e)) {
        const output = lenientOutput(e.text ?? "");
        if (output) {
          return {
            output,
            model: e.response?.modelId ?? settings.model,
            inputTokens: num(e.usage?.inputTokens),
            outputTokens: num(e.usage?.outputTokens),
            cachedTokens: null,
            costUsd: null,
            generationId: null,
            ms: Date.now() - t0,
            rescued: true,
          };
        }
      }
      if (e instanceof AiModelError) throw e;
      throw new AiModelError(classifyError(e), "Poziv modela nije uspio.");
    }
  };
}
