import type { ReactNode } from "react";

/** Small spaced-caps section label with a leading hairline and an optional technical index ("02"). */
export function Eyebrow({
  children,
  index,
  tone = "dark",
  className = "",
}: {
  children: ReactNode;
  index?: string;
  tone?: "dark" | "paper";
  className?: string;
}) {
  const paper = tone === "paper";
  return (
    <p className={`eyebrow flex items-center gap-4 ${paper ? "text-accent-deep" : "text-accent"} ${className}`}>
      <span aria-hidden className={`h-px w-8 ${paper ? "bg-accent-deep/70" : "bg-accent/70"}`} />
      {index && <span className={`tabular-nums ${paper ? "text-mut-paper" : "text-mut"}`}>{index}</span>}
      {children}
    </p>
  );
}
