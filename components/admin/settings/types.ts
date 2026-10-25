/** state of a settings form driven by useActionState (client-safe: no imports) */
export interface FormState {
  ok: boolean;
  /** form-level message (success or problem) */
  message: string | null;
  /** field name → Croatian error */
  errors: Record<string, string>;
  /** raw values echoed back after a failed attempt (never passwords) */
  values: Record<string, string> | null;
  /** changes on every run — used as a remount key and to focus the first invalid field */
  at: number;
}

export const IDLE_FORM: FormState = { ok: false, message: null, errors: {}, values: null, at: 0 };
