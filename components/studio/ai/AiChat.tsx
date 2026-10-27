"use client";

/**
 * "Opišite kuhinju" — the AI chat's UI: the same pieces in three shells (state: useStudioAi.ts, words: chat.ts).
 *
 *   AiPanel       desktop: in the right-hand panel's place (DesktopPanel's overlay, like the element editor) — the
 *                 kitchen stays in view and changes as the AI answers; × goes back to the steps
 *   AiSheet       phone and tablet: full screen over the studio, sized to the visual viewport so the on-screen
 *                 keyboard never covers the box
 *   AiResultCard  phone and tablet, after a change: the 3D view shows the new kitchen, this card (in the bottom bar's
 *                 place) the AI's short reply, what it assumed, its notes, "Poništi" and "Napišite izmjenu" (back to the
 *                 sheet, the conversation kept)
 *
 * Pieces: AiConversation (the intro with examples, the messages, a calm progress line while the AI works — it can take
 * several seconds — and "Prekini") and AiComposer (the box; a photo from the camera or the gallery, downscaled in the
 * browser; dictation where the browser has speech recognition, in Croatian — hidden elsewhere, phone keyboards have
 * their own microphone; "Složi kuhinju").
 */
import Link from "next/link";
import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { Arrow } from "@/components/ui/Button";
import { AI_LIMITS } from "@/lib/studio/ai/client";
import { SectionLabel } from "../controls";
import { CloseIcon, MicIcon, NoteIcon, PhotoIcon, SparkleIcon, Spinner, UndoIcon } from "../icons";
import { EASE } from "../meta";
import s from "../studio.module.css";
import {
  EDIT_EXAMPLES,
  START_EXAMPLES,
  canSend,
  charsLeft,
  dictationError,
  hasAiKitchen,
  introText,
  joinDictation,
  placeholderText,
  progressLine,
  sendLabel,
  slowHint,
  type AssistantEntry,
  type Example,
  type UserEntry,
} from "./chat";
import type { AiBusy, StudioAi } from "./useStudioAi";

export interface AiViewProps {
  ai: StudioAi;
  /** a kitchen is there to change (false on the phone's start screen: the AI makes a new one) */
  kitchen: boolean;
  /** the studio's last undo step — an answer whose change it still is offers "Poništi" */
  undoTop: number | null;
  onUndo: (undoId: number) => void;
  onClose: () => void;
  reduce: boolean;
}

/* ------------------------------------------------------------------ dictation (Web Speech, where the browser has it) */

interface SpeechAlternative {
  transcript: string;
}
interface SpeechResult {
  readonly length: number;
  readonly isFinal: boolean;
  readonly [i: number]: SpeechAlternative;
}
interface SpeechResults {
  readonly length: number;
  readonly [i: number]: SpeechResult;
}
interface SpeechRec {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  onresult: ((e: { results: SpeechResults }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type SpeechCtor = new () => SpeechRec;

function speechCtor(): SpeechCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}
const noSubscribe = () => () => {};

/**
 * The microphone button's logic: one phrase per press (continuous recognition repeats words on some phones), added
 * to what is written (joinDictation). Hidden where the browser has no speech recognition (false on the server too).
 */
function useDictation(setDraft: (v: string) => void) {
  const supported = useSyncExternalStore(noSubscribe, () => speechCtor() !== null, () => false);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rec = useRef<SpeechRec | null>(null);
  useEffect(() => () => rec.current?.abort(), []);

  const start = useCallback(
    (base: string) => {
      const Ctor = speechCtor();
      if (!Ctor || rec.current) return;
      const r = new Ctor();
      r.lang = "hr-HR";
      r.interimResults = true;
      r.continuous = false;
      r.maxAlternatives = 1;
      r.onresult = (e) => {
        let said = "";
        for (let i = 0; i < e.results.length; i++) said += e.results[i][0]?.transcript ?? "";
        setDraft(joinDictation(base, said));
      };
      r.onerror = (e) => setError(dictationError(e.error));
      r.onend = () => {
        rec.current = null;
        setListening(false);
      };
      try {
        r.start();
        rec.current = r;
        setListening(true);
        setError(null);
      } catch {
        setError(dictationError("network"));
      }
    },
    [setDraft],
  );
  const stop = useCallback(() => rec.current?.stop(), []);
  return { supported, listening, error, start, stop };
}

/* ------------------------------------------------------------------ the visual viewport (phone keyboards) */

let vvSnap = { h: 0, top: 0 };
function readVv() {
  const vv = window.visualViewport;
  const h = Math.round(vv ? vv.height : window.innerHeight);
  const top = Math.round(vv ? vv.offsetTop : 0);
  if (h !== vvSnap.h || top !== vvSnap.top) vvSnap = { h, top };
  return vvSnap;
}
function subscribeVv(cb: () => void) {
  const vv = window.visualViewport;
  vv?.addEventListener("resize", cb);
  vv?.addEventListener("scroll", cb);
  window.addEventListener("resize", cb);
  return () => {
    vv?.removeEventListener("resize", cb);
    vv?.removeEventListener("scroll", cb);
    window.removeEventListener("resize", cb);
  };
}
const SERVER_VV = { h: 0, top: 0 };
const useVisualViewport = () => useSyncExternalStore(subscribeVv, readVv, () => SERVER_VV);

/* ------------------------------------------------------------------ small pieces */

/**
 * Escape closes the chat — also when focus fell back to the page (a pressed "Poništi" goes away). `within`: only when
 * focus is in it or nowhere (the desktop panel is not modal: a control elsewhere handles its own Escape).
 */
function useEscape(onClose: () => void, within: RefObject<HTMLElement | null> | null) {
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const a = document.activeElement;
      if (within && a && a !== document.body && !within.current?.contains(a)) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, within]);
}

function CloseButton({ onClick, label, className = "" }: { onClick: () => void; label: string; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-fg/70 transition-colors duration-300 hover:text-fg active:text-accent ${className}`}
    >
      <CloseIcon className="h-5 w-5" />
    </button>
  );
}

function AiMark({ className = "" }: { className?: string }) {
  return (
    <span aria-hidden="true" className={`flex shrink-0 items-center justify-center rounded-full bg-accent/[0.12] text-accent ${className}`}>
      <SparkleIcon className="h-[55%] w-[55%]" />
    </span>
  );
}

/** what the AI assumed / noted: three lines, the rest behind "Još …" */
function Lines({ label, items, note = false }: { label: string; items: string[]; note?: boolean }) {
  const [all, setAll] = useState(false);
  if (!items.length) return null;
  const shown = all ? items : items.slice(0, 3);
  return (
    <div className="mt-3">
      <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-mut">{label}</p>
      <ul className="mt-1.5 space-y-1.5">
        {shown.map((t, i) => (
          <li key={`${i}-${t}`} className={`flex gap-2 text-[12.5px] leading-snug ${note ? "text-fg/85" : "text-fg/65"}`}>
            {note ? (
              <NoteIcon className="mt-px h-[15px] w-[15px] shrink-0 text-accent" />
            ) : (
              <span aria-hidden="true" className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-mut" />
            )}
            <span className="min-w-0">{t}</span>
          </li>
        ))}
      </ul>
      {items.length > 3 && (
        <button type="button" onClick={() => setAll((a) => !a)} className="mt-1.5 text-[12px] font-medium text-accent hover:text-fg" aria-expanded={all}>
          {all ? "Manje" : `Još ${items.length - 3}`}
        </button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the conversation */

function ExampleCard({ ex, onPick }: { ex: Example; onPick: (text: string) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(ex.text)}
      className="block w-full rounded-[18px] border border-white/[0.1] bg-white/[0.03] px-4 py-3 text-left transition-colors duration-300 ease-premium hover:border-accent/40 active:bg-white/[0.06]"
    >
      <span className="block text-[13px] font-medium text-fg">{ex.label}</span>
      <span className="mt-1 line-clamp-2 block text-[12.5px] leading-snug text-mut">„{ex.text}“</span>
    </button>
  );
}

function EditChips({ onPick, className = "" }: { onPick: (text: string) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap gap-2 ${className}`}>
      {EDIT_EXAMPLES.map((ex) => (
        <button
          key={ex.label}
          type="button"
          onClick={() => onPick(ex.text)}
          className="inline-flex h-9 items-center rounded-full border border-white/[0.12] px-3.5 text-[12.5px] text-fg/80 transition-colors duration-300 hover:border-accent/50 hover:text-fg active:bg-white/[0.06]"
        >
          {ex.label}
        </button>
      ))}
    </div>
  );
}

function Privacy() {
  return (
    <p className="text-[11.5px] leading-relaxed text-mut">
      Opis i fotografiju šaljemo AI usluzi samo da bi složila kuhinju i ne spremamo ih. Na fotografiji neka ne budu osobe.{" "}
      <Link href="/privatnost" target="_blank" rel="noopener" className="underline decoration-white/25 underline-offset-2 hover:text-fg">
        Privatnost
      </Link>
    </p>
  );
}

function Intro({ kitchen, onPick }: { kitchen: boolean; onPick: (text: string) => void }) {
  return (
    <div className="pb-6 pt-5">
      <p className="text-[14px] leading-relaxed text-fg/75">{introText(kitchen)}</p>
      <SectionLabel className="mt-6">{kitchen ? "Nova kuhinja" : "Primjeri"}</SectionLabel>
      <div className="mt-3 space-y-2">
        {START_EXAMPLES.map((ex) => (
          <ExampleCard key={ex.label} ex={ex} onPick={onPick} />
        ))}
      </div>
      {kitchen && (
        <>
          <SectionLabel className="mt-6">Izmjene ove kuhinje</SectionLabel>
          <EditChips onPick={onPick} className="mt-3" />
        </>
      )}
      <p className="mt-6 flex gap-2.5 text-[12.5px] leading-snug text-fg/65">
        <PhotoIcon className="h-4 w-4 shrink-0 text-accent" />
        Možete dodati i fotografiju kuhinje koja vam se sviđa.
      </p>
      <div className="mt-4">
        <Privacy />
      </div>
    </div>
  );
}

function UserBubble({ e }: { e: UserEntry }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[86%] rounded-[20px] rounded-br-[6px] bg-white/[0.075] px-4 py-3 text-[14px] leading-relaxed text-fg">
        {e.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={e.image} alt="Vaša fotografija" className={`max-h-44 w-auto rounded-[14px] object-cover ${e.text ? "mb-2.5" : ""}`} />
        )}
        {e.text && <p className="whitespace-pre-wrap break-words">{e.text}</p>}
      </div>
    </div>
  );
}

function Answer({
  e,
  canUndo,
  onUndo,
  onRetry,
  busy,
}: {
  e: AssistantEntry;
  canUndo: boolean;
  onUndo: () => void;
  onRetry: () => void;
  busy: boolean;
}) {
  const error = e.tone === "error";
  return (
    <div className="flex gap-3">
      <AiMark className="mt-0.5 h-8 w-8" />
      <div className="min-w-0 flex-1">
        <p className={`text-[14px] leading-relaxed ${error ? "text-[#EBB5A4]" : "text-fg/90"}`}>{e.text}</p>
        <Lines label="Pretpostavke" items={e.assumptions} />
        <Lines label="Napomene" items={e.notes} note />
        {e.undoId !== null &&
          (e.undone ? (
            <p className="mt-3 inline-flex items-center gap-1.5 text-[12px] text-mut">
              <UndoIcon className="h-3.5 w-3.5" />
              Izmjena je poništena.
            </p>
          ) : (
            canUndo && (
              <button
                type="button"
                onClick={onUndo}
                className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.14] px-3.5 text-[12.5px] font-medium text-fg/85 transition-colors duration-300 hover:border-accent/60 hover:text-accent"
              >
                <UndoIcon className="h-4 w-4" />
                Poništi
              </button>
            )
          ))}
        {error && e.retry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={busy}
            className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-full border border-white/[0.14] px-3.5 text-[12.5px] font-medium text-fg/85 transition-colors duration-300 hover:border-accent/60 hover:text-accent disabled:opacity-40"
          >
            Pokušajte ponovno
          </button>
        )}
      </div>
    </div>
  );
}

/** the request in flight: a calm line of what is happening (chat.ts progressLine), and "Prekini" */
function Working({ busy, reduce, onCancel }: { busy: AiBusy; reduce: boolean; onCancel: () => void }) {
  const [ms, setMs] = useState(0);
  useEffect(() => {
    const t = window.setInterval(() => setMs(Date.now() - busy.since), 500);
    return () => window.clearInterval(t);
  }, [busy.since]);
  const line = progressLine(ms, busy);
  const hint = slowHint(ms);
  return (
    <div className="flex gap-3">
      <span aria-hidden="true" className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/[0.12] text-accent">
        <SparkleIcon className={`h-[18px] w-[18px] ${s.aiBreath}`} />
      </span>
      <div className="min-w-0 flex-1 pt-1">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p
            key={line}
            initial={{ opacity: 0, y: reduce ? 0 : 4 }}
            animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.5, ease: EASE } }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.25 } }}
            className="text-[14px] text-fg/85"
          >
            {line}
          </motion.p>
        </AnimatePresence>
        <span aria-hidden="true" className="mt-3 block h-px w-full max-w-[220px] overflow-hidden rounded-full bg-white/10">
          <span className={s.aiDrift} />
        </span>
        {hint && <p className="mt-2.5 text-[12px] text-mut">{hint}</p>}
        <button type="button" onClick={onCancel} className="mt-2.5 -ml-1 inline-flex h-8 items-center rounded-full px-1 text-[12.5px] font-medium text-fg/60 hover:text-fg">
          Prekini
        </button>
      </div>
    </div>
  );
}

function AiConversation({
  ai,
  kitchen,
  undoTop,
  onUndo,
  reduce,
  onPick,
  compact,
  afterUndo,
}: Omit<AiViewProps, "onClose"> & {
  onPick: (text: string) => void;
  compact: boolean;
  /** where focus goes once the pressed "Poništi" is gone */
  afterUndo: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const count = ai.entries.length;
  const busy = Boolean(ai.busy);
  // a new message, the progress, an answer: into view
  useEffect(() => {
    const el = ref.current;
    if (!el || !count) return;
    el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
  }, [count, busy, reduce]);
  const last = ai.entries[count - 1];
  return (
    <div
      ref={ref}
      // the messages fade out under the header instead of being cut at its edge
      className={`${s.thinScroll} min-h-0 flex-1 overflow-y-auto overscroll-contain [mask-image:linear-gradient(to_bottom,transparent,#000_18px)] ${compact ? "px-5" : "px-7"}`}
    >
      {count === 0 ? (
        <Intro kitchen={kitchen} onPick={onPick} />
      ) : (
        <div role="log" aria-label="Razgovor s AI pomoćnikom" className="space-y-6 py-5">
          {ai.entries.map((e) =>
            e.role === "user" ? (
              <UserBubble key={e.id} e={e} />
            ) : (
              <Answer
                key={e.id}
                e={e}
                busy={busy}
                canUndo={e.undoId !== null && e.undoId === undoTop}
                onUndo={() => {
                  if (e.undoId === null) return;
                  onUndo(e.undoId);
                  afterUndo();
                }}
                onRetry={() => ai.retry(e.id)}
              />
            ),
          )}
          {ai.busy && <Working busy={ai.busy} reduce={reduce} onCancel={ai.cancel} />}
          {!busy && last?.role === "assistant" && last.tone === "ok" && (kitchen || hasAiKitchen(ai.entries)) && (
            <div className="pl-11">
              <p className="text-[11.5px] text-mut">Nastavite, na primjer:</p>
              <EditChips onPick={onPick} className="mt-2" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the box */

function AiComposer({
  ai,
  kitchen,
  enterSends,
  textRef,
}: {
  ai: StudioAi;
  kitchen: boolean;
  /** desktop: Enter sends (Shift + Enter: a new line); a phone keyboard's Enter is a new line */
  enterSends: boolean;
  textRef: RefObject<HTMLTextAreaElement | null>;
}) {
  const id = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const dict = useDictation(ai.setDraft);
  const busy = Boolean(ai.busy);
  const ready = canSend(ai.draft, ai.image, busy || ai.imageBusy);
  const left = charsLeft(ai.draft);
  const made = hasAiKitchen(ai.entries);

  const submit = () => {
    if (!ready) return;
    if (dict.listening) dict.stop();
    ai.send();
    // a phone: the keyboard goes down, so the progress and then the kitchen show
    if (!enterSends) textRef.current?.blur();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (enterSends && e.key === "Enter" && !e.shiftKey && !e.altKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };
  const imageOf = (files: FileList | null | undefined) => (files ? Array.from(files).find((f) => f.type.startsWith("image/")) : undefined);
  const onPaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    const f = imageOf(e.clipboardData?.files);
    if (!f) return;
    e.preventDefault();
    ai.attach(f);
  };
  const onDrop = (e: DragEvent<HTMLFormElement>) => {
    const f = imageOf(e.dataTransfer?.files);
    if (!f) return;
    e.preventDefault();
    ai.attach(f);
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onDragOver={(e) => {
        if (e.dataTransfer?.types.includes("Files")) e.preventDefault();
      }}
      onDrop={onDrop}
      aria-busy={busy}
    >
      <div className={`rounded-[22px] border bg-white/[0.035] transition-colors duration-300 ${busy ? "border-white/[0.07]" : "border-white/[0.12] focus-within:border-accent/50"}`}>
        {(ai.image || ai.imageBusy || ai.imageError) && (
          <div className="flex items-center gap-3 px-3 pt-3">
            {ai.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={ai.image} alt="Dodana fotografija" className="h-14 w-14 shrink-0 rounded-[12px] object-cover" />
            ) : (
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[12px] bg-white/[0.05] text-mut">
                {ai.imageBusy ? <Spinner className="text-accent" /> : <PhotoIcon className="h-5 w-5" />}
              </span>
            )}
            <p className={`min-w-0 flex-1 text-[12.5px] leading-snug ${ai.imageError ? "text-[#EBB5A4]" : "text-fg/70"}`} role={ai.imageError ? "alert" : undefined}>
              {ai.imageError ?? (ai.imageBusy ? "Pripremam fotografiju…" : "Fotografija ide uz poruku.")}
            </p>
            <button
              type="button"
              onClick={ai.dropImage}
              disabled={busy}
              aria-label="Ukloni fotografiju"
              className="-mr-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-fg/60 hover:text-fg disabled:opacity-40"
            >
              <CloseIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <label htmlFor={id} className="sr-only">
          {kitchen ? "Opišite kuhinju ili što da promijenim" : "Opišite kuhinju"}
        </label>
        <textarea
          id={id}
          ref={textRef}
          value={ai.draft}
          onChange={(e) => ai.setDraft(e.target.value)}
          onKeyDown={onKey}
          onPaste={onPaste}
          rows={3}
          maxLength={AI_LIMITS.message}
          disabled={busy}
          placeholder={placeholderText(kitchen)}
          enterKeyHint={enterSends ? "send" : "enter"}
          className={`${s.thinScroll} block max-h-[min(30svh,220px)] min-h-[88px] w-full resize-none bg-transparent px-4 pb-1.5 pt-3.5 text-[16px] leading-relaxed text-fg caret-accent outline-none [field-sizing:content] placeholder:text-mut/75 disabled:opacity-55`}
        />
        <div className="flex items-center gap-1 px-2 pb-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            tabIndex={-1}
            aria-hidden="true"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) ai.attach(f);
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={busy}
            className="inline-flex h-10 items-center gap-2 rounded-full px-3 text-[12.5px] font-medium text-fg/75 transition-colors duration-300 hover:bg-white/[0.05] hover:text-fg active:text-accent disabled:opacity-40"
          >
            <PhotoIcon className="h-[18px] w-[18px]" />
            Dodaj sliku
          </button>
          {dict.supported && (
            <button
              type="button"
              onClick={() => (dict.listening ? dict.stop() : dict.start(ai.draft))}
              disabled={busy}
              aria-pressed={dict.listening}
              aria-label={dict.listening ? "Zaustavi diktiranje" : "Diktirajte opis"}
              data-on={dict.listening || undefined}
              className={`${s.aiMic} flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-300 disabled:opacity-40 ${
                dict.listening ? "bg-accent text-ink" : "text-fg/75 hover:bg-white/[0.05] hover:text-fg"
              }`}
            >
              <MicIcon className="h-[18px] w-[18px]" />
            </button>
          )}
          <span className="flex-1" />
          {left !== null && (
            <span className={`pr-2 text-[11px] tabular-nums ${left < 0 ? "text-[#EBB5A4]" : "text-mut"}`} aria-live="polite">
              {left}
            </span>
          )}
        </div>
      </div>
      {dict.listening && <p className="mt-2 text-[12px] text-accent">Slušam… recite što želite.</p>}
      {dict.error && (
        <p role="alert" className="mt-2 text-[12px] text-[#EBB5A4]">
          {dict.error}
        </p>
      )}
      <button
        type="submit"
        disabled={!ready}
        className="group mt-3 inline-flex h-[52px] w-full items-center justify-center gap-2.5 rounded-full bg-accent text-[14px] font-semibold tracking-wide text-ink transition-[background-color,opacity] duration-300 ease-premium hover:bg-fg active:bg-fg disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-accent"
      >
        {busy ? (
          <>
            <Spinner />
            AI radi…
          </>
        ) : (
          <>
            {sendLabel(made)}
            <Arrow />
          </>
        )}
      </button>
    </form>
  );
}

/* ------------------------------------------------------------------ desktop: the panel */

export function AiPanel(props: AiViewProps) {
  const { ai, onClose } = props;
  const titleId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const rootRef = useRef<HTMLElement>(null);
  useEffect(() => {
    textRef.current?.focus({ preventScroll: true });
  }, []);
  useEscape(onClose, rootRef);
  const pick = (text: string) => {
    ai.setDraft(text);
    textRef.current?.focus({ preventScroll: true });
  };
  return (
    <section ref={rootRef} aria-labelledby={titleId} className="flex min-h-0 flex-1 flex-col">
      <header className="flex items-start justify-between gap-3 pb-3 pl-7 pr-4 pt-6">
        <div>
          <p className="eyebrow flex items-center gap-2 text-accent">
            <SparkleIcon className="h-3.5 w-3.5" />
            AI pomoćnik
          </p>
          <h2 id={titleId} className="display mt-3 text-[34px]">
            Opišite kuhinju
          </h2>
        </div>
        <CloseButton onClick={onClose} label="Zatvori AI pomoćnika i vrati se na korake" className="-mt-1.5" />
      </header>
      <AiConversation {...props} onPick={pick} compact={false} afterUndo={() => textRef.current?.focus({ preventScroll: true })} />
      <div className="border-t border-white/10 px-7 pb-6 pt-4">
        <AiComposer ai={ai} kitchen={props.kitchen} enterSends textRef={textRef} />
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ phone and tablet: the full-screen sheet */

export function AiSheet(props: AiViewProps & { /** focus the box at once ("Napišite izmjenu"), else the dialog */ focusBox: boolean }) {
  const { ai, onClose, reduce, focusBox } = props;
  const titleId = useId();
  const textRef = useRef<HTMLTextAreaElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const vv = useVisualViewport();
  useEffect(() => {
    if (focusBox) textRef.current?.focus({ preventScroll: true });
    else boxRef.current?.focus({ preventScroll: true });
  }, [focusBox]);
  // modal: Escape closes it wherever focus is
  useEscape(onClose, null);
  // an example fills the box; the keyboard stays down (the button is right there)
  const pick = (text: string) => ai.setDraft(text);
  return (
    <motion.div
      ref={boxRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
      className="fixed inset-x-0 top-0 z-[60] flex flex-col bg-ink outline-none"
      style={{ top: vv.top, height: vv.h > 0 ? vv.h : "100%" }}
      initial={{ opacity: 0, y: reduce ? 0 : 36 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.45, ease: EASE } }}
      exit={{ opacity: 0, y: reduce ? 0 : 36, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
    >
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.07] pl-5 pr-1.5">
        <AiMark className="h-8 w-8" />
        <h2 id={titleId} className="min-w-0 flex-1 font-display text-[18px] font-medium tracking-head">
          Opišite kuhinju
        </h2>
        <CloseButton onClick={onClose} label={ai.busy ? "Zatvori — AI nastavlja raditi" : "Zatvori"} />
      </header>
      {/* after "Poništi" focus stays in the dialog (the box would bring the keyboard up) */}
      <AiConversation {...props} onPick={pick} compact afterUndo={() => boxRef.current?.focus({ preventScroll: true })} />
      <div className="shrink-0 border-t border-white/[0.08] bg-ink-700 px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3">
        <AiComposer ai={ai} kitchen={props.kitchen} enterSends={false} textRef={textRef} />
      </div>
    </motion.div>
  );
}

/* ------------------------------------------------------------------ phone and tablet: the answer over the 3D view */

export function AiResultCard({
  entry,
  canUndo,
  onUndo,
  onMore,
  onClose,
  cardRef,
  reduce,
}: {
  entry: AssistantEntry;
  canUndo: boolean;
  onUndo: () => void;
  /** "Napišite izmjenu": the sheet again, the box focused */
  onMore: () => void;
  onClose: () => void;
  /** measured by <Studio> for the 3D view's bottom inset (the kitchen stays above the card) */
  cardRef: RefObject<HTMLElement | null>;
  reduce: boolean;
}) {
  const [open, setOpen] = useState(false);
  const extra = entry.assumptions.length + entry.notes.length;
  // a refusal or a planner adjustment matters: the first note shows at once
  const firstNote = entry.notes[0];
  return (
    <motion.section
      ref={cardRef}
      aria-label="Odgovor AI pomoćnika"
      initial={{ opacity: 0, y: reduce ? 0 : 24 }}
      animate={{ opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.55, ease: EASE } }}
      exit={{ opacity: 0, y: reduce ? 0 : 24, transition: { duration: reduce ? 0 : 0.25, ease: EASE } }}
      className="absolute inset-x-0 bottom-0 z-20 rounded-t-[26px] border-t border-white/10 bg-ink-700/[0.97] px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-2 shadow-[0_-24px_60px_-30px_rgba(0,0,0,.9)]"
    >
      <div className="flex items-center gap-2.5">
        <AiMark className="h-7 w-7" />
        <p className="eyebrow min-w-0 flex-1 text-accent">AI pomoćnik</p>
        <CloseButton onClick={onClose} label="Zatvori odgovor" className="-mr-2" />
      </div>
      <div className={`${s.thinScroll} max-h-[32svh] overflow-y-auto overscroll-contain`}>
        <p className={`text-[14px] leading-relaxed text-fg/90 ${open ? "" : "line-clamp-3"}`}>{entry.text}</p>
        {open ? (
          <>
            <Lines label="Pretpostavke" items={entry.assumptions} />
            <Lines label="Napomene" items={entry.notes} note />
          </>
        ) : (
          <>
            {firstNote && (
              <p className="mt-2 flex gap-2 text-[12.5px] leading-snug text-fg/80">
                <NoteIcon className="mt-px h-[15px] w-[15px] shrink-0 text-accent" />
                <span className="line-clamp-2 min-w-0">{firstNote}</span>
              </p>
            )}
            {(extra > (firstNote ? 1 : 0) || entry.text.length > 140) && (
              <button type="button" onClick={() => setOpen(true)} aria-expanded={false} className="mt-1.5 inline-flex h-8 items-center text-[12.5px] font-medium text-accent">
                {entry.assumptions.length ? `Pretpostavke i napomene (${extra})` : "Prikaži sve"}
              </button>
            )}
          </>
        )}
      </div>
      <div className={`mt-3 grid gap-2.5 ${canUndo ? "grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]" : "grid-cols-1"}`}>
        {canUndo && (
          <button
            type="button"
            onClick={onUndo}
            className="inline-flex h-[52px] items-center justify-center gap-2 rounded-full border border-white/[0.16] text-[14px] font-semibold tracking-wide text-fg transition-colors duration-300 active:border-accent active:text-accent"
          >
            <UndoIcon className="h-[18px] w-[18px]" />
            Poništi
          </button>
        )}
        <button
          type="button"
          onClick={onMore}
          className="inline-flex h-[52px] items-center justify-center gap-2.5 rounded-full bg-accent text-[14px] font-semibold tracking-wide text-ink transition-colors duration-300 active:bg-fg"
        >
          <SparkleIcon className="h-[18px] w-[18px]" />
          Napišite izmjenu
        </button>
      </div>
    </motion.section>
  );
}

/* ------------------------------------------------------------------ the entry in the top bar (desktop, tablet) */

export function AiTopButton({ onOpen, open, busy, desktop }: { onOpen: () => void; open: boolean; busy: boolean; desktop: boolean }) {
  const label = busy ? "AI slaže kuhinju" : "Opišite kuhinju (AI)";
  if (!desktop) {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={label}
        aria-expanded={open}
        data-ai-entry="top"
        className="flex h-10 w-10 items-center justify-center rounded-full border border-accent/40 bg-accent/[0.08] text-accent backdrop-blur-md transition-colors hover:bg-accent/[0.16]"
      >
        {busy ? <Spinner /> : <SparkleIcon className="h-[18px] w-[18px]" />}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      aria-expanded={open}
      data-ai-entry="top"
      className={`inline-flex h-10 items-center gap-2 rounded-full border px-4 text-[12px] font-medium backdrop-blur-md transition-colors duration-300 ease-premium ${
        open ? "border-accent bg-accent text-ink" : "border-accent/40 bg-accent/[0.08] text-accent hover:bg-accent/[0.16]"
      }`}
    >
      {busy ? <Spinner /> : <SparkleIcon className="h-4 w-4" />}
      <span className="hidden min-[1440px]:inline">{busy ? "AI radi…" : "Opišite kuhinju"}</span>
      <span className="min-[1440px]:hidden">AI</span>
    </button>
  );
}
