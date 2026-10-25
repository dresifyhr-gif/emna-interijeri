"use client";

/**
 * "Oblik" → the island / peninsula (layouts "otok", "poluotok", "G"): which end of wall A a peninsula stands at, what is
 * in its worktop (nothing, the hob, the sink, both — they leave the walls), and folded away: seating (side, knee
 * overhang, stools), the bar (šank 105–115 cm or a lowered table at 75 cm: length, depth, its top), the build (body
 * depth with push-to-open cabinets behind, worktop down to the floor or end panels) and the ceiling hood above an
 * island hob.
 *
 * Everything comes from lib/studio/edit.ts islandChoices and goes through its setters (setIsland, setIslandFunctions,
 * setSeating, setBar, setIslandHood, setPeninsula) as one undo step each; what a change caused (a sink that stays on the
 * wall, stools capped to what fits) is said in a toast with "Poništi". The length is set in "Zidovi" (or on its label).
 */
import { useMemo, useState } from "react";
import { catalog, topDef } from "@/lib/studio/catalog";
import {
  islandChoices,
  setBar,
  setIsland,
  setIslandFunctions,
  setIslandHood,
  setPeninsula,
  setSeating,
  type IslandResult,
} from "@/lib/studio/edit";
import type { IslandFunctions, SeatSide } from "@/lib/studio/types";
import { ChipRadio, Disclosure, NumberField, SectionLabel, Stepper, Switch, ToggleRow } from "../controls";
import { BarIcon, HoodIcon, IslandIcon, StoolIcon } from "../icons";
import { MaterialLibrary } from "../MaterialLibrary";
import { islandOf, islandWord, seatsText, stepIndex } from "../meta";
import { shorterBar } from "../room";
import type { StepProps } from "./types";

type Section = "seats" | "bar" | "build" | "hood";

const FUNCTION_NAME: Record<IslandFunctions, string> = { none: "Ništa", hob: "Ploča", sink: "Sudoper", both: "Ploča i sudoper" };
const FUNCTION_LONG: Record<IslandFunctions, string> = {
  none: "samo ladice i vrata",
  hob: "ploča za kuhanje",
  sink: "sudoper s perilicom posuđa",
  both: "ploča i sudoper",
};
const SEAT_NAME: Record<SeatSide, string> = { back: "Straga", left: "Lijevi kraj", right: "Desni kraj" };

export function IslandSection({ cfg, edit, goTo }: Pick<StepProps, "cfg" | "edit" | "goTo">) {
  const c = useMemo(() => islandChoices(cfg), [cfg]);
  const [open, setOpen] = useState<Section | null>(null);
  if (!c) return null;
  const toggle = (k: Section) => setOpen((o) => (o === k ? null : k));
  const word = islandWord(cfg.layout);
  const of = islandOf(cfg.layout);
  const run = (r: IslandResult, say: string, coalesce?: string) => edit(r, { notify: true, say, coalesce });

  const fCur = c.functions.find((f) => f.current)?.value ?? "none";
  const bar = c.bar.current;
  const barPlan = c.bar.plan;
  const table = bar?.kind === "table";
  const seatCur = c.seatSides.find((x) => x.current)?.value ?? "back";
  const overhang = c.overhang.find((o) => o.current)?.value ?? 0;
  const depth = c.depth.find((d) => d.current)?.value ?? 60;
  const barTop = topDef(barPlan?.top ?? bar?.top ?? cfg.top);

  const seatsValue = bar
    ? `${table ? "Uz stol" : "Uz šank"} · ${seatsText(c.stools.value, table)}`
    : overhang === 0 || c.island.seatSide === null
      ? "Bez sjedenja"
      : `${SEAT_NAME[c.island.seatSide]} · ${seatsText(c.stools.value, false)}`;
  const barLen = barPlan ? Math.round(barPlan.to - barPlan.from) : null;
  const barValue = !bar
    ? "Bez šanka"
    : `${table ? `Spušteni stol ${c.bar.tableHeight} cm` : `Šank ${barPlan?.height ?? bar.height ?? 110} cm`} · ${c.bar.length.value === null ? `cijelom duljinom` : `${barLen ?? c.bar.length.value} cm`}`;
  const buildValue = `Dubina ${depth} cm · ${c.waterfall ? "ploča do poda" : "bočne ploče"}`;

  return (
    <div className="mt-8">
      <SectionLabel>{word}</SectionLabel>
      <p className="mt-2.5 text-[12.5px] leading-relaxed text-mut">
        {word} {c.length.value} cm{c.kind === "poluotok" ? " od zida A" : ""}.{" "}
        <button
          type="button"
          onClick={() => goTo(stepIndex("zidovi"))}
          className="text-fg/85 underline decoration-white/25 underline-offset-4 transition-colors hover:decoration-accent"
        >
          Duljinu mijenjate u koraku Zidovi
        </button>{" "}
        ili klikom na njegovu kotu u 3D prikazu.
      </p>

      {c.kind === "poluotok" && c.sides.length > 1 && (
        <div className="mt-5">
          <p id="studio-pen-side" className="mb-2.5 text-[13px] text-fg">
            Uz koji kraj zida A
          </p>
          <ChipRadio
            labelledBy="studio-pen-side"
            options={(["left", "right"] as const).map((sd) => ({ value: sd, label: sd === "left" ? "Lijevi kraj" : "Desni kraj" }))}
            value={c.side}
            onChange={(sd) => run(setPeninsula(cfg, { side: sd }), `Poluotok je uz ${sd === "left" ? "lijevi" : "desni"} kraj zida A.`)}
            cols={2}
          />
        </div>
      )}

      <div className="mt-5">
        <p id="studio-isl-fn" className="mb-2.5 text-[13px] text-fg">
          Na {c.kind === "poluotok" ? "poluotoku" : "otoku"}
        </p>
        <ChipRadio
          labelledBy="studio-isl-fn"
          describedBy="studio-isl-fn-d"
          options={c.functions.map((f) => ({
            value: f.value,
            label: FUNCTION_NAME[f.value],
            sub: f.fits ? undefined : "ne stane",
            aria: `${FUNCTION_NAME[f.value]}${f.fits ? "" : `, ne stane uz duljinu od ${c.length.value} cm`}`,
          }))}
          value={fCur}
          onChange={(f) => run(setIslandFunctions(cfg, f), `Na ${of === "otoka" ? "otoku" : "poluotoku"}: ${FUNCTION_LONG[f]}.`)}
          cols={4}
        />
        <p id="studio-isl-fn-d" className="mt-2 text-[12px] leading-snug text-mut">
          Ploča ili sudoper na {of === "otoka" ? "otoku" : "poluotoku"} sele se sa zida; iznad ploče dolazi stropna napa.
        </p>
      </div>

      <div className="mt-5 space-y-2">
        {/* ---------------------------------------------------------------- seating */}
        <Disclosure title="Sjedenje" value={seatsValue} icon={<StoolIcon className="h-5 w-5" />} open={open === "seats"} onToggle={() => toggle("seats")}>
          <div className="space-y-5 pt-1">
            {bar ? (
              <p className="text-[12px] leading-relaxed text-mut">
                {table ? "Uz spušteni stol sjedi se na stolicama." : "Uz šank se sjedi na barskim stolicama."} Prepust radne ploče tada nije potreban.
              </p>
            ) : (
              <>
                <div>
                  <p id="studio-seat-side" className="mb-2.5 text-[13px] text-fg">
                    Gdje se sjedi
                  </p>
                  <ChipRadio
                    labelledBy="studio-seat-side"
                    options={c.seatSides.map((x) => ({
                      value: x.value,
                      label: SEAT_NAME[x.value],
                      disabled: !x.available,
                      why: "Uz zid A se ne sjedi.",
                      aria: `${SEAT_NAME[x.value]}${x.available ? "" : ", uz zid A se ne sjedi"}`,
                    }))}
                    value={seatCur}
                    onChange={(sd) => run(setSeating(cfg, { side: sd }), `Sjedenje: ${SEAT_NAME[sd].toLowerCase()}.`)}
                    cols={3}
                  />
                  <p className="mt-2 text-[11.5px] leading-snug text-mut">
                    {c.kind === "poluotok" ? "Straga = strana suprotna frontama; lijevo i desno gledano prema frontama." : "Straga = strana prema prostoriji; krajevi gledano iz prostorije."}
                  </p>
                </div>
                <div>
                  <p id="studio-overhang" className="mb-2.5 text-[13px] text-fg">
                    Prepust ploče za koljena
                  </p>
                  <ChipRadio
                    labelledBy="studio-overhang"
                    options={c.overhang.map((o) => ({ value: o.value, label: o.value === 0 ? "Bez" : `${o.value} cm`, aria: o.value === 0 ? "Bez prepusta, bez sjedenja" : `${o.value} cm` }))}
                    value={overhang}
                    onChange={(v) => run(setSeating(cfg, { overhang: v }), v === 0 ? "Bez prepusta za sjedenje." : `Prepust ${v} cm.`, "isl-overhang")}
                    cols={4}
                  />
                </div>
              </>
            )}
            <Stepper
              label={table ? "Stolice" : "Barske stolice"}
              value={c.stools.value}
              min={0}
              max={Math.max(c.stools.value, c.stools.max)}
              onChange={(v) => run(setSeating(cfg, { stools: v }), `${seatsText(v, table)}.`, "isl-stools")}
              format={(v) => `${v}`}
              hint={c.stools.max > 0 ? `Stane najviše ${c.stools.max}.` : bar ? undefined : "Bez prepusta nema mjesta za sjedenje."}
            />
          </div>
        </Disclosure>

        {/* ---------------------------------------------------------------- bar / lowered table */}
        <Disclosure title="Šank" value={barValue} icon={<BarIcon className="h-5 w-5" />} open={open === "bar"} onToggle={() => toggle("bar")}>
          <div className="space-y-5 pt-1">
            <div>
              <ChipRadio
                label="Šank"
                options={[
                  { value: "none", label: "Bez šanka" },
                  { value: "raised", label: "Šank", sub: `${c.bar.heights[0]}–${c.bar.heights[c.bar.heights.length - 1]} cm`, aria: "Povišeni šank" },
                  { value: "table", label: "Stol", sub: `${c.bar.tableHeight} cm`, aria: `Spušteni stol na ${c.bar.tableHeight} cm` },
                ]}
                value={bar ? bar.kind : "none"}
                onChange={(k) =>
                  k === "none"
                    ? run(setBar(cfg, null), "Bez šanka.")
                    : run(setBar(cfg, { kind: k }), k === "raised" ? "Povišeni šank uz vanjsku stranu." : `Spušteni stol na ${c.bar.tableHeight} cm.`)
                }
                cols={3}
              />
              <p className="mt-2 text-[12px] leading-snug text-mut">
                {table
                  ? `Stol na ${c.bar.tableHeight} cm uz vanjsku stranu ${of}, na dvije noge, sa stolicama.`
                  : "Uz vanjsku dugu stranu: povišena ploča na nadogradnji u boji fronti, s barskim stolicama — skriva i radnu ploču."}
              </p>
            </div>

            {bar && !table && (
              <div>
                <p id="studio-bar-h" className="mb-2.5 text-[13px] text-fg">
                  Visina šanka
                </p>
                <ChipRadio
                  labelledBy="studio-bar-h"
                  options={c.bar.heights.map((h) => ({ value: h, label: `${h} cm` }))}
                  value={barPlan?.height ?? bar.height ?? 110}
                  onChange={(h) => run(setBar(cfg, { height: h }), `Šank ${h} cm.`, "isl-bar-h")}
                  cols={3}
                />
              </div>
            )}

            {bar && (
              <div>
                <p id="studio-bar-d" className="mb-2.5 text-[13px] text-fg">
                  Dubina {table ? "stola" : "šanka"}
                </p>
                <ChipRadio
                  labelledBy="studio-bar-d"
                  options={(table ? c.bar.depths.table : c.bar.depths.raised).map((d) => ({ value: d, label: `${d} cm` }))}
                  value={barPlan?.depth ?? bar.depth ?? (table ? 70 : 35)}
                  onChange={(d) => run(setBar(cfg, { depth: d }), `Dubina ${d} cm.`, "isl-bar-d")}
                  cols={3}
                />
              </div>
            )}

            {bar && (
              <ToggleRow
                title={`Cijelom duljinom ${of}`}
                checked={c.bar.length.value === null}
                onChange={(whole) =>
                  run(
                    setBar(cfg, { length: whole ? undefined : shorterBar(c.bar) }),
                    whole ? `${table ? "Stol" : "Šank"} cijelom duljinom.` : `${table ? "Stol" : "Šank"} je kraći.`,
                  )
                }
              >
                {c.bar.length.value !== null && (
                  <NumberField
                    className="pt-4"
                    label={`Duljina ${table ? "stola" : "šanka"}`}
                    value={barLen ?? c.bar.length.value}
                    min={c.bar.length.min}
                    max={c.bar.length.max}
                    onChange={(v) => run(setBar(cfg, { length: v }), `Duljina ${v} cm.`, "isl-bar-len")}
                  />
                )}
              </ToggleRow>
            )}

            {bar && (
              <div>
                <div className="flex items-start gap-4">
                  <div className="min-w-0 flex-1">
                    <p id="studio-bar-top-l" className="text-[13px] text-fg">
                      Ploča {table ? "stola" : "šanka"}
                    </p>
                    <p className="mt-1 text-[12px] leading-snug text-mut">{bar.top ? (barTop?.name ?? "") : `Kao radna ploča: ${topDef(cfg.top)?.name ?? ""}`}</p>
                  </div>
                  <label className="flex shrink-0 cursor-pointer items-center gap-2.5 text-[12px] text-fg/80">
                    <span id="studio-bar-same">Kao radna ploča</span>
                    <Switch
                      id="studio-bar-same-s"
                      checked={!bar.top}
                      onChange={(same) => run(setBar(cfg, { top: same ? undefined : (barPlan?.top ?? cfg.top) === "hrast" ? "orah" : "hrast" }), same ? "Ploča kao radna ploča." : "Ploča po izboru.")}
                      labelledBy="studio-bar-same"
                    />
                  </label>
                </div>
                {bar.top && (
                  <MaterialLibrary
                    kind="top"
                    className="mt-4"
                    items={catalog.tops}
                    families={catalog.topFamilies}
                    value={bar.top}
                    onChange={(id) => run(setBar(cfg, { top: id }), `Ploča: ${topDef(id)?.name ?? ""}.`, "isl-bar-top")}
                    label={`Ploča ${table ? "stola" : "šanka"}`}
                    idPrefix="studio-bar-tops"
                  />
                )}
              </div>
            )}
          </div>
        </Disclosure>

        {/* ---------------------------------------------------------------- build */}
        <Disclosure title="Izvedba" value={buildValue} icon={<IslandIcon className="h-5 w-5" />} open={open === "build"} onToggle={() => toggle("build")}>
          <div className="space-y-5 pt-1">
            <div>
              <p id="studio-isl-depth" className="mb-2.5 text-[13px] text-fg">
                Dubina {of}
              </p>
              <ChipRadio
                labelledBy="studio-isl-depth"
                options={c.depth.map((d) => ({ value: d.value, label: `${d.value} cm`, sub: d.value === 60 ? "ormarići" : `+ ${d.value - 60} straga` }))}
                value={depth}
                onChange={(d) => run(setIsland(cfg, { depth: d }), `Dubina ${d} cm.`)}
                cols={4}
              />
              <p className="mt-2 text-[12px] leading-snug text-mut">
                Iznad 60 cm s vanjske strane dolazi još jedan red ormarića s otvaranjem na dodir — korisno spremište.
              </p>
            </div>
            <ToggleRow
              title="Ploča do poda"
              description="Radna ploča se na slobodnim krajevima spušta do poda. Isključeno: bočne ploče u boji fronti."
              checked={c.waterfall}
              onChange={(on) => run(setIsland(cfg, { waterfall: on ? undefined : false }), on ? "Ploča se spušta do poda." : "Bočne ploče u boji fronti.")}
            />
          </div>
        </Disclosure>

        {/* ---------------------------------------------------------------- ceiling hood */}
        {c.hood.available && (
          <Disclosure
            title="Napa"
            value={c.hood.on ? `Stropna napa · ${c.hood.above.value} cm iznad ploče` : "Bez nape · ploča s ugrađenim odsisom"}
            icon={<HoodIcon className="h-5 w-5" />}
            open={open === "hood"}
            onToggle={() => toggle("hood")}
          >
            <div className="space-y-5 pt-1">
              <ToggleRow
                title="Stropna napa iznad ploče"
                description="Isključeno: ploča za kuhanje s ugrađenim odsisom (bez nape)."
                checked={c.hood.on}
                onChange={(on) => run(setIslandHood(cfg, { on: on ? null : false }), on ? "Stropna napa iznad ploče." : "Bez nape.")}
              />
              {c.hood.on && (
                <NumberField
                  label="Visina iznad radne ploče"
                  hint={`Do donjeg ruba nape; ${c.hood.fromCeiling.value} cm ispod stropa. Uobičajeno 65 cm (indukcija) do 75 cm (plin).`}
                  value={c.hood.above.value}
                  min={c.hood.above.min}
                  max={c.hood.above.max}
                  onChange={(v) => run(setIslandHood(cfg, { above: v }), `Napa ${v} cm iznad ploče.`, "isl-hood")}
                />
              )}
            </div>
          </Disclosure>
        )}
      </div>
    </div>
  );
}
