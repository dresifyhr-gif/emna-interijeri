/**
 * "Opišite kuhinju" in the studio — the chat's pure logic (components/studio/ai/chat.ts): what of the conversation goes
 * back to the model, when "Složi kuhinju" may be pressed, the calm progress lines, friendly texts for limits and
 * errors (Croatian plurals), dictation joining, and that every example prompt is a sendable message.
 *
 *   npx tsx --test lib/studio/ai-chat.test.ts
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EDIT_EXAMPLES,
  PROGRESS_STEP_MS,
  SLOW_MS,
  START_EXAMPLES,
  canRetry,
  canSend,
  charsLeft,
  dictationError,
  failureText,
  hasAiKitchen,
  historyFor,
  introText,
  joinDictation,
  lastChange,
  placeholderText,
  plural,
  progressLine,
  sendLabel,
  slowHint,
  waitText,
  type AssistantEntry,
  type ChatEntry,
  type UserEntry,
} from "../../components/studio/ai/chat";
import { AI_LIMITS } from "./ai/client";

let n = 0;
const user = (text: string, image: string | null = null): UserEntry => ({ id: ++n, role: "user", text, image });
const answer = (text: string, o: Partial<AssistantEntry> = {}): AssistantEntry => ({
  id: ++n,
  role: "assistant",
  tone: "ok",
  text,
  assumptions: [],
  notes: [],
  undoId: null,
  undone: false,
  retry: null,
  ...o,
});

describe("historyFor: what the model hears with the next message", () => {
  it("answered turns in order, user then assistant", () => {
    const es: ChatEntry[] = [user("L kuhinja 4,20 × 2,90"), answer("Složio sam L kuhinju.", { undoId: 1 }), user("pomakni sudoper desno"), answer("Pomaknuo sam sudoper.", { undoId: 2 })];
    assert.deepEqual(historyFor(es), [
      { role: "user", text: "L kuhinja 4,20 × 2,90" },
      { role: "assistant", text: "Složio sam L kuhinju." },
      { role: "user", text: "pomakni sudoper desno" },
      { role: "assistant", text: "Pomaknuo sam sudoper." },
    ]);
  });

  it("failed requests are left out (the user's words and the error)", () => {
    const es: ChatEntry[] = [
      user("prvi"),
      answer("Previše zahtjeva.", { tone: "error", retry: { text: "prvi", image: null } }),
      user("drugi"),
      answer("Gotovo.", { undoId: 3 }),
    ];
    assert.deepEqual(historyFor(es), [
      { role: "user", text: "drugi" },
      { role: "assistant", text: "Gotovo." },
    ]);
  });

  it("a message still waiting for its answer is not history yet", () => {
    assert.deepEqual(historyFor([user("a"), answer("b"), user("c")]), [
      { role: "user", text: "a" },
      { role: "assistant", text: "b" },
    ]);
  });

  it("notes go with the answer; a photo-only turn and a photo with words say so", () => {
    const es: ChatEntry[] = [
      user("", "data:image/jpeg;base64,xx"),
      answer("Složio sam kuhinju s fotografije.", { notes: ["Hladnjak nije stao lijevo."] }),
      user("ovakva, ali bijela", "data:image/jpeg;base64,yy"),
      answer("Fronte su bijele."),
    ];
    const h = historyFor(es);
    assert.equal(h[0].text, "(poslana fotografija kuhinje)");
    assert.equal(h[1].text, "Složio sam kuhinju s fotografije. Hladnjak nije stao lijevo.");
    assert.equal(h[2].text, "ovakva, ali bijela (uz fotografiju)");
  });

  it("a change the customer took back says so", () => {
    const h = historyFor([user("stavi antracit"), answer("Fronte su antracit.", { undoId: 4, undone: true })]);
    assert.match(h[1].text, /^Fronte su antracit\. \(Kupac je poništio ovu izmjenu/);
  });

  it("at most the server's turns, each cut to its length", () => {
    const es: ChatEntry[] = [];
    for (let i = 0; i < 10; i++) es.push(user(`poruka ${i} ${"x".repeat(1200)}`), answer(`odgovor ${i}`));
    const h = historyFor(es);
    assert.equal(h.length, AI_LIMITS.historyTurns);
    assert.equal(h[0].role, "user");
    assert.match(h[0].text, /^poruka 6 /);
    assert.ok(h.every((t) => t.text.length <= AI_LIMITS.historyText));
    assert.equal(h[h.length - 1].text, "odgovor 9");
  });
});

describe("the conversation's state", () => {
  it("hasAiKitchen / lastChange follow changes, undo and the latest answer", () => {
    assert.equal(hasAiKitchen([]), false);
    assert.equal(lastChange([]), null);
    const made = answer("Složeno.", { undoId: 7 });
    assert.equal(hasAiKitchen([user("x"), made]), true);
    assert.equal(lastChange([user("x"), made]), made);
    // undone: not "made" any more (the button says "Složi kuhinju" again)
    assert.equal(hasAiKitchen([user("x"), { ...made, undone: true }]), false);
    // a later answer without a change (a question, a refusal) is what the card would be about: none
    assert.equal(lastChange([user("x"), made, user("y"), answer("Ne mogu.")]), null);
    assert.equal(lastChange([user("x"), made, user("y"), answer("Greška.", { tone: "error" })]), null);
  });

  it("canSend: words or a photo, not while busy, not over the limit", () => {
    assert.equal(canSend("", null, false), false);
    assert.equal(canSend("   \n", null, false), false);
    assert.equal(canSend("L kuhinja", null, false), true);
    assert.equal(canSend("", "data:image/jpeg;base64,xx", false), true);
    assert.equal(canSend("L kuhinja", null, true), false);
    assert.equal(canSend("x".repeat(AI_LIMITS.message), null, false), true);
    assert.equal(canSend("x".repeat(AI_LIMITS.message + 1), null, false), false);
  });

  it("the button and the counter", () => {
    assert.equal(sendLabel(false), "Složi kuhinju");
    assert.equal(sendLabel(true), "Pošalji");
    assert.equal(charsLeft("kratko"), null);
    assert.equal(charsLeft("x".repeat(AI_LIMITS.message - 300)), 300);
    assert.equal(charsLeft("x".repeat(AI_LIMITS.message)), 0);
  });

  it("which errors offer 'Pokušajte ponovno'", () => {
    for (const e of ["rate_limited", "network", "model_timeout", "model_unavailable", "model_output", "compose", "unavailable", "server"]) assert.equal(canRetry(e), true, e);
    for (const e of ["disabled", "forbidden", "validation", "too_large", "image", "empty", "daily_cap", "model_credits", "model_auth", "not_configured"]) assert.equal(canRetry(e), false, e);
  });
});

describe("Croatian texts", () => {
  it("plural: minuta / sat", () => {
    const f = (k: number) => plural(k, "minutu", "minute", "minuta");
    assert.deepEqual([1, 2, 4, 5, 11, 12, 14, 21, 22, 25, 101, 111].map(f), [
      "minutu",
      "minute",
      "minute",
      "minuta",
      "minuta",
      "minuta",
      "minuta",
      "minutu",
      "minute",
      "minuta",
      "minutu",
      "minuta",
    ]);
  });

  it("waitText", () => {
    assert.equal(waitText(0), "");
    assert.equal(waitText(Number.NaN), "");
    assert.equal(waitText(40), "Ponovno možete za otprilike minutu.");
    assert.equal(waitText(120), "Ponovno možete za otprilike 2 minute.");
    assert.equal(waitText(21 * 60), "Ponovno možete za otprilike 21 minutu.");
    assert.equal(waitText(45 * 60), "Ponovno možete za otprilike 45 minuta.");
    assert.equal(waitText(3 * 3600), "Ponovno možete za otprilike 3 sata.");
    assert.equal(waitText(5 * 3600), "Ponovno možete za otprilike 5 sati.");
  });

  it("failureText: the server's sentence, and when to try again after a rate limit", () => {
    const msg = "Previše zahtjeva u kratkom vremenu — pokušajte ponovno malo kasnije.";
    assert.equal(failureText({ error: "rate_limited", message: msg, retryAfter: 600 }), `${msg} Ponovno možete za otprilike 10 minuta.`);
    assert.equal(failureText({ error: "rate_limited", message: msg }), msg);
    // the daily cap already says "sutra"
    assert.equal(failureText({ error: "daily_cap", message: "Pomoćnik je danas imao puno posla — pokušajte ponovno sutra.", retryAfter: 7200 }), "Pomoćnik je danas imao puno posla — pokušajte ponovno sutra.");
    assert.equal(failureText({ error: "server", message: "  " }), "Nešto nije u redu — pokušajte ponovno.");
  });

  it("intro and placeholder for a new kitchen and for this one", () => {
    assert.match(introText(false), /mjere zidova/);
    assert.match(introText(true), /promijenim/);
    assert.notEqual(placeholderText(false), placeholderText(true));
  });
});

describe("progress while the AI works", () => {
  it("a calm sequence, one line at a time, the last one stays", () => {
    const opts = { photo: false, edit: false };
    assert.equal(progressLine(0, opts), "Čitam vaš opis…");
    assert.equal(progressLine(PROGRESS_STEP_MS - 1, opts), "Čitam vaš opis…");
    assert.equal(progressLine(PROGRESS_STEP_MS, opts), "Slažem raspored elemenata…");
    assert.equal(progressLine(60_000, opts), "Još samo trenutak…");
    assert.equal(progressLine(-50, opts), "Čitam vaš opis…");
  });

  it("a photo is looked at first; a change has its own lines", () => {
    assert.equal(progressLine(0, { photo: true, edit: false }), "Gledam fotografiju…");
    assert.equal(progressLine(PROGRESS_STEP_MS, { photo: true, edit: true }), "Čitam vaš opis…");
    assert.equal(progressLine(0, { photo: false, edit: true }), "Čitam što želite promijeniti…");
    assert.equal(progressLine(PROGRESS_STEP_MS, { photo: false, edit: true }), "Mijenjam kuhinju…");
  });

  it("the slow hint only after a while", () => {
    assert.equal(slowHint(SLOW_MS - 1), null);
    assert.match(slowHint(SLOW_MS) ?? "", /pola minute/);
  });
});

describe("dictation", () => {
  it("joins what was said to what is written", () => {
    assert.equal(joinDictation("", "L kuhinja"), "L kuhinja");
    assert.equal(joinDictation("zid 4,20 m", "drugi 2,90 m"), "zid 4,20 m, drugi 2,90 m");
    assert.equal(joinDictation("zid 4,20 m,", "drugi 2,90 m"), "zid 4,20 m, drugi 2,90 m");
    assert.equal(joinDictation("Bijeli lak.", "crni kamen"), "Bijeli lak. crni kamen");
    assert.equal(joinDictation("tekst  ", "   "), "tekst  ");
    assert.equal(joinDictation("x".repeat(AI_LIMITS.message - 2), "još riječi").length, AI_LIMITS.message);
  });

  it("speech errors in Croatian; silence and a stop say nothing", () => {
    assert.match(dictationError("not-allowed") ?? "", /Mikrofon nije dopušten/);
    assert.match(dictationError("audio-capture") ?? "", /Mikrofon/);
    assert.match(dictationError("language-not-supported") ?? "", /hrvatskom/);
    assert.equal(dictationError("no-speech"), null);
    assert.equal(dictationError("aborted"), null);
  });
});

describe("examples", () => {
  it("the owner's description is the first example, every example is sendable", () => {
    assert.equal(
      START_EXAMPLES[0].text,
      "zid 4,20 m, drugi 2,90 m, visina 2,60, L kuhinja, dupli frižider lijevo, sudoper ispod prozora, bijeli lak, crni kamen, gola",
    );
    for (const ex of [...START_EXAMPLES, ...EDIT_EXAMPLES]) {
      assert.ok(canSend(ex.text, null, false), ex.label);
      assert.ok(ex.label.length <= 40, ex.label);
    }
    assert.equal(new Set([...START_EXAMPLES, ...EDIT_EXAMPLES].map((e) => e.label)).size, START_EXAMPLES.length + EDIT_EXAMPLES.length);
  });
});
