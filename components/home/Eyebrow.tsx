import type { ReactNode } from "react";

/** Small spaced-caps label above a section heading: taupe on light, accent on dark. */
export function Eyebrow({
  children,
  tone = "light",
  className = "",
}: {
  children: ReactNode;
  tone?: "light" | "dark";
  className?: string;
}) {
  return <p className={`kicker ${tone === "dark" ? "text-accent" : "text-taupe"} ${className}`}>{children}</p>;
}
