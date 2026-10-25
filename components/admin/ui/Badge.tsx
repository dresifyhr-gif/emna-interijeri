import type { ReactNode } from "react";
import {
  LEAD_SOURCE_LABEL,
  LEAD_STATUS_LABEL,
  LEAD_STATUS_TONE,
  QUOTE_STATUS_LABEL,
  QUOTE_STATUS_TONE,
  type BadgeTone,
} from "@/lib/admin/status";
import { cx } from "./cx";

const TONES: Record<BadgeTone, { box: string; dot: string }> = {
  neutral: { box: "bg-white/[0.06] text-fg/85 ring-white/10", dot: "bg-fg/60" },
  accent: { box: "bg-accent/[0.14] text-accent ring-accent/30", dot: "bg-accent" },
  info: { box: "bg-sky-400/10 text-sky-200 ring-sky-300/20", dot: "bg-sky-300" },
  success: { box: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/20", dot: "bg-emerald-300" },
  warning: { box: "bg-amber-400/10 text-amber-200 ring-amber-300/20", dot: "bg-amber-300" },
  danger: { box: "bg-rose-400/10 text-rose-200 ring-rose-300/20", dot: "bg-rose-300" },
  muted: { box: "bg-white/[0.03] text-mut ring-white/[0.07]", dot: "bg-mut" },
};

export function Badge({
  tone = "neutral",
  dot = true,
  className,
  children,
}: {
  tone?: BadgeTone;
  dot?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const t = TONES[tone] ?? TONES.neutral;
  return (
    <span
      className={cx(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-[3px] text-[11.5px] font-medium leading-4 ring-1 ring-inset",
        t.box,
        className,
      )}
    >
      {dot && <span aria-hidden className={cx("h-1.5 w-1.5 rounded-full", t.dot)} />}
      {children}
    </span>
  );
}

/** status of a lead; unknown values (newer code, older data) still render */
export function LeadStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status as keyof typeof LEAD_STATUS_LABEL;
  return (
    <Badge tone={LEAD_STATUS_TONE[s] ?? "neutral"} className={className}>
      {LEAD_STATUS_LABEL[s] ?? status}
    </Badge>
  );
}

export function QuoteStatusBadge({ status, className }: { status: string; className?: string }) {
  const s = status as keyof typeof QUOTE_STATUS_LABEL;
  return (
    <Badge tone={QUOTE_STATUS_TONE[s] ?? "neutral"} className={className}>
      {QUOTE_STATUS_LABEL[s] ?? status}
    </Badge>
  );
}

export function LeadSourceBadge({ source, className }: { source: string; className?: string }) {
  const s = source as keyof typeof LEAD_SOURCE_LABEL;
  return (
    <Badge tone="muted" dot={false} className={className}>
      {LEAD_SOURCE_LABEL[s] ?? source}
    </Badge>
  );
}
