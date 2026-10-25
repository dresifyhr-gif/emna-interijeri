import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Accessible form fields. Give each control a `name`; the id defaults to `f-<name>`.
 * `label` wraps the control in <Field> (label, hint and error wired with aria-describedby).
 *
 *   <Input name="email" type="email" label="E-mail" hint="Na ovu adresu šaljemo ponudu." error={errors.email} />
 *   <Select name="status" label="Status" options={LEAD_STATUS_OPTIONS} defaultValue={lead.status} />
 *   <Textarea name="notes" label="Bilješke" rows={5} />
 */

interface FieldMeta {
  label?: ReactNode;
  hint?: ReactNode;
  /** message shown under the control; also sets aria-invalid */
  error?: string | null;
  /** extra element at the right of the label row (e.g. "Prikaži lozinku") */
  labelAside?: ReactNode;
  /** classes for the outer wrapper when `label` is given */
  fieldClassName?: string;
}

const controlBase =
  "block w-full rounded-lg border bg-ink-800 px-3.5 text-[14px] text-fg placeholder:text-mut/70 transition-colors duration-200 " +
  "hover:border-white/20 focus:border-accent/70 focus:outline-none focus:ring-1 focus:ring-accent/40 focus-visible:outline-none " +
  "disabled:cursor-not-allowed disabled:opacity-60 read-only:bg-ink-700/60";

const controlState = (error?: string | null) =>
  error ? "border-rose-400/60 focus:border-rose-400 focus:ring-rose-400/30" : "border-white/10";

export function fieldIds(id: string, meta: { hint?: ReactNode; error?: string | null }) {
  const hintId = meta.hint ? `${id}-hint` : undefined;
  const errorId = meta.error ? `${id}-error` : undefined;
  return { hintId, errorId, describedBy: [errorId, hintId].filter(Boolean).join(" ") || undefined };
}

export function Field({
  id,
  label,
  hint,
  error,
  required,
  labelAside,
  className,
  children,
}: {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  required?: boolean;
  labelAside?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const { hintId, errorId } = fieldIds(id, { hint, error });
  return (
    <div className={cx("space-y-1.5", className)}>
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-[12.5px] font-medium text-fg/85">
          {label}
          {required && (
            <span className="ml-1 text-accent" aria-hidden>
              *
            </span>
          )}
        </label>
        {labelAside}
      </div>
      {children}
      {error && (
        <p id={errorId} className="flex items-start gap-1.5 text-[12.5px] leading-snug text-rose-300">
          <span aria-hidden className="mt-[5px] h-1 w-1 shrink-0 rounded-full bg-rose-300" />
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="text-[12.5px] leading-snug text-mut">
          {hint}
        </p>
      )}
    </div>
  );
}

function withField(
  id: string,
  meta: FieldMeta & { required?: boolean },
  control: ReactNode,
): ReactNode {
  if (!meta.label) return control;
  return (
    <Field
      id={id}
      label={meta.label}
      hint={meta.hint}
      error={meta.error}
      required={meta.required}
      labelAside={meta.labelAside}
      className={meta.fieldClassName}
    >
      {control}
    </Field>
  );
}

type InputProps = Omit<ComponentProps<"input">, "id"> & FieldMeta & { id?: string; name: string };

export function Input({ id, name, label, hint, error, labelAside, fieldClassName, className, ...rest }: InputProps) {
  const fid = id ?? `f-${name}`;
  const { describedBy } = fieldIds(fid, { hint: label ? hint : undefined, error: label ? error : undefined });
  return withField(
    fid,
    { label, hint, error, labelAside, fieldClassName, required: rest.required },
    <input
      id={fid}
      name={name}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cx(controlBase, controlState(error), "h-10", className)}
      {...rest}
    />,
  );
}

type SelectProps = Omit<ComponentProps<"select">, "id"> &
  FieldMeta & {
    id?: string;
    name: string;
    options?: ReadonlyArray<{ value: string; label: string; disabled?: boolean }>;
    /** first, empty option (e.g. "Odaberite…") */
    placeholder?: string;
  };

export function Select({
  id,
  name,
  label,
  hint,
  error,
  labelAside,
  fieldClassName,
  className,
  options,
  placeholder,
  children,
  ...rest
}: SelectProps) {
  const fid = id ?? `f-${name}`;
  const { describedBy } = fieldIds(fid, { hint: label ? hint : undefined, error: label ? error : undefined });
  return withField(
    fid,
    { label, hint, error, labelAside, fieldClassName, required: rest.required },
    <div className="relative">
      <select
        id={fid}
        name={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cx(controlBase, controlState(error), "h-10 appearance-none pr-10", className)}
        {...rest}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options?.map((o) => (
          <option key={o.value} value={o.value} disabled={o.disabled}>
            {o.label}
          </option>
        ))}
        {children}
      </select>
      <svg
        aria-hidden
        viewBox="0 0 12 12"
        className="pointer-events-none absolute right-3.5 top-1/2 h-3 w-3 -translate-y-1/2 text-mut"
      >
        <path d="M2.5 4.5 6 8l3.5-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      </svg>
    </div>,
  );
}

type TextareaProps = Omit<ComponentProps<"textarea">, "id"> & FieldMeta & { id?: string; name: string };

export function Textarea({ id, name, label, hint, error, labelAside, fieldClassName, className, rows = 4, ...rest }: TextareaProps) {
  const fid = id ?? `f-${name}`;
  const { describedBy } = fieldIds(fid, { hint: label ? hint : undefined, error: label ? error : undefined });
  return withField(
    fid,
    { label, hint, error, labelAside, fieldClassName, required: rest.required },
    <textarea
      id={fid}
      name={name}
      rows={rows}
      aria-invalid={error ? true : undefined}
      aria-describedby={describedBy}
      className={cx(controlBase, controlState(error), "min-h-[88px] py-2.5 leading-relaxed", className)}
      {...rest}
    />,
  );
}
