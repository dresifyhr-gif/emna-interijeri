import type { EditResult } from "@/lib/studio/edit";
import type { KitchenPlan } from "@/lib/studio/plan";
import type { KitchenConfig, Layout, Mood } from "@/lib/studio/types";

export interface StepEditOptions {
  /** what to announce (Croatian) once the edit is applied */
  say?: string;
  /** edits of one continuous control share one undo step (see ApplyOptions.coalesce) */
  coalesce?: string;
}

/** what every configurator step receives from <Studio> */
export interface StepProps {
  cfg: KitchenConfig;
  plan: KitchenPlan;
  /** merge a patch into the config (sanitised) */
  update: (patch: Partial<KitchenConfig>) => void;
  /**
   * apply a lib/studio/edit.ts result as one undo step (Ctrl / ⌘ + Z), without a toast: the step shows the
   * result's notes next to its own controls. False when the edit was refused (its warning is then shown in a toast).
   */
  edit: (r: EditResult, opts?: StepEditOptions) => boolean;
  setLayout: (layout: Layout) => void;
  goTo: (step: number) => void;
  mood: Mood;
  setMood: (m: Mood) => void;
  /** true on the narrow bottom-sheet layout */
  compact: boolean;
  /** the 3D view is running (false when WebGL is not available) */
  engine: boolean;
}
