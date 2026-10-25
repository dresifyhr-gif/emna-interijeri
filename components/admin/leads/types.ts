/**
 * Result shapes shared by the admin's server actions and the client components that call them
 * (client-safe: no imports).
 */

/** generic outcome for useActionState-driven forms; `at` changes on every run (remount / focus) */
export interface ActionResult {
  ok: boolean;
  message: string | null;
  at: number;
}

export const IDLE_RESULT: ActionResult = { ok: false, message: null, at: 0 };

export type NotesSaveResult =
  | { ok: true; savedAt: string }
  | {
      ok: false;
      error: string;
      /** the session is gone — the editor keeps the text and offers a link to log in again */
      expired?: boolean;
    };
