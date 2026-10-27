"use client";

/**
 * "Opišite kuhinju" — the state of the AI chat in the studio: may this visitor use it (GET status, once), the
 * conversation, the text being written, the photo, the request in flight. <Studio> applies a new kitchen itself
 * (`apply`: one undo step) and says which undo step it was, so an answer can offer "Poništi".
 *
 * Nothing here knows about the layout: the desktop panel, the phone's full-screen sheet and the card over the 3D view
 * (AiChat.tsx) all read the same state.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { aiStatus, askStudioAi, downscaleImage } from "@/lib/studio/ai/client";
import { decodeConfig } from "@/lib/studio/share";
import type { KitchenConfig } from "@/lib/studio/types";
import { canRetry, canSend, failureText, historyFor, type AssistantEntry, type ChatEntry, type UserEntry } from "./chat";

export interface AiBusy {
  /** Date.now() when the request went out */
  since: number;
  photo: boolean;
  /** about the kitchen on screen (not a new one) */
  edit: boolean;
}

export interface StudioAiOptions {
  /** the kitchen the words are about (a share-link string), or null when there is none yet (the phone's start screen) */
  getConfig: () => string | null;
  /** a new kitchen from the AI: apply it as one undo step and return that step's id (null: not applied) */
  apply: (cfg: KitchenConfig, reply: string) => number | null;
  /** an answer arrived (also an error) */
  onAnswer?: (entry: AssistantEntry) => void;
}

export interface StudioAi {
  /** the feature may be shown (GET /api/studio/ai said so); false until it answers and on any error */
  enabled: boolean;
  entries: ChatEntry[];
  draft: string;
  setDraft: (v: string) => void;
  /** the photo to send with the next message (a JPEG data URL) */
  image: string | null;
  imageBusy: boolean;
  imageError: string | null;
  attach: (file: Blob) => void;
  dropImage: () => void;
  busy: AiBusy | null;
  send: () => void;
  /** send a failed message again (the error answer's id) */
  retry: (entryId: number) => void;
  cancel: () => void;
  /** "Poništi" on an answer: it says so from now on (and the model hears it) */
  markUndone: (undoId: number) => void;
}

export function useStudioAi(opts: StudioAiOptions): StudioAi {
  const [enabled, setEnabled] = useState(false);
  const [entries, setEntries] = useState<ChatEntry[]>([]);
  const [draft, setDraft] = useState("");
  const [image, setImage] = useState<string | null>(null);
  const [imageBusy, setImageBusy] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [busy, setBusy] = useState<AiBusy | null>(null);

  const optsRef = useRef(opts);
  const abortRef = useRef<AbortController | null>(null);
  const seq = useRef(0);
  const imageSeq = useRef(0);
  useEffect(() => {
    optsRef.current = opts;
  });

  // may this visitor use it (production: only the logged-in owner until it is opened to everyone)
  useEffect(() => {
    const c = new AbortController();
    void aiStatus(c.signal).then((s) => {
      if (!c.signal.aborted) setEnabled(s.enabled);
    });
    return () => c.abort();
  }, []);

  // leaving the studio: a request in flight is dropped
  useEffect(() => () => abortRef.current?.abort(), []);

  const run = useCallback(async (text: string, photo: string | null, before: ChatEntry[]) => {
    const config = optsRef.current.getConfig();
    const history = historyFor(before);
    seq.current += 1;
    const user: UserEntry = { id: seq.current, role: "user", text, image: photo };
    setEntries([...before, user]);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setBusy({ since: Date.now(), photo: Boolean(photo), edit: config !== null });

    const r = await askStudioAi({ message: text, config, image: photo, history, signal: ctrl.signal });
    if (abortRef.current === ctrl) abortRef.current = null;
    setBusy(null);
    seq.current += 1;
    const id = seq.current;

    if (!r.ok) {
      if (r.error === "aborted") {
        // "Prekini": the words (and the photo) go back into the box
        setEntries((es) => es.filter((e) => e.id !== user.id));
        setDraft((d) => (d.trim() ? d : text));
        if (photo) setImage((i) => i ?? photo);
        return;
      }
      const err: AssistantEntry = {
        id,
        role: "assistant",
        tone: "error",
        text: failureText(r),
        assumptions: [],
        notes: [],
        undoId: null,
        undone: false,
        retry: canRetry(r.error) ? { text, image: photo } : null,
      };
      setEntries((es) => [...es, err]);
      optsRef.current.onAnswer?.(err);
      return;
    }

    let undoId: number | null = null;
    if (r.changed && r.config) {
      const cfg = decodeConfig(r.config);
      if (cfg) undoId = optsRef.current.apply(cfg, r.reply);
    }
    const answer: AssistantEntry = {
      id,
      role: "assistant",
      tone: "ok",
      text: r.reply,
      assumptions: r.assumptions,
      notes: r.notes,
      undoId,
      undone: false,
      retry: null,
    };
    setEntries((es) => [...es, answer]);
    optsRef.current.onAnswer?.(answer);
  }, []);

  const send = useCallback(() => {
    if (busy || imageBusy) return;
    const text = draft.trim();
    if (!canSend(text, image, false)) return;
    setDraft("");
    setImage(null);
    setImageError(null);
    void run(text, image, entries);
  }, [busy, imageBusy, draft, image, entries, run]);

  const retry = useCallback(
    (entryId: number) => {
      if (busy) return;
      const i = entries.findIndex((e) => e.id === entryId);
      const e = entries[i];
      if (!e || e.role !== "assistant" || !e.retry) return;
      // the failed message and its error give way to the new attempt
      const prev = entries[i - 1];
      const before = entries.filter((x) => x.id !== e.id && !(prev && prev.role === "user" && x.id === prev.id));
      void run(e.retry.text, e.retry.image, before);
    },
    [busy, entries, run],
  );

  const cancel = useCallback(() => abortRef.current?.abort(), []);

  const attach = useCallback((file: Blob) => {
    imageSeq.current += 1;
    const n = imageSeq.current;
    setImageError(null);
    if (file.type && !file.type.startsWith("image/")) {
      setImageError("Odaberite fotografiju (JPEG ili PNG).");
      return;
    }
    setImageBusy(true);
    downscaleImage(file).then(
      (url) => {
        if (imageSeq.current !== n) return;
        setImage(url);
        setImageBusy(false);
      },
      (e: unknown) => {
        if (imageSeq.current !== n) return;
        setImageError(e instanceof Error && e.message ? e.message : "Slika se ne može pročitati.");
        setImageBusy(false);
      },
    );
  }, []);

  const dropImage = useCallback(() => {
    imageSeq.current += 1;
    setImage(null);
    setImageBusy(false);
    setImageError(null);
  }, []);

  const markUndone = useCallback((undoId: number) => {
    setEntries((es) => es.map((e) => (e.role === "assistant" && e.undoId === undoId ? { ...e, undone: true } : e)));
  }, []);

  return { enabled, entries, draft, setDraft, image, imageBusy, imageError, attach, dropImage, busy, send, retry, cancel, markUndone };
}
