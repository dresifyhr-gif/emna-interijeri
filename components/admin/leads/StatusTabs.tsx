/** status filter for /admin/upiti as a row of links (scrolls sideways on phones) */
import Link from "next/link";
import { cx } from "@/components/admin/ui";
import { leadListHref, type LeadList, type LeadListParams, type LeadStatusFilter } from "@/lib/admin/leads";
import { LEAD_STATUSES, LEAD_STATUS_LABEL } from "@/lib/admin/status";

const TABS: Array<{ value: LeadStatusFilter; label: string }> = [
  { value: "aktivni", label: "Aktivni" },
  ...LEAD_STATUSES.map((s) => ({ value: s, label: LEAD_STATUS_LABEL[s] })),
];

export function StatusTabs({ params, counts }: { params: LeadListParams; counts: LeadList["counts"] }) {
  return (
    <nav aria-label="Status upita" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex w-max gap-1.5 sm:w-auto sm:flex-wrap">
        {TABS.map((t) => {
          const active = params.status === t.value;
          const n = counts[t.value];
          return (
            <li key={t.value}>
              <Link
                href={leadListHref({ status: t.value, source: params.source, q: params.q })}
                aria-current={active ? "page" : undefined}
                className={cx(
                  "inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-[12.5px] font-medium transition-colors duration-200",
                  active
                    ? "border-accent/50 bg-accent/[0.12] text-accent"
                    : "border-white/[0.08] text-fg/65 hover:border-white/20 hover:text-fg",
                )}
              >
                {t.label}
                <span
                  className={cx(
                    "min-w-[20px] rounded-full px-1.5 text-center text-[11px] tabular-nums",
                    active ? "bg-accent/20 text-accent" : "bg-white/[0.06] text-mut",
                  )}
                >
                  {n}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
