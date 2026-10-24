"use client";

import Image from "next/image";
import { useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { gallery, styleLabel, type Photo, type Shape, type Style } from "@/lib/gallery";
import { Lightbox } from "./Lightbox";
import { shapeLabel } from "./labels";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const STYLES = Object.keys(styleLabel) as Style[];
// only shapes that actually appear in the gallery get a filter
const SHAPES = (["ravna", "L", "U", "otok"] as Shape[]).filter((s) => gallery.some((p) => p.shape === s));

type Cell = { span: 4 | 5 | 6 | 7; stretch: boolean };

const spanClass: Record<Cell["span"], string> = {
  4: "lg:col-span-4",
  5: "lg:col-span-5",
  6: "lg:col-span-6",
  7: "lg:col-span-7",
};
const sizesFor: Record<Cell["span"], string> = {
  4: "(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw",
  5: "(min-width: 1024px) 42vw, (min-width: 640px) 50vw, 100vw",
  6: "(min-width: 1024px) 50vw, (min-width: 640px) 50vw, 100vw",
  7: "(min-width: 1024px) 58vw, (min-width: 640px) 50vw, 100vw",
};

/**
 * Editorial rhythm on large screens: rows alternate [7|5] (mirrored every other time) and [4|4|4].
 * The narrower photo in a 7/5 row stretches to the row height, so rows close flush.
 */
function layout(n: number): Cell[] {
  const cells: Cell[] = [];
  let i = 0;
  let row = 0;
  while (i < n) {
    const pair = row % 2 === 0;
    const take = Math.min(pair ? 2 : 3, n - i);
    if (pair) {
      if (take === 2) {
        const flip = Math.floor(row / 2) % 2 === 1;
        const spans: Cell["span"][] = flip ? [5, 7] : [7, 5];
        spans.forEach((s) => cells.push({ span: s, stretch: s === 5 }));
      } else cells.push({ span: 7, stretch: false });
    } else if (take === 3) {
      cells.push({ span: 4, stretch: false }, { span: 4, stretch: false }, { span: 4, stretch: false });
    } else if (take === 2) {
      cells.push({ span: 6, stretch: false }, { span: 6, stretch: false });
    } else cells.push({ span: 6, stretch: false });
    i += take;
    row++;
  }
  return cells;
}

function Chip({
  active,
  disabled,
  onClick,
  children,
  count,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  count: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[12px] font-medium tracking-wide transition-all duration-300 ease-premium disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? "border-ink bg-ink text-paper" : "border-ink/20 text-ink/80 hover:border-ink/60 hover:text-ink"
      }`}
    >
      {children}
      <span className={`tabular-nums text-[10px] ${active ? "text-paper/70" : "text-ink/60"}`}>{count}</span>
    </button>
  );
}

export function Gallery() {
  const reduce = useReducedMotion();
  const [style, setStyle] = useState<Style | null>(null);
  const [shape, setShape] = useState<Shape | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const thumbs = useRef(new Map<string, HTMLButtonElement>());

  const items = useMemo(
    () => gallery.filter((p) => (!style || p.style === style) && (!shape || p.shape === shape)),
    [style, shape],
  );
  const cells = useMemo(() => layout(items.length), [items.length]);

  const styleCount = (s: Style | null) =>
    gallery.filter((p) => (!s || p.style === s) && (!shape || p.shape === shape)).length;
  const shapeCount = (s: Shape | null) =>
    gallery.filter((p) => (!s || p.shape === s) && (!style || p.style === style)).length;

  const close = useCallback(() => {
    const src = open !== null ? items[open]?.src : undefined;
    setOpen(null);
    // hand focus back to the photo that was being viewed
    if (src) requestAnimationFrame(() => thumbs.current.get(src)?.focus());
  }, [open, items]);

  const reset = () => {
    setStyle(null);
    setShape(null);
  };

  const filterKey = `${style ?? "sve"}-${shape ?? "svi"}`;

  return (
    <div>
      {/* filters */}
      <div className="flex flex-col gap-6 border-y border-ink/15 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-10">
          <div role="group" aria-label="Filtriraj po stilu" className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-2 w-14 text-mut-paper">Stil</span>
            <Chip active={!style} onClick={() => setStyle(null)} count={styleCount(null)}>
              Svi
            </Chip>
            {STYLES.map((s) => {
              const c = styleCount(s);
              return (
                <Chip key={s} active={style === s} disabled={c === 0 && style !== s} onClick={() => setStyle(style === s ? null : s)} count={c}>
                  {styleLabel[s]}
                </Chip>
              );
            })}
          </div>
          <div role="group" aria-label="Filtriraj po obliku" className="flex flex-wrap items-center gap-2">
            <span className="eyebrow mr-2 w-14 text-mut-paper">Oblik</span>
            <Chip active={!shape} onClick={() => setShape(null)} count={shapeCount(null)}>
              Svi
            </Chip>
            {SHAPES.map((s) => {
              const c = shapeCount(s);
              return (
                <Chip key={s} active={shape === s} disabled={c === 0 && shape !== s} onClick={() => setShape(shape === s ? null : s)} count={c}>
                  {shapeLabel[s]}
                </Chip>
              );
            })}
          </div>
        </div>
        <p className="text-[13px] text-ink/60" aria-live="polite">
          Prikazano <span className="tabular-nums text-ink">{items.length}</span> od {gallery.length} fotografija
        </p>
      </div>

      {/* grid */}
      <AnimatePresence mode="wait" initial={false}>
        <motion.ul
          key={filterKey}
          className="mt-10 grid grid-cols-1 gap-x-3 gap-y-8 sm:grid-cols-2 lg:mt-14 lg:grid-cols-12 lg:gap-x-4 lg:gap-y-10"
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduce ? undefined : { opacity: 0, y: -10, transition: { duration: 0.25, ease: EASE } }}
          transition={{ duration: 0.5, ease: EASE }}
        >
          {items.map((p: Photo, i) => {
            const cell = cells[i];
            return (
              <li key={p.src} className={`col-span-1 ${spanClass[cell.span]}`}>
                <figure className="flex h-full flex-col">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) thumbs.current.set(p.src, el);
                      else thumbs.current.delete(p.src);
                    }}
                    onClick={() => setOpen(i)}
                    aria-label={`Otvori fotografiju: ${p.title}`}
                    className={`group relative block aspect-[4/3] w-full overflow-hidden bg-paper-dark ${
                      cell.stretch ? "lg:aspect-auto lg:flex-1" : ""
                    }`}
                  >
                    <Image
                      src={p.src}
                      alt={p.title}
                      fill
                      sizes={sizesFor[cell.span]}
                      loading={i < 2 ? "eager" : "lazy"}
                      className="object-cover transition-transform duration-[1400ms] ease-premium group-hover:scale-[1.035]"
                    />
                    <span
                      aria-hidden
                      className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-ink/55 text-fg opacity-0 backdrop-blur-md transition-all duration-500 ease-premium group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M8.5 1H13v4.5M13 1 8 6M5.5 13H1V8.5M1 13l5-5" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </span>
                  </button>
                  <figcaption className="mt-3.5 flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-ink/80">{p.title}</span>
                    <span className="eyebrow shrink-0 text-mut-paper">
                      {styleLabel[p.style]}
                      {p.shape ? ` · ${shapeLabel[p.shape]}` : ""}
                    </span>
                  </figcaption>
                </figure>
              </li>
            );
          })}
        </motion.ul>
      </AnimatePresence>

      {items.length === 0 && (
        <div className="mt-10 border border-dashed border-ink/25 p-10 text-center">
          <p className="font-display text-2xl font-medium">Nema fotografija za ovaj odabir.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 text-[13px] font-semibold underline decoration-1 underline-offset-4 hover:text-accent-deep"
          >
            Poništi filtre
          </button>
        </div>
      )}

      <AnimatePresence>
        {open !== null && items[open] && (
          <Lightbox key="lightbox" items={items} index={open} onIndex={setOpen} onClose={close} />
        )}
      </AnimatePresence>
    </div>
  );
}
