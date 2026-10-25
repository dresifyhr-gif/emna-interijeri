import Link from "next/link";
import type { ReactNode } from "react";

/** bare full-screen frame for /admin/prijava and /admin/postavljanje */
export function AuthFrame({
  eyebrow,
  title,
  description,
  children,
  footer,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="relative flex min-h-[100svh] flex-col overflow-hidden bg-ink text-fg">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(242,239,233,.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(242,239,233,.04)_1px,transparent_1px)] bg-[size:64px_64px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_30%,black,transparent_75%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-[-20%] h-[520px] w-[820px] -translate-x-1/2 rounded-full bg-accent/[0.06] blur-[120px]"
      />

      <div className="relative flex h-[72px] items-center px-5 sm:px-10">
        <Link href="/" className="group inline-flex flex-col leading-none" aria-label="EMNA Interijeri — naslovnica">
          <span className="font-display text-[18px] font-medium tracking-[0.42em] transition-opacity group-hover:opacity-80">
            EMNA
          </span>
          <span className="mt-1.5 text-[8.5px] font-medium uppercase tracking-[0.42em] text-mut">Interijeri</span>
        </Link>
      </div>

      <div className="relative flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[420px]">
          <p className="eyebrow flex items-center gap-3 text-accent">
            <span aria-hidden className="h-px w-8 bg-accent/70" />
            {eyebrow}
          </p>
          <h1 className="display mt-5 text-[clamp(40px,9vw,56px)]">{title}</h1>
          {description && <div className="mt-4 text-[14px] leading-relaxed text-fg/65">{description}</div>}

          <div className="mt-8 rounded-2xl border border-white/[0.08] bg-ink-700/70 p-6 shadow-[0_30px_80px_-40px_rgba(0,0,0,.8)] backdrop-blur-xl sm:p-7">
            {children}
          </div>

          {/* a dimension line under the card — the site's drawing motif */}
          <div aria-hidden className="mt-6 flex items-center gap-3 text-accent/50">
            <span className="h-2.5 w-px rotate-45 bg-current" />
            <span className="h-px flex-1 bg-current opacity-60" />
            <span className="text-[10px] font-medium uppercase tracking-[0.28em]">420</span>
            <span className="h-px flex-1 bg-current opacity-60" />
            <span className="h-2.5 w-px rotate-45 bg-current" />
          </div>

          {footer && <div className="mt-8 text-center text-[12.5px] text-mut">{footer}</div>}
        </div>
      </div>
    </main>
  );
}
