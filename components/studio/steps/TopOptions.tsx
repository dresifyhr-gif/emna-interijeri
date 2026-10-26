"use client";

/**
 * "Ploča i detalji" → what goes with the worktop:
 *
 *   ThicknessField   the worktop's thickness (1,2 / 2 / 4 / 6 cm, setWorktop) — the plinth takes the difference, so the
 *                    worktop stays at its height (what it could not keep is said right there)
 *   SplashSection    the wall between worktop and wall units: worktop material (full / half height), coloured glass,
 *                    tiles or nothing (setBacksplash) — picture tiles, then the colours / tiles of glass and tiles
 *   HoodSection      the hood above the hob: hidden in a wall unit, chimney, angled glass, in the hob (setHood) — picture
 *                    tiles; the finish of a visible hood; above an island hob the canopy or a ceiling cassette ("Napredno",
 *                    or once chosen). A hob with a hood of its own says so (element editor → "Napa iznad ploče").
 *   RailsSection     a hanging rail with hooks per wall (setRail) — "Napredno", or while one is on
 *
 * Every change is an undo step (lib/studio/edit.ts); a change that moves wall units says so in a toast with "Poništi".
 */
import { useMemo, useState } from "react";
import { backsplashesOf, catalog } from "@/lib/studio/catalog";
import { backsplashChoices, hoodChoices, railChoices, setBacksplash, setHood, setRail, setWorktop, worktopChoices } from "@/lib/studio/edit";
import { isPeninsula } from "@/lib/studio/plan";
import type { BacksplashKind, HoodFinish, HoodKind, IslandHoodStyle } from "@/lib/studio/types";
import { ChoiceChips, Disclosure, Notes, SectionLabel, Segmented } from "../controls";
import { HoodGlyph, RailIcon, SplashGlyph } from "../icons";
import { MiniLabel, SwitchLine, TileRadio } from "../OptionPickers";
import { stepIndex } from "../meta";
import { HOOD_SHORT, ISLAND_HOOD_SHORT, SPLASH_ORDER, SPLASH_SHORT } from "../optionsModel";
import { RoomSwatches } from "../SurfacePicker";
import type { StepProps } from "./types";

type Props = Pick<StepProps, "cfg" | "plan" | "edit" | "advanced" | "compact">;

/** "1,2 cm" → the worktop's thickness */
export function ThicknessField({ cfg, edit }: Pick<Props, "cfg" | "edit">) {
  const ch = worktopChoices(cfg);
  /** what the last thickness did to the worktop's height, for that thickness */
  const [note, setNote] = useState<{ t: number; text: string } | null>(null);
  const cur = ch.options.find((o) => o.current);
  return (
    <div className="mt-6">
      <MiniLabel id="studio-wt-thick">Debljina ploče</MiniLabel>
      <Segmented
        labelledBy="studio-wt-thick"
        size="sm"
        options={ch.options.map((o) => ({ id: String(o.value), label: o.name, aria: `${o.name}${o.value === 4 ? ", standardno" : ""}` }))}
        value={String(ch.value)}
        onChange={(v) => {
          const r = setWorktop(cfg, { thickness: Number(v) });
          const name = ch.options.find((o) => String(o.value) === v)?.name ?? `${v} cm`;
          if (edit(r, { say: `Debljina radne ploče: ${name}.` })) setNote(r.warning ? { t: Number(v), text: r.warning } : null);
        }}
      />
      <p className="mt-2 text-[12px] leading-snug text-mut">{cur?.note}</p>
      {/* what the thickness did to the worktop's height, while the kitchen still has that thickness */}
      <div aria-live="polite">{note && Math.abs(note.t - ch.value) < 1e-6 && <Notes items={[note.text]} className="mt-2.5" />}</div>
    </div>
  );
}

const SPLASH_NOTE: Record<BacksplashKind, string> = {
  ploca: "Isti materijal kao radna ploča, do gornjih elemenata.",
  pola: "Materijal radne ploče do pola visine, iznad je zid prostorije.",
  staklo: "Lakirano staklo u boji, bez fuga — lako se čisti.",
  plocice: "Pločice od radne ploče do gornjih elemenata.",
  bez: "Zid ostaje kao i ostatak prostorije.",
};

export function SplashSection({ cfg, edit, compact }: Pick<Props, "cfg" | "edit" | "compact">) {
  const ch = backsplashChoices(cfg);
  const finishes = ch.kind === "staklo" || ch.kind === "plocice" ? backsplashesOf(ch.kind) : [];
  const finish = finishes.find((f) => f.id === ch.finish) ?? finishes[0];
  return (
    <div className="mt-9">
      <SectionLabel id="studio-splash-label">Zid iza radne ploče</SectionLabel>
      <TileRadio
        labelledBy="studio-splash-label"
        describedBy="studio-splash-note"
        className="mt-4"
        cols={compact ? 3 : 5}
        options={SPLASH_ORDER.map((k) => ({ id: k, name: SPLASH_SHORT[k], icon: <SplashGlyph kind={k} className="h-9 w-9" /> }))}
        value={ch.kind}
        onChange={(k: BacksplashKind) => edit(setBacksplash(cfg, { kind: k }), { say: `Zid iza radne ploče: ${SPLASH_SHORT[k].toLowerCase()}.` })}
      />
      <p id="studio-splash-note" className="mt-2.5 text-[12px] leading-relaxed text-mut">
        {SPLASH_NOTE[ch.kind]}
      </p>
      {finishes.length > 0 && (
        <div className="mt-4">
          <p className="mb-2.5 text-[12.5px] text-fg/80">
            {ch.kind === "staklo" ? "Boja stakla" : "Pločice"} <span className="ml-1.5 text-fg">{finish?.name}</span>
          </p>
          <RoomSwatches
            label={ch.kind === "staklo" ? "Boja stakla" : "Pločice"}
            items={finishes}
            value={finish?.id ?? ""}
            square={ch.kind === "plocice"}
            onChange={(id) =>
              edit(setBacksplash(cfg, { finish: id }), {
                say: `Zid iza radne ploče: ${finishes.find((f) => f.id === id)?.name ?? ""}.`,
                coalesce: "splash-finish",
              })
            }
          />
        </div>
      )}
    </div>
  );
}

export function HoodSection({ cfg, plan, edit, advanced, goTo }: Props & Pick<StepProps, "goTo">) {
  const ch = useMemo(() => hoodChoices(cfg), [cfg]);
  const hasHob = ch.hobs.length > 0;
  const kindNote = catalog.hoods.kinds.find((k) => k.id === ch.kind)?.note ?? "";
  const widths = [...new Set(ch.hobs.filter((h) => h.width !== null && !h.own && h.kind === ch.kind && (h.kind === "dimnjak" || h.kind === "kosa")).map((h) => h.width))];
  const own = ch.hobs.filter((h) => h.own);
  const word = isPeninsula(cfg.layout) ? "poluotoka" : "otoka";
  // the island's style: "Napredno", or once it is not the canopy; never with a downdraft hob (no hood at all)
  const showIsland = ch.islandShown && ch.kind !== "ploca" && (advanced || ch.island !== "dimnjak");
  const apply = (patch: Parameters<typeof setHood>[1], say: string, coalesce?: string) => {
    const r = setHood(cfg, patch);
    edit(r, { say, notify: Boolean(r.warning), coalesce });
  };
  return (
    <div className="mt-9">
      <SectionLabel id="studio-hood-label">Napa</SectionLabel>
      <TileRadio
        labelledBy="studio-hood-label"
        describedBy="studio-hood-note"
        className="mt-4"
        options={ch.kinds.map((k) => ({ id: k.id, name: HOOD_SHORT[k.id], icon: <HoodGlyph kind={k.id} className="h-9 w-9" />, aria: k.name }))}
        value={ch.kind}
        onChange={(k: HoodKind) => apply({ kind: k }, `Napa: ${catalog.hoods.kinds.find((x) => x.id === k)?.name.toLowerCase() ?? ""}.`)}
      />
      <p id="studio-hood-note" className="mt-2.5 text-[12px] leading-relaxed text-mut">
        {kindNote}
        {widths.length > 0 && ` Ovdje: ${widths.join(" i ")} cm, prema ploči.`}
        {!hasHob && " U kuhinji još nema ploče za kuhanje — izbor vrijedi kad je dodate."}
        {" Sama napa nije uračunata u okvirnu cijenu."}
      </p>
      {own.length > 0 && (
        <p className="mt-1.5 text-[12px] leading-relaxed text-mut">
          {own.length === 1 ? "Jedna ploča ima" : "Neke ploče imaju"} svoju napu ({own.map((h) => HOOD_SHORT[h.kind].toLowerCase()).join(", ")}) — mijenja se
          klikom na ploču → Više.
        </p>
      )}
      {ch.finishShown && (
        <div className="mt-4">
          <MiniLabel id="studio-hood-finish">Boja nape</MiniLabel>
          <ChoiceChips
            labelledBy="studio-hood-finish"
            options={ch.finishes}
            value={ch.finish}
            onChange={(id) => apply({ finish: id as HoodFinish }, `Boja nape: ${ch.finishes.find((f) => f.id === id)?.name.toLowerCase() ?? ""}.`, "hood-finish")}
          />
        </div>
      )}
      {showIsland && (
        <div className="mt-5">
          <MiniLabel id="studio-hood-isl">Napa iznad {word}</MiniLabel>
          <TileRadio
            labelledBy="studio-hood-isl"
            cols={2}
            options={ch.islandStyles.map((s) => ({ id: s.id, name: ISLAND_HOOD_SHORT[s.id], icon: <HoodGlyph kind={s.id === "kaseta" ? "kaseta" : "otok"} className="h-9 w-9" />, aria: s.name }))}
            value={ch.island}
            onChange={(s: IslandHoodStyle) => apply({ island: s }, `Napa iznad ${word}: ${ch.islandStyles.find((x) => x.id === s)?.name.toLowerCase() ?? ""}.`)}
          />
          <p className="mt-2 text-[12px] leading-relaxed text-mut">{ch.islandStyles.find((s) => s.current)?.note}</p>
        </div>
      )}
      {!plan.island?.hood && ch.islandShown && ch.kind !== "ploca" && cfg.islandSpec?.hood === false && (
        <p className="mt-2 text-[12px] leading-relaxed text-mut">
          Iznad {word} nema nape (ploča s ugrađenim odsisom) — uključujete je u koraku{" "}
          <button
            type="button"
            onClick={() => goTo(stepIndex("oblik"))}
            className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
          >
            Oblik
          </button>
          .
        </p>
      )}
    </div>
  );
}

/** a hanging rail with hooks, per wall (shown in "Napredno", or while one is on) */
export function RailsSection({ cfg, edit, advanced, open, onToggle }: Pick<Props, "cfg" | "edit" | "advanced"> & { open: boolean; onToggle: () => void }) {
  const rails = railChoices(cfg);
  const on = rails.filter((r) => r.on);
  if (!rails.length || !(advanced || on.length)) return null;
  return (
    <Disclosure
      title="Reling s kukama"
      value={on.length ? on.map((r) => `zid ${r.wall.toUpperCase()}, ${r.length} cm`).join(" · ") : "Bez relinga"}
      icon={<RailIcon className="h-5 w-5" />}
      open={open}
      onToggle={onToggle}
    >
      <p className="mb-3 text-[12px] leading-relaxed text-mut">Metalna šipka s kukama na zidu iza radne ploče — za kuhače, krpe i posude. Duljinu prilagodimo na izmjeri.</p>
      <div className="space-y-3">
        {rails.map((r) => (
          <SwitchLine
            key={r.wall}
            label={`Zid ${r.wall.toUpperCase()}`}
            description={r.fits ? `${r.length} cm, na najduljem dijelu ploče` : "Ovdje nema dovoljno ploče bez prozora."}
            checked={r.on}
            onChange={(v) => edit(setRail(cfg, r.wall, v), { say: v ? `Reling na zidu ${r.wall.toUpperCase()}.` : `Zid ${r.wall.toUpperCase()} bez relinga.` })}
          />
        ))}
      </div>
    </Disclosure>
  );
}
