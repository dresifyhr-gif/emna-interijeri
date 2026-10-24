"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import type { MaterialDef } from "@/lib/studio/catalog";
import { isSolid, paintSwatch, type SwatchTexture } from "./swatchTexture";
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

/* ------------------------------------------------------------------ appearance helpers (data-driven from catalog.render) */

function luminance(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch((n >> 16) & 255) + 0.7152 * ch((n >> 8) & 255) + 0.0722 * ch(n & 255);
}

function look(r: MaterialDef["render"]) {
  const gloss = Math.min(1, Math.max(0, (1 - r.roughness) * 0.8 + (r.clearcoat ?? 0) * 0.45));
  return {
    light: luminance(r.color) > 0.36,
    gloss,
    coat: (r.clearcoat ?? 0) > 0.3,
  };
}

/* ------------------------------------------------------------------ swatches */

/**
 * Large tactile material samples. Desktop: a row of panels where the hovered / focused one widens
 * (flex-grow) and a soft light follows the pointer; phones: a horizontal snap carousel.
 * Every sample links to the 3D studio with that material preselected.
 */
export function MaterialSwatches({ fronts, tops }: { fronts: SwatchItem[]; tops: SwatchItem[] }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const urlsRef = useRef<string[]>([]);
  const [tex, setTex] = useState<Record<string, SwatchTexture>>({});

  // paint the procedural textures shortly before the section scrolls in, one per idle slot
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    let cancelled = false;
    const queue = [...fronts, ...tops].filter((m) => !isSolid(m.render));
    const big = window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
    const size = big ? 1024 : 640;
    type IdleWindow = Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number };
    const w = window as IdleWindow;
    const later = (fn: () => void) => (w.requestIdleCallback ? w.requestIdleCallback(fn, { timeout: 600 }) : window.setTimeout(fn, 30));

    const next = () => {
      if (cancelled) return;
      const m = queue.shift();
      if (!m) return;
      void paintSwatch(`${m.group}-${m.id}`, m.render, { size, horizontal: m.group === "top" }).then((t) => {
        if (!t) return later(next);
        if (cancelled) {
          URL.revokeObjectURL(t.url);
          return;
        }
        urlsRef.current.push(t.url);
        setTex((prev) => ({ ...prev, [`${m.group}-${m.id}`]: t }));
        later(next);
      });
    };

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          later(next);
        }
      },
      { rootMargin: "900px 0px" },
    );
    io.observe(root);

    const urls = urlsRef.current;
    return () => {
      cancelled = true;
      io.disconnect();
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.length = 0;
    };
  }, [fronts, tops]);

  return (
    <div ref={rootRef} className="space-y-14 lg:space-y-10">
      <SwatchRow title="Fronte" items={fronts} tex={tex} tall />
      <SwatchRow title="Radne ploče" items={tops} tex={tex} />
    </div>
  );
}

function SwatchRow({ title, items, tex, tall = false }: { title: string; items: SwatchItem[]; tex: Record<string, SwatchTexture>; tall?: boolean }) {
  const [active, setActive] = useState(0);
  return (
    <div>
      <div className="mb-5 flex items-baseline justify-between gap-6">
        <h3 className="eyebrow text-fg/80">
          {title} <span className="ml-2 tabular-nums text-mut">{items.length}</span>
        </h3>
        <span className="eyebrow hidden text-mut lg:inline">Pređite mišem · klik otvara studio</span>
        <span className="eyebrow text-mut lg:hidden">Povucite →</span>
      </div>
      <ul
        className={`-mx-4 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:-mx-8 sm:scroll-px-8 sm:px-8 lg:mx-0 lg:snap-none lg:overflow-visible lg:px-0 lg:pb-0 [&::-webkit-scrollbar]:hidden ${
          tall ? "lg:h-[clamp(340px,34vw,500px)]" : "lg:h-[clamp(220px,21vw,320px)]"
        }`}
      >
        {items.map((m, i) => (
          <li
            key={m.id}
            onPointerEnter={(e) => e.pointerType === "mouse" && setActive(i)}
            onFocusCapture={() => setActive(i)}
            className={`relative shrink-0 snap-start lg:h-full lg:min-w-0 lg:shrink lg:basis-0 lg:transition-[flex-grow] lg:duration-[900ms] lg:ease-premium ${
              tall ? "aspect-[4/5] w-[66vw] max-w-[320px] sm:w-[40vw]" : "aspect-[4/3] w-[72vw] max-w-[380px] sm:w-[44vw]"
            } lg:aspect-auto lg:w-auto lg:max-w-none ${i === active ? "lg:grow-[3.4]" : "lg:grow"}`}
          >
            <Swatch item={m} index={i} on={i === active} texture={tex[`${m.group}-${m.id}`]} />
          </li>
        ))}
      </ul>
    </div>
  );
}

function Swatch({ item, index, on, texture }: { item: SwatchItem; index: number; on: boolean; texture?: SwatchTexture }) {
  const { light, gloss, coat } = look(item.render);
  const ink = light ? "text-ink" : "text-fg";
  const sheenA = 0.05 + gloss * 0.32;
  const sheenR = 70 - gloss * 30;

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

  const label = item.group === "front" ? `Otvori 3D studio s frontom ${item.name}` : `Otvori 3D studio s radnom pločom ${item.name}`;

  return (
    <Link
      href={item.href}
      aria-label={label}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`group/sw relative block h-full w-full overflow-hidden rounded-[3px] shadow-[0_30px_60px_-30px_rgba(0,0,0,.8)] ${s.swatch} ${ink}`}
      style={{ background: item.swatch } as CSSProperties}
    >
      {/* painted texture */}
      <span
        aria-hidden
        className={`absolute inset-0 transition-opacity duration-1000 ease-premium ${texture ? "opacity-100" : "opacity-0"}`}
        style={texture ? { backgroundImage: `url(${texture.url})`, backgroundSize: texture.size, backgroundPosition: "center" } : undefined}
      />
      {/* studio light: a soft highlight that follows the pointer, stronger on glossy finishes */}
      <span
        aria-hidden
        className="absolute inset-0"
        style={{
          background: `radial-gradient(circle at var(--lx, 28%) var(--ly, 18%), rgba(255,255,255,${sheenA.toFixed(3)}) 0%, rgba(255,255,255,0) ${sheenR.toFixed(0)}%)`,
        }}
      />
      {coat && (
        <span
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(112deg,transparent_38%,rgba(255,255,255,.16)_46%,transparent_55%)] opacity-70"
        />
      )}
      {/* volume + bevel */}
      <span
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(255,255,255,.05),rgba(0,0,0,.28))] shadow-[inset_0_1px_0_rgba(255,255,255,.18),inset_0_-1px_0_rgba(0,0,0,.4),inset_1px_0_0_rgba(255,255,255,.05)]"
      />
      {!light && <span aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/45 to-transparent" />}

      <span className="absolute left-4 top-4 flex items-center gap-2 sm:left-5 sm:top-5">
        <span className="eyebrow !text-[10px] tabular-nums opacity-70">{String(index + 1).padStart(2, "0")}</span>
      </span>

      <span className="absolute inset-x-0 bottom-0 flex flex-col gap-2 p-4 sm:p-5 lg:p-6">
        <span className="font-display text-[17px] font-medium leading-tight tracking-[-0.01em] sm:text-lg lg:text-[19px]">{item.name}</span>
        <span
          className={`eyebrow flex items-center gap-2 !text-[10px] opacity-80 transition-all duration-700 ease-premium lg:whitespace-nowrap ${
            on ? "lg:translate-y-0 lg:opacity-80" : "lg:translate-y-2 lg:opacity-0"
          }`}
        >
          Isprobaj u studiju
          <svg width="12" height="12" viewBox="0 0 14 14" fill="none" aria-hidden className="transition-transform duration-300 group-hover/sw:translate-x-0.5">
            <path d="M1 7h12m0 0L7.5 1.5M13 7l-5.5 5.5" stroke="currentColor" strokeWidth="1.5" />
          </svg>
        </span>
      </span>
    </Link>
  );
}
