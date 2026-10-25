import type { KitchenPlan } from "@/lib/studio/plan";
import type { KitchenConfig, Layout, Mood } from "@/lib/studio/types";

/** what every configurator step receives from <Studio> */
export interface StepProps {
  cfg: KitchenConfig;
  plan: KitchenPlan;
  /** merge a patch into the config (sanitised) */
  update: (patch: Partial<KitchenConfig>) => void;
  setLayout: (layout: Layout) => void;
  goTo: (step: number) => void;
  mood: Mood;
  setMood: (m: Mood) => void;
  /** true on the narrow bottom-sheet layout */
  compact: boolean;
  /** the 3D view is running (false when WebGL is not available) */
  engine: boolean;
}
