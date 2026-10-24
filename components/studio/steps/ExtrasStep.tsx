"use client";

import { Notes, NumberField, SectionLabel, ToggleRow } from "../controls";
import { CursorIcon, MoonIcon, SunIcon } from "../icons";
import { islandLimits } from "../limits";
import { EDITS_RESET_NOTE } from "../meta";
import type { StepProps } from "./types";

export function ExtrasStep({ cfg, plan, update, goTo, mood, setMood, editsReset }: StepProps) {
  // at most wall A + 40 cm: longer islands can no longer be centred on the wall run
  const island = islandLimits(cfg);

  return (
    <div>
      <div className="space-y-3">
        <ToggleRow
          title="Visoki stup"
          description="Dva visoka elementa na kraju kuhinje za ugradbeni hladnjak i pećnicu u visini očiju. Sami aparati nisu uračunati u okvirnu cijenu."
          checked={cfg.tall}
          onChange={(v) => update({ tall: v })}
        />
        <ToggleRow
          title="LED rasvjeta"
          description="Topla rasvjeta ispod gornjih elemenata, u postolju i u otvorenim nišama."
          checked={cfg.led}
          onChange={(v) => update({ led: v })}
        >
          {cfg.led && (
            <button
              type="button"
              onClick={() => setMood(mood === "night" ? "day" : "night")}
              className="mt-3.5 inline-flex items-center gap-2 text-[12.5px] font-medium text-accent transition-colors duration-300 hover:text-fg"
            >
              {mood === "night" ? <SunIcon className="h-4 w-4" /> : <MoonIcon className="h-4 w-4" />}
              {mood === "night" ? "Natrag na dnevni prikaz" : "Pogledajte u večernjem prikazu"}
            </button>
          )}
        </ToggleRow>
      </div>

      <SectionLabel className="mt-8">Otok</SectionLabel>
      {cfg.layout === "otok" ? (
        <NumberField
          className="mt-4"
          label="Duljina otoka"
          value={cfg.island}
          min={island[0]}
          max={island[1]}
          onChange={(v) => update({ island: v })}
          hint="S pločom koja se s obje strane spušta do poda i mjestom za sjedenje."
        />
      ) : (
        <p className="mt-4 text-[12.5px] leading-relaxed text-mut">
          Otok dodajete odabirom oblika{" "}
          <button
            type="button"
            onClick={() => goTo(0)}
            className="text-fg underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-accent"
          >
            „S otokom“
          </button>{" "}
          u prvom koraku.
        </p>
      )}

      <div className="mt-8 flex gap-3.5 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
        <CursorIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
        <p className="text-[12.5px] leading-relaxed text-fg/80">
          Svaki element možete promijeniti: kliknite ga u 3D prikazu i odaberite ladice, vrata, klapnu koja se diže, vitrinu ili
          otvorenu nišu. Mehanizam se odmah pokaže.
        </p>
      </div>

      <Notes items={editsReset ? [EDITS_RESET_NOTE, ...plan.warnings] : plan.warnings} />
    </div>
  );
}
