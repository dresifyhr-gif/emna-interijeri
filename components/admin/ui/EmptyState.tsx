import type { ReactNode } from "react";
import { cx } from "./cx";

/**
 * "Nothing here yet" block. The dimension line above the title is the site's technical-drawing
 * motif — an empty space, measured.
 */
export function EmptyState({
  title,
  description,
  action,
  icon,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-col items-center rounded-2xl border border-dashed border-white/[0.1] px-6 py-14 text-center",
        className,
      )}
    >
      {icon ? (
        <div className="mb-5 text-accent/80">{icon}</div>
      ) : (
        <div aria-hidden className="mb-6 flex w-40 items-center gap-2 text-accent/70">
          <span className="h-2.5 w-px rotate-45 bg-current" />
          <span className="h-px flex-1 bg-current opacity-60" />
          <span className="text-[10px] font-medium tracking-[0.2em]">0</span>
          <span className="h-px flex-1 bg-current opacity-60" />
          <span className="h-2.5 w-px rotate-45 bg-current" />
        </div>
      )}
      <p className="font-display text-[17px] font-medium tracking-tight text-fg">{title}</p>
      {description && <p className="mt-2 max-w-md text-[13.5px] leading-relaxed text-mut">{description}</p>}
      {action && <div className="mt-6 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
