"use client";

/**
 * "Boje" → how the fronts open and the glass of vitrines:
 *
 *   Otvaranje fronti  four picture tiles — Ručke / Na dodir / Gola / Luft za prste (optionsModel OPEN_KINDS); under
 *                     "Ručke" the handle type, and the colour of handles / the Gola profile. One element can open its own
 *                     way (element editor → "Otvaranje").
 *   Staklo vitrina    folded away: the glass, frame, LED (and in "Napredno" the glass shelves) of every vitrine — shown
 *                     while the kitchen has a vitrine or its own glass, always in "Napredno"
 *
 * Handles change through `update` like the other materials; the glass is an undo step (lib/studio/edit.ts setGlass).
 */
import { useMemo, useState } from "react";
import { catalog, defaultHandleColor, handleDef } from "@/lib/studio/catalog";
import { glassChoices, setGlass } from "@/lib/studio/edit";
import type { HandleStyle } from "@/lib/studio/types";
import { ChoiceChips, Disclosure, SectionLabel } from "../controls";
import { GlassIcon, HandleGlyph } from "../icons";
import { elementsCount } from "../meta";
import { GlassControls, MiniLabel, TileRadio } from "../OptionPickers";
import { HANDLE_TYPES, OPEN_KINDS, handleTypeName, openKindOf, styleForKind, type OpenKind } from "../optionsModel";
import type { StepProps } from "./types";

export function OpeningSection({ cfg, plan, update }: Pick<StepProps, "cfg" | "plan" | "update">) {
  const kind = openKindOf(cfg.handles);
  const handle = handleDef(cfg.handles) ?? catalog.handles[0];
  const hcId = cfg.finish?.handleColor ?? defaultHandleColor(cfg.handles);
  // elements that open their own way (CabinetSpec.opt.open), counted for the note
  const own = plan.slots.filter((s) => s.opt?.open && s.opt.open !== cfg.handles).length;
  const setHandles = (h: HandleStyle) => update({ handles: h });
  const colourName = (c: { name: string; golaName: string }) => (cfg.handles === "bez" ? c.golaName : c.name);
  const note = OPEN_KINDS.find((o) => o.id === kind)?.note;

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
      {handle.coloured && (
        <>
          <MiniLabel id="studio-hc-label" className="mt-4">
            {cfg.handles === "bez" ? "Boja profila" : "Boja ručki"}
          </MiniLabel>
          <ChoiceChips
            labelledBy="studio-hc-label"
            options={catalog.finishes.handleColors.map((c) => ({ id: c.id, name: colourName(c), swatch: c.swatch }))}
            value={hcId}
            onChange={(id) => update({ finish: { ...(cfg.finish ?? {}), handleColor: id } })}
          />
        </>
      )}
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
