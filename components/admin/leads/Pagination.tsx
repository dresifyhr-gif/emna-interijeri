import { LinkButton, buttonClass } from "@/components/admin/ui";
import { leadListHref, type LeadListParams } from "@/lib/admin/leads";

/** "Prikazano 26–50 od 73" + previous / next (only rendered when there is more than one page) */
export function Pagination({
  params,
  total,
  pageCount,
  pageSize,
}: {
  params: LeadListParams;
  total: number;
  pageCount: number;
  pageSize: number;
}) {
  if (pageCount <= 1) return null;
  const page = Math.min(params.page, pageCount);
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const href = (p: number) => leadListHref({ ...params, page: p });

  return (
    <nav aria-label="Stranice" className="flex flex-col items-center justify-between gap-3 sm:flex-row">
      <p className="text-[12.5px] text-mut">
        Prikazano <span className="tabular-nums text-fg/85">{from}–{to}</span> od{" "}
        <span className="tabular-nums text-fg/85">{total}</span>
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <LinkButton href={href(page - 1)} size="sm" rel="prev">
            ← Prethodna
          </LinkButton>
        ) : (
          <span aria-disabled="true" className={buttonClass("secondary", "sm")}>
            ← Prethodna
          </span>
        )}
        <span className="px-2 text-[12.5px] tabular-nums text-mut">
          {page} / {pageCount}
        </span>
        {page < pageCount ? (
          <LinkButton href={href(page + 1)} size="sm" rel="next">
            Sljedeća →
          </LinkButton>
        ) : (
          <span aria-disabled="true" className={buttonClass("secondary", "sm")}>
            Sljedeća →
          </span>
        )}
      </div>
    </nav>
  );
}
