"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { Field, fieldIds } from "./Field";
import { IconEye, IconEyeOff } from "./icons";
import { cx } from "./cx";

/** password field with a show / hide toggle (the toggle is a real button with a state label) */
export function PasswordInput({
  name,
  id,
  label,
  hint,
  error,
  className,
  ...rest
}: Omit<ComponentProps<"input">, "type" | "id"> & {
  name: string;
  id?: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
}) {
  const [visible, setVisible] = useState(false);
  const fid = id ?? `f-${name}`;
  const { describedBy } = fieldIds(fid, { hint, error });
  return (
    <Field id={fid} label={label} hint={hint} error={error} required={rest.required}>
      <div className="relative">
        <input
          id={fid}
          name={name}
          type={visible ? "text" : "password"}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          className={cx(
            "block h-10 w-full rounded-lg border bg-ink-800 pl-3.5 pr-11 text-[14px] text-fg placeholder:text-mut/70 transition-colors duration-200",
            "hover:border-white/20 focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40 focus-visible:outline-none",
            error ? "border-rose-400/60 focus:border-rose-400 focus:ring-rose-400/30" : "border-white/10",
            className,
          )}
          {...rest}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Sakrij lozinku" : "Prikaži lozinku"}
          aria-pressed={visible}
          aria-controls={fid}
          className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-lg text-mut transition-colors hover:text-fg"
        >
          {visible ? <IconEyeOff size={17} /> : <IconEye size={17} />}
        </button>
      </div>
    </Field>
  );
}
