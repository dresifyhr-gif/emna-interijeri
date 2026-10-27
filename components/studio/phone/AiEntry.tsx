"use client";

/**
 * The "Opišite kuhinju (AI)" entry of the phone's simple flow — shown only when <Studio> passes an `onAi` handler (the AI
 * helper is enabled for this visitor: ai/useStudioAi.ts). It shows in two places:
 *
 *   AiStartCard  the first card of the start screen ("Kako želite početi?"), above "Korak po korak"
 *   AiBarButton  the 3D view's bottom bar (PhoneBar), on the price row, at the right
 *
 * Both only call `onOpen` (the AI chat, ai/AiChat.tsx); `busy` says the AI is working on a kitchen meanwhile.
 */
import { Arrow } from "@/components/ui/Button";
import { SparkleIcon as Sparkle } from "../icons";

export interface AiEntryProps {
  onOpen: () => void;
  /** the AI is working on a kitchen (the entry says so and stays pressable to reopen it) */
  busy?: boolean;
}

export function AiStartCard({ onOpen, busy }: AiEntryProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-ai-entry="start"
      className="group flex min-h-[76px] w-full items-center gap-4 rounded-[22px] border border-accent/40 bg-accent/[0.08] px-4 py-3.5 text-left transition-colors duration-300 ease-premium active:bg-accent/[0.14]"
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent">
        <Sparkle className="h-6 w-6" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-medium leading-tight text-fg">{busy ? "AI slaže kuhinju…" : "Opišite kuhinju"}</span>
        <span className="mt-1 block text-[12.5px] leading-snug text-mut">Napišite što želite — AI složi prijedlog.</span>
      </span>
      <span className="text-accent">
        <Arrow />
      </span>
    </button>
  );
}

export function AiBarButton({ onOpen, busy }: AiEntryProps) {
  return (
    <button
      type="button"
      onClick={onOpen}
      data-ai-entry="bar"
      aria-label={busy ? "AI slaže kuhinju" : "Opišite kuhinju (AI)"}
      className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-full border border-accent/40 bg-accent/[0.08] px-3.5 text-[12.5px] font-medium text-accent transition-colors duration-300 active:bg-accent/[0.16]"
    >
      <Sparkle className="h-4 w-4" />
      {busy ? "Slažem…" : "Opišite"}
    </button>
  );
}
