/**
 * "Opišite kuhinju" in the studio — the pure part of the chat (no React; tested in lib/studio/ai-chat.test.ts).
 *
 * The conversation as the studio shows it (ChatEntry), what of it goes back to the model as history (historyFor), the
 * calm progress lines while the AI works (progressLine), friendly texts for errors and limits (failureText), dictation
 * (joinDictation) and the example prompts. The request itself is lib/studio/ai/client.ts (askStudioAi).
 */
import { AI_LIMITS, type AiTurn } from "@/lib/studio/ai/client";

/* ------------------------------------------------------------------ the conversation */

export interface UserEntry {
  id: number;
  role: "user";
  text: string;
  /** the photo sent with it (a JPEG data URL, shown as a thumbnail) */
  image: string | null;
}

export interface AssistantEntry {
  id: number;
  role: "assistant";
  /** ok: the AI answered (it may or may not have changed the kitchen); error: the request failed */
  tone: "ok" | "error";
  text: string;
  assumptions: string[];
  notes: string[];
  /** the studio's undo step of the change it made; null: the kitchen did not change */
  undoId: number | null;
  /** "Poništi" was pressed on it */
  undone: boolean;
  /** error: what was sent, for "Pokušajte ponovno" (null: nothing to retry, e.g. the feature is off) */
  retry: { text: string; image: string | null } | null;
}

export type ChatEntry = UserEntry | AssistantEntry;

/** errors after which sending the same again cannot help */
const FINAL_ERRORS = new Set([
  "disabled",
  "forbidden",
  "validation",
  "too_large",
  "image",
  "empty",
  "daily_cap",
  // the site's own setup (no credits, no key, no database in production): trying again cannot help
  "model_credits",
  "model_auth",
  "not_configured",
]);

export const canRetry = (error: string) => !FINAL_ERRORS.has(error);

/** what a photo-only turn says in the history */
const PHOTO_TURN = "(poslana fotografija kuhinje)";

/**
 * The turns the model sees with the next message: every user message that got an answer, and that answer (its notes
 * too — "the fridge had no room there" is context). Failed requests are left out; a change the customer took back says
 * so. At most AI_LIMITS.historyTurns turns, each cut to AI_LIMITS.historyText characters.
 */
export function historyFor(entries: readonly ChatEntry[]): AiTurn[] {
  const turns: AiTurn[] = [];
  for (let i = 0; i < entries.length - 1; i++) {
    const u = entries[i];
    const a = entries[i + 1];
    if (u.role !== "user" || a.role !== "assistant" || a.tone !== "ok") continue;
    const said = u.text.trim();
    const userText = said ? (u.image ? `${said} (uz fotografiju)` : said) : PHOTO_TURN;
    const answer = [a.text.trim(), ...a.notes.map((n) => n.trim())].filter(Boolean).join(" ");
    const undone = a.undone ? " (Kupac je poništio ovu izmjenu — kuhinja je vraćena na prethodnu.)" : "";
    turns.push({ role: "user", text: userText.slice(0, AI_LIMITS.historyText) });
    turns.push({ role: "assistant", text: `${answer}${undone}`.trim().slice(0, AI_LIMITS.historyText) });
    i++;
  }
  return turns.slice(-AI_LIMITS.historyTurns);
}

/** has the AI already made (and not taken back) a kitchen in this conversation */
export const hasAiKitchen = (entries: readonly ChatEntry[]) => entries.some((e) => e.role === "assistant" && e.undoId !== null && !e.undone);

/** the last answer that changed the kitchen (the phone shows it over the 3D view) */
export function lastChange(entries: readonly ChatEntry[]): AssistantEntry | null {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i];
    if (e.role === "assistant") return e.tone === "ok" && e.undoId !== null ? e : null;
  }
  return null;
}

/** can this be sent now */
export function canSend(draft: string, image: string | null, busy: boolean): boolean {
  if (busy || draft.length > AI_LIMITS.message) return false;
  return draft.trim().length > 0 || Boolean(image);
}

/** the send button: "Složi kuhinju" until the AI has made one, then "Pošalji" (a change to it) */
export const sendLabel = (made: boolean) => (made ? "Pošalji" : "Složi kuhinju");

/** the characters left, shown only near the limit (null: not yet) */
export function charsLeft(draft: string): number | null {
  const left = AI_LIMITS.message - draft.length;
  return left <= 300 ? left : null;
}

/* ------------------------------------------------------------------ Croatian numbers */

/** 1 minutu / 2 minute / 5 minuta — the form after "za" */
export function plural(n: number, one: string, few: string, many: string): string {
  const a = Math.abs(Math.round(n));
  const d = a % 10;
  const dd = a % 100;
  if (d === 1 && dd !== 11) return one;
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return few;
  return many;
}

/** "Ponovno možete za otprilike 12 minuta." */
export function waitText(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  if (seconds < 90) return "Ponovno možete za otprilike minutu.";
  const min = Math.round(seconds / 60);
  if (min < 60) return `Ponovno možete za otprilike ${min} ${plural(min, "minutu", "minute", "minuta")}.`;
  const h = Math.round(min / 60);
  return `Ponovno možete za otprilike ${h} ${plural(h, "sat", "sata", "sati")}.`;
}

/** a failed request as the customer reads it (the server's own Croatian sentence, and when to try again) */
export function failureText(r: { error: string; message: string; retryAfter?: number }): string {
  const msg = r.message.trim() || "Nešto nije u redu — pokušajte ponovno.";
  if (r.error === "rate_limited" && r.retryAfter) {
    const wait = waitText(r.retryAfter);
    return wait ? `${msg} ${wait}` : msg;
  }
  return msg;
}

/* ------------------------------------------------------------------ while the AI works */

const NEW_LINES = ["Čitam vaš opis…", "Slažem raspored elemenata…", "Provjeravam mjere i razmake…", "Biram materijale i uređaje…", "Još samo trenutak…"];
const EDIT_LINES = ["Čitam što želite promijeniti…", "Mijenjam kuhinju…", "Provjeravam mjere i razmake…", "Još samo trenutak…"];
const PHOTO_LINE = "Gledam fotografiju…";
/** each line stays this long; the last one stays */
export const PROGRESS_STEP_MS = 2800;
/** from here on a second, quiet line says it can take a while */
export const SLOW_MS = 15000;

/**
 * The line shown `ms` after the request went out: a calm sequence of what is happening (a photo is looked at first; a
 * change to the kitchen has its own, shorter sequence). The last line stays until the answer comes.
 */
export function progressLine(ms: number, opts: { photo: boolean; edit: boolean }): string {
  const lines = [...(opts.photo ? [PHOTO_LINE] : []), ...(opts.edit && !opts.photo ? EDIT_LINES : NEW_LINES)];
  const i = Math.max(0, Math.min(lines.length - 1, Math.floor(Math.max(0, ms) / PROGRESS_STEP_MS)));
  return lines[i];
}

export const slowHint = (ms: number): string | null => (ms >= SLOW_MS ? "Ponekad potraje i do pola minute." : null);

/* ------------------------------------------------------------------ dictation */

/**
 * What the microphone heard, added to what is already written: after a comma unless the text already ends a phrase
 * (the owner writes "zid 4,20 m, drugi 2,90 m, …"), never over the limit.
 */
export function joinDictation(base: string, said: string): string {
  const s = said.trim();
  if (!s) return base;
  const b = base.trimEnd();
  if (!b) return s.slice(0, AI_LIMITS.message);
  const sep = /[.,;:!?]$/.test(b) ? " " : ", ";
  return `${b}${sep}${s}`.slice(0, AI_LIMITS.message);
}

/** speech-recognition errors as the customer reads them (null: nothing to say — e.g. silence or a stop) */
export function dictationError(code: string): string | null {
  if (code === "not-allowed" || code === "service-not-allowed") return "Mikrofon nije dopušten — dopustite ga u pregledniku ili napišite opis.";
  if (code === "audio-capture") return "Mikrofon nije pronađen.";
  if (code === "network") return "Diktiranje trenutno ne radi — napišite opis.";
  if (code === "language-not-supported") return "Preglednik ne podržava diktiranje na hrvatskom — napišite opis.";
  return null;
}

/* ------------------------------------------------------------------ words on screen */

export interface Example {
  /** short, for the chip */
  label: string;
  /** what goes into the box */
  text: string;
}

/** a new kitchen in the customer's words (the first is the owner's own description) */
export const START_EXAMPLES: readonly Example[] = [
  {
    label: "L kuhinja, bijeli lak i crni kamen",
    text: "zid 4,20 m, drugi 2,90 m, visina 2,60, L kuhinja, dupli frižider lijevo, sudoper ispod prozora, bijeli lak, crni kamen, gola",
  },
  {
    label: "Ravna kuhinja u hrastu",
    text: "ravna kuhinja na zidu od 3,60 m, hrast fronte, bijela ploča, crne ručkice, pećnica u visokom ormaru",
  },
  {
    label: "U kuhinja s otokom",
    text: "U kuhinja s otokom, zidovi 3,20, 2,80 i 3,20 m, antracit fronte, bijeli mramor, gornji elementi do stropa",
  },
];

/** changes to the kitchen on screen */
export const EDIT_EXAMPLES: readonly Example[] = [
  { label: "Pomakni sudoper desno", text: "pomakni sudoper desno" },
  { label: "Antracit fronte", text: "stavi antracit fronte" },
  { label: "Pećnica ispod ploče", text: "pećnicu stavi ispod ploče za kuhanje" },
  { label: "Gornji do stropa", text: "gornji elementi do stropa" },
];

/** the lead under the title: a new kitchen (nothing yet) or this one */
export const introText = (kitchen: boolean) =>
  kitchen
    ? "Opišite novu kuhinju ili napišite što da promijenim na ovoj. Svaku izmjenu možete poništiti."
    : "Napišite mjere zidova, oblik, boje i uređaje — AI složi prijedlog, a vi ga zatim mijenjate u 3D-u.";

export const placeholderText = (kitchen: boolean) =>
  kitchen ? "Npr. pomakni sudoper desno, stavi antracit fronte…" : "Npr. L kuhinja, zidovi 4,20 i 2,90 m, bijeli lak, crni kamen…";
