"use client";

/**
 * Element toolbar — a small glass bar that floats right above the element selected in 3D, with the edits a customer
 * reaches for most: add a cabinet on the left / right (a picker of the types that fit there, with their widths — tall
 * units too, beside a base cabinet of a wall run), the width, another type in the same place (on a base cabinet or a
 * wall unit of a wall run also a tall unit: it takes the place of both, and when that takes another element away a
 * short line asks first — "Ukloniti donji i gornji element i staviti visoki?"; a tall unit standing in the run can
 * become a base cabinet again), remove (with a 3 s "Poništi" toast; on a unit of a tall column with more units in it a
 * short choice: this unit or the whole column — there is no "Visoki stup" switch), the mechanism demo, and "Više" for
 * the full element editor in the panel.
 *
 * Position: from the engine's ViewInfo (api.subscribe), written straight into the DOM — no React render per frame,
 * and nothing here asks the engine to render. It sits above the element and clear of the engine's "60 cm" tag,
 * flips below when there is no room, glides when the selection moves to another element and fades out when the
 * element leaves the screen. On a phone it docks at the bottom, above the sheet, with 44 px targets.
 *
 * The engine's width tag gets a transparent hit area on top of it: a click opens the width chooser.
 *
 * Keyboard: Tab walks the buttons; ← / → select the neighbouring element (↑ / ↓ the wall unit above / the base
 * cabinet below), Delete / Backspace removes, Escape closes a picker, then the selection. Inside a picker the
 * arrows move between its options.
 *
 * "Left" and "right" are those of the drawing (the island is mirrored, see meta.isFlipped), like in the editor.
 */
import { useIsPresent } from "framer-motion";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type FocusEvent, type ReactNode, type RefObject } from "react";
import { moduleDef } from "@/lib/studio/catalog";
import {
  changeType,
  changeWidth,
  groupsFor,
  insertAfter,
  insertBefore,
  remove,
  type EditResult,
  type SlotEditInfo,
  type TypeChoice,
} from "@/lib/studio/edit";
import { planGaps, planKitchen, type KitchenPlan, type PlanSlot } from "@/lib/studio/plan";
import type { KitchenConfig, StudioEngineApi, ViewInfo } from "@/lib/studio/types";
import { AddPicker, addItems, type AddItem } from "./AddPicker";
import { gapStretch } from "./addModel";
import type { ApplyOptions } from "./ElementEditor";
import { ChevronDown, CloseIcon, InsertIcon, ModuleGlyph, MoreIcon, PlayIcon, SwapIcon, TrashIcon } from "./icons";
import { clamp, columnSlots, elementsCount, isFlipped, isInRunTall, islandWord, noRoomText, rowOf, rowSlots } from "./meta";
import { areaOf, keepAbove, moveFocus, useEngineView, type Area, type Insets } from "./overlay";
import s from "./studio.module.css";
import { baseChoices, tallSwap } from "./tallSwap";

type Side = "left" | "right";
type PopKind = "add-left" | "add-right" | "width" | "type" | "remove";

/** gap between the element (or its width tag) and the bar */
const GAP = 12;
/** half the engine's width tag, plus a little air */
const TAG_CLEAR = 15;
/** the engine re-selects an element right after an edit: keep the bar where it was for this long before fading it */
const STALE_MS = 650;
const GLIDE_MS = 450;
/**
 * The engine's wall-length labels ("A 480 cm", lib/studio/engine/labels.ts) as the bar sees them: half their size,
 * a little generous (ViewInfo gives only their centre), and the air left between them and the bar.
 */
const LABEL = { hw: 50, hh: 14, gap: 6 } as const;
/** the caret keeps this far from the bar's ends */
const CARET_END = 18;

const lower = (t: string) => t.charAt(0).toLowerCase() + t.slice(1);

export interface ElementToolbarProps {
  apiRef: RefObject<StudioEngineApi | null>;
  /** the engine has built the kitchen (ViewInfo flows) */
  live: boolean;
  cfg: KitchenConfig;
  plan: KitchenPlan;
  /** slotEditInfo of the selected element (shared with the editor) */
  info: SlotEditInfo;
  /** phone: docked at the bottom above the sheet instead of floating over the element */
  docked: boolean;
  /** the UI's insets over the 3D view (same numbers as the engine's framing) */
  insetsRef: RefObject<Insets>;
  /** other UI is in front (phone: the editor fills the sheet; the summary is open) */
  hidden: boolean;
  /** the full editor is open in the panel ("Više" shows pressed) */
  editorOpen: boolean;
  /** the 3D view can show this element's mechanism */
  canDemo: boolean;
  onEdit: (r: EditResult, opts?: ApplyOptions) => boolean;
  onRefuse: (text: string) => void;
  onRemove: () => void;
  /** the whole tall column the selected unit stands in goes ("Ukloni cijeli stup") */
  onRemoveColumn?: () => void;
  onDemo: () => void;
  onMore: () => void;
  /** Escape with no picker open: clear the selection */
  onClose: () => void;
  /** select another element (arrow keys) */
  onNavigate: (slotId: string) => void;
}

export function ElementToolbar({
  apiRef,
  live,
  cfg,
  plan,
  info,
  docked,
  insetsRef,
  hidden,
  editorOpen,
  canDemo,
  onEdit,
  onRefuse,
  onRemove,
  onRemoveColumn,
  onDemo,
  onMore,
  onClose,
  onNavigate,
}: ElementToolbarProps) {
  const slot = info.slot;
  const def = info.def ?? moduleDef(slot.zone, slot.type);
  const name = slot.corner && def && !def.corner ? `Kutni element: ${lower(def.name)}` : (def?.name ?? "Element");
  const spacer = Boolean(def?.spacer);
  const width = Math.round(slot.width);
  const flip = isFlipped(slot.run);

  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const tagRef = useRef<HTMLButtonElement>(null);
  const triggers = useRef<Partial<Record<PopKind, HTMLButtonElement | null>>>({});
  const size = useRef({ w: 0, h: 0 });
  /** where the bar was put last (container px) */
  const last = useRef<{ id: string; x: number; y: number; above: boolean; area: Area; shown: boolean; dodged?: boolean } | null>(null);
  const staleT = useRef(0);
  const glideT = useRef(0);

  // a picker, open for one element only (an edit that moves the selection, or another element, closes it)
  const [pop, setPop] = useState<{ id: string; kind: PopKind } | null>(null);
  const kind = !hidden && pop && pop.id === slot.id ? pop.kind : null;
  const [reason, setReason] = useState<{ id: string; kind: PopKind; text: string } | null>(null);
  const reasonText = reason && reason.id === slot.id && reason.kind === kind ? reason.text : null;
  /** a tall unit picked in "Zamijeni" that takes another element away too: the question waiting for its one click */
  const [ask, setAsk] = useState<{ id: string; cfg: KitchenConfig; type: string; text: string; essentials: string[] } | null>(null);
  const asking = ask && ask.id === slot.id && ask.cfg === cfg && kind === "type" ? ask : null;
  const askRef = useRef<HTMLButtonElement>(null);

  /* ---------------------------------------------------------------- what this element can do */

  const sideOf = (sd: Side) => {
    const before = sd === "left" ? !flip : flip;
    return {
      options: before ? info.insertBefore : info.insertAfter,
      /** tall units that can stand on that side in the base run (insert with zone "tall") */
      tall: before ? info.insertBeforeTall : info.insertAfterTall,
      insert: (type: string, w?: number, tall?: boolean) => (before ? insertBefore : insertAfter)(cfg, slot.id, type, w, tall ? "tall" : undefined),
    };
  };
  const fitting = (list: TypeChoice[]) => list.filter((o) => o.width !== null && (o.fitting?.length ?? 1) > 0);
  const fitsOn = (sd: Side) => fitting(sideOf(sd).options);
  const tallOn = (sd: Side) => fitting(sideOf(sd).tall);
  const canAdd = (sd: Side) => fitsOn(sd).length + tallOn(sd).length > 0;
  const addReason = (sd: Side): string => {
    if (!sideOf(sd).options.length && !sideOf(sd).tall.length) return `${sd === "left" ? "Lijevo" : "Desno"} od ovog elementa nastavlja se susjedni zid.`;
    return noRoomText(slot, info.free);
  };
  /** the zone of the row the element stands in (a tall unit standing in a base run: the base row) */
  const rowZone = rowOf(slot).zone;
  const inRunTall = isInRunTall(slot);
  // a tall unit standing in the run: the base cabinets it can become again (planned only while "Zamijeni" is open)
  const backTypes = useMemo(() => (kind === "type" && inRunTall ? baseChoices(cfg, slot) : []), [kind, inRunTall, cfg, slot]);
  /** a unit of a tall column with more units in it: "Ukloni" asks — this unit, or the whole column */
  const column = useMemo(() => columnSlots(plan, slot), [plan, slot]);
  const wholeColumn = column.length > 1 && Boolean(onRemoveColumn);
  const removeLabel = spacer ? "Zatvori razmak" : slot.zone === "upper" ? "Ukloni (zid ostaje prazan)" : wholeColumn ? "Ukloni element ili cijeli stup" : "Ukloni element";
  const removeReason = () => remove(cfg, slot.id).warning ?? "Ovaj element se ne može ukloniti.";
  const widthNote = spacer
    ? `Slobodan prostor od ${width} cm. Pod „Zamijeni” odaberite element koji će ga zauzeti.`
    : slot.corner
      ? "Kutni element ima stalnu širinu."
      : slot.anchored
        ? "Širina nape prati ploču za kuhanje."
        : info.widths.length < 2
          ? `Dolazi samo u širini ${width} cm.`
          : null;

  /* ---------------------------------------------------------------- placement (per frame, straight into the DOM) */

  const show = useCallback((on: boolean) => {
    const root = rootRef.current;
    if (!root) return;
    if (on) root.dataset.shown = "";
    else delete root.dataset.shown;
    // keep a focused bar operable while it fades (the engine re-selecting after an edit); otherwise out of tab order
    const hasFocus = root.contains(document.activeElement);
    root.inert = !on && !hasFocus;
    if (last.current) last.current.shown = on;
  }, []);

  const placePop = useCallback(() => {
    const root = rootRef.current;
    const p = popRef.current;
    const l = last.current;
    if (!root || !p) return;
    if (docked) {
      // phone: above the bar, or down over the sheet (it waits underneath) when that leaves more room
      const r = root.getBoundingClientRect();
      const above = r.top - (insetsRef.current?.top ?? 0) - 16;
      const below = window.innerHeight - r.bottom - 16;
      const up = above >= 300 || above >= below;
      root.dataset.pop = up ? "up" : "down";
      p.style.left = "";
      p.style.maxHeight = `${Math.max(160, up ? above : below)}px`;
      return;
    }
    if (!l) return;
    const A = l.area;
    const { w: tw, h: th } = size.current;
    const above = l.y - A.y0 - 10;
    const below = A.y1 - (l.y + th) - 10;
    // away from the element when there is room, else wherever there is more
    const want = l.above ? above >= 260 || above >= below : !(below >= 260 || below >= above);
    root.dataset.pop = want ? "up" : "down";
    p.style.maxHeight = `${Math.max(140, want ? above : below)}px`;
    const pw = p.offsetWidth;
    const left = clamp(l.x + tw / 2 - pw / 2, A.x0, Math.max(A.x0, A.x1 - pw));
    p.style.left = `${Math.round(left - l.x)}px`;
  }, [docked, insetsRef]);

  const place = useCallback(
    (v: ViewInfo | null) => {
      const root = rootRef.current;
      const tag = tagRef.current;
      if (!root) return;
      const sel = v?.selected;
      if (!v || !sel || sel.id !== slot.id) {
        if (tag) delete tag.dataset.on;
        if (!staleT.current) {
          staleT.current = window.setTimeout(() => {
            staleT.current = 0;
            show(false);
          }, STALE_MS);
        }
        return;
      }
      window.clearTimeout(staleT.current);
      staleT.current = 0;
      const A = areaOf(v.size, insetsRef.current ?? { top: 0, right: 0, bottom: 0, left: 0 }, 8);
      const inArea = sel.visible && sel.anchor.x >= A.x0 - 4 && sel.anchor.x <= A.x1 + 4 && sel.rect.y + sel.rect.h >= A.y0 && sel.rect.y <= A.y1;

      // the width tag's hit area
      if (tag) {
        const t = sel.tag;
        if (t && sel.visible && !hidden && t.x >= A.x0 && t.x <= A.x1 && t.y >= A.y0 && t.y <= A.y1) {
          tag.style.transform = `translate3d(${Math.round(t.x - 33)}px, ${Math.round(t.y - 14)}px, 0)`;
          tag.dataset.on = "";
        } else delete tag.dataset.on;
      }

      if (docked) {
        root.style.transform = "";
        last.current = { id: sel.id, x: 0, y: 0, above: true, area: A, shown: !hidden };
        show(!hidden);
        return;
      }

      const { w: tw, h: th } = size.current;
      if (!tw || !th) return;
      const r = sel.rect;
      const t = sel.tag;
      const top = t ? Math.min(r.y, t.y - TAG_CLEAR) : r.y;
      const bottom = t ? Math.max(r.y + r.h, t.y + TAG_CLEAR) : r.y + r.h;
      let y = top - GAP - th;
      let above = true;
      if (y < A.y0) {
        const yb = bottom + GAP;
        if (yb + th <= A.y1) {
          y = yb;
          above = false;
        } else y = clamp(y, A.y0, A.y1 - th);
      }
      let x = clamp(sel.anchor.x - tw / 2, A.x0, Math.max(A.x0, A.x1 - tw));
      // keep the wall-length labels clickable (an element up to the ceiling has them right above it): slide the bar
      // sideways while its caret still reaches the element, else lift it over the label, else put it below the element
      const covers = (bx: number, by: number) =>
        v.walls.find(
          (l) => l.visible && Math.abs(l.label.x - (bx + tw / 2)) < tw / 2 + LABEL.hw && Math.abs(l.label.y - (by + th / 2)) < th / 2 + LABEL.hh,
        );
      const reaches = (bx: number) => bx >= A.x0 && bx + tw <= A.x1 && sel.anchor.x >= bx + CARET_END && sel.anchor.x <= bx + tw - CARET_END;
      let dodged = false;
      for (let i = 0; i < 3; i++) {
        const l = covers(x, y);
        if (!l) break;
        dodged = true;
        const side = [l.label.x + LABEL.hw + LABEL.gap, l.label.x - LABEL.hw - LABEL.gap - tw]
          .filter((bx) => reaches(bx) && !covers(bx, y))
          .sort((a, b) => Math.abs(a - x) - Math.abs(b - x))[0];
        if (side !== undefined) {
          x = side;
          break;
        }
        const over = l.label.y - LABEL.hh - LABEL.gap - th;
        if (above && over >= A.y0) y = over;
        else if (above && bottom + GAP + th <= A.y1) {
          y = bottom + GAP;
          above = false;
        } else break;
      }
      x = Math.round(x);
      y = Math.round(y);
      const prev = last.current;
      // a different element, or a label to step around: glide over (an orbit follows frame by frame, without easing)
      const moved = prev && prev.shown && (prev.id !== sel.id || Boolean(prev.dodged) !== dodged);
      if (moved && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        root.style.transition = `transform ${GLIDE_MS}ms cubic-bezier(.2,.8,.2,1)`;
        window.clearTimeout(glideT.current);
        glideT.current = window.setTimeout(() => {
          root.style.transition = "";
        }, GLIDE_MS);
      }
      root.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      root.style.setProperty("--caret-x", `${Math.round(clamp(sel.anchor.x - x, CARET_END, tw - CARET_END))}px`);
      root.dataset.place = above ? "above" : "below";
      last.current = { id: sel.id, x, y, above, area: A, shown: inArea && !hidden, dodged };
      if (popRef.current) {
        const pw = popRef.current.offsetWidth;
        const left = clamp(x + tw / 2 - pw / 2, A.x0, Math.max(A.x0, A.x1 - pw));
        popRef.current.style.left = `${Math.round(left - x)}px`;
      }
      show(inArea && !hidden);
    },
    [slot.id, docked, hidden, insetsRef, show],
  );

  // leaving (the selection went): out of reach at once, so no edit is made from what it showed last
  const present = useIsPresent();
  useEngineView(apiRef, live && present, place);

  // out of the tab order until it is placed over its element
  useLayoutEffect(() => {
    if (rootRef.current) rootRef.current.inert = true;
  }, []);
  useEffect(() => {
    if (present) return;
    const root = rootRef.current;
    if (root) {
      delete root.dataset.shown;
      root.inert = true;
    }
    if (tagRef.current) delete tagRef.current.dataset.on;
  }, [present]);

  // the bar's own size (it changes with the element's name and the docked layout)
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const ro = new ResizeObserver(() => {
      size.current = { w: bar.offsetWidth, h: bar.offsetHeight };
      place(apiRef.current?.viewInfo?.() ?? null);
    });
    ro.observe(bar);
    return () => ro.disconnect();
  }, [apiRef, place]);

  // a new element, the docked layout or `hidden` changed: place again from the last frame (no render is asked for)
  useEffect(() => {
    place(apiRef.current?.viewInfo?.() ?? null);
  }, [apiRef, place]);

  useEffect(
    () => () => {
      window.clearTimeout(staleT.current);
      window.clearTimeout(glideT.current);
    },
    [],
  );

  // a picker: placed before paint, its first option focused
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    if (!kind) {
      delete root.dataset.popOpen;
      return;
    }
    root.dataset.popOpen = "";
    placePop();
    const p = popRef.current;
    const first = p?.querySelector<HTMLElement>("[data-current]") ?? p?.querySelector<HTMLElement>("[data-tile]") ?? p?.querySelector<HTMLElement>("[data-row]");
    if (!p || !first) return;
    // the current option in view, inside the picker only (the page itself never scrolls)
    if (first.offsetTop + first.offsetHeight > p.clientHeight) p.scrollTop = first.offsetTop - p.clientHeight / 2 + first.offsetHeight / 2;
    first.focus({ preventScroll: true });
  }, [kind, placePop]);

  // the question before a tall unit takes another element away: focus on its "Da, zamijeni" (Enter confirms)
  const askingType = asking?.type ?? null;
  useEffect(() => {
    if (!askingType) return;
    askRef.current?.focus({ preventScroll: true });
    // the tile it asks about stays in view above the question pinned to the picker's foot
    keepAbove(popRef.current?.querySelector<HTMLElement>("[data-asking]") ?? null, askRef.current?.closest<HTMLElement>('[role="group"]') ?? null);
  }, [askingType]);

  // a picker closes on a press anywhere else (the 3D view, the panel)
  useEffect(() => {
    if (!kind) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node | null;
      if (t && (rootRef.current?.contains(t) || tagRef.current?.contains(t))) return;
      setPop(null);
    };
    document.addEventListener("pointerdown", onDown, true);
    return () => document.removeEventListener("pointerdown", onDown, true);
  }, [kind]);

  /* ---------------------------------------------------------------- actions */

  const open = (k: PopKind) => {
    setAsk(null);
    setPop(kind === k ? null : { id: slot.id, kind: k });
  };
  const closePop = (refocus: boolean) => {
    const k = kind;
    setPop(null);
    setAsk(null);
    if (refocus && k) triggers.current[k]?.focus({ preventScroll: true });
  };
  const after = (ok: boolean, k: PopKind) => {
    if (!ok) return;
    setPop(null);
    setAsk(null);
    // the bar stays (it follows the element): focus back on the button the picker came from
    window.setTimeout(() => triggers.current[k]?.focus({ preventScroll: true }), 0);
  };
  const widthOf = (r: EditResult) => (r.slotId ? planKitchen(r.cfg).slots.find((x) => x.id === r.slotId)?.width : undefined);

  const doInsert = (sd: Side, { t, tall }: AddItem, w: number) => {
    const r = sideOf(sd).insert(t.id, w, tall);
    const got = widthOf(r) ?? w;
    after(onEdit(r, { toast: `Dodano ${sd === "left" ? "lijevo" : "desno"}: ${lower(t.name)}, ${Math.round(got)} cm.` }), sd === "left" ? "add-left" : "add-right");
  };
  const doWidth = (w: number) => {
    if (w === width) return closePop(true);
    after(onEdit(changeWidth(cfg, slot.id, w), { toast: `Širina: ${w} cm.` }), "width");
  };
  const doType = (t: TypeChoice) => {
    if (t.current) return closePop(true);
    const r = changeType(cfg, slot.id, t.id);
    const w = widthOf(r);
    after(onEdit(r, { toast: `Element je sada ${lower(t.name)}${w ? `, ${Math.round(w)} cm` : ""}.` }), "type");
  };
  const typeOrRefuse = (t: TypeChoice) => {
    // another pick: a tall unit's open question is no longer the current one
    setAsk(null);
    if (t.width === null) setReason({ id: slot.id, kind: "type", text: changeType(cfg, slot.id, t.id).warning ?? `${t.name} ovdje ne stane.` });
    else doType(t);
  };
  /** the tall unit in this element's place; when that takes another element away, ask first (a second press confirms) */
  const doTall = (t: TypeChoice, confirmed = false) => {
    if (t.width === null) {
      setAsk(null);
      setReason({ id: slot.id, kind: "type", text: changeType(cfg, slot.id, t.id, "tall").warning ?? `${t.name} ovdje ne stane.` });
      return;
    }
    const sw = tallSwap(cfg, plan, slot, t.id);
    if (!sw.result.ok) {
      setAsk(null);
      setReason({ id: slot.id, kind: "type", text: sw.result.warning ?? `${t.name} ovdje ne stane.` });
      return;
    }
    if (sw.ask && !confirmed && !(asking && asking.type === t.id)) {
      setReason(null);
      setAsk({ id: slot.id, cfg, type: t.id, text: sw.ask, essentials: sw.essentials });
      return;
    }
    const w = widthOf(sw.result);
    after(onEdit(sw.result, { toast: `${t.name}${w ? `, ${Math.round(w)} cm` : ""}.` }), "type");
  };
  const doRemove = () => (wholeColumn ? open("remove") : info.canRemove ? onRemove() : onRefuse(removeReason()));
  const addOrRefuse = (sd: Side) => (canAdd(sd) ? open(sd === "left" ? "add-left" : "add-right") : onRefuse(addReason(sd)));

  /** the neighbouring element in the drawing (← →), or the wall unit above / base cabinet below (↑ ↓) */
  const neighbour = (key: string): PlanSlot | null => {
    if (key === "ArrowLeft" || key === "ArrowRight") {
      const row = rowSlots(plan.slots, slot.run, rowZone);
      const i = row.findIndex((x) => x.id === slot.id);
      return row[i + (key === "ArrowLeft" ? -1 : 1)] ?? null;
    }
    const to = key === "ArrowUp" ? (rowZone === "base" ? "upper" : null) : rowZone === "upper" ? "base" : null;
    if (!to || slot.run === "isl") return null;
    const c = slot.x + slot.width / 2;
    const row = rowSlots(plan.slots, slot.run, to);
    return row.reduce<PlanSlot | null>((best, x) => (!best || Math.abs(x.x + x.width / 2 - c) < Math.abs(best.x + best.width / 2 - c) ? x : best), null);
  };

  // a picker closes when focus leaves the toolbar (Tab past its last option)
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const to = e.relatedTarget as Node | null;
    if (kind && to && !e.currentTarget.contains(to)) setPop(null);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const inPop = Boolean(popRef.current?.contains(e.target as Node));
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      if (asking) {
        setAsk(null);
        return;
      }
      if (kind) closePop(true);
      else onClose();
      return;
    }
    if (inPop) {
      if (popRef.current && moveFocus(popRef.current, e)) e.preventDefault();
      return;
    }
    if (e.altKey || e.metaKey || e.ctrlKey) return;
    if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      doRemove();
      return;
    }
    if (e.key.startsWith("Arrow")) {
      const n = neighbour(e.key);
      e.preventDefault();
      if (n) onNavigate(n.id);
    }
  };

  /* ---------------------------------------------------------------- render */

  const hintId = `studio-tb-hint-${slot.id}`;
  const sideRefuse = (sd: Side) => (canAdd(sd) ? undefined : addReason(sd));
  const popTitle: Record<PopKind, string> = {
    "add-left": "Novi element lijevo",
    "add-right": "Novi element desno",
    width: "Širina",
    type: "Zamijeni element",
    remove: "Ukloni",
  };
  /**
   * the last element before a free end of the run on that side: the "+" there (bare floor, bare wall the kitchen can
   * grow into, the island's own end) — an insert on that side grows the run like that "+" does (edit.ts insertWays)
   */
  const endGap = (sd: Side) => {
    const row = rowSlots(plan.slots, slot.run, rowZone);
    if (row[row.findIndex((x) => x.id === slot.id) + (sd === "left" ? -1 : 1)] || !slot.list) return null;
    const local = (sd === "left") !== flip ? "left" : "right";
    return planGaps(plan).find((g) => g.list === slot.list?.id && g.side === local && g.kind !== "free") ?? null;
  };
  /** no free room on that side (no empty space beside it, no free end): the element makes room by getting narrower (edit.ts) */
  const tight = (sd: Side) => {
    if (info.free >= 15 || endGap(sd)) return false;
    const row = rowSlots(plan.slots, slot.run, rowZone);
    const nb = row[row.findIndex((x) => x.id === slot.id) + (sd === "left" ? -1 : 1)];
    return !(nb && (nb.type === "slobodno" || nb.type === "prazno"));
  };
  /** what the add picker on that side starts with (addModel bestWidth) */
  const addStretch = (sd: Side) => {
    const g = endGap(sd);
    if (g) return gapStretch(g);
    // a full run: the element splits — the widest new width up to half of it comes preselected
    if (tight(sd)) return Math.floor(width / 2);
    return info.free >= 15 ? info.free : null;
  };
  const popSub = (k: PopKind): string | null => {
    if (k === "add-left" || k === "add-right") {
      const sd: Side = k === "add-left" ? "left" : "right";
      const g = info.free < 15 ? endGap(sd) : null;
      if (g) return `${g.run === "isl" ? islandWord(cfg.layout) : "Kuhinja"} se produžuje do novog elementa — slobodno ${Math.floor(g.maxWidth)} cm.`;
      if (tight(sd)) return `Nema slobodnog mjesta — ovaj element (${width} cm) suzit će se koliko treba.`;
      return info.free >= 1 ? `Slobodno je još ${Math.floor(info.free)} cm.` : "Novi element zauzima slobodan prostor do njega.";
    }
    if (k === "width") return widthNote ?? `${name} · sada ${width} cm`;
    if (k === "remove") return `${name} stoji u visokom stupu (${elementsCount(column.length)}: ${column.map((x) => lower(moduleDef(x.zone, x.type)?.name ?? "element")).join(", ")}).`;
    if (inRunTall) return `${name}, ${width} cm — drugi visoki element ili opet donji element na ovom mjestu.`;
    return `${name}, ${width} cm — odaberite što će stajati na ovom mjestu.`;
  };

  return (
    <div className={s.tbLayer}>
      {/* the engine's "60 cm" tag over the element: a click opens the width chooser (keyboard: the "Širina" button) */}
      <button
        ref={tagRef}
        type="button"
        tabIndex={-1}
        aria-hidden="true"
        title="Promijeni širinu"
        className={s.tagHit}
        // a pointer press must not take focus (it is hidden from assistive tech; the "Širina" button is its twin)
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => open("width")}
      />

      <div
        ref={rootRef}
        className={s.tb}
        data-studio-toolbar=""
        data-docked={docked || undefined}
        role="group"
        aria-label={`Brze radnje: ${name}, ${width} cm`}
        aria-describedby={hintId}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        <p id={hintId} className="sr-only">
          Strelice lijevo i desno biraju susjedni element, gore i dolje gornji ili donji element. Delete uklanja, Escape zatvara.
        </p>
        <div className={s.tbInner}>
          <div ref={barRef} className={s.tbBar} data-tb-bar="">
            {!docked && (
              <span aria-hidden="true" className="max-w-[150px] truncate pl-2.5 pr-1.5 text-[12px] font-medium text-fg/85">
                {name}
              </span>
            )}
            {!docked && <Sep />}
            <ToolButton
              docked={docked}
              label="Dodaj lijevo"
              caption="+ lijevo"
              disabledWhy={sideRefuse("left")}
              expanded={kind === "add-left"}
              btnRef={(el) => {
                triggers.current["add-left"] = el;
              }}
              onClick={() => addOrRefuse("left")}
            >
              <InsertIcon side="left" className="h-[18px] w-[18px]" />
            </ToolButton>
            <button
              ref={(el) => {
                triggers.current.width = el;
              }}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={kind === "width"}
              aria-label={`Širina ${width} cm${info.widths.length > 1 ? ", promijeni" : ""}`}
              onClick={() => open("width")}
              className={`${s.tbBtn} ${s.tbWidth}`}
            >
              <span className="inline-flex items-baseline gap-1 font-display text-[13.5px] font-medium tabular-nums text-fg">
                {width}
                <span className="text-[10.5px] font-normal text-mut">cm</span>
              </span>
              {docked ? <span className={s.tbCap}>širina</span> : <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 text-fg/50" />}
              {!docked && <Tip>Širina elementa</Tip>}
            </button>
            <ToolButton
              docked={docked}
              label="Dodaj desno"
              caption="+ desno"
              disabledWhy={sideRefuse("right")}
              expanded={kind === "add-right"}
              btnRef={(el) => {
                triggers.current["add-right"] = el;
              }}
              onClick={() => addOrRefuse("right")}
            >
              <InsertIcon side="right" className="h-[18px] w-[18px]" />
            </ToolButton>
            {!docked && <Sep />}
            <ToolButton
              docked={docked}
              label="Zamijeni"
              caption="zamijeni"
              expanded={kind === "type"}
              btnRef={(el) => {
                triggers.current.type = el;
              }}
              onClick={() => open("type")}
            >
              <SwapIcon className="h-[18px] w-[18px]" />
            </ToolButton>
            {canDemo && (
              <ToolButton docked={docked} label="Prikaži mehanizam" caption="pokaži" onClick={onDemo}>
                <PlayIcon className="h-[17px] w-[17px]" />
              </ToolButton>
            )}
            <ToolButton
              docked={docked}
              label={removeLabel}
              tip={`${removeLabel} · Delete`}
              caption="ukloni"
              danger
              disabledWhy={info.canRemove || wholeColumn ? undefined : removeReason()}
              expanded={wholeColumn ? kind === "remove" : undefined}
              btnRef={(el) => {
                triggers.current.remove = el;
              }}
              keys="Delete"
              onClick={doRemove}
            >
              <TrashIcon className="h-[18px] w-[18px]" />
            </ToolButton>
            {!docked && <Sep />}
            <ToolButton docked={docked} label={editorOpen ? "Zatvori detalje elementa" : "Više: sve postavke elementa"} caption="više" pressed={editorOpen} onClick={onMore}>
              <MoreIcon className="h-[18px] w-[18px]" />
            </ToolButton>
          </div>
          {!docked && <span aria-hidden="true" className={s.tbCaret} />}

          {kind && (
            <div ref={popRef} role="dialog" aria-label={popTitle[kind]} className={`${s.tbPop} ${s.thinScroll}`}>
              <div className="flex items-start gap-2 px-4 pb-2 pt-3.5">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow text-accent">{popTitle[kind]}</p>
                  {popSub(kind) && <p className="mt-1.5 text-[11.5px] leading-snug text-mut">{popSub(kind)}</p>}
                  {/* the tall units come after the element's own types, at the foot of a long list: one tap down to them */}
                  {kind === "type" && info.tall.some((t) => t.width !== null) && (
                    <button
                      type="button"
                      onClick={() => {
                        const b = popRef.current?.querySelector<HTMLElement>('[data-block="tall"]');
                        const box = popRef.current;
                        if (b && box) box.scrollTop += b.getBoundingClientRect().top - box.getBoundingClientRect().top - 8;
                        b?.querySelector<HTMLElement>("button:not([aria-disabled])")?.focus({ preventScroll: true });
                      }}
                      className={`mt-1.5 inline-flex items-center gap-1.5 text-[11.5px] font-medium text-accent underline decoration-accent/40 underline-offset-4 transition-colors hover:text-fg ${docked ? "min-h-11" : "min-h-7"}`}
                    >
                      Visoki element (stup) umjesto ovoga
                      <span aria-hidden="true">↓</span>
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  aria-label="Zatvori"
                  onClick={() => closePop(true)}
                  className={`-mr-1.5 -mt-1.5 flex shrink-0 items-center justify-center rounded-full text-fg/55 transition-colors duration-300 hover:bg-white/[0.06] hover:text-fg ${docked ? "h-11 w-11" : "h-8 w-8"}`}
                >
                  <CloseIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="px-2 pb-2">
                {(kind === "add-left" || kind === "add-right") && (
                  <AddPicker
                    key={`${slot.id}-${kind}`}
                    items={addItems(fitsOn(kind === "add-left" ? "left" : "right"), tallOn(kind === "add-left" ? "left" : "right"))}
                    zone={slot.zone}
                    stretch={addStretch(kind === "add-left" ? "left" : "right")}
                    docked={docked}
                    onPick={(it, w) => doInsert(kind === "add-left" ? "left" : "right", it, w)}
                  />
                )}
                {kind === "width" && (
                  <WidthList
                    widths={info.widths}
                    docked={docked}
                    onPick={(w, fits, why) => (fits ? doWidth(w) : setReason({ id: slot.id, kind: "width", text: why ?? `Za ${w} cm nema mjesta.` }))}
                    onPeek={(why) => setReason(why ? { id: slot.id, kind: "width", text: why } : null)}
                  />
                )}
                {kind === "remove" && (
                  <div className="grid gap-1.5 px-2 pb-1.5 pt-0.5">
                    <RemoveChoice
                      row={0}
                      docked={docked}
                      title={`Samo ${lower(name)}, ${width} cm`}
                      sub="Ostali elementi stupa ostaju."
                      why={info.canRemove ? null : removeReason()}
                      onClick={() => {
                        setPop(null);
                        onRemove();
                      }}
                      onRefuse={onRefuse}
                    />
                    <RemoveChoice
                      row={1}
                      docked={docked}
                      title="Cijeli visoki stup"
                      sub={`${elementsCount(column.length)} · ${Math.round(column.reduce((n, x) => n + x.width, 0))} cm`}
                      why={null}
                      onClick={() => {
                        setPop(null);
                        onRemoveColumn?.();
                      }}
                      onRefuse={onRefuse}
                    />
                  </div>
                )}
                {kind === "type" && (
                  <TypeGrid
                    types={info.types}
                    groups={groupsFor(info.zone)}
                    zone={slot.zone}
                    docked={docked}
                    asking={asking?.type ?? null}
                    extra={[
                      // a tall unit in this element's place (a base cabinet / wall unit of a wall run)
                      { key: "tall", name: "Visoki element umjesto ovoga", zone: "tall", tall: true, items: info.tall, onPick: (t) => doTall(t) },
                      // a tall unit standing in the run: a base cabinet again
                      { key: "base", name: "Donji element umjesto ovoga", zone: "base", tall: false, items: backTypes, onPick: (t) => typeOrRefuse(t) },
                    ]}
                    onPick={typeOrRefuse}
                  />
                )}
              </div>
              {/* a tall unit that takes another element away: one short question, one click (pinned to the picker's foot) */}
              {asking && (
                <div className="sticky bottom-0 z-[1] border-t border-white/[0.08] bg-[rgba(17,17,19,0.97)] px-4 pb-3 pt-2.5" role="group" aria-label="Potvrda zamjene">
                  <p aria-live="assertive" className="text-[12px] font-medium leading-snug text-fg">
                    {asking.text}
                  </p>
                  {asking.essentials.length > 0 && (
                    <p className="mt-1 text-[11px] leading-snug text-[#E9AE9C]">Uklanja se i {asking.essentials.join(", ")}.</p>
                  )}
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      ref={askRef}
                      type="button"
                      data-row={999}
                      data-col={0}
                      onClick={() => {
                        const t = info.tall.find((x) => x.id === asking.type);
                        if (t) doTall(t, true);
                      }}
                      className={`rounded-full bg-accent px-4 text-[12px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg ${docked ? "h-11" : "h-8"}`}
                    >
                      Da, zamijeni
                    </button>
                    <button
                      type="button"
                      data-row={999}
                      data-col={1}
                      onClick={() => setAsk(null)}
                      className={`rounded-full px-3 text-[12px] font-medium text-mut transition-colors duration-300 hover:text-fg ${docked ? "h-11" : "h-8"}`}
                    >
                      Odustani
                    </button>
                  </div>
                </div>
              )}
              {/* why an option does not fit: its own reserved lines, so nothing moves under the pointer */}
              {!asking &&
                (kind === "width"
                  ? info.widths.some((w) => !w.fits && !w.current)
                  : kind === "type" && [...info.types, ...info.tall, ...backTypes].some((t) => t.width === null)) && (
                <p aria-live="polite" className={`min-h-[4.2em] px-4 pb-3 text-[11.5px] leading-snug ${reasonText ? "text-[#E9AE9C]" : "text-mut/80"}`}>
                  {reasonText ?? (kind === "width" ? "Precrtane širine ovdje ne stanu — odaberite jednu i vidjet ćete zašto." : "Prigušeni elementi ovdje ne stanu — odaberite jedan i vidjet ćete zašto.")}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ the leader line to the editor */

/**
 * Desktop, while the full editor is open in the panel: a dashed line from the selected element to the panel's edge,
 * following the view like the toolbar (ViewInfo straight into the SVG).
 */
export function SelectionLeader({
  apiRef,
  live,
  slotId,
  panelLeft,
}: {
  apiRef: RefObject<StudioEngineApi | null>;
  live: boolean;
  slotId: string;
  /** x of the panel's left edge (px) */
  panelLeft: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const lineRef = useRef<SVGLineElement>(null);
  const dotRef = useRef<SVGCircleElement>(null);
  const place = useCallback(
    (v: ViewInfo | null) => {
      const svg = svgRef.current;
      const line = lineRef.current;
      const dot = dotRef.current;
      if (!svg || !line || !dot) return;
      const sel = v?.selected;
      const x1 = sel ? sel.rect.x + sel.rect.w : 0;
      if (!v || !sel || sel.id !== slotId || !sel.visible || x1 > panelLeft - 32) {
        delete svg.dataset.on;
        return;
      }
      const y1 = sel.rect.y + sel.rect.h / 2;
      const y2 = clamp(y1, 120, v.size.h - 120);
      line.setAttribute("x1", String(Math.round(x1 + 6)));
      line.setAttribute("y1", String(Math.round(y1)));
      line.setAttribute("x2", String(Math.round(panelLeft)));
      line.setAttribute("y2", String(Math.round(y2)));
      dot.setAttribute("cx", String(Math.round(panelLeft)));
      dot.setAttribute("cy", String(Math.round(y2)));
      svg.dataset.on = "";
    },
    [slotId, panelLeft],
  );
  useEngineView(apiRef, live, place);
  useEffect(() => {
    place(apiRef.current?.viewInfo?.() ?? null);
  }, [apiRef, place]);
  return (
    <svg
      ref={svgRef}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 z-[24] h-full w-full overflow-visible opacity-0 transition-opacity duration-500 ease-premium data-[on]:opacity-100 motion-reduce:transition-none"
    >
      <line ref={lineRef} stroke="#C9B99A" strokeWidth="1" strokeOpacity="0.6" strokeDasharray="2 4" />
      <circle ref={dotRef} r="2.5" fill="#C9B99A" />
    </svg>
  );
}

/* ------------------------------------------------------------------ pieces */

function Sep() {
  return <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-white/10" />;
}

function Tip({ children }: { children: ReactNode }) {
  return (
    <span aria-hidden="true" className={s.tip}>
      {children}
    </span>
  );
}

function ToolButton({
  docked,
  label,
  tip,
  caption,
  disabledWhy,
  expanded,
  pressed,
  danger = false,
  keys,
  btnRef,
  onClick,
  children,
}: {
  docked: boolean;
  label: string;
  tip?: string;
  caption: string;
  /** shown as not available, with the reason in the tooltip; a press says it (the button stays focusable) */
  disabledWhy?: string;
  expanded?: boolean;
  pressed?: boolean;
  danger?: boolean;
  keys?: string;
  btnRef?: (el: HTMLButtonElement | null) => void;
  onClick: () => void;
  children: ReactNode;
}) {
  const off = Boolean(disabledWhy);
  return (
    <button
      ref={btnRef}
      type="button"
      aria-label={label}
      aria-disabled={off || undefined}
      aria-expanded={expanded}
      aria-haspopup={expanded !== undefined ? "dialog" : undefined}
      aria-pressed={pressed}
      aria-keyshortcuts={keys}
      onClick={onClick}
      className={`${s.tbBtn} ${danger ? s.tbDanger : ""}`}
      data-off={off || undefined}
      data-on={expanded || pressed || undefined}
    >
      <span aria-hidden="true" className="flex items-center justify-center">
        {children}
      </span>
      {docked && <span className={s.tbCap}>{caption}</span>}
      {!docked && <Tip>{off ? disabledWhy : (tip ?? label)}</Tip>}
    </button>
  );
}

/** one way of removing in the "Ukloni" picker of a tall unit (this unit / the whole column) */
function RemoveChoice({
  row,
  docked,
  title,
  sub,
  why,
  onClick,
  onRefuse,
}: {
  row: number;
  docked: boolean;
  title: string;
  sub: string;
  /** why it cannot be done (the press says it); null: it can */
  why: string | null;
  onClick: () => void;
  onRefuse: (text: string) => void;
}) {
  return (
    <button
      type="button"
      data-row={row}
      data-col={0}
      aria-disabled={why ? true : undefined}
      onClick={() => (why ? onRefuse(why) : onClick())}
      className={`flex w-full items-center gap-3 rounded-xl border px-3 text-left transition-[border-color,background-color,color] duration-300 ease-premium ${
        docked ? "min-h-[52px]" : "min-h-11"
      } ${why ? "border-white/[0.05] text-fg/35" : "border-white/10 text-fg/85 hover:border-[#E39A84]/50 hover:text-[#E9AE9C]"}`}
    >
      <TrashIcon aria-hidden="true" className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block text-[12.5px] font-medium leading-tight">{title}</span>
        <span className="mt-0.5 block text-[11px] leading-snug text-mut">{sub}</span>
      </span>
    </button>
  );
}

function WidthList({
  widths,
  docked,
  onPick,
  onPeek,
}: {
  widths: { width: number; fits: boolean; current: boolean; reason?: string | null }[];
  docked: boolean;
  onPick: (w: number, fits: boolean, why?: string | null) => void;
  /** a not-fitting width is hovered / focused: say why (null clears) */
  onPeek: (why: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5 px-2 pb-1 pt-1">
      {widths.map((w, i) => {
        const why = w.fits || w.current ? null : (w.reason ?? `Za ${w.width} cm nema mjesta.`);
        return (
          <button
            key={w.width}
            type="button"
            data-row={0}
            data-col={i}
            data-current={w.current || undefined}
            aria-pressed={w.current}
            aria-disabled={why ? true : undefined}
            aria-label={`${w.width} cm${why ? `, ne stane: ${why}` : ""}`}
            onClick={() => onPick(w.width, w.fits || w.current, why)}
            onPointerEnter={() => why && onPeek(why)}
            onFocus={() => onPeek(why)}
            className={`${s.popWidth} ${docked ? "h-11 min-w-[54px]" : "h-9 min-w-[50px]"}`}
          >
            {w.width}
          </button>
        );
      })}
    </div>
  );
}

function TypeGrid({
  types,
  groups,
  zone,
  extra = [],
  asking = null,
  docked,
  onPick,
}: {
  types: TypeChoice[];
  groups: { id: string; name: string }[];
  zone: string;
  /** more blocks after the element's own types (a tall unit in its place; a tall unit's way back to a base cabinet) — empty ones are left out */
  extra?: { key: string; name: string; zone: string; tall: boolean; items: TypeChoice[]; onPick: (t: TypeChoice) => void }[];
  /** the tall type whose question is open (its tile shows pressed) */
  asking?: string | null;
  docked: boolean;
  onPick: (t: TypeChoice) => void;
}) {
  let row = 0;
  const known = new Set(groups.map((g) => g.id));
  const own = [...groups, ...(types.some((t) => !known.has(t.group)) ? [{ id: "", name: "Ostalo" }] : [])].map((g) => ({
    key: g.id || "other",
    name: g.name,
    zone,
    tall: false,
    items: types.filter((t) => (g.id ? t.group === g.id : !known.has(t.group))),
    onPick,
  }));
  const blocks = [...own, ...extra].filter((b) => b.items.length);
  return (
    <div className="space-y-3 px-1.5 pb-1">
      {blocks.map((b) => {
        const base = row;
        row += Math.ceil(b.items.length / 3);
        return (
          <div key={b.key} data-block={b.key}>
            {blocks.length > 1 && <p className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.2em] text-mut/90">{b.name}</p>}
            <div className="grid grid-cols-3 gap-1.5">
              {b.items.map((t, j) => {
                const fits = t.width !== null;
                const pressed = t.current || (b.tall && asking === t.id);
                return (
                  <button
                    key={t.id}
                    type="button"
                    data-row={base + Math.floor(j / 3)}
                    data-col={j % 3}
                    data-current={t.current || undefined}
                    data-asking={(b.tall && asking === t.id) || undefined}
                    aria-pressed={pressed}
                    aria-disabled={!fits || undefined}
                    aria-label={`${t.name}${b.tall ? ", visoki element" : ""}${t.current ? ", odabrano" : fits ? `, ${t.width} cm` : ", ne stane"}`}
                    title={t.description}
                    onClick={() => b.onPick(t)}
                    className={`${s.popTile} ${docked ? "min-h-[92px]" : "min-h-[84px]"}`}
                  >
                    <ModuleGlyph type={t.id} zone={b.zone} className="h-8 w-8 shrink-0" />
                    <span className="mt-1 line-clamp-2 text-[11px] leading-[1.2]">{t.name}</span>
                    <span className="mt-auto flex flex-wrap items-center justify-center gap-x-1 gap-y-1 pt-1 text-[10px] tabular-nums leading-none text-mut">
                      {b.tall && <span className={s.tileBadge}>visoki</span>}
                      <span className="whitespace-nowrap">{t.current ? "odabrano" : fits ? `${t.width} cm` : "ne stane"}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
