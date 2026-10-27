"use client";

/**
 * Where the visitor is in the phone's simple flow (flow.ts PhoneStage), remembered for the visit: sessionStorage, in
 * memory only when storage is blocked. Kept as its string key ("start", "wizard:2", "3d"; "" = nothing chosen yet) so
 * useSyncExternalStore compares plain strings. The server (and the hydrating render) sees "": the phone UI is decided on
 * the client.
 */
import { useSyncExternalStore } from "react";
import { stageKey, type PhoneStage } from "./flow";

const KEY = "emna-studio-phone";
let value: string | null = null;
const subs = new Set<() => void>();

function read(): string {
  if (value === null) {
    let raw: string | null = null;
    try {
      raw = window.sessionStorage.getItem(KEY);
    } catch {
      // storage blocked: nothing remembered
    }
    value = raw ?? "";
  }
  return value;
}

function subscribe(cb: () => void) {
  subs.add(cb);
  return () => {
    subs.delete(cb);
  };
}

export function setPhoneStage(s: PhoneStage): void {
  const v = stageKey(s);
  if (read() === v) return;
  value = v;
  try {
    window.sessionStorage.setItem(KEY, v);
  } catch {
    // storage blocked: remembered while the page is open
  }
  subs.forEach((cb) => cb());
}

/** the remembered stage's key ("" before anything was chosen, and on the server) */
export const usePhoneStageKey = (): string => useSyncExternalStore(subscribe, read, () => "");
