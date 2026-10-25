"use client";

/**
 * Element editor — opens when a cabinet is clicked in 3D or picked in the "Elementi" list. It takes the place of
 * the control panel (desktop: the right column, phone: the bottom sheet), so the kitchen stays in view.
 *
 * Everything it offers comes from lib/studio/edit.ts (slotEditInfo): the types this slot can become, with the width
 * each would get, the widths of the current type, what fits next to it, and whether it can move or go. Every edit
 * is a pure function of the config; <Studio> applies the result, follows the element to its new id and keeps an
 * undo step.
 *
 * A base cabinet or wall unit of a wall run can become a tall unit ("Visoki element umjesto ovoga" — it takes the place
 * of both; when that takes another element away, one short line asks first, tallSwap.ts) and gets tall units beside
 * it under "Dodaj lijevo / desno"; a tall unit standing in the run can become a base cabinet again.
 *
 * "Left" and "right" are always the left and right of the drawing at the top (the island is mirrored so this
 * matches the default 3D view, see meta.isFlipped).
 */
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import {
  changeType,
  changeWidth,
  insertAfter,
  insertBefore,
  moveLeft,
  moveRight,
  moveTall,
  remove,
  slotEditInfo,
  tallPlaces,
  type EditResult,
  type SlotEditInfo,
  type TypeChoice,
} from "@/lib/studio/edit";
import { isTallList, parseRunEnd, planKitchen, type KitchenPlan, type PlanSlot, type TallListId } from "@/lib/studio/plan";
import type { KitchenConfig } from "@/lib/studio/types";
import { gridIndex } from "./controls";
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  ChevronLeft,
  ChevronRight,
  CloseIcon,
  InsertIcon,
  ModuleGlyph,
  NoteIcon,
  PlayIcon,
  ResetIcon,
  TrashIcon,
  UndoIcon,
} from "./icons";
import { ChipRadio } from "./controls";
import { EASE, isFlipped, isInRunTall, islandOf, noRoomText, rowOf, rowSlots, runName, sideHint, slotPlace, wallEndName } from "./meta";
import { AddPicker, addItems, type AddItem } from "./AddPicker";
import { keepAbove, moveFocus } from "./overlay";
import { PriceBlock } from "./Price";
import { RunElevation } from "./RunElevation";
import s from "./studio.module.css";
import { baseChoices, tallSwap } from "./tallSwap";

export interface EditNote {
  text: string;
  /** refused = the edit did not happen; info = it happened, with a consequence worth saying */
  tone: "refused" | "info";
  /** changes on every note, so the same text is announced again */
  n: number;
}

export interface ApplyOptions {
  /** element to follow after the edit (default: EditResult.slotId) */
  select?: string | null;
  /** what to announce (Croatian) when the edit worked */
  say?: string;
  /**
   * say it in a toast over the 3D view with "Poništi" instead (edits made on the kitchen itself: the element toolbar,
   * the wall labels); the edit's own warning is appended
   */
  toast?: string;
  /** the step that made the edit shows its notes itself (heights in "Zidovi"): no toast, no editor note */
  quiet?: boolean;
  /**
   * edits of one continuous control (a slider, − / + held, arrows through chips) share one undo step while they
   * follow each other quickly: "Poništi" goes back to before the gesture, not one centimetre
   */
  coalesce?: string;
}

export interface ElementEditorProps {
  cfg: KitchenConfig;
  plan: KitchenPlan;
  slotId: string;
  /** slotEditInfo(cfg, slotId) when the caller has it already (shared with the element toolbar) */
  info?: SlotEditInfo | null;
  desktop: boolean;
  /** the 3D view is there (mechanism demo) */
  engine: boolean;
  note: EditNote | null;
  /** a new non-zero value moves focus to the editor's title (opened from the list); 0 = leave focus alone */
  focusKey: number;
  price: { low: number; high: number };
  onEdit: (r: EditResult, opts?: ApplyOptions) => boolean;
  onNavigate: (slotId: string) => void;
  /** the pointer is over a cabinet of the drawing: light it up in 3D (null: none) */
  onHover?: (slotId: string | null) => void;
  onDemo: () => void;
  onResetRun: (slot: PlanSlot) => void;
  onUndo: (() => void) | null;
  onClose: () => void;
}

type Side = "left" | "right";

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export function ElementEditor({
  cfg,
  plan,
  slotId,
  info: shared,
  desktop,
  engine,
  note,
  focusKey,
  price,
  onEdit,
  onNavigate,
  onHover,
  onDemo,
  onResetRun,
  onUndo,
  onClose,
}: ElementEditorProps) {
  const reduce = Boolean(useReducedMotion());
  const titleRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const addRef = useRef<HTMLDivElement>(null);
  // "add an element" picker, open for one element only (an edit or another element closes it)
  const [adding, setAdding] = useState<{ id: string; side: Side } | null>(null);
  const addSide = adding && adding.id === slotId ? adding.side : null;
  /** a tall unit picked that takes another element away: the question waiting for its one click */
  const [ask, setAsk] = useState<{ id: string; cfg: KitchenConfig; type: string; text: string; essentials: string[] } | null>(null);
  const asking = ask && ask.id === slotId && ask.cfg === cfg ? ask : null;
  const askRef = useRef<HTMLButtonElement>(null);
  const askingType = asking?.type ?? null;

  const own = useMemo(() => (shared !== undefined ? null : slotEditInfo(cfg, slotId)), [shared, cfg, slotId]);
  const info = shared !== undefined ? (shared && shared.slot.id === slotId ? shared : null) : own;
  // a tall unit standing in a base run: the base cabinets it can become again
  const backTypes = useMemo(() => (info && isInRunTall(info.slot) ? baseChoices(cfg, info.slot) : []), [cfg, info]);

  // the question before a tall unit takes another element away: focus on its "Da, zamijeni" (Enter confirms)
  useEffect(() => {
    if (!askingType) return;
    askRef.current?.focus({ preventScroll: true });
    // the tile it asks about stays in view above the question pinned to the foot of the editor's body
    const bar = askRef.current?.closest<HTMLElement>('[role="group"]') ?? null;
    keepAbove(bar?.parentElement?.querySelector<HTMLElement>("[data-asking]") ?? null, bar);
  }, [askingType]);

  useEffect(() => {
    if (focusKey > 0) titleRef.current?.focus({ preventScroll: true });
  }, [focusKey]);

  // a new element (or the add picker) starts at the top of the editor; the picker with its first tile focused
  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
    if (addSide) addRef.current?.querySelector<HTMLElement>("[data-tile]")?.focus({ preventScroll: true });
  }, [slotId, addSide]);

  // Esc also works when focus fell back to the page (a pressed control went away)
  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && (document.activeElement === document.body || document.activeElement === null)) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  if (!info) return null;
  const slot = info.slot;
  const def = info.def ?? moduleDef(slot.zone, slot.type);
  const name = slot.corner && def && !def.corner ? `Kutni element: ${lower(def.name)}` : (def?.name ?? "Element");
  const spacer = Boolean(def?.spacer);
  const flip = isFlipped(slot.run);
  const inRunTall = isInRunTall(slot);
  const row = rowSlots(plan.slots, slot.run, rowOf(slot).zone);
  const idx = row.findIndex((x) => x.id === slot.id);
  const prev = idx > 0 ? row[idx - 1] : null;
  const next = idx >= 0 && idx < row.length - 1 ? row[idx + 1] : null;
  const titleId = `studio-ed-${slot.id}`;
  const width = Math.round(slot.width);

  /** the four directional actions, mapped to the drawing's left / right */
  const tallZone = (tall?: boolean) => (tall ? ("tall" as const) : undefined);
  const side = {
    left: {
      canMove: flip ? info.canMoveRight : info.canMoveLeft,
      move: () => (flip ? moveRight : moveLeft)(cfg, slot.id),
      options: flip ? info.insertAfter : info.insertBefore,
      /** tall units that can stand there in the base run (insert with zone "tall") */
      tall: flip ? info.insertAfterTall : info.insertBeforeTall,
      insert: (type: string, w?: number, tall?: boolean) => (flip ? insertAfter : insertBefore)(cfg, slot.id, type, w, tallZone(tall)),
    },
    right: {
      canMove: flip ? info.canMoveLeft : info.canMoveRight,
      move: () => (flip ? moveLeft : moveRight)(cfg, slot.id),
      options: flip ? info.insertBefore : info.insertAfter,
      tall: flip ? info.insertBeforeTall : info.insertAfterTall,
      insert: (type: string, w?: number, tall?: boolean) => (flip ? insertBefore : insertAfter)(cfg, slot.id, type, w, tallZone(tall)),
    },
  };
  const canAdd = (sd: Side) => [...side[sd].options, ...side[sd].tall].some((o) => o.width !== null);
  const noRoom = noRoomText(slot, info.free);

  const widthOf = (r: EditResult) => (r.slotId ? planKitchen(r.cfg).slots.find((x) => x.id === r.slotId)?.width : undefined);

  const pickType = (t: TypeChoice) => {
    if (t.current) return;
    const r = changeType(cfg, slot.id, t.id);
    const w = widthOf(r);
    onEdit(r, { say: `Element je sada ${lower(t.name)}${w ? `, ${Math.round(w)} cm` : ""}.` });
  };
  const pickWidth = (w: number) => {
    if (w === width) return;
    onEdit(changeWidth(cfg, slot.id, w), { say: `Širina ${w} cm.` });
  };
  const doMove = (sd: Side) => {
    const r = side[sd].move();
    onEdit(r, { say: `Pomaknuto ${sd === "left" ? "lijevo" : "desno"}.` });
  };
  /** the tall unit in this element's place; when that takes another element away, ask first (a second press confirms) */
  const pickTall = (t: TypeChoice, confirmed = false) => {
    if (t.width === null) {
      setAsk(null);
      refuse(changeType(cfg, slot.id, t.id, "tall").warning ?? `${t.name} ovdje ne stane.`);
      return;
    }
    const sw = tallSwap(cfg, plan, slot, t.id);
    if (!sw.result.ok) {
      setAsk(null);
      refuse(sw.result.warning ?? `${t.name} ovdje ne stane.`);
      return;
    }
    if (sw.ask && !confirmed && askingType !== t.id) {
      setAsk({ id: slot.id, cfg, type: t.id, text: sw.ask, essentials: sw.essentials });
      return;
    }
    setAsk(null);
    const w = widthOf(sw.result);
    // like an edit on the kitchen itself: the toast says what went and offers "Poništi"
    onEdit(sw.result, { toast: `${t.name}${w ? `, ${Math.round(w)} cm` : ""}.` });
  };
  const doInsert = (sd: Side, { t, tall }: AddItem, width?: number) => {
    const r = side[sd].insert(t.id, width, tall);
    const w = widthOf(r);
    if (onEdit(r, { say: `Dodan element ${sd === "left" ? "lijevo" : "desno"}: ${lower(t.name)}${w ? `, ${Math.round(w)} cm` : ""}.` })) {
      setAdding(null);
      titleRef.current?.focus({ preventScroll: true });
    }
  };
  const doRemove = () => {
    const r = remove(cfg, slot.id);
    let follow: string | null = r.slotId;
    if (r.ok && slot.list) {
      // stay on the element that now stands there (or the one before it), so the next edit is one tap away
      const { id, index } = slot.list;
      const after = planKitchen(r.cfg).slots.filter((x) => x.list?.id === id);
      follow = (after.find((x) => x.list?.index === index) ?? after.find((x) => x.list?.index === index - 1))?.id ?? null;
    }
    onEdit(r, { select: follow, say: spacer ? "Razmak je zatvoren." : `Uklonjeno: ${lower(name)}.` });
  };
  const refuse = (text: string) => onEdit({ cfg, ok: false, warning: text, slotId: slot.id });
  /** why a move does not work, in the drawing's terms (edit.ts speaks of the run's start / end) */
  const refuseMove = (sd: Side) => {
    const w = side[sd].move().warning ?? "";
    refuse(/početku niza|kraju niza/.test(w) || !w ? `Element je već skroz ${sd === "left" ? "lijevo" : "desno"}.` : w);
  };

  /** a column of its own (KitchenConfig.tallRuns): resetting it removes it */
  const tallList = slot.zone === "tall" && slot.list && isTallList(slot.list.id) ? (slot.list.id as "tall" | TallListId) : null;
  const ownColumn = tallList !== null && tallList !== "tall";
  const resetLabel =
    slot.zone === "tall" && !inRunTall
      ? ownColumn
        ? "Ukloni ovaj visoki stup"
        : "Vrati zadani visoki stup"
      : slot.zone === "island"
        ? `Vrati zadano za ${islandOf(cfg.layout) === "otoka" ? "otok" : "poluotok"}`
        : "Vrati zadano za ovaj zid";
  // where the column can stand: every free end of a wall's kitchen run (moveTall)
  const places = tallList ? tallPlaces(cfg, tallList) : [];
  const placeName = (end: (typeof places)[number]["end"]) => {
    const { wall, side } = parseRunEnd(end);
    return `Zid ${wall.toUpperCase()}, ${side === "left" ? "lijevo" : "desno"}`;
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.stopPropagation();
      if (asking) setAsk(null);
      else if (addSide) setAdding(null);
      else onClose();
    }
  };

  /* ---------------------------------------------------------------- pieces */

  const header = (
    <div className={`shrink-0 ${desktop ? "px-7 pt-6" : "px-4 pt-3"}`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="eyebrow truncate text-accent">
            {slotPlace(slot, cfg.layout)}
            {idx >= 0 && row.length > 1 && (
              <span className="tabular-nums text-mut">
                {" "}
                · {idx + 1} / {row.length}
              </span>
            )}
          </p>
          <h2
            ref={titleRef}
            id={titleId}
            tabIndex={-1}
            className={`mt-2 font-display font-medium leading-tight tracking-tight outline-none ${desktop ? "text-[24px]" : "text-[19px]"}`}
          >
            {name}
            <span className="ml-2 font-sans text-[13px] font-normal tabular-nums text-mut">{width} cm</span>
          </h2>
        </div>
        <div className="-mr-1.5 -mt-1 flex shrink-0 items-center">
          <IconButton label={prev ? `Prethodni element: ${moduleDef(prev.zone, prev.type)?.name ?? ""}` : "Prethodni element"} disabled={!prev} onClick={() => prev && onNavigate(prev.id)}>
            <ChevronLeft className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton label={next ? `Sljedeći element: ${moduleDef(next.zone, next.type)?.name ?? ""}` : "Sljedeći element"} disabled={!next} onClick={() => next && onNavigate(next.id)}>
            <ChevronRight className="h-[18px] w-[18px]" />
          </IconButton>
          <IconButton label="Zatvori uređivanje elementa" onClick={onClose}>
            <CloseIcon className="h-[18px] w-[18px]" />
          </IconButton>
        </div>
      </div>
      {desktop && def?.description && <p className="mt-2 text-[12.5px] leading-relaxed text-mut">{def.description}</p>}

      <div className={`relative overflow-hidden rounded-xl border border-white/[0.08] bg-ink-900/40 ${desktop ? "mt-4 px-2 pb-1.5 pt-2" : "mt-2.5 px-1.5 pb-1 pt-1.5"}`}>
        <RunElevation
          plan={plan}
          run={slot.run}
          selected={slot.id}
          onPick={(id) => id !== slot.id && onNavigate(id)}
          onHover={onHover ? (id) => onHover(id === slot.id ? null : id) : undefined}
          boxWidth={desktop ? 320 : 330}
          boxHeight={desktop ? 92 : 58}
          className={`block w-full ${desktop ? "h-[92px]" : "h-[58px]"}`}
        />
      </div>
      <p className="mt-1.5 text-[10.5px] leading-snug text-mut/90">{sideHint(slot.run, cfg.layout)}</p>
    </div>
  );

  // pinned above the footer, so it is in view whichever control was pressed
  const noteBox = (
    <div aria-live="polite" aria-atomic="true" className={`shrink-0 ${desktop ? "px-7" : "px-4"}`}>
      <AnimatePresence initial={false} mode="popLayout">
        {/* while a tall unit's question is open it is the one thing to read (an earlier refusal would contradict it) */}
        {note && !asking && (
          <motion.p
            key={note.n}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto", transition: { duration: reduce ? 0 : 0.4, ease: EASE } }}
            exit={{ opacity: 0, height: 0, transition: { duration: reduce ? 0 : 0.2 } }}
            className="overflow-hidden"
          >
            <span
              className={`mb-3 mt-1 flex gap-2.5 rounded-xl border px-3 py-2.5 text-[12.5px] leading-relaxed ${
                note.tone === "refused" ? "border-[#E39A84]/35 bg-[#E39A84]/[0.07] text-fg/90" : "border-accent/25 bg-accent/[0.06] text-fg/85"
              }`}
            >
              <NoteIcon className={`mt-px h-4 w-4 shrink-0 ${note.tone === "refused" ? "text-[#E39A84]" : "text-accent"}`} />
              {note.text}
            </span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );

  const typeTiles = (
    <Section title="Izvedba" id={`${titleId}-types`}>
      <Tiles
        labelledBy={`${titleId}-types`}
        items={info.types}
        zone={slot.zone}
        strip={!desktop}
        pressed
        onPick={(t) => (t.width === null ? refuse(notFit(t, info.free, changeType(cfg, slot.id, t.id).warning)) : pickType(t))}
      />
    </Section>
  );

  // a base cabinet / wall unit of a wall run: a tall unit in its place (the one below / above it goes too — asked first)
  const tallTiles =
    info.tall.length > 0 ? (
      <Section title="Visoki element umjesto ovoga" id={`${titleId}-tall`}>
        <Tiles labelledBy={`${titleId}-tall`} items={info.tall} zone="tall" strip={!desktop} badge="visoki" pressedId={askingType} onPick={(t) => pickTall(t)} />
        {asking ? (
          // pinned to the foot of the scrolling body while the tiles are in view, so it is seen wherever the tile was
          <div
            role="group"
            aria-label="Potvrda zamjene"
            className="sticky bottom-2 z-[1] mt-3 rounded-xl border border-accent/30 bg-[rgba(24,23,22,0.97)] px-3 py-2.5 shadow-[0_-12px_30px_-12px_rgba(0,0,0,.8)] backdrop-blur-md"
          >
            <p aria-live="assertive" className="text-[12.5px] font-medium leading-snug text-fg">
              {asking.text}
            </p>
            {asking.essentials.length > 0 && <p className="mt-1 text-[11.5px] leading-snug text-[#E9AE9C]">Uklanja se i {asking.essentials.join(", ")}.</p>}
            <div className="mt-2.5 flex items-center gap-2">
              <button
                ref={askRef}
                type="button"
                onClick={() => {
                  const t = info.tall.find((x) => x.id === asking.type);
                  if (t) pickTall(t, true);
                }}
                className="h-10 rounded-full bg-accent px-4 text-[12.5px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg"
              >
                Da, zamijeni
              </button>
              <button
                type="button"
                onClick={() => setAsk(null)}
                className="h-10 rounded-full px-3 text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
              >
                Odustani
              </button>
            </div>
          </div>
        ) : (
          <p className="mt-2 text-[11.5px] leading-snug text-mut">Visoki element stoji od poda do vrha — na njegovom mjestu nema donjeg ni gornjeg elementa.</p>
        )}
      </Section>
    ) : null;

  // a tall unit standing in the run: a base cabinet in its place again
  const backTiles =
    backTypes.length > 0 ? (
      <Section title="Donji element umjesto ovoga" id={`${titleId}-back`}>
        <Tiles
          labelledBy={`${titleId}-back`}
          items={backTypes}
          zone="base"
          strip={!desktop}
          onPick={(t) => (t.width === null ? refuse(notFit(t, info.free, changeType(cfg, slot.id, t.id).warning)) : pickType(t))}
        />
      </Section>
    ) : null;

  const widthChips =
    info.widths.length > 1 ? (
      <Section title="Širina" id={`${titleId}-widths`}>
        {/* every width in view, on a phone too (a sideways scroll hid the wider ones behind the edge) */}
        <div role="group" aria-labelledby={`${titleId}-widths`} className="flex flex-wrap gap-1.5">
          <WidthChips
            widths={info.widths}
            onPick={(w, fits) => (fits ? pickWidth(w) : refuse(changeWidth(cfg, slot.id, w).warning ?? `Za ${w} cm nema mjesta.`))}
          />
        </div>
      </Section>
    ) : (
      <p className="mt-5 text-[12px] leading-relaxed text-mut">
        {spacer
          ? `Slobodan prostor od ${width} cm — odaberite izvedbu iznad i element će ga zauzeti.`
          : slot.corner
            ? "Kutni element ima stalnu širinu."
            : slot.anchored
              ? "Širina nape prati ploču za kuhanje."
              : `Dolazi samo u širini ${width} cm.`}
      </p>
    );

  const actions = (
    <Section title="Položaj" id={`${titleId}-pos`}>
      <div role="group" aria-labelledby={`${titleId}-pos`} className="grid grid-cols-2 gap-2">
        <ActionButton
          icon={<ArrowLeftIcon className="h-4 w-4" />}
          disabled={!side.left.canMove}
          onClick={() => (side.left.canMove ? doMove("left") : refuseMove("left"))}
        >
          Pomakni lijevo
        </ActionButton>
        <ActionButton
          icon={<ArrowRightIcon className="h-4 w-4" />}
          iconEnd
          disabled={!side.right.canMove}
          onClick={() => (side.right.canMove ? doMove("right") : refuseMove("right"))}
        >
          Pomakni desno
        </ActionButton>
        <ActionButton
          icon={<InsertIcon side="left" className="h-4 w-4" />}
          disabled={!canAdd("left")}
          expanded={addSide === "left"}
          onClick={() => (canAdd("left") ? setAdding({ id: slot.id, side: "left" }) : refuse(side.left.options.length ? noRoom : "Lijevo od ovog elementa nastavlja se susjedni zid."))}
        >
          Dodaj lijevo
        </ActionButton>
        <ActionButton
          icon={<InsertIcon side="right" className="h-4 w-4" />}
          iconEnd
          disabled={!canAdd("right")}
          expanded={addSide === "right"}
          onClick={() => (canAdd("right") ? setAdding({ id: slot.id, side: "right" }) : refuse(side.right.options.length ? noRoom : "Desno od ovog elementa nastavlja se susjedni zid."))}
        >
          Dodaj desno
        </ActionButton>
        <ActionButton
          icon={<TrashIcon className="h-4 w-4" />}
          disabled={!info.canRemove}
          danger
          className="col-span-2"
          onClick={() => (info.canRemove ? doRemove() : refuse(remove(cfg, slot.id).warning ?? "Ovaj element se ne može ukloniti."))}
        >
          {spacer ? "Zatvori razmak" : slot.zone === "upper" ? "Ukloni (zid ostaje prazan)" : "Ukloni element"}
        </ActionButton>
      </div>
    </Section>
  );

  const placeSection =
    tallList && places.length > 1 ? (
      <Section title="Gdje stoji stup" id={`${titleId}-place`}>
        <ChipRadio
          labelledBy={`${titleId}-place`}
          options={places.map((p) => {
            const { wall, side } = parseRunEnd(p.end);
            return {
              value: p.end,
              label: placeName(p.end),
              disabled: !p.fits,
              why: "Tamo ne stane bez izostavljanja drugih elemenata.",
              aria: `Zid ${wall.toUpperCase()}, ${wallEndName(cfg.layout, wall, side)}${p.fits ? "" : ", ne stane"}`,
            };
          })}
          value={places.find((p) => p.current)?.end ?? null}
          onChange={(end) => {
            const { wall, side } = parseRunEnd(end);
            onEdit(moveTall(cfg, tallList, end), { say: `Visoki stup je sada uz zid ${wall.toUpperCase()}, ${side === "left" ? "lijevi" : "desni"} kraj.` });
          }}
          cols={2}
        />
        <p className="mt-2 text-[11.5px] leading-snug text-mut">Na bilo kojem slobodnom kraju kuhinje (ne u kutu). Lijevo i desno: gledano prema zidu.</p>
      </Section>
    ) : null;

  const extras = (
    <>
      {(engine && def?.demo !== false) || info.edited ? (
        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2.5 border-t border-white/[0.08] pt-4">
          {engine && def?.demo !== false && (
            <button
              type="button"
              onClick={onDemo}
              className="inline-flex min-h-9 items-center gap-2 text-[12.5px] font-semibold tracking-wide text-fg transition-colors duration-300 hover:text-accent"
            >
              <PlayIcon className="h-4 w-4" />
              Prikaži mehanizam
            </button>
          )}
          {info.edited && (
            <button
              type="button"
              onClick={() => onResetRun(slot)}
              className="inline-flex min-h-9 items-center gap-2 text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
            >
              <ResetIcon className="h-4 w-4" />
              {resetLabel}
            </button>
          )}
        </div>
      ) : null}
      {info.notes.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {info.notes.map((n) => (
            <li key={n} className="text-[11.5px] leading-relaxed text-mut">
              {n}
            </li>
          ))}
        </ul>
      )}
    </>
  );

  const addPanel = addSide && (
    <div>
      <div className="mt-5 flex items-center justify-between gap-3">
        <p id={`${titleId}-add`} className="eyebrow flex items-center gap-3 text-accent">
          <span aria-hidden="true" className="h-px w-5 bg-accent/60" />
          Novi element {addSide === "left" ? "lijevo" : "desno"}
        </p>
        <button
          type="button"
          onClick={() => {
            setAdding(null);
            titleRef.current?.focus({ preventScroll: true });
          }}
          className="rounded-full px-2 py-1 text-[12px] font-medium text-mut transition-colors hover:text-fg"
        >
          Odustani
        </button>
      </div>
      <p className="mt-2 text-[12px] leading-relaxed text-mut">
        {info.free >= 1
          ? `${slot.zone === "tall" && !inRunTall ? "U visokom stupu" : "Na ovom nizu"} slobodno je još ${Math.floor(info.free)} cm.`
          : "Novi element zauzima slobodan prostor do njega."}
      </p>
      <div
        ref={addRef}
        role="group"
        aria-labelledby={`${titleId}-add`}
        className="-mx-1.5 mt-3"
        onKeyDown={(e) => {
          if (addRef.current && (e.target as HTMLElement).dataset.row !== undefined && moveFocus(addRef.current, e)) e.preventDefault();
        }}
      >
        <AddPicker
          key={`${slot.id}-${addSide}`}
          items={addItems(side[addSide].options, side[addSide].tall)}
          zone={slot.zone}
          stretch={info.free >= 15 ? info.free : null}
          docked={!desktop}
          onPick={(it, w) => doInsert(addSide, it, w)}
        />
      </div>
    </div>
  );

  const footer = (
    <div className={`flex shrink-0 items-center gap-2.5 border-t border-white/10 ${desktop ? "px-7 pb-6 pt-5" : "px-4 pb-[calc(12px+env(safe-area-inset-bottom))] pt-3"}`}>
      <PriceBlock price={price} compact className="min-w-0 flex-1" />
      {onUndo && (
        <button
          type="button"
          onClick={onUndo}
          aria-label="Poništi zadnju izmjenu"
          title="Poništi zadnju izmjenu"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 text-fg/80 transition-colors duration-300 hover:border-accent hover:text-accent"
        >
          <UndoIcon className="h-[18px] w-[18px]" />
        </button>
      )}
      <button
        type="button"
        onClick={onClose}
        className="h-11 shrink-0 rounded-full bg-accent px-5 text-[13px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg"
      >
        Gotovo
      </button>
    </div>
  );

  return (
    <div role="dialog" aria-labelledby={titleId} aria-describedby={`${titleId}-hint`} className="flex h-full min-h-0 flex-col" onKeyDown={onKeyDown}>
      <p id={`${titleId}-hint`} className="sr-only">
        {runName(slot.run, cfg.layout)}. Izmjene se odmah vide u 3D prikazu i u cijeni. Escape zatvara uređivanje.
      </p>
      {header}
      <div
        ref={bodyRef}
        className={`${s.thinScroll} mt-3 min-h-0 flex-1 overflow-y-auto overscroll-contain border-t border-white/[0.07] ${desktop ? "px-7 pb-7" : "px-4 pb-5"}`}
      >
        {addPanel || (
          <>
            {typeTiles}
            {tallTiles}
            {backTiles}
            {widthChips}
            {actions}
            {placeSection}
            {extras}
          </>
        )}
      </div>
      {noteBox}
      {footer}
    </div>
  );
}

/** why a tile is not available, for the note */
function notFit(t: TypeChoice, free: number, warning: string | null): string {
  if (warning) return warning;
  const min = Math.min(...t.widths);
  return `${t.name} (od ${min} cm) ovdje ne stane — slobodno je još ${Math.floor(free)} cm.`;
}

/* ------------------------------------------------------------------ building blocks */

function Section({ title, id, children }: { title: string; id: string; children: ReactNode }) {
  return (
    <div className="mt-5">
      <p id={id} className="eyebrow flex items-center gap-3 text-mut">
        <span aria-hidden="true" className="h-px w-5 bg-accent/60" />
        {title}
      </p>
      <div className="mt-3">{children}</div>
    </div>
  );
}

function IconButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-10 items-center justify-center rounded-full text-fg/65 transition-colors duration-300 hover:bg-white/[0.06] hover:text-fg disabled:pointer-events-none disabled:opacity-25"
    >
      {children}
    </button>
  );
}

function ActionButton({
  icon,
  iconEnd = false,
  disabled,
  danger = false,
  expanded,
  className = "",
  onClick,
  children,
}: {
  icon: ReactNode;
  iconEnd?: boolean;
  disabled: boolean;
  danger?: boolean;
  expanded?: boolean;
  className?: string;
  onClick: () => void;
  children: ReactNode;
}) {
  // aria-disabled (not disabled): the button stays focusable and a press explains why it does not work
  return (
    <button
      type="button"
      aria-disabled={disabled || undefined}
      aria-expanded={expanded}
      onClick={onClick}
      className={`inline-flex min-h-11 items-center gap-2 rounded-xl border px-3 text-[12.5px] font-medium transition-[border-color,background-color,color,opacity] duration-300 ease-premium ${
        iconEnd ? "justify-end text-right" : "justify-start text-left"
      } ${
        disabled
          ? "border-white/[0.06] text-fg/35"
          : danger
            ? "border-white/10 text-fg/80 hover:border-[#E39A84]/50 hover:text-[#E9AE9C]"
            : "border-white/10 text-fg/85 hover:border-accent/60 hover:bg-accent/[0.05] hover:text-fg"
      } ${className}`}
    >
      {!iconEnd && <span aria-hidden="true">{icon}</span>}
      <span className="leading-tight">{children}</span>
      {iconEnd && <span aria-hidden="true">{icon}</span>}
    </button>
  );
}

/** element types as tiles with their drawing; arrows move focus, Enter / Space picks */
function Tiles({
  items,
  zone,
  strip,
  pressed = false,
  pressedId = null,
  badge,
  labelledBy,
  onPick,
}: {
  items: TypeChoice[];
  zone: string;
  /** one horizontally scrolling row (phone) instead of a grid */
  strip: boolean;
  /** the tiles are a choice with a current one (aria-pressed) */
  pressed?: boolean;
  /** a tile shown pressed (its question is open) */
  pressedId?: string | null;
  /** a small pill before each tile's width ("visoki") */
  badge?: string;
  labelledBy: string;
  onPick: (t: TypeChoice) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const current = Math.max(0, items.findIndex((t) => t.current));
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabIdx = focusIdx !== null && focusIdx < items.length ? focusIdx : current;
  const cols = strip ? 1 : 3;

  // phone strip: keep the current type in view
  const currentId = items[current]?.id;
  useEffect(() => {
    const wrap = wrapRef.current;
    const el = refs.current[items.findIndex((t) => t.id === currentId)];
    if (!strip || !wrap || !el) return;
    wrap.scrollTo({ left: Math.max(0, el.offsetLeft - (wrap.clientWidth - el.offsetWidth) / 2) });
  }, [strip, currentId, items]);

  return (
    <div
      ref={wrapRef}
      role="group"
      aria-labelledby={labelledBy}
      className={strip ? `${s.noScrollbar} -mx-4 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 pb-1` : "grid grid-cols-3 gap-2"}
    >
      {items.map((t, i) => {
        const fits = t.width !== null;
        const sub = t.current ? "odabrano" : fits ? `${t.width} cm` : "ne stane";
        const on = t.current || pressedId === t.id;
        return (
          <button
            key={t.id}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            aria-pressed={pressed || pressedId !== null ? on : undefined}
            data-asking={(pressedId !== null && pressedId === t.id) || undefined}
            aria-label={badge ? `${t.name}, ${badge} element, ${sub}` : undefined}
            aria-disabled={!fits || undefined}
            tabIndex={i === tabIdx ? 0 : -1}
            title={t.description}
            onFocus={() => setFocusIdx(i)}
            onClick={() => onPick(t)}
            onKeyDown={(e) => {
              const n = gridIndex(e, i, items.length, cols);
              if (n === null) return;
              e.preventDefault();
              refs.current[n]?.focus();
            }}
            className={`group relative flex flex-col items-center rounded-xl border px-1.5 pb-2 pt-2.5 text-center transition-[border-color,background-color] duration-300 ease-premium ${
              strip ? "w-[92px] shrink-0 snap-start" : ""
            } ${
              on
                ? "border-accent/70 bg-accent/[0.09]"
                : fits
                  ? "border-white/[0.08] bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.04]"
                  : "border-white/[0.05] opacity-45 hover:opacity-70"
            }`}
          >
            <ModuleGlyph
              type={t.id}
              zone={zone}
              className={`h-9 w-9 transition-colors duration-300 ${t.current ? "text-accent" : "text-fg/65 group-hover:text-fg"}`}
            />
            <span className={`mt-1.5 line-clamp-2 min-h-[2.4em] text-[11.5px] leading-[1.2] ${t.current ? "text-fg" : "text-fg/80"}`}>{t.name}</span>
            <span className={`mt-1 flex flex-wrap items-center justify-center gap-x-1 gap-y-1 text-[10.5px] tabular-nums leading-none ${t.current ? "text-accent" : "text-mut"}`}>
              {badge && <span className={s.tileBadge}>{badge}</span>}
              <span className="whitespace-nowrap">{sub}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

function WidthChips({ widths, onPick }: { widths: { width: number; fits: boolean; current: boolean }[]; onPick: (w: number, fits: boolean) => void }) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const current = Math.max(0, widths.findIndex((w) => w.current));
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  const tabIdx = focusIdx !== null && focusIdx < widths.length ? focusIdx : current;
  return (
    <>
      {widths.map((w, i) => (
        <button
          key={w.width}
          ref={(el) => {
            refs.current[i] = el;
          }}
          type="button"
          aria-pressed={w.current}
          aria-disabled={!w.fits || undefined}
          aria-label={`${w.width} cm${w.fits || w.current ? "" : ", ne stane"}`}
          tabIndex={i === tabIdx ? 0 : -1}
          onFocus={() => setFocusIdx(i)}
          onClick={() => onPick(w.width, w.fits)}
          onKeyDown={(e) => {
            const n = gridIndex(e, i, widths.length, 1);
            if (n === null) return;
            e.preventDefault();
            refs.current[n]?.focus();
          }}
          className={`h-10 min-w-[52px] shrink-0 rounded-full border px-3 text-[12.5px] font-medium tabular-nums transition-colors duration-300 ease-premium ${
            w.current
              ? "border-fg bg-fg text-ink"
              : w.fits
                ? "border-white/[0.12] text-fg/80 hover:border-white/35 hover:text-fg"
                : "border-white/[0.05] text-fg/30 line-through decoration-white/20"
          }`}
        >
          {w.width}
        </button>
      ))}
    </>
  );
}
