import Link from "next/link";
import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * Top of every admin page: optional back link, eyebrow, title (h1), description and actions.
 *
 *   <PageHeader eyebrow="Upiti" title="U-2026-0001" back={{ href: "/admin/upiti", label: "Svi upiti" }}
 *     actions={<LinkButton href="…">Nova ponuda</LinkButton>} />
 */
export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  back,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  back?: { href: string; label: string };
  className?: string;
}) {
  return (
    <header className={cx("mb-8 sm:mb-10", className)}>
      {back && (
        <Link
          href={back.href}
          className="group mb-5 inline-flex items-center gap-2 text-[12.5px] font-medium text-mut transition-colors hover:text-fg"
        >
          <svg aria-hidden viewBox="0 0 14 14" className="h-3.5 w-3.5 transition-transform group-hover:-translate-x-0.5">
            <path d="M13 7H1m0 0 5.5-5.5M1 7l5.5 5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
          </svg>
          {back.label}
        </Link>
      )}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          {eyebrow && (
            <p className="eyebrow mb-3 flex items-center gap-3 text-accent">
              <span aria-hidden className="h-px w-6 bg-accent/70" />
              {eyebrow}
            </p>
          )}
          <h1 className="font-display text-[clamp(26px,3.2vw,36px)] font-medium leading-[1.05] tracking-tightest text-fg">
            {title}
          </h1>
          {description && <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-mut">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}
