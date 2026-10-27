"use client";

import Image from "next/image";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { kitchenCount, photoCount, projects, styleLabel, type Project, type Shape, type Style } from "@/lib/gallery";
import { Lightbox } from "./Lightbox";
import { shapeLabel } from "./labels";

const EASE = [0.2, 0.8, 0.2, 1] as const;
const STYLES = Object.keys(styleLabel) as Style[];
// only shapes that actually appear in the gallery get a filter
const SHAPES = (["ravna", "L", "U", "otok"] as Shape[]).filter((s) => projects.some((p) => p.shape === s));

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
      className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[13px] font-medium transition-colors duration-300 ease-premium disabled:cursor-not-allowed disabled:opacity-35 ${
        active ? "border-graphite bg-graphite text-white" : "border-hairline bg-card text-graphite/80 hover:border-graphite/40 hover:text-graphite"
      }`}
    >
      {children}
      <span className={`tabular-nums text-[11px] ${active ? "text-white/70" : "text-taupe"}`}>{count}</span>
    </button>
  );
}

const kitchenFromHash = () => {
  const id = decodeURIComponent(window.location.hash.slice(1));
  return projects.some((p) => p.id === id) ? id : null;
};

/** One card per kitchen (its cover photo and how many photos it has); the lightbox browses that kitchen's photos. */
export function Gallery() {
  const reduce = useReducedMotion();
  const [style, setStyle] = useState<Style | null>(null);
  const [shape, setShape] = useState<Shape | null>(null);
  const [open, setOpen] = useState<{ id: string; index: number } | null>(null);
  const thumbs = useRef(new Map<string, HTMLButtonElement>());

  const items = useMemo(
    () => projects.filter((p) => (!style || p.style === style) && (!shape || p.shape === shape)),
    [style, shape],
  );
  const cells = useMemo(() => layout(items.length), [items.length]);
  const openProject: Project | undefined = open ? projects.find((p) => p.id === open.id) : undefined;

  const styleCount = (s: Style | null) =>
    projects.filter((p) => (!s || p.style === s) && (!shape || p.shape === shape)).length;
  const shapeCount = (s: Shape | null) =>
    projects.filter((p) => (!s || p.shape === s) && (!style || p.style === style)).length;

  // "/radovi#<kuhinja>" (the homepage tiles) opens that kitchen; after the first paint, so the server HTML stays the same
  useEffect(() => {
    const fromHash = () => {
      const id = kitchenFromHash();
      if (id) setOpen({ id, index: 0 });
    };
    const raf = requestAnimationFrame(fromHash);
    window.addEventListener("hashchange", fromHash);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", fromHash);
    };
  }, []);

  const close = useCallback(() => {
    const id = open?.id;
    setOpen(null);
    // a reload should not reopen the kitchen the visitor just closed
    if (id && kitchenFromHash() === id) history.replaceState(history.state, "", window.location.pathname + window.location.search);
    // hand focus back to the kitchen that was being viewed
    if (id) requestAnimationFrame(() => thumbs.current.get(id)?.focus());
  }, [open]);

  const reset = () => {
    setStyle(null);
    setShape(null);
  };

  const filterKey = `${style ?? "sve"}-${shape ?? "svi"}`;

  return (
    <div>
      {/* filters */}
      <div className="flex flex-col gap-6 border-y border-hairline py-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-5 sm:flex-row sm:flex-wrap sm:gap-10">
          <div role="group" aria-label="Filtriraj po stilu" className="flex flex-wrap items-center gap-2">
            <span className="mr-2 w-14 text-[13px] text-taupe">Stil</span>
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
            <span className="mr-2 w-14 text-[13px] text-taupe">Oblik</span>
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
        <p className="text-[13px] text-taupe lg:shrink-0" aria-live="polite">
          Prikazano <span className="tabular-nums text-graphite">{items.length}</span> od {kitchenCount(projects.length)}
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
          {items.map((p, i) => {
            const cell = cells[i];
            const n = p.photos.length;
            return (
              <li key={p.id} id={p.id} className={`col-span-1 scroll-mt-28 ${spanClass[cell.span]}`}>
                <figure className="flex h-full flex-col">
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) thumbs.current.set(p.id, el);
                      else thumbs.current.delete(p.id);
                    }}
                    onClick={() => setOpen({ id: p.id, index: 0 })}
                    aria-label={`Otvori kuhinju: ${p.title}${n > 1 ? `, ${photoCount(n)}` : ""}`}
                    className={`group relative block aspect-[4/3] w-full overflow-hidden rounded-[18px] bg-hairline ${
                      cell.stretch ? "lg:aspect-auto lg:flex-1" : ""
                    }`}
                  >
                    <Image
                      src={p.cover.src}
                      alt={p.title}
                      fill
                      sizes={sizesFor[cell.span]}
                      loading={i < 2 ? "eager" : "lazy"}
                      className="object-cover transition-transform duration-[1400ms] ease-premium group-hover:scale-[1.035]"
                    />
                    {n > 1 && (
                      <span
                        aria-hidden
                        className="absolute bottom-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/[0.88] px-3 py-1.5 text-[11.5px] font-medium text-graphite backdrop-blur-md sm:bottom-3.5 sm:left-3.5 sm:text-[12px]"
                      >
                        <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-taupe">
                          <path d="M3.5 3.5V1.5h9v8h-2M1.5 4.5h9v8h-9Z" stroke="currentColor" strokeWidth="1.2" />
                        </svg>
                        {photoCount(n)}
                      </span>
                    )}
                    <span
                      aria-hidden
                      className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/[0.88] text-graphite opacity-0 backdrop-blur-md transition-opacity duration-500 ease-premium group-hover:opacity-100 group-focus-visible:opacity-100"
                    >
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M8.5 1H13v4.5M13 1 8 6M5.5 13H1V8.5M1 13l5-5" stroke="currentColor" strokeWidth="1.3" />
                      </svg>
                    </span>
                  </button>
                  <figcaption className="mt-3.5 flex items-baseline justify-between gap-4">
                    <span className="text-[14px] text-graphite">{p.title}</span>
                    <span className="shrink-0 text-[12.5px] text-taupe">
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
        <div className="mt-10 rounded-[20px] border border-dashed border-graphite/20 p-10 text-center">
          <p className="heading text-2xl tracking-head-sm">Nema kuhinja za ovaj odabir.</p>
          <button
            type="button"
            onClick={reset}
            className="mt-5 text-[13.5px] font-medium underline decoration-graphite/30 decoration-1 underline-offset-4 hover:decoration-graphite"
          >
            Poništi filtre
          </button>
        </div>
      )}

      <AnimatePresence>
        {open && openProject && (
          <Lightbox
            key="lightbox"
            project={openProject}
            index={open.index}
            onIndex={(index) => setOpen({ id: openProject.id, index })}
            onClose={close}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
