"use client";

/**
 * The room around the kitchen: wall paints and wall finishes (brick, microcement, tiles) and floors, from
 * catalog.room — only for the look in 3D, never part of the kitchen or its price.
 *
 *   RoomSwatches   a radio group of round (walls) or square (floors) samples, with the chosen one's name
 *   SurfacePicker  the small popover that opens where the customer clicked a wall or the floor in 3D (engine
 *                  onSurfaceClick): "Zid B" / "Pod", the samples, and "Primijeni na sve zidove"
 *
 * Every pick goes through lib/studio/edit.ts setRoomFinish (one wall, every wall, the floor) as an undo step; trying
 * several samples in a row is one step.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { catalog } from "@/lib/studio/catalog";
import { roomFinishes, setRoomFinish, type EditResult } from "@/lib/studio/edit";
import type { KitchenConfig, SurfaceHit, WallId } from "@/lib/studio/types";
import { RadioGrid } from "./controls";
import { CheckIcon, CloseIcon } from "./icons";
import { WALL_HINT, clamp, roomWallIds } from "./meta";
import { areaOf, type Insets } from "./overlay";
import s from "./studio.module.css";

interface Swatch {
  id: string;
  name: string;
  swatch: string;
}

export const WALL_PAINTS: Swatch[] = catalog.room.walls.filter((w) => !w.render);
export const WALL_FINISHES: Swatch[] = catalog.room.walls.filter((w) => Boolean(w.render));
export const FLOORS: Swatch[] = catalog.room.floors;

export function RoomSwatches({
  label,
  items,
  value,
  onChange,
  square = false,
  dense = false,
}: {
  label: string;
  items: Swatch[];
  value: string;
  onChange: (id: string) => void;
  /** floors: square samples (a pattern reads better on a tile) */
  square?: boolean;
  /** the popover: smaller samples, more per row */
  dense?: boolean;
}) {
  const size = dense ? "h-8 w-8" : "h-10 w-10";
  return (
    <RadioGrid
      label={label}
      items={items}
      value={value}
      onChange={onChange}
      itemLabel={(it) => it.name}
      className={`flex flex-wrap ${dense ? "gap-1.5" : "gap-2"}`}
      itemClassName={() => `group relative rounded-full p-[3px] outline-none ${square ? "rounded-[10px]" : ""}`}
    >
      {(it, on) => (
        <>
          <span
            aria-hidden="true"
            title={it.name}
            className={`relative block ${size} overflow-hidden ring-1 ring-inset transition-[box-shadow,transform] duration-300 ease-premium group-hover:-translate-y-px group-focus-visible:ring-2 group-focus-visible:ring-accent ${
              square ? "rounded-[8px]" : "rounded-full"
            } ${on ? "ring-accent shadow-[0_0_0_2px_#0B0B0C,0_0_0_3.5px_#C9B99A]" : "ring-white/15"}`}
            style={{ background: it.swatch }}
          >
            <span className={`absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,.18),transparent_50%,rgba(0,0,0,.2))] ${square ? "" : "rounded-full"}`} />
            {on && (
              <span className="absolute inset-0 flex items-center justify-center">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-ink/70 text-accent">
                  <CheckIcon className="h-2.5 w-2.5" />
                </span>
              </span>
            )}
          </span>
        </>
      )}
    </RadioGrid>
  );
}

const nameOf = (id: string) => catalog.room.walls.find((w) => w.id === id)?.name ?? catalog.room.floors.find((f) => f.id === id)?.name ?? "";

export interface SurfaceTarget {
  hit: SurfaceHit;
  /** changes on every open */
  n: number;
}

export function SurfacePicker({
  cfg,
  target,
  docked,
  insetsRef,
  onEdit,
  onClose,
}: {
  cfg: KitchenConfig;
  target: SurfaceTarget;
  docked: boolean;
  insetsRef: RefObject<Insets>;
  /** apply a setRoomFinish result; `coalesce`: picks in a row share one undo step */
  onEdit: (r: EditResult, say: string, coalesce: string) => void;
  onClose: (refocus: boolean) => void;
}) {
  const uid = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { hit } = target;
  // (the bare room walls too — an L kitchen in a closed room: its third wall is painted like the others)
  const walls = roomWallIds(cfg);
  const wall: WallId | null = hit.surface === "wall" && hit.wall ? hit.wall : null;
  const f = roomFinishes(cfg);
  const value = wall ? f.walls[wall] : f.floor;
  const [shownName, setShownName] = useState<string | null>(null);
  const others = wall ? walls.filter((w) => w !== wall && f.walls[w] !== value) : [];
  const title = wall ? `Zid ${wall.toUpperCase()}` : "Pod";

  // placed once, next to where the customer clicked (it does not follow an orbit: a press on the 3D view closes it)
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root || docked) return;
    const ins = insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const host = root.offsetParent as HTMLElement | null;
    const size = { w: host?.clientWidth ?? window.innerWidth, h: host?.clientHeight ?? window.innerHeight };
    const A = areaOf(size, ins, 10);
    const w = root.offsetWidth;
    const h = root.offsetHeight;
    const { x: cx, y: cy } = hit.screen;
    const x = cx + 14 + w <= A.x1 ? cx + 14 : cx - 14 - w;
    const y = cy - 24;
    root.style.transform = `translate3d(${Math.round(clamp(x, A.x0, Math.max(A.x0, A.x1 - w)))}px, ${Math.round(clamp(y, A.y0, Math.max(A.y0, A.y1 - h)))}px, 0)`;
  }, [hit.screen, docked, insetsRef, target.n]);

  // focus the current sample
  useEffect(() => {
    const el = rootRef.current?.querySelector<HTMLElement>('[role=radio][aria-checked="true"]') ?? rootRef.current?.querySelector<HTMLElement>("[role=radio]");
    el?.focus({ preventScroll: true });
  }, [target.n]);

  // a press anywhere else closes it
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && rootRef.current?.contains(t)) return;
      onClose(false);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [onClose]);

  const pickWall = (id: string) => {
    if (!wall) return;
    onEdit(setRoomFinish(cfg, { wall: walls.length > 1 ? wall : "all", finish: id }), `${title}: ${nameOf(id)}.`, `room-wall-${wall}`);
  };
  const pickFloor = (id: string) => onEdit(setRoomFinish(cfg, { floor: id }), `Pod: ${nameOf(id)}.`, "room-floor");
  const toAll = () => onEdit(setRoomFinish(cfg, { wall: "all", finish: value }), `Svi zidovi: ${nameOf(value)}.`, "room-wall-all");

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      onClose(true);
    }
  };

  return (
    <div
      ref={rootRef}
      className={s.surf}
      data-docked={docked || undefined}
      role="dialog"
      aria-labelledby={`${uid}-t`}
      onKeyDown={onKeyDown}
      onPointerOver={(e) => {
        const r = (e.target as HTMLElement).closest?.("[role=radio]");
        setShownName(r ? r.getAttribute("aria-label") : null);
      }}
      onPointerLeave={() => setShownName(null)}
    >
      <div className={s.dimCard}>
        <div className="flex items-start gap-2 px-4 pt-3.5">
          <p id={`${uid}-t`} className="eyebrow min-w-0 flex-1 text-accent">
            {title}
            {wall && walls.length > 1 && <span className="ml-2 normal-case tracking-normal text-mut">{WALL_HINT[wall]}</span>}
          </p>
          <button
            type="button"
            aria-label="Zatvori"
            onClick={() => onClose(true)}
            className={`-mr-1.5 -mt-1.5 flex shrink-0 items-center justify-center rounded-full text-fg/55 transition-colors duration-300 hover:bg-white/[0.06] hover:text-fg ${docked ? "h-11 w-11" : "h-8 w-8"}`}
          >
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-1 px-4 font-display text-[16px] font-medium leading-tight" aria-live="polite">
          {shownName ?? nameOf(value)}
        </p>
        <div className={`${s.thinScroll} mt-3 max-h-[min(52vh,360px)] overflow-y-auto px-3 pb-1`}>
          {wall ? (
            <>
              <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">Boje</p>
              <RoomSwatches label={`${title}: boja`} items={WALL_PAINTS} value={value} onChange={pickWall} dense />
              <p className="mb-1.5 mt-3 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">Obloge</p>
              <RoomSwatches label={`${title}: obloga`} items={WALL_FINISHES} value={value} onChange={pickWall} dense />
            </>
          ) : (
            <RoomSwatches label="Pod" items={FLOORS} value={value} onChange={pickFloor} square dense />
          )}
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.08] px-4 py-3">
          <p className="text-[11px] leading-snug text-mut">Samo za dojam — ne utječe na cijenu.</p>
          {others.length > 0 && (
            <button
              type="button"
              onClick={toAll}
              className={`rounded-full border border-white/15 px-3.5 text-[12px] font-medium text-fg/85 transition-colors duration-300 hover:border-accent hover:text-accent ${docked ? "h-11" : "h-8"}`}
            >
              Primijeni na sve zidove
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
