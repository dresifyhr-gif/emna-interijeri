"use client";

/**
 * Back to the phone's step-by-step flow from its 3D view, the kitchen kept: "Korak po korak" at the top of the "Uredite"
 * sheet and "Na početak" in the summary (PhoneSummary). Both open the wizard's first screen (flow.ts WIZARD_AGAIN) — the
 * shape, the measures and the style are one tap each again.
 */
import { Arrow } from "@/components/ui/Button";
import { LayersIcon } from "../icons";

export function StepsAgain({ title, note, onClick, className = "" }: { title: string; note: string; onClick: () => void; className?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group flex min-h-14 w-full items-center gap-3.5 rounded-[20px] border border-white/[0.12] bg-white/[0.03] px-3.5 py-2.5 text-left text-fg transition-colors duration-300 ease-premium active:bg-white/[0.07] ${className}`}
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-accent">
        <LayersIcon className="h-5 w-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold leading-tight">{title}</span>
        <span className="mt-0.5 block text-[12px] leading-snug text-mut">{note}</span>
      </span>
      <Arrow />
    </button>
  );
}
