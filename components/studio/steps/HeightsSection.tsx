"use client";

/**
 * "Zidovi" → Strop i visine: the ceiling, right under it the top of the tall column (why it cannot go higher — "najviše
 * 257 cm, strop je 260 cm" — and, when the customer asks for more, "Podigni strop na X cm": edit.ts raiseCeilingFor),
 * "Kuhinja do stropa", the worktop height and, folded away, the wall-unit height.
 *
 * Every change goes through lib/studio/edit.ts (setCeiling, setHeights, heightChoices), so the 3D view, the price,
 * the summary and the link show exactly what the planner fitted under the ceiling. Height changes are undo steps
 * (Ctrl / ⌘ + Z; a slider or held − / + is one step); the ceiling is a room measure like the walls. What the last
 * change caused (a window sill lowered, heights fitted under the ceiling, elements left out) stays next to these
 * controls until the room changes again — <WallsStep> keeps that note and leaves it out of its own list.
 */
import { useId, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { heightChoices, setCeiling, setHeights, type HeightChoices } from "@/lib/studio/edit";
import { DIM, limitsFor, planKitchen, type HeightPlan } from "@/lib/studio/plan";
import type { HeightSpec, KitchenConfig } from "@/lib/studio/types";
import { Disclosure, Notes, NumberField, Segmented, ToggleRow, rovingIndex } from "../controls";
import { HeightIcon, NoteIcon, ResetIcon } from "../icons";
import { raiseForTall } from "../room";
import type { StepEditOptions, StepProps } from "./types";

const r = Math.round;

/** "60, 72 i 80" */
const andList = (xs: (string | number)[]) => (xs.length < 2 ? xs.join("") : `${xs.slice(0, -1).join(", ")} i ${xs[xs.length - 1]}`);

/** "gornji 72 + nadgradni 39 cm" / "gornji 72 cm"; short: "gornji 72 + 39 cm" */
function upperText(h: HeightPlan, short = false): string {
  const main = r(h.upperTop - h.upperBottom);
  if (!h.topRow) return `gornji ${main} cm`;
  return `gornji ${main} + ${short ? "" : "nadgradni "}${r(h.topRow.to - h.topRow.from)} cm`;
}

const MODE_NAME: Record<HeightSpec["mode"], string> = { standard: "Standardno", "do-stropa": "Do stropa", custom: "Po mjeri" };

/**
 * The notes of a change as separate items: the planner's warnings exactly as the plan keeps them (so a list can leave
 * them out) and what is left of the text (clamping, the window sill) as one item.
 */
function splitNotes(warning: string | null, next: KitchenConfig): string[] {
  if (!warning) return [];
  const known = planKitchen(next).warnings.filter((w) => warning.includes(w));
  let rest = warning;
  for (const w of known) rest = rest.split(w).join(" ");
  rest = rest.replace(/\s+/g, " ").trim();
  return [...(rest ? [rest] : []), ...known];
}

export function HeightsSection({
  cfg,
  plan,
  update,
  edit,
  fresh,
  kept,
  onNotes,
  onCeilingActive,
}: Pick<StepProps, "cfg" | "plan" | "update" | "edit"> & {
  /** what the last change here caused (shown in a live region) */
  fresh: string[];
  /** what the heights keep saying (custom heights lowered under this ceiling) */
  kept: string[];
  /** a change was made: its notes, and the config they belong to */
  onNotes: (items: string[], next: KitchenConfig) => void;
  onCeilingActive: (on: boolean) => void;
}) {
  const uid = useId();
  // custom heights open with their controls; the rest of the time they wait folded away
  const [open, setOpen] = useState(() => cfg.heights?.mode === "custom");
  const choices = useMemo(() => heightChoices(cfg), [cfg]);
  const lim = limitsFor(cfg.layout);
  const cur = choices.current;
  const hasTall = plan.slots.some((s) => s.zone === "tall");
  const custom = choices.mode === "custom";

  const setCeil = (v: number) => {
    const res = setCeiling(cfg, v);
    if (!res.ok) return;
    // a room measure like the walls (no undo step); setCeiling says what it did to the window and the heights
    update({ ceiling: res.cfg.ceiling, window: res.cfg.window });
    onNotes(splitNotes(res.warning, res.cfg), res.cfg);
  };

  const change = (patch: Partial<HeightSpec> | null, opts: StepEditOptions = {}) => {
    const res = setHeights(cfg, patch);
    if (JSON.stringify(res.cfg.heights ?? null) === JSON.stringify(cfg.heights ?? null)) return;
    if (edit(res, opts)) onNotes(res.notes, res.cfg);
  };

  /** "Podigni strop na X cm": the ceiling for a column up to `wish`, and the column up to it — one undo step */
  const raiseFor = (wish: number) => {
    const r = raiseForTall(cfg, wish);
    if (r && edit(r.result, { say: `Strop je podignut na ${r.ceiling} cm.` })) onNotes(r.notes, r.result.cfg);
  };

  const ds = choices.doStropa;
  const dsHint = `${upperText(ds)}${hasTall ? `, visoki stup do ${r(ds.tallTop)} cm` : ""}`;
  // the folded header: what the kitchen has now, short enough for a phone
  const nowText = `${MODE_NAME[choices.mode]}: ${upperText(cur, true)}`;

  // wall-unit heights: the drawn one is checked (not in "do stropa", where the row follows the ceiling)
  const upper = choices.upper.map((u) => ({
    ...u,
    minCeiling: cur.worktop + DIM.upperGapMin + u.value + DIM.ceilingGap,
  }));
  const blocked = upper.filter((u) => !u.fits);
  const upperValue = choices.mode === "do-stropa" ? null : (upper.find((u) => u.current)?.value ?? null);
  const reasonId = blocked.length ? `${uid}-why` : undefined;

  const worktop = choices.worktop.find((w) => w.current)?.value ?? cur.worktop;

  return (
    <>
      <div className="mt-4 space-y-5">
        <NumberField
          label="Visina stropa"
          value={cfg.ceiling}
          min={lim.ceiling[0]}
          max={lim.ceiling[1]}
          onChange={setCeil}
          onActive={onCeilingActive}
        />

        {hasTall && choices.mode !== "do-stropa" && (
          <TallTopField
            ceiling={cfg.ceiling}
            tall={choices.tallTop}
            custom={custom}
            onChange={(v) => change({ mode: "custom", tallTop: v }, { coalesce: "heights-tall" })}
            onRaise={raiseFor}
          />
        )}

        <ToggleRow
          prominent
          title="Kuhinja do stropa"
          checked={choices.mode === "do-stropa"}
          onChange={(on) => change({ mode: on ? "do-stropa" : "standard" })}
          description={
            <>
              {hasTall ? "Gornji elementi i visoki stup sežu" : "Gornji elementi sežu"} do stropa, a lajsna u boji fronti zatvara razmak i
              skriva neravnine.
              <span className="mt-1.5 block tabular-nums text-fg/80">
                Uz strop od {cfg.ceiling} cm: {dsHint}.
              </span>
            </>
          }
        />

        <div>
          <p id={`${uid}-wt`} className="mb-2.5 text-[13px] text-fg">
            Visina radne ploče
          </p>
          <Segmented
            labelledBy={`${uid}-wt`}
            options={choices.worktop.map((w) => ({ id: String(w.value), label: `${w.value} cm`, aria: `${w.value} cm` }))}
            value={String(worktop)}
            onChange={(v) => change({ worktop: Number(v) }, { coalesce: "heights-worktop" })}
            size="sm"
          />
          <p className="mt-2 text-[12px] leading-snug text-mut">Standardno 90 cm. Mijenja se postolje, a gornji elementi prate ploču.</p>
        </div>

        <Disclosure
          title="Visine po mjeri"
          value={nowText}
          icon={<HeightIcon className="h-5 w-5" />}
          open={open}
          onToggle={() => setOpen((o) => !o)}
        >
          <div className="space-y-5 pt-1">
            <div>
              <p id={`${uid}-up`} className="mb-2.5 text-[13px] text-fg">
                Visina gornjih elemenata
              </p>
              <HeightChips
                labelledBy={`${uid}-up`}
                describedBy={reasonId}
                options={upper}
                value={upperValue}
                onChange={(v) => change({ mode: "custom", upper: v }, { coalesce: "heights-upper" })}
              />
              {blocked.length > 0 && (
                <p id={reasonId} className="mt-2 text-[12px] leading-snug text-mut">
                  {andList(blocked.map((u) => u.value))} cm ne {blocked.length > 1 ? "stanu" : "stane"} ispod stropa od {cfg.ceiling} cm — za{" "}
                  {blocked[0].value} cm strop mora biti visok barem {blocked[0].minCeiling} cm.
                </p>
              )}
            </div>
            {custom && (
              <button
                type="button"
                onClick={() => change({ mode: "standard" })}
                className="inline-flex min-h-10 items-center gap-2 text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
              >
                <ResetIcon className="h-4 w-4" />
                Vrati standardne visine
              </button>
            )}
          </div>
        </Disclosure>
      </div>

      {/* what the last change caused is read out; what the heights keep saying is not, on every centimetre of the ceiling */}
      <div aria-live="polite">{fresh.length > 0 && <Notes items={fresh} className="mt-5" />}</div>
      <Notes items={kept} className={fresh.length ? "mt-2" : "mt-5"} />
    </>
  );
}

/**
 * The top of the tall column, right under the ceiling field: its maximum and why ("strop je 260 cm"); asking for more
 * (typing it, + at the top) keeps the wish and offers to raise the ceiling for it.
 */
function TallTopField({
  ceiling,
  tall,
  custom,
  onChange,
  onRaise,
}: {
  ceiling: number;
  tall: HeightChoices["tallTop"];
  custom: boolean;
  onChange: (v: number) => void;
  onRaise: (wish: number) => void;
}) {
  const [wish, setWish] = useState<number | null>(null);
  // a wish the ceiling now allows (raised by hand) is no longer one; under the highest ceiling there is nothing to raise
  const over = wish !== null && wish > tall.max && tall.max < tall.ceilingMax ? Math.min(wish, tall.ceilingMax) : null;
  const need = over !== null ? over + (ceiling - tall.max) : 0;
  const atTop = over !== null && over >= tall.ceilingMax;
  return (
    <div>
      <NumberField
        label="Vrh visokog stupa"
        value={tall.value}
        min={tall.min}
        max={tall.max}
        onChange={(v) => {
          setWish(null);
          onChange(v);
        }}
        onBeyond={(v, stepped) => setWish((w) => (stepped && w !== null && w > tall.max ? w + (v - tall.value) : v))}
      />
      <div aria-live="polite">
        {over === null ? (
          <p className="mt-1.5 text-[12px] leading-snug text-mut">
            Od poda do vrha hladnjaka, pećnice i ostave{custom ? "" : " — promjenom prelazite na visine po mjeri"}.{" "}
            <span className="tabular-nums text-fg/75">
              Najviše {tall.max} cm — strop je {ceiling} cm.
            </span>
          </p>
        ) : (
          <div className="mt-2.5 rounded-xl border border-accent/25 bg-accent/[0.06] px-3.5 py-3 text-[12.5px] leading-relaxed text-fg/85">
            <p className="flex gap-2.5">
              <NoteIcon className="mt-px h-4 w-4 shrink-0 text-accent" />
              <span>
                {atTop
                  ? `Visoki stup ide najviše do ${tall.ceilingMax} cm, uz najviši strop koji primamo.`
                  : `Za stup do ${over} cm strop mora biti visok barem ${need} cm — sada je ${ceiling} cm.`}
              </span>
            </p>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-2 pl-[26px]">
              <button
                type="button"
                onClick={() => {
                  setWish(null);
                  onRaise(over);
                }}
                className="inline-flex min-h-9 items-center rounded-full bg-accent px-4 text-[12.5px] font-semibold tracking-wide text-ink transition-colors duration-300 ease-premium hover:bg-fg"
              >
                Podigni strop na {need} cm
              </button>
              <button
                type="button"
                onClick={() => setWish(null)}
                className="text-[12.5px] font-medium text-mut transition-colors duration-300 hover:text-fg"
              >
                Ostavi {tall.max} cm
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** wall-unit heights: a radio group whose heights that do not fit under the ceiling are disabled (arrows skip them) */
function HeightChips({
  labelledBy,
  describedBy,
  options,
  value,
  onChange,
}: {
  labelledBy: string;
  describedBy?: string;
  options: { value: number; fits: boolean; minCeiling: number }[];
  value: number | null;
  onChange: (v: number) => void;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = options.flatMap((o, i) => (o.fits ? [i] : []));
  const cur = options.findIndex((o) => o.value === value);
  const stop = cur >= 0 && options[cur].fits ? cur : (enabled[0] ?? -1);

  const onKey = (e: KeyboardEvent, i: number) => {
    const n = rovingIndex(e, enabled.indexOf(i), enabled.length);
    if (n === null) return;
    e.preventDefault();
    const j = enabled[n];
    onChange(options[j].value);
    refs.current[j]?.focus();
  };

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} aria-describedby={describedBy} className="grid grid-cols-3 gap-2">
      {options.map((o, i) => {
        const on = i === cur;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={o.fits ? `${o.value} cm` : `${o.value} cm, ne stane ispod ovog stropa`}
            disabled={!o.fits}
            title={o.fits ? undefined : `Za ${o.value} cm strop mora biti visok barem ${o.minCeiling} cm.`}
            tabIndex={i === stop ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => onKey(e, i)}
            className={`flex h-10 items-center justify-center gap-1 rounded-full border text-[13px] font-medium tabular-nums transition-colors duration-300 ease-premium ${
              on
                ? "border-accent/70 bg-accent/[0.1] text-fg"
                : o.fits
                  ? "border-white/[0.12] text-fg/75 hover:border-white/30 hover:text-fg"
                  : "cursor-not-allowed border-white/[0.06] text-fg/30"
            }`}
          >
            {o.value}
            <span className={`text-[10.5px] ${o.fits ? "text-mut" : "text-mut/50"}`}>cm</span>
          </button>
        );
      })}
    </div>
  );
}
