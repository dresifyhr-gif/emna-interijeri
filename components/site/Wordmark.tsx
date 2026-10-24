import Link from "next/link";

export function Wordmark({ sub = true, className = "" }: { sub?: boolean; className?: string }) {
  return (
    <Link href="/" aria-label="EMNA Interijeri — naslovnica" className={`group inline-flex flex-col leading-none ${className}`}>
      <span className="font-display text-[19px] font-medium tracking-[0.42em] transition-opacity group-hover:opacity-80">
        EMNA
      </span>
      {sub && <span className="mt-1 text-[8.5px] font-medium uppercase tracking-[0.5em] opacity-60">Interijeri</span>}
    </Link>
  );
}
