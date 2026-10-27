/**
 * "Opiši kuhinju": the API contract with fake dependencies (no Next, no database, no network) — the mode per env
 * (STUDIO_AI off / admin / on, defaults per NODE_ENV), admin gating, the limits (body, message, image, per IP, per day),
 * friendly errors, brief and operation flows, nothing of the customer's text in the logs; plus the schema the model
 * fills (strict structured outputs: no optional fields, ≤ 16 unions, no oneOf, no numeric / string constraints), the
 * image check, the model helpers and the two edit.ts leftovers.
 *
 *   npx tsx --test lib/studio/ai/*.test.ts
 */
import assert from "node:assert/strict";
import { deflateSync } from "node:zlib";
import { describe, it } from "node:test";
import { zodSchema } from "ai";
import { moduleDef } from "../catalog";
import { heightChoices, setOvenColumn, slotEditInfo, typeDescription } from "../edit";
import { planKitchen, sanitizeConfig } from "../plan";
import { decodeConfig, encodeConfig } from "../share";
import { DEFAULT_CONFIG } from "../types";
import { createStudioAiHandler, type AiDeps, type ThrottleHit } from "./handler";
import { checkImage } from "./image";
import { AiModelError, buildMessages, classifyError, lenientOutput, type ModelCall, type ModelCallResult } from "./model";
import { SYSTEM_PROMPT, userTurnText } from "./prompt";
import { AiRequestSchema, BLANK_STYLE, LIMITS, ModelOutputSchema, blankBrief, type ModelOutput } from "./schema";
import { ADMIN_PER_HOUR, PER_IP_PER_HOUR, aiAllowed, aiMode, dailyCap, modelSettings } from "./status";

// ---------------------------------------------------------------- fakes

/** a real PNG of w × h (one grey row repeated) */
function png(w: number, h: number): Buffer {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b: Buffer) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTable[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const c = Buffer.alloc(4);
    c.writeUInt32BE(crc(td));
    return Buffer.concat([len, td, c]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = Buffer.alloc((w + 1) * h, 0x80);
  for (let y = 0; y < h; y++) raw[y * (w + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
/** a JPEG header with a start-of-frame of w × h (enough for the size check) */
function jpeg(w: number, h: number): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00];
  const sof = [0xff, 0xc0, 0x00, 0x11, 0x08, h >> 8, h & 0xff, w >> 8, w & 0xff, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9]);
}
const dataUrl = (b: Buffer, type = "image/png") => `data:${type};base64,${b.toString("base64")}`;

function output(over: Partial<ModelOutput> = {}): ModelOutput {
  return { reply: "Složio sam kuhinju.", brief: null, ops: [], ...over };
}

function result(out: ModelOutput): ModelCallResult {
  return { output: out, model: "anthropic/claude-sonnet-5.5", inputTokens: 1000, outputTokens: 300, cachedTokens: 0, costUsd: 0.005, generationId: "gen_x", ms: 1200, rescued: false };
}

interface Rig {
  deps: AiDeps;
  calls: { scope: string; key: string; limit: number }[];
  modelInputs: Parameters<ModelCall>[0][];
  logs: string[];
}

function rig(over: Partial<AiDeps> = {}, model: (i: Parameters<ModelCall>[0]) => ModelOutput | Error = () => output()): Rig {
  const calls: Rig["calls"] = [];
  const modelInputs: Rig["modelInputs"] = [];
  const logs: string[] = [];
  const counts = new Map<string, number>();
  const deps: AiDeps = {
    env: { STUDIO_AI: "on", NODE_ENV: "production" },
    isAdmin: async () => false,
    throttle: async (scope, key, opts): Promise<ThrottleHit> => {
      calls.push({ scope, key, limit: opts.limit });
      const n = (counts.get(scope + key) ?? 0) + 1;
      counts.set(scope + key, n);
      return { allowed: n <= opts.limit, retryAfter: 1800 };
    },
    callModel: async (i) => {
      modelInputs.push(i);
      const r = model(i);
      if (r instanceof Error) throw r;
      return result(r);
    },
    clientIp: () => "203.0.113.7",
    sameOrigin: () => true,
    log: (l) => logs.push(l),
    ...over,
  };
  return { deps, calls, modelInputs, logs };
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  new Request("https://emna.hr/api/studio/ai", { method: "POST", headers: { "content-type": "application/json", origin: "https://emna.hr", ...headers }, body: typeof body === "string" ? body : JSON.stringify(body) });
const get = () => new Request("https://emna.hr/api/studio/ai", { method: "GET" });

async function send(r: Rig, body: unknown, headers?: Record<string, string>) {
  const res = await createStudioAiHandler(r.deps).POST(post(body, headers));
  return { status: res.status, body: (await res.json()) as Record<string, unknown>, headers: res.headers };
}

const ownerBrief = () => {
  const b = blankBrief();
  b.layout = "L";
  b.walls.a.room = 420;
  b.walls.b.room = 290;
  b.ceiling = 260;
  b.fridge = { kind: "side-by-side", side: "lijevo", wall: "", finish: "", handles: "" };
  b.sink = { wall: "", under_window: "da", side: "", width: 0, dishwasher: "" };
  b.style = { ...BLANK_STYLE, front: "bijeli lak", worktop: "crni kamen", handles: "gola" };
  return b;
};

// ---------------------------------------------------------------- mode and status

describe("mode per env", () => {
  it("STUDIO_AI wins; unset = on in development, admin in production", () => {
    assert.equal(aiMode({ STUDIO_AI: "off", NODE_ENV: "development" }), "off");
    assert.equal(aiMode({ STUDIO_AI: " ON ", NODE_ENV: "production" }), "on");
    assert.equal(aiMode({ STUDIO_AI: "admin" }), "admin");
    assert.equal(aiMode({ NODE_ENV: "development" }), "on");
    assert.equal(aiMode({ NODE_ENV: "test" }), "on");
    assert.equal(aiMode({ NODE_ENV: "production" }), "admin");
    assert.equal(aiMode({ STUDIO_AI: "yes please", NODE_ENV: "production" }), "admin");
  });
  it("who may use it", () => {
    assert.equal(aiAllowed("on", false), true);
    assert.equal(aiAllowed("admin", false), false);
    assert.equal(aiAllowed("admin", true), true);
    assert.equal(aiAllowed("off", true), false);
  });
  it("daily cap and model settings from env", () => {
    assert.equal(dailyCap({}), 300);
    assert.equal(dailyCap({ STUDIO_AI_DAILY: "50" }), 50);
    assert.equal(dailyCap({ STUDIO_AI_DAILY: "-4" }), 0);
    assert.equal(dailyCap({ STUDIO_AI_DAILY: "lots" }), 300);
    const d = modelSettings({});
    assert.equal(d.model, "anthropic/claude-sonnet-5.5");
    assert.deepEqual(d.fallbacks, ["anthropic/claude-sonnet-5"]);
    assert.equal(d.timeoutMs, 45_000);
    assert.equal(d.reasoning, "low");
    const c = modelSettings({ STUDIO_AI_MODEL: "openai/gpt-5.4-nano", STUDIO_AI_FALLBACK: "none", STUDIO_AI_TIMEOUT_MS: "1000", STUDIO_AI_REASONING: "medium" });
    assert.deepEqual([c.model, c.fallbacks, c.timeoutMs, c.reasoning], ["openai/gpt-5.4-nano", [], 5000, "medium"]);
    assert.equal(modelSettings({ STUDIO_AI_MODEL: "not a model; rm -rf" }).model, "anthropic/claude-sonnet-5.5");
  });

  it("GET { enabled } per mode and admin session", async () => {
    const status = async (env: AiDeps["env"], admin: boolean) => {
      const h = createStudioAiHandler(rig({ env, isAdmin: async () => admin }).deps);
      const res = await h.GET(get());
      assert.equal(res.headers.get("cache-control"), "no-store");
      return ((await res.json()) as { enabled: boolean }).enabled;
    };
    assert.equal(await status({ STUDIO_AI: "on" }, false), true);
    assert.equal(await status({ STUDIO_AI: "off" }, true), false);
    assert.equal(await status({ NODE_ENV: "production" }, false), false);
    assert.equal(await status({ NODE_ENV: "production" }, true), true);
    assert.equal(await status({ NODE_ENV: "development" }, false), true);
    // a session check that fails = not an admin
    const broken = createStudioAiHandler(rig({ env: { STUDIO_AI: "admin" }, isAdmin: async () => Promise.reject(new Error("db")) }).deps);
    assert.deepEqual(await (await broken.GET(get())).json(), { enabled: false });
  });
});

// ---------------------------------------------------------------- gating and limits

describe("POST: gating and limits", () => {
  const ok = { message: "Ravna kuhinja 3 m, bijela.", config: null, image: null, history: [] };

  it("off → 403; admin mode refuses visitors, lets the admin in", async () => {
    assert.equal((await send(rig({ env: { STUDIO_AI: "off" } }), ok)).status, 403);
    const visitor = await send(rig({ env: { NODE_ENV: "production" } }), ok);
    assert.equal(visitor.status, 403);
    assert.equal(visitor.body.error, "disabled");
    assert.match(String(visitor.body.message), /nije uključen/);
    const admin = rig({ env: { NODE_ENV: "production" }, isAdmin: async () => true });
    assert.equal((await send(admin, ok)).status, 200);
    assert.equal(admin.calls[0].limit, ADMIN_PER_HOUR);
  });

  it("other origins, non-JSON and oversized bodies are refused before anything is counted", async () => {
    const r = rig({ sameOrigin: () => false });
    assert.equal((await send(r, ok)).status, 403);
    const t = rig();
    assert.equal((await send(t, ok, { "content-type": "text/plain" })).status, 415);
    const big = await send(t, ok, { "content-length": String(LIMITS.body + 1) });
    assert.equal(big.status, 413);
    assert.equal((await send(t, "{not json")).status, 400);
    assert.equal(t.calls.length, 0, "no throttle hits");
  });

  it("message limits and an empty request", async () => {
    const r = rig();
    const long = await send(r, { ...ok, message: "x".repeat(LIMITS.message + 1) });
    assert.equal(long.status, 400);
    assert.match(String(long.body.message), /najviše 1500 znakova/);
    const empty = await send(r, { ...ok, message: "   " });
    assert.equal(empty.status, 400);
    assert.equal(empty.body.error, "empty");
    assert.equal((await send(r, { message: "a", history: Array.from({ length: 9 }, () => ({ role: "user", text: "x" })) })).status, 400);
    assert.equal(r.modelInputs.length, 0);
  });

  it("images: type by the bytes, size, pixels", async () => {
    const r = rig();
    assert.equal((await send(r, { ...ok, image: dataUrl(Buffer.from("GIF89a....................")) })).status, 415);
    assert.equal((await send(r, { ...ok, image: "data:image/png;base64,@@@" })).status, 400);
    const tooWide = await send(r, { ...ok, image: dataUrl(jpeg(3000, 1000), "image/jpeg") });
    assert.equal(tooWide.status, 413);
    const huge = await send(r, { ...ok, image: `data:image/jpeg;base64,${"A".repeat(2_100_000)}` });
    assert.equal(huge.status, 413);
    const good = await send(r, { ...ok, image: dataUrl(png(40, 30)) });
    assert.equal(good.status, 200, JSON.stringify(good.body));
    assert.equal(r.modelInputs.at(-1)?.image?.mediaType, "image/png");
    // a photo alone (no words) is enough
    assert.equal((await send(r, { ...ok, message: "", image: dataUrl(jpeg(1600, 1200), "image/jpeg") })).status, 200);
  });

  it("a kitchen link that does not decode", async () => {
    const r = await send(rig(), { ...ok, config: "9.nonsense" });
    assert.equal(r.status, 400);
    assert.equal(r.body.error, "config");
  });

  it("per-IP limit (429 + retry-after), then the site's daily cap (503)", async () => {
    const r = rig();
    for (let i = 0; i < PER_IP_PER_HOUR; i++) assert.equal((await send(r, ok)).status, 200);
    const limited = await send(r, ok);
    assert.equal(limited.status, 429);
    assert.equal(limited.headers.get("retry-after"), "1800");
    assert.equal(r.calls[0].scope, "studio-ai-ip");
    assert.equal(r.calls[0].key, "203.0.113.7");
    const capped = rig({ env: { STUDIO_AI: "on", STUDIO_AI_DAILY: "2", NODE_ENV: "production" }, clientIp: () => `ip-${Math.random()}` });
    assert.equal((await send(capped, ok)).status, 200);
    assert.equal((await send(capped, ok)).status, 200);
    const third = await send(capped, ok);
    assert.equal(third.status, 503);
    assert.equal(third.body.error, "daily_cap");
    assert.equal(capped.modelInputs.length, 2, "the model is not called over the cap");
  });

  it("without a database: refused in production, allowed in development; a throttle error fails closed in production", async () => {
    assert.equal((await send(rig({ throttle: null }), ok)).status, 503);
    assert.equal((await send(rig({ throttle: null, env: { STUDIO_AI: "on", NODE_ENV: "development" } }), ok)).status, 200);
    const boom = async () => Promise.reject(new Error("neon down"));
    assert.equal((await send(rig({ throttle: boom }), ok)).status, 503);
    const dev = rig({ throttle: boom, env: { NODE_ENV: "development" } });
    assert.equal((await send(dev, ok)).status, 200);
  });
});

// ---------------------------------------------------------------- flows

describe("POST: brief and operations", () => {
  it("a new kitchen from a brief: share link, reply, assumptions; the prompt carries no kitchen", async () => {
    const r = rig({}, () => output({ reply: "Evo vaše L kuhinje.", brief: ownerBrief() }));
    const res = await send(r, {
      message: "zid 4,20 m, drugi 2,90 m, visina 2,60, L kuhinja, dupli frižider lijevo, sudoper ispod prozora, bijeli lak, crni kamen, ručkice gola",
      config: null,
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.ok, true);
    assert.equal(res.body.changed, true);
    assert.equal(res.body.reply, "Evo vaše L kuhinje.");
    const cfg = decodeConfig(String(res.body.config));
    assert.ok(cfg);
    assert.equal(cfg.layout, "L");
    assert.equal(cfg.front, "lak");
    assert.ok((res.body.assumptions as string[]).some((a) => /Prozor/.test(a)));
    assert.match(r.modelInputs[0].userText, /još ne postoji/);
    assert.equal(r.modelInputs[0].system, SYSTEM_PROMPT);
  });

  it("operations on the current kitchen; the prompt describes it", async () => {
    const L = sanitizeConfig({ ...DEFAULT_CONFIG, layout: "L", walls: { a: 420, b: 290, c: 220 } });
    const sink = planKitchen(L).sinkId as string;
    const r = rig({}, () => output({ reply: "Pomaknuo sam sudoper.", ops: [{ op: "pomakni", element: sink, direction: "desno", steps: 0 }] }));
    const res = await send(r, { message: "pomakni sudoper desno", config: encodeConfig(L), history: [{ role: "user", text: "L kuhinja" }, { role: "assistant", text: "Složio sam L kuhinju." }] });
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, true);
    assert.match(r.modelInputs[0].userText, /TRENUTNA KUHINJA:\nOblik: L/);
    assert.match(r.modelInputs[0].userText, new RegExp(sink));
    assert.equal(r.modelInputs[0].history.length, 2);
  });

  it("refused operations: an honest reply and the reason in the notes", async () => {
    const r = rig({}, () => output({ reply: "Uklonio sam element.", ops: [{ op: "ukloni", element: "a-base-77", whole_column: "" }] }));
    const res = await send(r, { message: "makni ono", config: encodeConfig(DEFAULT_CONFIG) });
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, false);
    assert.match(String(res.body.reply), /nisam mogao/);
    assert.match((res.body.notes as string[])[0], /a-base-77 ne postoji/);
  });

  it("a brief that says nothing never replaces the kitchen on screen (a model filling the form for \"hvala\")", async () => {
    const L = sanitizeConfig({ ...DEFAULT_CONFIG, layout: "L", walls: { a: 420, b: 290, c: 220 }, front: "hrast" });
    const blank = blankBrief();
    blank.walls.a.start = "kut";
    blank.heights = { mode: "standard", one_piece: "", worktop: 0 };
    blank.wall_units = "ormarici";
    const r = rig({}, () => output({ reply: "Hvala!", brief: blank }));
    const res = await send(r, { message: "hvala, super je", config: encodeConfig(L) });
    assert.equal(res.status, 200);
    assert.equal(res.body.changed, false);
    assert.equal(res.body.config, encodeConfig(L));
    // with no kitchen yet, the same blank brief still builds the default one ("složi mi neku kuhinju")
    const first = await send(rig({}, () => output({ brief: blankBrief() })), { message: "složi mi neku kuhinju", config: null });
    assert.equal(first.body.changed, true);
    assert.ok(first.body.config);
    // a brief that says anything at all is a new kitchen
    const said = blankBrief();
    said.style.front = "antracit";
    const redo = await send(rig({}, () => output({ brief: said })), { message: "ispočetka, antracit", config: encodeConfig(L) });
    assert.equal(redo.body.changed, true);
  });

  it("an off-topic message: a reply, no kitchen", async () => {
    const r = rig({}, () => output({ reply: "Pomažem samo s kuhinjom." }));
    const res = await send(r, { message: "koji je glavni grad Francuske?", config: null });
    assert.equal(res.status, 200);
    assert.equal(res.body.config, null);
    assert.equal(res.body.changed, false);
  });

  it("model errors → friendly Croatian messages with the right status", async () => {
    const cases: [Error, number, string][] = [
      [new AiModelError("credits", "x"), 503, "model_credits"],
      [new AiModelError("timeout", "x"), 504, "model_timeout"],
      [new AiModelError("output", "x"), 502, "model_output"],
      [new AiModelError("rate", "x"), 503, "model_rate"],
      [Object.assign(new Error("Free tier users do not have access to this model"), { statusCode: 403 }), 503, "model_credits"],
    ];
    for (const [err, status, code] of cases) {
      const res = await send(
        rig({}, () => err),
        { message: "kuhinja", config: null },
      );
      assert.equal(res.status, status, code);
      assert.equal(res.body.error, code);
      assert.ok(typeof res.body.message === "string" && !/Error|stack|at /.test(res.body.message as string), String(res.body.message));
    }
  });

  it("logs sizes, timings and cost — never the customer's words", async () => {
    const r = rig({}, () => output({ brief: ownerBrief() }));
    const secret = "moja tajna adresa Ilica 42";
    await send(r, { message: secret, config: null, image: dataUrl(png(20, 20)) });
    assert.equal(r.logs.length, 1);
    assert.match(r.logs[0], /^\[studio-ai\] ok on model=anthropic\/claude-sonnet-5\.5 1200 ms in=1000 out=300 cached=0 cost=\$0\.00500 brief=1 ops=0/);
    assert.ok(!r.logs.join(" ").includes("Ilica"));
    const failing = rig({}, () => new AiModelError("timeout", "x"));
    await send(failing, { message: secret, config: null });
    assert.ok(!failing.logs.join(" ").includes("Ilica"));
  });
});

// ---------------------------------------------------------------- the schema the model fills

describe("schema: strict structured outputs on every provider", () => {
  it("every object has all its properties required, no oneOf, ≤ 16 unions, no numeric / string / array constraints", async () => {
    const js = (await zodSchema(ModelOutputSchema).jsonSchema) as Record<string, unknown>;
    let unions = 0;
    let optional = 0;
    const walk = (n: unknown, path: string) => {
      if (Array.isArray(n)) return n.forEach((x, i) => walk(x, `${path}[${i}]`));
      if (!n || typeof n !== "object") return;
      const o = n as Record<string, unknown>;
      assert.ok(!("oneOf" in o), `oneOf at ${path}`);
      for (const k of ["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "pattern"]) assert.ok(!(k in o), `${k} at ${path}`);
      if ("anyOf" in o || Array.isArray(o.type)) unions++;
      if (o.type === "object" && o.properties) {
        const props = Object.keys(o.properties as object);
        const req = new Set((o.required as string[]) ?? []);
        optional += props.filter((p) => !req.has(p)).length;
        assert.equal(o.additionalProperties, false, `additionalProperties at ${path}`);
      }
      for (const [k, v] of Object.entries(o)) walk(v, `${path}.${k}`);
    };
    walk(js, "$");
    assert.equal(optional, 0, "optional properties");
    assert.ok(unions <= 16, `${unions} unions`);
  });

  it("a blank brief and the API request schema", () => {
    assert.ok(ModelOutputSchema.safeParse({ reply: "x", brief: blankBrief(), ops: [] }).success);
    assert.ok(AiRequestSchema.safeParse({ message: "x" }).success);
    assert.ok(!AiRequestSchema.safeParse({ message: "x".repeat(1501) }).success);
  });

  it("the prompt lists the catalogue and the current kitchen", () => {
    assert.match(SYSTEM_PROMPT, /lak = Bijeli sjajni lak/);
    assert.match(SYSTEM_PROMPT, /crni = Crni kamen/);
    assert.match(SYSTEM_PROMPT, /hladnjak-sbs/);
    const edited = sanitizeConfig({ ...DEFAULT_CONFIG, front: "hrast" });
    assert.match(userTurnText("pomakni sudoper", edited, true), /TRENUTNA KUHINJA:\nOblik: L[\s\S]*fotografiju[\s\S]*KUPAC KAŽE:\npomakni sudoper$/);
  });

  it("the studio's untouched starting kitchen (desktop, \"Otvorite 3D odmah\") is marked, so a description becomes a brief", () => {
    assert.match(userTurnText("L kuhinja 4,2 x 2,9", DEFAULT_CONFIG, false), /^TRENUTNA KUHINJA \(početni primjer studija[^\n]*brief[^\n]*\):\nOblik: L/);
    assert.doesNotMatch(userTurnText("x", sanitizeConfig({ ...DEFAULT_CONFIG, walls: { a: 400, b: 220, c: 220 } }), false), /početni primjer/);
    assert.match(SYSTEM_PROMPT, /početni primjer studija/);
  });
});

// ---------------------------------------------------------------- images and model helpers

describe("image check and model helpers", () => {
  it("reads PNG / JPEG sizes from the bytes", () => {
    const p = checkImage(dataUrl(png(64, 48)));
    assert.ok(p.ok && p.width === 64 && p.height === 48 && p.mediaType === "image/png");
    const j = checkImage(dataUrl(jpeg(1600, 900), "image/png"));
    assert.ok(j.ok && j.mediaType === "image/jpeg" && j.width === 1600 && j.height === 900, "the bytes decide the type");
    assert.equal(checkImage("http://example.com/x.png").ok, false);
  });

  it("messages: the conversation starts with the customer, roles alternate, the photo comes with the last turn", () => {
    const m = buildMessages({
      system: "s",
      history: [
        { role: "assistant", text: "Bok!" },
        { role: "user", text: "L kuhinja" },
        { role: "user", text: "4 m" },
        { role: "assistant", text: "Složio sam." },
      ],
      userText: "sada otok",
      image: { mediaType: "image/jpeg", base64: "AAAA" },
    });
    assert.deepEqual(
      m.map((x) => x.role),
      ["user", "assistant", "user"],
    );
    assert.equal(m[0].content, "L kuhinja\n4 m");
    const last = m[2].content as { type: string }[];
    assert.deepEqual(
      last.map((p) => p.type),
      ["file", "text"],
    );
  });

  it("rescues what is valid from an answer that misses the schema", () => {
    const text = '```json\n{"reply":"Evo.","brief":{"layout":"nonsense"},"ops":[{"op":"strop","cm":270},{"op":"letenje"}]}\n```';
    const r = lenientOutput(text);
    assert.ok(r);
    assert.equal(r.reply, "Evo.");
    assert.equal(r.brief, null);
    assert.deepEqual(r.ops, [{ op: "strop", cm: 270 }]);
    assert.equal(lenientOutput("not json at all"), null);
  });

  it("classifies gateway errors", () => {
    assert.equal(classifyError(Object.assign(new Error("Unauthenticated"), { statusCode: 401 })), "auth");
    assert.equal(classifyError(Object.assign(new Error("x"), { statusCode: 402, type: "insufficient_funds" })), "credits");
    assert.equal(classifyError(Object.assign(new Error("slow down"), { statusCode: 429 })), "rate");
    assert.equal(classifyError(Object.assign(new Error("boom"), { statusCode: 503 })), "unavailable");
    assert.equal(classifyError(Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" })), "timeout");
    assert.equal(classifyError({ name: "RetryError", lastError: Object.assign(new Error("free tier"), { statusCode: 403 }) }), "credits");
    assert.equal(classifyError(new Error("???")), "unknown");
  });
});

// ---------------------------------------------------------------- the edit.ts leftovers

describe("edit.ts leftovers", () => {
  it("heightChoices().doStropa plans with the kitchen's gap (and its other height choices)", () => {
    const cfg = sanitizeConfig({ ...DEFAULT_CONFIG, walls: { a: 294, b: 420, c: 420 }, ceiling: 281, heights: { mode: "standard", worktop: 85, gap: 50 } });
    const preview = heightChoices(cfg).doStropa;
    const real = planKitchen(sanitizeConfig({ ...cfg, heights: { mode: "do-stropa", worktop: 85, gap: 50 } })).heights;
    assert.equal(preview.upperBottom, real.upperBottom);
    assert.equal(preview.upperTop - preview.upperBottom, real.upperTop - real.upperBottom);
    assert.equal(preview.upperTop - preview.upperBottom, 99, "the photo kitchen's 99 cm, not 92");
  });

  it("the oven column's description follows its variant", () => {
    const def = moduleDef("tall", "pecnica-mikro")!;
    assert.equal(typeDescription(def), def.description, "every older column: the catalogue text");
    assert.equal(typeDescription(def, { below: "vrata", ovenAt: "oci" }), "Pećnica u visini očiju (dno u ravnini radne ploče), iznad nje mikrovalna, ispod vrata. Aparati nisu uračunati u cijenu.");
    assert.equal(typeDescription(moduleDef("tall", "pecnica")!, { ovenAt: "nisko" }), "Pećnica nisko, ispod nje jedna ladica, iznad ormarić. Pećnica nije uračunata u cijenu.");
    assert.equal(typeDescription(moduleDef("base", "ladice")!, { below: "vrata" }), moduleDef("base", "ladice")!.description);
    const oven = planKitchen(DEFAULT_CONFIG).slots.find((s) => s.type === "pecnica")!;
    const r = setOvenColumn(DEFAULT_CONFIG, oven.id, { below: "vrata", at: "oci" });
    const info = slotEditInfo(r.cfg, r.slotId as string)!;
    assert.match(info.types.find((t) => t.current)!.description, /ispod nje vrata/);
    assert.ok(!info.types.some((t) => /ispod ladice/.test(t.description) && t.id.startsWith("pecnica")));
  });
});
