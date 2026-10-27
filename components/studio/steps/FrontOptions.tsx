"use client";

/**
 * "Boje" → how the fronts open and the glass of vitrines:
 *
 *   Otvaranje fronti  four picture tiles — Ručke / Na dodir / Gola / Luft za prste (optionsModel OPEN_KINDS); under
 *                     "Ručke" the handle type, and the colour of handles / the Gola profile (crna, inox, zlatna, bijela,
 *                     alu …), wherever the Gola profile is (the kitchen's way or one zone's) "Gola profil i između ladica"
 *                     (edit.ts setGola), and folded away "Otvaranje po dijelovima" — the wall units, the tall column, the
 *                     island their own way (setZoneHandles; "Napredno", or once one has it). One element can open its own
 *                     way (element editor → "Otvaranje").
 *   Staklo vitrina    folded away: the glass, frame, LED (and in "Napredno" the glass shelves) of every vitrine — shown
 *                     while the kitchen has a vitrine or its own glass, always in "Napredno"
 *
 * Handles change through `update` like the other materials; the glass is an undo step (lib/studio/edit.ts setGlass).
 */
import { useMemo, useState } from "react";
import { catalog, defaultHandleColor, handleDef } from "@/lib/studio/catalog";
import { glassChoices, golaChoices, setGlass, setGola, setZoneHandles, zoneHandleChoices } from "@/lib/studio/edit";
import { DRAWER_TYPES } from "@/lib/studio/fronts";
import { isPeninsula } from "@/lib/studio/plan";
import type { FrontZone, HandleStyle } from "@/lib/studio/types";
import { ChipRadio, ChoiceChips, Disclosure, SectionLabel } from "../controls";
import { GlassIcon, HandleGlyph } from "../icons";
import { FRONT_ZONE_NAME, elementsCount, frontZones } from "../meta";
import { GlassControls, MiniLabel, SwitchLine, TileRadio } from "../OptionPickers";
import { HANDLE_TYPES, OPEN_KINDS, handleTypeName, openKindName, openKindOf, styleForKind, zoneOpenOptions, type OpenKind } from "../optionsModel";
import type { StepProps } from "./types";

export function OpeningSection({ cfg, plan, update, edit, advanced }: Pick<StepProps, "cfg" | "plan" | "update" | "edit" | "advanced">) {
  const kind = openKindOf(cfg.handles);
  const handle = handleDef(cfg.handles) ?? catalog.handles[0];
  const hcId = cfg.finish?.handleColor ?? defaultHandleColor(cfg.handles);
  // elements that open their own way (CabinetSpec.opt.open), counted for the note
  const own = plan.slots.filter((s) => s.opt?.open && s.opt.open !== cfg.handles).length;
  const setHandles = (h: HandleStyle) => update({ handles: h });
  const gola = golaChoices(cfg);
  // the Gola profile somewhere (the kitchen's way, or one zone's): its colour and the channel between drawers
  const golaOnly = gola.shown && cfg.handles === "bez";
  const colourName = (c: { name: string; golaName: string }) => (golaOnly ? c.golaName : c.name);
  const note = OPEN_KINDS.find((o) => o.id === kind)?.note;
  const hasDrawers = plan.slots.some((s) => s.zone !== "upper" && s.zone !== "tall" && DRAWER_TYPES[s.type]);

  return (
    <div className="mt-9">
      <SectionLabel id="studio-open-label">Otvaranje fronti</SectionLabel>
      <TileRadio
        labelledBy="studio-open-label"
        describedBy="studio-open-note"
        className="mt-4"
        options={OPEN_KINDS.map((o) => ({ id: o.id, name: o.name, icon: <HandleGlyph style={o.glyph} className="h-9 w-9" /> }))}
        value={kind}
        onChange={(k: OpenKind) => setHandles(styleForKind(k, cfg.handles))}
      />
      <p id="studio-open-note" className="mt-2.5 text-[12px] leading-relaxed text-mut">
        {note}
        {own > 0 &&
          ` ${own === 1 ? "Jedan element otvara se" : `${elementsCount(own)} ${own % 10 >= 2 && own % 10 <= 4 && (own % 100 < 12 || own % 100 > 14) ? "otvaraju" : "otvara"} se`} na svoj način (klik na element → Više).`}
      </p>
      {kind === "rucke" && (
        <>
          <MiniLabel id="studio-handle-type" className="mt-4">
            Vrsta ručke
          </MiniLabel>
          <ChoiceChips
            labelledBy="studio-handle-type"
            options={HANDLE_TYPES.map((h) => ({ id: h, name: handleTypeName(h), icon: <HandleGlyph style={h} className="h-7 w-7" /> }))}
            value={cfg.handles}
            onChange={(id) => setHandles(id as HandleStyle)}
          />
        </>
      )}
      {(handle.coloured || gola.shown) && (
        <>
          <MiniLabel id="studio-hc-label" className="mt-4">
            {golaOnly ? "Boja profila" : gola.shown && handle.coloured ? "Boja ručki i Gola profila" : gola.shown ? "Boja Gola profila" : "Boja ručki"}
          </MiniLabel>
          <ChoiceChips
            labelledBy="studio-hc-label"
            options={catalog.finishes.handleColors.map((c) => ({ id: c.id, name: colourName(c), swatch: c.swatch }))}
            value={handle.coloured ? hcId : gola.color}
            onChange={(id) => update({ finish: { ...(cfg.finish ?? {}), handleColor: id } })}
          />
        </>
      )}
      {gola.shown && (advanced || hasDrawers || gola.between) && (
        <div className="mt-4">
          <SwitchLine
            label="Gola profil i između ladica"
            description={hasDrawers ? "Svaka ladica dobiva svoj hvat — vodoravni kanal između ladica, ne samo ispod ploče." : "Vrijedi za elemente s ladicama kad ih dodate."}
            checked={gola.between}
            onChange={(on) => edit(setGola(cfg, { between: on }), { say: on ? "Gola profil i između ladica." : "Gola profil samo ispod radne ploče." })}
          />
        </div>
      )}
      <ZoneOpening cfg={cfg} plan={plan} edit={edit} advanced={advanced} />
    </div>
  );
}

/**
 * "Otvaranje po dijelovima" (KitchenConfig.zoneHandles): the wall units, the tall column or the island open their own way
 * — e.g. Gola below, push-to-open above. "Napredno", or while a zone has its own way; an element's own way still wins.
 */
function ZoneOpening({ cfg, plan, edit, advanced }: Pick<StepProps, "cfg" | "plan" | "edit" | "advanced">) {
  const [open, setOpen] = useState(false);
  const zones = frontZones(plan);
  const choices = zoneHandleChoices(cfg).filter((z) => zones.includes(z.zone));
  const anyOwn = choices.some((z) => z.own);
  if (zones.length < 2 || !(advanced || anyOwn)) return null;
  const pen = isPeninsula(cfg.layout);
  const zoneName = (z: FrontZone) => (z === "island" && pen ? "Poluotok" : FRONT_ZONE_NAME[z]);
  const summary = anyOwn
    ? choices
        .filter((z) => z.own)
        .map((z) => `${zoneName(z.zone).toLowerCase()}: ${openKindName(openKindOf(z.value)).toLowerCase()}`)
        .join(" · ")
    : "Svi dijelovi kao kuhinja";
  return (
    <div className="mt-5">
      <Disclosure title="Otvaranje po dijelovima" value={summary} icon={<HandleGlyph style="push" className="h-6 w-6" />} open={open} onToggle={() => setOpen((o) => !o)}>
        <p className="text-[12px] leading-relaxed text-mut">
          Npr. donji elementi s Gola profilom, a gornji i visoki stup na dodir. Element s vlastitim otvaranjem (klik na njega → Više) ostaje takav.
        </p>
        <div className="mt-4 space-y-4">
          {choices.map((z) => {
            const opts = zoneOpenOptions(cfg.handles, z.own ? z.value : null);
            const now = opts.find((o) => (o.style ?? cfg.handles) === z.value)?.kind ?? opts.find((o) => o.kind === openKindOf(z.value))?.kind ?? opts[0].kind;
            const id = `studio-zone-open-${z.zone}`;
            return (
              <div key={z.zone}>
                <MiniLabel id={id}>{zoneName(z.zone)}</MiniLabel>
                <ChipRadio
                  labelledBy={id}
                  cols={opts.length}
                  options={opts.map((o) => ({
                    value: o.kind,
                    label: (
                      <span className="flex flex-col items-center gap-0.5">
                        <HandleGlyph style={o.style ?? cfg.handles} className="h-6 w-6" />
                        <span className="text-[11px]">{o.name}</span>
                      </span>
                    ),
                    aria: `${zoneName(z.zone)}: ${o.name}${o.kitchen ? ", kao cijela kuhinja" : ""}`,
                    sub: o.kitchen ? "kao kuhinja" : undefined,
                  }))}
                  value={now}
                  onChange={(k) => {
                    const o = opts.find((x) => x.kind === k);
                    if (!o) return;
                    edit(setZoneHandles(cfg, z.zone, o.style), {
                      say: `${zoneName(z.zone)}: ${o.kitchen ? `kao kuhinja (${o.name.toLowerCase()})` : o.name.toLowerCase()}.`,
                      coalesce: `zone-open-${z.zone}`,
                    });
                  }}
                />
              </div>
            );
          })}
        </div>
      </Disclosure>
    </div>
  );
}

/** the glass of every vitrine (KitchenConfig.glass), folded away */
export function GlassSection({ cfg, edit, advanced }: Pick<StepProps, "cfg" | "edit" | "advanced">) {
  const [open, setOpen] = useState(false);
  const choices = useMemo(() => glassChoices(cfg), [cfg]);
  if (!choices || !(advanced || choices.elements > 0 || cfg.glass)) return null;
  const v = choices.value;
  const type = choices.types.find((t) => t.current)?.name ?? "";
  const frame = choices.frames.find((f) => f.current);
  const summary = [type, v.frame !== "fronta" && frame ? `okvir ${frame.name.toLowerCase()}` : null, v.led ? "LED" : "bez LED-a"].filter(Boolean).join(" · ");
  return (
    <div className="mt-8">
      <Disclosure title="Staklo vitrina" value={summary} icon={<GlassIcon className="h-5 w-5" />} open={open} onToggle={() => setOpen((o) => !o)}>
        <p className="mb-4 text-[12px] leading-relaxed text-mut">
          {choices.elements > 0
            ? `Vrijedi za ${choices.elements === 1 ? "vitrinu" : `sve vitrine (${choices.elements})`} u kuhinji. Jednoj vitrini staklo mijenjate klikom na nju → Više.`
            : "U kuhinji još nema vitrine — dodajte je znakom + (donja, gornja ili visoka vitrina). Izbor vrijedi kad je dodate."}
        </p>
        <GlassControls
          choices={choices}
          advanced={advanced}
          onChange={(patch, say) => edit(setGlass(cfg, patch), { say, coalesce: `glass-${Object.keys(patch)[0]}` })}
        />
      </Disclosure>
    </div>
  );
}
