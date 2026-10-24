import type { ReactNode } from "react";

/**
 * "upisati …" markers for facts the owner hasn't supplied yet are visible in development
 * (or with NEXT_PUBLIC_SHOW_TODO=1) and disappear in production. Import this wherever a whole
 * row/block should vanish in production when its fact is missing.
 */
export const showTodos = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_SHOW_TODO === "1";

/**
 * Renders a company fact from lib/site.ts. When the owner hasn't supplied it yet,
 * shows a dashed "upisati: …" marker in development and nothing in production.
 */
export function Fill({
  value,
  label,
  children,
  className = "",
}: {
  value: string | null | undefined;
  label: string;
  children?: (v: string) => ReactNode;
  className?: string;
}) {
  if (value) return <>{children ? children(value) : value}</>;
  if (!showTodos) return null;
  return (
    <span
      title="Podatak još nije upisan u lib/site.ts"
      className={`inline-block rounded border border-dashed border-accent/60 px-1.5 py-0.5 align-middle font-sans text-[11px] font-medium normal-case tracking-normal text-accent ${className}`}
    >
      upisati: {label}
    </span>
  );
}
