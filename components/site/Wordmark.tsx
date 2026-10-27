import Link from "next/link";

/** The accessible name starts with the visible words ("EMNA Interijeri — naslovnica"), so voice control can say "EMNA". */
export function Wordmark({ sub = true, className = "" }: { sub?: boolean; className?: string }) {
  return (
    <Link href="/" className={`group inline-flex flex-col leading-none ${className}`}>
      <span className="font-head text-[19px] font-medium tracking-[0.42em] transition-opacity group-hover:opacity-80">
        EMNA
      </span>
      {/* 70 %: 6.2:1 on the warm white, the small caps need 4.5:1 */}
      {sub && <span className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.5em] opacity-70">Interijeri</span>}
      <span className="sr-only"> — naslovnica</span>
    </Link>
  );
}
