"use client";

/**
 * Internal notes on an inquiry, saved automatically 1.5 s after typing stops, on blur, on
 * Ctrl/⌘+S and with the "Spremi" button. Never loses text: one save runs at a time and the newest
 * text always follows; leaving the page with unsaved text asks first; an expired session is
 * reported (the text stays in the field) instead of redirecting.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button, Spinner, cx } from "@/components/admin/ui";
import { formatDateTime } from "@/lib/admin/format";
import type { NotesSaveResult } from "./types";

type Status = "idle" | "dirty" | "saving" | "saved" | "error";

const DEBOUNCE_MS = 1500;

export function NotesEditor({
  leadId,
  initialNotes,
  maxLength,
  save,
}: {
  leadId: string;
  initialNotes: string;
  maxLength: number;
  save: (id: string, notes: string) => Promise<NotesSaveResult>;
}) {
  const [value, setValue] = useState(initialNotes);
  /** last text the server confirmed (state for rendering, ref for the save loop) */
  const [saved, setSaved] = useState(initialNotes);
  const [status, setStatus] = useState<Status>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [error, setError] = useState<{ text: string; expired: boolean } | null>(null);

  const valueRef = useRef(initialNotes);
  /** what the server has */
  const savedRef = useRef(initialNotes);
  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const statusId = `${fieldId}-status`;

  const clearTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  async function flush(): Promise<void> {
    clearTimer();
    if (inFlight.current) return; // the running save re-checks when it finishes
    const text = valueRef.current;
    if (text === savedRef.current) {
      setStatus((s) => (s === "dirty" ? "saved" : s));
      return;
    }
    inFlight.current = true;
    setStatus("saving");
    let res: NotesSaveResult;
    try {
      res = await save(leadId, text);
    } catch {
      res = { ok: false, error: "Veza s poslužiteljem nije uspjela. Pokušat ću ponovno čim nešto promijenite." };
    }
    inFlight.current = false;
    if (res.ok) {
      savedRef.current = text;
      setSaved(text);
      setSavedAt(res.savedAt);
      setError(null);
      if (valueRef.current !== text) {
        // typed more while saving
        setStatus("dirty");
        void flush();
      } else {
        setStatus("saved");
      }
    } else {
      setError({ text: res.error, expired: Boolean(res.expired) });
      setStatus("error");
    }
  }

  const schedule = () => {
    clearTimer();
    timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
  };

  // warn before closing the tab with unsaved text; on in-app navigation, save what's left
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (valueRef.current !== savedRef.current || inFlight.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    const pendingTimer = timer;
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (pendingTimer.current) clearTimeout(pendingTimer.current);
      if (valueRef.current !== savedRef.current && !inFlight.current) {
        void save(leadId, valueRef.current).catch(() => {});
      }
    };
  }, [leadId, save]);

  const dirty = value !== saved;
  const near = value.length > maxLength * 0.9;

  let statusText: ReactNode;
  switch (status) {
    case "saving":
      statusText = (
        <>
          <Spinner className="text-accent" /> Spremam…
        </>
      );
      break;
    case "dirty":
      statusText = "Nespremljene promjene…";
      break;
    case "saved":
      statusText = savedAt ? `Spremljeno ${formatDateTime(savedAt).replace(/^.* u /, "u ")}.` : "Spremljeno.";
      break;
    case "error":
      statusText = (
        <span className="text-rose-300">
          {error?.text}{" "}
          {error?.expired && (
            <a href="/admin/prijava" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-fg">
              Prijava (nova kartica)
            </a>
          )}
        </span>
      );
      break;
    default:
      statusText = "Sprema se samo dok pišete.";
  }

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={fieldId} className="text-[12.5px] font-medium text-fg/85">
          Interne bilješke
        </label>
        {near && (
          <span className={cx("text-[11.5px] tabular-nums", value.length >= maxLength ? "text-rose-300" : "text-mut")}>
            {value.length} / {maxLength}
          </span>
        )}
      </div>
      <textarea
        id={fieldId}
        name="notes"
        rows={7}
        maxLength={maxLength}
        value={value}
        aria-describedby={`${hintId} ${statusId}`}
        placeholder="Npr. dogovorena izmjera u četvrtak u 10 h; želi hrast i bijele fronte; budžet do 9.000 €."
        onChange={(e) => {
          const v = e.currentTarget.value;
          setValue(v);
          valueRef.current = v;
          if (v === savedRef.current) {
            clearTimer();
            setStatus((s) => (s === "dirty" ? "saved" : s));
          } else {
            setStatus((s) => (s === "saving" ? s : "dirty"));
            schedule();
          }
        }}
        onBlur={() => void flush()}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
            e.preventDefault();
            void flush();
          }
        }}
        className="block min-h-[160px] w-full rounded-lg border border-white/10 bg-ink-800 px-3.5 py-2.5 text-[14px] leading-relaxed text-fg transition-colors duration-200 placeholder:text-mut/60 hover:border-white/20 focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40"
      />
      <p id={hintId} className="text-[12.5px] leading-snug text-mut">
        Vide ih samo administratori — kupac ih nikad ne vidi.
      </p>
      <div className="flex items-center justify-between gap-3">
        <p id={statusId} role="status" aria-live="polite" className="flex min-h-[18px] items-center gap-2 text-[12.5px] text-mut">
          {statusText}
        </p>
        <Button
          size="sm"
          variant="secondary"
          onClick={() => void flush()}
          disabled={!dirty || status === "saving"}
        >
          Spremi
        </Button>
      </div>
    </div>
  );
}
