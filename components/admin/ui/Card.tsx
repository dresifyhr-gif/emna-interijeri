import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

type Padding = "none" | "sm" | "md" | "lg";
const PAD: Record<Padding, string> = { none: "", sm: "p-4", md: "p-5 sm:p-6", lg: "p-6 sm:p-8" };

export function Card({
  padding = "md",
  as: Tag = "section",
  className,
  children,
  ...aria
}: {
  padding?: Padding;
  as?: "section" | "div" | "article" | "aside";
  className?: string;
  children: ReactNode;
  "aria-labelledby"?: string;
  "aria-label"?: string;
}) {
  return (
    <Tag className={cx("rounded-2xl border border-white/[0.07] bg-ink-700/50", PAD[padding], className)} {...aria}>
      {children}
    </Tag>
  );
}

export function CardHeader({
  title,
  description,
  eyebrow,
  action,
  id,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  /** id of the heading, for <Card aria-labelledby> */
  id?: string;
  className?: string;
}) {
  return (
    <div className={cx("mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3", className)}>
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2 text-mut">{eyebrow}</p>}
        <h2 id={id} className="font-display text-[17px] font-medium tracking-tight text-fg">
          {title}
        </h2>
        {description && <p className="mt-1 text-[13px] leading-relaxed text-mut">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

/** a single number with a label — dashboard tiles */
export function StatCard({
  label,
  value,
  hint,
  href,
  highlight = false,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** whole tile becomes a link */
  href?: string;
  /** accent rule on top (e.g. for "new" items that need attention) */
  highlight?: boolean;
}) {
  const body = (
    <>
      <span
        aria-hidden
        className={cx(
          "absolute inset-x-5 top-0 h-px transition-colors duration-300",
          highlight ? "bg-accent/80" : "bg-white/[0.06] group-hover:bg-accent/40",
        )}
      />
      <span className="eyebrow block text-mut">{label}</span>
      <span className="mt-4 block font-display text-[40px] font-medium leading-none tracking-tightest text-fg tabular-nums">
        {value}
      </span>
      {hint && <span className="mt-3 block text-[12.5px] leading-snug text-mut">{hint}</span>}
    </>
  );
  const cls =
    "group relative block overflow-hidden rounded-2xl border border-white/[0.07] bg-ink-700/50 p-5 transition-colors duration-300 sm:p-6";
  return href ? (
    <Link href={href} className={cx(cls, "hover:border-white/[0.14] hover:bg-ink-700/80")}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
