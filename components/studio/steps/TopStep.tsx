"use client";

/**
 * "Ploča i detalji": the worktop library and its thickness, the wall behind it (worktop material, half height, coloured
 * glass, tiles, nothing), the hood (picture tiles: hidden in a wall unit, chimney, angled glass, in the hob — TopOptions),
 * then the details as collapsed rows (progressive disclosure) — sink and tap, appliance fronts, plinth, LED and the rail
 * with hooks (the room around the kitchen and how the fronts open are in "Boje"). "Jednostavno" leaves the appliance
 * fronts, the plinth, the rail and the island hood's style out (unless one was chosen).
 */
import { useState, type ReactNode } from "react";
import { FINISH_DEFAULTS, catalog, finishDef, moduleDef, topDef } from "@/lib/studio/catalog";
import type { FinishSpec } from "@/lib/studio/types";
import { ChoiceChips, Disclosure, MoreOptions, SectionLabel, Switch } from "../controls";
import { MoonIcon, SunIcon } from "../icons";
import { MaterialLibrary } from "../MaterialLibrary";
import { stepIndex } from "../meta";
import { HoodSection, RailsSection, SplashSection, ThicknessField } from "./TopOptions";
import type { StepProps } from "./types";

type Section = "sudoper" | "aparati" | "postolje" | "led" | "reling";

const OVENS = new Set(["ploca-pecnica", "pecnica-donja", "pecnica", "pecnica-mikro", "mikrovalna"]);

function Dot({ swatch, off = false }: { swatch?: string; off?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`relative block h-6 w-6 rounded-full ring-1 ring-inset ring-white/15 ${off ? "opacity-35" : ""}`}
      style={{ background: swatch }}
    >
      <span className="absolute inset-0 rounded-full bg-[linear-gradient(135deg,rgba(255,255,255,.2),transparent_50%,rgba(0,0,0,.2))]" />
    </span>
  );
}

function Label({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="mb-2.5 mt-4 text-[12.5px] text-fg/80 first:mt-1">
      {children}
    </p>
  );
}

export function TopStep({ cfg, plan, update, edit, goTo, mood, setMood, advanced, compact }: StepProps) {
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (k: Section) => setOpen((o) => (o === k ? null : k));
  const top = topDef(cfg.top);

  const f: FinishSpec = cfg.finish ?? {};
  const setFinish = (patch: FinishSpec) => update({ finish: { ...f, ...patch } });

  const hasSink = plan.slots.some((s) => moduleDef(s.zone, s.type)?.feature === "sink");
  const hasOven = plan.slots.some((s) => OVENS.has(s.type));
  const sink = finishDef("sinks", f.sink ?? FINISH_DEFAULTS.sink);
  const tap = finishDef("taps", f.tap ?? FINISH_DEFAULTS.tap);
  const appl = finishDef("appliances", f.appliances ?? FINISH_DEFAULTS.appliances);
  const plinth = finishDef("plinths", f.plinth ?? FINISH_DEFAULTS.plinth);
  const led = finishDef("leds", f.led ?? FINISH_DEFAULTS.led);

  const goElements = (
    <button
      type="button"
      onClick={() => goTo(stepIndex("elementi"))}
      className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
    >
      Elementi
    </button>
  );

  return (
    <div>
      {/* ---------------------------------------------------------------- worktop */}
      <SectionLabel id="studio-tops-label">Radna ploča</SectionLabel>
      <p className="mt-3 font-display text-[22px] font-medium leading-8 tracking-tight" aria-hidden="true">
        {top?.name}
      </p>
      <MaterialLibrary
        kind="top"
        className="mt-3"
        items={catalog.tops}
        families={catalog.topFamilies}
        value={cfg.top}
        onChange={(id) => update({ top: id })}
        label="Radna ploča"
        idPrefix="studio-tops"
      />
      <ThicknessField cfg={cfg} edit={edit} />

      {/* ---------------------------------------------------------------- the wall behind it, the hood */}
      <SplashSection cfg={cfg} edit={edit} compact={compact} />
      <HoodSection cfg={cfg} plan={plan} edit={edit} advanced={advanced} compact={compact} goTo={goTo} />

      {/* ---------------------------------------------------------------- details */}
      <SectionLabel className="mt-9">Detalji</SectionLabel>
      <div className="mt-4 space-y-2">
        <Disclosure
          title="Sudoper i slavina"
          value={hasSink ? `${sink?.name ?? ""} · slavina ${tap?.name.toLowerCase() ?? ""}` : "U kuhinji nema sudopera"}
          icon={<Dot swatch={sink?.swatch} off={!hasSink} />}
          open={open === "sudoper"}
          onToggle={() => toggle("sudoper")}
        >
          {!hasSink && (
            <p className="mb-2 text-[12px] leading-relaxed text-mut">Sudoper dodajete u koraku {goElements}. Izbor ispod vrijedi kad ga dodate.</p>
          )}
          <Label id="studio-sink-label">Sudoper</Label>
          <ChoiceChips
            labelledBy="studio-sink-label"
            options={catalog.finishes.sinks}
            value={f.sink ?? FINISH_DEFAULTS.sink}
            onChange={(id) => setFinish({ sink: id })}
          />
          <Label id="studio-tap-label">Slavina</Label>
          <ChoiceChips
            labelledBy="studio-tap-label"
            options={catalog.finishes.taps}
            value={f.tap ?? FINISH_DEFAULTS.tap}
            onChange={(id) => setFinish({ tap: id })}
          />
        </Disclosure>

        {(advanced || f.appliances !== undefined) && (
          <Disclosure
            title="Fronte aparata"
            value={hasOven ? (appl?.name ?? "") : `${appl?.name ?? ""} · u kuhinji nema pećnice`}
            icon={<Dot swatch={appl?.swatch} off={!hasOven} />}
            open={open === "aparati"}
            onToggle={() => toggle("aparati")}
          >
            <p className="mb-1 text-[12px] leading-relaxed text-mut">
              Izgled vrata pećnice i mikrovalne u prikazu. Sami aparati nisu uračunati u okvirnu cijenu.
              {!hasOven && <> Pećnicu dodajete u koraku {goElements}.</>}
            </p>
            <ChoiceChips
              label="Fronte aparata"
              className="mt-3"
              options={catalog.finishes.appliances}
              value={f.appliances ?? FINISH_DEFAULTS.appliances}
              onChange={(id) => setFinish({ appliances: id })}
            />
          </Disclosure>
        )}

        {(advanced || f.plinth !== undefined) && (
          <Disclosure
            title="Postolje"
            value={plinth?.name ?? ""}
            icon={<Dot swatch={plinth?.swatch} />}
            open={open === "postolje"}
            onToggle={() => toggle("postolje")}
          >
            <p className="mb-1 text-[12px] leading-relaxed text-mut">Uvučena traka ispod donjih elemenata (cokl).</p>
            <ChoiceChips
              label="Postolje"
              className="mt-3"
              options={catalog.finishes.plinths}
              value={f.plinth ?? FINISH_DEFAULTS.plinth}
              onChange={(id) => setFinish({ plinth: id })}
            />
          </Disclosure>
        )}

        <Disclosure
          title="LED rasvjeta"
          value={cfg.led ? (led?.name ?? "") : "Bez rasvjete"}
          icon={<Dot swatch={led?.swatch} off={!cfg.led} />}
          open={open === "led"}
          onToggle={() => toggle("led")}
        >
          <div className="flex items-start gap-4">
            <div className="min-w-0 flex-1">
              <label id="studio-led-l" htmlFor="studio-led" className="block cursor-pointer text-[12.5px] text-fg/85">
                Rasvjeta u kuhinji
              </label>
              <p id="studio-led-d" className="mt-1 text-[12px] leading-relaxed text-mut">
                Ispod gornjih elemenata, u postolju i u otvorenim nišama.
              </p>
            </div>
            <Switch id="studio-led" checked={cfg.led} onChange={(v) => update({ led: v })} labelledBy="studio-led-l" describedBy="studio-led-d" />
          </div>
          {cfg.led && (
            <>
              <Label id="studio-ledc-label">Boja svjetla</Label>
              <ChoiceChips
                labelledBy="studio-ledc-label"
                options={catalog.finishes.leds}
                value={f.led ?? FINISH_DEFAULTS.led}
                onChange={(id) => setFinish({ led: id })}
              />
              <button
                type="button"
                onClick={() => setMood(mood === "night" ? "day" : "night")}
                className="mt-4 inline-flex min-h-9 items-center gap-2 text-[12.5px] font-medium text-accent transition-colors duration-300 hover:text-fg"
              >
                {mood === "night" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
                {mood === "night" ? "Natrag na dnevni prikaz" : "Pogledajte u večernjem prikazu"}
              </button>
            </>
          )}
        </Disclosure>

        <RailsSection cfg={cfg} edit={edit} advanced={advanced} open={open === "reling"} onToggle={() => toggle("reling")} />
      </div>
      {!advanced && (
        <MoreOptions
          what={`Fronte pećnice i mikrovalne, boja postolja, reling s kukama${plan.island ? `, napa iznad ${plan.island.kind === "poluotok" ? "poluotoka" : "otoka"}` : ""}.`}
          className="mt-3"
        />
      )}
    </div>
  );
}
