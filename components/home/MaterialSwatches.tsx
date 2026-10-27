"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { MaterialDef } from "@/lib/studio/catalog";
import { isSolid, paintSwatches, type SwatchJob, type SwatchTexture } from "./swatchTexture";
import s from "./home.module.css";

export interface SwatchItem {
  id: string;
  group: "front" | "top";
  name: string;
  /** catalogue CSS swatch — shown immediately, the painted texture fades in over it */
  swatch: string;
  render: MaterialDef["render"];
  href: string;
}

/** how glossy a finish looks, from its render parameters (drives the soft highlight) */
function gloss(r: MaterialDef["render"]) {
  return Math.min(1, Math.max(0, (1 - r.roughness) * 0.8 + (r.clearcoat ?? 0) * 0.45));
}

/**
 * Material samples on light: rounded tiles, the catalogue swatch at once and a procedurally painted texture fading in
 * over it (painted in a worker shortly before the section scrolls in). A soft light follows the pointer.
 * Every tile opens the 3D studio with that material preselected.
 */
export function MaterialSwatches({ fronts, tops }: { fronts: SwatchItem[]; tops: SwatchItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const urlsRef = useRef<string[]>([]);
  const [tex, setTex] = useState<Record<string, SwatchTexture>>({});

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    let stopPainting: (() => void) | null = null;
    const size = window.matchMedia("(min-width: 1024px)").matches ? 768 : 512;
    const jobs: SwatchJob[] = [...fronts, ...tops]
      .filter((m) => !isSolid(m.render))
      .map((m) => ({ id: `${m.group}-${m.id}`, render: m.render, size, horizontal: m.group === "top" }));

    const io = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        io.disconnect();
        stopPainting = paintSwatches(jobs, (id, t) => {
          if (cancelled) {
            URL.revokeObjectURL(t.url);
            return;
          }
          urlsRef.current.push(t.url);
          setTex((prev) => ({ ...prev, [id]: t }));
        });
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(root);

    const urls = urlsRef.current;
    return () => {
      cancelled = true;
      io.disconnect();
      stopPainting?.();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.length = 0;
    };
  }, [fronts, tops]);

  return (
    <div ref={rootRef} className="space-y-10">
      <SwatchGroup title="Fronte" items={fronts} tex={tex} className="grid-cols-3 lg:grid-cols-6" tile="aspect-[0.82]" />
      <SwatchGroup title="Radne ploče" items={tops} tex={tex} className="grid-cols-2 lg:grid-cols-4" tile="aspect-[1.55]" />
    </div>
  );
}

function SwatchGroup({
  title,
  items,
  tex,
  className,
  tile,
}: {
  title: string;
  items: SwatchItem[];
  tex: Record<string, SwatchTexture>;
  className: string;
  tile: string;
}) {
  return (
    <div>
      <h3 className="mb-4 flex items-baseline gap-2 text-[13px] font-medium text-graphite">
        {title}
        <span className="tabular-nums text-taupe">{items.length}</span>
      </h3>
      <ul className={`grid gap-2.5 sm:gap-3 ${className}`}>
        {items.map((m) => (
          <li key={m.id}>
            <Swatch item={m} texture={tex[`${m.group}-${m.id}`]} className={tile} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Swatch({ item, texture, className }: { item: SwatchItem; texture?: SwatchTexture; className: string }) {
  const g = gloss(item.render);
  const sheenA = 0.06 + g * 0.3;
  const sheenR = 70 - g * 30;

  const onMove = (e: PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    e.currentTarget.style.setProperty("--lx", `${(((e.clientX - r.left) / r.width) * 100).toFixed(1)}%`);
    e.currentTarget.style.setProperty("--ly", `${(((e.clientY - r.top) / r.height) * 100).toFixed(1)}%`);
  };
  const onLeave = (e: PointerEvent<HTMLAnchorElement>) => {
    e.currentTarget.style.removeProperty("--lx");
    e.currentTarget.style.removeProperty("--ly");
  };

  const label = item.group === "front" ? `${item.name}: otvori 3D studio s ovom frontom` : `${item.name}: otvori 3D studio s ovom radnom pločom`;

  return (
    <Link
      href={item.href}
      aria-label={label}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`group relative block w-full overflow-hidden rounded-[14px] border border-hairline transition-[transform,box-shadow] duration-500 ease-premium hover:-translate-y-0.5 hover:shadow-[0_18px_40px_-18px_rgba(60,48,30,.35)] ${s.swatch} ${className}`}
      style={{ background: item.swatch } as CSSProperties}
    >
      {/* painted texture */}
      <span
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-1000 ease-premium ${texture ? "opacity-100" : "opacity-0"}`}
        style={texture ? { backgroundImage: `url(${texture.url})`, backgroundSize: texture.size, backgroundPosition: "center" } : undefined}
      />
      {/* soft light that follows the pointer, stronger on glossy finishes */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at var(--lx, 28%) var(--ly, 18%), rgba(255,255,255,${sheenA.toFixed(3)}) 0%, rgba(255,255,255,0) ${sheenR.toFixed(0)}%)`,
        }}
      />
      <span aria-hidden className="absolute inset-0 shadow-[inset_0_1px_0_rgba(255,255,255,.22),inset_0_-1px_0_rgba(0,0,0,.08)]" />

      <span className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between gap-2 sm:bottom-3 sm:left-3 sm:right-3">
        {/* phones: three narrow tiles a row, so a long name wraps onto a second line instead of being cut off */}
        <span className="max-w-full rounded-[10px] bg-white/[0.9] px-2 py-1 text-[11px] leading-tight text-graphite sm:truncate sm:rounded-full sm:px-3 sm:text-[12px] sm:leading-normal">
          {item.name}
        </span>
        <span
          aria-hidden
          className="hidden h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.9] text-graphite opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100 lg:flex"
        >
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
            <path d="M1 7h12m0 0L7.5 1.5M13 7l-5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </span>
    </Link>
  );
}
