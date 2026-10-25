/**
 * List of inquiries: a table from md up, stacked cards on phones (only one of the two is
 * displayed, the other is display:none, so screen readers meet it once).
 */
import Link from "next/link";
import {
  LeadSourceBadge,
  LeadStatusBadge,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  cx,
  rowLinkClass,
} from "@/components/admin/ui";
import type { LeadListRow } from "@/lib/admin/leads";
import { LEAD_SOURCE_LABEL } from "@/lib/admin/status";
import { formatDate, formatDateTime, formatPriceRange, formatRelative } from "@/lib/admin/format";
import { IconImage } from "./icons";

const timeOnly = (d: Date) => formatDateTime(d).replace(/^.* u /, "");

export function LeadsTable({
  rows,
  caption,
  compact = false,
}: {
  rows: LeadListRow[];
  caption: string;
  /** dashboard: fewer columns, relative dates */
  compact?: boolean;
}) {
  return (
    <>
      <div className="hidden md:block">
        <Table caption={caption} minWidth={compact ? 640 : 860}>
          <THead>
            <TR>
              <TH>Broj</TH>
              <TH>Kupac</TH>
              <TH>{compact ? "Primljeno" : "Datum"}</TH>
              <TH>Izvor</TH>
              {!compact && <TH>Grad</TH>}
              <TH align="right">Okvirno</TH>
              <TH>Status</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((l) => (
              <TR key={l.id} interactive className={cx(l.status === "arhiva" && "opacity-70")}>
                <TD nowrap muted className="font-medium tabular-nums tracking-wide">
                  {l.number}
                </TD>
                <TD className="max-w-[260px]">
                  <Link href={`/admin/upiti/${l.id}`} className={cx(rowLinkClass, "block truncate")}>
                    {l.status === "novi" && (
                      <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-accent" />
                    )}
                    {l.name}
                  </Link>
                  {compact && l.city && <span className="mt-0.5 block truncate text-[12px] text-mut">{l.city}</span>}
                </TD>
                <TD nowrap muted>
                  {compact ? (
                    formatRelative(l.createdAt)
                  ) : (
                    <>
                      <span className="text-fg/85">{formatDate(l.createdAt)}</span>
                      <span className="ml-2 text-[12px]">{timeOnly(l.createdAt)}</span>
                    </>
                  )}
                </TD>
                <TD nowrap>
                  <span className="inline-flex items-center gap-1.5">
                    <LeadSourceBadge source={l.source} />
                    {l.hasSnapshot && (
                      <span title="Ima 3D prikaz" className="text-accent/80">
                        <IconImage size={15} />
                        <span className="sr-only">(ima 3D prikaz)</span>
                      </span>
                    )}
                  </span>
                </TD>
                {!compact && (
                  <TD muted className="max-w-[160px] truncate">
                    {l.city || "—"}
                  </TD>
                )}
                <TD align="right" nowrap className="tabular-nums">
                  {formatPriceRange(l.priceLow, l.priceHigh) || <span className="text-mut">—</span>}
                </TD>
                <TD nowrap>
                  <LeadStatusBadge status={l.status} />
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      </div>

      <ul aria-label={caption} className="divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/[0.07] bg-ink-700/40 md:hidden">
        {rows.map((l) => {
          const price = formatPriceRange(l.priceLow, l.priceHigh);
          return (
            <li key={l.id}>
              <Link
                href={`/admin/upiti/${l.id}`}
                className="block px-4 py-3.5 outline-none transition-colors hover:bg-white/[0.025] focus-visible:bg-white/[0.04] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
              >
                <span className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block truncate text-[14.5px] font-medium text-fg">
                      {l.status === "novi" && (
                        <span aria-hidden className="mr-2 inline-block h-1.5 w-1.5 -translate-y-0.5 rounded-full bg-accent" />
                      )}
                      {l.name}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-mut">
                      {l.number} · {LEAD_SOURCE_LABEL[l.source] ?? l.source}
                      {l.city ? ` · ${l.city}` : ""}
                    </span>
                  </span>
                  <LeadStatusBadge status={l.status} className="shrink-0" />
                </span>
                <span className="mt-2 flex items-center justify-between gap-3 text-[12.5px]">
                  <span className="text-mut">{formatRelative(l.createdAt)}</span>
                  {price && <span className="tabular-nums text-fg/85">{price}</span>}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </>
  );
}
