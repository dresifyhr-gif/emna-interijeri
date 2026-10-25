/**
 * The studio's summary lines ("Oblik: kuhinja u obliku slova L", "Zid A (stražnji): 360 cm" …)
 * as a two-column list. A line without "Naziv: " is shown across the full width.
 */
export function SummaryList({ lines }: { lines: readonly string[] }) {
  return (
    <dl className="divide-y divide-white/[0.05] rounded-xl border border-white/[0.07] bg-ink-800/60">
      {lines.map((line, i) => {
        const at = line.indexOf(": ");
        const label = at > 0 && at <= 48 ? line.slice(0, at) : null;
        const value = label ? line.slice(at + 2) : line;
        return (
          <div key={`${i}-${line}`} className="grid gap-x-6 gap-y-0.5 px-4 py-2.5 sm:grid-cols-[minmax(150px,200px)_1fr]">
            {label ? (
              <>
                <dt className="text-[12.5px] text-mut">{label}</dt>
                <dd className="text-[13.5px] text-fg/90">{value}</dd>
              </>
            ) : (
              <>
                <dt className="sr-only">Stavka</dt>
                <dd className="text-[13.5px] text-fg/90 sm:col-span-2">{value}</dd>
              </>
            )}
          </div>
        );
      })}
    </dl>
  );
}
