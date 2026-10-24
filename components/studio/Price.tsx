"use client";

import { useReducedMotion } from "framer-motion";
import * as catalog from "@/lib/studio/catalog";
import { Fill } from "@/components/site/Fill";
import { useTicker } from "./hooks";
import { eur } from "./meta";

/**
 * Has the owner confirmed the catalogue's rates (lib/studio/catalog.ts `PRICES_CONFIRMED`)? Read defensively: until the
 * flag exists and is `true`, the prices count as unconfirmed. Production shows nothing extra either way (the range is
 * always labelled "okvirno"); development marks it so it can't slip through to launch unnoticed.
 */
const PRICES_CONFIRMED = Reflect.get(catalog, "PRICES_CONFIRMED") === true;

/** Always-visible rough price: "od 11.200 € do 13.200 €", counting smoothly to every new estimate. */
export function PriceBlock({
  price,
  compact = false,
  className = "",
}: {
  price: { low: number; high: number };
  compact?: boolean;
  className?: string;
}) {
  const reduce = Boolean(useReducedMotion());
  const lowRef = useTicker(price.low, reduce);
  const highRef = useTicker(price.high, reduce);

  return (
    <div className={className}>
      {!compact && (
        <p className="eyebrow text-mut" aria-hidden="true">
          Okvirna cijena
        </p>
      )}
      <p className="sr-only">
        Okvirna cijena od {eur(price.low)} € do {eur(price.high)} €
      </p>
      <p
        aria-hidden="true"
        className={`whitespace-nowrap font-display font-medium tabular-nums tracking-tight text-fg ${
          compact ? "text-[14px] min-[400px]:text-[15.5px]" : "mt-2 text-[23px]"
        }`}
      >
        <span className={`font-sans font-normal text-mut ${compact ? "mr-1 text-[11px]" : "mr-1.5 text-[13px]"}`}>od</span>
        <span ref={lowRef} /> €
        <span className={`font-sans font-normal text-mut ${compact ? "mx-1 text-[11px]" : "mx-2 text-[13px]"}`}>do</span>
        <span ref={highRef} /> €
      </p>
      <p className={`text-mut ${compact ? "mt-0.5 text-[10.5px] leading-tight" : "mt-1.5 text-[11.5px] leading-snug"}`}>
        okvirno · bez kućanskih aparata · točna ponuda nakon izmjere
      </p>
      {!PRICES_CONFIRMED && <Fill value={null} label="potvrda cijena u catalog.ts" className="mt-1.5" />}
    </div>
  );
}
