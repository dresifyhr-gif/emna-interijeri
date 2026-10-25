import type { ComponentProps, ReactNode } from "react";
import { cx } from "./cx";

/**
 * Data table. Scrolls horizontally on narrow screens instead of squashing columns.
 *
 *   <Table caption="Zadnji upiti">
 *     <THead><TR><TH>Broj</TH><TH align="right">Cijena</TH></TR></THead>
 *     <TBody><TR><TD>U-2026-0001</TD><TD align="right">…</TD></TR></TBody>
 *   </Table>
 *
 * For a clickable row, put a <Link> in the first cell with `className={rowLinkClass}`;
 * it stretches over the whole row (TR is `relative`).
 */

type Align = "left" | "center" | "right";
const alignClass: Record<Align, string> = { left: "text-left", center: "text-center", right: "text-right" };

export function Table({
  caption,
  minWidth = 640,
  className,
  children,
}: {
  /** read by screen readers (visually hidden) */
  caption?: string;
  minWidth?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cx("overflow-x-auto rounded-xl border border-white/[0.07] bg-ink-700/40", className)}>
      <table className="w-full border-collapse text-left text-[13.5px]" style={{ minWidth }}>
        {caption && <caption className="sr-only">{caption}</caption>}
        {children}
      </table>
    </div>
  );
}

export function THead({ children }: { children: ReactNode }) {
  return <thead className="border-b border-white/[0.07] bg-white/[0.02]">{children}</thead>;
}

export function TBody({ children }: { children: ReactNode }) {
  return <tbody className="divide-y divide-white/[0.05]">{children}</tbody>;
}

export function TR({ className, interactive = false, ...rest }: ComponentProps<"tr"> & { interactive?: boolean }) {
  return (
    <tr
      className={cx(
        "relative",
        interactive && "transition-colors duration-150 hover:bg-white/[0.025] focus-within:bg-white/[0.035]",
        className,
      )}
      {...rest}
    />
  );
}

export function TH({ align = "left", className, ...rest }: ComponentProps<"th"> & { align?: Align }) {
  return (
    <th
      scope="col"
      className={cx(
        "whitespace-nowrap px-4 py-3 text-[10.5px] font-medium uppercase tracking-[0.18em] text-mut",
        alignClass[align],
        className,
      )}
      {...rest}
    />
  );
}

export function TD({
  align = "left",
  muted = false,
  nowrap = false,
  className,
  ...rest
}: ComponentProps<"td"> & { align?: Align; muted?: boolean; nowrap?: boolean }) {
  return (
    <td
      className={cx(
        "px-4 py-3.5 align-middle",
        muted ? "text-mut" : "text-fg/90",
        nowrap && "whitespace-nowrap",
        alignClass[align],
        className,
      )}
      {...rest}
    />
  );
}

/** link in the first cell that makes the whole row clickable */
export const rowLinkClass =
  "font-medium text-fg outline-none after:absolute after:inset-0 after:content-[''] hover:text-accent focus-visible:text-accent focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:-outline-offset-2 focus-visible:after:outline-accent";
