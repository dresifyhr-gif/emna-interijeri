import type { ReactNode } from "react";
import { cx } from "./cx";

type Tone = "info" | "success" | "warning" | "danger";

const TONES: Record<Tone, { box: string; bar: string; title: string }> = {
  info: { box: "border-white/10 bg-white/[0.03]", bar: "bg-accent", title: "text-fg" },
  success: { box: "border-emerald-300/20 bg-emerald-400/[0.06]", bar: "bg-emerald-300", title: "text-emerald-100" },
  warning: { box: "border-amber-300/20 bg-amber-400/[0.06]", bar: "bg-amber-300", title: "text-amber-100" },
  danger: { box: "border-rose-300/25 bg-rose-400/[0.07]", bar: "bg-rose-300", title: "text-rose-100" },
};

/** inline notice; `danger` is announced immediately (role="alert"), the rest politely */
export function Alert({
  tone = "info",
  title,
  className,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cx("relative overflow-hidden rounded-xl border py-3.5 pl-5 pr-4 text-[13.5px] leading-relaxed", t.box, className)}
    >
      <span aria-hidden className={cx("absolute inset-y-3 left-0 w-[2px] rounded-full", t.bar)} />
      {title && <p className={cx("font-medium", t.title)}>{title}</p>}
      {children && <div className={cx("text-fg/75", title ? "mt-1" : null)}>{children}</div>}
    </div>
  );
}
