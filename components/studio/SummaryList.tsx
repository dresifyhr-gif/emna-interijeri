/** The summarize() lines as a quiet two-column list ("Zid A (stražnji)" · "380 cm"). */
export function SummaryList({ lines, className = "" }: { lines: string[]; className?: string }) {
  return (
    <dl className={`divide-y divide-white/[0.07] text-[12.5px] leading-snug ${className}`}>
      {lines.map((line, i) => {
        const k = line.indexOf(": ");
        const key = k > 0 ? line.slice(0, k) : "";
        const val = k > 0 ? line.slice(k + 2) : line;
        const note = key === "Napomena";
        return (
          <div key={`${i}-${line}`} className="grid grid-cols-[minmax(0,42%)_1fr] gap-3 py-2">
            <dt className={note ? "text-accent" : "text-mut"}>{key || "·"}</dt>
            <dd className={note ? "text-fg/85" : "text-fg"}>{val}</dd>
          </div>
        );
      })}
    </dl>
  );
}
