"use client";

/**
 * "Ploča i detalji": the worktop library, then the details as collapsed rows (progressive disclosure) —
 * handles with their finish, sink and tap, appliance fronts, plinth and LED (the room around the kitchen is in "Boje").
 * "Jednostavno" leaves the appliance fronts and the plinth out (unless one was chosen).
 */
import { useState, type ReactNode } from "react";
import {
  FINISH_DEFAULTS,
  catalog,
  defaultHandleColor,
  finishDef,
  handleColorDef,
  handleDef,
  moduleDef,
  topDef,
} from "@/lib/studio/catalog";
import type { FinishSpec, HandleStyle } from "@/lib/studio/types";
import { ChoiceChips, Disclosure, MoreOptions, RadioGrid, SectionLabel, Switch } from "../controls";
import { CheckIcon, HandleGlyph, MoonIcon, SunIcon } from "../icons";
import { MaterialLibrary } from "../MaterialLibrary";
import { stepIndex } from "../meta";
import type { StepProps } from "./types";

type Section = "rucke" | "sudoper" | "aparati" | "postolje" | "led";

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

export function TopStep({ cfg, plan, update, goTo, mood, setMood, advanced }: StepProps) {
  const [open, setOpen] = useState<Section | null>(null);
  const toggle = (k: Section) => setOpen((o) => (o === k ? null : k));
  const top = topDef(cfg.top);

  const f: FinishSpec = cfg.finish ?? {};
  const setFinish = (patch: FinishSpec) => update({ finish: { ...f, ...patch } });

  const handle = handleDef(cfg.handles) ?? catalog.handles[0];
  const hcId = f.handleColor ?? defaultHandleColor(cfg.handles);
  const hc = handleColorDef(hcId);
  const colourName = (c: { name: string; golaName: string }) => (cfg.handles === "bez" ? c.golaName : c.name);

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
      <p className="mt-4 text-[12px] leading-relaxed text-mut">Isti materijal ide i na zid između ploče i gornjih elemenata.</p>

      {/* ---------------------------------------------------------------- details */}
      <SectionLabel className="mt-9">Detalji</SectionLabel>
      <div className="mt-4 space-y-2">
        <Disclosure
          title="Ručke"
          value={`${handle.name}${handle.coloured && hc ? ` · ${colourName(hc).toLowerCase()}` : ""}`}
          icon={<HandleGlyph style={cfg.handles} className="h-8 w-8" />}
          open={open === "rucke"}
          onToggle={() => toggle("rucke")}
        >
          <RadioGrid
            label="Vrsta ručki"
            items={catalog.handles}
            value={cfg.handles}
            onChange={(id) => update({ handles: id as HandleStyle })}
            className="space-y-1.5"
            itemClassName={(on) =>
              `group flex w-full items-start gap-3 rounded-xl border px-2.5 py-2.5 text-left transition-[border-color,background-color] duration-300 ease-premium ${
                on ? "border-accent/60 bg-accent/[0.08]" : "border-white/[0.07] hover:border-white/20 hover:bg-white/[0.03]"
              }`
            }
          >
            {(h, on) => (
              <>
                <HandleGlyph style={h.id} className={`h-8 w-8 shrink-0 transition-colors duration-300 ${on ? "text-accent" : "text-fg/60 group-hover:text-fg"}`} />
                <span className="min-w-0 flex-1 pt-0.5">
                  <span className={`block text-[13px] leading-tight ${on ? "text-fg" : "text-fg/80 group-hover:text-fg"}`}>{h.name}</span>
                  {on && <span className="mt-1 block text-[11.5px] leading-snug text-mut">{h.note}</span>}
                </span>
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full transition-all duration-300 ${
                    on ? "bg-accent text-ink" : "border border-white/15 text-transparent"
                  }`}
                >
                  <CheckIcon className="h-3 w-3" />
                </span>
              </>
            )}
          </RadioGrid>
          {handle.coloured && (
            <>
              <Label id="studio-hc-label">{cfg.handles === "bez" ? "Boja profila" : "Boja ručki"}</Label>
              <ChoiceChips
                labelledBy="studio-hc-label"
                options={catalog.finishes.handleColors.map((c) => ({ id: c.id, name: colourName(c), swatch: c.swatch }))}
                value={hcId}
                onChange={(id) => setFinish({ handleColor: id })}
              />
            </>
          )}
        </Disclosure>

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
      </div>
      {!advanced && <MoreOptions what="Fronte pećnice i mikrovalne, boja postolja." className="mt-3" />}
    </div>
  );
}
